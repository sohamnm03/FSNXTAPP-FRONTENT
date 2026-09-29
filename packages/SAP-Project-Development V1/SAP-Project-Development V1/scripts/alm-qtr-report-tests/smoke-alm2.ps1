# Smoke test for ZFS_SB_ALMQTR2RPT_O4_API (DS4_100_TFSIN): QuarterlyReport + QuarterlyPeriod of the ALM 2 quarterly report.
# Checks the report against its sources (TRM principal O/S and accrual APIs, ALM 2 manual data API) and its own totals and
# computed rows, then Lock refused (not saved) -> Save -> Save again (refused) -> Delete. Lock itself is NOT run: nothing in
# the API can remove the /FS00/ALMTR012 row it writes.
# A temporary ALM 2 manual amount (SB:11:01:00:00, bucket 3) is keyed in and removed again, only if that key is free (L-608).
# Password: $env:SAP_DS4_100_TFSIN_PASSWORD.
param([string]$Bukrs = '1000', [string]$Year = '2026', [string]$Month = '09', [string]$OutFile)
$ErrorActionPreference = 'Stop'
$H = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$script:log = New-Object System.Collections.Generic.List[string]; $script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Host $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) { if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }; Say ("[{0}] {1} {2}" -f $tag, $Name, $Note) }
function Done { Say "RESULT: $script:pass passed, $script:fail failed"; if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 } }
function Svc([string]$name, [string]$def) { "$H/sap/opu/odata4/sap/$name/srvd_a2x/sap/$def/0001" }
$qr  = Svc 'zfs_sb_almqtr2rpt_o4_api' 'zfs_sd_almqtr2rpt'
$trm = Svc 'zfs_sb_almtrmdata_o4_api' 'zfs_sd_almtrmdata'
$md  = Svc 'zfs_sb_almmanual_o4_api' 'zfs_sd_almmanual'

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
function Sum10($r) { $s = [decimal]0; foreach ($i in 1..10) { $s += [decimal]$r."Bucket$i" }; return $s }
function In($v, [string]$list) { $l = @($list -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }); return ($l.Count -eq 0 -or $l -contains $v) }
# Expected |per-bucket sum| of feeder rows (bucket names BucketNN) matching a group's product / transaction-type lists.
function Expect($feed, $g) {
  $e = @{}; foreach ($i in 1..10) { $e[$i] = [decimal]0 }
  foreach ($f in $feed) { if ((In $f.ProductType $g.Product) -and (In $f.TransactionType $g.TransactionType)) { foreach ($i in 1..10) { $e[$i] += [decimal]$f.('Bucket{0:D2}' -f $i) } } }
  foreach ($i in 1..10) { $e[$i] = [math]::Abs($e[$i]) }; return $e
}
$P = "(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='$Month')/Set"
$K = "QuarterlyPeriod(CompanyCode='$Bukrs',FiscalYear='$Year',FiscalPeriod='$Month')"

$m = Req GET "$qr/`$metadata" $null $null $null @{ Accept = 'application/xml' }
Check '$metadata' ($m.s -eq 200 -and $m.b -match 'EntitySet Name="QuarterlyReport"' -and $m.b -match 'EntitySet Name="QuarterlyPeriod"' -and $m.b -match 'Action Name="LockPeriod"' -and $m.b -match 'Bucket10') "HTTP $($m.s)"

$per = Req GET "$qr/$K"; $pd = $per.b | ConvertFrom-Json
Check 'period: not saved, not locked, key date = month end + 1' ($per.s -eq 200 -and -not $pd.Saved -and -not $pd.Locked -and $pd.KeyDate -eq '2026-10-01') "HTTP $($per.s) saved=$($pd.Saved) locked=$($pd.Locked) key=$($pd.KeyDate)"

