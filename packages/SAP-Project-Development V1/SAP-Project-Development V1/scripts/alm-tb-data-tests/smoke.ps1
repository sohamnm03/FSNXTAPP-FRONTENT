# Smoke test for ZFS_SB_ALMTBDATA_O4_API (DS4_100_TFSIN): GlAccount (R009), GlAccountBalance (R010), GlMapping (R011/R016).
# Reads are checked against SQL oracles through the ADT data preview. The only write is one GlMapping row for
# G/L account $TestGl, which must have no mapping row before the run (guard, L-608); it is deleted at the end.
# Password comes from $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [string]$Base = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [string]$Bukrs = '1000',
  [string]$KeyDate = '2026-09-30',
  [string]$TestGl = '0010000002',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Output $t }
function Done { Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail); if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 } }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note); return $Ok
}

# ---- SQL oracle through the ADT data preview ----
$adt = "$Base/sap/bc/adt"; $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$tok = (Invoke-WebRequest -Uri "$adt/discovery?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/atomsvc+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 60).Headers['x-csrf-token']
function Scalar([string]$sql) {
  $r = Invoke-WebRequest -Uri "$adt/datapreview/freestyle?rowNumber=1&sap-client=100" -Method Post -Body $sql -ContentType 'text/plain' -Headers @{ Authorization = $auth; 'X-CSRF-Token' = $tok; Accept = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 300
  $v = ([string]@(@(([xml]$r.Content).tableData.columns)[0].dataSet.data)[0]).Trim()
  if ($v.EndsWith('-')) { $v = '-' + $v.TrimEnd('-') }
  return [decimal]$v
}
$kd = $KeyDate.Replace('-', '')
$oAccounts = Scalar "SELECT COUNT(*) FROM ZFS_C_AlmGlAccount WHERE CompanyCode = '$Bukrs'"
$oBs = Scalar "SELECT COUNT(*) FROM ZFS_C_AlmGlAccount WHERE CompanyCode = '$Bukrs' AND IsBalanceSheetAccount = 'X'"
$oMapped = Scalar "SELECT COUNT(*) FROM ZFS_C_AlmGlAccount AS a INNER JOIN /fs00/almtr018 AS m`n ON m~zgl_id = a~GLAccount WHERE a~CompanyCode = '$Bukrs'"
$oMapRows = Scalar "SELECT COUNT(*) FROM /fs00/almtr018"
$oOne = Scalar "SELECT SUM( AmountInCompanyCodeCurrency ) FROM I_JournalEntryItem`n WHERE CompanyCode = '$Bukrs' AND Ledger = '0L' AND GLAccount = '0010200001'`n AND FiscalYear = '2026' AND FiscalPeriod <= '006'"
# The data preview takes no subquery in FROM: count the rows of the grouped result instead.
function RowCount([string]$sql) {
  $r = Invoke-WebRequest -Uri "$adt/datapreview/freestyle?rowNumber=100000&sap-client=100" -Method Post -Body $sql -ContentType 'text/plain' -Headers @{ Authorization = $auth; 'X-CSRF-Token' = $tok; Accept = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 300
  return @(@(([xml]$r.Content).tableData.columns)[0].dataSet.data).Count
}
$oNonZero = RowCount "SELECT GLAccount FROM I_JournalEntryItem`n WHERE CompanyCode = '$Bukrs' AND Ledger = '0L' AND FiscalYear = '2026' AND FiscalPeriod <= '006'`n GROUP BY GLAccount HAVING SUM( AmountInCompanyCodeCurrency ) <> 0"
Say "Oracle: accounts=$oAccounts balance-sheet=$oBs mapped=$oMapped mapping rows=$oMapRows 0010200001=$oOne non-zero=$oNonZero"

# ---- OData ----
$root = "$Base/sap/opu/odata4/sap/zfs_sb_almtbdata_o4_api/srvd_a2x/sap/zfs_sd_almtbdata/0001"
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = (Invoke-WebRequest -Uri "$root/?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/json' } -WebSession $sess -UseBasicParsing -TimeoutSec 90).Headers['x-csrf-token']
function Api([string]$Method, [string]$Path, [string]$Body, [hashtable]$Extra = @{}) {
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  $hdr = @{ Authorization = $auth; Accept = 'application/json' }
  foreach ($k in $Extra.Keys) { $hdr[$k] = $Extra[$k] }
  if ($Method -ne 'GET') { $hdr['X-CSRF-Token'] = $csrf }
  $p = @{ Method = $Method; Uri = "$root/$Path${sep}sap-client=100"; Headers = $hdr; WebSession = $sess; UseBasicParsing = $true; TimeoutSec = 300 }
  if ($Body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes($Body); $p['ContentType'] = 'application/json' }
  try { $r = Invoke-WebRequest @p; return @{ s = [int]$r.StatusCode; b = $r.Content; e = $r.Headers['ETag'] } }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ s = 0; b = $_.Exception.Message } }
    return @{ s = [int]$resp.StatusCode; b = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }) }
  }
}
# Read-backs after a write: fresh, cookieless request (L-596).
function Fresh([string]$Path) {
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  try { $r = Invoke-WebRequest -Uri "$root/$Path${sep}sap-client=100" -Headers @{ Authorization = $auth; Accept = 'application/json' } -UseBasicParsing -TimeoutSec 300
        return @{ s = [int]$r.StatusCode; b = $r.Content; e = $r.Headers['ETag'] } }
  catch { return @{ s = [int]$_.Exception.Response.StatusCode; b = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }) } }
}
function J($r) { try { return $r.b | ConvertFrom-Json } catch { return $null } }
function Msg($r) { $m = [regex]::Match([string]$r.b, '"message":"([^"]+)"'); if ($m.Success) { $m.Groups[1].Value } else { '' } }
function Count([string]$Path) { $r = Api GET $Path; if ($r.s -eq 200) { [int](J $r).'@odata.count' } else { -1 } }

