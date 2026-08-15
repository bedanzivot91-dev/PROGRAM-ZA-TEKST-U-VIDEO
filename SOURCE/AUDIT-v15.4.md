# AUDIT — Muzički Spot Studio Free v15.4

Status: živi dokument, dopunjuje se tokom rada (vidi WORKLOG-v15.4.md za trag odluka).

## EXE / putanje problemi (pronađeno)

- **[POPRAVLJENO]** `server.js` nije bio pripremljen za pozivanje iz Electron-a — sav kod je izvršavan na `require()`, bez izvezene funkcije. Sada izvozi `startServer(options)`.
- **[POPRAVLJENO]** `DATA_DIR` u `server.js`, `research-engine.js`, `advanced-tools.js`, `background-worker.js` bio je tvrdo vezan za `__dirname/data` (pored programskih fajlova). U instaliranoj verziji to bi značilo pisanje u `Program Files`, što Windows blokira bez admin prava. Sada svi poštuju `MSS_DATA_DIR` env promenljivu.
- **[U TOKU]** Electron `userData` struktura (`projects/database/backups/logs/bridge/cache/exports/temp/settings/secure`) i migracija starih portable podataka — nije još urađeno (task #5).
- **[OTVORENO]** `browser-extension/MSS-ChatGPT-Plus-Most` mora ostati dostupan van `app.asar` (extraResources/asarUnpack) — planirano u electron-builder konfiguraciji, nije još napisano.

## Extension most problemi

- **[POPRAVLJENO]** `service-worker.js` je skenirao samo portove 4180–4199 (20 portova) dok `launcher.js`/`server.js` koriste ceo opseg 4180–4239. Sada obe strane koriste isti opseg.
- **[POPRAVLJENO]** Neusklađene verzije (server/extension/manifest su mešali 15.3 i 15.3.0). Sve podignuto na 15.4 / 15.4.0 konzistentno.
- **[OTVORENO]** Extension trenutno zavisi i od `local-app.js` content-script pristupa localhost stranici. Pošto glavni UI sada radi u Electron BrowserWindow-u (ne u Chrome tabu), service worker mora imati samostalno otkrivanje programa (onStartup/onInstalled/alarms) nezavisno od content scripta — nije još implementirano (task #6 nastavak).

## Funkcionalni / kod problemi (pronađeno IZVRŠAVANJEM pravog server testa, ne čitanjem)

- **[POPRAVLJENO — kritično]** `GET /api/system/profile` je pozivao `advancedTools.systemProfile()`, koja je koristila `execFileSync('powershell.exe', ...)` DVA PUTA uzastopno (CIM upit za GPU/disk/CPU, pa nvidia-smi). `execFileSync` blokira ceo Node event loop dok PowerShell ne završi — u praksi to zamrzava CEO lokalni server (health, heartbeat, sve ostale `/api/*` rute) na nekoliko sekundi pri svakom otvaranju Koraka 9 (provera računara). U prvom pokretanju stvarnog `tests/test-server.js` ova ruta je premašila 5s timeout. Popravljeno: `psJson()` i `systemProfile()` su sada `async` i koriste `execFile` (promisified), ne `execFileSync`. Ponovljen test posle popravke: ruta odgovara i `/health` ostaje brz (1ms) dok se `/api/system/profile` izvršava — event loop više nije blokiran. Fajl: `advanced-tools.js`.
- Dodat `beforeunload` guard u `public/app.js` (`initialize()`) koji upozorava korisnika samo kada `state.dirtySinceSave` postoji — ranije aplikacija NIJE upozoravala pre zatvaranja sa nesačuvanim izmenama (funkcionalni zahtev iz specifikacije).
- **[POPRAVLJENO]** `SERVER_LOG_FILE`, `BACKGROUND_LOG_FILE` (server.js) i `LOG_FILE`/`CLOUDFLARED_LOG` (background-worker.js) su bili tvrdo vezani za `__dirname`/`APP_DIR` (pored server.js), isti problem kao originalni `DATA_DIR` bug — u instaliranoj EXE verziji bi pokušali pisanje u `Program Files`. Sada svi idu u `DATA_DIR` (koji već poštuje `MSS_DATA_DIR`).
- **[POPRAVLJENO]** `github-integrations.js` je imao `REFERENCE_ANALYSIS_DIR = path.join(__dirname, 'data', 'reference-analysis')`, potpuno nezavisno od `MSS_DATA_DIR`, i pravio je taj folder BEZUSLOVNO pri svakom pokretanju servera (`fs.mkdirSync` na modul-load). Ovo je otkriveno tako što je stvarno pokretanje `server.js` tokom testiranja ostavilo prazan `data/reference-analysis` folder u dev stablu — potvrđeno posmatranjem stvarnog fajl-sistema, ne pretpostavkom. Popravljeno da koristi isti `MSS_DATA_DIR`-svestan `DATA_DIR` obrazac kao ostali fajlovi.
- 15 „praznih" catch blokova u `app.js` pregledano pojedinačno: svi su namerno best-effort operacije (localStorage cleanup, best-effort seek/cancel/fetch) gde tihi neuspeh ne krije stvarnu grešku od korisnika. Nije bilo potrebe za izmenom.

## Funkcionalni / kod problemi (statička analiza)

- Server koristi ručni if-chain router na ~70 `/api/*` ruta u jednom fajlu (nije bug, ali otežava održavanje — nije menjano jer nije tražena arhitekturna izmena servera).
- `shutdownApplication()` u `server.js` zove `process.exit(0)` — bezbedno JEDINO zato što je odlučeno da `server.js` UVEK radi kao zaseban dete-proces (nikad in-process u Electron main-u). Vidi WORKLOG za obrazloženje.
- Detaljan audit `public/app.js` (6719 linija: dugmad bez handlera, dupli listeneri, memory leak-ovi, prazni catch blokovi) — **NIJE JOŠ URAĐEN**, planiran kao task #7. Ne tvrdim da je urađen dok se stvarno ne izvrši.

## Rezultati testova (samo stvarno izvršeni)

- `tests/test-static.js`: **40/40 prošlo** (JS sintaksa 22 fajla, JSON parsiranje 4 fajla, HTML 452 jedinstvena ID-ja/0 duplikata, verzije 15.4/15.4.0 na 7 mesta, extension port-opseg, Electron desktop fajlovi, ikona).
- `tests/test-server.js` (pravi spawn-ovan `server.js` proces, `MSS_DATA_DIR` na privremeni folder, stvarni HTTP pozivi): **19/19 prošlo** posle popravke `systemProfile()` bug-a (pre popravke: 17/18, jedan pravi bug pronađen i ispravljen — vidi gore).
- `python -m py_compile` na `tools/faster-whisper-helper.py` i `tools/scene_analyzer.py`: **0 grešaka**.
- Electron testovi (single-instance, BrowserWindow bezbednost, migracija), build testovi (NSIS/portable EXE): **u toku** — vidi WORKLOG za status.

## Preostala ograničenja (potvrđena, ne pretpostavljena)

- AI moduli (ComfyUI, InstantID, Wan, Real-ESRGAN, RIFE, Faster-Whisper) nisu spakovani u EXE — po dizajnu, korisnik ih instalira posebno preko `tools/*.ps1`. Ovo ostaje nepromenjeno.
- Nema code-signing sertifikata — `Get-AuthenticodeSignature` potvrdio **NotSigned** na sva tri EXE fajla (win-unpacked, Setup, Portable). SmartScreen upozorenje će se pojaviti pri prvom pokretanju kod krajnjeg korisnika.
- NSIS install wizard (klik kroz ekrane) i uninstall tok NISU end-to-end automatski testirani — `Setup.exe /S` je u ovoj sesiji zatražio UAC elevaciju koju automatizovan shell ne može da potvrdi, pa se instalacija u čist test folder nije mogla dovršiti bez GUI interakcije. Sam Setup EXE je proveren (napravljen, ispravne veličine i SHA-256). Preporuka: korisnik jednom ručno provede instalaciju (vidi WINDOWS-EXE-TEST-v15.4.md).
- Desktop/Start Menu prečice i DevTools konzola nisu vizuelno potvrđene (nema screenshot pristupa Electron prozoru u ovoj sesiji).
