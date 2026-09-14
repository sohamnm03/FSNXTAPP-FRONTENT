[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $RunId,
    [Parameter(Mandatory = $true)] [datetime] $StartedAtUtc,
    [Parameter(Mandatory = $true)] [string] $Case,
    [ValidateSet('web', 'gui')] [string] $Lane,
    [Parameter(Mandatory = $true)] [string] $SystemId,
    [Parameter(Mandatory = $true)] [string] $ResultsDirectory,
    [Parameter(Mandatory = $true)] [string] $OutputRoot
)
$ErrorActionPreference = 'Stop'

# Use the same dashboard and Azure/archive pipeline as a frozen-script run.
# ResultsDirectory is persistent storage; the EXE's project root is temporary.
& (Join-Path $PSScriptRoot 'build-dashboard.ps1') -ResultsDirectory $ResultsDirectory -SystemLabel $SystemId -NoOpen
& (Join-Path $PSScriptRoot 'archive-run-artifacts.ps1') -RunId $RunId -StartedAtUtc $StartedAtUtc `
    -Case $Case -Lane $Lane -SystemId $SystemId -OutputRoot $OutputRoot `
    -ResultsDirectory $ResultsDirectory -EvidenceDirectory (Join-Path $ResultsDirectory 'evidence')
