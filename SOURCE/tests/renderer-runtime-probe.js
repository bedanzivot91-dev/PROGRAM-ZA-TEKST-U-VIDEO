'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { startServerProcess } = require('../desktop/server-controller');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-renderer-runtime-'));
const dataDir = path.join(temp, 'data');
const logDir = path.join(temp, 'logs');

let server = null;
let win = null;
let phase = 'bootstrap';
let finished = false;
const hardErrors = [];

function mark(next) {
  phase = next;
  console.log(`[PHASE] ${next}`);
}
function fail(message) { throw new Error(message); }
function timeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout posle ${ms}ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

async function waitFor(predicateSource, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await win.webContents.executeJavaScript(predicateSource, true);
      if (value) return value;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return null;
}

function summarizeCoverage(entries) {
  const wanted = ['app.js', 'boot.js', 'completion-ui.js', 'workflow-tools-ui.js'];
  const result = {};
  for (const name of wanted) {
    const entry = entries.find(item => String(item.url || '').endsWith(`/${name}`));
    if (!entry) { result[name] = { loaded:false, functions:0, executed:0 }; continue; }
    const functions = Array.isArray(entry.functions) ? entry.functions : [];
    const executed = functions.filter(fn => (fn.ranges || []).some(range => Number(range.count || 0) > 0)).length;
    result[name] = { loaded:true, functions:functions.length, executed };
  }
  return result;
}

async function cleanup(code) {
  if (finished) return;
  finished = true;
  mark(`cleanup(code=${code})`);
  try { await timeout(win?.webContents?.debugger?.sendCommand('Profiler.stopPreciseCoverage') || Promise.resolve(), 1500, 'Profiler.stopPreciseCoverage'); } catch (_) {}
  try { if (win?.webContents?.debugger?.isAttached()) win.webContents.debugger.detach(); } catch (_) {}
  try { win?.destroy(); } catch (_) {}
  try { await timeout(server?.stop?.() || Promise.resolve(), 6000, 'server.stop'); } catch (error) {
    console.error(`[WARN] server cleanup: ${error.message}`);
    try { server?.child?.kill?.(); } catch (_) {}
  }
  try { fs.rmSync(temp, { recursive:true, force:true }); } catch (_) {}
  console.log(`[EXIT] renderer probe code=${code}`);
  process.exitCode = code;
  app.exit(code);
}

const watchdog = setTimeout(() => {
  console.error(`[FAIL] Renderer watchdog istekao u fazi: ${phase}`);
  cleanup(124).catch(() => app.exit(124));
}, 70000);

