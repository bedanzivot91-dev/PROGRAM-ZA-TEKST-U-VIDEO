'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');
const EventEmitter = require('events');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const pkg = require(path.join(ROOT, 'package.json'));
const protocolVersion = pkg.version.split('.').slice(0, 2).join('.');
const { findFreePort, requestHealth, startServerProcess } = require(path.join(ROOT, 'desktop', 'server-controller.js'));
const { loadWindowState, saveWindowState, trackWindowState } = require(path.join(ROOT, 'desktop', 'window-state.js'));

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  [OK] ${message}`);
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function post(port, pathname) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'POST', timeout: 3000 }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}
async function waitForStudio(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let port = 4180; port <= 4239; port += 1) {
      const health = await requestHealth(port, 150);
      if (health?.ok && health?.app === 'Muzički Spot Studio FREE') return { port, health };
    }
    await delay(200);
  }
  return null;
}
function spawnNode(file, env = {}, timeoutMs = 20000) {
  return childProcess.spawnSync(process.execPath, [file], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs
  });
}

async function testWindowState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-window-state-'));
  const initial = loadWindowState(dir);
  ok(initial.width === 1440 && initial.height === 900, 'window-state vraća bezbedan default');

  class FakeWindow extends EventEmitter {
    constructor() { super(); this.max = false; this.bounds = { x: 10, y: 20, width: 1200, height: 760 }; }
    isMaximized() { return this.max; }
    getNormalBounds() { return this.bounds; }
    getBounds() { return this.bounds; }
  }
  const win = new FakeWindow();
  saveWindowState(dir, win);
  const saved = loadWindowState(dir);
  ok(saved.width === 1200 && saved.height === 760 && saved.x === 10, 'window-state stvarno čuva i učitava granice prozora');
  trackWindowState(dir, win);
  win.bounds.width = 1300;
  win.emit('resize');
  await delay(450);
  ok(loadWindowState(dir).width === 1300, 'trackWindowState izvršava odloženo čuvanje posle resize događaja');
  win.bounds.height = 800;
  win.emit('close');
  ok(loadWindowState(dir).height === 800, 'trackWindowState čuva stanje pri zatvaranju');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testServerController() {
  const port = await findFreePort();
  ok(port >= 4180 && port <= 4239, 'server-controller nalazi slobodan dozvoljeni port');
  ok(await requestHealth(port, 100) === null, 'requestHealth bez servera bezbedno vraća null');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-server-controller-'));
  const dataDir = path.join(temp, 'data');
  const logDir = path.join(temp, 'logs');
  const handle = await startServerProcess({
    electronExecPath: process.execPath,
    programDir: PROGRAM,
    dataDir,
    logDir,
    onLog: () => {}
  });
  ok(handle && handle.port >= 4180 && handle.url.startsWith('http://127.0.0.1:'), 'server-controller stvarno pokreće server proces');
  const health = await requestHealth(handle.port, 1000);
  ok(health?.ok === true && health.version === protocolVersion, 'server-controller pokrenuti server vraća ispravnu protocol verziju');
  await handle.stop();
  await delay(250);
  ok(await requestHealth(handle.port, 150) === null, 'server-controller stop stvarno gasi server');
  fs.rmSync(temp, { recursive: true, force: true });
}

async function testPreload() {
  const preload = path.join(ROOT, 'desktop', 'preload.js');
  let exposed = null;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { exposed = { name, api }; } },
        ipcRenderer: { invoke: async channel => ({ channel, ok: true }) }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(preload)];
    require(preload);
  } finally {
    Module._load = originalLoad;
  }
  ok(exposed?.name === 'mssDesktop', 'preload registruje samo mssDesktop most');
  ok(exposed.api.appVersion === pkg.version, 'preload verzija dolazi iz package.json i tačno je usklađena');
  const diagnostics = await exposed.api.getDiagnostics();
  ok(diagnostics?.channel === 'mss:get-diagnostics', 'preload getDiagnostics poziva tačan IPC kanal');
}

async function testBackgroundWorker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-background-worker-'));
  const free = await findFreePort();
  const result = spawnNode(path.join(PROGRAM, 'background-worker.js'), {
    MSS_DATA_DIR: temp,
    PORT: String(free),
    MSS_START_TUNNEL: 'off'
  }, 10000);
  ok(!result.error && result.status === 0, `background-worker se kontrolisano pokreće i završava bez servera (status=${result.status})`);
  const statusFile = path.join(temp, 'tunnel-status.json');
  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  ok(status.version === protocolVersion, `background-worker status verzija je ${protocolVersion}, ne zastarela vrednost`);
  ok(status.stage === 'error' && /server nije dostupan/i.test(status.message || ''), 'background-worker tačno prijavljuje nedostupan lokalni server');
  fs.rmSync(temp, { recursive: true, force: true });
}

async function testLauncher() {
  const dataDir = path.join(PROGRAM, 'data');
  const generated = ['server.pid', 'server-port.txt', 'server-instance-id.txt', 'START-LOG.txt', 'server-stdout.log', 'server-stderr.log'];
  const result = spawnNode(path.join(PROGRAM, 'launcher.js'), { MSS_TEST_NO_BROWSER: '1' }, 25000);
  ok(!result.error && result.status === 0, `launcher.js stvarno prolazi pokretanje bez browsera (status=${result.status})`);
  const port = Number(fs.readFileSync(path.join(dataDir, 'server-port.txt'), 'utf8').trim());
  const health = await requestHealth(port, 1500);
  ok(health?.ok === true && health.version === protocolVersion, 'launcher je stvarno podigao ispravnu verziju lokalnog servera');
  ok(await post(port, '/api/app/shutdown') === 200, 'launcher server prihvata kontrolisani shutdown');
  await delay(300);
  for (const name of generated) { try { fs.rmSync(path.join(dataDir, name), { force: true }); } catch {} }
  try { fs.rmSync(path.resolve(PROGRAM, '..', 'DIJAGNOSTIKA-POKRETANJA.txt'), { force: true }); } catch {}
  try { fs.rmSync(path.resolve(PROGRAM, '..', 'OTVORI PROGRAM.url'), { force: true }); } catch {}
}

async function testElectronApp() {
  const electronExe = require('electron');
  const child = childProcess.spawn(electronExe, [ROOT, '--disable-gpu'], {
    cwd: ROOT,
    env: { ...process.env, MSS_TEST_NO_BROWSER: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const running = await waitForStudio(30000);
  ok(Boolean(running), `Electron desktop stvarno pokreće lokalni server${running ? ` na portu ${running.port}` : ''}`);
  if (!running) {
    try { child.kill(); } catch {}
    throw new Error(`Electron nije pokrenuo Studio server. ${stderr.slice(-3000)}`);
  }
  ok(running.health.version === protocolVersion, 'Electron desktop koristi ispravnu protocol verziju servera');
  const shutdown = await post(running.port, '/api/app/shutdown');
  ok(shutdown === 200, 'Electron server prima intentional shutdown');
  const exited = await new Promise(resolve => {
    if (child.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), 8000);
    child.once('exit', () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited) { try { child.kill(); } catch {} }
  ok(exited, 'Electron glavni proces se kontrolisano gasi posle server shutdown-a');
}

(async () => {
  console.log('== Runtime entrypoint / Windows lifecycle testovi ==');
  await testWindowState();
  await testServerController();
  await testPreload();
  await testBackgroundWorker();
  await testLauncher();
  await testElectronApp();
  console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
})().catch(error => {
  console.error(`\n[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
