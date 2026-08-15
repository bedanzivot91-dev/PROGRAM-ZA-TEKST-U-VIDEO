'use strict';

// Export formata za "Tekst na videu" modul (sekcija 12/23 dodatka): SRT, VTT, ASS (za
// FFmpeg/libass burn-in) i JSON (za razmenu/debug). Takođe gradi FFmpeg argumente za spajanje
// ASS fajla u video (libass burn-in render, sekcija 20 dodatka — jednostavni statični stilovi
// idu ovim putem; napredne animacije iz TextAnimationEngine idu preko RGBA overlay kompozicije,
// što NIJE deo ovog fajla).

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { resolveFontSizePx } = require('./text-layout-engine');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');

// --- Vremenske oznake ---

function pad(n, width = 2) { return String(Math.trunc(n)).padStart(width, '0'); }

function splitMs(totalMs) {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return { hours, minutes, seconds, millis };
}

function msToSrtTimestamp(totalMs) {
  const { hours, minutes, seconds, millis } = splitMs(totalMs);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function msToVttTimestamp(totalMs) {
  const { hours, minutes, seconds, millis } = splitMs(totalMs);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

// ASS koristi centisekunde (2 cifre), a sat se obično piše bez vodeće nule (1 cifra dovoljna).
function msToAssTimestamp(totalMs) {
  const { hours, minutes, seconds, millis } = splitMs(totalMs);
  const centis = Math.floor(millis / 10);
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

function activeCues(track) {
  return (track.cues || []).filter(c => !c.deleted && c.enabled !== false).sort((a, b) => a.startMs - b.startMs);
}

// --- SRT / VTT ---

function exportTrackToSrt(track) {
  const cues = activeCues(track);
  return cues.map((cue, index) => `${index + 1}\n${msToSrtTimestamp(cue.startMs)} --> ${msToSrtTimestamp(cue.endMs)}\n${cue.text}\n`).join('\n');
}

function exportTrackToVtt(track) {
  const cues = activeCues(track);
  const body = cues.map(cue => `${msToVttTimestamp(cue.startMs)} --> ${msToVttTimestamp(cue.endMs)}\n${cue.text}`).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

// --- ASS (za libass burn-in) ---

// Pretvara #RRGGBB + opacity (0-1, 1=neproviran) u ASS &HAABBGGRR format (ASS alfa je INVERTOVAN:
// 00=potpuno neproviran, FF=potpuno providan; boje su u BGR redosledu, ne RGB).
function colorToAssHex(hexColor, opacity = 1) {
  const hex = String(hexColor || '#FFFFFF').replace('#', '').padEnd(6, '0');
  const r = hex.slice(0, 2);
  const g = hex.slice(2, 4);
  const b = hex.slice(4, 6);
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255);
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  return `&H${alphaHex}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

function buildAssStyleLine(style, video) {
  const fontSizePx = resolveFontSizePx(style, video.height);
  const primaryColor = colorToAssHex(style.color?.solid || '#FFFFFF', style.color?.opacity ?? 1);
  const outlineColor = colorToAssHex(style.outline?.color || '#000000', style.outline?.opacity ?? 1);
  const outlineWidth = style.outline?.enabled ? (style.outline.thickness || 0) : 0;
  const bold = (style.font?.weight || 400) >= 700 ? -1 : 0;
  const italic = style.font?.italic ? -1 : 0;
  return `Style: Default,${style.font?.family || 'Arial'},${fontSizePx},${primaryColor},${primaryColor},${outlineColor},&H64000000,${bold},${italic},0,0,100,100,0,0,1,${outlineWidth},0,2,10,10,10,1`;
}

function escapeAssText(text) {
  return String(text || '').replace(/\r?\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

// Minimalan, validan ASS fajl — jedan "Default" stil izveden iz Style objekta, jedan Dialogue red
// po aktivnom cue-u. Napredne animacije (TextAnimationEngine keyframes/motion path) se NE prevode
// ovde u ASS \move/\t tagove — taj put ide preko RGBA overlay kompozicije (van dometa ovog fajla).
function exportTrackToAss(track, style, video) {
  const cues = activeCues(track);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildAssStyleLine(style, video),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const events = cues.map(cue => `Dialogue: 0,${msToAssTimestamp(cue.startMs)},${msToAssTimestamp(cue.endMs)},Default,,0,0,0,,${escapeAssText(cue.text)}`).join('\n');
  return `${header}\n${events}\n`;
}

// --- JSON (razmena/debug) ---

function exportTrackToJson(track) {
  return JSON.stringify(track, null, 2);
}

// --- FFmpeg/libass burn-in render ---

function findExecutableRecursive(root, fileName, depthLimit = 4) {
  if (!fs.existsSync(root)) return null;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full;
      if (entry.isDirectory() && depth < depthLimit) stack.push({ dir: full, depth: depth + 1 });
    }
  }
  return null;
}

let cachedFfmpegPath = null;
function resolveFfmpegPath() {
  if (cachedFfmpegPath && fs.existsSync(cachedFfmpegPath)) return cachedFfmpegPath;
  const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = findExecutableRecursive(path.join(RUNTIME_DIR, 'ffmpeg-portable'), exeName);
  if (bundled) { cachedFfmpegPath = bundled; return bundled; }
  cachedFfmpegPath = exeName; // oslanjanje na sistemski PATH kao poslednju opciju
  return cachedFfmpegPath;
}

// KRITIČNO (utvrđeno STVARNIM testiranjem protiv prave ffmpeg 8.1.2/libass instalacije, ne
// pretpostavkom): uobičajeni "escape-uj dvotačku kao \:" savet za Windows apsolutne putanje u
// ass/subtitles filteru NIJE pouzdano radio ovde — ass filter je i dalje pogrešno parsirao
// "original_size" iz ostatka putanje. Ono što STVARNO radi: pokreni ffmpeg sa cwd postavljenim
// na folder ASS fajla i prosledi SAMO ime fajla (bez apsolutne putanje, bez dvotačke) kao
// vrednost ass= filtera. -i i izlazna putanja OSTAJU apsolutne (to nije unutar filtergraph
// stringa pa dvotačka tamo nije problem).
const FILTERGRAPH_UNSAFE_CHARS = /[:,;[\]'\\]/;

function assertSafeAssFileName(fileName) {
  if (FILTERGRAPH_UNSAFE_CHARS.test(fileName)) {
    throw new Error(`Naziv ASS fajla "${fileName}" sadrži znak koji FFmpeg filtergraph parser tumači kao separator (: , ; [ ] ' \\). Preimenuj fajl bez tih znakova.`);
  }
}

function buildBurnInFfmpegArgs(inputVideoPath, assFilePath, outputVideoPath) {
  // path.basename na POSIX-u ne prepoznaje Windows '\\' kao separator.
  // Installer je Windows program, ali testovi i razvoj mogu da se izvršavaju
  // na Linux/macOS hostu, zato normalizujemo oba oblika putanje pre basename-a.
  const normalizedAssPath = String(assFilePath || '').replace(/\\/g, '/');
  const assBaseName = path.posix.basename(normalizedAssPath);
  assertSafeAssFileName(assBaseName);
  return ['-y', '-i', path.resolve(inputVideoPath), '-vf', `ass=${assBaseName}`, '-c:a', 'copy', path.resolve(outputVideoPath)];
}

function renderBurnIn({ inputVideoPath, assFilePath, outputVideoPath, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath();
    const args = buildBurnInFfmpegArgs(inputVideoPath, assFilePath, outputVideoPath);
    const cwd = path.dirname(path.resolve(assFilePath));
    childProcess.execFile(ffmpegPath, args, { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const notFound = error.code === 'ENOENT';
        const message = notFound
          ? 'FFmpeg nije pronađen. Instaliraj FFmpeg preko panela LOKALNI ALATI u programu.'
          : `FFmpeg burn-in greška: ${(stderr || error.message || '').toString().trim().slice(0, 500)}`;
        return reject(Object.assign(new Error(message), { code: notFound ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_FAILED' }));
      }
      resolve({ ok: true, outputVideoPath });
    });
  });
}

module.exports = {
  msToSrtTimestamp, msToVttTimestamp, msToAssTimestamp,
  exportTrackToSrt, exportTrackToVtt, exportTrackToAss, exportTrackToJson,
  colorToAssHex, buildBurnInFfmpegArgs, resolveFfmpegPath, renderBurnIn
};
