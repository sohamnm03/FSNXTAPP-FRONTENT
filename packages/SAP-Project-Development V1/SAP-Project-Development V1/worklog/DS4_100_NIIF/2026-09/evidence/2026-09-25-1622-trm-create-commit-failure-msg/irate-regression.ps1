# F1 regression for ZFS_SB_TRMIRATE_O4_API: (a) a create refused by the BAPI (rolled back, no deal)
# must not carry ZFS_TRM_MSG 058; (b) a good create still answers 201 and reverses to ActiveStatus 3.
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001'
$log = 'worklog\DS4_100_NIIF\2026-09\evidence\2026-09-25-1622-trm-create-commit-failure-msg\irate-regression-log.txt'
$ok = $true
$bad = Invoke-Trm $svc 'bad-create' POST 'InterestRateInstrument' '{"CompanyCode":"1000","ProductType":"22A","TransactionType":"999","Partner":"0700000453","Currency":"INR","StartTerm":"2026-10-01","EndTerm":"2027-09-30","NominalAmount":100000,"InterestRate":10}' $log
$no058 = -not ($bad.Content -match 'ZFS_TRM_MSG/058')
Write-Host "bad create: $($bad.Status), no 058: $no058"
if (($bad.Status -lt 400) -or -not $no058) { $ok = $false }
$c = Invoke-Trm $svc 'good-create' POST 'InterestRateInstrument' '{"CompanyCode":"1000","ProductType":"22A","TransactionType":"100","Partner":"0700000453","ContractDate":"2026-09-25","ValuationClass":"0001","Currency":"INR","StartTerm":"2026-10-01","EndTerm":"2027-09-30","NominalAmount":100000,"InterestRate":10}' $log
$deal = ($c.Content | ConvertFrom-Json).FinancialTransaction
Write-Host "good create: $($c.Status) deal 1000/$deal"
if ($c.Status -ne 201) { 'IRATE RED'; exit 1 }
$key = "InterestRateInstrument(CompanyCode='1000',FinancialTransaction='$deal')"
$n = 0; $st = ''
while ($n -lt 3 -and $st -ne '3') {
  $n++
  $d = Invoke-Trm $svc "reverse-$n" DELETE $key $null $log
  $st = [string](((Invoke-Trm $svc "read-$n" GET $key $null $log).Content | ConvertFrom-Json).ActiveStatus)
  Write-Host "DELETE $n -> $($d.Status), ActiveStatus $st"
}
if ($st -ne '3') { $ok = $false }
if ($ok) { "IRATE GREEN (test deal 1000/$deal reversed)"; exit 0 } else { 'IRATE RED'; exit 1 }
