# Kompletna popravka programa — 2026-09-15

Ovaj repair pass polazi od `main` posle spajanja PR #1.

## Završeno u ovom prolazu

- `NOVI STUDIO` više nije samo Lyrics Overlay pomoćni panel.
- Dodato je kreiranje, preimenovanje, dupliranje, arhiviranje i trajno brisanje projekata.
- Dodato je stvarno učitavanje audio fajla kroz postojeću `/api/audio-projects/:id/audio` rutu.
- Dodati su unos/izmena teksta, automatsko izvlačenje teksta, alignment i muzička analiza.
- ScenePlanner je dostupan iz UI-ja i storyboard rezultat se prikazuje korisniku.
- Lyrics Overlay CRUD i export ostaju povezani.
- Project export podržava JSON/TXT/CSV/SRT/EDL/PDF/ZIP formate iz UI-ja.
- Statički test sada proverava da kompletan UI workflow stvarno pokazuje na postojeće server rute.
- Windows CI se izvršava za svaku `chatgpt/**` repair granu, ne samo za jednu staru granu.

## Stavke koje zavise od spoljnog okruženja

Ove stavke se ne smeju lažno označiti kao end-to-end potvrđene bez odgovarajućih spoljnjih resursa:

- Demucs model/alat za stem separation.
- faster-whisper model/alat za stvarnu transkripciju i alignment.
- librosa/Python okruženje za realnu muzičku analizu.
- Google OAuth kredencijali i korisnički Google nalog.
- Windows code-signing sertifikat.
- Pravi face-detection model/biblioteka.

Za njih program mora imati jasan status/fallback i ne sme da ruši projekat kada alat nije dostupan.
