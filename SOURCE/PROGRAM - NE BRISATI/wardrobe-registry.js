'use strict';

// WardrobeRegistry + WardrobeDiversityValidator (sekcija 18): pamti korišćene outfite,
// sprečava ponavljanje bez continuity razloga. Garderoba NIJE zaključana na crvenu haljinu —
// mora biti moderna/urbana, prilagođena sceni (pravilo 0.10).

const crypto = require('crypto');
const { normalizeForComparison } = require('./lyrics-parser');

const OLD_FASHIONED_KEYWORDS = ['vintage', 'old-fashioned', 'historical costume', 'period dress', 'antique clothing', 'outdated fashion'];
const OVERUSE_COUNT_THRESHOLD = 3;

function createWardrobeRegistry() {
  return { byId: {}, byDescription: {} };
}

function normalizedDescription(description) {
  return normalizeForComparison(description || '');
}

function registerOutfitUsage(registry, outfitData, sceneId) {
  const key = normalizedDescription(outfitData.description);
  let outfitId = registry.byDescription[key];

  if (!outfitId) {
    outfitId = outfitData.outfitId || crypto.randomUUID();
    registry.byId[outfitId] = {
      outfitId,
      characterId: outfitData.characterId || 'main-woman-global-v1',
      description: outfitData.description || '',
      style: outfitData.style || 'modern urban',
      sceneIds: [],
      continuityGroupId: outfitData.continuityGroupId || null,
      tattooVisibility: outfitData.tattooVisibility || 'hidden',
      usageCount: 0
    };
    registry.byDescription[key] = outfitId;
  }

  const outfit = registry.byId[outfitId];
  outfit.sceneIds.push(sceneId);
  outfit.usageCount += 1;
  return outfitId;
}

function getOutfit(registry, outfitId) {
  return registry.byId[outfitId] || null;
}

// Proverava da li opis garderobe krši pravilo "moderna i urbana, ne starinska bez istorijskog koncepta".
function isOldFashioned(description) {
  const normalized = String(description || '').toLowerCase();
  return OLD_FASHIONED_KEYWORDS.some(keyword => normalized.includes(keyword));
}

// scenes: [{ sceneId, outfitId, reuseReason }], conceptIsHistorical: da li IZABRANI koncept
// spota eksplicitno zahteva istorijski period (jedini legitiman izuzetak za starinsku odeću).
function validateWardrobeDiversity(registry, scenes, { conceptIsHistorical = false } = {}) {
  const problems = [];

  for (const scene of scenes) {
    const outfit = scene.outfitId ? registry.byId[scene.outfitId] : null;
    if (outfit && isOldFashioned(outfit.description) && !conceptIsHistorical) {
      problems.push(`Scena "${scene.sceneId}" koristi starinsku garderobu ("${outfit.description}") bez istorijskog koncepta.`);
    }
  }

  for (const outfit of Object.values(registry.byId)) {
    if (outfit.usageCount < OVERUSE_COUNT_THRESHOLD) continue;
    // Ponavljanje je OK ako sve scene koje ga koriste dele isti continuityGroupId (namerni kontinuitet radnje).
    const scenesWithOutfit = scenes.filter(s => s.outfitId === outfit.outfitId);
    const allShareContinuity = outfit.continuityGroupId && scenesWithOutfit.every(s => s.continuityGroupId === outfit.continuityGroupId);
    if (!allShareContinuity) {
      problems.push(`Outfit "${outfit.description || outfit.outfitId}" je korišćen ${outfit.usageCount}x bez continuity razloga.`);
    }
  }

  return { valid: problems.length === 0, problems };
}

module.exports = { createWardrobeRegistry, registerOutfitUsage, getOutfit, validateWardrobeDiversity, isOldFashioned, OLD_FASHIONED_KEYWORDS };
