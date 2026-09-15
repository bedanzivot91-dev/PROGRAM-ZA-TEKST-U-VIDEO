'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-core-gaps-'));
process.env.MSS_DATA_DIR = temp;

const storage = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'storage-paths.js'));
const projects = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'audio-projects.js'));
const locations = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'location-registry.js'));
const wardrobe = require(path.join(ROOT, 'PROGRAM - NE BRISATI', 'wardrobe-registry.js'));

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; console.log(`  [OK] ${message}`); }
function rewriteProject(projectId, patch) {
  const file = path.join(storage.projects, projectId, 'project.json');
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...current, ...patch }, null, 2), 'utf8');
}

try {
  console.log('== Core coverage-gap testovi ==');

  const failures = storage.ensureAll();
  ok(Array.isArray(failures) && failures.length === 0, 'storage-paths.ensureAll kreira sve upisive foldere');
  ok(fs.existsSync(storage.projects) && fs.existsSync(storage.secure), 'ključni storage folderi stvarno postoje');

  const one = projects.createProject({ name: 'Zeta', artist: 'A' });
  const two = projects.createProject({ name: 'Alfa', artist: 'B' });

  // updateProject namerno uvek osvežava updatedAt na "sada", zato sorter test mora
  // da postavi determinističke fixture timestampove direktno u test storage-u.
  rewriteProject(one.projectId, {
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    progress: { audio: 100, lyrics: 100, alignment: 100, storyboard: 100, imagePrompts: 100, images: 100, videoPrompts: 100 }
  });
  rewriteProject(two.projectId, {
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    progress: { audio: 0, lyrics: 0, alignment: 0, storyboard: 0, imagePrompts: 0, images: 0, videoPrompts: 0 }
  });

  ok(projects.listProjects({ sort: 'updatedAt_asc' })[0].projectId === one.projectId, 'listProjects izvršava updatedAt_asc sorter');
  ok(projects.listProjects({ sort: 'createdAt_desc' })[0].projectId === two.projectId, 'listProjects izvršava createdAt_desc sorter');
  ok(projects.listProjects({ sort: 'name_asc' })[0].name === 'Alfa', 'listProjects izvršava name_asc sorter');
  ok(projects.listProjects({ sort: 'progress_desc' })[0].projectId === one.projectId, 'listProjects izvršava progress_desc sorter');

  const lr = locations.createLocationRegistry();
  const locationId = locations.registerLocationUsage(lr, { name: 'Krov', type: 'urban', timeOfDay: 'night' }, 'scene-1');
  ok(locations.getLocation(lr, locationId)?.name === 'Krov', 'getLocation vraća registrovanu lokaciju');
  ok(locations.getLocation(lr, 'missing') === null, 'getLocation vraća null za nepoznat ID');

  const wr = wardrobe.createWardrobeRegistry();
  const outfitId = wardrobe.registerOutfitUsage(wr, { description: 'modern black jacket', tattooVisibility: 'hidden' }, 'scene-1');
  ok(wardrobe.getOutfit(wr, outfitId)?.description === 'modern black jacket', 'getOutfit vraća registrovan outfit');
  ok(wardrobe.getOutfit(wr, 'missing') === null, 'getOutfit vraća null za nepoznat ID');

  console.log(`\n== REZULTAT: ${passed} prošlo, 0 nije prošlo ==`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
