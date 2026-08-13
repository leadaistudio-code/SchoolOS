# Dump the application database to backups/.
# Usage: powershell -File scripts/backup-db.ps1 [-Label manual]
param(
  [string]$Label = "manual"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $env:DATABASE_URL) {
  if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
      if ($_ -match '^\s*DATABASE_URL=(.+)$') {
        $env:DATABASE_URL = $Matches[1].Trim().Trim('"')
      }
    }
  }
}

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set"
}

$OutDir = Join-Path $Root "backups"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $OutDir "mycampusview-$Label-$Stamp.dump"

Write-Host "Writing $Out"
& pg_dump --no-owner --format=custom --dbname=$env:DATABASE_URL --file=$Out
Write-Host "Done: $Out"
Write-Output $Out
