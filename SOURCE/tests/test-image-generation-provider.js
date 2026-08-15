'use strict';
// Testira image-generation-provider.js — FinalPromptBuilder (sekcija 21.2) i generički
// ImageGenerationProvider ugovor (sekcija 16). Unakrsno proverava da izlaz PROLAZI
// tattoo-visibility.js validaciju — dve odvojene celine moraju biti međusobno konzistentne.
const assert = require('assert');
const { buildFinalImagePrompt, buildImageGenerationRequest } = require('../PROGRAM - NE BRISATI/image-generation-provider');
const { validateSceneTattooVisibility } = require('../PROGRAM - NE BRISATI/tattoo-visibility');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ImageGenerationProvider / FinalPromptBuilder testovi ==');

const identity = { positive: 'LOCKED_POSITIVE_TEXT', negative: 'LOCKED_NEGATIVE_TEXT' };
const baseScene = {
  sceneId: 'scene-001',
  scenePrompt: 'woman walking through a neon-lit street at night',
  sceneNegativePrompt: 'blurry',
  wardrobe: 'modern black leather jacket, dark jeans',
  locationDescription: 'urban street, neon signs',
  action: 'walking slowly toward camera',
  emotion: 'confident, calm',
  composition: 'rule of thirds, subject slightly left',
  foreground: 'wet asphalt reflections',
  midground: 'the woman',
  background: 'blurred neon storefronts',
  lighting: 'cool neon rim light',
  palette: ['deep blue', 'magenta', 'black'],
  shotType: 'medium shot',
  lens: '35mm',
  continuityNotes: ['same jacket as previous scene']
};

test('finalPrompt počinje TAČNO zaključanim identitetom (prvi element u nizu)', () => {
  const { finalPrompt } = buildFinalImagePrompt(baseScene, identity);
  assert.ok(finalPrompt.startsWith('LOCKED_POSITIVE_TEXT'));
});

test('finalNegativePrompt počinje zaključanim negative identitetom', () => {
  const { finalNegativePrompt } = buildFinalImagePrompt(baseScene, identity);
  assert.ok(finalNegativePrompt.startsWith('LOCKED_NEGATIVE_TEXT'));
});

test('finalPrompt sadrži sve delove scene (garderoba, lokacija, akcija, emocija, svetlo, boje)', () => {
  const { finalPrompt } = buildFinalImagePrompt(baseScene, identity);
  for (const fragment of ['leather jacket', 'neon-lit street', 'walking slowly', 'confident', 'neon rim light', 'deep blue']) {
    assert.ok(finalPrompt.includes(fragment), `nedostaje fragment: "${fragment}"`);
  }
});

test('nedostajući identity.positive baca grešku (FinalPromptBuilder ne radi bez zaključanog identiteta)', () => {
  assert.throws(() => buildFinalImagePrompt(baseScene, {}), /Identity\.positive je obavezan/);
  assert.throws(() => buildFinalImagePrompt(baseScene, null), /Identity\.positive je obavezan/);
});

test('finalNegativePrompt uvek zabranjuje tekst/logo/watermark', () => {
  const { finalNegativePrompt } = buildFinalImagePrompt(baseScene, identity);
  assert.ok(finalNegativePrompt.includes('watermark'));
});

test('tattooVisibility="visible" — finalPrompt sadrži opis tetovaže I PROLAZI tattoo-visibility validaciju', () => {
  const scene = { ...baseScene, tattooVisibility: 'visible' };
  const { finalPrompt } = buildFinalImagePrompt(scene, identity);
  assert.ok(/tattoo/i.test(finalPrompt));
  const validation = validateSceneTattooVisibility({ tattooVisibility: 'visible', finalPrompt });
  assert.strictEqual(validation.valid, true, `unakrsna validacija nije prošla: ${JSON.stringify(validation.problems)}`);
});

test('tattooVisibility="hidden" — finalPrompt NE sadrži pominjanje tetovaže I PROLAZI validaciju', () => {
  const scene = { ...baseScene, tattooVisibility: 'hidden' };
  const { finalPrompt } = buildFinalImagePrompt(scene, identity);
  assert.ok(!/mini mouse tattoo/i.test(finalPrompt));
  const validation = validateSceneTattooVisibility({ tattooVisibility: 'hidden', finalPrompt });
  assert.strictEqual(validation.valid, true, `unakrsna validacija nije prošla: ${JSON.stringify(validation.problems)}`);
});

test('buildImageGenerationRequest vraća kompletan strukturiran zahtev sa razumnim podrazumevanim vrednostima', () => {
  const request = buildImageGenerationRequest(baseScene, identity, { provider: 'comfyui', seed: 42 });
  assert.strictEqual(request.sceneId, 'scene-001');
  assert.strictEqual(request.seed, 42);
  assert.strictEqual(request.provider, 'comfyui');
  assert.strictEqual(request.consistencyStrength, 0.7);
  assert.deepStrictEqual(request.referenceImages, []);
  assert.ok(request.prompt.startsWith('LOCKED_POSITIVE_TEXT'));
});

test('buildImageGenerationRequest prihvata referenceImages i faceIdentityReference kada su prosleđeni', () => {
  const request = buildImageGenerationRequest(baseScene, identity, { referenceImages: ['ref1.png'], faceIdentityReference: 'face-ref.png', consistencyStrength: 0.85 });
  assert.deepStrictEqual(request.referenceImages, ['ref1.png']);
  assert.strictEqual(request.faceIdentityReference, 'face-ref.png');
  assert.strictEqual(request.consistencyStrength, 0.85);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
