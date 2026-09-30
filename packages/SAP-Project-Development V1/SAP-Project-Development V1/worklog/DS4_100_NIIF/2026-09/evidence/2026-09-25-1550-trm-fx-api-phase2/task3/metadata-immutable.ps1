. .\scripts\trm-deal-api-tests\trm-odata.ps1
$m = (Invoke-Trm 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001' 'metadata' GET '$metadata' $null $null).Content
$m | Out-File -Encoding utf8 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1550-trm-fx-api-phase2\task3\metadata.xml'
[regex]::Matches($m, '<Annotations Target="[^"]*/BuyCurrency">.*?</Annotations>', 'Singleline') | ForEach-Object { $_.Value }
