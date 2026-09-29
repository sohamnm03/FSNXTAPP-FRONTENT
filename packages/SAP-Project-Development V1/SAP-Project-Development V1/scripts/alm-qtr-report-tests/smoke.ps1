# Smoke test for ZFS_SB_ALMQTRRPT_O4_API (DS4_100_TFSIN): QuarterlyReport + QuarterlyPeriod.
# Checks the report against its sources (TRM API, manual data API) and its own totals, then
# Save -> Save again (refused) -> Delete on the period. Lock is NOT run: it cannot be undone through the API.
# A temporary manual amount (AA:02:03:00:00, bucket 2) is keyed in and removed again, only if that key is free (L-608).
# Password: $env:SAP_DS4_100_TFSIN_PASSWORD.
param([string]$Bukrs = '1000', [string]$Year = '2026', [string]$Month = '09', [string]$OutFile)
$ErrorActionPreference = 'Stop'
$H = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$script:log = New-Object System.Collections.Generic.List[string]; $script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Output $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) { if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }; Say ("[{0}] {1} {2}" -f $tag, $Name, $Note) }
function Svc([string]$name, [string]$def) { "$H/sap/opu/odata4/sap/$name/srvd_a2x/sap/$def/0001" }
$qr  = Svc 'zfs_sb_almqtrrpt_o4_api' 'zfs_sd_almqtrrpt'
$trm = Svc 'zfs_sb_almtrmrepay_o4_api' 'zfs_sd_almtrmrepay'
$md  = Svc 'zfs_sb_almmanual_o4_api' 'zfs_sd_almmanual'

# One request; writes pass a session that holds the CSRF token.
function Req([string]$Method, [string]$Url, [string]$Body, $Session, [string]$Token, [hashtable]$Extra = @{}) {
  $sep = if ($Url.Contains('?')) { '&' } else { '?' }
  $h = @{ Authorization = $auth; Accept = 'application/json' }
  if ($Token) { $h['X-CSRF-Token'] = $Token }
  foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
  $p = @{ Method = $Method; Uri = "$Url${sep}sap-client=100"; Headers = $h; UseBasicParsing = $true; TimeoutSec = 300 }
  if ($Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes($Body); $p.ContentType = 'application/json' }
  if ($Session) { $p.WebSession = $Session }
  try { $r = Invoke-WebRequest @p; return @{ s = [int]$r.StatusCode; b = $r.Content } }
  catch {
    $resp = $_.Exception.Response
    # PowerShell 5.1 has usually consumed the error stream already; the body is then in ErrorDetails.
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
# All rows of a collection, following @odata.nextLink (relative to the service root).
function All([string]$Root, [string]$Path) {
  $out = New-Object System.Collections.Generic.List[object]; $u = "$Root/$Path`?`$top=5000"
  while ($u) {
    $r = Req GET $u; if ($r.s -ne 200) { throw "GET $u -> $($r.s) $($r.b)" }
    $d = $r.b | ConvertFrom-Json; foreach ($v in $d.value) { $out.Add($v) }
    $u = if ($d.'@odata.nextLink') { "$Root/" + (($d.'@odata.nextLink' -replace '([?&])sap-client=\d+&?', '$1') -replace '[?&]$', '') } else { $null }
  }
  return ,$out.ToArray()
}
$Bk = 1..7 | ForEach-Object { "Bucket$_" }
function Sum7($r) { $s = [decimal]0; foreach ($b in $Bk) { $s += [decimal]$r.$b }; return $s }
$P = "(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='$Month')/Set"
$K = "QuarterlyPeriod(CompanyCode='$Bukrs',FiscalYear='$Year',FiscalPeriod='$Month')"

$m = Req GET "$qr/`$metadata" $null $null $null @{ Accept = 'application/xml' }
Check '$metadata' ($m.s -eq 200 -and $m.b -match 'EntitySet Name="QuarterlyReport"' -and $m.b -match 'EntitySet Name="QuarterlyPeriod"' -and $m.b -match 'Action Name="SaveSnapshot"') "HTTP $($m.s)"

# Temporary manual amount, so source 92 has something to show. Only on a free key, and removed only if created here (L-608).
$MKEY = "Alm1ManualData(CompanyCode='$Bukrs',FiscalYear='$Year',FiscalPeriod='$Month',GroupId='AA:02:03:00:00',Bucket='2')"
$pre = Req GET "$md/$MKEY"
if ($pre.s -ne 404) { Say "ABORT: $MKEY is not free (HTTP $($pre.s)); nothing was changed"; if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }; exit 1 }
$w = Writer $md
$mRow = '{"CompanyCode":"' + $Bukrs + '","FiscalYear":"' + $Year + '","FiscalPeriod":"' + $Month + '","GroupId":"AA:02:03:00:00","Bucket":"2","Amount":1234.5}'
$c = Req POST "$md/Alm1ManualData" $mRow $w.ws $w.tok
$created = $c.s -eq 201
Check 'temporary manual amount keyed in (free key)' $created "HTTP $($c.s) $(Msg $c)"
if (-not $created) { Say 'ABORT: setup failed; nothing to clean up'; if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }; exit 1 }

