$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$root=Join-Path $InstallRoot 'faster-whisper-lite'
$venv=Join-Path $root 'venv'
Write-Host 'Instalacija faster-whisper LITE: CPU int8, tiny/base. GTX 750 Ti se ne koristi.' -ForegroundColor Cyan

$driveName=[IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)
$drive=Get-PSDrive -Name $driveName
if($drive.Free -lt 5GB){throw "Potrebno je najmanje 5 GB slobodnog prostora. Trenutno: $([math]::Round($drive.Free/1GB,1)) GB."}

$pythonExe=''
$pythonPrefix=@()
$py=Get-Command py.exe -ErrorAction SilentlyContinue
if($py){
  foreach($selector in @('-3.12','-3.11','-3.10')){
    & $py.Source $selector -c "import sys; print(sys.version)" *> $null
    if($LASTEXITCODE -eq 0){$pythonExe=$py.Source; $pythonPrefix=@($selector); break}
  }
}
if(-not $pythonExe){
  $python=Get-Command python.exe -ErrorAction SilentlyContinue
  if($python){
    $version=& $python.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if($LASTEXITCODE -eq 0 -and $version -in @('3.10','3.11','3.12')){$pythonExe=$python.Source}
  }
}
if(-not $pythonExe){throw 'Python 3.10, 3.11 ili 3.12 nije pronadjen. Instaliraj 64-bit Python sa python.org, ukljuci Add Python to PATH, pa ponovo pokreni ovu skriptu.'}

New-Item -ItemType Directory -Force -Path $root|Out-Null
if(-not(Test-Path $venv)){& $pythonExe @pythonPrefix -m venv $venv; if($LASTEXITCODE -ne 0){throw 'Python virtualno okruzenje nije napravljeno.'}}
$pip=Join-Path $venv 'Scripts\pip.exe'
& $pip install --upgrade pip
if($LASTEXITCODE -ne 0){throw 'pip nadogradnja nije uspela.'}
& $pip install 'faster-whisper>=1.1,<2'
if($LASTEXITCODE -ne 0){throw 'faster-whisper instalacija nije uspela.'}
Write-Host 'Instalirano. Pokreni TRANSKRIBUJ-AUDIO-LITE.ps1.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
