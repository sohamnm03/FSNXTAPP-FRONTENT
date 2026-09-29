# Live acceptance test for ZFS_SB_TRMLC_O4_API (Phase 4) on DS4/100, company code 9999.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\trm-deal-api-tests\lc-crud.ps1 `
#          -EvidenceDir <dir> [-SourceDeal 100000] [-Stage read|crud|all]
#   read = R1-R5 (Task 2); crud = + W0-W4, W6-W7, W10-W11 on deal A (Task 3);
#   all  = + W1b, W5 Present, W8/W9 Terminate on deal B, W12 non-LC probe (Task 4).
# Exit 0 = every check GREEN, 1 = at least one RED. Writes <EvidenceDir>\lc-crud-log.txt.
param([string]$EvidenceDir, [string]$SourceDeal = '100000', [ValidateSet('read', 'crud', 'all')][string]$Stage = 'all')
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$svc = 'zfs_sb_trmlc_o4_api/srvd_a2x/sap/zfs_sd_trmlc/0001'
$ns  = 'com.sap.gateway.srvd_a2x.zfs_sd_trmlc.v0001'
New-Item -ItemType Directory -Force $EvidenceDir | Out-Null
$log = Join-Path $EvidenceDir 'lc-crud-log.txt'
$script:ok = $true
$script:blocked = @()
function Check([string]$Name, [bool]$Pass, [string]$Detail) {
  Write-Host ("$Name $Detail -> " + $(if ($Pass) { 'GREEN' } else { 'RED' }))
  if (-not $Pass) { $script:ok = $false }
}
function Json($r) { if ($r.Content) { try { return $r.Content | ConvertFrom-Json } catch { } } return $null }
function Key([string]$Company, [string]$Deal) { "LetterOfCredit(CompanyCode='$Company',FinancialTransaction='$Deal')" }
function Get-Deal([string]$Deal, [string]$Step) { Json (Invoke-Trm $svc $Step GET (Key '9999' $Deal) $null $log) }
function Count9999([string]$Step) { (Json (Invoke-Trm $svc $Step GET "LetterOfCredit?`$filter=CompanyCode eq '9999'&`$count=true&`$top=0" $null $log)).'@odata.count' }

# ---- read-only ----------------------------------------------------------------------------------
$r = Invoke-Trm $svc 'R1-list' GET "LetterOfCredit?`$filter=CompanyCode eq '9999'&`$count=true&`$top=5" $null $log
$j = Json $r
Check 'R1 list 9999' (($r.Status -eq 200) -and ($j.'@odata.count' -ge 8) -and (@($j.value).Count -le 5)) "status $($r.Status) count $($j.'@odata.count')"

$r = Invoke-Trm $svc 'R2-source' GET (Key '9999' $SourceDeal) $null $log
$src = Json $r
Check 'R2 source deal' (($r.Status -eq 200) -and $src.Currency -and ([double]$src.Amount -ne 0) -and $src.ActivityCategory) "status $($r.Status) $($src.Amount) $($src.Currency) cat $($src.ActivityCategory) applicant $($src.Applicant) beneficiary $($src.Beneficiary)"

$r = Invoke-Trm $svc 'R3-non-lc-deal' GET "LetterOfCredit(CompanyCode='1000',FinancialTransaction='160539')" $null $log
Check 'R3 IRATE deal via LC API' ($r.Status -eq 404) "status $($r.Status)"

$r = Invoke-Trm $svc 'R4-bapi-only-filter' GET "LetterOfCredit?`$filter=Amount gt 0" $null $log
Check 'R4 filter on Amount refused' (($r.Status -ge 400) -and ($r.Content -notmatch 'SYSTEM_FAILURE|ABAP runtime')) "status $($r.Status)"

$r = Invoke-Trm $svc 'R5-type-filter' GET "LetterOfCredit?`$filter=CompanyCode eq '9999' and ProductType eq '38A'&`$count=true" $null $log
$j = Json $r
Check 'R5 ProductType eq 38A' (($r.Status -eq 200) -and ($j.'@odata.count' -ge 8) -and (@($j.value | Where-Object { $_.ProductType -ne '38A' }).Count -eq 0)) "status $($r.Status) count $($j.'@odata.count')"

if ($Stage -eq 'read') { if ($script:ok) { 'READ GREEN'; exit 0 } else { 'READ RED'; exit 1 } }
if (-not $src) { 'no source deal - cannot build the POST body'; exit 1 }

