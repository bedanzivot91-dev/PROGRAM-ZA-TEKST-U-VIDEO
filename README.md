# PROGRAM ZA TEKST U VIDEO

Ovo je **Muzicki Spot Studio Free v15.6.1** — lokalni Windows program za pravljenje muzičkog spota od pesme, teksta, scena i završnog video projekta.

## Instalacija na Windowsu

1. Na GitHubu klikni **Code → Download ZIP**.
2. Raspakuj **ceo ZIP** u jedan folder.
3. Pokreni **INSTALIRAJ-PROGRAM.bat**.
4. Skripta sama pronalazi najnoviju verziju installera. Ako postoji samo u delovima, bezbedno ih sastavlja po redosledu i tek onda pokreće installer.

Ne pokreći pojedinačne `.part001`, `.part002` itd. fajlove. Oni su delovi jednog EXE fajla.

Za portable izdanje pokreni **SASTAVI-PROGRAM-PORTABLE.bat**. I ta skripta sama pronalazi najnoviju dostupnu verziju i proverava da delovi nisu preskočeni.

## Provera paketa

`CHECKSUMS-SHA256.txt` sadrži SHA-256 vrednosti finalnog Setup i Portable EXE-a i commit izvornog koda iz kog su napravljeni. GitHub Actions pre objave izvršava JavaScript proveru, static/server/Electron testove, kompletan `npm test`, production dependency audit, NSIS/Portable build, silent install/uninstall i split/rebuild SHA-256 test.

## Šta je dodato u v15.6.1

- kompletan `NOVI STUDIO` tok: projekat → audio → tekst → auto-lyrics/alignment → analiza → ScenePlanner → storyboard → izvoz;
- Lyrics Overlay track/cue editor i SRT/VTT/ASS/JSON izvoz;
- ZIP/PDF/EDL projekat export;
- animirani ASS/libass tekst render;
- backup/restore kontrole i image/video prompt batch kontrole;
- opcioni pravi OpenCV face detector sa lokalnom instalacijom kroz panel alata;
- verzijski nezavisne skripte za sastavljanje Setup/Portable paketa;
- automatsko osvežavanje `INSTALLER/` i `PORTABLE/` delova nakon uspešnog `main` Windows builda.

Izvorni kod, testovi i dokumentacija nalaze se u folderu `SOURCE`.
