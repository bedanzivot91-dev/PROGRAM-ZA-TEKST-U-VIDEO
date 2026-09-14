'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { createTextTrack, createCue, createStyle } = require('../PROGRAM - NE BRISATI/text-overlay-models');
const {
  msToSrtTimestamp, msToVttTimestamp, msToAssTimestamp, exportTrackToSrt, exportTrackToVtt,
  exportTrackToAss, exportTrackToJson, colorToAssHex, buildBurnInFfmpegArgs,
  resolveFfmpegPath, renderBurnIn, sampledAnimatedEvents
} = require('../PROGRAM - NE BRISATI/text-overlay-export');

let pass = 0;
let fail = 0;
function test(label, fn) { try { fn(); pass += 1; console.log(`  [OK] ${label}`); } catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); } }
async function testAsync(label, fn) { try { await fn(); pass += 1; console.log(`  [OK] ${label}`); } catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); } }

console.log('== TextOverlayExport testovi ==');

test('msToSrtTimestamp formatira ispravno', () => {
  assert.strictEqual(msToSrtTimestamp(0), '00:00:00,000');
  assert.strictEqual(msToSrtTimestamp(3661500), '01:01:01,500');
});
test('msToVttTimestamp formatira ispravno', () => assert.strictEqual(msToVttTimestamp(3661500), '01:01:01.500'));
test('msToAssTimestamp koristi centisekunde', () => {
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

test('SRT numeriše i preskače obrisane cue-ove', () => {
  const srt = exportTrackToSrt(buildSampleTrack());
  assert.ok(srt.includes('1\n00:00:01,000 --> 00:00:03,000\nSanjam noćas'));
  assert.ok(srt.includes('2\n00:00:03,000 --> 00:00:05,000\no tebi'));
  assert.ok(!srt.includes('obrisano'));
});
test('VTT ima WEBVTT header', () => assert.ok(exportTrackToVtt(buildSampleTrack()).startsWith('WEBVTT\n\n')));
test('JSON čuva track', () => {
  const track = buildSampleTrack();
  assert.strictEqual(JSON.parse(exportTrackToJson(track)).trackId, track.trackId);
});
test('ASS boje rade', () => {
  assert.strictEqual(colorToAssHex('#FFFFFF', 1), '&H00FFFFFF');
  assert.strictEqual(colorToAssHex('#000000', 0), '&HFF000000');
  assert.strictEqual(colorToAssHex('#FF8800', 1), '&H000088FF');
});
test('ASS statični track ima tačan broj događaja', () => {
  const ass = exportTrackToAss(buildSampleTrack(), createStyle(), { width: 1920, height: 1080 });
  assert.ok(ass.includes('[Script Info]') && ass.includes('[Events]'));
  assert.strictEqual(ass.split('\n').filter(l => l.startsWith('Dialogue:')).length, 2);
  assert.ok(!ass.includes('obrisano'));
});
test('ASS escape novih redova', () => {
  const track = createTextTrack({ type: 'lyrics' });
  track.cues.push(createCue({ trackId: track.trackId, startMs: 0, endMs: 1000, text: 'prva\ndruga' }));
  assert.ok(exportTrackToAss(track, createStyle(), { width:1920, height:1080 }).includes('prva\\Ndruga'));
});

test('ANIMIRANI tekst se prevodi u više ASS događaja sa pos/alpha/scale tagovima', () => {
  const track = createTextTrack({ type:'lyrics' });
  const cue = createCue({ trackId:track.trackId, startMs:0, endMs:1000, text:'Animacija' });
  cue.animation = {
    sampleMs: 200,
    keyframes: [
      { timeMs:0, x:0.2, y:0.8, opacity:0, scale:0.8, rotation:-5 },
      { timeMs:1000, x:0.8, y:0.8, opacity:1, scale:1.1, rotation:5, easing:'linear' }
    ]
  };
  track.cues.push(cue);
  const sampled = sampledAnimatedEvents(cue, { width:1000, height:500 });
  assert.strictEqual(sampled.length, 5);
  assert.ok(sampled[0].includes('\\pos(200,400)'));
  assert.ok(sampled[0].includes('\\alpha&HFF&'));
  assert.ok(sampled[0].includes('\\fscx80'));
  const ass = exportTrackToAss(track, createStyle(), { width:1000, height:500 });
  assert.strictEqual(ass.split('\n').filter(l => l.startsWith('Dialogue:')).length, 5);
});

test('motion path animacija koristi putanju', () => {
  const cue = { startMs:0, endMs:500, text:'Putanja', animation:{ sampleMs:250, keyframes:[{timeMs:0,opacity:1},{timeMs:500,opacity:1}], motionPath:{type:'line',from:{x:0.1,y:0.2},to:{x:0.9,y:0.8}} } };
  const sampled = sampledAnimatedEvents(cue, { width:1000, height:500 });
  assert.ok(sampled[0].includes('\\pos(100,100)'));
  assert.ok(sampled[1].includes('\\pos(500,250)'));
});

test('FFmpeg args koriste samo ime ASS fajla', () => {
  const args = buildBurnInFfmpegArgs('in.mp4', 'C:\\subs\\overlay.ass', 'out.mp4');
  assert.strictEqual(args[args.indexOf('-vf') + 1], 'ass=overlay.ass');
});
test('FFmpeg args odbijaju nebezbedan naziv', () => assert.throws(() => buildBurnInFfmpegArgs('in.mp4', 'C:\\subs\\over:lay.ass', 'out.mp4'), /filtergraph parser/));
test('resolveFfmpegPath vraća vrednost', () => assert.ok(resolveFfmpegPath().length > 0));

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-burnin-test-'));
  const inputVideo = path.join(tmpDir, 'input.mp4');
  const assFile = path.join(tmpDir, 'overlay.ass');
  const outputVideo = path.join(tmpDir, 'output.mp4');
  let ffmpegAvailable = true;
  try {
    childProcess.execFileSync(resolveFfmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', inputVideo], { timeout:30000, stdio:'ignore' });
  } catch { ffmpegAvailable = false; }
  if (!ffmpegAvailable) {
    console.log('  [SKIP] STVARNI FFmpeg/libass burn-in — ffmpeg nije dostupan.');
  } else {
    await testAsync('STVARNI FFmpeg/libass burn-in pravi izlazni video', async () => {
      fs.writeFileSync(assFile, exportTrackToAss(buildSampleTrack(), createStyle(), { width:320, height:240 }), 'utf8');
      const result = await renderBurnIn({ inputVideoPath:inputVideo, assFilePath:assFile, outputVideoPath:outputVideo });
      assert.strictEqual(result.ok, true);
      assert.ok(fs.existsSync(outputVideo));
      assert.ok(fs.statSync(outputVideo).size > 1000);
    });
  }
  try { fs.rmSync(tmpDir, { recursive:true, force:true }); } catch {}
  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
})();
