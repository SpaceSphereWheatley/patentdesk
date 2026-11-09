# Start-PatentDesk.ps1 - starter PatentDesk via en liten lokal server.
#
# Legg filen i samme mappe som PatentDesk.html. Snarvei (uten konsollvindu):
#   C:\Windows\System32\conhost.exe --headless C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "<mappe>\Start-PatentDesk.ps1"
#
# Serveren svarer bare på http://localhost og kan bare nås fra denne maskinen.

# --- Innstillinger -----------------------------------------------------------
# Samme mappe som «Dokumentrot» under Innstillinger i PatentDesk. Dokumentene
# hentes fra <docRoot>\<saksnummer>\<fil>. Tom = dokumentlenkene virker ikke.
$docRoot = ""

# Ikke bytt port: dataene i nettleseren hører til http://localhost:8080.
$port = 8080
# -----------------------------------------------------------------------------

$appFolder = $PSScriptRoot
$url = "http://localhost:$port/PatentDesk.html"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    # Serveren kjører allerede (porten er i bruk): bare åpne appen.
    Start-Process "msedge.exe" $url
    exit
}

Start-Process "msedge.exe" $url

# Typer som kan vises i nettleseren. Alt annet sendes som nedlasting, slik at
# f.eks. en HTML-fil i dokumentmappen aldri kjøres som en del av PatentDesk.
$docTypes = @{
    '.pdf' = 'application/pdf'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.gif' = 'image/gif'; '.bmp' = 'image/bmp'
    '.txt' = 'text/plain; charset=utf-8'
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
        # Hver del dekodes for seg, så %2F og %5C i et filnavn ikke blir skilletegn.
        $segments = @($context.Request.Url.AbsolutePath.TrimStart('/').Split('/') |
            Where-Object { $_ -ne '' } |
            ForEach-Object { [System.Uri]::UnescapeDataString($_) })
        foreach ($s in $segments) { if ($s -match '[\\/]') { $segments = $null; break } }

        if ($null -eq $segments) {
            Send-Message $response 403 'Ugyldig adresse' 'Adressen inneholder ulovlige tegn.'
        } elseif ($segments.Count -ge 1 -and $segments[0] -eq 'docs') {
            $rest = @($segments | Select-Object -Skip 1)
            if (-not $docRoot) {
                Send-Message $response 404 'Dokumentmappen er ikke satt' `
                    'Fyll inn $docRoot øverst i Start-PatentDesk.ps1 og start PatentDesk på nytt.'
            } elseif ($rest.Count -lt 2) {
                Send-Message $response 404 'Fant ikke filen' ($rest -join '\')
            } else {
                $path = Resolve-Inside $docRoot $rest
                if (-not $path) {
                    Send-Message $response 403 'Ingen tilgang' 'Filen ligger utenfor dokumentmappen.'
                } elseif (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                    Send-Message $response 404 'Fant ikke filen' $path
                } else {
                    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
                    if ($docTypes.ContainsKey($ext)) {
                        Send-File $response $path $docTypes[$ext] $false
                    } else {
                        Send-File $response $path 'application/octet-stream' $true
                    }
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
