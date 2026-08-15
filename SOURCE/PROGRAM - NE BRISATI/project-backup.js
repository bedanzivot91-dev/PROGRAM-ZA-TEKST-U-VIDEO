'use strict';

// Sekcija 31: backup pre migracije, velikog AI uvoza, zamene storyboarda, brisanja, masovne
// regeneracije. Zadržava najmanje poslednjih 10 verzija po projektu. Atomic write (privremeni
// fajl -> rename) da prekid u pola pisanja ne ostavi oštećen backup.

const fs = require('fs');
const path = require('path');

const MAX_BACKUPS_PER_PROJECT = 10;

function backupDir(projectDirPath) {
  return path.join(projectDirPath, 'backups');
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function pruneOldBackups(dir, maxBackups = MAX_BACKUPS_PER_PROJECT) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('backup-') && f.endsWith('.json')).sort();
  while (files.length > maxBackups) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(dir, oldest)); } catch {}
  }
}

// reason: kratak razlog za backup (npr. "before_storyboard_replace", "before_ai_import") —
// pomaže korisniku da razume ZAŠTO je verzija sačuvana kad bira šta da vrati.
function createProjectBackup(projectDirPath, projectState, reason = 'manual') {
  const dir = backupDir(projectDirPath);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `backup-${timestampForFileName()}.json`;
  const filePath = path.join(dir, fileName);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const payload = { reason, backedUpAt: new Date().toISOString(), project: projectState };
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

// Vraća sačuvano STANJE PROJEKTA (ne piše ga nazad — pozivalac odlučuje da li i kako da
// primeni povratak preko updateProject, da ostane usklađeno sa schemaVersion/atomic write logikom).
function readProjectBackup(projectDirPath, fileName) {
  if (!/^backup-[\w.-]+\.json$/.test(String(fileName || ''))) {
    const error = new Error('Neispravan naziv backup fajla.');
    error.code = 'INVALID_BACKUP_NAME';
    throw error;
  }
  const filePath = path.join(backupDir(projectDirPath), fileName);
  if (!fs.existsSync(filePath)) {
    const error = new Error('Backup nije pronađen.');
    error.code = 'BACKUP_NOT_FOUND';
    throw error;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.project;
}

module.exports = { createProjectBackup, listProjectBackups, readProjectBackup, MAX_BACKUPS_PER_PROJECT };
