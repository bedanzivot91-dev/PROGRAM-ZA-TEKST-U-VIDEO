'use strict';

(function () {
  const MODULE_VERSION = '15.4';
  const byId = id => document.getElementById(id);
  const text = value => String(value ?? '').trim();
  const clampNumber = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeName = value => (typeof safeFileName === 'function' ? safeFileName(value) : text(value).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()) || 'projekat';

  function notify(message) {
    if (typeof showToast === 'function') showToast(message);
    else console.log(message);
  }
  function ensureAdvancedState() {
    if (!state.research || typeof state.research !== 'object') state.research = {};
    if (!Array.isArray(state.research.referenceVideoAnalyses)) state.research.referenceVideoAnalyses = [];
  }
  function insertModuleCenter() {
    const toolsPanel = document.querySelector('[data-panel="tools"]');
    if (!toolsPanel || byId('githubModulesCard')) return;
    const anchor = toolsPanel.querySelector('.production-audit-card') || toolsPanel.firstElementChild;
    const markup = `
      <div class="card github-modules-card" id="githubModulesCard">
        <div class="section-heading inner-heading">
          <div><span class="step-label">GITHUB MODULI 15.4</span><h3>HyperFrames render, analiza referentnih spotova i spoljni AI konektori</h3></div>
          <span class="badge" id="githubModulesBadge">PROVERA...</span>
        </div>
        <div class="notice success"><strong>Dodato bez opterećivanja slabog računara.</strong> HyperFrames projekat se izvozi direktno iz Studija, a LITE analiza rezova radi u browseru bez Python instalacije. LibreChat i Open Generative AI ostaju opcioni — ne pokreću Docker ni velike modele automatski.</div>
        <div class="module-grid">
          <article class="module-card">
            <h4>1. HyperFrames — stabilan MP4 projekat</h4>
            <p>Izvozi audio, slike, AI klipove, scene, titlove, storyboard i jedan CMD za preview/draft/final render.</p>
            <div class="actions"><button class="primary" id="exportHyperframesBtn" type="button">IZVEZI HYPERFRAMES ZIP</button><button class="secondary" id="installHyperframesBtn" type="button">INSTALIRAJ CLI OPCIONO</button></div>
            <pre class="test-report compact-report" id="hyperframesReport">Status se učitava...</pre>
          </article>
          <article class="module-card">
            <h4>2. Analiza referentnog spota</h4>
            <p>Lokalno meri rezove, tempo montaže, svetlinu, prosečno trajanje scena i promene slike. Rezultat automatski ulazi u Korak 3.</p>
            <input id="referenceVideoInput" type="file" accept="video/mp4,video/webm,video/quicktime,video/*" />
            <div class="field-grid three">
              <label>Maks. uzoraka<select id="referenceMaxSamples"><option value="120">120 — brzo</option><option value="240" selected>240 — preporučeno</option><option value="360">360 — detaljnije</option></select></label>
              <label>Osetljivost<select id="referenceSensitivity"><option value="1.8">Viša</option><option value="2.5" selected>Normalna</option><option value="3.2">Niža</option></select></label>
              <label>Min. scena<input id="referenceMinScene" type="number" min="0.5" max="10" step="0.5" value="1.5"/></label>
            </div>
            <div class="actions"><button class="primary" id="analyzeReferenceVideoBtn" type="button">ANALIZIRAJ VIDEO</button><button class="secondary" id="downloadReferenceAnalysisBtn" type="button" disabled>PREUZMI JSON</button><button class="ghost" id="installSceneDetectBtn" type="button">OPCIONI PYSCENEDETECT</button></div>
            <div class="progress-wrap"><div class="progress-bar" id="referenceAnalysisProgress"></div></div>
            <pre class="test-report compact-report" id="referenceAnalysisReport">Izaberi MP4 ili WebM. Fajl ne napušta računar.</pre>
          </article>
        </div>
        <details class="advanced-box provider-hub"><summary>OPCIONO — LibreChat, Open Generative AI i drugi AI servisi</summary>
          <div class="notice warn"><strong>Ovo nije ChatGPT Plus most.</strong> LibreChat i Open Generative AI mogu zahtevati sopstveni server, API ključ ili udaljeni GPU. Glavni Korak 3 i dalje koristi tvoj ChatGPT Plus browser most.</div>
          <div class="field-grid three">
            <label>Servis<select id="externalProviderType"><option value="librechat">LibreChat</option><option value="openGenerativeAi">Open Generative AI</option><option value="openaiCompatible">OpenAI-kompatibilni endpoint</option></select></label>
            <label>Adresa<input id="externalProviderUrl" placeholder="http://127.0.0.1:3080"/></label>
            <label>Model, opciono<input id="externalProviderModel" placeholder="Naziv modela"/></label>
          </div>
          <label>API ključ, opciono<input id="externalProviderKey" type="password" autocomplete="off" placeholder="Ostavi prazno da zadržiš sačuvani ključ"/></label>
          <label><input id="externalProviderEnabled" type="checkbox"/> Uključen kao opcioni servis</label>
          <div class="actions"><button class="primary" id="saveExternalProviderBtn" type="button">SAČUVAJ ŠIFROVANO</button><button class="secondary" id="testExternalProviderBtn" type="button">TESTIRAJ VEZU</button><button class="ghost" id="refreshModulesBtn" type="button">OSVEŽI MODULE</button></div>
          <pre class="test-report compact-report" id="externalProviderReport">Provider podešavanja se čuvaju Windows DPAPI zaštitom.</pre>
        </details>
      </div>
      <div class="card local-tools-card" id="localToolsCard">
        <div class="section-heading inner-heading">
          <div><span class="step-label">LOKALNI ALATI</span><h3>Instalacija bez sirovog crnog prozora</h3></div>
          <span class="badge" id="localToolsBadge">UČITAVAM...</span>
        </div>
        <div class="notice info"><strong>Instalacija sada radi unutar programa.</strong> Klikni INSTALIRAJ — proces radi u pozadini, a napredak i log vidiš ovde, bez posebnog PowerShell prozora. Svi alati su opcioni.</div>
        <div class="tool-grid" id="localToolsGrid"></div>
        <pre class="test-report compact-report" id="localToolsLog" hidden></pre>
      </div>`;
    if (anchor) anchor.insertAdjacentHTML('beforebegin', markup); else toolsPanel.insertAdjacentHTML('afterbegin', markup);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  let moduleStatus = null;
  async function refreshModuleStatus(showMessage = false) {
    try {
      moduleStatus = await fetchJson('/api/modules/status');
      const hf = moduleStatus.hyperframes || {};
      const scene = moduleStatus.sceneDetect || {};
      byId('githubModulesBadge').textContent = 'MODULI SPREMNI';
      byId('hyperframesReport').textContent = [
        `IZVOZ PROJEKTA: ${hf.projectExporterReady ? 'SPREMAN' : 'NIJE SPREMAN'}`,
        `Lokalni ZIP motor: ${hf.localJsZipAvailable ? 'SPREMAN — radi i bez CDN-a' : 'NEDOSTAJE'}`,
        `HyperFrames CLI: ${hf.installed ? `INSTALIRAN ${hf.installedVersion || ''}` : 'opciono — izvozeni projekat ga preuzima pri prvom pokretanju'}`,
        `Node.js: ${hf.nodeVersion || '—'} ${hf.nodeOk ? '✓' : '✕'}`,
        `FFmpeg u PATH-u: ${hf.ffmpegAvailable ? 'DA' : 'NE — izvezeni projekat će tražiti instalaciju'}`,
        '',
        `Analiza referenci: browser LITE ${scene.browserFallback ? 'SPREMNA' : 'NIJE SPREMNA'}`,
        `Zvanični PySceneDetect: ${scene.exactInstalled ? `INSTALIRAN ${scene.version || ''}` : 'opciono, nije potreban za LITE analizu'}`
      ].join('\n');
      populateProviderForm();
      if (showMessage) notify('Status GitHub modula je osvežen.');
    } catch (error) {
      if (byId('githubModulesBadge')) byId('githubModulesBadge').textContent = 'GREŠKA';
      if (byId('hyperframesReport')) byId('hyperframesReport').textContent = error.message;
    }
  }

  let localToolsPollTimer = null;
  let localToolsActiveId = '';
  async function refreshLocalToolsList() {
    const grid = byId('localToolsGrid');
    if (!grid) return;
    try {
      const data = await fetchJson('/api/modules/tools');
      const tools = data.tools || [];
      const running = tools.filter(t => t.status === 'running').length;
      byId('localToolsBadge').textContent = running ? `${running} U TOKU` : 'SPREMNO';
      grid.innerHTML = tools.map(tool => {
        const statusLabel = { idle: tool.installed ? 'Instalirano' : 'Nije instalirano', running: 'Instalacija u toku…', success: 'Instalirano', failed: 'Nije uspelo' }[tool.status] || tool.status;
        const statusClass = tool.status === 'success' || (tool.status === 'idle' && tool.installed) ? 'ok' : tool.status === 'running' ? 'lazy' : tool.status === 'failed' ? 'missing' : '';
        const busy = tool.status === 'running';
        return `<article class="tool-card ${statusClass}" data-tool-id="${htmlEscape(tool.id)}">
          <div><strong>${htmlEscape(tool.name)}</strong><p>${htmlEscape(tool.category)}</p><span class="tool-state">${htmlEscape(statusLabel)}</span>
          <div class="actions compact-actions">
            <button class="secondary" type="button" data-run-tool="${htmlEscape(tool.id)}" ${busy ? 'disabled' : ''}>${busy ? 'U TOKU…' : (tool.installed ? 'PONOVO INSTALIRAJ' : 'INSTALIRAJ')}</button>
            <button class="ghost" type="button" data-view-tool-log="${htmlEscape(tool.id)}">LOG</button>
            ${busy ? `<button class="danger" type="button" data-cancel-tool="${htmlEscape(tool.id)}">OTKAŽI</button>` : ''}
          </div></div></article>`;
      }).join('') || '<div class="mini-status">Nema dostupnih alata.</div>';
      grid.querySelectorAll('[data-run-tool]').forEach(btn => btn.addEventListener('click', () => runLocalTool(btn.dataset.runTool)));
      grid.querySelectorAll('[data-view-tool-log]').forEach(btn => btn.addEventListener('click', () => showLocalToolLog(btn.dataset.viewToolLog)));
      grid.querySelectorAll('[data-cancel-tool]').forEach(btn => btn.addEventListener('click', () => cancelLocalTool(btn.dataset.cancelTool)));
      if (running && !localToolsPollTimer) localToolsPollTimer = setInterval(() => refreshLocalToolsList(), 2000);
      if (!running && localToolsPollTimer) { clearInterval(localToolsPollTimer); localToolsPollTimer = null; }
      if (localToolsActiveId) showLocalToolLog(localToolsActiveId, false);
    } catch (error) {
      if (byId('localToolsBadge')) byId('localToolsBadge').textContent = 'GREŠKA';
    }
  }
  async function runLocalTool(toolId) {
    try {
      await fetchJson('/api/modules/tools/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId }) });
      notify('Instalacija je pokrenuta u pozadini.');
      showLocalToolLog(toolId);
      refreshLocalToolsList();
    } catch (error) { notify(error.message); }
  }
  async function cancelLocalTool(toolId) {
    try { await fetchJson('/api/modules/tools/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId }) }); refreshLocalToolsList(); }
    catch (error) { notify(error.message); }
  }
  async function showLocalToolLog(toolId, notifyOnError = true) {
    localToolsActiveId = toolId;
    const pre = byId('localToolsLog');
    if (!pre) return;
    try {
      const data = await fetchJson(`/api/modules/tools/status?toolId=${encodeURIComponent(toolId)}`);
      pre.hidden = false;
      pre.textContent = `${toolId} — ${data.status}\n${(data.log || []).join('\n')}` || 'Nema izlaza još.';
    } catch (error) { if (notifyOnError) notify(error.message); }
  }

  function dimensionsForProject() {
    const format = state.format || '16:9';
    if (format === '9:16') return { width: 1080, height: 1920 };
    if (format === '1:1') return { width: 1080, height: 1080 };
    return { width: 1920, height: 1080 };
  }
  function blobExtension(blob, fallback) {
    const type = String(blob?.type || '').toLowerCase();
    if (type.includes('audio/mp4')) return 'm4a';
    if (type.includes('webm')) return 'webm';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('quicktime')) return 'mov';
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
    if (type.includes('wav')) return 'wav';
    if (type.includes('mpeg')) return 'mp3';
    if (type.includes('mp4')) return 'm4a';
    return fallback;
  }
  function sceneDuration(scene, fallback = 5) {
    const duration = Number(scene.duration) || Number(scene.end) - Number(scene.start);
    return Math.max(0.2, Number.isFinite(duration) ? duration : fallback);
  }
  function formatSeconds(value) { return Math.max(0, Number(value) || 0).toFixed(3).replace(/\.000$/, ''); }
  function buildHyperframesHtml(manifest) {
    const sceneMarkup = manifest.scenes.map(scene => {
      const timing = `data-start="${formatSeconds(scene.start)}" data-duration="${formatSeconds(scene.duration)}" data-track-index="0"`;
      if (scene.assetType === 'video') {
        return `<video id="scene-${scene.number}" class="clip scene-media" ${timing} src="${htmlEscape(scene.assetPath)}" muted playsinline></video>`;
      }
      if (scene.assetType === 'image') {
        return `<img id="scene-${scene.number}" class="clip scene-media kenburns-${scene.number % 4}" ${timing} style="--scene-duration:${formatSeconds(scene.duration)}s" src="${htmlEscape(scene.assetPath)}" alt="Scena ${scene.number}" />`;
      }
      return `<div id="scene-${scene.number}" class="clip placeholder-scene" ${timing}><div><span>SCENA ${scene.number}</span><h2>${htmlEscape(scene.sceneTitle || scene.section || 'Vizuelna scena')}</h2><p>${htmlEscape(scene.lyric || scene.description || '')}</p></div></div>`;
    }).join('\n');
    const captions = manifest.captions.map((item, index) => `<div class="clip caption" data-start="${formatSeconds(item.start)}" data-duration="${formatSeconds(item.duration)}" data-track-index="3" id="caption-${index + 1}">${htmlEscape(item.text)}</div>`).join('\n');
    const audio = manifest.audioPath ? `<audio data-start="0" data-duration="${formatSeconds(manifest.duration)}" data-track-index="2" data-volume="1" src="${htmlEscape(manifest.audioPath)}"></audio>` : '';
    return `<!doctype html>
<html lang="sr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${htmlEscape(manifest.songTitle || 'Muzički spot')}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#05070c;color:#fff;font-family:Arial,sans-serif;overflow:hidden}#stage{position:relative;width:100vw;height:100vh;overflow:hidden;background:#05070c}.clip{position:absolute;inset:0}.scene-media{width:100%;height:100%;object-fit:cover}.placeholder-scene{display:grid;place-items:center;padding:7vw;text-align:center;background:radial-gradient(circle at 50% 35%,#27324b,#080b13 70%)}.placeholder-scene span{font-size:clamp(14px,1.4vw,28px);letter-spacing:.22em;opacity:.65}.placeholder-scene h2{font-size:clamp(34px,5vw,100px);max-width:1400px;margin:.4em auto}.placeholder-scene p{font-size:clamp(18px,2vw,40px);max-width:1200px;line-height:1.35;opacity:.85}.caption{inset:auto 6% 6% 6%;height:auto;text-align:center;font-size:clamp(26px,3.2vw,64px);font-weight:800;line-height:1.15;text-shadow:0 3px 12px #000,0 0 3px #000;padding:.25em .45em}.kenburns-0{animation:mssZoomIn var(--scene-duration,5s) linear both}.kenburns-1{animation:mssZoomOut var(--scene-duration,5s) linear both}.kenburns-2{animation:mssPanLeft var(--scene-duration,5s) linear both}.kenburns-3{animation:mssPanRight var(--scene-duration,5s) linear both}@keyframes mssZoomIn{from{transform:scale(1)}to{transform:scale(1.06)}}@keyframes mssZoomOut{from{transform:scale(1.06)}to{transform:scale(1)}}@keyframes mssPanLeft{from{transform:scale(1.06) translateX(1.5%)}to{transform:scale(1.06) translateX(-1.5%)}}@keyframes mssPanRight{from{transform:scale(1.06) translateX(-1.5%)}to{transform:scale(1.06) translateX(1.5%)}}
</style></head><body>
<div id="stage" data-composition-id="mss-${htmlEscape(manifest.projectId)}" data-start="0" data-width="${manifest.width}" data-height="${manifest.height}" data-duration="${formatSeconds(manifest.duration)}">
${sceneMarkup}
${captions}
${audio}
</div>
</body></html>`;
  }
  function buildStoryboardMarkdown(manifest) {
    return [`# ${manifest.songTitle || 'Muzički spot'}`, '', `Format: ${manifest.width}×${manifest.height} @ ${manifest.fps} fps`, `Trajanje: ${manifest.duration.toFixed(2)} s`, '', '## Scene', '', ...manifest.scenes.flatMap(scene => [
      `### ${scene.number}. ${scene.sceneTitle || scene.section || 'Scena'}`,
      `- Vreme: ${scene.start.toFixed(2)}–${(scene.start + scene.duration).toFixed(2)} s`,
      `- Lokacija: ${scene.location || 'nije uneta'}`,
      `- Kadar/kamera: ${scene.shot || '—'} / ${scene.camera || '—'}`,
      `- Stih: ${scene.lyric || '—'}`,
      `- Radnja: ${scene.description || '—'}`,
      `- Asset: ${scene.assetPath || 'placeholder'}`,
      ''
    ])].join('\n');
  }
  function hyperframesLauncherText() {
    return String.raw`@echo off
chcp 65001 >nul
title Muzički Spot Studio - HyperFrames projekat
cd /d "%~dp0"
echo.
echo MUZICKI SPOT STUDIO - HYPERFRAMES
echo.

where node >nul 2>nul
if not errorlevel 1 node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ nije pronadjen. Preuzimam zvanicni portable Node.js 24 LTS...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-node.ps1"
  if errorlevel 1 goto :greska
  set "PATH=%~dp0runtime\node;%PATH%"
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  if not exist "%~dp0runtime\ffmpeg-portable" (
    echo FFmpeg nije pronadjen. Preuzimam provereni portable FFmpeg...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-ffmpeg.ps1"
    if errorlevel 1 goto :greska
  )
  for /r "%~dp0runtime\ffmpeg-portable" %%F in (ffmpeg.exe) do set "PATH=%%~dpF;%PATH%"
)

where node >nul 2>nul || goto :greska
where npx >nul 2>nul || goto :greska
where ffmpeg >nul 2>nul || goto :greska
if not exist renders mkdir renders

echo 1 - Preview u browseru
echo 2 - Brzi draft render
echo 3 - Finalni 1080p MP4 render
echo 4 - Provera projekta - lint
set /p izbor=Izaberi 1-4: 
if "%izbor%"=="1" npx --yes hyperframes@0.7.62 preview
if "%izbor%"=="2" npx --yes hyperframes@0.7.62 render --quality draft --workers 1 --output renders\draft.mp4
if "%izbor%"=="3" npx --yes hyperframes@0.7.62 render --quality standard --workers 1 --output renders\final.mp4
if "%izbor%"=="4" npx --yes hyperframes@0.7.62 lint
if errorlevel 1 goto :greska
echo.
echo ZAVRSENO. Rezultati su u folderu renders.
pause
exit /b 0

:greska
echo.
echo GRESKA: HyperFrames projekat nije zavrsen.
echo Proveri internet vezu i poruke iznad.
pause
exit /b 1
`;
  }
  function hyperframesNodeBootstrapText() {
    return String.raw`$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runtime = Join-Path $ProjectDir 'runtime'
$NodeDir = Join-Path $Runtime 'node'
$Zip = Join-Path $Runtime 'node-portable.zip'
$Extract = Join-Path $Runtime 'node-extract'
$ShaFile = Join-Path $Runtime 'SHASUMS256.txt'
$NodeVersion = 'v24.18.0'
$BaseUrl = 'https://nodejs.org/download/release/' + $NodeVersion
function Download-File([string]$Url,[string]$Destination) {
  Remove-Item -Force -ErrorAction SilentlyContinue $Destination
  try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 240; if ((Test-Path $Destination) -and (Get-Item $Destination).Length -gt 0) { return } } catch {}
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) { & curl.exe -L --fail --retry 4 --connect-timeout 20 --max-time 300 -o $Destination $Url; if ($LASTEXITCODE -eq 0 -and (Test-Path $Destination)) { return } }
  throw 'Node.js download nije uspeo.'
}
$arch = 'x64'
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_IDENTIFIER -match 'ARM') { $arch = 'arm64' }
elseif ($env:PROCESSOR_ARCHITECTURE -eq 'x86' -and -not $env:PROCESSOR_ARCHITEW6432) { $arch = 'x86' }
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $NodeDir,$Extract
Download-File ($BaseUrl + '/SHASUMS256.txt') $ShaFile
$pattern = '^([a-fA-F0-9]{64})\s+(node-v[0-9.]+-win-' + [regex]::Escape($arch) + '\.zip)$'
$match = $null
foreach ($line in Get-Content -LiteralPath $ShaFile) { if ($line -match $pattern) { $match = $Matches; break } }
if (-not $match) { throw 'Node.js Windows paket nije pronadjen u zvanicnoj SHA listi.' }
$Expected = $match[1].ToLowerInvariant(); $FileName = $match[2]
Download-File ($BaseUrl + '/' + $FileName) $Zip
$Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Zip).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw 'Node.js SHA-256 provera nije prosla.' }
Expand-Archive -LiteralPath $Zip -DestinationPath $Extract -Force
$Source = Get-ChildItem -LiteralPath $Extract -Directory | Select-Object -First 1
if (-not $Source -or -not (Test-Path (Join-Path $Source.FullName 'node.exe'))) { throw 'node.exe nije pronadjen.' }
Move-Item -LiteralPath $Source.FullName -Destination $NodeDir
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Extract
Remove-Item -Force -ErrorAction SilentlyContinue $Zip,$ShaFile
$Version = & (Join-Path $NodeDir 'node.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Portable Node.js nije ispravan.' }
Write-Host ('Node.js je spreman: ' + $Version) -ForegroundColor Green
`;
  }
  function hyperframesFfmpegBootstrapText() {
    return String.raw`$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $ProjectDir 'runtime\ffmpeg-portable'
$TempZip = Join-Path $env:TEMP 'mss-hyperframes-ffmpeg.zip'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
$Headers = @{'User-Agent'='Muzicki-Spot-Studio-HyperFrames/15.4'}
$Release = Invoke-RestMethod -Headers $Headers -Uri 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest'
$Asset = $Release.assets | Where-Object {$_.name -eq 'ffmpeg-master-latest-win64-gpl.zip'} | Select-Object -First 1
if (-not $Asset) { $Asset = $Release.assets | Where-Object {$_.name -match '^ffmpeg-.*-win64-gpl\.zip$' -and $_.name -notmatch 'shared'} | Select-Object -First 1 }
if (-not $Asset) { throw 'Windows FFmpeg ZIP nije pronadjen.' }
Invoke-WebRequest -Headers $Headers -Uri $Asset.browser_download_url -OutFile $TempZip -TimeoutSec 600
$Actual = (Get-FileHash -Algorithm SHA256 $TempZip).Hash.ToLowerInvariant()
$Expected = ''
if ($Asset.digest -and $Asset.digest -match '^sha256:(.+)$') { $Expected = $Matches[1].ToLowerInvariant() }
if (-not $Expected) {
  $Checks = $Release.assets | Where-Object {$_.name -eq 'checksums.sha256'} | Select-Object -First 1
  if ($Checks) {
    $CheckFile = Join-Path $env:TEMP 'mss-hyperframes-ffmpeg-checksums.sha256'
    Invoke-WebRequest -Headers $Headers -Uri $Checks.browser_download_url -OutFile $CheckFile
    $Line = Get-Content $CheckFile | Where-Object {$_ -match [regex]::Escape($Asset.name) + '$'} | Select-Object -First 1
    if ($Line -match '^([a-fA-F0-9]{64})\s+') { $Expected = $Matches[1].ToLowerInvariant() }
  }
}
if ($Expected -and $Actual -ne $Expected) { throw 'FFmpeg SHA-256 provera nije prosla.' }
Remove-Item $Target -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Expand-Archive -Path $TempZip -DestinationPath $Target -Force
$Ffmpeg = Get-ChildItem $Target -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
$Ffprobe = Get-ChildItem $Target -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
if (-not $Ffmpeg -or -not $Ffprobe) { throw 'FFmpeg nije pronadjen posle raspakivanja.' }
Remove-Item -Force -ErrorAction SilentlyContinue $TempZip
Write-Host ('FFmpeg je spreman: ' + $Ffmpeg.FullName) -ForegroundColor Green
`;
  }
  async function exportHyperframesProject() {
    if (!window.JSZip) throw new Error('JSZip još nije učitan. Klikni Osveži status alata i pokušaj ponovo.');
    if (!Array.isArray(state.scenes) || !state.scenes.length) throw new Error('Nema storyboarda. Najpre završi Korak 4.');
    const zip = new window.JSZip();
    const { width, height } = dimensionsForProject();
    const fps = clampNumber(state.settings?.renderFps || 24, 15, 60) || 24;
    const duration = Math.max(Number(state.audio?.duration) || 0, ...state.scenes.map(scene => Number(scene.end) || (Number(scene.start) + sceneDuration(scene))));
    const manifest = {
      formatVersion: 'MSS-HYPERFRAMES-15.4',
      createdAt: new Date().toISOString(),
      projectId: state.projectId,
      songTitle: state.songTitle || state.name,
      artistName: state.artistName,
      width, height, fps, duration,
      scenes: [], captions: [], audioPath: ''
    };
    const audioBlob = await getAsset(`audio:${state.projectId}`);
    if (audioBlob) {
      const ext = blobExtension(audioBlob, 'mp3');
      manifest.audioPath = `assets/pesma.${ext}`;
      zip.file(manifest.audioPath, audioBlob, { binary: true, compression: 'STORE' });
    }
    for (let index = 0; index < state.scenes.length; index += 1) {
      const scene = state.scenes[index];
      const number = index + 1;
      let assetType = 'placeholder';
      let assetPath = '';
      const videoId = state.videoAssetIds?.[scene.id];
      const imageId = state.imageAssetIds?.[scene.id];
      const videoBlob = videoId ? await getAsset(videoId) : null;
      const imageBlob = !videoBlob && imageId ? await getAsset(imageId) : null;
      if (videoBlob) {
        assetType = 'video';
        assetPath = `assets/scena-${String(number).padStart(3, '0')}.${blobExtension(videoBlob, 'webm')}`;
        zip.file(assetPath, videoBlob, { binary: true, compression: 'STORE' });
      } else if (imageBlob) {
        assetType = 'image';
        assetPath = `assets/scena-${String(number).padStart(3, '0')}.${blobExtension(imageBlob, 'webp')}`;
        zip.file(assetPath, imageBlob, { binary: true, compression: 'STORE' });
      }
      manifest.scenes.push({
        number,
        id: scene.id,
        start: Math.max(0, Number(scene.start) || 0),
        duration: sceneDuration(scene, state.sceneDuration || 5),
        section: scene.section || '', sceneTitle: scene.sceneTitle || '', lyric: scene.lyric || '', description: scene.description || '',
        location: scene.location || '', shot: scene.shot || '', camera: scene.camera || '', transitionIn: scene.transitionIn || '', transitionOut: scene.transitionOut || '',
        assetType, assetPath
      });
    }
    const captionItems = Array.isArray(state.captions?.items) ? state.captions.items : [];
    manifest.captions = captionItems.map(item => ({ start: Math.max(0, Number(item.start) || 0), duration: Math.max(0.2, Number(item.end) - Number(item.start)), text: item.text || '' })).filter(item => item.text);
    zip.file('index.html', buildHyperframesHtml(manifest));
    zip.file('meta.json', JSON.stringify({ duration, width, height, fps }, null, 2));
    zip.file('mss-manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('STORYBOARD.md', buildStoryboardMarkdown(manifest));
    zip.file('POKRENI HYPERFRAMES PROJEKAT.cmd', hyperframesLauncherText());
    zip.file('bootstrap-node.ps1', hyperframesNodeBootstrapText());
    zip.file('bootstrap-ffmpeg.ps1', hyperframesFfmpegBootstrapText());
    zip.file('PROCITAJ PRVO.txt', [
      'MUZICKI SPOT STUDIO 15.4 - HYPERFRAMES PROJEKAT',
      '',
      '1. Raspakuj ceo ZIP.',
      '2. Pokreni samo: POKRENI HYPERFRAMES PROJEKAT.cmd',
      '   Ako Node.js ili FFmpeg nedostaju, isti CMD ih automatski preuzima i proverava.',
      '3. Za slabiji PC prvo izaberi draft render i workers 1.',
      '4. Prvi put npx preuzima fiksiranu HyperFrames CLI verziju 0.7.62 sa npm-a.',
      '5. Scene bez slike ili klipa ostaju kao jasno oznaceni placeholderi.',
      '',
      `Sadrzaj: ${manifest.scenes.filter(item => item.assetType === 'video').length} video klipova, ${manifest.scenes.filter(item => item.assetType === 'image').length} slika, ${manifest.scenes.filter(item => item.assetType === 'placeholder').length} placeholder scena, ${manifest.captions.length} titlova.`
    ].join('\r\n'));
    const report = byId('hyperframesReport');
    if (report) report.textContent = 'Pakujem projekat bez kompresovanja velikih video fajlova...';
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, metadata => {
      if (report) report.textContent = `Pakovanje: ${Math.round(metadata.percent)}% — ${metadata.currentFile || ''}`;
    });
    downloadBlob(blob, `${safeName(state.songTitle || state.name)}-HYPERFRAMES-PROJEKAT.zip`);
    if (report) report.textContent = [`HYPERFRAMES ZIP JE NAPRAVLJEN`, `Veličina: ${(blob.size / 1024 / 1024).toFixed(1)} MB`, `Scene: ${manifest.scenes.length}`, `Video klipovi: ${manifest.scenes.filter(item => item.assetType === 'video').length}`, `Slike: ${manifest.scenes.filter(item => item.assetType === 'image').length}`, `Placeholderi: ${manifest.scenes.filter(item => item.assetType === 'placeholder').length}`, `Titlovi: ${manifest.captions.length}`].join('\n');
    notify('HyperFrames projekat je izvezen.');
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function videoSeek(video, seconds) {
    return new Promise((resolve, reject) => {
      const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.02));
      if (video.readyState >= 2 && Math.abs(Number(video.currentTime || 0) - target) < 0.01) {
        requestAnimationFrame(() => resolve());
        return;
      }
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Video nije odgovorio tokom analize.')); }, 10000);
      const cleanup = () => { clearTimeout(timeout); video.removeEventListener('seeked', done); video.removeEventListener('error', failed); };
      const done = () => { cleanup(); requestAnimationFrame(() => resolve()); };
      const failed = () => { cleanup(); reject(new Error('Browser ne može da pročita ovaj video format.')); };
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', failed, { once: true });
      try { video.currentTime = target; } catch (error) { cleanup(); reject(error); }
    });
  }
  function waitMetadata(video) {
    return new Promise((resolve, reject) => {
      if (Number.isFinite(video.duration) && video.duration > 0) return resolve();
      const timeout = setTimeout(() => reject(new Error('Nije moguće pročitati trajanje videa.')), 15000);
      video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve(); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video format nije podržan u browseru.')); }, { once: true });
    });
  }
  function frameMetrics(data, previous) {
    let brightness = 0, red = 0, green = 0, blue = 0, difference = 0, points = 0;
    for (let index = 0; index < data.length; index += 16) {
      const r = data[index], g = data[index + 1], b = data[index + 2];
      const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      brightness += gray; red += r; green += g; blue += b;
      if (previous) {
        const prevGray = (previous[index] * 0.299 + previous[index + 1] * 0.587 + previous[index + 2] * 0.114) / 255;
        difference += Math.abs(gray - prevGray);
      }
      points += 1;
    }
    return {
      brightness: points ? brightness / points : 0,
      rgb: points ? [Math.round(red / points), Math.round(green / points), Math.round(blue / points)] : [0, 0, 0],
      difference: previous && points ? difference / points : 0
    };
  }
  function scenePaceLabel(average) {
    if (average <= 2.2) return 'veoma brza montaža';
    if (average <= 3.8) return 'brza montaža';
    if (average <= 6) return 'umerena montaža';
    if (average <= 9) return 'spora filmska montaža';
    return 'veoma dugi kadrovi';
  }
  let latestReferenceAnalysis = null;
  async function analyzeReferenceVideo() {
    const file = byId('referenceVideoInput')?.files?.[0];
    if (!file) throw new Error('Izaberi MP4 ili WebM fajl.');
    const button = byId('analyzeReferenceVideoBtn');
    const report = byId('referenceAnalysisReport');
    const progress = byId('referenceAnalysisProgress');
    button.disabled = true;
    report.textContent = 'Učitavam video...';
    progress.style.width = '1%';
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto'; video.muted = true; video.playsInline = true; video.src = url;
    try {
      await waitMetadata(video);
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Trajanje videa nije ispravno.');
      const maxSamples = Number(byId('referenceMaxSamples')?.value || 240);
      const sampleCount = Math.max(30, Math.min(maxSamples, Math.ceil(duration / 0.35)));
      const step = duration / sampleCount;
      const sensitivity = Number(byId('referenceSensitivity')?.value || 2.5);
      const minScene = Number(byId('referenceMinScene')?.value || 1.5);
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const samples = [];
      let previous = null;
      for (let index = 0; index <= sampleCount; index += 1) {
        const when = Math.min(duration - 0.03, index * step);
        await videoSeek(video, Math.max(0, when));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const metrics = frameMetrics(pixels, previous);
        samples.push({ time: when, ...metrics });
        previous = new Uint8ClampedArray(pixels);
        const pct = Math.round(index / sampleCount * 80);
        progress.style.width = `${pct}%`;
        report.textContent = `Čitam kadar ${index + 1}/${sampleCount + 1} — ${when.toFixed(1)} s`;
        if (index % 15 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const differences = samples.slice(1).map(item => item.difference);
      const med = median(differences);
      const deviations = differences.map(value => Math.abs(value - med));
      const mad = median(deviations) || 0.01;
      const threshold = Math.max(0.085, med + sensitivity * mad);
      const cuts = [];
      let lastCut = 0;
      for (const sample of samples.slice(1)) {
        if (sample.difference >= threshold && sample.time - lastCut >= minScene) {
          cuts.push({ time: sample.time, score: sample.difference });
          lastCut = sample.time;
        }
      }
      const boundaries = [0, ...cuts.map(item => item.time), duration].sort((a, b) => a - b);
      const scenes = [];
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const start = boundaries[index], end = boundaries[index + 1];
        if (end - start < 0.1) continue;
        const inScene = samples.filter(sample => sample.time >= start && sample.time < end);
        const averageBrightness = inScene.length ? inScene.reduce((sum, item) => sum + item.brightness, 0) / inScene.length : 0;
        const rgb = inScene.length ? inScene.reduce((acc, item) => acc.map((value, channel) => value + item.rgb[channel]), [0, 0, 0]).map(value => Math.round(value / inScene.length)) : [0, 0, 0];
        scenes.push({ number: scenes.length + 1, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), duration: Number((end - start).toFixed(3)), averageBrightness: Number(averageBrightness.toFixed(3)), averageRgb: rgb });
      }
      const durations = scenes.map(scene => scene.duration);
      const avgDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : duration;
      const brightSamples = samples.filter(item => item.brightness >= 0.5).length;
      latestReferenceAnalysis = {
        version: 'MSS-REFERENCE-ANALYSIS-15.4',
        engine: 'Browser LITE analiza po principu content-difference scene detection',
        fileName: file.name,
        fileSizeBytes: file.size,
        fileType: file.type,
        analyzedAt: new Date().toISOString(),
        duration: Number(duration.toFixed(3)),
        width: video.videoWidth,
        height: video.videoHeight,
        sampleCount: samples.length,
        sampleInterval: Number(step.toFixed(3)),
        threshold: Number(threshold.toFixed(5)),
        sceneCount: scenes.length,
        averageSceneDuration: Number(avgDuration.toFixed(3)),
        medianSceneDuration: Number(median(durations).toFixed(3)),
        shortestSceneDuration: Number((Math.min(...durations) || 0).toFixed(3)),
        longestSceneDuration: Number((Math.max(...durations) || 0).toFixed(3)),
        paceLabel: scenePaceLabel(avgDuration),
        brightFrameRatio: Number((brightSamples / Math.max(1, samples.length)).toFixed(3)),
        darkFrameRatio: Number((1 - brightSamples / Math.max(1, samples.length)).toFixed(3)),
        cutScores: cuts.map(item => ({ time: Number(item.time.toFixed(3)), score: Number(item.score.toFixed(5)) })),
        scenes
      };
      ensureAdvancedState();
      state.research.referenceVideoAnalyses = [latestReferenceAnalysis, ...state.research.referenceVideoAnalyses.filter(item => item.fileName !== file.name)].slice(0, 20);
      if (typeof persistState === 'function') persistState(false, false);
      progress.style.width = '100%';
      report.textContent = [
        `ANALIZA JE ZAVRŠENA — ${file.name}`,
        `Trajanje: ${duration.toFixed(1)} s • ${video.videoWidth}×${video.videoHeight}`,
        `Otkriveno scena: ${scenes.length}`,
        `Prosečno trajanje kadra: ${avgDuration.toFixed(2)} s — ${scenePaceLabel(avgDuration)}`,
        `Medijana: ${median(durations).toFixed(2)} s`,
        `Najkraći / najduži kadar: ${(Math.min(...durations) || 0).toFixed(2)} / ${(Math.max(...durations) || 0).toFixed(2)} s`,
        `Svetli kadrovi: ${Math.round(latestReferenceAnalysis.brightFrameRatio * 100)}%`,
        `Tamni kadrovi: ${Math.round(latestReferenceAnalysis.darkFrameRatio * 100)}%`,
        '',
        'Rezultat je dodat u research.referenceVideoAnalyses i privatni GPT ga dobija u sledećem Koraku 3.'
      ].join('\n');
      byId('downloadReferenceAnalysisBtn').disabled = false;
      notify(`Referentni spot je analiziran: ${scenes.length} scena.`);
    } finally {
      button.disabled = false;
      URL.revokeObjectURL(url);
      video.removeAttribute('src'); video.load();
    }
  }
  function downloadReferenceAnalysis() {
    if (!latestReferenceAnalysis) return notify('Najpre analiziraj video.');
    downloadBlob(new Blob([JSON.stringify(latestReferenceAnalysis, null, 2)], { type: 'application/json;charset=utf-8' }), `${safeName(latestReferenceAnalysis.fileName)}-ANALIZA-SCENA.json`);
  }

  function providerKey() { return byId('externalProviderType')?.value || 'librechat'; }
  function populateProviderForm() {
    if (!moduleStatus?.providers || !byId('externalProviderType')) return;
    const item = moduleStatus.providers[providerKey()] || {};
    byId('externalProviderUrl').value = item.baseUrl || '';
    byId('externalProviderModel').value = item.model || '';
    byId('externalProviderKey').value = '';
    byId('externalProviderKey').placeholder = item.hasApiKey ? 'Ključ je sačuvan — ostavi prazno da ga zadržiš' : 'Opciono';
    byId('externalProviderEnabled').checked = item.enabled === true;
    byId('externalProviderReport').textContent = item.note || 'Opcioni servis.';
  }
  async function saveProvider() {
    const key = providerKey();
    const payload = {
      enabled: byId('externalProviderEnabled').checked,
      baseUrl: byId('externalProviderUrl').value,
      model: byId('externalProviderModel').value,
      apiKey: byId('externalProviderKey').value
    };
    const data = await fetchJson('/api/modules/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: key, config: payload }) });
    moduleStatus.providers[key] = data.provider;
    populateProviderForm();
    byId('externalProviderReport').textContent = 'Podešavanje je sačuvano šifrovano. Servis nije postao deo ChatGPT Plus pretplate.';
    notify('Opcioni provider je sačuvan.');
  }
  async function testProvider() {
    const key = providerKey();
    byId('externalProviderReport').textContent = 'Testiram dostupnost servisa...';
    const data = await fetchJson('/api/modules/providers/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: key }) });
    byId('externalProviderReport').textContent = data.ok
      ? `VEZA POSTOJI\nHTTP: ${data.status} ${data.statusText || ''}\nVreme: ${data.elapsedMs} ms\nAdresa: ${data.finalUrl || ''}\n${data.message || ''}`
      : `VEZA NIJE USPELA\n${data.error || data.message || 'Nepoznata greška.'}`;
  }
  async function launchInstaller(moduleName) {
    const data = await fetchJson('/api/modules/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: moduleName }) });
    notify(data.launched ? 'Instalacioni prozor je otvoren.' : (data.message || 'Skripta je pripremljena.'));
  }

  function bindEvents() {
    byId('exportHyperframesBtn')?.addEventListener('click', () => exportHyperframesProject().catch(error => notify(error.message)));
    byId('installHyperframesBtn')?.addEventListener('click', () => launchInstaller('hyperframes').catch(error => notify(error.message)));
    byId('installSceneDetectBtn')?.addEventListener('click', () => launchInstaller('pyscenedetect').catch(error => notify(error.message)));
    byId('analyzeReferenceVideoBtn')?.addEventListener('click', () => analyzeReferenceVideo().catch(error => { byId('referenceAnalysisReport').textContent = `GREŠKA: ${error.message}`; byId('referenceAnalysisProgress').style.width = '0%'; notify(error.message); }));
    byId('downloadReferenceAnalysisBtn')?.addEventListener('click', downloadReferenceAnalysis);
    byId('externalProviderType')?.addEventListener('change', populateProviderForm);
    byId('saveExternalProviderBtn')?.addEventListener('click', () => saveProvider().catch(error => { byId('externalProviderReport').textContent = error.message; notify(error.message); }));
    byId('testExternalProviderBtn')?.addEventListener('click', () => testProvider().catch(error => { byId('externalProviderReport').textContent = error.message; notify(error.message); }));
    byId('refreshModulesBtn')?.addEventListener('click', () => refreshModuleStatus(true));
  }

  function init() {
    insertModuleCenter();
    ensureAdvancedState();
    bindEvents();
    refreshModuleStatus(false);
    refreshLocalToolsList();
    window.MSSGitHubModules = {
      version: MODULE_VERSION,
      refreshModuleStatus,
      exportHyperframesProject,
      analyzeReferenceVideo,
      buildHyperframesHtml
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
