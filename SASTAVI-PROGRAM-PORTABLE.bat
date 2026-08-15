@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORTABLE=PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe"

if exist "%PORTABLE%" (
  echo Portable program vec postoji. Pokrecem ga...
  start "" "%PORTABLE%"
  exit /b 0
)

if not exist "%PORTABLE%.part001" goto missing
if not exist "%PORTABLE%.part012" goto missing

echo Sastavljam portable program iz delova...
copy /b /y "%PORTABLE%.part001"+"%PORTABLE%.part002"+"%PORTABLE%.part003"+"%PORTABLE%.part004"+"%PORTABLE%.part005"+"%PORTABLE%.part006"+"%PORTABLE%.part007"+"%PORTABLE%.part008"+"%PORTABLE%.part009"+"%PORTABLE%.part010"+"%PORTABLE%.part011"+"%PORTABLE%.part012" "%PORTABLE%" >nul
if errorlevel 1 goto fail

start "" "%PORTABLE%"
exit /b 0

:missing
echo Greska: portable program nije pronadjen niti su svi delovi dostupni.
pause
exit /b 1

:fail
echo Greska pri sastavljanju portable programa.
pause
exit /b 1
