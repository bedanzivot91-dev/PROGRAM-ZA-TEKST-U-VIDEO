'use strict';
// Testira lyrics-overlay-storage.js — sekcija 22 dodatka (project.json.lyricsOverlay referentni
// blok + projects/PROJECT_ID/lyrics/overlay-tracks.json). STVARNO piše na disk (ne mock),
// isti obrazac kao test-project-backup.js/test-audio-projects-integration.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

process.env.MSS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-lyrics-overlay-test-'));

const audioProjects = require('../PROGRAM - NE BRISATI/audio-projects');
const overlayStorage = require('../PROGRAM - NE BRISATI/lyrics-overlay-storage');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== LyricsOverlayStorage testovi (stvaran disk) ==');

const project = audioProjects.createProject({ name: 'Test Spot', songTitle: 'Pesma', artist: 'Izvođač' });

test('listTextTracks na svežem projektu vraća prazan niz (bez greške)', () => {
  assert.deepStrictEqual(overlayStorage.listTextTracks(project.projectId), []);
});

test('createTextTrackForProject STVARNO piše overlay-tracks.json na disk i osvežava project.json.lyricsOverlay', () => {
  const track = overlayStorage.createTextTrackForProject(project.projectId, { type: 'lyrics', name: 'Glavni tekst' });
  assert.ok(track.trackId);
  const filePath = overlayStorage.overlayTracksFile(project.projectId);
  assert.ok(fs.existsSync(filePath));
  const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(onDisk.tracks.length, 1);

  const updatedProject = audioProjects.getProject(project.projectId);
  assert.strictEqual(updatedProject.lyricsOverlay.trackCount, 1);
  assert.strictEqual(updatedProject.lyricsOverlay.cueCount, 0);
});

test('createTextTrackForProject baca grešku za nepoznat projekat', () => {
  assert.throws(() => overlayStorage.createTextTrackForProject('ne-postoji-nikad', { type: 'lyrics' }), /nije pronađen/);
});

let trackId;
test('updateTextTrackForProject menja polja bez gubljenja cues[] niza', () => {
  const tracks = overlayStorage.listTextTracks(project.projectId);
  trackId = tracks[0].trackId;
  const updated = overlayStorage.updateTextTrackForProject(project.projectId, trackId, { name: 'Preimenovano', language: 'en' });
  assert.strictEqual(updated.name, 'Preimenovano');
  assert.strictEqual(updated.language, 'en');
  assert.deepStrictEqual(updated.cues, []);
});

test('updateTextTrackForProject odbija nepoznat tip track-a', () => {
  assert.throws(() => overlayStorage.updateTextTrackForProject(project.projectId, trackId, { type: 'ne-postoji' }), /Nepoznat tip track-a/);
});

let cueId;
test('addCueToTrack dodaje VALIDAN cue i ažurira cueCount u project.json', () => {
  const cue = overlayStorage.addCueToTrack(project.projectId, trackId, { startMs: 1000, endMs: 3000, text: 'Sanjam noćas' });
  cueId = cue.cueId;
  assert.strictEqual(cue.text, 'Sanjam noćas');
  const updatedProject = audioProjects.getProject(project.projectId);
  assert.strictEqual(updatedProject.lyricsOverlay.cueCount, 1);
});

test('addCueToTrack ODBIJA nevalidan cue (endMs <= startMs) i NE upisuje ga', () => {
  assert.throws(() => overlayStorage.addCueToTrack(project.projectId, trackId, { startMs: 5000, endMs: 4000, text: 'x' }), /nije validan/);
  const tracks = overlayStorage.listTextTracks(project.projectId);
  assert.strictEqual(tracks[0].cues.length, 1, 'nevalidan cue ne sme biti sačuvan');
});

test('updateCueInTrack menja tekst i ponovo validira', () => {
  const updated = overlayStorage.updateCueInTrack(project.projectId, trackId, cueId, { text: 'Izmenjen tekst' });
  assert.strictEqual(updated.text, 'Izmenjen tekst');
});

test('updateCueInTrack odbija izmenu koja bi napravila nevalidan cue', () => {
  assert.throws(() => overlayStorage.updateCueInTrack(project.projectId, trackId, cueId, { endMs: 500 }), /nije validan/);
});

test('softDeleteCue OZNAČAVA cue kao obrisan (ne uklanja ga fizički) i smanjuje aktivan cueCount', () => {
  overlayStorage.softDeleteCue(project.projectId, trackId, cueId);
  const tracks = overlayStorage.listTextTracks(project.projectId);
  const cue = tracks[0].cues.find(c => c.cueId === cueId);
  assert.strictEqual(cue.deleted, true);
  assert.ok(cue.deletedAt);
  const updatedProject = audioProjects.getProject(project.projectId);
  assert.strictEqual(updatedProject.lyricsOverlay.cueCount, 0, 'obrisan cue se ne broji u aktivan cueCount');
});

test('restoreCue VRAĆA soft-deleted cue bez regenerisanja bilo čega', () => {
  const restored = overlayStorage.restoreCue(project.projectId, trackId, cueId);
  assert.strictEqual(restored.deleted, false);
  assert.strictEqual(restored.deletedAt, null);
  const updatedProject = audioProjects.getProject(project.projectId);
  assert.strictEqual(updatedProject.lyricsOverlay.cueCount, 1);
});

test('validateProjectOverlay agregira validaciju svih track-ova projekta', () => {
  const result = overlayStorage.validateProjectOverlay(project.projectId);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.tracks.length, 1);
});

test('deleteTextTrackForProject pravi backup PRE brisanja i stvarno uklanja track', () => {
  overlayStorage.deleteTextTrackForProject(project.projectId, trackId);
  assert.deepStrictEqual(overlayStorage.listTextTracks(project.projectId), []);
  const backups = require('../PROGRAM - NE BRISATI/project-backup').listProjectBackups(audioProjects.projectDir(project.projectId));
  assert.ok(backups.some(b => b.reason === 'before_delete_text_track'));
});

test('addCueToTrack baca grešku za nepostojeći trackId', () => {
  assert.throws(() => overlayStorage.addCueToTrack(project.projectId, 'ne-postoji', { startMs: 0, endMs: 1000, text: 'x' }), /Text track nije pronađen/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
