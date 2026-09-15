'use strict';

// Skladištenje "audio spot" projekata. Svaki projekat ima svoj folder pod projects/PROJECT_ID/.
// project.json čuva lake podatke/reference; teški fajlovi ostaju u projektnim podfolderima.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storagePaths = require('./storage-paths');
const audioProbe = require('./audio-probe');
const { parseLyrics } = require('./lyrics-parser');
const transcriptionProvider = require('./transcription-provider');
const { alignLyrics } = require('./lyrics-alignment');
const autoLyrics = require('./auto-lyrics');
const musicAnalysis = require('./music-analysis');
const { buildBpmCandidates } = require('./bpm-candidates');
const { buildSceneCandidates } = require('./scene-candidates');
const { planScenes } = require('./scene-planner');
const { validateTimeline } = require('./timeline-validator');
const { createBatchQueue, getNextBatch, lockScenePrompt, markFailed, queueSummary } = require('./scene-batch-queue');
const { validatePromptBatchResponse } = require('./ai-response-validator');
const { buildFinalImagePrompt } = require('./image-generation-provider');
const identityText = require('./locked-identity-text');
const { computeProjectStatus, computeOverallProgress } = require('./project-status');
const projectBackup = require('./project-backup');

const SCHEMA_VERSION = 4;
const PROJECT_SUBDIRS = ['audio', 'lyrics', 'analysis', 'stems', 'transcription', 'alignment', 'storyboard', 'prompts', 'images', 'videos', 'exports', 'backups', 'logs'];

function projectDir(projectId) {
  return path.join(storagePaths.projects, projectId);
}

function projectFile(projectId) {
  return path.join(projectDir(projectId), 'project.json');
}

function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readProjectJson(projectId) {
  const file = projectFile(projectId);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.projectId !== projectId) return null;
    if (parsed.schemaVersion !== SCHEMA_VERSION) parsed._schemaMismatch = true;
    return parsed;
  } catch {
    return null;
  }
}

function isValidProjectId(id) {
  return typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id);
}

function defaultProgress() {
  return { audio: 0, lyrics: 0, alignment: 0, storyboard: 0, imagePrompts: 0, images: 0, videoPrompts: 0 };
}

function createProject({ name, songTitle, artist } = {}) {
  const projectId = crypto.randomUUID();
  const dir = projectDir(projectId);
  for (const sub of PROJECT_SUBDIRS) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const now = new Date().toISOString();
  const project = {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    name: String(name || songTitle || 'Novi spot').trim().slice(0, 200),
    songTitle: String(songTitle || '').trim().slice(0, 200),
    artist: String(artist || '').trim().slice(0, 200),
    activeConceptId: '',
    activeYoutubeChannelId: '',
    createdAt: now,
    updatedAt: now,
    audioHash: '',
    audio: null,
    lyrics: null,
    progress: defaultProgress()
  };
  atomicWriteJson(projectFile(projectId), project);
  return project;
}

function listProjects({ search = '', status = '', channelId = '', sort = 'updatedAt_desc' } = {}) {
  if (!fs.existsSync(storagePaths.projects)) return [];
  const entries = fs.readdirSync(storagePaths.projects, { withFileTypes: true }).filter(entry => entry.isDirectory());
  let projects = [];
  for (const entry of entries) {
    const project = readProjectJson(entry.name);
    if (!project) continue;
    projects.push({ ...project, status: computeProjectStatus(project), overallProgress: computeOverallProgress(project) });
  }

  const searchNormalized = String(search || '').toLocaleLowerCase('sr-RS').trim();
  if (searchNormalized) {
    projects = projects.filter(project =>
      String(project.name || '').toLocaleLowerCase('sr-RS').includes(searchNormalized) ||
      String(project.songTitle || '').toLocaleLowerCase('sr-RS').includes(searchNormalized) ||
      String(project.artist || '').toLocaleLowerCase('sr-RS').includes(searchNormalized)
    );
  }
  if (status) projects = projects.filter(project => project.status === status);
  if (channelId) projects = projects.filter(project => project.activeYoutubeChannelId === channelId);

  const sorters = {
    updatedAt_desc: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    updatedAt_asc: (a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)),
    createdAt_desc: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    name_asc: (a, b) => String(a.name).localeCompare(String(b.name), 'sr'),
    progress_desc: (a, b) => b.overallProgress - a.overallProgress
  };
  projects.sort(sorters[sort] || sorters.updatedAt_desc);
  return projects;
}

