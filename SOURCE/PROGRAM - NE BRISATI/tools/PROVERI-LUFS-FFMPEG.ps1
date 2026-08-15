$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot=$PSScriptRoot
$AppDataRuntime=Join-Path $env:APPDATA 'Muzicki Spot Studio Free\runtime'
if($env:MSS_TOOLS_DIR -and (Test-Path $env:MSS_TOOLS_DIR)){$InstallRoot=$env:MSS_TOOLS_DIR}
elseif(Test-Path $AppDataRuntime){$InstallRoot=$AppDataRuntime}
$ffmpeg=Get-ChildItem (Join-Path $InstallRoot 'ffmpeg-portable') -Recurse -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue|Select-Object -First 1
if(-not $ffmpeg){$cmd=Get-Command ffmpeg.exe -ErrorAction SilentlyContinue; if($cmd){$ffmpeg=$cmd}}
if(-not $ffmpeg){throw 'Najpre pokreni INSTALIRAJ-FFMPEG-LITE.ps1.'}
$ffmpegPath = if($ffmpeg.FullName){$ffmpeg.FullName}elseif($ffmpeg.Source){$ffmpeg.Source}elseif($ffmpeg.Path){$ffmpeg.Path}else{[string]$ffmpeg}
$dialog=New-Object Windows.Forms.OpenFileDialog
$dialog.Filter='Audio i video|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.mp4;*.webm;*.mov;*.mkv|Svi fajlovi|*.*'
if($dialog.ShowDialog() -ne 'OK'){exit}
$input=$dialog.FileName
$out=Join-Path ([IO.Path]::GetDirectoryName($input)) ([IO.Path]::GetFileNameWithoutExtension($input)+'-LUFS-TRUE-PEAK.txt')
Write-Host 'Pokrecem EBU R128 / loudnorm analizu. Fajl se ne menja.' -ForegroundColor Cyan
$lines=& $ffmpegPath -hide_banner -nostats -i $input -map 0:a:0 -af 'loudnorm=I=-14:LRA=11:TP=-1.0:print_format=json' -f null NUL 2>&1
$text=($lines|Out-String)
$jsonMatch=[regex]::Match($text,'\{[\s\S]*?"input_i"[\s\S]*?\}')
if(-not $jsonMatch.Success){$text|Set-Content $out -Encoding utf8; throw "FFmpeg nije vratio loudnorm JSON. Ceo log je sacuvan: $out"}
$data=$jsonMatch.Value|ConvertFrom-Json
$report=@(
  'MUZICKI SPOT STUDIO 15.3 - PRECIZNA FFMPEG AUDIO KONTROLA',
  "Fajl: $input",
  "Vreme: $((Get-Date).ToString('o'))",
  '',
  "Integrisana glasnoca: $($data.input_i) LUFS",
  "True peak: $($data.input_tp) dBTP",
  "Loudness range: $($data.input_lra) LU",
  "Prag: $($data.input_thresh) LUFS",
  "Predlozen izlaz posle normalizacije: $($data.output_i) LUFS / $($data.output_tp) dBTP",
  '',
  'Preporuka za YouTube muzicki video: ne forsiraj normalizaciju samo zato sto broj nije -14 LUFS. Proveri da true peak ne klipuje i uporedi dinamiku sa originalnim masterom.',
  '',
  'Sirovi FFmpeg loudnorm JSON:',
  $jsonMatch.Value
)
$report|Set-Content $out -Encoding utf8
Write-Host "Gotovo: $out" -ForegroundColor Green
Write-Host "LUFS: $($data.input_i) | TRUE PEAK: $($data.input_tp) dBTP | LRA: $($data.input_lra)" -ForegroundColor Yellow
Read-Host 'Pritisni Enter za kraj'
