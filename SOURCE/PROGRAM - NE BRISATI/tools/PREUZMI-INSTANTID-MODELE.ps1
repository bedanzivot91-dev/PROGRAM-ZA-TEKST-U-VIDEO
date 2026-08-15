$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Write-Host 'MUZICKI SPOT STUDIO 15.3 - INSTANTID / SDXL MODELI' -ForegroundColor Cyan
$gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
$vramGb = [math]::Round($gpu.AdapterRAM / 1GB, 2)
$nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
  try { $reported = @(& $nvidiaSmi.Source --query-gpu=memory.total --format=csv,noheader,nounits 2>$null | ForEach-Object {[double]($_.Trim())}); if($reported.Count){$vramGb=[math]::Round((($reported|Measure-Object -Maximum).Maximum)/1024,2)} } catch {}
}
Write-Host "GPU: $($gpu.Name), VRAM: $vramGb GB" -ForegroundColor White
if ($vramGb -lt 8) {
  Write-Host 'PREUZIMANJE JE BLOKIRANO: SDXL/InstantID nije praktican sa manje od 8 GB VRAM-a.' -ForegroundColor Red
  Write-Host 'Na GTX 750 Ti 2 GB koristi zakljucani ID u ChatGPT Plus promptovima.' -ForegroundColor Green
  Read-Host 'Pritisni Enter za izlaz'
  exit 21
}
$Comfy = Read-Host 'Unesi punu putanju do ComfyUI foldera koji sadrzi models i custom_nodes'
if (-not (Test-Path (Join-Path $Comfy 'models'))) { throw 'Putanja nije ispravna: models folder nije pronadjen.' }
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($Comfy).TrimEnd(':\'))
if ($drive.Free -lt 18GB) { throw 'Potrebno je najmanje 18 GB slobodnog prostora.' }
function Get-HuggingFaceSha256([string]$Url) {
  try {
    $response=Invoke-WebRequest -Uri $Url -Method Head -MaximumRedirection 10 -UseBasicParsing
    $candidate=$response.Headers['X-Linked-Etag']; if(-not $candidate){$candidate=$response.Headers['ETag']}
    $candidate=([string]$candidate).Trim('"').Replace('W/','').Replace('sha256:','')
    if($candidate -match '^[a-fA-F0-9]{64}$'){return $candidate.ToLower()}
  } catch { Write-Host "Upozorenje: udaljeni SHA-256 nije dostupan: $($_.Exception.Message)" -ForegroundColor Yellow }
  return ''
}
function Test-SafetensorsHeader([string]$File) {
  if(-not $File.EndsWith('.safetensors',[StringComparison]::OrdinalIgnoreCase)){return}
  $stream=[IO.File]::OpenRead($File)
  try {
    $bytes=New-Object byte[] 8; if($stream.Read($bytes,0,8)-ne 8){throw 'Nema safetensors zaglavlja.'}
    $length=[BitConverter]::ToUInt64($bytes,0); if($length-lt 3 -or $length-gt 104857600){throw "Neispravna duzina zaglavlja: $length"}
    $header=New-Object byte[] ([int]$length); if($stream.Read($header,0,[int]$length)-ne [int]$length){throw 'Nepotpuno safetensors zaglavlje.'}
    $null=([Text.Encoding]::UTF8.GetString($header)|ConvertFrom-Json)
  } finally {$stream.Dispose()}
}
function Download-Verified([string]$Url,[string]$Destination) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
  $expected=Get-HuggingFaceSha256 $Url
  if (-not (Test-Path $Destination)) { & curl.exe -L --fail --retry 15 --retry-delay 5 -o $Destination $Url; if ($LASTEXITCODE -ne 0) { throw "Preuzimanje nije uspelo: $Destination" } }
  if((Get-Item $Destination).Length -lt 1MB){throw "Model je premali ili nepotpun: $Destination"}
  Test-SafetensorsHeader $Destination
  $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLower()
  if($expected -and $hash -ne $expected){throw "SHA-256 se ne poklapa za $(Split-Path $Destination -Leaf). Ocekivano $expected, dobijeno $hash"}
  "$hash  $(Split-Path $Destination -Leaf)" | Set-Content "$Destination.sha256.txt" -Encoding ascii
  @{source=$Url;expectedSha256=$expected;sha256=$hash;sizeBytes=(Get-Item $Destination).Length;verifiedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$Destination.metadata.json" -Encoding utf8
  Write-Host "OK + SHA-256 + metadata: $Destination" -ForegroundColor Green
}
Download-Verified 'https://huggingface.co/InstantX/InstantID/resolve/main/ip-adapter.bin?download=true' (Join-Path $Comfy 'models\instantid\ip-adapter.bin')
Download-Verified 'https://huggingface.co/InstantX/InstantID/resolve/main/ControlNetModel/diffusion_pytorch_model.safetensors?download=true' (Join-Path $Comfy 'models\controlnet\instantid\diffusion_pytorch_model.safetensors')
$Checkpoint = Join-Path $Comfy 'models\checkpoints\sd_xl_base_1.0.safetensors'
if (-not (Test-Path $Checkpoint)) { Download-Verified 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true' $Checkpoint }
Write-Host 'Modeli su spremni i SHA-256 zapisi su napravljeni.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
