# ALM application check for TRM Repayment Cashflows - ALM1 (module 'trmrepay', ZFS_SB_ALMTRMREPAY_O4_API).
# Read-only. Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP),
# signs in with the demo account, reads company code 1000 / 2026-09 through the app and compares rows and totals
# with a direct call to the SAP service. Stops the instance unless -Keep. Never touches 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8097,
  [switch]$Keep,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Output $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note)
}

$envFile = @{}
Get-Content (Join-Path $App '.env') | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object { $envFile[$Matches[1]] = $Matches[2].Trim('"') }
$user = if ($envFile['DEMO_USER']) { $envFile['DEMO_USER'] } else { 'demo' }

$env:PORT = "$Port"
# The app refuses requests from origins it doesn't list; allow the temporary one (the process env wins over .env).
$env:APP_ORIGINS = "http://localhost:$Port,http://127.0.0.1:$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $App -PassThru -WindowStyle Hidden
try {
  $base = "http://127.0.0.1:$Port"  # the app binds 127.0.0.1; "localhost" in PowerShell does not reach it
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) { try { Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { if ($_.Exception.Response) { $up = $true } else { Start-Sleep -Milliseconds 500 } } }
  Check 'temporary app instance up' $up "port $Port"
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $h = @{ Origin = $base; 'x-alm-request' = '1' }  # both are required on writes (server/app.mjs)
  $body = @{ username = $user; password = $envFile['DEMO_PASSWORD'] } | ConvertTo-Json
  $r = Invoke-RestMethod "$base/api/session" -Method Post -Body $body -ContentType 'application/json' -WebSession $s -Headers $h
  Check 'sign in' ($null -ne $r.username) "user=$($r.username)"

  function Call([string]$Method, [string]$Path, $Rows) {
    $p = @{ Uri = "$base/api$Path"; Method = $Method; WebSession = $s; Headers = $h; TimeoutSec = 120 }
    if ($Rows) { $p.Body = $Rows; $p.ContentType = 'application/json' }
    try { return @{ ok = $true; data = Invoke-RestMethod @p } }
    catch {
      # PowerShell 5.1 leaves ErrorDetails empty for a 422, so read the body from the response stream.
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      return @{ ok = $false; data = $msg }
    }
  }

  $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
  $svc = "https://vhtfqds4ap01.sap.tfsin.co.in:44300/sap/opu/odata4/sap/zfs_sb_almtrmrepay_o4_api/srvd_a2x/sap/zfs_sd_almtrmrepay/0001"
  $set = "TrmRepaymentCashflow(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='09')/Set"
  $direct = New-Object System.Collections.Generic.List[object]; $q = "$svc/$set`?`$top=5000&sap-client=100"
  while ($q) { $d = Invoke-RestMethod -Uri $q -Headers @{ Authorization = $auth; Accept = 'application/json' } -TimeoutSec 300; foreach ($v in $d.value) { $direct.Add($v) }
               $q = if ($d.'@odata.nextLink') { "$svc/" + ($d.'@odata.nextLink' -replace '([?&])sap-client=\d+', '$1' -replace '[?&]$', '') + '&sap-client=100' } else { $null } }

  $setup = Call GET '/trmrepay' $null
  Check 'setup: odata mode, company codes' ($setup.ok -and $setup.data.mode -eq 'odata' -and $setup.data.companies.Count -gt 0) "mode=$($setup.data.mode) service=$($setup.data.service) companies=$($setup.data.companies.Count)"
  $v = Call GET '/trmrepay?bukrs=1000&year=2026&month=09' $null
  Check 'report: key date, 7 labelled buckets' ($v.ok -and $v.data.keyDate -eq '2026-10-01' -and $v.data.buckets.Count -eq 7 -and $v.data.buckets[0].description -ne 'Bucket 1') "keyDate=$($v.data.keyDate) buckets=$(($v.data.buckets | ForEach-Object { $_.description }) -join ' | ')"
  Check 'report: same row count as SAP' ($v.data.rows.Count -eq $direct.Count) "app=$($v.data.rows.Count) sap=$($direct.Count)"
  foreach ($st in '09','10','11','12') {
    $a = [decimal]0; foreach ($r in $v.data.rows) { if ($r.sourceType -eq $st) { $a += [decimal]$r.total } }
    $b = [decimal]0; foreach ($r in $direct) { if ($r.SourceType -eq $st) { $b += [decimal]$r.Total } }
    Check "report: total source type $st = SAP" ($a -eq $b) "app=$a sap=$b"
  }
  $f = Call GET '/trmrepay?bukrs=1000&year=2026&month=09&deals=100014' $null
  Check 'filter: transaction 100014 only' ($f.ok -and $f.data.rows.Count -ge 1 -and @($f.data.rows | Where-Object { $_.dealNumber -ne '100014' }).Count -eq 0) "rows=$($f.data.rows.Count)"
  $p = Call GET '/trmrepay?bukrs=1000&year=2026&month=09&products=15D' $null
  Check 'filter: product type 15D only' ($p.ok -and $p.data.rows.Count -ge 1 -and @($p.data.rows | Where-Object { $_.productType -ne '15D' }).Count -eq 0) "rows=$($p.data.rows.Count)"
  $bad = Call GET '/trmrepay?bukrs=1000&year=2026&month=13' $null
  Check 'month 13 refused by the app' (-not $bad.ok -and $bad.data -match 'month') "=> $($bad.data)"
  if ($Keep) { Say "instance left running on $base (pid $($proc.Id)) for a visual check" }
}
finally {
  if (-not $Keep) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Say "temporary instance (pid $($proc.Id)) stopped" }
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
