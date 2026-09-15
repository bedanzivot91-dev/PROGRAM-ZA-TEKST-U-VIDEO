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
function expectedProductionFiles() {
  const rootModules = fs.readdirSync(PROGRAM, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => path.join(PROGRAM, e.name))
    .filter(file => {
      const src = fs.readFileSync(file, 'utf8');
      return /module\.exports\s*=/.test(src) || ['server.js', 'launcher.js', 'background-worker.js'].includes(path.basename(file));
    });
  const desktop = fs.readdirSync(DESKTOP, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => path.join(DESKTOP, e.name));
  return [...new Set([...rootModules, ...desktop])].sort();
}

if (!fs.existsSync(COVERAGE_DIR)) {
  console.error('[FAIL] .v8-coverage folder ne postoji. Pokreni backend testove sa NODE_V8_COVERAGE=.v8-coverage');
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
      if (!previous || count > previous.count) {
        fnMap.set(key, {
          name: fn.functionName || '<anonymous>',
          count,
          startOffset: outer.startOffset,
          endOffset: outer.endOffset
        });
      }
    }
  }
}

const expected = expectedProductionFiles();
const missingFiles = expected.filter(file => !merged.has(file));
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
console.log(`Očekivanih produkcionih backend/Electron fajlova: ${expected.length}`);
console.log(`Fajlova sa coverage podacima: ${files}`);
console.log(`Očekivani fajlovi koji uopšte nisu učitani: ${missingFiles.length}`);
console.log(`Imenovanih funkcija u učitanim fajlovima: ${functions}`);
console.log(`Izvršeno u testovima: ${covered}`);
console.log(`Učitano ali neizvršeno: ${uncovered.length}`);

let failed = false;
if (!files || !functions) {
  console.error('[FAIL] Coverage nije prikupio backend/Electron funkcije.');
  failed = true;
}
if (missingFiles.length) {
  console.error('\n[FAIL] Produkcioni fajlovi koje nijedan instrumentovani test nije ni učitao:');
  for (const file of missingFiles) console.error(` - ${rel(file)}`);
  failed = true;
}
if (uncovered.length) {
  console.error('\n[FAIL] Imenovane funkcije koje nijedan instrumentovani test nije izvršio:');
  for (const item of uncovered.slice(0, 300)) console.error(` - ${item.file} :: ${item.name} @${item.start}`);
  if (uncovered.length > 300) console.error(` ... i još ${uncovered.length - 300}`);
  failed = true;
}

if (failed) process.exit(1);
console.log('[OK] Svaki očekivani backend/Electron modul je učitan i svaka imenovana funkcija iz V8 coverage-a izvršena je najmanje jednom.');
