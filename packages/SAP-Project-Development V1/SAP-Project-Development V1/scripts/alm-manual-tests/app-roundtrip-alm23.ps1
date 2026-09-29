# ALM application end-to-end check for Update Manual Data, ALM 2 and ALM 3 (area alm2 / alm3,
# entity sets Alm2ManualData / Alm3ManualData of ZFS_SB_ALMMANUAL_O4_API).
# Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP),
# signs in with the demo account from that .env, and keys in, changes and clears ALM 2 amounts for company
# code 1000, period 2099/12 (no real data) through the app's own API. ALM 3 has no source-92 group on TFSIN,
# so only its grid and a refusal are checked. Stops the instance. Never touches 8093.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8097,
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

  function Call([string]$Method, [string]$Path, $Rows) {
    $p = @{ Uri = "$base/api$Path"; Method = $Method; WebSession = $s; Headers = $hdrs; TimeoutSec = 120 }
    if ($Rows) { $p.Body = $Rows; $p.ContentType = 'application/json' }
    try { return @{ ok = $true; data = Invoke-RestMethod @p } }
    catch {
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      return @{ ok = $false; data = $msg }
    }
  }
  function Grid([string]$area) { Call GET "/manualdata?bukrs=1000&year=2099&month=12&area=$area" $null }
  function Row($g, $grid) { $grid.data.rows | Where-Object { $_.groupId -eq $g } }
  function Filled($grid) { @($grid.data.rows | Where-Object { ($_.amounts.PSObject.Properties | Where-Object { $_.Value }) }) }

  # ---- ALM 2 ----
  $sel = '"bukrs":"1000","year":"2099","month":"12","area":"alm2"'
  $Hd = 'SB:11:00:00:00'; $A = 'SB:11:01:00:00'; $B = 'SB:11:02:00:00'
  $g = Grid 'alm2'
  $bk = @($g.data.buckets | ForEach-Object { $_.bucket })
  Check 'ALM2 grid: odata mode, 10 ALM 2-3 buckets' ($g.ok -and $g.data.mode -eq 'odata' -and $bk.Count -eq 10) "mode=$($g.data.mode) area=$($g.data.area.label) buckets=$($bk -join ',')"
  $editable = @($g.data.rows | Where-Object { $_.editable } | ForEach-Object { $_.groupId })
  Check 'ALM2 grid: only the source-92 groups editable' (($editable -join ',') -eq "$A,$B" -and -not (Row $Hd $g).editable) "rows=$($g.data.rows.Count) editable=$($editable -join ',')"
  if ((Filled $g).Count) { Say 'ABORT: ALM 2 period 2099/12 already has amounts, nothing written'; exit 1 }
  $b1 = $bk[0]; $b10 = $bk[-1]

  $s1 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $A + '","amounts":{"' + $b1 + '":"100","' + $b10 + '":"25"}},{"groupId":"' + $B + '","amounts":{"' + $b1 + '":"1,250.5"}}]}')
  $hr = Row $Hd $s1
  Check 'ALM2 key in 3 amounts (last bucket included)' ($s1.ok -and $s1.data.result.created -eq 3) "created=$($s1.data.result.created) $(if (-not $s1.ok) { $s1.data })"
  Check 'ALM2 header summed by SAP' ($hr.amounts.$b1 -eq '1350.50' -and $hr.amounts.$b10 -eq '25.00') "header b$b1=$($hr.amounts.$b1) b$b10=$($hr.amounts.$b10)"

  $s2 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $A + '","amounts":{"' + $b1 + '":"200","' + $b10 + '":""}}]}')
  $hr = Row $Hd $s2
  Check 'ALM2 change one, clear one' ($s2.ok -and $s2.data.result.updated -eq 1 -and $s2.data.result.deleted -eq 1) "updated=$($s2.data.result.updated) deleted=$($s2.data.result.deleted) $(if (-not $s2.ok) { $s2.data })"
  Check 'ALM2 header follows' ($hr.amounts.$b1 -eq '1450.50' -and -not $hr.amounts.$b10) "header b$b1=$($hr.amounts.$b1) b$b10='$($hr.amounts.$b10)'"

  $bad = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $Hd + '","amounts":{"' + $b1 + '":"5"}}]}')
  Check 'ALM2 header group refused by the engine' (-not $bad.ok -and $bad.data -match 'only source 92') "=> $($bad.data)"

  $s3 = Call PUT '/manualdata' ('{' + $sel + ',"rows":[{"groupId":"' + $A + '","amounts":{"' + $b1 + '":""}},{"groupId":"' + $B + '","amounts":{"' + $b1 + '":"0"}}]}')
  Check 'ALM2 clear all: period empty, header gone' ($s3.ok -and $s3.data.result.deleted -eq 2 -and (Filled $s3).Count -eq 0) "deleted=$($s3.data.result.deleted) rows with amounts=$((Filled $s3).Count) $(if (-not $s3.ok) { $s3.data })"

  # ---- ALM 3 ----
  $g3 = Grid 'alm3'
  $bk3 = @($g3.data.buckets | ForEach-Object { $_.bucket })
  $ed3 = @($g3.data.rows | Where-Object { $_.editable })
  Check 'ALM3 grid: ALM 2 buckets, no editable group on TFSIN' ($g3.ok -and $g3.data.area.bucketArea -eq 'ALM 2' -and $bk3.Count -eq 10 -and $ed3.Count -eq 0) "rows=$($g3.data.rows.Count) buckets=$($bk3.Count) editable=$($ed3.Count)"
  $bad3 = Call PUT '/manualdata' ('{"bukrs":"1000","year":"2099","month":"12","area":"alm3","rows":[{"groupId":"IA:07:01:00:00:00","amounts":{"' + $bk3[0] + '":"5"}}]}')
  Check 'ALM3 source-99 group refused by the engine' (-not $bad3.ok -and $bad3.data -match 'only source 92') "=> $($bad3.data)"
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Say "temporary instance (pid $($proc.Id)) stopped"
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
