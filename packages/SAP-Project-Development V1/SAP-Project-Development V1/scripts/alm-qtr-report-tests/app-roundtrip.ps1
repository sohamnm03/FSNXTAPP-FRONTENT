# ALM application check for the Quarterly ALM1 Report (module 'qtrreport', ZFS_SB_ALMQTRRPT_O4_API).
# Starts a temporary app instance on $Port (its .env, live SAP), signs in with the demo account, reads company code 1000 /
# 2026-09 through the app, compares with a direct SAP call, then Save -> Save again (refused) -> Delete through the app.
# Lock is NOT run (it cannot be undone). Stops the instance unless -Keep. Never touches 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8098,
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
  $svc = "https://vhtfqds4ap01.sap.tfsin.co.in:44300/sap/opu/odata4/sap/zfs_sb_almqtrrpt_o4_api/srvd_a2x/sap/zfs_sd_almqtrrpt/0001"
  $direct = (Invoke-RestMethod -Uri "$svc/QuarterlyReport(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='09')/Set?`$top=5000&sap-client=100" -Headers @{ Authorization = $auth; Accept = 'application/json' } -TimeoutSec 300).value
  $sel = '"bukrs":"1000","year":"2026","month":"09"'

  $setup = Call GET '/qtrreport' $null
  Check 'setup: odata mode, company codes' ($setup.ok -and $setup.data.mode -eq 'odata' -and $setup.data.companies.Count -gt 0) "mode=$($setup.data.mode) service=$($setup.data.service) companies=$($setup.data.companies.Count)"
  $v = Call GET '/qtrreport?bukrs=1000&year=2026&month=09' $null
  Check 'report: key date, snapshot date, 7 buckets with XBRL codes' ($v.ok -and $v.data.keyDate -eq '2026-10-01' -and $v.data.snapshotDate -eq '2026-09-30' -and $v.data.buckets.Count -eq 7 -and $v.data.buckets[0].xbrlCode) "xbrl=$(($v.data.buckets | ForEach-Object { $_.xbrlCode }) -join ',')"
  Check 'report: same rows as SAP' ($v.data.rows.Count -eq $direct.Count) "app=$($v.data.rows.Count) sap=$($direct.Count)"
  $a = $v.data.rows | Where-Object { $_.groupId -eq 'AA:99:99:99:99' }; $b = $direct | Where-Object { $_.GroupId -eq 'AA:99:99:99:99' }
  Check 'report: AA:99:99:99:99 total = SAP' ([decimal]$a.total -eq [decimal]$b.Total) "app=$($a.total) sap=$($b.Total)"
  $pct = $v.data.rows | Where-Object { $_.rowStyle -eq 'PERCENT' }
  Check 'report: percent row flagged' ($pct -and $pct.groupId -like 'AE*') "row=$($pct.groupId)"
  Check 'period: not saved, not locked' (-not $v.data.period.saved -and -not $v.data.period.locked) "saved=$($v.data.period.saved) locked=$($v.data.period.locked)"
  if ($v.data.period.saved -or $v.data.period.locked) { Say 'ABORT: period already saved or locked; not touching it'; exit 1 }

  $s1 = Call POST '/qtrreport/action' ('{' + $sel + ',"action":"save"}')
  Check 'save through the app' ($s1.ok -and $s1.data.period.saved -and $s1.data.period.savedRows -gt 0) "savedRows=$($s1.data.period.savedRows) by=$($s1.data.period.savedBy) $(if (-not $s1.ok) { $s1.data })"
  $s2 = Call POST '/qtrreport/action' ('{' + $sel + ',"action":"save"}')
  Check 'second save refused (SAP message 011)' (-not $s2.ok -and $s2.data -match 'already saved') "=> $($s2.data)"
  $d = Call POST '/qtrreport/action' ('{' + $sel + ',"action":"delete"}')
  Check 'delete through the app' ($d.ok -and -not $d.data.period.saved) "saved=$($d.data.period.saved) $(if (-not $d.ok) { $d.data })"
  $bad = Call POST '/qtrreport/action' ('{' + $sel + ',"action":"publish"}')
  Check 'unknown action refused by the app' (-not $bad.ok -and $bad.data -match 'save, lock or delete') "=> $($bad.data)"
  if ($Keep) { Say "instance left running on $base (pid $($proc.Id)) for a visual check" }
}
finally {
  if (-not $Keep) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Say "temporary instance (pid $($proc.Id)) stopped" }
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
