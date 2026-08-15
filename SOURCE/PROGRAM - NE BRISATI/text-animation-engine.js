'use strict';

// TextAnimationEngine (sekcija 11 dodatka o tekstu na videu). Čist, testabilan modul za
// keyframe interpolaciju, easing funkcije i pozicioniranje duž motion path-a (linija/bezier/luk).
// Isti izlaz koristi i preview (Canvas/DOM animacija) i finalni render (FAZA 9), po istom
// pravilu kao TextLayoutEngine — jedan model računice, ne dve implementacije koje mogu da se razminu.

const EASING_FUNCTIONS = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutBack: t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
};

function applyEasing(name, tRaw) {
  const fn = EASING_FUNCTIONS[name];
  if (!fn) throw new Error(`Nepoznata easing funkcija: "${name}". Dozvoljeno: ${Object.keys(EASING_FUNCTIONS).join(', ')}.`);
  const t = Math.min(1, Math.max(0, tRaw));
  return fn(t);
}

const RESERVED_KEYFRAME_KEYS = new Set(['timeMs', 'easing']);

function extractNumericProperties(keyframe) {
  const props = {};
  for (const [key, value] of Object.entries(keyframe)) {
    if (!RESERVED_KEYFRAME_KEYS.has(key) && typeof value === 'number') props[key] = value;
  }
  return props;
}

function interpolateProperties(k1, k2, t) {
  const keys = new Set([...Object.keys(k1), ...Object.keys(k2)].filter(k => !RESERVED_KEYFRAME_KEYS.has(k)));
  const props = {};
  for (const key of keys) {
    const v1 = typeof k1[key] === 'number' ? k1[key] : k2[key];
    const v2 = typeof k2[key] === 'number' ? k2[key] : k1[key];
    if (typeof v1 !== 'number' || typeof v2 !== 'number') continue;
    props[key] = v1 + (v2 - v1) * t;
  }
  return props;
}

// Interpoluje sva numerička svojstva (opacity, scale, x, y, rotation, ...) između keyframe-ova
// za dati trenutak. easing zadat na CILJNOM (kasnijem) keyframe-u opisuje krivu ULASKA u njega —
// uobičajena konvencija u alatima za animaciju. Van opsega keyframe-ova vraća krajnje vrednosti
// (drži poslednju/prvu pozu), ne ekstrapolira.
function interpolateKeyframes(keyframes, currentMs) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw new Error('interpolateKeyframes zahteva bar jedan keyframe.');
  }
  const sorted = [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
  if (currentMs <= sorted[0].timeMs) return extractNumericProperties(sorted[0]);
  const last = sorted[sorted.length - 1];
  if (currentMs >= last.timeMs) return extractNumericProperties(last);

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (currentMs >= k1.timeMs && currentMs <= k2.timeMs) {
      const span = k2.timeMs - k1.timeMs;
      const rawT = span <= 0 ? 1 : (currentMs - k1.timeMs) / span;
      const easedT = applyEasing(k2.easing || 'linear', rawT);
      return interpolateProperties(k1, k2, easedT);
    }
  }
  return extractNumericProperties(last);
}

// --- Motion paths (sekcija 11: "line, bezier, arc") ---
// t je normalizovan progres 0-1 DUŽ PUTANJE (pozivalac po potrebi prethodno primeni easing na t
// pre poziva ovih funkcija — pozicija na putanji i tempo kretanja su namerno razdvojeni).

function positionOnLinePath(path, t) {
  const { from, to } = path;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function positionOnBezierPath(path, t) {
  const points = path.points;
  if (points.length === 3) {
    const [p0, p1, p2] = points;
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  }
  if (points.length === 4) {
    const [p0, p1, p2, p3] = points;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  }
  throw new Error('Bezier putanja zahteva tačno 3 (kvadratna) ili 4 (kubna) kontrolne tačke.');
}

function positionOnArcPath(path, t) {
  const { center, radius, startAngleDeg, endAngleDeg } = path;
  const angleDeg = startAngleDeg + (endAngleDeg - startAngleDeg) * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: center.x + radius * Math.cos(angleRad), y: center.y + radius * Math.sin(angleRad) };
}

const MOTION_PATH_RESOLVERS = { line: positionOnLinePath, bezier: positionOnBezierPath, arc: positionOnArcPath };

function resolveMotionPathPosition(path, t) {
  const resolver = MOTION_PATH_RESOLVERS[path.type];
  if (!resolver) throw new Error(`Nepoznat tip motion path-a: "${path.type}". Dozvoljeno: ${Object.keys(MOTION_PATH_RESOLVERS).join(', ')}.`);
  return resolver(path, Math.min(1, Math.max(0, t)));
}

module.exports = {
  EASING_FUNCTIONS, applyEasing, interpolateKeyframes, resolveMotionPathPosition,
  positionOnLinePath, positionOnBezierPath, positionOnArcPath
};
