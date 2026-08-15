# CHANGELOG — v15.4.0

## Panel za instalaciju alata unutar programa (na izričit zahtev korisnika)
- Novi `PROGRAM - NE BRISATI/tool-runner.js`: pokreće instalacione skripte (FFmpeg, HyperFrames, PySceneDetect, Real-ESRGAN, RIFE, Faster-Whisper) kao pozadinski posao sa `windowsHide:true` i uhvaćenim stdout/stderr — VIŠE NEMA sirovog crnog PowerShell prozora bez povratne informacije.
- Novi API: `GET /api/modules/tools`, `POST /api/modules/tools/run`, `GET /api/modules/tools/status`, `POST /api/modules/tools/cancel`.
- Nova kartica „LOKALNI ALATI" u Koraku 9 (`public/github-modules.js`): dugme INSTALIRAJ po alatu, status bedž, live log, dugme OTKAŽI dok je instalacija u toku.
- Testirano STVARNIM pokretanjem: real-time PowerShell/pip izlaz uhvaćen i prikazan, otkazivanje tokom instalacije potvrđeno (proces ubijen, status ispravno postavljen na `failed` sa razlogom).

## EXE / Electron
- Nova prava Windows desktop aplikacija (Electron 43, ugrađeni Node 24.18.0 — korisnik ne instalira Node.js).
- `desktop/main.js`, `preload.js`, `server-controller.js`, `window-state.js` — novi Electron main proces.
- `server.js` sada izvozi `startServer(options)`; i dalje se pokreće kao zaseban proces (preko `ELECTRON_RUN_AS_NODE=1`, isti Electron binarni fajl, bez posebnog Node.js instalacije), nikad in-process u Electron GUI procesu.
- Single-instance lock, automatski izbor porta 4180–4239, čekanje na `/health`, glavni UI u BrowserWindow-u (ne u sistemskom browseru), bezbedne `webPreferences` (contextIsolation, sandbox, bez node integracije u renderer-u).
- Korisnički podaci sada idu u `app.getPath('userData')` (`projects/database/backups/logs/bridge/cache/exports/temp/settings/secure`), ne u instalacioni folder. `MSS_DATA_DIR` promenljiva podržana u `server.js`, `research-engine.js`, `advanced-tools.js`, `background-worker.js`.
- Automatska jednokratna migracija starih portable podataka u `userData` pri prvom pokretanju.
- NSIS installer (`Muzicki-Spot-Studio-Free-Setup-v15.4.0.exe`) i portable EXE (`Muzicki-Spot-Studio-Free-Portable-v15.4.0.exe`) — oba stvarno napravljena i pokrenuta na Windows mašini.

## Tema
- „Nedostaješ PUNOO Editorial" ostaje/potvrđena kao podrazumevana tema (`theme.js` već bira `np-editorial` po difoltu).
- Dodate centralne CSS promenljive (`--bg-main`, `--bg-sidebar`, `--bg-panel`, `--bg-panel-hover`, `--border`, `--text-main`, `--text-muted`, `--brand-red`, `--cyan`, `--purple`, `--success`, `--warning`, `--danger`) po tačnoj specifikaciji.
- `editorial-theme.css` prebojen sa toplog crno-krem sistema na hladniji plavo-crn „mrežni dashboard" sistem (dominantne boje pozadine/teksta/ivica), uz zadržan crimson brend i editorial serif naslove.
- Dodat `prefers-reduced-motion` globalni prekidač i blaga tranzicija ulaska za svaki korak (`.workspace.active`).

## Extension most
- Popravljen opseg portova u `service-worker.js` sa 4180–4199 (20 portova) na 4180–4239 (60 portova) — usklađeno sa `launcher.js`/`server.js`.
- Sve verzije podignute i usklađene na 15.4 / 15.4.0 (program, package, manifest, `EXTENSION_VERSION`, `EXPECTED_EXTENSION_VERSION`, `BRIDGE_VERSION`).

