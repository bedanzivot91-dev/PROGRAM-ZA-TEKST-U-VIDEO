'use strict';

// HookSceneValidator (sekcija 19): svaka scena mora biti hook scena — jasan vizuelni razlog,
// pažnja, emocija, radnja, kompozicija ili iznenađenje. Prve tri scene moraju biti tri
// RAZLIČITA hook-a; finalni refren mora biti dramaturški vrhunac (jači od prvog refrena).

const { normalizeForComparison } = require('./lyrics-parser');

// scenes: [{ sceneId, hookType, hookDescription, hookScore, sectionType }]
// sectionType (opciono): 'chorus' | 'final_chorus' | 'bridge' | 'outro' | ... — koristi se za
// dramaturšku progresiju (finalni refren mora biti jači od prvog).
function validateHookScenes(scenes) {
  const problems = [];

  if (!Array.isArray(scenes) || !scenes.length) {
    return { valid: false, problems: ['Nema scena za validaciju.'] };
  }

  scenes.forEach(scene => {
    if (!scene.hookType || !String(scene.hookDescription || '').trim()) {
      problems.push(`Scena "${scene.sceneId}" nema definisan hook (prazna scena bez radnje ili značenja).`);
    }
  });

  if (scenes.length >= 3) {
    const firstThreeTypes = scenes.slice(0, 3).map(s => s.hookType).filter(Boolean);
    if (new Set(firstThreeTypes).size < Math.min(3, firstThreeTypes.length)) {
      problems.push('Prve tri scene moraju imati tri različita hook tipa (uvod ne sme biti generičan).');
    }
  }

  const seenDescriptions = new Map();
  for (const scene of scenes) {
    const normalized = normalizeForComparison(scene.hookDescription);
    if (!normalized) continue;
    if (seenDescriptions.has(normalized)) {
      problems.push(`Scena "${scene.sceneId}" ponavlja identičan generički hook opis kao scena "${seenDescriptions.get(normalized)}".`);
    } else {
      seenDescriptions.set(normalized, scene.sceneId);
    }
  }

  const choruses = scenes.filter(s => s.sectionType === 'chorus');
  const finalChorus = scenes.find(s => s.sectionType === 'final_chorus');
  if (choruses.length && finalChorus && Number.isFinite(finalChorus.hookScore)) {
    const firstChorusScore = choruses[0].hookScore;
    if (Number.isFinite(firstChorusScore) && finalChorus.hookScore < firstChorusScore) {
      problems.push(`Finalni refren (hookScore=${finalChorus.hookScore}) mora biti dramaturški vrhunac — slabiji je od prvog refrena (hookScore=${firstChorusScore}).`);
    }
  }

  return { valid: problems.length === 0, problems };
}

module.exports = { validateHookScenes };
