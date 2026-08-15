@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "INSTALLER_DIR=%~dp0INSTALLER"
set "INSTALLER=%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe"
set "PART1=%INSTALLER%.part001"
set "PART12=%INSTALLER%.part012"

if exist "%INSTALLER%" (
  echo Installer vec postoji. Pokrecem instalaciju...
  start "" /wait "%INSTALLER%"
  exit /b %ERRORLEVEL%
)

if not exist "%PART1%" goto missing
if not exist "%PART12%" goto missing

echo Sastavljam installer iz delova...
copy /b /y "%INSTALLER%.part001"+"%INSTALLER%.part002"+"%INSTALLER%.part003"+"%INSTALLER%.part004"+"%INSTALLER%.part005"+"%INSTALLER%.part006"+"%INSTALLER%.part007"+"%INSTALLER%.part008"+"%INSTALLER%.part009"+"%INSTALLER%.part010"+"%INSTALLER%.part011"+"%INSTALLER%.part012" "%INSTALLER%" >nul
if errorlevel 1 goto fail

echo Installer je sastavljen. Pokrecem instalaciju...
start "" /wait "%INSTALLER%"
exit /b %ERRORLEVEL%

:missing
echo GRESKA: Nije pronadjen installer niti svi njegovi delovi.
echo Preuzmi kompletan paket i raspakuj ga pre pokretanja.
pause
exit /b 1

:fail
echo GRESKA: Installer nije mogao da se sastavi.
pause
exit /b 1
