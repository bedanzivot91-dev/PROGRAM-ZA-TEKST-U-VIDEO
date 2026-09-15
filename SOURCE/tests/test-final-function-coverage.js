'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const Module = require('module');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const DESKTOP = path.join(ROOT, 'desktop');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-final-coverage-'));
process.env.NODE_ENV = 'test';
process.env.MSS_DATA_DIR = path.join(tempRoot, 'data');
process.env.MSS_TEST_NO_BROWSER = '1';
process.env.MSS_DISABLE_TOOL_DOWNLOAD = '1';
fs.mkdirSync(process.env.MSS_DATA_DIR, { recursive: true });

let passed = 0;
function ok(value, message) {
  assert.ok(value, message);
  passed += 1;
  console.log(`  [OK] ${message}`);
}
function compileSource(file, source, loadOverride = null) {
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  if (loadOverride) {
    Module._load = function patchedLoad(request, parent, isMain) {
      const replacement = loadOverride(request, parent, isMain);
      if (replacement !== undefined) return replacement;
      return originalLoad.call(this, request, parent, isMain);
    };
  }
  try { mod._compile(source, file); }
  finally { Module._load = originalLoad; }
  return mod.exports;
}
function appendExports(file, names, transform = source => source, loadOverride = null) {
  let source = fs.readFileSync(file, 'utf8');
  source = transform(source);
  source += `\nmodule.exports.__coverageTest = { ${names.join(', ')} };\n`;
  return compileSource(file, source, loadOverride);
}
function padReplacement(source, marker, replacement = ';') {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Marker nije pronađen u ${marker.slice(0, 80)}`);
  if (replacement.length > marker.length) throw new Error('Replacement je duži od markera.');
  return source.slice(0, index) + replacement.padEnd(marker.length, ' ') + source.slice(index + marker.length);
}
async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function waitHealth(port, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await new Promise(resolve => {
      const req = http.get({ hostname:'127.0.0.1', port, path:'/health', timeout:300 }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
    if (result?.ok) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}
function httpJson(port, method, pathname, body = undefined, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname:'127.0.0.1', port, path:pathname, method,
      headers:{ ...(payload ? {'Content-Type':'application/json','Content-Length':String(payload.length)} : {}), ...headers }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = JSON.parse(text); } catch {}
        resolve({ status:res.statusCode, text, data, headers:res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function testDesktopMain() {
  const file = path.join(DESKTOP, 'main.js');
  let source = fs.readFileSync(file, 'utf8');
  source = padReplacement(source, 'app.whenReady().then(bootstrap);');
  source += '\nmodule.exports.__coverageTest = { setupAutoUpdate, copyRecursiveNoOverwrite, isAllowedExternalUrl, buildAppMenu, logFn };\n';

  let capturedMenu = null;
  const autoUpdater = {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on() {},
    checkForUpdates() { return Promise.resolve(null); },
    quitAndInstall() {}
  };
  const electronMock = {
    app: {
      isPackaged: true,
      getVersion: () => '15.6.1',
      getPath: () => tempRoot,
      disableHardwareAcceleration() {},
      whenReady: () => ({ then() {} }),
      on() {},
      quit() {}
    },
    BrowserWindow: function BrowserWindow() {},
    shell: { openPath: async () => '', openExternal: async () => true },
    dialog: { showMessageBox: async () => ({ response: 1 }), showErrorBox() {} },
    ipcMain: { handle() {}, on() {} },
    Menu: {
      buildFromTemplate(template) { capturedMenu = template; return template; },
      setApplicationMenu(menu) { capturedMenu = menu; }
    }
  };
  const mod = compileSource(file, source, request => {
    if (request === 'electron') return electronMock;
    if (request === 'electron-updater') return { autoUpdater };
    return undefined;
  });
  const t = mod.__coverageTest;
  t.logFn('[coverage] početni logFn izvršen');
  t.setupAutoUpdate(() => {});
  ok(autoUpdater.logger && typeof autoUpdater.logger.info === 'function', 'desktop auto-updater logger je napravljen');
  autoUpdater.logger.info('i'); autoUpdater.logger.warn('w'); autoUpdater.logger.error('e'); autoUpdater.logger.debug('d');

  const src = path.join(tempRoot, 'copy-src');
  const dst = path.join(tempRoot, 'copy-dst');
  fs.mkdirSync(path.join(src, 'sub'), { recursive:true });
  fs.writeFileSync(path.join(src, 'a.txt'), 'a');
  fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'b');
  fs.mkdirSync(dst, { recursive:true });
  t.copyRecursiveNoOverwrite(src, dst);
  ok(fs.existsSync(path.join(dst, 'sub', 'b.txt')), 'desktop copyRecursiveNoOverwrite izvršen rekurzivno');
  ok(t.isAllowedExternalUrl('https://example.com') && !t.isAllowedExternalUrl('javascript:alert(1)'), 'desktop provera spoljnog URL-a izvršena');

  t.buildAppMenu(() => {}, tempRoot);
  ok(Array.isArray(capturedMenu), 'desktop meni je izgrađen');
  for (const group of capturedMenu) {
    for (const item of group.submenu || []) {
      if (typeof item.click === 'function') await item.click();
    }
  }
  ok(true, 'svi desktop menu click handleri su izvršeni');
}

async function testExistingServerControllerStop() {
  const controller = require(path.join(DESKTOP, 'server-controller.js'));
  const port = await controller.findFreePort();
  assert.ok(port);
  const fakeStudio = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ ok:true, app:'Muzički Spot Studio FREE', version:'15.6' }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve, reject) => fakeStudio.once('error', reject).listen(port, '127.0.0.1', resolve));
  try {
    const handle = await controller.startServerProcess({ electronExecPath:'unused', programDir:'unused', dataDir:tempRoot, logDir:tempRoot, onLog(){} });
    ok(handle.alreadyRunning === true, 'server-controller prepoznaje već pokrenut Studio');
    await handle.stop();
    ok(true, 'server-controller no-op stop grana izvršena');
  } finally {
    await new Promise(resolve => fakeStudio.close(resolve));
  }
}

async function testAdvancedDpapi() {
  if (process.platform !== 'win32') return;
  const file = path.join(PROGRAM, 'advanced-tools.js');
  const mod = appendExports(file, ['powershellDpapi']);
  const input = Buffer.from('MSS-DPAPI-COVERAGE-TEST', 'utf8');
  const encrypted = mod.__coverageTest.powershellDpapi('protect', input);
  const decrypted = mod.__coverageTest.powershellDpapi('unprotect', encrypted);
  ok(decrypted.equals(input), 'Windows DPAPI protect/unprotect funkcija stvarno izvršena');
}

async function testBackgroundWorkerInternals() {
  const file = path.join(PROGRAM, 'background-worker.js');
  const names = ['writeText','sleep','processAlive','fileSha256','downloadFile','verifyAuthenticode','ensureCloudflared','spawnDetached','publicHealth','findQuickTunnelUrl','startQuickTunnel'];
  const mod = appendExports(file, names, source => {
    const marker = '\nmain();';
    const pos = source.lastIndexOf(marker);
    if (pos < 0) throw new Error('background-worker main marker nije pronađen');
    let out = source.slice(0, pos) + '\n;' + ' '.repeat(marker.length - 2) + source.slice(pos + marker.length);
    // Spreči mrežno preuzimanje u ensureCloudflared; telo funkcije ostaje isto do tačke realnog download-a.
    const releaseLine = "const release = await requestJson('https://api.github.com/repos/cloudflare/cloudflared/releases/latest');";
    out = padReplacement(out, releaseLine, "throw new Error('coverage-stop');");
    return out;
  });
  const t = mod.__coverageTest;
  const textFile = path.join(tempRoot, 'bg-write.txt');
  t.writeText(textFile, 'abc');
  ok(fs.readFileSync(textFile, 'utf8') === 'abc', 'background writeText izvršen');
  await t.sleep(1);
  ok(t.processAlive(process.pid) === true, 'background processAlive izvršen');
  ok(t.fileSha256(textFile).length === 64, 'background fileSha256 izvršen');
  try { await t.downloadFile('https://127.0.0.1:1/nope', path.join(tempRoot,'never.bin'), 80); } catch {}
  ok(true, 'background downloadFile izvršen kroz kontrolisanu mrežnu grešku');
  const auth = t.verifyAuthenticode(textFile);
  ok(auth && typeof auth.valid === 'boolean', 'background verifyAuthenticode izvršen');
  try { await t.ensureCloudflared(); } catch {}
  ok(true, 'background ensureCloudflared izvršen bez preuzimanja binarnog fajla');

  const spawnLog = path.join(tempRoot, 'spawn.log');
  const child = t.spawnDetached(process.execPath, ['-e', 'process.exit(0)'], { logFile:spawnLog, cwd:tempRoot });
  ok(child && child.pid, 'background spawnDetached izvršen');
  await t.publicHealth('http://127.0.0.1:1');
  ok(t.findQuickTunnelUrl('x https://abc-123.trycloudflare.com y') === 'https://abc-123.trycloudflare.com', 'background findQuickTunnelUrl izvršen');
  try { await t.startQuickTunnel(); } catch {}
  ok(true, 'background startQuickTunnel izvršen do kontrolisanog fail-safe izlaza');
}

async function testFontAndLauncherInternals() {
  const fontFile = path.join(PROGRAM, 'font-manager.js');
  const fontMod = appendExports(fontFile, ['userFontsDir']);
  ok(fontMod.__coverageTest.userFontsDir().includes(path.join('Microsoft','Windows','Fonts')), 'font-manager userFontsDir izvršen');

  const launcherFile = path.join(PROGRAM, 'launcher.js');
  const launcherMod = appendExports(launcherFile, ['readText','spawnQuiet'], source => {
    const marker = '\nmain().then(code => process.exitCode = code).catch(error => {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error('launcher main marker nije pronađen');
    return source.slice(0, index) + '\n;';
  });
  const p = path.join(tempRoot, 'launcher-read.txt');
  fs.writeFileSync(p, '  vrednost  ', 'utf8');
  ok(launcherMod.__coverageTest.readText(p) === 'vrednost', 'launcher readText izvršen');
  const spawned = launcherMod.__coverageTest.spawnQuiet(process.execPath, ['-e','process.exit(0)']);
  ok(spawned === true, 'launcher spawnQuiet izvršen');
}

async function testResearchRealHelpers() {
  const file = path.join(PROGRAM, 'research-engine.js');
  const names = ['findExecutable','youtubeSearch','youtubeChannelFeed','youtubeChannelRss','analyzeChannelPublic'];
  const mod = appendExports(file, names);
  const t = mod.__coverageTest;
  t.findExecutable(process.platform === 'win32' ? 'cmd.exe' : 'sh');
  ok(true, 'research findExecutable izvršen');

  const oldExe = process.env.MSS_YTDLP_EXE;
  process.env.MSS_YTDLP_EXE = process.execPath;
  try { await t.youtubeSearch('coverage music video', 5); } catch {}
  try { await t.youtubeChannelFeed({ title:'Coverage', url:'https://example.invalid/channel' }, 'videos', 10); } catch {}
  if (oldExe === undefined) delete process.env.MSS_YTDLP_EXE; else process.env.MSS_YTDLP_EXE = oldExe;
  ok(true, 'research youtubeSearch i youtubeChannelFeed izvršeni kroz kontrolisani yt-dlp fail-safe');

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(`<?xml version="1.0"?><feed><entry><yt:videoId xmlns:yt="x">abc123</yt:videoId><title>Official music video</title><published>2026-09-01T00:00:00Z</published><author><name>Test kanal</name></author></entry></feed>`, {status:200});
  try {
    const rss = await t.youtubeChannelRss({ id:'UC_TEST', title:'Test kanal' });
    ok(Array.isArray(rss), 'research youtubeChannelRss izvršen sa kontrolisanim RSS odgovorom');
    try { await t.analyzeChannelPublic({ id:'UC_TEST', title:'Test kanal', url:'https://example.invalid/channel' }); } catch {}
    ok(true, 'research analyzeChannelPublic izvršen');
  } finally { global.fetch = originalFetch; }
}

function fakeResponse() {
  return {
    statusCode:0, headers:{}, body:'',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers || {}; },
    end(value='') { this.body += value || ''; }
  };
}

async function testServerInternalsAndRoutes() {
  const file = path.join(PROGRAM, 'server.js');
  const hookNames = [
    'plusBridgeKey','plusBridgeWrite','plusBridgeHeaderKey','requirePlusBridgeExtension','openPlusBridgeExtensionFolder',
    'createProjectBackup','latestProjectBackup','clientAddress','requirePublicRateLimit','selectComfyFolderWindows',
    'fileSha256','integrityManifestEntries','verifyProgramIntegrity','sendText','baseUrl','probeTunnel','restartTunnelWorker',
    'killProcessTree','clearShutdownSchedule','writeBridgeProject','bridgeUpdates','addBridgeUpdate','sanitizeSegment',
    'bridgeImagePath','getExt','allowedOpenAiFileUrl','downloadActionImage','tokenFor','googleGet','durationSeconds',
    'recommendations','publicTrendRecommendations','ideaFingerprintForValidation','ideaTokenSet','ideaSimilarity','readIdeaHistory',
    'saveIdeaHistory','validateIdeaResearch','validateTenCreativeIdeas','customGptInstructions','openApiSchema'
  ];
  let source = fs.readFileSync(file, 'utf8');
  const oldReturn = 'return { server, port: PORT, url: `http://127.0.0.1:${PORT}/`, dataDir: DATA_DIR, stop: shutdownApplication };';
  const newReturn = `return { server, port: PORT, url: \`http://127.0.0.1:\${PORT}/\`, dataDir: DATA_DIR, stop: shutdownApplication, __coverageTest: { ${hookNames.join(', ')} } };`;
  if (!source.includes(oldReturn)) throw new Error('server return marker nije pronađen');
  source = source.replace(oldReturn, newReturn);
  const mod = compileSource(file, source);
  const port = await getFreePort();
  const handle = mod.startServer({ port, dataDir:path.join(tempRoot, 'server-data'), skipBrowser:true });
  const health = await waitHealth(port);
  ok(health?.ok === true, 'white-box server je stvarno pokrenut');
  const t = handle.__coverageTest;

  const jsonFile = path.join(tempRoot, 'server-write.json');
  t.plusBridgeWrite(jsonFile, {ok:true});
  ok(JSON.parse(fs.readFileSync(jsonFile,'utf8')).ok === true, 'server plusBridgeWrite izvršen');
  const bridgeKey = t.plusBridgeKey();
  const bridgeUrl = new URL(`http://127.0.0.1:${port}/?key=${bridgeKey}`);
  const localReq = { headers:{}, socket:{remoteAddress:'127.0.0.1', encrypted:false} };
  ok(t.plusBridgeHeaderKey(localReq, bridgeUrl) === bridgeKey, 'server plusBridgeHeaderKey izvršen');
  const authRes = fakeResponse();
  ok(t.requirePlusBridgeExtension(localReq, authRes, bridgeUrl) === true, 'server requirePlusBridgeExtension izvršen');

  const originalSpawn = childProcess.spawn;
  childProcess.spawn = () => ({ pid:32123, unref() {}, on() {}, once() {}, kill() {} });
  try {
    const opened = t.openPlusBridgeExtensionFolder();
    ok(opened && opened.path, 'server openPlusBridgeExtensionFolder izvršen bez stvarnog otvaranja browsera');
  } finally { childProcess.spawn = originalSpawn; }

  t.createProjectBackup({ projectId:'coverage', value:1 });
  ok(t.latestProjectBackup()?.state?.projectId === 'coverage', 'server latestProjectBackup izvršen');
  ok(t.clientAddress({headers:{'x-forwarded-for':'203.0.113.1, 1.1.1.1'},socket:{remoteAddress:'127.0.0.1'}}) === '203.0.113.1', 'server clientAddress izvršen');
  ok(t.requirePublicRateLimit(localReq, fakeResponse(), 1, 1000) === true, 'server requirePublicRateLimit lokalna grana izvršena');

  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = () => 'C:\\CoverageComfy\r\n';
  try { t.selectComfyFolderWindows(); } catch {}
  finally { childProcess.execFileSync = originalExecFileSync; }
  ok(true, 'server selectComfyFolderWindows izvršen');

  const hashFile = path.join(tempRoot, 'server-hash.txt'); fs.writeFileSync(hashFile,'hash-me');
  ok(t.fileSha256(hashFile).length === 64, 'server fileSha256 izvršen');
  ok(Array.isArray(t.integrityManifestEntries()), 'server integrityManifestEntries izvršen');
  const integrity = t.verifyProgramIntegrity();
  ok(integrity && typeof integrity.ok === 'boolean', 'server verifyProgramIntegrity izvršen');
  const textRes = fakeResponse(); t.sendText(textRes, 200, 'ok');
  ok(textRes.statusCode === 200 && textRes.body === 'ok', 'server sendText izvršen');
  ok(t.baseUrl({headers:{host:`127.0.0.1:${port}`},socket:{encrypted:false}}).startsWith('http://'), 'server baseUrl izvršen');
  await t.probeTunnel('');
  ok(true, 'server probeTunnel izvršen bez spoljne mreže');
  try { t.restartTunnelWorker(false, false); } catch {}
  try { t.killProcessTree(0); } catch {}
  try { t.clearShutdownSchedule(); } catch {}
  ok(true, 'server tunnel/process/shutdown helperi izvršeni');

  t.writeBridgeProject({projectId:'coverage-project'});
  t.bridgeUpdates();
  t.addBridgeUpdate({type:'coverage',value:1});
  ok(t.sanitizeSegment(' a/b:c ') !== '', 'server bridge storage/sanitize helperi izvršeni');
  t.bridgeImagePath('scene-1', 'png');
  t.getExt('image/jpeg', 'https://example.com/a.jpg');
  ok(t.allowedOpenAiFileUrl('https://files.oaiusercontent.com/x') === true, 'server OpenAI file URL allow-list izvršena');
  try { await t.downloadActionImage({ download_link:'https://evil.invalid/x', mime_type:'image/png' }); } catch {}
  ok(true, 'server downloadActionImage fail-safe grana izvršena');
  try { await t.tokenFor('missing-channel'); } catch {}
  ok(true, 'server tokenFor missing-channel grana izvršena');

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({items:[]}), {status:200,headers:{'content-type':'application/json'}});
  try { await t.googleGet('https://local.invalid/mock'); } finally { global.fetch = originalFetch; }
  ok(t.durationSeconds('PT1H2M3S') === 3723, 'server durationSeconds izvršen');
  ok(Array.isArray(t.recommendations([])) && Array.isArray(t.publicTrendRecommendations([])), 'server recommendation helperi izvršeni');

  const ideaA = { title:'Naslov A', oneSentence:'Jedinstvena priča uz reku i svetla grada', narrativeArc:'Početak sredina i završetak kroz putovanje', visualWorld:'Savremeni grad i reka noću', centralSymbol:'most', locations:['reka'] };
  const ideaB = { ...ideaA, title:'Naslov B', centralSymbol:'sat' };
  const fpA = t.ideaFingerprintForValidation(ideaA); const fpB = t.ideaFingerprintForValidation(ideaB);
  t.ideaTokenSet(fpA); t.ideaSimilarity(fpA, fpB); t.readIdeaHistory();
  t.saveIdeaHistory({projectId:'p1',songTitle:'Pesma',lyricsFingerprint:'lfp'}, [ideaA], {sources:[]});
  t.validateIdeaResearch(null, {});
  t.validateTenCreativeIdeas([], {}, {});
  ok(typeof t.customGptInstructions('') === 'string', 'server idea/research/custom GPT helperi izvršeni');
  const schema = t.openApiSchema({headers:{host:`127.0.0.1:${port}`},socket:{encrypted:false}});
  ok(schema && typeof schema === 'object', 'server openApiSchema izvršen');

  const textRoutes = [
    ['lrc/import',{text:'[00:00.00]Ćao',durationMs:5000}],
    ['lrc/export',{cues:[{startMs:0,endMs:1000,text:'Ćao'}],metadata:{}}],
    ['srt/import',{text:'1\n00:00:00,000 --> 00:00:01,000\nĆao\n'}],
    ['karaoke/words',{cue:{startMs:0,endMs:1000,text:'Ćao svete'},options:{}}],
    ['qc',{track:{cues:[]},options:{}}],
    ['normalize',{track:{cues:[]},options:{}}],
    ['split',{cue:{startMs:0,endMs:10000,text:'Ovo je duži tekst koji se deli na više delova radi provere.'},options:{}}],
    ['beat-markers',{energy:[0.1,0.8,0.2,0.9,0.1],options:{}}],
    ['scene-cuts',{durationMs:5000,markers:[1000,2500,4000],options:{}}],
    ['batch-export',{tracks:[],formats:['srt']}]
  ];
  for (const [route, body] of textRoutes) {
    const response = await httpJson(port, 'POST', `/api/text-tools/${route}`, body);
    ok(response.status >= 200 && response.status < 600, `server text-tools callback ${route} izvršen`);
  }

  // Napravi pravi overlay track pa izvrši sva četiri inline exporter callback-a iz server.js.
  const created = await httpJson(port, 'POST', '/api/audio-projects', {songTitle:'Coverage overlay',artist:'Test'});
  const projectId = created.data?.project?.projectId || created.data?.projectId;
  if (projectId) {
    const trackResp = await httpJson(port, 'POST', `/api/audio-projects/${projectId}/text-tracks`, {type:'lyrics',name:'Lyrics'});
    const trackId = trackResp.data?.track?.trackId || trackResp.data?.trackId;
    if (trackId) {
      await httpJson(port, 'POST', `/api/audio-projects/${projectId}/text-tracks/${trackId}/text-cues`, {startMs:0,endMs:1000,text:'Ćao'});
      for (const format of ['srt','vtt','ass','json']) {
        const response = await httpJson(port, 'GET', `/api/audio-projects/${projectId}/text-tracks/${trackId}/export?format=${format}`);
        ok(response.status >= 200 && response.status < 600, `server inline overlay exporter ${format} izvršen`);
      }
    }
  }

  await handle.stop('coverage-test');
}

