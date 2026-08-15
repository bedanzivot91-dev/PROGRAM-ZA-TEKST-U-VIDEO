@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part012" goto missing
copy /b /y "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part001"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part002"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part003"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part004"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part005"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part006"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part007"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part008"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part009"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part010"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part011"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part012" "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe" >nul
if errorlevel 1 goto fail
certutil -hashfile "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe" SHA256 | findstr /i "5a01b1aeb66c5b32f959c8d11ff90eeb5a79aa3f9176dbca207ddb0e6d1d1696" >nul
if errorlevel 1 goto checksum_fail
start "" "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe"
exit /b 0
:missing
echo Greska: nisu preuzeti svi delovi portable programa.
pause
exit /b 1
:checksum_fail
echo Greska: portable fajl je ostecen ili nepotpun.
pause
exit /b 1
:fail
echo Greska pri sastavljanju portable programa.
pause
exit /b 1
