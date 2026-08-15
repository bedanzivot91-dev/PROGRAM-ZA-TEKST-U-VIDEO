'use strict';

// Dodatni alati za tekst-u-video workflow. Modul je namerno bez spoljašnjih
// zavisnosti da bi radio offline u Windows buildu.

function cleanText(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function parseTimestamp(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = String(match[4] || '').padEnd(3, '0').slice(0, 3);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + Number(fraction || 0);
}

function formatLrcTimestamp(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centiseconds = Math.floor((total % 1000) / 10);
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
}

function parseLrc(text, { durationMs = null } = {}) {
  const metadata = {};
  const rawCues = [];
  for (const line of cleanText(text).split('\n')) {
    const meta = line.match(/^\[([a-z]+):([^\]]*)\]\s*$/i);
    if (meta && !/^\d{1,3}:\d{2}/.test(meta[1])) {
      metadata[meta[1].toLowerCase()] = meta[2].trim();
      continue;
    }
    const timestamps = [...line.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!timestamps.length) continue;
    const lyric = line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    for (const match of timestamps) {
      const startMs = parseTimestamp(match[1]);
      if (startMs !== null && lyric) rawCues.push({ startMs, text: lyric });
    }
  }
  rawCues.sort((a, b) => a.startMs - b.startMs);
  const endLimit = Number.isFinite(Number(durationMs)) ? Number(durationMs) : null;
  const cues = rawCues.map((cue, index) => {
    const next = rawCues[index + 1]?.startMs;
    const endMs = next !== undefined ? Math.max(cue.startMs + 1, next) : (endLimit !== null ? Math.max(cue.startMs + 1, endLimit) : cue.startMs + 3000);
    return { cueId: `lrc-${String(index + 1).padStart(4, '0')}`, startMs: cue.startMs, endMs, text: cue.text, enabled: true, deleted: false };
  });
  return { metadata, cues };
}

function exportLrc(cues, metadata = {}) {
  const header = Object.entries(metadata).map(([key, value]) => `[${key}:${String(value)}]`);
  const body = (cues || [])
    .filter(cue => !cue.deleted && cue.enabled !== false && cleanText(cue.text))
    .sort((a, b) => Number(a.startMs) - Number(b.startMs))
    .map(cue => `${formatLrcTimestamp(cue.startMs)}${cleanText(cue.text)}`);
  return [...header, ...body].join('\n') + (header.length || body.length ? '\n' : '');
}

function parseSrt(text) {
  const blocks = cleanText(text).split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex].split('-->');
    const startMs = parseTimestamp(timing[0].replace(',', '.').trim());
    const endMs = parseTimestamp(timing[1].trim().split(/\s+/)[0]);
    const lyric = lines.slice(timingIndex + 1).join('\n').trim();
    if (startMs === null || endMs === null || endMs <= startMs || !lyric) continue;
    cues.push({ cueId: `srt-${String(cues.length + 1).padStart(4, '0')}`, startMs, endMs, text: lyric, enabled: true, deleted: false });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

function createKaraokeWordTimings(cue, { minWordMs = 80 } = {}) {
  const text = cleanText(cue?.text);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const startMs = Number(cue?.startMs) || 0;
  const endMs = Math.max(startMs + 1, Number(cue?.endMs) || startMs + 1);
  if (!words.length) return [];
  const weights = words.map(word => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const available = endMs - startMs;
  let cursor = startMs;
  return words.map((word, index) => {
    const remaining = words.length - index - 1;
    const proportional = Math.round(available * weights[index] / totalWeight);
    const minRemaining = remaining * minWordMs;
    const duration = index === words.length - 1 ? endMs - cursor : Math.max(minWordMs, Math.min(proportional, endMs - cursor - minRemaining));
    const result = { word, startMs: cursor, endMs: cursor + duration, index };
    cursor += duration;
    return result;
  });
}

function validateCaptionTrack(track, { durationMs = null, minimumGapMs = 0 } = {}) {
  const cues = (track?.cues || []).filter(cue => !cue.deleted && cue.enabled !== false).slice().sort((a, b) => Number(a.startMs) - Number(b.startMs));
  const errors = [];
  const warnings = [];
  cues.forEach((cue, index) => {
    const startMs = Number(cue.startMs);
    const endMs = Number(cue.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) errors.push({ code: 'INVALID_RANGE', cueId: cue.cueId || index, message: 'Kraj mora biti posle početka.' });
    if (!cleanText(cue.text)) errors.push({ code: 'EMPTY_TEXT', cueId: cue.cueId || index, message: 'Titl nema tekst.' });
    if (durationMs !== null && endMs > Number(durationMs)) errors.push({ code: 'OUT_OF_BOUNDS', cueId: cue.cueId || index, message: 'Titl prelazi kraj videa.' });
    const next = cues[index + 1];
    if (next) {
      const gap = Number(next.startMs) - endMs;
      if (gap < 0) errors.push({ code: 'OVERLAP', cueId: cue.cueId || index, nextCueId: next.cueId || index + 1, message: 'Titlovi se preklapaju.' });
      else if (gap < minimumGapMs) warnings.push({ code: 'SHORT_GAP', cueId: cue.cueId || index, gapMs: gap, message: 'Razmak između titlova je veoma kratak.' });
    }
  });
  return { valid: errors.length === 0, errors, warnings, cueCount: cues.length };
}

function normalizeCaptionTrack(track, { durationMs = null, minimumDurationMs = 80 } = {}) {
  const source = (track?.cues || []).filter(cue => !cue.deleted && cleanText(cue.text)).slice().sort((a, b) => Number(a.startMs) - Number(b.startMs));
  const cues = source.map((cue, index) => {
    const startMs = Math.max(0, Math.round(Number(cue.startMs) || 0));
    let endMs = Math.max(startMs + minimumDurationMs, Math.round(Number(cue.endMs) || startMs + minimumDurationMs));
    if (durationMs !== null) endMs = Math.min(endMs, Math.max(startMs + 1, Number(durationMs)));
    return { ...cue, cueId: cue.cueId || `cue-${String(index + 1).padStart(4, '0')}`, startMs, endMs, text: cleanText(cue.text), enabled: cue.enabled !== false, deleted: false };
  });
  for (let i = 0; i < cues.length - 1; i += 1) {
    if (cues[i].endMs > cues[i + 1].startMs) cues[i].endMs = Math.max(cues[i].startMs + 1, cues[i + 1].startMs);
  }
  return { ...track, cues };
}

function splitLongCaptionCue(cue, { maxChars = 42, maxDurationMs = 7000 } = {}) {
  const words = cleanText(cue?.text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const groups = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) { groups.push(current); current = word; } else current = candidate;
  }
  if (current) groups.push(current);
  const startMs = Number(cue.startMs) || 0;
  const endMs = Math.max(startMs + 1, Number(cue.endMs) || startMs + maxDurationMs);
  const wordCounts = groups.map(group => group.split(/\s+/).length);
  const totalWords = wordCounts.reduce((sum, value) => sum + value, 0);
  let cursor = startMs;
  return groups.map((text, index) => {
    const end = index === groups.length - 1 ? endMs : cursor + Math.max(1, Math.round((endMs - startMs) * wordCounts[index] / totalWords));
    const result = { ...cue, cueId: `${cue.cueId || 'cue'}-${index + 1}`, startMs: cursor, endMs: end, text };
    cursor = end;
    return result;
  });
}

