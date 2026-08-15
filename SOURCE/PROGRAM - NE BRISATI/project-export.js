'use strict';

// Sekcija 32: izvoz projekta u više formata. "Izvoz ne sadrži: OAuth token; API key; bridge
// key; privatne tajne." — project.json po dizajnu nikad ne čuva takve podatke (žive u
// posebnim secure fajlovima), ali stripSecrets() je odbrana za slučaj da se to ikad promeni.

const SECRET_FIELD_PATTERN = /token|secret|apikey|api_key|bridgekey|password|client_secret/i;

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (SECRET_FIELD_PATTERN.test(key)) continue;
      clean[key] = stripSecrets(val);
    }
    return clean;
  }
  return value;
}

function exportProjectJson(project) {
  return JSON.stringify(stripSecrets(project), null, 2);
}

function exportStoryboardJson(project) {
  return JSON.stringify(project?.storyboard || { scenes: [] }, null, 2);
}

function formatTimecode(ms) {
  const total = Math.max(0, Math.round(ms || 0));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function exportStoryboardTxt(project) {
  const scenes = project?.storyboard?.scenes || [];
  if (!scenes.length) return 'Storyboard je prazan.';
  return scenes.map(scene =>
    `SCENA ${scene.number ?? scene.sceneId} [${formatTimecode(scene.startMs)}–${formatTimecode(scene.endMs)}]\n` +
    `ID: ${scene.sceneId}\n` +
    `Razlog reza: ${scene.cutReason || '—'}\n`
  ).join('\n');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportScenesCsv(project) {
  const scenes = project?.storyboard?.scenes || [];
  const header = ['sceneId', 'number', 'startMs', 'endMs', 'durationMs', 'cutReason'];
  const rows = scenes.map(s => [s.sceneId, s.number, s.startMs, s.endMs, s.durationMs, s.cutReason].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\r\n');
}

function exportImagePromptsTxt(project) {
  const prompts = Object.values(project?.imagePrompts || {});
  if (!prompts.length) return 'Nema zaključanih image promptova.';
  return prompts.map(p => `[${p.sceneId}]\n${p.finalPrompt}\n\nNEGATIVE: ${p.finalNegativePrompt}\n`).join('\n---\n\n');
}

function exportVideoPromptsTxt(project) {
  const prompts = Object.values(project?.videoPrompts || {});
  if (!prompts.length) return 'Nema zaključanih video promptova.';
  return prompts.map(p => `[${p.sceneId}]\n${p.videoPrompt}\n\nNEGATIVE: ${p.negativeVideoPrompt}\n`).join('\n---\n\n');
}

function exportLyricsTxt(project) {
  return project?.lyrics?.formattedLyrics || '';
}

function exportLyricsTimestampsJson(project) {
  return JSON.stringify(project?.lyrics?.lines || [], null, 2);
}

function srtTimecode(ms) {
  const total = Math.max(0, Math.round(ms || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function exportLyricsSrt(project) {
  const lines = (project?.lyrics?.lines || []).filter(l => Number.isFinite(l.startMs) && Number.isFinite(l.endMs));
  if (!lines.length) return '';
  return lines.map((line, index) => `${index + 1}\n${srtTimecode(line.startMs)} --> ${srtTimecode(line.endMs)}\n${line.text}\n`).join('\n');
}

const EXPORTERS = {
  'project.json': { fn: exportProjectJson, mime: 'application/json' },
  'storyboard.json': { fn: exportStoryboardJson, mime: 'application/json' },
  'storyboard.txt': { fn: exportStoryboardTxt, mime: 'text/plain' },
  'scenes.csv': { fn: exportScenesCsv, mime: 'text/csv' },
  'image-prompts.txt': { fn: exportImagePromptsTxt, mime: 'text/plain' },
  'video-prompts.txt': { fn: exportVideoPromptsTxt, mime: 'text/plain' },
  'lyrics.txt': { fn: exportLyricsTxt, mime: 'text/plain' },
  'lyrics-timestamps.json': { fn: exportLyricsTimestampsJson, mime: 'application/json' },
  'lyrics.srt': { fn: exportLyricsSrt, mime: 'application/x-subrip' }
};

function exportProject(project, format) {
  const exporter = EXPORTERS[format];
  if (!exporter) throw new Error(`Nepoznat format izvoza: "${format}". Dostupno: ${Object.keys(EXPORTERS).join(', ')}.`);
  return { content: exporter.fn(project), mime: exporter.mime, fileName: format };
}

module.exports = {
  exportProject, stripSecrets, EXPORTERS,
  exportProjectJson, exportStoryboardJson, exportStoryboardTxt, exportScenesCsv,
  exportImagePromptsTxt, exportVideoPromptsTxt, exportLyricsTxt, exportLyricsTimestampsJson, exportLyricsSrt
};
