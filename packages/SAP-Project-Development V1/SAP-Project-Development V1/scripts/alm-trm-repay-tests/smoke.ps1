# Smoke test for ZFS_SB_ALMTRMREPAY_O4_API (DS4_100_TFSIN), entity set TrmRepaymentCashflow.
# Read-only. Compares the API with an independent SQL sum over the same flows (ADT data preview),
# and checks parameters, $filter, $orderby, paging and $count. Password: $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [string]$Host_ = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [string]$Bukrs = '1000', [string]$Year = '2026', [string]$Month = '09',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$root = "$Host_/sap/opu/odata4/sap/zfs_sb_almtrmrepay_o4_api/srvd_a2x/sap/zfs_sd_almtrmrepay/0001"
$script:log = New-Object System.Collections.Generic.List[string]; $script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Output $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) { if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }; Say ("[{0}] {1} {2}" -f $tag, $Name, $Note) }
function G([string]$p, [string]$accept = 'application/json') {
  $sep = if ($p.Contains('?')) { '&' } else { '?' }
  try { $r = Invoke-WebRequest -Uri "$root/$p${sep}sap-client=100" -Headers @{ Authorization = $auth; Accept = $accept } -UseBasicParsing -TimeoutSec 300; return @{ s = [int]$r.StatusCode; b = $r.Content } }
  catch { return @{ s = [int]$_.Exception.Response.StatusCode; b = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }) } }
}
# All rows of a query, following @odata.nextLink (the gateway pages at 100 without $top).
function Rows([string]$query) {
  $out = New-Object System.Collections.Generic.List[object]; $path = "$P`?$query"
  while ($path) {
    $r = G $path; if ($r.s -ne 200) { return ,$null }
    $d = $r.b | ConvertFrom-Json; foreach ($v in $d.value) { $out.Add($v) }
    $path = if ($d.'@odata.nextLink') { $d.'@odata.nextLink' -replace '^.*?/0001/', '' -replace '([?&])sap-client=\d+&?', '$1' } else { $null }
  }
  return ,$out.ToArray()
}

