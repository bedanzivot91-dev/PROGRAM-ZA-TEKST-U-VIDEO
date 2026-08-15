'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const childProcess = require('child_process');

const VERSION = '15.4';
const PORT = Number(process.env.PORT || 4180);
const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(APP_DIR, '..');
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime', 'cloudflared');
const LOG_FILE = path.join(DATA_DIR, 'studio-background.log');
const CLOUDFLARED_LOG = path.join(DATA_DIR, 'cloudflared.log');
const TUNNEL_URL_FILE = path.join(DATA_DIR, 'tunnel-url.txt');
const TUNNEL_PROVIDER_FILE = path.join(DATA_DIR, 'tunnel-provider.txt');
const TUNNEL_STATUS_FILE = path.join(DATA_DIR, 'tunnel-status.json');
const TUNNEL_PID_FILE = path.join(DATA_DIR, 'tunnel.pid');
const COMFY_PID_FILE = path.join(DATA_DIR, 'comfyui.pid');
const COMFY_PATH_FILE = path.join(DATA_DIR, 'comfyui-path.txt');
const COMFY_STATUS_FILE = path.join(DATA_DIR, 'comfyui-status.json');
const BACKGROUND_PID_FILE = path.join(DATA_DIR, 'background-worker.pid');
const CLOUDFLARED_EXE = path.join(RUNTIME_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const PROVIDER = 'cloudflare-quick-tunnel';

for (const dir of [DATA_DIR, RUNTIME_DIR]) fs.mkdirSync(dir, { recursive: true });
try { fs.writeFileSync(BACKGROUND_PID_FILE, String(process.pid), 'utf8'); } catch {}

function timestamp() { return new Date().toISOString(); }
function clean(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim(); }
function log(message) {
  const line = `[${timestamp()}] ${message}`;
  try { fs.appendFileSync(LOG_FILE, `${line}\r\n`, 'utf8'); } catch {}
  console.log(message);
}
function readText(file) { try { return clean(fs.readFileSync(file, 'utf8')); } catch { return ''; } }
function writeText(file, value) { fs.writeFileSync(file, String(value), 'utf8'); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function parsePid(file) { const value = Number(readText(file)); return Number.isInteger(value) && value > 0 ? value : 0; }
function processAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest('hex');
}

let status = {
  version: VERSION, provider: PROVIDER, stage: 'plus-browser-bridge-ready',
  message: 'ChatGPT Plus browser most je glavni režim. Ne koristi API ključ ni javni tunel.',
  publicUrl: '', error: '', details: '', actionUrl: '', startedAt: timestamp(), updatedAt: timestamp()
};
function setStatus(patch = {}) {
  status = { ...status, ...patch, version: VERSION, provider: PROVIDER, updatedAt: timestamp() };
  try { writeJson(TUNNEL_STATUS_FILE, status); } catch {}
  return status;
}
function fail(message, details = '') {
  log(`GREŠKA: ${message}`);
  return setStatus({ stage: 'error', message, error: message, details: clean(details).slice(-12000), publicUrl: '', actionUrl: '' });
}

function requestJson(url, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': `Muzicki-Spot-Studio/${VERSION}`, Accept: 'application/vnd.github+json' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) return reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 500)}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function downloadFile(url, destination, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const temporary = `${destination}.${process.pid}.download`;
    const follow = (target, redirects = 0) => {
      if (redirects > 6) return reject(new Error('Previše preusmerenja pri preuzimanju cloudflared-a.'));
      const req = https.get(target, { headers: { 'User-Agent': `Muzicki-Spot-Studio/${VERSION}`, Accept: 'application/octet-stream' } }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          return follow(new URL(response.headers.location, target).toString(), redirects + 1);
        }
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          response.resume(); return reject(new Error(`Preuzimanje nije uspelo: HTTP ${response.statusCode}`));
        }
        const out = fs.createWriteStream(temporary);
        response.pipe(out);
        out.on('finish', () => { out.close(); fs.renameSync(temporary, destination); resolve(destination); });
        out.on('error', reject);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    };
    try { fs.unlinkSync(temporary); } catch {}
    follow(url);
  });
}
function verifyAuthenticode(file) {
  if (process.platform !== 'win32') return { valid: true, status: 'not-windows' };
  try {
    const script = `$s=Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; @{Status=[string]$s.Status;Subject=[string]$s.SignerCertificate.Subject}|ConvertTo-Json -Compress`;
    const output = childProcess.execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    const parsed = JSON.parse(clean(output));
    const valid = parsed.Status === 'Valid' && /Cloudflare/i.test(parsed.Subject || '');
    return { valid, status: parsed.Status, subject: parsed.Subject };
  } catch (error) { return { valid: false, status: 'error', error: error.message }; }
}
async function ensureCloudflared() {
  if (fs.existsSync(CLOUDFLARED_EXE) && fs.statSync(CLOUDFLARED_EXE).size > 10 * 1024 * 1024) {
    const signature = verifyAuthenticode(CLOUDFLARED_EXE);
    if (signature.valid) return CLOUDFLARED_EXE;
    try { fs.unlinkSync(CLOUDFLARED_EXE); } catch {}
  }
  setStatus({ stage: 'downloading-cloudflared', message: 'Preuzimam zvanični Cloudflare Quick Tunnel alat. Nalog nije potreban.', error: '', details: '' });
  const release = await requestJson('https://api.github.com/repos/cloudflare/cloudflared/releases/latest');
  const wanted = process.platform === 'win32' ? /cloudflared-windows-amd64\.exe$/i : /cloudflared-linux-amd64$/i;
  const asset = (release.assets || []).find(item => wanted.test(item.name || ''));
  if (!asset?.browser_download_url) throw new Error('Zvanični cloudflared asset nije pronađen u poslednjem GitHub izdanju.');
  await downloadFile(asset.browser_download_url, CLOUDFLARED_EXE);
  if (process.platform !== 'win32') fs.chmodSync(CLOUDFLARED_EXE, 0o755);
  const sha256 = fileSha256(CLOUDFLARED_EXE);
  const expected = clean(asset.digest || '').replace(/^sha256:/i, '');
  if (expected && sha256.toLowerCase() !== expected.toLowerCase()) {
    try { fs.unlinkSync(CLOUDFLARED_EXE); } catch {}
    throw new Error('SHA-256 cloudflared fajla se ne poklapa sa GitHub release digest vrednošću.');
  }
  const signature = verifyAuthenticode(CLOUDFLARED_EXE);
  if (process.platform === 'win32' && !signature.valid) {
    try { fs.unlinkSync(CLOUDFLARED_EXE); } catch {}
    throw new Error(`Windows potpis cloudflared.exe nije važeći ili nije Cloudflare (${signature.status || 'nepoznato'}).`);
  }
  writeJson(path.join(RUNTIME_DIR, 'cloudflared-metadata.json'), {
    version: release.tag_name || '', source: asset.browser_download_url, size: fs.statSync(CLOUDFLARED_EXE).size,
    sha256, githubDigest: asset.digest || '', authenticode: signature, downloadedAt: timestamp()
  });
  return CLOUDFLARED_EXE;
}
function spawnDetached(executable, args, options = {}) {
  const outFd = fs.openSync(options.logFile || LOG_FILE, 'a');
  const errFd = fs.openSync(options.logFile || LOG_FILE, 'a');
  const child = childProcess.spawn(executable, args, {
    cwd: options.cwd || APP_DIR, detached: true, windowsHide: true,
    env: { ...process.env, ...(options.env || {}) }, stdio: ['ignore', outFd, errFd]
  });
  child.unref(); fs.closeSync(outFd); fs.closeSync(errFd); return child;
}
async function serverAlive() {
  try { const data = await requestJson(`http://127.0.0.1:${PORT}/health`, 2500); return data?.ok === true; } catch { return false; }
}
async function publicHealth(url) {
  try { const data = await requestJson(`${url.replace(/\/$/, '')}/health`, 12_000); return data?.ok === true; } catch { return false; }
}
function findQuickTunnelUrl(text) {
  const matches = String(text || '').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/ig) || [];
  return matches[matches.length - 1] || '';
}
async function startQuickTunnel() {
  if (!(await serverAlive())) throw new Error('Lokalni Studio server nije dostupan. Ponovo pokreni program.');
  const executable = await ensureCloudflared();
  try { fs.writeFileSync(CLOUDFLARED_LOG, '', 'utf8'); } catch {}
  setStatus({ stage: 'starting-cloudflare-quick-tunnel', message: 'Pokrećem besplatan Cloudflare Quick Tunnel bez naloga...', error: '', publicUrl: '' });
  const child = spawnDetached(executable, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { logFile: CLOUDFLARED_LOG, cwd: RUNTIME_DIR });
  writeText(TUNNEL_PID_FILE, child.pid);
  const deadline = Date.now() + 90_000;
  let publicUrl = '';
  while (Date.now() < deadline) {
    await sleep(1000);
    publicUrl = findQuickTunnelUrl(readText(CLOUDFLARED_LOG));
    if (publicUrl) break;
    if (!processAlive(child.pid)) throw new Error(`cloudflared se ugasio. Detalji: ${readText(CLOUDFLARED_LOG).slice(-3000)}`);
  }
  if (!publicUrl) throw new Error('Cloudflare nije vratio privremenu trycloudflare.com adresu u roku od 90 sekundi.');
  writeText(TUNNEL_URL_FILE, publicUrl);
  writeText(TUNNEL_PROVIDER_FILE, PROVIDER);
  setStatus({ stage: 'testing-public-url', message: `Dodata je privremena adresa. Proveravam: ${publicUrl}`, publicUrl });
  const healthDeadline = Date.now() + 90_000;
  while (Date.now() < healthDeadline) {
    if (await publicHealth(publicUrl)) {
      setStatus({
        stage: 'ready', publicUrl, error: '',
        message: 'Cloudflare Quick Tunnel radi. VAŽNO: URL je privremen; posle restarta moraš ponovo da uvezeš novi OpenAPI URL u GPT Action.',
        details: 'Za svakodnevni rad je jednostavniji ručni ChatGPT Plus paket bez Actions i bez tunela.'
      });
      return publicUrl;
    }
    await sleep(2500);
  }
  throw new Error(`Privremeni URL je dobijen (${publicUrl}), ali javna health provera nije prošla.`);
}

