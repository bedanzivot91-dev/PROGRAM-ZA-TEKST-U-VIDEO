$ErrorActionPreference = 'Stop'
$ProgramDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = Join-Path $ProgramDir 'runtime\node\node.exe'
$Bootstrap = Join-Path $ProgramDir 'bootstrap-node.ps1'
$Launcher = Join-Path $ProgramDir 'launcher.js'
if (-not (Test-Path -LiteralPath $NodeExe)) {
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Bootstrap
  if ($LASTEXITCODE -ne 0) { exit 1 }
}
& $NodeExe $Launcher
exit $LASTEXITCODE
