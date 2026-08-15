$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$root=Join-Path $InstallRoot 'demucs-lite'
$venv=Join-Path $root 'venv'
Write-Host 'MUZICKI SPOT STUDIO - DEMUCS LITE (odvajanje vokala/instrumentala)' -ForegroundColor Cyan
Write-Host 'Ovo je veliki paket (PyTorch + Demucs), preuzimanje moze potrajati.' -ForegroundColor Yellow
Write-Host 'Na sporijem racunaru (npr. GTX 750 Ti) obrada radi na CPU-u i moze biti spora.' -ForegroundColor Yellow

$driveName=[IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)
$drive=Get-PSDrive -Name $driveName
if($drive.Free -lt 8GB){throw "Potrebno je najmanje 8 GB slobodnog prostora za PyTorch/Demucs. Trenutno: $([math]::Round($drive.Free/1GB,1)) GB."}

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
Write-Host 'Instaliram PyTorch (CPU verzija, najkompatibilnija sa slabijim GPU-ovima)...' -ForegroundColor Cyan
& $pip install torch --index-url https://download.pytorch.org/whl/cpu
if($LASTEXITCODE -ne 0){throw 'PyTorch instalacija nije uspela.'}
& $pip install demucs
if($LASTEXITCODE -ne 0){throw 'Demucs instalacija nije uspela.'}
Write-Host 'Demucs je instaliran (CPU rezim). Model ce se preuzeti automatski pri prvoj upotrebi.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
