'use strict';

// Sekcija 31: backup pre migracije, velikog AI uvoza, zamene storyboarda, brisanja, masovne
// regeneracije. Zadržava poslednjih 10 verzija po projektu. Pored project.json stanja, backup
// čuva i spoljne projektne podatke koji nisu u project.json (trenutno lyrics overlay trackove),
// da "VRATI PRETHODNU VERZIJU" zaista vrati CELO korisničko stanje, ne samo reference/metapodatke.

const fs = require('fs');
const path = require('path');

const MAX_BACKUPS_PER_PROJECT = 10;
const SUPPLEMENTAL_FILES = Object.freeze(['lyrics/overlay-tracks.json']);

function backupDir(projectDirPath) {
  return path.join(projectDirPath, 'backups');
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function uniqueBackupFileName(dir) {
  const base = `backup-${timestampForFileName()}`;
  let fileName = `${base}.json`;
  let suffix = 1;
  while (fs.existsSync(path.join(dir, fileName))) {
    fileName = `${base}-${String(suffix).padStart(2, '0')}.json`;
    suffix += 1;
  }
  return fileName;
}

function pruneOldBackups(dir, maxBackups = MAX_BACKUPS_PER_PROJECT) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('backup-') && f.endsWith('.json')).sort();
  while (files.length > maxBackups) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(dir, oldest)); } catch {}
  }
}

function captureSupplementalFiles(projectDirPath) {
  return SUPPLEMENTAL_FILES.map(relativePath => {
    const absolutePath = path.join(projectDirPath, ...relativePath.split('/'));
    try {
      if (!fs.existsSync(absolutePath)) return { relativePath, exists: false, contentBase64: '' };
      return { relativePath, exists: true, contentBase64: fs.readFileSync(absolutePath).toString('base64') };
    } catch (error) {
      const wrapped = new Error(`Backup nije mogao da pročita dodatni projektni fajl "${relativePath}": ${error.message}`);
      wrapped.code = 'BACKUP_SUPPLEMENTAL_READ_FAILED';
      throw wrapped;
    }
  });
}

function validateBackupFileName(fileName) {
  if (!/^backup-[\w.-]+\.json$/.test(String(fileName || ''))) {
    const error = new Error('Neispravan naziv backup fajla.');
    error.code = 'INVALID_BACKUP_NAME';
    throw error;
  }
  return String(fileName);
}

function readBackupPayload(projectDirPath, fileName) {
  const safeName = validateBackupFileName(fileName);
  const filePath = path.join(backupDir(projectDirPath), safeName);
  if (!fs.existsSync(filePath)) {
    const error = new Error('Backup nije pronađen.');
    error.code = 'BACKUP_NOT_FOUND';
    throw error;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`Backup fajl je oštećen ili nije validan JSON: ${error.message}`);
    wrapped.code = 'BACKUP_CORRUPTED';
    throw wrapped;
  }
  if (!data || typeof data !== 'object' || !data.project || typeof data.project !== 'object') {
    const error = new Error('Backup fajl nema validno stanje projekta.');
    error.code = 'BACKUP_CORRUPTED';
    throw error;
  }
  return data;
}

// reason: kratak razlog za backup (npr. "before_storyboard_replace", "before_ai_import") —
// pomaže korisniku da razume ZAŠTO je verzija sačuvana kad bira šta da vrati.
function createProjectBackup(projectDirPath, projectState, reason = 'manual') {
  const dir = backupDir(projectDirPath);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = uniqueBackupFileName(dir);
  const filePath = path.join(dir, fileName);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const payload = {
    reason,
    backedUpAt: new Date().toISOString(),
    project: projectState,
    supplementalFiles: captureSupplementalFiles(projectDirPath)
  };
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
  pruneOldBackups(dir);
  return fileName;
}

function listProjectBackups(projectDirPath) {
  const dir = backupDir(projectDirPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .map(fileName => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8'));
        return { fileName, reason: data.reason, backedUpAt: data.backedUpAt };
      } catch { return null; }
    })
    .filter(Boolean);
}

// Vraća sačuvano STANJE PROJEKTA bez menjanja trenutnih fajlova.
function readProjectBackup(projectDirPath, fileName) {
  return readBackupPayload(projectDirPath, fileName).project;
}

// Vraća spoljne fajlove koji su postojali u trenutku backup-a. Dozvoljava SAMO unapred poznate
// putanje iz SUPPLEMENTAL_FILES; sadržaj backup JSON-a nikad ne može da izabere proizvoljnu putanju.
// Stari backup-i (pre ovog formata) nemaju supplementalFiles i ostaju kompatibilni — tada se ništa
// dodatno ne menja.
function restoreSupplementalFiles(projectDirPath, fileName) {
  const data = readBackupPayload(projectDirPath, fileName);
  if (!Array.isArray(data.supplementalFiles)) return { restored: 0, removed: 0, legacyBackup: true };

  const allowed = new Set(SUPPLEMENTAL_FILES);
  let restored = 0;
  let removed = 0;
  for (const entry of data.supplementalFiles) {
    if (!entry || !allowed.has(entry.relativePath)) continue;
    const target = path.join(projectDirPath, ...entry.relativePath.split('/'));
    if (!entry.exists) {
      try { if (fs.existsSync(target)) { fs.unlinkSync(target); removed += 1; } } catch (error) {
        const wrapped = new Error(`Nije moguće ukloniti fajl pri vraćanju backup-a "${entry.relativePath}": ${error.message}`);
        wrapped.code = 'BACKUP_RESTORE_FAILED';
        throw wrapped;
      }
      continue;
    }
    let content;
    try { content = Buffer.from(String(entry.contentBase64 || ''), 'base64'); }
    catch (error) {
      const wrapped = new Error(`Backup dodatnog fajla "${entry.relativePath}" je oštećen: ${error.message}`);
      wrapped.code = 'BACKUP_CORRUPTED';
      throw wrapped;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.restore-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, target);
      restored += 1;
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch {}
      const wrapped = new Error(`Nije moguće vratiti dodatni fajl "${entry.relativePath}": ${error.message}`);
      wrapped.code = 'BACKUP_RESTORE_FAILED';
      throw wrapped;
    }
  }
  return { restored, removed, legacyBackup: false };
}

module.exports = {
  createProjectBackup, listProjectBackups, readProjectBackup, restoreSupplementalFiles,
  captureSupplementalFiles, readBackupPayload, MAX_BACKUPS_PER_PROJECT, SUPPLEMENTAL_FILES
};
