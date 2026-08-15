$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Write-Host 'MUZICKI SPOT STUDIO 15.3 - WAN 2.1 I2V MODELI' -ForegroundColor Cyan
$gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
$vramGb = [math]::Round($gpu.AdapterRAM / 1GB, 2)
$nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
  try { $reported = @(& $nvidiaSmi.Source --query-gpu=memory.total --format=csv,noheader,nounits 2>$null | ForEach-Object {[double]($_.Trim())}); if($reported.Count){$vramGb=[math]::Round((($reported|Measure-Object -Maximum).Maximum)/1024,2)} } catch {}
}
Write-Host "GPU: $($gpu.Name), VRAM: $vramGb GB" -ForegroundColor White
if ($vramGb -lt 16) {
  Write-Host ''
  Write-Host 'PREUZIMANJE JE BLOKIRANO ZA OVAJ PC.' -ForegroundColor Red
  Write-Host 'Wan 14B modeli zauzimaju oko 25 GB na disku i nisu prakticni sa GTX 750 Ti 2 GB.' -ForegroundColor Yellow
  Write-Host 'Preuzimanje bi potrosilo prostor, a generisanje bi najverovatnije palo zbog VRAM-a.' -ForegroundColor Yellow
  Write-Host 'Koristi ChatGPT Plus slike i lokalni proxy/finalni render.' -ForegroundColor Green
  Read-Host 'Pritisni Enter za izlaz'
  exit 20
}
$root = Read-Host 'Nalepi punu putanju do ComfyUI_windows_portable\ComfyUI'
if (-not (Test-Path $root)) { throw "Folder ne postoji: $root" }
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($root).TrimEnd(':\'))
if ($drive.Free -lt 40GB) { throw "Potrebno je najmanje 40 GB slobodno. Trenutno: $([math]::Round($drive.Free/1GB,1)) GB." }
$base = 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files'
$files = @(
  @{Dir='diffusion_models'; Name='wan2.1_i2v_480p_14B_fp8_scaled.safetensors'; Url="$base/diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors?download=true"},
  @{Dir='text_encoders'; Name='umt5_xxl_fp8_e4m3fn_scaled.safetensors'; Url="$base/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors?download=true"},
  @{Dir='vae'; Name='wan_2.1_vae.safetensors'; Url="$base/vae/wan_2.1_vae.safetensors?download=true"},
  @{Dir='clip_vision'; Name='clip_vision_h.safetensors'; Url="$base/clip_vision/clip_vision_h.safetensors?download=true"}
)
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
  $stream=[IO.File]::OpenRead($File)
  try {
    $bytes=New-Object byte[] 8; if($stream.Read($bytes,0,8)-ne 8){throw 'Nema safetensors zaglavlja.'}
    $length=[BitConverter]::ToUInt64($bytes,0); if($length-lt 3 -or $length-gt 104857600){throw "Neispravna duzina zaglavlja: $length"}
    $header=New-Object byte[] ([int]$length); if($stream.Read($header,0,[int]$length)-ne [int]$length){throw 'Nepotpuno safetensors zaglavlje.'}
    $null=([Text.Encoding]::UTF8.GetString($header)|ConvertFrom-Json)
  } finally {$stream.Dispose()}
}
foreach ($item in $files) {
  $dir = Join-Path $root "models\$($item.Dir)"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir $item.Name
  $expected=Get-HuggingFaceSha256 $item.Url
  if (-not (Test-Path $target)) {
    Write-Host "Preuzimam $($item.Name)..." -ForegroundColor Cyan
    & curl.exe -L --fail --retry 20 --retry-delay 5 -C - -o $target $item.Url
    if ($LASTEXITCODE -ne 0) { throw "Preuzimanje nije uspelo: $($item.Name)" }
  }
  if((Get-Item $target).Length -lt 1MB){throw "Model je premali ili nepotpun: $($item.Name)"}
  Test-SafetensorsHeader $target
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLower()
  if($expected -and $hash -ne $expected){throw "SHA-256 se ne poklapa za $($item.Name). Ocekivano $expected, dobijeno $hash"}
  "$hash  $($item.Name)" | Set-Content -LiteralPath "$target.sha256.txt" -Encoding ascii
  @{source=$item.Url;expectedSha256=$expected;sha256=$hash;sizeBytes=(Get-Item $target).Length;verifiedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$target.metadata.json" -Encoding utf8
  Write-Host "SHA-256 + safetensors metadata OK: $hash" -ForegroundColor DarkGreen
}
Write-Host 'Wan modeli su preuzeti i lokalni SHA-256 zapisi su napravljeni.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
