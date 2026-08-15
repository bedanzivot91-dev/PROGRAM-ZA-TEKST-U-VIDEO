'use strict';
// Testira da su locked-identity-text.js (server, CommonJS) i public/locked-girl-identity.js
// (browser, window.*) BAJT-ZA-BAJT usklađeni. Ovo je kritična provera — ako se jedan fajl
// izmeni bez drugog, server bi gradio promptove sa JEDNIM identitetom dok browser prikazuje
// DRUGI, tiho krseći "trajno zaključan" garantiju bez ijedne vidljive greške.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const serverIdentity = require('../PROGRAM - NE BRISATI/locked-identity-text');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== Locked Identity Server/Browser Sync testovi ==');

const browserSource = fs.readFileSync(path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'public', 'locked-girl-identity.js'), 'utf8');
const posMatch = browserSource.match(/const LOCKED_GIRL_IDENTITY_POSITIVE_TEXT = String\.raw`([\s\S]*?)`;/);
const negMatch = browserSource.match(/const LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT = String\.raw`([\s\S]*?)`;/);

test('POSITIVE tekst je BAJT-ZA-BAJT identičan u oba fajla', () => {
  assert.ok(posMatch, 'browser fajl mora sadržati POSITIVE_TEXT');
  assert.strictEqual(serverIdentity.POSITIVE, posMatch[1]);
});

test('NEGATIVE tekst je BAJT-ZA-BAJT identičan u oba fajla', () => {
  assert.ok(negMatch, 'browser fajl mora sadržati NEGATIVE_TEXT');
  assert.strictEqual(serverIdentity.NEGATIVE, negMatch[1]);
});

test('CHARACTER_ID se poklapa sa main-woman-global-v1 korišćenim u browser fajlu', () => {
  assert.strictEqual(serverIdentity.CHARACTER_ID, 'main-woman-global-v1');
  assert.ok(browserSource.includes(serverIdentity.CHARACTER_ID));
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
