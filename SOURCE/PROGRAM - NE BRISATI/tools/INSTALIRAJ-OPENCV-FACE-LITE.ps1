$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$root=Join-Path $InstallRoot 'opencv-face'
$venv=Join-Path $root 'venv'
Write-Host 'MUZICKI SPOT STUDIO - OPENCV FACE DETECTION' -ForegroundColor Cyan
Write-Host 'Lokalna detekcija lica za automatsko izbegavanje teksta preko lica.' -ForegroundColor Yellow

$driveName=[IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)
$drive=Get-PSDrive -Name $driveName
if($drive.Free -lt 1GB){throw "Potrebno je najmanje 1 GB slobodnog prostora. Trenutno: $([math]::Round($drive.Free/1GB,1)) GB."}

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
if(-not $pythonExe){throw 'Python 3.10, 3.11 ili 3.12 nije pronadjen. Instaliraj 64-bit Python sa python.org i ukljuci Add Python to PATH.'}

New-Item -ItemType Directory -Force -Path $root|Out-Null
if(-not(Test-Path $venv)){
  & $pythonExe @pythonPrefix -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Python virtualno okruzenje nije napravljeno.'}
}
$pip=Join-Path $venv 'Scripts\pip.exe'
$pythonVenv=Join-Path $venv 'Scripts\python.exe'
& $pip install --upgrade pip
if($LASTEXITCODE -ne 0){throw 'pip nadogradnja nije uspela.'}
& $pip install opencv-python-headless
if($LASTEXITCODE -ne 0){throw 'OpenCV instalacija nije uspela.'}
& $pythonVenv -c "import cv2, os; p=os.path.join(cv2.data.haarcascades,'haarcascade_frontalface_default.xml'); assert os.path.exists(p); print(cv2.__version__); print(p)"
if($LASTEXITCODE -ne 0){throw 'OpenCV je instaliran ali Haar face detector nije pronadjen.'}
Write-Host 'OpenCV face detection je instaliran i proveren.' -ForegroundColor Green
