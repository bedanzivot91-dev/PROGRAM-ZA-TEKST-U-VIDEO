'use strict';
// Testira ai-response-validator.js — sekcije 21.1/21.2/21.5/22. Pokriva SVU eksplicitnu listu
// grešaka koje ručni JSON uvoz mora da prepozna (sekcija 22): nedostajuće/duple/nepoznate scene,
// pogrešna vremena, pogrešan batchId, nedostajući sceneId, kršenje zaključanog identiteta.
const assert = require('assert');
const { validateConceptsResponse, validateStoryboardResponse, validatePromptBatchResponse, MAIN_CHARACTER_ID } = require('../PROGRAM - NE BRISATI/ai-response-validator');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== AI Response Validator testovi ==');

function validConcepts() {
  return {
    concepts: [
      { id: 'concept-1', title: 'A', summary: 's', story: 'st', visualStyle: 'v' },
      { id: 'concept-2', title: 'B', summary: 's', story: 'st', visualStyle: 'v' },
      { id: 'concept-3', title: 'C', summary: 's', story: 'st', visualStyle: 'v' }
    ],
    recommendedConceptId: 'concept-2'
  };
}

test('validan odgovor sa tačno 3 koncepta prolazi', () => {
  assert.strictEqual(validateConceptsResponse(validConcepts()).valid, true);
});

test('manje/više od 3 koncepta se odbija', () => {
  const twoConcepts = validConcepts(); twoConcepts.concepts.pop();
  assert.strictEqual(validateConceptsResponse(twoConcepts).valid, false);
});

test('koncept bez obaveznog polja (npr. visualStyle) se odbija', () => {
  const bad = validConcepts(); delete bad.concepts[0].visualStyle;
  const result = validateConceptsResponse(bad);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('visualStyle')));
});

test('recommendedConceptId koji se ne poklapa ni sa jednim conceptId se odbija', () => {
  const bad = validConcepts(); bad.recommendedConceptId = 'concept-999';
  assert.strictEqual(validateConceptsResponse(bad).valid, false);
});

test('null/nedefinisan odgovor se ne ruši, vraća jasnu grešku', () => {
  assert.strictEqual(validateConceptsResponse(null).valid, false);
  assert.strictEqual(validateConceptsResponse(undefined).valid, false);
});

function validStoryboard() {
  return {
    conceptId: 'concept-2', totalDurationMs: 10000,
    scenes: [
      { sceneId: 'scene-001', number: 1, startMs: 0, endMs: 5000, characterIds: [MAIN_CHARACTER_ID] },
      { sceneId: 'scene-002', number: 2, startMs: 5000, endMs: 10000, characterIds: [MAIN_CHARACTER_ID] }
    ]
  };
}

test('validan storyboard prolazi', () => {
  const result = validateStoryboardResponse(validStoryboard());
  assert.strictEqual(result.valid, true, JSON.stringify(result.problems));
});

test('scena bez sceneId (nedostajući sceneId) se odbija', () => {
  const bad = validStoryboard(); delete bad.scenes[0].sceneId;
  const result = validateStoryboardResponse(bad);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('sceneId')));
});

test('duplirana scena (isti sceneId dva puta) se odbija', () => {
  const bad = validStoryboard(); bad.scenes[1].sceneId = 'scene-001';
  const result = validateStoryboardResponse(bad);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('Duplirana')));
});

test('pogrešno vreme (endMs <= startMs) se odbija', () => {
  const bad = validStoryboard(); bad.scenes[0].endMs = 0;
  const result = validateStoryboardResponse(bad);
  assert.strictEqual(result.valid, false);
});

test('scena BEZ glavne devojke u characterIds — kršenje zaključanog identiteta — se odbija', () => {
  const bad = validStoryboard(); bad.scenes[0].characterIds = ['some-other-character'];
  const result = validateStoryboardResponse(bad);
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('zaključani identitet')));
});

test('totalDurationMs koji se ne poklapa sa stvarnim trajanjem audio-fajla se odbija', () => {
  const bad = validStoryboard();
  const result = validateStoryboardResponse(bad, { expectedTotalDurationMs: 99999 });
  assert.strictEqual(result.valid, false);
});

test('storyboard bez scena se odbija sa jasnom porukom', () => {
  assert.strictEqual(validateStoryboardResponse({ scenes: [] }).valid, false);
});

function validImageBatch() {
  return { batchId: 'image-batch-001', items: [{ sceneId: 'scene-001', scenePrompt: 'a prompt' }, { sceneId: 'scene-002', scenePrompt: 'another' }] };
}

test('validan image prompt batch prolazi', () => {
  assert.strictEqual(validatePromptBatchResponse(validImageBatch(), { expectedBatchId: 'image-batch-001' }).valid, true);
});

test('pogrešan batchId se odbija', () => {
  const result = validatePromptBatchResponse(validImageBatch(), { expectedBatchId: 'image-batch-002' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('batchId')));
});

test('batch sa VIŠE od 5 stavki se odbija', () => {
  const big = { batchId: 'b1', items: Array.from({ length: 6 }, (_, i) => ({ sceneId: `s${i}`, scenePrompt: 'x' })) };
  const result = validatePromptBatchResponse(big, { expectedBatchId: 'b1' });
  assert.strictEqual(result.valid, false);
});

test('video batch proverava videoPrompt polje umesto scenePrompt', () => {
  const videoBatch = { batchId: 'video-batch-001', items: [{ sceneId: 'scene-001', videoPrompt: 'motion description' }] };
  assert.strictEqual(validatePromptBatchResponse(videoBatch, { expectedBatchId: 'video-batch-001', batchType: 'video' }).valid, true);
  const missingPrompt = { batchId: 'video-batch-001', items: [{ sceneId: 'scene-001', scenePrompt: 'ovo je pogrešno polje za video' }] };
  assert.strictEqual(validatePromptBatchResponse(missingPrompt, { expectedBatchId: 'video-batch-001', batchType: 'video' }).valid, false);
});

test('nepoznat sceneId u batch-u (ne postoji u storyboard-u) se odbija kada je knownSceneIds prosleđen', () => {
  const batch = { batchId: 'b1', items: [{ sceneId: 'scene-999', scenePrompt: 'x' }] };
  const result = validatePromptBatchResponse(batch, { expectedBatchId: 'b1', knownSceneIds: new Set(['scene-001', 'scene-002']) });
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems.some(p => p.includes('nepoznat sceneId')));
});

test('duplirana scena UNUTAR istog batch-a se hvata', () => {
  const batch = { batchId: 'b1', items: [{ sceneId: 'scene-001', scenePrompt: 'x' }, { sceneId: 'scene-001', scenePrompt: 'y' }] };
  const result = validatePromptBatchResponse(batch, { expectedBatchId: 'b1' });
  assert.strictEqual(result.valid, false);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
