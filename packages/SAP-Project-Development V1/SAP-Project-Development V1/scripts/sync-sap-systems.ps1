<#
.SYNOPSIS
    Regenerates .mcp.json and the enabled-server list from config/sap-systems.json.

.DESCRIPTION
    Single source of truth for SAP connections in this workspace is
    config/sap-systems.json. This script projects that registry into:

      * .mcp.json                     -> one MCP server entry per enabled system
      * .claude/settings.local.json   -> enabledMcpjsonServers list

    Secrets are never written by this script. Each system names the environment
    variable holding its password ('adt.passwordEnvVar'); the generated .mcp.json
    only ever contains a ${VAR} reference. The actual values belong in the "env"
    block of .claude/settings.local.json, which is local-only and gitignored.

    Server naming (ADT / ABAP source):
      default system  -> mcp-abap-abap-adt-api   (kept stable; CLAUDE.md routing
                                                  and existing tool names depend
                                                  on it)
      other systems   -> abap-adt-<sysid>-<client>
      explicit override via the optional 'mcpServerName' field on a system.

    Server naming (SAP GUI scripting, front-end testing):
      A system with a 'sapGui' block where enabled=true also gets a SAP GUI
      Scripting server (kts982/mcp-sap-gui, vendored in tools\mcp-sap-gui):
        default system -> sap-gui
        other systems  -> sap-gui-<sysid>-<client>
        explicit override via 'sapGui.mcpServerName'.
      It reuses the same adt.user / adt.passwordEnvVar / client / language, so
      there is no second credential to maintain.

    The hand-managed 'adt-mcp' entry (VS Code ADT MCP server on localhost:2236)
    is preserved as-is: it follows whatever system VS Code is logged on to and is
    not part of the registry.

.PARAMETER Check
    Validate the registry and report drift without writing any file.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1
    powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1 -Check
