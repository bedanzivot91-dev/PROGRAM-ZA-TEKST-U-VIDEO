'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const target = path.join(__dirname, 'test-final-function-coverage.js');
let source = fs.readFileSync(target, 'utf8');

const pattern = /(disableHardwareAcceleration\(\)\s*\{\s*\}\s*,\s*)(whenReady\s*:\s*\(\)\s*=>\s*\(\{\s*then\(\)\s*\{\s*\}\s*\}\)\s*,)/m;
if (!pattern.test(source)) {
  throw new Error('Electron mock marker nije pronađen u final coverage testu.');
}
source = source.replace(pattern, '$1requestSingleInstanceLock() { return true; },\n      $2');

// setupAutoUpdate() zahteva electron-updater tek KADA se funkcija pozove, dakle posle
// compileSource() trenutka u kome test normalno vraća Module._load na original. Zbog toga
// mock mora da ostane aktivan baš tokom poziva setupAutoUpdate; u suprotnom test učitava
// pravi electron-updater i lažno prijavljuje da logger nije konfigurisan.
const updaterCall = '  t.setupAutoUpdate(() => {});';
if (!source.includes(updaterCall)) {
  throw new Error('setupAutoUpdate marker nije pronađen u final coverage testu.');
}
source = source.replace(updaterCall, `  const originalUpdaterLoad = Module._load;
  Module._load = function coverageUpdaterLoad(request, parent, isMain) {
    if (request === 'electron-updater') return { autoUpdater };
    return originalUpdaterLoad.call(this, request, parent, isMain);
  };
  try {
    t.setupAutoUpdate(() => {});
  } finally {
    Module._load = originalUpdaterLoad;
  }`);

// requirePlusBridgeExtension namerno zahteva i lokalni IP I lokalni Host header.
// Stari white-box zahtev nije imao Host pa je ispravno bio odbijen kao nelokalni zahtev.
// Test mora da simulira stvaran lokalni HTTP zahtev umesto da slabi produkcionu proveru.
const localReqPattern = /const localReq = \{ headers:\{\}, socket:\{remoteAddress:'127\.0\.0\.1', encrypted:false\} \};/;
if (!localReqPattern.test(source)) {
  throw new Error('localReq marker nije pronađen u final coverage testu.');
}
source = source.replace(localReqPattern, "const localReq = { headers:{host:'127.0.0.1:' + port}, socket:{remoteAddress:'127.0.0.1', encrypted:false} };");

// Preostali server helperi moraju stvarno da se izvrše, ne samo da postoje u fajlu.
const hookTail = "'saveIdeaHistory','validateIdeaResearch','validateTenCreativeIdeas','customGptInstructions','openApiSchema'";
if (!source.includes(hookTail)) throw new Error('Server hook tail marker nije pronađen.');
source = source.replace(hookTail, "'saveIdeaHistory','validateIdeaResearch','validateTenCreativeIdeas','customGptInstructions','openApiSchema','spawnAndForget','browserExecutableCandidates','waitForBrowserConnection'");

const browserOpenedMarker = "    ok(opened && opened.path, 'server openPlusBridgeExtensionFolder izvršen bez stvarnog otvaranja browsera');";
if (!source.includes(browserOpenedMarker)) throw new Error('Browser helper marker nije pronađen.');
source = source.replace(browserOpenedMarker, `${browserOpenedMarker}
    ok(t.spawnAndForget(process.execPath, ['-e','process.exit(0)']) === true, 'server spawnAndForget izvršen');
    ok(Array.isArray(t.browserExecutableCandidates()), 'server browserExecutableCandidates izvršen');
    await t.waitForBrowserConnection(1);
    ok(true, 'server waitForBrowserConnection izvršen');`);

