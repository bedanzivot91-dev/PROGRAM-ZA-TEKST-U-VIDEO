'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const fullVersion = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(fullVersion)) throw new Error(`Neispravna package verzija: ${fullVersion}`);
const protocolVersion = fullVersion.split('.').slice(0, 2).join('.');
const checkOnly = process.argv.includes('--check');

const targets = [
  {
    file: path.join(ROOT, 'PROGRAM - NE BRISATI', 'server.js'),
    pattern: /const VERSION = '[^']+';/,
    expected: `const VERSION = '${protocolVersion}';`,
    label: 'server protocol'
  },
  {
    file: path.join(ROOT, 'PROGRAM - NE BRISATI', 'launcher.js'),
    pattern: /const VERSION = '[^']+';/,
    expected: `const VERSION = '${protocolVersion}';`,
    label: 'launcher protocol'
  },
  {
    file: path.join(ROOT, 'PROGRAM - NE BRISATI', 'background-worker.js'),
    pattern: /const VERSION = '[^']+';/,
    expected: `const VERSION = '${protocolVersion}';`,
    label: 'background-worker protocol'
  }
];

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

const preloadFile = path.join(ROOT, 'desktop', 'preload.js');
const preload = fs.readFileSync(preloadFile, 'utf8');
if (!/require\(['"]\.\.\/package\.json['"]\)/.test(preload)) {
  console.error('[FAIL] desktop/preload.js mora da čita verziju iz package.json, bez hardkodovanog patch broja.');
  process.exitCode = 1;
} else {
  console.log(`[OK] desktop preload koristi package.json (${fullVersion})`);
}

if (!process.exitCode) console.log(`[OK] Runtime verzije usklađene. full=${fullVersion}, protocol=${protocolVersion}, changed=${changed}`);
