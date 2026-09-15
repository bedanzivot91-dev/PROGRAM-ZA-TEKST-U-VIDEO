'use strict';
// Testira lyrics-overlay-storage.js — stvaran disk, bez mock-a.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

process.env.MSS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-lyrics-overlay-test-'));

const audioProjects = require('../PROGRAM - NE BRISATI/audio-projects');
const overlayStorage = require('../PROGRAM - NE BRISATI/lyrics-overlay-storage');
const projectBackup = require('../PROGRAM - NE BRISATI/project-backup');

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

test('softDeleteCue OZNAČAVA cue kao obrisan i smanjuje aktivan cueCount', () => {
  overlayStorage.softDeleteCue(project.projectId, trackId, cueId);
  const tracks = overlayStorage.listTextTracks(project.projectId);
  const cue = tracks[0].cues.find(c => c.cueId === cueId);
  assert.strictEqual(cue.deleted, true);
  assert.ok(cue.deletedAt);
  const updatedProject = audioProjects.getProject(project.projectId);
  assert.strictEqual(updatedProject.lyricsOverlay.cueCount, 0);
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

let deleteBackupName;
test('deleteTextTrackForProject pravi backup PRE brisanja i stvarno uklanja track', () => {
  overlayStorage.deleteTextTrackForProject(project.projectId, trackId);
  assert.deepStrictEqual(overlayStorage.listTextTracks(project.projectId), []);
  const backups = projectBackup.listProjectBackups(audioProjects.projectDir(project.projectId));
  const backup = backups.find(item => item.reason === 'before_delete_text_track');
  assert.ok(backup);
  deleteBackupName = backup.fileName;
});

test('VRATI PRETHODNU VERZIJU vraća i fizički obrisani overlay track/cue sadržaj', () => {
  audioProjects.restoreProjectBackup(project.projectId, deleteBackupName);
  const tracks = overlayStorage.listTextTracks(project.projectId);
  assert.strictEqual(tracks.length, 1);
  assert.strictEqual(tracks[0].trackId, trackId);
  assert.strictEqual(tracks[0].cues.length, 1);
  assert.strictEqual(tracks[0].cues[0].cueId, cueId);
});

test('oštećen overlay-tracks.json se NE tretira kao prazan niz i NE sme biti tiho prepisan', () => {
  const file = overlayStorage.overlayTracksFile(project.projectId);
  const validBefore = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '{BROKEN JSON', 'utf8');
  assert.throws(
    () => overlayStorage.listTextTracks(project.projectId),
    error => error && error.code === 'OVERLAY_CORRUPTED'
  );
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{BROKEN JSON');
  // vrati validan sadržaj za ostale testove
  fs.writeFileSync(file, validBefore, 'utf8');
});

test('overlayCorruptedError daje stabilan kod greške', () => {
  const error = overlayStorage.overlayCorruptedError('test');
  assert.strictEqual(error.code, 'OVERLAY_CORRUPTED');
  assert.ok(error.message.includes('test'));
});

test('addCueToTrack baca grešku za nepostojeći trackId', () => {
  assert.throws(() => overlayStorage.addCueToTrack(project.projectId, 'ne-postoji', { startMs: 0, endMs: 1000, text: 'x' }), /Text track nije pronađen/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
