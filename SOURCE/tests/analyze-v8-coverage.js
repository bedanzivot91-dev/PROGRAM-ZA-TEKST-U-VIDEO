'use strict';

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const ROOT = path.resolve(__dirname, '..');
const COVERAGE_DIR = path.join(ROOT, '.v8-coverage');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const DESKTOP = path.join(ROOT, 'desktop');

function normalizeUrl(url) {
  try { return url.startsWith('file://') ? path.resolve(fileURLToPath(url)) : path.resolve(url); }
  catch { return null; }
}
function isOwnedBackend(file) {
  if (!file) return false;
  const insideProgram = file.startsWith(PROGRAM + path.sep) && path.dirname(file) === PROGRAM;
  const insideDesktop = file.startsWith(DESKTOP + path.sep);
  return (insideProgram || insideDesktop) && file.endsWith('.js');
}
function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }

if (!fs.existsSync(COVERAGE_DIR)) {
  console.error('[FAIL] .v8-coverage folder ne postoji. Pokreni npm test sa NODE_V8_COVERAGE=.v8-coverage');
  process.exit(1);
}

const merged = new Map();
for (const name of fs.readdirSync(COVERAGE_DIR)) {
  if (!name.endsWith('.json')) continue;
  let payload;
  try { payload = JSON.parse(fs.readFileSync(path.join(COVERAGE_DIR, name), 'utf8')); } catch { continue; }
  for (const script of payload.result || []) {
    const file = normalizeUrl(script.url || '');
    if (!isOwnedBackend(file)) continue;
    if (!merged.has(file)) merged.set(file, new Map());
    const fnMap = merged.get(file);
    for (const fn of script.functions || []) {
      const outer = fn.ranges && fn.ranges[0];
      if (!outer) continue;
      const key = `${fn.functionName || '<anonymous>'}:${outer.startOffset}:${outer.endOffset}`;
      const previous = fnMap.get(key);
      const count = Number(outer.count || 0);
      if (!previous || count > previous.count) fnMap.set(key, { name: fn.functionName || '<anonymous>', count, startOffset: outer.startOffset, endOffset: outer.endOffset });
    }
  }
}

let files = 0;
let functions = 0;
let covered = 0;
const uncovered = [];
for (const [file, fnMap] of [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  files++;
  for (const fn of fnMap.values()) {
    if (!fn.name || fn.name === '<anonymous>') continue;
    functions++;
    if (fn.count > 0) covered++;
    else uncovered.push({ file: rel(file), name: fn.name, start: fn.startOffset });
  }
}

console.log('== V8 FUNCTION COVERAGE AUDIT ==');
console.log(`Backend/Electron fajlova sa coverage podacima: ${files}`);
console.log(`Imenovanih funkcija: ${functions}`);
console.log(`Izvršeno u testovima: ${covered}`);
console.log(`Neizvršeno: ${uncovered.length}`);

if (!files || !functions) {
  console.error('[FAIL] Coverage nije prikupio backend funkcije.');
  process.exit(1);
}

if (uncovered.length) {
  console.error('\n[FAIL] Funkcije koje nijedan test nije izvršio:');
  for (const item of uncovered.slice(0, 200)) console.error(` - ${item.file} :: ${item.name} @${item.start}`);
  if (uncovered.length > 200) console.error(` ... i još ${uncovered.length - 200}`);
  process.exit(1);
}

console.log('[OK] Svaka imenovana backend/Electron funkcija zabeležena u V8 coverage-u izvršena je najmanje jednom.');