function getProject(projectId) {
  if (!isValidProjectId(projectId)) return null;
  return readProjectJson(projectId);
}

function getProjectWithStatus(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return { ...project, status: computeProjectStatus(project), overallProgress: computeOverallProgress(project) };
}

function updateProject(projectId, patch) {
  const project = getProject(projectId);
  if (!project) return null;
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const updated = {
    ...project,
    ...safePatch,
    projectId: project.projectId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString()
  };
  delete updated._schemaMismatch;
  atomicWriteJson(projectFile(projectId), updated);
  return updated;
}

function copyProjectFiles(sourceDir, destDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyProjectFiles(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function duplicateProject(projectId, { name } = {}) {
  const source = getProject(projectId);
  if (!source) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const newProjectId = crypto.randomUUID();
  const sourceDir = projectDir(projectId);
  const destDir = projectDir(newProjectId);
  fs.mkdirSync(destDir, { recursive: true });
  copyProjectFiles(sourceDir, destDir);

  const requestedName = String(name || '').trim();
  const now = new Date().toISOString();
  const duplicated = {
    ...source,
    projectId: newProjectId,
    name: (requestedName || `${source.name} (kopija)`).slice(0, 200),
    createdAt: now,
    updatedAt: now,
    archived: false,
    lastError: null
  };
  delete duplicated._schemaMismatch;
  atomicWriteJson(projectFile(newProjectId), duplicated);
  return duplicated;
}

function renameProject(projectId, newName) {
  const cleanedName = String(newName || '').trim().slice(0, 200);
  if (!cleanedName) { const error = new Error('Novi naziv ne sme biti prazan.'); error.code = 'INVALID_NAME'; throw error; }
  const project = updateProject(projectId, { name: cleanedName });
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return project;
}

function archiveProject(projectId, archived = true) {
  const project = updateProject(projectId, { archived: Boolean(archived) });
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return project;
}

function deleteProjectPermanently(projectId) {
  if (!isValidProjectId(projectId)) { const error = new Error('Neispravan ID projekta.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const dir = projectDir(projectId);
  if (!fs.existsSync(dir) || !getProject(projectId)) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, deleted: projectId };
}

function fileSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function stripAlignmentFromLyrics(lyrics) {
  if (!lyrics || !Array.isArray(lyrics.lines)) return lyrics || null;
  const lines = lyrics.lines.map(line => {
    const clean = { ...line };
    for (const key of ['startMs', 'endMs', 'alignmentConfidence', 'matchedWordsRatio', 'source', 'words']) delete clean[key];
    clean.needsReview = Boolean(lyrics.needsReview);
    return clean;
  });
  return { ...lyrics, lines, overallConfidence: lyrics.lyricsSource === 'user' ? 1 : 0, needsReview: lyrics.lyricsSource !== 'user' };
}

function clearedPromptPipeline() {
  return {
    imageBatchQueue: null,
    imageBatchCounter: 0,
    lastImageBatchId: null,
    activeImageBatchSceneIds: [],
    imagePrompts: {},
    videoBatchQueue: null,
    videoBatchCounter: 0,
    lastVideoBatchId: null,
    activeVideoBatchSceneIds: [],
    videoPrompts: {}
  };
}

function resetStoryboardAndPromptState(project, progressPatch = {}) {
  return {
    storyboard: null,
    ...clearedPromptPipeline(),
    progress: {
      ...defaultProgress(),
      ...(project.progress || {}),
      storyboard: 0,
      imagePrompts: 0,
      images: 0,
      videoPrompts: 0,
      ...progressPatch
    }
  };
}

async function attachAudioToProject(projectId, buffer, originalFileName) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) { const error = new Error('Audio fajl je prazan ili neispravan.'); error.code = 'INVALID_AUDIO'; throw error; }

  const ext = path.extname(String(originalFileName || '')).toLowerCase();
  if (!audioProbe.SUPPORTED_EXTENSIONS.has(ext)) {
    const error = new Error(`Nepodržan format: ${ext || '(bez ekstenzije)'}. Podržano: MP3, WAV, M4A, AAC, FLAC.`);
    error.code = 'UNSUPPORTED_FORMAT';
    throw error;
  }

  const audioHash = fileSha256(buffer);
  const storedFileName = `source-${audioHash.slice(0, 16)}${ext}`;
  const audioDir = path.join(projectDir(projectId), 'audio');
  const storedPath = path.join(audioDir, storedFileName);
  const tempPath = path.join(audioDir, `.upload-${crypto.randomUUID()}${ext}`);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(tempPath, buffer);

  let probe;
  try {
    // UVEK proverava privremeni fajl. Ne prepisuje niti briše prethodni source dok FFprobe ne uspe.
    probe = await audioProbe.probeAudioFile(tempPath);
    if (!fs.existsSync(storedPath)) fs.renameSync(tempPath, storedPath);
    else fs.unlinkSync(tempPath); // isti hash => isti sadržaj već postoji
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }

  const replacingDifferentAudio = Boolean(project.audio && project.audioHash && project.audioHash !== audioHash);
  if (replacingDifferentAudio) projectBackup.createProjectBackup(projectDir(projectId), project, 'before_audio_replace');

  const autoDerivedLyrics = /^auto_transcribed/.test(String(project.lyrics?.lyricsSource || ''));
  const preservedLyrics = autoDerivedLyrics ? null : stripAlignmentFromLyrics(project.lyrics);
  const reset = resetStoryboardAndPromptState(project, {
    audio: 100,
    lyrics: preservedLyrics?.lines?.length ? 100 : 0,
    alignment: 0
  });

  return updateProject(projectId, {
    ...reset,
    audioHash,
    audio: {
      storedFileName,
      originalFileName: String(originalFileName || '').slice(0, 255),
      durationMs: probe.durationMs,
      durationSource: probe.durationSource,
      durationMismatchMs: probe.durationMismatchMs,
      codec: probe.codec,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      bitrate: probe.bitrate,
      formatName: probe.formatName,
      fileSizeBytes: probe.fileSizeBytes,
      uploadedAt: new Date().toISOString()
    },
    lyrics: preservedLyrics,
    transcription: null,
    lyricsGenerationStatus: null,
    musicAnalysis: null,
    musicAnalysisStatus: null
  });
}

function setProjectLyrics(projectId, rawText) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const parsed = parseLyrics(rawText);
  const wasAutoTranscribed = project.lyrics?.lyricsSource === 'auto_transcribed' || project.lyrics?.lyricsSource === 'auto_transcribed_edited';
  parsed.lyricsSource = wasAutoTranscribed ? 'auto_transcribed_edited' : 'user';
  parsed.needsReview = false;
  const reset = resetStoryboardAndPromptState(project, { lyrics: parsed.lines.length ? 100 : 0, alignment: 0 });
  return updateProject(projectId, { ...reset, lyrics: parsed, transcription: null });
}

