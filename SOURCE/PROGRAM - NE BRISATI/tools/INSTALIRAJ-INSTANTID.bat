@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
for /f "usebackq delims=" %%V in (`powershell.exe -NoLogo -NoProfile -Command "$v=(Get-CimInstance Win32_VideoController|Measure-Object AdapterRAM -Maximum).Maximum; $n=Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue; if($n){try{$m=& $n.Source --query-gpu=memory.total --format=csv,noheader,nounits 2^>$null|Select-Object -First 1; if($m){$v=[double]$m*1MB}}catch{}}; [math]::Floor($v/1GB)"`) do set "VRAM=%%V"
if not defined VRAM set "VRAM=0"
if %VRAM% LSS 8 (
  echo.
  echo INSTALACIJA JE BLOKIRANA ZA OVAJ RACUNAR.
  echo InstantID + SDXL traze najmanje oko 8 GB VRAM-a, a ovaj PC ima %VRAM% GB.
  echo Koristi zakljucani identitet u ChatGPT Plus promptovima.
  echo.
  pause
  exit /b 21
)
echo Unesi punu putanju do ComfyUI foldera, na primer C:\AI\ComfyUI_windows_portable\ComfyUI
set /p COMFY=ComfyUI folder: 
if not exist "%COMFY%\custom_nodes" (echo Putanja nije ispravna.& pause & exit /b 1)
where git.exe >nul 2>nul || (echo Git nije pronadjen. Instaliraj Git for Windows.& pause & exit /b 2)
cd /d "%COMFY%\custom_nodes"
if not exist ComfyUI_InstantID git clone https://github.com/cubiq/ComfyUI_InstantID.git
cd /d "%COMFY%"
if exist "..\python_embeded\python.exe" (
  "..\python_embeded\python.exe" -m pip install -r custom_nodes\ComfyUI_InstantID\requirements.txt
  "..\python_embeded\python.exe" -m pip install onnxruntime insightface
) else (
  python -m pip install -r custom_nodes\ComfyUI_InstantID\requirements.txt
  python -m pip install onnxruntime insightface
)
echo Custom node je instaliran. Model-fajlovi se i dalje proveravaju kroz PREUZMI-INSTANTID-MODELE.ps1.
pause
