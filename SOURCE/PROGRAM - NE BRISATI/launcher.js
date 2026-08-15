'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const childProcess = require('child_process');

const VERSION = '15.6';
const PROGRAM_DIR = __dirname;
const ROOT_DIR = path.resolve(PROGRAM_DIR, '..');
const DATA_DIR = path.join(PROGRAM_DIR, 'data');
const SERVER_FILE = path.join(PROGRAM_DIR, 'server.js');
const PUBLIC_INDEX = path.join(PROGRAM_DIR, 'public', 'index.html');
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const PORT_FILE = path.join(DATA_DIR, 'server-port.txt');
const INSTANCE_FILE = path.join(DATA_DIR, 'server-instance-id.txt');
const START_LOG = path.join(DATA_DIR, 'START-LOG.txt');
const DIAGNOSTICS_FILE = path.join(ROOT_DIR, 'DIJAGNOSTIKA-POKRETANJA.txt');
const SERVER_STDOUT = path.join(DATA_DIR, 'server-stdout.log');
const SERVER_STDERR = path.join(DATA_DIR, 'server-stderr.log');
const URL_FILE = path.join(ROOT_DIR, 'OTVORI PROGRAM.url');
const NO_BROWSER = process.argv.includes('--no-browser') || process.env.MSS_TEST_NO_BROWSER === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });

