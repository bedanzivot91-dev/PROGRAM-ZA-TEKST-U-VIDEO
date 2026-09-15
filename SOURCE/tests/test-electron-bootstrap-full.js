'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const electronExe = require('electron');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHealth(port) {
  return new Promise(resolve => {
    const req = http.get({ hostname:'127.0.0.1', port, path:'/health', timeout:250 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function postShutdown(port) {
  return new Promise(resolve => {
    const req = http.request({ hostname:'127.0.0.1', port, path:'/api/app/shutdown', method:'POST', timeout:3000 }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function waitForStudio(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let port = 4180; port <= 4239; port += 1) {
      const health = await getHealth(port);
      if (health?.ok && health?.app === 'Muzički Spot Studio FREE') return { port, health };
    }
    await delay(200);
  }
  return null;
}

(async () => {
  console.log('== Full Electron bootstrap runtime test ==');
  const env = { ...process.env, MSS_TEST_NO_BROWSER:'1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = childProcess.spawn(electronExe, [ROOT, '--disable-gpu'], {
    cwd:ROOT,
    env,
    windowsHide:true,
    stdio:['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  const running = await waitForStudio();
  assert.ok(running, `Electron nije podigao Studio server. ${stderr.slice(-2000)}`);
  console.log(`[OK] server je živ na portu ${running.port}`);

  // Health endpoint postaje spreman pre kraja bootstrap-a. Ovaj period namerno ostavlja
  // stvarni BrowserWindow da završi loadURL(), preload, renderer i setupAutoUpdate().
  await delay(6500);
  assert.strictEqual(child.exitCode, null, `Electron se ugasio tokom bootstrap-a. ${stdout.slice(-2000)} ${stderr.slice(-2000)}`);
  assert.doesNotMatch(stdout + '\n' + stderr, /uncaughtException|unhandledRejection|render-process-gone/i, 'Electron bootstrap je prijavio ozbiljnu runtime grešku.');
  console.log('[OK] puni desktop bootstrap je ostao stabilan 6.5s posle server readiness-a');

  const status = await postShutdown(running.port);
  assert.strictEqual(status, 200, 'Kontrolisani shutdown nije prihvaćen.');

  const exited = await new Promise(resolve => {
    if (child.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), 10000);
    child.once('exit', () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited) { try { child.kill(); } catch (_) {} }
  assert.ok(exited, 'Electron se nije ugasio posle kontrolisanog shutdown-a.');
  console.log('[OK] puni Electron bootstrap i gašenje su prošli.');
})().catch(error => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
