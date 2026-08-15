'use strict';
// Server testovi: pokreće server.js kao pravi child proces (kao što će ga Electron pokretati),
// pogađa stvarne API rute preko HTTP-a i proverava odgovore. Ništa se ne simulira.
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');
const SERVER_FILE = path.join(PROGRAM_DIR, 'server.js');
const PORT = 4187; // van tipičnog opsega koji koristi razvojni launcher, i dalje unutar 4180-4239
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-test-data-'));

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

function request(method, pathname, { headers = {}, body = null, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json', ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      timeout
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json, raw: data });
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
  console.log('== Server testovi ==');
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
    bad('Server nije odgovorio na /health u roku od 15s', stderrBuf.slice(0, 800));
    console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
    try { child.kill(); } catch {}
    process.exit(1);
  }
  ok(`/health — ok=true, verzija=${health.version}, port=${health.port}`);
  if (health.version === '15.6') ok('/health verzija je 15.6');
  else bad('/health verzija NIJE 15.5', String(health.version));

  if (health.dataDir !== undefined || true) {
    // MSS_DATA_DIR mora stvarno biti iskorišćen — proveravamo da server piše u test folder, ne u PROGRAM/data.
    const wroteToTestDir = fs.existsSync(path.join(DATA_DIR, 'server.pid')) || fs.existsSync(path.join(DATA_DIR, 'chatgpt-bridge')) || fs.readdirSync(DATA_DIR).length > 0;
    if (wroteToTestDir) ok('MSS_DATA_DIR — server piše u prosleđeni test folder');
    else bad('MSS_DATA_DIR — test folder je prazan, server možda i dalje piše pored server.js');
  }

  const simpleGets = [
    '/api/app/status',
    '/api/modules/status',
    '/api/security/status',
    '/api/maintenance/diagnostics',
    '/api/plus-bridge/config',
    '/api/plus-bridge/status'
  ];
  for (const route of simpleGets) {
    try {
      const res = await request('GET', route);
      if (res.status === 200) ok(`GET ${route} → 200`);
      else bad(`GET ${route}`, `status ${res.status}: ${res.raw.slice(0, 200)}`);
    } catch (error) { bad(`GET ${route}`, error.message); }
  }

  try {
    const listRes = await request('GET', '/api/modules/tools');
    const hasEight = Array.isArray(listRes.json?.tools) && listRes.json.tools.length === 8;
    if (listRes.status === 200 && hasEight) ok('GET /api/modules/tools → 200, 8 registrovanih alata');
    else bad('GET /api/modules/tools', `status ${listRes.status}, tools=${listRes.json?.tools?.length}`);

    const badRunRes = await request('POST', '/api/modules/tools/run', { body: { toolId: 'nepostojeci-alat' } });
    if (badRunRes.status === 400) ok('POST /api/modules/tools/run (nepoznat alat) → 400');
    else bad('POST /api/modules/tools/run (nepoznat alat)', `očekivano 400, dobijeno ${badRunRes.status}`);

    const statusRes = await request('GET', '/api/modules/tools/status?toolId=ffmpeg');
    if (statusRes.status === 200 && statusRes.json?.status === 'idle') ok('GET /api/modules/tools/status → 200, idle pre pokretanja');
    else bad('GET /api/modules/tools/status', `status ${statusRes.status}, toolStatus=${statusRes.json?.status}`);
  } catch (error) { bad('/api/modules/tools/*', error.message); }

  // /api/system/profile pokreće PowerShell CIM upite (GPU/disk/CPU) — sporije od običnih ruta,
  // zato dobija duži timeout. I dalje mora da odgovori (ne sme zamrznuti server, vidi advanced-tools.js psJson).
  try {
    // Sekcija 24: OAuth NIJE konfigurisan u test okruženju (stvarno stanje) — proverava se da
    // status jasno prijavljuje šta nedostaje i tačan redirect URI umesto tihog pada.
    const res = await request('GET', '/api/youtube/oauth-status');
    if (res.status === 200 && res.json?.configured === false && res.json?.redirectUri === `http://localhost:${PORT}/oauth2callback` && res.json?.steps?.length > 0) {
      ok(`GET /api/youtube/oauth-status → 200, configured:false, tačan redirect URI, ${res.json.steps.length} konkretnih koraka`);
    } else bad('GET /api/youtube/oauth-status', JSON.stringify(res.json));
  } catch (error) { bad('GET /api/youtube/oauth-status', error.message); }

  try {
    const res = await request('GET', '/api/system/profile', { timeout: 25000 });
    if (res.status === 200 && res.json?.ok) ok(`GET /api/system/profile → 200 (profileClass=${res.json.profileClass})`);
    else bad('GET /api/system/profile', `status ${res.status}`);
  } catch (error) { bad('GET /api/system/profile', error.message); }

  try {
    const before = Date.now();
    const res = await request('GET', '/health', { timeout: 3000 });
    const elapsed = Date.now() - before;
    if (res.status === 200 && elapsed < 2000) ok(`/health odgovara brzo (${elapsed}ms) i posle system/profile — event loop nije blokiran`);
    else bad('/health responsiveness posle system/profile', `${elapsed}ms, status ${res.status}`);
  } catch (error) { bad('/health responsiveness posle system/profile', error.message); }

  try {
    const res = await request('POST', '/api/app/heartbeat?id=test-client');
    if (res.status === 200 && res.json?.ok) ok('POST /api/app/heartbeat → 200');
    else bad('POST /api/app/heartbeat', `status ${res.status}`);
  } catch (error) { bad('POST /api/app/heartbeat', error.message); }

  try {
    const res = await request('POST', '/api/plus-bridge/test-job', { body: {} });
    if (res.status === 409) ok('POST /api/plus-bridge/test-job → 409 (nema instaliran extension, očekivano)');
    else bad('POST /api/plus-bridge/test-job', `očekivano 409, dobijeno ${res.status}`);
  } catch (error) { bad('POST /api/plus-bridge/test-job', error.message); }

  try {
    const res = await request('POST', '/api/maintenance/backup', { body: { notState: true } });
    if (res.status === 400) ok('POST /api/maintenance/backup (neispravan) → 400, ne 500');
    else bad('POST /api/maintenance/backup (neispravan)', `očekivano 400, dobijeno ${res.status}`);
  } catch (error) { bad('POST /api/maintenance/backup', error.message); }

  try {
    const backupRes = await request('POST', '/api/maintenance/backup', { body: { state: { songTitle: 'test-daily-backup' } } });
    const today = new Date().toISOString().slice(0, 10);
    const dailyRes = await request('GET', '/api/maintenance/daily-backups');
    const hasToday = Array.isArray(dailyRes.json?.backups) && dailyRes.json.backups.some(item => item.name === `dnevni-${today}.json`);
    if (backupRes.status === 200 && hasToday) ok('Dnevni backup arhiv — automatski napravljen uz redovan backup');
    else bad('Dnevni backup arhiv', `backup status ${backupRes.status}, dailyRes ${JSON.stringify(dailyRes.json)}`);
    const restoreRes = await request('GET', `/api/maintenance/restore-daily?date=${today}`);
    if (restoreRes.status === 200 && restoreRes.json?.state?.songTitle === 'test-daily-backup') ok('GET /api/maintenance/restore-daily → vraća sačuvano stanje');
    else bad('GET /api/maintenance/restore-daily', `status ${restoreRes.status}`);
  } catch (error) { bad('Dnevni backup arhiv', error.message); }

  try {
    const res = await request('GET', '/api/app/status', { headers: { 'X-Forwarded-For': '1.2.3.4' } });
    if (res.status === 403) ok('Lažni X-Forwarded-For → 403 (lokalna zaštita radi)');
    else bad('X-Forwarded-For zaštita', `očekivano 403, dobijeno ${res.status}`);
  } catch (error) { bad('X-Forwarded-For zaštita', error.message); }

  try {
    const res = await request('POST', '/api/maintenance/backup', { body: '{ovo nije validan JSON' });
    if (res.status >= 400 && res.status < 500) ok(`Neispravan JSON body → ${res.status} (nije pukla 500 interna greška)`);
    else bad('Neispravan JSON body', `dobijeno ${res.status}`);
  } catch (error) { bad('Neispravan JSON body', error.message); }

  try {
    const res = await request('GET', '/');
    if (res.status === 200 && res.raw.includes('<html')) ok('GET / vraća index.html');
    else bad('GET /', `status ${res.status}`);
  } catch (error) { bad('GET /', error.message); }

  try {
    const shutdown = await request('POST', '/api/app/shutdown');
    if (shutdown.status === 200) ok('POST /api/app/shutdown → 200');
    else bad('POST /api/app/shutdown', `status ${shutdown.status}`);
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 4000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    if (child.exitCode !== null || child.signalCode) ok('Server proces se ugasio posle shutdown poziva');
    else bad('Server proces gašenje', 'proces i dalje živi, prisilno ubijen');
  } catch (error) {
    bad('Graceful shutdown', error.message);
    try { child.kill(); } catch {}
  }

  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(error => {
  console.error('Neuhvaćena greška u test skripti:', error);
  process.exit(1);
});
