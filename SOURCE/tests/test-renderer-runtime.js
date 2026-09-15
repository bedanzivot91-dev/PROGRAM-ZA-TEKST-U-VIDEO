'use strict';

const assert = require('assert');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const electronExe = require('electron');
const probe = path.join(__dirname, 'renderer-runtime-probe.js');

console.log('== Renderer / Chromium runtime test ==');
const result = childProcess.spawnSync(electronExe, [probe, '--disable-gpu'], {
  cwd: ROOT,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    MSS_TEST_NO_BROWSER: '1'
  },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 90000,
  maxBuffer: 10 * 1024 * 1024
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.ifError(result.error);
assert.strictEqual(result.status, 0, `Renderer probe nije prošao (status=${result.status}, signal=${result.signal || 'none'}).`);
console.log('[OK] Pravi Electron/Chromium renderer probe je završen bez greške.');
