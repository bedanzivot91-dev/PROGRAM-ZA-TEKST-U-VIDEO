'use strict';
// Testira scene-candidates.js — pretvara poravnat tekst + muzičku analizu u kandidate za
// ScenePlanner. Ključno: PRVI refren dobija "chorus_start", POSLEDNJI (kada ih ima više)
// dobija "final_chorus_start" (viši dramaturški prioritet, sekcija 13/19).
const assert = require('assert');
const { buildSceneCandidates } = require('../PROGRAM - NE BRISATI/scene-candidates');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== SceneCandidates testovi ==');

const lyrics = {
  sections: [
    { id: 'intro', type: 'intro' },
    { id: 'verse', type: 'verse' },
    { id: 'chorus', type: 'chorus' },
    { id: 'bridge', type: 'bridge' },
    { id: 'chorus-2', type: 'chorus' }
  ],
  lines: [
    { lineId: 'intro-l1', sectionId: 'intro', startMs: 0, endMs: 1500 },
    { lineId: 'verse-l1', sectionId: 'verse', startMs: 2000, endMs: 3500 },
    { lineId: 'verse-l2', sectionId: 'verse', startMs: 3600, endMs: 5000 },
    { lineId: 'chorus-l1', sectionId: 'chorus', startMs: 6000, endMs: 7500 },
    { lineId: 'bridge-l1', sectionId: 'bridge', startMs: 10000, endMs: 11500 },
    { lineId: 'chorus-2-l1', sectionId: 'chorus-2', startMs: 14000, endMs: 15500 },
    { lineId: 'unaligned-l1', sectionId: 'chorus-2', startMs: null, endMs: null } // needsReview, nema vreme
  ]
};

const musicAnalysis = {
  ok: true,
  downbeatTimesMs: [4000, 8000, 12000],
  onsets: [
    { timeMs: 4200, strength: 0.8 }, // jak — mora postati kandidat
    { timeMs: 4300, strength: 0.2 }  // slab — NE sme postati kandidat
  ]
};

const candidates = buildSceneCandidates({ lyrics, musicAnalysis });

test('prvi refren dobija chorus_start, POSLEDNJI dobija final_chorus_start (ima ih 2)', () => {
  const firstChorus = candidates.find(c => c.sourceSectionId === 'chorus');
  const lastChorus = candidates.find(c => c.sourceSectionId === 'chorus-2' && c.timeMs === 14000);
  assert.strictEqual(firstChorus.type, 'chorus_start');
  assert.strictEqual(lastChorus.type, 'final_chorus_start');
});

test('bridge dobija bridge_start', () => {
  const bridge = candidates.find(c => c.sourceSectionId === 'bridge');
  assert.strictEqual(bridge.type, 'bridge_start');
});

test('verse dobija verse_start', () => {
  const verse = candidates.find(c => c.sourceSectionId === 'verse');
  assert.strictEqual(verse.type, 'verse_start');
});

test('intro (nije verse/chorus/bridge) dobija generički section_start', () => {
  const intro = candidates.find(c => c.sourceSectionId === 'intro');
  assert.strictEqual(intro.type, 'section_start');
});

test('svaka poravnata linija dodaje important_line_end kandidat na svom endMs', () => {
  const lineEnd = candidates.find(c => c.type === 'important_line_end' && c.sourceLineId === 'verse-l1');
  assert.ok(lineEnd);
  assert.strictEqual(lineEnd.timeMs, 3500);
});

test('linija bez poravnanja (startMs/endMs=null) se PRESKAČE, ne pravi lažan kandidat', () => {
  const badCandidate = candidates.find(c => c.sourceLineId === 'unaligned-l1');
  assert.strictEqual(badCandidate, undefined);
});

test('downbeat vremena iz muzičke analize postaju downbeat kandidati', () => {
  const downbeats = candidates.filter(c => c.type === 'downbeat').map(c => c.timeMs);
  assert.deepStrictEqual(downbeats, [4000, 8000, 12000]);
});

test('jak onset (strength≥0.6) postaje strong_onset, slab onset se IGNORIŠE', () => {
  const strongOnsets = candidates.filter(c => c.type === 'strong_onset');
  assert.strictEqual(strongOnsets.length, 1);
  assert.strictEqual(strongOnsets[0].timeMs, 4200);
});

test('samo JEDAN refren (bez ponavljanja) NE dobija final_chorus_start', () => {
  const singleChorusLyrics = {
    sections: [{ id: 'chorus', type: 'chorus' }],
    lines: [{ lineId: 'l1', sectionId: 'chorus', startMs: 1000, endMs: 2000 }]
  };
  const result = buildSceneCandidates({ lyrics: singleChorusLyrics });
  const chorus = result.find(c => c.sourceSectionId === 'chorus');
  assert.strictEqual(chorus.type, 'chorus_start');
});

test('nedostajući lyrics ili musicAnalysis ne bacaju grešku — vraća prazan ili delimičan niz', () => {
  assert.deepStrictEqual(buildSceneCandidates({}), []);
  assert.deepStrictEqual(buildSceneCandidates(), []);
  const onlyMusic = buildSceneCandidates({ musicAnalysis: { ok: true, downbeatTimesMs: [1000], onsets: [] } });
  assert.strictEqual(onlyMusic.length, 1);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
