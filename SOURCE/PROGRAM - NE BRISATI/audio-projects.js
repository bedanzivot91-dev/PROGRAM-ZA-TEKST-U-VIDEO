'use strict';

// Skladištenje "audio spot" projekata (sekcija 25 master prompta): svaki projekat ima
// svoj folder pod storage-paths.projects/PROJECT_ID/ sa project.json + podfolderima.
// project.json čuva REFERENCE (putanje), ne base64 sadržaj slika/audio.

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
const { createBatchQueue, getNextBatch, lockScenePrompt, markFailed, skipScene, unlockScenePrompt, queueSummary } = require('./scene-batch-queue');
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

// Piše u privremeni fajl pa premešta — sprečava polovičan/oštećen zapis pri prekidu (sekcija 25/31).
function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readProjectJson(projectId) {
  const file = projectFile(projectId);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      // Buduće migracije idu ovde. Za sada samo prijavljujemo verziju, ne odbacujemo projekat.
      parsed._schemaMismatch = true;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isValidProjectId(id) {
  return typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id);
}

function createProject({ name, songTitle, artist } = {}) {
  const projectId = crypto.randomUUID();
  const dir = projectDir(projectId);
  for (const sub of PROJECT_SUBDIRS) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const now = new Date().toISOString();
  const project = {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    name: String(name || songTitle || 'Novi spot').slice(0, 200),
    songTitle: String(songTitle || '').slice(0, 200),
    artist: String(artist || '').slice(0, 200),
    activeConceptId: '',
    activeYoutubeChannelId: '',
    createdAt: now,
    updatedAt: now,
    audioHash: '',
    audio: null,
    lyrics: null,
    progress: { audio: 0, lyrics: 0, alignment: 0, storyboard: 0, imagePrompts: 0, images: 0, videoPrompts: 0 }
  };
  atomicWriteJson(projectFile(projectId), project);
  return project;
}

// Sekcija 23: pretraga, sortiranje, filter statusa/kanala za "MOJI SPOTOVI" stranicu. Svaki
// projekat dobija RAČUNATI status/overallProgress (nikad ručno postavljen — vidi project-status.js).
function listProjects({ search = '', status = '', channelId = '', sort = 'updatedAt_desc' } = {}) {
  if (!fs.existsSync(storagePaths.projects)) return [];
  const entries = fs.readdirSync(storagePaths.projects, { withFileTypes: true }).filter(e => e.isDirectory());
  let projects = [];
  for (const entry of entries) {
    const project = readProjectJson(entry.name);
    if (!project) continue;
    projects.push({ ...project, status: computeProjectStatus(project), overallProgress: computeOverallProgress(project) });
  }

  const searchNormalized = String(search || '').toLowerCase().trim();
  if (searchNormalized) {
    projects = projects.filter(p =>
      String(p.name || '').toLowerCase().includes(searchNormalized) ||
      String(p.songTitle || '').toLowerCase().includes(searchNormalized) ||
      String(p.artist || '').toLowerCase().includes(searchNormalized)
    );
  }
  if (status) projects = projects.filter(p => p.status === status);
  if (channelId) projects = projects.filter(p => p.activeYoutubeChannelId === channelId);

  const sorters = {
    updatedAt_desc: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    updatedAt_asc: (a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)),
    createdAt_desc: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    name_asc: (a, b) => String(a.name).localeCompare(String(b.name)),
    progress_desc: (a, b) => b.overallProgress - a.overallProgress
  };
  projects.sort(sorters[sort] || sorters.updatedAt_desc);
  return projects;
}

function getProject(projectId) {
  if (!isValidProjectId(projectId)) return null;
  return readProjectJson(projectId);
}

// Isti računati status/overallProgress kao listProjects(), za pojedinačan GET (sekcija 23 —
// kartica MORA prikazivati isti status na listi i kada se otvori pojedinačno).
function getProjectWithStatus(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  return { ...project, status: computeProjectStatus(project), overallProgress: computeOverallProgress(project) };
}

