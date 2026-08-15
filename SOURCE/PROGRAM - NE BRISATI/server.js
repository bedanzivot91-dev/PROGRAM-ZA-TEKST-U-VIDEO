'use strict';

const NODE_MAJOR = Number(String(process.versions.node || '0').split('.')[0]);
if (!Number.isFinite(NODE_MAJOR) || NODE_MAJOR < 22) {
  console.error('GRESKA: Potreban je Node.js 22 ili noviji. Program ce sada preuzeti zvanicni portable Node.js.');
  process.exit(18);
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const childProcess = require('child_process');
const researchEngine = require('./research-engine');
const advancedTools = require('./advanced-tools');
const githubIntegrations = require('./github-integrations');
const toolRunner = require('./tool-runner');
const audioProjects = require('./audio-projects');
const { MSS_EXTENSION_ORIGIN, MSS_EXTENSION_ID } = require('./extension-identity');
const extensionStabilizer = require('./extension-stabilizer');
const projectExport = require('./project-export');
const lyricsOverlayStorage = require('./lyrics-overlay-storage');
const textOverlayExport = require('./text-overlay-export');
const textStylePresets = require('./text-style-presets');
const fontManager = require('./font-manager');
const textVideoTools = require('./text-video-tools');

function startServer(options = {}) {
const VERSION = '15.6';
const DEFAULT_PRIVATE_GPT_URL = 'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc-muzicki-spot-studio-privatni';
const MAX_PLUS_PROMPT_CHARS = 24000;
const EXPECTED_EXTENSION_VERSION = '15.6.0';
const SERVER_SESSION_ID = crypto.randomUUID();
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = options.dataDir
  ? path.resolve(options.dataDir)
  : (process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(__dirname, 'data'));
const BRIDGE_DIR = path.join(DATA_DIR, 'chatgpt-bridge');
const BRIDGE_IMAGES_DIR = path.join(BRIDGE_DIR, 'images');
const OAUTH_FILE = path.join(DATA_DIR, 'youtube-oauth.json');
const TOKENS_FILE = path.join(DATA_DIR, 'youtube-channels.json');
const YOUTUBE_KEY_FILE = path.join(DATA_DIR, 'youtube-data-api.json');
const SECURE_OAUTH_FILE = advancedTools.secureFile('youtube-oauth');
const SECURE_TOKENS_FILE = advancedTools.secureFile('youtube-channels');
const SECURE_YOUTUBE_KEY_FILE = advancedTools.secureFile('youtube-data-api');
const IDEA_HISTORY_FILE = path.join(DATA_DIR, 'idea-history.json');
const BRIDGE_TOKEN_FILE = path.join(BRIDGE_DIR, 'bridge-token.txt');
const BRIDGE_PROJECT_FILE = path.join(BRIDGE_DIR, 'project.json');
const BRIDGE_UPDATES_FILE = path.join(BRIDGE_DIR, 'updates.json');
const TUNNEL_URL_FILE = path.join(DATA_DIR, 'tunnel-url.txt');
const TUNNEL_PROVIDER_FILE = path.join(DATA_DIR, 'tunnel-provider.txt');
const TUNNEL_STATUS_FILE = path.join(DATA_DIR, 'tunnel-status.json');
const BACKGROUND_WORKER_JS = path.join(__dirname, 'background-worker.js');
const BACKGROUND_LOG_FILE = path.join(DATA_DIR, 'studio-background.log');
const PORT = Number(options.port || process.env.PORT || 4180);
const INSTANCE_ID = String(process.env.MSS_INSTANCE_ID || '').trim();
const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_PID_FILE = path.join(DATA_DIR, 'server.pid');
const SERVER_PORT_FILE = path.join(DATA_DIR, 'server-port.txt');
const SERVER_LOG_FILE = path.join(DATA_DIR, 'server.log');
const TUNNEL_PID_FILE = path.join(DATA_DIR, 'tunnel.pid');
const COMFY_PID_FILE = path.join(DATA_DIR, 'comfyui.pid');
const COMFY_PATH_FILE = path.join(DATA_DIR, 'comfyui-path.txt');
const COMFY_STATUS_FILE = path.join(DATA_DIR, 'comfyui-status.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKGROUND_PID_FILE = path.join(DATA_DIR, 'background-worker.pid');
const BROWSER_HEARTBEAT_MAX_AGE_MS = 90_000;
const INTEGRITY_MANIFEST_FILE = path.join(__dirname, 'INTEGRITET-FAJLOVA-SHA256.txt');
const PLUS_BRIDGE_DIR = path.join(DATA_DIR, 'chatgpt-plus-browser-bridge');
const PLUS_BRIDGE_KEY_FILE = path.join(PLUS_BRIDGE_DIR, 'local-bridge-key.txt');
const PLUS_BRIDGE_JOB_FILE = path.join(PLUS_BRIDGE_DIR, 'current-job.json');
const PLUS_BRIDGE_RESULT_FILE = path.join(PLUS_BRIDGE_DIR, 'current-result.json');
const PLUS_BRIDGE_EXTENSION_STATUS_FILE = path.join(PLUS_BRIDGE_DIR, 'extension-status.json');
const PLUS_BRIDGE_LOCAL_STATUS_FILE = path.join(PLUS_BRIDGE_DIR, 'local-page-status.json');
const PLUS_BRIDGE_CHATGPT_STATUS_FILE = path.join(PLUS_BRIDGE_DIR, 'chatgpt-tab-status.json');
const PLUS_BRIDGE_EXTENSION_DIR = path.join(__dirname, 'browser-extension', 'MSS-ChatGPT-Plus-Most');

const browserSessions = new Map();
let browserHasConnected = false;
let shuttingDown = false;

for (const dir of [DATA_DIR, BRIDGE_DIR, BRIDGE_IMAGES_DIR, BACKUP_DIR, PLUS_BRIDGE_DIR]) fs.mkdirSync(dir, { recursive: true });
// Novi start programa nikada ne nasleđuje aktivan zahtev ili odgovor stare pesme.
for (const staleFile of [PLUS_BRIDGE_JOB_FILE, PLUS_BRIDGE_RESULT_FILE, PLUS_BRIDGE_EXTENSION_STATUS_FILE, PLUS_BRIDGE_LOCAL_STATUS_FILE, PLUS_BRIDGE_CHATGPT_STATUS_FILE]) {
  try { fs.unlinkSync(staleFile); } catch {}
}
// Jednokratna migracija: stari čitljivi YouTube tokeni i ključevi prelaze u DPAPI CurrentUser zaštitu.
advancedTools.migratePlainJson(OAUTH_FILE, 'youtube-oauth', {});
advancedTools.migratePlainJson(TOKENS_FILE, 'youtube-channels', { channels: [] });
advancedTools.migratePlainJson(YOUTUBE_KEY_FILE, 'youtube-data-api', {});

function formatLogValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function appendServerLog(level, values) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${values.map(formatLogValue).join(' ')}\r\n`;
    fs.appendFileSync(SERVER_LOG_FILE, line, 'utf8');
  } catch {}
}
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
console.log = (...values) => { appendServerLog('INFO', values); originalConsoleLog(...values); };
console.error = (...values) => { appendServerLog('ERROR', values); originalConsoleError(...values); };
process.on('uncaughtException', error => {
  console.error('NEOBRADJENA GRESKA:', error);
  process.exit(1);
});
process.on('unhandledRejection', error => {
  console.error('NEOBRADJENO ODBIJANJE:', error);
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.zip': 'application/zip'
};

const pendingStates = new Map();
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
const cleanText = value => String(value ?? '').replace(/\u0000/g, '').trim();

function plusBridgeKey() {
  try {
    const existing = fs.readFileSync(PLUS_BRIDGE_KEY_FILE, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(existing)) return existing;
  } catch {}
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(PLUS_BRIDGE_KEY_FILE, key, { encoding: 'utf8', mode: 0o600 });
  return key;
}
function plusBridgeRead(file, fallback = null) { return readJson(file, fallback); }
function plusBridgeWrite(file, value) { writeJson(file, value); }
function plusBridgeHeaderKey(req, url) {
  return cleanText(req.headers['x-mss-bridge-key'] || url.searchParams.get('key'));
}
function requirePlusBridgeExtension(req, res, url) {
  if (!isLocalRequest(req)) { sendJson(res, 403, { error: 'ChatGPT Plus most radi samo lokalno.' }); return false; }
  if (plusBridgeHeaderKey(req, url) !== plusBridgeKey()) { sendJson(res, 401, { error: 'Pogrešan lokalni ključ ChatGPT Plus mosta.' }); return false; }
  return true;
}
function heartbeatIsFresh(value, maxAgeMs = 120000) {
  if (!value?.at) return false;
  const age = Date.now() - new Date(value.at).getTime();
  return Number.isFinite(age) && age >= 0 && age < maxAgeMs;
}
function plusBridgeStatus() {
  const legacyHeartbeat = plusBridgeRead(PLUS_BRIDGE_EXTENSION_STATUS_FILE, null);
  const localHeartbeat = plusBridgeRead(PLUS_BRIDGE_LOCAL_STATUS_FILE, null);
  const chatgptHeartbeat = plusBridgeRead(PLUS_BRIDGE_CHATGPT_STATUS_FILE, null);
  const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
  const result = plusBridgeRead(PLUS_BRIDGE_RESULT_FILE, null);
  const latestHeartbeat = heartbeatIsFresh(chatgptHeartbeat) ? chatgptHeartbeat : heartbeatIsFresh(localHeartbeat) ? localHeartbeat : heartbeatIsFresh(legacyHeartbeat) ? legacyHeartbeat : null;
  const extensionInstalled = Boolean(latestHeartbeat);
  const extensionVersion = cleanText(latestHeartbeat?.extensionVersion);
  const extensionCompatible = extensionInstalled && extensionVersion === EXPECTED_EXTENSION_VERSION;
  const chatgptTabConnected = heartbeatIsFresh(chatgptHeartbeat);
  const localPageConnected = heartbeatIsFresh(localHeartbeat);
  const activeJob = job && job.serverSessionId === SERVER_SESSION_ID && !['consumed','cancelled'].includes(job.status) ? job : null;
  return {
    ok: true,
    version: VERSION,
    serverSessionId: SERVER_SESSION_ID,
    expectedExtensionVersion: EXPECTED_EXTENSION_VERSION,
    extensionVersion,
    extensionCompatible,
    extensionInstalled,
    localPageConnected,
    localPageLastSeen: localHeartbeat?.at || '',
    chatgptTabConnected,
    chatgptTabLastSeen: chatgptHeartbeat?.at || '',
    chatgptTabPage: chatgptHeartbeat?.page || '',
    extensionLastSeen: latestHeartbeat?.at || '',
    extensionPage: latestHeartbeat?.page || '',
    job: activeJob ? { id: activeJob.id, type:activeJob.type || 'step3', round: activeJob.round, phase:activeJob.phase || '', batchIndex:activeJob.batchIndex ?? null, batchTotal:activeJob.batchTotal ?? null, projectId: activeJob.projectId, projectFingerprint:activeJob.projectFingerprint || '', songTitle:activeJob.songTitle || '', status: activeJob.status, createdAt: activeJob.createdAt, updatedAt: activeJob.updatedAt, gptUrl: activeJob.gptUrl || '' } : null,
    resultReady: Boolean(result?.jobId && activeJob?.id === result.jobId && result.serverSessionId === SERVER_SESSION_ID),
    resultAt: result?.createdAt || '',
    extensionFolderExists: fs.existsSync(PLUS_BRIDGE_EXTENSION_DIR),
    extensionFolder: PLUS_BRIDGE_EXTENSION_DIR,
    extensionStableFolder: resolveStablePlusBridgeExtensionDir(),
    extensionId: MSS_EXTENSION_ID,
    extensionOrigin: MSS_EXTENSION_ORIGIN
  };
}

// Sekcija 5: ekstenzija se NE učitava direktno iz resources/PROGRAM (može biti u Program Files,
// read-only, ili u bilo kojoj privremenoj portable putanji) — kopira se u stabilnu lokaciju pod
// %LOCALAPPDATA% pre otvaranja, tako da Chrome/Edge "Load unpacked" uvek pokazuje na isto mesto.
function resolveStablePlusBridgeExtensionDir() {
  if (!fs.existsSync(PLUS_BRIDGE_EXTENSION_DIR)) return null;
  try {
    const { destDir } = extensionStabilizer.ensureStableExtensionCopy(PLUS_BRIDGE_EXTENSION_DIR, { version: VERSION });
    return destDir;
  } catch {
    return PLUS_BRIDGE_EXTENSION_DIR; // kopiranje nije uspelo — bolje otvoriti izvor nego ništa
  }
}

function openPlusBridgeExtensionFolder() {
  if (!fs.existsSync(PLUS_BRIDGE_EXTENSION_DIR)) throw new Error('Folder dodatka nije pronađen u programu.');
  const stableDir = resolveStablePlusBridgeExtensionDir() || PLUS_BRIDGE_EXTENSION_DIR;
  if (process.platform !== 'win32') return { opened: false, path: stableDir, message: 'Otvori ovaj folder kao unpacked extension u Chrome/Edge browseru.' };
  childProcess.spawn('explorer.exe', [stableDir], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
  let browserOpened = false;
  const candidates = [
    [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'edge://extensions'],
    [path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'edge://extensions'],
    [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), 'chrome://extensions'],
    [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), 'chrome://extensions']
  ];
  for (const [exe, target] of candidates) {
    if (!exe || !fs.existsSync(exe)) continue;
    try { childProcess.spawn(exe, [target], { detached: true, windowsHide: false, stdio: 'ignore' }).unref(); browserOpened = true; break; } catch {}
  }
  return { opened: true, browserOpened, path: stableDir };
}


function safeTimestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function normalizeComfyRoot(candidate) {
  const raw = cleanText(candidate).replace(/^"|"$/g, '');
  if (!raw) return '';
  const options = [raw, path.dirname(raw), path.dirname(path.dirname(raw))];
  for (const option of options) {
    try {
      if (fs.existsSync(path.join(option, 'python_embeded', 'python.exe')) && fs.existsSync(path.join(option, 'ComfyUI', 'main.py'))) return option;
    } catch {}
  }
  return '';
}
function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(name => /^projekat-.*\.json$/i.test(name))
      .map(name => {
        const file = path.join(BACKUP_DIR, name);
        const stat = fs.statSync(file);
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}
const DAILY_BACKUP_DIR = path.join(BACKUP_DIR, 'daily');
const DAILY_BACKUP_RETENTION_DAYS = 30;
function listDailyBackups() {
  try {
    fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
    return fs.readdirSync(DAILY_BACKUP_DIR)
      .filter(name => /^dnevni-\d{4}-\d{2}-\d{2}\.json$/i.test(name))
      .map(name => {
        const file = path.join(DAILY_BACKUP_DIR, name);
        const stat = fs.statSync(file);
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}
// Petominutni "rolling" backup (listBackups/BACKUP_DIR) čuva samo poslednjih 10 kopija — kod duže
// radne sesije to je manje od jednog sata rada. Dnevni arhiv čuva JEDNU kopiju po kalendarskom danu,
// zadržanu 30 dana, nezavisno od rolling backupa — tako korisnik može da se vrati na stanje od pre
// nekoliko dana, ne samo na poslednji sat.
function maybeCreateDailyBackup(projectState) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dailyFile = path.join(DAILY_BACKUP_DIR, `dnevni-${today}.json`);
    if (fs.existsSync(dailyFile)) return;
    fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
    writeJson(dailyFile, { version: VERSION, createdAt: new Date().toISOString(), state: projectState });
    const daily = listDailyBackups();
    for (const old of daily.slice(DAILY_BACKUP_RETENTION_DAYS)) {
      try { fs.unlinkSync(path.join(DAILY_BACKUP_DIR, old.name)); } catch {}
    }
  } catch (error) {
    console.error(`[dnevni backup] ${error.message}`);
  }
}
function createProjectBackup(projectState) {
  if (!projectState || typeof projectState !== 'object' || Array.isArray(projectState)) throw new Error('Nedostaje stanje projekta za backup.');
  const payload = { version: VERSION, createdAt: new Date().toISOString(), state: projectState };
  const fileName = `projekat-${safeTimestamp()}.json`;
  const file = path.join(BACKUP_DIR, fileName);
  writeJson(file, payload);
  writeJson(path.join(BACKUP_DIR, 'poslednji-projekat.json'), payload);
  const backups = listBackups();
  for (const old of backups.slice(10)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old.name)); } catch {}
  }
  maybeCreateDailyBackup(projectState);
  return { fileName, createdAt: payload.createdAt, size: fs.statSync(file).size };
}
function latestProjectBackup() {
  const latest = path.join(BACKUP_DIR, 'poslednji-projekat.json');
  const data = readJson(latest, null);
  return data && data.state && typeof data.state === 'object' ? data : null;
}
function clientAddress(req) {
  const forwarded = cleanText(req.headers['x-forwarded-for']).split(',')[0].trim();
  return forwarded || cleanText(req.headers['cf-connecting-ip']) || String(req.socket.remoteAddress || 'unknown');
}
const publicRateWindows = new Map();
function requirePublicRateLimit(req, res, max = 120, windowMs = 60_000) {
  if (isLocalRequest(req)) return true;
  const now = Date.now();
  const key = clientAddress(req);
  const current = publicRateWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    publicRateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (current.count <= max) return true;
  res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)) });
  res.end(JSON.stringify({ error: 'Previše javnih zahteva. Sačekaj minut i pokušaj ponovo.' }));
  return false;
}
function selectComfyFolderWindows() {
  if (process.platform !== 'win32') throw new Error('Izbor foldera radi na Windows 10/11 računaru.');
  const script = [
    '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)',
    '$shell=New-Object -ComObject Shell.Application',
    "$folder=$shell.BrowseForFolder(0,'Izaberi glavni ComfyUI_windows_portable folder',0,0)",
    'if($folder){$folder.Self.Path}'
  ].join('; ');
  return cleanText(childProcess.execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-Command', script], {
    windowsHide: false, encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe']
  }));
}
function maintenanceDiagnostics() {
  const requiredFiles = ['server.js', 'background-worker.js', 'research-engine.js', 'launch-studio.ps1', 'public/index.html', 'public/app.js'];
  const files = requiredFiles.map(name => ({ name, ok: fs.existsSync(path.join(__dirname, name)) }));
  const comfyPath = normalizeComfyRoot(readTextFile(COMFY_PATH_FILE));
  const backups = listBackups();
  return {
    ok: files.every(item => item.ok), version: VERSION, node: process.version, port: PORT,
    system: { platform: process.platform, arch: process.arch, cpuCores: os.cpus()?.length || 0, totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)), freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)), processMemoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024) },
    files, bridgeTokenValid: /^[a-f0-9]{64}$/i.test(BRIDGE_TOKEN),
    tunnel: tunnelStatus(), publicUrl: tunnelUrl(), provider: tunnelProvider(),
    comfyUi: { configuredPath: comfyPath, status: readJson(COMFY_STATUS_FILE, null) },
    backups: { count: backups.length, latest: backups[0] || null, daily: listDailyBackups().length },
    serverLog: SERVER_LOG_FILE, backgroundLog: BACKGROUND_LOG_FILE
  };
}
function readTextFile(file) { try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim(); } catch { return ''; } }

function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}
function integrityManifestEntries() {
  const text = readTextFile(INTEGRITY_MANIFEST_FILE);
  if (!text) return [];
  return text.split(/\r?\n/).map(line => {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    return match ? { expected: match[1].toLowerCase(), path: match[2].trim() } : null;
  }).filter(Boolean);
}
function verifyProgramIntegrity() {
  const entries = integrityManifestEntries();
  const checked = [];
  const missing = [];
  const mismatched = [];
  for (const entry of entries) {
    const resolved = path.resolve(ROOT_DIR, entry.path);
    const relative = path.relative(ROOT_DIR, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) { missing.push(entry.path); continue; }
    const actual = fileSha256(resolved);
    checked.push({ path: entry.path, expected: entry.expected, actual, ok: actual === entry.expected });
    if (actual !== entry.expected) mismatched.push({ path: entry.path, expected: entry.expected, actual });
  }
  return { ok: entries.length > 0 && !missing.length && !mismatched.length, manifestFound: entries.length > 0, checked: entries.length, valid: checked.filter(item => item.ok).length, missing, mismatched };
}


function ensureBridgeToken() {
  let key = '';
  try { key = fs.readFileSync(BRIDGE_TOKEN_FILE, 'utf8').trim(); } catch {}
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(BRIDGE_TOKEN_FILE, key, 'utf8');
  }
  return key;
}
let BRIDGE_TOKEN = ensureBridgeToken();
function bridgeBasePath() { return `/gpt/${BRIDGE_TOKEN}`; }

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}
function readBody(req, limit = 20_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        const error = new Error('Zahtev je prevelik.'); error.statusCode = 413; reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { const error = new Error('Neispravan JSON.'); error.statusCode = 400; reject(error); }
    });
    req.on('error', reject);
  });
}
function hasProxyHeaders(req) {
  return ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-forwarded-proto', 'forwarded']
    .some(name => Boolean(cleanText(req.headers[name])));
}
function isLocalRequest(req) {
  const ip = String(req.socket.remoteAddress || '');
  const host = cleanText(req.headers.host).toLowerCase();
  const localIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  return localIp && localHost && !hasProxyHeaders(req);
}
function requireLocal(req, res) {
  if (isLocalRequest(req)) return true;
  sendJson(res, 403, { error: 'Ova ruta je dostupna samo lokalnom programu.' });
  return false;
}

// Sekcija 5: stroga CORS allow-lista — tačan stabilni chrome-extension://ID, 127.0.0.1:PORT i
// localhost:PORT. NIKAD ne koristi Host zaglavlje kao Origin (echo-uje TUĐ zahtev nazad kao da
// je naš sopstveni domen) i NIKAD Access-Control-Allow-Origin: * (osetljivi lokalni podaci).
function resolveCorsHeaders(req) {
  const origin = cleanText(req.headers.origin);
  if (!origin) return {};
  const allowedOrigins = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, MSS_EXTENSION_ORIGIN]);
  if (!allowedOrigins.has(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
}
function baseUrl(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwarded || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host || `127.0.0.1:${PORT}`}`;
}
function tunnelUrl() {
  try { return fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim(); } catch { return ''; }
}
function tunnelProvider() {
  try { return fs.readFileSync(TUNNEL_PROVIDER_FILE, 'utf8').trim(); } catch { return ''; }
}
function tunnelStatus() {
  return readJson(TUNNEL_STATUS_FILE, {
    version: VERSION,
    stage: 'idle',
    message: 'Opcioni Cloudflare Quick Tunnel još nije pokrenut. Preporučeni ChatGPT Plus put je izvoz/uvoz fajla bez tunela.',
    error: '',
    provider: tunnelProvider() || 'cloudflare-quick-tunnel',
    publicUrl: tunnelUrl(),
    details: '',
    updatedAt: ''
  });
}
async function probeTunnel(publicUrl) {
  const url = cleanText(publicUrl);
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Javna HTTPS adresa još ne postoji.' };
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
      redirect: 'follow',
      headers: { 'User-Agent': `Muzicki-Spot-Studio/${VERSION}`, 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000)
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const ok = Boolean(response.ok && data?.ok && data?.app === 'Muzički Spot Studio FREE');
    return { ok, status: response.status, data, error: ok ? '' : `Javna adresa je odgovorila HTTP ${response.status}, ali nije vratila Studio health odgovor.` };
  } catch (error) {
    return { ok: false, error: error.message || 'Javna adresa nije dostupna.' };
  }
}
function restartTunnelWorker(clearTunnel = true, startTunnel = true) {
  const tunnelPid = readPid(TUNNEL_PID_FILE);
  if (tunnelPid) killProcessTree(tunnelPid);
  const workerPid = readPid(BACKGROUND_PID_FILE);
  if (workerPid) killProcessTree(workerPid);
  const filesToClear = [TUNNEL_PID_FILE, BACKGROUND_PID_FILE];
  if (clearTunnel) filesToClear.push(TUNNEL_URL_FILE, TUNNEL_PROVIDER_FILE, TUNNEL_STATUS_FILE);
  for (const file of filesToClear) { try { fs.unlinkSync(file); } catch {} }
  const outFd = fs.openSync(BACKGROUND_LOG_FILE, 'a');
  const errFd = fs.openSync(BACKGROUND_LOG_FILE, 'a');
  const child = childProcess.spawn(process.execPath, [BACKGROUND_WORKER_JS], {
    cwd: __dirname, detached: true, windowsHide: true, stdio: ['ignore', outFd, errFd],
    env: { ...process.env, MSS_START_TUNNEL: startTunnel ? '1' : '0' }
  });
  child.unref();
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  fs.writeFileSync(BACKGROUND_PID_FILE, String(child.pid), 'utf8');
  return child.pid;
}
function readPid(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch { return 0; }
}
function killProcessTree(pid) {
  if (!pid || pid === process.pid || process.platform !== 'win32') return;
  try {
    childProcess.execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch {}
}
function clearShutdownSchedule() {}
function activeBrowserSessionCount() {
  const now = Date.now();
  for (const [id, lastSeen] of browserSessions.entries()) {
    if (now - lastSeen > BROWSER_HEARTBEAT_MAX_AGE_MS) browserSessions.delete(id);
  }
  return browserSessions.size;
}
function touchBrowserSession(id) {
  const safeId = cleanText(id).slice(0, 160) || 'default';
  browserHasConnected = true;
  browserSessions.set(safeId, Date.now());
  return safeId;
}
function shutdownApplication(reason = 'Program se zatvara.') {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ZAUSTAVLJANJE] ${reason}`);

  // Javlja Electron main procesu (ako postoji IPC kanal — spawn preko server-controller.js)
  // da je ovo NAMERNO gašenje, ne pad servera — sprečava lažni "server se srušio" dijalog
  // kad korisnik klikne ZATVORI PROGRAM (server.js se gasi sam preko HTTP rute, van Electron-ovog
  // sopstvenog shutdownAndQuit() toka, pa bi inače izgledalo identično kao pravi pad).
  try { if (typeof process.send === 'function') process.send({ type: 'mss-intentional-shutdown', reason }); } catch {}

  for (const file of [BACKGROUND_PID_FILE, TUNNEL_PID_FILE, COMFY_PID_FILE]) {
    const pid = readPid(file);
    if (pid) killProcessTree(pid);
    try { fs.unlinkSync(file); } catch {}
  }
  for (const file of [SERVER_PID_FILE, SERVER_PORT_FILE]) {
    try { fs.unlinkSync(file); } catch {}
  }

  const forceExit = setTimeout(() => process.exit(0), 2500);
  forceExit.unref?.();
  server.close(() => process.exit(0));
}
function bridgeProject() { return readJson(BRIDGE_PROJECT_FILE, null); }
function writeBridgeProject(project) { writeJson(BRIDGE_PROJECT_FILE, project); }
function bridgeUpdates() { return readJson(BRIDGE_UPDATES_FILE, { seq: 0, items: [] }); }
function addBridgeUpdate(type, payload) {
  const data = bridgeUpdates();
  data.seq += 1;
  data.items.push({ seq: data.seq, type, createdAt: new Date().toISOString(), ...payload });
  if (data.items.length > 1000) data.items = data.items.slice(-700);
  writeJson(BRIDGE_UPDATES_FILE, data);
  return data.seq;
}
function sanitizeSegment(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'unknown'; }
function bridgeImagePath(projectId, sceneId, ext) {
  const projectDir = path.join(BRIDGE_IMAGES_DIR, sanitizeSegment(projectId));
  fs.mkdirSync(projectDir, { recursive: true });
  return path.join(projectDir, `${sanitizeSegment(sceneId)}${ext}`);
}
function getExt(mime, name = '') {
  const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/webp': '.webp' };
  if (map[mime]) return map[mime];
  const ext = path.extname(name).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
}
function allowedOpenAiFileUrl(raw) {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && (host === 'files.oaiusercontent.com' || host.endsWith('.oaiusercontent.com') || host.endsWith('.openaiusercontent.com'));
  } catch { return false; }
}
async function downloadActionImage(fileRef) {
  const link = cleanText(fileRef?.download_link);
  const mime = cleanText(fileRef?.mime_type).toLowerCase();
  if (!link || !allowedOpenAiFileUrl(link)) throw new Error('ChatGPT nije poslao dozvoljen privremeni OpenAI link za sliku.');
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)) throw new Error(`Nepodržan tip slike: ${mime || 'nepoznat'}.`);
  const response = await fetch(link, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Preuzimanje ChatGPT slike nije uspelo (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('ChatGPT slika je prazna ili veća od 25 MB.');
  return { bytes, mime, name: cleanText(fileRef?.name) || 'chatgpt-image' };
}

function oauthConfig() {
  const raw = advancedTools.readSecureJson(SECURE_OAUTH_FILE, {});
  const installed = raw.installed || raw.web || raw;
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}
async function tokenFor(channelId) {
  const store = advancedTools.readSecureJson(SECURE_TOKENS_FILE, { channels: [] });
  const item = store.channels.find(x => x.id === channelId);
  if (!item) throw new Error('Kanal nije povezan.');
  if (item.accessToken && Date.now() < Number(item.expiresAt || 0) - 60000) return { item, token: item.accessToken };
  const cfg = oauthConfig();
  if (!cfg.clientId || !cfg.clientSecret || !item.refreshToken) throw new Error('Nedostaje refresh token ili OAuth podešavanje.');
  const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: item.refreshToken, grant_type: 'refresh_token' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Token nije osvežen.');
  item.accessToken = data.access_token;
  item.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  advancedTools.writeSecureJson(SECURE_TOKENS_FILE, store);
  return { item, token: item.accessToken };
}
async function googleGet(url, token = '') {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'YouTube API greška.');
  return data;
}
function durationSeconds(iso = 'PT0S') {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}
function recommendations(videos) {
  if (!videos.length) return ['Nema dovoljno podataka u izabranom periodu.'];
  const sorted = [...videos].sort((a, b) => b.views - a.views);
  const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * .2)));
  const avg = key => top.reduce((sum, video) => sum + Number(video[key] || 0), 0) / top.length;
  const topDur = avg('duration');
  const ret = avg('averageViewPercentage');
  const words = top.flatMap(v => v.title.toUpperCase().split(/\s+/)).filter(w => w.length > 3);
  const frequencies = {};
  words.forEach(word => frequencies[word] = (frequencies[word] || 0) + 1);
  const common = Object.entries(frequencies).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  return [
    `Najuspešnijih 20% videa traje prosečno ${Math.round(topDur)} sekundi. Testiraj spot blizu tog raspona i napravi zasebne Shorts isečke.`,
    `Najuspešniji videi imaju prosečno ${Math.round(ret)}% odgledanog videa. Najjači kadar i jasan razlog za gledanje stavi u prve 1–3 sekunde.`,
    `Reči koje se češće pojavljuju u najboljim naslovima: ${common.join(', ') || 'nema jasnog obrasca'}.`,
    'Poredi rezultate po prosečnom procentu odgledanog videa i retention krivoj, ne samo po ukupnom broju pregleda.'
  ];
}
function publicTrendRecommendations(videos) {
  if (!videos.length) return ['Nema pronađenih javnih videa za zadati upit.'];
  const best = [...videos].sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, 10);
  const avgDuration = best.reduce((s, v) => s + v.duration, 0) / best.length;
  const avgEngagement = best.reduce((s, v) => s + v.engagementRate, 0) / best.length;
  const shorts = best.filter(v => v.duration <= 70).length;
  return [
    `Najbrže rastući uzorak u ovom javnom skupu traje prosečno ${Math.round(avgDuration)} sekundi.`,
    `${shorts} od 10 najbrže rastućih videa kraće je od 70 sekundi; to je signal za Shorts najave, ne dokaz da ceo spot mora biti kratak.`,
    `Prosečan javno merljiv engagement top grupe je ${avgEngagement.toFixed(2)}%.`,
    'Koristi javne rezultate kao inspiraciju za hook, tempo promena i naslov. Tuđi CTR i retention nisu javni i program ih ne izmišlja.'
  ];
}


function ideaFingerprintForValidation(idea = {}) {
  return [idea.title, idea.oneSentence, idea.narrativeArc, idea.visualWorld, idea.centralSymbol, ...(Array.isArray(idea.locations) ? idea.locations : []), idea.cameraGrammar, idea.recurringMotif, idea.ending]
    .map(cleanText).join(' ').toLocaleLowerCase('sr-RS').replace(/[^a-z0-9čćžšđ]+/gi, ' ').trim();
}
function ideaTokenSet(text) {
  const stop = new Set('ideja koncept spot pesma pesme stih tekst narativ motiv prostor prostora lokacija lokacije svet radnja radnje kamera kadar kadrovi početak sredina završetak koristi kroz koji koja koje jedan jedna savremeni savremena fotorealističan različit različita fizički konkretan centralni simbol menja značenje'.split(/\s+/));
  return new Set(String(text || '').split(/\s+/).filter(token => token.length > 4 && !stop.has(token)));
}
function ideaSimilarity(left, right) {
  const a = ideaTokenSet(left); const b = ideaTokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
function readIdeaHistory() {
  const data = readJson(IDEA_HISTORY_FILE, { items: [] });
  return Array.isArray(data.items) ? data.items.slice(-200) : [];
}
function saveIdeaHistory(project, ideas, research) {
  const existing = readIdeaHistory().filter(item => item.projectId !== project.projectId);
  const records = ideas.map(idea => ({
    projectId: project.projectId,
    songTitle: cleanText(project.songTitle),
    lyricsFingerprint: cleanText(project.lyricsFingerprint),
    title: cleanText(idea.title),
    centralSymbol: cleanText(idea.centralSymbol),
    fingerprint: ideaFingerprintForValidation(idea),
    sourceCount: Array.isArray(research?.sources) ? research.sources.length : 0,
    savedAt: new Date().toISOString()
  }));
  fs.writeFileSync(IDEA_HISTORY_FILE, JSON.stringify({ items: [...existing, ...records].slice(-200) }, null, 2), 'utf8');
}
function validateIdeaResearch(research, project) {
  if (!research || typeof research !== 'object') return 'Nedostaje obavezna real-time research analiza.';
  const sources = Array.isArray(research.sources) ? research.sources : [];
  if (sources.length < 3) return 'Research mora sadržati najmanje 3 proverljiva izvora sa interneta ili YouTube-a.';
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index] || {};
    if (cleanText(source.title).length < 5) return `Research izvor ${index + 1} nema naslov.`;
    try {
      const url = new URL(cleanText(source.url));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
    } catch { return `Research izvor ${index + 1} nema ispravan URL.`; }
  }
  if (cleanText(research.summary).length < 80) return 'Research summary mora jasno objasniti šta je pronađeno i kako će se koristiti bez kopiranja.';
  if (!Array.isArray(research.queries) || research.queries.length < 2) return 'Research mora navesti najmanje 2 stvarno korišćena upita.';
  if (!Array.isArray(research.noveltyAudit) || research.noveltyAudit.length < 5) return 'Novelty audit mora imati najmanje 5 provera protiv ponavljanja i kopiranja.';
  const localCount = Number(project?.research?.webResults?.length || 0) + Number(project?.research?.youtubeResults?.length || 0);
  if (localCount > 0 && !sources.some(source => /youtube\.com|youtu\.be/i.test(cleanText(source.url)))) {
    return 'Lokalna analiza je pronašla YouTube rezultate, ali research ne sadrži nijedan YouTube izvor.';
  }
  return '';
}
function validateTenCreativeIdeas(ideas, research, project = {}) {
  if (!Array.isArray(ideas) || ideas.length !== 10) return 'Moraš vratiti tačno 10 ideja.';
  const researchError = validateIdeaResearch(research, project);
  if (researchError) return researchError;
  const titles = new Set();
  const symbols = new Set();
  const fingerprints = [];
  const forbiddenTemplateTitles = new Set([
    'jedan predmet kroz celu pesmu',
    'od prvog praga do poslednjeg izlaska',
    'rutina koja se raspada u malim detaljima',
    'tri faze iste emocije',
    'uzrok i posledica svakog stiha',
    'sećanje kroz stvarne tragove',
    'putanja suprotna od očekivane',
    'tišina između dve radnje',
    'spot građen oko tri hooka',
    'hronološki dan koji menja značenje'
  ]);
  for (let index = 0; index < ideas.length; index += 1) {
    const idea = ideas[index] && typeof ideas[index] === 'object' ? ideas[index] : {};
    const minimumTextLength = {
      title: 5, oneSentence: 30, narrativeArc: 45, visualWorld: 30, centralSymbol: 3,
      hookScene: 25, timeWeather: 5, colorPalette: 5, cameraGrammar: 15,
      costumeLogic: 15, recurringMotif: 15, ending: 20, uniquenessReason: 20
    };
    for (const [field, minimum] of Object.entries(minimumTextLength)) {
      if (cleanText(idea[field]).length < minimum) return `Ideja ${index + 1}: polje ${field} nije dovoljno detaljno.`;
    }
    const locations = Array.isArray(idea.locations) ? idea.locations.map(cleanText).filter(Boolean) : [];
    if (locations.length < 5) return `Ideja ${index + 1}: potrebno je najmanje 5 lokacija ili jasno odvojenih prostora.`;
    const reasons = Array.isArray(idea.locationJustification) ? idea.locationJustification.map(cleanText).filter(Boolean) : [];
    if (reasons.length < locations.length) return `Ideja ${index + 1}: svaka lokacija mora imati posebno objašnjenje veze sa konkretnim stihom ili narativnim lukom.`;
    if (reasons.some(reason => reason.length < 35 || !/(stih|tekst|refren|strofa|motiv|narativ|pesm)/i.test(reason))) return `Ideja ${index + 1}: objašnjenja lokacija moraju navesti stih, deo teksta ili narativni motiv.`;
    const normalizedTitle = cleanText(idea.title).toLocaleLowerCase('sr-RS');
    const normalizedSymbol = cleanText(idea.centralSymbol).toLocaleLowerCase('sr-RS');
    if (forbiddenTemplateTitles.has(normalizedTitle)) return `Ideja ${index + 1}: naslov „${idea.title}“ je stari rezervni šablon i ne sme ponovo da se koristi.`;
    if (titles.has(normalizedTitle)) return `Ideja ${index + 1}: naslov se ponavlja.`;
    if (symbols.has(normalizedSymbol)) return `Ideja ${index + 1}: centralni simbol se ponavlja; svih 10 ideja moraju biti različite.`;
    const fingerprint = ideaFingerprintForValidation(idea);
    for (let prior = 0; prior < fingerprints.length; prior += 1) {
      const similarity = ideaSimilarity(fingerprint, fingerprints[prior]);
      if (similarity >= 0.80) return `Ideje ${prior + 1} i ${index + 1} su previše slične (${Math.round(similarity * 100)}%). Promeni radnju, svet, simbol, lokacije, kameru i završetak.`;
    }
    titles.add(normalizedTitle); symbols.add(normalizedSymbol); fingerprints.push(fingerprint);
  }
  const history = readIdeaHistory().filter(item => item.projectId !== project.projectId && item.lyricsFingerprint !== project.lyricsFingerprint);
  for (let index = 0; index < fingerprints.length; index += 1) {
    const duplicate = history.map(item => ({ item, similarity: ideaSimilarity(fingerprints[index], item.fingerprint) })).sort((a, b) => b.similarity - a.similarity)[0];
    if (duplicate && duplicate.similarity >= 0.82) return `Ideja ${index + 1} je previše slična ranijoj ideji „${duplicate.item.title}“ iz pesme „${duplicate.item.songTitle || 'raniji projekat'}“. Napravi potpuno novi koncept.`;
  }
  return '';
}

function customGptInstructions(publicUrl) {
  return `TI SI PRIVATNI KREATIVNI DIREKTOR ZA MUZIČKI SPOT STUDIO 15.6.

POTREBNA MOGUĆNOST:
- Web search.

NIJE POTREBNO:
- Actions;
- OpenAI API ključ;
- Tailscale, ngrok ili Cloudflare;
- ručno povezivanje sa lokalnim serverom.

PROGRAM TI ŠALJE KRATAK, SAMODOVOLJAN ZAHTEV KROZ LOKALNI BROWSER DODATAK — PRIRODAN TEKST, NE JSON.

OPŠTA PRAVILA:
1. Pročitaj ceo zahtev iz poruke. Ne traži dodatne lokalne fajlove niti Actions.
2. Obavezno uradi aktuelan Web search pre kreativnog odgovora.
3. Koristi samo izvore o muzici, muzičkim spotovima, filmu, kinematografiji, kameri, montaži i vizuelnom storytellingu. Ignoriši igrice, konkurse, forume, reakcije, dečje pesme i potpuno nepovezane rezultate.
4. Ne kopiraj tuđu radnju, kadar, likove, kostime ili prepoznatljiv identitet. Iz izvora uzmi samo apstraktne principe.
5. Ne pretpostavljaj mračan stan, kišu, prozor, telefon ili praznu stolicu samo zato što je pesma tužna.
6. Svaka lokacija mora imati jasan razlog u stihu ili narativnom luku.
7. Odgovaraj OBIČNIM, jasno označenim tekstom sa naslovima i oznakama polja tačno onako kako zahtev traži (npr. "MSS ODGOVOR — KRUG 1", "Naziv:", "Vizuelna porodica:"). Nikad ne vraćaj JSON, markdown kod-blok, uvod ili objašnjenje van traženih delova.

KRUG 1:
- Vrati tačno 10 radikalno različitih ideja.
- Najmanje 8 različitih vizuelnih porodica.
- Najviše jedna ideja vođena mračnim stanom.
- Najviše dve ideje vođene telefonom/porukom.
- Najmanje 3 svetle/dnevne ideje.
- Najmanje 4 javne, spoljašnje, putujuće ili događajne ideje.
- Ne pravi storyboard.

KRUG 2:
- Ne pravi novih 10 ideja.
- Koristi samo izabranu ideju koju program pošalje.
- Napravi kompletan koncept, scene, YouTube paket i kontrolu kvaliteta kada su traženi.
- Zaključani identitet glavne devojke iz zahteva prenesi doslovno, bez skraćivanja i bez prepričavanja, na početak svakog image i video prompta. Ne menjaj godine, kosu, oči, beauty mark ni tetovažu. Crvena haljina NIJE obavezna — garderoba mora biti moderna i prilagođena sceni, vremenu i lokaciji.
- Ne ponavljaj uzastopno radnju, kadar, objektiv, kompoziciju, svetlo ili kameru.

PROMPT → SPOT:
- Korisnikov prompt je glavni brief.
- Obavezno vrati istraživanje sa aktuelnim YouTube music video linkovima, koncept, plan priče, scene, YouTube paket i kontrolu kvaliteta.
- Svaka scena mora imati detaljan image i video prompt kada zahtev to traži.
- Iz referenci koristi samo apstraktne tehnike, nikada ne kopiraj konkretan spot.

TEST MOSTA:
Ako zahtev traži test veze, odgovori TAČNO jednom linijom, bez ičega pre ili posle:
MOST RADI — MSS 15.6.0`;
}

function openApiSchema(req) {
  const serverUrl = `${tunnelUrl() || baseUrl(req)}${bridgeBasePath()}`;
  const ideasSchema = {
    type: 'array', minItems: 10, maxItems: 10,
    items: {
      type: 'object',
      required: ['id','title','oneSentence','narrativeArc','visualWorld','centralSymbol','hookScene','locations','locationJustification','timeWeather','colorPalette','cameraGrammar','costumeLogic','recurringMotif','ending','uniquenessReason','forbiddenRepeats'],
      properties: {
        id: { type: 'string' }, title: { type: 'string' }, oneSentence: { type: 'string' },
        narrativeArc: { type: 'string' }, visualWorld: { type: 'string' }, centralSymbol: { type: 'string' },
        hookScene: { type: 'string' }, locations: { type: 'array', items: { type: 'string' } },
        locationJustification: { type: 'array', items: { type: 'string' } }, timeWeather: { type: 'string' },
        colorPalette: { type: 'string' }, cameraGrammar: { type: 'string' }, costumeLogic: { type: 'string' },
        recurringMotif: { type: 'string' }, ending: { type: 'string' }, uniquenessReason: { type: 'string' },
        forbiddenRepeats: { type: 'array', items: { type: 'string' } }
      }
    }
  };
  const researchSchema = {
    type: 'object',
    required: ['searchedAt', 'queries', 'sources', 'summary', 'visualTrends', 'avoidPatterns', 'noveltyAudit'],
    properties: {
      searchedAt: { type: 'string', description: 'ISO datum i vreme stvarnog istraživanja.' },
      queries: { type: 'array', minItems: 2, items: { type: 'string' } },
      sources: {
        type: 'array', minItems: 3, maxItems: 20,
        items: { type: 'object', required: ['title', 'url', 'finding'], properties: {
          title: { type: 'string' }, url: { type: 'string' }, finding: { type: 'string' }, sourceType: { type: 'string' }
        } }
      },
      summary: { type: 'string' },
      visualTrends: { type: 'array', minItems: 3, items: { type: 'string' } },
      avoidPatterns: { type: 'array', minItems: 3, items: { type: 'string' } },
      noveltyAudit: { type: 'array', minItems: 5, items: { type: 'string' } }
    }
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Muzički Spot Studio ChatGPT Plus Bridge', version: VERSION,
      description: 'Privatni most koji šalje tekst pesme i scene u Custom GPT i vraća ChatGPT-generisane slike u lokalni program.'
    },
    servers: [{ url: serverUrl }],
    paths: {
      '/project': {
        get: {
          operationId: 'getStudioProject',
          summary: 'Preuzmi aktivni projekat, tekst pesme, ideje, izabranu ideju i storyboard.',
          description: 'Pozovi prvo. Koristi pun tekst pesme za ideje i lokacije. Ne izmišljaj lokacije koje nemaju narativnu vezu sa stihovima.',
          responses: { '200': { description: 'Aktivni projekat.' } }
        }
      },
      '/ideas': {
        post: {
          operationId: 'saveTenCreativeIdeas',
          'x-openai-isConsequential': false,
          summary: 'Vrati programu tačno 10 detaljnih ideja za spot.',
          description: 'Pre ideja obavezno uradi aktuelno Web search istraživanje i pošalji research dokaz sa izvorima. Ideje moraju biti direktno zasnovane na tekstu pesme, međusobno različite i bez kopiranja pronađenih spotova.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['projectId', 'research', 'ideas'],
              properties: { projectId: { type: 'string' }, research: researchSchema, ideas: ideasSchema }
            } } }
          },
          responses: { '200': { description: 'Ideje su sačuvane u programu.' } }
        }
      },
      '/next-image-task': {
        get: {
          operationId: 'getNextImageTask', summary: 'Preuzmi sledeću scenu kojoj nedostaje slika.',
          description: 'Odgovor sadrži kompletan image prompt, zaključani identitet, tačan format, dimenzije i kvalitet. Generiši sliku bez skraćivanja.',
          responses: { '200': { description: 'Sledeći zadatak ili complete=true.' } }
        }
      },
      '/upload-scene-image': {
        post: {
          operationId: 'uploadSceneImage',
          'x-openai-isConsequential': false,
          summary: 'Vrati upravo generisanu ChatGPT sliku u tačnu scenu programa.',
          description: 'Odmah posle svake generisane slike pozovi ovu akciju. U openaiFileIdRefs priloži tačno jednu PNG, WEBP ili JPG sliku koju si upravo generisao. Ne traži ručni download.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['projectId', 'sceneId', 'openaiFileIdRefs'],
              properties: {
                projectId: { type: 'string' }, sceneId: { type: 'string' },
                openaiFileIdRefs: {
                  type: 'array', minItems: 1, maxItems: 1, items: { type: 'string' },
                  description: 'Tačno jedna slika generisana u ovom razgovoru. Runtime prosleđuje objekte sa name, id, mime_type i privremenim download_link poljem.'
                }
              }
            } } }
          },
          responses: { '200': { description: 'Slika je preuzeta i vezana za scenu.' } }
        }
      },
      '/status': {
        get: {
          operationId: 'getImageGenerationStatus', summary: 'Proveri napredak generisanja svih scena.',
          responses: { '200': { description: 'Broj gotovih i preostalih slika.' } }
        }
      },
      '/report-failure': {
        post: {
          operationId: 'reportSceneFailure', 'x-openai-isConsequential': false, summary: 'Zabeleži scenu čija slika nije uspela posle ponovnog pokušaja.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['projectId', 'sceneId', 'reason'],
              properties: { projectId: { type: 'string' }, sceneId: { type: 'string' }, reason: { type: 'string' } }
            } } }
          },
          responses: { '200': { description: 'Greška je zabeležena i red može da nastavi.' } }
        }
      }
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);
    let pathname = decodeURIComponent(url.pathname);

    // Dodaje CORS zaglavlja na SVE relevantne odgovore (ne samo OPTIONS preflight, pravilo
    // sekcije 5) tako što umota res.writeHead JEDNOM po zahtevu — svaki sendJson/sendText poziv
    // dalje u ruti automatski nasleđuje ispravna zaglavlja bez izmene svake pojedinačne rute.
    const corsHeaders = resolveCorsHeaders(req);
    if (Object.keys(corsHeaders).length) {
      const originalWriteHead = res.writeHead.bind(res);
      res.writeHead = (status, headers) => originalWriteHead(status, { ...corsHeaders, ...headers });
    }

    if (req.method === 'OPTIONS') {
      if (!isLocalRequest(req) && !corsHeaders['Access-Control-Allow-Origin']) return sendJson(res, 403, { error: 'CORS zahtev nije dozvoljen.' });
      res.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type, X-MSS-Bridge-Key, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Max-Age': '600'
      });
      return res.end();
    }
    if (pathname === '/health') return sendJson(res, 200, { ok: true, app: 'Muzički Spot Studio FREE', version: VERSION, bridge: Boolean(bridgeProject()), pid: process.pid, port: PORT, instanceId: INSTANCE_ID });
    if (pathname === '/api/app/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, browserHasConnected, activeBrowsers: activeBrowserSessionCount(), shuttingDown });
    }

    // Lokalni browser šalje heartbeat samo za status. Zatvaranje taba NE gasi server,
    // jer privatni GPT mora da nastavi da koristi javnu vezu dok korisnik radi u ChatGPT-u.
    if (pathname === '/api/app/heartbeat' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const id = touchBrowserSession(url.searchParams.get('id'));
      return sendJson(res, 200, { ok: true, id, activeBrowsers: activeBrowserSessionCount() });
    }
    if (pathname === '/api/app/close' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const id = cleanText(url.searchParams.get('id')).slice(0, 160) || 'default';
      browserSessions.delete(id);
      return sendJson(res, 200, { ok: true, activeBrowsers: activeBrowserSessionCount(), shutdownScheduled: false });
    }
    if (pathname === '/api/app/shutdown' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      sendJson(res, 200, { ok: true, message: 'Program se zatvara.' });
      setTimeout(() => shutdownApplication('Korisnik je kliknuo „Zatvori program“.'), 150).unref?.();
      return;
    }


    // ChatGPT Plus browser most: lokalni program ↔ korisnikov prijavljeni ChatGPT tab.
    // Ne koristi OpenAI API i ne otvara javni tunel. Ekstenzija zahteva eksplicitni klik korisnika u ChatGPT tabu.
    if (pathname === '/api/plus-bridge/config' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok:true, version:VERSION, key:plusBridgeKey(), baseUrl:`http://${req.headers.host || `127.0.0.1:${PORT}`}`, status:plusBridgeStatus() });
    }
    // Sekcija 5: "DIJAGNOSTIKA AI MOSTA" — serverski deo TEST 1-4 (health/CORS/config/heartbeat).
    // TEST 5-7 zahtevaju stvarnu ChatGPT/DOM interakciju i proveravaju se u samoj ekstenziji.
    if (pathname === '/api/plus-bridge/diagnostics' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const extensionCorsHeaders = resolveCorsHeaders({ headers: { origin: MSS_EXTENSION_ORIGIN } });
      const tests = [
        { id: 1, name: 'GET /api/health', ok: true, detail: `verzija ${VERSION}, port ${PORT}` },
        { id: 2, name: 'CORS preflight (allow-lista)', ok: Boolean(extensionCorsHeaders['Access-Control-Allow-Origin']), detail: `chrome-extension://${MSS_EXTENSION_ID} ${extensionCorsHeaders['Access-Control-Allow-Origin'] ? 'je na allow-listi' : 'NIJE na allow-listi'}` },
        { id: 3, name: 'bridge config', ok: /^[a-f0-9]{64}$/i.test(BRIDGE_TOKEN) && Boolean(plusBridgeKey()), detail: plusBridgeKey() ? 'bridge ključ je postavljen' : 'bridge ključ nedostaje' },
        { id: 4, name: 'heartbeat mehanizam', ok: true, detail: `poslednji heartbeat: ${plusBridgeStatus().extensionLastSeen || 'još nema'}` }
      ];
      return sendJson(res, 200, {
        ok: tests.every(t => t.ok),
        tests,
        extensionId: MSS_EXTENSION_ID,
        extensionOrigin: MSS_EXTENSION_ORIGIN,
        extensionStableFolder: resolveStablePlusBridgeExtensionDir(),
        port: PORT,
        logsLocation: SERVER_LOG_FILE
      });
    }
    if (pathname === '/api/plus-bridge/heartbeat' && req.method === 'POST') {
      if (!requirePlusBridgeExtension(req, res, url)) return;
      const body = await readBody(req, 100_000);
      const page = cleanText(body.page).slice(0,500);
      const source = cleanText(body.source).toLowerCase() || (/^https:\/\/chatgpt\.com\//i.test(page) ? 'chatgpt' : 'local');
      const status = { at:new Date().toISOString(), page, source, extensionVersion:cleanText(body.extensionVersion).slice(0,40) };
      plusBridgeWrite(PLUS_BRIDGE_EXTENSION_STATUS_FILE, status);
      plusBridgeWrite(source === 'chatgpt' ? PLUS_BRIDGE_CHATGPT_STATUS_FILE : PLUS_BRIDGE_LOCAL_STATUS_FILE, status);
      return sendJson(res, 200, { ok:true, status, bridge:plusBridgeStatus() });
    }
    if (pathname === '/api/plus-bridge/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, plusBridgeStatus());
    }
    if (pathname === '/api/plus-bridge/open-extension-folder' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try { return sendJson(res, 200, { ok:true, ...openPlusBridgeExtensionFolder() }); }
      catch (error) { return sendJson(res, 400, { error:error.message }); }
    }
    if (pathname === '/api/plus-bridge/test-job' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const bridgeState = plusBridgeStatus();
      if (!bridgeState.extensionInstalled) return sendJson(res, 409, { error:'Browser dodatak nije detektovan. Učitaj dodatak 15.4.0 i osveži stranicu programa.' });
      if (!bridgeState.extensionCompatible) return sendJson(res, 409, { error:`Učitan je dodatak ${bridgeState.extensionVersion || 'nepoznate verzije'}, a program zahteva ${EXPECTED_EXTENSION_VERSION}. Ukloni stari dodatak i učitaj novi folder.` });
      const body = await readBody(req, 200_000);
      const gptUrl = DEFAULT_PRIVATE_GPT_URL;
      const id = crypto.randomUUID();
      const prompt = [
        'Ovo je test veze između Muzičkog Spot Studija i ChatGPT-a.',
        '',
        'Odgovori samo ovom jednom linijom i ne dodaj ništa pre ili posle nje:',
        '',
        'MOST RADI — MSS 15.6.0'
      ].join('\n');
      const job = { id, version:VERSION, serverSessionId:SERVER_SESSION_ID, type:'test', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), status:'pending', round:0, phase:'test', projectId:'bridge-test', projectFingerprint:'bridge-test', songTitle:'TEST MOSTA', gptUrl, prompt, payload:{bridgeTest:true} };
      plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job);
      try { fs.unlinkSync(PLUS_BRIDGE_RESULT_FILE); } catch {}
      return sendJson(res, 200, { ok:true, job:{id,type:'test',round:0,status:job.status,createdAt:job.createdAt,gptUrl} });
    }
    if (pathname === '/api/plus-bridge/job' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const bridgeState = plusBridgeStatus();
      if (!bridgeState.extensionInstalled) return sendJson(res, 409, { error:'Browser dodatak nije detektovan. Učitaj dodatak 15.4.0 pre pokretanja Koraka 3.' });
      if (!bridgeState.extensionCompatible) return sendJson(res, 409, { error:`Pogrešna verzija dodatka: ${bridgeState.extensionVersion || 'nepoznata'}. Potrebna je ${EXPECTED_EXTENSION_VERSION}.` });
      const body = await readBody(req, 1_500_000);
      if (!body.payload || typeof body.payload !== 'object') return sendJson(res, 400, { error:'Nedostaje Korak 3 paket.' });
      const round = Number(body.round || body.payload.round || 1) === 2 ? 2 : 1;
      const id = crypto.randomUUID();
      const prompt = cleanText(body.prompt);
      if (prompt.length < 100) return sendJson(res, 400, { error:'Zahtev za ChatGPT je prazan ili previše kratak.' });
      if (prompt.length > MAX_PLUS_PROMPT_CHARS) return sendJson(res, 413, { error:`ChatGPT zahtev je prevelik (${Math.ceil(prompt.length / 1024)} KB). Program mora da napravi kompaktni paket ispod ${Math.ceil(MAX_PLUS_PROMPT_CHARS / 1024)} KB.` });
      const job = {
        id, version:VERSION, serverSessionId:SERVER_SESSION_ID, type:'step3', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), status:'pending',
        round, phase:cleanText(body.phase).slice(0,80), batchIndex:Number.isInteger(Number(body.batchIndex)) ? Number(body.batchIndex) : null, batchTotal:Number.isInteger(Number(body.batchTotal)) ? Number(body.batchTotal) : null,
        batchSceneNumbers:Array.isArray(body.batchSceneNumbers) ? body.batchSceneNumbers.map(Number).filter(Number.isFinite).slice(0,20) : [],
        projectId:cleanText(body.projectId).slice(0,200), projectFingerprint:cleanText(body.projectFingerprint).slice(0,300), songTitle:cleanText(body.songTitle).slice(0,300),
        gptUrl:DEFAULT_PRIVATE_GPT_URL, prompt, fallbackPrompt:cleanText(body.fallbackPrompt).slice(0,24000), promptChars:prompt.length, payload:body.payload
      };
      plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job);
      try { fs.unlinkSync(PLUS_BRIDGE_RESULT_FILE); } catch {}
      return sendJson(res, 200, { ok:true, job:{ id, round, phase:job.phase, batchIndex:job.batchIndex, batchTotal:job.batchTotal, status:job.status, createdAt:job.createdAt, gptUrl:job.gptUrl, promptChars:prompt.length } });
    }
    if (pathname === '/api/plus-bridge/job' && req.method === 'GET') {
      if (!requirePlusBridgeExtension(req, res, url)) return;
      const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
      if (!job || ['consumed','cancelled'].includes(job.status)) return sendJson(res, 404, { error:'Nema aktivnog Korak 3 zahteva.' });
      return sendJson(res, 200, { ok:true, job });
    }
    if (pathname === '/api/plus-bridge/job-status' && req.method === 'POST') {
      if (!requirePlusBridgeExtension(req, res, url)) return;
      const body = await readBody(req, 100_000);
      const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
      if (!job || cleanText(body.jobId) !== job.id) return sendJson(res, 404, { error:'Aktivan posao nije pronađen.' });
      const allowed = new Set(['pending','inserted','sent','waiting-response','result-ready','error','consumed']);
      const next = cleanText(body.status);
      if (!allowed.has(next)) return sendJson(res, 400, { error:'Nepoznat status mosta.' });
      job.status = next; job.updatedAt = new Date().toISOString(); job.message = cleanText(body.message).slice(0,1000);
      plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job);
      return sendJson(res, 200, { ok:true, job:{id:job.id,status:job.status,updatedAt:job.updatedAt} });
    }
    if (pathname === '/api/plus-bridge/result' && req.method === 'POST') {
      if (!requirePlusBridgeExtension(req, res, url)) return;
      const body = await readBody(req, 12_000_000);
      const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
      if (!job || job.serverSessionId !== SERVER_SESSION_ID || cleanText(body.jobId) !== job.id || job.status === 'cancelled') return sendJson(res, 404, { error:'Rezultat ne pripada aktivnom Korak 3 zahtevu.' });
      const raw = String(body.raw || '').trim();
      if (raw.length < 20) return sendJson(res, 400, { error:'ChatGPT odgovor je prazan ili previše kratak.' });
      const result = { jobId:job.id, serverSessionId:SERVER_SESSION_ID, type:job.type || 'step3', round:job.round, phase:job.phase || '', batchIndex:job.batchIndex, batchTotal:job.batchTotal, batchSceneNumbers:job.batchSceneNumbers || [], projectId:job.projectId, projectFingerprint:job.projectFingerprint || '', createdAt:new Date().toISOString(), raw };
      plusBridgeWrite(PLUS_BRIDGE_RESULT_FILE, result);
      job.status='result-ready'; job.updatedAt=result.createdAt; plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job);
      return sendJson(res, 200, { ok:true, result:{jobId:result.jobId,createdAt:result.createdAt,bytes:Buffer.byteLength(raw)} });
    }
    if (pathname === '/api/plus-bridge/cancel' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req, 100_000);
      const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
      if (job) { job.status='cancelled'; job.updatedAt=new Date().toISOString(); job.message=cleanText(body.reason || 'Korisnik je otkazao zahtev.').slice(0,500); plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job); }
      try { fs.unlinkSync(PLUS_BRIDGE_RESULT_FILE); } catch {}
      return sendJson(res, 200, { ok:true, cancelledJobId:job?.id || '' });
    }

    if (pathname === '/api/plus-bridge/result' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const jobId = cleanText(url.searchParams.get('jobId'));
      const result = plusBridgeRead(PLUS_BRIDGE_RESULT_FILE, null);
      if (!result || (jobId && result.jobId !== jobId)) return sendJson(res, 404, { ready:false, error:'Rezultat još nije vraćen iz ChatGPT-a.' });
      return sendJson(res, 200, { ok:true, ready:true, result });
    }
    if (pathname === '/api/plus-bridge/consume' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req, 100_000);
      const job = plusBridgeRead(PLUS_BRIDGE_JOB_FILE, null);
      if (job && (!body.jobId || cleanText(body.jobId) === job.id)) { job.status='consumed'; job.updatedAt=new Date().toISOString(); plusBridgeWrite(PLUS_BRIDGE_JOB_FILE, job); }
      return sendJson(res, 200, { ok:true });
    }

    if (pathname === '/api/maintenance/diagnostics' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const details = maintenanceDiagnostics();
      if (url.searchParams.get('probe') === '1') details.publicProbe = await probeTunnel(details.publicUrl);
      return sendJson(res, 200, details);
    }
    if (pathname === '/api/maintenance/integrity' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, verifyProgramIntegrity());
    }
    if (pathname === '/api/maintenance/backup' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req, 30_000_000);
      if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return sendJson(res, 400, { error: 'Nedostaje ispravno stanje projekta za backup.' });
      const backup = createProjectBackup(body.state);
      return sendJson(res, 200, { ok: true, backup, backups: listBackups() });
    }
    if (pathname === '/api/maintenance/backups' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, backups: listBackups() });
    }
    if (pathname === '/api/maintenance/open-backup-folder' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      if (process.platform !== 'win32') return sendJson(res, 400, { error: 'Otvaranje foldera je dostupno na Windows računaru.' });
      childProcess.spawn('explorer.exe', [BACKUP_DIR], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true, path: BACKUP_DIR });
    }
    if (pathname === '/api/maintenance/open-tools-folder' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      if (process.platform !== 'win32') return sendJson(res, 400, { error: 'Otvaranje foldera je dostupno na Windows računaru.' });
      const toolsDir = path.join(__dirname, 'tools');
      childProcess.spawn('explorer.exe', [toolsDir], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true, path: toolsDir });
    }
    if (pathname === '/api/maintenance/restore-latest' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const backup = latestProjectBackup();
      if (!backup) return sendJson(res, 404, { error: 'Nema automatske rezervne kopije.' });
      return sendJson(res, 200, { ok: true, ...backup });
    }
    if (pathname === '/api/maintenance/daily-backups' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, backups: listDailyBackups() });
    }
    if (pathname === '/api/maintenance/restore-daily' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const date = cleanText(url.searchParams.get('date'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'Nedostaje ispravan datum (GGGG-MM-DD).' });
      const file = path.join(DAILY_BACKUP_DIR, `dnevni-${date}.json`);
      const data = readJson(file, null);
      if (!data || !data.state) return sendJson(res, 404, { error: `Nema dnevnog backupa za ${date}.` });
      return sendJson(res, 200, { ok: true, ...data });
    }

    // GitHub moduli 15.4: HyperFrames izvoz, PySceneDetect LITE i opcioni spoljni provideri.
    if (pathname === '/api/modules/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, githubIntegrations.moduleStatus());
    }
    if (pathname === '/api/modules/install' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 100_000);
        const result = githubIntegrations.launchInstaller(body.module);
        return sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Instalaciona skripta nije pokrenuta.' }); }
    }
    if (pathname === '/api/modules/open-folder' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 100_000);
        return sendJson(res, 200, githubIntegrations.openModuleFolder(body.module));
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Folder nije otvoren.' }); }
    }
    // Panel za instalaciju LITE alata unutar programa (bez sirovog PowerShell prozora).
    if (pathname === '/api/modules/tools' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, tools: toolRunner.listTools() });
    }
    if (pathname === '/api/modules/tools/run' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 10_000);
        return sendJson(res, 200, toolRunner.runTool(cleanText(body.toolId)));
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Instalacija nije pokrenuta.' }); }
    }
    if (pathname === '/api/modules/tools/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      try {
        return sendJson(res, 200, toolRunner.toolStatus(cleanText(url.searchParams.get('toolId'))));
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Status nije dostupan.' }); }
    }
    if (pathname === '/api/modules/tools/cancel' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 10_000);
        return sendJson(res, 200, toolRunner.cancelTool(cleanText(body.toolId)));
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Otkazivanje nije uspelo.' }); }
    }
    if (pathname === '/api/modules/providers' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, providers: githubIntegrations.maskedProviders() });
    }
    if (pathname === '/api/audio-projects' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 201, { ok: true, project: audioProjects.createProject(body) });
      } catch (error) { return sendJson(res, error.statusCode || 400, { error: error.message || 'Projekat nije napravljen.' }); }
    }
    if (pathname === '/api/audio-projects' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const listOptions = {
        search: cleanText(url.searchParams.get('search')),
        status: cleanText(url.searchParams.get('status')),
        channelId: cleanText(url.searchParams.get('channelId')),
        sort: cleanText(url.searchParams.get('sort')) || undefined
      };
      return sendJson(res, 200, { ok: true, projects: audioProjects.listProjects(listOptions) });
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/duplicate') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000).catch(() => ({}));
        return sendJson(res, 201, { ok: true, project: audioProjects.duplicateProject(projectId, { name: cleanText(body.name) || undefined }) });
      } catch (error) { return sendJson(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 400, { error: error.message || 'Dupliranje nije uspelo.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/rename') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 200, { ok: true, project: audioProjects.renameProject(projectId, body.name) });
      } catch (error) { return sendJson(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 400, { error: error.message || 'Preimenovanje nije uspelo.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/archive') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000).catch(() => ({}));
        return sendJson(res, 200, { ok: true, project: audioProjects.archiveProject(projectId, body.archived !== false) });
      } catch (error) { return sendJson(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 400, { error: error.message || 'Arhiviranje nije uspelo.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/export') && pathname.split('/').length === 5 && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      const project = audioProjects.getProject(projectId);
      if (!project) return sendJson(res, 404, { error: 'Projekat nije pronađen.' });
      const format = cleanText(url.searchParams.get('format')) || 'project.json';
      try {
        const { content, mime, fileName } = projectExport.exportProject(project, format);
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'no-store' });
        return res.end(content);
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Izvoz nije uspeo.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/backups') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try { return sendJson(res, 200, { ok: true, backups: audioProjects.listProjectBackupsFor(projectId) }); }
      catch (error) { return sendJson(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 400, { error: error.message || 'Backupi nisu dostupni.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/restore-backup') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 200, { ok: true, project: audioProjects.restoreProjectBackup(projectId, cleanText(body.fileName)) });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, BACKUP_NOT_FOUND: 404, INVALID_BACKUP_NAME: 400 };
        return sendJson(res, statusByCode[error.code] || 400, { error: error.message || 'Vraćanje backup-a nije uspelo.' });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && req.method === 'DELETE' && pathname.split('/').length === 4) {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try { return sendJson(res, 200, audioProjects.deleteProjectPermanently(projectId)); }
      catch (error) { return sendJson(res, error.code === 'PROJECT_NOT_FOUND' ? 404 : 400, { error: error.message || 'Brisanje nije uspelo.' }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && req.method === 'GET' && pathname.split('/').length === 4) {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      const project = audioProjects.getProjectWithStatus(projectId);
      if (!project) return sendJson(res, 404, { error: 'Projekat nije pronađen.' });
      return sendJson(res, 200, { ok: true, project });
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/audio') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      if (!audioProjects.isValidProjectId(projectId)) return sendJson(res, 400, { error: 'Neispravan ID projekta.' });
      try {
        const body = await readBody(req, 250_000_000);
        const fileName = cleanText(body.fileName).slice(0, 255);
        if (!fileName) return sendJson(res, 400, { error: 'Nedostaje naziv audio fajla.' });
        if (typeof body.audioBase64 !== 'string' || !body.audioBase64) return sendJson(res, 400, { error: 'Nedostaje audio sadržaj (audioBase64).' });
        let buffer;
        try { buffer = Buffer.from(body.audioBase64, 'base64'); } catch { return sendJson(res, 400, { error: 'Neispravan base64 sadržaj.' }); }
        if (!buffer.length) return sendJson(res, 400, { error: 'Audio fajl je prazan.' });
        const project = await audioProjects.attachAudioToProject(projectId, buffer, fileName);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const status = error.code === 'PROJECT_NOT_FOUND' ? 404 : (error.statusCode || 400);
        return sendJson(res, status, { error: error.message || 'Audio fajl nije prihvaćen.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      const project = audioProjects.getProject(projectId);
      if (!project) return sendJson(res, 404, { error: 'Projekat nije pronađen.' });
      return sendJson(res, 200, { ok: true, lyrics: project.lyrics || null });
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/plan-scenes') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000).catch(() => ({}));
        const settings = {};
        for (const key of ['preferredAverageSceneDuration', 'minimumSceneDuration', 'maximumSceneDuration', 'preferredSceneCount']) {
          if (Number.isFinite(body[key])) settings[key] = Number(body[key]);
        }
        if (['calm', 'balanced', 'dynamic'].includes(body.editingIntensity)) settings.editingIntensity = body.editingIntensity;
        const project = audioProjects.planProjectScenes(projectId, settings);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, AUDIO_MISSING: 400, INVALID_TIMELINE: 500 };
        const status = statusByCode[error.code] || error.statusCode || 400;
        return sendJson(res, status, { error: error.message || 'Planiranje scena nije uspelo.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/image-prompts/next-batch') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        return sendJson(res, 200, { ok: true, ...audioProjects.getNextImagePromptBatch(projectId) });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, STORYBOARD_MISSING: 400 };
        return sendJson(res, statusByCode[error.code] || 400, { error: error.message || 'Sledeći batch nije dostupan.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/image-prompts/submit') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 2_000_000);
        const project = audioProjects.submitImagePromptBatch(projectId, body);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, NO_ACTIVE_BATCH: 400, INVALID_AI_RESPONSE: 422 };
        return sendJson(res, statusByCode[error.code] || 400, { error: error.message || 'Image prompt batch nije prihvaćen.', code: error.code || null, problems: error.problems || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/video-prompts/next-batch') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        return sendJson(res, 200, { ok: true, ...audioProjects.getNextVideoPromptBatch(projectId) });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, IMAGES_REQUIRED: 400 };
        return sendJson(res, statusByCode[error.code] || 400, { error: error.message || 'Sledeći video batch nije dostupan.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/video-prompts/submit') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 2_000_000);
        const project = audioProjects.submitVideoPromptBatch(projectId, body);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, NO_ACTIVE_BATCH: 400, INVALID_AI_RESPONSE: 422 };
        return sendJson(res, statusByCode[error.code] || 400, { error: error.message || 'Video prompt batch nije prihvaćen.', code: error.code || null, problems: error.problems || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/analyze-music') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const project = await audioProjects.analyzeProjectMusic(projectId);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, AUDIO_MISSING: 400 };
        const status = statusByCode[error.code] || error.statusCode || 400;
        return sendJson(res, status, { error: error.message || 'Analiza muzike nije uspela.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/auto-lyrics') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000);
        const options = {};
        if (cleanText(body.model)) options.model = cleanText(body.model).slice(0, 40);
        if (cleanText(body.language)) options.language = cleanText(body.language).slice(0, 10);
        const project = await audioProjects.generateAutoLyrics(projectId, options);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, AUDIO_MISSING: 400 };
        const status = statusByCode[error.code] || error.statusCode || 400;
        return sendJson(res, status, { error: error.message || 'Automatsko izvlačenje teksta nije uspelo.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/align') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000);
        const options = {};
        if (cleanText(body.model)) options.model = cleanText(body.model).slice(0, 40);
        if (cleanText(body.language)) options.language = cleanText(body.language).slice(0, 10);
        const project = await audioProjects.alignProjectLyrics(projectId, options);
        return sendJson(res, 200, { ok: true, project });
      } catch (error) {
        const statusByCode = { PROJECT_NOT_FOUND: 404, AUDIO_MISSING: 400, LYRICS_MISSING: 400 };
        const status = statusByCode[error.code] || error.statusCode || 400;
        return sendJson(res, status, { error: error.message || 'Poravnanje teksta nije uspelo.', code: error.code || null });
      }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics') && req.method === 'PATCH') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 2_000_000);
        const project = audioProjects.setProjectLyrics(projectId, typeof body.text === 'string' ? body.text : '');
        return sendJson(res, 200, { ok: true, lyrics: project.lyrics });
      } catch (error) {
        const status = error.code === 'PROJECT_NOT_FOUND' ? 404 : (error.statusCode || 400);
        return sendJson(res, status, { error: error.message || 'Tekst pesme nije sačuvan.' });
      }
    }
    // --- "Tekst pesme na videu / Lyrics Overlay Studio" (dodatak master promptu, sekcija 23) ---
    // Tekst je nezavisan, naknadno izmenjiv sloj — ove rute NIKAD ne diraju storyboard/prompts.
    const overlayErrorStatus = { PROJECT_NOT_FOUND: 404, TRACK_NOT_FOUND: 404, CUE_NOT_FOUND: 404, INVALID_TRACK_TYPE: 400, INVALID_CUE: 422 };
    if (pathname === '/api/text-presets' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, presets: textStylePresets.listStylePresets() });
    }
    if (pathname.startsWith('/api/text-presets/') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      try { return sendJson(res, 200, { ok: true, style: textStylePresets.getStylePreset(pathname.split('/')[3]) }); }
      catch (error) { return sendJson(res, 404, { error: error.message || 'Preset nije pronađen.' }); }
    }
    if (pathname === '/api/fonts' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, fonts: fontManager.listAvailableFonts() });
    }
    // --- Napredni alati za tekst-u-video workflow ---
    // Ove rute su bez spoljašnjih servisa i mogu se koristiti i u desktop UI-ju i pri batch obradi.
    if (pathname === '/api/text-tools/features' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, features: [
        'lrc-import', 'lrc-export', 'srt-import', 'karaoke-word-timings',
        'caption-quality-check', 'caption-normalization', 'long-caption-split',
        'safe-area-presets', 'beat-marker-detection', 'beat-scene-cuts', 'batch-export-plan'
      ] });
    }
    if (pathname.startsWith('/api/text-tools/') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 2_000_000);
        const route = pathname.slice('/api/text-tools/'.length);
        const result = {
          'lrc/import': () => textVideoTools.parseLrc(body.text, { durationMs: body.durationMs }),
          'lrc/export': () => ({ lrc: textVideoTools.exportLrc(body.cues, body.metadata) }),
          'srt/import': () => ({ cues: textVideoTools.parseSrt(body.text) }),
          'karaoke/words': () => ({ words: textVideoTools.createKaraokeWordTimings(body.cue, body.options || {}) }),
          'qc': () => textVideoTools.validateCaptionTrack(body.track, body.options || {}),
          'normalize': () => textVideoTools.normalizeCaptionTrack(body.track, body.options || {}),
          'split': () => ({ cues: textVideoTools.splitLongCaptionCue(body.cue, body.options || {}) }),
          'beat-markers': () => ({ markers: textVideoTools.detectBeatMarkers(body.energy, body.options || {}) }),
          'scene-cuts': () => ({ scenes: textVideoTools.buildSceneCutsFromBeats(body.durationMs, body.markers, body.options || {}) }),
          'batch-export': () => ({ plan: textVideoTools.buildBatchExportPlan(body) })
        }[route];
        if (!result) return sendJson(res, 404, { error: 'Nepoznat text-tools endpoint.' });
        return sendJson(res, 200, { ok: true, ...result() });
      } catch (error) {
        return sendJson(res, error.statusCode || 400, { error: error.message || 'Text-u-video obrada nije uspela.' });
      }
    }
    if (pathname === '/api/text-tools/safe-area' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, { ok: true, preset: textVideoTools.getSafeAreaPreset(url.searchParams.get('format') || '16:9') });
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics-overlay/validate') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try { return sendJson(res, 200, { ok: true, ...lyricsOverlayStorage.validateProjectOverlay(projectId) }); }
      catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Validacija nije uspela.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics-overlay/export') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      const trackId = cleanText(url.searchParams.get('trackId'));
      const format = cleanText(url.searchParams.get('format')) || 'srt';
      if (!trackId) return sendJson(res, 400, { error: 'Nedostaje trackId.' });
      try {
        const tracks = lyricsOverlayStorage.listTextTracks(projectId);
        const track = tracks.find(t => t.trackId === trackId);
        if (!track) return sendJson(res, 404, { error: 'Text track nije pronađen.' });
        const width = Number(url.searchParams.get('width')) || 1920;
        const height = Number(url.searchParams.get('height')) || 1080;
        const styleId = cleanText(url.searchParams.get('stylePreset'));
        const style = styleId ? textStylePresets.getStylePreset(styleId) : textStylePresets.getStylePreset('cinematic-subtitle');

        const exporters = {
          srt: () => ({ content: textOverlayExport.exportTrackToSrt(track), mime: 'text/plain', ext: 'srt' }),
          vtt: () => ({ content: textOverlayExport.exportTrackToVtt(track), mime: 'text/vtt', ext: 'vtt' }),
          ass: () => ({ content: textOverlayExport.exportTrackToAss(track, style, { width, height }), mime: 'text/plain', ext: 'ass' }),
          json: () => ({ content: textOverlayExport.exportTrackToJson(track), mime: 'application/json', ext: 'json' })
        };
        if (!exporters[format]) return sendJson(res, 400, { error: `Nepodržan format: ${format}. Podržano: srt, vtt, ass, json.` });
        const { content, mime, ext } = exporters[format]();
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${track.type}-${trackId}.${ext}"`, 'Cache-Control': 'no-store' });
        return res.end(content);
      } catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Izvoz nije uspeo.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics-overlay') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try { return sendJson(res, 200, { ok: true, tracks: lyricsOverlayStorage.listTextTracks(projectId) }); }
      catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Text track-ovi nisu dostupni.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/lyrics-overlay/text-tracks') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const projectId = pathname.split('/')[3];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 201, { ok: true, track: lyricsOverlayStorage.createTextTrackForProject(projectId, body) });
      } catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Text track nije napravljen.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.includes('/lyrics-overlay/text-tracks/') && !pathname.includes('/text-cues') && req.method === 'PATCH') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 200, { ok: true, track: lyricsOverlayStorage.updateTextTrackForProject(projectId, trackId, body) });
      } catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Text track nije ažuriran.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.includes('/lyrics-overlay/text-tracks/') && !pathname.includes('/text-cues') && req.method === 'DELETE') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      try { return sendJson(res, 200, lyricsOverlayStorage.deleteTextTrackForProject(projectId, trackId)); }
      catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Text track nije obrisan.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.endsWith('/text-cues') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 201, { ok: true, cue: lyricsOverlayStorage.addCueToTrack(projectId, trackId, body) });
      } catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Cue nije napravljen.', code: error.code || null, problems: error.problems || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.includes('/text-cues/') && pathname.endsWith('/restore') && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      const cueId = segments[8];
      try { return sendJson(res, 200, { ok: true, cue: lyricsOverlayStorage.restoreCue(projectId, trackId, cueId) }); }
      catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Cue nije vraćen.', code: error.code || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.includes('/text-cues/') && !pathname.endsWith('/restore') && req.method === 'PATCH') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      const cueId = segments[8];
      try {
        const body = await readBody(req, 20_000);
        return sendJson(res, 200, { ok: true, cue: lyricsOverlayStorage.updateCueInTrack(projectId, trackId, cueId, body) });
      } catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Cue nije ažuriran.', code: error.code || null, problems: error.problems || null }); }
    }
    if (pathname.startsWith('/api/audio-projects/') && pathname.includes('/text-cues/') && !pathname.endsWith('/restore') && req.method === 'DELETE') {
      if (!requireLocal(req, res)) return;
      const segments = pathname.split('/');
      const projectId = segments[3];
      const trackId = segments[6];
      const cueId = segments[8];
      try { return sendJson(res, 200, { ok: true, cue: lyricsOverlayStorage.softDeleteCue(projectId, trackId, cueId) }); }
      catch (error) { return sendJson(res, overlayErrorStatus[error.code] || 400, { error: error.message || 'Cue nije obrisan.', code: error.code || null }); }
    }
    if (pathname === '/api/modules/providers' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 200_000);
        const provider = githubIntegrations.saveProvider(cleanText(body.provider), body.config || {});
        return sendJson(res, 200, { ok: true, provider });
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Provider nije sačuvan.' }); }
    }
    if (pathname === '/api/modules/providers/test' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try {
        const body = await readBody(req, 100_000);
        const result = await githubIntegrations.testProvider(cleanText(body.provider));
        return sendJson(res, 200, result);
      } catch (error) { return sendJson(res, 400, { error: error.message || 'Provider nije testiran.' }); }
    }

    // Real-time research without paid API: web results + YouTube metadata through yt-dlp.
    if (pathname === '/api/security/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, advancedTools.securityStatus());
    }
    if (pathname === '/api/system/profile' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, await advancedTools.systemProfile());
    }
    if (pathname === '/api/models/verify' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const files = Array.isArray(body.files) ? body.files.map(cleanText).filter(Boolean).slice(0, 50) : [];
      const roots = Array.isArray(body.roots) ? body.roots.map(cleanText).filter(Boolean).slice(0, 10) : [];
      const discovered = roots.length ? advancedTools.findCandidateModels(roots) : [];
      const unique = [...new Set([...files, ...discovered])].slice(0, 250);
      const results = unique.map(file => advancedTools.verifyModelFile(file, { fullHash: body.fullHash === true }));
      return sendJson(res, 200, { ok: results.every(item => item.ok), count: results.length, results });
    }
    if (pathname === '/api/history/list' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const data = advancedTools.loadHistory();
      return sendJson(res, 200, { records: data.records.slice(0, 500), summary: advancedTools.historySummary() });
    }
    if (pathname === '/api/history/add' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const record = advancedTools.addHistory(await readBody(req));
      return sendJson(res, 200, { ok: true, record, summary: advancedTools.historySummary() });
    }
    if (pathname === '/api/history/export' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      return sendJson(res, 200, advancedTools.loadHistory(), { 'Content-Disposition': 'attachment; filename="rezultati-pesama-i-shorts.json"' });
    }


    if (pathname === '/api/research/channels' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      try { return sendJson(res, 200, await researchEngine.analyzeOwnChannels()); }
      catch (error) { return sendJson(res, 503, { ok:false, error:error.message || 'Analiza kanala nije uspela.' }); }
    }
    if (pathname === '/api/research/run' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req, 2_000_000);
      try {
        const report = await researchEngine.runResearch({
          songTitle: cleanText(body.songTitle).slice(0, 180),
          genre: cleanText(body.genre).slice(0, 100),
          mood: cleanText(body.mood).slice(0, 100),
          lyrics: cleanText(body.lyrics).slice(0, 100_000),
          region: cleanText(body.region || 'RS').slice(0, 8),
          language: cleanText(body.language || 'sr').slice(0, 12)
        });
        return sendJson(res, report.ok ? 200 : 503, report);
      } catch (error) {
        return sendJson(res, 503, { ok: false, error: error.message || 'Istraživanje nije uspelo.', fetchedAt: new Date().toISOString() });
      }
    }
    if (pathname === '/api/research/youtube-search' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req, 200_000);
      try {
        const query = cleanText(body.query).slice(0, 240);
        const maxResults = Math.max(5, Math.min(30, Number(body.maxResults || 12)));
        const sort = cleanText(body.sort || 'momentum').slice(0, 20);
        let videos = [];
        let source = 'yt-dlp-public-search';
        let warning = '';
        try {
          videos = await youtubeDataApiReferenceSearch(query, maxResults, sort);
          if (videos.length) source = 'youtube-data-api-v3';
        } catch (error) { warning = `YouTube Data API: ${error.message}`; }
        if (!videos.length) {
          try { videos = await researchEngine.searchYoutubeReferences(query, maxResults, sort); }
          catch (error) { throw new Error([warning, `yt-dlp: ${error.message}`].filter(Boolean).join(' | ')); }
        }
        return sendJson(res, 200, { ok:true, query, sort, source, videos, count:videos.length, warning, note:'Javni metapodaci i heuristika momentuma; nije CTR niti retention.' });
      } catch (error) {
        return sendJson(res, 503, { ok:false, error:error.message || 'YouTube pretraga nije uspela.', videos:[] });
      }
    }
    if (pathname === '/api/research/last' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const report = researchEngine.lastResearch();
      if (!report) return sendJson(res, 404, { error: 'Još nema sačuvanog istraživanja.' });
      return sendJson(res, 200, report);
    }
    if (pathname === '/api/comfyui/path' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const saved = readTextFile(COMFY_PATH_FILE);
      return sendJson(res, 200, { ok: true, path: normalizeComfyRoot(saved), rawPath: saved, status: readJson(COMFY_STATUS_FILE, null) });
    }
    if (pathname === '/api/comfyui/path' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const selected = normalizeComfyRoot(body.path);
      if (!selected) return sendJson(res, 400, { error: 'Izabrani folder nije ComfyUI_windows_portable. Mora da sadrži python_embeded i ComfyUI\\main.py.' });
      fs.writeFileSync(COMFY_PATH_FILE, selected, 'utf8');
      const workerPid = restartTunnelWorker(false, false);
      return sendJson(res, 200, { ok: true, path: selected, workerPid, message: 'ComfyUI folder je sačuvan i pokretanje je provereno u pozadini.' });
    }
    if (pathname === '/api/comfyui/select-folder' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const picked = selectComfyFolderWindows();
      if (!picked) return sendJson(res, 400, { error: 'Folder nije izabran.' });
      const selected = normalizeComfyRoot(picked);
      if (!selected) return sendJson(res, 400, { error: 'Izabrani folder nije ispravan ComfyUI_windows_portable folder.' });
      fs.writeFileSync(COMFY_PATH_FILE, selected, 'utf8');
      const workerPid = restartTunnelWorker(false, false);
      return sendJson(res, 200, { ok: true, path: selected, workerPid, message: 'ComfyUI folder je sačuvan i proverava se.' });
    }

    // Privatni GPT most sa tajnim URL-om. U GPT editoru Authentication ostaje NONE.
    // Nasumični token je deo nepredvidive putanje, pa korisnik ne unosi dodatni ključ.
    const privateBridgePrefix = bridgeBasePath();
    if (pathname === `${privateBridgePrefix}/openapi.json`) return sendJson(res, 200, openApiSchema(req), { 'Access-Control-Allow-Origin': '*' });
    if (pathname === `${privateBridgePrefix}/privacy`) return sendText(res, 200, '<!doctype html><meta charset="utf-8"><title>Privatnost</title><h1>Muzički Spot Studio — privatna upotreba</h1><p>Ovaj lokalni server koristi samo vlasnik programa. Prima tekst projekta i privremene linkove do slika koje je vlasnikov privatni Custom GPT generisao. Podaci ostaju u lokalnom folderu programa. Server ne prodaje niti deli podatke.</p>', 'text/html; charset=utf-8');
    // Stare predvidive adrese rade samo lokalno radi dijagnostike.
    if (pathname === '/chatgpt-action-openapi.json') { if (!requireLocal(req, res)) return; return sendJson(res, 200, openApiSchema(req)); }
    if (pathname === '/chatgpt-privacy') { if (!requireLocal(req, res)) return; return sendText(res, 200, 'Privatni GPT koristi tajnu adresu iz programa.'); }

    // Opcioni Cloudflare Quick Tunnel: bez naloga, ali URL je privremen. Primarni tok je ručni paket bez tunela.
    if (pathname === '/api/tunnel/settings' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const provider = tunnelProvider();
      const publicUrl = tunnelUrl();
      const status = tunnelStatus();
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        requestedProvider: 'cloudflare-quick-tunnel',
        activeProvider: provider || cleanText(status.provider) || 'cloudflare-quick-tunnel',
        publicUrl,
        updatedAt: cleanText(status.updatedAt),
        status
      });
    }
    if (pathname === '/api/tunnel/restart' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const workerPid = restartTunnelWorker();
      return sendJson(res, 200, { ok: true, workerPid, message: 'Cloudflare Quick Tunnel se pokreće. Ne traži nalog; URL je privremen i promeniće se posle ponovnog pokretanja.' });
    }
    if (pathname === '/api/tunnel/status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const status = tunnelStatus();
      const publicUrl = tunnelUrl() || cleanText(status.publicUrl);
      const result = { ok: true, ...status, publicUrl, activeProvider: tunnelProvider() || cleanText(status.provider) || 'cloudflare-quick-tunnel' };
      if (url.searchParams.get('probe') === '1') result.probe = await probeTunnel(publicUrl);
      return sendJson(res, 200, result);
    }
    if (pathname === '/api/tunnel/test' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const publicUrl = tunnelUrl() || cleanText(tunnelStatus().publicUrl);
      const probe = await probeTunnel(publicUrl);
      return sendJson(res, probe.ok ? 200 : 503, { ok: probe.ok, publicUrl, ...probe });
    }

    // Local browser bridge setup/sync/update polling.
    if (pathname === '/api/bridge/setup' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const publicUrl = tunnelUrl();
      const provider = tunnelProvider() || 'cloudflare-quick-tunnel';
      const status = tunnelStatus();
      return sendJson(res, 200, {
        ok: true, version: VERSION, publicUrl, schemaUrl: publicUrl ? `${publicUrl}${bridgeBasePath()}/openapi.json` : '',
        setupMode: 'manual-file-bridge-primary-cloudflare-optional',
        gptEditorUrl: 'https://chatgpt.com/gpts/editor', instructions: customGptInstructions(publicUrl),
        tunnelProvider: provider, tunnelStatus: status,
        warning: publicUrl
          ? 'Cloudflare Quick Tunnel je spreman, ali njegova adresa je privremena. Posle restarta ponovo uvezi novi OpenAPI URL u Action.'
          : (status.error || status.message || 'Direktan Action most nije pokrenut. Za najjednostavniji rad koristi IZVEZI PAKET → ChatGPT Plus → UVEZI JSON, bez tunela.')
      });
    }
    if (pathname === '/api/bridge/sync' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const incoming = await readBody(req);
      if (!incoming.projectId) return sendJson(res, 400, { error: 'Nedostaje projectId.' });
      const existing = bridgeProject();
      const priorById = new Map((existing?.scenes || []).map(scene => [scene.id, scene]));
      const scenes = (Array.isArray(incoming.scenes) ? incoming.scenes : []).map(scene => {
        const prior = priorById.get(scene.id) || {};
        return {
          ...scene,
          imageReady: Boolean(scene.imageReady || prior.imageReady),
          failed: Boolean(prior.failed && !scene.imageReady),
          failureCount: Number(prior.failureCount || 0),
          deferred: Boolean(prior.deferred),
          terminalFailure: Boolean(prior.terminalFailure),
          failureReason: prior.failureReason || '',
          serverImage: prior.serverImage || scene.serverImage || null
        };
      });
      const project = {
        ...incoming,
        creativeIdeas: Array.isArray(incoming.creativeIdeas) && incoming.creativeIdeas.length ? incoming.creativeIdeas : (existing?.projectId === incoming.projectId ? existing.creativeIdeas || [] : []),
        research: incoming.research && typeof incoming.research === 'object' ? incoming.research : (existing?.projectId === incoming.projectId ? existing.research || null : null),
        ideaResearch: incoming.ideaResearch && typeof incoming.ideaResearch === 'object' ? incoming.ideaResearch : (existing?.projectId === incoming.projectId ? existing.ideaResearch || null : null),
        scenes,
        syncedAt: new Date().toISOString()
      };
      writeBridgeProject(project);
      addBridgeUpdate('project-synced', { projectId: project.projectId, sceneCount: scenes.length });
      return sendJson(res, 200, { ok: true, sceneCount: scenes.length, ready: scenes.filter(s => s.imageReady).length });
    }
    if (pathname === '/api/bridge/updates' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const after = Number(url.searchParams.get('after') || 0);
      const projectId = cleanText(url.searchParams.get('projectId'));
      const data = bridgeUpdates();
      const items = data.items.filter(item => item.seq > after && (!projectId || !item.projectId || item.projectId === projectId));
      return sendJson(res, 200, { seq: data.seq, items });
    }
    if (pathname.startsWith('/api/bridge/image/') && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const parts = pathname.split('/').slice(4);
      if (parts.length !== 2) return sendText(res, 404, 'Slika nije pronađena.');
      const projectDir = path.join(BRIDGE_IMAGES_DIR, sanitizeSegment(parts[0]));
      const requested = sanitizeSegment(parts[1]);
      const candidates = fs.existsSync(projectDir) ? fs.readdirSync(projectDir).filter(name => path.parse(name).name === requested) : [];
      if (!candidates.length) return sendText(res, 404, 'Slika nije pronađena.');
      const file = path.join(projectDir, candidates[0]);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }

    // Tajna capability putanja se interno mapira na postojeće Action rute.
    let bridgeCapability = false;
    if (pathname.startsWith(`${privateBridgePrefix}/`)) {
      const suffix = pathname.slice(privateBridgePrefix.length);
      const allowed = new Set(['/project','/ideas','/next-image-task','/upload-scene-image','/status','/report-failure']);
      if (allowed.has(suffix)) {
        pathname = `/api/chatgpt${suffix}`;
        bridgeCapability = true;
      }
    }

    // Custom GPT Action rute. Javni pristup je moguć samo kroz nasumičnu tajnu putanju.
    if (pathname.startsWith('/api/chatgpt/')) {
      if (!requirePublicRateLimit(req, res)) return;
      if (!bridgeCapability && !requireLocal(req, res)) return;
      const project = bridgeProject();
      if (!project && pathname !== '/api/chatgpt/status') return sendJson(res, 404, { error: 'Program još nije sinhronizovao projekat. U programu klikni „Sinhronizuj sa privatnim GPT-om“.' });

      if (pathname === '/api/chatgpt/project' && req.method === 'GET') {
        return sendJson(res, 200, {
          projectId: project.projectId, projectName: project.name, songTitle: project.songTitle, artistName: project.artistName,
          format: project.format, lyrics: project.lyrics, genre: project.genre, mood: project.mood, audio: project.audio,
          lockedGirlIdentity: project.lockedGirlIdentity, creativeIdeas: project.creativeIdeas || [], selectedIdeaId: project.selectedIdeaId || '',
          selectedIdea: project.selectedIdea || null, scenes: project.scenes || [], rules: project.rules || [],
          localResearch: project.research || null, ideaResearch: project.ideaResearch || null,
          previousIdeaHistory: readIdeaHistory().filter(item => item.projectId !== project.projectId).slice(-40).map(item => ({ songTitle: item.songTitle, title: item.title, centralSymbol: item.centralSymbol, fingerprint: item.fingerprint }))
        });
      }
      if (pathname === '/api/chatgpt/ideas' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.projectId !== project.projectId) return sendJson(res, 409, { error: 'projectId ne odgovara aktivnom projektu.' });
        const ideasError = validateTenCreativeIdeas(body.ideas, body.research, project);
        if (ideasError) return sendJson(res, 400, { error: ideasError });
        project.creativeIdeas = body.ideas;
        project.ideaResearch = body.research;
        project.ideasGeneratedAt = new Date().toISOString();
        saveIdeaHistory(project, body.ideas, body.research);
        writeBridgeProject(project);
        addBridgeUpdate('ideas-ready', { projectId: project.projectId, ideas: body.ideas, research: body.research });
        return sendJson(res, 200, { ok: true, sourceCount: body.research.sources.length, message: 'Real-time research i tačno 10 proverenih ideja su vraćeni programu. Korisnik sada bira jednu ideju.' });
      }
      if (pathname === '/api/chatgpt/next-image-task' && req.method === 'GET') {
        if (!(project.creativeIdeas || []).length || !project.selectedIdeaId) return sendJson(res, 200, { complete: false, waitingForUser: true, reason: 'Korisnik mora prvo da izabere jednu od 10 ideja u programu.' });
        const scenes = project.scenes || [];
        const ready = scenes.filter(scene => scene.imageReady).length;
        let pending = scenes.find(scene => !scene.imageReady && !scene.terminalFailure && !scene.deferred);
        if (!pending) {
          const retryable = scenes.filter(scene => !scene.imageReady && !scene.terminalFailure && scene.deferred);
          if (retryable.length) {
            retryable.forEach(scene => { scene.deferred = false; });
            writeBridgeProject(project);
            pending = retryable.sort((a, b) => Number(a.failureCount || 0) - Number(b.failureCount || 0) || Number(a.number || 0) - Number(b.number || 0))[0];
          }
        }
        if (!pending) {
          const blocked = scenes.filter(scene => !scene.imageReady && scene.terminalFailure);
          if (blocked.length) return sendJson(res, 200, { complete: false, blocked: true, projectId: project.projectId, ready, total: scenes.length, failedSceneNumbers: blocked.map(scene => scene.number), message: 'Sve automatske ponovne probe su iskorišćene za navedene scene. Program je sačuvao sve ostalo; u Studio programu resetuj neuspele scene ili koristi lokalni rezervni generator.' });
          return sendJson(res, 200, { complete: true, projectId: project.projectId, ready, total: scenes.length, message: 'Sve scene imaju sliku. Program može automatski da nastavi image-to-video i render.' });
        }
        return sendJson(res, 200, {
          complete: false, projectId: project.projectId, sceneId: pending.id, sceneNumber: pending.number,
          section: pending.section, lyric: pending.lyric, imagePrompt: pending.imagePrompt, output: pending.output, retryNumber: Number(pending.failureCount || 0) + 1,
          mandatoryInstruction: 'Generiši tačno jednu sliku. Ne skraćuj prompt. Ne menjaj zaključani ID. Bez teksta, titlova, logoa ili vidljivog watermarka. Posle generisanja odmah pozovi uploadSceneImage sa upravo generisanom slikom kroz openaiFileIdRefs.',
          progress: { ready, total: scenes.length, remaining: scenes.length - ready }
        });
      }
      if (pathname === '/api/chatgpt/upload-scene-image' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.projectId !== project.projectId) return sendJson(res, 409, { error: 'projectId ne odgovara aktivnom projektu.' });
        const scene = (project.scenes || []).find(item => item.id === body.sceneId);
        if (!scene) return sendJson(res, 404, { error: 'Scena nije pronađena.' });
        const refs = Array.isArray(body.openaiFileIdRefs) ? body.openaiFileIdRefs : [];
        if (!refs.length || typeof refs[0] !== 'object') return sendJson(res, 400, { error: 'Nedostaje upravo generisana slika u openaiFileIdRefs.' });
        let image;
        try { image = await downloadActionImage(refs[0]); }
        catch (error) { return sendJson(res, 400, { error: error.message || 'Slika nije mogla biti preuzeta.' }); }
        const ext = getExt(image.mime, image.name);
        const file = bridgeImagePath(project.projectId, scene.id, ext);
        fs.writeFileSync(file, image.bytes);
        scene.imageReady = true;
        scene.failed = false;
        scene.deferred = false;
        scene.terminalFailure = false;
        scene.failureReason = '';
        scene.serverImage = { fileName: path.basename(file), mimeType: image.mime, bytes: image.bytes.length, openaiFileId: cleanText(refs[0].id), receivedAt: new Date().toISOString() };
        writeBridgeProject(project);
        const imageUrl = `/api/bridge/image/${encodeURIComponent(sanitizeSegment(project.projectId))}/${encodeURIComponent(sanitizeSegment(scene.id))}`;
        addBridgeUpdate('image-ready', { projectId: project.projectId, sceneId: scene.id, sceneNumber: scene.number, imageUrl, mimeType: image.mime, fileName: path.basename(file) });
        const ready = project.scenes.filter(item => item.imageReady).length;
        return sendJson(res, 200, { ok: true, sceneId: scene.id, sceneNumber: scene.number, ready, total: project.scenes.length, remaining: project.scenes.length - ready, continueAutomatically: ready < project.scenes.length });
      }
      if (pathname === '/api/chatgpt/status' && req.method === 'GET') {
        const active = bridgeProject();
        const total = active?.scenes?.length || 0;
        const ready = active?.scenes?.filter(scene => scene.imageReady).length || 0;
        const failed = active?.scenes?.filter(scene => scene.failed && !scene.imageReady).length || 0;
        const terminal = active?.scenes?.filter(scene => scene.terminalFailure && !scene.imageReady).map(scene => scene.number) || [];
        return sendJson(res, 200, { projectId: active?.projectId || '', total, ready, failed, terminal, remaining: Math.max(0, total - ready), complete: total > 0 && ready === total, blocked: terminal.length > 0 });
      }
      if (pathname === '/api/chatgpt/report-failure' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.projectId !== project.projectId) return sendJson(res, 409, { error: 'projectId ne odgovara aktivnom projektu.' });
        const scene = project.scenes.find(item => item.id === body.sceneId);
        if (!scene) return sendJson(res, 404, { error: 'Scena nije pronađena.' });
        scene.failed = true;
        scene.failureCount = Number(scene.failureCount || 0) + 1;
        scene.deferred = true;
        scene.terminalFailure = scene.failureCount >= 5;
        scene.failureReason = cleanText(body.reason).slice(0, 1000);
        writeBridgeProject(project);
        addBridgeUpdate('image-failed', { projectId: project.projectId, sceneId: scene.id, sceneNumber: scene.number, reason: scene.failureReason, failureCount: scene.failureCount, terminalFailure: scene.terminalFailure });
        return sendJson(res, 200, { ok: true, deferred: !scene.terminalFailure, terminalFailure: scene.terminalFailure, failureCount: scene.failureCount, message: scene.terminalFailure ? 'Scena nije uspela posle 5 krugova. Nastavi ostale scene; program će prijaviti blokiranu scenu.' : 'Greška je zabeležena. Scena je pomerena na kraj reda i biće automatski ponovo pokušana.' });
      }
      return sendJson(res, 404, { error: 'ChatGPT Action ruta ne postoji.' });
    }

    // YouTube OAuth and private channel analytics.
    if (pathname === '/api/youtube/oauth-config' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const raw = await readBody(req);
      const installed = raw.installed || raw.web || raw;
      if (!installed.client_id || !installed.client_secret) return sendJson(res, 400, { error: 'client_id i client_secret nisu pronađeni.' });
      advancedTools.writeSecureJson(SECURE_OAUTH_FILE, raw);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/youtube/auth-url') {
      if (!requireLocal(req, res)) return;
      const cfg = oauthConfig();
      if (!cfg.clientId || !cfg.clientSecret) return sendJson(res, 400, { error: 'Najpre učitaj client_secret.json.' });
      const state = crypto.randomBytes(24).toString('hex');
      pendingStates.set(state, { label: url.searchParams.get('label') || 'YouTube kanal', created: Date.now() });
      const redirect = `http://localhost:${PORT}/oauth2callback`;
      const query = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly', state });
      return sendJson(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
    }
    // Sekcija 24: "Ako OAuth nije konfigurisan, prikaži: nedostaje Client ID; nedostaje Google
    // Cloud projekat; YouTube API nije uključen; redirect URI nije konfigurisan; koje korake
    // korisnik mora uraditi." Server ne može da otkrije SVE ove uzroke staticki (API-not-enabled
    // i pogrešan redirect URI se vide tek pri stvarnom OAuth pokušaju preko Google-ove greške) —
    // zato status prijavljuje ono što STVARNO zna (client_id/secret) i daje tačan redirect URI
    // koji korisnik mora registrovati, plus konkretne korake.
    if (pathname === '/api/youtube/oauth-status' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const cfg = oauthConfig();
      const clientIdConfigured = Boolean(cfg.clientId);
      const clientSecretConfigured = Boolean(cfg.clientSecret);
      const configured = clientIdConfigured && clientSecretConfigured;
      const store = advancedTools.readSecureJson(SECURE_TOKENS_FILE, { channels: [] });
      const redirectUri = `http://localhost:${PORT}/oauth2callback`;
      const steps = [];
      if (!configured) {
        steps.push('Napravi Google Cloud projekat na console.cloud.google.com.');
        steps.push('Uključi "YouTube Data API v3" i "YouTube Analytics API" za taj projekat.');
        steps.push('Napravi OAuth 2.0 Client ID (tip: Desktop app ili Web application).');
        steps.push(`Ako je Web application, dodaj ovaj tačan redirect URI: ${redirectUri}`);
        steps.push('Preuzmi client_secret.json i učitaj ga u program (dugme UČITAJ OAUTH PODEŠAVANJA).');
      }
      return sendJson(res, 200, {
        ok: true, configured, clientIdConfigured, clientSecretConfigured,
        redirectUri, connectedChannelsCount: store.channels.length, steps
      });
    }
    if (pathname === '/oauth2callback') {
      if (!requireLocal(req, res)) return;
      const stateValue = url.searchParams.get('state');
      const pending = pendingStates.get(stateValue);
      if (!pending || Date.now() - Number(pending.created || 0) > 10 * 60 * 1000) {
        if (stateValue) pendingStates.delete(stateValue);
        return sendText(res, 400, 'Neispravan ili istekao OAuth zahtev.');
      }
      pendingStates.delete(stateValue);
      const cfg = oauthConfig();
      const redirect = `http://localhost:${PORT}/oauth2callback`;
      const body = new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' });
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'OAuth token nije dobijen.');
      const channelData = await googleGet('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', tokenData.access_token);
      const channel = channelData.items?.[0];
      if (!channel) throw new Error('Izabrani nalog nema YouTube kanal.');
      const store = advancedTools.readSecureJson(SECURE_TOKENS_FILE, { channels: [] });
      const previous = store.channels.find(item => item.id === channel.id);
      const item = {
        id: channel.id, label: pending.label, title: channel.snippet?.title || pending.label, customUrl: channel.snippet?.customUrl || '',
        thumbnail: channel.snippet?.thumbnails?.default?.url || '', subscriberCount: Number(channel.statistics?.subscriberCount || 0),
        videoCount: Number(channel.statistics?.videoCount || 0), viewCount: Number(channel.statistics?.viewCount || 0),
        accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token || previous?.refreshToken || '',
        expiresAt: Date.now() + Number(tokenData.expires_in || 3600) * 1000, connectedAt: new Date().toISOString()
      };
      store.channels = store.channels.filter(existing => existing.id !== item.id);
      store.channels.push(item);
      advancedTools.writeSecureJson(SECURE_TOKENS_FILE, store);
      return sendText(res, 200, '<h2>YouTube kanal je povezan.</h2><p>Vrati se u Muzički Spot Studio. Ovaj prozor možeš zatvoriti.</p><script>setTimeout(()=>window.close(),2500)</script>', 'text/html; charset=utf-8');
    }
    if (pathname === '/api/youtube/channels' && req.method === 'GET') {
      if (!requireLocal(req, res)) return;
      const store = advancedTools.readSecureJson(SECURE_TOKENS_FILE, { channels: [] });
      return sendJson(res, 200, { channels: store.channels.map(({ accessToken, refreshToken, expiresAt, ...safe }) => safe) });
    }
    if (pathname.startsWith('/api/youtube/channels/') && req.method === 'DELETE') {
      if (!requireLocal(req, res)) return;
      const id = pathname.split('/').pop();
      const store = advancedTools.readSecureJson(SECURE_TOKENS_FILE, { channels: [] });
      store.channels = store.channels.filter(item => item.id !== id);
      advancedTools.writeSecureJson(SECURE_TOKENS_FILE, store);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/youtube/analyze' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const { channelId, days = 90 } = await readBody(req);
      const { item, token } = await tokenFor(channelId);
      const end = new Date();
      const start = new Date(end.getTime() - Number(days) * 86400000);
      const date = value => value.toISOString().slice(0, 10);
      const query = new URLSearchParams({ ids: `channel==${channelId}`, startDate: date(start), endDate: date(end), metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained', dimensions: 'video', sort: '-views', maxResults: '200' });
      const report = await googleGet(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, token);
      const headers = (report.columnHeaders || []).map(column => column.name);
      const rows = (report.rows || []).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
      const ids = rows.map(row => row.video).filter(Boolean);
      const metadata = [];
      for (let index = 0; index < ids.length; index += 50) {
        const part = ids.slice(index, index + 50).join(',');
        const data = await googleGet(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(part)}`, token);
        metadata.push(...(data.items || []));
      }
      const map = new Map(metadata.map(video => [video.id, video]));
      const videos = rows.map(row => {
        const video = map.get(row.video) || {};
        return { id: row.video, title: video.snippet?.title || row.video, publishedAt: video.snippet?.publishedAt || '', thumbnail: video.snippet?.thumbnails?.medium?.url || '', duration: durationSeconds(video.contentDetails?.duration), views: Number(row.views || 0), estimatedMinutesWatched: Number(row.estimatedMinutesWatched || 0), averageViewDuration: Number(row.averageViewDuration || 0), averageViewPercentage: Number(row.averageViewPercentage || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0), subscribersGained: Number(row.subscribersGained || 0) };
      });
      return sendJson(res, 200, { channel: { id: item.id, title: item.title }, days: Number(days), videoCount: videos.length, topVideos: videos.slice(0, 20), recommendations: recommendations(videos) });
    }
    if (pathname === '/api/youtube/retention' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const { channelId, videoId, days = 365 } = await readBody(req);
      if (!videoId) return sendJson(res, 400, { error: 'Nedostaje videoId.' });
      const { token } = await tokenFor(channelId);
      const end = new Date();
      const start = new Date(end.getTime() - Number(days) * 86400000);
      const date = value => value.toISOString().slice(0, 10);
      const query = new URLSearchParams({ ids: `channel==${channelId}`, startDate: date(start), endDate: date(end), metrics: 'audienceWatchRatio,relativeRetentionPerformance,startedWatching,stoppedWatching,totalSegmentImpressions', dimensions: 'elapsedVideoTimeRatio', filters: `video==${videoId}`, sort: 'elapsedVideoTimeRatio' });
      const report = await googleGet(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, token);
      const headers = (report.columnHeaders || []).map(column => column.name);
      const points = (report.rows || []).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
      const drops = points.map((point, index) => ({ index, ratio: Number(point.elapsedVideoTimeRatio || 0), watch: Number(point.audienceWatchRatio || 0), stop: Number(point.stoppedWatching || 0) })).sort((a, b) => b.stop - a.stop).slice(0, 5);
      return sendJson(res, 200, { videoId, points, biggestDropPoints: drops });
    }
    if (pathname === '/api/youtube/data-key' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const key = cleanText(body.apiKey);
      if (key.length < 20) return sendJson(res, 400, { error: 'API ključ nije ispravan.' });
      advancedTools.writeSecureJson(SECURE_YOUTUBE_KEY_FILE, { apiKey: key, savedAt: new Date().toISOString() });
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/youtube/trends' && req.method === 'POST') {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const apiKey = cleanText(body.apiKey) || cleanText(advancedTools.readSecureJson(SECURE_YOUTUBE_KEY_FILE, {}).apiKey);
      if (!apiKey) return sendJson(res, 400, { error: 'Dodaj besplatan YouTube Data API ključ.' });
      const queryText = cleanText(body.query || 'tužna ljubavna pesma official music video');
      const region = cleanText(body.region || 'RS').toUpperCase();
      const language = cleanText(body.language || 'sr');
      const days = Math.max(1, Math.min(365, Number(body.days || 90)));
      const maxResults = Math.max(5, Math.min(50, Number(body.maxResults || 25)));
      const publishedAfter = new Date(Date.now() - days * 86400000).toISOString();
      const searchParams = new URLSearchParams({ key: apiKey, part: 'snippet', type: 'video', q: queryText, order: 'viewCount', maxResults: String(maxResults), regionCode: region, relevanceLanguage: language, publishedAfter, videoDefinition: 'high', safeSearch: 'moderate' });
      const search = await googleGet(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
      const ids = (search.items || []).map(item => item.id?.videoId).filter(Boolean);
      if (!ids.length) return sendJson(res, 200, { query: queryText, videos: [], recommendations: ['Nema rezultata za zadati upit.'] });
      const videoParams = new URLSearchParams({ key: apiKey, part: 'snippet,contentDetails,statistics', id: ids.join(',') });
      const data = await googleGet(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`);
      const now = Date.now();
      const videos = (data.items || []).map(video => {
        const published = Date.parse(video.snippet?.publishedAt || '') || now;
        const ageDays = Math.max(1, (now - published) / 86400000);
        const views = Number(video.statistics?.viewCount || 0);
        const likes = Number(video.statistics?.likeCount || 0);
        const comments = Number(video.statistics?.commentCount || 0);
        return { id: video.id, title: video.snippet?.title || '', channelTitle: video.snippet?.channelTitle || '', publishedAt: video.snippet?.publishedAt || '', thumbnail: video.snippet?.thumbnails?.medium?.url || '', duration: durationSeconds(video.contentDetails?.duration), views, likes, comments, ageDays: Math.round(ageDays * 10) / 10, viewsPerDay: Math.round(views / ageDays), engagementRate: views ? ((likes + comments) / views) * 100 : 0 };
      }).sort((a, b) => b.viewsPerDay - a.viewsPerDay);
      return sendJson(res, 200, { query: queryText, region, language, days, analyzedAt: new Date().toISOString(), videos, recommendations: publicTrendRecommendations(videos), limits: 'Analiza koristi javne metapodatke. Tuđi CTR i retention nisu javno dostupni.' });
    }

    // Statički interfejs i lokalni fajlovi nikada se ne izlažu kroz javni tunel.
    if (!isLocalRequest(req)) return sendText(res, 404, 'Fajl nije pronađen.');

    // Static files.
    const urlPath = pathname === '/' ? '/index.html' : pathname;
    const file = path.normalize(path.join(ROOT, urlPath));
    const relativeFile = path.relative(ROOT, file);
    if (!relativeFile || relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
      if (relativeFile) return sendText(res, 403, 'Zabranjena putanja.');
    }
    fs.readFile(file, (error, data) => {
      if (error) return sendText(res, 404, 'Fajl nije pronađen.');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'translator=(self), language-detector=(self)' });
      res.end(data);
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, Number(error.statusCode) || 500, { error: error.message });
    else res.end();
  }
});


