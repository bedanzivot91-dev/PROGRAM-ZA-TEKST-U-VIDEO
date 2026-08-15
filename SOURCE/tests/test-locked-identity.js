'use strict';
// Testira PROGRAM - NE BRISATI/public/locked-girl-identity.js — sekcija 16 master prompta.
// Ovo je poslednja odbrana protiv slučajne izmene/skraćivanja zaključanog identiteta, i protiv
// vraćanja v15.3 greške ("obavezna crvena haljina") koju je v15.5 spec eksplicitno zabranio
// (pravilo 0.10). Fajl je browser-only (koristi window/TextEncoder) — testira se kao tekst,
// plus SHA-256 se nezavisno proverava preko Node crypto modula.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== Locked Girl Identity testovi ==');

const filePath = path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'public', 'locked-girl-identity.js');
const source = fs.readFileSync(filePath, 'utf8');

const posMatch = source.match(/const LOCKED_GIRL_IDENTITY_POSITIVE_TEXT = String\.raw`([\s\S]*?)`;/);
const negMatch = source.match(/const LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT = String\.raw`([\s\S]*?)`;/);

test('pozitivni i negativni blok postoje i nisu prazni', () => {
  assert.ok(posMatch && posMatch[1].length > 500);
  assert.ok(negMatch && negMatch[1].length > 500);
});

const positive = posMatch[1];
const negative = negMatch[1];

test('NE sadrži zabranjene "crvena haljina" fraze (pravilo 0.10 — nema obavezne crvene haljine)', () => {
  const forbidden = ['red dress', 'dress that is not red', 'different dress'];
  for (const phrase of forbidden) {
    assert.ok(!positive.toLowerCase().includes(phrase), `pozitivni blok sadrži zabranjenu frazu: "${phrase}"`);
  }
});

test('sadrži eksplicitna ograničenja dužine kose (ne kratka, ne ispod ramena)', () => {
  assert.ok(positive.includes('hair must never be short'));
  assert.ok(positive.includes('hair must never be long below the shoulders'));
});

test('sadrži tačnu poziciju tetovaže ("front upper right thigh")', () => {
  assert.ok(positive.includes('front upper right thigh'));
});

test('sadrži pravilo da se garderoba određuje po sceni, ne fiksirana', () => {
  assert.ok(positive.includes('clothing must be determined by the exact scene'));
  assert.ok(positive.includes('never repeat the same outfit without a clear continuity reason'));
});

test('negativni blok zabranjuje pogrešnu poziciju tetovaže i staromodnu odeću umesto crvene haljine', () => {
  assert.ok(negative.includes('tattoo on the left leg'));
  assert.ok(negative.includes('old-fashioned clothing'));
  assert.ok(!negative.toLowerCase().includes('not red'));
});

test('window.* dodele koriste ISTI format koji app.js već parsira (positive + "Negative prompt:" + negative)', () => {
  assert.ok(source.includes('Negative prompt: ${LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT}'));
});

test('characterId "main-woman-global-v1" je definisan (sekcija 16)', () => {
  assert.ok(source.includes('main-woman-global-v1'));
});

test('SHA-256 se računa preko kombinovanog bloka i poklapa se sa Node crypto ground truth-om', () => {
  const combined = `${positive} Negative prompt: ${negative}`;
  const expectedHash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
  // Sama implementacija u fajlu se poziva u browseru; ovde proveravamo da BI dala isti rezultat
  // izvršavanjem identičnog algoritma iz fajla u Node okruženju (bez window zavisnosti).
  const funcMatch = source.match(/function sha256Hex[\s\S]*?\n}/);
  assert.ok(funcMatch, 'sha256Hex funkcija mora postojati u fajlu');
  // eslint-disable-next-line no-eval
  const sha256Hex = eval(`(${funcMatch[0]})`); // zagrade pretvaraju deklaraciju u izraz da eval() je vrati
  const computed = sha256Hex(combined);
  assert.strictEqual(computed, expectedHash);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
