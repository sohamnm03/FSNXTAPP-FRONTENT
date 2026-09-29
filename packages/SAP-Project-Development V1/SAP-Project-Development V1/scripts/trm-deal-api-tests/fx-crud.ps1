# Live acceptance test for ZFS_SB_TRMFX_O4_API (Phase 2) on DS4/100, company code 9990.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\trm-deal-api-tests\fx-crud.ps1 `
#          -EvidenceDir <dir> [-SourceDeal 40000258] [-Stage read|all]
#   read = read-only checks R1-R5 (Task 2); all = R1-R5 + the write lifecycle W0-W9 (Task 3).
# Exit 0 = every check GREEN, 1 = at least one RED. Writes <EvidenceDir>\fx-crud-log.txt.
param([string]$EvidenceDir, [string]$SourceDeal = '40000258', [ValidateSet('read', 'all')][string]$Stage = 'all')
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$svc  = 'zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001'
$item = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$ns   = 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001'
New-Item -ItemType Directory -Force $EvidenceDir | Out-Null
$log  = Join-Path $EvidenceDir 'fx-crud-log.txt'
$script:ok = $true
function Check([string]$Name, [bool]$Pass, [string]$Detail) {
  Write-Host ("$Name $Detail -> " + $(if ($Pass) { 'GREEN' } else { 'RED' }))
  if (-not $Pass) { $script:ok = $false }
}
function Json($r) { if ($r.Content) { try { return $r.Content | ConvertFrom-Json } catch { } } return $null }
function Key([string]$Company, [string]$Deal) { "FxTransaction(CompanyCode='$Company',FinancialTransaction='$Deal')" }

# ---- read-only checks -------------------------------------------------------------------------
$r = Invoke-Trm $svc 'R1-list' GET "FxTransaction?`$filter=CompanyCode eq '9990'&`$count=true&`$top=5" $null $log
$j = Json $r
Check 'R1 list 9990' (($r.Status -eq 200) -and ($j.'@odata.count' -ge 30) -and (@($j.value).Count -le 5)) "status $($r.Status) count $($j.'@odata.count') page $(@($j.value).Count)"

$r = Invoke-Trm $svc 'R2-source' GET (Key '9990' $SourceDeal) $null $log
$src = Json $r
Check 'R2 source deal' (($r.Status -eq 200) -and $src.BuyCurrency -and $src.SellCurrency -and $src.ActivityCategory) "status $($r.Status) $($src.BuyCurrency)/$($src.SellCurrency) fwd $($src.ForwardRate) cat $($src.ActivityCategory)"

$r = Invoke-Trm $svc 'R3-non-fx-deal' GET (Key '1000' '160539') $null $log
Check 'R3 IRATE deal via FX API' ($r.Status -eq 404) "status $($r.Status)"

$r = Invoke-Trm $svc 'R4-bapi-only-filter' GET "FxTransaction?`$filter=BuyAmount gt 0" $null $log
Check 'R4 filter on BuyAmount refused' ($r.Status -ge 400) "status $($r.Status)"

$r = Invoke-Trm $svc 'R5-spot-filter' GET "FxTransaction?`$filter=CompanyCode eq '9990' and ProductType eq '40B'&`$count=true" $null $log
$j = Json $r
$allSpot = (@($j.value | Where-Object { $_.ProductType -ne '40B' }).Count -eq 0)
Check 'R5 ProductType eq 40B' (($r.Status -eq 200) -and ($j.'@odata.count' -ge 1) -and $allSpot) "status $($r.Status) count $($j.'@odata.count')"

if ($Stage -eq 'read') { if ($script:ok) { 'READ GREEN'; exit 0 } else { 'READ RED'; exit 1 } }
if (-not $src) { 'no source deal - cannot build the POST body'; exit 1 }

# ---- write lifecycle --------------------------------------------------------------------------
$r = Invoke-Trm $svc 'W0-count-before' GET "FxTransaction?`$filter=CompanyCode eq '9990'&`$count=true&`$top=0" $null $log
$countBefore = (Json $r).'@odata.count'

