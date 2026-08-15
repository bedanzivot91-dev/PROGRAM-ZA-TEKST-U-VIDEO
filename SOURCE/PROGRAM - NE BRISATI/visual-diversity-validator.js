'use strict';

// VisualDiversityValidator (sekcija 20): prati shot type, pozu i radnju kroz ceo storyboard.
// Lokacija i garderoba se proveravaju odvojeno (location-registry.js, wardrobe-registry.js) —
// ovaj modul pokriva ono što ostaje: kompoziciju kadra i ponovljene poze/radnje.

const { normalizeForComparison } = require('./lyrics-parser');

const MAX_CONSECUTIVE_SAME_SHOT = 2;

function buildVisualSignature(scene) {
  return {
    locationId: scene.locationId || null,
    outfitId: scene.outfitId || null,
    shot: scene.shotType || '',
    lens: scene.lens || '',
    angle: scene.angle || '',
    pose: scene.pose || '',
    action: scene.action || '',
    lighting: scene.lighting || '',
    palette: Array.isArray(scene.palette) ? scene.palette.join(',') : (scene.palette || ''),
    symbol: scene.symbol || '',
    composition: scene.composition || ''
  };
}

// scenes: [{ sceneId, shotType, pose, action, repeatJustified }]
function validateVisualDiversity(scenes) {
  const problems = [];
  if (!Array.isArray(scenes) || !scenes.length) return { valid: false, problems: ['Nema scena za validaciju.'] };

  for (let i = 2; i < scenes.length; i += 1) {
    const window = [scenes[i - 2], scenes[i - 1], scenes[i]];
    const shots = window.map(s => s.shotType).filter(Boolean);
    if (shots.length === 3 && shots[0] === shots[1] && shots[1] === shots[2]) {
      problems.push(`Isti shot type ("${shots[0]}") se ponavlja u ${MAX_CONSECUTIVE_SAME_SHOT + 1} uzastopne scene (${window.map(s => s.sceneId).join(', ')}) — dozvoljeno najviše ${MAX_CONSECUTIVE_SAME_SHOT}.`);
    }
  }

  const seenPoseAction = new Map();
  for (const scene of scenes) {
    const key = normalizeForComparison(`${scene.pose || ''} ${scene.action || ''}`.trim());
    if (!key) continue;
    if (seenPoseAction.has(key) && !scene.repeatJustified) {
      problems.push(`Scena "${scene.sceneId}" ponavlja identičnu pozu/radnju kao scena "${seenPoseAction.get(key)}" bez opravdanja.`);
    } else {
      seenPoseAction.set(key, scene.sceneId);
    }
  }

  return { valid: problems.length === 0, problems };
}

module.exports = { buildVisualSignature, validateVisualDiversity, MAX_CONSECUTIVE_SAME_SHOT };
