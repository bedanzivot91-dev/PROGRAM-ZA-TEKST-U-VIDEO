'use strict';
// Testira lyrics-parser.js protiv eksplicitnih zahteva iz sekcije 9.1 master prompta:
// section tagovi, redosled, ponovljeni refren kao posebna instanca, žanrovski tagovi,
// nepromenjen originalni tekst, srpska latinica, apostrofi, "al'"/"ali" poređenje.
const assert = require('assert');
const { parseLyrics, normalizeForComparison } = require('../PROGRAM - NE BRISATI/lyrics-parser');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== LyricsParser testovi ==');

test('prepoznaje sve section tagove', () => {
  const text = '[Intro]\nA\n[Verse]\nB\n[Pre-Chorus]\nC\n[Chorus]\nD\n[Bridge]\nE\n[Outro]\nF';
  const result = parseLyrics(text);
  const types = result.sections.map(s => s.type);
  assert.deepStrictEqual(types, ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro']);
});

test('odvaja sekcije i stihove, čuva redosled', () => {
  const text = '[Verse]\nPrvi red\nDrugi red\n[Chorus]\nTreći red';
  const result = parseLyrics(text);
  assert.strictEqual(result.sections.length, 2);
  assert.strictEqual(result.lines.length, 3);
  assert.deepStrictEqual(result.lines.map(l => l.text), ['Prvi red', 'Drugi red', 'Treći red']);
  assert.strictEqual(result.sections[0].lineIds.length, 2);
  assert.strictEqual(result.sections[1].lineIds.length, 1);
});

test('ponovljeni refren ostaje posebna instanca sa svojim id-jem', () => {
  const text = '[Chorus]\nIsti tekst refrena\n[Verse]\nNešto drugo\n[Chorus]\nIsti tekst refrena';
  const result = parseLyrics(text);
  const choruses = result.sections.filter(s => s.type === 'chorus');
  assert.strictEqual(choruses.length, 2);
  assert.notStrictEqual(choruses[0].id, choruses[1].id);
  assert.strictEqual(choruses[0].id, 'chorus');
  assert.strictEqual(choruses[1].id, 'chorus-2');
  assert.strictEqual(choruses[1].isRepeated, true);
  assert.strictEqual(choruses[1].repeatsOf, choruses[0].id);
  assert.strictEqual(choruses[0].isRepeated, false);
});

test('razdvaja strukturne i žanrovske/emotivne tagove [Chorus][Pop][Powerful][Male]', () => {
  const text = '[Chorus][Pop][Powerful][Male]\nRed teksta';
  const result = parseLyrics(text);
  assert.strictEqual(result.sections.length, 1);
  assert.strictEqual(result.sections[0].type, 'chorus');
  assert.deepStrictEqual(result.sections[0].tags, ['Pop', 'Powerful', 'Male']);
});

test('čuva originalan tekst NEIZMENJEN (razmaci, redosled, velika/mala slova)', () => {
  const text = '[Verse]\n  Neobičan   razmak i Veliko Slovo ';
  const result = parseLyrics(text);
  assert.strictEqual(result.lines[0].text, 'Neobičan   razmak i Veliko Slovo');
  assert.ok(result.formattedLyrics.includes('Neobičan   razmak i Veliko Slovo'));
});

test('podržava srpsku latinicu č ć š ž đ', () => {
  const text = '[Verse]\nČaše, ćutanje, šuma, žega, đak';
  const result = parseLyrics(text);
  assert.strictEqual(result.lines[0].text, 'Čaše, ćutanje, šuma, žega, đak');
});

test('podržava ravne i Unicode apostrofe', () => {
  const straight = normalizeForComparison("dal' znaš");
  const curly = normalizeForComparison('dal’ znaš');
  const backtick = normalizeForComparison('dal` znaš');
  assert.strictEqual(straight, curly);
  assert.strictEqual(straight, backtick);
});

test('"al\'" i "ali" se normalizuju na isti oblik u poređenju', () => {
  const withApostrophe = normalizeForComparison("al' je bilo lepo");
  const full = normalizeForComparison('ali je bilo lepo');
  assert.strictEqual(withApostrophe, full);
});

test('normalizovana verzija se NE vraća kao formattedLyrics (samo interna upotreba)', () => {
  const text = '[Verse]\nAL\' JE OVO VELIKO';
  const result = parseLyrics(text);
  assert.ok(result.formattedLyrics.includes("AL' JE OVO VELIKO"));
  assert.ok(!result.formattedLyrics.includes('ali je ovo veliko'));
});

test('tekst bez ijednog section taga i dalje radi (podrazumevani verse)', () => {
  const text = 'Prvi red bez taga\nDrugi red bez taga';
  const result = parseLyrics(text);
  assert.strictEqual(result.sections.length, 1);
  assert.strictEqual(result.sections[0].type, 'verse');
  assert.strictEqual(result.lines.length, 2);
});

test('prazan tekst ne baca grešku', () => {
  const result = parseLyrics('');
  assert.strictEqual(result.sections.length, 0);
  assert.strictEqual(result.lines.length, 0);
});

test('lineId je jedinstven po sekciji i instanci', () => {
  const text = '[Chorus]\nA\nB\n[Chorus]\nA\nB';
  const result = parseLyrics(text);
  const ids = result.lines.map(l => l.lineId);
  assert.strictEqual(new Set(ids).size, ids.length);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
