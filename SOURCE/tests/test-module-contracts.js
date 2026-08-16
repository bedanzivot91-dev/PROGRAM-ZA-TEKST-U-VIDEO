'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', 'PROGRAM - NE BRISATI');
const contracts = [
  ['advanced-tools.js', ['securityStatus', 'systemProfile', 'verifyModelFile', 'historySummary']],
  ['ai-response-validator.js', ['validateConceptsResponse', 'validateStoryboardResponse', 'validatePromptBatchResponse']],
  ['audio-probe.js', ['probeAudioFile', 'resolveFfprobePath']],
  ['audio-projects.js', ['createProject', 'attachAudioToProject', 'planProjectScenes']],
  ['auto-lyrics.js', ['buildLyricsFromSegments', 'autoWriteLyrics']],
  ['bpm-candidates.js', ['buildBpmCandidates']],
  ['extension-identity.js', ['computeChromeExtensionId']],
  ['extension-stabilizer.js', ['ensureStableExtensionCopy']],
  ['font-manager.js', ['listAvailableFonts', 'inspectFontFile']],
  ['github-integrations.js', ['moduleStatus', 'saveProvider', 'testProvider']],
  ['hook-scene-validator.js', ['validateHookScenes']],
  ['image-generation-provider.js', ['buildFinalImagePrompt']],
  ['karaoke-engine.js', ['estimateWordTimings', 'buildKaraokeFrame']],
  ['location-registry.js', ['createLocationRegistry', 'getLocation']],
  ['locked-identity-text.js', ['POSITIVE', 'NEGATIVE']],
  ['lyrics-alignment.js', ['alignLyrics']],
  ['lyrics-line-breaker.js', ['breakIntoLines']],
  ['lyrics-overlay-storage.js', ['listTextTracks', 'createTextTrackForProject']],
  ['lyrics-parser.js', ['parseLyrics']],
  ['music-analysis.js', ['analyzeMusic']],
  ['project-backup.js', ['createProjectBackup', 'listProjectBackups']],
  ['project-export.js', ['exportProject']],
  ['project-status.js', ['computeProjectStatus']],
  ['research-engine.js', ['runResearch', 'buildQueries', 'lastResearch']],
  ['scene-batch-queue.js', ['createBatchQueue', 'getNextBatch']],
  ['scene-candidates.js', ['buildSceneCandidates']],
  ['scene-planner.js', ['planScenes']],
  ['smart-text-placement-engine.js', ['suggestPlacement']],
  ['stem-separation.js', ['separateStems']],
  ['storage-paths.js', ['ensureAll']],
  ['tattoo-visibility.js', ['validateSceneTattooVisibility']],
  ['text-animation-engine.js', ['applyEasing']],
  ['text-layout-engine.js', ['layoutCue']],
  ['text-overlay-export.js', ['exportTrackToSrt']],
  ['text-overlay-models.js', ['createTextTrack', 'createCue']],
  ['text-style-presets.js', ['listStylePresets']],
  ['text-video-tools.js', ['parseLrc', 'exportLrc', 'parseSrt', 'createKaraokeWordTimings']],
  ['timeline-validator.js', ['validateTimeline']],
  ['tool-runner.js', ['listTools', 'runTool', 'toolStatus', 'cancelTool']],
  ['transcription-provider.js', ['transcribeAudio']],
  ['visual-diversity-validator.js', ['validateVisualDiversity']],
  ['wardrobe-registry.js', ['createWardrobeRegistry', 'getOutfit', 'validateWardrobeDiversity']]
];

let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label} — ${detail}`); }

console.log('== Module contract smoke testovi ==');
for (const [file, names] of contracts) {
  try {
    const mod = require(path.join(ROOT, file));
    for (const name of names) {
      if (typeof mod[name] === 'function' || (typeof mod[name] === 'string' && mod[name])) ok(`${file} → ${name}`);
      else bad(`${file} → ${name}`, 'izvoz ne postoji ili nije funkcionalan');
    }
  } catch (error) {
    bad(file, error.message);
  }
}
console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
