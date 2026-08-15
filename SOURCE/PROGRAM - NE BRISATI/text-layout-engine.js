'use strict';

// TextLayoutEngine (sekcije 6-8 i 17 dodatka o tekstu na videu). Pretvara Style+Cue+dimenzije
// videa u konkretan raspored u pikselima (font veličina, prelom linija, pozicija, safe-zone
// provera). Pravilo iz sekcije 17: "Preview i finalni render moraju koristiti isti layout
// model" — i klijentski preview i FFmpeg render pipeline (FAZA 9) treba da pozivaju OVU
// funkciju (ili njen JS/klijentski ekvivalent sa istim ulazima/izlazima), ne dve odvojene
// implementacije koje mogu da se razminu.

const { buildLineBreakWarnings } = require('./lyrics-line-breaker');

// Standardne safe-zone margine (frakcija dimenzije kadra) po formatu videa — izbegavaju UI
// elemente platformi (YouTube/TikTok/Instagram dugmad, naslov, progress bar, caption oblast).
const SAFE_ZONES = {
  '16:9': { top: 0.06, bottom: 0.08, left: 0.05, right: 0.05 },
  '9:16': { top: 0.12, bottom: 0.20, left: 0.06, right: 0.06 },
  '1:1': { top: 0.08, bottom: 0.12, left: 0.06, right: 0.06 }
};
const DEFAULT_SAFE_ZONE = SAFE_ZONES['16:9'];

function resolveSafeZone(aspectRatio) {
  return SAFE_ZONES[aspectRatio] || DEFAULT_SAFE_ZONE;
}

function guessAspectRatio(width, height) {
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  return '16:9';
}

// Prosečna širina znaka kao frakcija font-size-a — aproksimacija dovoljno tačna za proporcionalne
// fontove (Inter i slični) za potrebe preview/upozorenja, dok klijent ne uradi piksel-tačno
// Canvas merenje stvarnog fonta (isti layout model, samo precizniji ulaz za maxCharsPerLine).
const AVG_CHAR_WIDTH_RATIO = 0.55;

function resolveFontSizePx(style, videoHeightPx) {
  const size = style.size || {};
  if (size.unit === 'px') return Math.max(1, Math.round(size.value));
  const percent = Math.min(size.max ?? 100, Math.max(size.min ?? 0, size.value));
  return Math.max(1, Math.round((percent / 100) * videoHeightPx));
}

function resolveMaxCharsPerLine(style, videoWidthPx, fontSizePx) {
  const maxWidthPercent = style.alignment?.maxLineWidthPercent ?? 80;
  const maxWidthPx = videoWidthPx * (maxWidthPercent / 100);
  const avgCharWidthPx = fontSizePx * AVG_CHAR_WIDTH_RATIO;
  return Math.max(1, Math.floor(maxWidthPx / avgCharWidthPx));
}

const ANCHORS = new Set([
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]);

function anchorToFraction(anchor) {
  const parts = anchor.split('-');
  const [vertical, horizontal] = parts.length === 2 ? parts : [anchor, 'center'];
  const xMap = { left: 0, center: 0.5, right: 1 };
  const yMap = { top: 0, center: 0.5, bottom: 1 };
  return { xFrac: xMap[horizontal] ?? 0.5, yFrac: yMap[vertical] ?? 0.5 };
}

// Vraća poziciju u pikselima za preset/smart anchor (unutar safe zone) ili manual drag (x/y
// kao 0-1 frakcija celog kadra, van safe zone dozvoljeno ali se prijavljuje upozorenjem).
function resolveAnchorPosition(placement, safeZone, video) {
  const { width, height } = video;
  const safeLeft = safeZone.left * width;
  const safeRight = width - safeZone.right * width;
  const safeTop = safeZone.top * height;
  const safeBottom = height - safeZone.bottom * height;

  if (placement.placementMode === 'manual') {
    const xPx = (placement.x ?? 0.5) * width;
    const yPx = (placement.y ?? 0.85) * height;
    const withinSafeZone = xPx >= safeLeft && xPx <= safeRight && yPx >= safeTop && yPx <= safeBottom;
    return { xPx, yPx, withinSafeZone };
  }

  const anchor = placement.anchor || 'bottom-center';
  if (!ANCHORS.has(anchor)) {
    throw new Error(`Nepoznat anchor: "${anchor}". Dozvoljeno: ${[...ANCHORS].join(', ')}.`);
  }
  const { xFrac, yFrac } = anchorToFraction(anchor);
  const xPx = safeLeft + xFrac * (safeRight - safeLeft);
  const yPx = safeTop + yFrac * (safeBottom - safeTop);
  return { xPx, yPx, withinSafeZone: true };
}

// Glavna funkcija — kombinuje prelom linija, tipografiju i poziciju u kompletan render spec.
// Isti oblik rezultata koriste i preview (Canvas/DOM) i FFmpeg/libass render pipeline (FAZA 9).
function layoutCue({ cue, style, video, lineBreakOptions = {} } = {}) {
  if (!cue) throw new Error('layoutCue zahteva cue.');
  if (!style) throw new Error('layoutCue zahteva style.');
  if (!video || !video.width || !video.height) throw new Error('layoutCue zahteva video { width, height }.');

  const aspectRatio = video.aspectRatio || guessAspectRatio(video.width, video.height);
  const safeZone = resolveSafeZone(aspectRatio);
  const fontSizePx = resolveFontSizePx(style, video.height);
  const maxCharsPerLine = lineBreakOptions.maxCharsPerLine || resolveMaxCharsPerLine(style, video.width, fontSizePx);
  const maxLines = lineBreakOptions.maxLines || style.alignment?.maxLines || 2;

  const durationMs = cue.endMs - cue.startMs;
  const { warnings, breakResult, readability } = buildLineBreakWarnings(cue.text, durationMs, { maxCharsPerLine, maxLines });

  const lineHeightPx = Math.round(fontSizePx * (style.spacing?.lineHeight ?? 1.2));
  const position = resolveAnchorPosition(cue.placement || {}, safeZone, video);

  if (!position.withinSafeZone) {
    warnings.push({ code: 'outside_safe_zone', message: 'Tekst je pozicioniran van bezbedne zone i može biti prekriven UI elementima platforme.' });
  }

  const lineBoxes = breakResult.lines.map((text, index) => ({
    text,
    widthPx: Math.round(text.length * fontSizePx * AVG_CHAR_WIDTH_RATIO),
    heightPx: lineHeightPx,
    offsetYPx: index * lineHeightPx // relativno u odnosu na vrh bloka teksta, oko position.yPx
  }));

  return {
    aspectRatio, safeZone, fontSizePx, maxCharsPerLine, maxLines, lineHeightPx,
    totalBlockHeightPx: breakResult.lines.length * lineHeightPx,
    position, lineBoxes, lines: breakResult.lines,
    overflow: breakResult.overflow, overflowWords: breakResult.overflowWords,
    readability, warnings
  };
}

module.exports = {
  layoutCue, resolveSafeZone, resolveFontSizePx, resolveMaxCharsPerLine, resolveAnchorPosition,
  anchorToFraction, guessAspectRatio, SAFE_ZONES, ANCHORS
};
