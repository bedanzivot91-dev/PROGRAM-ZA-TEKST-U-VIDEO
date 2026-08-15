# Export i burn-in render

`PROGRAM - NE BRISATI/text-overlay-export.js` — SRT/VTT/ASS/JSON export jednog `TextTrack`-a, i
FFmpeg/libass burn-in render u video.

## Formati

| Format | Funkcija | Napomena |
|---|---|---|
| SRT | `exportTrackToSrt(track)` | Numerisani blokovi, `HH:MM:SS,mmm`, preskače obrisane cue-ove |
| VTT | `exportTrackToVtt(track)` | `WEBVTT` header, `HH:MM:SS.mmm` |
| ASS | `exportTrackToAss(track, style, video)` | Za FFmpeg/libass burn-in, boje u `&HAABBGGRR` |
| JSON | `exportTrackToJson(track)` | Pun track objekat (uključuje i obrisane, za restore/debug) |

Preko REST API-ja: `GET /api/audio-projects/:id/lyrics-overlay/export?trackId=X&format=srt`.

## FFmpeg/libass burn-in — otkriven i ispravljen pravi bug

Uobičajen savet za Windows apsolutne putanje u `ass=`/`subtitles=` filteru ("escape-uj dvotačku
kao `\:`") **nije pouzdano radio** protiv stvarne FFmpeg 8.1.2 instalacije — `ass` filter je i
dalje pogrešno parsirao ostatak putanje kao `original_size` opciju (potvrđeno stvarnim
testiranjem: sintetisan video preko `ffmpeg -f lavfi`, pravi generisani ASS fajl, stvaran
pokušaj burn-in-a koji je propao sa istom greškom bez obzira na varijantu escape-ovanja).

**Rešenje koje STVARNO radi**: pokreni FFmpeg sa `cwd` postavljenim na folder ASS fajla i
prosledi SAMO ime fajla (bez apsolutne putanje, bez dvotačke) kao vrednost `ass=` filtera.
`-i` i izlazna putanja ostaju apsolutne (nisu unutar filtergraph stringa, pa dvotačka tamo nije
problem). Implementirano u `buildBurnInFfmpegArgs()` + `renderBurnIn()`, potvrđeno end-to-end
testom koji stvarno sintetiše video, generiše ASS i burn-uje ga (`tests/test-text-overlay-export.js`).

```js
const { renderBurnIn } = require('./text-overlay-export');
await renderBurnIn({ inputVideoPath, assFilePath, outputVideoPath });
```

Ime ASS fajla ne sme sadržati filtergraph-nebezbedne znakove (`: , ; [ ] ' \`) — proverava se
eksplicitno (`assertSafeAssFileName`) pre pokretanja FFmpeg-a, umesto da se to tiho pokvari.

## Ograničenje

Burn-in ovde pokriva JEDNOSTAVNE, statične stilove (boja/font/outline/senka/pozadina).
Animacije iz `text-animation-engine.js` nisu prevedene u ASS `\move`/`\t` tagove — taj put ide
preko RGBA overlay kompozicije, van dometa ove faze (vidi `TEXT_ANIMATIONS.md`).
