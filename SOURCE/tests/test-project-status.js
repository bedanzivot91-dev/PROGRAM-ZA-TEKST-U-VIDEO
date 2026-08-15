'use strict';
// Testira project-status.js — sekcija 23, status kartice na "MOJI SPOTOVI" strani.
const assert = require('assert');
const { STATUS, computeProjectStatus, computeOverallProgress } = require('../PROGRAM - NE BRISATI/project-status');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ProjectStatus testovi ==');

test('nov projekat bez audio fajla → novi_projekat', () => {
  assert.strictEqual(computeProjectStatus({ progress: {} }), STATUS.NEW);
});

test('projekat sa audio ali bez teksta → analiza_u_toku', () => {
  assert.strictEqual(computeProjectStatus({ audio: {}, progress: {} }), STATUS.ANALYZING);
});

test('tekst postoji ali needsReview=true → tekst_trazi_proveru', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: true }, progress: {} };
  assert.strictEqual(computeProjectStatus(project), STATUS.LYRICS_NEEDS_REVIEW);
});

test('tekst potvrđen ali nema izabranog koncepta → ceka_izbor_koncepta', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, progress: {} };
  assert.strictEqual(computeProjectStatus(project), STATUS.WAITING_CONCEPT);
});

test('koncept izabran ali nema storyboard scena → storyboard_trazi_potvrdu', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, activeConceptId: 'concept-1', progress: {} };
  assert.strictEqual(computeProjectStatus(project), STATUS.STORYBOARD_NEEDS_CONFIRM);
});

test('storyboard postoji ali nije potvrđen od korisnika → storyboard_zavrsen', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, activeConceptId: 'c1', storyboard: { scenes: [{ sceneId: 's1' }] }, progress: {} };
  assert.strictEqual(computeProjectStatus(project), STATUS.STORYBOARD_DONE);
});

test('storyboard potvrđen, image prompts nisu 100% → promptovi_u_toku', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, activeConceptId: 'c1', storyboard: { scenes: [{ sceneId: 's1' }] }, storyboardConfirmed: true, progress: { imagePrompts: 40 } };
  assert.strictEqual(computeProjectStatus(project), STATUS.IMAGE_PROMPTS_IN_PROGRESS);
});

test('image prompts 100%, slike nisu → slike_u_toku', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, activeConceptId: 'c1', storyboard: { scenes: [{ sceneId: 's1' }] }, storyboardConfirmed: true, progress: { imagePrompts: 100, images: 20 } };
  assert.strictEqual(computeProjectStatus(project), STATUS.IMAGES_IN_PROGRESS);
});

test('sve gotovo → spreman_za_montazu', () => {
  const project = { audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, activeConceptId: 'c1', storyboard: { scenes: [{ sceneId: 's1' }] }, storyboardConfirmed: true, progress: { imagePrompts: 100, images: 100, videoPrompts: 100 } };
  assert.strictEqual(computeProjectStatus(project), STATUS.READY_FOR_EDIT);
});

test('arhiviran projekat uvek vraća arhiviran, bez obzira na napredak', () => {
  const project = { archived: true, audio: {}, lyrics: { lines: [{ lineId: 'l1' }], needsReview: false }, progress: { imagePrompts: 100, images: 100, videoPrompts: 100 } };
  assert.strictEqual(computeProjectStatus(project), STATUS.ARCHIVED);
});

test('projekat sa lastError vraća greska (osim ako je arhiviran)', () => {
  assert.strictEqual(computeProjectStatus({ lastError: 'nešto je pošlo naopako', progress: {} }), STATUS.ERROR);
});

test('nedostajući projekat (null/undefined) ne baca grešku', () => {
  assert.strictEqual(computeProjectStatus(null), STATUS.NEW);
  assert.strictEqual(computeProjectStatus(undefined), STATUS.NEW);
});

test('computeOverallProgress računa prost prosek svih progress polja', () => {
  const progress = { audio: 100, lyrics: 100, alignment: 0, storyboard: 0, imagePrompts: 0, images: 0, videoPrompts: 0 };
  assert.strictEqual(computeOverallProgress({ progress }), Math.round(200 / 7));
});

test('computeOverallProgress bez progress polja vraća 0 umesto NaN/greške', () => {
  assert.strictEqual(computeOverallProgress({}), 0);
  assert.strictEqual(computeOverallProgress(null), 0);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