# Temporary ALM 2 manual amount, only on a free key, removed only if created here (L-608).
$MKEY = "Alm2ManualData(CompanyCode='$Bukrs',FiscalYear='$Year',FiscalPeriod='$Month',GroupId='SB:11:01:00:00',Bucket='3')"
$pre = Req GET "$md/$MKEY"
if ($pre.s -ne 404) { Say "ABORT: $MKEY is not free (HTTP $($pre.s)); nothing was changed"; Done; exit 1 }
$w = Writer $md
$mRow = '{"CompanyCode":"' + $Bukrs + '","FiscalYear":"' + $Year + '","FiscalPeriod":"' + $Month + '","GroupId":"SB:11:01:00:00","Bucket":"3","Amount":4321.25}'
$c = Req POST "$md/Alm2ManualData" $mRow $w.ws $w.tok
$created = $c.s -eq 201
Check 'temporary ALM 2 manual amount keyed in (free key)' $created "HTTP $($c.s) $(Msg $c)"
if (-not $created) { Say 'ABORT: setup failed; nothing to clean up'; Done; exit 1 }

try {
  $sw = [Diagnostics.Stopwatch]::StartNew(); $rows = All $qr "QuarterlyReport$P"; $sw.Stop()
  $grp = @{}; foreach ($r in $rows) { $grp[$r.GroupId] = $r }
  Check 'report: 183 groups + 5 computed rows' ($rows.Count -eq 188) "rows=$($rows.Count) in $([int]$sw.Elapsed.TotalSeconds)s"
  $bad = @($rows | Where-Object { $_.RowStyle -ne 'CUMULATIVE' -and $_.RowStyle -ne 'PERCENT' -and [decimal]$_.Total -ne (Sum10 $_) })
  Check 'report: Total = Bucket1..10 (except cumulative / percent rows)' ($bad.Count -eq 0) "mismatches=$($bad.Count) $(($bad | Select-Object -First 3 | ForEach-Object { $_.GroupId }) -join ',')"
  $neg = @($rows | Where-Object { $_.RowStyle -notin @('MISMATCH','CUMULATIVE','PERCENT') -and -not $_.Negative } | Where-Object { $x = $_; @(1..10 | Where-Object { [decimal]$x."Bucket$_" -lt 0 }).Count -gt 0 })
  Say "info: rows with a negative bucket outside computed rows = $($neg.Count) (only possible through ZNEG children)"

  Check 'manual: SB:11:01:00:00 bucket 3 = 4321.25 (ZFS_T_ALM2_MAN)' ([decimal]$grp['SB:11:01:00:00'].Bucket3 -eq 4321.25) "b3=$($grp['SB:11:01:00:00'].Bucket3)"

  # Source 11 against the TRM principal O/S API, source 64 against the accrual API.
  $prin = All $trm "TrmPrincipalOutstanding$P"; $accr = All $trm "TrmAccrualCashflow$P"
  foreach ($g in @($rows | Where-Object { $_.Source -eq '11' -or $_.Source -eq '64' })) {
    $feed = if ($g.Source -eq '11') { $prin } else { $accr }
    $e = Expect $feed $g; $diff = @(1..10 | Where-Object { [decimal]$g."Bucket$_" -ne $e[$_] })
    Check "source $($g.Source): $($g.GroupId) ($($g.Product)/$($g.TransactionType)) = TRM API" ($diff.Count -eq 0) "total=$($g.Total) diffBuckets=$($diff -join ',')"
  }

  $sa = $grp['SA:99:99:99:99']; $sb = $grp['SB:99:99:99:99']
  foreach ($pfx in 'SA', 'SB') {
    $sub = $grp["${pfx}:99:99:99:99"]; $sum = [decimal]0
    foreach ($r in $rows) { if ($r.GroupId.Length -ge 14 -and $r.GroupId.StartsWith($pfx) -and $r.GroupId.Substring(6, 8) -eq '00:00:00') { $sum += [decimal]$r.Total } }
    Check "subtotal: ${pfx}:99:99:99:99 = sum of its level-1 rows" ([decimal]$sub.Total -eq $sum) "total=$($sub.Total) level1=$sum"
  }
  $sc = $grp['SC']; $sd = $grp['SD']; $se = $grp['SE']; $a1 = $grp['SA:99:99:99:99_A1']
  $scOk = @(1..10 | Where-Object { [decimal]$sc."Bucket$_" -ne ([decimal]$sb."Bucket$_" - [decimal]$sa."Bucket$_") }).Count -eq 0
  Check 'SC = SB99 - SA99 per bucket' $scOk "SC total=$($sc.Total)"
  $cum = [decimal]0; foreach ($i in 1..10) { $cum += [decimal]$sc."Bucket$i" }
  Check 'SD bucket 10 = sum of SC = SD total (fix Q6)' ([decimal]$sd.Bucket10 -eq $cum -and [decimal]$sd.Total -eq $cum) "SD b10=$($sd.Bucket10) total=$($sd.Total) sumSC=$cum"
  $cumA = [decimal]0; foreach ($i in 1..10) { $cumA += [decimal]$sa."Bucket$i" }
  Check 'A1 cumulative outflows: bucket 10 = total = SA99 total' ([decimal]$a1.Bucket10 -eq $cumA -and [decimal]$a1.Total -eq $cumA) "A1 b10=$($a1.Bucket10)"
  $seBad = @(1..10 | Where-Object { $o = [decimal]$sa."Bucket$_"; $x = if ($o -gt 0) { [math]::Round([decimal]$sc."Bucket$_" / $o * 100, 2) } else { 0 }; [math]::Abs([decimal]$se."Bucket$_" - $x) -gt 0.01 })
  Check 'SE = SC / SA99 x 100 per bucket (0 where SA99 <= 0)' ($seBad.Count -eq 0) "diffBuckets=$($seBad -join ',') total=$($se.Total)"
  $inc = @($rows | Where-Object { $_.SourceIncomplete }); Say "info: SourceIncomplete rows = $($inc.Count) $(($inc | ForEach-Object { $_.GroupId }) -join ',')"
  $inv = $grp['SB:04:02:01:00']; Say "info: source 09 SB:04:02:01:00 total = $($inv.Total); 59/60 totals = $($grp['SA:07:05:00:00'].Total)/$($grp['SA:07:06:00:00'].Total); TB groups with source 99 = $(@($rows | Where-Object { $_.Source -eq '99' }).Count)"

  $bad13 = All $qr "QuarterlyReport(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='13')/Set"
  Check 'invalid month 13 -> no rows' ($bad13.Count -eq 0) "rows=$($bad13.Count)"

  # Period actions.
  $wq = Writer $qr
  $l0 = Req POST "$qr/$K/SAP__self.LockPeriod" '{}' $wq.ws $wq.tok
  Check 'Lock refused while not saved (018)' ($l0.s -ge 400 -and (Msg $l0) -match 'ALM 2 data .* is not saved') "HTTP $($l0.s) $(Msg $l0)"
  # SaveSnapshot takes the report rows (L-618): a JSON array in RowsJson, built by hand (L-315), amounts as numbers (L-244).
  # Each element in parentheses: in PowerShell the comma binds tighter than +.
  function RowJson($r) { $f = @(('"GroupId":' + (ConvertTo-Json ([string]$r.GroupId))), ('"GroupName":' + (ConvertTo-Json ([string]$r.GroupName))))
    foreach ($i in 1..10) { $f += ('"Bucket{0}":{1}' -f $i, ([decimal]$r."Bucket$i").ToString([Globalization.CultureInfo]::InvariantCulture)) }
    $f += ('"Total":' + ([decimal]$r.Total).ToString([Globalization.CultureInfo]::InvariantCulture)); '{' + ($f -join ',') + '}' }
  function SaveBody([string[]]$items) { '{"RowsJson":' + (ConvertTo-Json ('[' + ($items -join ',') + ']')) + '}' }
  $allRows = @($rows | ForEach-Object { RowJson $_ })
  $e1 = Req POST "$qr/$K/SAP__self.SaveSnapshot" '{"RowsJson":""}' $wq.ws $wq.tok
  Check 'Save refused without rows (003 RowsJson)' ($e1.s -ge 400 -and (Msg $e1) -match 'RowsJson is required') "HTTP $($e1.s) $(Msg $e1)"
  $e2 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody @($allRows + '{"GroupId":"XX:99","Total":1}')) $wq.ws $wq.tok
  Check 'Save refused with an unknown group (002)' ($e2.s -ge 400 -and (Msg $e2) -match 'GroupId XX:99 does not exist') "HTTP $($e2.s) $(Msg $e2)"
  $e3 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody @($allRows + $allRows[0])) $wq.ws $wq.tok
  Check 'Save refused with a duplicate group (001)' ($e3.s -ge 400 -and (Msg $e3) -match 'already exists') "HTTP $($e3.s) $(Msg $e3)"
  $expected = @($rows | Where-Object { [decimal]$_.Total -ne 0 }).Count
  $s1 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody $allRows) $wq.ws $wq.tok; $s1d = $s1.b | ConvertFrom-Json
  Check 'Save: snapshot rows = rows with a total' ($s1.s -eq 200 -and $s1d.Saved -and [int]$s1d.SavedRows -eq $expected) "HTTP $($s1.s) rows=$($s1d.SavedRows) expected=$expected $(Msg $s1)"
  # What was stored, read back from /FS00/ALMTR015 through the ADT data preview.
  $sql = "SELECT COUNT(*) AS CNT, SUM( ZBUC1 ) AS B1, SUM( BUC10 ) AS B10 FROM /FS00/ALMTR015`nWHERE ZBUKRS = '$Bukrs' AND ZYEAR = '$Year' AND ZMONTH = '$Month'"
  $db = @(& (Join-Path $PSScriptRoot '..\adt-sql.ps1') -Sql $sql)
  $dbv = if ($db.Count -ge 2) { $db[1] -split "`t" } else { @() }
  $b1 = [decimal]0; $b10 = [decimal]0; foreach ($r in $rows) { if ([decimal]$r.Total -ne 0) { $b1 += [decimal]$r.Bucket1; $b10 += [decimal]$r.Bucket10 } }
  Check '/FS00/ALMTR015: rows, bucket 1 and bucket 10 sums = the report rows sent' ($dbv.Count -eq 3 -and [int]$dbv[0] -eq $expected -and [decimal]$dbv[1] -eq $b1 -and [decimal]$dbv[2] -eq $b10) "db=$($dbv -join '/') expected=$expected/$b1/$b10"
  $s2 = Req POST "$qr/$K/SAP__self.SaveSnapshot" (SaveBody $allRows) $wq.ws $wq.tok
  Check 'second Save refused (017)' ($s2.s -ge 400 -and (Msg $s2) -match 'ALM 2 data .* is already saved') "HTTP $($s2.s) $(Msg $s2)"
  $d1 = Req POST "$qr/$K/SAP__self.DeleteSnapshot" '{}' $wq.ws $wq.tok; $d1d = $d1.b | ConvertFrom-Json
  Check 'Delete: period no longer saved' ($d1.s -eq 200 -and -not $d1d.Saved) "HTTP $($d1.s) $(Msg $d1)"
  $d2 = Req POST "$qr/$K/SAP__self.DeleteSnapshot" '{}' $wq.ws $wq.tok
  Check 'second Delete refused (018)' ($d2.s -ge 400 -and (Msg $d2) -match 'is not saved') "HTTP $($d2.s) $(Msg $d2)"
}
finally {
  $w = Writer $md
  $del = Req DELETE "$md/$MKEY" $null $w.ws $w.tok @{ 'If-Match' = '*' }
  Check 'temporary manual amount removed' ($del.s -eq 204) "HTTP $($del.s) $(Msg $del)"
  $after = Req GET "$qr/$K"; $ad = $after.b | ConvertFrom-Json
  Check 'period afterwards: not saved, not locked' (-not $ad.Saved -and -not $ad.Locked) "saved=$($ad.Saved) locked=$($ad.Locked)"
  Done
}
