'use strict';
// Testira extension-identity.js — sekcija 5 ("obezbedi stabilan ID odgovarajućim manifest key
// rešenjem"). Ključna provera: ID izračunat ovde MORA se poklapati sa onim što Chrome stvarno
// izračuna iz manifest.json "key" polja — proverava se da su OBA fajla i dalje usklađena.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { computeChromeExtensionId, MSS_EXTENSION_ID, MSS_EXTENSION_PUBLIC_KEY_B64, MSS_EXTENSION_ORIGIN } = require('../PROGRAM - NE BRISATI/extension-identity');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== Extension Identity testovi ==');

test('MSS_EXTENSION_ID je tačno 32 karaktera, samo slova a-p (Chrome-ov format)', () => {
  assert.strictEqual(MSS_EXTENSION_ID.length, 32);
  assert.ok(/^[a-p]{32}$/.test(MSS_EXTENSION_ID), `neispravan format: ${MSS_EXTENSION_ID}`);
});

test('MSS_EXTENSION_ORIGIN je ispravno formatiran chrome-extension:// URL', () => {
  assert.strictEqual(MSS_EXTENSION_ORIGIN, `chrome-extension://${MSS_EXTENSION_ID}`);
});

test('computeChromeExtensionId je DETERMINISTIČKA — isti ključ uvek daje isti ID', () => {
  const id1 = computeChromeExtensionId(MSS_EXTENSION_PUBLIC_KEY_B64);
  const id2 = computeChromeExtensionId(MSS_EXTENSION_PUBLIC_KEY_B64);
  assert.strictEqual(id1, id2);
  assert.strictEqual(id1, MSS_EXTENSION_ID);
});

test('različit javni ključ daje RAZLIČIT ID', () => {
  const crypto = require('crypto');
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' } });
  const otherId = computeChromeExtensionId(publicKey.toString('base64'));
  assert.notStrictEqual(otherId, MSS_EXTENSION_ID);
});

test('manifest.json "key" polje se POKLAPA sa MSS_EXTENSION_PUBLIC_KEY_B64 (fajlovi su usklađeni)', () => {
  const manifestPath = path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.key, MSS_EXTENSION_PUBLIC_KEY_B64);
});

test('ID izračunat direktno iz manifest.json "key" polja se poklapa sa MSS_EXTENSION_ID', () => {
  const manifestPath = path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const idFromManifest = computeChromeExtensionId(manifest.key);
  assert.strictEqual(idFromManifest, MSS_EXTENSION_ID, 'server-side ID i manifest.json ID moraju biti isti da bi CORS allow-lista radila');
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
