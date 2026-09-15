'use strict';
const assert = require('assert');
const { exportProject, stripSecrets, exportScenesCsv, exportLyricsSrt, exportEdl, exportProjectPdf, exportProjectZip, EXPORTERS } = require('../PROGRAM - NE BRISATI/project-export');

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

test('exportProjectJson uklanja tajne', () => {
  const withSecrets = { ...sampleProject, accessToken: 'AAAA', refreshToken: 'BBBB', apiKey: 'CCCC', bridgeKey: 'DDDD', nested: { clientSecret: 'EEEE', safeField: 'ok' } };
  const { content } = exportProject(withSecrets, 'project.json');
  for (const value of ['AAAA','BBBB','CCCC','DDDD','EEEE']) assert.ok(!content.includes(value));
  assert.ok(content.includes('"safeField": "ok"'));
});

test('stripSecrets radi rekurzivno', () => {
  const dirty = { channels: [{ id: 'c1', accessToken: 'secret1' }, { id: 'c2', refreshToken: 'secret2' }] };
  const clean = stripSecrets(dirty);
  assert.strictEqual(JSON.stringify(clean).includes('secret1'), false);
  assert.strictEqual(JSON.stringify(clean).includes('secret2'), false);
  assert.strictEqual(clean.channels[0].id, 'c1');
});

test('storyboard JSON radi', () => {
  const { content, mime } = exportProject(sampleProject, 'storyboard.json');
  assert.strictEqual(JSON.parse(content).scenes.length, 2);
  assert.strictEqual(mime, 'application/json');
});

test('CSV radi', () => {
  const lines = exportScenesCsv(sampleProject).split('\r\n');
  assert.strictEqual(lines[0], 'sceneId,number,startMs,endMs,durationMs,cutReason');
  assert.strictEqual(lines.length, 3);
});

test('CSV escape', () => {
  const csv = exportScenesCsv({ storyboard: { scenes: [{ sceneId:'s1', number:1, startMs:0, endMs:1000, durationMs:1000, cutReason:'razlog, sa zarezom' }] } });
  assert.ok(csv.includes('"razlog, sa zarezom"'));
});

test('prompt exports rade', () => {
  assert.ok(exportProject(sampleProject, 'image-prompts.txt').content.includes('a woman walking'));
  assert.ok(exportProject(sampleProject, 'video-prompts.txt').content.includes('slow zoom'));
});

test('lyrics txt radi', () => { assert.ok(exportProject(sampleProject, 'lyrics.txt').content.includes('[Verse]')); });

test('SRT preskače linije bez vremena', () => {
  const srt = exportLyricsSrt(sampleProject);
  assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:02,000\n'));
  assert.ok(!srt.includes('Bez vremena'));
});

test('EDL format je validan CMX-style tekst', () => {
  const edl = exportEdl(sampleProject);
  assert.ok(edl.includes('TITLE: Test Spot'));
  assert.ok(edl.includes('FCM: NON-DROP FRAME'));
  assert.ok(edl.includes('001  AX       V     C'));
  assert.ok(edl.includes('00:00:00:00'));
});

test('PDF ima validan PDF header i EOF', () => {
  const pdf = exportProjectPdf(sampleProject);
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.subarray(0, 8).toString('ascii').startsWith('%PDF-1.4'));
  assert.ok(pdf.toString('binary').includes('%%EOF'));
});

test('ZIP ima PK header i ne sadrži tajne u project.json sadržaju', () => {
  const zip = exportProjectZip({ ...sampleProject, accessToken: 'NE_SME_U_ZIP' });
  assert.ok(Buffer.isBuffer(zip));
  assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(!zip.includes(Buffer.from('NE_SME_U_ZIP')));
});

test('exportProject vraća nove formate sa MIME tipovima', () => {
  assert.strictEqual(exportProject(sampleProject, 'timeline.edl').mime, 'application/edl');
  assert.strictEqual(exportProject(sampleProject, 'project.pdf').mime, 'application/pdf');
  assert.strictEqual(exportProject(sampleProject, 'project.zip').mime, 'application/zip');
});

test('nepoznat format baca grešku', () => {
  assert.throws(() => exportProject(sampleProject, 'format-koji-ne-postoji.xyz'), /Nepoznat format izvoza/);
});

test('svi EXPORTERS rade na minimalnom projektu', () => {
  for (const format of Object.keys(EXPORTERS)) assert.doesNotThrow(() => exportProject({}, format), format);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