async function generateAutoLyrics(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const result = await autoLyrics.autoWriteLyrics(audioPath, project.audioHash, options);
  if (!result.ok) {
    return updateProject(projectId, { lyricsGenerationStatus: { ok: false, reason: result.reason, attemptedAt: new Date().toISOString() } });
  }

  const lyrics = {
    lyricsSource: result.lyricsSource,
    detectedLanguage: result.detectedLanguage,
    overallConfidence: result.overallConfidence,
    needsReview: result.needsReview,
    rawTranscription: result.rawTranscription,
    formattedLyrics: result.formattedLyrics,
    sections: result.sections,
    lines: result.lines
  };
  const reset = resetStoryboardAndPromptState(project, { lyrics: lyrics.lines.length ? 60 : 0, alignment: 0 });
  return updateProject(projectId, {
    ...reset,
    lyrics,
    transcription: null,
    lyricsGenerationStatus: { ok: true, usedVocalStem: result.usedVocalStem, model: result.transcriptionModel, attemptedAt: new Date().toISOString() }
  });
}

async function alignProjectLyrics(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }
  if (!project.lyrics || !project.lyrics.lines?.length) { const error = new Error('Projekat nema unet tekst pesme za poravnanje.'); error.code = 'LYRICS_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const transcription = await transcriptionProvider.transcribeAudio(audioPath, project.audioHash, options);
  if (!transcription.ok) {
    return updateProject(projectId, { transcription: { ok: false, reason: transcription.reason, attemptedAt: new Date().toISOString() } });
  }

  const alignment = alignLyrics(project.lyrics.lines, transcription.words, { totalDurationMs: project.audio.durationMs });
  const matchesById = new Map(alignment.lines.map(line => [line.lineId, line]));
  const alignedLines = project.lyrics.lines.map(line => {
    const match = matchesById.get(line.lineId);
    return match ? {
      ...line,
      startMs: match.startMs,
      endMs: match.endMs,
      alignmentConfidence: match.alignmentConfidence,
      matchedWordsRatio: match.matchedWordsRatio,
      source: match.source,
      needsReview: match.needsReview,
      words: match.words || []
    } : line;
  });

  const alignmentProgress = alignment.totalLineCount ? Math.round((alignment.matchedLineCount / alignment.totalLineCount) * 100) : 0;
  const reset = resetStoryboardAndPromptState(project, { alignment: alignmentProgress });
  return updateProject(projectId, {
    ...reset,
    transcription: { ok: true, model: transcription.model, language: transcription.language, attemptedAt: new Date().toISOString() },
    lyrics: { ...project.lyrics, lines: alignedLines, overallConfidence: alignment.overallConfidence, needsReview: alignment.overallConfidence < 0.7 }
  });
}

