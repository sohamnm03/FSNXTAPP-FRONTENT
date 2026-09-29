# ALM application end-to-end check for Update Manual Data (module 'manualdata', ZFS_SB_ALMMANUAL_O4_API).
# Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP),
# signs in with the demo account from that .env, and keys in, changes and clears amounts for company code
# 1000, period 2099/12 (no real data) through the app's own API. Stops the instance. Never touches 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8095,
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

  $sel = '"bukrs":"1000","year":"2099","month":"12"'
  $Hdr = 'AA:02:00:00:00'; $C1 = 'AA:02:01:00:00'; $C2 = 'AA:02:06:00:00'
  function Grid() { Call GET '/manualdata?bukrs=1000&year=2099&month=12' $null }
  function Row($g, $grid) { $grid.data.rows | Where-Object { $_.groupId -eq $g } }

  $setup = Call GET '/manualdata' $null
  Check 'setup: odata mode, company codes' ($setup.ok -and $setup.data.mode -eq 'odata' -and $setup.data.companies.Count -gt 0) "mode=$($setup.data.mode) service=$($setup.data.service) companies=$($setup.data.companies.Count)"
  $g = Grid
  $buckets = ($g.data.buckets | ForEach-Object { $_.bucket }) -join ','
  Check 'grid: all 7 ALM 1 buckets' ($g.ok -and $g.data.buckets.Count -eq 7) "buckets=$buckets"
  Check 'grid: child editable, header read-only' ((Row $C1 $g).editable -and -not (Row $Hdr $g).editable) "rows=$($g.data.rows.Count)"
  $filled = @($g.data.rows | Where-Object { ($_.amounts.PSObject.Properties | Where-Object { $_.Value }) })
  if ($filled.Count) { Say "ABORT: period 2099/12 already has amounts"; exit 1 }

  $s1 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $C1 + '","amounts":{"1":"100","7":"25"}},{"groupId":"' + $C2 + '","amounts":{"1":"1,250.5"}}]}')
  $headRow = Row $Hdr $s1
  Check 'key in 3 amounts (bucket 7 included)' ($s1.ok -and $s1.data.result.created -eq 3) "created=$($s1.data.result.created) $(if (-not $s1.ok) { $s1.data })"
  Check 'header summed by SAP' ($headRow.amounts.'1' -eq '1350.50' -and $headRow.amounts.'7' -eq '25.00') "header b1=$($headRow.amounts.'1') b7=$($headRow.amounts.'7')"

  $s2 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $C1 + '","amounts":{"1":"200","7":""}}]}')
  $headRow = Row $Hdr $s2
  Check 'change one, clear one' ($s2.ok -and $s2.data.result.updated -eq 1 -and $s2.data.result.deleted -eq 1) "updated=$($s2.data.result.updated) deleted=$($s2.data.result.deleted) $(if (-not $s2.ok) { $s2.data })"
  Check 'header follows (b1 1450.50, b7 gone)' ($headRow.amounts.'1' -eq '1450.50' -and -not $headRow.amounts.'7') "header b1=$($headRow.amounts.'1') b7='$($headRow.amounts.'7')'"

  $bad = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $Hdr + '","amounts":{"1":"5"}}]}')
  Check 'header group refused by the engine' (-not $bad.ok -and $bad.data -match 'only source 92') "=> $($bad.data)"

  $s3 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $C1 + '","amounts":{"1":""}},{"groupId":"' + $C2 + '","amounts":{"1":"0"}}]}')
  $left = @($s3.data.rows | Where-Object { ($_.amounts.PSObject.Properties | Where-Object { $_.Value }) })
  Check 'clear all: period empty, header gone' ($s3.ok -and $s3.data.result.deleted -eq 2 -and $left.Count -eq 0) "deleted=$($s3.data.result.deleted) rows with amounts=$($left.Count) $(if (-not $s3.ok) { $s3.data })"
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Say "temporary instance (pid $($proc.Id)) stopped"
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
