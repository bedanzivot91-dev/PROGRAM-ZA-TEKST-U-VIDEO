# WINDOWS EXE — kratko uputstvo za ručnu proveru

## 1. Instalacija
1. Pokreni `Muzicki-Spot-Studio-Free-Setup-v15.4.0.exe` iz `INSTALLER/` foldera.
2. Windows može prikazati SmartScreen upozorenje „Windows je zaštitio vaš računar" — program NIJE digitalno potpisan (nema code-signing sertifikata). Klikni „Više informacija" → „Pokreni ipak".
3. Izaberi folder za instalaciju (ili ostavi podrazumevani) i da li želiš prečicu na Desktop-u.
4. Sačekaj da se instalacija završi.

## 2. Pokretanje
1. Pokreni „Muzicki Spot Studio" iz Start Menu-a ili sa Desktop prečice.
2. Program treba da se otvori u svom prozoru (ne u Chrome/Edge tabu) u roku od par sekundi.
3. Pokreni program PONOVO dok je već otvoren — drugi pokušaj treba samo da fokusira postojeći prozor, ne da otvori novi.

## 3. Extension (ChatGPT Plus most)
1. U programu, Korak 3 → dugme za instalaciju/proveru Extension-a.
2. Otvori `chrome://extensions`, uključi „Developer mode", „Load unpacked" i izaberi folder iz `EXTENSION/MSS-ChatGPT-Plus-Most-v15.4.0`.
3. Vrati se u program i klikni „Proveri Extension" — status mora tačno da pokaže da li je dodatak pronađen i da li se verzija poklapa (15.4.0).

## 4. Test generisanja (ChatGPT Plus most)
1. Otvori privatni GPT iz programa (dugme u Koraku 3).
2. Klikni „Testiraj most" u programu — treba da dobiješ potvrdu da su program, dodatak i otvoren ChatGPT tab povezani.

## 5. ComfyUI (opciono, lokalno)
1. Ako imaš ComfyUI instaliran, poveži putanju u Koraku 9.
2. Pokreni `POKRENI-COMFYUI-ZA-STUDIO.bat` iz foldera dodatnih alata ako ComfyUI još ne radi.
3. Status u programu treba da pokaže da je ComfyUI dostupan.

## 6. Izvoz
1. U bilo kom koraku, koristi dugme za izvoz projekta.
2. Proveri da fajl stvarno stigne u prikazanu putanju (obično `Dokumenti` ili folder koji izabereš).

## 7. Deinstalacija
1. Windows Settings → Apps → „Muzicki Spot Studio Free" → Uninstall.
2. Projekti i podaci u `%APPDATA%\Muzicki Spot Studio Free` NE SMEJU biti automatski obrisani običnom deinstalacijom (podešeno `deleteAppDataOnUninstall: false`) — proveri da folder i dalje postoji posle deinstalacije.

## Ako se pojavi „Lokalni server nije uspeo da se pokrene"
Najčešći uzrok: Windows Defender (ili drugi antivirus) skenira SVEŽE raspakovane/instalirane fajlove pri PRVOM pokretanju, što može trajati duže od par sekundi — program sada čeka do 45 sekundi i nudi dugme „Pokušaj ponovo" umesto da odmah odustane. Ako se greška ponavlja:
1. Klikni „Pokušaj ponovo" još jednom ili dvaput — najčešće se drugi/treći pokušaj uspešno pokrene jer je antivirus već završio proveru fajlova.
2. Ako se i dalje ponavlja, dodaj folder programa (`%LOCALAPPDATA%\Programs\Muzicki Spot Studio Free` za instaliranu verziju, ili folder gde je portable EXE) u izuzetke Windows Defender-a: Windows Security → Virus & threat protection → Manage settings → Add or remove exclusions.
3. Otvori `%APPDATA%\Muzicki Spot Studio Free\logs\server-stderr.log` i `electron-main.log` — ako sadrže stvarnu grešku (ne prazno), to je pravi uzrok, ne antivirus.

## Napomena o proveri koja nije mogla da se izvrši automatski
Sam instalacioni čarobnjak (klik kroz NSIS ekrane) i deinstalacija nisu mogli automatski da se testiraju iz komandne linije u ovoj sesiji (NSIS je zatražio UAC elevaciju koju automatizovan shell ne može da potvrdi/prekine). Sam EXE fajl je proveren (napravljen, ispravne veličine, SHA-256 izračunat) i osnovna aplikacija unutar njega je stvarno pokrenuta i testirana (portable i unpacked varijanta) — ostaje da se sam instalacioni wizard ručno provede jednom na ovom ili sličnom Windows računaru.