async function run() {
  mark('app.whenReady');
  await timeout(app.whenReady(), 15000, 'app.whenReady');

  mark('startServerProcess');
  server = await timeout(startServerProcess({
    electronExecPath: process.execPath,
    programDir: PROGRAM,
    dataDir,
    logDir,
    onLog: line => console.log(line)
  }), 52000, 'startServerProcess');
  console.log(`[OK] server started: ${server.url}`);

  mark('create BrowserWindow');
  win = new BrowserWindow({
    show:false,
    width:1440,
    height:900,
    webPreferences:{
      preload:path.join(ROOT, 'desktop', 'preload.js'),
      sandbox:true,
      contextIsolation:true,
      nodeIntegration:false,
      webSecurity:true,
      allowRunningInsecureContent:false,
      spellcheck:false
    }
  });

  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame !== false) hardErrors.push(`did-fail-load ${code}: ${description} (${validatedURL || ''})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => hardErrors.push(`render-process-gone: ${details?.reason || 'unknown'}`));
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const text = String(message || '');
    if (level >= 3 || /uncaught|referenceerror|typeerror|syntaxerror|nije učitan|preload/i.test(text)) hardErrors.push(`console[${level}] ${text} (${sourceId || ''}:${line || 0})`);
  });

  // Chromium Profiler ume da visi ako se uključi odmah nakon kreiranja praznog
  // BrowserWindow-a, pre nego što renderer target ima učitan dokument. Prvo učitavamo
  // about:blank, tek onda vezujemo DevTools protokol, pa potom učitavamo stvarni Studio.
  mark('prime renderer target');
  await timeout(win.loadURL('about:blank'), 10000, 'BrowserWindow.loadURL about:blank');
  await timeout(win.webContents.executeJavaScript('document.readyState', true), 3000, 'about:blank readyState');

  mark('attach Chromium Profiler');
  try {
    win.webContents.debugger.attach('1.3');
    await timeout(win.webContents.debugger.sendCommand('Profiler.enable'), 8000, 'Profiler.enable');
    await timeout(win.webContents.debugger.sendCommand('Profiler.startPreciseCoverage', { callCount:true, detailed:true }), 8000, 'Profiler.startPreciseCoverage');
  } catch (error) { fail(`Chromium Profiler nije mogao da se uključi: ${error.message}`); }

  mark('loadURL');
  await timeout(win.loadURL(server.url), 20000, 'BrowserWindow.loadURL');

  mark('wait UI mount');
  const mounted = await waitFor(`(() => document.readyState === 'complete' && document.getElementById('mss-completion-launcher') && document.getElementById('mss-workflow-launcher'))()`);
  if (!mounted) fail('Renderer nije montirao completion/workflow UI u roku.');

  mark('exercise live DOM, preload and API');
  const live = await timeout(win.webContents.executeJavaScript(`(async () => {
    const healthResponse = await fetch('/health', { cache:'no-store' });
    const health = await healthResponse.json();
    const completion = document.getElementById('mss-completion-launcher');
    const workflow = document.getElementById('mss-workflow-launcher');
    completion.click(); workflow.click();
    await new Promise(resolve => setTimeout(resolve, 600));
    const completionPanel = document.getElementById('mss-completion-panel');
    const workflowPanel = document.getElementById('mss-workflow-panel');
    return {
      readyState:document.readyState,
      healthOk:Boolean(health?.ok),
      healthVersion:health?.version || '',
      desktopBridge:Boolean(window.mssDesktop),
      desktopIsElectron:Boolean(window.mssDesktop?.isElectron),
      desktopAppVersion:String(window.mssDesktop?.appVersion || ''),
      desktopPlatform:String(window.mssDesktop?.platform || ''),
      browserClientId:String(window.__MSS_BROWSER_CLIENT_ID__ || ''),
      completionMounted:Boolean(completion), workflowMounted:Boolean(workflow),
      completionOpen:Boolean(completionPanel?.classList.contains('open')), workflowOpen:Boolean(workflowPanel?.classList.contains('open')),
      completionProjectList:Boolean(document.getElementById('mss-cu-projects')), workflowProjectSelect:Boolean(document.getElementById('mss-workflow-project')),
      dynamicScripts:{ completion:Boolean(document.querySelector('script[data-mss-completion-ui]')), workflow:Boolean(document.querySelector('script[data-mss-workflow-tools-ui]')) },
      buttonCount:document.querySelectorAll('button').length
    };
  })()`, true), 10000, 'renderer executeJavaScript');

  if (live.readyState !== 'complete') fail(`Renderer readyState=${live.readyState}`);
  if (!live.healthOk) fail('Renderer fetch /health nije vratio ok=true.');
  if (!/^15\.6$/.test(live.healthVersion)) fail(`Renderer vidi neočekivanu server verziju ${live.healthVersion}.`);
  if (!live.desktopBridge || !live.desktopIsElectron) fail('Sandboxed preload nije izložio window.mssDesktop most.');
  if (live.desktopAppVersion !== '15.6.1') fail(`Preload appVersion=${live.desktopAppVersion || 'prazno'}, očekivano 15.6.1.`);
  if (!live.desktopPlatform) fail('Preload nije izložio desktop platformu.');
  if (!live.browserClientId) fail('boot.js nije postavio __MSS_BROWSER_CLIENT_ID__.');
  if (!live.completionMounted || !live.workflowMounted) fail('Novi UI launcheri nisu montirani.');
  if (!live.completionOpen || !live.workflowOpen) fail('Klik na UI launchere nije otvorio oba panela.');
  if (!live.completionProjectList || !live.workflowProjectSelect) fail('Ključne kontrole novih panela nisu prisutne u živom DOM-u.');
  if (!live.dynamicScripts.completion || !live.dynamicScripts.workflow) fail('boot.js nije dinamički registrovao oba nova UI skripta.');
  if (live.buttonCount < 10) fail(`Neočekivano malo UI dugmadi u živom DOM-u: ${live.buttonCount}`);

  mark('take Chromium coverage');
  const precise = await timeout(win.webContents.debugger.sendCommand('Profiler.takePreciseCoverage'), 8000, 'Profiler.takePreciseCoverage');
  const coverage = summarizeCoverage(precise?.result || []);
  for (const [name, info] of Object.entries(coverage)) {
    if (!info.loaded) fail(`${name} nije učitan u Chromium rendereru.`);
    if (info.functions > 0 && info.executed === 0) fail(`${name} je učitan, ali nijedna funkcija nije izvršena.`);
  }

  const serious = [...new Set(hardErrors)].filter(text => !/favicon\.ico/i.test(text));
  if (serious.length) fail(`Renderer je prijavio ozbiljne greške:\n${serious.join('\n')}`);

  console.log('== Chromium renderer runtime probe ==');
  console.log(`[OK] Live DOM/preload: ${JSON.stringify(live)}`);
  console.log(`[OK] Precise coverage: ${JSON.stringify(coverage)}`);
  console.log('[OK] Nema renderer crash/load/preload/uncaught JS grešaka u probnom toku.');
}

run().then(async () => {
  clearTimeout(watchdog);
  await cleanup(0);
}).catch(async error => {
  clearTimeout(watchdog);
  console.error(`[FAIL] faza=${phase}: ${error.stack || error.message}`);
  await cleanup(1);
});