async function analyzeProjectMusic(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const result = await musicAnalysis.analyzeMusic(audioPath, project.audioHash, options);
  if (!result.ok) {
    return updateProject(projectId, { musicAnalysisStatus: { ok: false, reason: result.reason, attemptedAt: new Date().toISOString() } });
  }

  const bpmCandidates = buildBpmCandidates(result.bpm?.primary);
  const nextAnalysis = {
    ok: true,
    bpmCandidates,
    beatTimesMs: Array.isArray(result.beatTimesMs) ? result.beatTimesMs : [],
    downbeatTimesMs: Array.isArray(result.downbeatTimesMs) ? result.downbeatTimesMs : [],
    onsets: Array.isArray(result.onsets) ? result.onsets : [],
    energy: Array.isArray(result.energy) ? result.energy : [],
    noveltyCurve: Array.isArray(result.noveltyCurve) ? result.noveltyCurve : [],
    attemptedAt: new Date().toISOString()
  };
  const reset = resetStoryboardAndPromptState(project);
  return updateProject(projectId, { ...reset, musicAnalysis: nextAnalysis, musicAnalysisStatus: { ok: true, attemptedAt: nextAnalysis.attemptedAt } });
}

function planProjectScenes(projectId, settings = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }

  const candidates = buildSceneCandidates({ lyrics: project.lyrics, musicAnalysis: project.musicAnalysis });
  const planResult = planScenes(project.audio.durationMs, candidates, settings);
  const validation = validateTimeline(planResult.scenes, project.audio.durationMs);
  if (!validation.valid) {
    const error = new Error(`ScenePlanner je proizveo nevalidan timeline: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_TIMELINE';
    throw error;
  }

  if (project.storyboard) projectBackup.createProjectBackup(projectDir(projectId), project, 'before_storyboard_replace');
  const promptReset = clearedPromptPipeline();
  return updateProject(projectId, {
    ...promptReset,
    storyboard: { scenes: planResult.scenes, settings: planResult.settings, candidateCount: candidates.length, generatedAt: new Date().toISOString() },
    progress: { ...defaultProgress(), ...(project.progress || {}), storyboard: 100, imagePrompts: 0, images: 0, videoPrompts: 0 }
  });
}

function activeBatchResponse(project, kind) {
  const prefix = kind === 'image' ? 'Image' : 'Video';
  const batchId = project[`last${prefix}BatchId`];
  const sceneIds = project[`active${prefix}BatchSceneIds`];
  const queue = project[`${kind}BatchQueue`];
  if (!batchId || !Array.isArray(sceneIds) || !sceneIds.length || !queue) return null;
  return {
    done: false,
    batchId,
    sceneIds: [...sceneIds],
    scenes: sceneIds.map(id => project.storyboard?.scenes?.find(scene => scene.sceneId === id)).filter(Boolean),
    summary: queueSummary(queue)
  };
}

function getNextImagePromptBatch(projectId) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.storyboard?.scenes?.length) { const error = new Error('Projekat nema storyboard sa scenama.'); error.code = 'STORYBOARD_MISSING'; throw error; }

  const active = activeBatchResponse(project, 'image');
  if (active) return active; // idempotentno: ponovljen klik/refresh NE menja batchId dok prethodni čeka odgovor

  const queue = project.imageBatchQueue || createBatchQueue(project.storyboard.scenes.map(scene => scene.sceneId));
  const sceneIds = getNextBatch(queue);
  if (!sceneIds.length) {
    updateProject(projectId, { imageBatchQueue: queue, lastImageBatchId: null, activeImageBatchSceneIds: [] });
    return { done: true, batchId: null, sceneIds: [], summary: queueSummary(queue) };
  }

  const batchCounter = (project.imageBatchCounter || 0) + 1;
  const batchId = `image-batch-${String(batchCounter).padStart(3, '0')}`;
  updateProject(projectId, {
    imageBatchQueue: queue,
    imageBatchCounter: batchCounter,
    lastImageBatchId: batchId,
    activeImageBatchSceneIds: sceneIds
  });
  return {
    done: false,
    batchId,
    sceneIds,
    scenes: sceneIds.map(id => project.storyboard.scenes.find(scene => scene.sceneId === id)).filter(Boolean),
    summary: queueSummary(queue)
  };
}

function submitImagePromptBatch(projectId, aiResponse) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const activeSceneIds = Array.isArray(project.activeImageBatchSceneIds) ? project.activeImageBatchSceneIds : [];
  if (!project.imageBatchQueue || !project.lastImageBatchId || !activeSceneIds.length) {
    const error = new Error('Nema aktivnog image batch-a — prvo pozovi getNextImagePromptBatch.'); error.code = 'NO_ACTIVE_BATCH'; throw error;
  }

  const activeSet = new Set(activeSceneIds);
  const validation = validatePromptBatchResponse(aiResponse, { expectedBatchId: project.lastImageBatchId, batchType: 'image', knownSceneIds: activeSet });
  if (!validation.valid) {
    const error = new Error(`AI odgovor za image batch nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_AI_RESPONSE';
    error.problems = validation.problems;
    throw error;
  }

  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_ai_import_image_prompts');
  const queue = project.imageBatchQueue;
  const prompts = { ...(project.imagePrompts || {}) };
  const identity = { positive: identityText.POSITIVE, negative: identityText.NEGATIVE };
  const received = new Set();

  for (const item of aiResponse.items) {
    const scene = project.storyboard?.scenes?.find(candidate => candidate.sceneId === item.sceneId);
    if (!scene || !activeSet.has(item.sceneId)) {
      const error = new Error(`Scena "${item.sceneId}" nije deo aktivnog image batch-a.`);
      error.code = 'INVALID_AI_RESPONSE';
      throw error;
    }
    const { finalPrompt, finalNegativePrompt } = buildFinalImagePrompt({ ...scene, scenePrompt: item.scenePrompt, sceneNegativePrompt: item.sceneNegativePrompt }, identity);
    prompts[item.sceneId] = {
      sceneId: item.sceneId,
      scenePrompt: item.scenePrompt,
      finalPrompt,
      finalNegativePrompt,
      continuityNotes: item.continuityNotes || '',
      lockedAt: new Date().toISOString()
    };
    lockScenePrompt(queue, item.sceneId);
    received.add(item.sceneId);
  }
  for (const sceneId of activeSceneIds) {
    if (!received.has(sceneId)) markFailed(queue, sceneId, 'AI odgovor nije sadržao ovu scenu iz aktivnog batch-a.');
  }

  return updateProject(projectId, {
    imageBatchQueue: queue,
    imagePrompts: prompts,
    lastImageBatchId: null,
    activeImageBatchSceneIds: [],
    progress: { ...project.progress, imagePrompts: queueSummary(queue).progressPercent }
  });
}

