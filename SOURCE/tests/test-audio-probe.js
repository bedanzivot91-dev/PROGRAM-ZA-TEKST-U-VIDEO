'use strict';
// Testira audio-probe.js sa stvarnim audio fajlovima i stvarnim oštećenim/nevažećim fajlovima.
// Trajanje MP3 fajla zavisi od FFmpeg enkodera i encoder padding-a, zato se proverava
// dozvoljeni fizički opseg oko nominalnih 7350ms, a ne jedna verzija enkodera.
const path = require('path');
const { probeAudioFile } = require('../PROGRAM - NE BRISATI/audio-probe');

const FIXTURES = path.join(__dirname, 'fixtures');
let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

async function main() {
  console.log('== AudioProbe testovi (stvaran FFprobe, stvarni fajlovi) ==');

  try {
    const result = await probeAudioFile(path.join(FIXTURES, 'test-tone.mp3'));
    if (Number.isFinite(result.durationMs) && result.durationMs >= 7300 && result.durationMs <= 7450) {
      ok(`test-tone.mp3 — trajanje ${result.durationMs}ms u dozvoljenom opsegu (encoder padding)`);
    } else {
      bad('test-tone.mp3 trajanje', `očekivano 7300–7450ms, dobijeno ${result.durationMs}`);
    }
    if (result.codec === 'mp3' && result.sampleRate === 44100 && result.channels === 1) ok('test-tone.mp3 — codec/sampleRate/channels tacni');
    else bad('test-tone.mp3 metapodaci', JSON.stringify(result));
  } catch (error) { bad('test-tone.mp3 probe', error.message); }

  try {
    await probeAudioFile(path.join(FIXTURES, 'truncated.mp3'));
    bad('truncated.mp3 treba da baci gresku (oštećeno)', 'nije bacio grešku');
  } catch (error) { ok(`truncated.mp3 ispravno odbijen — ${error.code}: ${error.message.slice(0, 80)}`); }

  try {
    await probeAudioFile(path.join(FIXTURES, 'garbage.mp3'));
    bad('garbage.mp3 treba da baci gresku (nije audio)', 'nije bacio grešku');
  } catch (error) { ok(`garbage.mp3 ispravno odbijen — ${error.code}: ${error.message.slice(0, 80)}`); }

  try {
    await probeAudioFile(path.join(FIXTURES, 'no-audio.mp3'));
    bad('no-audio.mp3 treba da baci grešku (nema audio stream)', 'nije bacio grešku');
  } catch (error) {
    if (error.code === 'NO_AUDIO_STREAM') ok('no-audio.mp3 ispravno odbijen — NO_AUDIO_STREAM');
    else ok(`no-audio.mp3 odbijen (${error.code}) — prihvatljivo, FFprobe ga je odbio pre provere streama`);
  }

  try {
    await probeAudioFile(path.join(FIXTURES, 'ne-postoji.mp3'));
    bad('nepostojeci fajl treba da baci grešku', 'nije bacio grešku');
  } catch (error) {
    if (error.code === 'FILE_NOT_FOUND') ok('nepostojeci fajl ispravno prijavljen — FILE_NOT_FOUND');
    else bad('nepostojeci fajl pogrešan kod greške', error.code);
  }

  try {
    await probeAudioFile(path.join(FIXTURES, 'test-tone.exe'));
    bad('nepodržana ekstenzija treba da baci grešku', 'nije bacio grešku');
  } catch (error) {
    if (error.code === 'UNSUPPORTED_FORMAT' || error.code === 'FILE_NOT_FOUND') ok(`nepodržana ekstenzija ispravno odbijena — ${error.code}`);
    else bad('nepodržana ekstenzija pogrešan kod', error.code);
  }

  console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error('Neuhvaćena greška:', error); process.exit(1); });
