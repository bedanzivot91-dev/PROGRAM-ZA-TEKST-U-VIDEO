'use strict';

// LyricsAlignmentEngine (sekcija 10): poravnava kanonski tekst pesme (iz lyrics-parser.js)
// sa ASR rečima koje imaju vremenske oznake (iz faster-whisper-a). Koristi dinamičko
// programiranje (Longest Common Subsequence sa fuzzy poklapanjem) da poštuje VREMENSKI
// redosled — svaka instanca ponovljenog refrena se poravnava sa svojim STVARNIM pojavljivanjem
// u audio-fajlu, ne samo sa prvim. Nikad ne prikazuje izmišljenu preciznost: linije bez
// pouzdanog poklapanja dobijaju needsReview=true i interpoliranu (ne izmišljenu) granicu.

const { normalizeForComparison } = require('./lyrics-parser');

function tokenizeWords(text) {
  const normalized = normalizeForComparison(text);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const prev = new Array(bl + 1);
  const curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j += 1) prev[j] = j;
  for (let i = 1; i <= al; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j += 1) prev[j] = curr[j];
  }
  return prev[bl];
}

function wordsMatch(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return distance <= 1 && distance / maxLen <= 0.34;
}

function alignSequences(canonicalWords, asrWords) {
  const n = canonicalWords.length;
  const m = asrWords.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (wordsMatch(canonicalWords[i - 1].word, asrWords[j - 1].word)) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const matches = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    // Standardni LCS backtracking mora prihvatiti validan dijagonalni match i kada postoji
    // jednako duga alternativa levo/gore. Stari dodatni "nije jednako susedu" uslov je u
    // ponovljenim rečima mogao da odbaci stvaran match samo zato što postoji tie u DP tabeli.
    if (wordsMatch(canonicalWords[i - 1].word, asrWords[j - 1].word) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      matches.push({ canonicalIndex: i - 1, asrIndex: j - 1 });
      i -= 1; j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  matches.reverse();
  return matches;
}

function normalizeAsrToken(word) {
  const text = normalizeForComparison(word?.word || word?.text || '');
  if (!text) return null;
  const startSeconds = Number(word?.start);
  const endSeconds = Number(word?.end);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) return null;
  return {
    word: text,
    startMs: Math.round(startSeconds * 1000),
    endMs: Math.round(endSeconds * 1000),
    probability: Number.isFinite(word?.probability) ? word.probability : null
  };
}

// Popunjava CELE uzastopne grupe nepoklopljenih linija. Stari algoritam je išao liniju po
// liniju: prva nepoklopljena linija je uzela ceo raspoloživ interval, pa je sledeća dobijala
// startMs===endMs. Kada ASR nije našao ništa, prva linija je dobijala celu pesmu, a sve ostale
// nulto trajanje. Ovde se stvarni raspoloživi interval ravnomerno deli unutar grupe.
function interpolateUnmatchedGroups(lineResults, totalDurationMs = null) {
  let index = 0;
  while (index < lineResults.length) {
    if (lineResults[index].startMs !== null) { index += 1; continue; }
    const groupStart = index;
    while (index < lineResults.length && lineResults[index].startMs === null) index += 1;
    const groupEnd = index; // exclusive
    const count = groupEnd - groupStart;

    let prevEnd = 0;
    for (let k = groupStart - 1; k >= 0; k -= 1) {
      if (Number.isFinite(lineResults[k]?.endMs)) { prevEnd = lineResults[k].endMs; break; }
    }

    let nextStart = null;
    for (let k = groupEnd; k < lineResults.length; k += 1) {
      if (Number.isFinite(lineResults[k]?.startMs)) { nextStart = lineResults[k].startMs; break; }
    }
    if (!Number.isFinite(nextStart)) {
      nextStart = Number.isFinite(totalDurationMs) ? totalDurationMs : prevEnd + count * 2000;
    }
    nextStart = Math.max(prevEnd, nextStart);
    const span = nextStart - prevEnd;

    for (let offset = 0; offset < count; offset += 1) {
      const result = lineResults[groupStart + offset];
      result.startMs = Math.round(prevEnd + (span * offset) / count);
      result.endMs = Math.round(prevEnd + (span * (offset + 1)) / count);
    }
  }
  return lineResults;
}

// lines: [{ lineId, sectionId, text }] iz lyrics-parser.js, u originalnom redosledu.
// asrWords: [{ word, start, end, probability }] u SEKUNDAMA (format faster-whisper-helper.py).
function alignLyrics(lines, asrWords, { totalDurationMs = null } = {}) {
  if (!Array.isArray(lines)) throw new TypeError('lines mora biti niz.');
  if (asrWords !== undefined && asrWords !== null && !Array.isArray(asrWords)) throw new TypeError('asrWords mora biti niz.');
  const canonicalWords = [];
  lines.forEach((line, lineIndex) => {
    tokenizeWords(line?.text || '').forEach(word => canonicalWords.push({ word, lineIndex, lineId: line?.lineId }));
  });
  const asrTokens = (asrWords || []).map(normalizeAsrToken).filter(Boolean);

  const matches = canonicalWords.length && asrTokens.length ? alignSequences(canonicalWords, asrTokens) : [];
  const wordsPerLine = new Map();
  canonicalWords.forEach(w => wordsPerLine.set(w.lineIndex, (wordsPerLine.get(w.lineIndex) || 0) + 1));

  const matchedByLine = new Map();
  for (const match of matches) {
    const canonical = canonicalWords[match.canonicalIndex];
    const asr = asrTokens[match.asrIndex];
    if (!matchedByLine.has(canonical.lineIndex)) matchedByLine.set(canonical.lineIndex, []);
    matchedByLine.get(canonical.lineIndex).push(asr);
  }

  const lineResults = lines.map((line, lineIndex) => {
    const matched = matchedByLine.get(lineIndex);
    const totalWords = wordsPerLine.get(lineIndex) || 0;
    if (matched && matched.length) {
      const sortedWords = [...matched].sort((a, b) => a.startMs - b.startMs);
      const startMs = Math.min(...matched.map(m => m.startMs));
      const endMs = Math.max(...matched.map(m => m.endMs));
      const matchedWordsRatio = totalWords ? matched.length / totalWords : 0;
      return {
        lineId: line?.lineId,
        text: line?.text || '',
        startMs,
        endMs,
        alignmentConfidence: Number(Math.min(1, 0.5 + 0.5 * matchedWordsRatio).toFixed(3)),
        matchedWordsRatio: Number(matchedWordsRatio.toFixed(3)),
        source: 'asr_words',
        needsReview: matchedWordsRatio < 0.6,
        words: sortedWords.map(w => ({ text: w.word, startMs: w.startMs, endMs: w.endMs, confidence: w.probability ?? null }))
      };
    }
    return { lineId: line?.lineId, text: line?.text || '', startMs: null, endMs: null, alignmentConfidence: 0, matchedWordsRatio: 0, source: 'segment_estimate', needsReview: true, words: [] };
  });

  interpolateUnmatchedGroups(lineResults, totalDurationMs);

  const overallConfidence = lineResults.length
    ? Number((lineResults.reduce((sum, r) => sum + r.alignmentConfidence, 0) / lineResults.length).toFixed(3))
    : 0;

  return { lines: lineResults, overallConfidence, matchedLineCount: lineResults.filter(r => r.source === 'asr_words').length, totalLineCount: lineResults.length };
}

module.exports = { alignLyrics, alignSequences, tokenizeWords, levenshtein, wordsMatch, normalizeAsrToken, interpolateUnmatchedGroups };
