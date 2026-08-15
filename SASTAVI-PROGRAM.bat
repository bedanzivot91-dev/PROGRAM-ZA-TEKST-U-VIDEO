@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Sastavljam installer...
copy /b /y "INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part001"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part002"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part003"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part004"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part005"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part006"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part007"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part008"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part009"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part010"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part011"+"INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe.part012" "INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe" >nul
if errorlevel 1 goto fail
echo Sastavljam portable verziju...
copy /b /y "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part001"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part002"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part003"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part004"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part005"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part006"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part007"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part008"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part009"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part010"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part011"+"PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe.part012" "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe" >nul
if errorlevel 1 goto fail
echo.
echo Program je sastavljen.
echo SHA-256 installer:
certutil -hashfile "INSTALLER\Muzicki-Spot-Studio-Free-Setup-v15.6.0.exe" SHA256
echo SHA-256 portable:
certutil -hashfile "PORTABLE\Muzicki-Spot-Studio-Free-Portable-v15.6.0.exe" SHA256
echo.
echo Ocekivani zbirni su u CHECKSUMS-SHA256.txt
pause
exit /b 0
:fail
echo.
echo Greska: nisu pronadjeni svi delovi programa.
pause
exit /b 1
