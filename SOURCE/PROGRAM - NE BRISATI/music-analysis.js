'use strict';

// MusicAnalysisEngine (sekcija 11): pokreće tools/music_analyzer.py (librosa) da izvuče BPM,
// beat/downbeat, onset, energiju i novelty curve. Ovo je OPCIONO poboljšanje — osnovna BPM/
// energija analiza već radi u browseru preko Meyda-e (bez interneta, sekcija 6). Ako librosa
// nije instalirana, program se NE ruši (sekcija 0.20/30) — klijent nastavlja sa svojom analizom.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const LIBROSA_VENV_PYTHON = path.join(RUNTIME_DIR, 'librosa-lite', 'venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python');
const ANALYZER_SCRIPT = path.join(APP_DIR, 'tools', 'music_analyzer.py');
const ANALYSIS_CACHE_DIR = path.join(DATA_DIR, 'cache', 'music-analysis');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function isLibrosaInstalled() {
  try { return fs.existsSync(LIBROSA_VENV_PYTHON) && fs.existsSync(ANALYZER_SCRIPT); } catch { return false; }
}

function cacheFileFor(audioHash) {
  return path.join(ANALYSIS_CACHE_DIR, `${audioHash}.json`);
}

function readCached(audioHash) {
  const file = cacheFileFor(audioHash);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function unavailableResult(reason) {
  return { ok: false, reason };
}

async function analyzeMusic(audioFilePath, audioHash, { timeoutMs = DEFAULT_TIMEOUT_MS, signal = null } = {}) {
  if (!audioHash) throw new Error('audioHash je obavezan (za keširanje po sadržaju fajla).');

  const cached = readCached(audioHash);
  if (cached) return { ...cached, fromCache: true };

  if (!fs.existsSync(audioFilePath)) return unavailableResult('source_audio_missing');
  if (!isLibrosaInstalled()) return unavailableResult('librosa_not_installed');

  fs.mkdirSync(ANALYSIS_CACHE_DIR, { recursive: true });
  const outputFile = cacheFileFor(audioHash);
  const tmpOutput = `${outputFile}.tmp-${process.pid}`;

  const args = [ANALYZER_SCRIPT, audioFilePath, '--output', tmpOutput];

  const result = await new Promise(resolve => {
    let settled = false;
    const child = childProcess.execFile(LIBROSA_VENV_PYTHON, args, { timeout: timeoutMs, maxBuffer: 30 * 1024 * 1024 }, error => {
      if (settled) return;
      settled = true;
      if (error) { resolve(unavailableResult(error.killed ? 'analysis_timeout' : 'analysis_process_failed')); return; }
      resolve({ pending: true });
    });
    if (signal) {
      const onAbort = () => { try { child.kill(); } catch {} };
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  if (!result.pending) {
    try { fs.unlinkSync(tmpOutput); } catch {}
    return result;
  }

  if (!fs.existsSync(tmpOutput)) return unavailableResult('analysis_no_output');
  let data;
  try { data = JSON.parse(fs.readFileSync(tmpOutput, 'utf8')); }
  catch { try { fs.unlinkSync(tmpOutput); } catch {} return unavailableResult('analysis_invalid_output'); }

  const finalResult = { ok: true, ...data, createdAt: new Date().toISOString() };
  fs.writeFileSync(outputFile, JSON.stringify(finalResult, null, 2), 'utf8');
  try { fs.unlinkSync(tmpOutput); } catch {}
  return finalResult;
}

module.exports = { analyzeMusic, isLibrosaInstalled, LIBROSA_VENV_PYTHON };
