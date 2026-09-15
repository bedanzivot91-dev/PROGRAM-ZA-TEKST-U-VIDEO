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

const mod = new Module(target, module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source, target);
