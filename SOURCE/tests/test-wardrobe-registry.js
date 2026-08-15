'use strict';
// Testira wardrobe-registry.js — sekcija 18.
const assert = require('assert');
const { createWardrobeRegistry, registerOutfitUsage, validateWardrobeDiversity, isOldFashioned } = require('../PROGRAM - NE BRISATI/wardrobe-registry');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== WardrobeRegistry testovi ==');

test('isti opis outfita (po normalizaciji) vraća isti outfitId', () => {
  const registry = createWardrobeRegistry();
  const id1 = registerOutfitUsage(registry, { description: 'Crna kožna jakna, farmerke' }, 'scene-001');
  const id2 = registerOutfitUsage(registry, { description: 'crna kožna jakna, farmerke' }, 'scene-003');
  assert.strictEqual(id1, id2);
});

test('isOldFashioned prepoznaje starinske/vintage opise', () => {
  assert.strictEqual(isOldFashioned('vintage 1920s flapper dress'), true);
  assert.strictEqual(isOldFashioned('modern black leather jacket'), false);
});

test('starinska garderoba bez istorijskog koncepta se odbija', () => {
  const registry = createWardrobeRegistry();
  const id = registerOutfitUsage(registry, { description: 'vintage Victorian era gown' }, 'scene-001');
  const result = validateWardrobeDiversity(registry, [{ sceneId: 'scene-001', outfitId: id }], { conceptIsHistorical: false });
  assert.strictEqual(result.valid, false);
});

test('starinska garderoba SA istorijskim konceptom je dozvoljena', () => {
  const registry = createWardrobeRegistry();
  const id = registerOutfitUsage(registry, { description: 'vintage Victorian era gown' }, 'scene-001');
  const result = validateWardrobeDiversity(registry, [{ sceneId: 'scene-001', outfitId: id }], { conceptIsHistorical: true });
  assert.strictEqual(result.valid, true);
});

test('outfit ponovljen 3+ puta BEZ continuity grupe se odbija', () => {
  const registry = createWardrobeRegistry();
  const id = registerOutfitUsage(registry, { description: 'modern denim outfit' }, 'scene-001');
  registerOutfitUsage(registry, { description: 'modern denim outfit' }, 'scene-005');
  registerOutfitUsage(registry, { description: 'modern denim outfit' }, 'scene-009');
  const scenes = [{ sceneId: 'scene-001', outfitId: id }, { sceneId: 'scene-005', outfitId: id }, { sceneId: 'scene-009', outfitId: id }];
  const result = validateWardrobeDiversity(registry, scenes);
  assert.strictEqual(result.valid, false);
});

test('outfit ponovljen 3+ puta SA istim continuityGroupId je dozvoljen (namerni kontinuitet)', () => {
  const registry = createWardrobeRegistry();
  const id = registerOutfitUsage(registry, { description: 'modern denim outfit', continuityGroupId: 'story-arc-1' }, 'scene-001');
  registerOutfitUsage(registry, { description: 'modern denim outfit' }, 'scene-005');
  registerOutfitUsage(registry, { description: 'modern denim outfit' }, 'scene-009');
  const scenes = [
    { sceneId: 'scene-001', outfitId: id, continuityGroupId: 'story-arc-1' },
    { sceneId: 'scene-005', outfitId: id, continuityGroupId: 'story-arc-1' },
    { sceneId: 'scene-009', outfitId: id, continuityGroupId: 'story-arc-1' }
  ];
  const result = validateWardrobeDiversity(registry, scenes);
  assert.strictEqual(result.valid, true);
});

test('moderna, raznovrsna garderoba bez ponavljanja prolazi bez problema', () => {
  const registry = createWardrobeRegistry();
  const scenes = [];
  for (let i = 0; i < 4; i += 1) {
    const id = registerOutfitUsage(registry, { description: `Moderan outfit ${i}` }, `scene-${i}`);
    scenes.push({ sceneId: `scene-${i}`, outfitId: id });
  }
  const result = validateWardrobeDiversity(registry, scenes);
  assert.strictEqual(result.valid, true);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
