# Licence fontova

`FontManager` (`PROGRAM - NE BRISATI/font-manager.js`) skenira **samo fontove koji su već
instalirani na korisnikovoj mašini** — sistemske (`C:\Windows\Fonts`) i korisničke
(`%LOCALAPPDATA%\Microsoft\Windows\Fonts`). Program **ne isporučuje, ne bundluje i ne
distribuira nijedan font fajl** uz instalaciju — nema licencnog rizika sa te strane.

## `license` polje u rezultatu `listAvailableFonts()`

- `"system"` — font je deo Windows instalacije korisnika (licenca prati OS/proizvođača fonta,
  van kontrole ovog programa).
- `"unknown"` — korisnički font čiju licencu program ne može automatski utvrditi (nema metapodatak
  u TTF/OTF `name` tabeli koji bi pouzdano razlikovao besplatan od komercijalnog fonta).

## Preporučeni podrazumevani fontovi u presetima

`text-style-presets.js` referencira samo široko dostupne sistemske fontove (Inter/Arial,
Georgia/Times New Roman, Courier New/Consolas, Segoe Script/Comic Sans MS) kao **preferirane**
izbore — svaki preset ima i `fallback` polje. Render pipeline uvek prolazi kroz
`resolveFallbackFont()` pre upotrebe fonta koji nije potvrđeno dostupan na mašini.

## Obaveza korisnika

Ako korisnik doda sopstveni (komercijalni) font u korisnički folder, odgovornost za poštovanje
licence tog fonta ostaje na korisniku — program ga tretira samo kao dostupan resurs za render,
ne proverava niti garantuje njegovu licencu.
