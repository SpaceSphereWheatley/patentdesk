# Start-PatentDesk.ps1 - starter PatentDesk via en liten lokal server.
#
# Legg filen i samme mappe som PatentDesk.html. Snarvei (uten konsollvindu):
#   C:\Windows\System32\conhost.exe --headless C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "<mappe>\Start-PatentDesk.ps1"
#
# Serveren svarer bare på http://localhost og kan bare nås fra denne maskinen.
# Dokumentmappen stilles inn i PatentDesk (Innstillinger → Dokumentrot); den
# følger med i hver dokumentlenke (/docs?root=…&case=…&file=…).

# Ikke bytt port: dataene i nettleseren hører til http://localhost:8080.
$port = 8080

$appFolder = $PSScriptRoot
$url = "http://localhost:$port/PatentDesk.html"

# Stopp en server som allerede kjører, så endringer i dette skriptet tas i bruk.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*Start-PatentDesk.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Porten kan bruke litt tid på å bli ledig etter at den gamle serveren er stoppet.
$listener = $null
for ($i = 0; $i -lt 20 -and -not $listener; $i++) {
    $candidate = New-Object System.Net.HttpListener
    $candidate.Prefixes.Add("http://localhost:$port/")
    try {
        $candidate.Start()
        $listener = $candidate
    } catch {
        $candidate.Close()
        Start-Sleep -Milliseconds 250
    }
}

Start-Process "msedge.exe" $url
if (-not $listener) { exit }

# Dokumenttyper som kan hentes. Bare PDF-er vises i nettleseren; resten lastes
# ned. Andre typer (f.eks. HTML) avvises, så ingenting fra dokumentmappen kan
# kjøres som en del av PatentDesk.
$docTypes = @{
    '.pdf'  = 'application/pdf'
    '.doc'  = 'application/msword'
    '.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    '.odt'  = 'application/vnd.oasis.opendocument.text'
    '.xls'  = 'application/vnd.ms-excel'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    '.ppt'  = 'application/vnd.ms-powerpoint'
    '.pptx' = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    '.txt'  = 'text/plain'
    '.csv'  = 'text/csv'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
}
$appTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.json' = 'application/json'
    '.ico'  = 'image/x-icon'
}

# Fullstendig sti for <root>\<deler>, eller $null hvis den havner utenfor root
# (..\, kodede skilletegn, fulle stier, stasjonsbokstaver, alternative strømmer).
function Resolve-Inside([string]$root, [string[]]$parts) {
    if (-not $root) { return $null }
    foreach ($p in $parts) { if ($p -match ':') { return $null } }
    try {
        $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
        $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, ($parts -join '\')))
    } catch {
        return $null
    }
    if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $full }
    return $null
}

# Verdien til name i en spørrestreng (a=1&b=2), dekodet som UTF-8, eller $null.
function Get-QueryValue([string]$query, [string]$name) {
    foreach ($pair in $query.Split('&')) {
        $kv = $pair.Split('=', 2)
        if ($kv.Count -eq 2 -and $kv[0] -eq $name) { return [System.Uri]::UnescapeDataString($kv[1]) }
    }
    return $null
}

# Saksnummer og filnavn kan inneholde / eller \ (fil i en undermappe).
function Split-PathParts([string]$value) {
    return @($value -split '[\\/]' | Where-Object { $_ -ne '' })
}

