# TextAnimationEngine

`PROGRAM - NE BRISATI/text-animation-engine.js` — keyframe interpolacija, motion path i easing
krive za animirani tekst. Isti model računice mora koristiti i preview i finalni render (vidi
napomenu u `text-layout-engine.js`) da se izbegne razmimoilaženje "šta vidiš" / "šta dobiješ".

## Easing krive

`linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`,
`easeInOutCubic`, `easeOutBack`. Sve vraćaju 0 na t=0 i 1 na t=1 (standardna konvencija);
`applyEasing()` klampuje ulaz na `[0,1]` i baca grešku za nepoznato ime.

## Keyframe interpolacija

```js
const { interpolateKeyframes } = require('./text-animation-engine');

interpolateKeyframes([
  { timeMs: 0,    opacity: 0, scale: 0.8 },
  { timeMs: 500,  opacity: 1, scale: 1, easing: 'easeOutBack' }
], currentMs);
// → { opacity, scale } interpolirano; easing na CILJNOM keyframe-u opisuje ulaz u njega
```

Van opsega keyframe-ova vraća krajnje vrednosti (drži poslednju/prvu pozu), ne ekstrapolira.
Interno sortira po `timeMs`, pa redosled unosa nije bitan.

## Motion path (linija / bezier / luk)

```js
const { resolveMotionPathPosition } = require('./text-animation-engine');

resolveMotionPathPosition({ type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 200 } }, t);
resolveMotionPathPosition({ type: 'bezier', points: [p0, p1, p2] }, t);       // kvadratna, 3 tačke
resolveMotionPathPosition({ type: 'bezier', points: [p0, p1, p2, p3] }, t);   // kubna, 4 tačke
resolveMotionPathPosition({ type: 'arc', center, radius, startAngleDeg, endAngleDeg }, t);
```

`t` je normalizovan progres 0–1 DUŽ putanje — pozicija na putanji i tempo kretanja su namerno
razdvojeni; pozivalac po potrebi prethodno primeni easing na `t` pre poziva.

## Status povezivanja sa render pipeline-om

**Nije još povezano u FFmpeg/libass burn-in** (`text-overlay-export.js`) — ASS format ne
podržava proizvoljne keyframe animacije kroz ovaj jednostavan burn-in put. Napredne animacije
zahtevaju RGBA overlay kompoziciju (frame-by-frame render preko celog videa), što je van
dometa trenutne faze i ostaje kao poznato ograničenje.
