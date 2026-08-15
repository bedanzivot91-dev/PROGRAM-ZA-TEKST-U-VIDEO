'use strict';

// Sekcija 5: "ne učitavaj ekstenziju iz Downloads foldera; kopiraj je u stabilnu korisničku
// lokaciju: %LOCALAPPDATA%\Muzicki Spot Studio Free\Extension\VERZIJA\". Program se instalira
// u Program Files (read-only) ili se pokreće direktno iz Downloads/bilo koje putanje kao
// portable — obe lokacije su nepouzdane za "Load unpacked" (mogu nestati, biti read-only, ili
// se promeniti). Kopija u LOCALAPPDATA je stabilna i uvek upisiva bez admin prava.

const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveLocalAppData() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

function resolveStableExtensionDir(productName, version) {
  return path.join(resolveLocalAppData(), productName, 'Extension', version);
}

function copyRecursive(sourceDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyRecursive(sourcePath, destPath);
    else fs.copyFileSync(sourcePath, destPath);
  }
}

const VERSION_MARKER_FILE = '.mss-copied-from-source-version';

// Kopira samo kada je potrebno (nova verzija ili kopija nedostaje) — ne piše na disk pri svakom
// pozivu, izbegava nepotreban I/O kada je stabilna kopija već ažurna.
function ensureStableExtensionCopy(sourceDir, { productName = 'Muzicki Spot Studio Free', version } = {}) {
  if (!version) throw new Error('version je obavezan parametar (verzija ekstenzije koja se kopira).');
  if (!fs.existsSync(path.join(sourceDir, 'manifest.json'))) {
    throw new Error('Izvorni folder ekstenzije ne postoji ili nema manifest.json.');
  }

  const destDir = resolveStableExtensionDir(productName, version);
  const markerFile = path.join(destDir, VERSION_MARKER_FILE);
  const alreadyCurrent = fs.existsSync(markerFile) && fs.readFileSync(markerFile, 'utf8').trim() === version;

  if (!alreadyCurrent) {
    fs.rmSync(destDir, { recursive: true, force: true });
    copyRecursive(sourceDir, destDir);
    fs.writeFileSync(markerFile, version, 'utf8');
  }

  return { destDir, wasCopied: !alreadyCurrent };
}

module.exports = { resolveLocalAppData, resolveStableExtensionDir, ensureStableExtensionCopy, VERSION_MARKER_FILE };
