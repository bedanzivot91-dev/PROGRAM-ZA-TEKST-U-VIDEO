$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgramDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runtime = if ($env:MSS_TOOLS_DIR) { $env:MSS_TOOLS_DIR } else { Join-Path $ProgramDir 'runtime' }
$NodeDir = Join-Path $Runtime 'node'
$NodeExe = Join-Path $NodeDir 'node.exe'
$Zip = Join-Path $Runtime 'node-v24.18.0-win-x64.zip'
$Extract = Join-Path $Runtime 'node-extract'
$Log = Join-Path $Runtime 'node-bootstrap-powershell.log'
$Url = 'https://nodejs.org/download/release/v24.18.0/node-v24.18.0-win-x64.zip'
$Expected = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
function Step([string]$Text) { Write-Host $Text; Add-Content -LiteralPath $Log -Encoding UTF8 -Value $Text }
try {
  Step 'Downloading Node.js 24.18.0...'
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Zip -TimeoutSec 600
  $Actual = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) { throw ('SHA256 mismatch: ' + $Actual) }
  Remove-Item -LiteralPath $Extract -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -LiteralPath $Zip -DestinationPath $Extract -Force
  $Source = Join-Path $Extract 'node-v24.18.0-win-x64'
  if (-not (Test-Path -LiteralPath (Join-Path $Source 'node.exe'))) { throw 'Extracted node.exe was not found.' }
  Remove-Item -LiteralPath $NodeDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
  Copy-Item -Path (Join-Path $Source '*') -Destination $NodeDir -Recurse -Force
  if (-not (Test-Path -LiteralPath $NodeExe)) { throw 'Portable node.exe was not copied.' }
  Remove-Item -LiteralPath $Extract -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
  Step ('Node.js ready: ' + (& $NodeExe --version))
  exit 0
} catch {
  Step ('ERROR: ' + $_.Exception.Message)
  exit 1
}
