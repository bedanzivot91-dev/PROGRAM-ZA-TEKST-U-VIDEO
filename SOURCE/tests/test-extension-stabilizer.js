'use strict';
// Testira extension-stabilizer.js — sekcija 5, stvarno kopiranje fajlova na disk (ne mock).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { resolveStableExtensionDir, ensureStableExtensionCopy } = require('../PROGRAM - NE BRISATI/extension-stabilizer');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ExtensionStabilizer testovi ==');

const testLocalAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-localappdata-test-'));
process.env.LOCALAPPDATA = testLocalAppData;

const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-ext-source-'));
fs.writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify({ name: 'test', version: '15.4.0' }));
fs.mkdirSync(path.join(sourceDir, 'icons'));
fs.writeFileSync(path.join(sourceDir, 'icons', 'icon16.png'), 'fake-png-bytes');

test('resolveStableExtensionDir gradi putanju pod LOCALAPPDATA\\ProductName\\Extension\\verzija', () => {
  const dir = resolveStableExtensionDir('Muzicki Spot Studio Free', '15.4.0');
  assert.strictEqual(dir, path.join(testLocalAppData, 'Muzicki Spot Studio Free', 'Extension', '15.4.0'));
});

test('prvo kopiranje STVARNO kopira sve fajlove na disk, uključujući podfoldere', () => {
  const { destDir, wasCopied } = ensureStableExtensionCopy(sourceDir, { version: '15.4.0' });
  assert.strictEqual(wasCopied, true);
  assert.ok(fs.existsSync(path.join(destDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(destDir, 'icons', 'icon16.png')));
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'icons', 'icon16.png'), 'utf8'), 'fake-png-bytes');
});

test('drugi poziv sa ISTOM verzijom NE kopira ponovo (marker fajl već ažuran)', () => {
  const { destDir } = ensureStableExtensionCopy(sourceDir, { version: '15.4.0' });
  // Namerno "kvarimo" jedan fajl u destinaciji da dokažemo da ga drugi poziv NIJE prepisao.
  fs.writeFileSync(path.join(destDir, 'icons', 'icon16.png'), 'IZMENJEN-RUCNO');
  const { wasCopied } = ensureStableExtensionCopy(sourceDir, { version: '15.4.0' });
  assert.strictEqual(wasCopied, false);
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'icons', 'icon16.png'), 'utf8'), 'IZMENJEN-RUCNO', 'fajl ne sme biti prepisan kada je verzija ista');
});

test('nova verzija PONOVO kopira (stara kopija se čisti, nova zamenjuje)', () => {
  const { destDir, wasCopied } = ensureStableExtensionCopy(sourceDir, { version: '15.5.0' });
  assert.strictEqual(wasCopied, true);
  assert.notStrictEqual(destDir, resolveStableExtensionDir('Muzicki Spot Studio Free', '15.4.0'));
  assert.ok(fs.existsSync(path.join(destDir, 'manifest.json')));
});

test('nepostojeći izvorni folder (bez manifest.json) baca jasnu grešku', () => {
  const emptySource = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-ext-empty-'));
  assert.throws(() => ensureStableExtensionCopy(emptySource, { version: '1.0.0' }), /manifest\.json/);
  fs.rmSync(emptySource, { recursive: true, force: true });
});

test('nedostajuća verzija baca jasnu grešku', () => {
  assert.throws(() => ensureStableExtensionCopy(sourceDir, {}), /version je obavezan/);
});

fs.rmSync(sourceDir, { recursive: true, force: true });
fs.rmSync(testLocalAppData, { recursive: true, force: true });

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
