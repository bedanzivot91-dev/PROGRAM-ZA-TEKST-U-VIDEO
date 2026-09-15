'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// storage-paths.js čita MSS_DATA_DIR pri require-u, zato se izolovani test folder postavlja PRE modula.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-project-state-'));
process.env.MSS_DATA_DIR = DATA_DIR;
const audioProjects = require('../PROGRAM - NE BRISATI/audio-projects');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.stack || error.message}`); }
}

console.log('== Audio project state / batch regresioni testovi ==');

test('stripAlignmentFromLyrics uklanja vremena stare pesme, ali čuva korisnički tekst', () => {
  const source = {
    lyricsSource: 'user', overallConfidence: 0.8, needsReview: false,
    lines: [{ lineId: 'l1', text: 'Isti tekst', startMs: 100, endMs: 900, words: [{ text: 'Isti', startMs: 100, endMs: 400 }], alignmentConfidence: 0.9, matchedWordsRatio: 1, source: 'asr_words' }]
  };
  const clean = audioProjects.stripAlignmentFromLyrics(source);
  assert.strictEqual(clean.lines[0].text, 'Isti tekst');
  assert.strictEqual('startMs' in clean.lines[0], false);
  assert.strictEqual('endMs' in clean.lines[0], false);
  assert.strictEqual('words' in clean.lines[0], false);
});

test('resetStoryboardAndPromptState stvarno briše ceo downstream pipeline', () => {
  const project = { progress: { audio: 100, lyrics: 100, alignment: 100, storyboard: 100, imagePrompts: 100, images: 50, videoPrompts: 100 } };
  const reset = audioProjects.resetStoryboardAndPromptState(project, { lyrics: 100, alignment: 0 });
  assert.strictEqual(reset.storyboard, null);
  assert.deepStrictEqual(reset.imagePrompts, {});
  assert.deepStrictEqual(reset.videoPrompts, {});
  assert.strictEqual(reset.imageBatchQueue, null);
  assert.strictEqual(reset.videoBatchQueue, null);
  assert.strictEqual(reset.progress.storyboard, 0);
  assert.strictEqual(reset.progress.imagePrompts, 0);
  assert.strictEqual(reset.progress.videoPrompts, 0);
  assert.strictEqual(reset.progress.lyrics, 100);
});

test('izmena lyrics-a uklanja storyboard i AI promptove izvedene iz starog teksta', () => {
  const project = audioProjects.createProject({ name: 'Stale lyrics test' });
  audioProjects.updateProject(project.projectId, {
    storyboard: { scenes: [{ sceneId: 'old-scene', startMs: 0, endMs: 5000 }] },
    imagePrompts: { 'old-scene': { finalPrompt: 'stari prompt' } },
    videoPrompts: { 'old-scene': { videoPrompt: 'stari video prompt' } },
    imageBatchQueue: { stale: true }, videoBatchQueue: { stale: true },
    progress: { ...project.progress, lyrics: 100, alignment: 100, storyboard: 100, imagePrompts: 100, videoPrompts: 100 }
  });
  const updated = audioProjects.setProjectLyrics(project.projectId, '[Verse]\nNovi tekst pesme');
  assert.strictEqual(updated.storyboard, null);
  assert.deepStrictEqual(updated.imagePrompts, {});
  assert.deepStrictEqual(updated.videoPrompts, {});
  assert.strictEqual(updated.progress.alignment, 0);
  assert.strictEqual(updated.progress.storyboard, 0);
});

test('ponovljen next-batch pre submit-a vraća ISTI batchId i iste scene', () => {
  const project = audioProjects.createProject({ name: 'Idempotent batch' });
  const scenes = Array.from({ length: 6 }, (_, index) => ({
    sceneId: `scene-${String(index + 1).padStart(3, '0')}`,
    number: index + 1,
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
    durationMs: 1000,
    cutReason: 'test'
  }));
  audioProjects.updateProject(project.projectId, { storyboard: { scenes }, progress: { ...project.progress, storyboard: 100 } });
  const first = audioProjects.getNextImagePromptBatch(project.projectId);
  const second = audioProjects.getNextImagePromptBatch(project.projectId);
  assert.strictEqual(first.batchId, second.batchId);
  assert.deepStrictEqual(first.sceneIds, second.sceneIds);
  assert.strictEqual(first.sceneIds.length, 5);
});

test('image submit odbija scenu koja postoji u storyboardu ali NIJE deo aktivnog batch-a', () => {
  const project = audioProjects.listProjects({ search: 'Idempotent batch' })[0];
  const active = audioProjects.getNextImagePromptBatch(project.projectId);
  assert.throws(
    () => audioProjects.submitImagePromptBatch(project.projectId, {
      batchId: active.batchId,
      items: [{ sceneId: 'scene-006', scenePrompt: 'ovo nije deo prvog batch-a' }]
    }),
    error => error && error.code === 'INVALID_AI_RESPONSE'
  );
});

test('uspešan image submit čisti aktivni batch i sledeći batch nastavlja sa preostalom scenom', () => {
  const project = audioProjects.listProjects({ search: 'Idempotent batch' })[0];
  const active = audioProjects.getNextImagePromptBatch(project.projectId);
  const submitted = audioProjects.submitImagePromptBatch(project.projectId, {
    batchId: active.batchId,
    items: active.sceneIds.map(sceneId => ({ sceneId, scenePrompt: `realistična scena ${sceneId}`, sceneNegativePrompt: 'blurry' }))
  });
  assert.deepStrictEqual(submitted.activeImageBatchSceneIds, []);
  assert.strictEqual(submitted.lastImageBatchId, null);
  const next = audioProjects.getNextImagePromptBatch(project.projectId);
  assert.deepStrictEqual(next.sceneIds, ['scene-006']);
});

test('delimičan odgovor vraća izostavljene scene u retry umesto da ih zauvek zaglavi', () => {
  const project = audioProjects.createProject({ name: 'Partial batch' });
  const scenes = ['a', 'b', 'c'].map((suffix, index) => ({ sceneId: `scene-${suffix}`, number: index + 1, startMs: index * 1000, endMs: (index + 1) * 1000, durationMs: 1000 }));
  audioProjects.updateProject(project.projectId, { storyboard: { scenes } });
  const batch = audioProjects.getNextImagePromptBatch(project.projectId);
  audioProjects.submitImagePromptBatch(project.projectId, { batchId: batch.batchId, items: [{ sceneId: batch.sceneIds[0], scenePrompt: 'samo jedna scena' }] });
  const retry = audioProjects.getNextImagePromptBatch(project.projectId);
  assert.deepStrictEqual(retry.sceneIds.sort(), batch.sceneIds.slice(1).sort());
});

test('regeneracija storyboarda briše image/video promptove vezane za stare scene', () => {
  const project = audioProjects.createProject({ name: 'Storyboard replacement' });
  audioProjects.updateProject(project.projectId, {
    audioHash: 'a'.repeat(64),
    audio: { storedFileName: 'fake.mp3', durationMs: 10000 },
    storyboard: { scenes: [{ sceneId: 'stara', startMs: 0, endMs: 10000, durationMs: 10000 }] },
    imagePrompts: { stara: { finalPrompt: 'staro' } },
    videoPrompts: { stara: { videoPrompt: 'staro' } },
    imageBatchQueue: { stale: true }, videoBatchQueue: { stale: true }
  });
  const replanned = audioProjects.planProjectScenes(project.projectId, { preferredAverageSceneDuration: 5000, minimumSceneDuration: 1000, maximumSceneDuration: 10000 });
  assert.ok(replanned.storyboard.scenes.length >= 1);
  assert.deepStrictEqual(replanned.imagePrompts, {});
  assert.deepStrictEqual(replanned.videoPrompts, {});
  assert.strictEqual(replanned.imageBatchQueue, null);
  assert.strictEqual(replanned.videoBatchQueue, null);
});

test('listProjectBackupsFor za validan ali nepostojeći UUID vraća PROJECT_NOT_FOUND', () => {
  assert.throws(
    () => audioProjects.listProjectBackupsFor('00000000-0000-0000-0000-000000000000'),
    error => error && error.code === 'PROJECT_NOT_FOUND'
  );
});

try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
