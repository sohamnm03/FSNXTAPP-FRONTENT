# ALM application end-to-end check for Trial Balance Data (ALM 2 / ALM 3 folders), service ZFS_SB_ALMTBDATA_O4_API:
# GL Account Details (GlAccount, R009), GL Account Balance Details (GlAccountBalance, R010), GL Mapping Update - Manual
# (R016) and GL Mapping Upload (R011) on GlMapping (/FS00/ALMTR018).
# Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP), signs in with the demo
# account from that .env and uses only the app's own API. Reads are checked against the figures of the TB smoke oracle.
# The ONLY SAP writes: one GlMapping row for G/L account $TestGl, which must not exist before the run (guard, L-608); it is
# created manually, changed and deleted, then created, changed and left unchanged by one-row uploads, and deleted again.
# Every negative check asserts the expected message (L-610); amounts are compared as decimals. Stops the instance; never 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8098,
  [string]$TestGl = '0010000002',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Host $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note); return $Ok
}
# Expected figures for company code 1000 (DS4_100_TFSIN, tb-smoke-run-3.txt oracle).
$expAccounts = 1121; $expBs = 630; $expNonZero = 208; $expMapped = 656; $expMapRows = 660
$expBalance = [decimal]'-23619472061.65'

$envFile = @{}
Get-Content (Join-Path $App '.env') | Where-Object { $_ -match '^\s*([A-Z_0-9]+)=(.*)$' } | ForEach-Object { $envFile[$Matches[1]] = $Matches[2].Trim('"') }
$user = if ($envFile['DEMO_USER']) { $envFile['DEMO_USER'] } else { 'demo' }
if (-not $envFile['SAP_TBDATA_URL']) { Say 'ABORT: SAP_TBDATA_URL is not set in the app .env'; exit 1 }

