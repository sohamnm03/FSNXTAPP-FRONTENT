<#
.SYNOPSIS
    Builds the worklog activity dashboard from the files under worklog/<system-id>/.

.DESCRIPTION
    Scans worklog/<system-id>/*.md across every system subfolder (skipping
    _TEMPLATE.md, which lives at worklog/ root, not inside a subfolder),
    extracts one dashboard entry per worklog file, and renders
    dashboard/template.html with that payload injected.

    Output:
      dashboard/output/dashboard.html          the dashboard, open it in a browser
      dashboard/output/dashboard-payload.json  the payload on its own (feed it anywhere)

    Both land under dashboard/output/, which is gitignored -- a rendered
    dashboard reflects whatever is currently in worklog/, which changes every
    activity.

    Parsing is by convention, not by contract. Fields it cannot read are left
    null and show as "-" in the UI; nothing is ever invented. If a worklog file
    deviates from worklog/_TEMPLATE.md, fix the worklog file or hand-edit the
    payload JSON and re-render with -PayloadFile.

.PARAMETER PayloadFile
    Render this payload instead of scanning worklog/. Use it when the payload
    was written by hand.

.PARAMETER NoDetail
    Do not embed each worklog file's markdown in the payload. The dashboard then
    links to the files on disk instead of opening them in the drawer -- smaller
    output, but the links only work locally.

.PARAMETER NoOpen
    Skip opening the rendered dashboard. Opening in the browser is the default
    behaviour -- a rebuilt dashboard nobody looks at defeats the point. Pass
    this only when rendering into a pipeline that has no browser to open.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1"
#>
[CmdletBinding()]
param(
    [string] $PayloadFile,
    [switch] $NoDetail,
    [switch] $NoOpen
)

$ErrorActionPreference = 'Stop'

$root         = Split-Path -Parent $PSScriptRoot
$worklogRoot  = Join-Path $root 'worklog'
$templatePath = Join-Path $root 'dashboard\template.html'
$outDir       = Join-Path $root 'dashboard\output'
$outHtml      = Join-Path $outDir 'dashboard.html'
$outJson      = Join-Path $outDir 'dashboard-payload.json'

if (-not (Test-Path $templatePath)) {
    throw "Dashboard template not found: $templatePath"
}

. (Join-Path $PSScriptRoot 'lib-markdown.ps1')   # $DASH, Get-Field

# ---------------------------------------------------------------- helpers

function ConvertTo-JsonText {
    <#
        Windows PowerShell 5.1's ConvertTo-Json throws OutOfMemoryException on
        a payload this shape, so serialize by hand. Also escapes < > & as
        \uXXXX: the JSON is injected into a <script> block, and a worklog file
        that happens to contain "</script>" would otherwise close it.
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
    # Worklog header bullets use this convention, e.g.
    # "Package: n/a -- repository structure only, no SAP objects touched".
    param([string] $Value)
    if (-not $Value) { return $null }
    $v = $Value -replace '`', '' -replace '\*\*', ''
    $v = ($v -split "\s+$DASH{1,2}\s+")[0]
    $v = $v.Trim()
    if ($v -eq '' -or $v -match "^$DASH$") { return $null }
    return $v
}

function Get-Section {
    # Extracts the body of a "## Heading" section, up to the next "## " or EOF.
    param([string] $Text, [string] $Heading)
    $m = [regex]::Match($Text, "(?ms)^##\s+$([regex]::Escape($Heading))\s*`$(.*?)(?=^##\s|\z)")
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

function Get-ChecklistCounts {
    <#
        Counts "- [ ]" / "- [x]" lines within a section. Deliberately does not
        parse the text after each item -- worklog authors already check off
        not-applicable items as [x] with an explanatory suffix (e.g.
        "- [x] Pretty Printer -- n/a for a DDIC table source"), and leave
        genuinely undone items unchecked. Plain checkbox counting already
        reflects author intent; second-guessing the suffix text would add
        complexity without improving accuracy.
    #>
    param([string] $Text, [string] $Heading)
    $body = Get-Section $Text $Heading
    if ($null -eq $body) { return [ordered]@{ checked = 0; total = 0 } }
    $checked = 0; $total = 0
    foreach ($line in ($body -split "`n")) {
        if ($line -match '^\s*-\s*\[( |x|X)\]') {
            $total++
            if ($Matches[1] -match '[xX]') { $checked++ }
        }
    }
    return [ordered]@{ checked = $checked; total = $total }
}

function Get-WorklogObjects {
    <#
        Tier-1 only: worklogs don't have a code-fence convention like test
        results do. Requires the "| Object | Type | Package | Transport |
        Status |" header (case-insensitive). A row whose Object or Type cell
        is empty/-/n-a contributes to "recorded, zero items" rather than being
        added as an item. A multi-type cell ("DDLS/DF, BDEF/BDO") splits into
        one item per type token, sharing the same object/package/transport/
        status, so the objects-by-type panel counts each type separately.

        No "## Object list" section, or a header that doesn't match, ->
        recorded=false ("not recorded"), never invented.
    #>
    param([string] $Text)

    $unknown = [ordered]@{ recorded = $false; attempted = 0; items = @() }

    $body = Get-Section $Text 'Object list'
    if ($null -eq $body) { return $unknown }

    $header = $null; $rows = @()
    foreach ($line in ($body -split "`n")) {
        if ($line -notmatch '^\s*\|') { continue }
        if ($line -match '^\s*\|[\s:|-]+\|?\s*$') { continue }
        $cells = @((($line.Trim() -replace '^\|', '' -replace '\|$', '') -split '\|') |
                   ForEach-Object { $_.Trim() })
        if (-not $header) { $header = $cells; continue }
        if (($cells -join '') -eq '') { continue }
        $rows += , $cells
    }

    if (-not $header) { return $unknown }
    $h = ($header -join '|').ToLower()
    if ($h -notmatch 'object' -or $h -notmatch 'type' -or $h -notmatch 'package' -or
        $h -notmatch 'transport' -or $h -notmatch 'status') {
        return $unknown
    }

    $items = @()
    foreach ($r in $rows) {
        $obj  = if ($r.Count -gt 0) { ($r[0] -replace '`', '' -replace '\*\*', '').Trim() } else { '' }
        $type = if ($r.Count -gt 1) { ($r[1] -replace '`', '' -replace '\*\*', '').Trim() } else { '' }
        $pkg  = if ($r.Count -gt 2) { ($r[2] -replace '`', '' -replace '\*\*', '').Trim() } else { '' }
        $trns = if ($r.Count -gt 3) { ($r[3] -replace '`', '' -replace '\*\*', '').Trim() } else { '' }
        $stat = if ($r.Count -gt 4) { ($r[4] -replace '`', '' -replace '\*\*', '').Trim() } else { '' }

        if ([string]::IsNullOrEmpty($obj) -or $obj -match "(?i)^$DASH$|^n/?a$" -or
            [string]::IsNullOrEmpty($type) -or $type -match "(?i)^$DASH$|^n/?a$") {
            continue   # "no objects" row -- recorded, contributes zero items
        }

        foreach ($t in ($type -split '\s*,\s*')) {
            if (-not $t) { continue }
            $items += [ordered]@{
                object = $obj; type = $t; package = $pkg; transport = $trns; status = $stat
            }
        }
    }

    return [ordered]@{ recorded = $true; attempted = $items.Count; items = $items }
}

function Get-Lessons {
    # L-nnn tokens from the "## Lessons raised" section only, deduped in order.
    param([string] $Text)
    $body = Get-Section $Text 'Lessons raised'
    if ($null -eq $body) { return @() }
    $out = @()
    foreach ($m in [regex]::Matches($body, '(?i)L-\d+')) {
        $v = $m.Value.ToUpper()
        if ($out -notcontains $v) { $out += $v }
    }
    # Unary comma: without it, `return $out` unrolls a single-element array
    # onto the pipeline and the caller receives a bare string instead of a
    # one-item array -- a classic PowerShell gotcha that only bites when
    # there is exactly one lesson.
    return ,$out
}

function Get-Status {
    param($Todo, $DeliveryChecks)
    if ($Todo.checked -eq $Todo.total -and $DeliveryChecks.checked -eq $DeliveryChecks.total -and
        ($Todo.total -gt 0 -or $DeliveryChecks.total -gt 0)) {
        return 'complete'
    }
    return 'in-progress'
}

# ---------------------------------------------------------------- payload

if ($PayloadFile) {
    if (-not (Test-Path $PayloadFile)) { throw "Payload file not found: $PayloadFile" }
    $json = Get-Content -Path $PayloadFile -Raw -Encoding UTF8
    Write-Host "Payload: $PayloadFile (as supplied)"
}
else {
    if (-not (Test-Path $worklogRoot)) { throw "No worklog directory: $worklogRoot" }

    $systemDirs = Get-ChildItem -Path $worklogRoot -Directory | Sort-Object Name
    if (-not $systemDirs) { Write-Warning "No system subfolders under $worklogRoot - the dashboard will be empty." }

    $runs = @()
    $systemsSeen = @()
    foreach ($sysDir in $systemDirs) {
        $system = $sysDir.Name
        $files = Get-ChildItem -Path $sysDir.FullName -Filter '*.md' |
                 Where-Object { $_.Name -ne '_TEMPLATE.md' } |
                 Sort-Object Name

        foreach ($f in $files) {
            $text = Get-Content -Path $f.FullName -Raw -Encoding UTF8

            $dateMatch = [regex]::Match($f.BaseName, '^(\d{4}-\d{2}-\d{2})')
            $date = if ($dateMatch.Success) { $dateMatch.Groups[1].Value } else { $null }

            $titleMatch = [regex]::Match($text, '(?m)^#\s+(.+?)\s*$')
            $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { $null }

            $todo    = Get-ChecklistCounts $text 'Todo'
            $checks  = Get-ChecklistCounts $text 'Delivery checks'
            $objects = Get-WorklogObjects $text
            $lessons = Get-Lessons $text
            $status  = Get-Status $todo $checks

            if ($systemsSeen -notcontains $system) { $systemsSeen += $system }

            $run = [ordered]@{
                id             = $f.BaseName
                system         = $system
                date           = $date
                title          = $title
                package        = Clean-Value (Get-Field $text 'Package')
                transport      = Clean-Value (Get-Field $text 'Transport')
                requestedBy    = Clean-Value (Get-Field $text 'Requested by')
                todo           = $todo
                deliveryChecks = $checks
                status         = $status
                objects        = $objects
                lessons        = $lessons
                worklogPath    = "worklog/$system/$($f.Name)"
                worklogUrl     = "../../worklog/$system/$($f.Name)"
            }
            if (-not $NoDetail) { $run.detail = $text }

            $runs += [pscustomobject]$run
        }
    }

    $payload = [ordered]@{
        title       = 'SAP development activity'
        system      = ($systemsSeen -join ', ')
        generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        # Parens around each concatenation are load-bearing: unparenthesized
        # `+` mixed with the `,` array-literal separator misparses in
        # PowerShell (comma binds tighter than expected), collapsing this
        # into a one-element array. Confirmed by direct testing.
        chips       = @(
            ("$($runs.Count) worklog " + $(if ($runs.Count -eq 1) { 'entry' } else { 'entries' })),
            ("$($systemsSeen.Count) " + $(if ($systemsSeen.Count -eq 1) { 'system' } else { 'systems' }))
        )
        runs        = $runs
    }

    $json = ConvertTo-JsonText -Value $payload
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
    [IO.File]::WriteAllText($outJson, $json, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Payload: $outJson  ($($runs.Count) worklog entries)"
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

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
[IO.File]::WriteAllText($outHtml, $rendered, (New-Object Text.UTF8Encoding($false)))
Write-Host "Dashboard: $outHtml"

if (-not $NoOpen) { Start-Process $outHtml }