# Value date ~3 months out, moved off the weekend. The rates are the source deal's own consistent triple.
$vd = (Get-Date).AddDays(91)
while ($vd.DayOfWeek -in 'Saturday', 'Sunday') { $vd = $vd.AddDays(1) }
$body = [ordered]@{
  CompanyCode = '9990'; ProductType = '40A'; TransactionType = '400'; Partner = $src.Partner
  ContractDate = (Get-Date -Format 'yyyy-MM-dd'); BuyCurrency = $src.BuyCurrency; SellCurrency = $src.SellCurrency
  ValueDate = $vd.ToString('yyyy-MM-dd')
}
# The amount is entered in the traded currency only (T7 366); DEALCREATE computes the other side.
$traded = if ($src.TradedCurrency -and $src.TradedCurrency -eq $src.SellCurrency) { 'SellAmount' } else { 'BuyAmount' }
$other  = if ($traded -eq 'SellAmount') { 'BuyAmount' } else { 'SellAmount' }
$body[$traded] = 1000
if ($src.LeadCurrency)   { $body.LeadCurrency   = $src.LeadCurrency }
if ($src.FollowCurrency) { $body.FollowCurrency = $src.FollowCurrency }
if ($src.TradedCurrency) { $body.TradedCurrency = $src.TradedCurrency }
if ($src.ValuationClass) { $body.ValuationClass = $src.ValuationClass }
if ($src.Portfolio)      { $body.Portfolio      = $src.Portfolio }
foreach ($f in 'SpotRate', 'SwapRate', 'ForwardRate') { if ([double]$src.$f -ne 0) { $body[$f] = $src.$f } }
$r = Invoke-Trm $svc 'W1-create' POST 'FxTransaction' ($body | ConvertTo-Json -Compress) $log
$new = Json $r
Check 'W1 create' (($r.Status -eq 201) -and $new.FinancialTransaction -and ([double]$new.$other -ne 0) -and ($new.ActivityCategory -eq '20')) "status $($r.Status) deal $($new.FinancialTransaction) $traded $($new.$traded) computed $other $($new.$other) cat $($new.ActivityCategory)"
if ($r.Status -ne 201) { 'WRITE RED (create failed)'; exit 1 }
$deal = $new.FinancialTransaction
Write-Host "TEST DEAL: 9990/$deal"

$r = Invoke-Trm $svc 'W2-read' GET (Key '9990' $deal) $null $log
Check 'W2 read' (($r.Status -eq 200) -and ([double](Json $r).$traded -eq 1000)) "status $($r.Status) $traded $((Json $r).$traded)"

$r = Invoke-Trm $svc 'W3-patch' PATCH (Key '9990' $deal) ('{"' + $traded + '":1500}') $log
$g = Json (Invoke-Trm $svc 'W3-read-after-patch' GET (Key '9990' $deal) $null $log)
Check "W3 patch $traded" (($r.Status -eq 200) -and ([double]$g.$traded -eq 1500)) "status $($r.Status) buy $($g.BuyAmount) sell $($g.SellAmount)"

# Product independence (spec §9 Phase 2): a payment detail through API 1 on the FX deal.
$pdFilter = "PaymentDetail?`$filter=CompanyCode eq '9990' and FinancialTransaction eq '$deal'"
$existing = @((Json (Invoke-Trm $item 'W4-paydet-list' GET $pdFilter $null $log)).value)
$eff = $vd.ToString('yyyyMMdd')
$pick = @(@{ Dir = '+'; Cur = $g.BuyCurrency }, @{ Dir = '-'; Cur = $g.SellCurrency }) |
        Where-Object { $c = $_; -not ($existing | Where-Object { $_.Direction -eq $c.Dir -and $_.PaymentCurrency -eq $c.Cur }) } |
        Select-Object -First 1
