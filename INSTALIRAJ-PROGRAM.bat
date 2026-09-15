@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Instalacija Muzicki Spot Studio Free

set "INSTALLER_DIR=%~dp0INSTALLER"
set "INSTALLER="
for /f "delims=" %%F in ('dir /b /a:-d /o:-n "%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v*.exe" 2^>nul') do if not defined INSTALLER set "INSTALLER=%INSTALLER_DIR%\%%F"

if defined INSTALLER (
  echo Pokrecem najnoviji pronadjeni installer:
  echo !INSTALLER!
  start "" /wait "!INSTALLER!"
  exit /b !ERRORLEVEL!
)

set "BUILDER=%~dp0SASTAVI-PROGRAM.bat"
if exist "!BUILDER!" (
  call "!BUILDER!"
  exit /b !ERRORLEVEL!
)

echo GRESKA: Installer niti skripta za sastavljanje nisu pronadjeni.
echo Ocekivan folder: !INSTALLER_DIR!
pause
exit /b 1
