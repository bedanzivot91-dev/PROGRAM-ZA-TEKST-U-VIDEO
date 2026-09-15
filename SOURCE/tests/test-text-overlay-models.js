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

test('createCue odbija words koji nije niz umesto tihog gubitka karaoke podataka', () => {
  assert.throws(() => createCue({ trackId: 't1', startMs: 0, endMs: 1000, text: 'x', words: 'nije-niz' }), /words mora biti niz/);
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
    words: [{ text: 'reč', startMs: 500, endMs: 900 }]
  });
  const result = validateCue(cue);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('van granica')));
});

test('validateCue odbija NaN/missing word timing umesto da ga propusti kao validan', () => {
  const cue = createCue({
    trackId: 't1', startMs: 1000, endMs: 2000, text: 'reč',
    words: [{ text: 'reč', startMs: undefined, endMs: 1500 }]
  });
  const result = validateCue(cue);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('validne startMs/endMs')));
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

test('validateTrack odbija neispravan track/cues umesto TypeError rušenja', () => {
  const result = validateTrack({ trackId: 'track-x', cues: null });
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('cues niz')));
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
  assert.strictEqual(style.font.family, 'Inter');
});

test('createStyle DEEPLY spaja parcijalni nested override i ne briše weight/fallback/opacity', () => {
  const style = createStyle({ font: { family: 'Georgia' }, color: { solid: '#00FF00' }, shadow: { blur: 12 } });
  assert.strictEqual(style.font.family, 'Georgia');
  assert.strictEqual(style.font.weight, 700);
  assert.strictEqual(style.font.fallback, 'Arial');
  assert.strictEqual(style.color.solid, '#00FF00');
  assert.strictEqual(style.color.opacity, 1);
  assert.strictEqual(style.shadow.blur, 12);
  assert.strictEqual(style.shadow.enabled, true);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
