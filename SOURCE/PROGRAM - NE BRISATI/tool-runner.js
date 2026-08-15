'use strict';

// Pokreće tools/*.ps1 instalacione skripte kao pozadinski posao sa uhvaćenim izlazom, umesto da
// otvara sirov, vidljiv PowerShell prozor bez ikakve povratne informacije programu. Samo za
// skripte koje NE traže unos tokom rada (Read-Host) — te skripte ne blokiraju kad je ulaz
// prazan/zatvoren, PowerShell bez konzole vraća prazan string i nastavlja dalje.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const APP_DIR = __dirname;
const SCRIPTS_DIR = path.join(APP_DIR, 'tools'); // izvorne .ps1 skripte, isporučuju se sa programom (samo za čitanje)
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime'); // upisiva lokacija za preuzete binarne alate (ffmpeg, RIFE, itd.)
const MAX_LOG_LINES = 800;

// id -> { name, script, category }. Samo skripte bez obaveznog unosa tokom instalacije.
const TOOL_REGISTRY = {
  ffmpeg: { name: 'FFmpeg (portable)', script: 'INSTALIRAJ-FFMPEG-LITE.ps1', category: 'render' },
  hyperframes: { name: 'HyperFrames CLI', script: 'INSTALIRAJ-HYPERFRAMES.ps1', category: 'render' },
  pyscenedetect: { name: 'PySceneDetect (precizna analiza)', script: 'INSTALIRAJ-PYSCENEDETECT-LITE.ps1', category: 'analiza' },
  'real-esrgan': { name: 'Real-ESRGAN (upscale)', script: 'INSTALIRAJ-REAL-ESRGAN-LITE.ps1', category: 'slika' },
  rife: { name: 'RIFE (interpolacija)', script: 'INSTALIRAJ-RIFE-LITE.ps1', category: 'video' },
  'faster-whisper': { name: 'Faster-Whisper (transkripcija)', script: 'INSTALIRAJ-FASTER-WHISPER-LITE.ps1', category: 'titlovi' },
  demucs: { name: 'Demucs (odvajanje vokala/instrumentala)', script: 'INSTALIRAJ-DEMUCS-LITE.ps1', category: 'audio' },
  librosa: { name: 'Librosa (BPM/energija/analiza pesme)', script: 'INSTALIRAJ-LIBROSA-LITE.ps1', category: 'audio' }
};

const jobs = new Map(); // toolId -> { status, log:[], startedAt, endedAt, exitCode, child }

function isInstalledMarker(toolId) {
  const markers = {
    ffmpeg: path.join(RUNTIME_DIR, 'ffmpeg-portable'),
    'real-esrgan': path.join(RUNTIME_DIR, 'realesrgan-ncnn-vulkan'),
    rife: path.join(RUNTIME_DIR, 'rife-ncnn-vulkan'),
    'faster-whisper': path.join(RUNTIME_DIR, 'faster-whisper-lite', 'venv'),
    hyperframes: path.join(RUNTIME_DIR, 'engines', 'hyperframes', 'node_modules'),
    pyscenedetect: path.join(RUNTIME_DIR, 'pyscenedetect-venv'),
    demucs: path.join(RUNTIME_DIR, 'demucs-lite', 'venv'),
    librosa: path.join(RUNTIME_DIR, 'librosa-lite', 'venv')
  };
  const marker = markers[toolId];
  try { return Boolean(marker && fs.existsSync(marker)); } catch { return false; }
}

function listTools() {
  return Object.entries(TOOL_REGISTRY).map(([id, meta]) => {
    const job = jobs.get(id);
    return {
      id, name: meta.name, category: meta.category,
      installed: isInstalledMarker(id),
      status: job?.status || 'idle',
      startedAt: job?.startedAt || null,
      endedAt: job?.endedAt || null,
      exitCode: job?.exitCode ?? null
    };
  });
}

function appendLog(job, chunk) {
  const text = String(chunk).replace(/\r/g, '');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    job.log.push(line);
  }
  if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
}

function runTool(toolId) {
  const meta = TOOL_REGISTRY[toolId];
  if (!meta) throw new Error('Nepoznat alat.');
  const existing = jobs.get(toolId);
  if (existing?.status === 'running') throw new Error('Instalacija ovog alata je već u toku.');
  if (process.platform !== 'win32') throw new Error('Instalacija je pripremljena za Windows.');
  const script = path.join(SCRIPTS_DIR, meta.script);
  if (!fs.existsSync(script)) throw new Error('Instalaciona skripta nije pronađena.');
  try { fs.mkdirSync(RUNTIME_DIR, { recursive: true }); } catch {}

  const job = { status: 'running', log: [], startedAt: new Date().toISOString(), endedAt: null, exitCode: null, child: null };
  jobs.set(toolId, job);
  appendLog(job, `Pokrećem: ${meta.script}`);

  const child = childProcess.spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script
  ], {
    cwd: SCRIPTS_DIR,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MSS_TOOLS_DIR: RUNTIME_DIR }
  });
  job.child = child;
  child.stdout.on('data', chunk => appendLog(job, chunk));
  child.stderr.on('data', chunk => appendLog(job, chunk));
  child.on('error', error => {
    job.status = 'failed';
    job.endedAt = new Date().toISOString();
    appendLog(job, `GREŠKA: ${error.message}`);
  });
  child.on('exit', code => {
    job.exitCode = code;
    job.endedAt = new Date().toISOString();
    job.status = code === 0 ? 'success' : 'failed';
    appendLog(job, code === 0 ? 'Gotovo.' : `Proces završen sa kodom ${code}.`);
    job.child = null;
  });
  return { ok: true, toolId };
}

function toolStatus(toolId) {
  const meta = TOOL_REGISTRY[toolId];
  if (!meta) throw new Error('Nepoznat alat.');
  const job = jobs.get(toolId);
  if (!job) return { ok: true, toolId, status: 'idle', log: [], exitCode: null };
  return { ok: true, toolId, status: job.status, log: job.log.slice(-200), exitCode: job.exitCode, startedAt: job.startedAt, endedAt: job.endedAt };
}

function cancelTool(toolId) {
  const job = jobs.get(toolId);
  if (!job || job.status !== 'running' || !job.child) return { ok: true, cancelled: false };
  try { job.child.kill(); } catch {}
  job.status = 'failed';
  job.endedAt = new Date().toISOString();
  appendLog(job, 'Otkazano na zahtev korisnika.');
  return { ok: true, cancelled: true };
}

module.exports = { listTools, runTool, toolStatus, cancelTool, TOOL_REGISTRY };
