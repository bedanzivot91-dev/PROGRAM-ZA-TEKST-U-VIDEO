$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot=$PSScriptRoot
$AppDataRuntime=Join-Path $env:APPDATA 'Muzicki Spot Studio Free\runtime'
if($env:MSS_TOOLS_DIR -and (Test-Path $env:MSS_TOOLS_DIR)){$InstallRoot=$env:MSS_TOOLS_DIR}
elseif(Test-Path $AppDataRuntime){$InstallRoot=$AppDataRuntime}
$rife=Get-ChildItem (Join-Path $InstallRoot 'rife-ncnn-vulkan') -Recurse -Filter 'rife-ncnn-vulkan.exe' -ErrorAction SilentlyContinue|Select-Object -First 1
if(-not $rife){throw 'Najpre pokreni INSTALIRAJ-RIFE-LITE.ps1'}
$ffmpeg=Get-ChildItem (Join-Path $InstallRoot 'ffmpeg-portable') -Recurse -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue|Select-Object -First 1
$ffprobe=Get-ChildItem (Join-Path $InstallRoot 'ffmpeg-portable') -Recurse -Filter 'ffprobe.exe' -ErrorAction SilentlyContinue|Select-Object -First 1
if(-not $ffmpeg){$ffmpeg=Get-Command ffmpeg.exe -ErrorAction SilentlyContinue}
if(-not $ffprobe){$ffprobe=Get-Command ffprobe.exe -ErrorAction SilentlyContinue}
if(-not $ffmpeg -or -not $ffprobe){throw 'Najpre pokreni INSTALIRAJ-FFMPEG-LITE.ps1.'}
$ffmpegPath = if($ffmpeg.FullName){$ffmpeg.FullName}elseif($ffmpeg.Source){$ffmpeg.Source}else{[string]$ffmpeg}
$ffprobePath = if($ffprobe.FullName){$ffprobe.FullName}elseif($ffprobe.Source){$ffprobe.Source}else{[string]$ffprobe}
$dialog=New-Object Windows.Forms.OpenFileDialog; $dialog.Filter='Video|*.mp4;*.webm;*.mov;*.mkv'
if($dialog.ShowDialog() -ne 'OK'){exit}
$input=$dialog.FileName; $base=[IO.Path]::GetFileNameWithoutExtension($input); $dir=[IO.Path]::GetDirectoryName($input)
$work=Join-Path $env:TEMP ('MSS-RIFE-'+[Guid]::NewGuid().ToString('N')); $inFrames=Join-Path $work 'in'; $outFrames=Join-Path $work 'out'; New-Item -ItemType Directory -Force $inFrames,$outFrames|Out-Null
try{
  $fpsText=& $ffprobePath -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=nw=1:nk=1 $input
  $parts=$fpsText.Trim().Split('/'); $fps=if($parts.Count-eq 2){[double]$parts[0]/[double]$parts[1]}else{[double]$fpsText}; if($fps-le 0){$fps=24}
  Write-Host 'Izdvajam frejmove...' -ForegroundColor Cyan; & $ffmpegPath -y -i $input -vf 'scale=min(1280,iw):-2' (Join-Path $inFrames '%08d.png')
  $count=(Get-ChildItem $inFrames -Filter '*.png').Count; if($count-lt 2){throw 'Nema dovoljno frejmova.'}; $outputCount=$count*2-1
  Write-Host "RIFE interpolacija: $count -> $outputCount frejmova. Ovo moze dugo trajati." -ForegroundColor Yellow
  & $rife.FullName -i $inFrames -o $outFrames -n $outputCount -m rife-v4.6 -f '%08d.png'
  if($LASTEXITCODE-ne 0){throw 'RIFE nije zavrsio obradu.'}
  $output=Join-Path $dir ($base+'-RIFE-2X.mp4'); $newFps=$fps*2
  & $ffmpegPath -y -framerate $newFps -i (Join-Path $outFrames '%08d.png') -i $input -map 0:v:0 -map 1:a? -c:v libx264 -crf 18 -preset slow -c:a aac -shortest $output
  Write-Host "Gotovo: $output" -ForegroundColor Green
}finally{Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}
Read-Host 'Pritisni Enter za kraj'
