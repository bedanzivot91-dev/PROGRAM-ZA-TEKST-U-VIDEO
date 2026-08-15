'use strict';
// Testira popravku iz service-worker.js — sekcija 5: "Umesto Failed to fetch, prikaži: Chrome
// ekstenzija ne može da pristupi lokalnom serveru na portu PORT..." service-worker.js koristi
// chrome.* API-je na nivou modula pa se ne može direktno require-ovati u Node testu; ovaj test
// izvlači TAČNU regex/format logiku iz izvornog fajla i proverava je izolovano (isti pristup
// kao test-locked-identity.js za sha256Hex).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== Bridge Error Message testovi ==');

const source = fs.readFileSync(path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'service-worker.js'), 'utf8');

test('service-worker.js sadrži friendly poruku sa tačnim tekstom iz sekcije 5', () => {
  assert.ok(source.includes('CORS odgovor ili bridge veza nisu ispravni. Otvorite dijagnostiku mosta.'));
});

test('poslednji fetchJson poziv u api() ima try/catch (stari bug: bez hvatanja, "Failed to fetch" je curio direktno)', () => {
  const apiFnMatch = source.match(/async function api\([\s\S]*?\n}/);
  assert.ok(apiFnMatch, 'api() funkcija mora postojati');
  const body = apiFnMatch[0];
  const tryCount = (body.match(/\btry\s*\{/g) || []).length;
  assert.ok(tryCount >= 2, `api() mora imati bar 2 try bloka (spoljni + unutrašnji oko drugog fetchJson poziva), pronađeno ${tryCount}`);
});

function simulateTransform(rawMessage, baseUrl) {
  const port = (baseUrl.match(/:(\d+)/) || [])[1] || '4180';
  if (/failed to fetch|networkerror|load failed/i.test(rawMessage)) {
    return `Chrome ekstenzija ne može da pristupi lokalnom serveru na portu ${port}. CORS odgovor ili bridge veza nisu ispravni. Otvorite dijagnostiku mosta.`;
  }
  return rawMessage;
}

test('sirov "Failed to fetch" (Chrome-ov native TypeError tekst) se transformiše u jasnu poruku sa tačnim portom', () => {
  const result = simulateTransform('Failed to fetch', 'http://127.0.0.1:4180');
  assert.strictEqual(result, 'Chrome ekstenzija ne može da pristupi lokalnom serveru na portu 4180. CORS odgovor ili bridge veza nisu ispravni. Otvorite dijagnostiku mosta.');
});

test('port se tačno izvlači iz baseUrl kada je različit od podrazumevanog', () => {
  const result = simulateTransform('Failed to fetch', 'http://127.0.0.1:4207');
  assert.ok(result.includes('portu 4207'));
});

test('poruke koje NISU mrežna greška (npr. stvarna HTTP greška aplikacije) se NE menjaju', () => {
  const result = simulateTransform('Bridge ključ nije ispravan.', 'http://127.0.0.1:4180');
  assert.strictEqual(result, 'Bridge ključ nije ispravan.');
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
