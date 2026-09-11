<#
.SYNOPSIS
    Opens a brand-new, logged-on SAP GUI session and leaves it running.

.DESCRIPTION
    Sibling of test-sap-gui-login.ps1 (which does the same connect() but logs
    off again). Used by the desktop app's "Run interactively" action on a test
    case with no frozen automation script: it opens a session the same way
    every frozen-script GUI-lane run already does (gui_tests/session.py
    GuiSession.login() — sap_connect, not sap_connect_existing, CLAUDE.md rule
    2/9), then hands off to the AI Assistant, which attaches to it with
    sap_connect_existing instead of guessing whether one is already open.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SystemId,
    [Parameter(Mandatory = $true)][string]$Client,
    [Parameter(Mandatory = $true)][string]$LogonDescription,
    [Parameter(Mandatory = $true)][string]$ApplicationServer,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d{2}$')][string]$SystemNumber
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = if ($env:FSNXT_PYTHON -and (Test-Path $env:FSNXT_PYTHON)) {
    $env:FSNXT_PYTHON
} else {
    Join-Path $root 'tools\mcp-sap-gui\.venv\Scripts\python.exe'
}
if (-not (Test-Path $python)) {
    Write-Output (@{ connected = $false; reason = 'The SAP GUI Python runtime is missing.' } | ConvertTo-Json -Compress)
    exit 0
}
$env:SAP_TEST_LOGON_DESCRIPTION = $LogonDescription
$env:SAP_TEST_CLIENT = $Client
$env:SAP_TEST_USERNAME = $env:SAP_TEST_USERNAME
$env:SAP_TEST_PASSWORD = $env:SAP_TEST_PASSWORD
& $python (Join-Path $root 'gui_tests\open_session.py')
if ($LASTEXITCODE -ne 0) { Write-Output (@{ connected = $false; reason = 'SAP GUI session opener failed.' } | ConvertTo-Json -Compress) }
