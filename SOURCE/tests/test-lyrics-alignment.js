'use strict';
const assert = require('assert');
const { parseLyrics } = require('../PROGRAM - NE BRISATI/lyrics-parser');
const { alignLyrics, alignSequences, tokenizeWords, levenshtein, wordsMatch, normalizeAsrToken, interpolateUnmatchedGroups } = require('../PROGRAM - NE BRISATI/lyrics-alignment');

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
  w('yeah', 1.6, 1.7),
  w('volim', 2.0, 2.4), w('te', 2.4, 2.6), w('više', 2.6, 3.0), w('nego', 3.0, 3.3), w('ikad', 3.3, 3.8),
  w('volim', 6.0, 6.4), w('te', 6.4, 6.6), w('više', 6.6, 7.0), w('nego', 7.0, 7.3), w('ikad', 7.3, 7.8)
];
const result = alignLyrics(parsed.lines, asrWords, { totalDurationMs: 9000 });
const [l1, l2, l3, l4] = result.lines;

test('L1 tačno poravnat', () => { assert.strictEqual(l1.startMs, 0); assert.strictEqual(l1.endMs, 1600); assert.strictEqual(l1.source, 'asr_words'); assert.strictEqual(l1.needsReview, false); });
test('L2 prvi refren', () => { assert.strictEqual(l2.startMs, 2000); assert.strictEqual(l2.endMs, 3800); assert.strictEqual(l2.matchedWordsRatio, 1); });
test('L3 interpolirana granica', () => { assert.strictEqual(l3.source, 'segment_estimate'); assert.strictEqual(l3.needsReview, true); assert.strictEqual(l3.startMs, 3800); assert.strictEqual(l3.endMs, 6000); });
test('L4 drugi refren', () => { assert.strictEqual(l4.startMs, 6000); assert.strictEqual(l4.endMs, 7800); assert.notStrictEqual(l4.startMs, l2.startMs); });
test('ASR halucinacija ne kvari poravnanje', () => assert.strictEqual(l1.matchedWordsRatio, 1));
test('lineId ostaje jedinstven', () => assert.notStrictEqual(l2.lineId, l4.lineId));
test('wordsMatch fuzzy', () => { assert.strictEqual(wordsMatch('volim','volim'), true); assert.strictEqual(wordsMatch('volim','volem'), true); assert.strictEqual(wordsMatch('volim','mrzim'), false); });
test('prazan ASR niz ravnomerno deli raspoloživo trajanje između svih linija', () => {
  const r = alignLyrics(parsed.lines, [], { totalDurationMs: 8000 });
  assert.strictEqual(r.lines.every(x => x.needsReview), true);
  assert.strictEqual(r.overallConfidence, 0);
  assert.deepStrictEqual(r.lines.map(x => [x.startMs, x.endMs]), [[0,2000],[2000,4000],[4000,6000],[6000,8000]]);
  assert.strictEqual(r.lines.every(x => x.endMs > x.startMs), true);
});
test('dve uzastopne nepoklopljene linije dele gap umesto da druga dobije nulto trajanje', () => {
  const lines = [
    { lineId:'a', text:'prva' }, { lineId:'b', text:'druga nema match' },
    { lineId:'c', text:'treca nema match' }, { lineId:'d', text:'četvrta' }
  ];
  const r = alignLyrics(lines, [w('prva',0,1), w('četvrta',5,6)], { totalDurationMs:7000 });
  assert.deepStrictEqual([r.lines[1].startMs, r.lines[1].endMs, r.lines[2].startMs, r.lines[2].endMs], [1000,3000,3000,5000]);
});
test('words[] vremena', () => { assert.strictEqual(l1.words.length,4); assert.deepStrictEqual(l1.words[0],{text:'sanjam',startMs:0,endMs:500,confidence:0.95}); });
test('words[] sortiran', () => { for(let i=1;i<l2.words.length;i++) assert.ok(l2.words[i].startMs>=l2.words[i-1].startMs); });
test('nepoklopljena linija nema izmišljene reči', () => assert.deepStrictEqual(l3.words, []));
test('overallConfidence opada', () => { const partial=alignLyrics(parsed.lines,asrWords.slice(0,4),{totalDurationMs:9000}); assert.ok(partial.overallConfidence<result.overallConfidence); });

test('normalizeAsrToken odbacuje NaN, negativne i obrnute ASR timestampove', () => {
  assert.strictEqual(normalizeAsrToken({word:'x',start:NaN,end:1}), null);
  assert.strictEqual(normalizeAsrToken({word:'x',start:-1,end:1}), null);
  assert.strictEqual(normalizeAsrToken({word:'x',start:2,end:1}), null);
  assert.deepStrictEqual(normalizeAsrToken({word:'reč',start:0,end:0.5,probability:0.8}), {word:'reč',startMs:0,endMs:500,probability:0.8});
});

test('interpolateUnmatchedGroups raspodeljuje ceo interval bez rupa', () => {
  const rows = [
    {startMs:null,endMs:null},{startMs:null,endMs:null},{startMs:null,endMs:null}
  ];
  interpolateUnmatchedGroups(rows, 3000);
  assert.deepStrictEqual(rows.map(x => [x.startMs,x.endMs]), [[0,1000],[1000,2000],[2000,3000]]);
});

// Direktni ugovorni testovi svih pomoćnih exporta — da nijedna javna funkcija ne ostane neizvršena.
test('tokenizeWords čuva srpska slova i uklanja interpunkciju', () => {
  const tokens = tokenizeWords('  Volim, te!  Noćas. ');
  assert.deepStrictEqual(tokens, ['volim','te','noćas']);
});
test('levenshtein proverava osnovne distance i prazne stringove', () => {
  assert.strictEqual(levenshtein('volim','volim'),0);
  assert.strictEqual(levenshtein('volim','volem'),1);
  assert.strictEqual(levenshtein('','abc'),3);
  assert.strictEqual(levenshtein('abc',''),3);
});
test('alignSequences vraća monotono LCS poravnanje', () => {
  const canonical = [{word:'ja'},{word:'te'},{word:'volim'},{word:'ja'},{word:'te'},{word:'volim'}];
  const asr = [{word:'ja'},{word:'te'},{word:'volim'},{word:'x'},{word:'ja'},{word:'te'},{word:'volim'}];
  const matches = alignSequences(canonical, asr);
  assert.strictEqual(matches.length, 6);
  for (let i=1;i<matches.length;i++) {
    assert.ok(matches[i].canonicalIndex > matches[i-1].canonicalIndex);
    assert.ok(matches[i].asrIndex > matches[i-1].asrIndex);
  }
});

test('alignLyrics odbija pogrešan tip ulaza jasnom greškom', () => {
  assert.throws(() => alignLyrics(null, []), /lines mora biti niz/);
  assert.throws(() => alignLyrics([], {}), /asrWords mora biti niz/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