# Oracle: ADT data preview. Keep every SQL line under 255 characters (L-606).
$adt = "$Host_/sap/bc/adt"; $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$tok = (Invoke-WebRequest -Uri "$adt/discovery?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/atomsvc+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 60).Headers['x-csrf-token']
function Sql([string]$sql) {
  $r = Invoke-WebRequest -Uri "$adt/datapreview/freestyle?rowNumber=500&sap-client=100" -Method Post -Body $sql -ContentType 'text/plain' -Headers @{ Authorization = $auth; 'X-CSRF-Token' = $tok; Accept = 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml' } -WebSession $ws -UseBasicParsing -TimeoutSec 300
  $cols = @(([xml]$r.Content).tableData.columns); $out = @{}
  for ($i = 0; $i -lt @($cols[0].dataSet.data).Count; $i++) { $out[[string]@($cols[0].dataSet.data)[$i]] = [decimal]([string]@($cols[1].dataSet.data)[$i]).Trim() }
  return $out
}
# Window: first day of the month after the period up to the end of bucket 7 (12 months), as /FS00/ALMFM001.
$key = (Get-Date -Year ([int]$Year) -Month ([int]$Month) -Day 1).AddMonths(1)
$from = $key.ToString('yyyyMMdd'); $to = $key.AddMonths(12).AddDays(-1).ToString('yyyyMMdd')
$j = "FROM /fs00/cds0002 AS a INNER JOIN /fs00/almtr009 AS b`n ON b~zflow = a~flowtype AND b~zsgsart = a~product_type"
$w = "WHERE a~company_code = '$Bukrs' AND a~valuation_area = '001'`n AND a~trldate >= '$from' AND a~trldate <= '$to'"
$sec = Sql "SELECT zs_type, SUM( position_amt ) AS amt`n $j`n $w`n AND a~security_id IN ( SELECT ranl FROM /fs00/cds0001`n WHERE bukrs = '$Bukrs' AND ranl <> ' ' )`n GROUP BY zs_type"
$mm = Sql "SELECT zs_type, SUM( position_amt ) AS amt`n $j`n $w`n AND a~security_id = ' ' AND a~deal_number IN ( SELECT rfha FROM /fs00/cds0001`n WHERE bukrs = '$Bukrs' AND ranl = ' ' )`n GROUP BY zs_type"
$expect = @{}; foreach ($h in $sec, $mm) { foreach ($k in $h.Keys) { $expect[$k] = [decimal]$expect[$k] + $h[$k] } }
Say "Period $Bukrs $Year/$Month, flows $from..$to; oracle by source type: $((($expect.Keys | Sort-Object) | ForEach-Object { "$_=$($expect[$_])" }) -join ', ')"

$m = G '$metadata' 'application/xml'
Check '$metadata' ($m.s -eq 200 -and $m.b -match 'EntitySet Name="TrmRepaymentCashflow"' -and $m.b -match 'Name="Bucket7"') "HTTP $($m.s)"
$P = "TrmRepaymentCashflow(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='$Month')/Set"

$c = G "$P`?`$count=true&`$top=0"
$count = if ($c.s -eq 200) { [int]($c.b | ConvertFrom-Json).'@odata.count' } else { -1 }
Check '$count' ($count -gt 0) "count=$count"

# All rows through paging ($top/$skip), 100 at a time.
$all = @(); for ($skip = 0; $skip -lt $count; $skip += 100) { $all += Rows "`$top=100&`$skip=$skip" }
Check 'paging returns every row once' ($all.Count -eq $count -and (@($all | ForEach-Object { "$($_.DealNumber)|$($_.SecurityId)|$($_.SourceType)|$($_.Currency)" } | Sort-Object -Unique)).Count -eq $count) "rows=$($all.Count)"

$got = @{}; foreach ($r in $all) { $got[$r.SourceType] = [decimal]$got[$r.SourceType] + [decimal]$r.Total }
foreach ($k in ($expect.Keys + $got.Keys | Sort-Object -Unique)) {
  Check "total source type $k = oracle" ([decimal]$got[$k] -eq [decimal]$expect[$k]) "api=$($got[$k]) sql=$($expect[$k])"
}
$bad = @($all | Where-Object { [decimal]$_.Total -ne ([decimal]$_.Bucket1 + [decimal]$_.Bucket2 + [decimal]$_.Bucket3 + [decimal]$_.Bucket4 + [decimal]$_.Bucket5 + [decimal]$_.Bucket6 + [decimal]$_.Bucket7) })
Check 'Total = Bucket1..7 on every row' ($bad.Count -eq 0) "mismatches=$($bad.Count)"
$kinds = @($all | Where-Object { ($_.SourceType -in '10','12') -ne ($_.FlowKind -eq 'Interest') })
Check 'FlowKind matches source type' ($kinds.Count -eq 0) "mismatches=$($kinds.Count)"
$late = @($all | Where-Object { [decimal]$_.Bucket6 -ne 0 -or [decimal]$_.Bucket7 -ne 0 })
Check 'buckets 6 and 7 filled (report stops at 5)' ($late.Count -gt 0) "rows with bucket 6/7 amounts=$($late.Count)"
$both = @($all | Where-Object { $_.DealNumber } | Group-Object DealNumber | Where-Object { @($_.Group.FlowKind | Sort-Object -Unique).Count -eq 2 })
Check 'deals with separate interest and principal rows' ($both.Count -gt 0) "deals=$($both.Count)"

$deal = ($all | Where-Object { $_.DealNumber } | Select-Object -First 1).DealNumber
$f = Rows "`$filter=DealNumber eq '$deal'"
Check "`$filter DealNumber eq '$deal' (report ignores S_RFHA)" ($f -and $f.Count -ge 1 -and @($f | Where-Object { $_.DealNumber -ne $deal }).Count -eq 0) "rows=$(@($f).Count)"
$prd = ($all | Select-Object -First 1).ProductType
$f = Rows "`$filter=ProductType eq '$prd'"
Check "`$filter ProductType eq '$prd'" ($f -and @($f | Where-Object { $_.ProductType -ne $prd }).Count -eq 0 -and $f.Count -eq @($all | Where-Object { $_.ProductType -eq $prd }).Count) "rows=$(@($f).Count)"
$f = Rows '$filter=FlowKind eq ''Interest''&$orderby=Total desc&$top=5'
Check '$filter FlowKind + $orderby Total desc' ($f -and $f.Count -gt 0 -and ([decimal]$f[0].Total -ge [decimal]$f[-1].Total) -and @($f | Where-Object { $_.FlowKind -ne 'Interest' }).Count -eq 0) "top=$($f[0].Total) last=$($f[-1].Total)"

$x = G "TrmRepaymentCashflow(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='13')/Set"
Check 'month 13 -> no rows' ($x.s -eq 200 -and @(($x.b | ConvertFrom-Json).value).Count -eq 0) "HTTP $($x.s)"
$x = G "TrmRepaymentCashflow(P_CompanyCode='ZZZZ',P_FiscalYear='$Year',P_FiscalPeriod='$Month')/Set"
Check 'unknown company code -> no rows' ($x.s -eq 200 -and @(($x.b | ConvertFrom-Json).value).Count -eq 0) "HTTP $($x.s)"
$x = G 'TrmRepaymentCashflow'
Check 'no parameters -> refused' ($x.s -ge 400) "HTTP $($x.s)"

Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
