'use strict';

// FontManager (sekcija 6 dodatka o tekstu na videu). "Nemoj samo hardkodirati listu naziva
// fontova koji možda nisu instalirani. Stvarno proveri dostupnost." — ovaj modul STVARNO
// čita fajlove iz C:\Windows\Fonts i korisničkog fonts foldera, parsira TTF/OTF binarni
// format (name/cmap tabele) da izvuče pravo ime porodice i proveri da li font ima glifove
// za srpsku latinicu (č ć š ž đ) — ne pretpostavlja, stvarno proverava cmap tabelu.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SYSTEM_FONTS_DIR = 'C:\\Windows\\Fonts';
const SYSTEM_FONTS_DIRS = process.platform === 'win32'
  ? [SYSTEM_FONTS_DIR]
  : process.platform === 'darwin'
    ? ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local', 'share', 'fonts')];
function userFontsDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Microsoft', 'Windows', 'Fonts');
}

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc']);

// Srpska latinica dijakritici + osnovni ASCII skup koji font MORA imati da bude upotrebljiv.
const SERBIAN_LATIN_CODEPOINTS = {
  'č': 0x010D, 'Č': 0x010C, 'ć': 0x0107, 'Ć': 0x0106,
  'š': 0x0161, 'Š': 0x0160, 'ž': 0x017E, 'Ž': 0x017D,
  'đ': 0x0111, 'Đ': 0x0110
};
// Ćirilica — proveravamo samo bazni raspon, koristi se za informativni supportsCyrillic flag.
const CYRILLIC_SAMPLE_CODEPOINTS = { 'а': 0x0430, 'б': 0x0431, 'ш': 0x0448 };

// --- Binarni TTF/OTF parser (bez spoljnih zavisnosti) ---

function readTableDirectory(buffer, offset = 0) {
  const sfntVersion = buffer.readUInt32BE(offset);
  if (sfntVersion !== 0x00010000 && sfntVersion !== 0x4F54544F /* 'OTTO' */ && sfntVersion !== 0x74727565 /* 'true' */) {
    return null;
  }
  const numTables = buffer.readUInt16BE(offset + 4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const recordOffset = offset + 12 + i * 16;
    const tag = buffer.toString('ascii', recordOffset, recordOffset + 4);
    const tableOffset = buffer.readUInt32BE(recordOffset + 8);
    const length = buffer.readUInt32BE(recordOffset + 12);
    tables[tag] = { offset: tableOffset, length };
  }
  return tables;
}

// TTC (font collection) fajl sadrži više fontova — vraćamo tabele za PRVI font u kolekciji.
function readSfntTables(buffer) {
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'ttcf') {
    const numFonts = buffer.readUInt32BE(8);
    if (numFonts < 1) return null;
    const firstFontOffset = buffer.readUInt32BE(12);
    return readTableDirectory(buffer, firstFontOffset);
  }
  return readTableDirectory(buffer, 0);
}

function decodeNameRecordText(buffer, recordOffset, platformId, length) {
  // KRITIČNO: subarray() vraća VIEW koji deli memoriju sa originalnim baferom. Font fajlovi često
  // deduplikuju identične stringove — više name zapisa (npr. family i full name) zna da pokazuje na
  // ISTI string offset. swap16() menja bafer IN PLACE, pa bi drugo čitanje istog offseta duplo
  // zamenilo bajtove (vratilo bi ih u originalni BE poredak, ali dekodiranje i dalje očekuje LE) i
  // proizvelo nečitljive znakove. Kopija (Buffer.from) sprečava da mutacija procuri u deljeni bafer.
  const raw = Buffer.from(buffer.subarray(recordOffset, recordOffset + length));
  // Windows (3) i Unicode (0) platforme koriste UTF-16BE; Macintosh (1) koristi obično ASCII/MacRoman.
  if (platformId === 3 || platformId === 0) return raw.swap16().toString('utf16le').replace(/\0/g, '');
  return raw.toString('latin1');
}

