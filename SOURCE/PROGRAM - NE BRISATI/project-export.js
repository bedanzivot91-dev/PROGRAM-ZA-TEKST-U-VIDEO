'use strict';

const zlib = require('zlib');

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

function exportProjectJson(project) { return JSON.stringify(stripSecrets(project), null, 2); }
function exportStoryboardJson(project) { return JSON.stringify(project?.storyboard || { scenes: [] }, null, 2); }

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
    `ID: ${scene.sceneId}\nRazlog reza: ${scene.cutReason || '—'}\n`
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

function exportLyricsTxt(project) { return project?.lyrics?.formattedLyrics || ''; }
function exportLyricsTimestampsJson(project) { return JSON.stringify(project?.lyrics?.lines || [], null, 2); }

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

function framesFromMs(ms, fps = 25) { return Math.max(0, Math.round((Number(ms) || 0) * fps / 1000)); }
function edlTc(ms, fps = 25) {
  const frames = framesFromMs(ms, fps);
  const ff = frames % fps;
  const totalSeconds = Math.floor(frames / fps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

function exportEdl(project, fps = 25) {
  const scenes = project?.storyboard?.scenes || [];
  const title = String(project?.name || project?.songTitle || 'MUZICKI_SPOT').replace(/[^a-z0-9 _-]/gi, '').slice(0, 60) || 'MUZICKI_SPOT';
  const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
  scenes.forEach((scene, index) => {
    const event = String(index + 1).padStart(3, '0');
    const start = edlTc(scene.startMs, fps);
    const end = edlTc(scene.endMs, fps);
    lines.push(`${event}  AX       V     C        ${start} ${end} ${start} ${end}`);
    lines.push(`* FROM CLIP NAME: ${scene.sceneId || `scene-${event}`}`);
    if (scene.cutReason) lines.push(`* COMMENT: ${String(scene.cutReason).replace(/[\r\n]+/g, ' ')}`);
    lines.push('');
  });
  return lines.join('\r\n');
}

function pdfEscape(text) { return String(text || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?'); }
function buildMinimalPdf(lines) {
  const safeLines = lines.slice(0, 80).map(pdfEscape);
  const stream = ['BT', '/F1 11 Tf', '50 790 Td', ...safeLines.flatMap((line, i) => i === 0 ? [`(${line}) Tj`] : ['0 -15 Td', `(${line}) Tj`]), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

function exportProjectPdf(project) {
  const scenes = project?.storyboard?.scenes || [];
  const lines = [
    `Muzicki Spot Studio - ${project?.name || project?.songTitle || 'Projekat'}`,
    `Izvodjac: ${project?.artist || ''}`,
    `Broj scena: ${scenes.length}`,
    '',
    ...scenes.flatMap(scene => [`Scena ${scene.number ?? scene.sceneId}: ${formatTimecode(scene.startMs)} - ${formatTimecode(scene.endMs)}`, `Razlog reza: ${scene.cutReason || '-'}`])
  ];
  return buildMinimalPdf(lines);
}

function crc32(buffer) {
  let crc = 0 ^ -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const fileName = Buffer.from(name.replace(/\\/g, '/'));
    const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + fileName.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26); local.writeUInt16LE(0, 28); fileName.copy(local, 30);
    localParts.push(local, compressed);
    const central = Buffer.alloc(46 + fileName.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42); fileName.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, end]);
}

function exportProjectZip(project) {
  const clean = stripSecrets(project || {});
  return makeZip([
    ['project.json', JSON.stringify(clean, null, 2)],
    ['storyboard.json', exportStoryboardJson(clean)],
    ['storyboard.txt', exportStoryboardTxt(clean)],
    ['scenes.csv', exportScenesCsv(clean)],
    ['lyrics.txt', exportLyricsTxt(clean)],
    ['lyrics.srt', exportLyricsSrt(clean)],
    ['timeline.edl', exportEdl(clean)]
  ]);
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
  'lyrics.srt': { fn: exportLyricsSrt, mime: 'application/x-subrip' },
  'timeline.edl': { fn: exportEdl, mime: 'application/edl' },
  'project.pdf': { fn: exportProjectPdf, mime: 'application/pdf' },
  'project.zip': { fn: exportProjectZip, mime: 'application/zip' }
};

function exportProject(project, format) {
  const exporter = EXPORTERS[format];
  if (!exporter) throw new Error(`Nepoznat format izvoza: "${format}". Dostupno: ${Object.keys(EXPORTERS).join(', ')}.`);
  return { content: exporter.fn(project), mime: exporter.mime, fileName: format };
}

module.exports = {
  exportProject, stripSecrets, EXPORTERS,
  exportProjectJson, exportStoryboardJson, exportStoryboardTxt, exportScenesCsv,
  exportImagePromptsTxt, exportVideoPromptsTxt, exportLyricsTxt, exportLyricsTimestampsJson, exportLyricsSrt,
  exportEdl, exportProjectPdf, exportProjectZip, makeZip
};
