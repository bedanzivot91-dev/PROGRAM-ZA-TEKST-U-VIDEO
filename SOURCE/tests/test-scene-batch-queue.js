'use strict';
// Testira scene-batch-queue.js — sekcija 21.3. Ključna provera: batch nikad ne prelazi 5 scena,
// restart mora nastaviti od poslednjeg stanja (queue je čist serijalizabilan objekat).
const assert = require('assert');
const { createBatchQueue, getNextBatch, getBatchForSceneIds, markPrompted, lockScenePrompt, markFailed, skipScene, unlockScenePrompt, queueSummary } = require('../PROGRAM - NE BRISATI/scene-batch-queue');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== SceneBatchQueue testovi ==');

function sceneIds(n) { return Array.from({ length: n }, (_, i) => `scene-${String(i + 1).padStart(3, '0')}`); }

test('prvi batch od 12 scena vraća TAČNO prvih 5, u originalnom redosledu', () => {
  const queue = createBatchQueue(sceneIds(12));
  const batch = getNextBatch(queue);
  assert.deepStrictEqual(batch, ['scene-001', 'scene-002', 'scene-003', 'scene-004', 'scene-005']);
});

test('posle zaključavanja prvih 5, sledeći batch vraća scene 6-10', () => {
  const queue = createBatchQueue(sceneIds(12));
  for (const id of getNextBatch(queue)) lockScenePrompt(queue, id);
  const nextBatch = getNextBatch(queue);
  assert.deepStrictEqual(nextBatch, ['scene-006', 'scene-007', 'scene-008', 'scene-009', 'scene-010']);
});

test('poslednji, nepotpun batch (manje od 5 preostalih) vraća samo preostale scene', () => {
  const queue = createBatchQueue(sceneIds(7));
  for (const id of getNextBatch(queue)) lockScenePrompt(queue, id); // zaključava prvih 5
  const lastBatch = getNextBatch(queue);
  assert.deepStrictEqual(lastBatch, ['scene-006', 'scene-007']);
});

test('neuspela scena (markFailed) ostaje AKTIVNA — vraća se u sledećem getNextBatch pozivu (ponovi neuspele)', () => {
  const queue = createBatchQueue(sceneIds(5));
  markFailed(queue, 'scene-003', 'AI odgovor nije validan JSON.');
  const batch = getNextBatch(queue);
  assert.ok(batch.includes('scene-003'));
  assert.strictEqual(queue.scenes['scene-003'].attempts, 1);
  assert.strictEqual(queue.scenes['scene-003'].lastError, 'AI odgovor nije validan JSON.');
});

test('preskočena scena (skipScene) se VIŠE NE vraća u getNextBatch ("jedna scena može da se ponovi/preskoči")', () => {
  const queue = createBatchQueue(sceneIds(5));
  skipScene(queue, 'scene-002');
  const batch = getNextBatch(queue);
  assert.ok(!batch.includes('scene-002'));
});

test('getBatchForSceneIds odbija batch veći od 5 scena', () => {
  const queue = createBatchQueue(sceneIds(10));
  assert.throws(() => getBatchForSceneIds(queue, sceneIds(6)), /više od 5/);
});

test('getBatchForSceneIds odbija nepoznat sceneId', () => {
  const queue = createBatchQueue(sceneIds(3));
  assert.throws(() => getBatchForSceneIds(queue, ['scene-999']), /Nepoznati sceneId/);
});

test('unlockScenePrompt vraća zaključanu scenu na pending (za IZMENU prompta)', () => {
  const queue = createBatchQueue(sceneIds(3));
  lockScenePrompt(queue, 'scene-001');
  assert.strictEqual(queue.scenes['scene-001'].status, 'locked');
  unlockScenePrompt(queue, 'scene-001');
  assert.strictEqual(queue.scenes['scene-001'].status, 'pending');
});

test('queueSummary tačno broji statuse i procenat napretka', () => {
  const queue = createBatchQueue(sceneIds(10));
  for (const id of ['scene-001', 'scene-002']) lockScenePrompt(queue, id);
  skipScene(queue, 'scene-003');
  markFailed(queue, 'scene-004', 'greška');
  const summary = queueSummary(queue);
  assert.strictEqual(summary.total, 10);
  assert.strictEqual(summary.locked, 2);
  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(summary.failed, 1);
  assert.strictEqual(summary.pending, 6);
  assert.strictEqual(summary.done, 3); // locked+skipped
  assert.strictEqual(summary.progressPercent, 30);
  assert.strictEqual(summary.complete, false);
});

test('kada su SVE scene locked ili skipped, queueSummary.complete je true', () => {
  const queue = createBatchQueue(sceneIds(3));
  lockScenePrompt(queue, 'scene-001');
  lockScenePrompt(queue, 'scene-002');
  skipScene(queue, 'scene-003');
  assert.strictEqual(queueSummary(queue).complete, true);
});

test('RESTART sigurnost: queue je čist serijalizabilan objekat, JSON round-trip čuva potpuno stanje', () => {
  const queue = createBatchQueue(sceneIds(8));
  for (const id of getNextBatch(queue)) lockScenePrompt(queue, id);
  markFailed(queue, 'scene-006', 'privremena greška');

  const serialized = JSON.stringify(queue);
  const restored = JSON.parse(serialized); // simulira ponovno učitavanje iz project.json posle restarta

  assert.deepStrictEqual(getNextBatch(restored), getNextBatch(queue));
  assert.strictEqual(restored.scenes['scene-006'].attempts, 1);
  assert.strictEqual(queueSummary(restored).locked, 5);
});

test('markPrompted i pojedinačno praćenje verzije prompta (promptVersion raste pri svakom zaključavanju)', () => {
  const queue = createBatchQueue(sceneIds(2));
  markPrompted(queue, 'scene-001');
  assert.strictEqual(queue.scenes['scene-001'].status, 'prompted');
  lockScenePrompt(queue, 'scene-001');
  assert.strictEqual(queue.scenes['scene-001'].promptVersion, 1);
  unlockScenePrompt(queue, 'scene-001');
  lockScenePrompt(queue, 'scene-001');
  assert.strictEqual(queue.scenes['scene-001'].promptVersion, 2);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
