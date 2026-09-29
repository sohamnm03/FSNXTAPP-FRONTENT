# Read-only reconciliation of every ALM app report against its SAP OData service for one company code and period.
# Starts a temporary app instance on $Port (its .env, live SAP; never touches 8093), signs in with the demo account, reads each
# report through the app and the same SAP service directly (all pages), and compares row count, row order and every mapped field
# (amounts as [decimal], L-610). No Save / Lock / Delete, no manual-data write: GET only.
# Writes app-<report>.json / sap-<report>.json and the log into $OutDir.
# L-601: 127.0.0.1, Origin + x-alm-request. L-604: no variables differing only by case. L-619: array elements with operators parenthesised.
param(
  [string]$App = 'D:\SAP Tool\SAP - ALM Application',
  [int]$Port = 8099,
  [string]$Bukrs = '1000',
  [string]$Year = '2025',
  [string]$Month = '10',
  [Parameter(Mandatory)] [string]$OutDir,
  [switch]$Keep
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0
function Say([string]$t) { $script:log.Add($t); Write-Host $t }
function Check([string]$Name, [bool]$Ok, [string]$Note) {
  if ($Ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} {2}" -f $tag, $Name, $Note)
}
function Dump([string]$Name, $Data) { ConvertTo-Json -InputObject $Data -Depth 12 -Compress | Set-Content -Path (Join-Path $OutDir $Name) -Encoding utf8 }

$envFile = @{}
Get-Content (Join-Path $App '.env') | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } | ForEach-Object { $envFile[$Matches[1]] = $Matches[2].Trim('"') }
$demoUser = if ($envFile['DEMO_USER']) { $envFile['DEMO_USER'] } else { 'demo' }
$sapAuth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$env:SAP_DS4_100_TFSIN_PASSWORD"))
function Contract([string]$Name) { Get-Content (Join-Path $App "config\$Name-odata.json") -Raw | ConvertFrom-Json }

# All pages of one SAP read (the gateway pages; follow @odata.nextLink).
function SapAll([string]$Root, [string]$Path, [string]$Query) {
  $uri = "$Root$Path`?sap-client=100" + $(if ($Query) { "&$Query" } else { '' })
  $rows = New-Object System.Collections.Generic.List[object]
  for ($pg = 0; $pg -lt 60 -and $uri; $pg++) {
    $d = Invoke-RestMethod -Uri $uri -Headers @{ Authorization = $sapAuth; Accept = 'application/json' } -TimeoutSec 600
    foreach ($r in @($d.value)) { if ($null -ne $r) { $rows.Add($r) } }
    $next = $d.'@odata.nextLink'
    if ($next) {
      if ($next -notmatch '^https?:') { $next = (New-Object Uri((New-Object Uri($Root)), $next)).AbsoluteUri }
      if ($next -notmatch 'sap-client=') { $next += '&sap-client=100' }
      $uri = $next
    } else { $uri = $null }
  }
  return ,$rows.ToArray()
}
function SapOne([string]$Root, [string]$Path) { Invoke-RestMethod -Uri "$Root$Path`?sap-client=100" -Headers @{ Authorization = $sapAuth; Accept = 'application/json' } -TimeoutSec 600 }

# Value equality: numbers as [decimal]; digit strings without leading zeros (the app pads G/L accounts and NUMC buckets); else trimmed text.
function Norm($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [bool]) { return $v.ToString().ToLower() }
  $s = ([string]$v).Trim()
  if ($s -match '^-?\d+(\.\d+)?$') { return ([decimal]$s).ToString('0.############', [Globalization.CultureInfo]::InvariantCulture) }
  if ($s -match '^\d+$') { return $s.TrimStart('0') }
  return $s
}
function Same($a, $b) {
  $x = Norm $a; $y = Norm $b
  if ($x -eq $y) { return $true }
  # blank vs zero (the app fills a missing amount with 0, a missing NUMC with '')
  if (($x -eq '' -and $y -eq '0') -or ($x -eq '0' -and $y -eq '')) { return $true }
  return $false
}

