'use strict';
// Testira stem-separation.js. Demucs NIJE instaliran na ovoj razvojnoj mašini (stvarno stanje,
// isto kao kod većine korisnika bez GPU-a) — zato ovi testovi proveravaju STVARNU fallback putanju
// (sekcija 8: "ako stem separation ne uspe, nastavi sa originalnim miksom, ne ruši ceo posao")
// i STVARNO keširanje po hash-u, bez pokretanja pravog Demucs procesa (to zahteva PyTorch
// preuzimanje od nekoliko GB i minute obrade — van razumnog opsega za automatski test).
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
  console.log('== StemSeparation testovi ==');
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-stem-test-'));
  process.env.MSS_DATA_DIR = testDataDir;
  delete require.cache[require.resolve('../PROGRAM - NE BRISATI/stem-separation')];
  const stemSeparation = require('../PROGRAM - NE BRISATI/stem-separation');

  test('isDemucsInstalled() vraća false kada venv ne postoji', () => {
    assert.strictEqual(stemSeparation.isDemucsInstalled(), false);
  });

  await testAsync('separateStems() se vraća na originalni miks kada Demucs nije instaliran (ne baca grešku)', async () => {
    const fakeAudio = path.join(testDataDir, 'fake-song.mp3');
    fs.writeFileSync(fakeAudio, 'not-real-audio-just-for-path-existence-check');
    const result = await stemSeparation.separateStems(fakeAudio, 'abc123hash');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.usedOriginalMix, true);
    assert.strictEqual(result.stems, null);
    assert.strictEqual(result.fallbackReason, 'demucs_not_installed');
    assert.ok(result.confidence < 1, 'confidence mora biti smanjen kada se koristi fallback');
  });

  await testAsync('separateStems() baca grešku bez audioHash (obavezan za keširanje)', async () => {
    let threw = false;
    try { await stemSeparation.separateStems('/some/path.mp3', ''); }
    catch { threw = true; }
    assert.ok(threw, 'mora baciti grešku kada nedostaje audioHash');
  });

  await testAsync('separateStems() vraća fallback kada izvorni audio fajl ne postoji', async () => {
    const result = await stemSeparation.separateStems(path.join(testDataDir, 'ne-postoji.mp3'), 'hash-bez-fajla');
    assert.strictEqual(result.usedOriginalMix, true);
    assert.strictEqual(result.fallbackReason, 'source_audio_missing');
  });

  await testAsync('separateStems() koristi keš kada su stemovi već sačuvani za taj hash', async () => {
    const audioHash = 'cached-hash-test';
    const cacheDir = path.join(testDataDir, 'cache', 'stems', audioHash);
    fs.mkdirSync(cacheDir, { recursive: true });
    const stemPaths = {};
    for (const stem of stemSeparation.EXPECTED_STEMS) {
      const stemFile = path.join(cacheDir, `${stem}.wav`);
      fs.writeFileSync(stemFile, 'fake-wav-content');
      stemPaths[stem] = stemFile;
    }
    fs.writeFileSync(path.join(cacheDir, 'stems-meta.json'), JSON.stringify({
      ok: true, usedOriginalMix: false, stems: stemPaths, confidence: 0.9, fallbackReason: null, model: 'htdemucs', createdAt: new Date().toISOString()
    }, null, 2), 'utf8');

    const fakeAudio = path.join(testDataDir, 'another-song.mp3');
    fs.writeFileSync(fakeAudio, 'placeholder');
    const result = await stemSeparation.separateStems(fakeAudio, audioHash);
    assert.strictEqual(result.fromCache, true);
    assert.strictEqual(result.usedOriginalMix, false);
    assert.deepStrictEqual(Object.keys(result.stems).sort(), stemSeparation.EXPECTED_STEMS.slice().sort());
  });

  try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  delete process.env.MSS_DATA_DIR;

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  console.log('NAPOMENA: stvarna Demucs separacija (PyTorch download + CPU inferenca) NIJE testirana ovde —');
  console.log('to zahteva instaliran Demucs (panel LOKALNI ALATI) i traje više minuta po pesmi.');
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
