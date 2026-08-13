# Restore a custom-format dump into a SCRATCH database only.
# Usage:
#   $env:RESTORE_DATABASE_URL="postgres://..."
#   $env:RESTORE_CONFIRM="YES"
#   powershell -File scripts/restore-db.ps1 backups\file.dump
param(
  [Parameter(Mandatory = $true)][string]$DumpPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpPath)) {
  throw "Dump not found: $DumpPath"
}
if (-not $env:RESTORE_DATABASE_URL) {
  throw "RESTORE_DATABASE_URL must point at an empty scratch database (never production)."
}
if ($env:RESTORE_CONFIRM -ne "YES") {
  throw "Refusing to restore without RESTORE_CONFIRM=YES"
}

Write-Host "Restoring $DumpPath into scratch database…"
& pg_restore --clean --if-exists --no-owner --dbname=$env:RESTORE_DATABASE_URL $DumpPath
Write-Host "Restore finished."
