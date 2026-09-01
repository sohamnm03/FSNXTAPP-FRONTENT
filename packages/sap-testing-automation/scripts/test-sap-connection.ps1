[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SystemId,

    [Parameter(Mandatory = $true)]
    [string]$Client,

    [Parameter(Mandatory = $true)]
    [string]$LogonDescription,

    [Parameter(Mandatory = $true)]
    [string]$ApplicationServer,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{2}$')]
    [string]$SystemNumber
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Result([bool]$Connected, [string]$Reason, $Session = $null) {
    $result = [ordered]@{
        connected = $Connected
        reason = $Reason
        system = if ($Session) { [string]$Session.Info.SystemName } else { '' }
        client = if ($Session) { [string]$Session.Info.Client } else { '' }
        user = if ($Session) { [string]$Session.Info.User } else { '' }
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}

function Test-EstablishedSapSocket {
    $dispatcherPort = [int]("32$SystemNumber")
    $sapProcessIds = @(
        Get-Process -Name 'saplogon', 'sapgui' -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Id
    )
    if ($sapProcessIds.Count -eq 0) { return $false }

    $connections = @(
        Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
            Where-Object {
                $_.RemoteAddress -eq $ApplicationServer `
                    -and $_.RemotePort -eq $dispatcherPort `
                    -and $_.OwningProcess -in $sapProcessIds
            }
    )
    return $connections.Count -gt 0
}

try {
    $sapRotWrapper = New-Object -ComObject 'SapROTWr.SapROTWrapper'
    $sapGui = $sapRotWrapper.GetROTEntry('SAPGUI')
    if (-not $sapGui) {
        Write-Result $false 'No active SAP GUI scripting object was found.'
        exit 0
    }
    $application = $sapGui.GetScriptingEngine
    if (-not $application) {
        try { $application = $sapGui.GetScriptingEngine() } catch { $application = $null }
    }
    if (-not $application) {
        $hasLiveSocket = Test-EstablishedSapSocket
        Write-Result $hasLiveSocket $(
            if ($hasLiveSocket) { 'Active SAP network session detected.' }
            else { 'No active SAP network session was found.' }
        )
        exit 0
    }

    for ($connectionIndex = 0; $connectionIndex -lt $application.Children.Count; $connectionIndex++) {
        $connection = $application.Children.Item($connectionIndex)
        $description = ''
        try { $description = [string]$connection.Description } catch { $description = '' }

        if ($description -ne $LogonDescription) { continue }

        for ($sessionIndex = 0; $sessionIndex -lt $connection.Children.Count; $sessionIndex++) {
            $session = $connection.Children.Item($sessionIndex)
            $info = $session.Info
            $matches = [string]$info.SystemName -eq $SystemId `
                -and [string]$info.Client -eq $Client `
                -and -not [string]::IsNullOrWhiteSpace([string]$info.User)

            if ($matches) {
                Write-Result $true 'Matching logged-in SAP session found.' $session
                exit 0
            }
        }
    }

    Write-Result $false "No logged-in session matches $LogonDescription ($SystemId/$Client)."
} catch {
    Write-Result $false 'SAP Logon is not running, SAP GUI Scripting is disabled, or no session is available.'
}
