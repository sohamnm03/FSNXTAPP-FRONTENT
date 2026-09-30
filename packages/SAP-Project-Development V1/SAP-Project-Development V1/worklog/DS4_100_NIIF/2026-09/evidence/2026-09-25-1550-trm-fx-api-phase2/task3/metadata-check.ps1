. .\scripts\trm-deal-api-tests\trm-odata.ps1
(Invoke-Trm 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001' 'metadata' GET '$metadata' $null $null).Content -match 'Action Name="Settle"'
