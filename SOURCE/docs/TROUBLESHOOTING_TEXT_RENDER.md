# Rešavanje problema — render teksta na videu

## "Cue nije validan: endMs (...) mora biti veći od startMs"

`validateCue()` (`text-overlay-models.js`) odbija cue-ove gde je kraj ≤ početak, negativan
početak, ili gde vreme prelazi ukupno trajanje audio-fajla (+10ms tolerancija). Ovo je namerna
zaštita — proveri unete vremenske oznake u editoru pre čuvanja.

## "Reč '...' je van granica cue-a"

Kada `words[]` (word-level timing) sadrži vreme koje izlazi van `[cue.startMs-10, cue.endMs+10]`,
validacija to odbija. Obično znači da je forced alignment dao neuskladiv rezultat sa ručno
podešenim granicama cue-a — ili ponovo poravnaj liniju, ili ručno prilagodi cue granice.

## Font nema srpsku latinicu / prikazuju se prazni kvadratići

`FontManager.inspectFontFile(...).supportsSerbianLatin` mora biti `true` da bi font bio
bezbedan izbor za srpski tekst. Ako izabrani font nema sve glifove (npr. Wingdings, ili neki
uskospecijalizovan display font), koristi `resolveFallbackFont()` da automatski predložiš font
koji ih ima — nemoj ručno birati font "po imenu" bez provere.

## FFmpeg burn-in javlja grešku sa apsolutnim putanjama na Windows-u

Ovo je poznat, stvarno pronađen bug u FFmpeg-ovom `ass` filteru (vidi `SUBTITLE_EXPORT.md`) —
`renderBurnIn()` ga zaobilazi pokretanjem sa `cwd` u folderu ASS fajla. Ako i dalje javlja
grešku, proveri da li je ASS fajl fizički prisutan na disku PRE poziva (`fs.existsSync`), i da
naziv fajla ne sadrži znakove `: , ; [ ] ' \` — `buildBurnInFfmpegArgs()` će jasno baciti grešku
u tom slučaju umesto da tiho pošalje neispravan FFmpeg poziv.

## "FFmpeg nije pronađen"

`resolveFfmpegPath()` prvo traži bundlovan portable FFmpeg u
`{MSS_DATA_DIR}/runtime/ffmpeg-portable`, a zatim se oslanja na sistemski PATH. Instaliraj
FFmpeg preko panela LOKALNI ALATI u programu (`tools/INSTALIRAJ-FFMPEG-LITE.ps1`) ako nijedno
nije dostupno.

## Karaoke highlight izgleda "izmišljeno" / netačno tempirano

Proveri `frame.wordTimingSource` iz `buildKaraokeFrame()`. `'estimated'` znači da cue nema pravi
ASR word-level timing (`words[]` je prazan) — karaoke ravnomerno deli trajanje cue-a na reči kao
iskren fallback, ne tvrdi preciznost. Pokreni forced alignment (`alignProjectLyrics`) da dobiješ
`'aligned'` timing.

## Tekst izlazi van bezbedne zone (safe zone) na telefonu/tabletu

`TextLayoutEngine.layoutCue()` vraća upozorenje `outside_safe_zone` kada je pozicija (posebno u
`manual` drag modu) van margina definisanih za dati format (`SAFE_ZONES` u
`text-layout-engine.js` — 9:16 ima veće margine dna zbog UI dugmadi platformi). Koristi
`smart-text-placement-engine.clampManualPositionToSafeZone()` da vratiš poziciju u bezbednu zonu.
