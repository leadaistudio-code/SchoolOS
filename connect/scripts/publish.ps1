#requires -Version 5.1
<#
.SYNOPSIS
  Publishes MyCampusView Connect (worker + setup) for Windows x64.
#>
param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $repoRoot "artifacts\publish"
}

$workerOut = Join-Path $OutputRoot "Connect"
$setupOut = Join-Path $OutputRoot "Setup"

Write-Host "Publishing worker -> $workerOut"
dotnet publish (Join-Path $repoRoot "src\MyCampusView.Connect\MyCampusView.Connect.csproj") `
  -c $Configuration `
  -r $Runtime `
  --self-contained false `
  -o $workerOut

Write-Host "Publishing setup -> $setupOut"
dotnet publish (Join-Path $repoRoot "src\MyCampusView.Connect.Setup\MyCampusView.Connect.Setup.csproj") `
  -c $Configuration `
  -r $Runtime `
  --self-contained false `
  -o $setupOut

Write-Host "Done."
Write-Host "  Worker: $workerOut\MyCampusView.Connect.exe"
Write-Host "  Setup:  $setupOut\MyCampusView.Connect.Setup.exe"
