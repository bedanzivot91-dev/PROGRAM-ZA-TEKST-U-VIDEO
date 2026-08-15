@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Instalacija Muzicki Spot Studio Free

set "INSTALLER=%~dp0INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe"
set "BUILDER=%~dp0SASTAVI-PROGRAM.bat"

if exist "%INSTALLER%" (
  echo Pokrecem installer...
  start "" /wait "%INSTALLER%"
  exit /b %ERRORLEVEL%
)

if exist "%BUILDER%" (
  call "%BUILDER%"
  exit /b %ERRORLEVEL%
)

echo GRESKA: Installer nije pronadjen.
echo Ocekivana putanja: %INSTALLER%
pause
exit /b 1
