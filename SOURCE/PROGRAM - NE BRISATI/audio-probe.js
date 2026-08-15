'use strict';

// Čita STVARNE audio metapodatke (trajanje, format, codec, sample rate, kanale, bitrate)
// pomoću FFprobe. Nikad ne pretpostavlja trajanje — ako FFprobe ne uspe, ceo probe baca grešku
// umesto da vrati izmišljenu vrednost (pravilo 0.1-0.3 iz master prompta).

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const APP_DIR = __dirname;
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(APP_DIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac']);

function findExecutableRecursive(root, fileName, depthLimit = 4) {
  if (!fs.existsSync(root)) return null;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full;
      if (entry.isDirectory() && depth < depthLimit) stack.push({ dir: full, depth: depth + 1 });
    }
  }
  return null;
}

let cachedFfprobePath = null;
function resolveFfprobePath() {
  if (cachedFfprobePath && fs.existsSync(cachedFfprobePath)) return cachedFfprobePath;
  const exeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const bundled = findExecutableRecursive(path.join(RUNTIME_DIR, 'ffmpeg-portable'), exeName);
  if (bundled) { cachedFfprobePath = bundled; return bundled; }
  cachedFfprobePath = exeName; // oslanjanje na sistemski PATH kao poslednju opciju
  return cachedFfprobePath;
}

function runFfprobe(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const ffprobePath = resolveFfprobePath();
    const child = childProcess.execFile(ffprobePath, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const notFound = error.code === 'ENOENT';
        const message = notFound
          ? 'FFprobe nije pronađen. Instaliraj FFmpeg preko panela LOKALNI ALATI u programu.'
          : `FFprobe greška: ${(stderr || error.message || '').toString().trim().slice(0, 500)}`;
        return reject(Object.assign(new Error(message), { code: notFound ? 'FFPROBE_NOT_FOUND' : 'FFPROBE_FAILED' }));
      }
      resolve(stdout);
    });
    child.on('error', reject);
  });
}

// Vraća precizno trajanje u milisekundama i tačno se drži pravila 0.4: sva interna vremena
// u celim milisekundama, ne zaokruženim sekundama.
function msFromSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

async function probeAudioFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error('Audio fajl nije pronađen.');
    error.code = 'FILE_NOT_FOUND';
    throw error;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    const error = new Error(`Nepodržan format fajla: ${ext || '(bez ekstenzije)'}. Podržano: MP3, WAV, M4A, AAC, FLAC.`);
    error.code = 'UNSUPPORTED_FORMAT';
    throw error;
  }

  const stdout = await runFfprobe([
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ]);

  let data;
  try { data = JSON.parse(stdout); }
  catch {
    const error = new Error('FFprobe je vratio neispravan JSON. Fajl je verovatno oštećen.');
    error.code = 'CORRUPT_FILE';
    throw error;
  }

  const audioStreams = (data.streams || []).filter(s => s.codec_type === 'audio');
  if (!audioStreams.length) {
    const error = new Error('Fajl ne sadrži audio zapis.');
    error.code = 'NO_AUDIO_STREAM';
    throw error;
  }
  const stream = audioStreams[0];

  const formatDurationMs = msFromSeconds(data.format?.duration);
  const streamDurationMs = msFromSeconds(stream.duration);

  if (formatDurationMs === null && streamDurationMs === null) {
    const error = new Error('FFprobe nije mogao da odredi trajanje fajla.');
    error.code = 'DURATION_UNKNOWN';
    throw error;
  }

  // Ako se stream i format trajanje razlikuju, čuvamo oba i biramo pouzdaniju vrednost
  // (pravilo 7 Korak B) — format duration je po pravilu tačniji za VBR MP3 sa lošim headerom.
  const durationMismatchMs = formatDurationMs !== null && streamDurationMs !== null
    ? Math.abs(formatDurationMs - streamDurationMs) : null;
  const chosenDurationMs = formatDurationMs !== null ? formatDurationMs : streamDurationMs;
  const durationSource = formatDurationMs !== null ? 'format_duration' : 'stream_duration';

  return {
    ok: true,
    filePath,
    durationMs: chosenDurationMs,
    durationSource,
    formatDurationMs,
    streamDurationMs,
    durationMismatchMs,
    formatName: data.format?.format_name || '',
    codec: stream.codec_name || '',
    sampleRate: stream.sample_rate ? Number(stream.sample_rate) : null,
    channels: stream.channels || null,
    bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : null,
    startTimeMs: msFromSeconds(data.format?.start_time) || 0,
    fileSizeBytes: data.format?.size ? Number(data.format.size) : fs.statSync(filePath).size
  };
}

module.exports = { probeAudioFile, resolveFfprobePath, SUPPORTED_EXTENSIONS };