## Popravka: "Lokalni server nije uspeo da se pokrene" (pravi bug, pronađen na ovoj mašini)
- **Uzrok potvrđen merenjem, ne pretpostavkom**: 5 uzastopnih pokretanja portable EXE-a na ovoj mašini trajalo je 12.3–15.8 sekundi svako (self-extract + spawn + prvi health-check). Stari limit od 15 sekundi je bio TAČNO na ivici — jedno sporije pokretanje (npr. zbog Windows Defender skeniranja svežih fajlova) ga je prevazišlo i pokazalo grešku.
- Limit čekanja podignut sa 15 na **45 sekundi** (`desktop/server-controller.js`).
- Dodato dugme **„Pokušaj ponovo"** u dijalog greške (do 3 automatska ponovna pokušaja) umesto da program odmah odustane i zatvori se (`desktop/main.js`).
- Poruka greške sada objašnjava verovatan uzrok (antivirus skeniranje svežih fajlova) i predlaže rešenje.
- Dokumentovano u `WINDOWS-EXE-TEST-v15.4.md` — šta uraditi ako se greška ponovo pojavi.

## Glavna stranica i nove teme (na izričit zahtev korisnika)
- Korak 1 (glavna/prva stranica) sada ima karticu „YOUTUBE KANALI — Poveži svoje kanale" sa listom povezanih kanala i prečicom do pune YouTube kartice (Korak 6). Deli isti podatak sa Korakom 6 (`renderYoutubeChannels()` sada ažurira oba prikaza).
- Dodato 10 NOVIH tema u `skins.css`/`theme.js` (ukupno 34): **Neo Brutalist** (debele crne ivice, tvrde senke, Arial Black), **Vaporwave Grid** (roze-cyan grid pod, chrome sjaj naslova), **Swiss Editorial** (crveno-crno, geometrijski Arial grid), **Holo Glass** (zamućeno staklo, pill oblici), **Trap Drip** (zlatno na crnom, asimetrične ivice), **Skate Street** (isprekidane rotiranje ivice), **Acid Rave** (neon zeleno-magenta, veliki blob oblici), **Retro Terminal** (monospace font, zeleni scanline efekat), **Y2K Chrome** (metalik gradijenti, bubble dugmad), **Scandi Minimal** (topla zemljana paleta, Georgia serif, mnogo praznog prostora). Svaka menja oblik/font/teksturu, ne samo boju — verifikovano stvarnim renderovanjem u browseru (computed styles provereni za sve).

## Uređivanje prompta pre slanja u ChatGPT (na izričit zahtev korisnika)
- Novo dugme u Koraku 3: „PRIKAŽI I UREDI TAČAN TEKST ZA CHATGPT" — pokazuje TAČAN tekst koji bi bio poslat (isti onaj koji `startPlusBridgeRound` stvarno šalje, izdvojeno u zajedničku funkciju `prepareStep3PlusBridgeRequest` da pregled i stvarno slanje nikad ne mogu da se razminu). Korisnik može da izmeni tekst pre slanja; ako to uradi, upravo taj izmenjeni tekst se šalje umesto automatski sastavljenog. Dugme „VRATI AUTOMATSKI TEKST" poništava ručne izmene. Testirano u pravom browseru (Browser pane): prolazi kroz istu validaciju kao staro dugme za slanje, bez grešaka u konzoli.
- Postojeći sistem protiv ponavljanja ideja (`idea-history.json`, fingerprint sličnost, provera protiv SVIH ranijih pesama) je već postojao pre ove sesije — nije nanovo napravljen, samo potvrđen i objašnjen korisniku.

