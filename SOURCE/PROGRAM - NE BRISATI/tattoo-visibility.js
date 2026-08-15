'use strict';

// Sekcija 16: "Svaka scena ima tattooVisibility: visible | hidden | out_of_frame. Ako je hidden
// ili out_of_frame: ne zahtevaj da se tetovaža vidi; ne stvaraj kontradikciju u promptu. Ako je
// visible: garderoba i kadar moraju prirodno otkriti tačnu zonu; ne pomeraj tetovažu."

const VALID_VISIBILITY = new Set(['visible', 'hidden', 'out_of_frame']);

// Fraze koje eksplicitno traže da se tetovaža vidi — ne smeju se pojaviti u finalnom promptu
// kada je tattooVisibility hidden/out_of_frame (direktna kontradikcija).
const TATTOO_MENTION_PATTERN = /mini mouse tattoo|tattoo on the front upper right thigh|visible tattoo/i;

function validateSceneTattooVisibility(scene) {
  const problems = [];
  const visibility = scene?.tattooVisibility;

  if (!VALID_VISIBILITY.has(visibility)) {
    problems.push(`tattooVisibility mora biti "visible", "hidden" ili "out_of_frame" (dobijeno: ${JSON.stringify(visibility)}).`);
    return { valid: false, problems };
  }

  const promptText = String(scene?.finalPrompt || scene?.scenePrompt || '');
  const mentionsTattoo = TATTOO_MENTION_PATTERN.test(promptText);

  if ((visibility === 'hidden' || visibility === 'out_of_frame') && mentionsTattoo) {
    problems.push(`tattooVisibility je "${visibility}" ali prompt eksplicitno pominje tetovažu — kontradikcija.`);
  }
  if (visibility === 'visible' && promptText && !mentionsTattoo) {
    problems.push('tattooVisibility je "visible" ali finalni prompt ne pominje tetovažu — garderoba/kadar možda ne otkrivaju zonu.');
  }

  return { valid: problems.length === 0, problems };
}

// Bira tekst tetovaže koji FinalPromptBuilder ubacuje u prompt — prazan string kada tetovaža
// ne treba da bude pomenuta (hidden/out_of_frame), inače tačan opis pozicije iz sekcije 16.
function tattooPromptFragment(tattooVisibility) {
  if (tattooVisibility === 'visible') {
    return 'small minimalist Mini Mouse tattoo visible on the front upper right thigh';
  }
  return ''; // hidden/out_of_frame — ne dodaje se ništa, sprečava kontradikciju
}

module.exports = { validateSceneTattooVisibility, tattooPromptFragment, VALID_VISIBILITY };