$m = Api GET '$metadata' $null @{ Accept = 'application/xml' }
$sets = ([regex]::Matches($m.b, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ','
$null = Check '$metadata' ($m.s -eq 200 -and $sets -match 'GlAccount' -and $sets -match 'GlAccountBalance' -and $sets -match 'GlMapping') "sets=$sets"

# GlAccount (R009)
$n = Count "GlAccount?`$filter=CompanyCode eq '$Bukrs'&`$count=true&`$top=0"
$null = Check 'GlAccount: all accounts of the company code' ($n -eq $oAccounts) "count=$n oracle=$oAccounts"
$n = Count "GlAccount?`$filter=CompanyCode eq '$Bukrs' and IsBalanceSheetAccount eq true&`$count=true&`$top=0"
$null = Check 'GlAccount: balance-sheet filter' ($n -eq $oBs) "count=$n oracle=$oBs"
$r = Api GET "GlAccount?`$filter=CompanyCode eq '$Bukrs' and GLAccount eq '0010200001'"
$row = @((J $r).value)[0]
$null = Check 'GlAccount: fields (texts, flags, created)' ($r.s -eq 200 -and $row.ChartOfAccounts -and $null -ne $row.IsBlockedForPostingInCoCode -and $row.CreationDate) "chart=$($row.ChartOfAccounts) name='$($row.GLAccountName)' created=$($row.CreationDate) by=$($row.CreatedByUser)"

# GlAccountBalance (R010)
$B = "GlAccountBalance(P_CompanyCode='$Bukrs',P_KeyDate=$KeyDate)/Set"
$n = Count "$B`?`$count=true&`$top=0"
$null = Check 'GlAccountBalance: every account listed' ($n -eq $oAccounts) "count=$n oracle=$oAccounts"
$r = Api GET "$B`?`$filter=GLAccount eq '0010200001'"
$row = @((J $r).value)[0]
$null = Check 'GlAccountBalance: balance = sum of journal entries' ($r.s -eq 200 -and [decimal]$row.Balance -eq $oOne) "balance=$($row.Balance) oracle=$oOne fiscal=$($row.FiscalYear)/$($row.FiscalPeriod) currency=$($row.CompanyCodeCurrency)"
# The V4 gateway refuses a filter on an amount without its currency (/IWBEP/CM_V4S_RUN/031).
$n = Count "$B`?`$filter=Balance ne 0 and CompanyCodeCurrency eq 'INR'&`$count=true&`$top=0"
$null = Check 'GlAccountBalance: non-zero filter' ($n -eq $oNonZero) "count=$n oracle=$oNonZero"
$n = Count "$B`?`$filter=IsMapped eq true&`$count=true&`$top=0"
$null = Check 'GlAccountBalance: mapped-only filter' ($n -eq $oMapped) "count=$n oracle=$oMapped"
$r = Api GET "$B`?`$filter=GLAccount eq '0020306017'"
$row = @((J $r).value)[0]
$null = Check 'GlAccountBalance: mapping and texts joined' ($row.Alm2GroupId -eq 'SA:07:01:00:00' -and $row.SourceDesc -and $row.BucketDesc) "group=$($row.Alm2GroupId) '$($row.Alm2GroupName)' source=$($row.Source) '$($row.SourceDesc)' bucket=$($row.Bucket) '$($row.BucketDesc)'"
$all = @(); $skip = 0
do { $page = @((J (Api GET "$B`?`$select=Balance&`$top=500&`$skip=$skip")).value); $all += $page; $skip += 500 } while ($page.Count -eq 500)
$sum = [decimal]0; foreach ($x in $all) { $sum += [decimal]$x.Balance }   # decimal, not double
$null = Check 'GlAccountBalance: trial balance sums to zero' ([decimal]$sum -eq 0) "rows=$($all.Count) sum=$sum"
$null = Check 'GlAccountBalance: parameters required' ((Api GET 'GlAccountBalance').s -ge 400) ''

# GlMapping (R011/R016)
$n = Count "GlMapping?`$count=true&`$top=0"
$null = Check 'GlMapping: all rows' ($n -eq $oMapRows) "count=$n oracle=$oMapRows"
$g = Fresh "GlMapping('$TestGl')"
if (-not (Check "guard: $TestGl has no mapping row" ($g.s -eq 404) "HTTP $($g.s)")) { Say 'ABORT: test account already mapped, nothing written'; Done; exit 1 }
$ok = Check 'reject: unknown G/L account (002)' ((Api POST 'GlMapping' '{"GLAccount":"0099999999","Alm2GroupId":"SA:07:01:00:00"}').s -eq 400) ''
$r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '","Alm2GroupId":"ZZ:99"}')
$null = Check 'reject: unknown ALM 2 group (002)' ($r.s -eq 400 -and (Msg $r) -match 'Alm2GroupId') "=> $(Msg $r)"
$r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '","Bucket":"11"}')
$null = Check 'reject: unknown bucket (002)' ($r.s -eq 400 -and (Msg $r) -match 'Bucket') "=> $(Msg $r)"
$r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '","Source":"XX"}')
$null = Check 'reject: unknown source (002)' ($r.s -eq 400 -and (Msg $r) -match 'Source') "=> $(Msg $r)"
$r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '","Sensitivity":"03"}')
$null = Check 'reject: sensitivity outside the domain (002)' ($r.s -eq 400 -and (Msg $r) -match 'Sensitivity') "=> $(Msg $r)"
$r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '","Alm3GroupId":"ZZ"}')
$null = Check 'reject: unknown ALM 3 group (002)' ($r.s -eq 400 -and (Msg $r) -match 'Alm3GroupId') "=> $(Msg $r)"
$null = Check 'nothing stored by the refused creates' ((Fresh "GlMapping('$TestGl')").s -eq 404) ''

