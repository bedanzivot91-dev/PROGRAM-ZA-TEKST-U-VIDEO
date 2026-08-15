'use strict';

// TranscriptionProvider (sekcija 10): pokreće postojeći tools/faster-whisper-helper.py preko
// instaliranog faster-whisper venv-a i vraća reč-po-reč tekst sa vremenskim oznakama.
// Ako alat nije instaliran ili obrada ne uspe, program MORA nastaviti (sekcija 30: "ako nema
// teksta i sve transkripcije padnu, dozvoli muzički storyboard sa upozorenjem") — zato ovaj
// modul nikad ne baca grešku napolje, uvek vraća { ok, ... } sa jasnim razlogom neuspeha.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const WHISPER_VENV_PYTHON = path.join(RUNTIME_DIR, 'faster-whisper-lite', 'venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python');
const HELPER_SCRIPT = path.join(APP_DIR, 'tools', 'faster-whisper-helper.py');
const TRANSCRIPTION_CACHE_DIR = path.join(DATA_DIR, 'cache', 'transcription');

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // CPU int8 transkripcija — nekoliko minuta za prosečnu pesmu

function isTranscriptionInstalled() {
  try { return fs.existsSync(WHISPER_VENV_PYTHON) && fs.existsSync(HELPER_SCRIPT); } catch { return false; }
}

function cacheFileFor(audioHash, model) {
  return path.join(TRANSCRIPTION_CACHE_DIR, `${audioHash}-${model}.json`);
}

function readCached(audioHash, model) {
  const file = cacheFileFor(audioHash, model);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function unavailableResult(reason) {
  return { ok: false, reason, words: [], segments: [], language: null, duration: null };
}

// Pokreće pravi Python proces (argument lista — pravilo 33), timeout, cancellation preko
// AbortSignal. Nikad ne baca — svaki neuspeh postaje unavailableResult() da pozivalac uvek
// dobije upotrebljiv, predvidljiv odgovor.
async function transcribeAudio(audioFilePath, audioHash, { model = 'tiny', language = 'sr', timeoutMs = DEFAULT_TIMEOUT_MS, signal = null } = {}) {
  if (!audioHash) throw new Error('audioHash je obavezan (za keširanje po sadržaju fajla).');

  const cached = readCached(audioHash, model);
  if (cached) return { ...cached, fromCache: true };

  if (!fs.existsSync(audioFilePath)) return unavailableResult('source_audio_missing');
  if (!isTranscriptionInstalled()) return unavailableResult('faster_whisper_not_installed');

  fs.mkdirSync(TRANSCRIPTION_CACHE_DIR, { recursive: true });
  const outputFile = cacheFileFor(audioHash, model);
  const tmpOutput = `${outputFile}.tmp-${process.pid}`;

  const args = [HELPER_SCRIPT, audioFilePath, '--model', model, '--language', language, '--output', tmpOutput];

  const result = await new Promise(resolve => {
    let settled = false;
    const child = childProcess.execFile(WHISPER_VENV_PYTHON, args, { timeout: timeoutMs, maxBuffer: 30 * 1024 * 1024 }, (error) => {
      if (settled) return;
      settled = true;
      if (error) {
        resolve(unavailableResult(error.killed ? 'transcription_timeout' : 'transcription_process_failed'));
        return;
      }
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

  if (!fs.existsSync(tmpOutput)) return unavailableResult('transcription_no_output');
  let data;
  try { data = JSON.parse(fs.readFileSync(tmpOutput, 'utf8')); }
  catch { try { fs.unlinkSync(tmpOutput); } catch {} return unavailableResult('transcription_invalid_output'); }

  const finalResult = {
    ok: true,
    model,
    language: data.language || language,
    duration: data.duration ?? null,
    words: data.words || [],
    segments: data.segments || [],
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(outputFile, JSON.stringify(finalResult, null, 2), 'utf8');
  try { fs.unlinkSync(tmpOutput); } catch {}
  return finalResult;
}

module.exports = { transcribeAudio, isTranscriptionInstalled, WHISPER_VENV_PYTHON };