// Stari coverage URL nije gađao stvarnu overlay export rutu pa su inline srt/vtt/ass/json
// callback-i ostajali neizvršeni iako je test prihvatao 404. Gađamo pravu rutu i tražimo 200.
const oldOverlayRoute = '`/api/audio-projects/${projectId}/text-tracks/${trackId}/export?format=${format}`';
const newOverlayRoute = '`/api/audio-projects/${projectId}/lyrics-overlay/export?trackId=${encodeURIComponent(trackId)}&format=${format}`';
if (!source.includes(oldOverlayRoute)) throw new Error('Overlay export route marker nije pronađen.');
source = source.replace(oldOverlayRoute, newOverlayRoute);
const looseOverlayAssert = "ok(response.status >= 200 && response.status < 600, `server inline overlay exporter ${format} izvršen`);";
if (!source.includes(looseOverlayAssert)) throw new Error('Overlay export assertion marker nije pronađen.');
source = source.replace(looseOverlayAssert, "ok(response.status === 200, `server inline overlay exporter ${format} izvršen`);");

// recommendation avg helper se izvršava samo kada postoji bar jedan video.
const recommendationMarker = "  ok(Array.isArray(t.recommendations([])) && Array.isArray(t.publicTrendRecommendations([])), 'server recommendation helperi izvršeni');";
if (!source.includes(recommendationMarker)) throw new Error('Recommendation marker nije pronađen.');
source = source.replace(recommendationMarker, `  const recommendationSample = [{duration:60,averageViewPercentage:72,title:'EMOTIVNA LJUBAV VIDEO',views:1000}];
  ok(t.recommendations(recommendationSample).length > 0 && Array.isArray(t.publicTrendRecommendations([])), 'server recommendation helperi i avg izvršeni');

  // Obe YouTube Analytics rute definišu lokalni date() helper. Pravimo bezbedan test token
  // u test-only secure storage-u i mockujemo Google transport da obe rute prođu do date().
  const previousCryptoProvider = process.env.MSS_TEST_CRYPTO_PROVIDER;
  process.env.MSS_TEST_CRYPTO_PROVIDER = 'fallback';
  const advancedToolsForYoutube = require(path.join(PROGRAM, 'advanced-tools.js'));
  advancedToolsForYoutube.writeSecureJson(advancedToolsForYoutube.secureFile('youtube-channels'), {
    channels:[{id:'coverage-channel',title:'Coverage kanal',accessToken:'coverage-token',expiresAt:Date.now()+3600000}]
  });
  const analyticsFetch = global.fetch;
  global.fetch = async requestUrl => {
    const href = String(requestUrl);
    if (href.includes('youtubeanalytics.googleapis.com/v2/reports')) {
      return new Response(JSON.stringify({columnHeaders:[],rows:[]}), {status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({items:[]}), {status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const analyzeResponse = await httpJson(port, 'POST', '/api/youtube/analyze', {channelId:'coverage-channel',days:7});
    ok(analyzeResponse.status === 200, 'server YouTube analyze ruta i lokalni date helper izvršeni');
    const retentionResponse = await httpJson(port, 'POST', '/api/youtube/retention', {channelId:'coverage-channel',videoId:'coverage-video',days:7});
    ok(retentionResponse.status === 200, 'server YouTube retention ruta i lokalni date helper izvršeni');
  } finally {
    global.fetch = analyticsFetch;
    if (previousCryptoProvider === undefined) delete process.env.MSS_TEST_CRYPTO_PROVIDER;
    else process.env.MSS_TEST_CRYPTO_PROVIDER = previousCryptoProvider;
  }`);

// Cancellation callbacks u sva tri Python provider-a moraju biti stvarno izvršeni.
const stemCall = "    const stems = await stemMod.separateStems(audio, 'coverage-stem-hash');";
if (!source.includes(stemCall)) throw new Error('Stem coverage marker nije pronađen.');
source = source.replace(stemCall, `    const stemAbort = new AbortController();
    stemAbort.abort();
    const stems = await stemMod.separateStems(audio, 'coverage-stem-hash', {signal:stemAbort.signal});`);
