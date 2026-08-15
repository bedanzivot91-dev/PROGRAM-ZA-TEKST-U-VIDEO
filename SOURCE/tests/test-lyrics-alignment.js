'use strict';
// Testira lyrics-alignment.js sa RUČNO konstruisanim ASR podacima gde je tačno vreme svake
// reči unapred poznato — omogućava egzaktnu proveru da li LyricsAlignmentEngine ispravno
// poravnava ponovljeni refren sa NJEGOVIM STVARNIM pojavljivanjem (ne uvek sa prvim), da
// zanemaruje ASR "halucinacije" (reči kojih nema u kanonskom tekstu), i da linije bez
// poklapanja dobijaju needsReview=true sa interpoliranom (ne izmišljenom) granicom.
const assert = require('assert');
const { parseLyrics } = require('../PROGRAM - NE BRISATI/lyrics-parser');
const { alignLyrics, wordsMatch } = require('../PROGRAM - NE BRISATI/lyrics-alignment');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== LyricsAlignmentEngine testovi ==');

const lyricsText = '[Verse]\nSanjam noćas o tebi\n[Chorus]\nVolim te više nego ikad\n[Verse]\nNova zora dolazi brzo\n[Chorus]\nVolim te više nego ikad';
const parsed = parseLyrics(lyricsText);

function w(word, start, end, probability = 0.95) { return { word, start, end, probability }; }

const asrWords = [
  w('sanjam', 0.0, 0.5), w('noćas', 0.5, 1.0), w('o', 1.0, 1.1), w('tebi', 1.1, 1.6),
  w('yeah', 1.6, 1.7), // ASR halucinacija — ne postoji u kanonskom tekstu
  w('volim', 2.0, 2.4), w('te', 2.4, 2.6), w('više', 2.6, 3.0), w('nego', 3.0, 3.3), w('ikad', 3.3, 3.8),
  // L3 (Nova zora dolazi brzo) namerno nema NIJEDNU odgovarajuću ASR reč — simulira nejasno pevanje
  w('volim', 6.0, 6.4), w('te', 6.4, 6.6), w('više', 6.6, 7.0), w('nego', 7.0, 7.3), w('ikad', 7.3, 7.8)
];

const result = alignLyrics(parsed.lines, asrWords, { totalDurationMs: 9000 });
const [l1, l2, l3, l4] = result.lines;

test('L1 (prvi stih) — tačno poravnat prema stvarnim ASR vremenima', () => {
  assert.strictEqual(l1.startMs, 0);
  assert.strictEqual(l1.endMs, 1600);
  assert.strictEqual(l1.source, 'asr_words');
  assert.strictEqual(l1.needsReview, false);
});

test('L2 (prva instanca refrena) — poravnata sa PRVIM pojavljivanjem (2.0s–3.8s)', () => {
  assert.strictEqual(l2.startMs, 2000);
  assert.strictEqual(l2.endMs, 3800);
  assert.strictEqual(l2.matchedWordsRatio, 1);
});

test('L3 (linija bez poklapanja) — needsReview=true, interpolirana granica (NE izmišljena preciznost)', () => {
  assert.strictEqual(l3.source, 'segment_estimate');
  assert.strictEqual(l3.needsReview, true);
  assert.strictEqual(l3.startMs, 3800, 'mora početi tačno gde se prethodna linija završila');
  assert.strictEqual(l3.endMs, 6000, 'mora se završiti tačno gde sledeća poravnata linija počinje');
});

test('L4 (DRUGA instanca refrena) — poravnata sa DRUGIM pojavljivanjem (6.0s–7.8s), NE sa prvim', () => {
  assert.strictEqual(l4.startMs, 6000);
  assert.strictEqual(l4.endMs, 7800);
  assert.notStrictEqual(l4.startMs, l2.startMs, 'druga instanca refrena ne sme dobiti isto vreme kao prva');
});

test('ASR halucinacija ("yeah") ne kvari poravnanje susednih pravih reči', () => {
  assert.strictEqual(l1.matchedWordsRatio, 1);
});

test('lineId ostaje jedinstven za obe instance refrena u rezultatu poravnanja', () => {
  assert.notStrictEqual(l2.lineId, l4.lineId);
});

test('wordsMatch — fuzzy poklapanje za malu ASR grešku (1 karakter razlike)', () => {
  assert.strictEqual(wordsMatch('volim', 'volim'), true);
  assert.strictEqual(wordsMatch('volim', 'volem'), true); // 1 karakter razlike, dovoljno dugacka rec
  assert.strictEqual(wordsMatch('volim', 'mrzim'), false); // potpuno druga rec
});

test('prazan ASR niz ne baca grešku — sve linije dobijaju needsReview i interpolaciju', () => {
  const emptyResult = alignLyrics(parsed.lines, [], { totalDurationMs: 5000 });
  assert.strictEqual(emptyResult.lines.every(l => l.needsReview), true);
  assert.strictEqual(emptyResult.overallConfidence, 0);
});

test('svaka poravnata linija dobija words[] niz sa reč-po-reč vremenima (za karaoke)', () => {
  assert.strictEqual(l1.words.length, 4);
  assert.deepStrictEqual(l1.words[0], { text: 'sanjam', startMs: 0, endMs: 500, confidence: 0.95 });
  assert.strictEqual(l1.words[3].text, 'tebi');
  assert.strictEqual(l1.words[3].endMs, 1600);
});

test('words[] je vremenski SORTIRAN unutar linije', () => {
  for (let i = 1; i < l2.words.length; i += 1) {
    assert.ok(l2.words[i].startMs >= l2.words[i - 1].startMs);
  }
});

test('linija bez poklapanja (L3) ima prazan words[] niz, ne izmišljene reči', () => {
  assert.deepStrictEqual(l3.words, []);
});

test('overallConfidence opada kada je manje linija poklopljeno', () => {
  const partialResult = alignLyrics(parsed.lines, asrWords.slice(0, 4), { totalDurationMs: 9000 }); // samo L1 ima poklapanja
  assert.ok(partialResult.overallConfidence < result.overallConfidence);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
