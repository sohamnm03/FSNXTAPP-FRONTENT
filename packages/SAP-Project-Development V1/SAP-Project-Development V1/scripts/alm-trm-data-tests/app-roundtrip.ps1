# ALM application end-to-end check for TRM Data (ALM 2 / ALM 3 folders), service ZFS_SB_ALMTRMDATA_O4_API, read-only:
# TRM Accrual Cashflow - ALM 2,3 (TrmAccrualCashflow, /FS00/ALMR014) and TRM Principal O/S - ALM 2,3 (TrmPrincipalOutstanding,
# /FS00/ALMR015). Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP), signs in
# with the demo account from that .env and uses only the app's own API. No SAP writes. Figures for 1000 / 2026-09 are the
# oracles of the TRM data build; amounts are compared as decimals and every negative check asserts its message (L-610).
# Stops the instance; never touches 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8099,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Host $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note)
}
# Named so that no $d / $D variable (case-insensitive in PowerShell) can overwrite it.
$ToDec = { param([string]$v) [decimal]::Parse($v, [Globalization.CultureInfo]::InvariantCulture) }
# Oracles, company code 1000, period 2026/09.
$accRows = 20; $accTotal = & $ToDec '677564699.07'
$accBuckets = @{ b1 = '10776712.33'; b3 = '47765906.60'; b4 = '-250181824.27'; b5 = '165786132.90'; b6 = '584836037.57'; b7 = '118581733.94' }
$acc10F = @{ rows = 7; total = & $ToDec '-202408377.93' }
$priRows = 610
$priByProduct = [ordered]@{ '10B' = '307630000.00'; '10C' = '55563692968.56'; '10D' = '19802336664.00'; '10F' = '103422506736.40'; '15A' = '7900388252.43'; '10E' = '7818392981392.58' }
$pri15ARows = 30

$envFile = @{}
Get-Content (Join-Path $App '.env') | Where-Object { $_ -match '^\s*([A-Z_0-9]+)=(.*)$' } | ForEach-Object { $envFile[$Matches[1]] = $Matches[2].Trim('"') }
$user = if ($envFile['DEMO_USER']) { $envFile['DEMO_USER'] } else { 'demo' }
if (-not $envFile['SAP_TRMDATA_URL']) { Say 'ABORT: SAP_TRMDATA_URL is not set in the app .env'; exit 1 }

