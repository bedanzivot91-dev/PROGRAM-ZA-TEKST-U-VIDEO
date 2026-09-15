'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROGRAM = path.join(ROOT, 'PROGRAM - NE BRISATI');
const PUBLIC = path.join(PROGRAM, 'public');
const DESKTOP = path.join(ROOT, 'desktop');
const TESTS = path.join(ROOT, 'tests');
const REPO_ROOT = path.resolve(ROOT, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let pass = 0;
let fail = 0;
const failures = [];
function ok(label) { pass++; console.log(`  [OK] ${label}`); }
function bad(label, detail = '') { fail++; failures.push({ label, detail }); console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
function text(file) { return fs.readFileSync(file, 'utf8'); }
function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function walk(dir, predicate = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'runtime', '.git', '.v8-coverage', '__pycache__'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function localResolve(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  return [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js'), path.join(base, 'index.json')]
    .find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

console.log('== DUBINSKI AUDIT V2 — STRUKTURA, UGOVORI I INTEGRITET ==');
const programJs = walk(PROGRAM, f => f.endsWith('.js'));
const desktopJs = walk(DESKTOP, f => f.endsWith('.js'));
const ownJs = programJs.concat(desktopJs).filter(f => !rel(f).includes('/vendor/'));
const jsonFiles = walk(PROGRAM, f => f.endsWith('.json')).concat([path.join(ROOT, 'package.json'), path.join(ROOT, 'package-lock.json')]);
const ps1Files = walk(PROGRAM, f => f.endsWith('.ps1'));
const pyFiles = walk(PROGRAM, f => f.endsWith('.py'));
const batchFiles = walk(PROGRAM, f => /\.(?:bat|cmd)$/i.test(f));
const testFiles = walk(TESTS, f => /^test-.*\.js$/i.test(path.basename(f)));
const testCorpus = testFiles.map(f => `${path.basename(f)}\n${text(f)}`).join('\n');

console.log('-- 1. JS / JSON / Python sintaksa --');
for (const file of programJs.concat(desktopJs)) {
  try { childProcess.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); ok(`JS ${rel(file)}`); }
  catch (e) { bad(`JS ${rel(file)}`, String(e.stderr || e.message).split('\n')[0]); }
}
for (const file of jsonFiles) {
  try { JSON.parse(text(file)); ok(`JSON ${rel(file)}`); }
  catch (e) { bad(`JSON ${rel(file)}`, e.message); }
}
for (const file of pyFiles) {
  let good = false; let reason = '';
  const candidates = process.platform === 'win32' ? [['py',['-3']],['python',[]],['python3',[]]] : [['python3',[]],['python',[]]];
  for (const [exe, prefix] of candidates) {
    try { childProcess.execFileSync(exe, [...prefix, '-m', 'py_compile', file], { stdio:'pipe', timeout:15000 }); good = true; break; }
    catch (e) { reason = e.message; }
  }
  if (good) ok(`PY ${rel(file)}`); else bad(`PY ${rel(file)}`, reason || 'Python nije dostupan');
}

console.log('-- 2. Lokalni require() putevi --');
for (const file of ownJs) {
  const src = text(file);
  for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const req = m[1];
    if (!req.startsWith('.')) continue;
    if (localResolve(file, req)) ok(`${rel(file)} require(${req})`);
    else bad(`${rel(file)} require(${req})`, 'lokalni modul ne postoji');
  }
}

console.log('-- 3. Svaki npm test:* pokazuje na stvarni fajl --');
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  if (!name.startsWith('test:')) continue;
  const matches = [...String(command).matchAll(/node\s+([^\s&|]+\.js)/g)];
  if (!matches.length) { ok(`${name} nema direktan node fajl ili je složeni test`); continue; }
  for (const m of matches) {
    const file = path.join(ROOT, m[1]);
    if (fs.existsSync(file)) ok(`${name} → ${m[1]}`); else bad(`${name} → ${m[1]}`, 'fajl ne postoji');
  }
}

console.log('-- 4. Svaki backend modul ima namenski test/modulski ugovor --');
const rootModules = walk(PROGRAM, f => path.dirname(f) === PROGRAM && f.endsWith('.js'));
const runtimeEntrypoints = new Set(['server.js','launcher.js','background-worker.js']);
for (const file of rootModules) {
  const base = path.basename(file);
  const src = text(file);
  if (runtimeEntrypoints.has(base)) { ok(`${base} je runtime entrypoint i proverava se integracionim testovima`); continue; }
  if (!/module\.exports\s*=/.test(src)) { ok(`${base} nema CommonJS javni API`); continue; }
  if (testCorpus.includes(base)) ok(`${base} ima namensku test/modul referencu`);
  else bad(`${base}`, 'nijedan test ne referencira modul');
}
console.log('  [INFO] Per-function izvršenje se NE zaključuje iz teksta testa; dokazuje se odvojenim V8 coverage korakom.');

console.log('-- 5. Tool registry → instalacione skripte --');
try {
  const runner = require(path.join(PROGRAM, 'tool-runner.js'));
  for (const [id, meta] of Object.entries(runner.TOOL_REGISTRY || {})) {
    const script = path.join(PROGRAM, 'tools', meta.script || '');
    if (meta.script && fs.existsSync(script)) ok(`${id} → ${meta.script}`); else bad(id, `nedostaje ${meta.script || '(prazno)'}`);
  }
} catch (e) { bad('tool-runner registry', e.message); }

console.log('-- 6. PowerShell / BAT-CMD integritet --');
if (process.platform === 'win32') {
  for (const file of ps1Files) {
    const escaped = file.replace(/'/g, "''");
    const cmd = `$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|%{Write-Error $_.Message};exit 1}`;
    try { childProcess.execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',cmd],{stdio:'pipe'}); ok(`PS1 ${rel(file)}`); }
    catch (e) { bad(`PS1 ${rel(file)}`, String(e.stderr || e.message).split('\n')[0]); }
  }
}
for (const file of batchFiles) {
  const src = text(file);
  if (!src.trim()) bad(`BATCH ${rel(file)}`, 'prazna skripta');
  else if (src.includes('\u0000')) bad(`BATCH ${rel(file)}`, 'NUL karakter');
  else ok(`BATCH ${rel(file)}`);
}

console.log('-- 7. Stubovi / opasno dinamičko izvršavanje --');
for (const file of ownJs) {
  const src = text(file);
  const patterns = [[/\bTODO\b/i,'TODO'],[/\bFIXME\b/i,'FIXME'],[/\bIMPLEMENT\s+ME\b/i,'IMPLEMENT ME'],[/not\s+implemented/i,'not implemented'],[/nije\s+implementirano/i,'nije implementirano']];
  for (const [rx,label] of patterns) if (rx.test(src)) bad(`${rel(file)} → ${label}`, 'nezavršena oznaka u izvršnom kodu');
  if (/\beval\s*\(/.test(src)) bad(`${rel(file)} → eval()`, 'zabranjeno dinamičko izvršavanje');
  if (/new\s+Function\s*\(/.test(src)) bad(`${rel(file)} → new Function()`, 'zabranjeno dinamičko izvršavanje');
}
try {
  const placement = require(path.join(PROGRAM,'smart-text-placement-engine.js'));
  const r = placement.detectFaces(path.join(PROGRAM,'__missing__.png'));
  if (r && r.supported === false && Array.isArray(r.faces) && r.reason) ok('OpenCV nedostupan/missing-image fallback je kontrolisan');
  else bad('OpenCV fallback','neočekivan rezultat');
} catch (e) { bad('OpenCV fallback', e.message); }

console.log('-- 8. UI fetch() → server API ugovor --');
const serverSrc = text(path.join(PROGRAM,'server.js'));
const uiFiles = walk(PUBLIC, f => f.endsWith('.js') && !rel(f).includes('/vendor/'));
const routes = new Set();
for (const file of uiFiles) {
  const src = text(file);
  for (const m of src.matchAll(/fetch\(\s*([`'"])(.*?)\1/gms)) {
    let route = m[2];
    if (!route.startsWith('/api/')) continue;
    route = route.split('${')[0].split('?')[0];
    if (route.length > 5) routes.add(route);
  }
}
for (const route of [...routes].sort()) {
  if (serverSrc.includes(route)) ok(`UI ${route}`); else bad(`UI ${route}`, 'server.js nema odgovarajući prefiks');
}

console.log('-- 9. DOM ID ugovor --');
const html = text(path.join(PUBLIC,'index.html'));
const defined = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
for (const file of uiFiles) {
  const src = text(file);
  for (const rx of [/\bid=["']([^"']+)["']/g,/\bid\s*:\s*['"]([^'"]+)['"]/g,/\.id\s*=\s*['"]([^'"]+)['"]/g,/setAttribute\(\s*['"]id['"]\s*,\s*['"]([^'"]+)['"]/g]) {
    for (const m of src.matchAll(rx)) defined.add(m[1]);
  }
}
const refs = new Map();
for (const file of uiFiles) {
  const src = text(file);
  for (const rx of [/getElementById\(\s*['"]([^'"]+)['"]/g,/querySelector\(\s*['"]#([A-Za-z0-9_-]+)['"]/g]) {
    for (const m of src.matchAll(rx)) if (!refs.has(m[1])) refs.set(m[1], rel(file));
  }
}
for (const [id,file] of refs) if (defined.has(id)) ok(`#${id}`); else bad(`#${id}`, `referenca u ${file} bez definicije`);

console.log('-- 10. Lokalni HTML resursi --');
for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
  const target=m[1]; if (/^(?:https?:|data:|#)/i.test(target)) continue;
  const clean=target.split('?')[0].split('#')[0]; const file=path.resolve(PUBLIC,clean);
  if (file.startsWith(PUBLIC) && fs.existsSync(file)) ok(clean); else bad(clean,'lokalni resurs ne postoji/izlazi iz public');
}

console.log('-- 11. CSS balans --');
for (const file of walk(PUBLIC,f=>f.endsWith('.css'))) {
  const src=text(file).replace(/\/\*[\s\S]*?\*\//g,''); let depth=0, invalid=false;
  for (const ch of src) { if(ch==='{') depth++; else if(ch==='}') { depth--; if(depth<0) invalid=true; } }
  if(!invalid&&depth===0) ok(`CSS ${rel(file)}`); else bad(`CSS ${rel(file)}`,`depth=${depth}`);
}

console.log('-- 12. Verzije --');
if(pkg.version==='15.6.1') ok('package.json 15.6.1'); else bad('package.json verzija',pkg.version);
const readme=text(path.join(REPO_ROOT,'README.md'));
if(readme.includes('15.6.1')) ok('README 15.6.1'); else bad('README','ne navodi 15.6.1');

console.log('-- 13. SHA-256 manifest --');
const manifestFile=path.join(PROGRAM,'INTEGRITET-FAJLOVA-SHA256.txt');
if(!fs.existsSync(manifestFile)) bad('manifest','ne postoji');
else {
  const manifest=text(manifestFile);
  if(manifest.includes(pkg.version)) ok(`manifest header ${pkg.version}`); else bad('manifest header',pkg.version);
  const entries=[...manifest.matchAll(/^([a-f0-9]{64})\s{2}(.+)$/gmi)];
  if(!entries.length) bad('manifest','nema SHA stavki');
  for(const [,expected,p] of entries){ const file=path.join(ROOT,p.trim().replace(/\//g,path.sep)); if(!fs.existsSync(file)){bad(`SHA ${p}`,'nedostaje');continue;} const actual=sha256(file); if(actual===expected.toLowerCase()) ok(`SHA ${p}`); else bad(`SHA ${p}`,'hash se ne poklapa'); }
}

console.log(`\n== DUBINSKI AUDIT V2: ${pass} prošlo, ${fail} nije prošlo ==`);
if(failures.length){ console.log('\nProblemi:'); for(const x of failures.slice(0,150)) console.log(` - ${x.label}${x.detail?`: ${x.detail}`:''}`); }
process.exit(fail?1:0);
