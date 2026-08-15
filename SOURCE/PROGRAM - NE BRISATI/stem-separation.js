'use strict';

// StemSeparationProvider (sekcija 8): pokušava da izdvoji vocals/drums/bass/other iz
// audio-fajla pomoću Demucs-a. Ako Demucs nije instaliran ili obrada ne uspe, program MORA
// nastaviti sa originalnim miksom uz smanjen confidence — nikad ne sme srušiti ceo posao.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const DEMUCS_ROOT = path.join(RUNTIME_DIR, 'demucs-lite');
const DEMUCS_VENV_PYTHON = path.join(DEMUCS_ROOT, 'venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python');
const STEM_CACHE_DIR = path.join(DATA_DIR, 'cache', 'stems');

const STEM_MODEL = 'htdemucs';
const EXPECTED_STEMS = ['vocals', 'drums', 'bass', 'other'];
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // separacija na CPU-u može trajati više minuta

function isDemucsInstalled() {
  try { return fs.existsSync(DEMUCS_VENV_PYTHON); } catch { return false; }
}

function cacheDirFor(audioHash) {
  return path.join(STEM_CACHE_DIR, audioHash);
}

function readCachedStems(audioHash) {
  const dir = cacheDirFor(audioHash);
  const metaFile = path.join(dir, 'stems-meta.json');
  if (!fs.existsSync(metaFile)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const allPresent = Object.values(meta.stems || {}).every(p => fs.existsSync(p));
    return allPresent ? meta : null;
  } catch { return null; }
}

function writeCachedStems(audioHash, meta) {
  const dir = cacheDirFor(audioHash);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stems-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

function fallbackResult(reason) {
  return {
    ok: true,
    usedOriginalMix: true,
    stems: null,
    confidence: 0.5,
    fallbackReason: reason,
    model: null
  };
}

// Pokreće pravi Demucs proces (argument lista, ne shell string — pravilo 33), sa timeout-om,
// cancellation podrškom, i čišćenjem privremenih fajlova. Nikad ne baca grešku napolje —
// svaki neuspeh se pretvara u fallbackResult tako da pozivalac uvek dobije upotrebljiv rezultat.
async function separateStems(audioFilePath, audioHash, { timeoutMs = DEFAULT_TIMEOUT_MS, signal = null } = {}) {
  if (!audioHash) throw new Error('audioHash je obavezan (za keširanje po sadržaju fajla).');

  const cached = readCachedStems(audioHash);
  if (cached) return { ...cached, fromCache: true };

  if (!fs.existsSync(audioFilePath)) return fallbackResult('source_audio_missing');
  if (!isDemucsInstalled()) return fallbackResult('demucs_not_installed');

  const outDir = path.join(STEM_CACHE_DIR, `${audioHash}-tmp-${process.pid}`);
  fs.mkdirSync(outDir, { recursive: true });

  const args = ['-m', 'demucs', '-n', STEM_MODEL, '-d', 'cpu', '-o', outDir, audioFilePath];

  const result = await new Promise(resolve => {
    let settled = false;
    const child = childProcess.execFile(DEMUCS_VENV_PYTHON, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (error) {
        resolve(fallbackResult(error.killed ? 'demucs_timeout' : 'demucs_process_failed'));
        return;
      }
      resolve({ ok: true, stdout, stderr });
    });
    if (signal) {
      const onAbort = () => { try { child.kill(); } catch {} };
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  if (result.usedOriginalMix) {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
    return result;
  }

  const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
  const stemDir = path.join(outDir, STEM_MODEL, baseName);
  const stems = {};
  let allFound = true;
  for (const stem of EXPECTED_STEMS) {
    const stemFile = path.join(stemDir, `${stem}.wav`);
    if (fs.existsSync(stemFile)) stems[stem] = stemFile;
    else allFound = false;
  }

  if (!allFound) {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
    return fallbackResult('demucs_incomplete_output');
  }

  const finalDir = cacheDirFor(audioHash);
  fs.mkdirSync(finalDir, { recursive: true });
  const finalStems = {};
  for (const [stem, filePath] of Object.entries(stems)) {
    const dest = path.join(finalDir, `${stem}.wav`);
    fs.renameSync(filePath, dest);
    finalStems[stem] = dest;
  }
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}

  const meta = {
    ok: true,
    usedOriginalMix: false,
    stems: finalStems,
    confidence: 0.9,
    fallbackReason: null,
    model: STEM_MODEL,
    createdAt: new Date().toISOString()
  };
  writeCachedStems(audioHash, meta);
  return meta;
}

module.exports = { separateStems, isDemucsInstalled, EXPECTED_STEMS, STEM_MODEL, DEMUCS_VENV_PYTHON };
