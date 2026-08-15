'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tools = require(path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'text-video-tools'));
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'PROGRAM - NE BRISATI', 'server.js'), 'utf8');

const lrc = tools.parseLrc('[ar:Test izvođač]\n[00:01.20]Prvi stih\n[00:03.50][00:04.00]Drugi stih', { durationMs: 8000 });
assert.strictEqual(lrc.metadata.ar, 'Test izvođač');
assert.strictEqual(lrc.cues.length, 3);
assert.strictEqual(lrc.cues[0].startMs, 1200);
assert.strictEqual(lrc.cues[0].endMs, 3500);
assert.match(tools.exportLrc(lrc.cues, lrc.metadata), /\[00:01\.20\]Prvi stih/);

const srt = tools.parseSrt('1\n00:00:01,000 --> 00:00:03,000\nPrvi\n\n2\n00:00:04.000 --> 00:00:06.500\nDrugi');
assert.strictEqual(srt.length, 2);
assert.strictEqual(srt[1].endMs, 6500);

const words = tools.createKaraokeWordTimings({ startMs: 1000, endMs: 5000, text: 'Ovo je test' });
assert.strictEqual(words.length, 3);
assert.strictEqual(words[0].startMs, 1000);
assert.strictEqual(words[words.length - 1].endMs, 5000);

const invalidTrack = { cues: [
  { cueId: 'a', startMs: 0, endMs: 2500, text: 'A' },
  { cueId: 'b', startMs: 2000, endMs: 3000, text: 'B' }
] };
assert.strictEqual(tools.validateCaptionTrack(invalidTrack).valid, false);
const normalized = tools.normalizeCaptionTrack(invalidTrack);
assert.strictEqual(tools.validateCaptionTrack(normalized).valid, true);

const split = tools.splitLongCaptionCue({ cueId: 'long', startMs: 0, endMs: 6000, text: 'Ovo je veoma dugačak tekst koji mora biti podeljen u više kraćih titlova' }, { maxChars: 24 });
assert.ok(split.length > 1);
assert.strictEqual(split[0].startMs, 0);
assert.strictEqual(split[split.length - 1].endMs, 6000);

assert.deepStrictEqual(tools.getSafeAreaPreset('9:16').format, '9:16');
const markers = tools.detectBeatMarkers([0.1, 0.2, 0.9, 0.2, 0.1, 0.2, 0.8, 0.2], { fps: 10, minIntervalMs: 100 });
assert.strictEqual(markers.length, 2);
const scenes = tools.buildSceneCutsFromBeats(10000, markers, { minimumSceneMs: 1000, maximumSceneMs: 5000 });
assert.strictEqual(scenes[0].startMs, 0);
assert.strictEqual(scenes[scenes.length - 1].endMs, 10000);

const plan = tools.buildBatchExportPlan({ baseName: 'spot', outputDir: 'izvoz', formats: ['SRT', 'vtt', 'srt', 'nepodržano'] });
assert.deepStrictEqual(plan.map(item => item.format), ['srt', 'vtt']);
assert.strictEqual(plan[0].outputPath, 'izvoz/spot.srt');

assert.ok(serverSource.includes("pathname === '/api/text-tools/features'"));
assert.ok(serverSource.includes("pathname.startsWith('/api/text-tools/')"));
assert.ok(serverSource.includes("pathname === '/api/text-tools/safe-area'"));
for (const route of [
  "'lrc/import'", "'lrc/export'", "'srt/import'", "'karaoke/words'", "'qc'",
  "'normalize'", "'split'", "'beat-markers'", "'scene-cuts'", "'batch-export'"
]) assert.ok(serverSource.includes(route), `Nedostaje text-tools dispatch: ${route}`);

console.log('PASS: text-video-tools 11 funkcija + server rute');
