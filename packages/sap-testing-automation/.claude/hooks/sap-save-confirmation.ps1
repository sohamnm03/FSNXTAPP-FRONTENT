<#
.SYNOPSIS
    Elicitation hook for the sap-gui MCP server(s): bridges its "confirm
    before Save" prompt out to the FSNXT desktop app's own chat UI when this
    session is being driven by that app, instead of letting it get silently
    auto-cancelled.

.DESCRIPTION
    docs/sap-gui-mcp-setup.md § Safety rails: `sap_send_key` with `Save`/`F11`
    calls the MCP server's own `ctx.elicit(...)` before committing, and that
    server treats "the client can't answer" as "don't save" (fail closed, not
    save silently) - see mcp_sap_gui's `_confirm_save`. That is correct for an
    interactive client. It is also, unavoidably, a dead end for the FSNXT
    desktop app: it drives `claude -p` headlessly (stdin closed, no TTY - see
    electron/sapTerminalManager.js start()), so with no hook registered here,
    every Save is cancelled the instant it's attempted - fields filled in
    correctly, nothing ever written, and no visible dialog explaining why.

    docs/test-authoring-guide.md § Steps that write is explicit that the MCP
    elicitation is "a backstop, not the plan" - the actual plan (CLAUDE.md
    rule 3) is that the AI Assistant stops and gets the human's confirmation
    in chat *before* ever attempting the write. The FSNXT app already builds
    that gate into the prompts it sends (buildInteractiveRunPrompt /
    buildCaseCreationPrompt in SapTestingScreen.jsx) and into its own
    pre-run "Confirm SAP database writes" dialog. This hook does not bypass
    the backstop - it relays it to a human through the one channel a headless
    run actually has: sapTerminalManager.js's existing ~500ms run-status poll,
    surfaced as a second, distinct confirmation dialog in the chat UI
    ("Confirm SAP Save") that blocks this hook for a real answer, the same
    way an interactive elicitation dialog would.

    Talks to sapTerminalManager.js entirely through logs/elicitation-requests/
    (gitignored - see .gitignore's `logs/` entry), keyed by FSNXT_RUN_ID (set
    on the claude.exe child's environment by claudeEnvironment() - see
    sapTerminalManager.js) rather than the MCP session id, so no session-id
    correlation is needed and two runs can never collide:

      1. Write <runId>.request.json describing what's being asked.
      2. Poll for <runId>.response.json to appear (sapTerminalManager.js's
         answerElicitation(), called once the user clicks Confirm/Cancel in
         the app).
      3. Translate that answer into this hook's own decision and exit.

    Outside the FSNXT app (FSNXT_RUN_ID unset - a developer's own interactive
    `claude` session, or `claude -p` run by hand), this hook makes no
    decision at all (exit 0, no output) and steps out of the way entirely -
    Claude Code's normal elicitation handling for that session applies
    unchanged, exactly as if this hook were not registered.

    A hook that cannot read its own input, or that is asked to answer
    something other than the single yes/no shape sap_send_key's Save
    confirmation actually uses, also steps out of the way rather than
    guessing - see the schema check below.

.NOTES
    Wired up as an Elicitation hook (matcher "^sap-gui") in .claude/settings.json.
    Give it a generous `timeout` there - it blocks for as long as a human
    takes to click a button in the app, not a fixed automation step.
#>

$ErrorActionPreference = 'Stop'

# Any failure path below reaches this: make no decision, let Claude Code's
# normal (unsupported-client-cancels) elicitation handling apply.
function StepAside {
    exit 0
}

function Respond {
    param(
        [Parameter(Mandatory)] [ValidateSet('accept', 'cancel')] [string] $Decision,
        [string] $SystemMessage
    )
    $output = @{
        hookSpecificOutput = @{
            hookEventName        = 'Elicitation'
            elicitationDecision  = $Decision
            systemMessage        = $SystemMessage
        }
    }
    if ($Decision -eq 'accept') {
        # sap_send_key's Save confirmation always elicits a plain bool
        # (mcp_sap_gui's `ctx.elicit(..., response_type=bool)`); fastmcp
        # wraps that as {"type":"object","properties":{"value":{"type":
        # "boolean"}},"required":["value"]} on the wire (see fastmcp's
        # ScalarElicitationType / parse_elicit_response_type), so the
        # response has to match that shape, not a bare boolean.
        $output.hookSpecificOutput.elicitationResponse = @{ value = $true }
    }
    Write-Output ($output | ConvertTo-Json -Depth 6 -Compress)
    exit 0
}

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { StepAside }
    $requestEvent = $raw | ConvertFrom-Json
} catch {
    StepAside
}

$runId = $env:FSNXT_RUN_ID
if (-not $runId) { StepAside }  # not an FSNXT-app-driven session - leave it alone

# Only a plain yes/no is something this hook (and the app's dialog) can
# answer. A future elicitation with a different shape falls through to
# Claude Code's normal handling rather than being mis-answered.
try {
    $schemaProps = $requestEvent.schema.properties
    if ($schemaProps -and $schemaProps.value -and $schemaProps.value.type -and $schemaProps.value.type -ne 'boolean') {
        StepAside
    }
} catch {
    StepAside
}

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # .claude\hooks -> .claude -> repo
$requestsDir = Join-Path $root 'logs\elicitation-requests'
try { New-Item -ItemType Directory -Force -Path $requestsDir | Out-Null } catch { StepAside }

$requestPath  = Join-Path $requestsDir "$runId.request.json"
$responsePath = Join-Path $requestsDir "$runId.response.json"
$tempPath     = "$requestPath.tmp"

$request = @{
    id        = $runId
    mcpServer = [string]$requestEvent.mcp_server
    toolName  = [string]$requestEvent.tool_name
    message   = [string]$requestEvent.message
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
}
try {
    ($request | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $tempPath -Encoding UTF8 -NoNewline
    # Rename rather than write straight to requestPath so sapTerminalManager's
    # readPendingElicitation() (fs.existsSync + JSON.parse, no locking on its
    # side) can never observe a half-written file.
    Move-Item -LiteralPath $tempPath -Destination $requestPath -Force
} catch {
    try { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue } catch {}
    StepAside
}

# Matches this hook's `timeout` in .claude/settings.json with headroom for
# the write/cleanup above - a human confirming a live Save may reasonably
# take a couple of minutes to notice the dialog and read it.
$deadline = (Get-Date).AddSeconds(290)
$accepted = $false
$answered = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $responsePath) {
        try {
            $response = Get-Content -LiteralPath $responsePath -Raw | ConvertFrom-Json
            $accepted = [bool]$response.accept
            $answered = $true
        } catch {
            # An unreadable response is treated as "no answer" below, not as
            # an accept - fail closed, matching the MCP server's own default.
        }
        break
    }
    Start-Sleep -Milliseconds 400
}

try { Remove-Item -LiteralPath $requestPath -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item -LiteralPath $responsePath -Force -ErrorAction SilentlyContinue } catch {}

if ($answered -and $accepted) {
    Respond -Decision 'accept' -SystemMessage 'The user confirmed this Save in the FSNXT app.'
} elseif ($answered) {
    Respond -Decision 'cancel' -SystemMessage 'The user declined this Save in the FSNXT app. Tell them what was not saved and continue without it.'
} else {
    Respond -Decision 'cancel' -SystemMessage 'No one answered the Save confirmation in the FSNXT app in time. Tell the user this Save did not happen and ask them to confirm again if they still want it.'
}
