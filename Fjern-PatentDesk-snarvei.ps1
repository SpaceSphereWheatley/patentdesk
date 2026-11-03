# Omgjor Lag-PatentDesk-snarvei.ps1:
#   - fjerner Edge-snarveiene (skrivebord + Start-meny) som det scriptet laget
#   - fjerner ikonkopien i %LOCALAPPDATA%\PatentDesk
#   - lager en vanlig snarvei pa skrivebordet som apner PatentDesk.html direkte
#     (som for scriptet ble kjort)
#
# Legg denne filen i samme mappe som PatentDesk.html, og kjor:
#   powershell -ExecutionPolicy Bypass -File .\Fjern-PatentDesk-snarvei.ps1
#
# Vil du bare fjerne snarveiene uten a lage en ny, legg til -IngenNySnarvei.
#
# Bare snarveier som peker til msedge.exe med --app=...PatentDesk.html blir
# slettet; andre filer som heter PatentDesk.lnk blir latt i fred.
# Ingen administratorrettigheter trengs. Saksdataene dine blir ikke rort.

param([switch]$IngenNySnarvei)

$ErrorActionPreference = 'Stop'

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')

foreach ($dir in $desktop, $programs) {
  $lnkPath = Join-Path $dir 'PatentDesk.lnk'
  if (-not (Test-Path $lnkPath)) { continue }
  $lnk = $shell.CreateShortcut($lnkPath)
  $fraScriptet = ($lnk.TargetPath -like '*\msedge.exe') -and
                 ($lnk.Arguments -like '--app=*PatentDesk.html*')
  if ($fraScriptet) {
    Remove-Item $lnkPath -Force
    Write-Host "Fjernet: $lnkPath"
  } else {
    Write-Host "Lot sta (ikke laget av scriptet): $lnkPath"
  }
}

$iconDir = Join-Path $env:LOCALAPPDATA 'PatentDesk'
$iconCopy = Join-Path $iconDir 'PatentDesk.ico'
if (Test-Path $iconCopy) {
  Remove-Item $iconCopy -Force
  Write-Host "Fjernet: $iconCopy"
}
if ((Test-Path $iconDir) -and -not (Get-ChildItem $iconDir -Force)) {
  Remove-Item $iconDir -Force
}

if ($IngenNySnarvei) { return }

$html = Join-Path $PSScriptRoot 'PatentDesk.html'
if (-not (Test-Path $html)) {
  Write-Warning "Finner ikke $html - lager ingen ny snarvei. Legg scriptet i samme mappe som PatentDesk.html og kjor det pa nytt."
  return
}

$lnkPath = Join-Path $desktop 'PatentDesk.lnk'
if (Test-Path $lnkPath) {
  Write-Host "Det finnes allerede en snarvei som ikke ble fjernet: $lnkPath - lager ingen ny."
  return
}
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $html
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Description      = 'PatentDesk'
$lnk.Save()
Write-Host "Laget vanlig snarvei: $lnkPath"
