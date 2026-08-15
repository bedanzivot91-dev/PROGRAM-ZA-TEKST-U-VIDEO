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

// Levenshtein distance — koristi se samo za KRATKA odstupanja (npr. ASR "nocas" vs "noćas"
// posle normalizacije već iste, ali "znas" vs "zna" ostaje blisko) da poklapanje ne bude
// isključivo rigidno na tačnu jednakost stringova (pravilo "fuzzy matching, token similarity").
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
  if (a.length < 3 || b.length < 3) return false; // kratke reči se ne fuzzy-poklapaju (previše lažnih pogodaka)
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return distance <= 1 && distance / maxLen <= 0.34;
}

// Longest Common Subsequence preko dinamičkog programiranja — bira NAJDUŽI podniz kanonskih
// reči koji se u ISTOM redosledu pojavljuje u ASR nizu. Ovo je ključno za ponovljeni refren:
// druga instanca refrena u kanonskom tekstu se prirodno poravnava sa DRUGIM pojavljivanjem
// tih reči u ASR nizu, jer LCS poštuje redosled u oba niza.
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
  const matches = []; // { canonicalIndex, asrIndex }
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (wordsMatch(canonicalWords[i - 1].word, asrWords[j - 1].word) && dp[i][j] === dp[i - 1][j - 1] + 1 && dp[i][j] !== dp[i - 1][j] && dp[i][j] !== dp[i][j - 1]) {
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

// Za linije bez ijedne poklopljene reči, interpolira granicu iz susednih poravnatih linija
// umesto da izmisli tačno vreme — needsReview ostaje true da korisnik zna da proveri.
function interpolateBoundary(index, lineResults, totalDurationMs) {
  let prevEnd = 0;
  for (let k = index - 1; k >= 0; k -= 1) {
    if (lineResults[k] && lineResults[k].endMs !== null) { prevEnd = lineResults[k].endMs; break; }
  }
  let nextStart = totalDurationMs ?? prevEnd + 2000;
  for (let k = index + 1; k < lineResults.length; k += 1) {
    if (lineResults[k] && lineResults[k].startMs !== null) { nextStart = lineResults[k].startMs; break; }
  }
  if (nextStart < prevEnd) nextStart = prevEnd;
  return { startMs: prevEnd, endMs: nextStart };
}

// lines: [{ lineId, sectionId, text }] iz lyrics-parser.js, u originalnom redosledu.
// asrWords: [{ word, start, end, probability }] u SEKUNDAMA (format faster-whisper-helper.py).
function alignLyrics(lines, asrWords, { totalDurationMs = null } = {}) {
  const canonicalWords = [];
  lines.forEach((line, lineIndex) => {
    tokenizeWords(line.text).forEach(word => canonicalWords.push({ word, lineIndex, lineId: line.lineId }));
  });
  const asrTokens = (asrWords || [])
    .map(w => ({ word: normalizeForComparison(w.word || w.text || ''), startMs: Math.round((w.start || 0) * 1000), endMs: Math.round((w.end || 0) * 1000), probability: w.probability ?? null }))
    .filter(w => w.word);

  const matches = canonicalWords.length && asrTokens.length ? alignSequences(canonicalWords, asrTokens) : [];

  // matchedRangeByLine[lineIndex] = { firstAsrIdx, lastAsrIdx, matchedCount, totalWordsInLine }
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
        lineId: line.lineId,
        text: line.text,
        startMs,
        endMs,
        alignmentConfidence: Number(Math.min(1, 0.5 + 0.5 * matchedWordsRatio).toFixed(3)),
        matchedWordsRatio: Number(matchedWordsRatio.toFixed(3)),
        source: 'asr_words',
        needsReview: matchedWordsRatio < 0.6,
        // Reč-po-reč vremena (potrebno za karaoke mod, sekcija 12 dodatka o tekstu na videu) —
        // samo za reči koje su STVARNO poklopljene sa ASR-om, ne izmišljene za nepoklopljene.
        words: sortedWords.map(w => ({ text: w.word, startMs: w.startMs, endMs: w.endMs, confidence: w.probability ?? null }))
      };
    }
    return { lineId: line.lineId, text: line.text, startMs: null, endMs: null, alignmentConfidence: 0, matchedWordsRatio: 0, source: 'segment_estimate', needsReview: true, words: [] };
  });

  // Druga faza: linije bez poklapanja dobijaju interpoliranu granicu iz suseda.
  lineResults.forEach((result, index) => {
    if (result.startMs === null) {
      const bounds = interpolateBoundary(index, lineResults, totalDurationMs);
      result.startMs = bounds.startMs;
      result.endMs = bounds.endMs;
    }
  });

  const overallConfidence = lineResults.length
    ? Number((lineResults.reduce((sum, r) => sum + r.alignmentConfidence, 0) / lineResults.length).toFixed(3))
    : 0;

  return { lines: lineResults, overallConfidence, matchedLineCount: lineResults.filter(r => r.source === 'asr_words').length, totalLineCount: lineResults.length };
}

module.exports = { alignLyrics, alignSequences, tokenizeWords, levenshtein, wordsMatch };
