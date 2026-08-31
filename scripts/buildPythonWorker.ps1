$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $repositoryRoot "packages\ai_agents"
$virtualEnvironment = Join-Path $repositoryRoot ".build\python-worker-venv"
$distributionRoot = Join-Path $repositoryRoot "build\python-worker"
$workRoot = Join-Path $repositoryRoot ".build\python-worker-work"
$specRoot = Join-Path $repositoryRoot ".build\python-worker-spec"

function Assert-CommandSucceeded([string]$description) {
    if ($LASTEXITCODE -ne 0) {
        throw "$description failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $virtualEnvironment "Scripts\python.exe"))) {
    $environmentCreated = $false
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
        & $pythonLauncher.Source -3 -m venv $virtualEnvironment
        $environmentCreated = $LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path $virtualEnvironment "Scripts\python.exe"))
    }

    if (-not $environmentCreated) {
        $pythonLauncher = Get-Command python -ErrorAction Stop
        & $pythonLauncher.Source -m venv $virtualEnvironment
        Assert-CommandSucceeded "Creating the Python build environment"
    }
}

$python = Join-Path $virtualEnvironment "Scripts\python.exe"
& $python -m pip install --upgrade pip
Assert-CommandSucceeded "Upgrading pip"
& $python -m pip install -r (Join-Path $packageRoot "requirements.txt") -r (Join-Path $packageRoot "build-requirements.txt")
Assert-CommandSucceeded "Installing Python worker dependencies"

# Playwright documents PLAYWRIGHT_BROWSERS_PATH=0 for embedding browser binaries
# in a standalone PyInstaller executable.
$previousBrowserPath = $env:PLAYWRIGHT_BROWSERS_PATH
try {
    $env:PLAYWRIGHT_BROWSERS_PATH = "0"
    & $python -m playwright install chromium
    Assert-CommandSucceeded "Installing Playwright Chromium"

    & $python -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --name "ai-agents-worker" `
        --distpath $distributionRoot `
        --workpath $workRoot `
        --specpath $specRoot `
        --paths $packageRoot `
        --paths (Join-Path $packageRoot "src") `
        --collect-all playwright `
        --add-data "$(Join-Path $packageRoot "src\ai_agents\prompts");ai_agents/prompts" `
        (Join-Path $packageRoot "worker.py")
    Assert-CommandSucceeded "Building the standalone Python worker"
}
finally {
    $env:PLAYWRIGHT_BROWSERS_PATH = $previousBrowserPath
}

$worker = Join-Path $distributionRoot "ai-agents-worker.exe"
if (-not (Test-Path -LiteralPath $worker)) {
    throw "PyInstaller did not produce $worker"
}

Write-Host "Standalone AI Agents worker created at $worker"