function Send-Message($response, [int]$status, [string]$title, [string]$detail) {
    $enc = [System.Net.WebUtility]
    $html = "<!DOCTYPE html><meta charset=`"utf-8`"><title>PatentDesk</title>" +
            "<body style=`"font-family:Segoe UI,sans-serif;padding:2em`"><h2>" + $enc::HtmlEncode($title) +
            "</h2><p>" + $enc::HtmlEncode($detail) + "</p></body>"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
    $response.StatusCode = $status
    $response.ContentType = 'text/html; charset=utf-8'
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-File($response, [string]$path, [string]$type, [bool]$download) {
    $stream = [System.IO.File]::OpenRead($path)
    try {
        $response.ContentType = $type
        $response.AddHeader('X-Content-Type-Options', 'nosniff')
        if ($download) {
            $name = [System.Uri]::EscapeDataString([System.IO.Path]::GetFileName($path))
            $response.AddHeader('Content-Disposition', "attachment; filename*=UTF-8''$name")
        }
        $response.ContentLength64 = $stream.Length
        $stream.CopyTo($response.OutputStream)
    } finally {
        $stream.Dispose()
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $response = $context.Response
    try {
        # Hver del av stien dekodes for seg; Resolve-Inside holder resultatet
        # inne i app-mappen.
        $segments = @($context.Request.Url.AbsolutePath.TrimStart('/').Split('/') |
            ForEach-Object { Split-PathParts ([System.Uri]::UnescapeDataString($_)) })
        $raw = $context.Request.RawUrl
        $query = if ($raw.IndexOf('?') -ge 0) { $raw.Substring($raw.IndexOf('?') + 1) } else { '' }

        # Sec-Fetch-Site: same-origin = lenke i PatentDesk, none = adressefeltet.
        # Alt annet (en annen nettside som peker hit) avvises før filsystemet
        # røres, så ingen side kan få maskinen til å koble seg til en fremmed
        # nettverksmappe og sende påloggingen din dit.
        $fetchSite = $context.Request.Headers['Sec-Fetch-Site']
        $fromPatentDesk = $fetchSite -eq 'same-origin' -or $fetchSite -eq 'none'

        if ($segments.Count -eq 1 -and $segments[0] -eq 'docs' -and -not $fromPatentDesk) {
            Send-Message $response 403 'Ingen tilgang' 'Dokumenter kan bare åpnes fra PatentDesk.'
        } elseif ($segments.Count -eq 1 -and $segments[0] -eq 'docs') {
            $root = Get-QueryValue $query 'root'
            # En hel stasjon (S:\) kommer som S: - gjør den til en full sti.
            if ($root -match '^[A-Za-z]:$') { $root += '\' }
            $caseParts = Split-PathParts (Get-QueryValue $query 'case')
            $fileParts = Split-PathParts (Get-QueryValue $query 'file')
            # Roten må være en full sti: C:\… eller \\server\delt\…
            if (-not ($root -match '^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)') -or
                    $caseParts.Count -eq 0 -or $fileParts.Count -eq 0) {
                Send-Message $response 400 'Ugyldig dokumentlenke' `
                    'Sjekk Dokumentrot under Innstillinger i PatentDesk (f.eks. C:\Saker).'
            } else {
                # Først saksmappen inne i roten, så filen inne i saksmappen.
                $caseDir = Resolve-Inside $root $caseParts
                $path = if ($caseDir) { Resolve-Inside $caseDir $fileParts } else { $null }
                $ext = if ($path) { [System.IO.Path]::GetExtension($path).ToLowerInvariant() } else { '' }
                if (-not $path) {
                    Send-Message $response 403 'Ingen tilgang' 'Filen ligger utenfor saksmappen.'
                } elseif (-not $docTypes.ContainsKey($ext)) {
                    Send-Message $response 403 'Filtypen kan ikke åpnes' `
                        "Filer av typen «$ext» åpnes ikke via PatentDesk. Bruk «Kopier sti»."
                } elseif (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                    Send-Message $response 404 'Fant ikke filen' $path
                } else {
                    Send-File $response $path $docTypes[$ext] ($ext -ne '.pdf')
                }
            }
        } else {
            $path = Resolve-Inside $appFolder $segments
            if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) {
                $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
                $type = if ($appTypes.ContainsKey($ext)) { $appTypes[$ext] } else { 'application/octet-stream' }
                # no-cache: en ny PatentDesk.html brukes med en gang, uten gammel kopi
                $response.AddHeader('Cache-Control', 'no-cache')
                Send-File $response $path $type $false
            } else {
                Send-Message $response 404 'Fant ikke filen' ($segments -join '/')
            }
        }
    } catch {
        # F.eks. en låst fil, eller at fanen lukkes midt i en nedlasting.
        # Svar om mulig, og fortsett uansett med neste forespørsel.
        try { Send-Message $response 500 'Kunne ikke lese filen' $_.Exception.Message } catch { }
    } finally {
        try { $response.OutputStream.Close() } catch { }
    }
}
