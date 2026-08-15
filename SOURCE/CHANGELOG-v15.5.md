# CHANGELOG — Muzički Spot Studio Free v15.5.0

Ova verzija je izgrađena po "MASTER PROMPT ZA CLAUDE CODE" specifikaciji (v15.5), izvršenoj
faza-po-fazu (FAZA 1–12) preko više sesija. Svaki red ispod odgovara stvarnoj, testiranoj
izmeni koda — ne planu ili predlogu. Pun istorijat sa detaljnim opisima nalazi se u git
istoriji ovog repozitorijuma (`git log`), gde svaki commit odgovara jednoj proverenoj celini.

**Najvažnija stvar da se razume o ovoj verziji:** FAZE 4–11 su izgradile POTPUNO NOV,
paralelan backend sistem za audio-analizu-do-spota (`audio-projects.js` i ~25 novih modula),
dostupan preko REST API-ja (`/api/audio-projects/*`) i u potpunosti testiran preko stvarnog
HTTP-a. Postojeći frontend (`public/app.js`, 9 koraka, index.html) **NIJE prepisan** da koristi
ovaj novi backend — on i dalje radi na starom, tekst/AI-most zasnovanom toku iz v15.4. Novi
audio pipeline je gotov, testiran i spreman za povezivanje, ali UI povezivanje (nova "MOJI
SPOTOVI" početna strana, waveform/storyboard editor iz sekcije 26) nije urađeno u ovoj rundi.
Vidi "POZNATA OGRANIČENJA" na dnu.

## FAZA 1–2 — Popravka EPERM greške i centralizacija skladištenja

- Pravi uzrok potvrđenog EPERM bug-a (`mkdir .../resources/PROGRAM/runtime/research`):
  `research-engine.js` je računao `TOOLS_DIR` u odnosu na `__dirname` (read-only u instaliranoj
  verziji), ne u odnosu na `MSS_DATA_DIR`. Popravljeno.
- Isti bug pronađen i popravljen u `background-worker.js` (cloudflared binarni alat, ComfyUI log)
  i u svih 6 postojećih `tools/INSTALIRAJ-*.ps1` instalacionih skripti (pisale su binarne alate
  pored sebe u `tools/`, umesto u upisivu lokaciju) — dodat `MSS_TOOLS_DIR` env most između
  `tool-runner.js` i PowerShell skripti, sa fallback-om na staro ponašanje za portable/ručno
  pokretanje.
- Novo: `storage-paths.js`, centralni modul za sve upisive putanje (projects/database/backups/
  logs/bridge/runtime/cache/temp/exports/images/videos/settings/secure/extension/models/workers).

## FAZA 3 — Lokalne biblioteke umesto CDN-a

- CSP dodat u prethodnoj verziji je tiho blokirao SVE CDN `<script>` pozive u
  `vendor-loader.js` (WaveSurfer, Meyda, Sortable, pica, smartcrop, colorthief, papaparse) —
  ključne audio funkcije nikad nisu radile u instaliranoj verziji bez interneta.
  Preuzete tačne verzije sa npm registrija, ubačene lokalno u `public/vendor/`, licence
  priložene (`VENDOR-LICENSES.txt`). Provereno stvarnim pokretanjem u browseru: 0 grešaka.

## FAZA 4 — Stem separation, transkripcija, automatsko pisanje teksta, alignment

- `audio-probe.js` — pravi FFprobe wrapper, nikad ne pretpostavlja trajanje.
- `audio-projects.js` + `storage-paths` — skladištenje projekata (`project.json` po projektu).
- `lyrics-parser.js` — parsira [Verse]/[Chorus] tagove, prepoznaje ponovljeni refren kao
  posebnu instancu, podržava srpsku latinicu i apostrofe.
- `stem-separation.js`, `transcription-provider.js` — wrapperi oko Demucs/faster-whisper sa
  keširanjem po audio hash-u i graceful fallback-om kad alat nije instaliran.
- `lyrics-alignment.js` — LyricsAlignmentEngine, poravnava tekst sa ASR preko dinamičkog
  programiranja (LCS + fuzzy poklapanje); dokazano da se ponovljeni refren poravnava sa svojim
  STVARNIM drugim pojavljivanjem, ne uvek sa prvim.
- `auto-lyrics.js` — kada korisnik nema tekst, program ga sam izvlači (vokal + kontrolna
  transkripcija miksa), grupiše u sekcije po pauzi, prepoznaje refren; `needsReview` je UVEK
  true za automatski tekst.

## FAZA 5 — MusicAnalysisEngine, ScenePlanner, stroga validacija

- `music-analysis.js` (librosa wrapper) + `bpm-candidates.js` — BPM se NIKAD ne "potvrđuje"
  automatski; generiše primary/half-time/double-time kandidate (dokazano na spec-ovom
  primeru: 158 BPM → 79 BPM half-time kandidat sa povišenim confidence-om).
- `scene-planner.js` — ScenePlanner, DP algoritam koji bira rezove po kvalitetu (refren/
  bridge > običan beat), NE mehanički na fiksne intervale. Hand-verifikovan test dokazuje
  da DP bira refren umesto dva slabija reza kad refren savršeno deli pesmu.
- `timeline-validator.js` — stroga provera (nema praznina/preklapanja), ScenePlanner-ov
  izlaz UVEK prolazi ovu validaciju.
- `scene-candidates.js` — pretvara poravnat tekst + muzičku analizu u kandidate za rez;
  POSLEDNJI refren dobija viši prioritet (`final_chorus_start`) od običnih refrena.

## FAZA 6 — Zaključani identitet, tetovaža, ImageGenerationProvider

- **Pravi, prethodno neispravljen bug**: stari `locked-girl-identity.js` je imao "obaveznu
  crvenu haljinu" ugrađenu — tačno ono što v15.5 spec zabranjuje. Zamenjen kompletnim
  verbatim tekstom iz spec-a (hair-length ograničenja, tačna pozicija tetovaže, garderoba
  po sceni). Verifikovano STVARNIM pokretanjem u browseru.
- `locked-identity-text.js` — server-strana kopija istog teksta (browser fajl koristi
  window/TextEncoder, ne može se require-ovati u server.js); test garantuje bajt-za-bajt sync.
- `tattoo-visibility.js`, `image-generation-provider.js` (FinalPromptBuilder) — sklapa finalni
  prompt u tačnom propisanom redosledu, automatski dodaje identitet, nikad ne dozvoljava
  kontradikciju (tattoo vidljiv/skriven vs. tekst prompta).

## FAZA 7 — Location/Wardrobe registri, Hook/VisualDiversity validatori

- `location-registry.js`, `wardrobe-registry.js` — sprečavaju ponavljanje lokacije/garderobe
  bez razloga; garderoba se NIKAD ne odbija zbog "nije crvena haljina", samo zbog starinskog
  stila bez istorijskog koncepta.
- `hook-scene-validator.js` — prve tri scene moraju imati tri različita hook tipa; finalni
  refren mora biti dramaturški vrhunac (hookScore ≥ prvog refrena).
- `visual-diversity-validator.js` — isti kadar najviše 2 uzastopne scene.

## FAZA 8 — CORS popravka, stabilan extension ID, dijagnostika

- **Dva prava CORS bug-a** u `server.js`: (1) zaglavlja su se dodavala SAMO na OPTIONS
  preflight, ne i na stvaran odgovor; (2) `Access-Control-Allow-Origin` je echo-ovao `Host`
  zaglavlje umesto stvarnog `Origin` zahteva. Oba popravljena strogom allow-listom.
- `extension-identity.js` — ekstenzija je ranije dobijala slučajan ID pri svakom ponovnom
  učitavanju; dodat pravi RSA ključ u `manifest.json` za stabilan 32-karakterni ID.
- `extension-stabilizer.js` — ekstenzija se kopira u `%LOCALAPPDATA%\...\Extension\VERZIJA\`
  umesto direktnog učitavanja iz (potencijalno read-only) instalacionog foldera.
- `GET /api/plus-bridge/diagnostics` — server-strani deo TEST 1–4 iz spec-a.
- Popravljen realan propust u `service-worker.js`: sirov "Failed to fetch" je curio do
  korisnika bez konteksta; sada se prepoznaje i zamenjuje tačnom porukom sa pravim portom.

## FAZA 9 — AI orchestration protokol (batch od 5 scena)

- `scene-batch-queue.js` — prati status svake scene (pending/prompted/locked/failed/skipped);
  restart nastavlja od poslednjeg stanja (dokazano JSON round-trip testom).
- `ai-response-validator.js` — validira AI odgovore PRE ulaska u pipeline: tačno 3 koncepta,
  storyboard scene sa svim obaveznim poljima, batch sa najviše 5 stavki, KRŠENJE ZAKLJUČANOG
  IDENTITETA (scena bez glavne devojke se odbija).
- Image i video promptovi su ODVOJENI zadaci (različiti batchId prefiksi, video zahteva da
  scena već ima zaključan image prompt).

## FAZA 10 — Biblioteka projekata, YouTube OAuth status

- `project-status.js` — status kartice se RAČUNA iz stvarnog stanja (nikad ručno postavljen).
- `duplicateProject`/`renameProject`/`archiveProject`/`deleteProjectPermanently`, pretraga/
  filter/sortiranje projekata.
- Otkriveno da REALAN YouTube OAuth flow (authorization code grant, DPAPI-šifrovano
  skladištenje, refresh token, više kanala) već postoji u kodu iz ranije verzije — nije
  ponovo građen. Dodat samo `GET /api/youtube/oauth-status` koji govori korisniku tačno šta
  nedostaje pre pokušaja povezivanja.

## FAZA 11 — Backup/recovery, izvoz formata

- `project-backup.js` — automatski backup PRE zamene storyboarda i pre velikog AI uvoza,
  zadržava poslednjih 10 verzija; "VRATI PRETHODNU VERZIJU" pravi novi backup pre vraćanja.
- `project-export.js` — JSON/TXT/CSV/SRT izvoz; `stripSecrets()` rekurzivno uklanja polja
  koja liče na tajne pre izvoza (odbrana, iako project.json po dizajnu ne čuva tajne).

## FAZA 12 — Finalni testovi, build, dokumentacija

- Verzija podignuta na 15.5.0 svuda gde utiče na stvarno ponašanje.
- **Pravi bug otkriven i popravljen STVARNIM pokretanjem spakovanog EXE-a**: klik na
  "ZATVORI PROGRAM" je prikazivao lažan "server se srušio" dijalog (server.js se gasi preko
  HTTP rute nezavisno od Electron-ovog shutdown toka). Popravljeno IPC signalom između
  server.js i main.js. Prvi pokušaj popravke je otkrio DRUGI bug (Electron procesi ostaju da
  vise) — uhvaćen pravim `tasklist` proverama, ne pretpostavkom, i ispravljen.
- `npm run pack:win` i `npm run dist:all` izvršeni uspešno; Setup i Portable EXE pokrenuti
  na ovoj mašini, `/health` i pun audio-projects tok (upload → probe → plan-scenes) provereni
  kroz PRAVI spakovani EXE, ne samo dev server.
- SHA-256 manifest izvornog koda regenerisan (164 fajla, prethodni je bio iz v15.3 ere).

## Testovi

Preko 32 samostalna test paketa, ~396 pojedinačnih provera, svi izvršeni stvarno (child
process spawn pravog servera preko HTTP-a, stvarni FFmpeg-generisani audio fajlovi, stvaran
browser preko preview servera, stvaran spakovan EXE) — ne mockovano, ne pretpostavljeno.
Pokreni sve odjednom: `npm test`.

## SHA-256 finalnih build artefakata (v15.5.0)

```
Muzicki-Spot-Studio-Free-Setup-v15.5.0.exe:    8D79FCDA835E6121C85B0A99169E50C8FDF74AD07E583112AF5BB189AE23F196
Muzicki-Spot-Studio-Free-Portable-v15.5.0.exe: 015A366B215382950A060FF453FEC50494F147B58CD1F0E6E36D047E6C5A3200
```

Oba fajla: `Get-AuthenticodeSignature` → `NotSigned` (nema code-signing sertifikata na
raspolaganju — Windows SmartScreen će prikazati upozorenje pri prvom pokretanju).

## POZNATA OGRANIČENJA

1. **Novi audio pipeline (FAZA 4–11) nije povezan sa glavnim UI-jem.** Backend je potpun i
   testiran preko REST API-ja, ali `public/index.html`/`app.js` i dalje koriste stari,
   tekst-zasnovani 9-koraka tok iz v15.4. Nova "MOJI SPOTOVI" početna strana (sekcija 23),
   waveform/storyboard editor (sekcija 26), i UI za image/video prompt batch-eve (sekcija
   21.3–21.5) nisu izgrađeni — samo API rute koje bi ih pokretale.
2. **Stem separation (Demucs), transkripcija (faster-whisper), muzička analiza (librosa) nisu
   stvarno pokrenuti ni na jednoj pesmi u ovoj sesiji.** Alati nisu instalirani na razvojnoj
   mašini; svi moduli imaju dokazano ispravnu fallback logiku (testirano), ali end-to-end
   provera sa pravim pevanim vokalom ostaje da se uradi na mašini gde su alati instalirani
   preko panela LOKALNI ALATI.
3. **YouTube OAuth nije testiran end-to-end** — zahteva korisnikov sopstveni Google Cloud
   projekat/kredencijale, koje AI ne može sam obezbediti. Kod postoji i ispravan je
   (nasleđen iz ranije verzije + nova status ruta), ali stvaran login tok nije proveren.
4. **ZIP/PDF/EDL izvoz formati nisu implementirani** (sekcija 32) — zahtevaju biblioteke koje
   trenutno nisu zavisnosti projekta. JSON/TXT/CSV/SRT rade i testirani su.
5. **NSIS install wizard klik-kroz i deinstalacija nisu automatski testirani** (zahteva
   interaktivan GUI koji se ne može pouzdano automatizovati iz ne-elevated shell-a) — sam
   instalacioni EXE je napravljen, hash-ovan i pokrenut (portable varijanta), ali sam čarobnjak
   nije proveren klikom kroz korake.
6. **Nema code-signing sertifikata** — oba finalna EXE-a su `NotSigned`. SmartScreen upozorenje
   je očekivano pri prvom pokretanju kod krajnjeg korisnika.
7. **"MOJI SPOTOVI" UI, ScenePlanner podešavanja u UI-ju, HookSceneValidator/VisualDiversity
   rezultati se NE prikazuju nigde u interfejsu** — svi validatori rade i testirani su na
   nivou API-ja/modula, ali nema UI panela koji bi njihove rezultate prikazao korisniku.
