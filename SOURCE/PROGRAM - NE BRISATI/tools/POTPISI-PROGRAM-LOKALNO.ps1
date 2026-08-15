$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgramRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Write-Host 'MUZICKI SPOT STUDIO 15.3 - LOKALNI WINDOWS POTPIS' -ForegroundColor Cyan
Write-Host 'Ovo pravi lokalni PowerShell/Authenticode potpis na OVOM Windows nalogu.' -ForegroundColor Yellow
Write-Host 'VAZNO: self-signed potpis NE smanjuje SmartScreen reputacioni blok za javno preuzete fajlove. Sluzi za lokalni PowerShell/Authenticode potpis i testiranje. Za javnu distribuciju potreban je pouzdan izdavacki sertifikat, Microsoft Store ili vremenom izgradjena reputacija.' -ForegroundColor Yellow
Get-ChildItem -LiteralPath $ProgramRoot -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object Subject -eq 'CN=Muzicki Spot Studio Local' | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Muzicki Spot Studio Local' -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5)
  $store = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople','CurrentUser'); $store.Open('ReadWrite'); $store.Add($cert); $store.Close()
}
$files = @(Get-ChildItem -LiteralPath $ProgramRoot -Recurse -File -Include *.ps1,*.psm1)
foreach ($file in $files) {
  $result = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert -HashAlgorithm SHA256
  Write-Host "$($result.Status): $($file.FullName)" -ForegroundColor $(if($result.Status -eq 'Valid'){'Green'}else{'Yellow'})
}

# Potpis menja sadržaj PowerShell fajlova, zato se SHA-256 manifest obavezno pravi ponovo.
$internal = Join-Path $ProgramRoot 'PROGRAM - NE BRISATI'
$manifest = Join-Path $internal 'INTEGRITET-FAJLOVA-SHA256.txt'
$include = @()
$launcher = Join-Path $ProgramRoot 'POKRENI MUZICKI SPOT STUDIO.cmd'
if (Test-Path $launcher) { $include += Get-Item -LiteralPath $launcher }
foreach ($name in @('server.js','advanced-tools.js','background-worker.js','research-engine.js','bootstrap-node.ps1','launch-studio.ps1')) {
  $candidate = Join-Path $internal $name
  if (Test-Path $candidate) { $include += Get-Item -LiteralPath $candidate }
}
foreach ($folder in @('public','tools','docs')) {
  $path = Join-Path $internal $folder
  if (-not (Test-Path $path)) { continue }
  Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/]ARHIVA 13\.7 - NE KORISTITI[\\/]' -and
    $_.Extension.ToLowerInvariant() -in @('.js','.css','.html','.json','.ps1','.psm1','.bat','.cmd','.py','.txt')
  } | ForEach-Object { $include += $_ }
}
$lines = @('MUZIČKI SPOT STUDIO FREE 15.3 LITE — SHA-256','')
$include | Sort-Object FullName -Unique | ForEach-Object {
  $relative = $_.FullName.Substring($ProgramRoot.TrimEnd('\').Length + 1).Replace('\','/')
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  $lines += "$hash  $relative"
}
$lines | Set-Content -LiteralPath $manifest -Encoding UTF8

Write-Host 'Fajlovi su Unblock-ovani, PowerShell skripte su lokalno potpisane i SHA-256 manifest je osvežen.' -ForegroundColor Green
Read-Host 'Pritisni Enter za kraj'