function stamp() { return new Date().toISOString().replace('T', ' ').replace('Z', ''); }
function log(message) {
  const line = `[${stamp()}] ${message}`;
  console.log(message);
  try { fs.appendFileSync(START_LOG, `${line}\r\n`, 'utf8'); } catch {}
}
function writeDiagnostics(error, extra = {}) {
  const lines = [
    'MUZIČKI SPOT STUDIO — DIJAGNOSTIKA POKRETANJA',
    `Vreme: ${new Date().toISOString()}`,
    `Verzija: ${VERSION}`,
    `Platforma: ${process.platform} ${process.arch}`,
    `Node.js: ${process.version}`,
    `Node putanja: ${process.execPath}`,
    `Glavni folder: ${ROOT_DIR}`,
    `Programski folder: ${PROGRAM_DIR}`,
    `server.js postoji: ${fs.existsSync(SERVER_FILE)}`,
    `index.html postoji: ${fs.existsSync(PUBLIC_INDEX)}`,
    `Greška: ${error?.stack || error?.message || String(error || 'nema')}`,
    ...Object.entries(extra).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`),
    '',
    'Poslednje poruke pokretanja:',
    safeTail(START_LOG, 50),
    '',
    'Poslednje server greške:',
    safeTail(SERVER_STDERR, 50),
    '',
    'Poslednje server poruke:',
    safeTail(SERVER_STDOUT, 50)
  ];
  try { fs.writeFileSync(DIAGNOSTICS_FILE, lines.join('\r\n'), 'utf8'); } catch {}
}
function safeTail(file, maxLines = 30) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-maxLines).join('\r\n'); } catch { return '(nema loga)'; }
}
function readInteger(file) {
  try {
    const value = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch { return 0; }
}
function readText(file) { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; } }
function writeText(file, value) { fs.writeFileSync(file, String(value), 'utf8'); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function requestHealth(port, timeoutMs = 450) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: timeoutMs, agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (body.length < 100000) body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
function portIsFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}
async function findRunningStudio() {
  const preferred = readInteger(PORT_FILE);
  const ports = [...new Set([preferred, ...Array.from({ length: 40 }, (_, i) => 4180 + i)].filter(Boolean))];
  const results = await Promise.all(ports.map(async port => ({ port, health: await requestHealth(port, 300) })));
  return results.find(item => item.health?.ok && item.health?.app === 'Muzički Spot Studio FREE' && item.health?.version === VERSION) || null;
}
async function findFreePort() {
  for (let port = 4180; port <= 4239; port += 1) {
    if (await portIsFree(port)) return port;
  }
  return 0;
}
function rotateLog(file, maxBytes = 2 * 1024 * 1024) {
  try {
    if (fs.statSync(file).size <= maxBytes) return;
    const old = `${file}.old`;
    try { fs.rmSync(old, { force: true }); } catch {}
    fs.renameSync(file, old);
  } catch {}
}
function spawnDetachedServer(port, instanceId) {
  rotateLog(SERVER_STDOUT);
  rotateLog(SERVER_STDERR);
  const outFd = fs.openSync(SERVER_STDOUT, 'a');
  const errFd = fs.openSync(SERVER_STDERR, 'a');
  let child;
  try {
    child = childProcess.spawn(process.execPath, [SERVER_FILE], {
      cwd: PROGRAM_DIR,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', outFd, errFd],
      env: {
        ...process.env,
        PORT: String(port),
        MSS_SKIP_BROWSER: '1',
        MSS_INSTANCE_ID: instanceId
      }
    });
    child.unref();
    return child;
  } finally {
    try { fs.closeSync(outFd); } catch {}
    try { fs.closeSync(errFd); } catch {}
  }
}
function createUrlFile(url) {
  try { fs.writeFileSync(URL_FILE, `[InternetShortcut]\r\nURL=${url}\r\n`, 'ascii'); } catch {}
}
function spawnQuiet(command, args) {
  try {
    const child = childProcess.spawn(command, args, { detached: true, windowsHide: false, stdio: 'ignore' });
    child.unref();
    return true;
  } catch { return false; }
}
function openBrowser(url) {
  createUrlFile(url);
  if (NO_BROWSER) return true;
  if (process.platform === 'win32') {
    if (spawnQuiet('explorer.exe', [url])) return true;
    if (spawnQuiet('rundll32.exe', ['url.dll,FileProtocolHandler', url])) return true;
    if (spawnQuiet('cmd.exe', ['/d', '/s', '/c', 'start', '', url])) return true;
  } else if (process.platform === 'darwin') {
    if (spawnQuiet('open', [url])) return true;
  } else if (spawnQuiet('xdg-open', [url])) return true;
  return false;
}
async function verifyFiles() {
  const missing = [SERVER_FILE, PUBLIC_INDEX, path.join(PROGRAM_DIR, 'public', 'app.js')].filter(file => !fs.existsSync(file));
  if (missing.length) throw new Error(`Nedostaju programski fajlovi: ${missing.join(', ')}`);
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) throw new Error(`Potreban je Node.js 22+. Pronađen je ${process.version}.`);
}
async function main() {
  try { fs.writeFileSync(START_LOG, `[${stamp()}] NOVO POKRETANJE VERZIJE ${VERSION}\r\n`, 'utf8'); } catch {}
  log(`Muzički Spot Studio ${VERSION} — pokretanje bez komplikovanog PowerShell launchera.`);
  await verifyFiles();
  log(`Node.js je spreman: ${process.version}`);

  const running = await findRunningStudio();
  if (running) {
    const runningInstanceId = running.health?.instanceId || readText(INSTANCE_FILE) || 'existing';
    const url = `http://127.0.0.1:${running.port}/?launch=${encodeURIComponent(runningInstanceId)}`;
    log(`Program već radi. Otvaram ${url}`);
    writeText(PORT_FILE, running.port);
    openBrowser(url);
    writeDiagnostics(null, { status: 'Program je već radio.', url });
    return 0;
  }

  const port = await findFreePort();
  if (!port) throw new Error('Nije pronađen slobodan lokalni port od 4180 do 4239. Restartuj računar i pokušaj ponovo.');
  const instanceId = crypto.randomBytes(16).toString('hex');
  writeText(INSTANCE_FILE, instanceId);
  log(`Pokrećem lokalni server na portu ${port}...`);
  const child = spawnDetachedServer(port, instanceId);
  if (!child?.pid) throw new Error('Windows nije pokrenuo lokalni Node.js server.');
  writeText(PID_FILE, child.pid);
  writeText(PORT_FILE, port);

  let health = null;
  for (let i = 0; i < 60; i += 1) {
    await delay(250);
    health = await requestHealth(port, 500);
    if (health?.ok) break;
    try { process.kill(child.pid, 0); } catch { break; }
  }
  if (!health?.ok) {
    throw new Error(`Server nije odgovorio u roku od 15 sekundi. PID ${child.pid}, port ${port}. ${safeTail(SERVER_STDERR, 8)}`);
  }
  if (health.version !== VERSION) throw new Error(`Pokrenuta je pogrešna verzija servera: ${health.version || 'nepoznata'}.`);

  const url = `http://127.0.0.1:${port}/?launch=${encodeURIComponent(instanceId)}`;
  log(`PROGRAM JE SPREMAN: ${url}`);
  log('Ako se browser ne otvori automatski, dvoklikni fajl „OTVORI PROGRAM.url“.');
  const opened = openBrowser(url);
  writeDiagnostics(null, { status: 'USPEŠNO', url, browserCommandStarted: opened, pid: child.pid, port });
  return 0;
}

main().then(code => process.exitCode = code).catch(error => {
  log(`GREŠKA: ${error.message}`);
  writeDiagnostics(error, { status: 'NEUSPEŠNO' });
  process.exitCode = 1;
});
