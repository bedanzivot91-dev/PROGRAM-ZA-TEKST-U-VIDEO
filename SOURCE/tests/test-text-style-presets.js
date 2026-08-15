'use strict';
// Testira text-style-presets.js — sekcija 14 dodatka (15 imenovanih preseta).
const assert = require('assert');
const { listStylePresets, getStylePreset, PRESET_DEFINITIONS } = require('../PROGRAM - NE BRISATI/text-style-presets');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TextStylePresetManager testovi ==');

test('postoji TAČNO 15 preseta, po specifikaciji dodatka', () => {
  assert.strictEqual(Object.keys(PRESET_DEFINITIONS).length, 15);
});

test('listStylePresets vraća 15 stavki sa jedinstvenim presetId i imenom', () => {
  const list = listStylePresets();
  assert.strictEqual(list.length, 15);
  const ids = new Set(list.map(p => p.presetId));
  const names = new Set(list.map(p => p.name));
  assert.strictEqual(ids.size, 15);
  assert.strictEqual(names.size, 15);
  for (const p of list) assert.ok(p.description && p.description.length > 0);
});

test('getStylePreset vraća validan createStyle() objekat za SVAKI preset (ne baca, ima styleId)', () => {
  for (const presetId of Object.keys(PRESET_DEFINITIONS)) {
    const style = getStylePreset(presetId);
    assert.ok(style.styleId, `${presetId} mora imati styleId`);
    assert.ok(style.font && style.font.family, `${presetId} mora imati font.family`);
    assert.ok(style.color, `${presetId} mora imati color`);
    assert.ok(style.outline, `${presetId} mora imati outline`);
    assert.ok(style.size && Number.isFinite(style.size.value), `${presetId} mora imati size.value`);
  }
});

test('getStylePreset baca jasnu grešku za nepoznat presetId', () => {
  assert.throws(() => getStylePreset('ne-postoji-nikad'), /Nepoznat preset/);
});

test('bold-impact ima VEĆI font od minimal-discreet (vizuelno različiti preseti, ne kopije)', () => {
  const bold = getStylePreset('bold-impact');
  const minimal = getStylePreset('minimal-discreet');
  assert.ok(bold.size.value > minimal.size.value);
});

test('neon-glow ima uključen glow efekat', () => {
  assert.strictEqual(getStylePreset('neon-glow').glow.enabled, true);
});

test('karaoke-classic ima definisane karaoke boje (aktivna/neaktivna/završena)', () => {
  const style = getStylePreset('karaoke-classic');
  assert.ok(style.karaoke.activeColor);
  assert.ok(style.karaoke.completedColor);
});

test('outline-only ima providnu ispunu ali punu konturu', () => {
  const style = getStylePreset('outline-only');
  assert.strictEqual(style.color.opacity, 0);
  assert.strictEqual(style.outline.enabled, true);
});

test('svaki preset ima potpuno definisan font podobjekat (nijedno polje undefined posle override-a)', () => {
  for (const presetId of Object.keys(PRESET_DEFINITIONS)) {
    const style = getStylePreset(presetId);
    for (const key of ['family', 'fallback', 'weight', 'italic', 'underline', 'strikethrough', 'textCase']) {
      assert.notStrictEqual(style.font[key], undefined, `${presetId}.font.${key} ne sme biti undefined`);
    }
  }
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