# Compare app rows (app field names) with SAP rows (SAP property names) through a contract field map, row by row in order.
function Compare-Rows([string]$Name, $AppRows, $SapRows, $FieldMap, [string[]]$KeyFields, [string[]]$AmountFields) {
  $appList = @($AppRows); $sapList = @($SapRows)
  Check "$Name row count" ($appList.Count -eq $sapList.Count) "app=$($appList.Count) sap=$($sapList.Count)"
  $fields = @($FieldMap.PSObject.Properties | ForEach-Object { $_.Name })
  $diffs = 0; $shown = 0; $cells = 0
  $n = [Math]::Min($appList.Count, $sapList.Count)
  for ($i = 0; $i -lt $n; $i++) {
    foreach ($f in $fields) {
      $p = $FieldMap.$f; $cells++
      $av = $appList[$i].$f; $sv = $sapList[$i].$p
      if (-not (Same $av $sv)) {
        $diffs++
        if ($shown -lt 15) { $shown++; $key = ($KeyFields | ForEach-Object { "$_=$($sapList[$i].($FieldMap.$_))" }) -join ' '; Say "    diff row $i [$key] $f/$p app='$av' sap='$sv'" }
      }
    }
  }
  Check "$Name every field equal" ($diffs -eq 0) "cells compared=$cells differences=$diffs"
  foreach ($a in $AmountFields) {
    $p = $FieldMap.$a
    $sa = [decimal]0; $sb = [decimal]0
    foreach ($r in $appList) { if ($null -ne $r.$a -and "$($r.$a)" -ne '') { $sa += [decimal]"$($r.$a)" } }
    foreach ($r in $sapList) { if ($null -ne $r.$p -and "$($r.$p)" -ne '') { $sb += [decimal]"$($r.$p)" } }
    Say ("    sum {0}: app={1:N2} sap={2:N2}" -f $a, $sa, $sb)
  }
}

