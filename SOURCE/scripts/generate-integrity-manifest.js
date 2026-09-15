'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const MANIFEST = path.join(PROGRAM, 'INTEGRITET-FAJLOVA-SHA256.txt');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const excludedDirs = new Set(['node_modules', 'dist', 'runtime', '.git', '.v8-coverage']);
function shouldSkip(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (path.resolve(file) === path.resolve(MANIFEST)) return true;
  if (/\/(?:data\/backups|data\/secure)(?:\/|$)/i.test('/' + rel)) return true;
  if (/\.log$/i.test(rel)) return true;
  return false;
}
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (!shouldSkip(full)) out.push(full);
  }
  return out;
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const files = walk(ROOT).sort((a, b) => path.relative(ROOT, a).localeCompare(path.relative(ROOT, b), 'en'));
const lines = [
  `MUZIČKI SPOT STUDIO FREE ${pkg.version} — SHA-256 INTEGRITET`,
  'Ovaj manifest kontroliše sve isporučene SOURCE fajlove osim samog manifesta, runtime podataka, tokena, logova, node_modules, dist i privremenih coverage podataka.',
  'Format: SHA256 + dva razmaka + putanja od SOURCE foldera.',
  ''
];
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  lines.push(`${sha256(file)}  ${rel}`);
}
lines.push('');
const output = lines.join('\n');

if (process.argv.includes('--write')) {
  fs.writeFileSync(MANIFEST, output, 'utf8');
  console.log(`Upisan manifest ${pkg.version}: ${files.length} fajlova.`);
} else {
  process.stdout.write(output);
}

module.exports = { walk, shouldSkip, sha256 };
