'use strict';

// Centralni modul za sve promenljive (upisive) putanje. Programski resursi (server.js, public/,
// tools/*.ps1 skripte) mogu ostati u instalacionom folderu (Program Files ili bilo gde), ali
// SVE što program upisuje tokom rada mora ići ovde — inače instalirana verzija puca sa EPERM
// čim korisnik nema admin prava na instalacioni folder.
//
// MSS_DATA_DIR postavlja Electron (na app.getPath('userData')) pre pokretanja server.js kao
// dete-procesa. Bez nje (stari CMD/portable tok) koristi se folder pored server.js, kao ranije.

const fs = require('fs');
const path = require('path');

function resolveRoot() {
  if (process.env.MSS_DATA_DIR) return path.resolve(process.env.MSS_DATA_DIR);
  return path.join(__dirname, 'data');
}

const root = resolveRoot();

const PATHS = {
  root,
  projects: path.join(root, 'projects'),
  database: path.join(root, 'database'),
  backups: path.join(root, 'backups'),
  logs: path.join(root, 'logs'),
  bridge: path.join(root, 'bridge'),
  runtime: path.join(root, 'runtime'),
  runtimeResearch: path.join(root, 'runtime', 'research'),
  cache: path.join(root, 'cache'),
  temp: path.join(root, 'temp'),
  exports: path.join(root, 'exports'),
  images: path.join(root, 'images'),
  videos: path.join(root, 'videos'),
  settings: path.join(root, 'settings'),
  secure: path.join(root, 'secure'),
  extension: path.join(root, 'extension'),
  models: path.join(root, 'models'),
  workers: path.join(root, 'workers')
};

// Jedan opcioni modul koji ne uspe da napravi svoj folder ne sme da obori ceo server —
// zato se svaki mkdir hvata pojedinačno umesto da jedna greška prekine sve ostale.
function ensureAll() {
  const failures = [];
  for (const [name, dir] of Object.entries(PATHS)) {
    if (name === 'root' && !fs.existsSync(path.dirname(dir))) continue;
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (error) { failures.push({ name, dir, error: error.message }); }
  }
  return failures;
}

module.exports = { ...PATHS, ensureAll };
