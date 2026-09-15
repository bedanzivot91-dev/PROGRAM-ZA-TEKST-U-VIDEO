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
