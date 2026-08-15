'use strict';
// Testira lyrics-line-breaker.js — sekcija 13 dodatka o tekstu na videu (prelom linija i procena čitljivosti).
const assert = require('assert');
const { breakIntoLines, assessReadability, buildLineBreakWarnings, tokenizeIntoWords } = require('../PROGRAM - NE BRISATI/lyrics-line-breaker');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== LyricsLineBreaker testovi ==');

test('breakIntoLines vraća jednu liniju kada tekst staje', () => {
  const result = breakIntoLines('Sanjam noćas o tebi', { maxCharsPerLine: 40, maxLines: 2 });
  assert.deepStrictEqual(result.lines, ['Sanjam noćas o tebi']);
  assert.strictEqual(result.overflow, false);
});

test('breakIntoLines prelama na razmaku kada tekst ne staje u jednu liniju', () => {
  const result = breakIntoLines('Sanjam noćas o tebi i o danima koji dolaze', { maxCharsPerLine: 20, maxLines: 3 });
  assert.strictEqual(result.lines.length, 3);
  assert.strictEqual(result.overflow, false);
  for (const line of result.lines) assert.ok(line.length <= 20);
});

test('breakIntoLines NIKAD ne deli reč na pola (svaka linija sadrži samo cele reči iz originala)', () => {
  const original = "Nemoj da me ostaviš samog noćas jer ne mogu bez tebe da nastavim dalje ovim putem";
  const result = breakIntoLines(original, { maxCharsPerLine: 15, maxLines: 10 });
  const rebuilt = result.lines.join(' ').split(/\s+/);
  const originalWords = tokenizeIntoWords(original);
  assert.deepStrictEqual(rebuilt, originalWords.slice(0, rebuilt.length));
});

test('breakIntoLines NIKAD ne deli apostrofsku konstrukciju (npr. "dan\'as") jer se prelama samo između reči', () => {
  const result = breakIntoLines("Bio sam tu dan'as ceo", { maxCharsPerLine: 8, maxLines: 10 });
  const allWords = result.lines.join(' ').split(/\s+/);
  assert.ok(allWords.includes("dan'as"), "apostrofska reč mora ostati netaknuta kao jedna celina");
});

test('breakIntoLines prijavljuje overflow i koje reči ne staju kada prelazi maxLines', () => {
  const result = breakIntoLines('reč '.repeat(30).trim(), { maxCharsPerLine: 10, maxLines: 1 });
  assert.strictEqual(result.overflow, true);
  assert.ok(result.overflowWords.length > 0);
});

test('breakIntoLines na praznom tekstu vraća prazan niz bez greške', () => {
  const result = breakIntoLines('', { maxCharsPerLine: 40, maxLines: 2 });
  assert.deepStrictEqual(result.lines, []);
  assert.strictEqual(result.overflow, false);
});

test('assessReadability računa charactersPerSecond i wordsPerMinute', () => {
  const result = assessReadability('Sanjam noćas o tebi', 4000);
  assert.strictEqual(result.wordCount, 4);
  assert.ok(result.charactersPerSecond > 0);
  assert.ok(result.wordsPerMinute > 0);
});

test('assessReadability označava cue kao nedovoljno dugačak kada je kraći od minimuma', () => {
  const result = assessReadability('Ovo je jedna dosta duga linija teksta za čitanje', 200);
  assert.strictEqual(result.readableInTime, false);
  assert.ok(result.minimalDisplayDurationMs > 200);
});

test('assessReadability označava cue kao čitljiv kada ima dovoljno vremena', () => {
  const result = assessReadability('Kratko', 3000);
  assert.strictEqual(result.readableInTime, true);
});

test('buildLineBreakWarnings vraća upozorenje too_much_text kada tekst ne staje', () => {
  const { warnings } = buildLineBreakWarnings('reč '.repeat(30).trim(), 5000, { maxCharsPerLine: 10, maxLines: 1 });
  assert.ok(warnings.some(w => w.code === 'too_much_text'));
});

test('buildLineBreakWarnings vraća upozorenje cue_too_short kada je trajanje prekratko', () => {
  const { warnings } = buildLineBreakWarnings('Ovo je jedna dosta duga linija teksta za čitanje', 100, { maxCharsPerLine: 40, maxLines: 2 });
  assert.ok(warnings.some(w => w.code === 'cue_too_short'));
});

test('buildLineBreakWarnings ne vraća upozorenja za kratak tekst sa dovoljno vremena', () => {
  const { warnings } = buildLineBreakWarnings('Kratko', 3000, { maxCharsPerLine: 40, maxLines: 2 });
  assert.deepStrictEqual(warnings, []);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
