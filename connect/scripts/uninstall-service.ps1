#requires -RunAsAdministrator
#requires -Version 5.1
<#
.SYNOPSIS
  Stops and removes the MyCampusView Connect Windows Service.
#>
param(
  [string]$ServiceName = "MyCampusViewConnect"
)

$ErrorActionPreference = "Stop"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "Service '$ServiceName' is not installed."
  exit 0
}

if ($existing.Status -ne "Stopped") {
  Write-Host "Stopping $ServiceName…"
  Stop-Service -Name $ServiceName -Force
}

sc.exe delete $ServiceName | Out-Null
Write-Host "Removed service '$ServiceName'."
Write-Host "Note: %ProgramData%\MyCampusView\Connect data (queue, credentials, logs) was left in place."
