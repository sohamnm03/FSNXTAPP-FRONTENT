<#
.SYNOPSIS
    Runs a GUI-lane test case end to end - preflight, execution, run file,
    dashboard - with nothing left for a person to decide mid-run.

.DESCRIPTION
    scripts/run-case.ps1 for the other lane. Until TC-014 there was no
    frozen-script equivalent for SAP GUI for Windows at all: the lane was driven
    through the MCP server, which means a model read every screen and
    transcribed the result file afterwards. docs/unattended-runs.md § The GUI
    lane scoped this from that run; this is it.

    The engine underneath is not new. `sap-gui`'s MCP server is a thin protocol
    wrapper around a plain, importable Python class
    (mcp_sap_gui.sap_controller.SAPGUIController). gui_tests/ imports that class
    directly and drives it, the same way this script's web-lane sibling drives
    Playwright directly rather than through a browser-automation model.

    What it does, in order:

      * resolves the case from config/gui-runs.json (an unknown case is refused,
        not guessed at);
      * refuses to start on top of a live run lock, naming the pid holding it -
        the 2026-08-18 duplicate-write incident is why this exists;
      * states every database write the case makes and waits for a yes, unless
        -Yes was passed (CLAUDE.md rule 3);
      * confirms the session is the expected system/client before the first
        write and at every t-code (rule 1), and refuses anything that is not;
      * drives SAP, recording each step to a journal as it goes;
      * renders results/TC-*.md from that journal - emitted by the run, never
        transcribed - and rebuilds results/dashboard.html.

    Read-only by itself. Every write in a run comes from the case's own module.

.PARAMETER Case
    Case id, e.g. TC-014. See -List.

.PARAMETER Stage
    How far to run a staged case. Defaults to the case's defaultStage - the
    whole flow.

.PARAMETER Rows
    Dataset row id(s) for a data-driven case, comma separated, or "all". Only
    meaningful for a case that has a dataset; passing it to a case that does not
    is refused rather than ignored. Defaults to the case's defaultRows.

.PARAMETER Resume
    An existing document number. Skips the create step and works on that
    document instead of creating a second one.

.PARAMETER System
    System id from config/sap-systems.json. Defaults to the registry's
    defaultSystem.

.PARAMETER RunBy
    Who is answerable for this run. Recorded verbatim in the run file.

.PARAMETER Tag
    Suffix for the run filename, e.g. "create-only".

.PARAMETER Yes
    Skip the write confirmation. For scheduled runs where the authorisation was
    given in advance.

.PARAMETER DryRun
    Print what would run and stop. Touches nothing.

.PARAMETER ForceLock
    Take the run lock even if one is held. Last resort - read the warning in
    docs/unattended-runs.md first.

.PARAMETER NoDashboard
    Do not rebuild the dashboard afterwards.

.PARAMETER List
    List the runnable GUI-lane cases and exit.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -List

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -DryRun

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Stage save

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Resume 160275

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-016 -Rows quarterly
#>
[CmdletBinding()]
param(
    [string] $Case,
    [string] $Stage,
    [string] $Rows,
    [string] $Resume,
    [string] $System,
    [string] $RunBy,
    [string] $Tag,
    [switch] $Yes,
    [switch] $DryRun,
    [switch] $ForceLock,
    [switch] $NoDashboard,
    [switch] $List
)

$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root 'tools\mcp-sap-gui\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host ''
    Write-Host "  The vendored interpreter is missing:" -ForegroundColor Red
    Write-Host "    $python" -ForegroundColor Red
    Write-Host ''
    Write-Host '  It carries pywin32 and mcp_sap_gui, which the GUI lane drives SAP through.' -ForegroundColor Yellow
    Write-Host '  Recreate it (CLAUDE.md ~ Commands):' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '    python -m venv "tools\mcp-sap-gui\.venv"' -ForegroundColor DarkGray
    Write-Host '    "tools\mcp-sap-gui\.venv\Scripts\python.exe" -m pip install "mcp-sap-gui[screenshots]==0.2.2"' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

# The runner is the single implementation of resolve/confirm/lock/run/render;
# this script supplies the interpreter and the dashboard rebuild, so the two
# entry points cannot drift in what they allow.
$runnerArgs = @('-m', 'gui_tests.run')

if ($List)      { $runnerArgs += '--list' }
if ($Case)      { $runnerArgs += @('--case', $Case) }
if ($Stage)     { $runnerArgs += @('--stage', $Stage) }
if ($Rows)      { $runnerArgs += @('--rows', $Rows) }
if ($Resume)    { $runnerArgs += @('--resume', $Resume) }
if ($System)    { $runnerArgs += @('--system', $System) }
if ($RunBy)     { $runnerArgs += @('--run-by', $RunBy) }
if ($Tag)       { $runnerArgs += @('--tag', $Tag) }
if ($Yes)       { $runnerArgs += '--yes' }
if ($DryRun)    { $runnerArgs += '--dry-run' }
if ($ForceLock) { $runnerArgs += '--force-lock' }

Push-Location $root
try {
    & $python @runnerArgs
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

# Rebuild the dashboard only when a run actually happened. -List and -DryRun
# produce no run file, so rebuilding after them would just reopen a browser at
# the previous run's report.
$producedARun = -not ($List -or $DryRun)
if ($producedARun -and -not $NoDashboard) {
    $dashboard = Join-Path $PSScriptRoot 'build-dashboard.ps1'
    if (Test-Path $dashboard) {
        & powershell -ExecutionPolicy Bypass -File $dashboard
    }
}

exit $exitCode
