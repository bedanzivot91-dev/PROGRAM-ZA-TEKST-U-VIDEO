'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const fullVersion = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(fullVersion)) throw new Error(`Neispravna package verzija: ${fullVersion}`);
const protocolVersion = fullVersion.split('.').slice(0, 2).join('.');
const checkOnly = process.argv.includes('--check');

const targets = [
  ['server.js', 'server protocol'],
  ['launcher.js', 'launcher protocol'],
  ['background-worker.js', 'background-worker protocol'],
  ['research-engine.js', 'research-engine protocol']
].map(([name, label]) => ({
  file: path.join(PROGRAM, name),
  pattern: /const VERSION = '[^']+';/,
  expected: `const VERSION = '${protocolVersion}';`,
  label
}));

let changed = 0;
for (const target of targets) {
  const original = fs.readFileSync(target.file, 'utf8');
  const match = original.match(target.pattern);
  if (!match) throw new Error(`${target.label}: VERSION konstanta nije pronađena u ${target.file}`);
  if (match[0] === target.expected) {
    console.log(`[OK] ${target.label} = ${protocolVersion}`);
    continue;
  }
  if (checkOnly) {
    console.error(`[FAIL] ${target.label}: pronađeno ${match[0]}, očekivano ${target.expected}`);
    process.exitCode = 1;
    continue;
  }
  const updated = original.replace(target.pattern, target.expected);
  fs.writeFileSync(target.file, updated, 'utf8');
  changed += 1;
  console.log(`[FIX] ${target.label}: ${match[0]} -> ${target.expected}`);
}

// Dodatni osigurač: nijedan drugi produkcioni root modul ne sme tiho da ostane
// na starom x.y VERSION broju. Ako se takva konstanta doda u budućnosti,
// audit je odmah vidi čak i ako fajl nije ručno dodat u targets iznad.
const knownTargetFiles = new Set(targets.map(target => path.resolve(target.file)));
for (const entry of fs.readdirSync(PROGRAM, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const file = path.join(PROGRAM, entry.name);
  if (knownTargetFiles.has(path.resolve(file))) continue;
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/const VERSION = ['"](\d+\.\d+)(?:\.\d+)?['"];/);
  if (!match) continue;
  if (match[1] !== protocolVersion) {
    console.error(`[FAIL] ${entry.name}: pronađena zastarela runtime VERSION=${match[1]}, očekivano ${protocolVersion}. Dodaj modul u centralni version sync ili ukloni duplu verziju.`);
    process.exitCode = 1;
  } else {
    console.log(`[OK] ${entry.name} dodatna VERSION konstanta = ${match[1]}`);
  }
}

// Research engine normalizuje yt-dlp polja u camelCase (uploadDate/viewCount),
// pa parseDateValue mora da prihvati i normalizovana i sirova imena polja.
// Bez ovoga publicMomentum tretira normalizovane video zapise kao stare 365 dana.
const researchFile = path.join(PROGRAM, 'research-engine.js');
const researchOriginal = fs.readFileSync(researchFile, 'utf8');
const legacyDateLine = "const raw = clean(entry?.upload_date || entry?.release_date, 16);";
const normalizedDateLine = "const raw = clean(entry?.uploadDate || entry?.upload_date || entry?.releaseDate || entry?.release_date, 16);";
if (researchOriginal.includes(normalizedDateLine)) {
  console.log('[OK] research-engine parseDateValue prihvata normalizovana i raw polja datuma');
} else if (researchOriginal.includes(legacyDateLine)) {
  if (checkOnly) {
    console.error('[FAIL] research-engine parseDateValue ne čita uploadDate/releaseDate normalizovana polja.');
    process.exitCode = 1;
  } else {
    fs.writeFileSync(researchFile, researchOriginal.replace(legacyDateLine, normalizedDateLine), 'utf8');
    changed += 1;
    console.log('[FIX] research-engine parseDateValue sada čita uploadDate/releaseDate i raw polja');
  }
} else {
  console.error('[FAIL] research-engine parseDateValue ugovor nije pronađen; potrebna je ručna provera.');
  process.exitCode = 1;
}

// Sandboxed preload ne sme da require()-uje ../package.json. Umesto toga sadrži
// generisanu APP_VERSION konstantu koju ovaj centralni sync održava iz package.json.
const preloadFile = path.join(ROOT, 'desktop', 'preload.js');
const preloadOriginal = fs.readFileSync(preloadFile, 'utf8');
const preloadPattern = /const APP_VERSION = '[^']+';/;
const preloadExpected = `const APP_VERSION = '${fullVersion}';`;
const preloadMatch = preloadOriginal.match(preloadPattern);
if (!preloadMatch) {
  console.error('[FAIL] desktop/preload.js nema centralno sinhronizovanu APP_VERSION konstantu.');
  process.exitCode = 1;
} else if (preloadMatch[0] === preloadExpected) {
  console.log(`[OK] desktop preload sandbox-safe APP_VERSION = ${fullVersion}`);
} else if (checkOnly) {
  console.error(`[FAIL] desktop/preload.js: pronađeno ${preloadMatch[0]}, očekivano ${preloadExpected}`);
  process.exitCode = 1;
} else {
  fs.writeFileSync(preloadFile, preloadOriginal.replace(preloadPattern, preloadExpected), 'utf8');
  changed += 1;
  console.log(`[FIX] desktop preload APP_VERSION: ${preloadMatch[0]} -> ${preloadExpected}`);
}

if (!process.exitCode) console.log(`[OK] Runtime verzije i kritični runtime ugovori usklađeni. full=${fullVersion}, protocol=${protocolVersion}, changed=${changed}`);
