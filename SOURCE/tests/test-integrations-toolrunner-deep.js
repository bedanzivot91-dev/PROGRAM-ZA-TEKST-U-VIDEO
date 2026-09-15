'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-integrations-deep-'));
process.env.MSS_DATA_DIR = temp;
process.env.NODE_ENV = 'test';
process.env.MSS_TEST_CRYPTO_PROVIDER = 'fallback';

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; console.log(`  [OK] ${message}`); }
function fakeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; child.emit('exit', null); return true; };
  child.unref = () => {};
  return child;
}

(async () => {
  const originalSpawn = childProcess.spawn;
  const originalFetch = global.fetch;
  try {
    console.log('== Integrations + ToolRunner deep execution testovi ==');

    const integrations = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'github-integrations.js'));
    const saved = integrations.saveProvider('openaiCompatible', {
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'deep-secret',
      model: 'local-model'
    });
    ok(saved.enabled && saved.hasApiKey && saved.apiKey === '••••••••', 'saveProvider normalizuje i maskira API ključ');
    ok(integrations.maskedProviders().openaiCompatible.hasApiKey === true, 'maskedProviders čita šifrovani provider zapis');
    assert.throws(() => integrations.saveProvider('unknown', {}), /Nepoznat provider/);
    passed++; console.log('  [OK] normalizeProviderInput odbija nepoznat provider');
    assert.throws(() => integrations.saveProvider('openaiCompatible', { baseUrl: 'file:///tmp/x' }), /http:\/\/ ili https:\/\//);
    passed++; console.log('  [OK] normalizeProviderInput odbija nebezbedan URL protokol');

    global.fetch = async (url, options) => {
      ok(options?.headers?.Authorization === 'Bearer deep-secret', 'testProvider šalje Bearer ključ samo iz secure storage-a');
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };
    const providerTest = await integrations.testProvider('openaiCompatible');
    ok(providerTest.ok && providerTest.status === 200, 'testProvider izvršava HTTP proveru i vraća status');

    const status = integrations.moduleStatus();
    ok(status.ok && status.providers.openaiCompatible.hasApiKey, 'moduleStatus izvršava HyperFrames/Python/provider status grane');

    childProcess.spawn = () => fakeChild();
    const launched = integrations.launchInstaller('hyperframes');
    ok(launched.ok && launched.launched && launched.pid === 4242, 'launchInstaller izvršava bezbedno mockovan Windows spawn');
    const opened = integrations.openModuleFolder('tools');
    ok(opened.ok && opened.opened && fs.existsSync(opened.path), 'openModuleFolder izvršava mockovan explorer tok');
    assert.throws(() => integrations.openModuleFolder('unknown'), /Nepoznat folder/);
    passed++; console.log('  [OK] openModuleFolder odbija nepoznat modul');

    // ToolRunner zadržava referencu na isti child_process objekat, pa mock spawn sprečava
    // stvarno pokretanje instalera dok se izvršava kompletna job/log/cancel logika.
    delete require.cache[require.resolve(path.join(ROOT, 'PROGRAM - NE BRISATI', 'tool-runner.js'))];
    const runner = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'tool-runner.js'));
    const children = [];
    childProcess.spawn = () => { const c = fakeChild(5000 + children.length); children.push(c); return c; };

    ok(runner.listTools().length === 9, 'listTools vraća svih 9 registrovanih alata');
    runner.runTool('ffmpeg');
    const c1 = children[0];
    c1.stdout.write('linija 1\nlinija 2\n');
    c1.stderr.write('upozorenje\n');
    await new Promise(resolve => setImmediate(resolve));
    let tool = runner.toolStatus('ffmpeg');
    ok(tool.status === 'running' && tool.log.some(line => line.includes('linija 1')) && tool.log.some(line => line.includes('upozorenje')), 'appendLog hvata stdout i stderr child procesa');
    const cancelled = runner.cancelTool('ffmpeg');
    ok(cancelled.cancelled === true && c1.killed, 'cancelTool stvarno poziva kill na aktivnom poslu');
    tool = runner.toolStatus('ffmpeg');
    ok(tool.status === 'failed' && tool.log.some(line => line.includes('Otkazano')), 'cancelTool ažurira status i log');
    ok(runner.cancelTool('ffmpeg').cancelled === false, 'ponovljeni cancel nad završenim poslom je idempotentan');

    runner.runTool('librosa');
    const c2 = children[1];
    c2.stdout.write('instalacija\n');
    c2.emit('exit', 0);
    await new Promise(resolve => setImmediate(resolve));
    tool = runner.toolStatus('librosa');
    ok(tool.status === 'success' && tool.exitCode === 0 && tool.log.some(line => line === 'Gotovo.'), 'runTool exit=0 završava posao kao success');

    runner.runTool('demucs');
    const c3 = children[2];
    c3.emit('error', new Error('mock spawn error'));
    tool = runner.toolStatus('demucs');
    ok(tool.status === 'failed' && tool.log.some(line => line.includes('mock spawn error')), 'runTool error događaj se beleži kao failed');

    assert.throws(() => runner.runTool('unknown'), /Nepoznat alat/);
    passed++; console.log('  [OK] runTool odbija nepoznat alat');

    console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
  } finally {
    childProcess.spawn = originalSpawn;
    global.fetch = originalFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(`\n[FAIL] ${error.stack || error.message}`); process.exitCode = 1; });
