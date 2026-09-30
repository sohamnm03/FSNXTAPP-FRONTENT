# Phase 4 clean-up check: every LC test deal must read ActiveStatus 3 (reversed). Exit 1 otherwise.
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmlc_o4_api/srvd_a2x/sap/zfs_sd_trmlc/0001'
$log = 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1640-trm-lc-api-phase4\check-test-deals-log.txt'
$ok = $true
foreach ($d in 100025..100044) {
  $r = Invoke-Trm $svc "check-$d" GET "LetterOfCredit(CompanyCode='9999',FinancialTransaction='$d')" $null $log
  $o = $r.Content | ConvertFrom-Json
  Write-Host "9999/$d status $($r.Status) ActiveStatus $($o.ActiveStatus) cat $($o.ActivityCategory) LcNumber $($o.LcNumber)"
  if ($o.ActiveStatus -ne '3') { $ok = $false }
}
if ($ok) { 'ALL REVERSED'; exit 0 } else { 'NOT ALL REVERSED'; exit 1 }
