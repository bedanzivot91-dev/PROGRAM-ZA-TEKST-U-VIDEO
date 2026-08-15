$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot=$PSScriptRoot
$AppDataRuntime=Join-Path $env:APPDATA 'Muzicki Spot Studio Free\runtime'
if($env:MSS_TOOLS_DIR -and (Test-Path $env:MSS_TOOLS_DIR)){$InstallRoot=$env:MSS_TOOLS_DIR}
elseif(Test-Path $AppDataRuntime){$InstallRoot=$AppDataRuntime}
$exe=Get-ChildItem (Join-Path $InstallRoot 'realesrgan-ncnn-vulkan') -Recurse -Filter 'realesrgan-ncnn-vulkan.exe' -ErrorAction SilentlyContinue|Select-Object -First 1
if(-not $exe){throw 'Najpre pokreni INSTALIRAJ-REAL-ESRGAN-LITE.ps1'}
$dialog=New-Object Windows.Forms.OpenFileDialog; $dialog.Filter='Slike|*.png;*.jpg;*.jpeg;*.webp'; $dialog.Multiselect=$true
if($dialog.ShowDialog() -ne 'OK'){exit}
foreach($input in $dialog.FileNames){
  $output=Join-Path ([IO.Path]::GetDirectoryName($input)) ([IO.Path]::GetFileNameWithoutExtension($input)+'-UPSCALE-2X.png')
  Write-Host "Obradjujem: $input" -ForegroundColor Cyan
  & $exe.FullName -i $input -o $output -n realesrgan-x4plus -s 2 -t 128 -f png
  if($LASTEXITCODE -ne 0){Write-Host "Nije uspelo: $input" -ForegroundColor Red}else{Write-Host "Gotovo: $output" -ForegroundColor Green}
}
Read-Host 'Pritisni Enter za kraj'
