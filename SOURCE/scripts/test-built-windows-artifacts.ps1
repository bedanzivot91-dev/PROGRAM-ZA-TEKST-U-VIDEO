param(
  [Parameter(Mandatory=$true)][string]$SetupPath,
  [Parameter(Mandatory=$true)][string]$PortablePath,
  [string]$ExpectedVersion = '15.6'
)

$ErrorActionPreference = 'Stop'

function Wait-StudioHealth([int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    foreach ($port in 4180..4239) {
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -Method Get -TimeoutSec 1
        if ($health.ok -eq $true -and $health.app -eq 'Muzički Spot Studio FREE') {
          return [pscustomobject]@{ Port=$port; Health=$health }
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 300
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
  try {
    $installedProbe = Wait-StudioHealth 60
    Assert-StudioVersion $installedProbe 'Installed EXE'
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
  try {
    $portableProbe = Wait-StudioHealth 60
    Assert-StudioVersion $portableProbe 'Portable EXE'
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
