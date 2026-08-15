# Karaoke mod

`PROGRAM - NE BRISATI/karaoke-engine.js` — word-by-word highlight tokom reprodukcije, plus
multi-track kombinovanje (npr. original + prevod prikazani istovremeno).

## Odakle dolazi word-level timing

`lyrics-alignment.js` (`alignLyrics()`) sada vraća `words: [{ text, startMs, endMs, confidence }]`
po liniji, sortirano po `startMs` — proširenje postojeće DP/LCS poravnjavajuće logike koja je
interno već računala vremena po reči, samo ih ranije nije izlagala. Ovo je izvor "pravog" timing-a.

## Stanja reči

`getWordState(word, currentMs)` vraća:
- `pending` — reč se još nije "otpevala",
- `active` — trenutno se peva (`currentMs` unutar `[startMs, endMs)`),
- `completed` — već je otpevana.

`getWordProgress(word, currentMs)` vraća 0–1 progres unutar aktivne reči (za "fill" efekat).

## Iskren fallback bez word-level timing-a

Ako cue nema `words[]` (npr. ručno unet tekst bez forced alignment-a), `buildKaraokeFrame()`
NE pretvara se da ima precizan timing — `estimateWordTimings()` ravnomerno raspoređuje trajanje
cue-a na reči i frame dobija `wordTimingSource: 'estimated'` (nasuprot `'aligned'` kada je pravi
ASR timing dostupan). UI treba da prikaže ovu razliku korisniku (npr. diskretna ikonica).

## Multi-track kombinovanje

`combineActiveTracksAtTime(tracks, currentMs)` vraća SVE trenutno aktivne cue-ove preko svih
omogućenih track-ova (npr. `lyrics` + `translation` istovremeno), poređane po `zIndex`. Track-ovi
sa `enabled:false` i cue-ovi sa `deleted:true` se preskaču.

## Primer

```js
const { buildKaraokeFrame, combineActiveTracksAtTime } = require('./karaoke-engine');

const frame = buildKaraokeFrame(cue, currentPlaybackMs, style.karaoke);
// frame.words → [{ text, state, progress, color }, ...]

const activeNow = combineActiveTracksAtTime(allTracks, currentPlaybackMs);
// [{ trackId, type: 'lyrics', cue }, { trackId, type: 'translation', cue }]
```
