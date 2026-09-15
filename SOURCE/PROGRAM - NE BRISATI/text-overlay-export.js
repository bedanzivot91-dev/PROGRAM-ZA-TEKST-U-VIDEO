'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { resolveFontSizePx } = require('./text-layout-engine');
const { interpolateKeyframes, resolveMotionPathPosition } = require('./text-animation-engine');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');

function pad(n, width = 2) { return String(Math.trunc(n)).padStart(width, '0'); }
function splitMs(totalMs) {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return { hours, minutes, seconds, millis };
}
function msToSrtTimestamp(totalMs) { const { hours, minutes, seconds, millis } = splitMs(totalMs); return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`; }
function msToVttTimestamp(totalMs) { const { hours, minutes, seconds, millis } = splitMs(totalMs); return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`; }
function msToAssTimestamp(totalMs) { const { hours, minutes, seconds, millis } = splitMs(totalMs); return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(Math.floor(millis / 10))}`; }
function activeCues(track) { return (track.cues || []).filter(c => !c.deleted && c.enabled !== false).sort((a, b) => a.startMs - b.startMs); }

function exportTrackToSrt(track) { return activeCues(track).map((cue, index) => `${index + 1}\n${msToSrtTimestamp(cue.startMs)} --> ${msToSrtTimestamp(cue.endMs)}\n${cue.text}\n`).join('\n'); }
function exportTrackToVtt(track) { const body = activeCues(track).map(cue => `${msToVttTimestamp(cue.startMs)} --> ${msToVttTimestamp(cue.endMs)}\n${cue.text}`).join('\n\n'); return `WEBVTT\n\n${body}\n`; }

function colorToAssHex(hexColor, opacity = 1) {
  const hex = String(hexColor || '#FFFFFF').replace('#', '').padEnd(6, '0');
  const r = hex.slice(0, 2), g = hex.slice(2, 4), b = hex.slice(4, 6);
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${alpha}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
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

function escapeAssText(text) { return String(text || '').replace(/\r?\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}'); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value))); }
function assAlphaFromOpacity(opacity) { return Math.round((1 - clamp01(opacity)) * 255).toString(16).padStart(2, '0').toUpperCase(); }

function normalizedPosition(props, animation, video) {
  let x = Number.isFinite(props.x) ? props.x : Number.isFinite(animation?.x) ? animation.x : 0.5;
  let y = Number.isFinite(props.y) ? props.y : Number.isFinite(animation?.y) ? animation.y : 0.85;
  if (x >= 0 && x <= 1) x *= video.width;
  if (y >= 0 && y <= 1) y *= video.height;
  return { x, y };
}

function sampledAnimatedEvents(cue, video, sampleMs = 40) {
  const animation = cue.animation;
  if (!animation || !Array.isArray(animation.keyframes) || animation.keyframes.length === 0) return null;
  const cueDuration = Math.max(1, cue.endMs - cue.startMs);
  const keyframes = animation.keyframes.map(k => ({ ...k, timeMs: Number(k.timeMs) || 0 }));
  const step = Math.max(20, Math.min(250, Number(animation.sampleMs) || sampleMs));
  const events = [];
  for (let rel = 0; rel < cueDuration; rel += step) {
    const next = Math.min(cueDuration, rel + step);
    const props = interpolateKeyframes(keyframes, rel);
    let pos = normalizedPosition(props, animation, video);
    if (animation.motionPath) {
      const progress = cueDuration <= 0 ? 1 : rel / cueDuration;
      const motion = resolveMotionPathPosition(animation.motionPath, progress);
      pos = { x: motion.x >= 0 && motion.x <= 1 ? motion.x * video.width : motion.x, y: motion.y >= 0 && motion.y <= 1 ? motion.y * video.height : motion.y };
    }
    const tags = [`\\pos(${Math.round(pos.x)},${Math.round(pos.y)})`];
    if (Number.isFinite(props.opacity)) tags.push(`\\alpha&H${assAlphaFromOpacity(props.opacity)}&`);
    const scale = Number.isFinite(props.scale) ? props.scale : 1;
    const scaleX = Number.isFinite(props.scaleX) ? props.scaleX : scale;
    const scaleY = Number.isFinite(props.scaleY) ? props.scaleY : scale;
    tags.push(`\\fscx${Math.round(scaleX * 100)}`, `\\fscy${Math.round(scaleY * 100)}`);
    if (Number.isFinite(props.rotation)) tags.push(`\\frz${props.rotation.toFixed(2)}`);
    events.push(`Dialogue: 0,${msToAssTimestamp(cue.startMs + rel)},${msToAssTimestamp(cue.startMs + next)},Default,,0,0,0,,{${tags.join('')}}${escapeAssText(cue.text)}`);
  }
  return events;
}

function staticEvent(cue) {
  const tags = [];
  const animation = cue.animation;
  if (animation?.fadeInMs || animation?.fadeOutMs) tags.push(`\\fad(${Math.max(0, Math.round(animation.fadeInMs || 0))},${Math.max(0, Math.round(animation.fadeOutMs || 0))})`);
  const prefix = tags.length ? `{${tags.join('')}}` : '';
  return `Dialogue: 0,${msToAssTimestamp(cue.startMs)},${msToAssTimestamp(cue.endMs)},Default,,0,0,0,,${prefix}${escapeAssText(cue.text)}`;
}

function exportTrackToAss(track, style, video) {
  const cues = activeCues(track);
  const header = [
    '[Script Info]','ScriptType: v4.00+',`PlayResX: ${video.width}`,`PlayResY: ${video.height}`,'WrapStyle: 0','',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildAssStyleLine(style, video),'','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');
  const events = [];
  for (const cue of cues) {
    const animated = sampledAnimatedEvents(cue, video);
    if (animated?.length) events.push(...animated); else events.push(staticEvent(cue));
  }
  return `${header}\n${events.join('\n')}\n`;
}

function exportTrackToJson(track) { return JSON.stringify(track, null, 2); }

function findExecutableRecursive(root, fileName, depthLimit = 4) {
  if (!fs.existsSync(root)) return null;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
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
  cachedFfmpegPath = exeName;
  return cachedFfmpegPath;
}

const FILTERGRAPH_UNSAFE_CHARS = /[:,;[\]'\\]/;
function assertSafeAssFileName(fileName) { if (FILTERGRAPH_UNSAFE_CHARS.test(fileName)) throw new Error(`Naziv ASS fajla "${fileName}" sadrži znak koji FFmpeg filtergraph parser tumači kao separator.`); }
function buildBurnInFfmpegArgs(inputVideoPath, assFilePath, outputVideoPath) {
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
        const message = notFound ? 'FFmpeg nije pronađen. Instaliraj FFmpeg preko panela LOKALNI ALATI u programu.' : `FFmpeg burn-in greška: ${(stderr || error.message || '').toString().trim().slice(0, 500)}`;
        return reject(Object.assign(new Error(message), { code: notFound ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_FAILED' }));
      }
      resolve({ ok: true, outputVideoPath });
    });
  });
}

module.exports = {
  msToSrtTimestamp, msToVttTimestamp, msToAssTimestamp,
  exportTrackToSrt, exportTrackToVtt, exportTrackToAss, exportTrackToJson,
  colorToAssHex, buildBurnInFfmpegArgs, resolveFfmpegPath, renderBurnIn,
  sampledAnimatedEvents
};
