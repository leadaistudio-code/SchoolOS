# Builds MyCampusView-CCTV-Relay.exe and copies it to public/downloads.
#   powershell -ExecutionPolicy Bypass -File tools/cctv-relay/build.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..')
Set-Location $here

# MediaMTX must match src/lib/cctv.ts RELAY_VERSION. The hash is the one
# published in the release's checksums.sha256.
$mtxVersion = 'v1.21.1'
$mtxSha256 = 'faa97974861eb75a68b5aa326c78e7e7a6f670b5ef191bace78e715130381f23'
$zip = Join-Path $here 'vendor\mediamtx.zip'
New-Item -ItemType Directory -Force (Join-Path $here 'vendor') | Out-Null
if (-not (Test-Path $zip)) {
  $url = "https://github.com/bluenviron/mediamtx/releases/download/$mtxVersion/mediamtx_${mtxVersion}_windows_amd64.zip"
  Write-Host "Downloading MediaMTX $mtxVersion"
  Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
}
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $mtxSha256) { Remove-Item $zip; throw "MediaMTX checksum mismatch ($actual). Download removed." }

# App icon and header logo from the brand mark.
$assets = Join-Path $here 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'public\brand\icon-512.png'))
function Resize([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}
[IO.File]::WriteAllBytes((Join-Path $assets 'logo.png'), (Resize 128))

# ICO with PNG-compressed entries (supported since Windows Vista).
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$images = @($sizes | ForEach-Object { ,(Resize $_) })
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $len = $images[$i].Length
  $dim = if ($s -ge 256) { 0 } else { $s }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$len); $w.Write([UInt32]$offset)
  $offset += $len
}
foreach ($img in $images) { $w.Write($img) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $assets 'app.ico'), $ico.ToArray())
$src.Dispose()

dotnet publish CctvRelay.csproj -c Release -o (Join-Path $here 'out') --nologo
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

$dest = Join-Path $root 'public\downloads'
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $here 'out\MyCampusView-CCTV-Relay.exe') (Join-Path $dest 'MyCampusView-CCTV-Relay.exe') -Force
$size = [math]::Round((Get-Item (Join-Path $dest 'MyCampusView-CCTV-Relay.exe')).Length / 1MB, 1)
Write-Host "Built public/downloads/MyCampusView-CCTV-Relay.exe ($size MB)"