$env:PORT = "$Port"
$env:APP_ORIGINS = "http://localhost:$Port,http://127.0.0.1:$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $App -PassThru -WindowStyle Hidden
try {
  $base = "http://127.0.0.1:$Port"
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) { try { Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { if ($_.Exception.Response) { $up = $true } else { Start-Sleep -Milliseconds 500 } } }
  Check 'temporary app instance up' $up "port $Port pid $($proc.Id)"
  $web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $reqHeaders = @{ Origin = $base; 'x-alm-request' = '1' }
  $loginBody = @{ username = $demoUser; password = $envFile['DEMO_PASSWORD'] } | ConvertTo-Json
  $login = Invoke-RestMethod "$base/api/session" -Method Post -Body $loginBody -ContentType 'application/json' -WebSession $web -Headers $reqHeaders
  Check 'sign in' ($null -ne $login.username) "user=$($login.username)"
  function AppGet([string]$Path) { Invoke-RestMethod -Uri "$base/api$Path" -WebSession $web -Headers $reqHeaders -TimeoutSec 900 }

  $sel = "bukrs=$Bukrs&year=$Year&month=$Month"
  $params = "(P_CompanyCode='$Bukrs',P_FiscalYear='$Year',P_FiscalPeriod='$Month')"
  $lastDay = ([datetime]::new([int]$Year, [int]$Month, 1)).AddMonths(1).AddDays(-1).ToString('yyyy-MM-dd')
  Say "Selection: company code $Bukrs, $Month/$Year (balance key date $lastDay)"

  # --- TRM Repayment Cashflows ALM 1, TRM Accrual Cashflow, TRM Principal O/S ---
  $trmReports = @(
    @{ id = 'trmrepay'; appPath = "/trmrepay?$sel"; root = $envFile['SAP_TRMREPAY_URL']; spec = (Contract 'trmrepay') },
    @{ id = 'trm-accrual'; appPath = "/trmdata/accrual?$sel"; root = $envFile['SAP_TRMDATA_URL']; spec = (Contract 'trmdata').reports.accrual },
    @{ id = 'trm-principal'; appPath = "/trmdata/principal?$sel"; root = $envFile['SAP_TRMDATA_URL']; spec = (Contract 'trmdata').reports.principal }
  )
  foreach ($t in $trmReports) {
    Say "== $($t.id)"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $a = AppGet $t.appPath; $appSec = $sw.Elapsed.TotalSeconds; $sw.Restart()
    $s = SapAll $t.root "$($t.spec.entitySet)$params/Set" '$top=5000'; $sapSec = $sw.Elapsed.TotalSeconds
    Say ("    read app {0:N1}s, sap {1:N1}s" -f $appSec, $sapSec)
    Dump "app-$($t.id).json" $a; Dump "sap-$($t.id).json" $s
    $amt = @($t.spec.fields.PSObject.Properties.Name | Where-Object { $_ -match '^b\d+$|^total$' })
    Compare-Rows $t.id $a.rows $s $t.spec.fields @('dealNumber', 'securityId', 'sourceType') $amt
  }

  # --- GL Account Details, GL Account Balance Details (all rows incl. zero balances) ---
  $tb = Contract 'tbdata'
  Say '== gl-accounts'
  $a = AppGet "/tbdata/accounts?bukrs=$Bukrs"
  $s = SapAll $envFile['SAP_TBDATA_URL'] $tb.accounts.entitySet ('$top=5000&$filter=' + [Uri]::EscapeDataString("$($tb.accounts.filters.bukrs) eq '$Bukrs'"))
  Dump 'app-gl-accounts.json' $a; Dump 'sap-gl-accounts.json' $s
  Compare-Rows 'gl-accounts' $a.rows $s $tb.accounts.fields @('glAccount') @()
  Say '== gl-balances'
  $a = AppGet "/tbdata/balances?$sel&zero=1"
  $s = SapAll $envFile['SAP_TBDATA_URL'] "$($tb.balances.entitySet)($($tb.balances.parameters.bukrs)='$Bukrs',$($tb.balances.parameters.keyDate)=$lastDay)/Set" '$top=5000'
  Dump 'app-gl-balances.json' $a; Dump 'sap-gl-balances.json' $s
  Check 'gl-balances key date' ($a.keyDate -eq $lastDay) "app keyDate=$($a.keyDate)"
  Compare-Rows 'gl-balances' $a.rows $s $tb.balances.fields @('glAccount') @('balance')
  $aNz = AppGet "/tbdata/balances?$sel"
  $sNz = @($s | Where-Object { [decimal]"$($_.($tb.balances.fields.balance))" -ne 0 })
  Check 'gl-balances non-zero view' (@($aNz.rows).Count -eq $sNz.Count) "app=$(@($aNz.rows).Count) sap non-zero=$($sNz.Count)"

  # --- Quarterly ALM 1 / ALM 2 / ALM 3 reports and their period status ---
  $qtr = @(
    @{ id = 'qtr-alm1'; area = 'alm1'; root = $envFile['SAP_QTRREPORT_URL']; spec = (Contract 'qtrreport') },
    @{ id = 'qtr-alm2'; area = 'alm2'; root = $envFile['SAP_QTR2REPORT_URL']; spec = (Contract 'qtr2report') },
    @{ id = 'qtr-alm3'; area = 'alm3'; root = $envFile['SAP_QTR3REPORT_URL']; spec = (Contract 'qtr3report') }
  )
  foreach ($q in $qtr) {
    Say "== $($q.id)"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $a = AppGet "/qtrreport?area=$($q.area)&$sel"; $appSec = $sw.Elapsed.TotalSeconds; $sw.Restart()
    $s = SapAll $q.root "$($q.spec.reportSet)$params/Set" '$top=5000'; $sapSec = $sw.Elapsed.TotalSeconds
    $pk = "$($q.spec.periodSet)($($q.spec.keys.bukrs)='$Bukrs',$($q.spec.keys.year)='$Year',$($q.spec.keys.month)='$Month')"
    $sp = SapOne $q.root $pk
    Say ("    read app {0:N1}s, sap {1:N1}s" -f $appSec, $sapSec)
    Dump "app-$($q.id).json" $a; Dump "sap-$($q.id).json" $s; Dump "sap-$($q.id)-period.json" $sp
    $amt = @($q.spec.fields.PSObject.Properties.Name | Where-Object { $_ -match '^b\d+$|^total$' })
    Compare-Rows $q.id $a.rows $s $q.spec.fields @('groupId') $amt
    $pd = 0
    foreach ($f in $q.spec.periodFields.PSObject.Properties.Name) { if (-not (Same $a.period.$f $sp.($q.spec.periodFields.$f))) { $pd++; Say "    period diff $f app='$($a.period.$f)' sap='$($sp.($q.spec.periodFields.$f))'" } }
    Check "$($q.id) period status equal" ($pd -eq 0) "saved=$($sp.Saved) savedRows=$($sp.SavedRows) locked=$($sp.Locked)"
  }

  # --- Update Manual Data ALM 1 / 2 / 3: the stored amounts behind the grid ---
  $md = Contract 'manualdata'
  foreach ($m in @(@{ area = 'alm1'; table = 'amounts' }, @{ area = 'alm2'; table = 'alm2' }, @{ area = 'alm3'; table = 'alm3' })) {
    $id = "manual-$($m.area)"
    Say "== $id"
    $a = AppGet "/manualdata?$sel&area=$($m.area)"
    $es = $md.tables.($m.table).entitySet
    $flt = [Uri]::EscapeDataString("CompanyCode eq '$Bukrs' and FiscalYear eq '$Year' and FiscalPeriod eq '$Month'")
    $s = SapAll $envFile['SAP_MANUALDATA_URL'] $es "`$top=5000&`$filter=$flt"
    Dump "app-$id.json" $a; Dump "sap-$id.json" $s
    Say "    sap rows=$($s.Count)"
  }
}
finally {
  if (-not $Keep) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Say "temporary app instance on $Port stopped" }
  Say "RESULT: $($script:pass) passed, $($script:fail) failed"
  $script:log | Set-Content -Path (Join-Path $OutDir 'app-vs-sap.txt') -Encoding utf8
}
