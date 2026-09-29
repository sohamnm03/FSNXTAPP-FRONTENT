# Smoke test for ZFS_SB_ALMQTR3RPT_O4_API (DS4_100_TFSIN): QuarterlyReport + QuarterlyPeriod of the ALM 3 quarterly report.
# Checks the report against its sources (TRM principal O/S and accrual APIs, by product / transaction type / interest type),
# the decided fixed-only rule for investments and NCD, the level totals and the computed rows, then Lock refused (not saved)
# -> Save refusals -> Save -> read back /FS00/ALMTR016 -> Save again (refused) -> Delete. Lock itself is NOT run (no API removes it).
# No test data is created: no ALM 3 group has source 92. Password: $env:SAP_DS4_100_TFSIN_PASSWORD.
param([string]$Bukrs = '1000', [string]$Year = '2026', [string]$Month = '09', [string]$OutFile)
$ErrorActionPreference = 'Stop'
$H = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$script:log = New-Object System.Collections.Generic.List[string]; $script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Host $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) { if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }; Say ("[{0}] {1} {2}" -f $tag, $Name, $Note) }
function Done { Say "RESULT: $script:pass passed, $script:fail failed"; if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 } }
function Svc([string]$name, [string]$def) { "$H/sap/opu/odata4/sap/$name/srvd_a2x/sap/$def/0001" }
$qr  = Svc 'zfs_sb_almqtr3rpt_o4_api' 'zfs_sd_almqtr3rpt'
$trm = Svc 'zfs_sb_almtrmdata_o4_api' 'zfs_sd_almtrmdata'