# ---- create / read / update / settle / reverse (deal A) ------------------------------------------
$countBefore = Count9999 'W0-count-before'
function New-LcBody([string]$Suffix) {
  $b = [ordered]@{
    CompanyCode = '9999'; ProductType = '38A'; TransactionType = '100'; Partner = $src.Partner
    ContractDate = (Get-Date -Format 'yyyy-MM-dd'); StartTerm = (Get-Date -Format 'yyyy-MM-dd')
    EndTerm = (Get-Date).AddDays(180).ToString('yyyy-MM-dd'); Amount = 50000; Currency = $src.Currency
    LcNumber = ('ZFS' + (Get-Date -Format 'MMddHHmmss') + $Suffix)
  }
  foreach ($f in 'ValuationClass', 'Portfolio', 'FlowType', 'Applicant', 'Beneficiary', 'IssuingBank', 'AdvisingBank', 'PlaceOfExpiry', 'PaymentTerm') {
    if ($src.$f) { $b[$f] = $src.$f }
  }
  return $b
}
$r = Invoke-Trm $svc 'W1-create-A' POST 'LetterOfCredit' ((New-LcBody 'A') | ConvertTo-Json -Compress) $log
$a = Json $r
Check 'W1 create A' (($r.Status -eq 201) -and $a.FinancialTransaction -and ($a.ActivityCategory -eq '20')) "status $($r.Status) deal $($a.FinancialTransaction) cat $($a.ActivityCategory)"
if ($r.Status -ne 201) {
  $after = Count9999 'W1-count-after-failed-create'
  Write-Host "create failed; 9999 count before $countBefore after $after (an increase means an orphan deal)"
  'CRUD RED (create failed)'; exit 1
}
$dealA = $a.FinancialTransaction
Write-Host "TEST DEAL A: 9999/$dealA"

$g = Get-Deal $dealA 'W2-read-A'
Check 'W2 read A' ([double]$g.Amount -eq 50000) "amount $($g.Amount)"

$r = Invoke-Trm $svc 'W3-patch-A' PATCH (Key '9999' $dealA) '{"Amount":60000}' $log
$g = Get-Deal $dealA 'W3-read-after-patch'
Check 'W3 patch Amount' (($r.Status -eq 200) -and ([double]$g.Amount -eq 60000)) "status $($r.Status) amount $($g.Amount)"

$r = Invoke-Trm $svc 'W4-patch-immutable' PATCH (Key '9999' $dealA) '{"Currency":"EUR"}' $log
$g4 = Get-Deal $dealA 'W4-read-after-patch'
Check 'W4 create-only Currency unchanged' (($r.Status -lt 500) -and ($g4.Currency -eq $src.Currency)) "status $($r.Status) currency $($g4.Currency)"

if ($Stage -eq 'all') {
  $today = Get-Date -Format 'yyyy-MM-dd'
  # OData V4 declares every non-date action parameter Nullable="false": send all of them, unused ones empty.
  # FlowType 1840 "Payment Obligation" (TZB0T, contract type T); the bank falls back to the deal's counterparty.
  $bank = @($src.AdvisingBank, $src.IssuingBank, $src.Partner) | Where-Object { $_ } | Select-Object -First 1
  $pbody = [ordered]@{ ActionType = 'CREA'; PresentationItem = ''; FlowType = '1840'; PresentationBank = $bank
                       ShipmentDate = $today; PresentationDate = $today
                       PaymentDate = (Get-Date).AddDays(30).ToString('yyyy-MM-dd'); PresentationAmount = 10000
                       PresentationCurrency = $src.Currency; Discrepancy = $false; DiscrepancyAmount = 0
                       DiscrepancyCurrency = '' }
  $r = Invoke-Trm $svc 'W5-present-A' POST ((Key '9999' $dealA) + "/$ns.Present") ($pbody | ConvertTo-Json -Compress) $log
  $g5 = Get-Deal $dealA 'W5-read-after-present'
  if (($r.Status -eq 200) -and $g5.LastPresentationItem) {
    Check 'W5 present CREA' $true "status 200 item $($g5.LastPresentationItem) status $($g5.LastPresentationStatus)"
  } elseif ($r.Content -match 'ZFS_TRM_MSG/020' -and $r.Content -match 'BAPI_FTR_LC_PRESENT') {
    # Known SAP-side dump in TLC_DI_SET_PRESENTATION (L-586): reported, never counted as GREEN.
    Write-Host "W5 present CREA status $($r.Status) -> BLOCKED (SAP defect L-586, BAPI_FTR_LC_PRESENT dumps)"
    $script:blocked += 'W5'
  } else {
    Check 'W5 present CREA' $false "status $($r.Status) item $($g5.LastPresentationItem)"
  }
}

$r = Invoke-Trm $svc 'W6-settle-A' POST ((Key '9999' $dealA) + "/$ns.Settle") '{}' $log
$g6 = Get-Deal $dealA 'W6-read-after-settle'
Check 'W6 settle A' (($r.Status -eq 200) -and ($g6.ActivityCategory -eq '30')) "status $($r.Status) cat $($g6.ActivityCategory)"

$r = Invoke-Trm $svc 'W7-settle-again' POST ((Key '9999' $dealA) + "/$ns.Settle") '{}' $log
Check 'W7 second settle refused (4xx)' (($r.Status -ge 400) -and ($r.Status -lt 500)) "status $($r.Status)"

$deals = @($dealA)