#>
[CmdletBinding()]
param(
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root         = Split-Path -Parent $PSScriptRoot
$registryPath = Join-Path $root 'config\sap-systems.json'
$mcpPath      = Join-Path $root '.mcp.json'
$settingsPath = Join-Path $root '.claude\settings.local.json'

function Write-Step($msg)  { Write-Host "  $msg" }
function Write-Warn2($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }

if (-not (Test-Path $registryPath)) {
    throw "System registry not found: $registryPath"
}

$registry = Get-Content $registryPath -Raw | ConvertFrom-Json

# ---------------------------------------------------------------- validation
$errors = New-Object System.Collections.Generic.List[string]
$seenIds     = @{}
$seenServers = @{}

$enabled = @($registry.systems | Where-Object { $_.enabled })

if ($enabled.Count -eq 0) {
    $errors.Add("No enabled systems in the registry.")
}

foreach ($sys in $registry.systems) {
    $ctx = "system '$($sys.id)'"

    foreach ($field in @('id', 'systemId', 'client', 'language')) {
        if (-not $sys.PSObject.Properties.Name.Contains($field) -or -not $sys.$field) {
            $errors.Add("$ctx is missing required field '$field'.")
        }
    }
    foreach ($field in @('url', 'user', 'passwordEnvVar')) {
        if (-not $sys.adt.PSObject.Properties.Name.Contains($field) -or -not $sys.adt.$field) {
            $errors.Add("$ctx is missing required field 'adt.$field'.")
        }
    }

    if ($sys.adt.url -and $sys.adt.url -notmatch '^https?://[^/]+$') {
        $errors.Add("$ctx has adt.url '$($sys.adt.url)' - expected scheme://host[:port] with no trailing path.")
    }
    if ($sys.adt.url -and $sys.adt.url -match '^http://') {
        Write-Warn2 "$ctx uses plain http - credentials will cross the network unencrypted."
    }
    if ($sys.client -and $sys.client -notmatch '^\d{3}$') {
        $errors.Add("$ctx has client '$($sys.client)' - expected exactly three digits.")
    }

    if ($seenIds.ContainsKey($sys.id)) { $errors.Add("Duplicate system id '$($sys.id)'.") }
    $seenIds[$sys.id] = $true

    # -- optional SAP GUI Scripting block ---------------------------------
    if ($sys.PSObject.Properties.Name.Contains('sapGui') -and $sys.sapGui) {
        $gui = $sys.sapGui
        if (-not $gui.PSObject.Properties.Name.Contains('enabled')) {
            $errors.Add("$ctx sapGui block is missing 'enabled'.")
        }
        if ($gui.PSObject.Properties.Name.Contains('enabled') -and $gui.enabled) {
            if (-not $gui.PSObject.Properties.Name.Contains('logonDescription') -or
                -not $gui.logonDescription) {
                $errors.Add("$ctx sapGui.enabled is true but 'logonDescription' is missing - it must match the SAP Logon Pad entry name exactly.")
            }
        }
        if ($gui.PSObject.Properties.Name.Contains('profile') -and $gui.profile -and
            $gui.profile -notin @('exploration', 'operator', 'full')) {
            $errors.Add("$ctx sapGui.profile '$($gui.profile)' - expected exploration, operator or full.")
        }
    }
}

if ($registry.defaultSystem -and -not $seenIds.ContainsKey($registry.defaultSystem)) {
    $errors.Add("defaultSystem '$($registry.defaultSystem)' does not match any system id.")
}

if ($errors.Count -gt 0) {
    Write-Host "Registry validation failed:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
    exit 1
}

# ------------------------------------------------------------ server naming
function Get-ServerName($sys) {
    if ($sys.PSObject.Properties.Name.Contains('mcpServerName') -and $sys.mcpServerName) {
        return $sys.mcpServerName
    }
    if ($sys.id -eq $registry.defaultSystem) {
        return 'mcp-abap-abap-adt-api'
    }
    return ('abap-adt-{0}-{1}' -f $sys.systemId.ToLower(), $sys.client)
}

function Get-SapGuiServerName($sys) {
    if ($sys.sapGui.PSObject.Properties.Name.Contains('mcpServerName') -and $sys.sapGui.mcpServerName) {
        return $sys.sapGui.mcpServerName
    }
    if ($sys.id -eq $registry.defaultSystem) {
        return 'sap-gui'
    }
    return ('sap-gui-{0}-{1}' -f $sys.systemId.ToLower(), $sys.client)
}

$nodeEntry = 'tools\mcp-abap-adt-api\node_modules\mcp-abap-abap-adt-api\dist\index.js'
$nodeAbs   = Join-Path $root $nodeEntry
if (-not (Test-Path $nodeAbs)) {
    Write-Warn2 "MCP server entry point not found: $nodeAbs"
    Write-Warn2 "Install it with: npm install --prefix tools\mcp-abap-adt-api mcp-abap-abap-adt-api"
}

$guiPython = Join-Path $root 'tools\mcp-sap-gui\.venv\Scripts\python.exe'
$guiWanted = @($registry.systems | Where-Object {
    $_.enabled -and
    $_.PSObject.Properties.Name.Contains('sapGui') -and $_.sapGui -and
    $_.sapGui.PSObject.Properties.Name.Contains('enabled') -and $_.sapGui.enabled
})
if ($guiWanted.Count -gt 0 -and -not (Test-Path $guiPython)) {
    Write-Warn2 "SAP GUI MCP venv not found: $guiPython"
    Write-Warn2 "Create it with: python -m venv tools\mcp-sap-gui\.venv"
    Write-Warn2 "then: tools\mcp-sap-gui\.venv\Scripts\python.exe -m pip install `"mcp-sap-gui[screenshots]==0.2.2`""
}

# ------------------------------------------------------------- build servers
$servers = [ordered]@{}

# Preserve the hand-managed VS Code ADT MCP entry verbatim.
if (Test-Path $mcpPath) {
    $existing = Get-Content $mcpPath -Raw | ConvertFrom-Json
    if ($existing.mcpServers.PSObject.Properties.Name -contains 'adt-mcp') {
        $servers['adt-mcp'] = $existing.mcpServers.'adt-mcp'
    }
}

$serverNames = New-Object System.Collections.Generic.List[string]
$missingSecrets = New-Object System.Collections.Generic.List[string]

foreach ($sys in $enabled) {
    $name = Get-ServerName $sys

    if ($seenServers.ContainsKey($name)) {
        Write-Host "Server name collision: '$name' produced by more than one system. Set 'mcpServerName' explicitly." -ForegroundColor Red
        exit 1
    }
    $seenServers[$name] = $true
    $serverNames.Add($name)

    $tlsReject = '1'
    if ($sys.adt.PSObject.Properties.Name.Contains('tlsRejectUnauthorized') -and
        -not $sys.adt.tlsRejectUnauthorized) {
        $tlsReject = '0'
        Write-Warn2 "$($sys.id): TLS certificate validation is DISABLED."
    }

    $servers[$name] = [ordered]@{
        command = 'node'
        args    = @((Join-Path $root $nodeEntry))
        env     = [ordered]@{
            SAP_URL                      = $sys.adt.url
            SAP_USER                     = $sys.adt.user
            SAP_PASSWORD                 = ('${{{0}}}' -f $sys.adt.passwordEnvVar)
            SAP_CLIENT                   = $sys.client
            SAP_LANGUAGE                 = $sys.language
            NODE_TLS_REJECT_UNAUTHORIZED = $tlsReject
        }
    }

    $secretSet = [Environment]::GetEnvironmentVariable($sys.adt.passwordEnvVar)
    if (-not $secretSet) {
        $localEnvSet = $false
        if (Test-Path $settingsPath) {
            $st = Get-Content $settingsPath -Raw | ConvertFrom-Json
            if ($st.PSObject.Properties.Name -contains 'env' -and
                $st.env.PSObject.Properties.Name -contains $sys.adt.passwordEnvVar) {
                $localEnvSet = $true
            }
        }
        if (-not $localEnvSet) { $missingSecrets.Add("$($sys.id) -> $($sys.adt.passwordEnvVar)") }
    }

    Write-Step ("{0,-24} -> {1}  ({2} {3}/{4})" -f $sys.id, $name, $sys.adt.url, $sys.client, $sys.language)

    # ---------------------------------------------- SAP GUI Scripting server
    if ($sys.PSObject.Properties.Name.Contains('sapGui') -and $sys.sapGui -and
        $sys.sapGui.PSObject.Properties.Name.Contains('enabled') -and $sys.sapGui.enabled) {

        $gui     = $sys.sapGui
        $guiName = Get-SapGuiServerName $sys

        if ($seenServers.ContainsKey($guiName)) {
            Write-Host "Server name collision: '$guiName' produced by more than one system. Set 'sapGui.mcpServerName' explicitly." -ForegroundColor Red
            exit 1
        }
        $seenServers[$guiName] = $true
        $serverNames.Add($guiName)

        $guiArgs = [System.Collections.Generic.List[string]]::new()
        $guiArgs.Add('-m'); $guiArgs.Add('mcp_sap_gui.server')

        if ($gui.PSObject.Properties.Name.Contains('readOnly') -and $gui.readOnly) {
            $guiArgs.Add('--read-only')
        }
        if ($gui.PSObject.Properties.Name.Contains('profile') -and $gui.profile) {
            $guiArgs.Add('--profile'); $guiArgs.Add($gui.profile)
        }
        if ($gui.PSObject.Properties.Name.Contains('auditLog') -and $gui.auditLog) {
            $auditAbs = Join-Path $root $gui.auditLog
            $auditDir = Split-Path -Parent $auditAbs
            if ($auditDir -and -not (Test-Path $auditDir)) {
                New-Item -ItemType Directory -Path $auditDir -Force | Out-Null
            }
            $guiArgs.Add('--audit-log'); $guiArgs.Add($auditAbs)
        }
        # --allowed-transactions takes nargs="*", so it must come last -
        # anything appended after it would be swallowed as a tcode.
        if ($gui.PSObject.Properties.Name.Contains('allowedTransactions') -and
            @($gui.allowedTransactions).Count -gt 0) {
            $guiArgs.Add('--allowed-transactions')
            foreach ($tcode in $gui.allowedTransactions) { $guiArgs.Add($tcode) }
        }

        $servers[$guiName] = [ordered]@{
            command = $guiPython
            args    = @($guiArgs)
            env     = [ordered]@{
                SAP_USER     = $sys.adt.user
                SAP_PASSWORD = ('${{{0}}}' -f $sys.adt.passwordEnvVar)
                SAP_CLIENT   = $sys.client
                SAP_LANGUAGE = $sys.language
            }
        }

        $mode = if ($gui.PSObject.Properties.Name.Contains('readOnly') -and $gui.readOnly) { 'read-only' } else { 'read-write' }
        Write-Step ("{0,-24} -> {1}  (SAP Logon '{2}', {3})" -f $sys.id, $guiName, $gui.logonDescription, $mode)
    }
}

if ($Check) {
    Write-Host ""
    Write-Host "Check only - no files written."
    if ($missingSecrets.Count -gt 0) {
        Write-Warn2 "Password not configured for: $($missingSecrets -join ', ')"
        exit 1
    }
    Write-Host "Registry is valid and all secrets are configured."
    exit 0
}

# ------------------------------------------------------------- write .mcp.json
$mcpDoc = [ordered]@{ mcpServers = $servers }
$mcpDoc | ConvertTo-Json -Depth 12 | Out-File -FilePath $mcpPath -Encoding utf8
Write-Step "wrote $mcpPath"

# --------------------------------------------- write .claude/settings.local.json
$allServerNames = @('adt-mcp') + $serverNames | Select-Object -Unique

if (Test-Path $settingsPath) {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
    $settings = [pscustomobject]@{}
}
$settings | Add-Member -NotePropertyName enabledMcpjsonServers -NotePropertyValue $allServerNames -Force
$settings | ConvertTo-Json -Depth 12 | Out-File -FilePath $settingsPath -Encoding utf8
Write-Step "wrote $settingsPath"

Write-Host ""
if ($missingSecrets.Count -gt 0) {
    Write-Warn2 "Password not configured for: $($missingSecrets -join ', ')"
    Write-Warn2 "Add it to the 'env' block of .claude/settings.local.json, then restart Claude Code."
} else {
    Write-Host "Done. Restart Claude Code so the MCP servers pick up the new configuration."
}