$env:PORT = "$Port"
$env:APP_ORIGINS = "http://localhost:$Port,http://127.0.0.1:$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $App -PassThru -WindowStyle Hidden
try {
  $base = "http://127.0.0.1:$Port"
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) { try { Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { if ($_.Exception.Response) { $up = $true } else { Start-Sleep -Milliseconds 500 } } }
  Check 'temporary app instance up' $up "port $Port"
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $hdrs = @{ Origin = $base; 'x-alm-request' = '1' }
  $body = @{ username = $user; password = $envFile['DEMO_PASSWORD'] } | ConvertTo-Json
  $r = Invoke-RestMethod "$base/api/session" -Method Post -Body $body -ContentType 'application/json' -WebSession $s -Headers $hdrs
  Check 'sign in' ($null -ne $r.username) "user=$($r.username)"

  function Call([string]$Path) {
    try { return @{ ok = $true; data = Invoke-RestMethod -Uri "$base/api$Path" -Method GET -WebSession $s -Headers $hdrs -TimeoutSec 300 } }
    catch {
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      $err = $null; try { $err = ($msg | ConvertFrom-Json).error } catch {}
      return @{ ok = $false; data = $msg; message = $(if ($err) { [string]$err.message } else { $msg }) }
    }
  }
  function Sum($rows, [string]$field) { $t = [decimal]0; foreach ($x in $rows) { $t += [decimal]$x.$field }; $t }
  $sel = 'bukrs=1000&year=2026&month=09'

  # ---- bucket labels: the ten ALM 2/3 time buckets ----
  $tb = Call '/timebuckets'
  $expLabels = @($tb.data.tables.alm2 | Sort-Object { [int]$_.bucket } | ForEach-Object { $_.description })

  # ---- TRM Accrual Cashflow (R014) ----
  $a = Call '/trmdata/accrual'
  Check 'accrual setup: odata mode, company 1000 offered' ($a.ok -and $a.data.mode -eq 'odata' -and (@($a.data.companies | ForEach-Object { $_.code }) -contains '1000')) "mode=$($a.data.mode) service=$($a.data.service)"
  $a = Call "/trmdata/accrual?$sel"
  $rows = @($a.data.rows)
  Check 'accrual: rows, key date' ($a.ok -and $rows.Count -eq $accRows -and $a.data.keyDate -eq '2026-10-01') "rows=$($rows.Count) expected=$accRows keyDate=$($a.data.keyDate)"
  $labels = @($a.data.buckets | ForEach-Object { $_.description })
  Check 'accrual: ten bucket columns labelled from Time Buckets ALM 2/3' ($labels.Count -eq 10 -and $expLabels.Count -eq 10 -and (($labels -join '|') -eq ($expLabels -join '|'))) "labels=$($labels -join ' | ')"
  $t = Sum $rows 'total'
  Check 'accrual: total (decimal)' ($t -eq $accTotal) "total=$t expected=$accTotal ($(@($rows)[0].total.GetType().Name))"
  foreach ($k in $accBuckets.Keys | Sort-Object) { $v = Sum $rows $k; $e = & $ToDec $accBuckets[$k]; Check "accrual: bucket $k sum" ($v -eq $e) "sum=$v expected=$e" }
  $bsum = [decimal]0; foreach ($i in 1..10) { $bsum += Sum $rows "b$i" }
  Check 'accrual: buckets add up to the total' ($bsum -eq $t) "buckets=$bsum total=$t"
  $mm = @($rows | Where-Object { $_.dealNumber -and -not $_.securityId }).Count; $sec = @($rows | Where-Object { $_.securityId -and -not $_.dealNumber }).Count
  Check 'accrual: each row is a deal or a security' ($mm + $sec -eq $rows.Count) "money market=$mm securities=$sec"
  $f = Call "/trmdata/accrual?$sel&products=10F"
  $ft = Sum $f.data.rows 'total'
  Check 'accrual: product type 10F filter' ($f.ok -and @($f.data.rows).Count -eq $acc10F.rows -and $ft -eq $acc10F.total -and @($f.data.rows | Where-Object { $_.productType -ne '10F' }).Count -eq 0) "rows=$(@($f.data.rows).Count) total=$ft expected=$($acc10F.rows)/$($acc10F.total)"
  $one = @($rows | Where-Object { $_.dealNumber })[0]
  $d = Call "/trmdata/accrual?$sel&deals=$($one.dealNumber)"
  Check 'accrual: transaction number filter' ($d.ok -and @($d.data.rows).Count -ge 1 -and @($d.data.rows | Where-Object { $_.dealNumber -ne $one.dealNumber }).Count -eq 0) "deal=$($one.dealNumber) rows=$(@($d.data.rows).Count)"
  $oneSec = @($rows | Where-Object { $_.securityId })[0]
  $d = Call "/trmdata/accrual?$sel&securities=$($oneSec.securityId)"
  Check 'accrual: security (class) filter' ($d.ok -and @($d.data.rows).Count -ge 1 -and @($d.data.rows | Where-Object { $_.securityId -ne $oneSec.securityId }).Count -eq 0) "class=$($oneSec.securityId) rows=$(@($d.data.rows).Count)"
  $bad = Call '/trmdata/accrual?bukrs=1000&year=2026&month=13'
  Check 'accrual: month 13 refused' (-not $bad.ok -and $bad.message -eq 'Select a month from 01 to 12.') "=> $($bad.message)"
  $bad = Call "/trmdata/accrual?$sel&deals=1%27%20or"
  Check 'accrual: invalid transaction number refused' (-not $bad.ok -and $bad.message -eq "'1'' is not a valid value for deals.") "=> $($bad.message)"
  $bad = Call '/trmdata/accrual?bukrs=1000&year=26&month=09'
  Check 'accrual: two-digit year refused' (-not $bad.ok -and $bad.message -eq 'Enter a four-digit year.') "=> $($bad.message)"

  # ---- TRM Principal O/S (R015) ----
  $p = Call "/trmdata/principal?$sel"
  $rows = @($p.data.rows)
  Check 'principal: rows' ($p.ok -and $rows.Count -eq $priRows) "rows=$($rows.Count) expected=$priRows"
  $labels = @($p.data.buckets | ForEach-Object { $_.description })
  Check 'principal: ten bucket columns labelled from Time Buckets ALM 2/3' ((($labels -join '|') -eq ($expLabels -join '|'))) ''
  foreach ($prd in $priByProduct.Keys) {
    $sub = @($rows | Where-Object { $_.productType -eq $prd }); $v = Sum $sub 'total'; $e = & $ToDec $priByProduct[$prd]
    Check "principal: product $prd total" ($v -eq $e) "rows=$($sub.Count) total=$v expected=$e"
  }
  Check 'principal: product 15A rows' (@($rows | Where-Object { $_.productType -eq '15A' }).Count -eq $pri15ARows) "rows=$(@($rows | Where-Object { $_.productType -eq '15A' }).Count) expected=$pri15ARows"
  $failed = @($rows | Where-Object { $_.tpm12Failed }).Count
  Check 'principal: no TPM12 capture failures' ($failed -eq 0 -and @($rows | Where-Object { $_.tpm12Failed -isnot [bool] }).Count -eq 0) "rows with Tpm12CaptureFailed=$failed"
  $fv = @($rows | Where-Object { $_.fixedVariable } | ForEach-Object { $_.fixedVariable } | Sort-Object -Unique)
  Check 'principal: fixed / variable values' (@($fv | Where-Object { $_ -notin '01 - Fixed', '02 - Variable' }).Count -eq 0) "values=$($fv -join ', ')"
  $bsum = [decimal]0; foreach ($i in 1..10) { $bsum += Sum $rows "b$i" }
  Check 'principal: buckets add up to the total' ($bsum -eq (Sum $rows 'total')) "buckets=$bsum total=$(Sum $rows 'total')"
  $tt = @($rows | Where-Object { $_.transactionType } | Group-Object transactionType | Sort-Object Count -Descending)[0]
  $x = Call "/trmdata/principal?$sel&transactions=$($tt.Name)"
  Check 'principal: transaction type filter' ($x.ok -and @($x.data.rows).Count -eq $tt.Count -and @($x.data.rows | Where-Object { $_.transactionType -ne $tt.Name }).Count -eq 0) "type=$($tt.Name) rows=$(@($x.data.rows).Count) expected=$($tt.Count)"
  $x = Call "/trmdata/principal?$sel&products=15A,10B"
  $e = (& $ToDec $priByProduct['15A']) + (& $ToDec $priByProduct['10B'])
  Check 'principal: two product types in one filter' ($x.ok -and (Sum $x.data.rows 'total') -eq $e) "rows=$(@($x.data.rows).Count) total=$(Sum $x.data.rows 'total') expected=$e"
  $bad = Call '/trmdata/principal?bukrs=1000&year=2026&month=00'
  Check 'principal: month 00 refused' (-not $bad.ok -and $bad.message -eq 'Select a month from 01 to 12.') "=> $($bad.message)"
  $bad = Call "/trmdata/principal?$sel&transactions=ABCD"
  Check 'principal: transaction type longer than 3 refused' (-not $bad.ok -and $bad.message -eq "'ABCD' is not a valid value for transactions.") "=> $($bad.message)"
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Say "temporary instance (pid $($proc.Id)) stopped"
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
