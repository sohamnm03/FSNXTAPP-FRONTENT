# Smoke test for ZFS_SB_ALMTRMDATA_O4_API (DS4_100_TFSIN), read-only: TrmAccrualCashflow (/FS00/ALMR014) and
# TrmPrincipalOutstanding (/FS00/ALMR015) for company 1000, 2026/09, against the SQL oracles of the build
# (evidence/2026-09-27-2155-alm23-trm-and-trial-balance-apis/r014-*, r015-*) and the /FS00/ALMT034 run for 15A.
# Password comes from $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [string]$Base = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$root = "$Base/sap/opu/odata4/sap/zfs_sb_almtrmdata_o4_api/srvd_a2x/sap/zfs_sd_almtrmdata/0001"
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Output $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note)
}
function G([string]$Path, [string]$Accept = 'application/json') {
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  try { $r = Invoke-WebRequest -Uri "$root/$Path${sep}sap-client=100" -Headers @{ Authorization = $auth; Accept = $Accept } -UseBasicParsing -TimeoutSec 600
        return @{ s = [int]$r.StatusCode; b = $r.Content } }
  catch { return @{ s = [int]$_.Exception.Response.StatusCode; b = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }) } }
}
function Rows([string]$Path) { $r = G $Path; if ($r.s -ne 200) { return $null }; return @(($r.b | ConvertFrom-Json).value) }
function Sum($rows, [string]$field) { $s = [decimal]0; foreach ($x in $rows) { $s += [decimal]$x.$field }; return $s }
function Buckets($x) { $s = [decimal]0; foreach ($b in 1..10) { $s += [decimal]$x.('Bucket{0:D2}' -f $b) }; return $s }

$m = G '$metadata' 'application/xml'
$sets = ([regex]::Matches($m.b, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ','
Check '$metadata' ($m.s -eq 200 -and $sets -match 'TrmAccrualCashflow' -and $sets -match 'TrmPrincipalOutstanding') "sets=$sets"

# ---- TrmAccrualCashflow (R014) ----
$A = "TrmAccrualCashflow(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='09')/Set"
$acc = Rows "$A`?`$top=1000"
Check 'Accrual: 20 rows' ($acc.Count -eq 20) "rows=$($acc.Count)"
Check 'Accrual: total = oracle 677,564,699.07' ((Sum $acc 'Total') -eq [decimal]'677564699.07') "total=$(Sum $acc 'Total')"
$expect = @{ 1 = '10776712.33'; 3 = '47765906.60'; 4 = '-250181824.27'; 5 = '165786132.90'; 6 = '584836037.57'; 7 = '118581733.94' }
foreach ($b in 1..10) {
  $want = if ($expect.ContainsKey($b)) { [decimal]$expect[$b] } else { [decimal]0 }
  $got = Sum $acc ('Bucket{0:D2}' -f $b)
  Check ("Accrual: bucket {0:D2}" -f $b) ($got -eq $want) "sum=$got oracle=$want"
}
Check 'Accrual: Total = sum of buckets on every row' (@($acc | Where-Object { (Buckets $_) -ne [decimal]$_.Total }).Count -eq 0) ''
$f = Rows "$A`?`$filter=ProductType eq '10F'&`$top=100"
Check 'Accrual: 10F filter = oracle (7 rows, -202,408,377.93)' ($f.Count -eq 7 -and (Sum $f 'Total') -eq [decimal]'-202408377.93') "rows=$($f.Count) total=$(Sum $f 'Total')"
# Status and count read directly: a function returning an empty array hands back $null in PowerShell.
$n = G "TrmAccrualCashflow(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='13')/Set?`$count=true&`$top=0"
$cnt = if ($n.s -eq 200) { [int]($n.b | ConvertFrom-Json).'@odata.count' } else { -1 }
Check 'Accrual: month 13 gives no rows' ($n.s -eq 200 -and $cnt -eq 0) "HTTP $($n.s) count=$cnt"

# ---- TrmPrincipalOutstanding (R015) ----
$P = "TrmPrincipalOutstanding(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='09')/Set"
$pri = Rows "$P`?`$top=2000"
Check 'Principal: 610 rows' ($pri.Count -eq 610) "rows=$($pri.Count)"
$byPrd = @{ '10B' = '307630000.00'; '10C' = '55563692968.56'; '10D' = '19802336664.00'; '10F' = '103422506736.40'; '15A' = '7900388252.43' }
foreach ($k in $byPrd.Keys | Sort-Object) {
  $g = @($pri | Where-Object ProductType -eq $k)
  Check "Principal: $k total = oracle" ((Sum $g 'Total') -eq [decimal]$byPrd[$k]) "rows=$($g.Count) total=$(Sum $g 'Total') oracle=$($byPrd[$k])"
}
$e = @($pri | Where-Object ProductType -eq '10E')
Check 'Principal: 10E within 0.01% of the FX oracle (USD+JPY+INR/CHF)' ([Math]::Abs([double](Sum $e 'Total') - 7818392981392.58) -lt 1e9) "rows=$($e.Count) total=$(Sum $e 'Total')"
Check 'Principal: no TPM12 capture failure' (@($pri | Where-Object { $_.Tpm12CaptureFailed }).Count -eq 0) ''
Check 'Principal: Total = sum of buckets on every row' (@($pri | Where-Object { (Buckets $_) -ne [decimal]$_.Total }).Count -eq 0) ''
Check 'Principal: 10A excluded (kept rule D11)' (@($pri | Where-Object ProductType -eq '10A').Count -eq 0) ''
$sap15a = @{ '1100256'='1610650.43'; '1100285'='958780372.00'; '1100292'='6671434.00'; '1100297'='3812248.00'; '1100301'='5718372.00'; '1100304'='1899190000.00'; '1100305'='1931700000.00'; '1100306'='900000000.00'; '1100307'='2170984750.00' }
$diff = 0; foreach ($k in $sap15a.Keys) { $row = @($pri | Where-Object { $_.SecurityId.TrimStart('0') -eq $k })[0]; if (-not $row -or [decimal]$row.Total -ne [decimal]$sap15a[$k]) { $diff++ } }
Check 'Principal: 15A equals /FS00/ALMT034 (sample of 9 securities)' ($diff -eq 0) "differences=$diff"

Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
