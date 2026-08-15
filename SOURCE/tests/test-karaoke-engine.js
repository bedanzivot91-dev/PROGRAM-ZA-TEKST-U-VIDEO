'use strict';
// Testira karaoke-engine.js — sekcije 9-10 dodatka (karaoke word-highlighting, multi-track kombinovanje).
const assert = require('assert');
const { createTextTrack, createCue } = require('../PROGRAM - NE BRISATI/text-overlay-models');
const { getWordState, getWordProgress, buildKaraokeFrame, combineActiveTracksAtTime, estimateWordTimings } = require('../PROGRAM - NE BRISATI/karaoke-engine');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== KaraokeEngine testovi ==');

const word = { text: 'sanjam', startMs: 1000, endMs: 2000 };

test('getWordState vraća pending pre početka reči', () => {
  assert.strictEqual(getWordState(word, 500), 'pending');
});
test('getWordState vraća active unutar trajanja reči', () => {
  assert.strictEqual(getWordState(word, 1500), 'active');
});
test('getWordState vraća completed posle kraja reči', () => {
  assert.strictEqual(getWordState(word, 2500), 'completed');
});

test('getWordProgress raste od 0 do 1 tokom trajanja aktivne reči', () => {
  assert.strictEqual(getWordProgress(word, 1000), 0);
  assert.strictEqual(getWordProgress(word, 1500), 0.5);
  assert.ok(getWordProgress(word, 1999.999999) > 0.999);
});
test('getWordProgress vraća 0 pre i 1 posle reči', () => {
  assert.strictEqual(getWordProgress(word, 500), 0);
  assert.strictEqual(getWordProgress(word, 3000), 1);
});

test('buildKaraokeFrame vraća active:false van trajanja cue-a', () => {
  const cue = createCue({ trackId: 't1', startMs: 1000, endMs: 3000, text: 'sanjam noćas', words: [{ text: 'sanjam', startMs: 1000, endMs: 1800 }, { text: 'noćas', startMs: 1800, endMs: 3000 }] });
  const frame = buildKaraokeFrame(cue, 500);
  assert.strictEqual(frame.active, false);
});

test('buildKaraokeFrame koristi PRAVI word-level timing kada postoji (wordTimingSource=aligned)', () => {
  const cue = createCue({ trackId: 't1', startMs: 1000, endMs: 3000, text: 'sanjam noćas', words: [{ text: 'sanjam', startMs: 1000, endMs: 1800 }, { text: 'noćas', startMs: 1800, endMs: 3000 }] });
  const frame = buildKaraokeFrame(cue, 1200);
  assert.strictEqual(frame.active, true);
  assert.strictEqual(frame.wordTimingSource, 'aligned');
  assert.strictEqual(frame.words[0].state, 'active');
  assert.strictEqual(frame.words[1].state, 'pending');
});

test('buildKaraokeFrame PRAVI boje odgovaraju stanju reči prema karaokeStyle', () => {
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 2000, text: 'a b', words: [{ text: 'a', startMs: 0, endMs: 1000 }, { text: 'b', startMs: 1000, endMs: 2000 }] });
  const style = { preActiveColor: '#111111', activeColor: '#222222', completedColor: '#333333' };
  const frame = buildKaraokeFrame(cue, 500, style);
  assert.strictEqual(frame.words[0].color, '#222222'); // 'a' je active
  assert.strictEqual(frame.words[1].color, '#111111'); // 'b' je pending
});

test('buildKaraokeFrame ISKRENO pada na estimated timing kada nema words[] (ravnomerna raspodela, ne lažna preciznost)', () => {
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 4000, text: 'sanjam noćas o tebi' }); // bez words
  const frame = buildKaraokeFrame(cue, 500);
  assert.strictEqual(frame.wordTimingSource, 'estimated');
  assert.strictEqual(frame.words.length, 4);
});

test('estimateWordTimings ravnomerno deli trajanje cue-a na reči', () => {
  const cue = { startMs: 0, endMs: 4000, text: 'jedan dva tri četiri' };
  const timings = estimateWordTimings(cue);
  assert.strictEqual(timings.length, 4);
  assert.strictEqual(timings[0].startMs, 0);
  assert.strictEqual(timings[0].endMs, 1000);
  assert.strictEqual(timings[3].endMs, 4000);
});

test('combineActiveTracksAtTime vraća VIŠE istovremeno aktivnih track-ova (original + prevod)', () => {
  const lyricsTrack = createTextTrack({ type: 'lyrics', zIndex: 1 });
  lyricsTrack.cues.push(createCue({ trackId: lyricsTrack.trackId, startMs: 1000, endMs: 3000, text: 'Sanjam noćas' }));
  const translationTrack = createTextTrack({ type: 'translation', zIndex: 2 });
  translationTrack.cues.push(createCue({ trackId: translationTrack.trackId, startMs: 1000, endMs: 3000, text: 'I dream tonight' }));

  const active = combineActiveTracksAtTime([lyricsTrack, translationTrack], 1500);
  assert.strictEqual(active.length, 2);
  assert.strictEqual(active[0].type, 'lyrics'); // zIndex 1 pre zIndex 2
  assert.strictEqual(active[1].type, 'translation');
});

test('combineActiveTracksAtTime PRESKAČE onemogućene (disabled) track-ove', () => {
  const track = createTextTrack({ type: 'lyrics' });
  track.enabled = false;
  track.cues.push(createCue({ trackId: track.trackId, startMs: 0, endMs: 5000, text: 'x' }));
  assert.deepStrictEqual(combineActiveTracksAtTime([track], 1000), []);
});

test('combineActiveTracksAtTime PRESKAČE soft-deleted cue-ove', () => {
  const track = createTextTrack({ type: 'lyrics' });
  const cue = createCue({ trackId: track.trackId, startMs: 0, endMs: 5000, text: 'x' });
  cue.deleted = true;
  track.cues.push(cue);
  assert.deepStrictEqual(combineActiveTracksAtTime([track], 1000), []);
});

test('combineActiveTracksAtTime vraća prazan niz kada nijedan cue nije aktivan u datom trenutku', () => {
  const track = createTextTrack({ type: 'lyrics' });
  track.cues.push(createCue({ trackId: track.trackId, startMs: 5000, endMs: 6000, text: 'x' }));
  assert.deepStrictEqual(combineActiveTracksAtTime([track], 1000), []);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
