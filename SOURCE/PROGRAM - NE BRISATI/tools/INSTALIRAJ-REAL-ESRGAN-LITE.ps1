$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$InstallRoot=if($env:MSS_TOOLS_DIR){$env:MSS_TOOLS_DIR}else{$PSScriptRoot}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
$target=Join-Path $InstallRoot 'realesrgan-ncnn-vulkan'
$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($InstallRoot).Substring(0,1)); if($drive.Free -lt 4GB){throw 'Potrebno je najmanje 4 GB slobodnog prostora za paket i probne slike.'}
New-Item -ItemType Directory -Force -Path $target|Out-Null
Write-Host 'Preuzimam Real-ESRGAN NCNN Vulkan iz zvanicnog xinntao/Real-ESRGAN GitHub izdanja.' -ForegroundColor Cyan
$release=Invoke-RestMethod -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri 'https://api.github.com/repos/xinntao/Real-ESRGAN-ncnn-vulkan/releases/latest'
$asset=$release.assets|Where-Object {$_.name -match 'realesrgan-ncnn-vulkan.*windows.*\.zip$'}|Select-Object -First 1
if(-not $asset){throw 'Windows NCNN Vulkan ZIP nije pronadjen u poslednjem Real-ESRGAN izdanju.'}
$zip=Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Headers @{'User-Agent'='Muzicki-Spot-Studio/15.3'} -Uri $asset.browser_download_url -OutFile $zip
$hash=(Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
if($asset.digest -and $asset.digest -match '^sha256:(.+)$' -and $hash -ne $Matches[1].ToLower()){throw 'SHA-256 se ne poklapa sa GitHub release digest vrednoscu.'}
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $target|Out-Null
Expand-Archive -Path $zip -DestinationPath $target -Force
$exe=Get-ChildItem $target -Recurse -Filter 'realesrgan-ncnn-vulkan.exe'|Select-Object -First 1
if(-not $exe){throw 'realesrgan-ncnn-vulkan.exe nije pronadjen posle raspakivanja.'}
@{repo='xinntao/Real-ESRGAN-ncnn-vulkan';tag=$release.tag_name;asset=$asset.name;sha256=$hash;githubDigest=$asset.digest;installedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $target 'MSS-METADATA.json') -Encoding utf8
Write-Host "Instalirano: $($exe.FullName)" -ForegroundColor Green
Write-Host 'Za GTX 750 Ti koristi scale 2 i tile 128. Obrada ce biti spora.' -ForegroundColor Yellow
Read-Host 'Pritisni Enter za kraj'
