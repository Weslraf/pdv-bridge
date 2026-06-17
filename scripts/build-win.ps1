# Pipeline completo de build no Windows com icone correto no .exe.
#
# Por que existe: com "signAndEditExecutable": false (evita baixar o winCodeSign,
# que falha ao extrair symlinks sem privilegio de admin), o electron-builder NAO
# embute o icone no executavel. Entao empacotamos, aplicamos o icone via rcedit e
# remontamos o instalador a partir do pacote ja editado.
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts/build-win.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "==> 1/4 Gerando icon.png e icon.ico"
& "$root\node_modules\electron\dist\electron.exe" "$root\scripts\make-icon.js"
Copy-Item "$root\build\icon.png" "$root\src\assets\icon.png" -Force
powershell -ExecutionPolicy Bypass -File "$root\scripts\make-ico.ps1"

Write-Host "==> 2/4 Empacotando app (electron-builder)"
npm run build

Write-Host "==> 3/4 Aplicando icone no executavel (rcedit)"
$rcedit = Get-ChildItem "$root\node_modules" -Recurse -Filter "rcedit*.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $rcedit) {
  $rcedit = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Filter "rcedit-x64.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $rcedit) { throw "rcedit nao encontrado." }
$exe = Join-Path $root "dist\win-unpacked\Uno Print.exe"
& $rcedit $exe --set-icon (Join-Path $root "build\icon.ico")

Write-Host "==> 4/4 Remontando instalador a partir do pacote editado"
npx electron-builder --win nsis --prepackaged "$root\dist\win-unpacked" --publish never

$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
Write-Host "Pronto: dist\Uno-Print-Setup-$($pkg.version).exe"
