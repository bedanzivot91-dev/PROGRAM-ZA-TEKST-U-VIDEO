'use strict';

// Pretvara podatke koje već imamo (poravnat tekst iz lyrics-alignment.js, muzička analiza iz
// music-analysis.js) u listu kandidata za rez koje scene-planner.js koristi u DP optimizaciji
// (sekcija 13). Čista funkcija — testira se bez ijednog I/O poziva.

const STRONG_ONSET_THRESHOLD = 0.6;

function sectionCandidateType(section, isFinalChorus) {
  if (section.type === 'chorus') return isFinalChorus ? 'final_chorus_start' : 'chorus_start';
  if (section.type === 'bridge') return 'bridge_start';
  if (section.type === 'verse') return 'verse_start';
  return 'section_start'; // intro/outro/pre-chorus/nepoznato
}

function buildSceneCandidates({ lyrics, musicAnalysis } = {}) {
  const candidates = [];

  if (lyrics?.sections?.length && lyrics?.lines?.length) {
    const linesBySection = new Map();
    for (const line of lyrics.lines) {
      if (!Number.isFinite(line.startMs)) continue; // linija bez poravnanja (needsReview) se preskače
      if (!linesBySection.has(line.sectionId)) linesBySection.set(line.sectionId, []);
      linesBySection.get(line.sectionId).push(line);
    }

    const chorusSections = lyrics.sections.filter(s => s.type === 'chorus');
    const lastChorusId = chorusSections.length ? chorusSections[chorusSections.length - 1].id : null;

    for (const section of lyrics.sections) {
      const sectionLines = (linesBySection.get(section.id) || []).sort((a, b) => a.startMs - b.startMs);
      if (!sectionLines.length) continue;

      const isFinalChorus = section.id === lastChorusId && chorusSections.length > 1;
      candidates.push({ timeMs: sectionLines[0].startMs, type: sectionCandidateType(section, isFinalChorus), sourceSectionId: section.id });

      for (const line of sectionLines) {
        if (Number.isFinite(line.endMs)) candidates.push({ timeMs: line.endMs, type: 'important_line_end', sourceLineId: line.lineId });
      }
    }
  }

  if (musicAnalysis?.ok) {
    for (const timeMs of musicAnalysis.downbeatTimesMs || []) {
      candidates.push({ timeMs, type: 'downbeat' });
    }
    for (const onset of musicAnalysis.onsets || []) {
      if ((onset.strength ?? 0) >= STRONG_ONSET_THRESHOLD) candidates.push({ timeMs: onset.timeMs, type: 'strong_onset' });
    }
  }

  return candidates;
}

module.exports = { buildSceneCandidates, sectionCandidateType, STRONG_ONSET_THRESHOLD };
