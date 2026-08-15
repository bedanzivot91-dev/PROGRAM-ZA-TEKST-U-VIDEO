'use strict';

const fs = require('fs');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const PORT_RANGE_START = 4180;
const PORT_RANGE_END = 4239;
const APP_NAME = 'Muzički Spot Studio FREE';
const APP_VERSION = '15.6';

function requestHealth(port, timeoutMs = 450) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: timeoutMs, agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (body.length < 100000) body += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function postLocal(port, pathname, timeoutMs = 2000) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'POST', timeout: timeoutMs }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function portIsFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

async function findFreePort() {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
    if (await portIsFree(port)) return port;
  }
  return 0;
}

async function findRunningStudio() {
  const ports = Array.from({ length: PORT_RANGE_END - PORT_RANGE_START + 1 }, (_, i) => PORT_RANGE_START + i);
  const results = await Promise.all(ports.map(async port => ({ port, health: await requestHealth(port, 250) })));
  return results.find(item => item.health?.ok && item.health?.app === APP_NAME) || null;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Starts server.js as its own child process using the Electron binary run as plain Node
 * (ELECTRON_RUN_AS_NODE=1), so the end user never needs a separate Node.js install.
 * server.js is intentionally NOT require()-d in-process: it registers uncaughtException/
 * unhandledRejection handlers that call process.exit(), which would kill the whole
 * Electron GUI process if loaded in-process instead of as a subprocess.
 */
async function startServerProcess({ electronExecPath, programDir, dataDir, logDir, onLog }) {
  const existing = await findRunningStudio();
  if (existing) {
    return { port: existing.port, url: `http://127.0.0.1:${existing.port}/`, child: null, alreadyRunning: true, stop: async () => {} };
  }

  const port = await findFreePort();
  if (!port) throw new Error('Nije pronađen slobodan lokalni port od 4180 do 4239. Zatvori druge programe i pokušaj ponovo.');

  fs.mkdirSync(logDir, { recursive: true });
  const serverFile = path.join(programDir, 'server.js');
  if (!fs.existsSync(serverFile)) throw new Error(`Nedostaje server.js: ${serverFile}`);

  const instanceId = crypto.randomBytes(16).toString('hex');
  const outFd = fs.openSync(path.join(logDir, 'server-stdout.log'), 'a');
  const errFd = fs.openSync(path.join(logDir, 'server-stderr.log'), 'a');

  const child = childProcess.spawn(electronExecPath, [serverFile], {
    cwd: programDir,
    windowsHide: true,
    stdio: ['ignore', outFd, errFd, 'ipc'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      MSS_DATA_DIR: dataDir,
      MSS_INSTANCE_ID: instanceId,
      MSS_SKIP_BROWSER: '1'
    }
  });
  try { fs.closeSync(outFd); } catch {}
  try { fs.closeSync(errFd); } catch {}

  child.on('exit', (code, signal) => { onLog?.(`[server] proces završen (code=${code}, signal=${signal})`); });
  child.on('error', error => { onLog?.(`[server] greška pokretanja: ${error.message}`); });

  // Prvi put posle instalacije/raspakivanja, Windows Defender/antivirus često skenira SVEŽE
  // fajlove (i sam proces koji pokreće drugi proces) pre nego što dozvoli izvršavanje — to može
  // trajati i pola minuta. 45s (150 x 300ms) daje toj proveri vremena umesto lažnog "nije uspelo".
  let health = null;
  for (let i = 0; i < 150; i += 1) {
    await delay(300);
    health = await requestHealth(port, 500);
    if (health?.ok) break;
    if (child.exitCode !== null) break;
  }
  if (!health?.ok) {
    const stillAlive = child.exitCode === null;
    const hint = stillAlive
      ? 'Proces i dalje radi — najverovatnije ga antivirus/Windows Defender skenira jer je fajl nov. Sačekaj još malo i pokreni program ponovo; ako se ponavlja, dodaj folder programa u izuzetke antivirusa.'
      : `Proces se ugasio pre nego što je server odgovorio (kod izlaza: ${child.exitCode}).`;
    throw new Error(`Lokalni server nije odgovorio u roku od 45 sekundi (port ${port}). ${hint} Log: ${path.join(logDir, 'server-stderr.log')}`);
  }
  if (health.version !== APP_VERSION) {
    onLog?.(`[server] UPOZORENJE: server vraća verziju ${health.version || 'nepoznato'}, očekivano ${APP_VERSION}.`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const status = await postLocal(port, '/api/app/shutdown', 2000);
    if (status !== 200) {
      onLog?.('[server] graceful shutdown nije odgovorio, prisilno gašenje procesa.');
      try { child.kill(); } catch {}
      return;
    }
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }

  return { port, url: `http://127.0.0.1:${port}/`, child, instanceId, alreadyRunning: false, stop };
}

module.exports = { startServerProcess, findRunningStudio, findFreePort, requestHealth, PORT_RANGE_START, PORT_RANGE_END };