function spawnAndForget(executable, args = []) {
  try {
    const child = childProcess.spawn(executable, args, {
      cwd: ROOT_DIR,
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    });
    child.unref();
    return true;
  } catch (error) {
    console.error(`[BROWSER] ${executable} nije pokrenut: ${error.message}`);
    return false;
  }
}

function browserExecutableCandidates() {
  if (process.platform !== 'win32') return [];
  const env = process.env;
  return [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Mozilla Firefox', 'firefox.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Mozilla Firefox', 'firefox.exe')
  ].filter(Boolean).filter(candidate => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
}

async function waitForBrowserConnection(milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (browserHasConnected || activeBrowserSessionCount() > 0) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return browserHasConnected || activeBrowserSessionCount() > 0;
}

async function openStudioBrowser() {
  if (String(process.env.MSS_SKIP_BROWSER || '') === '1') return;
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`[BROWSER] Otvaram ${url}`);

  if (process.platform !== 'win32') {
    spawnAndForget('xdg-open', [url]);
    return;
  }

  // Windows Shell: najpouzdaniji način da se URL otvori u podrazumevanom browseru.
  spawnAndForget('explorer.exe', [url]);
  if (await waitForBrowserConnection(6000)) {
    console.log('[BROWSER] Studio je otvoren preko Windows Explorer Shell-a.');
    return;
  }

  // Rezerva 1: Windows URL handler.
  spawnAndForget('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
  if (await waitForBrowserConnection(5000)) {
    console.log('[BROWSER] Studio je otvoren preko Windows URL handlera.');
    return;
  }

  // Rezerva 2: direktno pokretanje instaliranog browsera.
  for (const executable of browserExecutableCandidates()) {
    spawnAndForget(executable, ['--new-window', url]);
    if (await waitForBrowserConnection(4500)) {
      console.log(`[BROWSER] Studio je otvoren: ${executable}`);
      return;
    }
  }

  // Rezerva 3: PowerShell ShellExecute.
  spawnAndForget('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-Command', `Start-Process '${url.replace(/'/g, "''")}'`
  ]);
  if (await waitForBrowserConnection(5000)) {
    console.log('[BROWSER] Studio je otvoren preko PowerShell-a.');
    return;
  }

  console.error('============================================================');
  console.error('BROWSER NIJE AUTOMATSKI OTVOREN. PROGRAM I DALJE RADI.');
  console.error(`U browser adresu nalepi: ${url}`);
  console.error('============================================================');
}

