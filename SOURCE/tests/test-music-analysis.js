'use strict';
// Testira music-analysis.js. Librosa NIJE instalirana na ovoj mašini (stvarno stanje) —
// testira se realna fallback putanja (opcioni modul, ne sme oboriti server) i keširanje.
// Prava librosa analiza zahteva instalaciju preko panela LOKALNI ALATI.
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

let pass = 0;
let fail = 0;
function test(label, fn) {
  try { fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}
async function testAsync(label, fn) {
  try { await fn(); pass += 1; console.log(`  [OK] ${label}`); }
  catch (error) { fail += 1; console.log(`  [FAIL] ${label} — ${error.message}`); }
}

async function main() {
  console.log('== MusicAnalysis testovi ==');
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-music-analysis-test-'));
  process.env.MSS_DATA_DIR = testDataDir;
  delete require.cache[require.resolve('../PROGRAM - NE BRISATI/music-analysis')];
  const musicAnalysis = require('../PROGRAM - NE BRISATI/music-analysis');

  test('isLibrosaInstalled() vraća false kada venv ne postoji', () => {
    assert.strictEqual(musicAnalysis.isLibrosaInstalled(), false);
  });

  await testAsync('analyzeMusic() vraća ok:false umesto da baci grešku kada librosa nije instalirana', async () => {
    const fakeAudio = path.join(testDataDir, 'song.mp3');
    fs.writeFileSync(fakeAudio, 'placeholder');
    const result = await musicAnalysis.analyzeMusic(fakeAudio, 'hash-music-1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'librosa_not_installed');
  });

  await testAsync('analyzeMusic() baca grešku bez audioHash', async () => {
    let threw = false;
    try { await musicAnalysis.analyzeMusic('/x.mp3', ''); } catch { threw = true; }
    assert.ok(threw);
  });

  await testAsync('analyzeMusic() koristi keš kada je analiza već sačuvana za taj hash', async () => {
    const cacheDir = path.join(testDataDir, 'cache', 'music-analysis');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cached = { ok: true, durationMs: 7350, bpm: { primary: 120, candidates: [] }, beatTimesMs: [], downbeatTimesMs: [], onsets: [], energy: [], noveltyCurve: [], createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(cacheDir, 'hash-music-2.json'), JSON.stringify(cached), 'utf8');
    const fakeAudio = path.join(testDataDir, 'song2.mp3');
    fs.writeFileSync(fakeAudio, 'placeholder');
    const result = await musicAnalysis.analyzeMusic(fakeAudio, 'hash-music-2');
    assert.strictEqual(result.fromCache, true);
    assert.strictEqual(result.bpm.primary, 120);
  });

  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  delete process.env.MSS_DATA_DIR;

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  console.log('NAPOMENA: prava librosa analiza nije izvršena ovde — zahteva instaliran alat.');
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
