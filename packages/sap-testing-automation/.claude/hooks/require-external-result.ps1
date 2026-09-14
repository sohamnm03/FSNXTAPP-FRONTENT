$ErrorActionPreference = 'Stop'
if (-not $env:FSNXT_RUN_ID -or -not $env:FSNXT_EXTERNAL_RUN_RECORD) { exit 0 }
try { $event = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { exit 0 }
if ($event.hook_event_name -ne 'Stop' -or $event.stop_hook_active) { exit 0 }
try {
    $record = Get-Content -LiteralPath $env:FSNXT_EXTERNAL_RUN_RECORD -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.verdict -in @('PASS', 'FAIL', 'BLOCKED', 'PARTIAL')) { exit 0 }
} catch {}
@{
    decision = 'block'
    reason = "Before stopping, use Write to save the observed external testcase result to $env:FSNXT_EXTERNAL_RUN_RECORD. Include steps, assertions, verified documents and the verdict. If blocked, record BLOCKED and the exact blocker. Do not retry a Save to complete this report."
} | ConvertTo-Json -Compress
