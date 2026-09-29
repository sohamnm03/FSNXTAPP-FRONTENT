param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$settings = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.claude/settings.local.json') | ConvertFrom-Json
$registry = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'config/sap-systems.json') | ConvertFrom-Json
$system = $registry.systems | Where-Object id -eq 'DS4_100_NIIF'
$password = [Environment]::GetEnvironmentVariable($system.adt.passwordEnvVar)
if (-not $password) { $password = $settings.env.($system.adt.passwordEnvVar) }
if (-not $password) { throw 'SAP credential unavailable' }
$headers = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($system.adt.user + ':' + $password)); 'X-CSRF-Token' = 'Fetch' }
$base = $system.adt.url + '/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001'
$metadata = Invoke-WebRequest -Uri ($base + '/$metadata?sap-client=100') -Headers $headers -SessionVariable webSession -UseBasicParsing -TimeoutSec 30
$headers['X-CSRF-Token'] = $metadata.Headers['x-csrf-token']
$cases = @(
    @{ Name='unknown-target'; Action='RunQuery'; Values=@{TargetName='ZFS_GW_UNKNOWN'} },
    @{ Name='query'; Action='RunQuery'; Values=@{TargetName='ZFS_CDS_SLC_001';FieldsJson='["ZOTTK_NO"]';OrderByJson='[{"Field":"ZOTTK_NO"}]';MaxRows=2} },
    @{ Name='unknown-field'; Action='RunQuery'; Values=@{TargetName='ZFS_CDS_SLC_001';FieldsJson='["ZZZNOPE"]';MaxRows=2} },
    @{ Name='row-limit'; Action='RunQuery'; Values=@{TargetName='ZFS_CDS_SLC_001';MaxRows=999999} },
    @{ Name='empty-batch'; Action='ExecuteBatch'; Values=@{StepsJson='[]'} },
    @{ Name='phase-one-reject'; Action='ExecuteBatch'; Values=@{StepsJson='[{"Kind":"QURY","TargetName":"ZFS_CDS_SLC_001","FieldsJson":"[\"ZOTTK_NO\"]","MaxRows":2},{"Kind":"SUBM","TargetName":"ZFS_GW_UNKNOWN"}]'} }
)
$results = foreach ($case in $cases) {
    $body = [ordered]@{ TargetName=''; Operation=''; ImportJson=''; TablesJson=''; FieldsJson=''; FilterJson=''; OrderByJson=''; MaxRows=0; StepsJson=''; CommitMode='NEVER' }
    foreach ($key in $case.Values.Keys) { $body[$key] = $case.Values[$key] }
    $uri = $base + '/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.' + $case.Action + '?sap-client=100'
    $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -WebSession $webSession -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -UseBasicParsing -TimeoutSec 60
    [pscustomobject]@{ Name=$case.Name; HttpStatus=$response.StatusCode; RawResponse=$response.Content }
}
ConvertTo-Json -InputObject @($results) -Depth 8
