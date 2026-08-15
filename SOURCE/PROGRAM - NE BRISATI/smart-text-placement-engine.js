'use strict';

// SmartTextPlacementEngine (sekcija 5 dodatka o tekstu na videu). Predlaže poziciju teksta koja
// izbegava "protected zone" pravougaonike (lica, logotipi, postojeći UI elementi) unutar safe
// zone, i pruža clamp-ovanje za slobodno drag pozicioniranje.
//
// POŠTENO (isti obrazac kao Demucs/librosa/faster-whisper u audio pipeline-u): na ovoj mašini
// nije instalirana nijedna prava face-detection biblioteka. detectFaces() zato vraća
// supported:false i prazan niz lica umesto lažnog/mock rezultata — pravi interfejs postoji i
// testiran je za ovaj iskren fallback slučaj; stvarna detekcija lica nije testirana ovde. Kada
// korisnik ručno doda protected zonu (npr. oko lica na sceni), avoidance logika ispod radi
// identično bez obzira na to da li je zona ručna ili (u budućnosti) automatski detektovana.

const { resolveSafeZone, resolveAnchorPosition, anchorToFraction, ANCHORS } = require('./text-layout-engine');

function detectFaces(_imagePath) {
  return {
    supported: false,
    faces: [],
    reason: 'Face-detection biblioteka nije instalirana na ovoj mašini — automatska detekcija lica nije aktivna niti testirana. Dodaj protected zonu ručno ako je potrebno izbeći određenu oblast kadra.'
  };
}

function createProtectedZone({ type = 'custom', source = 'manual', left, top, right, bottom } = {}) {
  const coords = [left, top, right, bottom];
  if (!coords.every(Number.isFinite) || right <= left || bottom <= top) {
    throw new Error('createProtectedZone zahteva validne normalizovane (0-1) koordinate sa left<right i top<bottom.');
  }
  return { type, source, left, top, right, bottom };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Pretvara anchor tačku (piksel poziciju) + dimenzije teksta u normalizovan (0-1) pravougaonik,
// da bi se mogao porediti sa protected zonama koje su takođe u normalizovanim koordinatama.
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

// Redosled pokušaja kada preferirani anchor preseca protected zonu — prvo alternativna dna/vrh
// pozicija (najčešće poželjne za titlove), pa uglovi, pa centar kao poslednja opcija.
const ANCHOR_FALLBACK_ORDER = [
  'bottom-center', 'top-center', 'bottom-left', 'bottom-right',
  'top-left', 'top-right', 'center-left', 'center-right', 'center'
];

// Vraća anchor (počev od preferiranog) čiji tekst-box ne preseca nijednu protected zonu. Ako
// NIJEDAN anchor ne uspeva da izbegne sve zone, vraća onaj sa najmanje preklapanja i
// placementConfidence 0 — nikad ne baca zbog nemogućnosti izbegavanja, samo iskreno prijavljuje.
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
    if (!bestFallback || overlapping.length < bestFallback.overlapCount) {
      bestFallback = { anchor, position, rect, overlapCount: overlapping.length };
    }
  }

  return { anchor: bestFallback.anchor, position: bestFallback.position, rect: bestFallback.rect, placementConfidence: 0, protectedZonesAvoided: [] };
}

// Za slobodno drag pozicioniranje (manual mod): vraća poziciju uklještenu unutar safe zone.
// Ne primenjuje se automatski — UI poziva ovo kada korisnik pusti tekst da bi ga po želji
// "prilepio" u bezbednu oblast, ili samo prikazao upozorenje ako je wasClamped=true.
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
  detectFaces, createProtectedZone, rectsOverlap, computeTextBoxRectNormalized,
  suggestPlacement, clampManualPositionToSafeZone
};