$env:PORT = "$Port"
$env:APP_ORIGINS = "http://localhost:$Port,http://127.0.0.1:$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $App -PassThru -WindowStyle Hidden
$created = $false
try {
  $base = "http://127.0.0.1:$Port"
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) { try { Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { if ($_.Exception.Response) { $up = $true } else { Start-Sleep -Milliseconds 500 } } }
  $null = Check 'temporary app instance up' $up "port $Port"
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $hdrs = @{ Origin = $base; 'x-alm-request' = '1' }
  $body = @{ username = $user; password = $envFile['DEMO_PASSWORD'] } | ConvertTo-Json
  $r = Invoke-RestMethod "$base/api/session" -Method Post -Body $body -ContentType 'application/json' -WebSession $s -Headers $hdrs
  $null = Check 'sign in' ($null -ne $r.username) "user=$($r.username)"

  # Bodies are built by hand: PowerShell 5.1 ConvertTo-Json collapses a one-element array (L-315).
  function Call([string]$Method, [string]$Path, [string]$Json) {
    $p = @{ Uri = "$base/api$Path"; Method = $Method; WebSession = $s; Headers = $hdrs; TimeoutSec = 300 }
    if ($Json) { $p.Body = [Text.Encoding]::UTF8.GetBytes($Json); $p.ContentType = 'application/json' }
    try { return @{ ok = $true; data = Invoke-RestMethod @p } }
    catch {
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      $err = $null; try { $err = ($msg | ConvertFrom-Json).error } catch {}
      return @{ ok = $false; data = $msg; message = $(if ($err) { [string]$err.message } else { $msg }); details = $(if ($err) { @($err.details) } else { @() }) }
    }
  }
  function Mapping() { Call GET '/glmapping' $null }
  function RowOf($view, [string]$gl) { @($view.data.tables.mapping | Where-Object { $_.glAccount -eq $gl })[0] }
  function Rows([string]$json) { '{"rows":[' + $json + ']}' }
  $sumDec = { param($rows) $t = [decimal]0; foreach ($x in $rows) { $t += [decimal]$x.balance }; $t }

  # ---- GL Account Details (R009) ----
  $a = Call GET '/tbdata/accounts' $null
  $null = Check 'accounts setup: odata mode, company 1000 offered' ($a.ok -and $a.data.mode -eq 'odata' -and (@($a.data.companies | ForEach-Object { $_.code }) -contains '1000')) "mode=$($a.data.mode) service=$($a.data.service) companies=$(@($a.data.companies).Count)"
  $a = Call GET '/tbdata/accounts?bukrs=1000' $null
  $one = @($a.data.rows | Where-Object { $_.glAccount -eq '0010200001' })[0]
  $null = Check 'accounts: all G/L accounts of 1000' ($a.ok -and @($a.data.rows).Count -eq $expAccounts) "rows=$(@($a.data.rows).Count) expected=$expAccounts"
  $null = Check 'accounts: keys padded, fields mapped' ($one -and $one.chartOfAccounts -eq '1000' -and $one.currency -eq 'INR' -and $one.balanceSheet -eq $true -and $one.creationDate) "0010200001 chart=$($one.chartOfAccounts) '$($one.glAccountLongName)' created=$($one.creationDate) by=$($one.createdBy) blockedCoCd=$($one.blockedPostingCoCode)"
  $a = Call GET '/tbdata/accounts?bukrs=1000&bs=1' $null
  $null = Check 'accounts: balance sheet only' ($a.ok -and @($a.data.rows).Count -eq $expBs) "rows=$(@($a.data.rows).Count) expected=$expBs"
  $d = Call GET '/tbdata/accounts?bukrs=1000&from=2025-07-01&to=2025-07-31' $null
  $inRange = @($d.data.rows | Where-Object { $_.creationDate -lt '2025-07-01' -or $_.creationDate -gt '2025-07-31' }).Count
  $null = Check 'accounts: creation date range' ($d.ok -and @($d.data.rows).Count -gt 0 -and @($d.data.rows).Count -lt $expAccounts -and $inRange -eq 0) "rows=$(@($d.data.rows).Count) outside range=$inRange"
  $bad = Call GET '/tbdata/accounts?bukrs=1000&from=2025-02-30' $null
  $null = Check 'accounts: invalid date refused' (-not $bad.ok -and $bad.message -eq 'Enter the created-from date as a date (YYYY-MM-DD).') "=> $($bad.message)"

  # ---- GL Account Balance Details (R010) ----
  $b = Call GET '/tbdata/balances' $null
  $null = Check 'balances setup: groups and sources for the selection' ($b.ok -and @($b.data.alm2Groups).Count -gt 0 -and @($b.data.alm3Groups).Count -gt 0 -and (@($b.data.sources | ForEach-Object { $_.CODE }) -contains '99')) "alm2=$(@($b.data.alm2Groups).Count) alm3=$(@($b.data.alm3Groups).Count) sources=$(@($b.data.sources).Count)"
  $b = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09&zero=1' $null
  $all = @($b.data.rows)
  $one = @($all | Where-Object { $_.glAccount -eq '0010200001' })[0]
  $null = Check 'balances with zero: every account, key date month end' ($b.ok -and $all.Count -eq $expAccounts -and $b.data.keyDate -eq '2026-09-30' -and $b.data.currency -eq 'INR') "rows=$($all.Count) keyDate=$($b.data.keyDate) currency=$($b.data.currency)"
  $null = Check 'balances: 0010200001 as a decimal' ($one -and [decimal]$one.balance -eq $expBalance) "balance=$([decimal]$one.balance) ($($one.balance.GetType().Name)) expected=$expBalance fiscal=$($one.fiscalYear)/$($one.fiscalPeriod)"
  $sum = & $sumDec $all
  $null = Check 'balances: trial balance sums to zero (decimal)' ($sum -eq 0) "sum=$sum"
  $nz = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09' $null
  $zeroLeft = @($nz.data.rows | Where-Object { [decimal]$_.balance -eq 0 }).Count
  $null = Check 'balances: zero balances left out (Balance ne 0 with its currency)' ($nz.ok -and @($nz.data.rows).Count -eq $expNonZero -and $zeroLeft -eq 0) "rows=$(@($nz.data.rows).Count) expected=$expNonZero zero rows=$zeroLeft $(if (-not $nz.ok) { $nz.message })"
  $null = Check 'balances: non-zero rows sum to zero too' ((& $sumDec $nz.data.rows) -eq 0) "sum=$(& $sumDec $nz.data.rows)"
  $m = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09&zero=1&mapped=1' $null
  $null = Check 'balances: mapped accounts only' ($m.ok -and @($m.data.rows).Count -eq $expMapped -and @($m.data.rows | Where-Object { -not $_.mapped }).Count -eq 0) "rows=$(@($m.data.rows).Count) expected=$expMapped"
  $g = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09&zero=1&alm2=SA:07:01:00:00' $null
  $sr = @($g.data.rows | Where-Object { $_.glAccount -eq '0020306017' })[0]
  $null = Check 'balances: ALM 2 group filter, mapping texts, padded bucket' ($g.ok -and @($g.data.rows).Count -gt 0 -and @($g.data.rows | Where-Object { $_.alm2GroupId -ne 'SA:07:01:00:00' }).Count -eq 0 -and $sr.bucket -eq '01' -and $sr.sourceDesc -eq 'Trial Balance Data') "rows=$(@($g.data.rows).Count) 0020306017 bucket=$($sr.bucket) '$($sr.bucketDesc)' source=$($sr.source) '$($sr.sourceDesc)'"
  $src = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09&zero=1&sources=SA' $null
  $null = Check 'balances: source filter (legacy rows carry SA as source)' ($src.ok -and @($src.data.rows).Count -gt 0 -and @($src.data.rows | Where-Object { $_.source -ne 'SA' }).Count -eq 0) "rows=$(@($src.data.rows).Count)"
  $bs = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=09&zero=1&bs=1' $null
  $null = Check 'balances: balance sheet only' ($bs.ok -and @($bs.data.rows).Count -eq $expBs) "rows=$(@($bs.data.rows).Count) expected=$expBs"
  $bad = Call GET '/tbdata/balances?bukrs=1000&year=2026&month=13' $null
  $null = Check 'balances: month 13 refused' (-not $bad.ok -and $bad.message -eq 'Select a month from 01 to 12.') "=> $($bad.message)"

  # ---- GL Mapping: read, guard ----
  $v = Mapping
  $start = @($v.data.tables.mapping).Count
  $legacy = RowOf $v '0010000001'
  $swapped = @($v.data.tables.mapping | Where-Object { $_.source -eq 'SA' }).Count
  $null = Check 'mapping view: odata, all rows, keys padded' ($v.ok -and $v.data.mode -eq 'odata' -and $start -eq $expMapRows -and @($v.data.tables.mapping | Where-Object { $_.glAccount -notmatch '^\d{10}$' }).Count -eq 0) "rows=$start expected=$expMapRows"
  $null = Check 'mapping view: legacy rows shown as they are (group/source swapped)' ($legacy.alm2GroupId -eq '99' -and $legacy.source -eq 'SA' -and $swapped -ge 1) "0010000001 group=$($legacy.alm2GroupId) source=$($legacy.source) bucket=$($legacy.bucket); rows with source SA=$swapped"
  $null = Check 'mapping value helps from Report Formats / Time Buckets / Data Sources' (@($v.data.lookups.alm2Groups).Count -gt 0 -and @($v.data.lookups.buckets).Count -eq 10 -and @($v.data.lookups.sources).Count -gt 0) "alm2=$(@($v.data.lookups.alm2Groups).Count) alm3=$(@($v.data.lookups.alm3Groups).Count) buckets=$(@($v.data.lookups.buckets | ForEach-Object { $_.CODE }) -join ',') sources=$(@($v.data.lookups.sources).Count)"
  if (-not (Check "guard: $TestGl has no mapping row" (-not (RowOf $v $TestGl)) '')) { Say 'ABORT: test account already mapped, nothing written'; exit 1 }
  $legacyStamp = "$($legacy.changedBy) $($legacy.changedOn) $($legacy.changedTime)"

  # ---- Manual (R016): negative checks first, nothing written ----
  $n = Call POST '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '","alm2GroupId":"ZZ:99"}'))
  $null = Check 'manual reject: unknown ALM 2 group' (-not $n.ok -and $n.message -eq "ALM 2 group 'ZZ:99' is not in the ALM 2 grouping" -and $n.details[0].field -eq 'alm2GroupId') "=> $($n.message)"
  $n = Call POST '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '","bucket":"11","sensitivity":"03"}'))
  $msgs = @($n.details | ForEach-Object { $_.message }) -join ' | '
  $null = Check 'manual reject: bucket 11 and sensitivity 03, per field' (-not $n.ok -and $msgs -eq "Bucket '11' is not in the ALM 2/3 time buckets | Sensitivity '03' is not in 01 Sensitive / 02 Non Sensitive") "=> $msgs"
  $null = Check 'nothing stored by the refused requests' (-not (RowOf (Mapping) $TestGl)) ''

  # ---- Manual: create, change, delete ----
  $row = '{"glAccount":"' + $TestGl.TrimStart('0') + '","alm2GroupId":"sa:07:01:00:00","source":"99","bucket":"1","alm3Bucket":"10","type3":"ia","sensitivity":"01","alm3GroupId":""}'
  $c = Call POST '/glmapping/mapping' (Rows $row)
  $created = $c.ok
  $x = if ($c.ok) { RowOf $c $TestGl }
  $null = Check 'manual create (key without leading zeros, codes in lower case)' ($c.ok -and $c.data.result.created -eq 1 -and @($c.data.tables.mapping).Count -eq $start + 1) "created=$($c.data.result.created) rows=$(@($c.data.tables.mapping).Count) $(if (-not $c.ok) { $c.message })"
  $null = Check 'manual create: SAP derived the texts, stamps' ($x.glAccountName -eq 'Share Application Pending Allotment' -and $x.alm2GroupId -eq 'SA:07:01:00:00' -and $x.sourceDesc -eq 'Trial Balance Data' -and $x.bucket -eq '01' -and $x.bucketDesc -and $x.alm3Bucket -eq '10' -and $x.alm3BucketDesc -and $x.type3 -eq 'IA' -and $x.enteredBy -eq 'FS_DEV3' -and $x.etag) "name='$($x.glAccountName)' group='$($x.alm2GroupName)' bucket=$($x.bucket) '$($x.bucketDesc)' alm3=$($x.alm3Bucket) '$($x.alm3BucketDesc)' by=$($x.enteredBy) etag=$($x.etag)"
  if ($created) {
    $n = Call POST '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '"}'))
    $null = Check 'manual reject: duplicate create' (-not $n.ok -and $n.message -eq "G/L account $TestGl is already mapped") "=> $($n.message)"
    $u = Call PATCH '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '","alm2GroupId":"SA:07:01:00:00","source":"99","bucket":"02","alm3Bucket":"10","type3":"IA","sensitivity":"01","alm3GroupId":""}'))
    $x = if ($u.ok) { RowOf $u $TestGl }
    $null = Check 'manual change bucket (If-Match ETag): text follows, rest kept' ($u.ok -and $u.data.result.updated -eq 1 -and $x.bucket -eq '02' -and $x.bucketDesc -match '07' -and $x.alm3Bucket -eq '10' -and $x.enteredBy -eq 'FS_DEV3') "updated=$($u.data.result.updated) bucket=$($x.bucket) '$($x.bucketDesc)' alm3=$($x.alm3Bucket) $(if (-not $u.ok) { $u.message })"
    $u2 = Call PATCH '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '","alm2GroupId":"SA:07:01:00:00","source":"99","bucket":"02","alm3Bucket":"10","type3":"IA","sensitivity":"01","alm3GroupId":""}'))
    $null = Check 'manual change again: unchanged, nothing sent' ($u2.ok -and $u2.data.result.updated -eq 0 -and $u2.data.result.skipped -eq 1) "updated=$($u2.data.result.updated) skipped=$($u2.data.result.skipped)"
    $del = Call DELETE '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '"}'))
    $null = Check 'manual delete: row gone, count back' ($del.ok -and $del.data.result.deleted -eq 1 -and -not (RowOf $del $TestGl) -and @($del.data.tables.mapping).Count -eq $start) "deleted=$($del.data.result.deleted) rows=$(@($del.data.tables.mapping).Count) $(if (-not $del.ok) { $del.message })"
    if ($del.ok) { $created = $false }
  }

  # ---- Upload (R011): one-row file, preview, create, change, unchanged, refused ----
  function UploadRow([string]$type3, [string]$group) { '{"line":2,"glAccount":"' + $TestGl.TrimStart('0') + '","source":"99","alm2GroupId":"' + $group + '","bucket":"1","alm3GroupId":"","type3":"' + $type3 + '","sensitivity":"2"}' }
  $p = Call POST '/glmapping/upload' (Rows (UploadRow 'IA' 'SA:07:01:00:00'))
  $pr = @($p.data.rows)[0]
  $null = Check 'upload preview: one new row, nothing written' ($p.ok -and -not $p.data.committed -and $pr.action -eq 'create' -and $pr.glAccount -eq $TestGl -and $p.data.total -eq $start -and -not (RowOf (Mapping) $TestGl)) "action=$($pr.action) total=$($p.data.total) $(if (-not $p.ok) { $p.message })"
  $p = Call POST '/glmapping/upload' ('{"commit":true,"rows":[' + (UploadRow 'IA' 'SA:07:01:00:00') + ']}')
  $created = $p.ok -and $p.data.result.created -eq 1
  $x = RowOf (Mapping) $TestGl
  $null = Check 'upload commit: created, total +1, SAP texts' ($created -and $p.data.total -eq $start + 1 -and $x.bucket -eq '01' -and $x.sensitivity -eq '02' -and $x.bucketDesc -and $x.glAccountName) "result=$($p.data.result | ConvertTo-Json -Compress) total=$($p.data.total) bucket=$($x.bucket) sens=$($x.sensitivity) $(if (-not $p.ok) { $p.message })"
  if ($created) {
    $p = Call POST '/glmapping/upload' (Rows (UploadRow 'IB' 'SA:07:01:00:00'))
    $pr = @($p.data.rows)[0]
    $null = Check 'upload preview: existing row is an update of Type only' ($p.ok -and $pr.action -eq 'update' -and ($pr.changes | ConvertTo-Json -Compress) -eq '{"type3":["IA","IB"]}') "action=$($pr.action) changes=$($pr.changes | ConvertTo-Json -Compress)"
    $p = Call POST '/glmapping/upload' ('{"commit":true,"rows":[' + (UploadRow 'IB' 'SA:07:01:00:00') + ']}')
    $x = RowOf (Mapping) $TestGl
    $null = Check 'upload commit: updated (merge), total unchanged' ($p.ok -and $p.data.result.updated -eq 1 -and $p.data.total -eq $start + 1 -and $x.type3 -eq 'IB' -and $x.bucket -eq '01') "result=$($p.data.result | ConvertTo-Json -Compress) type3=$($x.type3)"
    $p = Call POST '/glmapping/upload' ('{"commit":true,"rows":[' + (UploadRow 'IB' 'SA:07:01:00:00') + ']}')
    $null = Check 'upload same file again: unchanged, nothing sent' ($p.ok -and $p.data.result.unchanged -eq 1 -and $p.data.result.updated -eq 0 -and $p.data.result.created -eq 0) "result=$($p.data.result | ConvertTo-Json -Compress)"
    $p = Call POST '/glmapping/upload' ('{"commit":true,"rows":[' + (UploadRow 'IA' 'ZZ:99') + ']}')
    $pr = @($p.data.rows)[0]
    $x = RowOf (Mapping) $TestGl
    $null = Check 'upload reject: unknown ALM 2 group, row skipped' ($p.ok -and $p.data.result.invalid -eq 1 -and $pr.action -eq 'invalid' -and $pr.message -eq "ALM 2 group 'ZZ:99' is not in the ALM 2 grouping" -and $x.type3 -eq 'IB') "=> $($pr.message) (stored type3=$($x.type3))"
    $del = Call DELETE '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '"}'))
    $null = Check 'delete the uploaded row' ($del.ok -and $del.data.result.deleted -eq 1) "deleted=$($del.data.result.deleted) $(if (-not $del.ok) { $del.message })"
    if ($del.ok) { $created = $false }
  }
  $v = Mapping
  $legacy = RowOf $v '0010000001'
  $null = Check 'GlMapping row count back to the start' (@($v.data.tables.mapping).Count -eq $expMapRows -and -not (RowOf $v $TestGl)) "rows=$(@($v.data.tables.mapping).Count)"
  $null = Check 'legacy row untouched' ($legacy.alm2GroupId -eq '99' -and $legacy.source -eq 'SA' -and "$($legacy.changedBy) $($legacy.changedOn) $($legacy.changedTime)" -eq $legacyStamp) "changed=$legacyStamp"
}
finally {
  if ($created) {
    # A check failed after the test row was written: remove it so SAP is left as found.
    try { $del = Call DELETE '/glmapping/mapping' (Rows ('{"glAccount":"' + $TestGl + '"}')); Say "cleanup: test row deleted=$($del.ok) $(if (-not $del.ok) { $del.message })" } catch { Say "cleanup FAILED: $($_.Exception.Message)" }
  }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Say "temporary instance (pid $($proc.Id)) stopped"
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