function updateProject(projectId, patch) {
  const project = getProject(projectId);
  if (!project) return null;
  const updated = { ...project, ...patch, projectId: project.projectId, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  delete updated._schemaMismatch;
  atomicWriteJson(projectFile(projectId), updated);
  return updated;
}

// Sekcija 23 dugmad: DUPLIRAJ/PREIMENUJ/ARHIVIRAJ/OBRIŠI. Brisanje NIKAD ne ide direktno —
// caller mora eksplicitno tražiti trajno brisanje (deletePermanently:true), inače se projekat
// samo arhivira (pravilo 0.28: "deinstalacija ne sme automatski obrisati projekte bez pitanja",
// isti duh važi i za obično brisanje iz UI-ja — potrebna je jasna, namerna akcija).
function duplicateProject(projectId, { name } = {}) {
  const source = getProject(projectId);
  if (!source) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }

  const newProjectId = crypto.randomUUID();
  const sourceDir = projectDir(projectId);
  const destDir = projectDir(newProjectId);
  fs.mkdirSync(destDir, { recursive: true });
  copyProjectFiles(sourceDir, destDir);

  const now = new Date().toISOString();
  const duplicated = {
    ...source,
    projectId: newProjectId,
    name: name || `${source.name} (kopija)`,
    createdAt: now,
    updatedAt: now,
    archived: false,
    lastError: null
  };
  atomicWriteJson(projectFile(newProjectId), duplicated);
  return duplicated;
}

function copyProjectFiles(sourceDir, destDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(destPath, { recursive: true }); copyProjectFiles(sourcePath, destPath); }
    else fs.copyFileSync(sourcePath, destPath);
  }
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

// Trajno brisanje — poziva se SAMO na eksplicitan zahtev korisnika (dugme OBRIŠI + potvrda u UI).
function deleteProjectPermanently(projectId) {
  if (!isValidProjectId(projectId)) { const error = new Error('Neispravan ID projekta.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const dir = projectDir(projectId);
  if (!fs.existsSync(dir)) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, deleted: projectId };
}

function fileSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Čuva preneti audio fajl na disk, propušta ga kroz stvaran FFprobe (nikad ne pretpostavlja
// trajanje — pravilo 0.1-0.4), i upisuje rezultat u project.json.
async function attachAudioToProject(projectId, buffer, originalFileName) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }

  const ext = path.extname(String(originalFileName || '')).toLowerCase();
  if (!audioProbe.SUPPORTED_EXTENSIONS.has(ext)) {
    const error = new Error(`Nepodržan format: ${ext || '(bez ekstenzije)'}. Podržano: MP3, WAV, M4A, AAC, FLAC.`);
    error.code = 'UNSUPPORTED_FORMAT';
    throw error;
  }

  const audioHash = fileSha256(buffer);
  // Interni, bezbedan naziv fajla — originalno ime NIKAD ne postaje sistemska putanja (pravilo 7).
  const storedFileName = `source-${audioHash.slice(0, 16)}${ext}`;
  const storedPath = path.join(projectDir(projectId), 'audio', storedFileName);
  fs.mkdirSync(path.dirname(storedPath), { recursive: true });
  fs.writeFileSync(storedPath, buffer);

  let probe;
  try {
    probe = await audioProbe.probeAudioFile(storedPath);
  } catch (error) {
    try { fs.unlinkSync(storedPath); } catch {}
    throw error;
  }

  return updateProject(projectId, {
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
    progress: { ...project.progress, audio: 100 }
  });
}

function setProjectLyrics(projectId, rawText) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const parsed = parseLyrics(rawText);
  // Ako je prethodni tekst bio automatski izvučen, korisnička izmena postaje "auto_transcribed_edited"
  // (sekcija 9.2 lyricsSource enum), a ne obična "user" — razlika je bitna za buduću proveru pouzdanosti.
  const wasAutoTranscribed = project.lyrics?.lyricsSource === 'auto_transcribed' || project.lyrics?.lyricsSource === 'auto_transcribed_edited';
  parsed.lyricsSource = wasAutoTranscribed ? 'auto_transcribed_edited' : 'user';
  parsed.needsReview = false;
  return updateProject(projectId, {
    lyrics: parsed,
    progress: { ...project.progress, lyrics: parsed.lines.length ? 100 : 0 }
  });
}