$body = '{"GLAccount":"' + $TestGl.TrimStart('0') + '","Alm2GroupId":"sa:07:01:00:00","Source":"99","Bucket":"01","Alm3Bucket":"10","Type3":"ia","Sensitivity":"01","GLAccountName":"ignored"}'
$r = Api POST 'GlMapping' $body
$made = $r.s -eq 201
$row = J $r
$null = Check 'create (key without leading zeros, codes in lower case)' $made "HTTP $($r.s) key=$($row.GLAccount) $(Msg $r)"
if ($made) {
  $g = Fresh "GlMapping('$TestGl')"; $row = J $g
  $null = Check 'derived: G/L text from SAP, not from the caller' ($row.GLAccountName -and $row.GLAccountName -ne 'ignored') "name='$($row.GLAccountName)'"
  $null = Check 'derived: group, source, bucket texts' ($row.Alm2GroupId -eq 'SA:07:01:00:00' -and $row.SourceDesc -eq 'Trial Balance Data' -and $row.BucketDesc -and $row.Alm3BucketDesc -and $row.Type3 -eq 'IA') "group='$($row.Alm2GroupName)' source='$($row.SourceDesc)' b='$($row.BucketDesc)' b3='$($row.Alm3BucketDesc)'"
  $null = Check 'stamps: created and changed set' ($row.CreatedBy -eq $User -and $row.ChangedBy -eq $User -and $row.CreatedDate) "created=$($row.CreatedBy) $($row.CreatedDate) changed=$($row.ChangedBy)"
  $r = Api POST 'GlMapping' ('{"GLAccount":"' + $TestGl + '"}')
  $null = Check 'reject: duplicate (001)' ($r.s -eq 400) "=> $(Msg $r)"
  $null = Check 'PATCH with stale ETag refused' ((Api PATCH "GlMapping('$TestGl')" '{"Bucket":"02"}' @{ 'If-Match' = 'W/"00000000000000"' }).s -eq 412) ''
  $r = Api PATCH "GlMapping('$TestGl')" '{"Bucket":"02"}' @{ 'If-Match' = $g.e }
  $row = J (Fresh "GlMapping('$TestGl')")
  $null = Check 'PATCH bucket: text follows, created kept' ($r.s -in 200, 204 -and [int]$row.Bucket -eq 2 -and $row.BucketDesc -match '07' -and $row.CreatedBy -eq $User -and [int]$row.Alm3Bucket -eq 10) "HTTP $($r.s) bucket=$($row.Bucket) '$($row.BucketDesc)' alm3 bucket kept=$($row.Alm3Bucket)"
  $r = Api PATCH "GlMapping('$TestGl')" '{"Alm2GroupId":"ZZ:99"}' @{ 'If-Match' = '*' }
  $null = Check 'PATCH: changed field checked (002)' ($r.s -eq 400) "=> $(Msg $r)"
  $r = Api DELETE "GlMapping('$TestGl')" $null @{ 'If-Match' = '*' }
  $null = Check 'DELETE' ($r.s -eq 204) "HTTP $($r.s)"
  $null = Check 'row gone' ((Fresh "GlMapping('$TestGl')").s -eq 404) ''
}
$n = Count "GlMapping?`$count=true&`$top=0"
$null = Check 'GlMapping: row count back to the start' ($n -eq $oMapRows) "count=$n"
Done
