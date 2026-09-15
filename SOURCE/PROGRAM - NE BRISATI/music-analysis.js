'use strict';

// MusicAnalysisEngine: pokreće tools/music_analyzer.py (librosa) da izvuče BPM, beat/downbeat,
// onset, energiju i novelty curve. Modul je opcion — ako alat nije instaliran, vraća ok:false.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function safeAudioHash(audioHash) {
  const hash = String(audioHash || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,200}$/.test(hash) || hash.includes('..')) {
    const error = new Error('audioHash sadrži nedozvoljene znakove.');
    error.code = 'INVALID_AUDIO_HASH';
    throw error;
  }
  return hash;
}

function cacheFileFor(audioHash) {
  return path.join(ANALYSIS_CACHE_DIR, `${safeAudioHash(audioHash)}.json`);
}

function normalizeAnalysisData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const bpmPrimary = Number(data.bpm?.primary);
  if (!Number.isFinite(bpmPrimary) || bpmPrimary <= 0) return null;
  const durationMs = Number(data.durationMs);
  if (data.durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) return null;
  for (const key of ['beatTimesMs', 'downbeatTimesMs', 'onsets', 'energy', 'noveltyCurve']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) return null;
  }
  return {
    ...data,
    bpm: { ...(data.bpm || {}), primary: bpmPrimary },
    beatTimesMs: Array.isArray(data.beatTimesMs) ? data.beatTimesMs : [],
    downbeatTimesMs: Array.isArray(data.downbeatTimesMs) ? data.downbeatTimesMs : [],
    onsets: Array.isArray(data.onsets) ? data.onsets : [],
    energy: Array.isArray(data.energy) ? data.energy : [],
    noveltyCurve: Array.isArray(data.noveltyCurve) ? data.noveltyCurve : []
  };
}

function readCached(audioHash) {
  const file = cacheFileFor(audioHash);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = normalizeAnalysisData(parsed);
    return normalized?.ok === true ? normalized : null;
  } catch { return null; }
}

function unavailableResult(reason) {
  return { ok: false, reason };
}

async function analyzeMusic(audioFilePath, audioHash, { timeoutMs = DEFAULT_TIMEOUT_MS, signal = null } = {}) {
  const safeHash = safeAudioHash(audioHash);
  const cached = readCached(safeHash);
  if (cached) return { ...cached, fromCache: true };

  if (!fs.existsSync(audioFilePath)) return unavailableResult('source_audio_missing');
  if (!isLibrosaInstalled()) return unavailableResult('librosa_not_installed');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs mora biti pozitivan konačan broj.');

  fs.mkdirSync(ANALYSIS_CACHE_DIR, { recursive: true });
  const outputFile = cacheFileFor(safeHash);
  // Stari `${pid}` naziv se sudarao kada dve analize istog fajla krenu paralelno u istom procesu.
  const tmpOutput = `${outputFile}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const args = [ANALYZER_SCRIPT, audioFilePath, '--output', tmpOutput];

  const result = await new Promise(resolve => {
    let settled = false;
    let abortHandler = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      resolve(value);
    };
    const child = childProcess.execFile(LIBROSA_VENV_PYTHON, args, { timeout: timeoutMs, maxBuffer: 30 * 1024 * 1024 }, error => {
      if (error) {
        const reason = signal?.aborted ? 'analysis_aborted' : (error.killed ? 'analysis_timeout' : 'analysis_process_failed');
        finish(unavailableResult(reason));
        return;
      }
      finish({ pending: true });
    });
    if (signal) {
      abortHandler = () => { try { child.kill(); } catch {} };
      if (signal.aborted) abortHandler(); else signal.addEventListener('abort', abortHandler, { once: true });
    }
  });

  if (!result.pending) {
    try { fs.unlinkSync(tmpOutput); } catch {}
    return result;
  }

  if (!fs.existsSync(tmpOutput)) return unavailableResult('analysis_no_output');
  let data;
  try { data = JSON.parse(fs.readFileSync(tmpOutput, 'utf8')); }
  catch {
    try { fs.unlinkSync(tmpOutput); } catch {}
    return unavailableResult('analysis_invalid_output');
  }

  const normalized = normalizeAnalysisData(data);
  if (!normalized) {
    try { fs.unlinkSync(tmpOutput); } catch {}
    return unavailableResult('analysis_invalid_output');
  }

  // ok:true se upisuje POSLE analyzer podataka da spoljašnji JSON ne može da ga pregazi.
  const finalResult = { ...normalized, ok: true, createdAt: new Date().toISOString() };
  const cacheTemp = `${outputFile}.write-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(cacheTemp, JSON.stringify(finalResult, null, 2), 'utf8');
    fs.renameSync(cacheTemp, outputFile);
  } catch (error) {
    try { fs.unlinkSync(cacheTemp); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
    throw error;
  }
  try { fs.unlinkSync(tmpOutput); } catch {}
  return finalResult;
}

module.exports = {
  analyzeMusic, isLibrosaInstalled, LIBROSA_VENV_PYTHON,
  safeAudioHash, cacheFileFor, normalizeAnalysisData, readCached, unavailableResult
};
