# BUILD INSTRUCTIONS — v15.4.0

Sve komande se pokreću iz root foldera projekta (gde je `package.json`), na Windows računaru sa internet vezom (Electron/electron-builder preuzimaju binarne fajlove pri prvom build-u).

## Instalacija zavisnosti
```
npm install
```

## Razvoj (bez pakovanja)
```
npm run dev
```
Pokreće Electron direktno iz `PROGRAM - NE BRISATI` foldera (bez build-a), korisno za brzu proveru izmena.

## Testovi
```
npm run test:static
npm run test:server
npm test
```

## Build — samo raspakovan folder (brza provera)
```
npm run pack:win
```
Rezultat: `dist/win-unpacked/Muzicki Spot Studio Free.exe`.

## Build — installer (NSIS)
```
npm run dist:win
```
Rezultat: `dist/Muzicki-Spot-Studio-Free-Setup-v15.4.0.exe`

## Build — portable
```
npm run dist:portable
```
Rezultat: `dist/Muzicki-Spot-Studio-Free-Portable-v15.4.0.exe`

## Build — oba odjednom
```
npm run dist:all
```

## Napomena o potpisivanju (JEDINA stavka koju AI ne može sam da uradi)
Trenutna konfiguracija NE potpisuje EXE digitalnim sertifikatom — `Get-AuthenticodeSignature` na oba finalna EXE fajla vraća `NotSigned`. Ovo NIJE nešto što se rešava kodom: potreban je PRAVI sertifikat od priznatog izdavaoca (identitet/firma se proverava), koji samo vlasnik programa može da kupi na svoje ime. Realne opcije:

1. **OV/EV code-signing sertifikat** (Sectigo, SSL.com, DigiCert) — ~$100–400/god, klasičan `.pfx` fajl + lozinka.
2. **Microsoft Trusted Signing** — noviji, jeftiniji pretplatnički model (mesečna cena, bez potrebe za fizičkim USB tokenom), direktno integrisan sa Azure nalogom.

Kada nabaviš sertifikat, dodaj u `package.json` → `build.win`:
```
"certificateFile": "putanja-do-sertifikata.pfx",
"certificatePassword": "..."
```
(bezbednije: postavi env promenljive `CSC_LINK` i `CSC_KEY_PASSWORD` pre `npm run dist:win` — electron-builder ih automatski čita, lozinka se ne čuva u fajlu).

Ne koristi self-signed/lokalni sertifikat kao "rešenje" — on ne gradi SmartScreen reputaciju i predstavljao bi lažnu tvrdnju o javnom potpisu.

## Auto-update (electron-updater)
Dodata je `electron-updater` zavisnost i tiha provera ažuriranja pri svakom pokretanju spakovane aplikacije (`desktop/main.js` → `setupAutoUpdate`). Podrazumevano NE RADI dok ne popuniš pravi GitHub repozitorijum u `package.json` → `build.publish`:
```
"publish": [{ "provider": "github", "owner": "TVOJE-GITHUB-IME", "repo": "TVOJ-REPO" }]
```
Koraci da proradi:
1. Napravi GitHub repozitorijum (može privatan, ali privatan zahteva `GH_TOKEN` i kod korisnika, što je nezgodno za distribuciju — javni repo je najjednostavniji za auto-update feed, čak i ako se izvorni kod ne objavljuje tamo, samo `dist/` izdanja).
2. Zameni `owner`/`repo` u `package.json`.
3. Za objavljivanje nove verzije: postavi `GH_TOKEN` env promenljivu (GitHub Personal Access Token sa `repo` dozvolom), pa pokreni `npm run dist:publish` — ovo automatski kreira GitHub Release i otpremi EXE + `latest.yml`.
4. Korisnici sa starijom verzijom dobijaju tihu proveru pri pokretanju; ako je update spreman, dobijaju ne-nametljiv dijalog „Restartuj sada / Kasnije".

Dok `owner`/`repo` nisu popunjeni, provera samo tiho ne uspe (loguje se u `electron-main.log`, korisnik ne vidi ništa) — ovo je namerno bezbedno ponašanje, ne greška.

## Struktura koja se pakuje
- `desktop/**` i root `package.json` → `app.asar` (Electron kod).
- `PROGRAM - NE BRISATI/**` (osim `data/backups`, `data/secure`, `*.log`) → `resources/PROGRAM` kao OBIČNI fajlovi van asar-a (`extraResources`), tako da `server.js`, `tools/*.ps1/*.bat/*.py` i `browser-extension/` ostanu direktno izvršivi/dostupni.
- `assets/icon.ico` → ikona aplikacije i installer-a.
