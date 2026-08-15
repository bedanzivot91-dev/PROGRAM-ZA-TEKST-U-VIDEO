# CHANGELOG — Muzički Spot Studio Free v15.6.0

Ova verzija dodaje kompletan **"Tekst pesme na videu / Lyrics Overlay Studio"** modul — dodatak
originalnom v15.5 master promptu (31 sekcija specifikacije), izgrađen faza-po-fazu (FAZA 1–11
dodatka) preko realnog koda, realnih testova (146 novih test-slučajeva u 11 test-datoteka) i
realnih git commit-ova. Pun istorijat je u `git log` — svaki commit odgovara jednoj proverenoj,
testiranoj celini.

**Osnovno pravilo modula, poštovano u svakom delu implementacije:** tekst je nezavisan,
naknadno izmenjiv sloj. NIKAD nije ugrađen u image/video generacione promptove. Spot generisan
bez teksta ostaje potpuno upotrebljiv; tekst se dodaje, menja ili u potpunosti uklanja bez
regenerisanja bilo koje scene.

## FAZA 1 — Word-level timing u alignment engine-u

- `lyrics-alignment.js`: `alignLyrics()` sada vraća `words: [{text, startMs, endMs, confidence}]`
  po liniji — proširenje postojeće DP/LCS logike koja je vremena po reči već interno računala,
  samo ih nije izlagala. Ovo direktno omogućava karaoke mod (FAZA 6).

## FAZA 2 — Data modeli

- `text-overlay-models.js`: `createTextTrack`/`createCue`/`validateCue`/`validateTrack`/
  `createStyle`. 7 tipova track-a (lyrics/translation/title/artist/section/custom/credits),
  soft-delete polja na cue-u (`deleted`/`deletedAt`), pun Style oblik (tipografija/boja/karaoke/
  outline/senka/glow/pozadina/transformacija).

## FAZA 3 — FontManager

- `font-manager.js`: stvaran binarni TTF/OTF/TTC parser (sfnt/name/cmap tabele), provera
  glifova za svih 10 srpskih latiničnih dijakritika. Dva stvarna bug-a pronađena i ispravljena
  tokom testiranja protiv pravih fontova sa ove mašine: cmap format-4 `idRangeOffset` presence
  check, i `Buffer.subarray()`/`swap16()` in-place mutation korupcija kod deduplikovanih
  name-table stringova (Arial font). Detalji: `docs/FONT_MANAGER.md`.

## FAZA 4 — TextLayoutEngine + LyricsLineBreaker

- `lyrics-line-breaker.js`: greedy word-wrap koji NIKAD ne deli reč (prelama samo na razmaku),
  procena čitljivosti (characters/sec, words/min, minimalno trajanje prikaza).
- `text-layout-engine.js`: font veličina (%/px), safe zone po formatu (16:9/9:16/1:1 — različite
  margine jer 9:16 ima UI preko celog dna), anchor pozicioniranje (9 preseta + slobodan drag).

## FAZA 5 — SmartTextPlacementEngine

- `smart-text-placement-engine.js`: izbegavanje "protected zone" pravougaonika (lice/logo) biranjem
  alternativnog anchor-a; `clampManualPositionToSafeZone()` za drag pozicioniranje.
  `detectFaces()` iskreno vraća `supported:false` — nema instalirane face-detection biblioteke
  na ovoj mašini (isti obrazac iskrenog fallback-a kao Demucs/librosa u audio pipeline-u).

## FAZA 6 — KaraokeEngine

- `karaoke-engine.js`: word-by-word highlight (pending/active/completed stanja, progres unutar
  reči), multi-track kombinovanje (npr. original + prevod istovremeno, poređano po zIndex-u).
  Iskren fallback na ravnomerno raspoređen timing (`wordTimingSource:'estimated'`) kada nema
  pravog ASR word-level timing-a.

## FAZA 7 — TextAnimationEngine

- `text-animation-engine.js`: keyframe interpolacija (generička, radi sa bilo kojim numeričkim
  svojstvima), 8 easing krivih, motion path (linija/kvadratna i kubna bezier/luk).

## FAZA 8 — TextStylePresetManager