// Sekcija 9.2: kada korisnik NEMA tekst, program sam izvlači vokal, transkribuje, piše čitljiv
// tekst i traži potvrdu — needsReview ostaje true dok korisnik ne pregleda/izmeni preko setProjectLyrics.
async function generateAutoLyrics(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const result = await autoLyrics.autoWriteLyrics(audioPath, project.audioHash, options);

  if (!result.ok) {
    return updateProject(projectId, {
      lyricsGenerationStatus: { ok: false, reason: result.reason, attemptedAt: new Date().toISOString() }
    });
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
  return updateProject(projectId, {
    lyrics,
    lyricsGenerationStatus: { ok: true, usedVocalStem: result.usedVocalStem, model: result.transcriptionModel, attemptedAt: new Date().toISOString() },
    progress: { ...project.progress, lyrics: lyrics.lines.length ? 60 : 0 } // 60% jer i dalje traži korisničku potvrdu (needsReview)
  });
}

// Poravnava POSTOJEĆI (korisnički) tekst pesme sa audio-fajlom preko transkripcije (sekcija 9.1:
// "program koristi transkripciju prvenstveno da odredi kada se reči pevaju", tekst se ne menja).
// Ako alat za transkripciju nije instaliran, ne baca grešku — projekat ostaje upotrebljiv,
// samo bez vremenskih oznaka po liniji (needsReview ostaje na korisničkom tekstu kakav jeste).
async function alignProjectLyrics(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }
  if (!project.lyrics || !project.lyrics.lines?.length) { const error = new Error('Projekat nema unet tekst pesme za poravnanje.'); error.code = 'LYRICS_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const transcription = await transcriptionProvider.transcribeAudio(audioPath, project.audioHash, options);

  if (!transcription.ok) {
    return updateProject(projectId, {
      transcription: { ok: false, reason: transcription.reason, attemptedAt: new Date().toISOString() }
    });
  }

  const alignment = alignLyrics(project.lyrics.lines, transcription.words, { totalDurationMs: project.audio.durationMs });
  const alignedLines = project.lyrics.lines.map(line => {
    const match = alignment.lines.find(l => l.lineId === line.lineId);
    return match ? { ...line, startMs: match.startMs, endMs: match.endMs, alignmentConfidence: match.alignmentConfidence, matchedWordsRatio: match.matchedWordsRatio, source: match.source, needsReview: match.needsReview } : line;
  });

  return updateProject(projectId, {
    transcription: { ok: true, model: transcription.model, language: transcription.language, attemptedAt: new Date().toISOString() },
    lyrics: { ...project.lyrics, lines: alignedLines, overallConfidence: alignment.overallConfidence, needsReview: alignment.overallConfidence < 0.7 },
    progress: { ...project.progress, alignment: Math.round((alignment.matchedLineCount / alignment.totalLineCount) * 100) || 0 }
  });
}

// Sekcija 11: BPM/beat/energija analiza preko librosa (opciono — ako nije instalirano, projekat
// ostaje potpuno upotrebljiv, klijent nastavlja sa svojom Meyda-baziranom analizom u browseru).
async function analyzeProjectMusic(projectId, options = {}) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.audio) { const error = new Error('Projekat nema priložen audio fajl.'); error.code = 'AUDIO_MISSING'; throw error; }

  const audioPath = path.join(projectDir(projectId), 'audio', project.audio.storedFileName);
  const result = await musicAnalysis.analyzeMusic(audioPath, project.audioHash, options);

  if (!result.ok) {
    return updateProject(projectId, { musicAnalysis: { ok: false, reason: result.reason, attemptedAt: new Date().toISOString() } });
  }

  // Server-side librosa BPM se i dalje tretira kao KANDIDAT, ne kao potvrđena vrednost —
  // isto pravilo (sekcija 6) važi bez obzira na izvor detekcije.
  const bpmCandidates = buildBpmCandidates(result.bpm?.primary);
  return updateProject(projectId, {
    musicAnalysis: {
      ok: true,
      bpmCandidates,
      beatTimesMs: result.beatTimesMs,
      downbeatTimesMs: result.downbeatTimesMs,
      onsets: result.onsets,
      energy: result.energy,
      noveltyCurve: result.noveltyCurve,
      attemptedAt: new Date().toISOString()
    }
  });
}