function startBackgroundServices() {
  try {
    const oldPid = readPid(BACKGROUND_PID_FILE);
    if (oldPid) killProcessTree(oldPid);
    const outFd = fs.openSync(BACKGROUND_LOG_FILE, 'a');
    const errFd = fs.openSync(BACKGROUND_LOG_FILE, 'a');
    const child = childProcess.spawn(process.execPath, [BACKGROUND_WORKER_JS], {
      cwd: __dirname,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', outFd, errFd],
      env: { ...process.env, MSS_START_TUNNEL: 'off' }
    });
    child.unref();
    fs.closeSync(outFd);
    fs.closeSync(errFd);
    fs.writeFileSync(BACKGROUND_PID_FILE, String(child.pid), 'utf8');
    console.log('[POZADINA] ComfyUI provera je pokrenuta. Korak 3 koristi lokalni ChatGPT Plus browser most; javni tunel se ne pokreće.');
  } catch (error) {
    console.error(`[POZADINA] Nije pokrenuta: ${error.message}`);
  }
}

server.on('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`GRESKA: Port ${PORT} već koristi stara kopija programa.`);
    console.error('Zatvori stare crne prozore ili restartuj računar, pa ponovo pokreni program.');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('============================================================');
  console.log(`Muzički Spot Studio FREE ${VERSION} radi na http://127.0.0.1:${PORT}/`);
  console.log('Program radi lokalno u pozadini.');
  console.log('Za potpuno gašenje koristi dugme ZATVORI PROGRAM u gornjem delu Studija.');
  console.log('============================================================');
  try { fs.writeFileSync(SERVER_PID_FILE, String(process.pid), 'utf8'); } catch {}
  try { fs.writeFileSync(SERVER_PORT_FILE, String(PORT), 'utf8'); } catch {}
  if (String(process.env.MSS_SKIP_BACKGROUND || '') !== '1' && options.skipBackground !== true) startBackgroundServices();
  if (options.skipBrowser !== true) {
    setTimeout(() => { openStudioBrowser().catch(error => console.error(`[BROWSER] ${error.message}`)); }, 350);
  }
});

  return { server, port: PORT, url: `http://127.0.0.1:${PORT}/`, dataDir: DATA_DIR, stop: shutdownApplication };
}

module.exports = { startServer };

if (require.main === module) {
  startServer();
}
