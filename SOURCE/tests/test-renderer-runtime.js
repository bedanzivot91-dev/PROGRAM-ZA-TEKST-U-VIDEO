'use strict';

const assert = require('assert');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const electronExe = require('electron');
const probe = path.join(__dirname, 'renderer-runtime-probe.js');

console.log('== Renderer / Chromium runtime test ==');
const env = {
  ...process.env,
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  MSS_TEST_NO_BROWSER: '1'
};
delete env.ELECTRON_RUN_AS_NODE;

const child = childProcess.spawn(electronExe, ['--disable-gpu', probe], {
  cwd: ROOT,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', chunk => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
});
child.stderr.on('data', chunk => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error('[FAIL] Parent renderer test timeout posle 80 sekundi — gasim Electron probe.');
  try { child.kill(); } catch (_) {}
}, 80000);

child.on('error', error => {
  clearTimeout(timer);
  console.error(`[FAIL] Renderer probe nije mogao da se pokrene: ${error.stack || error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  clearTimeout(timer);
  try {
    assert.strictEqual(timedOut, false, 'Renderer probe je prekoračio parent timeout.');
    // Electron app.exit() može da prekine stdout pre poslednjeg cleanup loga. Zato se
    // uspeh potvrđuje markerom koji probe ispisuje TEK nakon svih DOM/preload/API/
    // Chromium coverage provera, a zatim se zasebno zahteva i child exit code 0.
    assert.match(
      stdout,
      /\[OK\] Nema renderer crash\/load\/preload\/uncaught JS grešaka u probnom toku\./,
      'Renderer probe nije stigao do kraja svih runtime i Chromium coverage provera.'
    );
    assert.doesNotMatch(stdout + '\n' + stderr, /\[FAIL\]/, 'Renderer probe je prijavio [FAIL] iako child process status može biti 0.');
    assert.strictEqual(code, 0, `Renderer probe nije prošao (status=${code}, signal=${signal || 'none'}).`);
    console.log('[OK] Pravi Electron/Chromium renderer probe je završen bez greške.');
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
});
