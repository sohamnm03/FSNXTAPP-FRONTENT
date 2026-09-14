<#
.SYNOPSIS
    Answer SAP Save elicitation for authorized desktop testcase creation or
    confirmed external runs; relay other requests to the desktop UI.
.DESCRIPTION
    The desktop app sets FSNXT_CASE_CREATION_AUTO_SAVE=1 only for testcase
    creation, where the user has authorized saving the requested scenario.
    FSNXT_EXTERNAL_RUN_AUTO_SAVE=1 is scoped to an external Confirm & Run.
    Claude Code Elicitation uses requested_schema / mcp_server_name as input
    and hookSpecificOutput.action / content as output.
#>
$ErrorActionPreference = 'Stop'

function Respond {
    param([ValidateSet('accept', 'cancel')] [string] $Decision)
    $output = @{ hookSpecificOutput = @{ hookEventName = 'Elicitation'; action = $Decision } }
    if ($Decision -eq 'accept') {
        # FastMCP wraps response_type=bool in an object with a value field.
        $output.hookSpecificOutput.content = @{ value = $true }
    }
    Write-Output ($output | ConvertTo-Json -Depth 6 -Compress)
    exit 0
}

try {
    $requestEvent = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch { exit 0 }

$runId = $env:FSNXT_RUN_ID
if (-not $runId -or $runId -notmatch '^[a-zA-Z0-9-]+$') { exit 0 }

# Only answer the known SAP Save question, never arbitrary forms or login prompts.
if ($requestEvent.hook_event_name -ne 'Elicitation') { exit 0 }
if ($requestEvent.mcp_server_name -notmatch '^sap-gui(?:$|-)') { exit 0 }
if ($requestEvent.mode -and $requestEvent.mode -ne 'form') { exit 0 }
if ($requestEvent.message -notmatch 'triggers Save \(F11\) in SAP') { exit 0 }
$schema = $requestEvent.requested_schema
if ($schema.type -ne 'object' -or $schema.properties.value.type -ne 'boolean') { exit 0 }
if (@($schema.properties.PSObject.Properties).Count -ne 1) { exit 0 }

if (($env:FSNXT_CASE_CREATION_AUTO_SAVE -eq '1' -or $env:FSNXT_EXTERNAL_RUN_AUTO_SAVE -eq '1') -and $requestEvent.mcp_server_name -eq 'sap-gui') {
    Respond 'accept'
}

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$requestsDir = Join-Path $root 'logs\elicitation-requests'
try { New-Item -ItemType Directory -Force -Path $requestsDir | Out-Null } catch { exit 0 }
$requestPath = Join-Path $requestsDir "$runId.request.json"
$responsePath = Join-Path $requestsDir "$runId.response.json"
$tempPath = "$requestPath.tmp"
$request = @{
    id = $runId
    mcpServer = [string]$requestEvent.mcp_server_name
    toolName = 'sap_send_key'
    message = [string]$requestEvent.message
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
}
try {
    ($request | ConvertTo-Json -Compress) | Set-Content -LiteralPath $tempPath -Encoding UTF8 -NoNewline
    Move-Item -LiteralPath $tempPath -Destination $requestPath -Force
} catch {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    exit 0
}

$deadline = (Get-Date).AddSeconds(290)
$accepted = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $responsePath) {
        try {
            $response = Get-Content -LiteralPath $responsePath -Raw | ConvertFrom-Json
            $accepted = $response.accept -is [bool] -and $response.accept
        } catch { }
        break
    }
    Start-Sleep -Milliseconds 400
}
Remove-Item -LiteralPath $requestPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $responsePath -Force -ErrorAction SilentlyContinue
if ($accepted) { Respond 'accept' } else { Respond 'cancel' }