## Profesionalne dopune (na izričit zahtev korisnika: potpis / auto-update / dnevni backup / CSP)
- **Auto-update (electron-updater)**: tiha provera pri pokretanju, ne-nametljiv dijalog kada je update spreman. Podrazumevano neaktivan dok se ne popuni pravi GitHub `owner`/`repo` u `package.json` → `build.publish` (vidi BUILD-INSTRUCTIONS-v15.4.md). Verifikovano pravim pokretanjem: modul se ispravno učitava u spakovanoj aplikaciji, greška bez podešenog repozitorijuma se hvata tiho i ne remeti rad programa.
- **Dnevni backup arhiv**: pored postojećeg "rolling" backupa (svakih 5 min dok radiš, zadržava poslednjih 10), dodat je nezavisan arhiv sa JEDNOM kopijom po kalendarskom danu, zadržan 30 dana (`data/backups/daily/`). Novi API: `GET /api/maintenance/daily-backups`, `GET /api/maintenance/restore-daily?date=GGGG-MM-DD`. Testirano stvarnim pozivom — kreiranje i vraćanje potvrđeno.
- **Content-Security-Policy** meta tag u `index.html` (`default-src 'self'`, dozvoljen `connect-src` ka lokalnom serveru i ComfyUI portu, `img-src https:` za YouTube reference thumbnails). Verifikovano pravim otvaranjem programa u browseru: 0 CSP grešaka u konzoli, sve mrežne rute i dalje rade (uključujući ComfyUI na proizvoljnom localhost portu).
- **Digitalni potpis**: NIJE i NE MOŽE biti urađen automatski — zahteva pravi kupljeni sertifikat na ime vlasnika programa. Konfiguracija je pripremljena (vidi BUILD-INSTRUCTIONS-v15.4.md), ali `Get-AuthenticodeSignature` i dalje vraća `NotSigned` na oba finalna EXE fajla — ovo ostaje otvoreno dok korisnik ne nabavi sertifikat.

## Automatizacija ChatGPT Plus mosta (dodato na zahtev korisnika — Korak 3 bez ručnog klikanja)
- Novi AUTOMATSKI REŽIM u `chatgpt-bridge.js` panelu, podrazumevano UKLJUČEN: dodatak sam ubacuje zahtev u ChatGPT, sam klikne Pošalji, sam čeka da odgovor bude gotov i sam ga vraća u program — za SVAKI krug (ideje, storyboard paketi, završni paket), bez potrebe da korisnik prati tab i klikće dva dugmeta po krugu.
- Dugme za uključivanje/isključivanje automatike, izbor se pamti (`chrome.storage.local`). Stara dva ručna dugmeta ostaju kao rezerva ako ChatGPT promeni izgled sajta.
- Native Windows/Chrome obaveštenje (`chrome.notifications`) kada je krug gotov — korisnik ne mora da gleda ChatGPT tab da bi znao da je gotovo. Dodata `notifications` dozvola i prava ikonica dodatka (`icons/icon16-128.png`, ranije dodatak nije imao nijednu ikonu).
- Podsetnik: broj scena/promptova po pesmi već je bio podesiv u Koraku 3 („Maksimalno scena/slika", podrazumevano 16, može i manje) — nije nova funkcija, samo istaknuto korisniku.

## Dodatna otpornost Electron aplikacije (dodato na zahtev korisnika: "šta još može da se doda")
- Splash ekran (`desktop/splash.html`) se prikazuje odmah pri pokretanju, dok se lokalni server podiže — korisnik na slabijem računaru vidi da se program pokreće, ne prazan ekran.
- Oporavak od rušenja renderer procesa (`render-process-gone`): umesto tihog zamrznutog prozora, korisnik dobija jasan izbor „Ponovo učitaj" / „Zatvori program".
- Detekcija neočekivanog gašenja lokalnog servera NAKON što je prozor već otvoren (ne samo pri startu) — jasna poruka umesto mrtvog interfejsa.
- `process.on('uncaughtException'/'unhandledRejection')` u Electron main procesu — greška se sada loguje i prikazuje umesto da program tiho nestane bez traga.
- Bezbedna rezerva za slabije/starije grafičke kartice (npr. GTX 750 Ti klasa iz dokumentacije): pokretanje sa `--disable-gpu` isključuje hardversko ubrzanje. Testirano stvarnim pokretanjem.
- Minimalni, bezbedan meni aplikacije (Prikaz: osveži/zum/ceo ekran; Podrška: folder logova, DevTools, „O programu") umesto Electron-ovog opsežnog podrazumevanog menija.

## Funkcionalne izmene
- **Popravljen bug koji je zamrzavao ceo lokalni server**: `GET /api/system/profile` je koristio `execFileSync('powershell.exe', ...)` dva puta uzastopno, blokirajući Node event loop (i time SVE ostale API rute) na nekoliko sekundi pri svakoj proveri računara u Koraku 9. Sada je asinhrono (`execFile`).
- Dodat `beforeunload` guard u `public/app.js` — aplikacija sada upozorava pre zatvaranja taba/prozora ako postoje nesačuvane izmene (`state.dirtySinceSave`).
