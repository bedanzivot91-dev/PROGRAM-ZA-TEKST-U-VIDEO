'use strict';

// Podaci za "Tekst na videu / Lyrics Overlay Studio" modul. Tekst je NEZAVISAN, naknadno
// izmenjiv sloj — nikad se ne ugrađuje u image promptove (pravilo 1 dodatka). Ova datoteka
// definiše i validira TextTrack/Cue/Style modele; render i UI koriste isključivo ove oblike.

const crypto = require('crypto');

const TRACK_TYPES = new Set(['lyrics', 'translation', 'title', 'artist', 'section', 'custom', 'credits']);
const TIMING_SOURCES = new Set(['forced_alignment', 'asr_words', 'manual', 'estimated']);
const PLACEMENT_MODES = new Set(['manual', 'smart', 'preset']);

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

// track: sekcija 15. cues se dodaju posle kreiranja preko addCueToTrack().
function createTextTrack({ type, name = '', language = 'sr', defaultStyleId = '', zIndex = 0 } = {}) {
  if (!TRACK_TYPES.has(type)) {
    throw new Error(`Nepoznat tip track-a: "${type}". Dozvoljeno: ${[...TRACK_TYPES].join(', ')}.`);
  }
  return {
    trackId: newId('track'),
    type,
    name: name || type,
    language,
    enabled: true,
    locked: false,
    zIndex,
    defaultStyleId,
    cues: []
  };
}

// cue: sekcija 4. Vremenska pravila se NE proveravaju ovde (to radi validateCue/validateTrack) —
// createCue samo gradi ispravno oblikovan objekat.
function createCue({ trackId, sectionId = '', lineId = '', startMs, endMs, text, words = [], timingSource = 'manual', confidence = 1 } = {}) {
  if (!TIMING_SOURCES.has(timingSource)) {
    throw new Error(`Nepoznat timingSource: "${timingSource}". Dozvoljeno: ${[...TIMING_SOURCES].join(', ')}.`);
  }
  return {
    cueId: newId('cue'),
    trackId,
    sectionId,
    lineId,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    text: String(text || ''),
    words: words.map(w => ({ wordId: w.wordId || newId('word'), text: w.text, startMs: Math.round(w.startMs), endMs: Math.round(w.endMs), confidence: w.confidence ?? null })),
    timingSource,
    confidence,
    needsReview: confidence < 0.6,
    enabled: true,
    manualLocked: false,
    placement: { placementMode: 'preset', x: 0.5, y: 0.85, anchor: 'bottom-center', protectedZonesAvoided: [], placementConfidence: 0 },
    deleted: false,
    deletedAt: null,
    styleId: ''
  };
}

// Pravilo iz sekcije 4: "nijedan cue ne sme imati endMs <= startMs", "cue ne sme izlaziti van
// audio trajanja". Vraća listu problema (ne baca) da pozivalac odluči kako da reaguje.
function validateCue(cue, { totalDurationMs = null } = {}) {
  const problems = [];
  if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)) {
    problems.push(`Cue "${cue.cueId}" nema validne startMs/endMs.`);
    return { valid: false, problems };
  }
  if (cue.endMs <= cue.startMs) problems.push(`Cue "${cue.cueId}": endMs (${cue.endMs}) mora biti veći od startMs (${cue.startMs}).`);
  if (cue.startMs < 0) problems.push(`Cue "${cue.cueId}": startMs ne sme biti negativan.`);
  if (Number.isFinite(totalDurationMs) && cue.endMs > totalDurationMs + 10) {
    problems.push(`Cue "${cue.cueId}": endMs (${cue.endMs}) izlazi van trajanja audio-fajla (${totalDurationMs}ms).`);
  }
  for (const word of cue.words || []) {
    if (word.endMs <= word.startMs) problems.push(`Cue "${cue.cueId}": reč "${word.text}" ima endMs <= startMs.`);
    if (word.startMs < cue.startMs - 10 || word.endMs > cue.endMs + 10) {
      problems.push(`Cue "${cue.cueId}": reč "${word.text}" (${word.startMs}-${word.endMs}) je van granica cue-a (${cue.startMs}-${cue.endMs}).`);
    }
  }
  return { valid: problems.length === 0, problems };
}

function validateTrack(track, options = {}) {
  const problems = [];
  const activeCues = track.cues.filter(c => !c.deleted).sort((a, b) => a.startMs - b.startMs);
  for (const cue of activeCues) {
    const result = validateCue(cue, options);
    problems.push(...result.problems);
  }
  return { valid: problems.length === 0, problems };
}

// style: sekcije 6-8. Puna forma sa razumnim, modernim/čitljivim podrazumevanim vrednostima
// (pravilo: "podrazumevani predlozi moraju biti moderni, čitljivi i urbani").
function createStyle(overrides = {}) {
  return {
    styleId: newId('style'),
    name: overrides.name || 'Custom Style',
    font: { family: 'Inter', fallback: 'Arial', weight: 700, italic: false, underline: false, strikethrough: false, textCase: 'original' },
    size: { value: 6, unit: 'percent-height', min: 2, max: 15 },
    spacing: { letterSpacing: 0, wordSpacing: 0, lineHeight: 1.2, paragraphSpacing: 0 },
    alignment: { horizontal: 'center', vertical: 'bottom', maxLineWidthPercent: 80, maxLines: 2, wordWrap: true },
    color: { mode: 'solid', solid: '#FFFFFF', opacity: 1 },
    karaoke: { inactiveColor: '#CCCCCC', activeColor: '#FFD447', completedColor: '#FFFFFF', preActiveColor: '#999999', activeGlowColor: '#FFD447' },
    outline: { enabled: true, color: '#000000', thickness: 2, opacity: 0.9 },
    shadow: { enabled: true, color: '#000000', opacity: 0.6, offsetX: 0, offsetY: 2, blur: 4 },
    glow: { enabled: false, color: '#FFFFFF', intensity: 0, blur: 8, pulse: false },
    background: { mode: 'none', color: '#000000', opacity: 0.5, paddingX: 12, paddingY: 6, borderRadius: 6 },
    transform: { rotation: 0, skew: 0, scaleX: 1, scaleY: 1 },
    ...overrides
  };
}

module.exports = { createTextTrack, createCue, validateCue, validateTrack, createStyle, TRACK_TYPES, TIMING_SOURCES, PLACEMENT_MODES, newId };
