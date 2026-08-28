<#
.SYNOPSIS
    Builds the results dashboard from the run files under results/.

.DESCRIPTION
    Scans results/*.md (skipping _TEMPLATE.md), extracts one dashboard entry per
    run, and renders dashboard/template.html with that payload injected.

    Output:
      results/dashboard.html          the dashboard, open it in a browser
      results/dashboard-payload.json  the payload on its own (feed it anywhere)

    Both land under results/, which is gitignored -- a rendered dashboard
    embeds live business data pulled off DS4.

    Parsing is by convention, not by contract. Fields it cannot read are left
    null and show as "-" in the UI; nothing is ever invented. If a run file
    deviates from results/_TEMPLATE.md, fix the run file or hand-edit the
    payload JSON and re-render with -PayloadFile.

.PARAMETER PayloadFile
    Render this payload instead of scanning results/. Use it when the payload
    was written by hand.

.PARAMETER NoDetail
    Do not embed each result file's markdown in the payload. The dashboard then
    links to the files on disk instead of opening them in the drawer -- smaller
    output, but the links only work locally.

.PARAMETER Open
    Deprecated, kept for backward compatibility. Opening is now the default -- this
    switch is accepted but does nothing.

.PARAMETER NoOpen
    Skip opening the rendered dashboard. Opening in the browser is the default
    behaviour, since a rebuilt dashboard nobody looks at is the whole reason this
    rule kept getting missed -- pass this only when rendering into a pipeline that
    has no browser to open (CI, a headless box).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1"
#>
[CmdletBinding()]
param(
    [string] $PayloadFile,
    [switch] $NoDetail,
    [switch] $Open,
    [switch] $NoOpen
)

$ErrorActionPreference = 'Stop'

$root         = Split-Path -Parent $PSScriptRoot
$resultsDir   = Join-Path $root 'results'
$caseDir      = Join-Path $root 'test-cases'
$templatePath = Join-Path $root 'dashboard\template.html'
$outHtml      = Join-Path $resultsDir 'dashboard.html'
$outJson      = Join-Path $resultsDir 'dashboard-payload.json'

if (-not (Test-Path $templatePath)) {
    throw "Dashboard template not found: $templatePath"
}

. (Join-Path $PSScriptRoot 'lib-markdown.ps1')   # $DASH, Get-Field

# ---------------------------------------------------------------- helpers

function ConvertTo-JsonText {
    <#
        Windows PowerShell 5.1's ConvertTo-Json throws OutOfMemoryException on
        this payload, so serialize by hand. Also escapes < > & as \uXXXX: the
        JSON is injected into a <script> block, and a result file that happens
        to contain "</script>" would otherwise close it.
    #>
    param($Value, [int] $Indent = 0)

    $pad  = ' ' * $Indent
    $pad2 = ' ' * ($Indent + 2)

    if ($null -eq $Value) { return 'null' }

    if ($Value -is [bool])   { return $(if ($Value) { 'true' } else { 'false' }) }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
        return [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0}', $Value)
    }

    if ($Value -is [string]) {
        $sb = New-Object Text.StringBuilder
        [void]$sb.Append('"')
        foreach ($ch in $Value.ToCharArray()) {
            switch ($ch) {
                '"'      { [void]$sb.Append('\"'); continue }
                '\'      { [void]$sb.Append('\\'); continue }
                "`b"     { [void]$sb.Append('\b'); continue }
                "`f"     { [void]$sb.Append('\f'); continue }
                "`n"     { [void]$sb.Append('\n'); continue }
                "`r"     { [void]$sb.Append('\r'); continue }
                "`t"     { [void]$sb.Append('\t'); continue }
                default {
                    $code = [int]$ch
                    if ($code -lt 32 -or $code -gt 126 -or $ch -eq '<' -or $ch -eq '>' -or $ch -eq '&') {
                        [void]$sb.AppendFormat('\u{0:x4}', $code)
                    } else {
                        [void]$sb.Append($ch)
                    }
                }
            }
        }
        [void]$sb.Append('"')
        return $sb.ToString()
    }

    if ($Value -is [Collections.IDictionary]) {
        if ($Value.Count -eq 0) { return '{}' }
        $parts = foreach ($k in $Value.Keys) {
            $pad2 + (ConvertTo-JsonText -Value ([string]$k)) + ': ' +
                (ConvertTo-JsonText -Value $Value[$k] -Indent ($Indent + 2))
        }
        return "{`n" + ($parts -join ",`n") + "`n$pad}"
    }

    if ($Value -is [Management.Automation.PSCustomObject]) {
        $props = $Value.PSObject.Properties
        $parts = foreach ($p in $props) {
            $pad2 + (ConvertTo-JsonText -Value $p.Name) + ': ' +
                (ConvertTo-JsonText -Value $p.Value -Indent ($Indent + 2))
        }
        if (-not $parts) { return '{}' }
        return "{`n" + ($parts -join ",`n") + "`n$pad}"
    }

    if ($Value -is [Collections.IEnumerable]) {
        $items = @($Value)
        if ($items.Count -eq 0) { return '[]' }
        $parts = foreach ($i in $items) {
            $pad2 + (ConvertTo-JsonText -Value $i -Indent ($Indent + 2))
        }
        return "[`n" + ($parts -join ",`n") + "`n$pad]"
    }

    return (ConvertTo-JsonText -Value ([string]$Value))
}

function Clean-Value {
    # Strips markdown emphasis/backticks and cuts a trailing "-- comment" clause.
    param([string] $Value)
    if (-not $Value) { return $null }
    $v = $Value -replace '`', '' -replace '\*\*', ''
    # En dash and em dash. Written as escapes, never as literals:
    # Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI, so a literal dash
    # in this file would arrive mojibake'd and silently never match.
    $v = ($v -split "\s+$DASH{1,2}\s+")[0]
    $v = $v.Trim()
    if ($v -eq '' -or $v -match "^$DASH$") { return $null }
    return $v
}

function Get-CaseMeta {
    # Reads Lane and Transaction out of the linked test case file.
    param([string] $CaseId, [string] $CasePath)

    $file = $null
    if ($CasePath) {
        $candidate = Join-Path $root ($CasePath -replace '`', '' -replace '^\./', '')
        if (Test-Path $candidate) { $file = $candidate }
    }
    if (-not $file -and $CaseId) {
        # -Recurse: cases are filed by lane under test-cases/GUI-TC and
        # test-cases/Web-TC, so a flat listing of test-cases/ finds nothing.
        $file = Get-ChildItem -Path $caseDir -Filter "$CaseId-*.md" -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object FullName | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $file) { return @{ lane = $null; transaction = $null; caseTitle = $null } }

    $text = Get-Content -Path $file -Raw -Encoding UTF8
    $lane = Clean-Value (Get-Field $text 'Lane')
    if ($lane) { $lane = ($lane -split '[ |(]')[0].Trim() }
    $txn = Clean-Value (Get-Field $text 'Transaction / app')

    $caseTitle = $null
    $h = [regex]::Match($text, '(?m)^#\s+(.+?)\s*$')
    if ($h.Success) {
        $caseTitle = ($h.Groups[1].Value -replace "^[A-Za-z]+-\d+\s*$DASH\s*", '').Trim()
    }
    return @{ lane = $lane; transaction = $txn; caseTitle = $caseTitle }
}

function Get-AssertionCounts {
    # Counts the result column of the "## Assertions" table.
    param([string] $Text)

    $section = [regex]::Match($Text, '(?ms)^##\s+Assertions\s*$(.*?)(?=^##\s|\z)')
    if (-not $section.Success) { return $null }

    $passed = 0; $failed = 0; $notObserved = 0; $seen = $false
    foreach ($line in ($section.Groups[1].Value -split "`n")) {
        if ($line -notmatch '^\s*\|') { continue }
        if ($line -match '^\s*\|[\s:|-]+\|?\s*$') { continue }
        $cells = ($line.Trim() -replace '^\|', '' -replace '\|$', '') -split '\|'
        if ($cells.Count -lt 2) { continue }
        $verdict = $cells[-1].Trim()
        if ($verdict -match '^\s*$' -or $verdict -match '(?i)^result$') { continue }
        $seen = $true
        switch -Regex ($verdict) {
            '(?i)not\s+observed' { $notObserved++; break }
            '(?i)\bfail'         { $failed++; break }
            '(?i)\bpass'         { $passed++; break }
            default              { }
        }
    }
    if (-not $seen) { return $null }
    return [ordered]@{ passed = $passed; failed = $failed; notObserved = $notObserved }
}

function New-ObjectItem {
    <#
        One business object a run wrote (or tried to write). Every field is
        derived from the run file; nothing is filled in from expectation.
    #>
    param(
        [string] $Type, [string] $Number, [string] $CompanyCode,
        [string] $Lifecycle, [string] $Cleanup, [string] $Label
    )

    $type = ($Type -replace '`', '' -replace '\*\*', '').Trim()

    # "Fixed-Term Deposit, co.code 9800, txn type 100" -- the company code is
    # part of the object's identity, so it moves to its own field and out of the
    # type text. A bare number is not an identity: 200128 exists in 9800 and
    # 100024 in 9999, and they are different objects.
    $cc = $CompanyCode
    if (-not $cc) {
        $m = [regex]::Match($type, '(?i)co\.?\s*code\s*(\d{4})')
        if ($m.Success) { $cc = $m.Groups[1].Value }
    }
    if ($cc) { $cc = ([regex]::Match($cc, '\d{4}')).Value }
    $type = ($type -replace '(?i),?\s*co\.?\s*code\s*\d{4}\s*', ' ')
    $type = ($type -replace '\s+,', ',' -replace '\s{2,}', ' ').Trim(' ', ',')

    $numRaw = ($Number -replace '`', '' -replace '\*\*', '').Trim()
    $num = $null; $note = $null; $state = $null

    if ($numRaw -match '(?i)^(none|no\b|nothing|not created)') {
        # TC-001: "none -- creation failed". Attempted, wrote nothing. Recording
        # this as an object numbered "none" would invent a document.
        $state = 'not-created'
        $note  = $numRaw
    }
    elseif ($numRaw -match '(?i)not\s+observed') {
        # The write happened; the number was never read off a screen. It counts
        # as an object -- dropping it would under-report what is in the system.
        $note = 'NOT OBSERVED'
    }
    else {
        $d = [regex]::Match($numRaw, '\d{4,}')
        if ($d.Success) { $num = $d.Value } else { $note = $numRaw }
    }

    $life = @()
    $lifeText = "$Lifecycle $Cleanup"
    foreach ($s in @('created', 'settled', 'posted', 'reversed')) {
        # \b matters: "post never attempted" and "post blocked" are not "posted".
        if ($lifeText -match "(?i)\b$s\b") { $life += $s }
    }
    if ($Lifecycle -match '(?i)\breused\b')      { $state = 'reused' }
    if ($Lifecycle -match '(?i)\bnot.created\b') { $state = 'not-created' }

    if (-not $state) {
        # A row under "Documents created" that carries a number is at minimum
        # created; that is what the heading asserts, not an inference of ours.
        if ($life.Count) { $state = $life[-1] }
        elseif ($num -or $note -eq 'NOT OBSERVED') { $state = 'created'; $life = @('created') }
        else { $state = 'not-created' }
    }
    if ($state -ne 'not-created' -and $state -ne 'reused' -and -not $life.Count) { $life = @($state) }

    $clean = $null
    $cleanText = ($Cleanup -replace '`', '').Trim()
    if     ($cleanText -match '(?i)^n/?a')                          { $clean = 'n/a' }
    elseif ($cleanText -match '(?i)\breversed\b')                   { $clean = 'reversed' }
    # Hyphen or space: the objects-block vocabulary documented in
    # dashboard/README.md is "left-in-place", and matching only "left in place"
    # sent the documented spelling through to the note field with cleanup null.
    elseif ($cleanText -match '(?i)^(yes|left[\s-]in[\s-]place)')   { $clean = 'left-in-place' }
    elseif ($cleanText -match '(?i)^(no)\b')                        { $clean = 'removed' }

    # Whatever the cleanup cell says beyond "yes" and the lifecycle words is the
    # reason a document stopped where it did -- "post never attempted (data
    # mistake)", "post blocked (deviation 2)". Dropping it would leave the
    # dashboard showing a half-finished deal with no explanation on the row.
    $res = $cleanText
    $res = $res -replace '(?i)^\s*(left[\s-]in[\s-]place|yes|no|n/?a)\b[\s,;:]*', ''
    $res = $res -replace "^\s*$DASH\s*", ''
    $res = $res -replace '(?i)^\s*((created|settled|posted|reversed)\b[\s,;]*(and\s+)?)+', ''
    $res = $res.Trim(' ', ';', ',', '.')
    if ($res -and $res -notmatch "^$DASH$") {
        $note = $(if ($note) { "$note; $res" } else { $res })
    }

    $lbl = $null
    if ($Label) { $lbl = ($Label -replace '`', '' -replace '\*\*', '').Trim() }

    return [ordered]@{
        type        = $(if ($type) { $type } else { $null })
        number      = $num
        companyCode = $(if ($cc) { $cc } else { $null })
        state       = $state
        lifecycle   = $life
        cleanup     = $clean
        label       = $lbl
        note        = $note
    }
}

function Get-Objects {
    <#
        What a run wrote into the system, read three ways in this order:

          tier 2  an explicit ```objects block -- exact, wins wherever present
          tier 1  the "| Type | Number | Left in place? |" table by convention
          tier 3  neither parses -> recorded=$false, shown as "not recorded"

        Tier 3 exists on purpose. The run files carry at least four different
        shapes of this section (table, variant matrix, one-line prose, "None."),
        and a parser that flattens an unrecognised one to zero would report a
        clean run over objects that are sitting in the system. "Not recorded" is
        a gap the dashboard admits to; 0 is a claim it cannot support.
    #>
    param([string] $Text)

    $unknown = [ordered]@{ recorded = $false; attempted = 0; items = @() }

    # ---- tier 2
    $fence = [regex]::Match($Text, '(?ms)^```objects[ \t]*\r?$(.*?)^```')
    if ($fence.Success) {
        $items = @(); $attempted = $null
        foreach ($line in ($fence.Groups[1].Value -split "`n")) {
            $l = $line.Trim()
            if (-not $l -or $l.StartsWith('#')) { continue }
            $a = [regex]::Match($l, '(?i)^attempted\s*:\s*(\d+)\s*$')
            if ($a.Success) { $attempted = [int]$a.Groups[1].Value; continue }
            $c = @($l -split '\s*\|\s*')
            if ($c.Count -lt 2) { continue }
            $items += New-ObjectItem `
                -Type        $c[0] `
                -Number      $c[1] `
                -CompanyCode $(if ($c.Count -gt 2) { $c[2] } else { '' }) `
                -Lifecycle   $(if ($c.Count -gt 3) { $c[3] } else { '' }) `
                -Cleanup     $(if ($c.Count -gt 4) { $c[4] } else { '' }) `
                -Label       $(if ($c.Count -gt 5) { $c[5] } else { '' })
        }
        if ($null -eq $attempted) { $attempted = $items.Count }
        return [ordered]@{ recorded = $true; attempted = $attempted; items = $items }
    }

    # ---- tier 1
    $section = [regex]::Match($Text, '(?ms)^##\s+Documents created\s*$(.*?)(?=^##\s|\z)')
    if (-not $section.Success) { return $unknown }
    $body = $section.Groups[1].Value

    $header = $null; $rows = @()
    foreach ($line in ($body -split "`n")) {
        if ($line -notmatch '^\s*\|') { continue }
        if ($line -match '^\s*\|[\s:|-]+\|?\s*$') { continue }
        $cells = @((($line.Trim() -replace '^\|', '' -replace '\|$', '') -split '\|') |
                   ForEach-Object { $_.Trim() })
        if (-not $header) { $header = $cells; continue }
        if (($cells -join '') -eq '') { continue }   # the empty template row
        $rows += , $cells
    }

    if ($header) {
        $h = ($header -join '|').ToLower()
        # Only the documented shape is parsed. TC-003's "Variant | Deal | What is
        # different about it" is a different table and is left to tier 3 rather
        # than being guessed at column by column.
        if ($h -match 'type' -and $h -match 'number' -and $h -match 'left in place') {
            $items = @()
            foreach ($r in $rows) {
                $items += New-ObjectItem `
                    -Type      $r[0] `
                    -Number    $(if ($r.Count -gt 1) { $r[1] } else { '' }) `
                    -Lifecycle $(if ($r.Count -gt 2) { $r[2] } else { '' }) `
                    -Cleanup   $(if ($r.Count -gt 2) { $r[2] } else { '' })
            }
            return [ordered]@{ recorded = $true; attempted = $items.Count; items = $items }
        }
        return $unknown
    }

    # ---- explicit nothing: "None. No write occurred ..." (TC-006, TC-007).
    # A stated none is a recorded fact and reads as 0, not as a gap.
    if ($body -match '(?im)^\s*(none|no documents|nothing)\b') {
        return [ordered]@{ recorded = $true; attempted = 0; items = @() }
    }

    return $unknown
}

function Normalize-Verdict {
    param([string] $Raw)
    if (-not $Raw) { return 'OTHER' }
    $v = ($Raw -replace '[^A-Za-z]', ' ').Trim().ToUpper()
    $first = ($v -split '\s+')[0]
    switch ($first) {
        'PASS'    { return 'PASS' }
        'PASSED'  { return 'PASS' }
        'FAIL'    { return 'FAIL' }
        'FAILED'  { return 'FAIL' }
        'BLOCKED' { return 'BLOCKED' }
        'PARTIAL' { return 'PARTIAL' }
        default   { return 'OTHER' }
    }
}

# ---------------------------------------------------------------- payload

if ($PayloadFile) {
    if (-not (Test-Path $PayloadFile)) { throw "Payload file not found: $PayloadFile" }
    $json = Get-Content -Path $PayloadFile -Raw -Encoding UTF8
    Write-Host "Payload: $PayloadFile (as supplied)"
}
else {
    if (-not (Test-Path $resultsDir)) { throw "No results directory: $resultsDir" }

    $files = Get-ChildItem -Path $resultsDir -Filter '*.md' |
             Where-Object { $_.Name -ne '_TEMPLATE.md' } |
             Sort-Object Name

    if (-not $files) { Write-Warning "No run files under $resultsDir - the dashboard will be empty." }

    $runs = @()
    foreach ($f in $files) {
        $text = Get-Content -Path $f.FullName -Raw -Encoding UTF8

        # results/TC-006-2026-08-17-1930-create-9999.md
        $n = [regex]::Match($f.BaseName, '^(?<case>[A-Za-z]+-\d+)-(?<date>\d{4}-\d{2}-\d{2})(?:-(?<time>\d{4}))?(?:-(?<tag>.+))?$')
        $caseId = if ($n.Success) { $n.Groups['case'].Value } else { $f.BaseName }
        $ranAt  = $null
        if ($n.Success) {
            $ranAt = $n.Groups['date'].Value
            if ($n.Groups['time'].Success) {
                $t = $n.Groups['time'].Value
                $ranAt = "$ranAt $($t.Substring(0,2)):$($t.Substring(2,2))"
            }
        }

        $verdictRaw = Clean-Value (Get-Field $text 'Verdict')
        $casePath   = Get-Field $text 'Case'
        $meta       = Get-CaseMeta -CaseId $caseId -CasePath $casePath

        $title = $meta.caseTitle
        if (-not $title) {
            $h = [regex]::Match($text, '(?m)^#\s+(.+?)\s*$')
            if ($h.Success) {
                $title = ($h.Groups[1].Value -replace "\s*$DASH\s*run\s+.*$", '' -replace '^[A-Za-z]+-\d+\s*', '').Trim()
            }
        }
        if ($n.Success -and $n.Groups['tag'].Success) {
            $title = "$title ($($n.Groups['tag'].Value -replace '-', ' '))"
        }

        $run = [ordered]@{
            id          = $f.BaseName
            case        = $caseId
            title       = $title
            lane        = $meta.lane
            transaction = $meta.transaction
            verdict     = Normalize-Verdict $verdictRaw
            verdictRaw  = $verdictRaw
            ranAt       = $ranAt
            assertions  = Get-AssertionCounts $text
            objects     = Get-Objects $text
            resultFile  = "results/$($f.Name)"
            resultUrl   = "./$($f.Name)"
        }
        if (-not $NoDetail) { $run.detail = $text }

        $runs += [pscustomobject]$run
    }

    $payload = [ordered]@{
        title       = 'SAP test results'
        system      = 'DS4 / client 100 (DS4_100_NIIF)'
        generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        chips       = @("$($runs.Count) runs", "$(($runs | Select-Object -ExpandProperty case -Unique).Count) test cases")
        runs        = $runs
    }

    $json = ConvertTo-JsonText -Value $payload
    [IO.File]::WriteAllText($outJson, $json, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Payload: $outJson  ($($runs.Count) runs)"
}

# ---------------------------------------------------------------- render

$template = Get-Content -Path $templatePath -Raw -Encoding UTF8
$pattern  = '(?s)(<script type="application/json" id="dashboard-payload">).*?(</script>)'
$evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $m.Groups[1].Value + "`n" + $json + "`n" + $m.Groups[2].Value
}
$rendered = [regex]::Replace($template, $pattern, $evaluator)

if ($rendered -eq $template) {
    throw "Could not find the payload block in $templatePath - was the template edited?"
}

[IO.File]::WriteAllText($outHtml, $rendered, (New-Object Text.UTF8Encoding($false)))
Write-Host "Dashboard: $outHtml"

if (-not $NoOpen) { Start-Process $outHtml }
