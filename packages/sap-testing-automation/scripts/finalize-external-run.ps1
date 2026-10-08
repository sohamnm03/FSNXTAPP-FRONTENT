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

# Same Azure/archive pipeline as a frozen-script run, but the run's report is the
# Word document the app wrote into ResultsDirectory (steps with screenshots), so
# no HTML dashboard is built. ResultsDirectory is persistent storage; the EXE's
# project root is temporary.
& (Join-Path $PSScriptRoot 'archive-run-artifacts.ps1') -RunId $RunId -StartedAtUtc $StartedAtUtc `
    -Case $Case -Lane $Lane -SystemId $SystemId -OutputRoot $OutputRoot `
    -ResultsDirectory $ResultsDirectory -EvidenceDirectory (Join-Path $ResultsDirectory 'evidence')
