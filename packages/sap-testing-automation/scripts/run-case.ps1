<#
.SYNOPSIS
    Runs a test case end to end - preflight, execution, run file, dashboard -
    with nothing left for a person to decide mid-run.

.DESCRIPTION
    The web lane was already model-free where it drives SAP: the specs know the
    screens, config/suites.json knows which specs are a regression answer, and
    test-data/*.dataset.json knows what values to write. Three things still went
    through a person on every run:

      1. turning "run TC-009" into a command - which spec, which project, which
         stage, which dataset rows;
      2. writing results/TC-*.md afterwards from the transcript;
      3. remembering to rebuild the dashboard.

    (1) is config/runs.json plus this script. (2) is the run itself, through
    web-tests/reporters/result-file.ts. (3) is the last step here.

    What it does, in order:

      * resolves the case from config/runs.json (an unknown case is refused, not
        guessed at - guessing a stage or a row set means writing the wrong thing
        to a live client);
      * runs scripts/check-suite.ps1 unless -SkipCheck, so a suite that is
        inconsistent fails before the browser opens rather than after the write;
      * refuses to start on top of a live batch lock, naming the pid holding it;
      * states every database write the case makes and waits for a yes, unless
        -Yes was passed (CLAUDE.md rule 3);
      * runs Playwright with the run id, operator and command line in the
        environment, so the run file records them rather than inferring them;
      * prints the verdict and the path to the run file it produced, and
        rebuilds results/dashboard.html.

    Read-only by itself. Every write in a run comes from the case's own spec.

.PARAMETER Case
    Case id, e.g. TC-009. See -List.

.PARAMETER Suite
    Run a whole suite instead of one case: regression, verification, model-check.

.PARAMETER Stage
    How far to run a staged case (TC-002, TC-009). Defaults to the case's
    defaultStage - the whole flow.

.PARAMETER Rows
    Dataset rows to drive, e.g. "01,03". Defaults to the case's defaultRows;
    absent, the whole dataset.

.PARAMETER Resume
    An existing document number, for cases that support resuming (TC-002,
    TC-009). Skips the create step and works on that document instead of
    creating a second one.

.PARAMETER RunBy
    Who is answerable for this run. Recorded verbatim in the run file.

.PARAMETER Tag
    Suffix for the run filename, e.g. "create-only".

.PARAMETER SetEnv
    Extra environment variables: -SetEnv @{ INTEREST_FREQUENCY = 'M' }

.PARAMETER Yes
    Skip the write confirmation. For scheduled runs where the authorisation was
    given in advance.

.PARAMETER DryRun
    Print what would run and stop. Touches nothing.

.PARAMETER SkipCheck
    Skip scripts/check-suite.ps1.

.PARAMETER NoDashboard
    Do not rebuild the dashboard afterwards.

.PARAMETER List
    List the runnable cases and suites, and exit.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -List

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -Case TC-009

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -Case TC-002 -Stage save -Rows baseline -Yes
#>
[CmdletBinding()]
param(
    [string] $Case,
    [string] $Suite,
    [string] $Stage,
    [string] $Rows,
    [string] $Resume,
    [string] $RunBy,
    [string] $Tag,
    [hashtable] $SetEnv = @{},
    [switch] $Yes,
    [switch] $DryRun,
    [switch] $SkipCheck,
    [switch] $NoDashboard,
    [switch] $List
)

$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $PSScriptRoot
$webTestsDir = Join-Path $root 'web-tests'
$runsPath    = Join-Path $root 'config\runs.json'
$registry    = Join-Path $root 'config\sap-systems.json'

if (-not (Test-Path $runsPath)) { throw "Run manifest not found: $runsPath" }

$manifest = Get-Content -Path $runsPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-Prop {
    # PSCustomObject property access that tolerates an absent property.
    param($Object, [string] $Name)
    if ($null -eq $Object) { return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($null -eq $p) { return $null }
    return $p.Value
}

# ------------------------------------------------------------------- listing

if ($List -or (-not $Case -and -not $Suite)) {
    Write-Host ''
    Write-Host 'Cases' -ForegroundColor Cyan
    foreach ($p in $manifest.cases.PSObject.Properties) {
        $c = $p.Value
        $stages = Get-Prop $c 'stages'
        $stageText = ''
        if ($stages) { $stageText = "  stages: $($stages -join ' -> ')" }
        Write-Host ("  {0,-8} {1}" -f $p.Name, (Get-Prop $c 'summary'))
        Write-Host ("           writes: {0}{1}" -f (Get-Prop $c 'writes'), $stageText) -ForegroundColor DarkGray
        $note = Get-Prop $c 'note'
        if ($note) { Write-Host "           note: $note" -ForegroundColor Yellow }
    }
    Write-Host ''
    Write-Host 'Suites' -ForegroundColor Cyan
    foreach ($p in $manifest.suites.PSObject.Properties) {
        Write-Host ("  {0,-14} {1}" -f $p.Name, (Get-Prop $p.Value 'summary'))
    }
    Write-Host ''
    Write-Host '  -Case TC-009            one case, the whole flow'
    Write-Host '  -Case TC-002 -Stage save   stop after the first write'
    Write-Host '  -Suite verification     read-only checks, no confirmation needed'
    Write-Host ''
    exit 0
}

if ($Case -and $Suite) { throw 'Pass -Case or -Suite, not both.' }

# ------------------------------------------------------------------ resolve

$targetName = ''
$specArg    = ''
$project    = Get-Prop $manifest.defaults 'project'
$confirm    = [bool](Get-Prop $manifest.defaults 'confirmWrites')
$writes     = ''
$runEnv     = @{}

if ($Case) {
    $caseId = $Case.ToUpper()
    if ($caseId -notmatch '^TC-\d+$') { $caseId = "TC-$($caseId -replace '\D', '')" }

    $entry = Get-Prop $manifest.cases $caseId
    if (-not $entry) {
        $known = ($manifest.cases.PSObject.Properties.Name | Sort-Object) -join ', '
        throw "Case '$caseId' is not in config/runs.json. Known: $known`n" +
              "A case absent from the manifest cannot be launched by id - add it there first, " +
              "so what it writes is stated before it runs rather than inferred at run time."
    }

    $targetName = $caseId
    $spec = Get-Prop $entry 'spec'
    $specPath = Join-Path $webTestsDir "tests\$spec"
    if (-not (Test-Path $specPath)) {
        throw "Case $caseId names spec '$spec', which is not in web-tests/tests/."
    }
    $specArg = "tests/$spec"

    $p = Get-Prop $entry 'project'
    if ($p) { $project = $p }
    $writes = Get-Prop $entry 'writes'

    # ---- environment the case declares
    foreach ($kv in (Get-Prop $entry 'env').PSObject.Properties) {
        $runEnv[$kv.Name] = [string]$kv.Value
    }

    # ---- stage
    $stageEnv = Get-Prop $entry 'stageEnv'
    if ($stageEnv) {
        $stages = @(Get-Prop $entry 'stages')
        $wanted = $Stage
        if (-not $wanted) { $wanted = Get-Prop $entry 'defaultStage' }
        if ($wanted) {
            if ($stages -and ($stages -notcontains $wanted)) {
                throw "Stage '$wanted' is not one of $caseId's stages: $($stages -join ', ')"
            }
            $runEnv[$stageEnv] = $wanted
        }
    }
    elseif ($Stage) {
        throw "$caseId is not a staged case - it has no stageEnv in config/runs.json."
    }

    # ---- dataset rows
    $rowsEnv = Get-Prop $entry 'rowsEnv'
    if ($rowsEnv) {
        $wantedRows = $Rows
        if (-not $wantedRows) { $wantedRows = Get-Prop $entry 'defaultRows' }
        if ($wantedRows) { $runEnv[$rowsEnv] = $wantedRows }
    }
    elseif ($Rows) {
        throw "$caseId is not data-driven - it has no rowsEnv in config/runs.json."
    }

    # ---- resume
    if ($Resume) {
        $resumeEnv = Get-Prop $entry 'resumeEnv'
        if (-not $resumeEnv) { throw "$caseId does not support -Resume." }
        if ($Resume -notmatch '^\d{5,12}$') { throw "-Resume must be a document number, got '$Resume'." }
        $runEnv[$resumeEnv] = $Resume
    }
}
else {
    $suiteEntry = Get-Prop $manifest.suites $Suite
    if (-not $suiteEntry) {
        $known = ($manifest.suites.PSObject.Properties.Name) -join ', '
        throw "Suite '$Suite' is not in config/runs.json. Known: $known"
    }
    $targetName = "suite:$Suite"
    $project = Get-Prop $suiteEntry 'project'
    $writes = Get-Prop $suiteEntry 'summary'
    $c = Get-Prop $suiteEntry 'confirmWrites'
    if ($null -ne $c) { $confirm = [bool]$c }
}

foreach ($kv in $SetEnv.GetEnumerator()) { $runEnv[$kv.Key] = [string]$kv.Value }

# --------------------------------------------------------------- run identity

$now   = Get-Date
$runId = $now.ToString('yyyyMMdd-HHmmss')
$who   = $RunBy
if (-not $who) { $who = "$env:USERNAME (unattended, scripts\run-case.ps1)" }

$argList = @('playwright', 'test', "--project=$project")
if ($specArg) { $argList += $specArg }
$commandLine = "npx $($argList -join ' ')"

$systemId = $env:SAP_SYSTEM_ID
if (-not $systemId) {
    if (Test-Path $registry) {
        $systemId = (Get-Content -Path $registry -Raw -Encoding UTF8 | ConvertFrom-Json).defaultSystem
    } else {
        $systemId = 'unknown-system'
    }
}

Write-Host ''
Write-Host "Run $runId" -ForegroundColor Cyan
Write-Host ("  target   {0}" -f $targetName)
Write-Host ("  system   {0}" -f $systemId)
Write-Host ("  project  {0}" -f $project)
if ($specArg) { Write-Host ("  spec     {0}" -f $specArg) }
foreach ($kv in ($runEnv.GetEnumerator() | Sort-Object Name)) {
    Write-Host ("  env      {0}={1}" -f $kv.Key, $kv.Value)
}
Write-Host ("  run by   {0}" -f $who)
Write-Host ("  command  {0}" -f $commandLine) -ForegroundColor DarkGray

# ------------------------------------------------------------------ preflight

if (-not $SkipCheck) {
    Write-Host ''
    Write-Host 'Preflight: scripts\check-suite.ps1' -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-suite.ps1') -Quiet
    if ($LASTEXITCODE -ne 0) {
        throw "check-suite.ps1 failed - the suite is inconsistent. Fix that before running against a live client, or pass -SkipCheck if you know why it fails."
    }
}

# A batch lock held by a live process means a run of this batch is still going.
# Starting a second one duplicates live writes - this happened for real on
# 2026-08-18, when a shell timeout was mistaken for a killed process and a
# "resume" produced 4 extra fully-written deals. web-tests/webgui.ts refuses
# in-process too; this is the earlier, cheaper refusal.
$lockDir = Join-Path $root "results\web\$systemId"
if (Test-Path $lockDir) {
    foreach ($lock in (Get-ChildItem -Path $lockDir -Filter '*.lock' -ErrorAction SilentlyContinue)) {
        $content = (Get-Content -Path $lock.FullName -Raw -ErrorAction SilentlyContinue)
        $pidText = ($content -split '\|')[0]
        $alive = $false
        if ($pidText -match '^\d+$') {
            try {
                Get-Process -Id ([int]$pidText) -ErrorAction Stop | Out-Null
                $alive = $true
            } catch {
                $alive = $false
            }
        }
        if ($alive) {
            throw "A batch is already running against ${systemId}: $($lock.Name) is held by pid $pidText. " +
                  "Refusing to start - a concurrent run would duplicate live writes. Confirm that process is " +
                  "actually dead (Task Manager, not just a tool timeout) before deleting $($lock.FullName)."
        }
        Write-Host "  stale lock ignored: $($lock.Name) (pid $pidText is gone)" -ForegroundColor DarkGray
    }
}

# --------------------------------------------------------------- confirmation

if ($confirm -and $writes) {
    Write-Host ''
    Write-Host 'THIS RUN WRITES TO THE DATABASE' -ForegroundColor Yellow
    Write-Host ("  {0}" -f $writes) -ForegroundColor Yellow
    Write-Host ("  on {0}" -f $systemId) -ForegroundColor Yellow
    if (-not $Yes -and -not $DryRun) {
        # CLAUDE.md rule 3: a database write is named before it runs and
        # confirmed at run time. -Yes is how a scheduled run carries an
        # authorisation given in advance; there is no way to have neither.
        $answer = Read-Host 'Proceed? (yes/no)'
        if ($answer -notmatch '^(y|yes)$') {
            Write-Host 'Cancelled. Nothing ran.' -ForegroundColor DarkGray
            exit 130
        }
    }
    elseif ($Yes) {
        Write-Host '  confirmed in advance (-Yes)' -ForegroundColor DarkGray
    }
}

if ($DryRun) {
    Write-Host ''
    Write-Host 'DryRun - nothing ran.' -ForegroundColor DarkGray
    exit 0
}

# ---------------------------------------------------------------------- run

$pointer = Join-Path ([IO.Path]::GetTempPath()) "sap-run-$runId.ndjson"

$env:SAP_WRITE_RESULT = '1'   # ask the run to write its own run file
$env:SAP_RUN_ID      = $runId
$env:SAP_RUN_BY      = $who
$env:SAP_RUN_COMMAND = $commandLine
$env:SAP_RUN_POINTER = $pointer
if ($Tag) { $env:SAP_RUN_TAG = $Tag } else { Remove-Item Env:\SAP_RUN_TAG -ErrorAction SilentlyContinue }
foreach ($kv in $runEnv.GetEnumerator()) { Set-Item -Path "Env:\$($kv.Key)" -Value $kv.Value }

Write-Host ''
Write-Host 'Running - a browser window will open. Watch it.' -ForegroundColor Cyan
Write-Host ''

Push-Location $webTestsDir
try {
    & npx @argList
    $testExit = $LASTEXITCODE
} finally {
    Pop-Location
}

# ------------------------------------------------------------------- report

Write-Host ''
$produced = @()
if (Test-Path $pointer) {
    foreach ($line in (Get-Content -Path $pointer -ErrorAction SilentlyContinue)) {
        if (-not $line.Trim()) { continue }
        try { $produced += ($line | ConvertFrom-Json) } catch { }
    }
    Remove-Item -Path $pointer -ErrorAction SilentlyContinue
}

if ($produced.Count -eq 0) {
    Write-Host 'No run file was produced.' -ForegroundColor Yellow
    Write-Host '  A spec with no case file behind it (verification, model-check, discovery) does' -ForegroundColor DarkGray
    Write-Host '  not write one - those are not runs of a case. If you expected one, check that' -ForegroundColor DarkGray
    Write-Host '  the case file names this spec on its "Spec file:" line.' -ForegroundColor DarkGray
} else {
    Write-Host 'Run files' -ForegroundColor Cyan
    foreach ($r in $produced) {
        $colour = 'Green'
        if ($r.verdict -ne 'PASS') { $colour = 'Red' }
        Write-Host ("  {0,-8} {1,-8} {2}" -f $r.case, $r.verdict, $r.file) -ForegroundColor $colour
    }
}

# ---------------------------------------------------------------- dashboard

if (-not $NoDashboard) {
    Write-Host ''
    Write-Host 'Rebuilding the dashboard' -ForegroundColor Cyan
    # -Open is not optional: the dashboard must open in the browser by itself
    # after a run. Handing back a file:// path and expecting a click is a
    # standing complaint - do not drop this flag.
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-dashboard.ps1') -Open
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Dashboard rebuild failed - the run files above are still on disk.' -ForegroundColor Yellow
    } else {
        Write-Host ("  {0}" -f (Join-Path $root 'results\dashboard.html')) -ForegroundColor Green
    }
}

Write-Host ''
exit $testExit
