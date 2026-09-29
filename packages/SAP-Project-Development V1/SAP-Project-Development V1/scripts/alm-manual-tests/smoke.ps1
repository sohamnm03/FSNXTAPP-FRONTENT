# Smoke test for ZFS_SB_ALMMANUAL_O4_API (DS4_100_TFSIN), entity set Alm1ManualData.
# Uses company code 1000, period 2099/12 (no real data), children AA:02:01 and AA:02:06 (source 92)
# and their header AA:02:00:00:00. Deletes every row it created; the header row goes with its children.
# Password comes from $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [string]$Base = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0

function Say([string]$t) { $script:log.Add($t); Write-Output $t }

function Connect([string]$Root) {
  $s = @{ Root = $Root; Session = (New-Object Microsoft.PowerShell.Commands.WebRequestSession) }
  $t = Invoke-WebRequest -Uri "$Root/?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/json' } -WebSession $s.Session -UseBasicParsing -TimeoutSec 90
  $s.Token = $t.Headers['x-csrf-token']
  return $s
}

function Api($S, [string]$Method, [string]$Path, [string]$Body, [hashtable]$Extra = @{}) {
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  $h = @{ Authorization = $auth; Accept = 'application/json' }
  foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
  if ($Method -ne 'GET') { $h['X-CSRF-Token'] = $S.Token }
  $p = @{ Method = $Method; Uri = "$($S.Root)/$Path${sep}sap-client=100"; Headers = $h; WebSession = $S.Session; UseBasicParsing = $true; TimeoutSec = 90 }
  if ($Body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes($Body); $p['ContentType'] = 'application/json' }
  try { $r = Invoke-WebRequest @p; return @{ Status = [int]$r.StatusCode; Body = $r.Content; ETag = $r.Headers['ETag'] } }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ Status = 0; Body = $_.Exception.Message; ETag = $null } }
    return @{ Status = [int]$resp.StatusCode; Body = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }); ETag = $null }
  }
}

# Read-backs after a write use a fresh, cookieless request (same-session GET-by-key answers 501, L-596).
function Fresh($S, [string]$Path) {
  $sep = if ($Path.Contains("?")) { "&" } else { "?" }
  try { $r = Invoke-WebRequest -Uri "$($S.Root)/${Path}${sep}sap-client=100" -Headers @{ Authorization = $auth; Accept = 'application/json' } -UseBasicParsing -TimeoutSec 90
        return @{ Status = [int]$r.StatusCode; Body = $r.Content; ETag = $r.Headers['ETag'] } }
  catch { return @{ Status = [int]$_.Exception.Response.StatusCode; Body = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }); ETag = $null } }
}

function J($Res) { try { return $Res.Body | ConvertFrom-Json } catch { return $null } }

function Check([string]$Name, $Res, [int[]]$Expect, [scriptblock]$Extra) {
  $ok = $Expect -contains $Res.Status
  $note = ''
  if ($ok -and $Extra) { $note = & $Extra $Res; if ($note -like 'FAIL*') { $ok = $false } }
  if ($Res.Status -ge 400) {
    $m = [regex]::Match([string]$Res.Body, '"message":"([^"]+)"')
    $note = "$note => " + $(if ($m.Success) { $m.Groups[1].Value } else { ([string]$Res.Body).Substring(0, [Math]::Min(200, ([string]$Res.Body).Length)) })
  }
  if ($ok) { $script:pass++ ; $tag = 'PASS' } else { $script:fail++ ; $tag = 'FAIL' }
  Say ("[{0}] {1} -> HTTP {2} (expected {3}) {4}" -f $tag, $Name, $Res.Status, ($Expect -join '/'), $note)
}

