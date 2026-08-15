@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "PROGRAMDIR=%~dp0.."
set "DATA_DIR=%PROGRAMDIR%\data"
set "SAVED_PATH=%DATA_DIR%\comfyui-path.txt"
set "PORT_FILE=%DATA_DIR%\server-port.txt"
set "STUDIOPORT=4180"

if exist "%PORT_FILE%" set /p STUDIOPORT=<"%PORT_FILE%"
set "STUDIOORIGIN=http://127.0.0.1:%STUDIOPORT%"

if exist "%SAVED_PATH%" (
  set /p "COMFYROOT="<"%SAVED_PATH%"
  if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START
)

set "COMFYROOT=%~dp0..\..\ComfyUI_windows_portable"
if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START
set "COMFYROOT=%USERPROFILE%\Downloads\ComfyUI_windows_portable"
if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START
set "COMFYROOT=%USERPROFILE%\Desktop\ComfyUI_windows_portable"
if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START
set "COMFYROOT=C:\ComfyUI_windows_portable"
if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START
set "COMFYROOT=D:\ComfyUI_windows_portable"
if exist "%COMFYROOT%\python_embeded\python.exe" if exist "%COMFYROOT%\ComfyUI\main.py" goto START

echo.
echo ComfyUI portable nije automatski pronadjen.
echo Najlakse je da u programu otvoris karticu ALATI i kliknes IZABERI COMFYUI FOLDER.
echo Ili ovde nalepi punu putanju do foldera ComfyUI_windows_portable.
echo Primer: D:\AI\ComfyUI_windows_portable
set /p "COMFYROOT=Putanja: "
if not exist "%COMFYROOT%\python_embeded\python.exe" (
  echo.
  echo GRESKA: U toj fascikli nema python_embeded\python.exe
  pause
  exit /b 1
)
if not exist "%COMFYROOT%\ComfyUI\main.py" (
  echo.
  echo GRESKA: U toj fascikli nema ComfyUI\main.py
  pause
  exit /b 1
)

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
>"%SAVED_PATH%" echo %COMFYROOT%

:START
cd /d "%COMFYROOT%"
echo Pokrecem ComfyUI za Muzicki Spot Studio...
echo Dozvoljen je samo lokalni Studio: %STUDIOORIGIN%
echo Ne zatvaraj ovaj prozor dok generises AI video.
"%COMFYROOT%\python_embeded\python.exe" -s "%COMFYROOT%\ComfyUI\main.py" --windows-standalone-build --enable-cors-header "%STUDIOORIGIN%" --port 8188
pause
