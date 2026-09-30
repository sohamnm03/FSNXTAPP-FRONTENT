# Fix-pass RED probe for I3 alone: no-op PATCH on an active FX deal through the LC API.
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmlc_o4_api/srvd_a2x/sap/zfs_sd_trmlc/0001'
$r = Invoke-Trm $svc 'W13-probe' PATCH "LetterOfCredit(CompanyCode='9990',FinancialTransaction='40000258')" '{"ContractDate":"2026-07-31"}' 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1640-trm-lc-api-phase4\w13-probe-log.txt'
Write-Host $r.Content
$fx = Invoke-Trm 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001' 'fx-check' GET "FxTransaction(CompanyCode='9990',FinancialTransaction='40000258')" $null 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1640-trm-lc-api-phase4\w13-probe-log.txt'
$o = $fx.Content | ConvertFrom-Json
Write-Host "FX deal after probe: ContractDate $($o.ContractDate) ActiveStatus $($o.ActiveStatus) cat $($o.ActivityCategory)"
