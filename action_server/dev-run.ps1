#Requires -Version 5.1
<#
dev-run.ps1 - Windows runner for the attendance-bot action server.

Usage (run from this folder):
    .\dev-run.ps1 -r               start the action server (default port 5055)
    .\dev-run.ps1 -r -Port 5056    start it on a custom port
    .\dev-run.ps1 -Setup           create .venv and install requirements.txt

Plain .\dev-run.ps1 = -r. Long forms (-Run / -Port / -Setup) work too.
Set the ACTION_PORT environment variable to change the default port.
#>
param(
    [switch]$Run,
    [int]$Port = 5055,
    [switch]$Setup,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not $PSBoundParameters.ContainsKey("Port") -and $env:ACTION_PORT) {
    $Port = [int]$env:ACTION_PORT
}

function Show-Usage {
    Write-Host ""
    Write-Host "Usage: .\dev-run.ps1 [options]"
    Write-Host ""
    Write-Host "  -r, -Run            start the action server on port 5055 (default)"
    Write-Host "  -Port N             listen on port N instead of 5055"
    Write-Host "  -Setup              create a virtual environment (.venv) and install"
    Write-Host "                      requirements.txt into it"
    Write-Host "  -Help               show this help"
    Write-Host ""
    Write-Host "The server starts with --auto-reload: changes to actions.py are picked"
    Write-Host "up on the next request without restarting anything."
    Write-Host ""
}

if ($Help) { Show-Usage; exit 0 }

function Find-Python {
    foreach ($candidate in @(
        "$ScriptDir\.venv\Scripts\python.exe",
        "$ScriptDir\venv\Scripts\python.exe",
        "$ScriptDir\..\venv\Scripts\python.exe"
    )) {
        if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
    }
    return $null
}

$py = Find-Python

if ($Setup) {
    Write-Host "==> Creating virtual environment in $ScriptDir\.venv"
    if ($py) {
        $baseExe = $py; $baseArgs = @()
    } else {
        $baseExe = $null; $baseArgs = @()
        try {
            & py -3.10 -c "import sys" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $baseExe = "py"; $baseArgs = @("-3.10") }
        } catch { }
        if (-not $baseExe) { $baseExe = "python" }
    }
    & $baseExe @baseArgs -m venv .venv
    & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
    & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
    Write-Host "==> Done. Start the server with: .\dev-run.ps1 -r"
    exit $LASTEXITCODE
}

if (-not $py) {
    $py = "python"
    Write-Host "==> No virtual environment found - falling back to 'python'."
    Write-Host "    Run '.\dev-run.ps1 -Setup' to create one."
}

Write-Host "==> Starting action server on port $Port"
Write-Host "    python: $py"
& $py -m rasa run actions --port $Port --auto-reload
