$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Write-Host 'MUZICKI SPOT STUDIO 15.3 - PROVERA RACUNARA' -ForegroundColor Cyan
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion)
$ram = Get-CimInstance Win32_ComputerSystem
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID, Size, FreeSpace)
$maxVramGb = [math]::Round((($gpus | Measure-Object AdapterRAM -Maximum).Maximum / 1GB), 2)
$nvidiaSmi=Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
if($nvidiaSmi){try{$reported=@(& $nvidiaSmi.Source --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null); if($reported.Count){$parts=$reported[0] -split ','; $maxVramGb=[math]::Round(([double]$parts[1].Trim())/1024,2); Write-Host "NVIDIA-SMI: $($parts[0].Trim()), VRAM $maxVramGb GB, drajver $($parts[2].Trim())" -ForegroundColor White}}catch{}}
$ramGb = [math]::Round($ram.TotalPhysicalMemory / 1GB, 1)
Write-Host "CPU: $($cpu.Name)" -ForegroundColor White
Write-Host "RAM: $ramGb GB" -ForegroundColor White
foreach ($gpu in $gpus) { Write-Host "GPU: $($gpu.Name) - $([math]::Round($gpu.AdapterRAM/1GB,2)) GB VRAM" -ForegroundColor White }
foreach ($disk in $disks) { Write-Host "Disk $($disk.DeviceID): $([math]::Round($disk.FreeSpace/1GB,1)) GB slobodno" -ForegroundColor White }
Write-Host ''
if ($maxVramGb -lt 3) {
  Write-Host 'LITE PROFIL: lokalni Wan 14B i SDXL/InstantID nisu prakticni na ovoj grafici.' -ForegroundColor Red
  Write-Host 'Koristi ChatGPT Plus za slike, proxy 360p/15fps i finalni 1080p/24fps render.' -ForegroundColor Yellow
  Write-Host 'faster-whisper: tiny CPU int8. Real-ESRGAN/RIFE: samo mali tiled/low-res zadaci i veoma sporo.' -ForegroundColor Yellow
} elseif ($maxVramGb -lt 8) {
  Write-Host 'STANDARD PROFIL: koristi manje modele i low-VRAM opcije.' -ForegroundColor Yellow
} else {
  Write-Host 'GPU PROFIL: SDXL je moguc; Wan 14B i dalje trazi mnogo vise VRAM-a.' -ForegroundColor Green
}
Write-Host ''
Read-Host 'Pritisni Enter za kraj'
