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
$python = Join-Path $root 'tools\mcp-sap-gui\.venv\Scripts\python.exe'
$env:SAP_TEST_LOGON_DESCRIPTION = $LogonDescription
$env:SAP_TEST_CLIENT = $Client
$env:SAP_TEST_USERNAME = $env:SAP_TEST_USERNAME
$env:SAP_TEST_PASSWORD = $env:SAP_TEST_PASSWORD
& $python (Join-Path $root 'gui_tests\test_connection.py')
if ($LASTEXITCODE -ne 0) { Write-Output (@{ connected = $false; reason = 'SAP GUI connection helper failed.' } | ConvertTo-Json -Compress) }
