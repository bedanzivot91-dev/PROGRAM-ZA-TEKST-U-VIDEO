'use strict';
// Testira da audio-projects.js ispravno prati lyricsSource enum iz sekcije 9.2:
// "user | auto_transcribed | auto_transcribed_edited". Simulira stanje "tekst je automatski
// izvučen" direktno preko updateProject() (bez stvarnog pokretanja ASR-a, koji nije instaliran
// na ovoj mašini) da bi se proverilo da naredna korisnička izmena ispravno postaje
// auto_transcribed_edited, a ne obično "user".
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

console.log('== lyricsSource praćenje testovi ==');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-lyrics-source-test-'));
process.env.MSS_DATA_DIR = testDataDir;
const audioProjects = require('../PROGRAM - NE BRISATI/audio-projects');

const project = audioProjects.createProject({ songTitle: 'Test' });

test('nov projekat bez teksta nema lyrics', () => {
  assert.strictEqual(project.lyrics, null);
});

test('prva korisnička unos teksta dobija lyricsSource "user"', () => {
  const updated = audioProjects.setProjectLyrics(project.projectId, '[Verse]\nPrvi red');
  assert.strictEqual(updated.lyrics.lyricsSource, 'user');
  assert.strictEqual(updated.lyrics.needsReview, false);
});

test('kada je tekst simuliran kao automatski izvučen (auto_transcribed), izmena postaje auto_transcribed_edited', () => {
  audioProjects.updateProject(project.projectId, {
    lyrics: { lyricsSource: 'auto_transcribed', detectedLanguage: 'sr', overallConfidence: 0.6, needsReview: true, rawTranscription: 'x', formattedLyrics: '[Verse]\nStari red', sections: [], lines: [] }
  });
  const edited = audioProjects.setProjectLyrics(project.projectId, '[Verse]\nIspravljen red');
  assert.strictEqual(edited.lyrics.lyricsSource, 'auto_transcribed_edited');
  assert.strictEqual(edited.lyrics.needsReview, false, 'posle korisničke izmene needsReview se gasi');
});

test('naredna izmena posle auto_transcribed_edited ostaje auto_transcribed_edited (ne vraća se na "user")', () => {
  const editedAgain = audioProjects.setProjectLyrics(project.projectId, '[Verse]\nJoš jedna izmena');
  assert.strictEqual(editedAgain.lyrics.lyricsSource, 'auto_transcribed_edited');
});

try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
delete process.env.MSS_DATA_DIR;

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
