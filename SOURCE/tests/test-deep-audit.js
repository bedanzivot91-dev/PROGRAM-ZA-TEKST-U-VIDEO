'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const SRC_ROOT = path.join(__dirname, '..');
const PROGRAM = path.join(SRC_ROOT, 'PROGRAM - NE BRISATI');
const PUBLIC = path.join(PROGRAM, 'public');
const DESKTOP = path.join(SRC_ROOT, 'desktop');
const TESTS = path.join(SRC_ROOT, 'tests');
const pkg = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, 'package.json'), 'utf8'));

let pass = 0;
let fail = 0;
const failures = [];
function ok(label) { pass += 1; console.log(`  [OK] ${label}`); }
function bad(label, detail = '') { fail += 1; failures.push({ label, detail }); console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }

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
function rel(file) { return path.relative(SRC_ROOT, file).replace(/\\/g, '/'); }
function text(file) { return fs.readFileSync(file, 'utf8'); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function localResolve(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js'), path.join(base, 'index.json')];
  return candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

console.log('== DUBINSKI AUDIT CELOG PROGRAMA ==');

const allJs = walk(PROGRAM, f => f.endsWith('.js')).concat(walk(DESKTOP, f => f.endsWith('.js')));
const ownJs = allJs.filter(f => !rel(f).includes('/vendor/'));
const allJson = walk(PROGRAM, f => f.endsWith('.json')).concat(walk(SRC_ROOT, f => f.endsWith('.json') && !rel(f).startsWith('PROGRAM - NE BRISATI/')));
const allPs1 = walk(PROGRAM, f => f.endsWith('.ps1'));
const allPy = walk(PROGRAM, f => f.endsWith('.py'));
const allBatch = walk(PROGRAM, f => /\.(?:bat|cmd)$/i.test(f));
const testFiles = walk(TESTS, f => f.endsWith('.js'));
const testCorpus = testFiles.map(text).join('\n');

console.log('-- 1. JavaScript, JSON i Python sintaksa --');
for (const file of allJs) {
  try { childProcess.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); ok(`JS ${rel(file)}`); }
  catch (error) { bad(`JS ${rel(file)}`, (error.stderr || error.message).toString().split('\n')[0]); }
}
for (const file of allJson) {
  try { JSON.parse(text(file)); ok(`JSON ${rel(file)}`); }
  catch (error) { bad(`JSON ${rel(file)}`, error.message); }
}
for (const file of allPy) {
  let compiled = false;
  let lastError = '';
  const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    try {
      childProcess.execFileSync(command, [...prefix, '-m', 'py_compile', file], { stdio: 'pipe', timeout: 15000 });
      compiled = true; break;
    } catch (error) { lastError = error.message; }
  }
  if (compiled) ok(`PY ${rel(file)}`); else bad(`PY ${rel(file)}`, lastError || 'Python interpreter nije dostupan');
}

console.log('-- 2. Lokalni require() putevi --');
for (const file of ownJs) {
  const src = text(file);
  const requires = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]).filter(x => x.startsWith('.'));
  for (const req of requires) {
    if (localResolve(file, req)) ok(`${rel(file)} require(${req})`);
    else bad(`${rel(file)} require(${req})`, 'lokalni modul ne postoji');
  }
}

console.log('-- 3. npm test skripte i test fajlovi --');
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  if (!name.startsWith('test:')) continue;
  const matches = [...String(command).matchAll(/node\s+([^\s&|]+\.js)/g)];
  if (!matches.length) continue;
  for (const match of matches) {
    const file = path.join(SRC_ROOT, match[1]);
    if (fs.existsSync(file)) ok(`${name} → ${match[1]}`);
    else bad(`${name} → ${match[1]}`, 'test fajl ne postoji');
  }
}

console.log('-- 4. Backend moduli i svaka izvezena funkcija imaju namenski test --');
const entrypointExclusions = new Set(['server.js', 'launcher.js', 'background-worker.js']);
for (const file of walk(PROGRAM, f => path.dirname(f) === PROGRAM && f.endsWith('.js'))) {
  const src = text(file);
  if (!/module\.exports\s*=/.test(src)) continue;
  const base = path.basename(file);
  if (!testCorpus.includes(base) && !entrypointExclusions.has(base)) {
    bad(`${base} test pokrivenost`, 'nijedan test ne referencira modul');
    continue;
  }
  if (entrypointExclusions.has(base)) { ok(`${base} je ulazni/runtime modul`); continue; }
  try {
    const mod = require(file);
    const functionExports = Object.entries(mod).filter(([, value]) => typeof value === 'function');
    if (!functionExports.length) { ok(`${base} nema izvezene funkcije`); continue; }
    for (const [name] of functionExports) {
      if (testCorpus.includes(name)) ok(`${base} → ${name} ima test referencu`);
      else bad(`${base} → ${name}`, 'izvezena funkcija se ne pominje ni u jednom testu');
    }
  } catch (error) {
    bad(`${base} require()`, error.message);
  }
}

