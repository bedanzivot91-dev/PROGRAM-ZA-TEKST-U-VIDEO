'use strict';
// Testira project-backup.js — sekcija 31, STVARNO pisanje i vraćanje na disk (ne mock).
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const {
  createProjectBackup, listProjectBackups, readProjectBackup, restoreSupplementalFiles,
  captureSupplementalFiles, readBackupPayload, MAX_BACKUPS_PER_PROJECT
} = require('../PROGRAM - NE BRISATI/project-backup');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

console.log('== ProjectBackup testovi ==');

const projectDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-test-'));

test('createProjectBackup STVARNO piše fajl na disk sa razlogom i vremenom', () => {
  const fileName = createProjectBackup(projectDirPath, { name: 'Test Projekat', songTitle: 'Pesma' }, 'before_storyboard_replace');
  const filePath = path.join(projectDirPath, 'backups', fileName);
  assert.ok(fs.existsSync(filePath));
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(data.reason, 'before_storyboard_replace');
  assert.strictEqual(data.project.name, 'Test Projekat');
  assert.ok(Array.isArray(data.supplementalFiles));
});

test('listProjectBackups vraća backup-e od NAJNOVIJEG ka najstarijem', () => {
  createProjectBackup(projectDirPath, { version: 2 }, 'manual');
  const backups = listProjectBackups(projectDirPath);
  assert.ok(backups.length >= 2);
  assert.ok(backups[0].backedUpAt >= backups[1].backedUpAt);
});

test('readProjectBackup vraća TAČNO sačuvano stanje projekta', () => {
  const fileName = createProjectBackup(projectDirPath, { songTitle: 'Jedinstvena Pesma XYZ', progress: { audio: 100 } }, 'before_ai_import');
  const restored = readProjectBackup(projectDirPath, fileName);
  assert.strictEqual(restored.songTitle, 'Jedinstvena Pesma XYZ');
  assert.strictEqual(restored.progress.audio, 100);
});

test('backup i restore vraćaju stvarni lyrics/overlay-tracks.json sadržaj', () => {
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-overlay-'));
  const overlayFile = path.join(freshDir, 'lyrics', 'overlay-tracks.json');
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
  const original = JSON.stringify({ tracks: [{ trackId: 'track-original', cues: [{ cueId: 'cue-original', text: 'Vrati me' }] }] }, null, 2);
  fs.writeFileSync(overlayFile, original, 'utf8');

  const fileName = createProjectBackup(freshDir, { projectId: 'p1', lyricsOverlay: { trackCount: 1, cueCount: 1 } }, 'before_delete_text_track');
  fs.writeFileSync(overlayFile, JSON.stringify({ tracks: [] }), 'utf8');

  const result = restoreSupplementalFiles(freshDir, fileName);
  assert.strictEqual(result.restored, 1);
  assert.strictEqual(fs.readFileSync(overlayFile, 'utf8'), original);
  fs.rmSync(freshDir, { recursive: true, force: true });
});

test('restore backup-a u kome overlay NIJE postojao uklanja naknadno nastali overlay fajl', () => {
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-overlay-absent-'));
  const fileName = createProjectBackup(freshDir, { projectId: 'p2' }, 'manual');
  const overlayFile = path.join(freshDir, 'lyrics', 'overlay-tracks.json');
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
  fs.writeFileSync(overlayFile, JSON.stringify({ tracks: [{ trackId: 'newer' }] }), 'utf8');

  const result = restoreSupplementalFiles(freshDir, fileName);
  assert.strictEqual(result.removed, 1);
  assert.strictEqual(fs.existsSync(overlayFile), false);
  fs.rmSync(freshDir, { recursive: true, force: true });
});

test('captureSupplementalFiles koristi samo unapred dozvoljene projektne putanje', () => {
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-allowlist-'));
  fs.writeFileSync(path.join(freshDir, 'secret.txt'), 'ne sme u backup', 'utf8');
  const files = captureSupplementalFiles(freshDir);
  assert.deepStrictEqual(files.map(x => x.relativePath), ['lyrics/overlay-tracks.json']);
  assert.ok(!files.some(x => x.relativePath.includes('secret')));
  fs.rmSync(freshDir, { recursive: true, force: true });
});

test('oštećen backup prijavljuje BACKUP_CORRUPTED umesto sirovog JSON pada', () => {
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-corrupt-'));
  const dir = path.join(freshDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'backup-corrupt.json'), '{not-json', 'utf8');
  assert.throws(
    () => readBackupPayload(freshDir, 'backup-corrupt.json'),
    error => error && error.code === 'BACKUP_CORRUPTED'
  );
  fs.rmSync(freshDir, { recursive: true, force: true });
});

test(`kada ima više od ${MAX_BACKUPS_PER_PROJECT} backup-a, najstariji se BRIŠU (zadržava se poslednjih ${MAX_BACKUPS_PER_PROJECT})`, () => {
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-prune-test-'));
  for (let i = 0; i < MAX_BACKUPS_PER_PROJECT + 5; i += 1) {
    createProjectBackup(freshDir, { index: i }, 'manual');
  }
  const backups = listProjectBackups(freshDir);
  assert.strictEqual(backups.length, MAX_BACKUPS_PER_PROJECT);
  fs.rmSync(freshDir, { recursive: true, force: true });
});

test('nepostojeći backup fajl baca BACKUP_NOT_FOUND umesto tihog pada', () => {
  assert.throws(() => readProjectBackup(projectDirPath, 'backup-ne-postoji.json'), /Backup nije pronađen/);
});

test('SIGURNOST: pokušaj path traversal u nazivu backup fajla se odbija', () => {
  const attempts = ['../../../etc/passwd', 'backup-x/../../../secret.json', '..\\..\\windows\\system32\\config', 'backup-a-b.txt'];
  for (const attempt of attempts) {
    assert.throws(() => readProjectBackup(projectDirPath, attempt), /Neispravan naziv/, `trebalo je odbiti: "${attempt}"`);
  }
});

test('nema backup foldera (nijedan backup nije napravljen) → listProjectBackups vraća prazan niz, ne grešku', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-backup-empty-'));
  assert.deepStrictEqual(listProjectBackups(emptyDir), []);
  fs.rmSync(emptyDir, { recursive: true, force: true });
});

fs.rmSync(projectDirPath, { recursive: true, force: true });

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
