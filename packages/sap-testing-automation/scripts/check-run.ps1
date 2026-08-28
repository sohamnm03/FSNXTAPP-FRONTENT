<#
.SYNOPSIS
    Reads back what a run actually did, from its journal, so a person can decide
    whether it is safe to resume or re-run it. Touches no SAP system.

.DESCRIPTION
    docs/unattended-runs.md § "Recovering from an interrupted run" is the answer
    to a session that stopped mid-run - network drop, killed shell, closed
    window - after some of it had already written to SAP. Two things are true at
    that point: `web-tests/journal.ts` has an NDJSON line for everything the run
    did before it stopped (it appends and flushes per line, so a killed process
    loses nothing already written), and `results/TC-*.md` was NOT produced,
    because that file is rendered by a Playwright reporter's onEnd, which only
    fires on a clean process exit.

    This script is the thing to run before deciding what "resume" means here.
    It:

      1. finds the run's journal (results/web/<SYSTEM>/journal/<run id>.ndjson)
         and parses it, tolerating a torn last line the same way
         web-tests/reporters/result-file.ts does - a kill mid-write loses at
         most one line, not the file;
      2. lists every document the run touched, with its number and the
         lifecycle stages recorded for it (created/settled/posted/accrued/
         valued), merged the same way the run file itself merges them;
      3. shows the last recorded action and how long ago it was, and whether
         the journal ends in an explicit verdict or just stops;
      4. checks results/web/<SYSTEM>/*.lock for a batch lock and whether the
         pid holding it is still alive - see web-tests/webgui.ts's
         acquireBatchLock for why this exists: a "killed" process on
         2026-08-18 had not actually stopped, and a second run against the
         same dataset wrote 4 duplicate live deals before anyone noticed;
      5. looks for a results/TC-*.md file already filed near the same
         timestamp, as a best-effort (filename-based) signal that this run
         already made it to a report.

    None of this proves what SAP actually has. The journal records what the
    spec believed it did, not a fresh read of the system. Before resuming or
    re-running anything this script flags, confirm the documents it lists
    directly in SAP (FTR_EDIT / display) - the same discipline CLAUDE.md rule 2
    asks for on a live connection.

.PARAMETER RunId
    The run id, e.g. 20260819-124024 (the journal's filename without
    .ndjson). Searches every system under results/web/ unless -System narrows
    it. Accepts a partial id - the first journal file whose name contains it.

.PARAMETER System
    Restrict to one system id (as it appears under results/web/, e.g.
    DS4_100_NIIF). Defaults to every system present.

.PARAMETER Latest
    Skip -RunId and inspect the most recently written journal instead.

.PARAMETER List
    List every journal found (run id, system, case if recorded, last action,
    how long ago) and exit. Nothing else runs.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -List

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -Latest

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -RunId 20260819-124024
#>
[CmdletBinding()]
param(
    [string] $RunId,
    [string] $System,
    [ValidateSet('web', 'gui')]
    [string] $Lane,
    [switch] $Latest,
    [switch] $List
)

$ErrorActionPreference = 'Stop'

$root       = Split-Path -Parent $PSScriptRoot
$resultsDir = Join-Path $root 'results'

# Both lanes write the same journal schema, so this script reads both. The web
# lane's journals come from web-tests/journal.ts under results\web\; the GUI
# lane's come from gui_tests/journal.py under results\gui\. Everything below is
# lane-agnostic because the schema is - see docs/unattended-runs.md.
$laneRoots = [ordered]@{
    web = Join-Path $resultsDir 'web'
    gui = Join-Path $resultsDir 'gui'
}

. (Join-Path $PSScriptRoot 'lib-markdown.ps1')   # $DASH, Get-Field

$presentRoots = @($laneRoots.GetEnumerator() | Where-Object { Test-Path $_.Value })
if ($presentRoots.Count -eq 0) {
    Write-Host "Neither results\web\ nor results\gui\ exists yet - no run has produced a journal." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------------ discovery

$journalFiles = @()
# NOT $lane: PowerShell variable names are case-insensitive, so a loop variable
# called $lane would overwrite the validated $Lane parameter and trip its
# ValidateSet on the DictionaryEntry it was assigned.
foreach ($laneEntry in $presentRoots) {
    $found = Get-ChildItem -Path $laneEntry.Value -Recurse -Filter '*.ndjson' -ErrorAction SilentlyContinue |
        Where-Object { $_.Directory.Name -eq 'journal' }
    foreach ($f in $found) {
        # Which lane a journal came from is worth reporting: a GUI-lane run and a
        # web-lane run of the same business flow are different rendering paths and
        # are not interchangeable as evidence.
        $f | Add-Member -NotePropertyName Lane -NotePropertyValue $laneEntry.Key -Force
        $journalFiles += $f
    }
}

if ($Lane) {
    $journalFiles = $journalFiles | Where-Object { $_.Lane -eq $Lane }
}

if ($System) {
    $journalFiles = $journalFiles | Where-Object { $_.Directory.Parent.Name -eq $System }
}

if (-not $journalFiles) {
    $filters = @()
    if ($Lane)   { $filters += "lane '$Lane'" }
    if ($System) { $filters += "system '$System'" }
    $where = if ($filters.Count) { "for " + ($filters -join ' and ') } else { 'under results\web\ or results\gui\' }
    Write-Host "No journals found $where." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------------- parsing

function Read-Journal {
    param([string] $Path)
    # @(...) is load-bearing. Get-Content returns a bare String for a single-line
    # file, and indexing a String yields a Char - which has no .Trim(), so the
    # script died with a type error. A journal holding exactly one line is the
    # normal shape for a run killed moments after it started, which is precisely
    # the case this script exists to read.
    $lines = @(Get-Content -Path $Path -Encoding UTF8 -ErrorAction SilentlyContinue)
    $entries = @()
    $tornCount = 0
    foreach ($raw in $lines) {
        if ($null -eq $raw) { continue }
        $line = ([string]$raw).Trim()
        if (-not $line) { continue }
        try {
            $entries += ($line | ConvertFrom-Json)
        } catch {
            $tornCount++
        }
    }
    return [pscustomobject]@{ Entries = $entries; TornLines = $tornCount }
}

function Get-Summary {
    # One journal, boiled down to what a person deciding whether to resume needs.
    param([System.IO.FileInfo] $File)

    $systemId = $File.Directory.Parent.Name
    $runId    = $File.BaseName
    $parsed   = Read-Journal -Path $File.FullName
    $entries  = $parsed.Entries

    $caseId = ($entries | Where-Object { $_.kind -eq 'meta' -and $_.case } | Select-Object -First 1).case

    $docs = [ordered]@{}
    foreach ($d in ($entries | Where-Object { $_.kind -eq 'document' })) {
        if (-not $d.number) { continue }
        if (-not $docs.Contains($d.number)) {
            $docs[$d.number] = [pscustomobject]@{
                Number      = $d.number
                DocType     = ''
                CompanyCode = ''
                Lifecycle   = @()
            }
        }
        $entry = $docs[$d.number]
        if ($d.docType) { $entry.DocType = $d.docType }
        if ($d.companyCode) { $entry.CompanyCode = $d.companyCode }
        foreach ($stage in @($d.lifecycle)) { $entry.Lifecycle += $stage }
    }

    $verdictEntry = $entries | Where-Object { $_.kind -eq 'verdict' } | Select-Object -Last 1
    $deviations   = @($entries | Where-Object { $_.kind -eq 'deviation' })
    $lastEntry    = $entries | Select-Object -Last 1
    $lastAt       = $null
    if ($lastEntry -and $lastEntry.at) { $lastAt = [datetime]::Parse($lastEntry.at, $null, [System.Globalization.DateTimeStyles]::RoundtripKind) }

    $lane = if ($File.PSObject.Properties['Lane']) { $File.Lane } else { 'web' }

    [pscustomobject]@{
        File       = $File
        Lane       = $lane
        SystemId   = $systemId
        RunId      = $runId
        CaseId     = $caseId
        Entries    = $entries
        TornLines  = $parsed.TornLines
        Documents  = $docs.Values
        Verdict    = $verdictEntry
        Deviations = $deviations
        LastEntry  = $lastEntry
        LastAtUtc  = $lastAt
    }
}

# ------------------------------------------------------------------ -List

if ($List) {
    Write-Host ''
    Write-Host 'Journals under results\web\ (web lane) and results\gui\ (GUI lane)' -ForegroundColor Cyan
    foreach ($f in ($journalFiles | Sort-Object LastWriteTime -Descending)) {
        $s = Get-Summary -File $f
        $ago = 'unknown'
        if ($s.LastAtUtc) { $ago = '{0:n0} min ago' -f ((Get-Date).ToUniversalTime() - $s.LastAtUtc).TotalMinutes }
        $case = if ($s.CaseId) { $s.CaseId } else { '(no case recorded)' }
        $verdictText = if ($s.Verdict) { $s.Verdict.verdict } else { 'none' }
        $tornText = if ($s.TornLines -gt 0) { " [$($s.TornLines) unparsable line(s)]" } else { '' }
        Write-Host ("  {0,-16} {1,-4} {2,-14} {3,-9} {4,3} doc(s)   last action {5}   verdict {6}{7}" -f `
            $s.RunId, $s.Lane, $s.SystemId, $case, $s.Documents.Count, $ago, $verdictText, $tornText)
    }
    Write-Host ''
    Write-Host '  powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -RunId <id>' -ForegroundColor DarkGray
    exit 0
}

# --------------------------------------------------------- resolve one target

if ($Latest) {
    $target = $journalFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
} elseif ($RunId) {
    $target = $journalFiles | Where-Object { $_.BaseName -like "*$RunId*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $target) {
        throw "No journal matching '$RunId' found. Run with -List to see what exists."
    }
} else {
    Write-Host 'Pass -RunId <id>, -Latest, or -List. Showing the most recent journals:' -ForegroundColor Yellow
    & $PSCommandPath -List
    exit 0
}

$summary = Get-Summary -File $target

# -------------------------------------------------------------------- report

Write-Host ''
Write-Host "Run $($summary.RunId)  ($($summary.SystemId), $($summary.Lane) lane)" -ForegroundColor Cyan
Write-Host ("  journal   {0}" -f $summary.File.FullName) -ForegroundColor DarkGray
$caseText = if ($summary.CaseId) { $summary.CaseId } else { 'not recorded in this journal - check the run file, if any, or the terminal transcript' }
Write-Host ("  case      {0}" -f $caseText)
if ($summary.TornLines -gt 0) {
    Write-Host ("  WARNING   {0} line(s) in this journal could not be parsed - almost certainly the process was" -f $summary.TornLines) -ForegroundColor Yellow
    Write-Host "            cut off mid-write. Everything else in this journal was written before that line and is intact." -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Documents this run recorded writing' -ForegroundColor Cyan
if ($summary.Documents.Count -eq 0) {
    Write-Host '  None recorded - either nothing was written yet, or this run never called journal.document().' -ForegroundColor DarkGray
} else {
    foreach ($d in $summary.Documents) {
        $type = if ($d.DocType) { $d.DocType } else { '(type not repeated on later stages - see the create entry)' }
        $cc = if ($d.CompanyCode) { " / co.code $($d.CompanyCode)" } else { '' }
        Write-Host ("  {0,-12} {1}{2}   lifecycle: {3}" -f $d.Number, $type, $cc, ($d.Lifecycle -join ' -> '))
    }
    Write-Host ''
    Write-Host '  These are claims the run made, not a fresh read of SAP. Before resuming or' -ForegroundColor Yellow
    Write-Host '  re-running anything against these documents, confirm each one directly in' -ForegroundColor Yellow
    Write-Host '  SAP (FTR_EDIT / display) - do not trust this list on its own.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Last recorded action' -ForegroundColor Cyan
if ($summary.LastEntry) {
    $le = $summary.LastEntry
    $desc = switch ($le.kind) {
        'step'      { "$($le.description) [$($le.outcome)]" }
        'document'  { "document $($le.number) reached stage(s): $($le.lifecycle -join ', ')" }
        'evidence'  { "screenshot captured: $($le.file)" }
        'system'    { "confirmed on $($le.where): $($le.system) / client $($le.client)" }
        'deviation' { "deviation recorded: $($le.text)" }
        'verdict'   { "verdict recorded: $($le.verdict) - $($le.why)" }
        default     { $le.kind }
    }
    $ago = 'unknown'
    if ($summary.LastAtUtc) { $ago = '{0:n1} minute(s) ago' -f ((Get-Date).ToUniversalTime() - $summary.LastAtUtc).TotalMinutes }
    Write-Host ("  {0}" -f $desc)
    Write-Host ("  at {0}  ({1})" -f $le.at, $ago) -ForegroundColor DarkGray
} else {
    Write-Host '  Journal has no readable entries.' -ForegroundColor DarkGray
}

if ($summary.Verdict) {
    Write-Host ("  Verdict recorded: {0} - {1}" -f $summary.Verdict.verdict, $summary.Verdict.why) -ForegroundColor Green
} else {
    Write-Host '  No verdict entry. Either the case never calls journal.verdict() (derived verdicts are normal - see' -ForegroundColor Yellow
    Write-Host '  docs/unattended-runs.md), or the run stopped before reaching one. The lifecycle stages above are' -ForegroundColor Yellow
    Write-Host '  the only evidence of how far it got.' -ForegroundColor Yellow
}

if ($summary.Deviations.Count -gt 0) {
    Write-Host ''
    Write-Host 'Deviations recorded' -ForegroundColor Cyan
    foreach ($d in $summary.Deviations) { Write-Host ("  - {0}" -f $d.text) }
}

# ---------------------------------------------------------------- lock check

$laneRoot = $laneRoots[$summary.Lane]
Write-Host ''
Write-Host "Run locks in results\$($summary.Lane)\$($summary.SystemId)\" -ForegroundColor Cyan
$lockDir = Join-Path $laneRoot $summary.SystemId
$locks = @()
if (Test-Path $lockDir) {
    $locks = Get-ChildItem -Path $lockDir -Filter '*.lock' -ErrorAction SilentlyContinue
}
if ($locks.Count -eq 0) {
    Write-Host '  None held. Absence of a lock does NOT by itself prove the run finished - it' -ForegroundColor DarkGray
    Write-Host '  only means nothing that takes a lock (the web lane batch specs, or any' -ForegroundColor DarkGray
    Write-Host '  GUI-lane case via gui_tests/run.py) currently believes it holds one, or' -ForegroundColor DarkGray
    Write-Host '  none was ever taken for this run.' -ForegroundColor DarkGray
} else {
    foreach ($lock in $locks) {
        # Get-Content -Raw returns $null for a zero-byte file, so .Trim() on the
        # result is a terminating error under $ErrorActionPreference = 'Stop' -
        # and a zero-byte lock is exactly what a process killed between creating
        # the file and writing to it leaves behind. Crashing here would take the
        # recovery script out precisely in the crash it exists to diagnose.
        $rawLock = Get-Content -Path $lock.FullName -Raw -ErrorAction SilentlyContinue
        $content = ''
        if ($null -ne $rawLock) { $content = ([string]$rawLock).Trim() }

        $parts     = @($content -split '\|', 2)
        $pidText   = ''
        $startedAt = ''
        if ($parts.Count -ge 1 -and $null -ne $parts[0]) { $pidText   = ([string]$parts[0]).Trim() }
        if ($parts.Count -ge 2 -and $null -ne $parts[1]) { $startedAt = ([string]$parts[1]).Trim() }
        if (-not $startedAt) { $startedAt = 'start time not recorded' }

        if ($pidText -notmatch '^\d+$') {
            # An unreadable lock is NOT a stale lock. A torn or empty file means a
            # process died mid-write, which is a reason to be more careful, not
            # less - reporting "safe to take over" here would hand out exactly the
            # go-ahead that produced the 2026-08-18 duplicate writes.
            Write-Host ("  UNREADABLE  {0}  holds no usable pid (content: '{1}')" -f $lock.Name, $content) -ForegroundColor Red
            Write-Host '          Treat this as held, not stale. A torn lock means a process died between' -ForegroundColor Red
            Write-Host '          creating it and writing to it, so something was mid-run. Confirm in Task' -ForegroundColor Red
            Write-Host '          Manager that no run is alive before deleting it.' -ForegroundColor Red
            continue
        }

        $alive = $false
        try { Get-Process -Id ([int]$pidText) -ErrorAction Stop | Out-Null; $alive = $true } catch { $alive = $false }

        if ($alive) {
            Write-Host ("  HELD    {0}  pid {1} is ALIVE (started {2})" -f $lock.Name, $pidText, $startedAt) -ForegroundColor Red
            Write-Host '          Do not start another run of this batch. If you believe this process is' -ForegroundColor Red
            Write-Host '          actually dead, confirm in Task Manager - not a tool timeout - before deleting it.' -ForegroundColor Red
        } else {
            Write-Host ("  stale   {0}  pid {1} is gone (started {2}) - safe to take over" -f $lock.Name, $pidText, $startedAt) -ForegroundColor DarkGray
        }
    }
}

# ---------------------------------------------------- run-file correlation

Write-Host ''
Write-Host 'Matching run file in results\' -ForegroundColor Cyan
$found = $false
if ($summary.CaseId -and (Test-Path $resultsDir)) {
    $candidates = Get-ChildItem -Path $resultsDir -Filter "$($summary.CaseId)-*.md" -ErrorAction SilentlyContinue
    foreach ($c in $candidates) {
        if ($c.Name -notmatch '^TC-\d+-(\d{4}-\d{2}-\d{2})-(\d{4})') { continue }
        $fileLocal = [datetime]::ParseExact("$($Matches[1]) $($Matches[2])", 'yyyy-MM-dd HHmm', $null)
        if ($summary.LastAtUtc) {
            $diff = [math]::Abs(($fileLocal - $summary.LastAtUtc.ToLocalTime()).TotalMinutes)
            if ($diff -le 15) {
                $text = Get-Content -Path $c.FullName -Raw -Encoding UTF8
                $verdict = Get-Field $text 'Verdict'
                Write-Host ("  {0}  (verdict: {1})" -f $c.Name, $verdict) -ForegroundColor Green
                Write-Host '  Filed within 15 minutes of this journal''s last entry - likely this run''s own' -ForegroundColor DarkGray
                Write-Host '  report. Read it to confirm; this match is by filename timing, not by run id.' -ForegroundColor DarkGray
                $found = $true
            }
        }
    }
}
if (-not $found) {
    Write-Host '  None found near this run''s timeframe. Consistent with the run never reaching' -ForegroundColor Yellow
    Write-Host '  a clean exit (result-file.ts writes on Playwright''s onEnd, which a killed' -ForegroundColor Yellow
    Write-Host '  process never fires) - or it ran without SAP_WRITE_RESULT=1 in the first place.' -ForegroundColor Yellow
    Write-Host '  This journal is the only record of what happened.' -ForegroundColor Yellow
}

Write-Host ''