const transcriptionCall = "    const tr = await trMod.transcribeAudio(audio, 'coverage-transcription-hash', {model:'tiny'});";
if (!source.includes(transcriptionCall)) throw new Error('Transcription coverage marker nije pronađen.');
source = source.replace(transcriptionCall, `    const transcriptionAbort = new AbortController();
    transcriptionAbort.abort();
    const tr = await trMod.transcribeAudio(audio, 'coverage-transcription-hash', {model:'tiny',signal:transcriptionAbort.signal});`);
const analysisCall = "    const ma = await maMod.analyzeMusic(audio, 'coverage-analysis-hash');";
if (!source.includes(analysisCall)) throw new Error('Music analysis coverage marker nije pronađen.');
source = source.replace(analysisCall, `    const analysisAbort = new AbortController();
    analysisAbort.abort();
    const ma = await maMod.analyzeMusic(audio, 'coverage-analysis-hash', {signal:analysisAbort.signal});`);

// Nijedan lokalni HTTP test ne sme da visi zauvek. Regex namerno prihvata LF i CRLF
// jer GitHub Windows checkout može da promeni fizički završetak reda.
const httpErrorPattern = /(\s+req\.on\('error', reject\);\s*)(if \(payload\) req\.write\(payload\);)/m;
if (!httpErrorPattern.test(source)) {
  throw new Error('httpJson marker nije pronađen u final coverage testu.');
}
source = source.replace(httpErrorPattern, `$1req.setTimeout(10000, () => req.destroy(new Error(\`HTTP timeout: \${method} \${pathname}\`)));
    $2`);

// Ispiši preciznu fazu pre i posle svakog završnog testa. Tako sledeći kvar pokazuje
// tačnu funkcionalnu oblast umesto da CI deluje kao da je samo "zaglavljen".
for (const name of [
  'testDesktopMain',
  'testExistingServerControllerStop',
  'testAdvancedDpapi',
  'testBackgroundWorkerInternals',
  'testFontAndLauncherInternals',
  'testResearchRealHelpers',
  'testProcessProviderSuccessPaths',
  'testServerInternalsAndRoutes'
]) {
  const call = `    await ${name}();`;
  if (!source.includes(call)) throw new Error(`Top-level test marker nije pronađen: ${name}`);
  source = source.replace(call, `    console.log('\\n[FAZA START] ${name}');\n${call}\n    console.log('[FAZA OK] ${name}');`);
}

// Završni coverage test je fail-fast: čak i ako neki spoljašnji Windows proces ili socket
// ignoriše sopstveni timeout, CI mora da vrati tačnu grešku umesto da visi do GitHub limita.
const suiteLog = "  console.log('== FINALNI FUNCTION-COVERAGE GAP TESTOVI ==');";
if (!source.includes(suiteLog)) throw new Error('Final suite start marker nije pronađen.');
source = source.replace(suiteLog, `  const hardWatchdog = setTimeout(() => {
    console.error('\\n[FAIL] Final function coverage audit je prekoračio 240 sekundi. Poslednja [FAZA START] poruka pokazuje gde je blokada.');
    process.exit(2);
  }, 240000);
${suiteLog}`);
const successMarker = "    console.log(`\\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);";
if (!source.includes(successMarker)) throw new Error('Final suite success marker nije pronađen.');
source = source.replace(successMarker, `    clearTimeout(hardWatchdog);\n${successMarker}`);

// Ako bilo koja asercija padne, test mora odmah da završi neuspehom. process.exitCode sam
// nije dovoljan ako je white-box HTTP server ostao otvoren pre handle.stop() poziva.
const exitCodeMarker = '  process.exitCode = 1;';
if (!source.includes(exitCodeMarker)) throw new Error('Final catch marker nije pronađen.');
source = source.replace(exitCodeMarker, '  process.exit(1);');

const mod = new Module(target, module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source, target);
