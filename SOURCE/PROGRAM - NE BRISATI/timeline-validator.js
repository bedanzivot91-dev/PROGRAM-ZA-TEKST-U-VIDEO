'use strict';

// Sekcija 14: STROGA vremenska validacija. Ovo je poslednja odbrana pre nego što se timeline
// prikaže korisniku ili pošalje dalje u pipeline — mora uhvatiti svaku prazninu, preklapanje
// ili netačan zbir, jer "nikad ne gradi timeline sabiranjem zaokruženih prikazanih vrednosti".

const ROUNDING_TOLERANCE_MS = 10; // pravilo 0.4: dozvoljeno odstupanje ISKLJUČIVO zbog zaokruživanja

function validateTimeline(scenes, actualAudioDurationMs) {
  const problems = [];

  if (!Array.isArray(scenes) || !scenes.length) {
    return { valid: false, problems: ['Timeline nema nijednu scenu.'] };
  }

  if (!Number.isFinite(actualAudioDurationMs) || actualAudioDurationMs <= 0) {
    problems.push(`Stvarno trajanje audio-fajla nije validno (${actualAudioDurationMs}).`);
  }

  // NaN/Infinity ne smeju doći do sortiranja: comparator sa NaN vraća NaN (efektivno 0),
  // a kasnije Math.abs(NaN) i poređenja sa NaN tiho propuštaju nevalidan timeline.
  const malformedIndexes = new Set();
  scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') {
      problems.push(`Scena ${index} nije validan objekat.`);
      malformedIndexes.add(index);
      return;
    }
    if (!Number.isFinite(scene.startMs) || !Number.isFinite(scene.endMs)) {
      problems.push(`Scena ${scene.sceneId || index} nema validne konačne startMs/endMs vrednosti.`);
      malformedIndexes.add(index);
    }
    if (scene.durationMs !== undefined && scene.durationMs !== null && !Number.isFinite(scene.durationMs)) {
      problems.push(`Scena ${scene.sceneId || index} ima nevalidan durationMs (${scene.durationMs}).`);
      malformedIndexes.add(index);
    }
  });
  if (malformedIndexes.size) return { valid: false, problems };

  const sorted = [...scenes].sort((a, b) => a.startMs - b.startMs);

  const first = sorted[0];
  if (Math.abs(first.startMs) > ROUNDING_TOLERANCE_MS) {
    problems.push(`Prva scena ne počinje na 0ms (startMs=${first.startMs}).`);
  }

  const last = sorted[sorted.length - 1];
  if (Number.isFinite(actualAudioDurationMs) && Math.abs(last.endMs - actualAudioDurationMs) > ROUNDING_TOLERANCE_MS) {
    problems.push(`Poslednja scena (endMs=${last.endMs}) se ne poklapa sa stvarnim trajanjem audio-fajla (${actualAudioDurationMs}ms).`);
  }

  const seenIds = new Set();
  for (let i = 0; i < sorted.length; i += 1) {
    const scene = sorted[i];

    if (scene.sceneId) {
      if (seenIds.has(scene.sceneId)) problems.push(`Dupliran sceneId: "${scene.sceneId}".`);
      seenIds.add(scene.sceneId);
    }

    const duration = scene.endMs - scene.startMs;
    if (duration <= 0) {
      problems.push(`Scena ${scene.sceneId || i} ima nepozitivno trajanje (${duration}ms).`);
    }
    if (Number.isFinite(scene.durationMs) && Math.abs(scene.durationMs - duration) > ROUNDING_TOLERANCE_MS) {
      problems.push(`Scena ${scene.sceneId || i}: durationMs (${scene.durationMs}) ne odgovara endMs-startMs (${duration}).`);
    }

    if (i > 0) {
      const previous = sorted[i - 1];
      const gap = scene.startMs - previous.endMs;
      if (gap > ROUNDING_TOLERANCE_MS) {
        problems.push(`Praznina od ${gap}ms između scene ${previous.sceneId || i - 1} (endMs=${previous.endMs}) i scene ${scene.sceneId || i} (startMs=${scene.startMs}).`);
      } else if (gap < -ROUNDING_TOLERANCE_MS) {
        problems.push(`Preklapanje od ${Math.abs(gap)}ms između scene ${previous.sceneId || i - 1} i scene ${scene.sceneId || i}.`);
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

module.exports = { validateTimeline, ROUNDING_TOLERANCE_MS };
