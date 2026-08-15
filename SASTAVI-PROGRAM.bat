@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "INSTALLER_DIR=%~dp0INSTALLER"
set "PORTABLE_DIR=%~dp0PORTABLE"
set "INSTALLER_EXE=%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe"
set "PORTABLE_EXE=%PORTABLE_DIR%\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe"

if not exist "%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part001" goto missing
if not exist "%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part012" goto missing
if not exist "%PORTABLE_DIR%\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part001" goto missing
if not exist "%PORTABLE_DIR%\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part012" goto missing

echo Sastavljam installer...
copy /b /y "%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part001"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part002"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part003"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part004"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part005"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part006"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part007"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part008"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part009"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part010"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part011"+"%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part012" "%INSTALLER_EXE%" >nul
if errorlevel 1 goto fail

certutil -hashfile "%INSTALLER_EXE%" SHA256 | findstr /i "7ddb14b3f2caff222d77a46ba0cfa735a4a6599b63b5ed05fbe22df689dfd964" >nul
if errorlevel 1 goto checksum_fail

echo Installer je sastavljen i provera je uspesna.
echo Pokrecem instalaciju...
start "" /wait "%INSTALLER_EXE%"
exit /b %errorlevel%

:missing
echo Greska: nisu preuzeti svi delovi programa.
echo Preuzmi ceo repozitorijum preko Code - Download ZIP i raspakuj ga, pa ponovo pokreni ovaj fajl.
pause
exit /b 1

:checksum_fail
echo Greska: installer je ostecen ili nije kompletno preuzet.
echo Ponovo preuzmi ceo repozitorijum i sve delove programa.
pause
exit /b 1

:fail
echo Greska pri sastavljanju installera.
pause
exit /b 1
