# Lager snarveier til PatentDesk (skrivebord + Start-meny) som apner appen
# i eget Edge-vindu (app-modus) med PatentDesk-ikonet.
#
# Legg denne filen og PatentDesk.ico i samme mappe som PatentDesk.html, og kjor:
#   powershell -ExecutionPolicy Bypass -File .\Lag-PatentDesk-snarvei.ps1
#
# Ingen administratorrettigheter trengs. Kan kjores pa nytt nar som helst.

$ErrorActionPreference = 'Stop'

$html = Join-Path $PSScriptRoot 'PatentDesk.html'
$ico  = Join-Path $PSScriptRoot 'PatentDesk.ico'
foreach ($f in $html, $ico) {
  if (-not (Test-Path $f)) { throw "Finner ikke $f" }
}

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Finner ikke Microsoft Edge (msedge.exe).' }

# Ikonet kopieres ut av OneDrive, slik at det vises selv om OneDrive bare
# har filen "i skyen".
$iconDir = Join-Path $env:LOCALAPPDATA 'PatentDesk'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$iconCopy = Join-Path $iconDir 'PatentDesk.ico'
Copy-Item $ico $iconCopy -Force

# Samme file:-adresse som nar filen dobbeltklikkes, slik at nettleserdataene
# (localStorage/IndexedDB) er de samme.
$url = ([System.Uri]$html).AbsoluteUri

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs')
)
foreach ($dir in $targets) {
  $lnkPath = Join-Path $dir 'PatentDesk.lnk'
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath       = $edge
  $lnk.Arguments        = "--app=`"$url`""
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.IconLocation     = "$iconCopy,0"
  $lnk.Description      = 'PatentDesk'
  $lnk.Save()
  Write-Host "Laget: $lnkPath"
}
