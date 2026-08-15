'use strict';
// Testira text-layout-engine.js — sekcije 6-8 i 17 dodatka (tipografija, safe zone, pozicioniranje).
const assert = require('assert');
const { createStyle, createCue } = require('../PROGRAM - NE BRISATI/text-overlay-models');
const {
  layoutCue, resolveSafeZone, resolveFontSizePx, resolveMaxCharsPerLine, resolveAnchorPosition, guessAspectRatio
} = require('../PROGRAM - NE BRISATI/text-layout-engine');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TextLayoutEngine testovi ==');

test('guessAspectRatio prepoznaje 16:9, 9:16 i 1:1', () => {
  assert.strictEqual(guessAspectRatio(1920, 1080), '16:9');
  assert.strictEqual(guessAspectRatio(1080, 1920), '9:16');
  assert.strictEqual(guessAspectRatio(1080, 1080), '1:1');
});

test('resolveSafeZone vraća veće margine za 9:16 (vertikalni format ima UI preko celog dna)', () => {
  const vertical = resolveSafeZone('9:16');
  const horizontal = resolveSafeZone('16:9');
  assert.ok(vertical.bottom > horizontal.bottom);
});

test('resolveSafeZone pada na podrazumevanu vrednost za nepoznat format', () => {
  const zone = resolveSafeZone('nepoznat-format');
  assert.deepStrictEqual(zone, resolveSafeZone('16:9'));
});

test('resolveFontSizePx računa procenat visine i klampuje na min/max', () => {
  const style = createStyle({ size: { value: 6, unit: 'percent-height', min: 2, max: 15 } });
  assert.strictEqual(resolveFontSizePx(style, 1000), 60);
  const tooBig = createStyle({ size: { value: 90, unit: 'percent-height', min: 2, max: 15 } });
  assert.strictEqual(resolveFontSizePx(tooBig, 1000), 150); // klampovano na max=15%
});

test('resolveFontSizePx podržava fiksne px vrednosti bez klampovanja na visinu', () => {
  const style = createStyle({ size: { value: 42, unit: 'px' } });
  assert.strictEqual(resolveFontSizePx(style, 1000), 42);
});

test('resolveMaxCharsPerLine daje manje karaktera po liniji za veći font', () => {
  const style = createStyle();
  const small = resolveMaxCharsPerLine(style, 1920, 30);
  const large = resolveMaxCharsPerLine(style, 1920, 90);
  assert.ok(large < small);
});

test('resolveAnchorPosition za bottom-center stavlja x na sredinu safe zone, y blizu dna', () => {
  const style = createStyle();
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 2000, text: 'x' });
  const video = { width: 1000, height: 1000 };
  const safeZone = resolveSafeZone('1:1');
  const pos = resolveAnchorPosition(cue.placement, safeZone, video);
  assert.strictEqual(pos.withinSafeZone, true);
  assert.ok(Math.abs(pos.xPx - 500) < 5, 'x mora biti blizu horizontalne sredine');
  assert.ok(pos.yPx > 500, 'y mora biti u donjoj polovini kadra za bottom anchor');
});

test('resolveAnchorPosition odbija nepoznat anchor', () => {
  const safeZone = resolveSafeZone('16:9');
  assert.throws(() => resolveAnchorPosition({ placementMode: 'preset', anchor: 'sredina-negde' }, safeZone, { width: 100, height: 100 }), /Nepoznat anchor/);
});

test('resolveAnchorPosition u manual modu prijavljuje kada je pozicija van safe zone', () => {
  const safeZone = resolveSafeZone('16:9');
  const pos = resolveAnchorPosition({ placementMode: 'manual', x: 0.01, y: 0.01 }, safeZone, { width: 1000, height: 1000 });
  assert.strictEqual(pos.withinSafeZone, false);
});

test('layoutCue vraća kompletan render spec sa linijama, pozicijom i bez upozorenja za normalan slučaj', () => {
  const style = createStyle();
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 4000, text: 'Sanjam noćas o tebi' });
  const layout = layoutCue({ cue, style, video: { width: 1920, height: 1080 } });
  assert.strictEqual(layout.aspectRatio, '16:9');
  assert.ok(layout.fontSizePx > 0);
  assert.ok(layout.lines.length >= 1);
  assert.strictEqual(layout.overflow, false);
  assert.deepStrictEqual(layout.warnings, []);
});

test('layoutCue prijavljuje outside_safe_zone upozorenje za manual poziciju van safe zone', () => {
  const style = createStyle();
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 4000, text: 'Kratko' });
  cue.placement = { placementMode: 'manual', x: 0.0, y: 0.0 };
  const layout = layoutCue({ cue, style, video: { width: 1920, height: 1080 } });
  assert.ok(layout.warnings.some(w => w.code === 'outside_safe_zone'));
});

test('layoutCue prosleđuje upozorenja iz LyricsLineBreaker (previše teksta / prekratak cue)', () => {
  const style = createStyle({ alignment: { horizontal: 'center', vertical: 'bottom', maxLineWidthPercent: 10, maxLines: 1, wordWrap: true } });
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 200, text: 'Ovo je jedna mnogo duža linija teksta koja sigurno neće stati' });
  const layout = layoutCue({ cue, style, video: { width: 1920, height: 1080 } });
  assert.ok(layout.warnings.some(w => w.code === 'too_much_text'));
  assert.ok(layout.warnings.some(w => w.code === 'cue_too_short'));
});

test('layoutCue baca jasnu grešku kada nedostaju dimenzije videa', () => {
  const style = createStyle();
  const cue = createCue({ trackId: 't1', startMs: 0, endMs: 1000, text: 'x' });
  assert.throws(() => layoutCue({ cue, style, video: {} }), /video/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
