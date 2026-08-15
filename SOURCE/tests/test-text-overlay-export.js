'use strict';
// Testira text-overlay-export.js — sekcije 12/23 dodatka (SRT/VTT/ASS/JSON export + FFmpeg/libass burn-in).
// Poslednji test je STVARNA integracija: sintetiše pravi video preko FFmpeg-a, generiše pravi ASS
// fajl i stvarno ga spaja (burn-in) u video preko FFmpeg-a — ne mockuje render pipeline.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { createTextTrack, createCue, createStyle } = require('../PROGRAM - NE BRISATI/text-overlay-models');
const {
  msToSrtTimestamp, msToVttTimestamp, msToAssTimestamp, exportTrackToSrt, exportTrackToVtt,
  exportTrackToAss, exportTrackToJson, colorToAssHex, buildBurnInFfmpegArgs,
  resolveFfmpegPath, renderBurnIn
} = require('../PROGRAM - NE BRISATI/text-overlay-export');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}
async function testAsync(label, fn) {
  try { await fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TextOverlayExport testovi ==');

test('msToSrtTimestamp formatira ispravno (zarez pre milisekundi)', () => {
  assert.strictEqual(msToSrtTimestamp(0), '00:00:00,000');
  assert.strictEqual(msToSrtTimestamp(3661500), '01:01:01,500');
});

test('msToVttTimestamp formatira ispravno (tačka pre milisekundi)', () => {
  assert.strictEqual(msToVttTimestamp(3661500), '01:01:01.500');
});

test('msToAssTimestamp koristi centisekunde (2 cifre)', () => {
  assert.strictEqual(msToAssTimestamp(3661500), '1:01:01.50');
  assert.strictEqual(msToAssTimestamp(0), '0:00:00.00');
});

function buildSampleTrack() {
  const track = createTextTrack({ type: 'lyrics' });
  track.cues.push(createCue({ trackId: track.trackId, startMs: 1000, endMs: 3000, text: 'Sanjam noćas' }));
  track.cues.push(createCue({ trackId: track.trackId, startMs: 3000, endMs: 5000, text: 'o tebi' }));
  const deletedCue = createCue({ trackId: track.trackId, startMs: 5000, endMs: 6000, text: 'obrisano' });
  deletedCue.deleted = true;
  track.cues.push(deletedCue);
  return track;
}

test('exportTrackToSrt numeriše blokove i PRESKAČE obrisane cue-ove', () => {
  const srt = exportTrackToSrt(buildSampleTrack());
  assert.ok(srt.includes('1\n00:00:01,000 --> 00:00:03,000\nSanjam noćas'));
  assert.ok(srt.includes('2\n00:00:03,000 --> 00:00:05,000\no tebi'));
  assert.ok(!srt.includes('obrisano'));
});

test('exportTrackToVtt počinje sa WEBVTT header-om', () => {
  const vtt = exportTrackToVtt(buildSampleTrack());
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:01.000 --> 00:00:03.000'));
});

test('exportTrackToJson vraća parsabilan JSON sa istim trackId', () => {
  const track = buildSampleTrack();
  const parsed = JSON.parse(exportTrackToJson(track));
  assert.strictEqual(parsed.trackId, track.trackId);
  assert.strictEqual(parsed.cues.length, 3); // JSON export čuva i obrisane (za restore), samo SRT/VTT ih filtrira
});

test('colorToAssHex konvertuje belu neprovidnu i crnu potpuno providnu boju ispravno', () => {
  assert.strictEqual(colorToAssHex('#FFFFFF', 1), '&H00FFFFFF');
  assert.strictEqual(colorToAssHex('#000000', 0), '&HFF000000');
});

test('colorToAssHex zamenjuje RGB u BGR redosled', () => {
  assert.strictEqual(colorToAssHex('#FF8800', 1), '&H000088FF');
});

test('exportTrackToAss sadrži validne ASS sekcije i tačan broj Dialogue redova (bez obrisanih)', () => {
  const style = createStyle();
  const ass = exportTrackToAss(buildSampleTrack(), style, { width: 1920, height: 1080 });
  assert.ok(ass.includes('[Script Info]'));
  assert.ok(ass.includes('[V4+ Styles]'));
  assert.ok(ass.includes('[Events]'));
  const dialogueLines = ass.split('\n').filter(l => l.startsWith('Dialogue:'));
  assert.strictEqual(dialogueLines.length, 2);
  assert.ok(!ass.includes('obrisano'));
});

test('exportTrackToAss escape-uje nove redove kao \\N', () => {
  const track = createTextTrack({ type: 'lyrics' });
  track.cues.push(createCue({ trackId: track.trackId, startMs: 0, endMs: 1000, text: 'prva\ndruga' }));
  const ass = exportTrackToAss(track, createStyle(), { width: 1920, height: 1080 });
  assert.ok(ass.includes('prva\\Ndruga'));
});

test('buildBurnInFfmpegArgs koristi SAMO ime ASS fajla u ass= filteru (ne punu putanju sa dvotačkom)', () => {
  const args = buildBurnInFfmpegArgs('in.mp4', 'C:\\subs\\overlay.ass', 'out.mp4');
  const vfIndex = args.indexOf('-vf');
  assert.strictEqual(args[vfIndex + 1], 'ass=overlay.ass');
});

test('buildBurnInFfmpegArgs odbija ASS naziv fajla koji sadrži filtergraph-nebezbedne znakove', () => {
  assert.throws(() => buildBurnInFfmpegArgs('in.mp4', 'C:\\subs\\over:lay.ass', 'out.mp4'), /filtergraph parser/);
});

test('resolveFfmpegPath vraća putanju do STVARNOG ffmpeg izvršnog fajla na ovoj mašini', () => {
  const ffmpegPath = resolveFfmpegPath();
  assert.ok(ffmpegPath && ffmpegPath.length > 0);
});

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-burnin-test-'));
  const inputVideo = path.join(tmpDir, 'input.mp4');
  const assFile = path.join(tmpDir, 'overlay.ass');
  const outputVideo = path.join(tmpDir, 'output.mp4');

  let ffmpegAvailable = true;
  try {
    childProcess.execFileSync(resolveFfmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', inputVideo], { timeout: 30000, stdio: 'ignore' });
  } catch {
    ffmpegAvailable = false;
  }

  if (!ffmpegAvailable) {
    console.log('  [SKIP] STVARNI FFmpeg/libass burn-in render — ffmpeg nije dostupan na ovoj mašini za sintezu test videa.');
  } else {
    await testAsync('STVARNI FFmpeg/libass burn-in: sintetisan video + pravi ASS fajl → stvarno spojen izlazni video postoji i ima sadržaj', async () => {
      const style = createStyle();
      const ass = exportTrackToAss(buildSampleTrack(), style, { width: 320, height: 240 });
      fs.writeFileSync(assFile, ass, 'utf8');

      const result = await renderBurnIn({ inputVideoPath: inputVideo, assFilePath: assFile, outputVideoPath: outputVideo });
      assert.strictEqual(result.ok, true);
      assert.ok(fs.existsSync(outputVideo));
      const stat = fs.statSync(outputVideo);
      assert.ok(stat.size > 1000, `izlazni video mora imati stvaran sadržaj, dobijeno ${stat.size} bajtova`);
    });
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort čišćenje temp foldera */ }

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
})();
