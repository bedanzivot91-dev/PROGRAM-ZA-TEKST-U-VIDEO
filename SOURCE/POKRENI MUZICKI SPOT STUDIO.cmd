@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MUZICKI SPOT STUDIO FREE 15.3

set "PROGRAM_DIR=%~dp0PROGRAM - NE BRISATI"
set "PORTABLE_NODE=%PROGRAM_DIR%\runtime\node\node.exe"
set "NODE_BOOTSTRAP=%PROGRAM_DIR%\bootstrap-node.cmd"
set "LAUNCHER=%PROGRAM_DIR%\launcher.js"
set "DIAG=%~dp0DIJAGNOSTIKA-POKRETANJA.txt"
set "NODE_EXE="

cls
echo ============================================================
echo   MUZICKI SPOT STUDIO FREE 15.3
echo ============================================================
echo.

if not exist "%PROGRAM_DIR%" goto MISSING_FILES
if not exist "%LAUNCHER%" goto MISSING_FILES
if not exist "%PROGRAM_DIR%\server.js" goto MISSING_FILES
if not exist "%NODE_BOOTSTRAP%" goto MISSING_FILES

echo [1/4] Proveravam Node.js...
if exist "%PORTABLE_NODE%" (
  set "NODE_MAJOR="
  "%PORTABLE_NODE%" -p "parseInt(process.versions.node.split('.')[0],10)" >"%TEMP%\mss-node-major.txt" 2>nul
  if exist "%TEMP%\mss-node-major.txt" set /p NODE_MAJOR=<"%TEMP%\mss-node-major.txt"
  del /f /q "%TEMP%\mss-node-major.txt" >nul 2>&1
  if defined NODE_MAJOR if !NODE_MAJOR! GEQ 22 set "NODE_EXE=%PORTABLE_NODE%"
)

if not defined NODE_EXE (
  where node.exe >nul 2>&1
  if not errorlevel 1 (
    set "NODE_MAJOR="
    node.exe -p "parseInt(process.versions.node.split('.')[0],10)" >"%TEMP%\mss-node-major.txt" 2>nul
    if exist "%TEMP%\mss-node-major.txt" set /p NODE_MAJOR=<"%TEMP%\mss-node-major.txt"
    del /f /q "%TEMP%\mss-node-major.txt" >nul 2>&1
    if defined NODE_MAJOR if !NODE_MAJOR! GEQ 22 set "NODE_EXE=node.exe"
  )
)

if not defined NODE_EXE (
  echo       Node.js 22+ nije pronadjen. Pokrecem bezbednu CMD pripremu...
  call "%NODE_BOOTSTRAP%"
  if errorlevel 1 goto NODE_ERROR
  if exist "%PORTABLE_NODE%" set "NODE_EXE=%PORTABLE_NODE%"
)

if not defined NODE_EXE goto NODE_ERROR
"%NODE_EXE%" --version
if errorlevel 1 goto NODE_ERROR
echo       Node.js je spreman: %NODE_EXE%

echo [2/4] Proveravam glavne programske fajlove...
"%NODE_EXE%" --check "%PROGRAM_DIR%\server.js" >nul 2>&1
if errorlevel 1 goto START_ERROR
"%NODE_EXE%" --check "%LAUNCHER%" >nul 2>&1
if errorlevel 1 goto START_ERROR
echo       Glavni JavaScript fajlovi su ispravni.

echo [3/4] Pokrecem lokalni server...
"%NODE_EXE%" "%LAUNCHER%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto START_ERROR

echo [4/4] Program je pokrenut.
echo.
echo Ako se browser nije otvorio, dvoklikni: OTVORI PROGRAM.url
timeout /t 3 /nobreak >nul
exit /b 0

:MISSING_FILES
echo.
echo GRESKA: Nedostaju glavni programski fajlovi.
echo Raspakuj CEO ZIP u novi folder. Ne pokreci CMD direktno iz ZIP arhive.
goto FAIL_PAUSE

:NODE_ERROR
echo.
echo GRESKA: Node.js nije mogao da se pripremi.
echo Detaljan log: PROGRAM - NE BRISATI\runtime\node-bootstrap.log
goto FAIL_PAUSE

:START_ERROR
echo.
echo GRESKA: Lokalni server nije pokrenut.
echo Dijagnostika: %DIAG%
if exist "%DIAG%" start "" notepad.exe "%DIAG%"
goto FAIL_PAUSE

:FAIL_PAUSE
echo.
echo Program se nije pokrenuo. Prozor ostaje otvoren da bi video gresku.
pause
exit /b 1
