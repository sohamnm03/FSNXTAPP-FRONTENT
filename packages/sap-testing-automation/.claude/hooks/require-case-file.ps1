# Give an authoring turn one chance to finish its file before it exits.
$ErrorActionPreference = 'Stop'
if (-not $env:FSNXT_RUN_ID -or -not $env:FSNXT_CASE_DRAFT_DIR) { exit 0 }
try {
    $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($event.hook_event_name -ne 'Stop' -or $event.stop_hook_active) { exit 0 }
    $existing = @($env:FSNXT_CASE_EXISTING_FILES | ConvertFrom-Json)
    $files = @(Get-ChildItem -LiteralPath $env:FSNXT_CASE_DRAFT_DIR -Filter '*.md' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin $existing })
    foreach ($file in $files) {
        if (Select-String -LiteralPath $file.FullName -Pattern '^-\s*\*\*Case id:\*\*\s*TC-\d{3}\s*$' -Quiet) { exit 0 }
    }
    @{
        decision = 'block'
        reason = "The testcase Markdown file is missing. Before ending, use Write to create it in $env:FSNXT_CASE_DRAFT_DIR using test-cases/_TEMPLATE.md and a valid Case id header. Record only observed SAP steps and the verified document number, or mark the Save as failed/unverified with the exact blocker. The requested Save is already authorized; do not ask again. Inspect the existing SAP state before any Save retry to avoid duplicate deals. Do not run a second scenario merely to write its file."
    } | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
