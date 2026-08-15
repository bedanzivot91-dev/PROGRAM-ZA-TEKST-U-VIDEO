@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "RUNTIME=%~dp0runtime"
set "NODE_DIR=%RUNTIME%\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "ZIP=%RUNTIME%\node-v24.18.0-win-x64.zip"
set "EXTRACT=%RUNTIME%\node-extract"
set "LOG=%RUNTIME%\node-bootstrap.log"
set "URL=https://nodejs.org/download/release/v24.18.0/node-v24.18.0-win-x64.zip"
set "EXPECTED=0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821"

if not exist "%RUNTIME%" mkdir "%RUNTIME%" >nul 2>&1
>"%LOG%" echo [%date% %time%] Node bootstrap 15.3

call :LOG Proveravam postojeci portable Node.js...
if exist "%NODE_EXE%" (
  set "MAJOR="
  "%NODE_EXE%" -p "parseInt(process.versions.node.split('.')[0],10)" >"%TEMP%\mss-node-major.txt" 2>nul
  if exist "%TEMP%\mss-node-major.txt" set /p MAJOR=<"%TEMP%\mss-node-major.txt"
  del /f /q "%TEMP%\mss-node-major.txt" >nul 2>&1
  if defined MAJOR if !MAJOR! GEQ 22 (
    call :LOG Portable Node.js je vec spreman.
    exit /b 0
  )
)

if exist "%ZIP%" del /f /q "%ZIP%" >nul 2>&1
if exist "%EXTRACT%" rmdir /s /q "%EXTRACT%" >nul 2>&1
mkdir "%EXTRACT%" >nul 2>&1

call :LOG Preuzimam zvanicni Node.js 24.18.0 paket...
set "CURL_OK=0"
where curl.exe >nul 2>&1
if not errorlevel 1 (
  curl.exe -L --fail --retry 2 --retry-delay 2 --connect-timeout 20 --max-time 600 -o "%ZIP%" "%URL%" >>"%LOG%" 2>&1
  if not errorlevel 1 if exist "%ZIP%" for %%Z in ("%ZIP%") do if %%~zZ GEQ 10000000 set "CURL_OK=1"
)
if "!CURL_OK!"=="0" (
  if exist "%ZIP%" del /f /q "%ZIP%" >nul 2>&1
  call :LOG curl nije dostupan ili nije uspeo. Pokusavam Invoke-WebRequest...
  set "MSS_NODE_URL=%URL%"
  set "MSS_NODE_ZIP=%ZIP%"
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri $env:MSS_NODE_URL -OutFile $env:MSS_NODE_ZIP -TimeoutSec 600" >>"%LOG%" 2>&1
)
if not exist "%ZIP%" goto DOWNLOAD_ERROR
for %%Z in ("%ZIP%") do if %%~zZ LSS 10000000 goto DOWNLOAD_ERROR

call :LOG Proveravam SHA-256 paketa...
set "MSS_NODE_ZIP=%ZIP%"
set "ACTUAL="
for /f "usebackq delims=" %%H in (`powershell.exe -NoLogo -NoProfile -Command "(Get-FileHash -LiteralPath $env:MSS_NODE_ZIP -Algorithm SHA256).Hash.ToLowerInvariant()"`) do set "ACTUAL=%%H"
if not defined ACTUAL goto HASH_ERROR
if /I not "%EXPECTED%"=="!ACTUAL!" goto HASH_ERROR

call :LOG Raspakujem Node.js...
where tar.exe >nul 2>&1
if not errorlevel 1 (
  tar.exe -xf "%ZIP%" -C "%EXTRACT%" >>"%LOG%" 2>&1
) else (
  set "MSS_NODE_EXTRACT=%EXTRACT%"
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:MSS_NODE_ZIP -DestinationPath $env:MSS_NODE_EXTRACT -Force" >>"%LOG%" 2>&1
)

set "SOURCE="
for /d %%D in ("%EXTRACT%\node-v24.18.0-win-x64") do set "SOURCE=%%~fD"
if not defined SOURCE goto EXTRACT_ERROR
if not exist "!SOURCE!\node.exe" goto EXTRACT_ERROR

if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%" >nul 2>&1
mkdir "%NODE_DIR%" >nul 2>&1
xcopy "!SOURCE!\*" "%NODE_DIR%" /E /I /H /Y /Q >>"%LOG%" 2>&1
if errorlevel 1 goto COPY_ERROR
if not exist "%NODE_EXE%" goto COPY_ERROR

set "MAJOR="
"%NODE_EXE%" -p "parseInt(process.versions.node.split('.')[0],10)" >"%TEMP%\mss-node-major.txt" 2>nul
if exist "%TEMP%\mss-node-major.txt" set /p MAJOR=<"%TEMP%\mss-node-major.txt"
del /f /q "%TEMP%\mss-node-major.txt" >nul 2>&1
if not defined MAJOR goto COPY_ERROR
if !MAJOR! LSS 22 goto COPY_ERROR

rmdir /s /q "%EXTRACT%" >nul 2>&1
del /f /q "%ZIP%" >nul 2>&1
call :LOG Node.js je uspesno pripremljen.
exit /b 0

:DOWNLOAD_ERROR
call :LOG GRESKA: Node.js paket nije preuzet ili je nepotpun.
exit /b 1
:HASH_ERROR
call :LOG GRESKA: SHA-256 provera nije prosla. Dobijeno: !ACTUAL!
exit /b 1
:EXTRACT_ERROR
call :LOG GRESKA: Node.js paket nije pravilno raspakovan.
exit /b 1
:COPY_ERROR
call :LOG GRESKA: Node.js fajlovi nisu pravilno kopirani.
exit /b 1

:LOG
echo %*
>>"%LOG%" echo [%date% %time%] %*
exit /b 0