$sw = [Diagnostics.Stopwatch]::StartNew(); $rows = All $qr "QuarterlyReport$P"; $sw.Stop()
$grp = @{}; foreach ($r in $rows) { $grp[$r.GroupId] = $r }
Check 'report: one row per ALM 1 group' ($rows.Count -eq 147) "rows=$($rows.Count) in $([int]$sw.Elapsed.TotalSeconds)s"
$bad = @($rows | Where-Object { $_.RowStyle -ne 'CUMULATIVE' -and $_.RowStyle -ne 'PERCENT' -and [decimal]$_.Total -ne (Sum7 $_) })
Check 'report: Total = Bucket1..7 (except cumulative / percent rows)' ($bad.Count -eq 0) "mismatches=$($bad.Count)"

Check 'manual: AA:02:03:00:00 bucket 2 = 1234.50 (from ZFS_T_ALM_MANUAL)' ([decimal]$grp['AA:02:03:00:00'].Bucket2 -eq 1234.5) "b2=$($grp['AA:02:03:00:00'].Bucket2)"
$l1 = $grp['AA:02:00:00:00']
$kids = [decimal]0; foreach ($r in $rows) { if ($r.GroupId -like 'AA:02:*' -and $r.GroupId -ne 'AA:02:00:00:00' -and $r.GroupId.Substring(9, 5) -eq '00:00') { $kids += [decimal]$r.Bucket2 } }
Check 'level total: AA:02:00:00:00 bucket 2 = sum of its children' ([decimal]$l1.Bucket2 -eq $kids) "b2=$($l1.Bucket2) children=$kids"