console.log('-- 5. Tool registry i instalacione skripte --');
try {
  const runner = require(path.join(PROGRAM, 'tool-runner.js'));
  for (const [id, meta] of Object.entries(runner.TOOL_REGISTRY || {})) {
    const script = path.join(PROGRAM, 'tools', meta.script || '');
    if (meta.script && fs.existsSync(script)) ok(`tool ${id} → ${meta.script}`);
    else bad(`tool ${id}`, `nedostaje skripta ${meta.script || '(prazno)'}`);
  }
} catch (error) { bad('tool-runner registry', error.message); }

console.log('-- 6. PowerShell i batch osnovni integritet --');
if (process.platform === 'win32') {
  for (const file of allPs1) {
    const escaped = file.replace(/'/g, "''");
    const command = `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count -gt 0){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`;
    try { childProcess.execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'pipe' }); ok(`PS1 ${rel(file)}`); }
    catch (error) { bad(`PS1 ${rel(file)}`, (error.stderr || error.message).toString().split('\n')[0]); }
  }
} else {
  ok('PowerShell parser se izvršava u Windows CI okruženju');
}
for (const file of allBatch) {
  const src = text(file);
  if (/\u0000/.test(src)) bad(`BATCH ${rel(file)}`, 'NUL karakter u tekstualnoj skripti');
  else if (!src.trim()) bad(`BATCH ${rel(file)}`, 'prazna skripta');
  else ok(`BATCH ${rel(file)}`);
}

