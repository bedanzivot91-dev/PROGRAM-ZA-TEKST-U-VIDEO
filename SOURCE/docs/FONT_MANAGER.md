# FontManager

`PROGRAM - NE BRISATI/font-manager.js` — stvaran binarni parser TTF/OTF/TTC fajlova (sfnt
tabele), bez spoljnih zavisnosti. Ne pretpostavlja koji su fontovi instalirani — čita ih sa
diska (`C:\Windows\Fonts` + korisnički `%LOCALAPPDATA%\Microsoft\Windows\Fonts`).

## Šta parsira

- **Table directory** (`0x00010000`/`OTTO`/`true`/`ttcf` magic broj) — pronalazi `name` i `cmap` tabele.
- **`name` tabela** — izvlači family (nameID 16 ili 1), full name (nameID 4). UTF-16BE za
  Windows/Unicode platforme, MacRoman/latin1 za Macintosh platformu.
- **`cmap` tabela, format 4** (BMP) — binarna pretraga segCount/startCode/endCode/idDelta/
  idRangeOffset da proveri da li font STVARNO ima glif za dati kodpoint.

## Provera srpske latinice

`SERBIAN_LATIN_CODEPOINTS` pokriva č/ć/š/ž/đ (veliko i malo, 10 znakova ukupno).
`inspectFontFile(path).supportsSerbianLatin` je `true` samo ako font ima **svih 10** glifova —
provereno stvarnim čitanjem cmap tabele, ne pretpostavkom po imenu fonta.

## API

```js
const { listAvailableFonts, inspectFontFile, resolveFallbackFont } = require('./font-manager');

listAvailableFonts({ includeSystem: true, includeUser: true, extraDirs: [] });
// → [{ fontId, family, fullName, source, filePath, supportsSerbianLatin, supportsCyrillic, ... }]

inspectFontFile('C:/Windows/Fonts/arial.ttf');
// → { family, fullName, supportsSerbianLatin, supportsCyrillic, serbianGlyphCoverage, glyphCheckPerformed }
// → null ako fajl nije validan font (NIKAD ne baca grešku za neispravan/nepostojeći fajl)

resolveFallbackFont(availableFonts, 'Preferirani Font');
// → font koji podržava srpsku latinicu (preferirani ako ga ima, inače prvi dostupan; null ako nijedan ne podržava)
```

## Poznata i ispravljena zamka (dokumentovano jer je suptilna)

`Buffer.prototype.subarray()` vraća VIEW koji deli memoriju sa originalnim baferom;
`Buffer.prototype.swap16()` mutira **in place**. Font fajlovi često deduplikuju identične
name-table stringove (više `nameID` zapisa pokazuje na isti offset) — poziv `swap16()` na
subarray-u već pročitanog stringa bi drugi put pokvario bajtove. Ispravka:
`Buffer.from(buffer.subarray(...))` pravi kopiju pre mutacije. Testirano protiv pravog
`arial.ttf` (koji deduplikuje "Arial" kao i family i full name).

## Bezbednost fontova (sekcija 24 dodatka)

- Font fajlovi se NIKAD ne izvršavaju — samo se binarno parsiraju kao podaci.
- Skeniranje foldera je ograničeno na `.ttf`/`.otf`/`.ttc` ekstenzije (`FONT_EXTENSIONS`).
- Korisnički fontovi se čuvaju van `Program Files` (u `%LOCALAPPDATA%`), nikad u instalacioni folder.
