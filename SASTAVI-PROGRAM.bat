@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "INSTALLER_DIR=%~dp0INSTALLER"
set "PART1="
for /f "delims=" %%F in ('dir /b /a:-d /o:-n "%INSTALLER_DIR%\Muzicki-Spot-Studio-Free-Setup-v*.exe.part001" 2^>nul') do if not defined PART1 set "PART1=%INSTALLER_DIR%\%%F"

if not defined PART1 goto missing
set "INSTALLER=!PART1:~0,-8!"

if exist "!INSTALLER!" (
  echo Installer vec postoji: !INSTALLER!
  echo Pokrecem instalaciju...
  start "" /wait "!INSTALLER!"
  exit /b !ERRORLEVEL!
)

echo Sastavljam installer iz svih dostupnih delova...
set "MSS_PART_BASE=!INSTALLER!"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$base=$env:MSS_PART_BASE; $parts=Get-ChildItem -LiteralPath (Split-Path $base) -Filter ((Split-Path $base -Leaf)+'.part*') | Sort-Object Name; if(-not $parts -or $parts[0].Name -notmatch '\.part001$'){throw 'Nedostaje part001.'}; for($i=0;$i -lt $parts.Count;$i++){ $expected=('part{0:d3}' -f ($i+1)); if($parts[$i].Name -notmatch ('\.'+[regex]::Escape($expected)+'$')){throw ('Nedostaje ili je pogresno sortiran deo '+$expected)}}; $out=[IO.File]::Open($base,[IO.FileMode]::Create,[IO.FileAccess]::Write); try{foreach($p in $parts){$input=[IO.File]::OpenRead($p.FullName); try{$input.CopyTo($out)} finally{$input.Dispose()}}} finally{$out.Dispose()}; if((Get-Item -LiteralPath $base).Length -le 0){throw 'Sastavljeni installer je prazan.'}"
if errorlevel 1 goto fail

if not exist "!INSTALLER!" goto fail
echo Installer je sastavljen: !INSTALLER!
echo Pokrecem instalaciju...
start "" /wait "!INSTALLER!"
exit /b !ERRORLEVEL!

:missing
echo GRESKA: Nije pronadjen nijedan installer part001 u folderu INSTALLER.
echo Preuzmi sve delove iste verzije programa.
pause
exit /b 1

:fail
echo GRESKA: Installer nije mogao bezbedno da se sastavi iz delova.
if exist "!INSTALLER!" del /q "!INSTALLER!" >nul 2>&1
pause
exit /b 1
