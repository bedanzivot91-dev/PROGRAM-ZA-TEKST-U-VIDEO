# Muzički Spot Studio Free — v15.6.0

Lokalni Windows desktop program za izradu muzičkog spota od pesme do gotovog videa. Radi
potpuno offline (osim opcionih AI koraka preko ChatGPT-a ili YouTube-a), bez admin prava,
bez plaćenih API ključeva.

## Pokretanje (razvoj)

```
npm install
npm run dev
```

Ovo pokreće Electron aplikaciju direktno iz izvornog koda.

## Build za Windows

```
npm run pack:win      # nespakovan build, dist/win-unpacked/ (brzo, za testiranje)
npm run dist:win      # NSIS instalacioni EXE
npm run dist:portable # portable EXE (bez instalacije)
npm run dist:all      # oba iznad
```

Instalacioni i portable EXE se pojavljuju u `dist/`. SHA-256 vrednosti finalnog builda su u
`CHANGELOG-v15.6.md`.

## Testovi

```
npm test
```

Pokreće preko 44 samostalnih test paketa (500+ provera) — svi rade protiv stvarnog koda:
pravi HTTP zahtevi ka pravom pokrenutom serveru, pravi FFmpeg-generisani audio/video fajlovi
(uključujući stvaran FFmpeg/libass burn-in render), prava provera u browseru. Ništa nije mockovano.

Pojedinačni paketi (`npm run test:X`) su navedeni u `package.json` → `scripts`.

## Struktura projekta

- `PROGRAM - NE BRISATI/` — ceo server-strani kod (`server.js` + ~50 modula, uključujući
  "Tekst pesme na videu / Lyrics Overlay Studio" — vidi `docs/TEXT_OVERLAY.md`), frontend
  (`public/`), browser ekstenzija (`browser-extension/`), PowerShell/Python alati (`tools/`).
- `desktop/` — Electron main proces (`main.js`), preload skripta, server-controller (pokreće
  `server.js` kao dete-proces preko ugrađenog Electron Node runtime-a).
- `docs/` — detaljna dokumentacija modula (font management, karaoke, animacije, export, licence,
  rešavanje problema).
- `tests/` — svi automatski testovi.
- `assets/` — ikonica za build.

## Prva pomoć

- **Program se ne pokreće / prikazuje grešku pri startu**: pogledaj
  `%APPDATA%\Muzicki Spot Studio Free\logs\DIJAGNOSTIKA-EXE.txt` i `electron-main.log` u istom
  folderu. Najčešći uzrok pri PRVOM pokretanju je antivirus koji skenira sveže fajlove — program
  ima dugme "Pokušaj ponovo".
- **ChatGPT most / ekstenzija ne radi**: otvori dijagnostiku mosta u programu, ili
  `GET http://127.0.0.1:PORT/api/plus-bridge/diagnostics` dok je program pokrenut. Ekstenzija se
  učitava iz `%LOCALAPPDATA%\Muzicki Spot Studio Free\Extension\15.6.0\` (dugme "OTVORI FOLDER
  EKSTENZIJE" u programu je otvara direktno).
- **YouTube povezivanje**: `GET /api/youtube/oauth-status` govori tačno šta nedostaje
  (Client ID, Google Cloud projekat, itd.) pre pokušaja povezivanja.
- **Alati (FFmpeg, Real-ESRGAN, RIFE, Faster-Whisper, PySceneDetect, Demucs, Librosa,
  HyperFrames)**: instaliraju se preko panela "LOKALNI ALATI" unutar programa — ne treba ih
  ručno preuzimati.

## Poznata ograničenja

Vidi `CHANGELOG-v15.6.md` → "POZNATA OGRANIČENJA" (i `CHANGELOG-v15.5.md` za prethodnu rundu)
za kompletnu, iskrenu listu onoga što u ovoj verziji radi, šta je testirano, i šta ostaje da se
poveže/proveri.
