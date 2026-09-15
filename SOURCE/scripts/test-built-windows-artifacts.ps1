param(
  [Parameter(Mandatory=$true)][string]$SetupPath,
  [Parameter(Mandatory=$true)][string]$PortablePath,
  [string]$ExpectedVersion = '15.6'
)

$ErrorActionPreference = 'Stop'

function Get-StudioListeningPorts {
  try {
    $ports = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
      Where-Object { $_.Port -ge 4180 -and $_.Port -le 4239 } |
      Select-Object -ExpandProperty Port -Unique
    return @($ports | Sort-Object)
  } catch {
    return @()
  }
}

function Test-StudioHealthPort([int]$Port) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 1
    if ($health.ok -eq $true -and $health.app -eq 'Muzički Spot Studio FREE') {
      return [pscustomobject]@{ Port=$Port; Health=$health }
    }
  } catch {}
  return $null
}

function Wait-StudioHealth([int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastCandidateLog = [datetime]::MinValue
  while ((Get-Date) -lt $deadline) {
    # Portable electron-builder EXE prvo raspakuje aplikaciju u TEMP i zato može
    # potrajati više sekundi pre nego što uopšte otvori port. Stari test je posle
    # neuspelog 4180 pokušaja serijski čekao do 1 s na još 59 portova i mogao je
    # da potroši ceo timeout pre nego što se vrati na 4180. Ovde se proveravaju
    # samo portovi koji su stvarno u LISTEN stanju, uz 4180 kao brz prioritet.
    $priority = Test-StudioHealthPort 4180
    if ($priority) { return $priority }

    $listening = @(Get-StudioListeningPorts | Where-Object { $_ -ne 4180 })
    foreach ($port in $listening) {
      if ((Get-Date) -ge $deadline) { break }
      $probe = Test-StudioHealthPort $port
      if ($probe) { return $probe }
    }

    if ($listening.Count -gt 0 -and ((Get-Date) - $lastCandidateLog).TotalSeconds -ge 5) {
      Write-Host "[INFO] Aktivni Studio-opseg portovi: $(@(4180) + $listening -join ', ')"
      $lastCandidateLog = Get-Date
    }
    Start-Sleep -Milliseconds 200
  }
  throw "Muzički Spot Studio nije odgovorio na /health ni na jednom portu 4180-4239 u roku od $TimeoutSeconds s."
}

function Stop-Studio([int]$Port, [System.Diagnostics.Process]$Process) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/app/shutdown" -Method Post -TimeoutSec 3 -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "shutdown HTTP $($response.StatusCode)" }
  } catch {
    Write-Warning "Graceful shutdown nije uspeo: $($_.Exception.Message)"
  }
  if ($Process) {
    try { $Process.WaitForExit(10000) | Out-Null } catch {}
    if (-not $Process.HasExited) {
      try { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
}

function Assert-StudioVersion($Probe, [string]$Label) {
  if (-not $Probe.Health.ok) { throw "$Label /health nije ok=true." }
  if ([string]$Probe.Health.version -ne $ExpectedVersion) {
    throw "$Label vraća verziju $($Probe.Health.version), očekivano $ExpectedVersion."
  }
  Write-Host "[OK] $Label stvarno pokrenut: port=$($Probe.Port), version=$($Probe.Health.version)"
}

function Write-PackagedDiagnostics([string]$Label, [System.Diagnostics.Process]$Process, [string]$InstallRoot) {
  Write-Host "`n===== PACKAGED EXE DIJAGNOSTIKA: $Label ====="
  if ($Process) {
    try {
      $Process.Refresh()
      Write-Host "Process: Id=$($Process.Id) HasExited=$($Process.HasExited)"
      if ($Process.HasExited) { Write-Host "ExitCode=$($Process.ExitCode)" }
    } catch { Write-Warning "Ne mogu da pročitam stanje procesa: $($_.Exception.Message)" }
  }

  if ($InstallRoot -and (Test-Path $InstallRoot)) {
    Write-Host "Install root: $InstallRoot"
    $programRoot = Join-Path $InstallRoot 'resources\PROGRAM'
    $serverFile = Join-Path $programRoot 'server.js'
    Write-Host "resources\\PROGRAM postoji: $(Test-Path $programRoot)"
    Write-Host "resources\\PROGRAM\\server.js postoji: $(Test-Path $serverFile)"
    if (Test-Path $programRoot) {
      Write-Host 'Prvih 80 stavki resources\PROGRAM:'
      Get-ChildItem -Path $programRoot -Recurse -Force -ErrorAction SilentlyContinue |
        Select-Object -First 80 FullName,Length,LastWriteTime |
        Format-Table -AutoSize | Out-String | Write-Host
    }
  }

  $roots = @($env:APPDATA, $env:LOCALAPPDATA) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  $names = @('electron-main.log','server-stdout.log','server-stderr.log','DIJAGNOSTIKA-EXE.txt')
  $cutoff = (Get-Date).AddMinutes(-20)
  foreach ($root in $roots) {
    Write-Host "Tražim runtime logove pod: $root"
    foreach ($name in $names) {
      $matches = Get-ChildItem -Path $root -Filter $name -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $cutoff } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5
      foreach ($file in $matches) {
        Write-Host "--- $($file.FullName) ($($file.Length) B, $($file.LastWriteTime.ToString('s'))) ---"
        try {
          Get-Content -LiteralPath $file.FullName -Tail 250 -ErrorAction Stop | ForEach-Object { Write-Host $_ }
        } catch { Write-Warning "Ne mogu da pročitam $($file.FullName): $($_.Exception.Message)" }
      }
    }
  }

  Write-Host 'Aktivni procesi povezani sa Muzicki/Electron/Node:'
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -match '(?i)muzicki|electron|node' } |
    Select-Object ProcessName,Id,Path,StartTime |
    Format-Table -AutoSize | Out-String | Write-Host
  Write-Host "===== KRAJ DIJAGNOSTIKE: $Label =====`n"
}

