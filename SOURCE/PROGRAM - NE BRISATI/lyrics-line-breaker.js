'use strict';

// LyricsLineBreaker (sekcija 13 dodatka). Automatski prelom NIKAD ne deli reč na pola niti
// apostrofsku konstrukciju — pošto se prelama isključivo na razmacima između celih reči
// (whitespace split), ovo je tačno po konstrukciji, ne po dodatnoj proveri.
// Precizno piksel-tačno prelamanje zahteva stvarne font metrike (Canvas u browseru) — server-
// strana verzija ovde koristi broj-karaktera aproksimaciju, dovoljnu za upozorenja i preview
// pre nego što klijent uradi finalni, piksel-tačan prelom (sekcija 17: "Preview i finalni
// render moraju koristiti isti layout model" — ovaj modul je zajednička polazna tačka).

const MAX_READING_CHARS_PER_SECOND = 15; // standardna gornja granica brzine čitanja titlova
const MIN_DISPLAY_DURATION_MS = 1200;

function tokenizeIntoWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

// Greedy word-wrap — nikad ne deli reč, uvek prelama na razmaku između reči.
function breakIntoLines(text, { maxCharsPerLine = 40, maxLines = 2 } = {}) {
  const words = tokenizeIntoWords(text);
  if (!words.length) return { lines: [], overflow: false, overflowWords: [] };

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return { lines, overflow: false, overflowWords: [] };

  // Ne seče tiho — vraća koje reči ne staju, pozivalac odlučuje (smanji font, produži cue, itd.)
  // umesto da automatski izgubi deo teksta bez upozorenja.
  const fitLines = lines.slice(0, maxLines);
  const overflowWords = tokenizeIntoWords(lines.slice(maxLines).join(' '));
  return { lines: fitLines, overflow: true, overflowWords };
}

// Procena čitljivosti (sekcija 13: "characters per second; words per minute; minimal display
// duration"). Ne produžava cue automatski — samo prijavljuje da li trenutno trajanje dovoljno.
function assessReadability(text, durationMs) {
  const cleanText = String(text || '');
  const charCount = cleanText.replace(/\s+/g, '').length;
  const wordCount = tokenizeIntoWords(cleanText).length;
  const durationSec = Math.max(0.001, durationMs / 1000);

  const charactersPerSecond = Number((charCount / durationSec).toFixed(2));
  const wordsPerMinute = Number((wordCount / (durationSec / 60)).toFixed(1));
  const minimalDisplayDurationMs = Math.max(MIN_DISPLAY_DURATION_MS, Math.round((charCount / MAX_READING_CHARS_PER_SECOND) * 1000));

  return {
    charCount, wordCount, charactersPerSecond, wordsPerMinute, minimalDisplayDurationMs,
    readableInTime: durationMs >= minimalDisplayDurationMs
  };
}

// Upozorenja iz sekcije 13: "previše teksta; premala veličina; preduga linija; tekst izlazi
// van safe zone; cue traje prekratko da bi se pročitao." Safe-zone provera je odgovornost
// pozivaoca (zavisi od stvarne pozicije/veličine u UI-ju) — ovaj modul pokriva tekst/timing deo.
function buildLineBreakWarnings(text, durationMs, { maxCharsPerLine = 40, maxLines = 2 } = {}) {
  const warnings = [];
  const breakResult = breakIntoLines(text, { maxCharsPerLine, maxLines });
  if (breakResult.overflow) {
    warnings.push({ code: 'too_much_text', message: `Previše teksta za ${maxLines} linije — ${breakResult.overflowWords.length} reči ne staje.` });
  }
  const readability = assessReadability(text, durationMs);
  if (!readability.readableInTime) {
    warnings.push({ code: 'cue_too_short', message: `Cue traje ${durationMs}ms, ali je potrebno bar ${readability.minimalDisplayDurationMs}ms da se pročita.` });
  }
  const longestLine = Math.max(0, ...breakResult.lines.map(l => l.length));
  if (longestLine > maxCharsPerLine) {
    warnings.push({ code: 'line_too_long', message: `Linija od ${longestLine} znakova prelazi ograničenje od ${maxCharsPerLine}.` });
  }
  return { warnings, breakResult, readability };
}

module.exports = { breakIntoLines, assessReadability, buildLineBreakWarnings, tokenizeIntoWords, MAX_READING_CHARS_PER_SECOND, MIN_DISPLAY_DURATION_MS };