// Sekcije 13/14: gradi kandidate iz onoga što projekat već ima (poravnat tekst, muzička
// analiza) i pušta ScenePlanner (dinamičko programiranje) da izabere rezove. Rezultat se UVEK
// proverava strogim timeline-validator.js pre čuvanja — ako validacija ikad padne, to je bug
// u planeru, ne nešto što se tiho ignoriše.
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

  // Sekcija 31: backup PRE zamene storyboarda — samo kada već postoji nešto da se zameni.
  if (project.storyboard) projectBackup.createProjectBackup(projectDir(projectId), project, 'before_storyboard_replace');

  return updateProject(projectId, {
    storyboard: { scenes: planResult.scenes, settings: planResult.settings, candidateCount: candidates.length, generatedAt: new Date().toISOString() },
    progress: { ...project.progress, storyboard: 100 }
  });
}

// Sekcija 21.3: sledeći batch od najviše 5 scena BEZ zaključanog image prompta. Kreira queue
// lenjo (prvi poziv) iz storyboard scena, čuva stanje u project.json tako da restart nastavlja
// od poslednjeg stanja (ne ispočetka).
function getNextImagePromptBatch(projectId) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.storyboard?.scenes?.length) { const error = new Error('Projekat nema storyboard sa scenama.'); error.code = 'STORYBOARD_MISSING'; throw error; }

  const queue = project.imageBatchQueue || createBatchQueue(project.storyboard.scenes.map(s => s.sceneId));
  const sceneIds = getNextBatch(queue);
  if (!sceneIds.length) {
    updateProject(projectId, { imageBatchQueue: queue });
    return { done: true, batchId: null, sceneIds: [], summary: queueSummary(queue) };
  }

  const batchCounter = (project.imageBatchCounter || 0) + 1;
  const batchId = `image-batch-${String(batchCounter).padStart(3, '0')}`;
  updateProject(projectId, { imageBatchQueue: queue, imageBatchCounter: batchCounter, lastImageBatchId: batchId });

  return {
    done: false, batchId, sceneIds,
    scenes: sceneIds.map(id => project.storyboard.scenes.find(s => s.sceneId === id)),
    summary: queueSummary(queue)
  };
}

