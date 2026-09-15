'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const target = path.join(__dirname, 'test-final-function-coverage.js');
let source = fs.readFileSync(target, 'utf8');

const marker = "      disableHardwareAcceleration() {},\n      whenReady: () => ({ then() {} }),";
const replacement = "      disableHardwareAcceleration() {},\n      requestSingleInstanceLock() { return true; },\n      whenReady: () => ({ then() {} }),";
if (!source.includes(marker)) {
  throw new Error('Electron mock marker nije pronađen u final coverage testu.');
}
source = source.replace(marker, replacement);

const mod = new Module(target, module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source, target);
