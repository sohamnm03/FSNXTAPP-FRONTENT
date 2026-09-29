# ALM application check for the ALM 2 Structural Liquidity Report (module 'qtrreport', area 'alm2', ZFS_SB_ALMQTR2RPT_O4_API).
# Starts a temporary app instance on $Port (its .env, live SAP), signs in with the demo account, reads company code 1000 /
# 2026-09 through the app, compares with a direct SAP call, then Save -> Save again (refused, 017) -> Delete through the app.
# The app builds SaveSnapshot's RowsJson itself from a fresh SAP read. Lock is NOT run (it cannot be undone).
# Aborts before any write unless the period is neither saved nor locked on SAP. Stops the instance unless -Keep. Never touches 8093.
# L-601: 127.0.0.1, Origin + x-alm-request on writes, 422 body from the response stream. L-604: no variables differing only by case.
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
Get-Content (Join-Path $App '.env') | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } | ForEach-Object { $envFile[$Matches[1]] = $Matches[2].Trim('"') }
$demoUser = if ($envFile['DEMO_USER']) { $envFile['DEMO_USER'] } else { 'demo' }

# Direct SAP reads (read-only): the oracle for the app's rows and the guard for the period.
$sapAuth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$svcRoot = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300/sap/opu/odata4/sap/zfs_sb_almqtr2rpt_o4_api/srvd_a2x/sap/zfs_sd_almqtr2rpt/0001'
$periodKey = "QuarterlyPeriod(CompanyCode='1000',FiscalYear='2026',FiscalPeriod='09')"
function SapGet([string]$Path) { Invoke-RestMethod -Uri "$svcRoot/$Path" -Headers @{ Authorization = $sapAuth; Accept = 'application/json' } -TimeoutSec 300 }
$sapPeriod = SapGet "$periodKey`?sap-client=100"
Say "SAP period before: saved=$($sapPeriod.Saved) savedRows=$($sapPeriod.SavedRows) locked=$($sapPeriod.Locked)"
if ($sapPeriod.Saved -or $sapPeriod.Locked) { Say 'ABORT: QuarterlyPeriod 1000/2026/09 is already saved or locked on SAP; not starting, nothing changed'; if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }; exit 1 }
$sapRows = @((SapGet "QuarterlyReport(P_CompanyCode='1000',P_FiscalYear='2026',P_FiscalPeriod='09')/Set?`$top=5000&sap-client=100").value)
$withTotal = @($sapRows | Where-Object { [decimal]$_.Total -ne 0 }).Count
Say "SAP report: rows=$($sapRows.Count) rows with Total<>0=$withTotal"

