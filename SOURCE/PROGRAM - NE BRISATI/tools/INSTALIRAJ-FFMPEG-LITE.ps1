$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$target=Join-Path $InstallRoot 'ffmpeg-portable'
$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)); if($drive.Free -lt 3GB){throw 'Potrebno je najmanje 3 GB slobodnog prostora za FFmpeg paket i privremeno raspakivanje.'}
Write-Host 'MUZICKI SPOT STUDIO 15.3 - PORTABLE FFMPEG' -ForegroundColor Cyan
Write-Host 'Preuzima se Windows x64 GPL static build iz BtbN/FFmpeg-Builds GitHub izdanja.' -ForegroundColor Yellow
$release=Invoke-RestMethod -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest'
$asset=$release.assets|Where-Object {$_.name -eq 'ffmpeg-master-latest-win64-gpl.zip'}|Select-Object -First 1
if(-not $asset){$asset=$release.assets|Where-Object {$_.name -match '^ffmpeg-.*-win64-gpl\.zip$' -and $_.name -notmatch 'shared'}|Select-Object -First 1}
if(-not $asset){throw 'Odgovarajuci Windows FFmpeg ZIP nije pronadjen u GitHub izdanju.'}
$zip=Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri $asset.browser_download_url -OutFile $zip
$hash=(Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
$expected=''
if($asset.digest -and $asset.digest -match '^sha256:(.+)$'){$expected=$Matches[1].ToLower()}
if(-not $expected){
  $checks=$release.assets|Where-Object {$_.name -eq 'checksums.sha256'}|Select-Object -First 1
  if($checks){
    $checkFile=Join-Path $env:TEMP 'mss-ffmpeg-checksums.sha256'; Invoke-WebRequest -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri $checks.browser_download_url -OutFile $checkFile
    $line=Get-Content $checkFile|Where-Object {$_ -match [regex]::Escape($asset.name)+'$'}|Select-Object -First 1
    if($line -match '^([a-fA-F0-9]{64})\s+'){$expected=$Matches[1].ToLower()}
  }
}
if($expected -and $hash -ne $expected){throw "FFmpeg SHA-256 nije ispravan. Ocekivano $expected, dobijeno $hash"}
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $target|Out-Null
Expand-Archive -Path $zip -DestinationPath $target -Force
$ffmpeg=Get-ChildItem $target -Recurse -Filter 'ffmpeg.exe'|Select-Object -First 1
$ffprobe=Get-ChildItem $target -Recurse -Filter 'ffprobe.exe'|Select-Object -First 1
if(-not $ffmpeg -or -not $ffprobe){throw 'ffmpeg.exe ili ffprobe.exe nije pronadjen posle raspakivanja.'}
@{repo='BtbN/FFmpeg-Builds';tag=$release.tag_name;asset=$asset.name;sha256=$hash;expectedSha256=$expected;installedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $target 'MSS-METADATA.json') -Encoding utf8
Write-Host "FFmpeg je instaliran: $($ffmpeg.FullName)" -ForegroundColor Green
Write-Host 'Sada rade precizna LUFS/true-peak provera i RIFE video skripta bez menjanja Windows PATH-a.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
