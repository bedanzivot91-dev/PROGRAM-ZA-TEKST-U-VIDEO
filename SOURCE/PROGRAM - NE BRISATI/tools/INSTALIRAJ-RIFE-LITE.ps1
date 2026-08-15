$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$target=Join-Path $InstallRoot 'rife-ncnn-vulkan'
$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)); if($drive.Free -lt 6GB){throw 'Potrebno je najmanje 6 GB slobodnog prostora za RIFE paket i privremene frejmove.'}
Write-Host 'Preuzimam RIFE NCNN Vulkan iz zvanicnog nihui/rife-ncnn-vulkan GitHub izdanja.' -ForegroundColor Cyan
$release=Invoke-RestMethod -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri 'https://api.github.com/repos/nihui/rife-ncnn-vulkan/releases/latest'
$asset=$release.assets|Where-Object {$_.name -match 'rife-ncnn-vulkan.*windows.*\.zip$'}|Select-Object -First 1
if(-not $asset){throw 'Windows RIFE ZIP nije pronadjen u poslednjem izdanju.'}
$zip=Join-Path $env:TEMP $asset.name; Invoke-WebRequest -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri $asset.browser_download_url -OutFile $zip
$hash=(Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
if($asset.digest -and $asset.digest -match '^sha256:(.+)$' -and $hash -ne $Matches[1].ToLower()){throw 'SHA-256 se ne poklapa sa GitHub digest vrednoscu.'}
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $target|Out-Null; Expand-Archive $zip $target -Force
$exe=Get-ChildItem $target -Recurse -Filter 'rife-ncnn-vulkan.exe'|Select-Object -First 1
if(-not $exe){throw 'rife-ncnn-vulkan.exe nije pronadjen.'}
@{repo='nihui/rife-ncnn-vulkan';tag=$release.tag_name;asset=$asset.name;sha256=$hash;githubDigest=$asset.digest;installedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $target 'MSS-METADATA.json') -Encoding utf8
Write-Host 'RIFE je instaliran. Za tvoj PC koristi 360p ili 720p video i ocekuj sporu obradu.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