if ($pick) {
  $pd = [ordered]@{ CompanyCode = '9990'; FinancialTransaction = $deal; Direction = $pick.Dir; EffectiveDate = $eff
                    FlowType = ''; PaymentCurrency = $pick.Cur; Payer = $g.Partner; PaymentActivity = $true }
  $r = Invoke-Trm $item 'W4-paydet-create' POST 'PaymentDetail' ($pd | ConvertTo-Json -Compress) $log
  $pdKey = "PaymentDetail(CompanyCode='9990',FinancialTransaction='$deal',Direction='$($pick.Dir)',EffectiveDate='$eff',FlowType='',PaymentCurrency='$($pick.Cur)')"
  $d = Invoke-Trm $item 'W4-paydet-delete' DELETE $pdKey $null $log
  Check 'W4 payment detail via API 1' (($r.Status -eq 201) -and ($d.Status -eq 204)) "create $($r.Status) delete $($d.Status)"
} else {
  $row = $existing[0]
  $pdKey = "PaymentDetail(CompanyCode='9990',FinancialTransaction='$deal',Direction='$($row.Direction)',EffectiveDate='$($row.EffectiveDate)',FlowType='$($row.FlowType)',PaymentCurrency='$($row.PaymentCurrency)')"
  $flip = -not [bool]$row.IndividualPayment
  $p1 = Invoke-Trm $item 'W4-paydet-patch' PATCH $pdKey ('{"IndividualPayment":' + "$flip".ToLower() + '}') $log
  $p2 = Invoke-Trm $item 'W4-paydet-restore' PATCH $pdKey ('{"IndividualPayment":' + "$(-not $flip)".ToLower() + '}') $log
  Check 'W4 payment detail via API 1 (patch round trip)' (($p1.Status -eq 200) -and ($p2.Status -eq 200)) "patch $($p1.Status) restore $($p2.Status)"
}

$r = Invoke-Trm $svc 'W5-settle' POST ((Key '9990' $deal) + "/$ns.Settle") '{}' $log
$g = Json (Invoke-Trm $svc 'W5-read-after-settle' GET (Key '9990' $deal) $null $log)
Check 'W5 settle' (($r.Status -eq 200) -and ($g.ActivityCategory -eq '30')) "status $($r.Status) cat $($g.ActivityCategory) active $($g.ActiveStatus)"

$r = Invoke-Trm $svc 'W6-settle-again' POST ((Key '9990' $deal) + "/$ns.Settle") '{}' $log
Check 'W6 second settle refused' ($r.Status -ge 400) "status $($r.Status)"

# Create-only fields carry Core.Immutable: OData V4 ignores them on update (no error, no change).
$r = Invoke-Trm $svc 'W7-patch-immutable' PATCH (Key '9990' $deal) '{"BuyCurrency":"EUR"}' $log
$g7 = Json (Invoke-Trm $svc 'W7-read-after-patch' GET (Key '9990' $deal) $null $log)
Check 'W7 create-only field unchanged by PATCH' (($r.Status -lt 500) -and ($g7.BuyCurrency -eq $g.BuyCurrency)) "status $($r.Status) BuyCurrency $($g7.BuyCurrency)"

$n = 0; $status = ''
while ($n -lt 3 -and $status -ne '3') {
  $n++
  $d = Invoke-Trm $svc "W8-reverse-$n" DELETE (Key '9990' $deal) $null $log
  $status = [string](Json (Invoke-Trm $svc "W8-read-$n" GET (Key '9990' $deal) $null $log)).ActiveStatus
  Write-Host "DELETE $n -> $($d.Status), ActiveStatus $status"
}
Check 'W8 reversed' ($status -eq '3') "after $n DELETE(s)"

$r = Invoke-Trm $svc 'W9-count-after' GET "FxTransaction?`$filter=CompanyCode eq '9990'&`$count=true&`$top=0" $null $log
$countAfter = (Json $r).'@odata.count'
Check 'W9 exactly one deal added' ($countAfter -eq $countBefore + 1) "before $countBefore after $countAfter"

if ($script:ok) { 'SUITE GREEN'; exit 0 } else { 'SUITE RED'; exit 1 }