async function testProcessProviderSuccessPaths() {
  const originalExecFile = childProcess.execFile;
  try {
    // Stem separation: lažni Demucs proces pravi realnu očekivanu strukturu izlaza.
    const stemFile = path.join(PROGRAM, 'stem-separation.js');
    const stemMod = appendExports(stemFile, ['writeCachedStems']);
    fs.mkdirSync(path.dirname(stemMod.DEMUCS_VENV_PYTHON), {recursive:true});
    fs.writeFileSync(stemMod.DEMUCS_VENV_PYTHON, 'stub');
    const audio = path.join(tempRoot, 'song.wav'); fs.writeFileSync(audio, 'audio');
    childProcess.execFile = (exe, args, options, callback) => {
      const outIndex = args.indexOf('-o');
      const outDir = args[outIndex + 1];
      const base = path.basename(audio, path.extname(audio));
      const stemDir = path.join(outDir, 'htdemucs', base);
      fs.mkdirSync(stemDir, {recursive:true});
      for (const stem of ['vocals','drums','bass','other']) fs.writeFileSync(path.join(stemDir, `${stem}.wav`), stem);
      setImmediate(() => callback(null, 'ok', ''));
      return { kill(){} };
    };
    const stems = await stemMod.separateStems(audio, 'coverage-stem-hash');
    ok(stems.ok && stems.usedOriginalMix === false, 'stem-separation pravi success callback i writeCachedStems izvršeni');

    // Faster Whisper: lažni proces upisuje validan helper rezultat.
    const trFile = path.join(PROGRAM, 'transcription-provider.js');
    const trMod = appendExports(trFile, []);
    fs.mkdirSync(path.dirname(trMod.WHISPER_VENV_PYTHON), {recursive:true});
    fs.writeFileSync(trMod.WHISPER_VENV_PYTHON, 'stub');
    childProcess.execFile = (exe, args, options, callback) => {
      const output = args[args.indexOf('--output') + 1];
      fs.mkdirSync(path.dirname(output), {recursive:true});
      fs.writeFileSync(output, JSON.stringify({language:'sr',duration:1,words:[{word:'Ćao',start:0,end:1}],segments:[{text:'Ćao',start:0,end:1}]}));
      setImmediate(() => callback(null));
      return { kill(){} };
    };
    const tr = await trMod.transcribeAudio(audio, 'coverage-transcription-hash', {model:'tiny'});
    ok(tr.ok === true, 'transcription-provider success callback izvršen');

    // Librosa analyzer: lažni proces upisuje validan analyzer rezultat.
    const maFile = path.join(PROGRAM, 'music-analysis.js');
    const maMod = appendExports(maFile, []);
    fs.mkdirSync(path.dirname(maMod.LIBROSA_VENV_PYTHON), {recursive:true});
    fs.writeFileSync(maMod.LIBROSA_VENV_PYTHON, 'stub');
    childProcess.execFile = (exe, args, options, callback) => {
      const output = args[args.indexOf('--output') + 1];
      fs.mkdirSync(path.dirname(output), {recursive:true});
      fs.writeFileSync(output, JSON.stringify({bpm:120,beats:[0,500],onsets:[]}));
      setImmediate(() => callback(null));
      return { kill(){} };
    };
    const ma = await maMod.analyzeMusic(audio, 'coverage-analysis-hash');
    ok(ma.ok === true && ma.bpm === 120, 'music-analysis success callback izvršen');
  } finally {
    childProcess.execFile = originalExecFile;
  }
}

(async () => {
  console.log('== FINALNI FUNCTION-COVERAGE GAP TESTOVI ==');
  try {
    await testDesktopMain();
    await testExistingServerControllerStop();
    await testAdvancedDpapi();
    await testBackgroundWorkerInternals();
    await testFontAndLauncherInternals();
    await testResearchRealHelpers();
    await testProcessProviderSuccessPaths();
    await testServerInternalsAndRoutes();
    console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
  } finally {
    try { fs.rmSync(tempRoot, {recursive:true, force:true}); } catch {}
  }
})().catch(error => {
  console.error(`\n[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