function parseNameTable(buffer, table) {
  if (!table) return {};
  const base = table.offset;
  const count = buffer.readUInt16BE(base + 2);
  const stringOffset = base + buffer.readUInt16BE(base + 4);
  const names = {};
  for (let i = 0; i < count; i += 1) {
    const recBase = base + 6 + i * 12;
    const platformId = buffer.readUInt16BE(recBase);
    const nameId = buffer.readUInt16BE(recBase + 6);
    const length = buffer.readUInt16BE(recBase + 8);
    const recOffset = buffer.readUInt16BE(recBase + 10);
    if (length === 0) continue;
    try {
      const text = decodeNameRecordText(buffer, stringOffset + recOffset, platformId, length);
      if (text && !names[nameId]) names[nameId] = text; // prvo pronađeno ime za taj nameID je dovoljno
    } catch { /* preskoči neispravan zapis, ne ruši ceo parser */ }
  }
  return names;
}

// Format 4 cmap subtabela (BMP, format koji pokriva srpsku latinicu Extended-A blok).
function checkGlyphInFormat4(buffer, subtableOffset, codepoint) {
  const segCountX2 = buffer.readUInt16BE(subtableOffset + 6);
  const segCount = segCountX2 / 2;
  const endCodesOffset = subtableOffset + 14;
  const startCodesOffset = endCodesOffset + segCountX2 + 2;
  const idDeltaOffset = startCodesOffset + segCountX2;
  const idRangeOffsetOffset = idDeltaOffset + segCountX2;

  for (let i = 0; i < segCount; i += 1) {
    const endCode = buffer.readUInt16BE(endCodesOffset + i * 2);
    if (codepoint > endCode) continue;
    const startCode = buffer.readUInt16BE(startCodesOffset + i * 2);
    if (codepoint < startCode) return false;
    const idRangeOffset = buffer.readUInt16BE(idRangeOffsetOffset + i * 2);
    const idDelta = buffer.readInt16BE(idDeltaOffset + i * 2);
    if (idRangeOffset === 0) {
      const glyphId = (codepoint + idDelta) & 0xFFFF;
      return glyphId !== 0;
    }
    const glyphIndexAddress = idRangeOffsetOffset + i * 2 + idRangeOffset + (codepoint - startCode) * 2;
    if (glyphIndexAddress + 2 > buffer.length) return false;
    // Prisustvo glifa se proverava PRE dodavanja idDelta (0 znači "nema glifa" nezavisno od idDelta) —
    // idDelta bi se sabrao samo da se dobije KONAČAN glyph ID za render, što ovde nije potrebno.
    const glyphId = buffer.readUInt16BE(glyphIndexAddress);
    return glyphId !== 0;
  }
  return false;
}

function findUnicodeCmapSubtable(buffer, cmapTable) {
  if (!cmapTable) return null;
  const base = cmapTable.offset;
  const numTables = buffer.readUInt16BE(base + 2);
  let best = null;
  for (let i = 0; i < numTables; i += 1) {
    const recBase = base + 4 + i * 8;
    const platformId = buffer.readUInt16BE(recBase);
    const encodingId = buffer.readUInt16BE(recBase + 2);
    const subtableOffset = base + buffer.readUInt32BE(recBase + 4);
    const format = buffer.readUInt16BE(subtableOffset);
    // Preferiramo Windows Unicode BMP (3,1) format 4 — najčešći i dovoljan za srpsku latinicu.
    if (platformId === 3 && encodingId === 1 && format === 4) return subtableOffset;
    if (format === 4 && !best) best = subtableOffset;
  }
  return best;
}

