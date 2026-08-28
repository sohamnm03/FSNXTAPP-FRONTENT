<#
.SYNOPSIS
    Checks that the suite on disk matches the suite the case files describe.

.DESCRIPTION
    docs/test-authoring-guide.md draws a line between two jobs: the model
    exploring a transaction, and a frozen script running the same thing the same
    way every sprint. The line was documented and nothing enforced it. This does.

    Six checks, all read-only. Nothing here touches SAP.

      1. Every spec in web-tests/tests/ is classified by exactly one suite in
         config/suites.json. An unclassified spec belongs to no Playwright
         project and silently never runs again.
      2. Every spec config/suites.json names actually exists.
      3. No discovery spec (discover-*, probe-*, explore-*) is in 'regression'.
         Non-deterministic by design; a red run from one is not a regression.
      4. Every 'regression' spec is named by a test-cases/Web-TC/TC-*.md "Spec file:"
         line. A regression answer nobody wrote a case for is a script, not a test.
      5. Every case whose Status is 'frozen' is in the 'regression' suite.
      6. Every frozen case has at least two PASS runs recorded under results/.
         "Do not freeze a case that has never passed" - a frozen broken test
         fails forever and gets ignored.

    Exits 1 if any check fails, so it can gate a run.

.PARAMETER Quiet
    Print only failures and the summary line.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\check-suite.ps1"
#>
[CmdletBinding()]
param(
    [switch] $Quiet
)

$ErrorActionPreference = 'Stop'

$root       = Split-Path -Parent $PSScriptRoot
$webTestsDir = Join-Path $root 'web-tests'
$testsDir   = Join-Path $webTestsDir 'tests'
$caseDir    = Join-Path $root 'test-cases'
$resultsDir = Join-Path $root 'results'
$suitesPath = Join-Path $root 'config\suites.json'

. (Join-Path $PSScriptRoot 'lib-markdown.ps1')   # $DASH, Get-Field

if (-not (Test-Path $suitesPath)) { throw "Suite config not found: $suitesPath" }
if (-not (Test-Path $testsDir))   { throw "Spec directory not found: $testsDir" }

$failures = New-Object System.Collections.Generic.List[string]
$notes    = New-Object System.Collections.Generic.List[string]

function Fail { param([string] $Message) $failures.Add($Message) }
function Note { param([string] $Message) $notes.Add($Message) }

function ConvertFrom-Glob {
    # Only '*' is supported - these are filenames, not paths.
    param([string] $Pattern)
    return '^' + ([regex]::Escape($Pattern) -replace '\\\*', '[^/\\]*') + '$'
}

# ------------------------------------------------------- specs and suites
#
# config/suites.json's rules for checks 1 and 2 - every spec classified by
# exactly one suite, every spec named by a suite actually on disk - are already
# enforced by web-tests/suites.ts the moment Playwright loads its config: it
# throws on an unclassified or doubly-claimed spec. Reimplementing that glob
# matching here in PowerShell would be a second copy of the same algorithm that
# can silently drift from the one Playwright actually runs against. Instead,
# this asks Playwright itself what it resolved and reads the answer back.

Push-Location $webTestsDir
try {
    $listRaw = & npx playwright test --list --reporter=json 2>&1
    $listExit = $LASTEXITCODE
} finally {
    Pop-Location
}

$owner = @{}
$suiteNames = @()

if ($listExit -ne 0) {
    Fail "check 1/2: 'npx playwright test --list' failed to load config/suites.json via web-tests/suites.ts:`n$($listRaw -join "`n")"
} else {
    try {
        $listing = ($listRaw -join "`n") | ConvertFrom-Json
    } catch {
        Fail "check 1/2: could not parse 'npx playwright test --list --reporter=json' output: $($_.Exception.Message)"
        $listing = $null
    }
    if ($listing) {
        foreach ($project in $listing.config.projects) {
            $suiteNames += $project.name
            foreach ($pattern in @($project.testMatch)) {
                # suites.ts's testMatchFor emits literal '**/<spec file>' entries -
                # never a real glob - so stripping the prefix recovers the spec name.
                $owner[$pattern -replace '^\*\*/', ''] = $project.name
            }
        }
    }
}

