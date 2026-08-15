'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const advancedTools = require('./advanced-tools');

const ROOT = __dirname;
const TOOLS_DIR = path.join(ROOT, 'tools');
const ENGINES_DIR = path.join(ROOT, 'engines');
const HYPERFRAMES_DIR = path.join(ENGINES_DIR, 'hyperframes');
const DATA_DIR = process.env.MSS_DATA_DIR ? path.resolve(process.env.MSS_DATA_DIR) : path.join(ROOT, 'data');
const REFERENCE_ANALYSIS_DIR = path.join(DATA_DIR, 'reference-analysis');
const PROVIDERS_FILE = advancedTools.secureFile('external-providers');

for (const dir of [TOOLS_DIR, ENGINES_DIR, HYPERFRAMES_DIR, REFERENCE_ANALYSIS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function clean(value) { return String(value ?? '').replace(/\u0000/g, '').trim(); }
function exists(file) { try { return fs.existsSync(file); } catch { return false; } }
function commandExists(command) {
  const probe = process.platform === 'win32' ? ['where.exe', [command]] : ['sh', ['-lc', `command -v ${command}`]];
  try {
    const result = childProcess.spawnSync(probe[0], probe[1], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    return result.status === 0;
  } catch { return false; }
}
function runVersion(command, args = []) {
  try {
    const result = childProcess.spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (result.status !== 0) return '';
    return clean(result.stdout || result.stderr).split(/\r?\n/)[0];
  } catch { return ''; }
}
function pythonCandidates() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push({ command: 'py', args: ['-3'] }, { command: 'python', args: [] }, { command: 'python3', args: [] });
  } else {
    candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] });
  }
  return candidates;
}
function pythonStatus() {
  for (const candidate of pythonCandidates()) {
    try {
      const result = childProcess.spawnSync(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (result.status === 0) return { available: true, command: candidate.command, args: candidate.args, version: clean(result.stdout || result.stderr) };
    } catch {}
  }
  return { available: false, command: '', args: [], version: '' };
}
function sceneDetectStatus() {
  const browserFallback = true;
  const python = pythonStatus();
  let exactInstalled = false;
  let version = '';
  if (python.available) {
    try {
      const result = childProcess.spawnSync(python.command, [...python.args, '-c', 'import scenedetect; print(scenedetect.__version__)'], { encoding: 'utf8', windowsHide: true, timeout: 6000 });
      if (result.status === 0) { exactInstalled = true; version = clean(result.stdout); }
    } catch {}
  }
  const venvPython = process.platform === 'win32'
    ? path.join(ROOT, 'runtime', 'pyscenedetect-venv', 'Scripts', 'python.exe')
    : path.join(ROOT, 'runtime', 'pyscenedetect-venv', 'bin', 'python');
  if (!exactInstalled && exists(venvPython)) {
    try {
      const result = childProcess.spawnSync(venvPython, ['-c', 'import scenedetect; print(scenedetect.__version__)'], { encoding: 'utf8', windowsHide: true, timeout: 6000 });
      if (result.status === 0) { exactInstalled = true; version = clean(result.stdout); }
    } catch {}
  }
  return {
    browserFallback,
    exactInstalled,
    version,
    python,
    helperExists: exists(path.join(TOOLS_DIR, 'scene_analyzer.py')),
    installerExists: exists(path.join(TOOLS_DIR, 'INSTALIRAJ-PYSCENEDETECT-LITE.ps1'))
  };
}
function hyperframesStatus() {
  const localBin = process.platform === 'win32'
    ? path.join(HYPERFRAMES_DIR, 'node_modules', '.bin', 'hyperframes.cmd')
    : path.join(HYPERFRAMES_DIR, 'node_modules', '.bin', 'hyperframes');
  const packageJson = path.join(HYPERFRAMES_DIR, 'package.json');
  let installedVersion = '';
  if (exists(path.join(HYPERFRAMES_DIR, 'node_modules', 'hyperframes', 'package.json'))) {
    try { installedVersion = JSON.parse(fs.readFileSync(path.join(HYPERFRAMES_DIR, 'node_modules', 'hyperframes', 'package.json'), 'utf8')).version || ''; } catch {}
  }
  return {
    projectExporterReady: exists(path.join(ROOT, 'public', 'github-modules.js')) && exists(path.join(ROOT, 'public', 'vendor', 'jszip.min.js')),
    localJsZipAvailable: exists(path.join(ROOT, 'public', 'vendor', 'jszip.min.js')),
    installed: exists(localBin),
    installedVersion,
    localBin,
    packageJsonExists: exists(packageJson),
    installerExists: exists(path.join(TOOLS_DIR, 'INSTALIRAJ-HYPERFRAMES.ps1')),
    nodeVersion: process.version,
    nodeOk: Number(process.versions.node.split('.')[0]) >= 22,
    ffmpegAvailable: commandExists('ffmpeg'),
    ffmpegVersion: runVersion('ffmpeg', ['-version'])
  };
}
function defaultProviders() {
  return {
    librechat: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:3080',
      apiKey: '',
      model: '',
      note: 'Opcioni samostalni LibreChat interfejs. Ne koristi ChatGPT Plus pretplatu kao API.'
    },
    openGenerativeAi: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: '',
      model: '',
      note: 'Opcioni Open Generative AI ili udaljeni servis. Cloud modeli mogu zahtevati zaseban ključ.'
    },
    openaiCompatible: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: '',
      model: '',
      note: 'Generički OpenAI-kompatibilni endpoint za Ollama, OpenRouter ili drugi servis.'
    }
  };
}
function readProvidersRaw() {
  const saved = advancedTools.readSecureJson(PROVIDERS_FILE, {});
  const defaults = defaultProviders();
  const output = {};
  for (const key of Object.keys(defaults)) output[key] = { ...defaults[key], ...(saved?.[key] || {}) };
  return output;
}
function maskedProviders() {
  const providers = readProvidersRaw();
  const output = {};
  for (const [key, item] of Object.entries(providers)) {
    output[key] = { ...item, apiKey: item.apiKey ? '••••••••' : '', hasApiKey: Boolean(item.apiKey) };
  }
  return output;
}
function normalizeProviderInput(key, input, existing) {
  const allowed = new Set(Object.keys(defaultProviders()));
  if (!allowed.has(key)) throw new Error('Nepoznat provider.');
  const baseUrl = clean(input.baseUrl || existing.baseUrl);
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new Error('Adresa mora početi sa http:// ili https://');
  let apiKey = existing.apiKey || '';
  if (Object.prototype.hasOwnProperty.call(input, 'apiKey')) {
    const incoming = clean(input.apiKey);
    if (incoming && incoming !== '••••••••') apiKey = incoming;
  }
  if (input.clearApiKey === true) apiKey = '';
  return {
    ...existing,
    enabled: input.enabled === true,
    baseUrl: baseUrl.slice(0, 500),
    apiKey: apiKey.slice(0, 5000),
    model: clean(input.model || '').slice(0, 300)
  };
}
function saveProvider(key, input = {}) {
  const providers = readProvidersRaw();
  providers[key] = normalizeProviderInput(key, input, providers[key]);
  advancedTools.writeSecureJson(PROVIDERS_FILE, providers);
  return maskedProviders()[key];
}
function safeUrl(value) {
  const parsed = new URL(clean(value));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Dozvoljene su samo HTTP i HTTPS adrese.');
  if (parsed.username || parsed.password) throw new Error('Korisničko ime i lozinka ne smeju biti deo URL-a.');
  return parsed;
}
async function testProvider(key) {
  const providers = readProvidersRaw();
  const item = providers[key];
  if (!item) throw new Error('Nepoznat provider.');
  if (!item.baseUrl) throw new Error('Adresa nije uneta.');
  const target = safeUrl(item.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const started = Date.now();
  try {
    const headers = { 'User-Agent': 'Muzicki-Spot-Studio/15.6' };
    if (item.apiKey) headers.Authorization = `Bearer ${item.apiKey}`;
    const response = await fetch(target, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    return {
      ok: response.ok || response.status < 500,
      provider: key,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') || '',
      elapsedMs: Date.now() - started,
      message: response.ok ? 'Servis je dostupan.' : `Servis je odgovorio HTTP ${response.status}. To potvrđuje vezu, ali ne i generisanje.`
    };
  } catch (error) {
    return { ok: false, provider: key, elapsedMs: Date.now() - started, error: error.name === 'AbortError' ? 'Isteklo je vreme čekanja od 8 sekundi.' : error.message };
  } finally { clearTimeout(timer); }
}
function moduleStatus() {
  return {
    ok: true,
    version: '15.6',
    hyperframes: hyperframesStatus(),
    sceneDetect: sceneDetectStatus(),
    providers: maskedProviders(),
    recommendations: [
      { id: 'hyperframes', priority: 1, enabledByDefault: true, reason: 'Deterministički MP4 render iz HTML projekta; radi bez generativnog GPU modela.' },
      { id: 'scene-detect', priority: 2, enabledByDefault: true, reason: 'Analiza referentnih spotova i tempa montaže; LITE analiza radi direktno u browseru.' },
      { id: 'providers', priority: 3, enabledByDefault: false, reason: 'LibreChat i Open Generative AI ostaju opcioni spoljni servisi zbog dodatnih zavisnosti i ključeva.' }
    ]
  };
}
function fixedInstaller(moduleName) {
  const map = {
    hyperframes: path.join(TOOLS_DIR, 'INSTALIRAJ-HYPERFRAMES.ps1'),
    pyscenedetect: path.join(TOOLS_DIR, 'INSTALIRAJ-PYSCENEDETECT-LITE.ps1')
  };
  const script = map[clean(moduleName).toLowerCase()];
  if (!script || !exists(script)) throw new Error('Instalaciona skripta nije pronađena.');
  return script;
}
function launchInstaller(moduleName) {
  const script = fixedInstaller(moduleName);
  if (process.platform !== 'win32') return { ok: false, launched: false, script, message: 'Instalaciona skripta je pripremljena za Windows.' };
  const child = childProcess.spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    detached: true, windowsHide: false, stdio: 'ignore', cwd: ROOT
  });
  child.unref();
  return { ok: true, launched: true, pid: child.pid, script };
}
function openModuleFolder(moduleName) {
  const key = clean(moduleName).toLowerCase();
  const map = {
    hyperframes: HYPERFRAMES_DIR,
    tools: TOOLS_DIR,
    analysis: REFERENCE_ANALYSIS_DIR
  };
  const folder = map[key];
  if (!folder) throw new Error('Nepoznat folder modula.');
  fs.mkdirSync(folder, { recursive: true });
  if (process.platform === 'win32') {
    childProcess.spawn('explorer.exe', [folder], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
    return { ok: true, opened: true, path: folder };
  }
  return { ok: true, opened: false, path: folder };
}

module.exports = {
  moduleStatus,
  maskedProviders,
  saveProvider,
  testProvider,
  launchInstaller,
  openModuleFolder,
  paths: { TOOLS_DIR, HYPERFRAMES_DIR, REFERENCE_ANALYSIS_DIR }
};
