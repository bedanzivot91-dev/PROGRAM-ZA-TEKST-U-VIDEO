'use strict';

// FinalPromptBuilder (sekcija 21.2) + generički ImageGenerationProvider ugovor (sekcija 16).
// AI odgovor (scenePrompt) NIKAD ne ponavlja puni identity block — ovaj modul ga dodaje
// AUTOMATSKI na server strani, tačno jednom, u tačno propisanom redosledu:
// 1. zaključani positive identity, 2. scena, 3. moderna garderoba, 4. lokacija, 5. akcija,
// 6. emocija, 7. kompozicija, 8. foreground/midground/background, 9. svetlo, 10. boje,
// 11. kamera i objektiv, 12. realizam, 13. format, 14. continuity.

const { tattooPromptFragment } = require('./tattoo-visibility');

function joinNonEmpty(parts, separator = ', ') {
  return parts.filter(part => part && String(part).trim()).map(part => String(part).trim()).join(separator);
}

// scene: { scenePrompt, sceneNegativePrompt, wardrobe, locationDescription, action, emotion,
//          composition, foreground, midground, background, lighting, palette, shotType, lens,
//          continuityNotes, tattooVisibility }
// identity: { positive, negative } — iz locked-girl-identity.js (server-side ekvivalent).
function buildFinalImagePrompt(scene, identity, { format = 'vertical 9:16 music video frame' } = {}) {
  if (!identity?.positive) throw new Error('Identity.positive je obavezan — FinalPromptBuilder ne sme raditi bez zaključanog identiteta.');

  const tattooFragment = tattooPromptFragment(scene?.tattooVisibility);
  const paletteText = Array.isArray(scene?.palette) ? scene.palette.join(', ') : scene?.palette;

  const positiveParts = [
    identity.positive,                                    // 1. zaključani positive identity
    scene?.scenePrompt,                                    // 2. scena (od AI-ja, bez identity bloka)
    tattooFragment,
    scene?.wardrobe,                                        // 3. moderna garderoba
    scene?.locationDescription,                             // 4. lokacija
    scene?.action,                                          // 5. akcija
    scene?.emotion,                                         // 6. emocija
    scene?.composition,                                     // 7. kompozicija
    joinNonEmpty([scene?.foreground, scene?.midground, scene?.background], ', '), // 8. FG/MG/BG
    scene?.lighting,                                        // 9. svetlo
    paletteText,                                             // 10. boje
    joinNonEmpty([scene?.shotType, scene?.lens], ', '),     // 11. kamera i objektiv
    'photorealistic, realistic, high detail',               // 12. realizam
    format,                                                  // 13. format
    Array.isArray(scene?.continuityNotes) ? scene.continuityNotes.join(', ') : scene?.continuityNotes // 14. continuity
  ];

  const negativeParts = [
    identity.negative,                                      // 1. zaključani negative identity
    scene?.sceneNegativePrompt,                             // 2. scene negative
    'text, subtitle, logo, watermark'                       // 3. zabrane teksta/loga/watermarka
  ];

  return {
    finalPrompt: joinNonEmpty(positiveParts).replace(/\s+/g, ' ').trim(),
    finalNegativePrompt: joinNonEmpty(negativeParts).replace(/\s+/g, ' ').trim()
  };
}

// Generički ugovor za ImageGenerationProvider implementacije (ComfyUI, ChatGPT bridge, itd.)
// Konkretni provideri (postojeći ComfyUI/bridge kod) treba da implementiraju ovaj oblik zahteva.
function buildImageGenerationRequest(scene, identity, options = {}) {
  const { finalPrompt, finalNegativePrompt } = buildFinalImagePrompt(scene, identity, options);
  return {
    sceneId: scene?.sceneId || null,
    prompt: finalPrompt,
    negativePrompt: finalNegativePrompt,
    referenceImages: Array.isArray(options.referenceImages) ? options.referenceImages : [],
    faceIdentityReference: options.faceIdentityReference || null,
    seed: Number.isFinite(options.seed) ? options.seed : null,
    consistencyStrength: Number.isFinite(options.consistencyStrength) ? options.consistencyStrength : 0.7,
    provider: options.provider || null, // konkretan backend popunjava pozivalac (npr. 'comfyui', 'chatgpt-bridge')
    model: options.model || null
  };
}

module.exports = { buildFinalImagePrompt, buildImageGenerationRequest };
