# ALM application end-to-end check for the Budget Reporting tab (Report Formats module, table 'budget').
# Starts a temporary app instance on $Port from D:\SAP Tool\SAP - ALM Application (its .env, live SAP),
# signs in with the demo account from that .env, reads the module, then creates, updates and deletes
# BudgetGrouping ZT:Z1:Z1 through the app's own API and stops the instance. Never touches the instance on 8093.
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
    if ($Rows) { $p.Body = '{"rows":[' + (($Rows | ForEach-Object { $_ | ConvertTo-Json -Compress }) -join ',') + ']}'; $p.ContentType = 'application/json' }
    try { return @{ ok = $true; data = Invoke-RestMethod @p } }
    catch {
      # PowerShell 5.1 leaves ErrorDetails empty for a 422, so read the body from the response stream.
      $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($_.Exception.Response) {
        (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
      return @{ ok = $false; data = $msg }
    }
  }

  $v = Call GET '/reportformats'
  $b = $v.data.tables.budget
  Check 'view: odata mode, budget table read' ($v.ok -and $v.data.mode -eq 'odata' -and $b.Count -gt 0) "mode=$($v.data.mode) service=$($v.data.service) alm1/2/3/budget=$($v.data.tables.alm1.Count)/$($v.data.tables.alm2.Count)/$($v.data.tables.alm3.Count)/$($b.Count)"
  $row = $b | Where-Object { $_.source } | Select-Object -First 1
  Check 'view: source description derived' ($row -and $row.srcDesc) "$($row.grpId) source=$($row.source) srcDesc=$($row.srcDesc)"
  if ($b | Where-Object { $_.grpId -eq 'ZT:Z1:Z1' }) { Say 'ABORT: ZT:Z1:Z1 already exists'; exit 1 }
  $src = $row.source

  $c = Call POST '/reportformats/budget' @(@{ grp1 = 'ZT'; grp2 = 'Z1'; grp3 = 'Z1'; grpName = 'App smoke budget'; source = $src; lcrSource = $src })
  $made = $c.data.tables.budget | Where-Object { $_.grpId -eq 'ZT:Z1:Z1' }
  Check 'create through the app' ($c.ok -and $c.data.result.created -eq 1 -and $made) "created=$($c.data.result.created) lcrSrcDesc=$($made.lcrSrcDesc) $(if (-not $c.ok) { $c.data })"
  $bad = Call POST '/reportformats/budget' @(@{ grp1 = 'ZT'; grp2 = 'Z2'; grpName = 'x'; lcrSource = 'Q9' })
  Check 'unknown LCR source refused by the engine' (-not $bad.ok -and $bad.data -match 'lcrSource') "=> $($bad.data)"
  $u = Call PATCH '/reportformats/budget' @(@{ grp1 = 'ZT'; grp2 = 'Z1'; grp3 = 'Z1'; grpName = 'App smoke budget v2'; source = $src; lcrSource = '' })
  $after = $u.data.tables.budget | Where-Object { $_.grpId -eq 'ZT:Z1:Z1' }
  Check 'update through the app' ($u.ok -and $u.data.result.updated -eq 1 -and $after.grpName -eq 'App smoke budget v2' -and -not $after.lcrSource) "updated=$($u.data.result.updated) name=$($after.grpName) lcr='$($after.lcrSource)' $(if (-not $u.ok) { $u.data })"
  $d = Call DELETE '/reportformats/budget' @(@{ grp1 = 'ZT'; grp2 = 'Z1'; grp3 = 'Z1' })
  Check 'delete through the app' ($d.ok -and $d.data.result.deleted -eq 1) "deleted=$($d.data.result.deleted) $(if (-not $d.ok) { $d.data })"
  $v2 = Call GET '/reportformats'
  Check 'row gone, count restored' (-not ($v2.data.tables.budget | Where-Object { $_.grpId -eq 'ZT:Z1:Z1' }) -and $v2.data.tables.budget.Count -eq $b.Count) "budget=$($v2.data.tables.budget.Count)"
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Say "temporary instance (pid $($proc.Id)) stopped"
  Say ''
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
}