function getNextVideoPromptBatch(projectId) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const imageSceneIds = Object.keys(project.imagePrompts || {}).filter(sceneId => project.storyboard?.scenes?.some(scene => scene.sceneId === sceneId));
  if (!imageSceneIds.length) { const error = new Error('Nijedna scena još nema zaključan image prompt — video promptovi zahtevaju izabranu sliku.'); error.code = 'IMAGES_REQUIRED'; throw error; }

  const active = activeBatchResponse(project, 'video');
  if (active) return active;

  const queue = project.videoBatchQueue || createBatchQueue(imageSceneIds);
  const sceneIds = getNextBatch(queue);
  if (!sceneIds.length) {
    updateProject(projectId, { videoBatchQueue: queue, lastVideoBatchId: null, activeVideoBatchSceneIds: [] });
    return { done: true, batchId: null, sceneIds: [], summary: queueSummary(queue) };
  }

  const batchCounter = (project.videoBatchCounter || 0) + 1;
  const batchId = `video-batch-${String(batchCounter).padStart(3, '0')}`;
  updateProject(projectId, {
    videoBatchQueue: queue,
    videoBatchCounter: batchCounter,
    lastVideoBatchId: batchId,
    activeVideoBatchSceneIds: sceneIds
  });
  return {
    done: false,
    batchId,
    sceneIds,
    scenes: sceneIds.map(id => project.storyboard?.scenes?.find(scene => scene.sceneId === id)).filter(Boolean),
    summary: queueSummary(queue)
  };
}

