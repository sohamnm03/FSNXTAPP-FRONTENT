# Find real values to build create payloads from: reads the given entity set for the first
# N 22A deals of company 1000 and prints the first non-empty rows.
# Usage: .\dealitem-discover.ps1 -EvidenceDir <dir> -Set AdditionalFlow -Top 40
param([string]$EvidenceDir, [string]$Set, [int]$Top = 40)
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$log = Join-Path $EvidenceDir "$Set-discover-log.txt"
$irate = 'zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001'
$item = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$deals = (Invoke-Trm $irate 'deals' GET "InterestRateInstrument?`$top=$Top&`$filter=CompanyCode eq '1000' and ProductType eq '22A'&`$orderby=FinancialTransaction desc" $null $log).Content | ConvertFrom-Json
foreach ($d in $deals.value) {
  $res = Invoke-Trm $item "items-$($d.FinancialTransaction)" GET "$Set`?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$($d.FinancialTransaction)'" $null $log
  $rows = ($res.Content | ConvertFrom-Json).value
  if ($rows.Count -gt 0) { $rows | Select-Object -First 3 | ConvertTo-Json -Depth 3; break }
}
