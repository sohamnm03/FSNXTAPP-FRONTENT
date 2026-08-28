<#
.SYNOPSIS
    Regenerates .mcp.json and the enabled-server list from config/sap-systems.json.

.DESCRIPTION
    Single source of truth for SAP connections in this workspace is
    config/sap-systems.json. This script projects that registry into:

      * .mcp.json                     -> one SAP GUI Scripting MCP server per
                                         enabled system
      * .claude/settings.local.json   -> enabledMcpjsonServers list

    Secrets are never written by this script. Each system names the environment
    variable holding its password ('credentials.passwordEnvVar'); the generated
    .mcp.json only ever contains a ${VAR} reference. The actual values belong in
    the "env" block of .claude/settings.local.json, which is local-only and
    gitignored.

    Server naming:
      default system -> sap-gui
      other systems  -> sap-gui-<sysid>-<client>
      explicit override via the optional 'sapGui.mcpServerName' field.

    Any MCP server already present in .mcp.json that this registry does not own
    (i.e. whose name does not start with 'sap-gui') is preserved verbatim, so a
    hand-added server survives regeneration.

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
$errors      = New-Object System.Collections.Generic.List[string]
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
    foreach ($field in @('user', 'passwordEnvVar')) {
        if (-not $sys.credentials.PSObject.Properties.Name.Contains($field) -or
            -not $sys.credentials.$field) {
            $errors.Add("$ctx is missing required field 'credentials.$field'.")
        }
    }

    if ($sys.client -and $sys.client -notmatch '^\d{3}$') {
        $errors.Add("$ctx has client '$($sys.client)' - expected exactly three digits.")
    }

    if ($seenIds.ContainsKey($sys.id)) { $errors.Add("Duplicate system id '$($sys.id)'.") }
    $seenIds[$sys.id] = $true

    if (-not $sys.PSObject.Properties.Name.Contains('sapGui') -or -not $sys.sapGui) {
        $errors.Add("$ctx has no 'sapGui' block - this workspace drives SAP GUI only.")
        continue
    }

    $gui = $sys.sapGui
    if (-not $gui.PSObject.Properties.Name.Contains('enabled')) {
        $errors.Add("$ctx sapGui block is missing 'enabled'.")
    }
    if ($gui.PSObject.Properties.Name.Contains('enabled') -and $gui.enabled) {
        if (-not $gui.PSObject.Properties.Name.Contains('logonDescription') -or
            -not $gui.logonDescription) {
            $errors.Add("$ctx sapGui.enabled is true but 'logonDescription' is missing - it must match the SAP Logon Pad entry name exactly.")
        }
        if (-not $sys.enabled) {
            $errors.Add("$ctx has sapGui.enabled true but the system itself is disabled.")
        }
    }
    if ($gui.PSObject.Properties.Name.Contains('profile') -and $gui.profile -and
        $gui.profile -notin @('exploration', 'operator', 'full')) {
        $errors.Add("$ctx sapGui.profile '$($gui.profile)' - expected exploration, operator or full.")
    }
    if ($gui.PSObject.Properties.Name.Contains('logonDescription') -and
        $gui.logonDescription -match '(?i)prod') {
        Write-Warn2 "$ctx targets SAP Logon entry '$($gui.logonDescription)' - that looks like PRODUCTION."
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

# ------------------------------------------------------------- server naming
function Get-SapGuiServerName($sys) {
    if ($sys.sapGui.PSObject.Properties.Name.Contains('mcpServerName') -and $sys.sapGui.mcpServerName) {
        return $sys.sapGui.mcpServerName
    }
    if ($sys.id -eq $registry.defaultSystem) {
        return 'sap-gui'
    }
    return ('sap-gui-{0}-{1}' -f $sys.systemId.ToLower(), $sys.client)
}

$guiPython = Join-Path $root 'tools\mcp-sap-gui\.venv\Scripts\python.exe'
if (-not (Test-Path $guiPython)) {
    Write-Warn2 "SAP GUI MCP venv not found: $guiPython"
    Write-Warn2 "Create it with: python -m venv tools\mcp-sap-gui\.venv"
    Write-Warn2 "then: tools\mcp-sap-gui\.venv\Scripts\python.exe -m pip install `"mcp-sap-gui[screenshots]==0.2.2`""
}

# ------------------------------------------------------------- build servers
$servers = [ordered]@{}

# Preserve any hand-added server this registry does not own.
if (Test-Path $mcpPath) {
    $existing = Get-Content $mcpPath -Raw | ConvertFrom-Json
    if ($existing.PSObject.Properties.Name -contains 'mcpServers') {
        foreach ($prop in $existing.mcpServers.PSObject.Properties) {
            if ($prop.Name -notlike 'sap-gui*') {
                $servers[$prop.Name] = $prop.Value
                Write-Step ("{0,-24} -> preserved (not registry-owned)" -f $prop.Name)
            }
        }
    }
}

$serverNames    = New-Object System.Collections.Generic.List[string]
$missingSecrets = New-Object System.Collections.Generic.List[string]

foreach ($sys in $enabled) {
    $gui = $sys.sapGui
    if (-not ($gui.PSObject.Properties.Name.Contains('enabled') -and $gui.enabled)) {
        Write-Step ("{0,-24} -> skipped (sapGui.enabled is false)" -f $sys.id)
        continue
    }

    $name = Get-SapGuiServerName $sys
    if ($seenServers.ContainsKey($name)) {
        Write-Host "Server name collision: '$name' produced by more than one system. Set 'sapGui.mcpServerName' explicitly." -ForegroundColor Red
        exit 1
    }
    $seenServers[$name] = $true
    $serverNames.Add($name)

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
    # --allowed-transactions takes nargs="*", so it must come last - anything
    # appended after it would be swallowed as a tcode.
    if ($gui.PSObject.Properties.Name.Contains('allowedTransactions') -and
        @($gui.allowedTransactions).Count -gt 0) {
        $guiArgs.Add('--allowed-transactions')
        foreach ($tcode in $gui.allowedTransactions) { $guiArgs.Add($tcode) }
    }

    $servers[$name] = [ordered]@{
        command = $guiPython
        args    = @($guiArgs)
        env     = [ordered]@{
            SAP_USER     = $sys.credentials.user
            SAP_PASSWORD = ('${{{0}}}' -f $sys.credentials.passwordEnvVar)
            SAP_CLIENT   = $sys.client
            SAP_LANGUAGE = $sys.language
        }
    }

    $secretSet = [Environment]::GetEnvironmentVariable($sys.credentials.passwordEnvVar)
    if (-not $secretSet) {
        $localEnvSet = $false
        if (Test-Path $settingsPath) {
            $st = Get-Content $settingsPath -Raw | ConvertFrom-Json
            if ($st.PSObject.Properties.Name -contains 'env' -and
                $st.env.PSObject.Properties.Name -contains $sys.credentials.passwordEnvVar) {
                $localEnvSet = $true
            }
        }
        if (-not $localEnvSet) { $missingSecrets.Add("$($sys.id) -> $($sys.credentials.passwordEnvVar)") }
    }

    $mode = if ($gui.PSObject.Properties.Name.Contains('readOnly') -and $gui.readOnly) { 'read-only' } else { 'read-write' }
    Write-Step ("{0,-24} -> {1}  (SAP Logon '{2}', {3})" -f $sys.id, $name, $gui.logonDescription, $mode)
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

# ------------------------------------------------------------ write .mcp.json
$mcpDoc = [ordered]@{ mcpServers = $servers }
$mcpDoc | ConvertTo-Json -Depth 12 | Out-File -FilePath $mcpPath -Encoding utf8
Write-Step "wrote $mcpPath"

# --------------------------------------------- write .claude/settings.local.json
# Wrap the whole pipeline in @() - the pipeline unrolls a single-element result,
# and ConvertTo-Json would then emit a bare string instead of a one-item array.
$allServerNames = @($servers.Keys | Select-Object -Unique)

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
