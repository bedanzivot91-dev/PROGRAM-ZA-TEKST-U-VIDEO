# Tekst pesme na videu / Lyrics Overlay Studio (v15.6.0)

Nezavisan, potpuno opcion sloj teksta preko video spota. **Tekst se NIKAD ne ugrađuje u
image/video generacione promptove** — postoji odvojeno kao editabilni podaci (track-ovi i
cue-ovi) i renderuje se u zasebnom koraku (burn-in ili transparentan overlay preko postojećeg
videa). Spot generisan bez teksta ostaje potpuno upotrebljiv; tekst se može dodati, izmeniti ili
u potpunosti ukloniti bez regenerisanja slika/videa scena.

## Arhitektura (moduli u `PROGRAM - NE BRISATI/`)

| Modul | Odgovornost |
|---|---|
| `text-overlay-models.js` | Podaci: `TextTrack`, `Cue`, `Style` — kreiranje i validacija. |
| `font-manager.js` | Stvarno čitanje TTF/OTF/TTC fajlova sa diska, provera srpske latinice/ćirilice. |
| `lyrics-line-breaker.js` | Prelom teksta u linije (nikad ne deli reč), procena čitljivosti (cps/wpm/min. trajanje). |
| `text-layout-engine.js` | Tipografija → pikseli, safe zone po formatu (16:9/9:16/1:1), anchor pozicioniranje. |
| `smart-text-placement-engine.js` | Izbegavanje protected zona (lice/logo), clamp za slobodno drag pozicioniranje. |
| `karaoke-engine.js` | Word-by-word highlight (koristi `words[]` iz `lyrics-alignment.js`), multi-track kombinovanje. |
| `text-animation-engine.js` | Keyframe interpolacija, motion path (linija/bezier/luk), easing krive. |
| `text-style-presets.js` | 15 imenovanih gotovih stilova. |
| `text-overlay-export.js` | SRT/VTT/ASS/JSON export, FFmpeg/libass burn-in render. |
| `lyrics-overlay-storage.js` | Skladištenje po projektu (track/cue CRUD), REST wiring. |

## Model podataka

```
Project (project.json)
  lyricsOverlay: { trackCount, cueCount, updatedAt }   ← mali referentni blok

projects/PROJECT_ID/lyrics/
  overlay-tracks.json   ← TextTrack[] (svaki track sadrži svoje Cue[])
```

`TextTrack`: `{ trackId, type, name, language, enabled, locked, zIndex, defaultStyleId, cues[] }`
Tipovi (`type`): `lyrics`, `translation`, `title`, `artist`, `section`, `custom`, `credits`.

`Cue`: `{ cueId, trackId, startMs, endMs, text, words[], timingSource, confidence, needsReview,
enabled, manualLocked, placement, deleted, deletedAt, styleId }`. Soft-delete preko
`deleted`/`deletedAt` — cue se može vratiti (`restoreCue`) bez regenerisanja ičega.

`Style`: font/veličina/razmak/poravnanje/boja/karaoke/outline/senka/glow/pozadina/transformacija
— puna forma u `text-overlay-models.createStyle()`.

## REST API (server.js)

| Ruta | Metod | Svrha |
|---|---|---|
| `/api/text-presets` | GET | Lista svih 15 preseta |
| `/api/text-presets/:id` | GET | Jedan preset kao pun Style objekat |
| `/api/fonts` | GET | Stvaran spisak fontova sa mašine (sistemski + korisnički) |
| `/api/audio-projects/:id/lyrics-overlay` | GET | Svi track-ovi projekta |
| `/api/audio-projects/:id/lyrics-overlay/validate` | GET | Validacija svih track-ova/cue-ova |
| `/api/audio-projects/:id/lyrics-overlay/export?trackId=&format=` | GET | Export (`srt`/`vtt`/`ass`/`json`) |
| `/api/audio-projects/:id/lyrics-overlay/text-tracks` | POST | Novi track |
| `/api/audio-projects/:id/lyrics-overlay/text-tracks/:trackId` | PATCH / DELETE | Izmena / brisanje track-a |
| `.../text-tracks/:trackId/text-cues` | POST | Novi cue |
| `.../text-cues/:cueId` | PATCH / DELETE | Izmena / soft-delete cue-a |
| `.../text-cues/:cueId/restore` | POST | Vraćanje obrisanog cue-a |

## Poznata ograničenja (iskreno, ne prikriveno)

- **UI editor nije još povezan** — svi moduli i REST rute su izgrađeni i testirani preko HTTP-a,
  ali `public/app.js` još nema vizuelni editor za drag pozicioniranje/timeline/karaoke pregled.
  To je sledeći korak van dometa ovog backend-a.
- **SmartTextPlacementEngine nema pravu face-detection** — `detectFaces()` iskreno vraća
  `supported:false`; protected zone se dodaju ručno dok se ne integriše prava biblioteka.
- **ASS render pokriva statične stilove.** Napredne `TextAnimationEngine` animacije (keyframes/
  motion path) NISU još povezane u FFmpeg burn-in pipeline — to zahteva RGBA overlay
  kompoziciju (frame-by-frame render), koja nije implementirana u ovoj fazi.

Vidi i: [`FONT_MANAGER.md`](FONT_MANAGER.md), [`KARAOKE_MODE.md`](KARAOKE_MODE.md),
[`TEXT_ANIMATIONS.md`](TEXT_ANIMATIONS.md), [`SUBTITLE_EXPORT.md`](SUBTITLE_EXPORT.md),
[`FONT_LICENSES.md`](FONT_LICENSES.md), [`TROUBLESHOOTING_TEXT_RENDER.md`](TROUBLESHOOTING_TEXT_RENDER.md).
