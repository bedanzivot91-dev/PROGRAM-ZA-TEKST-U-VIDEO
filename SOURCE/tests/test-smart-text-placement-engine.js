'use strict';
// Testira smart-text-placement-engine.js — protected-zone avoidance, safe-zone drag i
// stvarni OpenCV provider put (uz kontrolisan exec runner da test ne zavisi od toga da li CI ima cv2).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  detectFaces, runOpenCvFaceDetection, parseLastJsonLine,
  createProtectedZone, rectsOverlap, suggestPlacement, clampManualPositionToSafeZone
} = require('../PROGRAM - NE BRISATI/smart-text-placement-engine');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== SmartTextPlacementEngine testovi ==');

test('detectFaces za nepostojeću sliku vraća jasan fallback umesto rušenja', () => {
  const result = detectFaces('/putanja/do/slike-koja-ne-postoji.png');
  assert.strictEqual(result.supported, false);
  assert.deepStrictEqual(result.faces, []);
  assert.ok(result.reason.length > 0);
});

test('parseLastJsonLine pronalazi JSON i kada alat ispiše dodatni tekst', () => {
  const parsed = parseLastJsonLine('warning\n{"ok":true,"faces":[]}\n');
  assert.strictEqual(parsed.ok, true);
});

test('runOpenCvFaceDetection prihvata stvaran detector rezultat i normalizovane face zone', () => {
  const fakeExec = () => JSON.stringify({ ok:true, width:1000, height:500, faces:[{ type:'face', source:'opencv-haar', left:0.1, top:0.2, right:0.4, bottom:0.8 }] });
  const result = runOpenCvFaceDetection('C:\\test\\face.jpg', { execFileSync: fakeExec });
  assert.strictEqual(result.supported, true);
  assert.strictEqual(result.detector, 'opencv-haar');
  assert.strictEqual(result.faces.length, 1);
  assert.strictEqual(result.faces[0].left, 0.1);
});

test('detectFaces koristi OpenCV put kada slika postoji i provider uspe', () => {
  const temp = path.join(os.tmpdir(), `mss-face-${process.pid}-${Date.now()}.jpg`);
  fs.writeFileSync(temp, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  try {
    const fakeExec = () => JSON.stringify({ ok:true, width:640, height:480, faces:[] });
    const result = detectFaces(temp, { execFileSync: fakeExec });
    assert.strictEqual(result.supported, true);
    assert.deepStrictEqual(result.faces, []);
  } finally { try { fs.unlinkSync(temp); } catch {} }
});

test('createProtectedZone odbija neispravne koordinate (right<=left)', () => {
  assert.throws(() => createProtectedZone({ left: 0.5, top: 0.1, right: 0.4, bottom: 0.3 }), /left<right/);
});

test('createProtectedZone odbija koordinate van normalizovanog 0-1 opsega', () => {
  assert.throws(() => createProtectedZone({ left: -0.1, top: 0.1, right: 0.4, bottom: 0.3 }), /normalizovane/);
  assert.throws(() => createProtectedZone({ left: 0.1, top: 0.1, right: 1.2, bottom: 0.3 }), /normalizovane/);
});

test('createProtectedZone pravi validnu zonu', () => {
  const zone = createProtectedZone({ type: 'face', source: 'manual', left: 0.3, top: 0.1, right: 0.7, bottom: 0.5 });
  assert.strictEqual(zone.type, 'face');
});

test('rectsOverlap prepoznaje preklapanje i odsustvo preklapanja', () => {
  const a = { left: 0, top: 0, right: 0.5, bottom: 0.5 };
  const b = { left: 0.4, top: 0.4, right: 0.9, bottom: 0.9 };
  const c = { left: 0.6, top: 0.6, right: 0.9, bottom: 0.9 };
  assert.strictEqual(rectsOverlap(a, b), true);
  assert.strictEqual(rectsOverlap(a, c), false);
});

test('suggestPlacement vraća preferirani anchor sa confidence=1 kada nema protected zona', () => {
  const result = suggestPlacement({ preferredAnchor: 'bottom-center', protectedZones: [], widthPx: 400, heightPx: 80, video: { width: 1920, height: 1080 } });
  assert.strictEqual(result.anchor, 'bottom-center');
  assert.strictEqual(result.placementConfidence, 1);
});

test('suggestPlacement bira ALTERNATIVNI anchor kada preferirani preseca protected zonu', () => {
  const faceZone = createProtectedZone({ type: 'face', left: 0.3, top: 0.75, right: 0.7, bottom: 1.0 });
  const result = suggestPlacement({
    preferredAnchor: 'bottom-center', protectedZones: [faceZone],
    widthPx: 400, heightPx: 80, video: { width: 1920, height: 1080 }
  });
  assert.notStrictEqual(result.anchor, 'bottom-center');
  assert.strictEqual(result.placementConfidence, 1);
});

test('suggestPlacement vraća placementConfidence=0 kada nijedan anchor ne izbegava sve zone', () => {
  const hugeZone = createProtectedZone({ type: 'custom', left: 0, top: 0, right: 1, bottom: 1 });
  const result = suggestPlacement({
    preferredAnchor: 'bottom-center', protectedZones: [hugeZone],
    widthPx: 400, heightPx: 80, video: { width: 1920, height: 1080 }
  });
  assert.strictEqual(result.placementConfidence, 0);
  assert.deepStrictEqual(result.protectedZonesAvoided, []);
});

test('suggestPlacement odbija nepoznat anchor i nevalidne dimenzije', () => {
  assert.throws(() => suggestPlacement({ preferredAnchor: 'negde', widthPx: 10, heightPx: 10, video: { width: 100, height: 100 } }), /Nepoznat preferredAnchor/);
  assert.throws(() => suggestPlacement({ widthPx: 0, heightPx: 10, video: { width: 100, height: 100 } }), /pozitivne/);
});

test('clampManualPositionToSafeZone vraća istu poziciju kada je već unutar safe zone', () => {
  const result = clampManualPositionToSafeZone(0.5, 0.5, '16:9');
  assert.strictEqual(result.wasClamped, false);
});

test('clampManualPositionToSafeZone uklješti poziciju izvan safe zone', () => {
  const result = clampManualPositionToSafeZone(0.0, 0.0, '9:16');
  assert.strictEqual(result.wasClamped, true);
  assert.ok(result.x > 0 && result.y > 0);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
