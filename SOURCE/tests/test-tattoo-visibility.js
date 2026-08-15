'use strict';
// Testira tattoo-visibility.js — sekcija 16: "Ako je hidden/out_of_frame, ne zahtevaj da se
// tetovaža vidi; ne stvaraj kontradikciju u promptu."
const assert = require('assert');
const { validateSceneTattooVisibility, tattooPromptFragment } = require('../PROGRAM - NE BRISATI/tattoo-visibility');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TattooVisibility testovi ==');

test('nepoznata/nedostajuća vrednost tattooVisibility se odbija', () => {
  assert.strictEqual(validateSceneTattooVisibility({ tattooVisibility: 'maybe' }).valid, false);
  assert.strictEqual(validateSceneTattooVisibility({}).valid, false);
});

test('visible + prompt koji pominje tetovažu → validno', () => {
  const result = validateSceneTattooVisibility({ tattooVisibility: 'visible', finalPrompt: 'small minimalist Mini Mouse tattoo visible on the front upper right thigh' });
  assert.strictEqual(result.valid, true);
});

test('visible + prompt koji NE pominje tetovažu → problem (garderoba/kadar je verovatno ne otkriva)', () => {
  const result = validateSceneTattooVisibility({ tattooVisibility: 'visible', finalPrompt: 'woman walking in the city at night' });
  assert.strictEqual(result.valid, false);
});

test('hidden + prompt koji NE pominje tetovažu → validno', () => {
  const result = validateSceneTattooVisibility({ tattooVisibility: 'hidden', finalPrompt: 'woman wearing long winter coat' });
  assert.strictEqual(result.valid, true);
});

test('hidden + prompt koji IPAK pominje tetovažu → kontradikcija, problem', () => {
  const result = validateSceneTattooVisibility({ tattooVisibility: 'hidden', finalPrompt: 'small minimalist Mini Mouse tattoo visible on the front upper right thigh' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.problems[0].includes('kontradikcija'));
});

test('out_of_frame se ponaša isto kao hidden', () => {
  const result = validateSceneTattooVisibility({ tattooVisibility: 'out_of_frame', finalPrompt: 'small minimalist Mini Mouse tattoo visible on the front upper right thigh' });
  assert.strictEqual(result.valid, false);
});

test('tattooPromptFragment vraća opis tetovaže SAMO za visible', () => {
  assert.ok(tattooPromptFragment('visible').length > 0);
  assert.strictEqual(tattooPromptFragment('hidden'), '');
  assert.strictEqual(tattooPromptFragment('out_of_frame'), '');
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
