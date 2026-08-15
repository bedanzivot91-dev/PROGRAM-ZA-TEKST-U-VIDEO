'use strict';

// Parsira tekst pesme sa opcionim section tagovima ([Verse], [Chorus] itd.).
// Čuva originalan tekst nepromenjen — normalizacija se koristi SAMO interno za poređenje
// (npr. da prepozna da je ponovljeni refren isti tekst uprkos malim razlikama u zapisu).

const KNOWN_SECTION_TYPES = new Set(['intro', 'verse', 'pre-chorus', 'prechorus', 'chorus', 'bridge', 'outro']);

const SECTION_TYPE_ALIASES = {
  prechorus: 'pre-chorus',
  'pre chorus': 'pre-chorus'
};

// Ravni i Unicode apostrofi (' ʼ ` ´) se tretiraju kao isti karakter interno.
const APOSTROPHE_PATTERN = /[‘’ʼ`´]/g;

function normalizeApostrophes(text) {
  return String(text || '').replace(APOSTROPHE_PATTERN, "'");
}

// Interna normalizacija za poređenje: mala slova, jedan razmak, bez interpunkcije osim apostrofa,
// i "al'" svedeno na "ali" da se prepozna kao ista reč u poređenju ponovljenih delova.
function normalizeForComparison(text) {
  return normalizeApostrophes(text)
    .toLowerCase()
    .replace(/\bal'/g, 'ali')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTagLine(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^\[([^\]]+)\]$/);
  if (!match) return null;
  const inner = match[1].trim();
  const normalizedType = inner.toLowerCase().replace(/\s+/g, '-');
  const resolvedType = SECTION_TYPE_ALIASES[normalizedType] || SECTION_TYPE_ALIASES[inner.toLowerCase()] || normalizedType;
  return { raw: inner, type: resolvedType, isStructural: KNOWN_SECTION_TYPES.has(resolvedType) };
}

// Dodatni tagovi u istoj liniji kao section tag, npr. "[Chorus][Pop][Powerful][Male]",
// se razdvajaju na strukturni tag (prvi) i genre/emotivne tagove (ostatak).
function splitMultiTagLine(line) {
  const trimmed = line.trim();
  const tags = [...trimmed.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
  if (!tags.length || tags.join('') !== trimmed.replace(/[[\]]/g, '')) return null;
  if (trimmed.replace(/\[[^\]]+\]/g, '').trim()) return null; // ima teksta van zagrada, nije tag linija
  return tags;
}

function parseLyrics(rawText) {
  const original = String(rawText || '');
  const lines = original.split(/\r\n|\r|\n/);

  const sections = [];
  const allLines = [];
  let currentSection = null;
  let sectionCounter = {};
  let globalLineIndex = 0;

  function openSection(type, rawLabel, extraTags) {
    const count = (sectionCounter[type] = (sectionCounter[type] || 0) + 1);
    const id = count > 1 ? `${type}-${count}` : type;
    currentSection = {
      id,
      type,
      rawLabel,
      tags: extraTags || [],
      instanceNumber: count,
      lineIds: []
    };
    sections.push(currentSection);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { globalLineIndex += 1; continue; }

    const multiTags = splitMultiTagLine(trimmed);
    if (multiTags && multiTags.length) {
      const first = parseTagLine(`[${multiTags[0]}]`);
      if (first && first.isStructural) {
        openSection(first.type, first.raw, multiTags.slice(1));
        globalLineIndex += 1;
        continue;
      }
      // sve su ne-strukturni tagovi (npr. samo [Pop][Powerful]) — dodaju se na trenutnu sekciju
      if (currentSection) currentSection.tags.push(...multiTags);
      globalLineIndex += 1;
      continue;
    }

    const tag = parseTagLine(trimmed);
    if (tag) {
      if (tag.isStructural) {
        openSection(tag.type, tag.raw, []);
      } else if (currentSection) {
        currentSection.tags.push(tag.raw);
      }
      globalLineIndex += 1;
      continue;
    }

    if (!currentSection) openSection('verse', 'Verse', []);

    const lineId = `${currentSection.id}-line-${currentSection.lineIds.length + 1}`;
    const lineRecord = {
      lineId,
      sectionId: currentSection.id,
      text: line.trim(),
      normalized: normalizeForComparison(line),
      order: globalLineIndex
    };
    currentSection.lineIds.push(lineId);
    allLines.push(lineRecord);
    globalLineIndex += 1;
  }

  // Prepoznaje ponovljene refrene (i druge ponovljene sekcije) po normalizovanom sadržaju,
  // ali svaka instanca ostaje poseban objekat sa svojim id-jem (chorus-1, chorus-2, ...).
  const sectionSignatures = new Map();
  for (const section of sections) {
    const text = section.lineIds
      .map(id => allLines.find(l => l.lineId === id)?.normalized || '')
      .join('|');
    section.contentSignature = text;
    if (!sectionSignatures.has(text) || !text) sectionSignatures.set(text, []);
    if (text) sectionSignatures.get(text).push(section.id);
  }
  for (const section of sections) {
    const siblings = section.contentSignature ? sectionSignatures.get(section.contentSignature) : [];
    section.repeatsOf = siblings && siblings.length > 1 && siblings[0] !== section.id ? siblings[0] : null;
    section.isRepeated = Boolean(section.repeatsOf);
  }

  return {
    lyricsSource: 'user',
    detectedLanguage: 'sr',
    overallConfidence: 1,
    needsReview: false,
    rawTranscription: '',
    formattedLyrics: original.trim(),
    sections: sections.map(s => ({
      id: s.id,
      type: s.type,
      rawLabel: s.rawLabel,
      tags: s.tags,
      instanceNumber: s.instanceNumber,
      isRepeated: s.isRepeated,
      repeatsOf: s.repeatsOf,
      lineIds: s.lineIds
    })),
    lines: allLines.map(l => ({ lineId: l.lineId, sectionId: l.sectionId, text: l.text }))
  };
}

module.exports = { parseLyrics, normalizeForComparison, normalizeApostrophes };
