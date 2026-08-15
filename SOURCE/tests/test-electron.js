'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const files = [
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/server-controller.js',
  'desktop/window-state.js',
  'PROGRAM - NE BRISATI/server.js',
  'PROGRAM - NE BRISATI/launcher.js'
];

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

console.log('== Electron desktop smoke testovi ==');

for (const relative of files) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) {
    bad(relative, 'fajl ne postoji');
    continue;
  }
  const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (check.status === 0) ok(`${relative} — Node sintaksa ispravna`);
  else bad(relative, (check.stderr || check.stdout || 'syntax error').trim().slice(0, 240));
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.main === 'desktop/main.js') ok('package.json → Electron entrypoint postoji');
else bad('package.json entrypoint', packageJson.main);

const preload = fs.readFileSync(path.join(ROOT, 'desktop/preload.js'), 'utf8');
if (preload.includes('contextBridge.exposeInMainWorld')) ok('preload → contextBridge API je registrovan');
else bad('preload API', 'contextBridge API nije pronađen');

const electronCheck = spawnSync(path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'), ['--version'], { encoding: 'utf8' });
if (electronCheck.status === 0) ok(`Electron runtime radi (${(electronCheck.stdout || '').trim()})`);
else bad('Electron runtime', (electronCheck.stderr || electronCheck.stdout || 'nepoznata greška').trim().slice(0, 240));

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
