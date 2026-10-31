# Builds MyCampusView-Connect-Setup.exe (setup wizard + manager + Windows
# service in one self-contained exe) and copies it to public/downloads, where
# Settings → Biometric attendance links to it.
#   powershell -ExecutionPolicy Bypass -File connect/scripts/build-installer.ps1
$ErrorActionPreference = 'Stop'
$connect = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $connect
$project = Join-Path $connect 'src\MyCampusView.Connect.App\MyCampusView.Connect.App.csproj'
$out = Join-Path $connect 'artifacts\installer'

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
dotnet publish $project -c Release -o $out --nologo
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

$built = Join-Path $out 'MyCampusViewConnect.exe'
$dest = Join-Path $root 'public\downloads'
New-Item -ItemType Directory -Force $dest | Out-Null
$target = Join-Path $dest 'MyCampusView-Connect-Setup.exe'
Copy-Item $built $target -Force
$size = [math]::Round((Get-Item $target).Length / 1MB, 1)
Write-Host "Built public/downloads/MyCampusView-Connect-Setup.exe ($size MB)"
