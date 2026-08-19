<#
.SYNOPSIS
  Builds the MyCampusView Android app and puts the result in releases/.

.DESCRIPTION
  Wraps the two things that make building on this machine awkward, so nobody
  has to remember either:

  1. The repository path contains spaces ("Lead AI Studio Project\School ERP").
     Ninja, which compiles the C++ that React Native depends on, fails on those
     with "manifest 'build.ninja' still dirty after 100 tries". A directory
     junction does not help — Gradle resolves through it back to the real path.
     So the project is mirrored to a space-free folder and built there.

  2. Gradle caches the JavaScript bundle aggressively and will happily ship
     yesterday's code after you edit a screen. The generated bundle is deleted
     before every build.

.PARAMETER Phone
  Build for real phones only (arm64-v8a). Roughly a quarter of the size.
  Will NOT install on a standard x86_64 emulator — use -All for that.

.PARAMETER All
  Build for all four CPU types. Installs anywhere, four times the size.

.PARAMETER Bundle
  Also produce the .aab for Google Play.

.EXAMPLE
  .\mobile\scripts\build-android.ps1 -Phone
  .\mobile\scripts\build-android.ps1 -All -Bundle
#>
param(
    [switch]$Phone,
    [switch]$All,
    [switch]$Bundle
)

$ErrorActionPreference = 'Stop'

$repo     = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source   = Join-Path $repo 'mobile'
$work     = 'C:\mcvbuild'
$releases = Join-Path $repo 'releases'
$sdk      = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk" }
if (-not $Phone -and -not $All) { $All = $true }

$arches = if ($Phone) { 'arm64-v8a' } else { 'armeabi-v7a,arm64-v8a,x86,x86_64' }
Write-Host "Building for: $arches" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. mirror
Write-Host 'Copying to a path without spaces...' -ForegroundColor Cyan
robocopy $source $work /MIR /XD 'android\build' 'android\.gradle' '.cxx' '.expo' 'dist' `
    /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
# robocopy uses 0-7 for success; 8+ is a real failure.
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy code $LASTEXITCODE)" }

# The SDK path must escape its drive colon: a Java .properties file treats
# "C:\Users" as an escape sequence and silently yields a path that is not there.
$escaped = ($sdk -replace '\\', '/') -replace '^C:', 'C\:'
Set-Content -Path (Join-Path $work 'android\local.properties') -Value "sdk.dir=$escaped" -Encoding ascii

# ------------------------------------------------------- 2. clear JS cache
Remove-Item -Recurse -Force `
    (Join-Path $work 'android\app\build\generated\assets\react'), `
    (Join-Path $work 'android\app\build\intermediates\assets') `
    -ErrorAction SilentlyContinue

# ------------------------------------------------------------- 3. gradle
$env:ANDROID_HOME = $sdk
# Expo's bundler wants this set; without it Gradle still works but prints a
# warning on stderr, which PowerShell turns into a fatal error record.
$env:NODE_ENV = 'production'

Push-Location (Join-Path $work 'android')
try {
    $tasks = @('assembleRelease')
    if ($Bundle) { $tasks += 'bundleRelease' }

    # Gradle writes progress and warnings to stderr even on a clean build. With
    # ErrorActionPreference = Stop those become terminating errors, so the only
    # trustworthy signal is the exit code.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & .\gradlew.bat @tasks "-PreactNativeArchitectures=$arches" --no-daemon
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous

    if ($code -ne 0) { throw "Gradle failed with exit code $code" }
} finally {
    Pop-Location
}

# ------------------------------------------------------------ 4. collect
New-Item -ItemType Directory -Force -Path $releases | Out-Null
$suffix = if ($Phone) { '-phone' } else { '' }

$apk = Join-Path $work 'android\app\build\outputs\apk\release\app-release.apk'
$out = Join-Path $releases "MyCampusView-v1.0.0$suffix.apk"
Copy-Item $apk $out -Force
Write-Host ("APK  {0}  {1:N1} MB" -f $out, ((Get-Item $out).Length / 1MB)) -ForegroundColor Green
Write-Host ("     SHA-256 {0}" -f (Get-FileHash $out -Algorithm SHA256).Hash.ToLower())

if ($Bundle) {
    $aab = Join-Path $work 'android\app\build\outputs\bundle\release\app-release.aab'
    $outB = Join-Path $releases 'MyCampusView-v1.0.0.aab'
    Copy-Item $aab $outB -Force
    Write-Host ("AAB  {0}  {1:N1} MB" -f $outB, ((Get-Item $outB).Length / 1MB)) -ForegroundColor Green
}
