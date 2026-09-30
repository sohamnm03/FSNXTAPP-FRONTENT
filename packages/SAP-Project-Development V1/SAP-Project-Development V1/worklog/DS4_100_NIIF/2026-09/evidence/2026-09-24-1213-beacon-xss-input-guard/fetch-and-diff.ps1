# Fetches the original version (ADT history) and the current active source of both DPC_EXT classes from ADT history and diffs them.
$Base = 'https://vhnlqds4ap01.sap.niififl.in:44300'
$Pw = [Environment]::GetEnvironmentVariable('SAP_DS4_100_NIIF_PASSWORD')
$Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$Pw"))
$pairs = @(
  @{ name='v1';   before='/sap/bc/adt/oo/classes/zcl_zfs_beacon_acco_01_dpc_ext/includes/main/versions/20260907141739/00003/content';
                  after ='/sap/bc/adt/oo/classes/zcl_zfs_beacon_acco_01_dpc_ext/source/main' },
  @{ name='locl'; before='/sap/bc/adt/oo/classes/zcl_zfs_beacon_account_dpc_ext/includes/main/versions/20260306135015/00003/content';
                  after ='/sap/bc/adt/oo/classes/zcl_zfs_beacon_account_dpc_ext/source/main' }
)
foreach ($p in $pairs) {
  foreach ($k in 'before','after') {
    $r = Invoke-WebRequest -Uri ($Base + $p[$k] + '?sap-client=100') -UseBasicParsing -Headers @{ Authorization = $Auth; Accept = 'text/plain' }
    [IO.File]::WriteAllText("$PSScriptRoot\$($p.name)-$k.abap", $r.Content)
  }
}
