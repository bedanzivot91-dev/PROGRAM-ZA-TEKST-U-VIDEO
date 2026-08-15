'use strict';

// ScenePlanner (sekcija 13): bira rezove scena preko dinamičkog programiranja — NE preko
// pravila "svaka slika traje 5 sekundi". Tretira izbor kao optimizaciju: maksimizuje ukupan
// "kvalitet" izabranih rezova (refren/bridge/sekcija imaju prioritet nad običnim beat-om) uz
// kaznu kada trajanje scene odstupa od preferiranog ili izlazi iz dozvoljenog opsega.

const CUT_TYPE_SCORES = {
  chorus_start: 100,
  bridge_start: 100,
  final_chorus_start: 100,
  section_start: 70,
  important_line_end: 65,
  verse_start: 35,
  downbeat: 40,
  strong_onset: 30,
  regular_beat: 10
};

const EDITING_INTENSITY_MULTIPLIER = { calm: 1.3, balanced: 1.0, dynamic: 0.75 };

const OUT_OF_BOUNDS_PENALTY_PER_MS = 50; // teška kazna po ms van [min,max] — obeshrabruje, ne zabranjuje

function scoreForCutType(type) {
  return CUT_TYPE_SCORES[type] ?? 5; // nepoznat tip dobija nizak, ali ne nulti prioritet
}

// Kazna za trajanje scene: van [min,max] je jako kažnjeno (ali NIJE beskonačno — spec eksplicitno
// kaže "ovo su smernice, ne slepa pravila", zato uvek postoji izvodljivo, ako i suboptimalno, rešenje).
function durationPenalty(durationMs, settings) {
  const { minimumSceneDuration, maximumSceneDuration, preferredAverageSceneDuration } = settings;
  let penalty = 0;
  if (durationMs < minimumSceneDuration) penalty += (minimumSceneDuration - durationMs) * OUT_OF_BOUNDS_PENALTY_PER_MS / 1000;
  if (durationMs > maximumSceneDuration) penalty += (durationMs - maximumSceneDuration) * OUT_OF_BOUNDS_PENALTY_PER_MS / 1000;
  const deviation = Math.abs(durationMs - preferredAverageSceneDuration);
  penalty += (deviation / preferredAverageSceneDuration) * 20;
  return penalty;
}

// Grupiše kandidate koji su vremenski veoma blizu (npr. downbeat i section_start u istom trenutku)
// i zadržava samo najjači iz svakog klastera — sprečava da DP bira dva "reza" par milisekundi razdvojena.
function dedupeCandidates(candidates, clusterWindowMs = 250) {
  const sorted = [...candidates].sort((a, b) => a.timeMs - b.timeMs);
  const result = [];
  for (const candidate of sorted) {
    const last = result[result.length - 1];
    if (last && candidate.timeMs - last.timeMs <= clusterWindowMs) {
      if (scoreForCutType(candidate.type) > scoreForCutType(last.type)) result[result.length - 1] = candidate;
    } else {
      result.push(candidate);
    }
  }
  return result;
}

function planScenes(totalDurationMs, rawCandidates, settings = {}) {
  const resolvedSettings = {
    preferredAverageSceneDuration: settings.preferredAverageSceneDuration ?? 4800,
    minimumSceneDuration: settings.minimumSceneDuration ?? 1200,
    maximumSceneDuration: settings.maximumSceneDuration ?? 8000,
    preferredSceneCount: settings.preferredSceneCount ?? null,
    editingIntensity: settings.editingIntensity ?? 'balanced'
  };
  const intensityMultiplier = EDITING_INTENSITY_MULTIPLIER[resolvedSettings.editingIntensity] ?? 1.0;
  const effectiveSettings = { ...resolvedSettings, preferredAverageSceneDuration: resolvedSettings.preferredAverageSceneDuration * intensityMultiplier };

  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
    throw new Error('totalDurationMs mora biti pozitivan broj (stvarno trajanje audio-fajla).');
  }

  const withBoundaries = [
    { timeMs: 0, type: 'song_start' },
    ...rawCandidates.filter(c => c.timeMs > 0 && c.timeMs < totalDurationMs),
    { timeMs: totalDurationMs, type: 'song_end' }
  ];
  const candidates = dedupeCandidates(withBoundaries);
  const n = candidates.length;

  if (n < 2) {
    return { scenes: [{ sceneId: 'scene-001', number: 1, startMs: 0, endMs: totalDurationMs, durationMs: totalDurationMs, cutReason: 'no_candidates_full_song' }], settings: effectiveSettings };
  }

  const dp = new Array(n).fill(-Infinity);
  const backPointer = new Array(n).fill(-1);
  dp[0] = 0;

  for (let i = 1; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (dp[j] === -Infinity) continue;
      const durationMs = candidates[i].timeMs - candidates[j].timeMs;
      if (durationMs <= 0) continue;
      const score = scoreForCutType(candidates[i].type) - durationPenalty(durationMs, effectiveSettings);
      const candidateScore = dp[j] + score;
      if (candidateScore > dp[i]) { dp[i] = candidateScore; backPointer[i] = j; }
    }
  }

  const path = [];
  let cursor = n - 1;
  while (cursor !== -1) { path.unshift(cursor); cursor = backPointer[cursor]; }

  const scenes = [];
  for (let k = 1; k < path.length; k += 1) {
    const startCandidate = candidates[path[k - 1]];
    const endCandidate = candidates[path[k]];
    const durationMs = endCandidate.timeMs - startCandidate.timeMs;
    scenes.push({
      sceneId: `scene-${String(k).padStart(3, '0')}`,
      number: k,
      startMs: startCandidate.timeMs,
      endMs: endCandidate.timeMs,
      durationMs,
      cutReason: endCandidate.type
    });
  }

  return { scenes, settings: effectiveSettings, totalScore: dp[n - 1] };
}

module.exports = { planScenes, scoreForCutType, durationPenalty, dedupeCandidates, CUT_TYPE_SCORES };