// Sekcija 21.2: validira AI odgovor, i za svaku scenu FinalPromptBuilder automatski dodaje puni
// zaključani identitet (AI odgovor ga NIKAD ne sadrži — samo scenski deo prompta).
function submitImagePromptBatch(projectId, aiResponse) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.imageBatchQueue || !project.lastImageBatchId) { const error = new Error('Nema aktivnog image batch-a — prvo pozovi getNextImagePromptBatch.'); error.code = 'NO_ACTIVE_BATCH'; throw error; }

  const knownSceneIds = new Set((project.storyboard?.scenes || []).map(s => s.sceneId));
  const validation = validatePromptBatchResponse(aiResponse, { expectedBatchId: project.lastImageBatchId, batchType: 'image', knownSceneIds });
  if (!validation.valid) {
    const error = new Error(`AI odgovor za image batch nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_AI_RESPONSE';
    error.problems = validation.problems;
    throw error;
  }

  // Sekcija 31: backup PRE velikog AI uvoza.
  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_ai_import_image_prompts');

  const queue = project.imageBatchQueue;
  const prompts = { ...(project.imagePrompts || {}) };
  const identity = { positive: identityText.POSITIVE, negative: identityText.NEGATIVE };

  for (const item of aiResponse.items) {
    const scene = project.storyboard.scenes.find(s => s.sceneId === item.sceneId);
    const { finalPrompt, finalNegativePrompt } = buildFinalImagePrompt({ ...scene, scenePrompt: item.scenePrompt, sceneNegativePrompt: item.sceneNegativePrompt }, identity);
    prompts[item.sceneId] = { sceneId: item.sceneId, scenePrompt: item.scenePrompt, finalPrompt, finalNegativePrompt, continuityNotes: item.continuityNotes || '', lockedAt: new Date().toISOString() };
    lockScenePrompt(queue, item.sceneId);
  }

  return updateProject(projectId, {
    imageBatchQueue: queue,
    imagePrompts: prompts,
    progress: { ...project.progress, imagePrompts: queueSummary(queue).progressPercent }
  });
}

// Sekcija 21.5: video promptovi su POSEBAN zadatak od image promptova, sopstveni batch od 5.
// Ulaz zahteva da scena već ima zaključan image prompt ("izabrana slika") — video animira
// postojeću sliku, ne generiše iz ničega.
function getNextVideoPromptBatch(projectId) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const imageSceneIds = Object.keys(project.imagePrompts || {});
  if (!imageSceneIds.length) { const error = new Error('Nijedna scena još nema zaključan image prompt — video promptovi zahtevaju izabranu sliku.'); error.code = 'IMAGES_REQUIRED'; throw error; }

  const queue = project.videoBatchQueue || createBatchQueue(imageSceneIds);
  const sceneIds = getNextBatch(queue);
  if (!sceneIds.length) {
    updateProject(projectId, { videoBatchQueue: queue });
    return { done: true, batchId: null, sceneIds: [], summary: queueSummary(queue) };
  }

  const batchCounter = (project.videoBatchCounter || 0) + 1;
  const batchId = `video-batch-${String(batchCounter).padStart(3, '0')}`;
  updateProject(projectId, { videoBatchQueue: queue, videoBatchCounter: batchCounter, lastVideoBatchId: batchId });

  return {
    done: false, batchId, sceneIds,
    scenes: sceneIds.map(id => project.storyboard?.scenes?.find(s => s.sceneId === id)),
    summary: queueSummary(queue)
  };
}

function submitVideoPromptBatch(projectId, aiResponse) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  if (!project.videoBatchQueue || !project.lastVideoBatchId) { const error = new Error('Nema aktivnog video batch-a — prvo pozovi getNextVideoPromptBatch.'); error.code = 'NO_ACTIVE_BATCH'; throw error; }

  const knownSceneIds = new Set(Object.keys(project.imagePrompts || {}));
  const validation = validatePromptBatchResponse(aiResponse, { expectedBatchId: project.lastVideoBatchId, batchType: 'video', knownSceneIds });
  if (!validation.valid) {
    const error = new Error(`AI odgovor za video batch nije validan: ${validation.problems.join('; ')}`);
    error.code = 'INVALID_AI_RESPONSE';
    error.problems = validation.problems;
    throw error;
  }

  // Sekcija 31: backup PRE velikog AI uvoza.
  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_ai_import_video_prompts');

  const queue = project.videoBatchQueue;
  const prompts = { ...(project.videoPrompts || {}) };

  for (const item of aiResponse.items) {
    // Sekcija 16: "Video prompt mora automatski dobiti continuity/identity zabrane" — zaključani
    // negative identitet se AUTOMATSKI dodaje, AI ga ne šalje sam.
    const negativeVideoPrompt = [identityText.NEGATIVE, item.negativeVideoPrompt].filter(Boolean).join(', ');
    prompts[item.sceneId] = { sceneId: item.sceneId, videoPrompt: item.videoPrompt, negativeVideoPrompt, durationMs: item.durationMs ?? null, lockedAt: new Date().toISOString() };
    lockScenePrompt(queue, item.sceneId);
  }

  return updateProject(projectId, {
    videoBatchQueue: queue,
    videoPrompts: prompts,
    progress: { ...project.progress, videoPrompts: queueSummary(queue).progressPercent }
  });
}

// Sekcija 31: "VRATI PRETHODNU VERZIJU" — vraća projekat u stanje iz izabranog backup-a.
// Pravi NOV backup TRENUTNOG stanja pre vraćanja (da se i "vraćanje" može poništiti).
function listProjectBackupsFor(projectId) {
  if (!isValidProjectId(projectId)) { const error = new Error('Neispravan ID projekta.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  return projectBackup.listProjectBackups(projectDir(projectId));
}

function restoreProjectBackup(projectId, fileName) {
  const project = getProject(projectId);
  if (!project) { const error = new Error('Projekat nije pronađen.'); error.code = 'PROJECT_NOT_FOUND'; throw error; }
  const restoredState = projectBackup.readProjectBackup(projectDir(projectId), fileName);
  projectBackup.createProjectBackup(projectDir(projectId), project, 'before_restore');
  const merged = { ...restoredState, projectId: project.projectId, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
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
  listProjectBackupsFor, restoreProjectBackup, projectDir
};
