'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROGRAM_DIR = path.join(ROOT, 'PROGRAM - NE BRISATI');
let pass = 0;
let fail = 0;
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail) { fail += 1; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
function walk(dir, exts, out = [], skipDirs = ['node_modules', 'dist', 'runtime', '.git']) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, skipDirs);
    else if (exts.some(ext => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

console.log('== Statički testovi ==');
console.log('-- JavaScript sintaksa --');
const jsFiles = walk(PROGRAM_DIR, ['.js']).concat(walk(path.join(ROOT, 'desktop'), ['.js']));
for (const file of jsFiles) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); ok(path.relative(ROOT, file)); }
  catch (error) { bad(path.relative(ROOT, file), error.stderr?.toString().split('\n')[0]); }
}

console.log('-- JSON parsiranje --');
const jsonFiles = walk(PROGRAM_DIR, ['.json']).concat([path.join(ROOT, 'package.json')]);
for (const file of jsonFiles) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); ok(path.relative(ROOT, file)); }
  catch (error) { bad(path.relative(ROOT, file), error.message); }
}

console.log('-- HTML dupli ID-jevi --');
{
  const html = fs.readFileSync(path.join(PROGRAM_DIR, 'public', 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seen = new Map();
  const dupes = [];
  for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
  for (const [id, count] of seen) if (count > 1) dupes.push(`${id} (${count}x)`);
  if (dupes.length) bad('index.html duplirani ID', dupes.join(', '));
  else ok(`index.html — ${ids.length} jedinstvenih ID-jeva, 0 duplikata`);
}

console.log('-- Verzije programa --');
{
  const checks = [
    [path.join(PROGRAM_DIR, 'server.js'), /const VERSION = '15\.6'/],
    [path.join(PROGRAM_DIR, 'launcher.js'), /const VERSION = '15\.6'/],
    [path.join(PROGRAM_DIR, 'server.js'), /EXPECTED_EXTENSION_VERSION = '15\.6\.0'/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'manifest.json'), /"version":\s*"15\.6\.0"/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'service-worker.js'), /EXTENSION_VERSION = '15\.6\.0'/],
    [path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'chatgpt-bridge.js'), /BRIDGE_VERSION = '15\.6'/],
    [path.join(ROOT, 'package.json'), /"version":\s*"15\.6\.1"/],
    [path.join(ROOT, 'desktop', 'main.js'), /const APP_VERSION = app\.getVersion\(\)/]
  ];
  for (const [file, pattern] of checks) {
    const content = fs.readFileSync(file, 'utf8');
    if (pattern.test(content)) ok(`${path.relative(ROOT, file)} — verzija/protokol ispravan`);
    else bad(`${path.relative(ROOT, file)} — verzija/protokol NIJE pronađen / netačan`);
  }
}

console.log('-- Extension port opseg --');
{
  const content = fs.readFileSync(path.join(PROGRAM_DIR, 'browser-extension', 'MSS-ChatGPT-Plus-Most', 'service-worker.js'), 'utf8');
  if (/length:\s*60/.test(content)) ok('service-worker.js — opseg od 60 portova (4180-4239)');
  else bad('service-worker.js — opseg portova nije 60 (4180-4239)');
}

console.log('-- Electron desktop fajlovi --');
for (const f of ['main.js', 'preload.js', 'server-controller.js', 'window-state.js']) {
  const file = path.join(ROOT, 'desktop', f);
  if (fs.existsSync(file)) ok(`desktop/${f}`); else bad(`desktop/${f}`, 'nedostaje');
}

console.log('-- assets/icon.ico --');
if (fs.existsSync(path.join(ROOT, 'assets', 'icon.ico'))) ok('assets/icon.ico'); else bad('assets/icon.ico', 'nedostaje');

console.log('-- Content-Security-Policy --');
{
  const html = fs.readFileSync(path.join(PROGRAM_DIR, 'public', 'index.html'), 'utf8');
  if (/http-equiv="Content-Security-Policy"/.test(html)) ok('index.html ima CSP meta tag'); else bad('index.html CSP meta tag', 'nedostaje');
}

