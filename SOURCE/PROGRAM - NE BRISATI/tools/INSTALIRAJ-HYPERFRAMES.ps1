$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
$InstallRoot = if ($env:MSS_TOOLS_DIR) { $env:MSS_TOOLS_DIR } else { $AppRoot }
$RuntimeRoot = if ($env:MSS_TOOLS_DIR) { $env:MSS_TOOLS_DIR } else { Join-Path $AppRoot 'runtime' }
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$Engine = Join-Path $InstallRoot 'engines\hyperframes'
$PortableNode = Join-Path $RuntimeRoot 'node\node.exe'
$Bootstrap = Join-Path $AppRoot 'bootstrap-node.ps1'

Write-Host ''
Write-Host 'MUZICKI SPOT STUDIO - HYPERFRAMES INSTALACIJA' -ForegroundColor Cyan
Write-Host 'HyperFrames zahteva Node.js 22+ i FFmpeg.' -ForegroundColor Yellow

function Get-NodeMajor([string]$NodeExe) {
  try {
    $version = & $NodeExe --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $version -match '^v([0-9]+)\.') { return [int]$Matches[1] }
  } catch {}
  return 0
}

$NodeExe = $null
$NpmExe = $null
if ((Test-Path $PortableNode) -and (Get-NodeMajor $PortableNode) -ge 22) {
  $NodeExe = $PortableNode
  $NpmExe = Join-Path (Split-Path -Parent $PortableNode) 'npm.cmd'
} else {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode -and (Get-NodeMajor $systemNode.Source) -ge 22) {
    $NodeExe = $systemNode.Source
    $systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($systemNpm) { $NpmExe = $systemNpm.Source }
  }
}

if (-not $NodeExe) {
  if (-not (Test-Path $Bootstrap)) { throw 'Node.js 22+ nije pronadjen, a bootstrap-node.ps1 nedostaje.' }
  Write-Host 'Node.js 22+ nije pronadjen. Preuzimam zvanicni portable Node.js 24 LTS...' -ForegroundColor Yellow
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Bootstrap
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $PortableNode)) { throw 'Portable Node.js nije preuzet.' }
  $NodeExe = $PortableNode
  $NpmExe = Join-Path (Split-Path -Parent $PortableNode) 'npm.cmd'
}

if ((Get-NodeMajor $NodeExe) -lt 22) { throw "Potreban je Node.js 22 ili noviji. Pronadjeno: $(& $NodeExe --version)" }
if (-not $NpmExe -or -not (Test-Path $NpmExe)) {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCommand) { $NpmExe = $npmCommand.Source }
}
if (-not $NpmExe -or -not (Test-Path $NpmExe)) { throw 'npm.cmd nije pronadjen uz Node.js.' }
if (-not (Test-Path $Engine)) { New-Item -ItemType Directory -Path $Engine -Force | Out-Null }

Write-Host ('Koristim Node.js: ' + (& $NodeExe --version)) -ForegroundColor DarkGray
Push-Location $Engine
try {
  Write-Host 'Preuzimam zvanicni HyperFrames npm paket...' -ForegroundColor Green
  & $NpmExe install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install nije uspeo.' }
  Write-Host ''
  Write-Host 'HYPERFRAMES JE INSTALIRAN.' -ForegroundColor Green
  Write-Host 'U Studiju izvezi HyperFrames ZIP, raspakuj ga i pokreni njegov jedini CMD fajl.'
} finally { Pop-Location }
Read-Host 'Pritisni Enter za zatvaranje'
