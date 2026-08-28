<#
.SYNOPSIS
    PreToolUse guard. Refuses an edit to a file this workspace generates, and
    refuses to rewrite a run file that already exists.

.DESCRIPTION
    Two of this workspace's rules were documented but unenforced. Both are the
    kind that fail silently and are expensive to notice:

      * CLAUDE.md rule 8 - .mcp.json is GENERATED from config/sap-systems.json
        by scripts/sync-sap-systems.ps1. A hand-edit survives until the next
        regeneration and then vanishes, so a wrong endpoint or a pasted secret
        can look fixed while the registry still says something else.

      * CLAUDE.md rules 5 and 6 - record what actually happened, never invent a
        result. web-tests/journal.ts exists precisely because transcription is
        where a report drifts from a run ("the worst place for a human or a
        model to stand"). Rewriting a results/TC-*.md after the fact is that
        same drift, one step later: the dashboard, the freeze gate's PASS
        count and the case's Run history all read that file.

    What this refuses, exactly:

      * any Edit/Write to .mcp.json;
      * any Edit/Write to results/<something>.md that ALREADY EXISTS.

    What it deliberately allows:

      * CREATING a new results/*.md. The model-driven way of working writes its
        own run file by hand from what it watched happen, and that is a
        supported path (docs/unattended-runs.md: "a session that drives a spec
        and then writes its own result file by hand is therefore unaffected").
        This guard is additive - it blocks revising a record, not producing one.
      * results/_TEMPLATE.md, which is the committed template, not a record.
      * web-tests/reporters/result-file.ts writing run files. That is Node
        writing to disk, not the Edit/Write tool, so it never reaches this hook.

    A guard that cannot read its own input must not block the session, so every
    failure path here exits 0 (allow). This refuses specific known-bad edits; it
    is not a general safety net.

.NOTES
    Wired up as a PreToolUse hook on Edit|Write in .claude/settings.json.
    To bypass deliberately: edit the file outside Claude Code, or comment the
    hook out of settings.json. The refusal is aimed at an automated edit made
    without a person deciding, not at the person.
#>

# A guard that throws is a guard that blocks work for the wrong reason.
$ErrorActionPreference = 'Stop'

function Allow {
    # Silence + exit 0 is "no opinion" - the tool call proceeds normally.
    exit 0
}

function Deny {
    param([string] $Reason)
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Reason
        }
    }
    Write-Output ($payload | ConvertTo-Json -Depth 5 -Compress)
    exit 0
}

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { Allow }
    $event = $raw | ConvertFrom-Json
} catch {
    Allow
}

$filePath = ''
try {
    if ($event.PSObject.Properties.Name -contains 'tool_input' -and
        $event.tool_input.PSObject.Properties.Name -contains 'file_path') {
        $filePath = [string]$event.tool_input.file_path
    }
} catch {
    Allow
}
if (-not $filePath) { Allow }
  
# ------------------------------------------------------------- scope to repo
#
# Anchored to this repo rather than matched by name: a bare '\results\*.md'
# pattern would also fire on an unrelated project's results folder if the
# session's working directory moved.

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # .claude\hooks -> .claude -> repo

try {
    $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
    if ([System.IO.Path]::IsPathRooted($filePath)) {
        $full = [System.IO.Path]::GetFullPath($filePath)
    } else {
        $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $filePath))
    }
} catch {
    Allow
}

if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { Allow }

$rel  = $full.Substring($rootFull.Length).TrimStart('\')
$leaf = Split-Path -Leaf $full

# --------------------------------------------- rule 8: .mcp.json is generated

if ($rel -ieq '.mcp.json') {
    Deny (
        ".mcp.json is generated, not edited (CLAUDE.md rule 8). A hand-edit here " +
        "survives only until the next regeneration and then silently disappears.`n`n" +
        "Edit config/sap-systems.json instead, then run:`n" +
        "  powershell -ExecutionPolicy Bypass -File `"scripts\sync-sap-systems.ps1`"`n`n" +
        "Then restart Claude Code - MCP servers read their environment at startup. " +
        "Note that sync-sap-systems.ps1 preserves any server whose name does not " +
        "start with 'sap-gui', so a hand-added non-SAP server is not the reason to " +
        "edit this file directly either - use 'claude mcp add'."
    )
}

# ------------------------------- rules 5/6: a run file is a record, not a draft

if ($rel -imatch '^results\\[^\\]+\.md$' -and $leaf -ine '_TEMPLATE.md') {
    if (Test-Path -LiteralPath $full) {
        Deny (
            "results/$leaf already exists, and a run file is a record of what a live " +
            "SAP run did - not a document to revise (CLAUDE.md rules 5 and 6).`n`n" +
            "scripts/build-dashboard.ps1 renders it, scripts/check-suite.ps1 counts it " +
            "toward the freeze gate, and the case's Run history cites it. Editing it " +
            "after the fact is exactly the hand-transcription step web-tests/journal.ts " +
            "was built to remove.`n`n" +
            "If this file is wrong: say so to the user and let them decide. If a run " +
            "produced no record because it was interrupted, read the journal instead - " +
            "  powershell -ExecutionPolicy Bypass -File `"scripts\check-run.ps1`" -Latest`n" +
            "Creating a NEW results/*.md for a run you just drove is allowed and is not " +
            "affected by this guard."
        )
    }
}

Allow
