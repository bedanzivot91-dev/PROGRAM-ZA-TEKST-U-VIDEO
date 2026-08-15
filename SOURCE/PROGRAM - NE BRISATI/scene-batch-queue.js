'use strict';

// Sekcija 21.3: batch sistem od 5 scena za AI most. "Jedan zahtev sadrži najviše 5 scena koje
// nemaju zaključan image prompt." Prati status po sceni: pending/prompted/locked/failed/skipped,
// broj pokušaja, poslednju grešku — restart MORA nastaviti od poslednjeg stanja, ne ispočetka.

const BATCH_SIZE = 5;
const ACTIVE_STATUSES = new Set(['pending', 'failed']); // scene koje i dalje čekaju na batch

function createBatchQueue(sceneIds) {
  const scenes = {};
  for (const sceneId of sceneIds) {
    scenes[sceneId] = { sceneId, status: 'pending', attempts: 0, lastError: null, promptVersion: 0, lockedAt: null };
  }
  return { order: [...sceneIds], scenes };
}

function assertKnownScene(queue, sceneId) {
  if (!queue.scenes[sceneId]) throw new Error(`Nepoznat sceneId u redu: "${sceneId}".`);
}

// Vraća sledećih najviše `batchSize` scena koje NEMAJU zaključan prompt — poštuje ORIGINALNI
// redosled scena (batch 1-5, pa 6-10, itd.), ne proizvoljan.
function getNextBatch(queue, batchSize = BATCH_SIZE) {
  return queue.order.filter(id => ACTIVE_STATUSES.has(queue.scenes[id].status)).slice(0, batchSize);
}

function getBatchForSceneIds(queue, sceneIds) {
  const unknown = sceneIds.filter(id => !queue.scenes[id]);
  if (unknown.length) throw new Error(`Nepoznati sceneId-jevi: ${unknown.join(', ')}.`);
  if (sceneIds.length > BATCH_SIZE) throw new Error(`Batch ne sme imati više od ${BATCH_SIZE} scena (poslato ${sceneIds.length}).`);
  return sceneIds;
}

function markPrompted(queue, sceneId) {
  assertKnownScene(queue, sceneId);
  queue.scenes[sceneId].status = 'prompted';
  return queue;
}

function lockScenePrompt(queue, sceneId) {
  assertKnownScene(queue, sceneId);
  const scene = queue.scenes[sceneId];
  scene.status = 'locked';
  scene.promptVersion += 1;
  scene.lockedAt = new Date().toISOString();
  scene.lastError = null;
  return queue;
}

function markFailed(queue, sceneId, errorMessage) {
  assertKnownScene(queue, sceneId);
  const scene = queue.scenes[sceneId];
  scene.status = 'failed';
  scene.attempts += 1;
  scene.lastError = errorMessage || 'Nepoznata greška.';
  return queue;
}

function skipScene(queue, sceneId) {
  assertKnownScene(queue, sceneId);
  queue.scenes[sceneId].status = 'skipped';
  return queue;
}

// Vraća zaključan prompt na ponovno čekanje — korisnik traži IZMENU prompta (dugme "IZMENI PROMPT").
function unlockScenePrompt(queue, sceneId) {
  assertKnownScene(queue, sceneId);
  queue.scenes[sceneId].status = 'pending';
  return queue;
}

function queueSummary(queue) {
  const counts = { pending: 0, prompted: 0, locked: 0, failed: 0, skipped: 0 };
  for (const scene of Object.values(queue.scenes)) counts[scene.status] = (counts[scene.status] || 0) + 1;
  const total = queue.order.length;
  const done = counts.locked + counts.skipped;
  return { total, ...counts, done, complete: total > 0 && done === total, progressPercent: total ? Math.round((done / total) * 100) : 0 };
}

module.exports = { BATCH_SIZE, createBatchQueue, getNextBatch, getBatchForSceneIds, markPrompted, lockScenePrompt, markFailed, skipScene, unlockScenePrompt, queueSummary };