$regressionSpecs = @($owner.GetEnumerator() | Where-Object { $_.Value -eq 'regression' } |
                     Select-Object -ExpandProperty Key | Sort-Object)

# ------------------------- check 3: no discovery spec in regression

$discoveryShapes = @('discover-*.spec.ts', 'probe-*.spec.ts', 'explore-*.spec.ts', '*-explore.spec.ts')
foreach ($spec in $regressionSpecs) {
    foreach ($shape in $discoveryShapes) {
        if ($spec -match (ConvertFrom-Glob $shape)) {
            Fail "check 3: '$spec' is in the 'regression' suite but is shaped like a discovery spec ($shape) - discovery is non-deterministic and is not a regression answer"
        }
    }
}

# ----------------------------------------------- case files and their specs

$cases = @()
# -Recurse: cases are filed by lane under test-cases/GUI-TC and test-cases/Web-TC.
foreach ($file in (Get-ChildItem -Path $caseDir -Filter 'TC-*.md' -Recurse -File | Sort-Object Name)) {
    $text = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    $caseId = Get-Field $text 'Case id'
    if (-not $caseId) { $caseId = $file.BaseName }
    $caseId = ($caseId -replace '`', '' -replace '\*\*', '').Trim()

    $statusRaw = Get-Field $text 'Status'
    # First word only: statuses are written as "active -- create + settle proven".
    $status = ''
    if ($statusRaw) {
        $status = (($statusRaw -replace '`', '' -replace '\*\*', '') -split '[\s(]')[0].Trim().ToLower()
    }

    # A "Spec file:" line may name a spec plus a note, e.g.
    # `web-tests/tests/business-area-flows.spec.ts` (`DEAL_KEY=MM`). Take every
    # *.spec.ts it mentions.
    $specRaw = Get-Field $text 'Spec file'
    $specNames = @()
    if ($specRaw) {
        foreach ($m in [regex]::Matches($specRaw, '([A-Za-z0-9._-]+\.spec\.ts)')) {
            $specNames += $m.Groups[1].Value
        }
    }

    $cases += [pscustomobject]@{
        Id        = $caseId
        File      = $file.FullName.Substring($caseDir.Length + 1).Replace('\', '/')
        Status    = $status
        StatusRaw = $statusRaw
        Specs     = $specNames
    }
}

$specsNamedByCases = New-Object System.Collections.Generic.HashSet[string]
foreach ($case in $cases) {
    foreach ($spec in $case.Specs) {
        [void] $specsNamedByCases.Add($spec)
        if (-not $owner.ContainsKey($spec)) {
            Fail "check 4: case $($case.Id) names spec '$spec', which is not in web-tests/tests/"
        }
    }
}

# ------------------- check 4: every regression spec has a case file

foreach ($spec in $regressionSpecs) {
    if (-not $specsNamedByCases.Contains($spec)) {
        Fail "check 4: '$spec' is in the 'regression' suite but no test-cases/Web-TC/TC-*.md names it as its Spec file"
    }
}

# ------------------------------------------------- PASS runs per case

function Get-SectionBody {
    # Pulls a "## Heading" section's body out of a run file, up to the next "## ".
    param([string] $Text, [string] $Heading)
    $m = [regex]::Match($Text, "(?ms)^##\s+$([regex]::Escape($Heading))\s*`$(.*?)(?=^##\s|\z)")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
}

function Has-RecordedDeviation {
    # docs/test-authoring-guide.md: a case freezes once it "passes twice with no
    # deviations" - so a PASS run that documents one does not satisfy that,
    # whatever its Verdict field says.
    param([string] $Text)
    $body = Get-SectionBody $Text 'Deviations'
    if (-not $body) { return $false }
    if ($body -match '^\s*<') { return $false }   # untouched _TEMPLATE.md placeholder
    if ($body -match "(?i)^\s*(none|n/?a|no deviations?)\.?\s*$") { return $false }
    return $true
}

# One result file per run: "- **Verdict:** PASS ..." and "- **Case:** TC-002".
$passRuns = @{}
if (Test-Path $resultsDir) {
    foreach ($file in (Get-ChildItem -Path $resultsDir -Filter '*.md' | Where-Object { $_.Name -ne '_TEMPLATE.md' })) {
        $text = Get-Content -Path $file.FullName -Raw -Encoding UTF8

        $verdict = Get-Field $text 'Verdict'
        if (-not $verdict) { continue }
        $verdict = (($verdict -replace '`', '' -replace '\*\*', '') -split "[\s(]|$DASH")[0].Trim().ToUpper()
        if ($verdict -ne 'PASS') { continue }

        $case = Get-Field $text 'Case'
        if (-not $case) { continue }
        $case = ($case -replace '`', '' -replace '\*\*', '').Trim()
        $m = [regex]::Match($case, '(TC-\d+)')
        if (-not $m.Success) { continue }
        $id = $m.Groups[1].Value

        if (Has-RecordedDeviation $text) {
            Note "check 6: $($file.Name) is a PASS run for $id but records a deviation - not counted toward the freeze gate"
            continue
        }

        if (-not $passRuns.ContainsKey($id)) { $passRuns[$id] = 0 }
        $passRuns[$id]++
    }
} else {
    Note "results/ does not exist yet - check 6 has nothing to read, so no frozen case can be verified"
}

# ---------------- checks 5 and 6: freeze discipline

$frozen = @($cases | Where-Object { $_.Status -eq 'frozen' })
foreach ($case in $frozen) {
    foreach ($spec in $case.Specs) {
        $suiteOf = $owner[$spec]
        if ($suiteOf -ne 'regression') {
            $where = if ($suiteOf) { "in suite '$suiteOf'" } else { 'unclassified' }
            Fail "check 5: case $($case.Id) is frozen but its spec '$spec' is $where, not in 'regression'"
        }
    }
    if ($case.Specs.Count -eq 0) {
        Fail "check 5: case $($case.Id) is frozen but names no spec file - a frozen case must have an executable copy"
    }

    $passes = 0
    if ($passRuns.ContainsKey($case.Id)) { $passes = $passRuns[$case.Id] }
    if ($passes -lt 2) {
        Fail "check 6: case $($case.Id) is frozen with $passes PASS run(s) recorded under results/ - a case must pass twice before it is frozen"
    }
}

# -------------------------------------------------------------- report

if (-not $Quiet) {
    Write-Host ''
    Write-Host 'Suites' -ForegroundColor Cyan
    foreach ($name in $suiteNames) {
        $count = @($owner.GetEnumerator() | Where-Object { $_.Value -eq $name }).Count
        Write-Host ("  {0,-14} {1,3} spec(s)" -f $name, $count)
    }

    Write-Host ''
    Write-Host 'Cases' -ForegroundColor Cyan
    foreach ($case in $cases) {
        $passes = 0
        if ($passRuns.ContainsKey($case.Id)) { $passes = $passRuns[$case.Id] }
        $specList = if ($case.Specs.Count) { $case.Specs -join ', ' } else { '(none)' }
        $suiteList = @()
        foreach ($spec in $case.Specs) {
            if ($owner.ContainsKey($spec)) { $suiteList += $owner[$spec] }
        }
        $suiteText = if ($suiteList.Count) { ($suiteList | Select-Object -Unique) -join ',' } else { '-' }
        Write-Host ("  {0,-8} {1,-10} {2,-13} {3} PASS   {4}" -f $case.Id, $case.Status, $suiteText, $passes, $specList)
    }

    if ($frozen.Count -eq 0) {
        Write-Host ''
        Write-Host '  No case is frozen yet. Checks 5 and 6 had nothing to verify.' -ForegroundColor DarkGray
        Write-Host '  Freeze a case by setting its Status to "frozen" once it has passed twice' -ForegroundColor DarkGray
        Write-Host '  with no deviations - see docs/test-authoring-guide.md.' -ForegroundColor DarkGray
    }
}

foreach ($note in $notes) {
    Write-Host ''
    Write-Host "NOTE  $note" -ForegroundColor Yellow
}

Write-Host ''
if ($failures.Count -eq 0) {
    Write-Host "OK  suite is consistent - $($owner.Count) spec(s), $($cases.Count) case(s), $($frozen.Count) frozen" -ForegroundColor Green
    exit 0
}

Write-Host "FAILED  $($failures.Count) problem(s):" -ForegroundColor Red
foreach ($failure in $failures) {
    Write-Host "  - $failure" -ForegroundColor Red
}
exit 1
