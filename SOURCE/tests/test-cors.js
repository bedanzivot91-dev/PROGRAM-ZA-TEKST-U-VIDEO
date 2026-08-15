'use strict';
// Testira CORS popravku iz sekcije 5 na PRAVOM serveru preko stvarnih HTTP zahteva sa Origin
// zaglavljem — ne samo OPTIONS preflight (stari bug), nego i STVARNE GET/POST odgovore.
// Takođe proverava da se Host zaglavlje NE koristi kao Origin (drugi stari bug) i da
// nepoznati Origin NE dobija nikakvo CORS zaglavlje (bezbedan podrazumevani izbor).
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { MSS_EXTENSION_ORIGIN } = require('../PROGRAM - NE BRISATI/extension-identity');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');
const SERVER_FILE = path.join(PROGRAM_DIR, 'server.js');
const PORT = 4189;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-cors-test-data-'));

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

function request(method, pathname, { headers = {}, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: pathname, method, headers, timeout }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await request('GET', '/health'); if (res.status === 200) return true; } catch {}
    await delay(300);
  }
  return false;
}

async function main() {
  console.log('== CORS testovi (pravi server, pravi HTTP zahtevi) ==');
  console.log(`Extension origin koji se testira: ${MSS_EXTENSION_ORIGIN}`);

  const child = spawn(process.execPath, [SERVER_FILE], {
    cwd: PROGRAM_DIR, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), MSS_DATA_DIR: DATA_DIR, MSS_SKIP_BROWSER: '1', MSS_SKIP_BACKGROUND: '1' }
  });

  const up = await waitForHealth();
  if (!up) { bad('Server nije odgovorio na /health'); console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`); try { child.kill(); } catch {} process.exit(1); }
  ok('Server pokrenut');

  try {
    const res = await request('GET', '/api/app/status', { headers: { Origin: MSS_EXTENSION_ORIGIN } });
    if (res.headers['access-control-allow-origin'] === MSS_EXTENSION_ORIGIN) {
      ok('STVARAN (ne-OPTIONS) GET odgovor od dozvoljenog Origin-a (ekstenzija) dobija CORS zaglavlje — stari bug (samo OPTIONS) je popravljen');
    } else bad('CORS zaglavlje na GET odgovoru za ekstenziju', `dobijeno: ${res.headers['access-control-allow-origin']}`);
    if (res.headers['vary'] === 'Origin') ok('Vary: Origin zaglavlje je prisutno');
    else bad('Vary: Origin zaglavlje', `dobijeno: ${res.headers['vary']}`);
  } catch (error) { bad('GET sa Origin ekstenzije', error.message); }

  try {
    const res = await request('GET', '/api/app/status', { headers: { Origin: `http://127.0.0.1:${PORT}` } });
    if (res.headers['access-control-allow-origin'] === `http://127.0.0.1:${PORT}`) ok('GET sa Origin 127.0.0.1:PORT dobija tačno taj Origin nazad (ne Host zaglavlje)');
    else bad('CORS zaglavlje za 127.0.0.1 Origin', `dobijeno: ${res.headers['access-control-allow-origin']}`);
  } catch (error) { bad('GET sa Origin 127.0.0.1', error.message); }

  try {
    // KLJUČNA provera starog bug-a: server MORA vratiti Origin zaglavlje kakvo je poslato,
    // NIKAD Host zaglavlje (koje bi uvek bilo "127.0.0.1:PORT" bez obzira na stvarni Origin).
    const res = await request('GET', '/api/app/status', {
      headers: { Origin: `http://localhost:${PORT}`, Host: `127.0.0.1:${PORT}` }
    });
    if (res.headers['access-control-allow-origin'] === `http://localhost:${PORT}`) {
      ok('CORS zaglavlje odražava STVARNI Origin zahteva, ne Host zaglavlje servera (stari bug popravljen)');
    } else bad('Origin vs Host razlikovanje', `očekivano http://localhost:${PORT}, dobijeno ${res.headers['access-control-allow-origin']}`);
  } catch (error) { bad('Origin vs Host razlikovanje', error.message); }

  try {
    const res = await request('GET', '/api/app/status', { headers: { Origin: 'https://evil-example.com' } });
    if (!res.headers['access-control-allow-origin']) ok('Nepoznat/neovlašćen Origin NE dobija NIKAKVO CORS zaglavlje (bezbedan podrazumevani izbor)');
    else bad('Neovlašćen Origin dobio CORS zaglavlje', res.headers['access-control-allow-origin']);
  } catch (error) { bad('Neovlašćen Origin', error.message); }

  try {
    const res = await request('OPTIONS', '/api/app/status', { headers: { Origin: MSS_EXTENSION_ORIGIN, 'Access-Control-Request-Method': 'POST' } });
    const allowHeaders = String(res.headers['access-control-allow-headers'] || '');
    if (res.status === 204 && allowHeaders.includes('Authorization') && allowHeaders.includes('X-MSS-Bridge-Key')) {
      ok('OPTIONS preflight od ekstenzije → 204, Allow-Headers uključuje Authorization i X-MSS-Bridge-Key');
    } else bad('OPTIONS preflight', `status ${res.status}, allow-headers: ${allowHeaders}`);
  } catch (error) { bad('OPTIONS preflight', error.message); }

  try {
    // Bez Origin zaglavlja uopšte (npr. isti-origin zahtev iz Electron prozora) — normalan rad,
    // ne treba CORS zaglavlje, i ne sme baciti grešku.
    const res = await request('GET', '/health');
    if (res.status === 200 && !res.headers['access-control-allow-origin']) ok('Zahtev BEZ Origin zaglavlja (isti-origin) radi normalno bez CORS zaglavlja');
    else bad('Zahtev bez Origin zaglavlja', `status ${res.status}`);
  } catch (error) { bad('Zahtev bez Origin zaglavlja', error.message); }

  try {
    const res = await request('GET', '/api/plus-bridge/diagnostics');
    const data = JSON.parse(res.raw);
    const testIds = data.tests?.map(t => t.id);
    if (res.status === 200 && Array.isArray(data.tests) && data.tests.length === 4 && testIds.every(id => [1, 2, 3, 4].includes(id)) && data.extensionId?.length === 32) {
      ok(`GET /api/plus-bridge/diagnostics → 200, 4 test rezultata (TEST 1-4 iz sekcije 5), extensionId prisutan`);
    } else bad('GET /api/plus-bridge/diagnostics', JSON.stringify(data));
    const corsTest = data.tests?.find(t => t.id === 2);
    if (corsTest?.ok === true) ok('Diagnostics TEST 2 (CORS preflight) prijavljuje da je ekstenzija na allow-listi');
    else bad('Diagnostics TEST 2 CORS status', JSON.stringify(corsTest));
  } catch (error) { bad('GET /api/plus-bridge/diagnostics', error.message); }

  try {
    await request('POST', '/api/app/shutdown');
    await new Promise(resolve => { const t = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 4000); child.once('exit', () => { clearTimeout(t); resolve(); }); });
  } catch { try { child.kill(); } catch {} }

  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
