'use strict';

// KaraokeEngine + multi-track kombinovanje (sekcije 9-10 dodatka o tekstu na videu). Koristi
// words[] koji lyrics-alignment.js sada izlaže po liniji (word-level ASR timing) da odredi koja
// reč je trenutno aktivna u datom trenutku reprodukcije, radi bojenja u stilu karaoke.
//
// Kada word-level timing NIJE dostupan (npr. ručno unet tekst bez forced alignment-a), radi
// iskren fallback: ravnomerno raspoređuje trajanje cue-a na reči iz teksta i to jasno obeležava
// kao wordTimingSource:'estimated' (za razliku od 'aligned') — ne pretvara se da je precizno.

const { tokenizeIntoWords } = require('./lyrics-line-breaker');

function estimateWordTimings(cue) {
  const words = tokenizeIntoWords(cue.text);
  if (!words.length) return [];
  const totalMs = cue.endMs - cue.startMs;
  const perWordMs = totalMs / words.length;
  return words.map((text, index) => ({
    text,
    startMs: cue.startMs + index * perWordMs,
    endMs: cue.startMs + (index + 1) * perWordMs,
    confidence: null
  }));
}

// 'pending' (reč još nije "otpevana"), 'active' (trenutno se peva), 'completed' (već otpevana).
function getWordState(word, currentMs) {
  if (currentMs < word.startMs) return 'pending';
  if (currentMs >= word.endMs) return 'completed';
  return 'active';
}

function getWordProgress(word, currentMs) {
  const state = getWordState(word, currentMs);
  if (state === 'pending') return 0;
  if (state === 'completed') return 1;
  const span = word.endMs - word.startMs;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentMs - word.startMs) / span));
}

const DEFAULT_KARAOKE_STYLE = { inactiveColor: '#CCCCCC', activeColor: '#FFD447', completedColor: '#FFFFFF', preActiveColor: '#999999', activeGlowColor: '#FFD447' };

function colorForState(state, karaokeStyle) {
  const style = { ...DEFAULT_KARAOKE_STYLE, ...karaokeStyle };
  if (state === 'pending') return style.preActiveColor;
  if (state === 'completed') return style.completedColor;
  return style.activeColor;
}

// Vraća potpuni karaoke render-frame za JEDAN cue u datom trenutku: per-word stanje, progres
// (za "fill" efekat unutar reči) i boju. active:false kada je currentMs van trajanja cue-a.
function buildKaraokeFrame(cue, currentMs, karaokeStyle = {}) {
  if (currentMs < cue.startMs || currentMs >= cue.endMs) {
    return { active: false, words: [], wordTimingSource: null };
  }
  const hasAlignedWords = Array.isArray(cue.words) && cue.words.length > 0;
  const words = hasAlignedWords ? cue.words : estimateWordTimings(cue);
  const wordTimingSource = hasAlignedWords ? 'aligned' : 'estimated';

  return {
    active: true,
    wordTimingSource,
    words: words.map(word => {
      const state = getWordState(word, currentMs);
      return { text: word.text, state, progress: getWordProgress(word, currentMs), color: colorForState(state, karaokeStyle) };
    })
  };
}

// Multi-track kombinovanje (sekcija 10: original+prevod, naslov/izvođač, section markeri istovremeno
// prikazani, svaki na svom track-u). Vraća sve trenutno aktivne cue-ove preko svih omogućenih track-ova,
// poređane po zIndex (niži se crta prvi, viši preko njega).
function combineActiveTracksAtTime(tracks, currentMs) {
  const active = [];
  for (const track of tracks || []) {
    if (!track.enabled) continue;
    const cue = (track.cues || []).find(c => !c.deleted && c.enabled !== false && currentMs >= c.startMs && currentMs < c.endMs);
    if (cue) active.push({ trackId: track.trackId, type: track.type, zIndex: track.zIndex || 0, cue });
  }
  return active.sort((a, b) => a.zIndex - b.zIndex);
}

module.exports = { estimateWordTimings, getWordState, getWordProgress, buildKaraokeFrame, combineActiveTracksAtTime, DEFAULT_KARAOKE_STYLE };
