$ErrorActionPreference = 'Stop'
$InstallRoot = if ($env:MSS_TOOLS_DIR) { $env:MSS_TOOLS_DIR } else { Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime' }
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$Venv = Join-Path $InstallRoot 'pyscenedetect-venv'
Write-Host ''
Write-Host 'MUZICKI SPOT STUDIO - PYSCENEDETECT LITE' -ForegroundColor Cyan
Write-Host 'Program vec ima browser LITE analizu bez instalacije.' -ForegroundColor Yellow
Write-Host 'Ova opcija dodaje zvanicni PySceneDetect za precizniju CPU analizu.'
$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $python = @('py','-3') }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $python = @('python') }
elseif (Get-Command python3 -ErrorAction SilentlyContinue) { $python = @('python3') }
else { throw 'Python 3 nije pronadjen.' }
if (-not (Test-Path $Venv)) {
  if ($python.Count -eq 2) { & $python[0] $python[1] -m venv $Venv }
  else { & $python[0] -m venv $Venv }
}
$VenvPython = Join-Path $Venv 'Scripts\python.exe'
if (-not (Test-Path $VenvPython)) { throw 'Virtuelno Python okruzenje nije napravljeno.' }
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install "scenedetect[opencv]"
if ($LASTEXITCODE -ne 0) { throw 'PySceneDetect instalacija nije uspela.' }
& $VenvPython -c "import scenedetect; print('PySceneDetect', scenedetect.__version__, 'je instaliran.')"
Read-Host 'Pritisni Enter za zatvaranje'
