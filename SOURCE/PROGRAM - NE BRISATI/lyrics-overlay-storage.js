'use strict';

// Storage/API sloj za "Tekst na videu / Lyrics Overlay Studio". Teški track/cue podaci žive
// u projects/PROJECT_ID/lyrics/overlay-tracks.json; project.json.lyricsOverlay je samo statusni
// referentni blok. Oštećen overlay fajl se NIKADA ne tretira kao prazan — to bi omogućilo da
// sledeći upis pregazi korisničke cue-ove praznim stanjem.

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
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    throw error;
  }
}

function requireProject(projectId) {
  const project = audioProjects.getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return project;
}

function overlayCorruptedError(message, cause = null) {
  const error = new Error(`Lyrics overlay podaci su oštećeni: ${message}`);
  error.code = 'OVERLAY_CORRUPTED';
  if (cause) error.cause = cause;
  return error;
}

function readOverlayTracks(projectId) {
  const file = overlayTracksFile(projectId);
  if (!fs.existsSync(file)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw overlayCorruptedError('overlay-tracks.json nije validan JSON. Fajl nije izmenjen.', error);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tracks)) {
    throw overlayCorruptedError('overlay-tracks.json nema očekivani tracks niz. Fajl nije izmenjen.');
  }
  for (const [index, track] of parsed.tracks.entries()) {
    if (!track || typeof track !== 'object' || typeof track.trackId !== 'string' || !Array.isArray(track.cues)) {
      throw overlayCorruptedError(`track na poziciji ${index} nema validan trackId/cues oblik. Fajl nije izmenjen.`);
    }
  }
  return parsed.tracks;
}

function writeOverlayTracks(projectId, tracks) {
  requireProject(projectId);
  if (!Array.isArray(tracks)) throw new TypeError('tracks mora biti niz.');
  const cueCount = tracks.reduce((sum, track) => sum + (Array.isArray(track.cues) ? track.cues.filter(cue => !cue?.deleted).length : 0), 0);
  atomicWriteJson(overlayTracksFile(projectId), { tracks });
  audioProjects.updateProject(projectId, {
    lyricsOverlay: { trackCount: tracks.length, cueCount, updatedAt: new Date().toISOString() }
  });
  return tracks;
}

function findTrackOrThrow(tracks, trackId) {
  const track = tracks.find(candidate => candidate.trackId === trackId);
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
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  Object.assign(track, safePatch, { trackId: track.trackId, cues: track.cues });
  writeOverlayTracks(projectId, tracks);
  return track;
}

function deleteTextTrackForProject(projectId, trackId) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  findTrackOrThrow(tracks, trackId);
  // project-backup.js sada čuva i sam overlay-tracks.json, ne samo project.json metadata.
  projectBackup.createProjectBackup(audioProjects.projectDir(projectId), project, 'before_delete_text_track');
  const remaining = tracks.filter(track => track.trackId !== trackId);
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
  const cue = track.cues.find(candidate => candidate.cueId === cueId);
  if (!cue) { const error = new Error('Cue nije pronađen.'); error.code = 'CUE_NOT_FOUND'; throw error; }
  return cue;
}

function updateCueInTrack(projectId, trackId, cueId, patch = {}) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = findCueOrThrow(track, cueId);
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const merged = { ...cue, ...safePatch, cueId: cue.cueId, trackId: cue.trackId };
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
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const track = findTrackOrThrow(tracks, trackId);
  const cue = findCueOrThrow(track, cueId);
  const validation = validateCue(cue, { totalDurationMs: project.audio?.durationMs ?? null });
  if (!validation.valid) {
    const error = new Error(`Obrisani cue više ne može bezbedno da se vrati: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_CUE';
    error.problems = validation.problems;
    throw error;
  }
  cue.deleted = false;
  cue.deletedAt = null;
  writeOverlayTracks(projectId, tracks);
  return cue;
}

function validateProjectOverlay(projectId) {
  const project = requireProject(projectId);
  const tracks = readOverlayTracks(projectId);
  const results = tracks.map(track => ({ trackId: track.trackId, ...validateTrack(track, { totalDurationMs: project.audio?.durationMs ?? null }) }));
  return { valid: results.every(result => result.valid), tracks: results };
}

module.exports = {
  overlayDir, overlayTracksFile, readOverlayTracks, writeOverlayTracks,
  listTextTracks, createTextTrackForProject, updateTextTrackForProject, deleteTextTrackForProject,
  addCueToTrack, updateCueInTrack, softDeleteCue, restoreCue, validateProjectOverlay,
  overlayCorruptedError
};
