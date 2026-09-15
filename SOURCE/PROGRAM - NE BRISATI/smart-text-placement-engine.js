'use strict';

// SmartTextPlacementEngine: predlaže poziciju teksta koja izbegava lica/logotipe i podržava
// stvarnu automatsku detekciju lica kada je lokalni OpenCV dostupan. Kada nije instaliran,
// funkcija iskreno vraća supported:false i ostatak programa nastavlja sa ručnim protected zonama.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { resolveSafeZone, resolveAnchorPosition, anchorToFraction, ANCHORS } = require('./text-layout-engine');

const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(__dirname, 'data');
const OPENCV_VENV_PYTHON = path.join(DATA_DIR, 'runtime', 'opencv-face', 'venv', 'Scripts', 'python.exe');

const OPENCV_FACE_SCRIPT = String.raw`
import json, os, sys
try:
    import cv2
except Exception as exc:
    print(json.dumps({"ok": False, "reason": "opencv_not_installed", "detail": str(exc)}))
    raise SystemExit(0)
path = sys.argv[1]
image = cv2.imread(path)
if image is None:
    print(json.dumps({"ok": False, "reason": "image_unreadable"}))
    raise SystemExit(0)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
cascade = cv2.CascadeClassifier(cascade_path)
if cascade.empty():
    print(json.dumps({"ok": False, "reason": "cascade_unavailable"}))
    raise SystemExit(0)
rects = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
h, w = image.shape[:2]
faces = []
for (x, y, fw, fh) in rects:
    faces.append({
        "type": "face",
        "source": "opencv-haar",
        "left": max(0.0, float(x) / float(w)),
        "top": max(0.0, float(y) / float(h)),
        "right": min(1.0, float(x + fw) / float(w)),
        "bottom": min(1.0, float(y + fh) / float(h))
    })
print(json.dumps({"ok": True, "width": int(w), "height": int(h), "faces": faces}))
`;

function parseLastJsonLine(output) {
  const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

function pythonCandidates() {
  const candidates = [];
  if (process.platform === 'win32' && fs.existsSync(OPENCV_VENV_PYTHON)) candidates.push({ command: OPENCV_VENV_PYTHON, prefix: [] });
  if (process.platform === 'win32') {
    candidates.push({ command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] }, { command: 'python3', prefix: [] });
  } else {
    candidates.push({ command: 'python3', prefix: [] }, { command: 'python', prefix: [] });
  }
  return candidates;
}

function runOpenCvFaceDetection(imagePath, { execFileSync = childProcess.execFileSync, timeoutMs = 15000 } = {}) {
  let lastReason = 'python_or_opencv_not_available';
  for (const candidate of pythonCandidates()) {
    try {
      const stdout = execFileSync(candidate.command, [...candidate.prefix, '-c', OPENCV_FACE_SCRIPT, imagePath], {
        encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      const parsed = parseLastJsonLine(stdout);
      if (!parsed) { lastReason = 'invalid_detector_output'; continue; }
      if (parsed.ok) return { supported: true, faces: Array.isArray(parsed.faces) ? parsed.faces : [], detector: 'opencv-haar', width: parsed.width, height: parsed.height };
      lastReason = parsed.reason || lastReason;
      if (parsed.reason === 'image_unreadable') return { supported: true, faces: [], detector: 'opencv-haar', reason: 'Slika ne može da se pročita.' };
    } catch (error) {
      lastReason = error?.code === 'ENOENT' ? 'python_not_installed' : 'opencv_not_available';
    }
  }
  return {
    supported: false,
    faces: [],
    reason: `Automatska detekcija lica nije dostupna (${lastReason}). Instaliraj alat OpenCV (detekcija lica) u panelu LOKALNI ALATI ili dodaj protected zonu ručno.`
  };
}

function detectFaces(imagePath, options = {}) {
  const resolved = String(imagePath || '').trim();
  if (!resolved || !fs.existsSync(resolved)) {
    return { supported: false, faces: [], reason: 'Slika za detekciju lica ne postoji ili putanja nije validna.' };
  }
  return runOpenCvFaceDetection(resolved, options);
}

function createProtectedZone({ type = 'custom', source = 'manual', left, top, right, bottom } = {}) {
  const coords = [left, top, right, bottom];
  if (!coords.every(Number.isFinite) || right <= left || bottom <= top || left < 0 || top < 0 || right > 1 || bottom > 1) {
    throw new Error('createProtectedZone zahteva validne normalizovane (0-1) koordinate sa left<right i top<bottom.');
  }
  return { type, source, left, top, right, bottom };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function computeTextBoxRectNormalized(position, widthPx, heightPx, anchor, video) {
  const { xFrac, yFrac } = anchorToFraction(anchor);
  const leftPx = position.xPx - xFrac * widthPx;
  const topPx = position.yPx - yFrac * heightPx;
  return {
    left: leftPx / video.width,
    top: topPx / video.height,
    right: (leftPx + widthPx) / video.width,
    bottom: (topPx + heightPx) / video.height
  };
}

const ANCHOR_FALLBACK_ORDER = [
  'bottom-center', 'top-center', 'bottom-left', 'bottom-right',
  'top-left', 'top-right', 'center-left', 'center-right', 'center'
];

function suggestPlacement({ preferredAnchor = 'bottom-center', protectedZones = [], widthPx, heightPx, video, aspectRatio } = {}) {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new Error('suggestPlacement zahteva pozitivne widthPx i heightPx (dimenzije tekst-bloka).');
  }
  if (!video || !video.width || !video.height) throw new Error('suggestPlacement zahteva video { width, height }.');
  if (!ANCHORS.has(preferredAnchor)) throw new Error(`Nepoznat preferredAnchor: "${preferredAnchor}".`);

  const safeZone = resolveSafeZone(aspectRatio);
  const candidateAnchors = [preferredAnchor, ...ANCHOR_FALLBACK_ORDER.filter(a => a !== preferredAnchor)];
  let bestFallback = null;
  for (const anchor of candidateAnchors) {
    const position = resolveAnchorPosition({ placementMode: 'preset', anchor }, safeZone, video);
    const rect = computeTextBoxRectNormalized(position, widthPx, heightPx, anchor, video);
    const overlapping = protectedZones.filter(zone => rectsOverlap(rect, zone));
    if (overlapping.length === 0) {
      return { anchor, position, rect, placementConfidence: 1, protectedZonesAvoided: protectedZones.map(z => z.type) };
    }
    if (!bestFallback || overlapping.length < bestFallback.overlapCount) bestFallback = { anchor, position, rect, overlapCount: overlapping.length };
  }
  return { anchor: bestFallback.anchor, position: bestFallback.position, rect: bestFallback.rect, placementConfidence: 0, protectedZonesAvoided: [] };
}

function clampManualPositionToSafeZone(x, y, aspectRatio) {
  const safeZone = resolveSafeZone(aspectRatio);
  const minX = safeZone.left;
  const maxX = 1 - safeZone.right;
  const minY = safeZone.top;
  const maxY = 1 - safeZone.bottom;
  const clampedX = Math.min(maxX, Math.max(minX, x));
  const clampedY = Math.min(maxY, Math.max(minY, y));
  return { x: clampedX, y: clampedY, wasClamped: clampedX !== x || clampedY !== y };
}

module.exports = {
  detectFaces, runOpenCvFaceDetection, parseLastJsonLine,
  createProtectedZone, rectsOverlap, computeTextBoxRectNormalized,
  suggestPlacement, clampManualPositionToSafeZone
};
