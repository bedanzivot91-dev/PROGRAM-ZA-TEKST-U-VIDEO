'use strict';
// Testira timeline-validator.js — sekcija 14, poslednja odbrana pre prikaza timeline-a.
const assert = require('assert');
const { validateTimeline } = require('../PROGRAM - NE BRISATI/timeline-validator');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TimelineValidator testovi ==');

test('ispravan, uzastopan timeline prolazi validaciju', () => {
  const scenes = [
    { sceneId: 's1', startMs: 0, endMs: 4000, durationMs: 4000 },
    { sceneId: 's2', startMs: 4000, endMs: 9000, durationMs: 5000 },
    { sceneId: 's3', startMs: 9000, endMs: 10000, durationMs: 1000 }
  ];
  const result = validateTimeline(scenes, 10000);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.problems, []);
});

test('prva scena koja ne počinje na 0 se odbija', () => {
  const scenes = [{ sceneId: 's1', startMs: 500, endMs: 5000, durationMs: 4500 }];
  const result = validateTimeline(scenes, 5000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('ne počinje na 0')));
});

test('poslednja scena koja se ne poklapa sa stvarnim trajanjem se odbija', () => {
  const scenes = [{ sceneId: 's1', startMs: 0, endMs: 4000, durationMs: 4000 }];
  const result = validateTimeline(scenes, 10000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('stvarnim trajanjem')));
});

test('praznina između scena se otkriva', () => {
  const scenes = [
    { sceneId: 's1', startMs: 0, endMs: 3000, durationMs: 3000 },
    { sceneId: 's2', startMs: 3500, endMs: 10000, durationMs: 6500 }
  ];
  const result = validateTimeline(scenes, 10000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('Praznina')));
});

test('preklapanje između scena se otkriva', () => {
  const scenes = [
    { sceneId: 's1', startMs: 0, endMs: 5000, durationMs: 5000 },
    { sceneId: 's2', startMs: 4000, endMs: 10000, durationMs: 6000 }
  ];
  const result = validateTimeline(scenes, 10000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('Preklapanje')));
});

test('dupliran sceneId se otkriva', () => {
  const scenes = [
    { sceneId: 'dup', startMs: 0, endMs: 5000, durationMs: 5000 },
    { sceneId: 'dup', startMs: 5000, endMs: 10000, durationMs: 5000 }
  ];
  const result = validateTimeline(scenes, 10000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('Dupliran sceneId')));
});

test('odstupanje unutar tolerancije zaokruživanja (≤10ms) se PRIHVATA', () => {
  const scenes = [
    { sceneId: 's1', startMs: 0, endMs: 4996, durationMs: 4996 },
    { sceneId: 's2', startMs: 5000, endMs: 10000, durationMs: 5000 } // 4ms "praznina", unutar tolerancije
  ];
  const result = validateTimeline(scenes, 10003); // 3ms odstupanje na kraju, unutar tolerancije
  assert.strictEqual(result.valid, true);
});

test('durationMs koji se ne slaže sa endMs-startMs se otkriva', () => {
  const scenes = [{ sceneId: 's1', startMs: 0, endMs: 5000, durationMs: 3000 }];
  const result = validateTimeline(scenes, 5000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('durationMs')));
});

test('prazan niz scena se odbija sa jasnom porukom', () => {
  const result = validateTimeline([], 10000);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.length > 0);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
