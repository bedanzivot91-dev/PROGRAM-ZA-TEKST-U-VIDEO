'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const childProcess = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(childProcess.execFile);

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const SECURE_DIR = path.join(DATA_DIR, 'secure');
const HISTORY_FILE = path.join(DATA_DIR, 'performance-history.json');
const FALLBACK_KEY_FILE = path.join(SECURE_DIR, '.local-machine-key');
fs.mkdirSync(SECURE_DIR, { recursive: true });

function clean(value) { return String(value ?? '').replace(/\u0000/g, '').trim(); }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}
function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    let read = 0;
    do {
      read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read > 0) hash.update(buffer.subarray(0, read));
    } while (read > 0);
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function powershellDpapi(mode, inputBuffer) {
  const isProtect = mode === 'protect';
  const script = [
    '$ErrorActionPreference="Stop"',
    'Add-Type -AssemblyName System.Security',
    '$raw=[Console]::In.ReadToEnd().Trim()',
    '$bytes=[Convert]::FromBase64String($raw)',
    isProtect
      ? '$out=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)'
      : '$out=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($out))'
  ].join(';');
  const output = childProcess.execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    input: inputBuffer.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return Buffer.from(clean(output), 'base64');
}

function fallbackKey() {
  try {
    const current = fs.readFileSync(FALLBACK_KEY_FILE);
    if (current.length === 32) return current;
  } catch {}
  const key = crypto.randomBytes(32);
  fs.writeFileSync(FALLBACK_KEY_FILE, key, { mode: 0o600 });
  return key;
}
function fallbackProtect(buffer) {
  const key = fallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from('MSSA1'), iv, cipher.getAuthTag(), encrypted]);
}
function fallbackUnprotect(buffer) {
  if (buffer.subarray(0, 5).toString() !== 'MSSA1') throw new Error('Nepoznat lokalni šifrovani format.');
  const key = fallbackKey();
  const iv = buffer.subarray(5, 17);
  const tag = buffer.subarray(17, 33);
  const encrypted = buffer.subarray(33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
function protectBuffer(buffer) {
  if (process.platform === 'win32') return { provider: 'windows-dpapi-current-user', bytes: powershellDpapi('protect', buffer) };
  return { provider: 'local-aes-gcm-test-fallback', bytes: fallbackProtect(buffer) };
}
function unprotectBuffer(provider, bytes) {
  if (provider === 'windows-dpapi-current-user') {
    if (process.platform !== 'win32') throw new Error('DPAPI podatak može da se otključa samo na istom Windows korisničkom nalogu.');
    return powershellDpapi('unprotect', bytes);
  }
  if (provider === 'local-aes-gcm-test-fallback') return fallbackUnprotect(bytes);
  throw new Error(`Nepoznat zaštitni provider: ${provider}`);
}
function writeSecureJson(file, value) {
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const protectedData = protectBuffer(plain);
  writeJsonAtomic(file, {
    format: 'mss-secure-json-v1', provider: protectedData.provider,
    createdAt: new Date().toISOString(), payload: protectedData.bytes.toString('base64')
  });
}
function readSecureJson(file, fallback = null) {
  try {
    const envelope = readJson(file, null);
    if (!envelope || envelope.format !== 'mss-secure-json-v1' || !envelope.payload) return fallback;
    const plain = unprotectBuffer(envelope.provider, Buffer.from(envelope.payload, 'base64'));
    return JSON.parse(plain.toString('utf8'));
  } catch { return fallback; }
}
function secureFile(name) { return path.join(SECURE_DIR, `${name}.secure.json`); }
function bestEffortRemovePlainFile(file) {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return true;
    const size = fs.statSync(file).size;
    // Prepisivanje je samo dodatna mera; na SSD-u se ne može garantovati fizičko brisanje svih ranijih blokova.
    if (size > 0 && size <= 32 * 1024 * 1024) {
      const fd = fs.openSync(file, 'r+');
      try {
        const zeros = Buffer.alloc(Math.min(size, 1024 * 1024));
        let offset = 0;
        while (offset < size) {
          const chunk = Math.min(zeros.length, size - offset);
          fs.writeSync(fd, zeros, 0, chunk, offset);
          offset += chunk;
        }
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    }
    fs.unlinkSync(file);
    return true;
  } catch { return false; }
}
function purgeLegacyPlaintext(plainFile) {
  const folder = path.dirname(plainFile);
  const base = path.basename(plainFile);
  const removed = [];
  const candidates = [plainFile];
  try {
    for (const name of fs.readdirSync(folder)) {
      if (name.startsWith(`${base}.MIGRIRANO-U-DPAPI-`) && name.endsWith('.bak')) candidates.push(path.join(folder, name));
    }
  } catch {}
  for (const file of [...new Set(candidates)]) if (fs.existsSync(file) && bestEffortRemovePlainFile(file)) removed.push(file);
  return removed;
}
function migratePlainJson(plainFile, secureName, fallback) {
  const target = secureFile(secureName);
  if (fs.existsSync(target)) {
    const removed = purgeLegacyPlaintext(plainFile);
    return { migrated: false, secureFile: target, removedPlaintext: removed.length };
  }
  const legacy = readJson(plainFile, null);
  if (!legacy) return { migrated: false, secureFile: target, removedPlaintext: purgeLegacyPlaintext(plainFile).length };
  writeSecureJson(target, legacy);
  // Ne ostavljamo čitljiv .bak sa tokenima. Posle uspešnog DPAPI upisa brišemo stari JSON.
  const removed = purgeLegacyPlaintext(plainFile);
  return { migrated: true, secureFile: target, removedPlaintext: removed.length, fallback };
}
function securityStatus() {
  const files = ['youtube-oauth', 'youtube-channels', 'youtube-data-api'].map(name => {
    const file = secureFile(name);
    const envelope = readJson(file, null);
    return { name, exists: Boolean(envelope), provider: envelope?.provider || '', protected: envelope?.format === 'mss-secure-json-v1' };
  });
  return {
    ok: files.every(item => !item.exists || item.protected),
    platform: process.platform,
    expectedProvider: process.platform === 'win32' ? 'windows-dpapi-current-user' : 'local-aes-gcm-test-fallback',
    scope: process.platform === 'win32' ? 'Windows CurrentUser — samo isti Windows nalog može da otključa podatke' : 'Test fallback van Windows-a',
    files
  };
}

async function psJson(script, timeout = 30_000) {
  // Namerno asinhrono (execFile, ne execFileSync): PowerShell/CIM upiti mogu trajati
  // nekoliko sekundi, a execFileSync bi u tom vremenu blokirao ceo Node event loop
  // i zamrznuo SVE ostale rute na lokalnom serveru (health, heartbeat, sve /api/*).
  const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ${script}`], {
    encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024
  });
  const text = clean(stdout);
  return text ? JSON.parse(text) : null;
}
function normalizeArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function gb(bytes) { return Number((Number(bytes || 0) / 1024 / 1024 / 1024).toFixed(2)); }
async function systemProfile() {
  let gpus = [];
  let disks = [];
  let cpu = { name: os.cpus()?.[0]?.model || '', logicalProcessors: os.cpus()?.length || 0 };
  if (process.platform === 'win32') {
    try {
      const result = await psJson("$g=Get-CimInstance Win32_VideoController|Select-Object Name,AdapterRAM,DriverVersion; $d=Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\"|Select-Object DeviceID,Size,FreeSpace,VolumeName; $c=Get-CimInstance Win32_Processor|Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors; @{gpus=$g;disks=$d;cpu=$c}|ConvertTo-Json -Depth 5 -Compress");
      gpus = normalizeArray(result?.gpus).map(item => ({ name: clean(item.Name), vramBytes: Number(item.AdapterRAM || 0), vramGb: gb(item.AdapterRAM), driverVersion: clean(item.DriverVersion), source: 'Win32_VideoController' }));
      disks = normalizeArray(result?.disks).map(item => ({ drive: clean(item.DeviceID), label: clean(item.VolumeName), sizeGb: gb(item.Size), freeGb: gb(item.FreeSpace) }));
      cpu = { name: clean(result?.cpu?.Name) || cpu.name, cores: Number(result?.cpu?.NumberOfCores || 0), logicalProcessors: Number(result?.cpu?.NumberOfLogicalProcessors || cpu.logicalProcessors) };
      // AdapterRAM ume da bude netačan na nekim drajverima. Kada postoji NVIDIA-SMI, njegova vrednost ima prednost.
      try {
        const nvidia = await psJson("$x=& nvidia-smi.exe --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null; @($x)|ForEach-Object{$p=$_ -split ','; @{Name=$p[0].Trim();MemoryMb=[double]$p[1];Driver=$p[2].Trim()}}|ConvertTo-Json -Compress");
        const rows = normalizeArray(nvidia);
        if (rows.length) gpus = rows.map(item => ({ name: clean(item.Name), vramBytes: Number(item.MemoryMb || 0) * 1024 * 1024, vramGb: Number((Number(item.MemoryMb || 0) / 1024).toFixed(2)), driverVersion: clean(item.Driver), source: 'nvidia-smi' }));
      } catch {}
    } catch {}
  }
  const maxVram = Math.max(0, ...gpus.map(item => item.vramGb));
  const freeDisk = Math.max(0, ...disks.map(item => item.freeGb));
  const ramGb = gb(os.totalmem());
  const weakGpu = maxVram > 0 && maxVram < 6;
  const profileClass = maxVram <= 2.5 || ramGb < 16 ? 'LITE' : maxVram < 8 ? 'STANDARD' : 'GPU';
  const capabilities = {
    chatgptPlusManualBridge: true,
    localResearch: true,
    browserAudioAnalysis: true,
    proxyRender720p: true,
    final1080p: ramGb >= 12,
    final4k: maxVram >= 8 && ramGb >= 24,
    fasterWhisperTinyCpu: ramGb >= 8,
    fasterWhisperBaseCpu: ramGb >= 16,
    realEsrganNcnnTiled: maxVram >= 2,
    rifeNcnnLowResolution: maxVram >= 2,
    sdxlInstantId: maxVram >= 8,
    wan14b: maxVram >= 16,
    comfyUiHeavyModels: maxVram >= 8
  };
  const recommended = {
    renderResolution: capabilities.final1080p ? 1080 : 720,
    proxyResolution: 360,
    renderFps: weakGpu ? 24 : 30,
    whisperModel: maxVram < 4 ? 'tiny.cpu-int8' : 'base',
    upscaleTile: maxVram <= 2.5 ? 128 : 256,
    rifeScale: maxVram <= 2.5 ? 0.5 : 1,
    disable4k: !capabilities.final4k,
    disableWan: !capabilities.wan14b,
    disableSdxlInstantId: !capabilities.sdxlInstantId
  };
  const warnings = [];
  if (maxVram <= 2.5) warnings.push('Grafika ima oko 2 GB VRAM-a: Wan 14B i SDXL/InstantID lokalno nisu praktični. Koristi ChatGPT Plus za slike i lokalni proxy/finalni render.');
  if (freeDisk && freeDisk < 40) warnings.push('Manje od 40 GB slobodnog prostora: veliki modeli i privremeni render fajlovi mogu da popune disk.');
  if (ramGb <= 16) warnings.push('Za lokalni Whisper koristi tiny/base CPU int8 i obradi jednu pesmu odjednom.');
  return {
    ok: true, checkedAt: new Date().toISOString(), profileClass, cpu, ramGb,
    freeRamGb: gb(os.freemem()), gpus, disks, maxVramGb: maxVram, maxFreeDiskGb: freeDisk,
    capabilities, recommended, warnings
  };
}

function readSafetensorsMetadata(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const headerLengthBuffer = Buffer.alloc(8);
    if (fs.readSync(fd, headerLengthBuffer, 0, 8, 0) !== 8) return null;
    const headerLength = Number(headerLengthBuffer.readBigUInt64LE(0));
    if (!Number.isFinite(headerLength) || headerLength <= 2 || headerLength > 100 * 1024 * 1024) return null;
    const header = Buffer.alloc(headerLength);
    if (fs.readSync(fd, header, 0, headerLength, 8) !== headerLength) return null;
    const parsed = JSON.parse(header.toString('utf8'));
    const tensorNames = Object.keys(parsed).filter(key => key !== '__metadata__');
    return { format: 'safetensors', tensorCount: tensorNames.length, metadata: parsed.__metadata__ || {}, headerBytes: headerLength };
  } catch { return null; } finally { fs.closeSync(fd); }
}
function knownModelKind(fileName) {
  const value = fileName.toLowerCase();
  if (value.includes('wan')) return 'WAN';
  if (value.includes('instantid') || value.includes('ip-adapter')) return 'InstantID';
  if (value.includes('sd_xl') || value.includes('sdxl')) return 'SDXL';
  if (value.includes('umt5')) return 'WAN text encoder';
  if (value.includes('clip_vision')) return 'CLIP Vision';
  if (value.includes('vae')) return 'VAE';
  return 'Model';
}
function verifyModelFile(file, options = {}) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return { file: resolved, exists: false, ok: false, error: 'Fajl ne postoji.' };
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return { file: resolved, exists: true, ok: false, error: 'Putanja nije fajl.' };
  const result = {
    file: resolved, name: path.basename(resolved), kind: knownModelKind(path.basename(resolved)), exists: true,
    sizeBytes: stat.size, sizeGb: gb(stat.size), modifiedAt: stat.mtime.toISOString(), ok: stat.size > 1024 * 1024
  };
  if (/\.safetensors$/i.test(resolved)) result.metadata = readSafetensorsMetadata(resolved);
  const expectedSha256 = clean(options.expectedSha256 || '');
  const sidecars = [`${resolved}.sha256`, `${resolved}.sha256.txt`, path.join(path.dirname(resolved), `${path.basename(resolved)}.sha256`)].filter(fs.existsSync);
  if (expectedSha256 || options.fullHash || sidecars.length) {
    result.sha256 = fileSha256(resolved);
    let expected = expectedSha256;
    if (!expected && sidecars.length) expected = clean(fs.readFileSync(sidecars[0], 'utf8')).split(/\s+/)[0];
    if (expected) {
      result.expectedSha256 = expected.toLowerCase();
      result.hashMatches = result.sha256.toLowerCase() === result.expectedSha256;
      result.ok = result.ok && result.hashMatches;
    }
  }
  if (!result.metadata && /\.safetensors$/i.test(resolved)) {
    result.ok = false;
    result.error = 'Safetensors zaglavlje nije čitljivo — fajl je možda nepotpun ili oštećen.';
  }
  return result;
}
function findCandidateModels(roots = []) {
  const allowed = new Set(['.safetensors', '.bin', '.pth', '.pt', '.ckpt']);
  const found = [];
  const queue = roots.filter(Boolean).map(item => ({ dir: path.resolve(item), depth: 0 }));
  while (queue.length && found.length < 250) {
    const { dir, depth } = queue.shift();
    if (!fs.existsSync(dir) || depth > 6) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push({ dir: full, depth: depth + 1 });
      else if (allowed.has(path.extname(entry.name).toLowerCase())) found.push(full);
      if (found.length >= 250) break;
    }
  }
  return found;
}

function loadHistory() {
  const data = readJson(HISTORY_FILE, { version: 1, records: [] });
  if (!Array.isArray(data.records)) data.records = [];
  return data;
}
function addHistory(record) {
  const data = loadHistory();
  const cleanRecord = {
    id: clean(record.id) || crypto.randomUUID(), createdAt: clean(record.createdAt) || new Date().toISOString(),
    projectId: clean(record.projectId), songTitle: clean(record.songTitle), format: clean(record.format), type: clean(record.type || 'video'),
    platform: clean(record.platform || 'YouTube'), durationSeconds: Number(record.durationSeconds || 0),
    views: Number(record.views || 0), likes: Number(record.likes || 0), comments: Number(record.comments || 0),
    averageViewPercentage: Number(record.averageViewPercentage || 0), watchHours: Number(record.watchHours || 0),
    subscribersGained: Number(record.subscribersGained || 0), title: clean(record.title), notes: clean(record.notes),
    hook3Score: Number(record.hook3Score || 0), hook5Score: Number(record.hook5Score || 0), hook10Score: Number(record.hook10Score || 0)
  };
  data.records.unshift(cleanRecord);
  data.records = data.records.slice(0, 2000);
  writeJsonAtomic(HISTORY_FILE, data);
  return cleanRecord;
}
function historySummary() {
  const records = loadHistory().records;
  const totals = records.reduce((acc, item) => {
    acc.views += Number(item.views || 0); acc.likes += Number(item.likes || 0); acc.comments += Number(item.comments || 0);
    acc.watchHours += Number(item.watchHours || 0); acc.subscribersGained += Number(item.subscribersGained || 0); return acc;
  }, { views: 0, likes: 0, comments: 0, watchHours: 0, subscribersGained: 0 });
  const ranked = [...records].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 20);
  return { count: records.length, totals, topByViews: ranked, latest: records.slice(0, 20) };
}

module.exports = {
  DATA_DIR, SECURE_DIR, secureFile, readSecureJson, writeSecureJson, migratePlainJson, securityStatus,
  systemProfile, verifyModelFile, findCandidateModels, fileSha256,
  loadHistory, addHistory, historySummary, writeJsonAtomic, readJson
};
