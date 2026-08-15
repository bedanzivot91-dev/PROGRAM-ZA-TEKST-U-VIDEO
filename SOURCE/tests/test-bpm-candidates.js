'use strict';
// Testira bpm-candidates.js protiv EKSPLICITNOG primera iz sekcije 6 master prompta:
// "158 BPM može biti half-time osećaj od 79 BPM" — mora dobiti povišen confidence i biti
// predložen kao ravnopravan (ili preporučen) kandidat, ne sakriven fusnota.
const assert = require('assert');
const { buildBpmCandidates } = require('../PROGRAM - NE BRISATI/bpm-candidates');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== BPM kandidati testovi ==');

test('158 BPM (primer iz spec-a) daje half-time kandidat od 79 BPM sa povišenim confidence-om', () => {
  const candidates = buildBpmCandidates(158);
  const halfTime = candidates.find(c => c.type === 'half_time');
  assert.ok(halfTime, 'half-time kandidat mora postojati');
  assert.strictEqual(halfTime.value, 79);
  assert.ok(halfTime.confidence >= 0.5, `confidence mora biti povišen za brz BPM, dobijeno ${halfTime.confidence}`);
});

test('nijedan kandidat nije automatski "potvrđen" — svi traže ručnu potvrdu', () => {
  const candidates = buildBpmCandidates(158);
  // "recommended" je predlog UI-ja koji je preporučen, ali nijedan objekat ne sme imati npr. "confirmed:true"
  candidates.forEach(c => assert.strictEqual('confirmed' in c, false, 'kandidat ne sme imati polje "confirmed" — to bira samo korisnik'));
});

test('tačno JEDAN kandidat je označen kao recommended', () => {
  const candidates = buildBpmCandidates(158);
  const recommendedCount = candidates.filter(c => c.recommended).length;
  assert.strictEqual(recommendedCount, 1);
});

test('umerena pesma (npr. 92 BPM) ne dobija povišen half/double confidence — primary ostaje preporučen', () => {
  const candidates = buildBpmCandidates(92);
  const primary = candidates.find(c => c.type === 'primary');
  assert.strictEqual(primary.recommended, true);
});

test('vrlo spor BPM (npr. 60) dobija double-time kandidat od 120 sa povišenim confidence-om', () => {
  const candidates = buildBpmCandidates(60);
  const doubleTime = candidates.find(c => c.type === 'double_time');
  assert.ok(doubleTime);
  assert.strictEqual(doubleTime.value, 120);
  assert.ok(doubleTime.confidence >= 0.4);
});

test('ekstremno spor BPM (npr. 35) nema smislen half-time kandidat (ispod praga)', () => {
  const candidates = buildBpmCandidates(35);
  assert.strictEqual(candidates.find(c => c.type === 'half_time'), undefined);
});

test('ekstremno brz BPM (npr. 200) nema smislen double-time kandidat (iznad praga)', () => {
  const candidates = buildBpmCandidates(200);
  assert.strictEqual(candidates.find(c => c.type === 'double_time'), undefined);
});

test('neispravan ulaz (0, negativan, NaN) vraća prazan niz umesto da baci grešku', () => {
  assert.deepStrictEqual(buildBpmCandidates(0), []);
  assert.deepStrictEqual(buildBpmCandidates(-10), []);
  assert.deepStrictEqual(buildBpmCandidates(NaN), []);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