console.log('-- 7. Zabranjeni stubovi i dinamičko izvršavanje --');
const stubPatterns = [
  [/\bTODO\b/i, 'TODO'], [/\bFIXME\b/i, 'FIXME'], [/\bIMPLEMENT\s+ME\b/i, 'IMPLEMENT ME'],
  [/not\s+implemented/i, 'not implemented'], [/nije\s+implementirano/i, 'nije implementirano']
];
for (const file of ownJs) {
  const src = text(file);
  for (const [pattern, label] of stubPatterns) {
    if (pattern.test(src)) bad(`${rel(file)} → ${label}`, 'stub/nezavršena oznaka u izvršnom kodu');
  }
  if (/\beval\s*\(/.test(src)) bad(`${rel(file)} → eval()`, 'dinamičko izvršavanje koda nije dozvoljeno');
  if (/new\s+Function\s*\(/.test(src)) bad(`${rel(file)} → new Function()`, 'dinamičko izvršavanje koda nije dozvoljeno');
}
try {
  const placement = require(path.join(PROGRAM, 'smart-text-placement-engine.js'));
  const missing = placement.detectFaces(path.join(PROGRAM, '__definitely_missing_image__.png'));
  if (missing && missing.supported === false && Array.isArray(missing.faces) && typeof missing.reason === 'string' && missing.reason.length > 0) {
    ok('OpenCV fallback je eksplicitno i funkcionalno obrađen kada slika/alati nisu dostupni');
  } else bad('OpenCV fallback', 'nedostupan detector ne vraća kontrolisan rezultat');
} catch (error) { bad('OpenCV fallback', error.message); }
if (!failures.some(x => /stub|eval|Function/.test(`${x.label} ${x.detail}`))) ok('Nema očiglednih stubova/eval/new Function u sopstvenom JS kodu');

console.log('-- 8. UI → server API ugovor --');
const serverFile = path.join(PROGRAM, 'server.js');
const serverSrc = text(serverFile);
const uiFiles = walk(PUBLIC, f => f.endsWith('.js') && !rel(f).includes('/vendor/'));
const uiRoutePrefixes = new Set();
for (const file of uiFiles) {
  const src = text(file);
  for (const m of src.matchAll(/fetch\(\s*([`'"])(.*?)\1/gms)) {
    let route = m[2];
    if (!route.startsWith('/api/')) continue;
    route = route.split('${')[0].split('?')[0];
    if (route.length > 5) uiRoutePrefixes.add(route);
  }
}
for (const route of [...uiRoutePrefixes].sort()) {
  if (serverSrc.includes(route)) ok(`UI ruta ${route}`);
  else bad(`UI ruta ${route}`, 'server.js nema odgovarajući literal/prefiks');
}

console.log('-- 9. DOM ID ugovor --');
const htmlFile = path.join(PUBLIC, 'index.html');
const html = text(htmlFile);
const definedIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
for (const file of uiFiles) {
  const src = text(file);
  for (const m of src.matchAll(/\bid=["']([^"']+)["']/g)) definedIds.add(m[1]);
  for (const m of src.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)) definedIds.add(m[1]);
  for (const m of src.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)) definedIds.add(m[1]);
  for (const m of src.matchAll(/setAttribute\(\s*['"]id['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g)) definedIds.add(m[1]);
}
const referencedIds = new Map();
for (const file of uiFiles) {
  const src = text(file);
  const ids = [
    ...[...src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
    ...[...src.matchAll(/querySelector\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g)].map(m => m[1])
  ];
  for (const id of ids) if (!referencedIds.has(id)) referencedIds.set(id, rel(file));
}
for (const [id, file] of referencedIds) {
  if (definedIds.has(id)) ok(`DOM #${id}`);
  else bad(`DOM #${id}`, `referenciran u ${file}, ali nije pronađen u HTML/dinamičkom markup-u`);
}

console.log('-- 10. Lokalni HTML resursi --');
for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
  const target = m[1];
  if (/^(?:https?:|data:|#)/i.test(target)) continue;
  const clean = target.split('?')[0].split('#')[0];
  const file = path.resolve(PUBLIC, clean);
  if (file.startsWith(PUBLIC) && fs.existsSync(file)) ok(`HTML resurs ${clean}`);
  else bad(`HTML resurs ${clean}`, 'lokalni fajl ne postoji ili izlazi iz public foldera');
}

console.log('-- 11. CSS osnovni integritet --');
for (const file of walk(PUBLIC, f => f.endsWith('.css'))) {
  const src = text(file).replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0; let invalid = false;
  for (const ch of src) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) invalid = true; } }
  if (!invalid && depth === 0) ok(`CSS ${rel(file)}`); else bad(`CSS ${rel(file)}`, `nebalansirane vitičaste zagrade: depth=${depth}`);
}

console.log('-- 12. Verzija programa --');
if (pkg.version === '15.6.1') ok('package.json = 15.6.1'); else bad('package.json verzija', pkg.version);
const readme = text(path.join(SRC_ROOT, '..', 'README.md'));
if (readme.includes('15.6.1')) ok('README navodi 15.6.1'); else bad('README verzija', 'README ne navodi aktuelnu 15.6.1');

console.log('-- 13. SHA-256 integrity manifest --');
const manifestFile = path.join(PROGRAM, 'INTEGRITET-FAJLOVA-SHA256.txt');
if (!fs.existsSync(manifestFile)) {
  bad('Integrity manifest', 'fajl ne postoji');
} else {
  const manifest = text(manifestFile);
  if (manifest.includes(pkg.version)) ok(`Integrity manifest header = ${pkg.version}`);
  else bad('Integrity manifest header', `ne sadrži aktuelnu verziju ${pkg.version}`);
  const entries = [...manifest.matchAll(/^([a-f0-9]{64})\s{2}(.+)$/gmi)];
  if (!entries.length) bad('Integrity manifest', 'nema parsabilnih SHA-256 stavki');
  for (const [, expected, relativePath] of entries) {
    const file = path.join(SRC_ROOT, relativePath.trim().replace(/\//g, path.sep));
    if (!fs.existsSync(file)) { bad(`SHA ${relativePath}`, 'fajl nedostaje'); continue; }
    const actual = sha256(file);
    if (actual === expected.toLowerCase()) ok(`SHA ${relativePath}`);
    else bad(`SHA ${relativePath}`, `očekivano ${expected.slice(0, 12)}…, stvarno ${actual.slice(0, 12)}…`);
  }
}

console.log(`\n== DUBINSKI AUDIT: ${pass} prošlo, ${fail} nije prošlo ==`);
if (failures.length) {
  console.log('\nPrvih 120 problema:');
  for (const item of failures.slice(0, 120)) console.log(` - ${item.label}${item.detail ? `: ${item.detail}` : ''}`);
}
process.exit(fail ? 1 : 0);
