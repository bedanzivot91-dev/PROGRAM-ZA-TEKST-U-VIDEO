'use strict';
// End-to-end test: pokreće PRAVI server.js kao dete-proces, pravi pravi HTTP zahtev za
// kreiranje projekta, otprema STVARAN audio fajl (sintetički ton generisan FFmpeg-om,
// tests/fixtures/test-tone.mp3) i proverava da trajanje koje se vrati kroz ceo
// HTTP round-trip odgovara stvarnom FFprobe rezultatu. MP3 encoder padding zavisi od verzije,
 // zato se proverava isti dozvoljeni fizički opseg kao u test-audio-probe.js. Ništa nije mock.
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');
const SERVER_FILE = path.join(PROGRAM_DIR, 'server.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'test-tone.mp3');
const MIN_EXPECTED_DURATION_MS = 7300;
const MAX_EXPECTED_DURATION_MS = 7450;
function validDuration(ms) { return Number.isFinite(ms) && ms >= MIN_EXPECTED_DURATION_MS && ms <= MAX_EXPECTED_DURATION_MS; }
const PORT = 4188;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-audio-test-data-'));

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
  console.log('== Audio Projects integracioni testovi (pravi server, pravi audio fajl) ==');
  console.log(`Test data dir: ${DATA_DIR}`);
  console.log(`Fixture: ${FIXTURE}`);

  if (!fs.existsSync(FIXTURE)) {
    console.error('Fixture ne postoji — pokreni test-audio-probe.js setup prvo (generiše se preko FFmpeg-a).');
    process.exit(1);
  }

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

  let projectId = null;
  try {
    const res = await request('POST', '/api/audio-projects', { body: { songTitle: 'Test Pesma', artist: 'Test Izvođač' } });
    if (res.status === 201 && res.json?.project?.projectId) {
      projectId = res.json.project.projectId;
      ok(`POST /api/audio-projects → 201, projectId=${projectId}`);
    } else bad('POST /api/audio-projects', `status ${res.status}: ${res.raw.slice(0, 200)}`);
  } catch (error) { bad('POST /api/audio-projects', error.message); }

  if (projectId) {
    try {
      const res = await request('GET', '/api/audio-projects');
      const found = res.json?.projects?.some(p => p.projectId === projectId);
      if (res.status === 200 && found) ok('GET /api/audio-projects → lista sadrži novi projekat');
      else bad('GET /api/audio-projects', `status ${res.status}`);
    } catch (error) { bad('GET /api/audio-projects', error.message); }

    try {
      const audioBase64 = fs.readFileSync(FIXTURE).toString('base64');
      const res = await request('POST', `/api/audio-projects/${projectId}/audio`, { body: { fileName: 'test-tone.mp3', audioBase64 } });
      if (res.status === 200 && validDuration(res.json?.project?.audio?.durationMs)) {
        ok(`POST .../audio → 200, durationMs=${res.json?.project?.audio?.durationMs} (validan FFprobe rezultat kroz PUN HTTP round-trip)`);
      } else bad('POST .../audio trajanje', `status ${res.status}, durationMs=${res.json?.project?.audio?.durationMs}, body=${res.raw.slice(0, 300)}`);
      if (res.json?.project?.audio?.codec === 'mp3' && res.json?.project?.progress?.audio === 100) ok('POST .../audio → codec i progress ispravni');
      else bad('POST .../audio metapodaci', JSON.stringify(res.json?.project?.audio));
    } catch (error) { bad('POST .../audio (validan fajl)', error.message); }

    try {
      const res = await request('GET', `/api/audio-projects/${projectId}`);
      if (res.status === 200 && res.json?.project?.audioHash?.length === 64) ok('GET /api/audio-projects/:id → audioHash sačuvan (SHA-256, 64 hex karaktera)');
      else bad('GET /api/audio-projects/:id audioHash', JSON.stringify(res.json));
    } catch (error) { bad('GET /api/audio-projects/:id', error.message); }

    try {
      const lyricsText = '[Verse]\nPrvi red pesme\n[Chorus]\nRefren se ponavlja\n[Verse]\nDrugi red\n[Chorus]\nRefren se ponavlja';
      const res = await request('PATCH', `/api/audio-projects/${projectId}/lyrics`, { body: { text: lyricsText } });
      const sections = res.json?.lyrics?.sections || [];
      const choruses = sections.filter(s => s.type === 'chorus');
      if (res.status === 200 && choruses.length === 2 && choruses[1].isRepeated) {
        ok('PATCH .../lyrics → sekcije parsirane, ponovljeni refren prepoznat kroz pravi HTTP zahtev');
      } else bad('PATCH .../lyrics', JSON.stringify(res.json));
    } catch (error) { bad('PATCH .../lyrics', error.message); }

    try {
      const res = await request('GET', `/api/audio-projects/${projectId}/lyrics`);
      if (res.status === 200 && res.json?.lyrics?.sections?.length === 4) ok('GET .../lyrics → vraća prethodno sačuvan tekst');
      else bad('GET .../lyrics', JSON.stringify(res.json));
    } catch (error) { bad('GET .../lyrics', error.message); }

    try {
      // Nema poravnatog teksta ni muzičke analize (alati nisu instalirani) — ScenePlanner mora
      // i dalje da vrati validan timeline (cela pesma kao jedna scena, bez kandidata).
      const res = await request('POST', `/api/audio-projects/${projectId}/plan-scenes`);
      const scenes = res.json?.project?.storyboard?.scenes;
      if (res.status === 200 && Array.isArray(scenes) && scenes.length >= 1 && scenes[0].startMs === 0 && validDuration(scenes[scenes.length - 1].endMs)) {
        ok(`POST .../plan-scenes (bez kandidata) → 200, validan timeline (${scenes.length} scena, 0-${scenes[scenes.length - 1].endMs}ms)`);
      } else bad('POST .../plan-scenes bez kandidata', JSON.stringify(res.json));
    } catch (error) { bad('POST .../plan-scenes bez kandidata', error.message); }

    try {
      // Sada dodajemo poravnat tekst RUČNO (simulira ono što bi lyrics-alignment.js proizveo
      // da je faster-whisper instaliran) da dokažemo da plan-scenes stvarno KORISTI sekcije kada postoje.
      await request('POST', '/api/audio-projects', { body: {} }); // no-op, samo da postoji prethodni poziv u nizu
      const lyricsRes = await request('PATCH', `/api/audio-projects/${projectId}/lyrics`, { body: { text: '[Verse]\nPrva linija\n[Chorus]\nRefren linija' } });
      // Ručno ubacujemo startMs/endMs u sačuvane linije preko GET+re-save nije podržano rutom,
      // pa direktno proveravamo da plan-scenes I DALJE radi (bez padanja) i kada lyrics postoje ali NISU poravnati.
      const res = await request('POST', `/api/audio-projects/${projectId}/plan-scenes`, { body: { editingIntensity: 'dynamic', minimumSceneDuration: 500 } });
      const scenes = res.json?.project?.storyboard?.scenes;
      if (res.status === 200 && Array.isArray(scenes) && validDuration(scenes[scenes.length - 1].endMs)) {
        ok('POST .../plan-scenes sa unetim (ali nepravanatim) tekstom i custom podešavanjima → 200, i dalje validan timeline');
      } else bad('POST .../plan-scenes sa tekstom', JSON.stringify(res.json));
    } catch (error) { bad('POST .../plan-scenes sa tekstom', error.message); }

    try {
      // Pun tok: plan-scenes -> image-prompts/next-batch -> submit -> next-batch opet (done).
      const planRes = await request('POST', `/api/audio-projects/${projectId}/plan-scenes`);
      const sceneIds = planRes.json?.project?.storyboard?.scenes?.map(s => s.sceneId) || [];
      if (!sceneIds.length) throw new Error('plan-scenes nije vratio nijednu scenu');

      const batchRes = await request('POST', `/api/audio-projects/${projectId}/image-prompts/next-batch`);
      const batch = batchRes.json;
      if (batchRes.status === 200 && batch.batchId && batch.sceneIds.length === sceneIds.length) {
        ok(`POST .../image-prompts/next-batch → 200, batchId=${batch.batchId}, ${batch.sceneIds.length} scena za prompt`);
      } else bad('POST .../image-prompts/next-batch', JSON.stringify(batch));

      const aiResponse = { batchId: batch.batchId, items: batch.sceneIds.map(sceneId => ({ sceneId, scenePrompt: `woman walking, scene ${sceneId}`, sceneNegativePrompt: 'blurry' })) };
      const submitRes = await request('POST', `/api/audio-projects/${projectId}/image-prompts/submit`, { body: aiResponse });
      const lockedPrompt = submitRes.json?.project?.imagePrompts?.[batch.sceneIds[0]];
      if (submitRes.status === 200 && lockedPrompt?.finalPrompt?.startsWith(require('../PROGRAM - NE BRISATI/locked-identity-text').POSITIVE.slice(0, 40))) {
        ok('POST .../image-prompts/submit → 200, finalPrompt počinje zaključanim identitetom (FinalPromptBuilder stvarno radi kroz HTTP)');
      } else bad('POST .../image-prompts/submit', JSON.stringify(submitRes.json).slice(0, 300));

      const doneRes = await request('POST', `/api/audio-projects/${projectId}/image-prompts/next-batch`);
      if (doneRes.status === 200 && doneRes.json?.done === true) ok('Sledeći poziv posle zaključavanja svih scena → done:true (queue ispravno prati stanje)');
      else bad('image-prompts/next-batch posle zaključavanja svih scena', JSON.stringify(doneRes.json));

      const badSubmitRes = await request('POST', `/api/audio-projects/${projectId}/image-prompts/submit`, { body: { batchId: 'pogresan-id', items: [] } });
      if (badSubmitRes.status === 422 || badSubmitRes.status === 400) ok(`Nevalidan AI odgovor (pogrešan batchId) → ${badSubmitRes.status}, odbijen`);
      else bad('Nevalidan AI odgovor', `dobijeno ${badSubmitRes.status}`);

      // Video promptovi su POSEBAN zadatak (sekcija 21.5) — zahtevaju da scena već ima zaključan
      // image prompt (upravo urađeno iznad).
      const videoBatchRes = await request('POST', `/api/audio-projects/${projectId}/video-prompts/next-batch`);
      const videoBatch = videoBatchRes.json;
      if (videoBatchRes.status === 200 && videoBatch.batchId && videoBatch.sceneIds.length === sceneIds.length) {
        ok(`POST .../video-prompts/next-batch → 200, batchId=${videoBatch.batchId} (odvojen batch od image promptova)`);
      } else bad('POST .../video-prompts/next-batch', JSON.stringify(videoBatch));

      const videoAiResponse = { batchId: videoBatch.batchId, items: videoBatch.sceneIds.map(sceneId => ({ sceneId, videoPrompt: `slow push-in, hair moves gently, scene ${sceneId}`, negativeVideoPrompt: 'camera shake' })) };
      const videoSubmitRes = await request('POST', `/api/audio-projects/${projectId}/video-prompts/submit`, { body: videoAiResponse });
      const lockedVideoPrompt = videoSubmitRes.json?.project?.videoPrompts?.[videoBatch.sceneIds[0]];
      if (videoSubmitRes.status === 200 && lockedVideoPrompt?.negativeVideoPrompt?.includes('camera shake') && lockedVideoPrompt.negativeVideoPrompt.startsWith(require('../PROGRAM - NE BRISATI/locked-identity-text').NEGATIVE.slice(0, 30))) {
        ok('POST .../video-prompts/submit → 200, negativeVideoPrompt automatski dobija zaključane identity zabrane (sekcija 16)');
      } else bad('POST .../video-prompts/submit', JSON.stringify(videoSubmitRes.json).slice(0, 300));

      const videoBeforeImagesRes = await request('POST', `/api/audio-projects/00000000-0000-0000-0000-000000000001/video-prompts/next-batch`);
      if (videoBeforeImagesRes.status === 400 || videoBeforeImagesRes.status === 404) ok(`Video batch bez postojećeg projekta/slika → ${videoBeforeImagesRes.status} (ne ruši server)`);
      else bad('Video batch bez slika', `dobijeno ${videoBeforeImagesRes.status}`);
    } catch (error) { bad('Image/video prompt batch tok (plan-scenes -> next-batch -> submit)', error.message); }

    try {
      // Librosa NIJE instalirana u test okruženju (stvarno stanje) — proverava se da analiza
      // muzike gracefully degradira umesto da padne (opcioni modul, sekcija 0.20/30).
      const res = await request('POST', `/api/audio-projects/${projectId}/analyze-music`);
      if (res.status === 200 && res.json?.project?.musicAnalysis?.ok === false && res.json.project.musicAnalysis.reason === 'librosa_not_installed') {
        ok('POST .../analyze-music → 200, gracefully degradirano (librosa_not_installed), projekat i dalje validan');
      } else bad('POST .../analyze-music fallback', JSON.stringify(res.json));
    } catch (error) { bad('POST .../analyze-music', error.message); }

    try {
      // Ni Demucs ni faster-whisper nisu instalirani u test okruženju (stvarno stanje) —
      // proverava se da automatsko izvlačenje teksta gracefully degradira umesto da padne.
      const res = await request('POST', `/api/audio-projects/${projectId}/auto-lyrics`);
      if (res.status === 200 && res.json?.project?.lyricsGenerationStatus?.ok === false) {
        ok(`POST .../auto-lyrics → 200, gracefully degradirano (${res.json.project.lyricsGenerationStatus.reason}), projekat i dalje validan`);
      } else bad('POST .../auto-lyrics fallback', JSON.stringify(res.json));
    } catch (error) { bad('POST .../auto-lyrics', error.message); }

    try {
      // faster-whisper NIJE instaliran u ovom test okruženju (stvarno stanje) — proverava se
      // da se poravnanje ispravno DEGRADIRA (transcription.ok:false) umesto da obori server.
      const res = await request('POST', `/api/audio-projects/${projectId}/align`);
      if (res.status === 200 && res.json?.project?.transcription?.ok === false && res.json.project.transcription.reason === 'faster_whisper_not_installed') {
        ok('POST .../align → 200, gracefully degradirano (faster_whisper_not_installed), projekat i dalje validan');
      } else bad('POST .../align fallback', JSON.stringify(res.json));
    } catch (error) { bad('POST .../align', error.message); }
  } else {
    bad('Preostali testovi preskočeni', 'projectId nije dobijen iz kreiranja projekta');
  }

  try {
    const createRes = await request('POST', '/api/audio-projects', { body: { songTitle: 'Bez teksta' } });
    const noLyricsId = createRes.json?.project?.projectId;
    const audioBase64 = fs.readFileSync(FIXTURE).toString('base64');
    await request('POST', `/api/audio-projects/${noLyricsId}/audio`, { body: { fileName: 'test-tone.mp3', audioBase64 } });
    const alignRes = await request('POST', `/api/audio-projects/${noLyricsId}/align`);
    if (alignRes.status === 400 && alignRes.json?.code === 'LYRICS_MISSING') ok('POST .../align bez unetog teksta → 400 LYRICS_MISSING');
    else bad('POST .../align bez teksta', `dobijeno ${alignRes.status}: ${JSON.stringify(alignRes.json)}`);
  } catch (error) { bad('POST .../align bez teksta', error.message); }

  try {
    // Sekcija 23: DUPLIRAJ/PREIMENUJ/ARHIVIRAJ/OBRIŠI, plus pretraga/filter/sortiranje.
    const createRes = await request('POST', '/api/audio-projects', { body: { songTitle: 'Projekat za biblioteku', artist: 'Test Izvođač XYZ' } });
    const libProjectId = createRes.json.project.projectId;

    const renameRes = await request('POST', `/api/audio-projects/${libProjectId}/rename`, { body: { name: 'Novi naziv spota' } });
    if (renameRes.status === 200 && renameRes.json.project.name === 'Novi naziv spota') ok('POST .../rename → 200, naziv promenjen');
    else bad('POST .../rename', JSON.stringify(renameRes.json));

    const dupRes = await request('POST', `/api/audio-projects/${libProjectId}/duplicate`);
    const dupId = dupRes.json?.project?.projectId;
    if (dupRes.status === 201 && dupId && dupId !== libProjectId && dupRes.json.project.name.includes('kopija')) {
      ok('POST .../duplicate → 201, nov projectId, naziv sadrži "kopija"');
    } else bad('POST .../duplicate', JSON.stringify(dupRes.json));

    const searchRes = await request('GET', '/api/audio-projects?search=Test%20Izvo%C4%91a%C4%8D%20XYZ');
    const foundBySearch = searchRes.json?.projects?.some(p => p.projectId === libProjectId);
    if (searchRes.status === 200 && foundBySearch) ok('GET /api/audio-projects?search=... → pronalazi projekat po izvođaču');
    else bad('Pretraga projekata', JSON.stringify(searchRes.json?.projects?.map(p => p.artist)));

    const withStatusRes = await request('GET', '/api/audio-projects');
    const hasComputedStatus = withStatusRes.json?.projects?.every(p => typeof p.status === 'string' && Number.isFinite(p.overallProgress));
    if (withStatusRes.status === 200 && hasComputedStatus) ok('GET /api/audio-projects → svaki projekat ima računati status i overallProgress');
    else bad('Računati status na listi', 'nedostaje status/overallProgress na nekom projektu');

    const archiveRes = await request('POST', `/api/audio-projects/${libProjectId}/archive`, { body: { archived: true } });
    if (archiveRes.status === 200 && archiveRes.json.project.archived === true) ok('POST .../archive → 200, projekat arhiviran');
    else bad('POST .../archive', JSON.stringify(archiveRes.json));

    const afterArchiveRes = await request('GET', `/api/audio-projects/${libProjectId}`);
    if (afterArchiveRes.json?.project?.status === 'arhiviran') ok('Arhiviran projekat ima status "arhiviran" bez obzira na napredak');
    else bad('Status posle arhiviranja', JSON.stringify(afterArchiveRes.json?.project?.status));

    const deleteRes = await request('DELETE', `/api/audio-projects/${dupId}`);
    if (deleteRes.status === 200 && deleteRes.json.deleted === dupId) ok('DELETE /api/audio-projects/:id → 200, trajno obrisan');
    else bad('DELETE /api/audio-projects/:id', JSON.stringify(deleteRes.json));

    const afterDeleteRes = await request('GET', `/api/audio-projects/${dupId}`);
    if (afterDeleteRes.status === 404) ok('Obrisan projekat vraća 404 posle brisanja (stvarno uklonjen sa diska)');
    else bad('Projekat posle brisanja', `dobijeno ${afterDeleteRes.status}`);
  } catch (error) { bad('Biblioteka projekata (duplikat/preimenovanje/arhiva/brisanje/pretraga)', error.message); }

  try {
    // Sekcija 31: backup se pravi AUTOMATSKI pre zamene storyboarda (plan-scenes je pozvan
    // 2x ranije za ovaj projectId, drugi poziv je REPLACE i mora napraviti backup).
    const backupsRes = await request('GET', `/api/audio-projects/${projectId}/backups`);
    const backups = backupsRes.json?.backups || [];
    if (backupsRes.status === 200 && backups.some(b => b.reason === 'before_storyboard_replace') && backups.some(b => b.reason?.startsWith('before_ai_import'))) {
      ok(`GET .../backups → 200, ${backups.length} backup-a, uključujući before_storyboard_replace i before_ai_import (automatski napravljeni)`);
    } else bad('GET .../backups', JSON.stringify(backups.map(b => b.reason)));

    const beforeRestoreRes = await request('GET', `/api/audio-projects/${projectId}`);
    const currentSceneCount = beforeRestoreRes.json?.project?.storyboard?.scenes?.length;

    const oldestBackup = backups[backups.length - 1];
    const restoreRes = await request('POST', `/api/audio-projects/${projectId}/restore-backup`, { body: { fileName: oldestBackup.fileName } });
    if (restoreRes.status === 200 && restoreRes.json?.project?.projectId === projectId) {
      ok(`POST .../restore-backup → 200, projekat vraćen na stanje iz "${oldestBackup.reason}"`);
    } else bad('POST .../restore-backup', JSON.stringify(restoreRes.json));

    const afterRestoreBackupsRes = await request('GET', `/api/audio-projects/${projectId}/backups`);
    if ((afterRestoreBackupsRes.json?.backups?.length || 0) > backups.length) {
      ok('Vraćanje na stariju verziju SAMO pravi novi backup trenutnog stanja pre vraćanja (i to se može poništiti)');
    } else bad('Backup pre vraćanja', JSON.stringify(afterRestoreBackupsRes.json?.backups?.length));

    const badRestoreRes = await request('POST', `/api/audio-projects/${projectId}/restore-backup`, { body: { fileName: '../../../etc/passwd' } });
    if (badRestoreRes.status === 400) ok('POST .../restore-backup sa path traversal pokušajem → 400 (odbijen)');
    else bad('Path traversal u restore-backup', `dobijeno ${badRestoreRes.status}`);
  } catch (error) { bad('Backup/restore tok (sekcija 31)', error.message); }

  try {
    // Sekcija 32: izvoz u više formata kroz pravi HTTP zahtev.
    const exportRes = await request('GET', `/api/audio-projects/${projectId}/export?format=storyboard.json`);
    const exportedStoryboard = JSON.parse(exportRes.raw);
    if (exportRes.status === 200 && exportRes.headers['content-disposition']?.includes('storyboard.json') && Array.isArray(exportedStoryboard.scenes)) {
      ok('GET .../export?format=storyboard.json → 200, Content-Disposition ispravan, validan JSON');
    } else bad('GET .../export storyboard.json', JSON.stringify(exportRes.headers));

    const csvRes = await request('GET', `/api/audio-projects/${projectId}/export?format=scenes.csv`);
    if (csvRes.status === 200 && csvRes.raw.startsWith('sceneId,number,startMs,endMs,durationMs,cutReason')) ok('GET .../export?format=scenes.csv → 200, ispravan CSV header');
    else bad('GET .../export scenes.csv', csvRes.raw.slice(0, 100));

    const badFormatRes = await request('GET', `/api/audio-projects/${projectId}/export?format=nepostojeci.xyz`);
    if (badFormatRes.status === 400) ok('GET .../export sa nepoznatim formatom → 400 (ne 500)');
    else bad('GET .../export nepoznat format', `dobijeno ${badFormatRes.status}`);

    const exportJsonRes = await request('GET', `/api/audio-projects/${projectId}/export?format=project.json`);
    if (exportJsonRes.status === 200 && !exportJsonRes.raw.includes('accessToken') && !exportJsonRes.raw.includes('bridgeKey')) {
      ok('GET .../export?format=project.json → 200, ne sadrži polja koja liče na tajne');
    } else bad('GET .../export project.json bezbednost', 'moguće curenje tajni');
  } catch (error) { bad('Izvoz projekta (sekcija 32)', error.message); }

  try {
    const res = await request('GET', '/api/audio-projects/ne-postoji-123');
    if (res.status === 400 || res.status === 404) ok(`GET nepostojeći/neispravan projectId → ${res.status} (ne 500)`);
    else bad('GET neispravan projectId', `dobijeno ${res.status}`);
  } catch (error) { bad('GET neispravan projectId', error.message); }

  try {
    const res = await request('POST', '/api/audio-projects', { body: { songTitle: 'Za osteceni upload' } });
    const badProjectId = res.json?.project?.projectId;
    const truncatedBase64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'truncated.mp3')).toString('base64');
    const uploadRes = await request('POST', `/api/audio-projects/${badProjectId}/audio`, { body: { fileName: 'truncated.mp3', audioBase64: truncatedBase64 } });
    if (uploadRes.status >= 400 && uploadRes.status < 500) ok(`Oštećen audio upload preko HTTP-a → ${uploadRes.status} (odbijen, ne 500, nema lažnog trajanja)`);
    else bad('Oštećen audio upload preko HTTP-a', `dobijeno ${uploadRes.status}: ${uploadRes.raw.slice(0, 200)}`);
  } catch (error) { bad('Oštećen audio upload preko HTTP-a', error.message); }

  try {
    const res = await request('POST', '/api/audio-projects/00000000-0000-0000-0000-000000000000/audio', { body: { fileName: 'x.mp3', audioBase64: '' } });
    if (res.status >= 400 && res.status < 500) ok(`Prazan audioBase64 → ${res.status} (odbijen)`);
    else bad('Prazan audioBase64', `dobijeno ${res.status}`);
  } catch (error) { bad('Prazan audioBase64', error.message); }

  try {
    const shutdown = await request('POST', '/api/app/shutdown');
    if (shutdown.status === 200) ok('POST /api/app/shutdown → 200');
    else bad('POST /api/app/shutdown', `status ${shutdown.status}`);
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 4000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
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
