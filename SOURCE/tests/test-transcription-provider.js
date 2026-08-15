'use strict';
// Testira transcription-provider.js. faster-whisper NIJE instaliran na ovoj mašini (stvarno
// stanje) — testira se realna fallback putanja (sekcija 30: transkripcija ne uspe -> ne ruši
// posao, dozvoli nastavak sa upozorenjem) i keširanje po hash-u+modelu. Prava transkripcija
// (spor CPU model download + inferenca) zahteva instalaciju preko panela LOKALNI ALATI.
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
  console.log('== TranscriptionProvider testovi ==');
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-transcribe-test-'));
  process.env.MSS_DATA_DIR = testDataDir;
  delete require.cache[require.resolve('../PROGRAM - NE BRISATI/transcription-provider')];
  const transcription = require('../PROGRAM - NE BRISATI/transcription-provider');

  test('isTranscriptionInstalled() vraća false kada venv/helper skripta ne postoje pod test putanjom', () => {
    assert.strictEqual(transcription.isTranscriptionInstalled(), false);
  });

  await testAsync('transcribeAudio() vraća ok:false umesto da baci grešku kada alat nije instaliran', async () => {
    const fakeAudio = path.join(testDataDir, 'song.mp3');
    fs.writeFileSync(fakeAudio, 'placeholder');
    const result = await transcription.transcribeAudio(fakeAudio, 'hash1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'faster_whisper_not_installed');
    assert.deepStrictEqual(result.words, []);
  });

  await testAsync('transcribeAudio() baca grešku bez audioHash', async () => {
    let threw = false;
    try { await transcription.transcribeAudio('/x.mp3', ''); } catch { threw = true; }
    assert.ok(threw);
  });

  await testAsync('transcribeAudio() prijavljuje source_audio_missing kada fajl ne postoji', async () => {
    const result = await transcription.transcribeAudio(path.join(testDataDir, 'ne-postoji.mp3'), 'hash2');
    assert.strictEqual(result.reason, 'source_audio_missing');
  });

  await testAsync('transcribeAudio() koristi keš kada je rezultat već sačuvan za hash+model', async () => {
    const cacheDir = path.join(testDataDir, 'cache', 'transcription');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cached = { ok: true, model: 'tiny', language: 'sr', duration: 10, words: [{ word: 'test', start: 0, end: 0.5, probability: 0.9 }], segments: [], createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(cacheDir, 'hash3-tiny.json'), JSON.stringify(cached), 'utf8');
    const fakeAudio = path.join(testDataDir, 'song2.mp3');
    fs.writeFileSync(fakeAudio, 'placeholder');
    const result = await transcription.transcribeAudio(fakeAudio, 'hash3', { model: 'tiny' });
    assert.strictEqual(result.fromCache, true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.words.length, 1);
  });

  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  delete process.env.MSS_DATA_DIR;

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  console.log('NAPOMENA: prava faster-whisper transkripcija nije izvršena ovde — zahteva instaliran alat.');
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