function getSafeAreaPreset(format = '16:9') {
  const key = String(format).toLowerCase().replace(/\s/g, '');
  const presets = {
    '16:9': { format: '16:9', width: 1920, height: 1080, left: 0.08, right: 0.08, top: 0.08, bottom: 0.1 },
    '9:16': { format: '9:16', width: 1080, height: 1920, left: 0.08, right: 0.08, top: 0.12, bottom: 0.16 },
    '1:1': { format: '1:1', width: 1080, height: 1080, left: 0.08, right: 0.08, top: 0.1, bottom: 0.1 }
  };
  return presets[key] || presets['16:9'];
}

function detectBeatMarkers(energy = [], { fps = 30, threshold = 0.62, minIntervalMs = 250 } = {}) {
  const values = energy.map(value => Number(value)).map(value => Number.isFinite(value) ? Math.max(0, value) : 0);
  const markers = [];
  let lastMs = -Infinity;
  for (let index = 1; index < values.length - 1; index += 1) {
    const value = values[index];
    if (value < threshold || value < values[index - 1] || value < values[index + 1]) continue;
    const timeMs = Math.round(index / Math.max(1, fps) * 1000);
    if (timeMs - lastMs < minIntervalMs) continue;
    markers.push({ timeMs, strength: Number(value.toFixed(4)), index });
    lastMs = timeMs;
  }
  return markers;
}

function buildSceneCutsFromBeats(durationMs, markers = [], { minimumSceneMs = 1200, maximumSceneMs = 8000 } = {}) {
  const duration = Math.max(1, Math.round(Number(durationMs) || 0));
  const valid = markers.map(marker => Math.round(Number(marker.timeMs))).filter(time => time > 0 && time < duration).sort((a, b) => a - b);
  const cuts = [0];
  for (const time of valid) {
    const sinceLast = time - cuts[cuts.length - 1];
    if (sinceLast >= minimumSceneMs && sinceLast <= maximumSceneMs) cuts.push(time);
    else if (sinceLast > maximumSceneMs) cuts.push(cuts[cuts.length - 1] + maximumSceneMs);
  }
  while (duration - cuts[cuts.length - 1] > maximumSceneMs) cuts.push(cuts[cuts.length - 1] + maximumSceneMs);
  if (cuts[cuts.length - 1] !== duration) cuts.push(duration);
  return cuts.slice(0, -1).map((startMs, index) => ({ sceneId: `beat-scene-${String(index + 1).padStart(3, '0')}`, number: index + 1, startMs, endMs: cuts[index + 1], durationMs: cuts[index + 1] - startMs, cutReason: index === cuts.length - 2 ? 'song_end' : 'beat' }));
}

function buildBatchExportPlan({ baseName = 'lyrics-video', outputDir = 'exports', formats = ['srt', 'vtt', 'lrc', 'ass'] } = {}) {
  const allowed = new Set(['srt', 'vtt', 'lrc', 'ass', 'json']);
  return [...new Set(formats.map(format => String(format).toLowerCase()).filter(format => allowed.has(format)))].map(format => ({ format, outputPath: `${outputDir}/${baseName}.${format}`, status: 'pending' }));
}

module.exports = {
  parseLrc, exportLrc, parseSrt, createKaraokeWordTimings,
  validateCaptionTrack, normalizeCaptionTrack, splitLongCaptionCue,
  getSafeAreaPreset, detectBeatMarkers, buildSceneCutsFromBeats, buildBatchExportPlan
};