- `text-style-presets.js`: 15 imenovanih gotovih stilova (Karaoke Classic, Minimal Discreet,
  Bold Impact, Neon Glow, Elegant Serif, Cinematic Subtitle, Large Animated, Retro VHS,
  Handwritten, Typewriter, Gradient Pop, Outline Only, Boxed Caption, Dual Language, Credits
  End Card).

## FAZA 9 — Export i FFmpeg/libass burn-in render

- `text-overlay-export.js`: SRT/VTT/ASS/JSON export. **Stvaran bug pronađen i ispravljen** tokom
  testiranja protiv prave FFmpeg 8.1.2/libass instalacije: uobičajen Windows colon-escaping
  savet za `ass=` filter nije pouzdano radio; rešenje je pokretanje FFmpeg-a sa `cwd` u folderu
  ASS fajla i prosleđivanje samo imena fajla. Potvrđeno end-to-end testom (sintetisan video →
  pravi ASS → stvaran burn-in). Detalji: `docs/SUBTITLE_EXPORT.md`.

## FAZA 10 — Storage/API wiring

- `lyrics-overlay-storage.js`: `project.json.lyricsOverlay` mali referentni blok +
  `projects/PROJECT_ID/lyrics/overlay-tracks.json` puni podaci. CRUD za track-ove/cue-ove sa
  validacijom pre upisa, backup pre brisanja track-a.
- `server.js`: 12 novih REST ruta (`/api/text-presets`, `/api/fonts`,
  `/api/audio-projects/:id/lyrics-overlay/*`). **Stvaran route-collision bug pronađen i
  ispravljen**: postojeća opšta `GET .../export` ruta je hvatala i nove
  `.../lyrics-overlay/export` zahteve pre specifičnije rute — ispravljeno proverom dužine
  putanje. Potvrđeno preko 19 HTTP integracionih testova protiv pravog spawn-ovanog servera.

## FAZA 11 — Testovi, dokumentacija, verzija

- 146 novih test-slučajeva kroz 11 test-datoteka (`test-lyrics-line-breaker.js`,
  `test-text-layout-engine.js`, `test-smart-text-placement-engine.js`, `test-karaoke-engine.js`,
  `test-text-animation-engine.js`, `test-text-style-presets.js`, `test-text-overlay-export.js`,
  `test-lyrics-overlay-storage.js`, `test-lyrics-overlay-api.js`, plus prošireni
  `test-font-manager.js`/`test-text-overlay-models.js`) — svi uključeni u `npm test` (44 test-
  paketa ukupno u celom projektu, 0 padova).
- Dokumentacija: `docs/TEXT_OVERLAY.md`, `docs/FONT_MANAGER.md`, `docs/KARAOKE_MODE.md`,
  `docs/TEXT_ANIMATIONS.md`, `docs/SUBTITLE_EXPORT.md`, `docs/FONT_LICENSES.md`,
  `docs/TROUBLESHOOTING_TEXT_RENDER.md`.
- Verzija program/ekstenzije podignuta na 15.6.0 (`server.js`, `launcher.js`, `manifest.json`,
  `service-worker.js`, `chatgpt-bridge.js`, `desktop/*.js`, `package.json`) — sinhronizovano i
  proverom u `test-static.js`.

## POZNATA OGRANIČENJA (iskreno, ne prikriveno)

- **UI editor nije povezan.** Ceo backend (10 modula + 12 REST ruta) je izgrađen i testiran
  preko HTTP-a, ali `public/app.js` još nema vizuelni editor (drag pozicioniranje, timeline,
  karaoke pregled uživo, upravljanje track-ovima). To je sledeći korak.
- **Face-detection nije prava.** `SmartTextPlacementEngine.detectFaces()` vraća `supported:false`
  — nijedna face-detection biblioteka nije instalirana na ovoj razvojnoj mašini. Protected zone
  se za sada dodaju ručno.
- **Animacije nisu povezane u burn-in.** `TextAnimationEngine` (keyframes/motion path) postoji i
  testiran je samostalno, ali ASS/libass burn-in put pokriva samo statične stilove. Napredne
  animacije zahtevaju RGBA overlay kompoziciju (frame-by-frame render), koja nije
  implementirana u ovoj fazi.
- Ovo se nadovezuje na već poznato ograničenje iz v15.5.0: novi audio-analiza-do-spota backend
  (FAZA 4–11 originalnog master prompta) takođe još nije povezan u glavni UI.
