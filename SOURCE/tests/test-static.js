'use strict';
// Statički testovi: JS sintaksa, JSON parsiranje, HTML dupli ID-jevi, verzije, package/electron-builder config.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

function walk(dir, exts, out = [], skipDirs = ['node_modules', 'dist', 'runtime', '.git']) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, skipDirs);
    else if (exts.some(ext => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

console.log('== Statički testovi ==');

console.log('-- JavaScript sintaksa --');
const jsFiles = walk(PROGRAM_DIR, ['.js']).concat(walk(path.join(ROOT, 'desktop'), ['.js']));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    ok(path.relative(ROOT, file));
  } catch (error) {
    bad(path.relative(ROOT, file), error.stderr?.toString().split('\n')[0]);
  }
}

console.log('-- JSON parsiranje --');
const jsonFiles = walk(PROGRAM_DIR, ['.json']).concat([path.join(ROOT, 'package.json')]);
for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(path.relative(ROOT, file));
  } catch (error) {
    bad(path.relative(ROOT, file), error.message);
  }
}

console.log('-- HTML dupli ID-jevi --');
{
  const html = fs.readFileSync(path.join(PROGRAM_DIR, 'public', 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seen = new Map();
  const dupes = [];
  for (const id of ids) {
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const [id, count] of seen) if (count > 1) dupes.push(`${id} (${count}x)`);
  if (dupes.length) bad('index.html duplirani ID', dupes.join(', '));
  else ok(`index.html — ${ids.length} jedinstvenih ID-jeva, 0 duplikata`);
}

console.log('-- Verzije programa (moraju biti 15.6 / 15.6.0) --');
{
  const checks = [
    [path.join(PROGRAM_DIR, 'server.js'), /const VERSION = '15\.6'/],
    [path.join(PROGRAM_DIR, 'launcher.js'), /const VERSION = '15\.6'/],
    [path.join(PROGRAM_DIR, 'server.js'), /EXPECTED_EXTENSION_VERSION = '15\.6\.0'/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'manifest.json'), /"version":\s*"15\.6\.0"/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'service-worker.js'), /EXTENSION_VERSION = '15\.6\.0'/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'chatgpt-bridge.js'), /BRIDGE_VERSION = '15\.6'/],
    [path.join(ROOT, 'package.json'), /"version":\s*"15\.6\.0"/]
  ];
  for (const [file, pattern] of checks) {
    const content = fs.readFileSync(file, 'utf8');
    if (pattern.test(content)) ok(`${path.relative(ROOT, file)} — verzija ispravna`);
    else bad(`${path.relative(ROOT, file)} — verzija NIJE pronađena / netačna`);
  }
}

console.log('-- Extension port opseg (mora biti 4180-4239 svuda) --');
{
  const swFile = path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'service-worker.js');
  const content = fs.readFileSync(swFile, 'utf8');
  if (/length:\s*60/.test(content)) ok('service-worker.js — opseg od 60 portova (4180-4239)');
  else bad('service-worker.js — opseg portova nije 60 (4180-4239)');
}

console.log('-- Electron desktop fajlovi postoje --');
for (const f of ['main.js', 'preload.js', 'server-controller.js', 'window-state.js']) {
  const file = path.join(ROOT, 'desktop', f);
  if (fs.existsSync(file)) ok(`desktop/${f}`);
  else bad(`desktop/${f}`, 'nedostaje');
}

console.log('-- assets/icon.ico postoji --');
if (fs.existsSync(path.join(ROOT, 'assets', 'icon.ico'))) ok('assets/icon.ico');
else bad('assets/icon.ico', 'nedostaje');

console.log('-- Content-Security-Policy meta tag postoji --');
{
  const html = fs.readFileSync(path.join(PROGRAM_DIR, 'public', 'index.html'), 'utf8');
  if (/http-equiv="Content-Security-Policy"/.test(html)) ok('index.html ima CSP meta tag');
  else bad('index.html CSP meta tag', 'nedostaje');
}

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
