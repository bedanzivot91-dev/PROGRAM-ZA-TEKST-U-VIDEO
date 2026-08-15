'use strict';

// Validira AI odgovore pre nego što uđu u pipeline (sekcije 21.1/21.2/21.5/22). AI odgovor se
// TRETIRA SAMO KAO PODATAK (pravilo 29/33) — nikad se ne izvršava, uvek se prvo proverava.
// Ako JSON nije validan: ne briši postojeći storyboard, prikaži tačnu grešku, ponovi samo
// neuspeli deo (pravilo 21.1) — ovaj modul vraća listu problema, nikad ne baca izuzetak sam.

const MAIN_CHARACTER_ID = 'main-woman-global-v1';
const REQUIRED_CONCEPT_FIELDS = ['id', 'title', 'summary', 'story', 'visualStyle'];
const REQUIRED_SCENE_FIELDS = ['sceneId', 'number', 'startMs', 'endMs', 'characterIds'];

function validateConceptsResponse(response) {
  const problems = [];
  if (!response || typeof response !== 'object') return { valid: false, problems: ['Odgovor nije validan JSON objekat.'] };

  if (!Array.isArray(response.concepts) || response.concepts.length !== 3) {
    problems.push(`concepts mora sadržati tačno 3 elementa (dobijeno: ${Array.isArray(response.concepts) ? response.concepts.length : 'nije niz'}).`);
  } else {
    const seenIds = new Set();
    response.concepts.forEach((concept, index) => {
      for (const field of REQUIRED_CONCEPT_FIELDS) {
        if (!concept?.[field]) problems.push(`concepts[${index}] nedostaje obavezno polje "${field}".`);
      }
      if (concept?.id) {
        if (seenIds.has(concept.id)) problems.push(`concepts[${index}] ima dupliran id "${concept.id}".`);
        seenIds.add(concept.id);
      }
    });
    if (response.recommendedConceptId && !seenIds.has(response.recommendedConceptId)) {
      problems.push(`recommendedConceptId "${response.recommendedConceptId}" se ne poklapa ni sa jednim conceptId.`);
    }
  }
  if (!response.recommendedConceptId) problems.push('Nedostaje recommendedConceptId.');

  return { valid: problems.length === 0, problems };
}

// storyboard: { conceptId, totalDurationMs, scenes: [...] }. Proverava sve eksplicitne stavke
// sa manuelne-validacije liste iz sekcije 22: nedostajuće/duple/nepoznate scene, pogrešna
// vremena, nedostajući sceneId, nepoznat characterId, kršenje zaključanog identiteta (glavna
// devojka mora biti u SVAKOJ sceni).
function validateStoryboardResponse(storyboard, { expectedTotalDurationMs = null } = {}) {
  const problems = [];
  if (!storyboard || typeof storyboard !== 'object') return { valid: false, problems: ['Storyboard nije validan JSON objekat.'] };
  if (!Array.isArray(storyboard.scenes) || !storyboard.scenes.length) {
    return { valid: false, problems: ['Storyboard nema nijednu scenu.'] };
  }

  const seenSceneIds = new Set();
  storyboard.scenes.forEach((scene, index) => {
    for (const field of REQUIRED_SCENE_FIELDS) {
      if (scene?.[field] === undefined || scene?.[field] === null || scene?.[field] === '') {
        problems.push(`scenes[${index}] nedostaje obavezno polje "${field}".`);
      }
    }
    if (scene?.sceneId) {
      if (seenSceneIds.has(scene.sceneId)) problems.push(`Duplirana scena: sceneId "${scene.sceneId}" se pojavljuje više puta.`);
      seenSceneIds.add(scene.sceneId);
    }
    if (Number.isFinite(scene?.startMs) && Number.isFinite(scene?.endMs) && scene.endMs <= scene.startMs) {
      problems.push(`Scena "${scene.sceneId || index}" ima neispravno vreme (endMs <= startMs).`);
    }
    if (!Array.isArray(scene?.characterIds) || !scene.characterIds.includes(MAIN_CHARACTER_ID)) {
      problems.push(`Scena "${scene.sceneId || index}" krši zaključani identitet — glavna devojka (${MAIN_CHARACTER_ID}) mora biti u SVAKOJ sceni.`);
    }
  });

  if (Number.isFinite(expectedTotalDurationMs) && Number.isFinite(storyboard.totalDurationMs)) {
    if (Math.abs(storyboard.totalDurationMs - expectedTotalDurationMs) > 10) {
      problems.push(`totalDurationMs (${storyboard.totalDurationMs}) se ne poklapa sa stvarnim trajanjem audio-fajla (${expectedTotalDurationMs}).`);
    }
  }

  return { valid: problems.length === 0, problems };
}

// batchType: 'image' | 'video' — ista pravila (batchId, max 5 stavki, sceneId obavezan),
// razlikuje se samo koje je polje prompta obavezno.
function validatePromptBatchResponse(response, { expectedBatchId, batchType = 'image', knownSceneIds = null } = {}) {
  const problems = [];
  if (!response || typeof response !== 'object') return { valid: false, problems: ['Odgovor nije validan JSON objekat.'] };

  if (expectedBatchId && response.batchId !== expectedBatchId) {
    problems.push(`Pogrešan batchId (očekivano "${expectedBatchId}", dobijeno "${response.batchId}").`);
  }
  if (!Array.isArray(response.items) || !response.items.length) {
    return { valid: false, problems: [...problems, 'items mora biti neprazan niz.'] };
  }
  if (response.items.length > 5) problems.push(`Batch ima ${response.items.length} scena — najviše 5 je dozvoljeno.`);

  const promptField = batchType === 'video' ? 'videoPrompt' : 'scenePrompt';
  const seenSceneIds = new Set();
  response.items.forEach((item, index) => {
    if (!item?.sceneId) problems.push(`items[${index}] nedostaje sceneId.`);
    else {
      if (seenSceneIds.has(item.sceneId)) problems.push(`Duplirana scena u batch-u: "${item.sceneId}".`);
      seenSceneIds.add(item.sceneId);
      if (knownSceneIds && !knownSceneIds.has(item.sceneId)) problems.push(`items[${index}] pominje nepoznat sceneId "${item.sceneId}" (ne postoji u storyboard-u).`);
    }
    if (!item?.[promptField]) problems.push(`items[${index}] (scena "${item?.sceneId || index}") nedostaje "${promptField}".`);
  });

  return { valid: problems.length === 0, problems };
}

module.exports = { validateConceptsResponse, validateStoryboardResponse, validatePromptBatchResponse, MAIN_CHARACTER_ID };
