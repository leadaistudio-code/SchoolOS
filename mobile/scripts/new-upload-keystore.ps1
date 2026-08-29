<#
.SYNOPSIS
  Create a new upload keystore and PEM certificate for Google Play upload key reset.

.DESCRIPTION
  Use this when you forgot the old keystore password. Play App Signing must be
  enabled on your app (it is - "Releases are signed by Google Play").

  1. Run this script and choose a strong password - save it in a password manager.
  2. Upload upload_certificate.pem in Play Console > App signing > Request upload key reset.
  3. After Google approves (usually 1-2 days), rebuild with build-android.ps1 -All -Bundle.

.EXAMPLE
  .\mobile\scripts\new-upload-keystore.ps1
#>
$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$appDir  = Join-Path $repo 'mobile\android\app'
$android = Join-Path $repo 'mobile\android'
$keystore = Join-Path $appDir 'mycampusview-upload.keystore'
$pem      = Join-Path $appDir 'upload_certificate.pem'
$alias    = 'mycampusview'

Write-Host ''
Write-Host 'MyCampusView - new Play upload keystore' -ForegroundColor Cyan
Write-Host 'Save the password in your password manager before continuing.' -ForegroundColor Yellow
Write-Host ''

$pass1 = Read-Host 'New keystore password (min 8 chars)' -AsSecureString
$pass2 = Read-Host 'Confirm password' -AsSecureString

function ConvertTo-Plain([Security.SecureString] $secure) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$p1 = ConvertTo-Plain $pass1
$p2 = ConvertTo-Plain $pass2
if ($p1.Length -lt 8) { throw 'Password must be at least 8 characters.' }
if ($p1 -ne $p2) { throw 'Passwords do not match.' }

if (Test-Path $keystore) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $appDir "mycampusview-upload.old-$stamp.keystore"
    Copy-Item $keystore $backup -Force
    Write-Host "Backed up old keystore to $backup" -ForegroundColor DarkGray
    Remove-Item $keystore -Force
}

New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Write-Host 'Generating keystore...' -ForegroundColor Cyan
& keytool -genkeypair -v -storetype PKCS12 `
    -keystore $keystore `
    -alias $alias -keyalg RSA -keysize 2048 -validity 10950 `
    -storepass $p1 -keypass $p1 `
    -dname "CN=MyCampusView, O=MyCampusView, L=Pune, ST=Maharashtra, C=IN"
if ($LASTEXITCODE -ne 0) { throw 'keytool genkeypair failed' }

Write-Host 'Exporting upload_certificate.pem for Play Console...' -ForegroundColor Cyan
& keytool -export -rfc -keystore $keystore -alias $alias -file $pem -storepass $p1
if ($LASTEXITCODE -ne 0) { throw 'keytool export failed' }

$props = @(
    'storeFile=app/mycampusview-upload.keystore'
    "storePassword=$p1"
    "keyAlias=$alias"
    "keyPassword=$p1"
)
$propsText = ($props -join "`n") + "`n"
Set-Content -Path (Join-Path $appDir 'keystore.properties') -Value $propsText -Encoding ascii -NoNewline
Set-Content -Path (Join-Path $android 'keystore.properties') -Value $propsText -Encoding ascii -NoNewline

$sha1 = (& keytool -list -v -keystore $keystore -storepass $p1 2>&1) |
    Select-String -Pattern 'SHA1:' |
    ForEach-Object { ($_ -replace '^\s*SHA1:\s*', '').Trim() } |
    Select-Object -First 1

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "  Keystore   $keystore"
Write-Host "  PEM cert   $pem"
Write-Host "  SHA-1      $sha1"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Play Console > Setup > App signing > Request upload key reset'
Write-Host '  2. Reason: I lost my upload key'
Write-Host "  3. Upload: $pem"
Write-Host '  4. Wait for Google approval email (often 1-2 business days)'
Write-Host '  5. Then: .\mobile\scripts\build-android.ps1 -All -Bundle'
Write-Host ''

$p1 = $null
$p2 = $null
