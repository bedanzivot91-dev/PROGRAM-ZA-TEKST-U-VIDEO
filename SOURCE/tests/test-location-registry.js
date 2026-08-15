'use strict';
// Testira location-registry.js — sekcija 17. Ključno pravilo: "tačno ista lokacija se
// podrazumevano ne koristi ponovo", ponovna upotreba dozvoljena SAMO uz jasan razlog.
const assert = require('assert');
const { createLocationRegistry, registerLocationUsage, validateLocationDiversity, normalizedSignature } = require('../PROGRAM - NE BRISATI/location-registry');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== LocationRegistry testovi ==');

test('registrovanje iste lokacije (po signature) vraća ISTI locationId', () => {
  const registry = createLocationRegistry();
  const id1 = registerLocationUsage(registry, { name: 'Krovna terasa', type: 'rooftop', interiorExterior: 'exterior' }, 'scene-001');
  const id2 = registerLocationUsage(registry, { name: 'Krovna terasa', type: 'rooftop', interiorExterior: 'exterior' }, 'scene-005');
  assert.strictEqual(id1, id2);
  assert.strictEqual(registry.byId[id1].usageCount, 2);
});

test('različite lokacije dobijaju različite locationId', () => {
  const registry = createLocationRegistry();
  const id1 = registerLocationUsage(registry, { name: 'Krovna terasa', type: 'rooftop' }, 'scene-001');
  const id2 = registerLocationUsage(registry, { name: 'Podzemna garaža', type: 'garage' }, 'scene-002');
  assert.notStrictEqual(id1, id2);
});

test('uzastopne scene na istoj lokaciji BEZ razloga se odbijaju', () => {
  const registry = createLocationRegistry();
  const id = registerLocationUsage(registry, { name: 'Studio', type: 'studio' }, 'scene-001');
  registerLocationUsage(registry, { name: 'Studio', type: 'studio' }, 'scene-002');
  const scenes = [{ sceneId: 'scene-001', locationId: id }, { sceneId: 'scene-002', locationId: id }];
  const result = validateLocationDiversity(registry, scenes);
  assert.strictEqual(result.valid, false);
});

test('uzastopne scene na istoj lokaciji SA validnim razlogom (npr. direct_continuity) prolaze (u realnom broju scena, ne 100% udela)', () => {
  const registry = createLocationRegistry();
  const id = registerLocationUsage(registry, { name: 'Studio', type: 'studio' }, 'scene-001');
  registerLocationUsage(registry, { name: 'Studio', type: 'studio' }, 'scene-002');
  const scenes = [
    { sceneId: 'scene-001', locationId: id },
    { sceneId: 'scene-002', locationId: id, reuseReason: 'direct_continuity' },
    { sceneId: 'scene-003', locationId: 'other-loc-1' },
    { sceneId: 'scene-004', locationId: 'other-loc-2' },
    { sceneId: 'scene-005', locationId: 'other-loc-3' }
  ];
  const result = validateLocationDiversity(registry, scenes);
  assert.strictEqual(result.valid, true, `neočekivani problemi: ${JSON.stringify(result.problems)}`);
});

test('lokacija korišćena previše puta (>=3x) se označava kao previše korišćena', () => {
  const registry = createLocationRegistry();
  const id = registerLocationUsage(registry, { name: 'Hodnik', type: 'corridor' }, 'scene-001');
  registerLocationUsage(registry, { name: 'Hodnik', type: 'corridor' }, 'scene-005');
  registerLocationUsage(registry, { name: 'Hodnik', type: 'corridor' }, 'scene-010');
  const scenes = Array.from({ length: 10 }, (_, i) => ({ sceneId: `scene-${i}`, locationId: i % 5 === 0 ? id : `other-${i}` }));
  const result = validateLocationDiversity(registry, scenes);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('previše korišćena')));
});

test('normalizedSignature ignoriše velika/mala slova i dijakritike pri poređenju', () => {
  const sig1 = normalizedSignature({ name: 'Krovna Terasa', type: 'ROOFTOP' });
  const sig2 = normalizedSignature({ name: 'krovna terasa', type: 'rooftop' });
  assert.strictEqual(sig1, sig2);
});

test('nekoliko različitih lokacija bez ponavljanja prolazi validaciju bez problema', () => {
  const registry = createLocationRegistry();
  const scenes = [];
  for (let i = 0; i < 5; i += 1) {
    const id = registerLocationUsage(registry, { name: `Lokacija ${i}`, type: 'unique' }, `scene-${i}`);
    scenes.push({ sceneId: `scene-${i}`, locationId: id });
  }
  const result = validateLocationDiversity(registry, scenes);
  assert.strictEqual(result.valid, true);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
