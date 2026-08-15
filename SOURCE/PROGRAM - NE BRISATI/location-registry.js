'use strict';

// LocationRegistry + LocationDiversityValidator (sekcija 17): pamti korišćene lokacije i
// sprečava ponavljanje bez jakog narativnog razloga. "Tačno ista lokacija se podrazumevano
// ne koristi ponovo" — ponovna upotreba je dozvoljena SAMO uz eksplicitan razlog.

const crypto = require('crypto');
const { normalizeForComparison } = require('./lyrics-parser');

const OVERUSE_COUNT_THRESHOLD = 3; // ista lokacija korišćena 3+ puta se označava kao previše korišćena
const OVERUSE_SHARE_THRESHOLD = 0.4; // ili kada čini >40% svih scena (pravilo: "ne sme pola spota")
const VALID_REUSE_REASONS = new Set(['direct_continuity', 'refrain_motif_return', 'user_confirmed', 'dramaturgical_development']);

function normalizedSignature(location) {
  return normalizeForComparison([location?.name, location?.type, location?.interiorExterior, location?.timeOfDay].filter(Boolean).join(' '));
}

function createLocationRegistry() {
  return { byId: {}, bySignature: {} };
}

// Vraća POSTOJEĆI locationId ako se lokacija (po signature) već koristila, inače pravi novi —
// ovo je mehanizam koji sprečava da se "ista" lokacija slučajno duplira pod dva različita ID-ja.
function registerLocationUsage(registry, locationData, sceneId) {
  const signature = normalizedSignature(locationData);
  let locationId = registry.bySignature[signature];

  if (!locationId) {
    locationId = locationData.locationId || crypto.randomUUID();
    registry.byId[locationId] = {
      locationId,
      normalizedSignature: signature,
      name: locationData.name || '',
      type: locationData.type || '',
      interiorExterior: locationData.interiorExterior || '',
      cityNatureStudio: locationData.cityNatureStudio || '',
      timeOfDay: locationData.timeOfDay || '',
      weather: locationData.weather || '',
      architectureStyle: locationData.architectureStyle || '',
      dominantObjects: locationData.dominantObjects || [],
      dominantColors: locationData.dominantColors || [],
      crowdLevel: locationData.crowdLevel || 'minimal',
      clutterLevel: locationData.clutterLevel || 'minimal',
      usedInScenes: [],
      usageCount: 0,
      lastUsedScene: null,
      continuityGroupId: locationData.continuityGroupId || null
    };
    registry.bySignature[signature] = locationId;
  }

  const location = registry.byId[locationId];
  location.usedInScenes.push(sceneId);
  location.usageCount += 1;
  location.lastUsedScene = sceneId;
  return locationId;
}

function getLocation(registry, locationId) {
  return registry.byId[locationId] || null;
}

// scenes: [{ sceneId, locationId, reuseReason }] — reuseReason mora biti jedan od
// VALID_REUSE_REASONS kada scena ponovo koristi lokaciju koja se već pojavila ranije.
function validateLocationDiversity(registry, scenes) {
  const problems = [];
  const totalScenes = scenes.length || 1;

  for (let i = 1; i < scenes.length; i += 1) {
    const previous = scenes[i - 1];
    const current = scenes[i];
    if (current.locationId && current.locationId === previous.locationId) {
      const hasReason = VALID_REUSE_REASONS.has(current.reuseReason);
      if (!hasReason) {
        problems.push(`Scene "${previous.sceneId}" i "${current.sceneId}" su uzastopno na istoj lokaciji bez jasnog razloga (reuseReason).`);
      }
    }
  }

  for (const location of Object.values(registry.byId)) {
    const share = location.usageCount / totalScenes;
    if (location.usageCount >= OVERUSE_COUNT_THRESHOLD || share > OVERUSE_SHARE_THRESHOLD) {
      problems.push(`Lokacija "${location.name || location.locationId}" je previše korišćena (${location.usageCount}x, ${Math.round(share * 100)}% scena).`);
    }
  }

  return { valid: problems.length === 0, problems };
}

module.exports = { createLocationRegistry, registerLocationUsage, getLocation, validateLocationDiversity, normalizedSignature, VALID_REUSE_REASONS, OVERUSE_COUNT_THRESHOLD, OVERUSE_SHARE_THRESHOLD };
