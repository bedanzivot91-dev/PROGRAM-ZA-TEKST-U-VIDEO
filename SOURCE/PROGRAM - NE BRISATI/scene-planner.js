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
  const { minimumSceneDuration, maximumSceneDuration, preferredAverageSceneDuration } = settings || {};
  if (![durationMs, minimumSceneDuration, maximumSceneDuration, preferredAverageSceneDuration].every(Number.isFinite) || preferredAverageSceneDuration <= 0) {
    throw new Error('ScenePlanner duration podešavanja moraju biti konačni brojevi, a preferredAverageSceneDuration mora biti > 0.');
  }
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
  if (!Array.isArray(candidates)) throw new TypeError('candidates mora biti niz.');
  if (!Number.isFinite(clusterWindowMs) || clusterWindowMs < 0) throw new Error('clusterWindowMs mora biti konačan broj >= 0.');
  const sorted = [...candidates].sort((a, b) => a.timeMs - b.timeMs);
  const result = [];
  for (const candidate of sorted) {
    if (!candidate || !Number.isFinite(candidate.timeMs)) throw new Error('Svaki kandidat mora imati konačan timeMs.');
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
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
    throw new Error('totalDurationMs mora biti pozitivan broj (stvarno trajanje audio-fajla).');
  }
  if (!Array.isArray(rawCandidates)) throw new TypeError('rawCandidates mora biti niz.');

  const resolvedSettings = {
    preferredAverageSceneDuration: settings.preferredAverageSceneDuration ?? 4800,
    minimumSceneDuration: settings.minimumSceneDuration ?? 1200,
    maximumSceneDuration: settings.maximumSceneDuration ?? 8000,
    preferredSceneCount: settings.preferredSceneCount ?? null,
    editingIntensity: settings.editingIntensity ?? 'balanced'
  };
  for (const key of ['preferredAverageSceneDuration', 'minimumSceneDuration', 'maximumSceneDuration']) {
    if (!Number.isFinite(resolvedSettings[key]) || resolvedSettings[key] <= 0) throw new Error(`${key} mora biti konačan broj > 0.`);
  }
  if (resolvedSettings.minimumSceneDuration > resolvedSettings.maximumSceneDuration) {
    throw new Error('minimumSceneDuration ne sme biti veći od maximumSceneDuration.');
  }
  if (resolvedSettings.preferredSceneCount !== null && (!Number.isInteger(resolvedSettings.preferredSceneCount) || resolvedSettings.preferredSceneCount <= 0)) {
    throw new Error('preferredSceneCount mora biti pozitivan ceo broj ili null.');
  }
  if (!Object.prototype.hasOwnProperty.call(EDITING_INTENSITY_MULTIPLIER, resolvedSettings.editingIntensity)) {
    throw new Error(`Nepoznat editingIntensity: "${resolvedSettings.editingIntensity}".`);
  }

  const intensityMultiplier = EDITING_INTENSITY_MULTIPLIER[resolvedSettings.editingIntensity];
  const effectiveSettings = { ...resolvedSettings, preferredAverageSceneDuration: resolvedSettings.preferredAverageSceneDuration * intensityMultiplier };

  // GRANICE 0 i totalDurationMs su obavezne i NE SMEJU učestvovati u dedupe klasteru. Stari kod
  // je ubacivao granice u isti klaster sa beat kandidatima, pa je jak beat na npr. 100ms mogao
  // da zameni song_start, a beat 100ms pre kraja song_end — rezultat više nije pokrivao celu pesmu.
  const interiorRaw = rawCandidates.filter((candidate, index) => {
    if (!candidate || !Number.isFinite(candidate.timeMs)) throw new Error(`Kandidat ${index} nema konačan timeMs.`);
    return candidate.timeMs > 0 && candidate.timeMs < totalDurationMs;
  });
  const interiorCandidates = dedupeCandidates(interiorRaw);
  if (!interiorCandidates.length) {
    return {
      scenes: [{ sceneId: 'scene-001', number: 1, startMs: 0, endMs: totalDurationMs, durationMs: totalDurationMs, cutReason: 'no_candidates_full_song' }],
      settings: effectiveSettings,
      totalScore: -durationPenalty(totalDurationMs, effectiveSettings)
    };
  }

  const candidates = [
    { timeMs: 0, type: 'song_start' },
    ...interiorCandidates,
    { timeMs: totalDurationMs, type: 'song_end' }
  ];
  const n = candidates.length;
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
  if (path[0] !== 0 || path[path.length - 1] !== n - 1) {
    throw new Error('ScenePlanner nije uspeo da napravi putanju od početka do kraja pesme.');
  }

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
