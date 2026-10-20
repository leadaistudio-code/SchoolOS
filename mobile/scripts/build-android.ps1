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

.PARAMETER Arches
  Explicit comma-separated CPU list, e.g. 'arm64-v8a,armeabi-v7a' (every real
  phone, no emulators). Overrides -Phone and -All.

.PARAMETER MaxWorkers
  Cap on parallel Gradle tasks. The native compile otherwise saturates every
  core; lower it on a machine that is unstable under sustained full load.

.EXAMPLE
  .\mobile\scripts\build-android.ps1 -Phone
  .\mobile\scripts\build-android.ps1 -All -Bundle
  .\mobile\scripts\build-android.ps1 -Arches 'arm64-v8a,armeabi-v7a' -MaxWorkers 2 -Bundle
#>
param(
    [switch]$Phone,
    [switch]$All,
    [switch]$Bundle,
    [string]$Arches,
    [int]$MaxWorkers = 0
)

$ErrorActionPreference = 'Stop'

$repo     = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source   = Join-Path $repo 'mobile'
$work     = 'C:\mcvbuild'
$releases = Join-Path $repo 'releases'
$sdk      = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk" }
if (-not $Phone -and -not $All) { $All = $true }

$version = (Get-Content (Join-Path $source 'app.json') -Raw | ConvertFrom-Json).expo.version
$arches = if ($Arches) { $Arches } elseif ($Phone) { 'arm64-v8a' } else { 'armeabi-v7a,arm64-v8a,x86,x86_64' }
Write-Host "Building for: $arches" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. mirror
Write-Host 'Copying to a path without spaces...' -ForegroundColor Cyan
# Absolute paths: a bare name such as 'dist' would also skip every package in
# node_modules that ships its code in a dist/ folder. '.cxx' stays bare: it is
# only ever a native build cache, and keeping it saves a full C++ rebuild.
robocopy $source $work /MIR `
    /XD (Join-Path $source 'android\build') (Join-Path $source 'android\.gradle') `
        '.cxx' (Join-Path $source '.expo') (Join-Path $source 'dist') `
    /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
# robocopy uses 0-7 for success; 8+ is a real failure.
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy code $LASTEXITCODE)" }

# The SDK path must escape its drive colon: a Java .properties file treats
# "C:\Users" as an escape sequence and silently yields a path that is not there.
$escaped = ($sdk -replace '\\', '/') -replace '^C:', 'C\:'
Set-Content -Path (Join-Path $work 'android\local.properties') -Value "sdk.dir=$escaped" -Encoding ascii

# keystore.properties must live at android/keystore.properties (not android/app/).
$keystoreRoot = Join-Path $work 'android\keystore.properties'
$keystoreApp  = Join-Path $work 'android\app\keystore.properties'
if (-not (Test-Path $keystoreRoot) -and (Test-Path $keystoreApp)) {
    Copy-Item $keystoreApp $keystoreRoot -Force
    Write-Host 'Copied android/app/keystore.properties -> android/keystore.properties' -ForegroundColor Yellow
}
if (-not (Test-Path $keystoreRoot)) {
    Write-Warning 'No android/keystore.properties — release will be signed with the debug key (Play upload will fail).'
}

# Expo prebuild resets signing; re-apply the release keystore block every build.
$gradleFile = Join-Path $work 'android\app\build.gradle'
$snippet    = Get-Content (Join-Path $PSScriptRoot 'android-signing.gradle.snippet') -Raw
$gradle     = Get-Content $gradleFile -Raw
$pattern    = '(?ms)^    signingConfigs \{.*?^        release \{\r?\n            // Caution!.*?^            signingConfig signingConfigs\.debug\r?\n'
if ($gradle -match $pattern) {
    Set-Content -Path $gradleFile -Value ($gradle -replace $pattern, $snippet) -NoNewline
    Write-Host 'Applied release signing config to android/app/build.gradle' -ForegroundColor Cyan
} elseif ($gradle -notmatch 'hasReleaseKeystore') {
    throw 'Could not patch android/app/build.gradle for release signing — layout changed after prebuild.'
}

# Third-party Android projects whose published build files no longer configure
# under Gradle 9 / AGP 8. Patched in the mirror only; node_modules stays as installed.
$voiceDir = Join-Path $work 'node_modules\@react-native-voice\voice\android'
if (Test-Path $voiceDir) {
    $voicePatch = Join-Path $PSScriptRoot 'patches\react-native-voice'
    Copy-Item (Join-Path $voicePatch 'build.gradle') (Join-Path $voiceDir 'build.gradle') -Force
    Copy-Item (Join-Path $voicePatch 'AndroidManifest.xml') (Join-Path $voiceDir 'src\main\AndroidManifest.xml') -Force
    Write-Host 'Applied Gradle patch to @react-native-voice/voice' -ForegroundColor Cyan
}

# ------------------------------------------------------- 2. clear JS cache
# The autolinking cache stores absolute library paths. One written by a build
# in the original folder points Gradle back at the spaced path and unpatched
# node_modules, and it is only invalidated when the lockfile changes.
Remove-Item -Recurse -Force `
    (Join-Path $work 'android\build\generated\autolinking'), `
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
    $extra = @()
    if ($MaxWorkers -gt 0) { $extra += "--max-workers=$MaxWorkers" }
    & .\gradlew.bat @tasks "-PreactNativeArchitectures=$arches" --no-daemon @extra
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
$out = Join-Path $releases "MyCampusView-v$version$suffix.apk"
Copy-Item $apk $out -Force
Write-Host ("APK  {0}  {1:N1} MB" -f $out, ((Get-Item $out).Length / 1MB)) -ForegroundColor Green
Write-Host ("     SHA-256 {0}" -f (Get-FileHash $out -Algorithm SHA256).Hash.ToLower())

$apksigner = Get-ChildItem -Path (Join-Path $sdk 'build-tools') -Recurse -Filter 'apksigner.bat' |
    Sort-Object FullName -Descending | Select-Object -First 1
if ($apksigner) {
    $cert = & $apksigner.FullName verify --print-certs $out 2>&1 |
        Select-String -Pattern 'Signer #1 certificate SHA-1 digest:' |
        ForEach-Object { ($_ -replace '.*digest:\s*', '').Trim() }
    if ($cert) {
        Write-Host ("     Upload cert SHA-1 {0}" -f $cert) -ForegroundColor Cyan
        Write-Host '     Play expects SHA-1 E3:A5:55:E6:36:AB:24:14:BA:47:E0:03:89:AC:2D:22:DD:7C:D9:5F' -ForegroundColor DarkGray
    }
}

if ($Bundle) {
    $aab = Join-Path $work 'android\app\build\outputs\bundle\release\app-release.aab'
    $outB = Join-Path $releases "MyCampusView-v$version.aab"
    Copy-Item $aab $outB -Force
    Write-Host ("AAB  {0}  {1:N1} MB" -f $outB, ((Get-Item $outB).Length / 1MB)) -ForegroundColor Green
    Write-Host '     Upload this .aab to Google Play Console.' -ForegroundColor DarkGray
}
