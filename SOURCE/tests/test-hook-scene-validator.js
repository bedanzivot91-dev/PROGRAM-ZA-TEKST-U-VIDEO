'use strict';
// Testira hook-scene-validator.js — sekcija 19.
const assert = require('assert');
const { validateHookScenes } = require('../PROGRAM - NE BRISATI/hook-scene-validator');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== HookSceneValidator testovi ==');

test('scena bez hookType/hookDescription se odbija (prazna scena bez radnje ili značenja)', () => {
  const result = validateHookScenes([{ sceneId: 's1', hookType: '', hookDescription: '' }]);
  assert.strictEqual(result.valid, false);
});

test('prve tri scene sa TRI RAZLIČITA hook tipa prolaze', () => {
  const scenes = [
    { sceneId: 's1', hookType: 'emotion', hookDescription: 'a' },
    { sceneId: 's2', hookType: 'action', hookDescription: 'b' },
    { sceneId: 's3', hookType: 'symbol', hookDescription: 'c' }
  ];
  const result = validateHookScenes(scenes);
  assert.strictEqual(result.valid, true);
});

test('prve tri scene sa ISTIM hook tipom se odbijaju (generičan uvod)', () => {
  const scenes = [
    { sceneId: 's1', hookType: 'emotion', hookDescription: 'a' },
    { sceneId: 's2', hookType: 'emotion', hookDescription: 'b' },
    { sceneId: 's3', hookType: 'emotion', hookDescription: 'c' }
  ];
  const result = validateHookScenes(scenes);
  assert.strictEqual(result.valid, false);
});

test('identičan generički hook opis ponovljen u više scena se hvata', () => {
  const scenes = [
    { sceneId: 's1', hookType: 'emotion', hookDescription: 'devojka stoji i gleda kroz prozor' },
    { sceneId: 's2', hookType: 'action', hookDescription: 'nešto drugo' },
    { sceneId: 's3', hookType: 'symbol', hookDescription: 'devojka stoji i gleda kroz prozor' }
  ];
  const result = validateHookScenes(scenes);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('generički')));
});

test('finalni refren SLABIJI od prvog refrena (hookScore) se odbija — mora biti vrhunac', () => {
  const scenes = [
    { sceneId: 's1', hookType: 'a', hookDescription: 'x', sectionType: 'chorus', hookScore: 0.8 },
    { sceneId: 's2', hookType: 'b', hookDescription: 'y', sectionType: 'final_chorus', hookScore: 0.5 }
  ];
  const result = validateHookScenes(scenes);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('vrhunac')));
});

test('finalni refren JAČI od prvog refrena prolazi', () => {
  const scenes = [
    { sceneId: 's1', hookType: 'a', hookDescription: 'x', sectionType: 'chorus', hookScore: 0.6 },
    { sceneId: 's2', hookType: 'b', hookDescription: 'y', sectionType: 'final_chorus', hookScore: 0.9 }
  ];
  const result = validateHookScenes(scenes);
  assert.strictEqual(result.valid, true);
});

test('prazan niz scena se odbija sa jasnom porukom', () => {
  const result = validateHookScenes([]);
  assert.strictEqual(result.valid, false);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
