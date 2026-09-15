@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PORTABLE_DIR=%~dp0PORTABLE"
set "PART1="
for /f "delims=" %%F in ('dir /b /a:-d /o:-n "%PORTABLE_DIR%\Muzicki-Spot-Studio-Free-Portable-v*.exe.part001" 2^>nul') do if not defined PART1 set "PART1=%PORTABLE_DIR%\%%F"

if not defined PART1 goto missing
set "PORTABLE=!PART1:~0,-8!"

if exist "!PORTABLE!" (
  echo Portable program vec postoji: !PORTABLE!
  start "" "!PORTABLE!"
  exit /b 0
)

echo Sastavljam portable program iz svih dostupnih delova...
set "MSS_PART_BASE=!PORTABLE!"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$base=$env:MSS_PART_BASE; $parts=Get-ChildItem -LiteralPath (Split-Path $base) -Filter ((Split-Path $base -Leaf)+'.part*') | Sort-Object Name; if(-not $parts -or $parts[0].Name -notmatch '\.part001$'){throw 'Nedostaje part001.'}; for($i=0;$i -lt $parts.Count;$i++){ $expected=('part{0:d3}' -f ($i+1)); if($parts[$i].Name -notmatch ('\.'+[regex]::Escape($expected)+'$')){throw ('Nedostaje ili je pogresno sortiran deo '+$expected)}}; $out=[IO.File]::Open($base,[IO.FileMode]::Create,[IO.FileAccess]::Write); try{foreach($p in $parts){$input=[IO.File]::OpenRead($p.FullName); try{$input.CopyTo($out)} finally{$input.Dispose()}}} finally{$out.Dispose()}; if((Get-Item -LiteralPath $base).Length -le 0){throw 'Sastavljeni portable EXE je prazan.'}"
if errorlevel 1 goto fail

if not exist "!PORTABLE!" goto fail
echo Portable program je sastavljen: !PORTABLE!
start "" "!PORTABLE!"
exit /b 0

:missing
echo GRESKA: Nije pronadjen nijedan portable part001 u folderu PORTABLE.
echo Preuzmi sve delove iste verzije programa.
pause
exit /b 1

:fail
echo GRESKA: Portable program nije mogao bezbedno da se sastavi iz delova.
if exist "!PORTABLE!" del /q "!PORTABLE!" >nul 2>&1
pause
exit /b 1