$env:PORT = "$Port"
# The app refuses requests from origins it doesn't list; allow the temporary one (the process env wins over .env).
$env:APP_ORIGINS = "http://localhost:$Port,http://127.0.0.1:$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $App -PassThru -WindowStyle Hidden
try {
  $base = "http://127.0.0.1:$Port"  # the app binds 127.0.0.1; "localhost" in PowerShell does not reach it
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) { try { Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { if ($_.Exception.Response) { $up = $true } else { Start-Sleep -Milliseconds 500 } } }
  Check 'temporary app instance up' $up "port $Port pid $($proc.Id)"
  $web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $reqHeaders = @{ Origin = $base; 'x-alm-request' = '1' }  # both are required on writes (server/app.mjs)
  $loginBody = @{ username = $demoUser; password = $envFile['DEMO_PASSWORD'] } | ConvertTo-Json
  $login = Invoke-RestMethod "$base/api/session" -Method Post -Body $loginBody -ContentType 'application/json' -WebSession $web -Headers $reqHeaders
  Check 'sign in' ($null -ne $login.username) "user=$($login.username)"

  function Call([string]$Method, [string]$Path, [string]$Json) {
    $p = @{ Uri = "$base/api$Path"; Method = $Method; WebSession = $web; Headers = $reqHeaders; TimeoutSec = 300 }
    if ($Json) { $p.Body = $Json; $p.ContentType = 'application/json' }
    try { return @{ ok = $true; data = Invoke-RestMethod @p } }
    catch {
      # PowerShell 5.1 leaves ErrorDetails empty for a 422, so read the body from the response stream (L-601).
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      return @{ ok = $false; data = $msg }
    }
  }
  $selJson = '"area":"alm2","bukrs":"1000","year":"2026","month":"09"'

  $setup = Call GET '/qtrreport?area=alm2' ''
  Check 'setup: odata mode on the ALM 2 service, company codes' ($setup.ok -and $setup.data.mode -eq 'odata' -and $setup.data.service -eq 'ZFS_SB_ALMQTR2RPT_O4_API' -and $setup.data.area -eq 'alm2' -and $setup.data.companies.Count -gt 0) "mode=$($setup.data.mode) service=$($setup.data.service) companies=$($setup.data.companies.Count)"
  $view = Call GET '/qtrreport?area=alm2&bukrs=1000&year=2026&month=09' ''
  if (-not $view.ok) { Say "report read failed: $($view.data)" }
  $xbrl = @($view.data.buckets | ForEach-Object { $_.xbrlCode })
  Check 'report: 10 ALM 2/3 buckets with XBRL codes' ($view.ok -and $view.data.buckets.Count -eq 10 -and @($xbrl | Where-Object { $_ }).Count -eq 10) "xbrl=$($xbrl -join ',')"
  Check 'report: key date = month end + 1, snapshot date = month end' ($view.data.keyDate -eq '2026-10-01' -and $view.data.snapshotDate -eq '2026-09-30') "key=$($view.data.keyDate) snapshot=$($view.data.snapshotDate)"
  Check 'report: same rows as SAP' ($view.data.rows.Count -eq $sapRows.Count -and $view.data.rows.Count -eq 188) "app=$($view.data.rows.Count) sap=$($sapRows.Count)"
  $appIds = ($view.data.rows | ForEach-Object { $_.groupId }) -join '|'; $sapIds = ($sapRows | ForEach-Object { $_.GroupId }) -join '|'
  Check 'report: same group order as SAP, computed rows last' ($appIds -eq $sapIds -and (($view.data.rows | Select-Object -Last 5 | ForEach-Object { $_.groupId }) -join ',') -eq 'SA:99:99:99:99_A1,SC,SD,SE,SF') "last5=$(($view.data.rows | Select-Object -Last 5 | ForEach-Object { $_.groupId }) -join ',')"
  $appSub = $view.data.rows | Where-Object { $_.groupId -eq 'SA:99:99:99:99' }; $sapSub = $sapRows | Where-Object { $_.GroupId -eq 'SA:99:99:99:99' }
  Check 'report: SA:99:99:99:99 total = SAP' ($appSub -and [decimal]$appSub.total -eq [decimal]$sapSub.Total) "app=$($appSub.total) sap=$($sapSub.Total)"
  $pct = @($view.data.rows | Where-Object { $_.rowStyle -eq 'PERCENT' } | ForEach-Object { $_.groupId })
  Check 'report: PERCENT rows flagged (SE, SF)' (($pct -join ',') -eq 'SE,SF') "rows=$($pct -join ',')"
  $inc = @($view.data.rows | Where-Object { $_.sourceIncomplete })
  Say "info: rows with sourceIncomplete = $($inc.Count)"
  Check 'period: not saved, not locked (guard)' ($view.ok -and -not $view.data.period.saved -and -not $view.data.period.locked) "saved=$($view.data.period.saved) locked=$($view.data.period.locked)"
  if (-not $view.ok -or $view.data.period.saved -or $view.data.period.locked) { Say 'ABORT: period not confirmed open through the app; no write sent'; exit 1 }

  $save1 = Call POST '/qtrreport/action' ('{' + $selJson + ',"action":"save"}')
  Check 'save through the app: saved rows = rows with Total <> 0' ($save1.ok -and $save1.data.period.saved -and $save1.data.period.savedRows -eq $withTotal) "savedRows=$($save1.data.period.savedRows) expected=$withTotal by=$($save1.data.period.savedBy) $(if (-not $save1.ok) { $save1.data })"
  $save2 = Call POST '/qtrreport/action' ('{' + $selJson + ',"action":"save"}')
  Check 'second save refused (SAP message 017)' (-not $save2.ok -and $save2.data -match 'ALM 2 data of 09/2026 for company code 1000 is already saved') "=> $($save2.data)"
  $del = Call POST '/qtrreport/action' ('{' + $selJson + ',"action":"delete"}')
  Check 'delete through the app' ($del.ok -and -not $del.data.period.saved) "saved=$($del.data.period.saved) $(if (-not $del.ok) { $del.data })"
  $bad = Call POST '/qtrreport/action' ('{' + $selJson + ',"action":"publish"}')
  Check 'unknown action refused by the app' (-not $bad.ok -and $bad.data -match 'save, lock or delete') "=> $($bad.data)"
  if ($Keep) { Say "instance left running on $base (pid $($proc.Id)) for a visual check" }
}
finally {
  if (-not $Keep) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Say "temporary instance (pid $($proc.Id)) stopped" }
  try {
    $after = SapGet "$periodKey`?sap-client=100"
    Check 'SAP period afterwards: not saved, not locked' (-not $after.Saved -and -not $after.Locked) "saved=$($after.Saved) savedRows=$($after.SavedRows) locked=$($after.Locked)"
  } catch { Check 'SAP period afterwards: not saved, not locked' $false "read failed: $($_.Exception.Message)" }
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
