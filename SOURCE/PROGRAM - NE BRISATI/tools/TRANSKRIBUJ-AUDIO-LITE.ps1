$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot=$PSScriptRoot
$AppDataRuntime=Join-Path $env:APPDATA 'Muzicki Spot Studio Free\runtime'
if($env:MSS_TOOLS_DIR -and (Test-Path $env:MSS_TOOLS_DIR)){$InstallRoot=$env:MSS_TOOLS_DIR}
elseif(Test-Path $AppDataRuntime){$InstallRoot=$AppDataRuntime}
$venv=Join-Path $InstallRoot 'faster-whisper-lite\venv'; $python=Join-Path $venv 'Scripts\python.exe'
if(-not(Test-Path $python)){throw 'Najpre pokreni INSTALIRAJ-FASTER-WHISPER-LITE.ps1'}
$dialog=New-Object Windows.Forms.OpenFileDialog; $dialog.Filter='Audio|*.mp3;*.wav;*.m4a;*.flac;*.ogg;*.aac|Svi fajlovi|*.*'
if($dialog.ShowDialog() -ne 'OK'){exit}
$model=Read-Host 'Model [tiny/base] - za tvoj PC preporuka tiny'; if($model -notin @('tiny','base')){$model='tiny'}
$out=[IO.Path]::Combine([IO.Path]::GetDirectoryName($dialog.FileName),[IO.Path]::GetFileNameWithoutExtension($dialog.FileName)+'-WHISPER-WORDS.json')
& $python (Join-Path $PSScriptRoot 'faster-whisper-helper.py') $dialog.FileName --model $model --language sr --output $out
Write-Host "Gotovo: $out" -ForegroundColor Green
Write-Host 'U programu otvori Korak 7 i klikni Uvezi faster-whisper reci.' -ForegroundColor Cyan
Read-Host 'Pritisni Enter za kraj'
