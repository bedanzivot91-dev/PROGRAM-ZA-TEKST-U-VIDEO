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

const mod = new Module(target, module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source, target);