$md = Connect "$Base/sap/opu/odata4/sap/zfs_sb_almmanual_o4_api/srvd_a2x/sap/zfs_sd_almmanual/0001"
Say "Manual Data root: $($md.Root)"
$m = Api $md GET '$metadata' $null @{ Accept = 'application/xml' }
Check '$metadata' $m @(200) { param($r) 'sets: ' + (([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', ') + ' | Amount: ' + ([regex]::Match($r.Body, 'Property Name="Amount"[^>]*')).Value }

$P = "CompanyCode='1000',FiscalYear='2099',FiscalPeriod='12'"
function K([string]$g, [string]$b) { "Alm1ManualData($P,GroupId='$g',Bucket='$b')" }
function Row([string]$g, [string]$b, [string]$amt) { '{"CompanyCode":"1000","FiscalYear":"2099","FiscalPeriod":"12","GroupId":"' + $g + '","Bucket":"' + $b + '","Amount":' + $amt + '}' }
function Amt([string]$g, [string]$b) { $x = Fresh $md (K $g $b); if ($x.Status -eq 200) { return [decimal](J $x).Amount } else { return "HTTP $($x.Status)" } }
$H = 'AA:02:00:00:00'; $C1 = 'AA:02:01:00:00'; $C2 = 'AA:02:06:00:00'

Check 'GET collection' (Api $md GET 'Alm1ManualData?$top=1&$count=true' $null) @(200) { param($x) "count=$((J $x).'@odata.count')" }
Check 'create C1 b1 = 100' (Api $md POST 'Alm1ManualData' (Row $C1 '1' '100')) @(201) { param($x) "amount=$((J $x).Amount) createdBy=$((J $x).CreatedBy)" }
$a = Amt $H '1'; Check 'header b1 = 100' @{ Status = $(if ($a -eq 100) { 200 } else { 0 }); Body = "$a" } @(200) { param($x) "header=$($x.Body)" }
Check 'create C2 b1 = 50.5' (Api $md POST 'Alm1ManualData' (Row $C2 '1' '50.5')) @(201)
Check 'create C2 b7 = 10 (bucket 7)' (Api $md POST 'Alm1ManualData' (Row $C2 '7' '10')) @(201)
$a = Amt $H '1'; Check 'header b1 = 150.50' @{ Status = $(if ($a -eq 150.5) { 200 } else { 0 }); Body = "$a" } @(200) { param($x) "header=$($x.Body)" }
$a = Amt $H '7'; Check 'header b7 = 10' @{ Status = $(if ($a -eq 10) { 200 } else { 0 }); Body = "$a" } @(200) { param($x) "header=$($x.Body)" }

Check 'duplicate create refused' (Api $md POST 'Alm1ManualData' (Row $C1 '1' '1')) @(400, 409)
Check 'header group refused (009, source not 92)' (Api $md POST 'Alm1ManualData' (Row $H '2' '5')) @(400)
Check 'month 13 refused (010)' (Api $md POST 'Alm1ManualData' ('{"CompanyCode":"1000","FiscalYear":"2099","FiscalPeriod":"13","GroupId":"' + $C1 + '","Bucket":"1","Amount":1}')) @(400)
Check 'unknown bucket 99 refused (002)' (Api $md POST 'Alm1ManualData' (Row $C1 '99' '1')) @(400)
Check 'unknown group refused (002)' (Api $md POST 'Alm1ManualData' (Row 'ZZ:99:99:00:00' '1' '1')) @(400)
Check 'unknown company code refused (002)' (Api $md POST 'Alm1ManualData' ('{"CompanyCode":"ZZZZ","FiscalYear":"2099","FiscalPeriod":"12","GroupId":"' + $C1 + '","Bucket":"1","Amount":1}')) @(400)
Check 'string amount refused (L-244)' (Api $md POST 'Alm1ManualData' (Row $C1 '2' '"5"')) @(400)

$g = Fresh $md (K $C1 '1')
Check 'read C1 b1 + ETag' $g @(200) { param($x) "etag=$($x.ETag)" }
Check 'PATCH with stale ETag refused' (Api $md PATCH (K $C1 '1') '{"Amount":1}' @{ 'If-Match' = 'W/"20000101000000.0000000"' }) @(412)
Check 'PATCH C1 b1 = 200' (Api $md PATCH (K $C1 '1') '{"Amount":200}' @{ 'If-Match' = $g.ETag }) @(200, 204)
$a = Amt $H '1'; Check 'header b1 = 250.50' @{ Status = $(if ($a -eq 250.5) { 200 } else { 0 }); Body = "$a" } @(200) { param($x) "header=$($x.Body)" }
# A key property in a PATCH body is ignored by the V4 gateway (not refused): the row keeps its key.
Check 'PATCH key field ignored' (Api $md PATCH (K $C1 '1') '{"Bucket":"2"}' @{ 'If-Match' = '*' }) @(200, 204, 400)
Check 'key unchanged: C1 b1 still there' (Fresh $md (K $C1 '1')) @(200)
Check 'key unchanged: no C1 b2' (Fresh $md (K $C1 '2')) @(404)
Check 'DELETE header refused (009)' (Api $md DELETE (K $H '1') $null @{ 'If-Match' = '*' }) @(400)

Check 'DELETE C2 b7' (Api $md DELETE (K $C2 '7') $null @{ 'If-Match' = '*' }) @(204)
Check 'header b7 gone (sum 0)' (Fresh $md (K $H '7')) @(404)
Check 'DELETE C2 b1' (Api $md DELETE (K $C2 '1') $null @{ 'If-Match' = '*' }) @(204)
$a = Amt $H '1'; Check 'header b1 = 200' @{ Status = $(if ($a -eq 200) { 200 } else { 0 }); Body = "$a" } @(200) { param($x) "header=$($x.Body)" }
Check 'DELETE C1 b1' (Api $md DELETE (K $C1 '1') $null @{ 'If-Match' = '*' }) @(204)
Check 'period empty after clean-up' (Fresh $md "Alm1ManualData?`$filter=FiscalYear eq '2099'&`$count=true") @(200) { param($x) $n = (J $x).'@odata.count'; if ($n -ne 0) { "FAIL count=$n" } else { 'count=0' } }

Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
