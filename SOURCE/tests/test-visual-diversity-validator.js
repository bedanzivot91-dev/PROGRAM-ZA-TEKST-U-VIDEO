'use strict';
// Testira visual-diversity-validator.js — sekcija 20.
const assert = require('assert');
const { buildVisualSignature, validateVisualDiversity } = require('../PROGRAM - NE BRISATI/visual-diversity-validator');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== VisualDiversityValidator testovi ==');

test('buildVisualSignature izvlači sva potrebna polja iz scene', () => {
  const scene = { locationId: 'l1', outfitId: 'o1', shotType: 'wide', lens: '35mm', angle: 'eye-level', pose: 'standing', action: 'walking', lighting: 'natural', palette: ['blue', 'gray'], symbol: 'rain', composition: 'centered' };
  const signature = buildVisualSignature(scene);
  assert.strictEqual(signature.shot, 'wide');
  assert.strictEqual(signature.palette, 'blue,gray');
});

test('isti shot type u 3 UZASTOPNE scene se odbija (dozvoljeno najviše 2)', () => {
  const scenes = [
    { sceneId: 's1', shotType: 'close-up' },
    { sceneId: 's2', shotType: 'close-up' },
    { sceneId: 's3', shotType: 'close-up' }
  ];
  const result = validateVisualDiversity(scenes);
  assert.strictEqual(result.valid, false);
});

test('isti shot type u 2 uzastopne scene je dozvoljen', () => {
  const scenes = [
    { sceneId: 's1', shotType: 'close-up' },
    { sceneId: 's2', shotType: 'close-up' },
    { sceneId: 's3', shotType: 'wide' }
  ];
  const result = validateVisualDiversity(scenes);
  assert.strictEqual(result.valid, true);
});

test('isti shot type koji se PREKIDA pa se vraća (nije 3 UZASTOPNE) je dozvoljen', () => {
  const scenes = [
    { sceneId: 's1', shotType: 'close-up' },
    { sceneId: 's2', shotType: 'wide' },
    { sceneId: 's3', shotType: 'close-up' }
  ];
  const result = validateVisualDiversity(scenes);
  assert.strictEqual(result.valid, true);
});

test('identična poza+radnja ponovljena bez opravdanja se hvata', () => {
  const scenes = [
    { sceneId: 's1', pose: 'standing', action: 'looking at camera' },
    { sceneId: 's2', pose: 'walking', action: 'toward camera' },
    { sceneId: 's3', pose: 'standing', action: 'looking at camera' }
  ];
  const result = validateVisualDiversity(scenes);
  assert.strictEqual(result.valid, false);
});

test('identična poza+radnja sa repeatJustified=true je dozvoljena', () => {
  const scenes = [
    { sceneId: 's1', pose: 'standing', action: 'looking at camera' },
    { sceneId: 's2', pose: 'walking', action: 'toward camera' },
    { sceneId: 's3', pose: 'standing', action: 'looking at camera', repeatJustified: true }
  ];
  const result = validateVisualDiversity(scenes);
  assert.strictEqual(result.valid, true);
});

test('prazan niz scena se odbija sa jasnom porukom', () => {
  const result = validateVisualDiversity([]);
  assert.strictEqual(result.valid, false);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
