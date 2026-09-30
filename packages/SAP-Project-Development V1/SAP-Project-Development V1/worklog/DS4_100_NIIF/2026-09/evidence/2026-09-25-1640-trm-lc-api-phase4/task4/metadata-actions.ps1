. .\scripts\trm-deal-api-tests\trm-odata.ps1
$m = (Invoke-Trm 'zfs_sb_trmlc_o4_api/srvd_a2x/sap/zfs_sd_trmlc/0001' 'metadata' GET '$metadata' $null $null).Content
$m | Out-File -Encoding utf8 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1640-trm-lc-api-phase4\task4\metadata.xml'
[regex]::Matches($m, '<Action Name="(Present|Terminate)".*?</Action>', 'Singleline') | ForEach-Object { $_.Value }
