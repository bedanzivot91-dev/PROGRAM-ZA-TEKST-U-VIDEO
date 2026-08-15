'use strict';
// End-to-end test: pokreće PRAVI server.js kao dete-proces i preko pravih HTTP zahteva testira
// nove "Lyrics Overlay Studio" REST rute (sekcija 23 dodatka) — text-tracks/text-cues/export/
// presets/fonts. Isti obrazac kao test-audio-projects-integration.js — ništa nije mock.
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');
const SERVER_FILE = path.join(PROGRAM_DIR, 'server.js');
const PORT = 4189;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-lyrics-overlay-api-test-'));

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

function request(method, pathname, { body = null, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      timeout
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json, raw: data, headers: res.headers });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request('GET', '/health');
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch {}
    await delay(300);
  }
  return null;
}

async function main() {
  console.log('== Lyrics Overlay API integracioni testovi (pravi server, prave HTTP rute) ==');
  console.log(`Test data dir: ${DATA_DIR}`);

  const child = spawn(process.execPath, [SERVER_FILE], {
    cwd: PROGRAM_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), MSS_DATA_DIR: DATA_DIR, MSS_SKIP_BROWSER: '1', MSS_SKIP_BACKGROUND: '1' }
  });
  let stderrBuf = '';
  child.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

  const health = await waitForHealth();
  if (!health) {
    bad('Server nije odgovorio na /health', stderrBuf.slice(0, 800));
    console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
    try { child.kill(); } catch {}
    process.exit(1);
  }
  ok('Server pokrenut, /health odgovara');

  try {
    const res = await request('GET', '/api/text-presets');
    if (res.status === 200 && res.json?.presets?.length === 15) ok('GET /api/text-presets → 200, svih 15 preseta');
    else bad('GET /api/text-presets', JSON.stringify(res.json));
  } catch (error) { bad('GET /api/text-presets', error.message); }

  try {
    const res = await request('GET', '/api/text-presets/karaoke-classic');
    if (res.status === 200 && res.json?.style?.name === 'Karaoke Classic') ok('GET /api/text-presets/:id → 200, pravi preset');
    else bad('GET /api/text-presets/:id', JSON.stringify(res.json));
  } catch (error) { bad('GET /api/text-presets/:id', error.message); }

  try {
    const res = await request('GET', '/api/text-presets/ne-postoji-nikad');
    if (res.status === 404) ok('GET /api/text-presets/:id (nepoznat) → 404');
    else bad('GET /api/text-presets/:id nepoznat', `status ${res.status}`);
  } catch (error) { bad('GET /api/text-presets/:id nepoznat', error.message); }

  try {
    const res = await request('GET', '/api/fonts');
    if (res.status === 200 && Array.isArray(res.json?.fonts) && res.json.fonts.length > 0) ok(`GET /api/fonts → 200, ${res.json.fonts.length} fontova sa prave mašine`);
    else bad('GET /api/fonts', JSON.stringify(res.json)?.slice(0, 200));
  } catch (error) { bad('GET /api/fonts', error.message); }

  let projectId = null;
  try {
    const res = await request('POST', '/api/audio-projects', { body: { songTitle: 'Overlay Test Pesma' } });
    if (res.status === 201 && res.json?.project?.projectId) { projectId = res.json.project.projectId; ok(`POST /api/audio-projects → 201, projectId=${projectId}`); }
    else bad('POST /api/audio-projects', JSON.stringify(res.json));
  } catch (error) { bad('POST /api/audio-projects', error.message); }

  if (!projectId) {
    console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
    try { child.kill(); } catch {}
    process.exit(1);
  }

  try {
    const res = await request('GET', `/api/audio-projects/${projectId}/lyrics-overlay`);
    if (res.status === 200 && Array.isArray(res.json?.tracks) && res.json.tracks.length === 0) ok('GET .../lyrics-overlay (svež projekat) → 200, prazan niz');
    else bad('GET .../lyrics-overlay svež projekat', JSON.stringify(res.json));
  } catch (error) { bad('GET .../lyrics-overlay svež projekat', error.message); }

  let trackId = null;
  try {
    const res = await request('POST', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks`, { body: { type: 'lyrics', name: 'Glavni tekst' } });
    if (res.status === 201 && res.json?.track?.trackId) { trackId = res.json.track.trackId; ok(`POST .../text-tracks → 201, trackId=${trackId}`); }
    else bad('POST .../text-tracks', JSON.stringify(res.json));
  } catch (error) { bad('POST .../text-tracks', error.message); }

  if (!trackId) {
    console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
    try { child.kill(); } catch {}
    process.exit(1);
  }

  try {
    const res = await request('PATCH', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}`, { body: { name: 'Preimenovano' } });
    if (res.status === 200 && res.json?.track?.name === 'Preimenovano') ok('PATCH .../text-tracks/:id → 200, ime izmenjeno');
    else bad('PATCH .../text-tracks/:id', JSON.stringify(res.json));
  } catch (error) { bad('PATCH .../text-tracks/:id', error.message); }

  let cueId = null;
  try {
    const res = await request('POST', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}/text-cues`, { body: { startMs: 1000, endMs: 3000, text: 'Sanjam noćas' } });
    if (res.status === 201 && res.json?.cue?.cueId) { cueId = res.json.cue.cueId; ok(`POST .../text-cues → 201, cueId=${cueId}`); }
    else bad('POST .../text-cues', JSON.stringify(res.json));
  } catch (error) { bad('POST .../text-cues', error.message); }

  try {
    const res = await request('POST', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}/text-cues`, { body: { startMs: 5000, endMs: 4000, text: 'nevalidno' } });
    if (res.status === 422) ok('POST .../text-cues (nevalidan cue) → 422');
    else bad('POST .../text-cues nevalidan', `status ${res.status}: ${res.raw.slice(0, 200)}`);
  } catch (error) { bad('POST .../text-cues nevalidan', error.message); }

  if (cueId) {
    try {
      const res = await request('PATCH', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}/text-cues/${cueId}`, { body: { text: 'Izmenjen tekst' } });
      if (res.status === 200 && res.json?.cue?.text === 'Izmenjen tekst') ok('PATCH .../text-cues/:id → 200, tekst izmenjen');
      else bad('PATCH .../text-cues/:id', JSON.stringify(res.json));
    } catch (error) { bad('PATCH .../text-cues/:id', error.message); }

    try {
      const res = await request('GET', `/api/audio-projects/${projectId}/lyrics-overlay/export?trackId=${trackId}&format=srt`);
      if (res.status === 200 && res.raw.includes('Izmenjen tekst') && res.raw.includes('00:00:01,000')) ok('GET .../export?format=srt → 200, validan SRT sadržaj');
      else bad('GET .../export srt', `status ${res.status}: ${res.raw.slice(0, 200)}`);
    } catch (error) { bad('GET .../export srt', error.message); }

    try {
      const res = await request('GET', `/api/audio-projects/${projectId}/lyrics-overlay/export?trackId=${trackId}&format=ass`);
      if (res.status === 200 && res.raw.includes('[Script Info]') && res.raw.includes('Dialogue:')) ok('GET .../export?format=ass → 200, validan ASS sadržaj');
      else bad('GET .../export ass', `status ${res.status}: ${res.raw.slice(0, 200)}`);
    } catch (error) { bad('GET .../export ass', error.message); }

    try {
      const res = await request('GET', `/api/audio-projects/${projectId}/lyrics-overlay/validate`);
      if (res.status === 200 && res.json?.valid === true) ok('GET .../lyrics-overlay/validate → 200, valid:true');
      else bad('GET .../lyrics-overlay/validate', JSON.stringify(res.json));
    } catch (error) { bad('GET .../lyrics-overlay/validate', error.message); }

    try {
      const res = await request('DELETE', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}/text-cues/${cueId}`);
      if (res.status === 200 && res.json?.cue?.deleted === true) ok('DELETE .../text-cues/:id (soft-delete) → 200, deleted:true');
      else bad('DELETE .../text-cues/:id', JSON.stringify(res.json));
    } catch (error) { bad('DELETE .../text-cues/:id', error.message); }

    try {
      const res = await request('POST', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}/text-cues/${cueId}/restore`);
      if (res.status === 200 && res.json?.cue?.deleted === false) ok('POST .../text-cues/:id/restore → 200, deleted:false');
      else bad('POST .../text-cues/:id/restore', JSON.stringify(res.json));
    } catch (error) { bad('POST .../text-cues/:id/restore', error.message); }
  }

  try {
    const res = await request('DELETE', `/api/audio-projects/${projectId}/lyrics-overlay/text-tracks/${trackId}`);
    if (res.status === 200 && res.json?.ok === true) ok('DELETE .../text-tracks/:id → 200');
    else bad('DELETE .../text-tracks/:id', JSON.stringify(res.json));
  } catch (error) { bad('DELETE .../text-tracks/:id', error.message); }

  try {
    const res = await request('GET', `/api/audio-projects/${projectId}/lyrics-overlay`);
    if (res.status === 200 && res.json?.tracks?.length === 0) ok('GET .../lyrics-overlay posle brisanja → 200, prazan niz');
    else bad('GET .../lyrics-overlay posle brisanja', JSON.stringify(res.json));
  } catch (error) { bad('GET .../lyrics-overlay posle brisanja', error.message); }

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  try { child.kill(); } catch {}
  process.exit(fail ? 1 : 0);
}

main();
