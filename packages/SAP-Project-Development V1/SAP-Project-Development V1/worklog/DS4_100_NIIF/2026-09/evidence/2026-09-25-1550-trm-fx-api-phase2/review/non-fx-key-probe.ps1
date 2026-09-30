# Final-review probe (declined-to-judge item): FX API writes aimed at an interest-rate deal.
# Target 1000/160539 is a fully reversed IRATE test deal (ActiveStatus 3): no write can land on it.
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001'
$log = 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1550-trm-fx-api-phase2\review\non-fx-key-probe-log.txt'
$k = "FxTransaction(CompanyCode='1000',FinancialTransaction='160539')"
foreach ($c in @(@('patch', 'PATCH', $k, '{"Portfolio":""}'),
                 @('settle', 'POST', "$k/com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle", '{}'),
                 @('delete', 'DELETE', $k, $null))) {
  $r = Invoke-Trm $svc $c[0] $c[1] $c[2] $c[3] $log
  $m = try { ($r.Content | ConvertFrom-Json).error } catch { $null }
  Write-Host "$($c[0]): $($r.Status) $($m.code) $($m.message) | $(($m.details | ForEach-Object { $_.code + ' ' + $_.message }) -join ' | ')"
}
