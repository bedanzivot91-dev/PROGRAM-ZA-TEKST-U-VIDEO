'use strict';
// Testira text-overlay-models.js — TextTrack/Cue/Style modeli za "Tekst na videu" modul.
const assert = require('assert');
const { createTextTrack, createCue, validateCue, validateTrack, createStyle, TRACK_TYPES } = require('../PROGRAM - NE BRISATI/text-overlay-models');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TextOverlayModels testovi ==');

test('createTextTrack pravi validan track sa jedinstvenim trackId', () => {
  const t1 = createTextTrack({ type: 'lyrics' });
  const t2 = createTextTrack({ type: 'lyrics' });
  assert.strictEqual(t1.type, 'lyrics');
  assert.strictEqual(t1.enabled, true);
  assert.notStrictEqual(t1.trackId, t2.trackId);
});

test('createTextTrack odbija nepoznat tip', () => {
  assert.throws(() => createTextTrack({ type: 'nepostojeci' }), /Nepoznat tip track-a/);
});

test('svi tipovi iz spec-a (lyrics/translation/title/artist/section/custom/credits) rade', () => {
  for (const type of TRACK_TYPES) {
    assert.doesNotThrow(() => createTextTrack({ type }));
  }
});

test('createCue pravi cue sa words[] i podrazumevanim placement objektom', () => {
  const cue = createCue({ trackId: 't1', startMs: 1000, endMs: 3000, text: 'Sanjam noćas', timingSource: 'forced_alignment', confidence: 0.9 });
  assert.strictEqual(cue.startMs, 1000);
  assert.strictEqual(cue.endMs, 3000);
  assert.strictEqual(cue.needsReview, false);
  assert.strictEqual(cue.manualLocked, false);
  assert.ok(cue.placement);
  assert.strictEqual(cue.placement.anchor, 'bottom-center');
});

test('createCue sa niskim confidence automatski dobija needsReview=true', () => {
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 1000, text: 'x', confidence: 0.3 });
  assert.strictEqual(cue.needsReview, true);
});

test('validateCue odbija endMs <= startMs', () => {
  const cue = createCue({ trackId: 't1', startMs: 5000, endMs: 5000, text: 'x' });
  const result = validateCue(cue);
  assert.strictEqual(result.valid, false);
});

test('validateCue odbija cue koji izlazi van trajanja audio-fajla', () => {
  const cue = createCue({ trackId: 't1', startMs: 1000, endMs: 9000, text: 'x' });
  const result = validateCue(cue, { totalDurationMs: 5000 });
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems[0].includes('trajanja'));
});

test('validateCue prihvata cue koji je unutar trajanja', () => {
  const cue = createCue({ trackId: 't1', startMs: 1000, endMs: 4000, text: 'x' });
  const result = validateCue(cue, { totalDurationMs: 5000 });
  assert.strictEqual(result.valid, true);
});

test('validateCue odbija reč čije vreme izlazi van granica cue-a', () => {
  const cue = createCue({
    trackId: 't1', startMs: 1000, endMs: 2000, text: 'reč',
    words: [{ text: 'reč', startMs: 500, endMs: 900 }] // pre pocetka cue-a
  });
  const result = validateCue(cue);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('van granica')));
});

test('validateTrack agregira probleme iz svih NEOBRISANIH cue-ova', () => {
  const track = createTextTrack({ type: 'lyrics' });
  track.cues.push(createCue({ trackId: track.trackId, startMs: 0, endMs: 1000, text: 'ok' }));
  const badCue = createCue({ trackId: track.trackId, startMs: 5000, endMs: 4000, text: 'losa' });
  track.cues.push(badCue);
  const result = validateTrack(track);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.problems.length, 1);
});

test('validateTrack IGNORIŠE soft-deleted cue-ove', () => {
  const track = createTextTrack({ type: 'lyrics' });
  const badCue = createCue({ trackId: track.trackId, startMs: 5000, endMs: 4000, text: 'losa' });
  badCue.deleted = true;
  track.cues.push(badCue);
  const result = validateTrack(track);
  assert.strictEqual(result.valid, true);
});

test('createStyle vraća moderan podrazumevan stil (nije starinski font/boja)', () => {
  const style = createStyle();
  assert.strictEqual(style.font.family, 'Inter');
  assert.strictEqual(style.color.solid, '#FFFFFF');
  assert.strictEqual(style.outline.enabled, true);
});

test('createStyle prihvata override-ove bez gubljenja ostalih podrazumevanih vrednosti', () => {
  const style = createStyle({ name: 'Moj Stil', color: { mode: 'solid', solid: '#FF0000', opacity: 1 } });
  assert.strictEqual(style.name, 'Moj Stil');
  assert.strictEqual(style.color.solid, '#FF0000');
  assert.strictEqual(style.font.family, 'Inter'); // ostatak i dalje podrazumevan
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
