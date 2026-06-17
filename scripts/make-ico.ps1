# Gera build/icon.ico (multi-resolucao 16..256) a partir de src/assets/icon.png.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/make-ico.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $root "src\assets\icon.png"
$icoPath = Join-Path $root "build\icon.ico"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = @()
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $s, $s)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , ($ms.ToArray())
  $bmp.Dispose()
}
$src.Dispose()

$fs = [System.IO.File]::Open($icoPath, "Create")
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $len = $pngs[$i].Length
  $wb = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([Byte]$wb); $bw.Write([Byte]$wb); $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$len); $bw.Write([UInt32]$offset)
  $offset += $len
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Flush(); $bw.Close(); $fs.Close()
Write-Host "build/icon.ico gerado ($([math]::Round((Get-Item $icoPath).Length/1KB,1)) KB)"
