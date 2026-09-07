#requires -RunAsAdministrator
#requires -Version 5.1
<#
.SYNOPSIS
  Installs MyCampusView Connect as a Windows Service.
#>
param(
  [string]$PublishDir = "",
  [string]$ServiceName = "MyCampusViewConnect",
  [string]$DisplayName = "MyCampusView Connect",
  [string]$Environment = "Production"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($PublishDir)) {
  $PublishDir = Join-Path $repoRoot "artifacts\publish\Connect"
}

$exe = Join-Path $PublishDir "MyCampusView.Connect.exe"
if (-not (Test-Path $exe)) {
  throw "Worker EXE not found at $exe. Run scripts\publish.ps1 first."
}

$dataRoot = Join-Path $env:ProgramData "MyCampusView\Connect"
New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot "logs") | Out-Null

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Service already exists; stopping and removing…"
  if ($existing.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

# binPath must quote the EXE; ASPNETCORE_ENVIRONMENT / DOTNET_ENVIRONMENT via registry after create.
$binPath = "`"$exe`""
sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= "$DisplayName" | Out-Null
sc.exe description $ServiceName "Biometric device gateway for MyCampusView school ERP" | Out-Null

$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
New-ItemProperty -Path $regPath -Name "Environment" -PropertyType MultiString -Force -Value @(
  "DOTNET_ENVIRONMENT=$Environment",
  "ASPNETCORE_ENVIRONMENT=$Environment"
) | Out-Null

Start-Service -Name $ServiceName
Write-Host "Installed and started service '$ServiceName'."
Write-Host "Data directory: $dataRoot"
Write-Host "Pair first with Setup if credentials.dpapi is missing."
