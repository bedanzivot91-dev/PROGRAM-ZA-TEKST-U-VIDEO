'use strict';
// Testira text-animation-engine.js — sekcija 11 dodatka (keyframes, easing, motion paths).
const assert = require('assert');
const {
  applyEasing, interpolateKeyframes, resolveMotionPathPosition, EASING_FUNCTIONS
} = require('../PROGRAM - NE BRISATI/text-animation-engine');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== TextAnimationEngine testovi ==');

test('applyEasing(linear) je identitet na krajevima i sredini', () => {
  assert.strictEqual(applyEasing('linear', 0), 0);
  assert.strictEqual(applyEasing('linear', 1), 1);
  assert.strictEqual(applyEasing('linear', 0.5), 0.5);
});

test('applyEasing klampuje t van opsega [0,1]', () => {
  assert.strictEqual(applyEasing('linear', -5), 0);
  assert.strictEqual(applyEasing('linear', 5), 1);
});

test('applyEasing baca grešku za nepoznato ime', () => {
  assert.throws(() => applyEasing('nepostojeca-kriva', 0.5), /Nepoznata easing funkcija/);
});

test('sve easing funkcije vraćaju 0 na t=0 i 1 na t=1 (standardna konvencija)', () => {
  for (const name of Object.keys(EASING_FUNCTIONS)) {
    assert.ok(Math.abs(applyEasing(name, 0) - 0) < 1e-9, `${name} na t=0`);
    assert.ok(Math.abs(applyEasing(name, 1) - 1) < 1e-9, `${name} na t=1`);
  }
});

test('interpolateKeyframes vraća prvu pozu pre prvog keyframe-a, poslednju posle poslednjeg', () => {
  const keyframes = [{ timeMs: 1000, opacity: 0, x: 0 }, { timeMs: 2000, opacity: 1, x: 100 }];
  assert.deepStrictEqual(interpolateKeyframes(keyframes, 0), { opacity: 0, x: 0 });
  assert.deepStrictEqual(interpolateKeyframes(keyframes, 5000), { opacity: 1, x: 100 });
});

test('interpolateKeyframes linearno interpoluje na sredini segmenta', () => {
  const keyframes = [{ timeMs: 0, opacity: 0, easing: 'linear' }, { timeMs: 1000, opacity: 1, easing: 'linear' }];
  const result = interpolateKeyframes(keyframes, 500);
  assert.strictEqual(result.opacity, 0.5);
});

test('interpolateKeyframes primenjuje easing zadat na ciljnom keyframe-u (easeInQuad usporava ulazak)', () => {
  const keyframes = [{ timeMs: 0, x: 0 }, { timeMs: 1000, x: 100, easing: 'easeInQuad' }];
  const result = interpolateKeyframes(keyframes, 500); // t=0.5, easeInQuad(0.5)=0.25
  assert.strictEqual(result.x, 25);
});

test('interpolateKeyframes radi sa 3+ keyframe-a i bira ispravan segment', () => {
  const keyframes = [{ timeMs: 0, x: 0 }, { timeMs: 500, x: 50 }, { timeMs: 1000, x: 200 }];
  assert.strictEqual(interpolateKeyframes(keyframes, 250).x, 25);
  assert.strictEqual(interpolateKeyframes(keyframes, 750).x, 125);
});

test('interpolateKeyframes ignoriše redosled ulaza (interno sortira po timeMs)', () => {
  const keyframes = [{ timeMs: 1000, x: 100 }, { timeMs: 0, x: 0 }];
  assert.strictEqual(interpolateKeyframes(keyframes, 500).x, 50);
});

test('interpolateKeyframes baca grešku za prazan niz', () => {
  assert.throws(() => interpolateKeyframes([], 100), /bar jedan keyframe/);
});

test('resolveMotionPathPosition (line) linearno kreće od "from" ka "to"', () => {
  const path = { type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 200 } };
  assert.deepStrictEqual(resolveMotionPathPosition(path, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(resolveMotionPathPosition(path, 1), { x: 100, y: 200 });
  assert.deepStrictEqual(resolveMotionPathPosition(path, 0.5), { x: 50, y: 100 });
});

test('resolveMotionPathPosition (bezier, kvadratna 3 tačke) prolazi kroz start i kraj', () => {
  const path = { type: 'bezier', points: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }] };
  const start = resolveMotionPathPosition(path, 0);
  const end = resolveMotionPathPosition(path, 1);
  assert.deepStrictEqual(start, { x: 0, y: 0 });
  assert.deepStrictEqual(end, { x: 100, y: 0 });
});

test('resolveMotionPathPosition (bezier, kubna 4 tačke) prolazi kroz start i kraj', () => {
  const path = { type: 'bezier', points: [{ x: 0, y: 0 }, { x: 30, y: 90 }, { x: 70, y: 90 }, { x: 100, y: 0 }] };
  assert.deepStrictEqual(resolveMotionPathPosition(path, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(resolveMotionPathPosition(path, 1), { x: 100, y: 0 });
});

test('resolveMotionPathPosition (bezier) baca grešku za pogrešan broj kontrolnih tačaka', () => {
  const path = { type: 'bezier', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
  assert.throws(() => resolveMotionPathPosition(path, 0.5), /3 \(kvadratna\) ili 4 \(kubna\)/);
});

test('resolveMotionPathPosition (arc) računa poziciju na luku oko centra', () => {
  const path = { type: 'arc', center: { x: 0, y: 0 }, radius: 10, startAngleDeg: 0, endAngleDeg: 90 };
  const start = resolveMotionPathPosition(path, 0);
  const end = resolveMotionPathPosition(path, 1);
  assert.ok(Math.abs(start.x - 10) < 1e-9 && Math.abs(start.y - 0) < 1e-9);
  assert.ok(Math.abs(end.x - 0) < 1e-9 && Math.abs(end.y - 10) < 1e-9);
});

test('resolveMotionPathPosition baca grešku za nepoznat tip putanje', () => {
  assert.throws(() => resolveMotionPathPosition({ type: 'spirala' }, 0.5), /Nepoznat tip motion path-a/);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
