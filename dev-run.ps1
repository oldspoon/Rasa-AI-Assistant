#Requires -Version 5.1
<#
dev-run.ps1 - Windows runner for the attendance-bot Rasa project.

Usage (run from this folder):
    .\dev-run.ps1 -r          start the Rasa server (REST API on http://localhost:5005)
    .\dev-run.ps1 -t          train a model into models\
    .\dev-run.ps1 -b          build: validate the training data, then train every
                              story in data\stories\ into a fresh model
    .\dev-run.ps1 -i          inspect mode: talk to the bot while seeing the
                              model's predictions at each step
    .\dev-run.ps1 -Setup      create .venv and install requirements.txt

Plain .\dev-run.ps1 = -r. Long forms (-Run / -Train / -Build / -Interactive /
-Setup) work too.

The action server (..\action_server) must be running for the custom actions
to work - endpoints.yml points at http://localhost:5055/webhook.

Chat with the bot while the server runs:
    ..\venv\Scripts\python.exe -m rasa shell
#>
param(
    [switch]$Run,
    [switch]$Train,
    [switch]$Build,
    [switch]$Interactive,
    [switch]$Setup,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Show-Usage {
    Write-Host ""
    Write-Host "Usage: .\dev-run.ps1 [options]"
    Write-Host ""
    Write-Host "  -r, -Run            start the Rasa server (REST API on"
    Write-Host "                      http://localhost:5005) - default"
    Write-Host "  -t, -Train          train a model into models\"
    Write-Host "  -b, -Build          build all stories: validate the training data"
    Write-Host "                      and train a fresh model into models\"
    Write-Host "  -i, -Interactive    inspect mode: chat with the bot while seeing"
    Write-Host "                      what the model predicts at every step"
    Write-Host "  -Setup              create a virtual environment (.venv) and install"
    Write-Host "                      requirements.txt into it"
    Write-Host "  -Help               show this help"
    Write-Host ""
    Write-Host "Chat with the bot while the server runs:"
    Write-Host "  .\dev-run.ps1 -i    inspect mode (chat + predictions)"
    Write-Host "  ..\venv\Scripts\python.exe -m rasa shell   plain chat"
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
    Write-Host "==> Done. Start with: .\dev-run.ps1 -r"
    exit $LASTEXITCODE
}

if (-not $py) {
    $py = "python"
    Write-Host "==> No virtual environment found - falling back to 'python'."
    Write-Host "    Run '.\dev-run.ps1 -Setup' to create one."
}

if ($Build) {
    Write-Host "==> Building: validating the training data (domain, NLU, all stories)"
    Write-Host "    python: $py"
    & $py -m rasa data validate
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $stories = @(Get-ChildItem -Path "data\stories" -Filter "*.yml" | Sort-Object Name)
    Write-Host "==> Training all $($stories.Count) stories from data\stories\ into models\"
    $stories | ForEach-Object { Write-Host "      $($_.Name)" }
    & $py -m rasa train
} elseif ($Interactive) {
    Write-Host "==> Inspect mode: interactive chat showing the model's predictions"
    Write-Host "    python: $py"
    Write-Host "    (custom actions need the action server: ..\action_server -> .\dev-run.ps1 -r)"
    Write-Host "    (internal UI server is on port 5006, so a 5005 dev server can keep running)"
    & $py -m rasa interactive -m models --skip-visualization --port 5006
} elseif ($Train) {
    Write-Host "==> Training a model into models\"
    Write-Host "    python: $py"
    & $py -m rasa train
} else {
    Write-Host "==> Starting Rasa server (REST channel + API) on http://localhost:5005"
    Write-Host "    python: $py"
    Write-Host "    (custom actions need the action server too: ..\action_server -> .\dev-run.ps1 -r)"
    & $py -m rasa run --enable-api
}