if ($Stage -eq 'all') {
  # A create the BAPI itself refuses (unknown transaction type; every mandatory field present, so the
  # gateway lets it through) rolls back and must not carry 058, and must not leave a deal behind.
  $c0 = Count9999 'W1b-count-before'
  $bad = New-LcBody 'X'; $bad.TransactionType = '999'
  $r = Invoke-Trm $svc 'W1b-bad-create' POST 'LetterOfCredit' ($bad | ConvertTo-Json -Compress) $log
  $c1 = Count9999 'W1b-count-after'
  Check 'W1b BAPI-refused create: 4xx from the BAPI, no 058, no deal' (($r.Status -ge 400) -and ($r.Status -lt 500) -and ($r.Content -notmatch 'SADL_ENTITY_RUNTIME') -and ($r.Content -notmatch 'ZFS_TRM_MSG/058') -and ($c1 -eq $c0)) "status $($r.Status) $((Json $r).error.code) count $c0 -> $c1"

  $r = Invoke-Trm $svc 'W8-create-B' POST 'LetterOfCredit' ((New-LcBody 'B') | ConvertTo-Json -Compress) $log
  $b = Json $r
  Check 'W8 create B' ($r.Status -eq 201) "status $($r.Status) deal $($b.FinancialTransaction)"
  if ($r.Status -eq 201) {
    $dealB = $b.FinancialTransaction; $deals += $dealB
    Write-Host "TEST DEAL B: 9999/$dealB"
    # Termination needs a settled contract (T1 221 "Activity does not allow a termination" on cat 20).
    $r = Invoke-Trm $svc 'W9-settle-B' POST ((Key '9999' $dealB) + "/$ns.Settle") '{}' $log
    Check 'W9a settle B before terminate' ($r.Status -eq 200) "status $($r.Status)"
    $td = (Get-Date).AddDays(60).ToString('yyyy-MM-dd')
    $meta = (Invoke-Trm $svc 'W9-metadata' GET '$metadata' $null $null).Content
    $term = [regex]::Match($meta, '<Action Name="Terminate".*?</Action>', 'Singleline').Value
    Check 'W9b Terminate publishes no TerminateDateInclusive (BAPI ignores it)' ($term -and ($term -notmatch 'TerminateDateInclusive')) 'metadata'
    $r = Invoke-Trm $svc 'W9-terminate-B' POST ((Key '9999' $dealB) + "/$ns.Terminate") ('{"TerminateDate":"' + $td + '"}') $log
    $g9 = Get-Deal $dealB 'W9-read-after-terminate'
    Check 'W9 terminate B' (($r.Status -eq 200) -and ($g9.TerminateDate -eq $td) -and ($g9.ActivityCategory -eq '80')) "status $($r.Status) terminate $($g9.TerminateDate) cat $($g9.ActivityCategory)"
  }
}

foreach ($d in $deals) {
  $n = 0; $st = ''
  while ($n -lt 5 -and $st -ne '3') {
    $n++
    $x = Invoke-Trm $svc "W10-reverse-$d-$n" DELETE (Key '9999' $d) $null $log
    $st = [string](Get-Deal $d "W10-read-$d-$n").ActiveStatus
    Write-Host "deal $d DELETE $n -> $($x.Status), ActiveStatus $st"
  }
  Check "W10 deal $d reversed" ($st -eq '3') "after $n DELETE(s)"
}

$countAfter = Count9999 'W11-count-after'
Check 'W11 count grew by the test deals only' ($countAfter -eq $countBefore + $deals.Count) "before $countBefore after $countAfter deals $($deals.Count)"

if ($Stage -eq 'all') {
  # Non-LC key: reversed FX test deal 9990/40000891. The BAPI must refuse; nothing can be written to it.
  $r = Invoke-Trm $svc 'W12-non-lc-patch' PATCH "LetterOfCredit(CompanyCode='9990',FinancialTransaction='40000891')" '{"Amount":1}' $log
  Check 'W12 PATCH on an FX key refused' (($r.Status -ge 400) -and ($r.Status -lt 500)) "status $($r.Status) $((Json $r).error.code)"
  # ACTIVE FX deal 9990/40000258, ContractDate set to its current value (a no-op): every LC BAPI starts with lc_init, which refuses a non-LC key (FTR_LC 107).
  $r = Invoke-Trm $svc 'W13-active-non-lc-patch' PATCH "LetterOfCredit(CompanyCode='9990',FinancialTransaction='40000258')" '{"ContractDate":"2026-07-31"}' $log
  Check 'W13 write on an ACTIVE non-LC key refused by the BAPI (FTR_LC 107)' (($r.Status -ge 400) -and ($r.Status -lt 500) -and ($r.Content -match 'FTR_LC/107')) "status $($r.Status) $((Json $r).error.code)"
}

$note = if ($script:blocked) { " (known SAP blockers: $($script:blocked -join ', '))" } else { '' }
if ($script:ok) { "SUITE GREEN$note"; exit 0 } else { "SUITE RED$note"; exit 1 }