function submitVideoPromptBatch(projectId, aiResponse) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const activeSceneIds = Array.isArray(project.activeVideoBatchSceneIds) ? project.activeVideoBatchSceneIds : [];
  if (!project.videoBatchQueue || !project.lastVideoBatchId || !activeSceneIds.length) {
    const error = new Error('Nema aktivnog video batch-a — prvo pozovi getNextVideoPromptBatch.'); error.code = 'NO_ACTIVE_BATCH'; throw error;
  }

  const activeSet = new Set(activeSceneIds);
  const validation = validatePromptBatchResponse(aiResponse, { expectedBatchId: project.lastVideoBatchId, batchType: 'video', knownSceneIds: activeSet });
  if (!validation.valid) {
    const error = new Error(`AI odgovor za video batch nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_AI_RESPONSE';
    error.problems = validation.problems;
    throw error;
  }

  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_ai_import_video_prompts');
  const queue = project.videoBatchQueue;
  const prompts = { ...(project.videoPrompts || {}) };
  const received = new Set();
  for (const item of aiResponse.items) {
    if (!activeSet.has(item.sceneId)) {
      const error = new Error(`Scena "${item.sceneId}" nije deo aktivnog video batch-a.`);
      error.code = 'INVALID_AI_RESPONSE';
      throw error;
    }
    const negativeVideoPrompt = [identityText.NEGATIVE, item.negativeVideoPrompt].filter(Boolean).join(', ');
    prompts[item.sceneId] = {
      sceneId: item.sceneId,
      videoPrompt: item.videoPrompt,
      negativeVideoPrompt,
      durationMs: Number.isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : null,
      lockedAt: new Date().toISOString()
    };
    lockScenePrompt(queue, item.sceneId);
    received.add(item.sceneId);
  }
  for (const sceneId of activeSceneIds) {
    if (!received.has(sceneId)) markFailed(queue, sceneId, 'AI odgovor nije sadržao ovu scenu iz aktivnog batch-a.');
  }

  return updateProject(projectId, {
    videoBatchQueue: queue,
    videoPrompts: prompts,
    lastVideoBatchId: null,
    activeVideoBatchSceneIds: [],
    progress: { ...project.progress, videoPrompts: queueSummary(queue).progressPercent }
  });
}

function listProjectBackupsFor(projectId) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return projectBackup.listProjectBackups(projectDir(projectId));
}

function restoreProjectBackup(projectId, fileName) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }

  // Prvo sačuvaj KOMPLETNO trenutno stanje (uključujući spoljne overlay fajlove), tek onda vrati staro.
  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_restore');
  const restoredState = projectBackup.readProjectBackup(projectDir(projectId), fileName);
  projectBackup.restoreSupplementalFiles(projectDir(projectId), fileName);
  const merged = {
    ...restoredState,
    projectId: project.projectId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: restoredState.createdAt || project.createdAt,
    updatedAt: new Date().toISOString()
  };
  delete merged._schemaMismatch;
  atomicWriteJson(projectFile(projectId), merged);
  return merged;
}

module.exports = {
  SCHEMA_VERSION, PROJECT_SUBDIRS, isValidProjectId,
  createProject, listProjects, getProject, getProjectWithStatus, updateProject,
  attachAudioToProject, setProjectLyrics, alignProjectLyrics, generateAutoLyrics, analyzeProjectMusic,
  planProjectScenes, getNextImagePromptBatch, submitImagePromptBatch,
  getNextVideoPromptBatch, submitVideoPromptBatch,
  duplicateProject, renameProject, archiveProject, deleteProjectPermanently,
  listProjectBackupsFor, restoreProjectBackup, projectDir,
  stripAlignmentFromLyrics, clearedPromptPipeline, resetStoryboardAndPromptState, activeBatchResponse
};
