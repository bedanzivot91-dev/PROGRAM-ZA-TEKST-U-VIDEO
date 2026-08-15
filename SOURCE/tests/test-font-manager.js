'use strict';
// Testira font-manager.js — sekcija 6 dodatka o tekstu na videu. STVARNO parsira prave font
// fajlove sa ove Windows mašine (C:\Windows\Fonts), ne mockuje TTF/OTF binarni format.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { inspectFontFile, listAvailableFonts, resolveFallbackFont, SYSTEM_FONTS_DIR } = require('../PROGRAM - NE BRISATI/font-manager');

let pass = 0;
let fail = 0;
let skip = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}
function skipTest(label, reason) { skip += 1; console.log(`  [SKIP] ${label} — ${reason}`); }

console.log('== FontManager testovi (pravi TTF/OTF fajlovi sa ove mašine) ==');

const arialPath = path.join(SYSTEM_FONTS_DIR, 'arial.ttf');
const wingdingsPath = path.join(SYSTEM_FONTS_DIR, 'wingding.ttf');
const hasArial = fs.existsSync(arialPath);
const hasWingdings = fs.existsSync(wingdingsPath);

if (hasArial) {
  test('inspectFontFile ispravno čita family I fullName iz Arial-a (bez korupcije zajedničkih stringova)', () => {
    const info = inspectFontFile(arialPath);
    assert.strictEqual(info.family, 'Arial');
    assert.strictEqual(info.fullName, 'Arial');
  });

  test('Arial STVARNO ima glifove za svih 10 srpskih dijakritika (č ć š ž đ, veliko/malo)', () => {
    const info = inspectFontFile(arialPath);
    assert.strictEqual(info.supportsSerbianLatin, true);
    assert.strictEqual(Object.values(info.serbianGlyphCoverage).every(Boolean), true);
    assert.strictEqual(Object.keys(info.serbianGlyphCoverage).length, 10);
  });

  test('Arial ima glifCheckPerformed=true (cmap tabela je stvarno pronađena i parsirana)', () => {
    const info = inspectFontFile(arialPath);
    assert.strictEqual(info.glyphCheckPerformed, true);
  });
} else {
  skipTest('Arial testovi', `${arialPath} ne postoji na ovoj mašini`);
}

if (hasWingdings) {
  test('Wingdings (simbol font) ISPRAVNO NEMA podršku za srpsku latinicu (negativan slučaj)', () => {
    const info = inspectFontFile(wingdingsPath);
    assert.strictEqual(info.supportsSerbianLatin, false);
  });
} else {
  skipTest('Wingdings test', `${wingdingsPath} ne postoji na ovoj mašini`);
}

test('inspectFontFile vraća null za fajl koji NIJE validan font (ne baca grešku)', () => {
  const tmpFile = path.join(os.tmpdir(), `mss-fake-font-${Date.now()}.ttf`);
  fs.writeFileSync(tmpFile, 'ovo nije font, samo obican tekst');
  const result = inspectFontFile(tmpFile);
  assert.strictEqual(result, null);
  fs.unlinkSync(tmpFile);
});

test('inspectFontFile vraća null za nepostojeći fajl (ne baca grešku)', () => {
  const result = inspectFontFile(path.join(os.tmpdir(), 'ne-postoji-nikad-' + Date.now() + '.ttf'));
  assert.strictEqual(result, null);
});

if (hasArial) {
  test('listAvailableFonts STVARNO skenira folder na disku — koristi kopije pravih fontova, ne hardkodiranu listu', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-fontscan-test-'));
    fs.copyFileSync(arialPath, path.join(tmpDir, 'arial.ttf'));
    fs.writeFileSync(path.join(tmpDir, 'nije-font.txt'), 'ignoriši me'); // ne-font ekstenzija
    fs.writeFileSync(path.join(tmpDir, 'losfont.ttf'), 'pokvaren font fajl'); // font ekstenzija, ali neispravan sadržaj

    const found = listAvailableFonts({ includeSystem: false, includeUser: false, extraDirs: [tmpDir] });
    assert.strictEqual(found.length, 1, 'samo validan arial.ttf treba biti pronađen, ne .txt fajl niti pokvaren .ttf');
    assert.strictEqual(found[0].family, 'Arial');
    assert.strictEqual(found[0].source, 'user');
    assert.strictEqual(found[0].supportsSerbianLatin, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('svaki pronađeni font dobija JEDINSTVEN fontId', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-fontscan-id-test-'));
    fs.copyFileSync(arialPath, path.join(tmpDir, 'arial-copy1.ttf'));
    fs.copyFileSync(arialPath, path.join(tmpDir, 'arial-copy2.ttf'));
    const found = listAvailableFonts({ includeSystem: false, includeUser: false, extraDirs: [tmpDir] });
    assert.strictEqual(found.length, 2);
    assert.notStrictEqual(found[0].fontId, found[1].fontId, 'različiti fajlovi (različite putanje) moraju imati različit fontId čak i sa istim sadržajem');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
}

test('listAvailableFonts na praznom/nepostojećem folderu ne baca grešku, vraća prazan niz', () => {
  const result = listAvailableFonts({ includeSystem: false, includeUser: false, extraDirs: [path.join(os.tmpdir(), 'ne-postoji-' + Date.now())] });
  assert.deepStrictEqual(result, []);
});

test('resolveFallbackFont bira font koji podržava srpsku latinicu', () => {
  const fonts = [
    { family: 'Wingdings', supportsSerbianLatin: false },
    { family: 'Arial', supportsSerbianLatin: true },
    { family: 'Calibri', supportsSerbianLatin: true }
  ];
  const fallback = resolveFallbackFont(fonts, 'Calibri');
  assert.strictEqual(fallback.family, 'Calibri');
});

test('resolveFallbackFont vraća PRVI font sa podrškom kada preferirani nije pronađen', () => {
  const fonts = [{ family: 'Wingdings', supportsSerbianLatin: false }, { family: 'Arial', supportsSerbianLatin: true }];
  const fallback = resolveFallbackFont(fonts, 'NepostojeciFont');
  assert.strictEqual(fallback.family, 'Arial');
});

test('resolveFallbackFont vraća null kada NIJEDAN font ne podržava srpsku latinicu', () => {
  const fonts = [{ family: 'Wingdings', supportsSerbianLatin: false }];
  assert.strictEqual(resolveFallbackFont(fonts, 'Wingdings'), null);
});

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo, ${skip} preskočeno ==`);
process.exit(fail ? 1 : 0);
