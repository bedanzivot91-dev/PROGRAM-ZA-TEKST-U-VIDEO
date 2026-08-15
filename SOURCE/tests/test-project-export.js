'use strict';
// Testira project-export.js — sekcija 32. Ključna provera: izvoz NIKAD ne sadrži tajne
// (OAuth token, API key, bridge key), čak i ako bi se takvo polje slučajno našlo u projektu.
const assert = require('assert');
const { exportProject, stripSecrets, exportScenesCsv, exportLyricsSrt, EXPORTERS } = require('../PROGRAM - NE BRISATI/project-export');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ProjectExport testovi ==');

const sampleProject = {
  projectId: 'p1', name: 'Test Spot', songTitle: 'Pesma', artist: 'Izvođač',
  storyboard: { scenes: [
    { sceneId: 'scene-001', number: 1, startMs: 0, endMs: 5000, durationMs: 5000, cutReason: 'chorus_start' },
    { sceneId: 'scene-002', number: 2, startMs: 5000, endMs: 10000, durationMs: 5000, cutReason: 'song_end' }
  ] },
  imagePrompts: { 'scene-001': { sceneId: 'scene-001', finalPrompt: 'a woman walking', finalNegativePrompt: 'blurry' } },
  videoPrompts: { 'scene-001': { sceneId: 'scene-001', videoPrompt: 'slow zoom', negativeVideoPrompt: 'shake' } },
  lyrics: {
    formattedLyrics: '[Verse]\nPrva linija',
    lines: [
      { lineId: 'l1', text: 'Prva linija, sa zarezom "i navodnicima"', startMs: 0, endMs: 2000 },
      { lineId: 'l2', text: 'Bez vremena', startMs: null, endMs: null }
    ]
  }
};

test('exportProjectJson uklanja polja koja liče na tajne (token/secret/apikey/bridgekey)', () => {
  const withSecrets = { ...sampleProject, accessToken: 'AAAA', refreshToken: 'BBBB', apiKey: 'CCCC', bridgeKey: 'DDDD', nested: { clientSecret: 'EEEE', safeField: 'ok' } };
  const { content } = exportProject(withSecrets, 'project.json');
  assert.ok(!content.includes('AAAA'));
  assert.ok(!content.includes('BBBB'));
  assert.ok(!content.includes('CCCC'));
  assert.ok(!content.includes('DDDD'));
  assert.ok(!content.includes('EEEE'));
  assert.ok(content.includes('"safeField": "ok"'));
});

test('stripSecrets radi rekurzivno kroz nizove i ugnježdene objekte', () => {
  const dirty = { channels: [{ id: 'c1', accessToken: 'secret1' }, { id: 'c2', refreshToken: 'secret2' }] };
  const clean = stripSecrets(dirty);
  assert.strictEqual(JSON.stringify(clean).includes('secret1'), false);
  assert.strictEqual(JSON.stringify(clean).includes('secret2'), false);
  assert.strictEqual(clean.channels[0].id, 'c1');
});

test('exportStoryboardJson vraća tačan storyboard sa svim scenama', () => {
  const { content, mime } = exportProject(sampleProject, 'storyboard.json');
  const parsed = JSON.parse(content);
  assert.strictEqual(parsed.scenes.length, 2);
  assert.strictEqual(mime, 'application/json');
});

test('exportScenesCsv gradi ispravan CSV sa header-om i tačnim brojem redova', () => {
  const csv = exportScenesCsv(sampleProject);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], 'sceneId,number,startMs,endMs,durationMs,cutReason');
  assert.strictEqual(lines.length, 3); // header + 2 scene
  assert.ok(lines[1].includes('scene-001'));
});

test('CSV escape-uje vrednosti koje sadrže zareze/navodnike/nove redove', () => {
  const withComma = { storyboard: { scenes: [{ sceneId: 's1', number: 1, startMs: 0, endMs: 1000, durationMs: 1000, cutReason: 'razlog, sa zarezom' }] } };
  const csv = exportScenesCsv(withComma);
  assert.ok(csv.includes('"razlog, sa zarezom"'));
});

test('exportImagePromptsTxt i exportVideoPromptsTxt sadrže prompt i negative prompt po sceni', () => {
  const imageTxt = exportProject(sampleProject, 'image-prompts.txt').content;
  assert.ok(imageTxt.includes('a woman walking'));
  assert.ok(imageTxt.includes('NEGATIVE: blurry'));
  const videoTxt = exportProject(sampleProject, 'video-prompts.txt').content;
  assert.ok(videoTxt.includes('slow zoom'));
});

test('exportLyricsTxt vraća formatiran tekst sa section tagovima', () => {
  const txt = exportProject(sampleProject, 'lyrics.txt').content;
  assert.ok(txt.includes('[Verse]'));
  assert.ok(txt.includes('Prva linija'));
});

test('exportLyricsSrt gradi validan SRT format, PRESKAČE linije bez vremena', () => {
  const srt = exportLyricsSrt(sampleProject);
  assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:02,000\n'));
  assert.ok(!srt.includes('Bez vremena')); // linija bez startMs/endMs se ne izvozi kao netačan titl
});

test('SRT escape-uje navodnike u tekstu bez rušenja formata (samo prikazuje tekst kakav jeste)', () => {
  const srt = exportLyricsSrt(sampleProject);
  assert.ok(srt.includes('Prva linija, sa zarezom "i navodnicima"'));
});

test('exportProject baca jasnu grešku za nepoznat format', () => {
  assert.throws(() => exportProject(sampleProject, 'format-koji-ne-postoji.xyz'), /Nepoznat format izvoza/);
});

test('svi formati iz EXPORTERS rade bez bacanja greške na praznom/minimalnom projektu', () => {
  for (const format of Object.keys(EXPORTERS)) {
    assert.doesNotThrow(() => exportProject({}, format), `format "${format}" je bacio grešku na praznom projektu`);
  }
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
