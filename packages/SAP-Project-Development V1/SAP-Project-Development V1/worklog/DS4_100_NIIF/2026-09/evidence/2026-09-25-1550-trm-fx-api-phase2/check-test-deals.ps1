# Phase 2 clean-up check: every FX test deal must read ActiveStatus 3 (reversed).
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001'
$log = 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1550-trm-fx-api-phase2\check-test-deals-log.txt'
$ok = $true
foreach ($d in '40000887', '40000888', '40000889', '40000890') {
  $r = Invoke-Trm $svc "check-$d" GET "FxTransaction(CompanyCode='9990',FinancialTransaction='$d')" $null $log
  $o = $r.Content | ConvertFrom-Json
  Write-Host "9990/$d status $($r.Status) ActiveStatus $($o.ActiveStatus) ActivityCategory $($o.ActivityCategory) Created $($o.ContractDate)"
  if ($o.ActiveStatus -ne '3') { $ok = $false }
}
if ($ok) { 'ALL REVERSED'; exit 0 } else { 'NOT ALL REVERSED'; exit 1 }