async function startComfyUiIfFound() {
  if (!(await serverAlive())) return;
  const profile = process.env.USERPROFILE || '';
  function normalizeComfyRoot(candidate) {
    const raw = clean(candidate).replace(/^"|"$/g, '');
    if (!raw) return '';
    for (const option of [raw, path.dirname(raw), path.dirname(path.dirname(raw))]) {
      try {
        if (fs.existsSync(path.join(option, 'python_embeded', 'python.exe')) && fs.existsSync(path.join(option, 'ComfyUI', 'main.py'))) return option;
      } catch {}
    }
    return '';
  }
  const candidates = [process.env.MSS_COMFYUI_DIR, readText(COMFY_PATH_FILE), path.join(ROOT_DIR, 'ComfyUI_windows_portable'),
    profile ? path.join(profile, 'Downloads', 'ComfyUI_windows_portable') : '', profile ? path.join(profile, 'Desktop', 'ComfyUI_windows_portable') : '',
    'C:\\ComfyUI_windows_portable', 'D:\\ComfyUI_windows_portable'].filter(Boolean);
  let comfyRoot = '';
  for (const candidate of candidates) { comfyRoot = normalizeComfyRoot(candidate); if (comfyRoot) break; }
  if (!comfyRoot) {
    writeJson(COMFY_STATUS_FILE, { ok: false, stage: 'not-found', message: 'ComfyUI nije pronađen. Na ovom slabijem računaru koristi ChatGPT Plus slike; ComfyUI veliki modeli nisu preporučeni.', path: '', updatedAt: timestamp() });
    return;
  }
  writeText(COMFY_PATH_FILE, comfyRoot);
  try {
    await requestJson('http://127.0.0.1:8188/system_stats', 1800);
    writeJson(COMFY_STATUS_FILE, { ok: true, stage: 'running', message: 'ComfyUI već radi na portu 8188.', path: comfyRoot, updatedAt: timestamp() }); return;
  } catch {}
  const oldPid = parsePid(COMFY_PID_FILE);
  if (oldPid && processAlive(oldPid)) return;
  const python = path.join(comfyRoot, 'python_embeded', 'python.exe');
  const main = path.join(comfyRoot, 'ComfyUI', 'main.py');
  try {
    const child = spawnDetached(python, ['-s', main, '--windows-standalone-build', '--lowvram', '--enable-cors-header', `http://127.0.0.1:${PORT}`, '--port', '8188'], { cwd: comfyRoot, logFile: path.join(DATA_DIR, 'comfyui.log') });
    writeText(COMFY_PID_FILE, child.pid);
    writeJson(COMFY_STATUS_FILE, { ok: true, stage: 'starting', message: 'ComfyUI je pokrenut u --lowvram režimu.', path: comfyRoot, pid: child.pid, updatedAt: timestamp() });
  } catch (error) {
    writeJson(COMFY_STATUS_FILE, { ok: false, stage: 'error', message: `ComfyUI nije pokrenut: ${error.message}`, path: comfyRoot, updatedAt: timestamp() });
  }
}

async function main() {
  try {
    if (!(await serverAlive())) return fail('Lokalni Studio server nije dostupan.');
    const tunnelMode = clean(process.env.MSS_START_TUNNEL).toLowerCase();
    const tasks = [startComfyUiIfFound()];
    if (['1', 'true', 'manual'].includes(tunnelMode)) tasks.push(startQuickTunnel().catch(error => fail(error.message, error.stack)));
    else setStatus({ stage: 'plus-browser-bridge-ready', publicUrl: '', error: '', message: 'Studio radi. Korak 3 koristi lokalni ChatGPT Plus browser most; javni tunel je isključen.' });
    await Promise.allSettled(tasks);
  } catch (error) { fail(error.message || String(error), error.stack || ''); }
  finally { try { if (parsePid(BACKGROUND_PID_FILE) === process.pid) fs.unlinkSync(BACKGROUND_PID_FILE); } catch {} }
}
main();