# TRM groups without children in the report: amount = TRM API rows of that source type and the group's product types.
function Children($g) {
  $id = $g.GroupId; if ($id.Length -lt 14) { return 0 }
  $n = if ($id.Substring(12, 2) -ne '00') { 0 } elseif ($id.Substring(9, 2) -ne '00') { 12 } elseif ($id.Substring(6, 2) -ne '00') { 9 } else { 6 }
  if (-not $n) { return 0 }
  return @($rows | Where-Object { $_.GroupId -ne $id -and $_.GroupId.Length -ge 14 -and $_.GroupId.Substring(0, $n) -eq $id.Substring(0, $n) }).Count
}
$trmRows = All $trm "TrmRepaymentCashflow$P"
$leaf = @($rows | Where-Object { $_.Source -in '09','10','11','12' -and (Children $_) -eq 0 })
$trmBad = @()
foreach ($g in $leaf) {
  $prd = @(($g.Product -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $exp = [decimal]0
  foreach ($t in $trmRows) { if ($t.SourceType -eq $g.Source -and (-not $prd.Count -or $prd -contains $t.ProductType)) { $exp += [decimal]$t.Total } }
  if ([decimal]$g.Total -ne $exp) { $trmBad += "$($g.GroupId): report=$($g.Total) trm=$exp" }
}
$trmSum = [decimal]0; foreach ($g in $leaf) { $trmSum += [decimal]$g.Total }
Check "TRM: $($leaf.Count) TRM groups = TRM API (source type + product types)" ($trmBad.Count -eq 0 -and $leaf.Count -gt 0) "total=$trmSum $($trmBad -join '; ')"

$aa = $grp['AA:99:99:99:99']; $ab = $grp['AB:99:99:99:99']
$sumAA = [decimal]0; foreach ($r in $rows) { if ($r.GroupId -like 'AA:*' -and $r.GroupId.Length -ge 14 -and $r.GroupId.Substring(6, 8) -eq '00:00:00') { $sumAA += [decimal]$r.Total } }
Check 'subtotal: AA:99:99:99:99 = sum of AA level-1 rows' ($aa -and [decimal]$aa.Total -eq $sumAA) "aa99=$($aa.Total) sum=$sumAA"
$ac = $rows | Where-Object { $_.RowStyle -eq 'MISMATCH' } | Select-Object -First 1
$ad = $rows | Where-Object { $_.RowStyle -eq 'CUMULATIVE' } | Select-Object -First 1
$ae = $rows | Where-Object { $_.RowStyle -eq 'PERCENT' } | Select-Object -First 1
Check 'AC mismatch = AB99 - AA99' ($ac -and [decimal]$ac.Total -eq ([decimal]$ab.Total - [decimal]$aa.Total)) "ac=$($ac.GroupId) $($ac.Total)"
Check 'AD cumulative: bucket 7 = sum of AC buckets = its total' ($ad -and [decimal]$ad.Bucket7 -eq (Sum7 $ac) -and [decimal]$ad.Total -eq [decimal]$ad.Bucket7) "ad7=$($ad.Bucket7)"
$pct = if ([decimal]$aa.Total) { [Math]::Round([decimal]$ac.Total / [decimal]$aa.Total * 100, 2) } else { 0 }
Check 'AE percent = AC / AA99 x 100' ($ae -and [Math]::Abs([decimal]$ae.Total - $pct) -le 0.01) "ae=$($ae.Total) expected=$pct"

# Period status and Save / Delete. Lock is not run.
$st = Req GET "$qr/$K"; $stj = $st.b | ConvertFrom-Json
Check 'period: not saved, not locked, key date' ($st.s -eq 200 -and -not $stj.Saved -and -not $stj.Locked -and $stj.KeyDate -eq '2026-10-01') "HTTP $($st.s) saved=$($stj.Saved) locked=$($stj.Locked) key=$($stj.KeyDate)"
$w = Writer $qr
$lk = Req POST "$qr/$K/SAP__self.LockPeriod" '{}' $w.ws $w.tok
Check 'lock refused while not saved (012)' ($lk.s -ge 400 -and $lk.b -match 'is not saved') "HTTP $($lk.s) $(Msg $lk)"
$nonZero = @($rows | Where-Object { [decimal]$_.Total -ne 0 }).Count
$w = Writer $qr
$sv = Req POST "$qr/$K/SAP__self.SaveSnapshot" '{}' $w.ws $w.tok
$svj = try { $sv.b | ConvertFrom-Json } catch { $null }
Check 'save snapshot' ($sv.s -eq 200 -and $svj.Saved -and [int]$svj.SavedRows -eq $nonZero) "HTTP $($sv.s) savedRows=$($svj.SavedRows) nonZeroRows=$nonZero $(Msg $sv)"
$st2 = (Req GET "$qr/$K").b | ConvertFrom-Json
Check 'period read back: saved' ($st2.Saved -and [int]$st2.SavedRows -eq $nonZero) "savedRows=$($st2.SavedRows) by=$($st2.SavedBy)"
$w = Writer $qr
$sv2 = Req POST "$qr/$K/SAP__self.SaveSnapshot" '{}' $w.ws $w.tok
Check 'second save refused (011)' ($sv2.s -ge 400 -and $sv2.b -match 'already saved') "HTTP $($sv2.s) $(Msg $sv2)"
$w = Writer $qr
$dl = Req POST "$qr/$K/SAP__self.DeleteSnapshot" '{}' $w.ws $w.tok
Check 'delete snapshot' ($dl.s -eq 200) "HTTP $($dl.s) $(Msg $dl)"
$st3 = (Req GET "$qr/$K").b | ConvertFrom-Json
Check 'period read back: not saved' (-not $st3.Saved -and [int]$st3.SavedRows -eq 0) "saved=$($st3.Saved)"
Check 'invalid month -> no report rows' ((All $qr "QuarterlyReport(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='13')/Set").Count -eq 0) ''

# Clean-up of the temporary manual amount (created in this run, see above).
$w = Writer $md
$d = Req DELETE "$md/$MKEY" $null $w.ws $w.tok @{ 'If-Match' = '*' }
Check 'temporary manual amount removed' ($d.s -eq 204) "HTTP $($d.s) $(Msg $d)"

Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
