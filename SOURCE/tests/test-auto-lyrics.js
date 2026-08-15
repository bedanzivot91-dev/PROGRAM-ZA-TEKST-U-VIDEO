'use strict';
// Testira auto-lyrics.js — sekcija 9.2 (automatsko pisanje teksta kada ga korisnik nema).
// buildLyricsFromSegments() je čista funkcija (bez I/O), testirana sa RUČNO konstruisanim
// ASR segmentima gde su pauze i ponavljanja unapred poznati, da se tačno proveri grupisanje
// u blokove po pauzi i prepoznavanje ponovljenog refrena. autoWriteLyrics() (I/O orkestracija)
// testira se preko stvarne fallback putanje (transkripcija nije instalirana na ovoj mašini).
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const { buildLyricsFromSegments } = require('../PROGRAM - NE BRISATI/auto-lyrics');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}
async function testAsync(label, fn) {
  try { await fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== AutoLyrics testovi ==');

function seg(start, end, text) { return { start, end, text }; }

const segments = [
  seg(0.0, 1.5, 'Sanjam noćas o tebi'),
  seg(1.6, 3.0, 'Dok grad spava'), // mala pauza (0.1s) — isti blok
  // pauza 2.0s > 1.6s prag — novi blok
  seg(5.0, 6.5, 'Volim te više nego ikad'),
  seg(6.7, 7.5, 'Zauvek'), // mala pauza (0.2s) — isti blok
  // pauza 2.5s — novi blok
  seg(10.0, 11.0, 'Nova zora dolazi'),
  // pauza 3.0s — novi blok
  seg(14.0, 15.5, 'Volim te više nego ikad'), // ponavlja blok 2 (refren)
  seg(15.7, 16.5, 'Zauvek')
];

const result = buildLyricsFromSegments(segments, { detectedLanguage: 'sr', baseConfidence: 0.75 });

test('deli segmente u blokove po pauzi > 1.6s (4 bloka/sekcije)', () => {
  assert.strictEqual(result.sections.length, 4);
});

test('prvo pojavljivanje refrena ostaje [Verse], drugo (ponovljeno) postaje [Chorus]', () => {
  assert.strictEqual(result.sections[1].type, 'verse', 'prvo pojavljivanje "volim te..." nije prepoznato kao ponavljanje unapred');
  assert.strictEqual(result.sections[3].type, 'chorus', 'ponovljeni blok mora biti prepoznat kao refren');
});

test('formattedLyrics sadrži čitljiv tekst sa section tagovima', () => {
  assert.ok(result.formattedLyrics.includes('[Chorus]'));
  assert.ok(result.formattedLyrics.includes('Sanjam noćas o tebi'));
});

test('rawTranscription sadrži sav tekst spojen bez tagova', () => {
  assert.ok(result.rawTranscription.includes('Sanjam noćas o tebi'));
  assert.ok(!result.rawTranscription.includes('['));
});

test('needsReview je UVEK true za automatski izvučen tekst (pravilo 9.2 — nikad 100% pouzdano)', () => {
  assert.strictEqual(result.needsReview, true);
});

test('linije dobijaju startMs/endMs iz stvarnih ASR vremena segmenata', () => {
  const firstLine = result.lines[0];
  assert.strictEqual(firstLine.startMs, 0);
  assert.strictEqual(firstLine.endMs, 1500);
});

test('prazan niz segmenata ne baca grešku, vraća prazan ali validan rezultat', () => {
  const empty = buildLyricsFromSegments([]);
  assert.strictEqual(empty.sections.length, 0);
  assert.strictEqual(empty.needsReview, true);
});

test('segmenti van redosleda (nesortirani ulaz) se ipak ispravno sortiraju po vremenu', () => {
  const shuffled = [segments[2], segments[0], segments[1]];
  const shuffledResult = buildLyricsFromSegments(shuffled);
  assert.strictEqual(shuffledResult.lines[0].text, 'Sanjam noćas o tebi');
});

async function main() {
  const { autoWriteLyrics } = require('../PROGRAM - NE BRISATI/auto-lyrics');
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-autolyrics-test-'));
  process.env.MSS_DATA_DIR = testDataDir;
  const fakeAudio = path.join(testDataDir, 'song.mp3');
  fs.writeFileSync(fakeAudio, 'placeholder');

  await testAsync('autoWriteLyrics() gracefully degradira kada ni stem separation ni transkripcija nisu instalirani', async () => {
    const result = await autoWriteLyrics(fakeAudio, 'test-hash-autolyrics');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'faster_whisper_not_installed');
  });

  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  delete process.env.MSS_DATA_DIR;

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