$setup = Resolve-Path $SetupPath
$portable = Resolve-Path $PortablePath
$installDir = Join-Path $env:RUNNER_TEMP 'MSS-Installed-Runtime-Smoke'
if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }

$oldSkipBrowser = $env:MSS_SKIP_BROWSER
$oldTestNoBrowser = $env:MSS_TEST_NO_BROWSER
$env:MSS_SKIP_BROWSER = '1'
$env:MSS_TEST_NO_BROWSER = '1'

try {
  Write-Host "[TEST] Silent NSIS install: $setup"
  $install = Start-Process -FilePath $setup -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "NSIS silent install ExitCode=$($install.ExitCode)" }
  if (-not (Test-Path $installDir)) { throw 'Install folder nije napravljen.' }

  $installedExe = Get-ChildItem -Path $installDir -Filter '*.exe' -File |
    Where-Object { $_.Name -notmatch '(?i)unins|uninstall' } |
    Select-Object -First 1
  if (-not $installedExe) { throw 'Instalirana aplikacija EXE nije pronađena.' }
  $uninstaller = Get-ChildItem -Path $installDir -Filter '*.exe' -File |
    Where-Object { $_.Name -match '(?i)unins|uninstall' } |
    Select-Object -First 1
  if (-not $uninstaller) { throw 'Uninstaller nije pronađen.' }

  Write-Host "[TEST] Pokrećem stvarno instalirani EXE: $($installedExe.FullName)"
  $installedProcess = Start-Process -FilePath $installedExe.FullName -PassThru
  $installedProbe = $null
  try {
    $installedProbe = Wait-StudioHealth 90
    Assert-StudioVersion $installedProbe 'Installed EXE'
  } catch {
    Write-PackagedDiagnostics 'INSTALLED EXE FAILURE' $installedProcess $installDir
    throw
  } finally {
    if ($installedProbe) { Stop-Studio $installedProbe.Port $installedProcess }
    elseif ($installedProcess) { try { Stop-Process -Id $installedProcess.Id -Force -ErrorAction SilentlyContinue } catch {} }
  }

  Write-Host '[TEST] Silent NSIS uninstall'
  $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "NSIS silent uninstall ExitCode=$($uninstall.ExitCode)" }
  Start-Sleep -Seconds 2
  if (Test-Path $installedExe.FullName) { throw 'Aplikacioni EXE je ostao posle uninstall-a.' }
  Write-Host '[OK] NSIS install -> real app start -> health -> shutdown -> uninstall je prošao.'

  Write-Host "[TEST] Pokrećem Portable EXE: $portable"
  $portableProcess = Start-Process -FilePath $portable -PassThru
  $portableProbe = $null
  try {
    $portableProbe = Wait-StudioHealth 90
    Assert-StudioVersion $portableProbe 'Portable EXE'
  } catch {
    Write-PackagedDiagnostics 'PORTABLE EXE FAILURE' $portableProcess (Split-Path -Parent $portable)
    throw
  } finally {
    if ($portableProbe) { Stop-Studio $portableProbe.Port $portableProcess }
    elseif ($portableProcess) { try { Stop-Process -Id $portableProcess.Id -Force -ErrorAction SilentlyContinue } catch {} }
  }
  Write-Host '[OK] Portable EXE real start -> health -> shutdown je prošao.'
} finally {
  if ($null -eq $oldSkipBrowser) { Remove-Item Env:MSS_SKIP_BROWSER -ErrorAction SilentlyContinue } else { $env:MSS_SKIP_BROWSER = $oldSkipBrowser }
  if ($null -eq $oldTestNoBrowser) { Remove-Item Env:MSS_TEST_NO_BROWSER -ErrorAction SilentlyContinue } else { $env:MSS_TEST_NO_BROWSER = $oldTestNoBrowser }
  if (Test-Path $installDir) { try { Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue } catch {} }
}