console.log('-- v15.6 completion UI wiring --');
{
  const completionFile = path.join(PROGRAM_DIR, 'public', 'completion-ui.js');
  const workflowFile = path.join(PROGRAM_DIR, 'public', 'workflow-tools-ui.js');
  const boot = fs.readFileSync(path.join(PROGRAM_DIR, 'public', 'boot.js'), 'utf8');
  if (fs.existsSync(completionFile)) ok('completion-ui.js postoji'); else bad('completion-ui.js', 'nedostaje');
  if (fs.existsSync(workflowFile)) ok('workflow-tools-ui.js postoji'); else bad('workflow-tools-ui.js', 'nedostaje');
  if (/completion-ui\.js/.test(boot) && /workflow-tools-ui\.js/.test(boot) && /loadCompletionUi/.test(boot)) ok('boot.js učitava oba nova UI panela'); else bad('boot.js UI wiring', 'novi UI nije kompletno povezan');

  const completion = fs.readFileSync(completionFile, 'utf8');
  const workflow = fs.readFileSync(workflowFile, 'utf8');
  const server = fs.readFileSync(path.join(PROGRAM_DIR, 'server.js'), 'utf8');
  const literalUiFragments = [
    '/api/audio-projects', '/audio', '/lyrics', '/plan-scenes', '/rename', '/duplicate', '/archive',
    'lyrics-overlay', 'project.zip', 'project.pdf', 'timeline.edl'
  ];
  for (const fragment of literalUiFragments) {
    if (completion.includes(fragment)) ok(`completion-ui.js povezuje ${fragment}`);
    else bad(`completion-ui.js ${fragment}`, 'nedostaje korisnički tok');
  }

  const generatedActions = ['auto-lyrics', 'align', 'analyze-music'];
  for (const action of generatedActions) {
    const actionPattern = new RegExp(`runProjectAction\\(['\"]${action}['\"]`);
    if (actionPattern.test(completion)) ok(`completion-ui.js povezuje /${action} kroz runProjectAction`);
    else bad(`completion-ui.js /${action}`, 'nedostaje korisnički tok');
  }

  for (const fragment of ['/backups', '/restore-backup']) {
    if (workflow.includes(fragment)) ok(`workflow-tools-ui.js povezuje ${fragment}`);
    else bad(`workflow-tools-ui.js ${fragment}`, 'nedostaje napredni korisnički tok');
  }
  const batchRouteTemplateOk = workflow.includes('/${kind}-prompts/next-batch') && workflow.includes('/${kind}-prompts/submit');
  if (batchRouteTemplateOk) ok('workflow-tools-ui.js koristi generičke image/video prompt batch API rute');
  else bad('workflow-tools-ui.js batch API template', 'next-batch ili submit ruta nedostaje');
  for (const kind of ['image', 'video']) {
    if (new RegExp(`nextBatch\\(['\"]${kind}['\"]`).test(workflow) && new RegExp(`submitBatch\\(['\"]${kind}['\"]`).test(workflow)) {
      ok(`workflow-tools-ui.js izlaže ${kind} next/submit batch kontrole`);
    } else {
      bad(`workflow-tools-ui.js ${kind} batch kontrole`, 'UI ne poziva generički batch tok');
    }
  }

  const requiredServerFragments = ['/auto-lyrics', '/align', '/analyze-music', '/plan-scenes', '/rename', '/duplicate', '/archive', '/lyrics-overlay', '/backups', '/restore-backup', '/image-prompts/next-batch', '/video-prompts/next-batch'];
  for (const fragment of requiredServerFragments) {
    if (server.includes(fragment)) ok(`server.js ima rutu ${fragment}`);
    else bad(`server.js ruta ${fragment}`, 'UI bi pozivao nepostojeću rutu');
  }

  if (/audioBase64/.test(completion) && /fileToBase64/.test(completion)) ok('completion UI ima stvaran audio upload tok');
  else bad('completion UI audio upload', 'nije povezan');

  if (/storyboard/.test(completion) && /PLANIRAJ SCENE/.test(completion)) ok('completion UI prikazuje ScenePlanner rezultat');
  else bad('completion UI storyboard', 'nije prikazan');
}

console.log(`\n== REZULTAT: ${pass} prošlo, ${fail} nije prošlo ==`);
process.exit(fail ? 1 : 0);