function Req([string]$Method, [string]$Url, [string]$Body, $Session, [string]$Token, [hashtable]$Extra = @{}) {
  $sep = if ($Url.Contains('?')) { '&' } else { '?' }
  $hd = @{ Authorization = $auth; Accept = 'application/json' }
  if ($Token) { $hd['X-CSRF-Token'] = $Token }
  foreach ($k in $Extra.Keys) { $hd[$k] = $Extra[$k] }
  $p = @{ Method = $Method; Uri = "$Url${sep}sap-client=100"; Headers = $hd; UseBasicParsing = $true; TimeoutSec = 600 }
  if ($Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes($Body); $p.ContentType = 'application/json' }
  if ($Session) { $p.WebSession = $Session }
  try { $r = Invoke-WebRequest @p; return @{ s = [int]$r.StatusCode; b = $r.Content } }
  catch {
    $resp = $_.Exception.Response
    $b = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($resp) { (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
    return @{ s = $(if ($resp) { [int]$resp.StatusCode } else { 0 }); b = $b }
  }
}
function Writer([string]$Root) {
  $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $t = Invoke-WebRequest -Uri "$Root/?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch' } -WebSession $ws -UseBasicParsing -TimeoutSec 60
  return @{ ws = $ws; tok = $t.Headers['x-csrf-token'] }
}
function Msg($r) { [regex]::Match([string]$r.b, '"message":"([^"]+)"').Groups[1].Value }
function All([string]$Root, [string]$Path) {
  $out = New-Object System.Collections.Generic.List[object]; $u = "$Root/$Path`?`$top=5000"
  while ($u) {
    $r = Req GET $u; if ($r.s -ne 200) { throw "GET $u -> $($r.s) $($r.b)" }
    $d = $r.b | ConvertFrom-Json; foreach ($v in $d.value) { $out.Add($v) }
    $u = if ($d.'@odata.nextLink') { "$Root/" + (($d.'@odata.nextLink' -replace '([?&])sap-client=\d+&?', '$1') -replace '[?&]$', '') } else { $null }
  }
  return ,$out.ToArray()
}
function Sum11($r) { $s = [decimal]0; foreach ($i in 1..11) { $s += [decimal]$r."Bucket$i" }; return $s }
function In($v, [string]$list) { $l = @($list -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }); return ($l.Count -eq 0 -or $l -contains $v) }
# Expected |per-bucket sum| of TRM rows (BucketNN) matching a group's product / transaction type / interest type.
function Expect($feed, $g, [bool]$ByIntType) {
  $e = @{}; foreach ($i in 1..10) { $e[$i] = [decimal]0 }
  foreach ($f in $feed) {
    $it = if ($f.FixedOrVariable) { ([string]$f.FixedOrVariable).Substring(0, 2) } else { '' }
    if ((In $f.ProductType $g.Product) -and (In $f.TransactionType $g.TransactionType) -and (-not $ByIntType -or -not $g.InterestType -or $it -eq $g.InterestType)) {
      foreach ($i in 1..10) { $e[$i] += [decimal]$f.('Bucket{0:D2}' -f $i) } }
  }
  foreach ($i in 1..10) { $e[$i] = [math]::Abs($e[$i]) }; return $e
}
function Depth([string]$id) { $p = $id -split ':'; $d = 1; for ($i = 1; $i -lt $p.Count; $i++) { if ($p[$i] -eq '00' -or -not $p[$i]) { break }; $d++ }; return $d }
$P = "(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='$Month')/Set"
$K = "QuarterlyPeriod(CompanyCode='$Bukrs',FiscalYear='$Year',FiscalPeriod='$Month')"

$m = Req GET "$qr/`$metadata" $null $null $null @{ Accept = 'application/xml' }
Check '$metadata' ($m.s -eq 200 -and $m.b -match 'EntitySet Name="QuarterlyReport"' -and $m.b -match 'Action Name="SaveSnapshot"' -and $m.b -match 'Bucket11' -and $m.b -match 'InterestType') "HTTP $($m.s)"
$per = Req GET "$qr/$K"; $pd = $per.b | ConvertFrom-Json
if ($per.s -ne 200 -or $pd.Saved -or $pd.Locked) { Say "ABORT: period is saved or locked (HTTP $($per.s)); nothing was changed"; Done; exit 1 }
Check 'period: not saved, not locked, key date = month end + 1' ($pd.KeyDate -eq '2026-10-01') "key=$($pd.KeyDate)"

$sw = [Diagnostics.Stopwatch]::StartNew(); $rows = All $qr "QuarterlyReport$P"; $sw.Stop()
$grp = @{}; foreach ($r in $rows) { $grp[$r.GroupId] = $r }
Check 'report: 178 groups + 5 computed rows' ($rows.Count -eq 183) "rows=$($rows.Count) in $([int]$sw.Elapsed.TotalSeconds)s"
$last5 = @($rows | Select-Object -Last 5 | ForEach-Object { $_.GroupId }) -join ','
Check 'computed rows last, in order' ($last5 -eq 'IA:99:99:99:99:99_A1,IC,ID,IE,IF') $last5
$bad = @($rows | Where-Object { $_.RowStyle -ne 'CUMULATIVE' -and $_.RowStyle -ne 'PERCENT' -and [decimal]$_.Total -ne (Sum11 $_) })
Check 'report: Total = Bucket1..11 (except cumulative / percent rows)' ($bad.Count -eq 0) "mismatches=$($bad.Count)"

$prin = All $trm "TrmPrincipalOutstanding$P"; $accr = All $trm "TrmAccrualCashflow$P"
foreach ($g in @($rows | Where-Object { $_.Source -eq '11' })) {
  $e = Expect $prin $g $true; $diff = @(1..10 | Where-Object { [decimal]$g."Bucket$_" -ne $e[$_] })
  Check "source 11: $($g.GroupId) ($($g.Product)/$($g.TransactionType)/$($g.InterestType)) = TRM API" ($diff.Count -eq 0) "total=$($g.Total) diffBuckets=$($diff -join ',')"
}
$fx = @($rows | Where-Object { $_.Source -eq '11' -and $_.Product -eq '10C' }); $sumFx = [decimal]0; foreach ($g in $fx) { $sumFx += [decimal]$g.Total }
$e10c = [decimal]0; foreach ($f in $prin) { if ($f.ProductType -eq '10C' -and (In $f.TransactionType '200')) { $e10c += [decimal]$f.Total } }
Check '10C fixed + floating = all 10C/200 principal (split, no loss)' ([math]::Abs($sumFx) -eq [math]::Abs($e10c)) "groups=$sumFx api=$e10c"
foreach ($g in @($rows | Where-Object { $_.Source -eq '64' })) {
  $e = Expect $accr $g $false; $diff = @(1..10 | Where-Object { [decimal]$g."Bucket$_" -ne $e[$_] })
  Check "source 64: $($g.GroupId) = TRM accrual API" ($diff.Count -eq 0) "total=$($g.Total)"
}
$float09 = @($rows | Where-Object { $_.Source -eq '09' -and $_.InterestType -eq '02' })
Check 'source 09: floating groups = 0 (fixed only, answer 2)' (@($float09 | Where-Object { [decimal]$_.Total -ne 0 }).Count -eq 0) "$(($float09 | ForEach-Object { "$($_.GroupId)=$($_.Total)" }) -join ' ')"
Say "info: source 09 fixed groups: $((@($rows | Where-Object { $_.Source -eq '09' -and $_.InterestType -ne '02' }) | ForEach-Object { "$($_.GroupId) ($($_.Product))=$($_.Total)" }) -join '; ')"
$floatNcd = @($rows | Where-Object { $_.Source -ge '13' -and $_.Source -le '19' -and $_.GroupId.Substring(9, 2) -ne '01' })
Check 'NCD: floating groups = 0 (fixed only)' (@($floatNcd | Where-Object { [decimal]$_.Total -ne 0 }).Count -eq 0) "groups=$($floatNcd.Count)"
Say "info: bucket 11 total over all rows = $((($rows | Where-Object { $_.RowStyle -notin @('CUMULATIVE','PERCENT','MISMATCH','SUBTOTAL') }) | Measure-Object -Property Bucket11 -Sum).Sum); SourceIncomplete rows = $(@($rows | Where-Object { $_.SourceIncomplete }).Count); TB rows with source 99 amounts = $(@($rows | Where-Object { $_.Source -eq '99' -and [decimal]$_.Total -ne 0 }).Count)"

# Level totals: every source-less parent = sum of its direct children (no ZNEG on TFSIN).
$lvBad = @()
foreach ($r in $rows) {
  if ($r.Source -or $r.GroupId.Length -lt 17 -or $r.RowStyle -eq 'SUBTOTAL') { continue }
  $d = Depth $r.GroupId; if ($d -lt 2 -or $d -gt 5) { continue }
  $pre = $r.GroupId.Substring(0, 3 * $d); $kids = @($rows | Where-Object { $_.GroupId.Length -ge 17 -and $_.GroupId.StartsWith($pre) -and (Depth $_.GroupId) -eq $d + 1 })
  if ($kids.Count -eq 0) { continue }
  # Not $k: PowerShell names are case-insensitive and $K is the period key (L-604).
  $s = [decimal]0; foreach ($kid in $kids) { $s += [decimal]$kid.Total }
  if ([decimal]$r.Total -ne $s) { $lvBad += "$($r.GroupId)=$($r.Total)/kids=$s" }
}
Check 'level totals: each parent = sum of its direct children' ($lvBad.Count -eq 0) "mismatches=$($lvBad.Count) $($lvBad | Select-Object -First 3)"

$ia = $grp['IA:99:99:99:99:99']; $ib = $grp['IB:99:99:99:99:99']
foreach ($pfx in 'IA', 'IB') {
  $sub = $grp["${pfx}:99:99:99:99:99"]; $sum = [decimal]0
  foreach ($r in $rows) { if ($r.GroupId.Length -ge 14 -and $r.GroupId.StartsWith($pfx) -and $r.GroupId.Substring(6, 8) -eq '00:00:00') { $sum += [decimal]$r.Total } }
  Check "subtotal: ${pfx}:99:99:99:99:99 = sum of its level-1 rows" ([decimal]$sub.Total -eq $sum) "total=$($sub.Total) level1=$sum"
}
$ic = $grp['IC']; $id = $grp['ID']; $ie = $grp['IE']; $a1 = $grp['IA:99:99:99:99:99_A1']
Check 'IC = IB99 - IA99 per bucket (11 buckets)' (@(1..11 | Where-Object { [decimal]$ic."Bucket$_" -ne ([decimal]$ib."Bucket$_" - [decimal]$ia."Bucket$_") }).Count -eq 0) "IC total=$($ic.Total)"
$cum = [decimal]0; foreach ($i in 1..11) { $cum += [decimal]$ic."Bucket$i" }
Check 'ID bucket 11 = sum of IC = ID total' ([decimal]$id.Bucket11 -eq $cum -and [decimal]$id.Total -eq $cum) "ID b11=$($id.Bucket11) total=$($id.Total)"
Check 'A1 bucket 11 = total = IA99 total' ([decimal]$a1.Bucket11 -eq [decimal]$ia.Total -and [decimal]$a1.Total -eq [decimal]$ia.Total) "A1 b11=$($a1.Bucket11)"
$ieBad = @(1..11 | Where-Object { $o = [decimal]$ia."Bucket$_"; $x = if ($o -gt 0) { [math]::Round([decimal]$ic."Bucket$_" / $o * 100, 2) } else { 0 }; [math]::Abs([decimal]$ie."Bucket$_" - $x) -gt 0.01 })
Check 'IE = IC / IA99 x 100 per bucket' ($ieBad.Count -eq 0) "diffBuckets=$($ieBad -join ',') total=$($ie.Total)"
$bad13 = All $qr "QuarterlyReport(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='13')/Set"
Check 'invalid month 13 -> no rows' ($bad13.Count -eq 0) "rows=$($bad13.Count)"

$wq = Writer $qr
try {
  $l0 = Req POST "$qr/$K/SAP__self.LockPeriod" '{}' $wq.ws $wq.tok
  Check 'Lock refused while not saved (024)' ($l0.s -ge 400 -and (Msg $l0) -match 'ALM 3 data .* is not saved') "HTTP $($l0.s) $(Msg $l0)"
  if ((Msg $l0) -notmatch 'ALM 3') { Say ("debug: " + ([string]$l0.b).Substring(0, [math]::Min(900, ([string]$l0.b).Length))) }
  # Each element in parentheses (L-619).
  function RowJson($r) { $f = @(('"GroupId":' + (ConvertTo-Json ([string]$r.GroupId))), ('"GroupName":' + (ConvertTo-Json ([string]$r.GroupName))))
    foreach ($i in 1..11) { $f += ('"Bucket{0}":{1}' -f $i, ([decimal]$r."Bucket$i").ToString([Globalization.CultureInfo]::InvariantCulture)) }
    $f += ('"Total":' + ([decimal]$r.Total).ToString([Globalization.CultureInfo]::InvariantCulture)); '{' + ($f -join ',') + '}' }
  function SaveBody([string[]]$items) { '{"RowsJson":' + (ConvertTo-Json ('[' + ($items -join ',') + ']')) + '}' }
  $allRows = @($rows | ForEach-Object { RowJson $_ })
  $e2 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody @($allRows + '{"GroupId":"SA:99:99:99:99","Total":1}')) $wq.ws $wq.tok
  Check 'Save refused with an ALM 2 group (002)' ($e2.s -ge 400 -and (Msg $e2) -match 'does not exist') "HTTP $($e2.s) $(Msg $e2)"
  $e1 = Req POST "$qr/$K/SAP__self.SaveSnapshot" '{"RowsJson":""}' $wq.ws $wq.tok
  Check 'Save refused without rows (003)' ($e1.s -ge 400 -and (Msg $e1) -match 'RowsJson is required') "HTTP $($e1.s) $(Msg $e1)"
  $expected = @($rows | Where-Object { [decimal]$_.Total -ne 0 }).Count
  $s1 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody $allRows) $wq.ws $wq.tok; $s1d = $s1.b | ConvertFrom-Json
  Check 'Save: snapshot rows = rows with a total' ($s1.s -eq 200 -and $s1d.Saved -and [int]$s1d.SavedRows -eq $expected) "HTTP $($s1.s) rows=$($s1d.SavedRows) expected=$expected $(Msg $s1)"
  $sql = "SELECT COUNT(*) AS CNT, SUM( ZBUC1 ) AS B1, SUM( ZNS_AMT ) AS B11 FROM /FS00/ALMTR016`nWHERE ZBUKRS = '$Bukrs' AND ZYEAR = '$Year' AND ZMONTH = '$Month'"
  $db = @(& (Join-Path $PSScriptRoot '..\adt-sql.ps1') -Sql $sql)
  $dbv = if ($db.Count -ge 2) { $db[1] -split "`t" } else { @() }
  $b1 = [decimal]0; $b11 = [decimal]0; foreach ($r in $rows) { if ([decimal]$r.Total -ne 0) { $b1 += [decimal]$r.Bucket1; $b11 += [decimal]$r.Bucket11 } }
  Check '/FS00/ALMTR016: rows, bucket 1 and ZNS_AMT (bucket 11) sums = the rows sent' ($dbv.Count -eq 3 -and [int]$dbv[0] -eq $expected -and [decimal]$dbv[1] -eq $b1 -and [decimal]$dbv[2] -eq $b11) "db=$($dbv -join '/') expected=$expected/$b1/$b11"
  $s2 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody $allRows) $wq.ws $wq.tok
  Check 'second Save refused (023)' ($s2.s -ge 400 -and (Msg $s2) -match 'ALM 3 data .* is already saved') "HTTP $($s2.s) $(Msg $s2)"
}
finally {
  $d1 = Req POST "$qr/$K/SAP__self.DeleteSnapshot" '{}' $wq.ws $wq.tok
  Check 'Delete (clean-up)' ($d1.s -eq 200 -or (Msg $d1) -match 'is not saved') "HTTP $($d1.s) $(Msg $d1)"
  $after = Req GET "$qr/$K"; $ad = $after.b | ConvertFrom-Json
  Check 'period afterwards: not saved, not locked' (-not $ad.Saved -and -not $ad.Locked) "saved=$($ad.Saved) locked=$($ad.Locked)"
  Done
}
