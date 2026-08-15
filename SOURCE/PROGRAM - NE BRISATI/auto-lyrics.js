'use strict';

// Sekcija 9.2: kada korisnik NEMA tekst pesme, program sam mora da izdvoji vokal, transkribuje,
// napiše i prikaže čitljiv tekst, označi pouzdanost i omogući ručnu ispravku. Ovaj modul NIKAD
// ne sme tvrditi 100% tačnost — needsReview ostaje true sve dok korisnik ne potvrdi/izmeni tekst.

const { parseLyrics, normalizeForComparison } = require('./lyrics-parser');
const stemSeparation = require('./stem-separation');
const transcriptionProvider = require('./transcription-provider');

// Pauza između ASR segmenata duža od ovoga se tretira kao granica dela pesme
// (vokalna pauza — sekcija 9: "gde su vokalne pauze").
const SECTION_GAP_SECONDS = 1.6;

// Čisto funkcionalna logika (bez I/O) — formatira ASR segmente u čitljiv tekst sa section
// tagovima. Testira se direktno sa sintetičkim segmentima, bez pokretanja pravog ASR-a.
function buildLyricsFromSegments(segments, { detectedLanguage = 'sr', baseConfidence = 0.6 } = {}) {
  const sorted = [...(segments || [])]
    .map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
    .filter(s => s.text)
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) {
    return {
      rawTranscription: '',
      formattedLyrics: '',
      sections: [],
      lines: [],
      overallConfidence: 0,
      needsReview: true
    };
  }

  // Grupiše segmente u "blokove" na mestima gde je pauza duža od praga — svaki blok postaje
  // kandidat za jednu sekciju (Verse/Chorus).
  const blocks = [];
  let currentBlock = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap > SECTION_GAP_SECONDS) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
    currentBlock.push(sorted[i]);
  }
  if (currentBlock.length) blocks.push(currentBlock);

  // Prepoznaje ponovljene blokove (verovatni refren) preko normalizovanog sadržaja —
  // ne mora biti savršeno identično, samo dovoljno slično da se smatra istim refrenom.
  const blockSignatures = blocks.map(block => block.map(s => normalizeForComparison(s.text)).join(' '));
  const firstSeenIndex = new Map();
  const isRepeatOfEarlier = blockSignatures.map((sig, index) => {
    if (!sig) return false;
    if (firstSeenIndex.has(sig)) return true;
    firstSeenIndex.set(sig, index);
    return false;
  });

  const taggedLines = [];
  blocks.forEach((block, index) => {
    const label = isRepeatOfEarlier[index] ? '[Chorus]' : '[Verse]';
    taggedLines.push(label);
    for (const segment of block) taggedLines.push(segment.text);
  });
  const formattedLyrics = taggedLines.join('\n');

  const parsed = parseLyrics(formattedLyrics);
  const rawTranscription = sorted.map(s => s.text).join(' ');

  return {
    rawTranscription,
    formattedLyrics,
    sections: parsed.sections,
    lines: parsed.lines.map((line, index) => ({ ...line, startMs: Math.round(sorted[index]?.start * 1000 || 0), endMs: Math.round(sorted[index]?.end * 1000 || 0) })),
    detectedLanguage,
    overallConfidence: baseConfidence,
    needsReview: true // automatski izvučen tekst UVEK traži potvrdu korisnika (pravilo 9.2)
  };
}

// I/O orkestracija: izdvaja vokal (kada je moguće), transkribuje vokal I originalni miks
// (kontrolna verzija), bira pouzdaniji izvor. Ako sve padne, vraća ok:false umesto da izmisli tekst.
async function autoWriteLyrics(audioFilePath, audioHash, options = {}) {
  const stemResult = await stemSeparation.separateStems(audioFilePath, audioHash).catch(() => null);
  const vocalsPath = stemResult && !stemResult.usedOriginalMix ? stemResult.stems?.vocals : null;

  const mixTranscription = await transcriptionProvider.transcribeAudio(audioFilePath, audioHash, options);
  const vocalsTranscription = vocalsPath
    ? await transcriptionProvider.transcribeAudio(vocalsPath, `${audioHash}-vocals`, options)
    : null;

  const usedVocalStem = Boolean(vocalsTranscription?.ok && vocalsTranscription.segments?.length);
  const chosen = usedVocalStem ? vocalsTranscription : mixTranscription;

  if (!chosen?.ok) {
    return { ok: false, reason: chosen?.reason || 'transcription_unavailable' };
  }

  // Vokalni stem daje pouzdaniji tekst (manje instrumentalnog šuma) — viši bazni confidence.
  const baseConfidence = usedVocalStem ? 0.75 : 0.55;
  const built = buildLyricsFromSegments(chosen.segments, { detectedLanguage: chosen.language, baseConfidence });

  return {
    ok: true,
    lyricsSource: 'auto_transcribed',
    usedVocalStem,
    transcriptionModel: chosen.model,
    ...built
  };
}

module.exports = { buildLyricsFromSegments, autoWriteLyrics, SECTION_GAP_SECONDS };