function checkGlyphCoverage(buffer, tables, codepointMap) {
  const cmapSubtableOffset = findUnicodeCmapSubtable(buffer, tables.cmap);
  if (cmapSubtableOffset === null) return { checked: false, coverage: {} };
  const coverage = {};
  for (const [char, codepoint] of Object.entries(codepointMap)) {
    try { coverage[char] = Boolean(checkGlyphInFormat4(buffer, cmapSubtableOffset, codepoint)); }
    catch { coverage[char] = false; }
  }
  return { checked: true, coverage };
}

// Čita i parsira JEDAN font fajl sa diska — vraća null ako fajl nije validan font (ne baca).
function inspectFontFile(filePath) {
  let buffer;
  try { buffer = fs.readFileSync(filePath); } catch { return null; }
  if (buffer.length < 12) return null;
  const tables = readSfntTables(buffer);
  if (!tables) return null;

  const names = parseNameTable(buffer, tables.name);
  // nameID 16 (typographic family) je precizniji kad postoji, inače 1 (family), inače 4 (full name).
  const family = names[16] || names[1] || names[4] || path.basename(filePath, path.extname(filePath));
  const fullName = names[4] || family;

  const serbianCheck = checkGlyphCoverage(buffer, tables, SERBIAN_LATIN_CODEPOINTS);
  const cyrillicCheck = checkGlyphCoverage(buffer, tables, CYRILLIC_SAMPLE_CODEPOINTS);
  const supportsSerbianLatin = serbianCheck.checked && Object.values(serbianCheck.coverage).every(Boolean);
  const supportsCyrillic = cyrillicCheck.checked && Object.values(cyrillicCheck.coverage).some(Boolean);

  return {
    family,
    fullName,
    supportsSerbianLatin,
    supportsCyrillic,
    serbianGlyphCoverage: serbianCheck.coverage,
    glyphCheckPerformed: serbianCheck.checked
  };
}

function scanFontDirectory(dir, source) {
  const results = [];
  const pending = [dir];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!FONT_EXTENSIONS.has(ext)) continue;
      const inspected = inspectFontFile(filePath);
      if (!inspected) continue; // stvarno neispravan/nečitljiv fajl — tiho preskoči, ne prijavljuj kao dostupan
      results.push({
        fontId: crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16),
        family: inspected.family,
        fullName: inspected.fullName,
        source,
        filePath,
        license: source === 'system' ? 'system' : 'unknown',
        category: [],
        supportsSerbianLatin: inspected.supportsSerbianLatin,
        supportsCyrillic: inspected.supportsCyrillic,
        available: true
      });
    }
  }
  return results;
}

// Glavna funkcija — STVARNO skenira fajl sistem, ne vraća hardkodiranu listu.
function listAvailableFonts({ includeSystem = true, includeUser = true, extraDirs = [] } = {}) {
  const fonts = [];
  if (includeSystem) {
    for (const dir of SYSTEM_FONTS_DIRS) {
      if (fs.existsSync(dir)) fonts.push(...scanFontDirectory(dir, 'system'));
    }
  }
  if (includeUser) {
    const userDir = userFontsDir();
    if (fs.existsSync(userDir)) fonts.push(...scanFontDirectory(userDir, 'user'));
  }
  for (const dir of extraDirs) {
    if (fs.existsSync(dir)) fonts.push(...scanFontDirectory(dir, 'user'));
  }
  return fonts;
}

// Bira fallback font (mora podržavati srpsku latinicu) kada izabrani font nema potreban znak.
function resolveFallbackFont(availableFonts, preferredFamily = '') {
  const candidates = availableFonts.filter(f => f.supportsSerbianLatin);
  if (!candidates.length) return null;
  const preferred = candidates.find(f => f.family.toLowerCase() === preferredFamily.toLowerCase());
  return preferred || candidates[0];
}

module.exports = {
  listAvailableFonts, inspectFontFile, resolveFallbackFont,
  SYSTEM_FONTS_DIR, SYSTEM_FONTS_DIRS, userFontsDir, SERBIAN_LATIN_CODEPOINTS, FONT_EXTENSIONS
};
