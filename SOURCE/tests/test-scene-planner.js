'use strict';
// Testira scene-planner.js — sekcija 13. Ključni zahtev: DP mora birati rezove po KVALITETU
// (refren/bridge/sekcija > obična reč), NE po pravilu "svaka scena 5 sekundi", i rezultat mora
// UVEK proći stroge timeline-validator.js provere (sekcija 14) bez obzira na ulaz.
const assert = require('assert');
const { planScenes } = require('../PROGRAM - NE BRISATI/scene-planner');
const { validateTimeline } = require('../PROGRAM - NE BRISATI/timeline-validator');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ScenePlanner testovi ==');

test('ručno proverljiv scenario: DP bira JAK kandidat (refren) umesto dva slaba kandidata istog broja', () => {
  // 10s pesma. Refren na 5000ms savršeno deli pesmu na dve scene od po 5000ms (= preferredAverageSceneDuration,
  // penalty=0). Dva slaba kandidata (3000, 7000) bi dali gore trajanja I nižu sumu skorova (10+10=20 << 100).
  const candidates = [
    { timeMs: 3000, type: 'regular_beat' },
    { timeMs: 5000, type: 'chorus_start' },
    { timeMs: 7000, type: 'regular_beat' }
  ];
  const { scenes } = planScenes(10000, candidates, { preferredAverageSceneDuration: 5000, minimumSceneDuration: 1000, maximumSceneDuration: 9000 });
  assert.strictEqual(scenes.length, 2, `očekivane tačno 2 scene (jedan rez na refrenu), dobijeno ${scenes.length}`);
  assert.strictEqual(scenes[0].endMs, 5000);
  assert.strictEqual(scenes[1].startMs, 5000);
  assert.strictEqual(scenes[0].cutReason, 'chorus_start');
});

test('prva scena UVEK počinje na 0, poslednja UVEK na stvarnom trajanju (bez obzira na kandidate)', () => {
  const { scenes } = planScenes(15000, [{ timeMs: 6000, type: 'verse_start' }], {});
  assert.strictEqual(scenes[0].startMs, 0);
  assert.strictEqual(scenes[scenes.length - 1].endMs, 15000);
});

test('bez ijednog kandidata (prazan niz) i dalje vraća validan timeline (cela pesma kao jedna scena)', () => {
  const { scenes } = planScenes(8000, [], {});
  assert.strictEqual(scenes.length, 1);
  assert.strictEqual(scenes[0].startMs, 0);
  assert.strictEqual(scenes[0].endMs, 8000);
});

test('rezultat UVEK prolazi stroge timeline-validator.js provere', () => {
  const candidates = [
    { timeMs: 2200, type: 'downbeat' }, { timeMs: 4800, type: 'verse_start' },
    { timeMs: 9100, type: 'chorus_start' }, { timeMs: 9150, type: 'downbeat' }, // klaster blizu refrena
    { timeMs: 14000, type: 'bridge_start' }, { timeMs: 17200, type: 'section_start' },
    { timeMs: 20500, type: 'final_chorus_start' }, { timeMs: 26000, type: 'strong_onset' }
  ];
  const { scenes } = planScenes(30000, candidates, { preferredAverageSceneDuration: 4800, minimumSceneDuration: 1200, maximumSceneDuration: 8000 });
  const validation = validateTimeline(scenes, 30000);
  assert.strictEqual(validation.valid, true, `validacija nije prošla: ${JSON.stringify(validation.problems)}`);
});

test('broj scena NIJE unapred fiksiran — različit broj kandidata daje različit broj scena', () => {
  const few = planScenes(20000, [{ timeMs: 10000, type: 'chorus_start' }], { minimumSceneDuration: 1000, maximumSceneDuration: 15000 });
  const many = planScenes(20000, [
    { timeMs: 3000, type: 'verse_start' }, { timeMs: 7000, type: 'chorus_start' },
    { timeMs: 11000, type: 'section_start' }, { timeMs: 15000, type: 'bridge_start' }
  ], { minimumSceneDuration: 1000, maximumSceneDuration: 8000 });
  assert.notStrictEqual(few.scenes.length, many.scenes.length);
});

test('preferredSceneCount i editingIntensity se prihvataju bez greške i utiču na settings', () => {
  const calm = planScenes(20000, [{ timeMs: 10000, type: 'chorus_start' }], { editingIntensity: 'calm', preferredAverageSceneDuration: 5000 });
  const dynamic = planScenes(20000, [{ timeMs: 10000, type: 'chorus_start' }], { editingIntensity: 'dynamic', preferredAverageSceneDuration: 5000 });
  assert.ok(calm.settings.preferredAverageSceneDuration > dynamic.settings.preferredAverageSceneDuration, 'calm mora imati duže preferirano trajanje scene od dynamic');
});

test('klasterovani kandidati blizu jedan drugom (npr. downbeat + section_start u istom trenutku) ne stvaraju mikro-scenu', () => {
  const candidates = [
    { timeMs: 5000, type: 'section_start' },
    { timeMs: 5080, type: 'downbeat' } // 80ms razlike — isti trenutak za praktične svrhe
  ];
  const { scenes } = planScenes(10000, candidates, { minimumSceneDuration: 1000, maximumSceneDuration: 9000 });
  const hasMicroScene = scenes.some(s => s.durationMs < 500);
  assert.strictEqual(hasMicroScene, false, 'klasterovani kandidati ne smeju praviti scenu kraću od 500ms');
});

test('nevalidno totalDurationMs baca jasnu grešku umesto tihog pada', () => {
  assert.throws(() => planScenes(-5, [], {}), /pozitivan broj/);
  assert.throws(() => planScenes(NaN, [], {}), /pozitivan broj/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
