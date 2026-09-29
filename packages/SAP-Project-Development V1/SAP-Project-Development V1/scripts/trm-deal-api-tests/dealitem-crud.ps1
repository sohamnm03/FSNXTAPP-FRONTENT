# Live CRUD test for one entity set of ZFS_SB_TRMDEALITEM_O4_API against one deal.
# Usage:
#   .\dealitem-crud.ps1 -EvidenceDir <dir> -Set Condition -Company 1000 -Deal 160534 `
#       -KeyNames CompanyCode,FinancialTransaction,Side,ConditionKey `
#       -CreateBody '{...}' -PatchBody '{"PercentageRate":12.5}' -PatchField PercentageRate
# Writes <EvidenceDir>\<Set>-crud-log.txt. Exit 0 = every step as expected, 1 = a step failed.
param([string]$EvidenceDir, [string]$Set, [string]$Company, [string]$Deal, [string[]]$KeyNames,
      [string]$CreateBody, [string]$PatchBody, [string]$PatchField)
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$svc = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$log = Join-Path $EvidenceDir "$Set-crud-log.txt"
$filter = "`$filter=CompanyCode eq '$Company' and FinancialTransaction eq '$Deal'"
$fail = $false

$before = Invoke-Trm $svc "1-list-before" GET "$Set`?$filter&`$count=true" $null $log
if ($before.Status -ne 200) { exit 1 }
$countBefore = ($before.Content | ConvertFrom-Json).'@odata.count'
Write-Host "rows before: $countBefore"

$noFilter = Invoke-Trm $svc "2-list-without-deal-filter" GET "$Set" $null $log
if ($noFilter.Status -lt 400) { Write-Host 'EXPECTED a 4xx/5xx refusal without the deal filter'; $fail = $true }

$c = Invoke-Trm $svc "3-create" POST $Set $CreateBody $log
if ($c.Status -ne 201) { Write-Host 'create failed'; exit 1 }
$row = $c.Content | ConvertFrom-Json
$key = Get-KeyPredicate $row $KeyNames
Write-Host "created $Set$key"

$r = Invoke-Trm $svc "4-read" GET "$Set$key" $null $log
if ($r.Status -ne 200) { $fail = $true }

if ($PatchBody) {
  $p = Invoke-Trm $svc "5-patch" PATCH "$Set$key" $PatchBody $log
  if ($p.Status -ne 200) { $fail = $true }
  $r2 = Invoke-Trm $svc "6-read-after-patch" GET "$Set$key" $null $log
  $want = ($PatchBody | ConvertFrom-Json).$PatchField
  $got = ($r2.Content | ConvertFrom-Json).$PatchField
  $ok = ([string]$got -eq [string]$want)
  $gd = 0.0; $wd = 0.0
  if (-not $ok -and [double]::TryParse([string]$got, [ref]$gd) -and [double]::TryParse([string]$want, [ref]$wd)) { $ok = ($gd -eq $wd) }
  if (-not $ok) { Write-Host "PATCH not applied: $PatchField = $got, expected $want"; $fail = $true }
}

$d = Invoke-Trm $svc "7-delete" DELETE "$Set$key" $null $log
if ($d.Status -ne 204) { $fail = $true }

$after = Invoke-Trm $svc "8-list-after" GET "$Set`?$filter&`$count=true" $null $log
$countAfter = ($after.Content | ConvertFrom-Json).'@odata.count'
Write-Host "rows after: $countAfter"
if ($countAfter -ne $countBefore) { Write-Host 'row count did not return to its starting value'; $fail = $true }

if ($fail) { exit 1 } else { exit 0 }
