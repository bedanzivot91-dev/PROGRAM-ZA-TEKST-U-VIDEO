'use strict';

// Storage/API sloj za "Tekst na videu / Lyrics Overlay Studio" (sekcija 22 dodatka). Teški
// podaci (track-ovi + cue-ovi) žive u projects/PROJECT_ID/lyrics/overlay-tracks.json — NE u
// project.json (koji ostaje mali). project.json.lyricsOverlay je samo mali REFERENTNI blok
// (broj track-ova/cue-ova, updatedAt) da lista projekata može prikazati status bez čitanja
// celog overlay fajla za svaki projekat.
//
// Tekst je nezavisan, naknadno izmenjiv sloj (pravilo 1 dodatka) — ova skladišna funkcija ne
// dira project.storyboard/imagePrompts/videoPrompts ni na koji način.

const fs = require('fs');
const path = require('path');
const audioProjects = require('./audio-projects');
const { createTextTrack, createCue, validateCue, validateTrack, TRACK_TYPES } = require('./text-overlay-models');
const projectBackup = require('./project-backup');

function overlayDir(projectId) {
  return path.join(audioProjects.projectDir(projectId), 'lyrics');
}
function overlayTracksFile(projectId) {
  return path.join(overlayDir(projectId), 'overlay-tracks.json');
}

function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function requireProject(projectId) {
  const project = audioProjects.getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return project;
}

function readOverlayTracks(projectId) {
  const file = overlayTracksFile(projectId);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

// Upisuje track-ove i osvežava mali referentni blok u project.json — ovo je JEDINO mesto koje
// piše overlay-tracks.json, da broj cue-ova u project.json.lyricsOverlay nikad ne zastari.
function writeOverlayTracks(projectId, tracks) {
  atomicWriteJson(overlayTracksFile(projectId), { tracks });
  const cueCount = tracks.reduce((sum, t) => sum + (t.cues || []).filter(c => !c.deleted).length, 0);
  audioProjects.updateProject(projectId, {
    lyricsOverlay: { trackCount: tracks.length, cueCount, updatedAt: new Date().toISOString() }
  });
  return tracks;
}

function findTrackOrThrow(tracks, trackId) {
  const track = tracks.find(t => t.trackId === trackId);
  if (!track) { const error = new Error('Text track nije pronađen.'); error.code = 'TRACK_NOT_FOUND'; throw error; }
  return track;
}

function listTextTracks(projectId) {
  requireProject(projectId);
  return readOverlayTracks(projectId);
}

function createTextTrackForProject(projectId, options = {}) {
  requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = createTextTrack(options);
  tracks.push(track);
  writeOverlayTracks(projectId, tracks);
  return track;
}

function updateTextTrackForProject(projectId, trackId, patch = {}) {
  requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  if (patch.type && !TRACK_TYPES.has(patch.type)) {
    const error = new Error(`Nepoznat tip track-a: "${patch.type}".`);
    error.code = 'INVALID_TRACK_TYPE';
    throw error;
  }
  Object.assign(track, patch, { trackId: track.trackId, cues: track.cues });
  writeOverlayTracks(projectId, tracks);
  return track;
}

// Trajno uklanja track. Backup CELOG projekta se pravi pre brisanja (pravilo iz sekcije 31) —
// ne postoji poseban "soft delete" za ceo track (samo za pojedinačne cue-ove, ispod), jer je
// track obično prazna organizaciona jedinica koju je lako ponovo napraviti; sadržaj (cue-ovi)
// se čuva u backup-u ako je greškom obrisan pun track.
function deleteTextTrackForProject(projectId, trackId) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  findTrackOrThrow(tracks, trackId);
  projectBackup.createProjectBackup(audioProjects.projectDir(projectId), { ...project, lyricsOverlayTracksSnapshot: tracks }, 'before_delete_text_track');
  const remaining = tracks.filter(t => t.trackId !== trackId);
  writeOverlayTracks(projectId, remaining);
  return { ok: true, deletedTrackId: trackId };
}

function addCueToTrack(projectId, trackId, cueOptions = {}) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = createCue({ ...cueOptions, trackId });
  const validation = validateCue(cue, { totalDurationMs: project.audio?.durationMs ?? null });
  if (!validation.valid) {
    const error = new Error(`Cue nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_CUE';
    error.problems = validation.problems;
    throw error;
  }
  track.cues.push(cue);
  writeOverlayTracks(projectId, tracks);
  return cue;
}

function findCueOrThrow(track, cueId) {
  const cue = track.cues.find(c => c.cueId === cueId);
  if (!cue) { const error = new Error('Cue nije pronađen.'); error.code = 'CUE_NOT_FOUND'; throw error; }
  return cue;
}

function updateCueInTrack(projectId, trackId, cueId, patch = {}) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = findCueOrThrow(track, cueId);
  const merged = { ...cue, ...patch, cueId: cue.cueId, trackId: cue.trackId };
  const validation = validateCue(merged, { totalDurationMs: project.audio?.durationMs ?? null });
  if (!validation.valid) {
    const error = new Error(`Cue nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_CUE';
    error.problems = validation.problems;
    throw error;
  }
  Object.assign(cue, merged);
  writeOverlayTracks(projectId, tracks);
  return cue;
}

// Soft-delete (sekcija 4: mora biti moguće ukloniti I VRATITI cue bez regenerisanja celog spota).
function softDeleteCue(projectId, trackId, cueId) {
  requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = findCueOrThrow(track, cueId);
  cue.deleted = true;
  cue.deletedAt = new Date().toISOString();
  writeOverlayTracks(projectId, tracks);
  return cue;
}

function restoreCue(projectId, trackId, cueId) {
  requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = findCueOrThrow(track, cueId);
  cue.deleted = false;
  cue.deletedAt = null;
  writeOverlayTracks(projectId, tracks);
  return cue;
}

function validateProjectOverlay(projectId) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const results = tracks.map(track => ({ trackId: track.trackId, ...validateTrack(track, { totalDurationMs: project.audio?.durationMs ?? null }) }));
  return { valid: results.every(r => r.valid), tracks: results };
}

module.exports = {
  overlayDir, overlayTracksFile, readOverlayTracks, writeOverlayTracks,
  listTextTracks, createTextTrackForProject, updateTextTrackForProject, deleteTextTrackForProject,
  addCueToTrack, updateCueInTrack, softDeleteCue, restoreCue, validateProjectOverlay
};
