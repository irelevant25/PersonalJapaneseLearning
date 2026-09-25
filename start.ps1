# ============================================================
# Japanese Academy - Launcher
# Windows / PowerShell
#
# Finds PHP (8.1 or newer, with pdo_pgsql, mbstring and intl), runs
# setup.php (database settings the first time; then the database, its
# tables and the study content), starts the server and opens the browser.
# Ctrl+C stops it.
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectName = "Japanese Academy"

# The first start builds the study content in the database (a few seconds).
$ServerStartupTimeoutSeconds = 60

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-WarningMessage {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-ErrorMessage {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Stop-Script {
    param([string]$Message)

    Write-Host ""
    Write-ErrorMessage "ERROR: $Message"
    Write-Host ""

    # Started by a double-click, the window would close before this could be read.
    Read-Host "Press Enter to close" | Out-Null
    exit 1
}

function Ask-YesNo {
    param([string]$Question)

    while ($true) {
        $answer = Read-Host "$Question [Y/n]"

        if ([string]::IsNullOrWhiteSpace($answer)) {
            return $true
        }

        switch ($answer.ToLowerInvariant()) {
            "y"     { return $true }
            "yes"   { return $true }
            "n"     { return $false }
            "no"    { return $false }
            default {
                Write-Host "Please answer Y or N."
            }
        }
    }
}

# A native command's output, whatever it writes to stderr (PHP 7 warns there).
function Get-Output {
    param([string]$Exe, [string[]]$Arguments)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        return (& $Exe @Arguments 2>$null | Out-String)
    }
    catch {
        return ""
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

# "" when this PHP can run the app, else the reason it can't.
function Test-Php {
    param([string]$Php)

    $version = Get-Output $Php @("-v")
    if ($version -notmatch '(?m)^PHP (\d+)\.(\d+)\.(\S+)') {
        return "does not run"
    }
    $found = "PHP $($Matches[1]).$($Matches[2]).$($Matches[3])"
    if ([int]$Matches[1] -lt 8 -or ([int]$Matches[1] -eq 8 -and [int]$Matches[2] -lt 1)) {
        return "$found is too old"
    }

    $modules = Get-Output $Php @("-m")
    $missing = @("pdo_pgsql", "mbstring", "intl") | Where-Object { $modules -notmatch "(?mi)^$_\s*$" }
    if ($missing) {
        return "$found lacks $($missing -join ', ')"
    }
    return ""
}

# Every php.exe worth trying: ACADEMY_PHP, PATH, the usual install folders.
function Get-PhpCandidates {
    $list = New-Object System.Collections.Generic.List[string]

    if ($env:ACADEMY_PHP) {
        $list.Add($env:ACADEMY_PHP)
    }

    Get-Command php.exe -All -CommandType Application -ErrorAction SilentlyContinue |
        ForEach-Object { $list.Add($_.Source) }

    $folders = @("C:\php", "C:\xampp\php",
        "$env:USERPROFILE\scoop\apps\php\current",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links")
    foreach ($parent in @("C:\", "C:\tools", "C:\laragon\bin\php", "$env:LOCALAPPDATA\Microsoft\WinGet\Packages")) {
        Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^(php|PHP\.PHP)' } |
            Sort-Object Name -Descending |
            ForEach-Object { $folders += $_.FullName }
    }
    foreach ($folder in $folders) {
        $exe = Join-Path $folder "php.exe"
        if (Test-Path -LiteralPath $exe -PathType Leaf) {
            $list.Add($exe)
        }
    }

    return $list | Select-Object -Unique
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

Clear-Host

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
Write-Host "  $ProjectName" -ForegroundColor White
Write-Host "  Launcher" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path "server.php" -PathType Leaf) -or -not (Test-Path "setup.php" -PathType Leaf)) {
    Stop-Script "server.php or setup.php is missing. This script belongs in the $ProjectName folder."
}

# ------------------------------------------------------------
# 2. PHP
# ------------------------------------------------------------

Write-Info "Looking for PHP 8.1+ with pdo_pgsql, mbstring and intl..."

$Php = $null
$tried = @()

foreach ($candidate in Get-PhpCandidates) {
    $problem = Test-Php $candidate
    if (-not $problem) {
        $Php = $candidate
        break
    }
    $tried += "    $candidate  ($problem)"
}

if (-not $Php) {
    $triedText = if ($tried) { "Tried:`n" + ($tried -join "`n") + "`n`n" } else { "" }
    Stop-Script @"
No PHP 8.1 or newer with the extensions pdo_pgsql, mbstring and intl was found.

$triedText
To install it:
  1. Download PHP 8 for Windows (the x64 Thread Safe zip) from
     https://windows.php.net/download
  2. Unzip it, e.g. to C:\php, and add that folder to PATH.
  3. In that folder, copy php.ini-production to php.ini and turn these on
     (remove the ; in front of each line):
         extension_dir = "ext"
         extension=curl
         extension=intl
         extension=mbstring
         extension=pdo_pgsql

Or set ACADEMY_PHP to the php.exe to use. Then run this launcher again.
"@
}

Write-Success "PHP: $Php"
Write-Host ""

# ------------------------------------------------------------
# 3. The database
# ------------------------------------------------------------

Write-Info "Checking the database..."
Write-Host ""

# The first time, setup.php asks for the database settings. After that it
# only does what is still missing: the database, its tables, the study
# content, and the one-time import of your old progress files.
& $Php setup.php

if ($LASTEXITCODE -ne 0) {
    Stop-Script @"
Setup did not finish: the message above says why.

If it is about the database: PostgreSQL must be installed and running
(https://www.postgresql.org/download/windows/), and its settings are in
src\config.local.php. To enter them again, delete that file and run this
launcher again.
"@
}

Write-Host ""

$AppUrl = (Get-Output $Php @("server.php", "--url")).Trim()

if ($AppUrl -notmatch '^http://([^:/]+):(\d+)$') {
    Stop-Script "Could not read the server's address from src/config.php."
}

$AppPort = [int]$Matches[2]

# ------------------------------------------------------------
# 4. Start
# ------------------------------------------------------------

try {
    $health = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
        Write-Success "$ProjectName is already running."
        Start-Process $AppUrl
        exit 0
    }
}
catch {
    # not running yet
}

Write-Host "==============================================" -ForegroundColor White
Write-Host "  Ready" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""
Write-Host "PHP: $Php"
Write-Host "URL: $AppUrl"
Write-Host ""

if (-not (Ask-YesNo "Start $ProjectName now?")) {
    Write-Host ""
    Write-Success "Setup complete."
    Write-Host ""
    exit 0
}

$busy = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($busy) {
    $owner = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
    Stop-Script @"
Port $AppPort is taken by $($owner.ProcessName) (process $($busy.OwningProcess)).

If that is an older copy of this app, close its window, or stop it with:
    Stop-Process -Id $($busy.OwningProcess)
"@
}

Write-Host ""
Write-Info "Starting $ProjectName..."

# The server shares this window's console, so Ctrl+C or closing the window
# stops it too; its output goes to files.
$TempDirectory = Join-Path $env:TEMP "JapaneseAcademy"
$StdOutFile = Join-Path $TempDirectory "server.stdout.log"
$StdErrFile = Join-Path $TempDirectory "server.stderr.log"

if (-not (Test-Path $TempDirectory)) {
    New-Item -ItemType Directory -Path $TempDirectory -Force | Out-Null
}

Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue

$serverProcess = Start-Process `
    -FilePath $Php `
    -ArgumentList "server.php" `
    -WorkingDirectory $PSScriptRoot `
    -NoNewWindow `
    -RedirectStandardOutput $StdOutFile `
    -RedirectStandardError $StdErrFile `
    -PassThru

try {
    Write-Info "Waiting for $AppUrl..."

    $serverReady = $false
    $startTime = Get-Date

    while (((Get-Date) - $startTime).TotalSeconds -lt $ServerStartupTimeoutSeconds) {

        Start-Sleep -Milliseconds 500

        if ($serverProcess.HasExited) {
            break
        }

        try {
            $response = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $serverReady = $true
                break
            }
        }
        catch {
            # not ready yet
        }
    }

    if (-not $serverReady) {
        Write-ErrorMessage "The server did not start."
        Write-Host ""
        if (Test-Path $StdOutFile) { Get-Content $StdOutFile -Encoding UTF8 }
        if (Test-Path $StdErrFile) { Get-Content $StdErrFile -Encoding UTF8 | Select-Object -Last 20 }
        Write-Host ""
        Read-Host "Press Enter to close" | Out-Null
        exit 1
    }

    Write-Success "Server is ready."
    Write-Host ""

    # what the server says about itself: items, questions, the day's backup
    # (PHP writes UTF-8; Windows PowerShell would read the file in the system code page)
    if (Test-Path $StdOutFile) {
        Get-Content $StdOutFile -Encoding UTF8
    }

    Write-Info "Opening $AppUrl..."
    Start-Process $AppUrl

    Write-Host ""
    Write-Success "$ProjectName is running."
    Write-Host ""
    Write-Host "Press Ctrl+C (or close this window) to stop it."
    Write-Host ""

    while (-not $serverProcess.HasExited) {
        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Ctrl+C lands here too. server.php runs PHP's web server as a child
    # process: stop both.
    if (-not $serverProcess.HasExited) {
        # It may exit in the meantime; taskkill's complaint must not stop the cleanup.
        try {
            & taskkill.exe /PID $serverProcess.Id /T /F 2>$null | Out-Null
        }
        catch {
            # already stopped
        }
    }
    Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue
}

exit 0
