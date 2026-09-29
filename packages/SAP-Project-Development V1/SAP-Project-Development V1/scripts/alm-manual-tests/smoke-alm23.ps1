# Smoke test for Alm2ManualData and Alm3ManualData in ZFS_SB_ALMMANUAL_O4_API (DS4_100_TFSIN).
# Company code 1000, period 2099/12 (no real data). ALM 2: children SB:11:01 and SB:11:02 (source 92) under the
# header SB:11:00:00:00; ALM 3 has no source-92 group on TFSIN, so only its refusals are tested.
# Aborts before any write if the period already holds rows (L-608); deletes only what it created.
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
  $hdr = @{ Authorization = $auth; Accept = 'application/json' }
  foreach ($k in $Extra.Keys) { $hdr[$k] = $Extra[$k] }
  if ($Method -ne 'GET') { $hdr['X-CSRF-Token'] = $S.Token }
  $p = @{ Method = $Method; Uri = "$($S.Root)/$Path${sep}sap-client=100"; Headers = $hdr; WebSession = $S.Session; UseBasicParsing = $true; TimeoutSec = 90 }
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
  return $ok
}

function Done { Say ("TOTAL: {0} passed, {1} failed" -f $script:pass, $script:fail); if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 } }

$md = Connect "$Base/sap/opu/odata4/sap/zfs_sb_almmanual_o4_api/srvd_a2x/sap/zfs_sd_almmanual/0001"
Say "Manual Data root: $($md.Root)"
$null = Check '$metadata' (Api $md GET '$metadata' $null @{ Accept = 'application/xml' }) @(200) { param($r) 'sets: ' + (([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', ') }
$null = Check 'Alm1ManualData still answers' (Api $md GET 'Alm1ManualData?$top=1' $null) @(200)

# Guard (L-608): the test period must be empty in both sets before anything is written.
foreach ($set in 'Alm2ManualData', 'Alm3ManualData') {
  $c = Fresh $md "$set`?`$filter=FiscalYear eq '2099' and FiscalPeriod eq '12'&`$count=true&`$top=0"
  $n = (J $c).'@odata.count'
  if (-not (Check "guard: $set 2099/12 empty" $c @(200) { param($x) if ($n -ne 0) { "FAIL count=$n" } else { 'count=0' } })) { Say 'ABORT: test period not empty, nothing written'; Done; exit 1 }
}

$P = "CompanyCode='1000',FiscalYear='2099',FiscalPeriod='12'"
function K([string]$set, [string]$g, [string]$b) { "$set($P,GroupId='$g',Bucket='$b')" }
function Row([string]$g, [string]$b, [string]$amt, [string]$month = '12') { '{"CompanyCode":"1000","FiscalYear":"2099","FiscalPeriod":"' + $month + '","GroupId":"' + $g + '","Bucket":"' + $b + '","Amount":' + $amt + '}' }
function Amt([string]$set, [string]$g, [string]$b) { $x = Fresh $md (K $set $g $b); if ($x.Status -eq 200) { return [decimal](J $x).Amount } else { return "HTTP $($x.Status)" } }
# Compare as decimals ("100.00" vs 100), and print the value on a fail too.
function Is([string]$name, $actual, [decimal]$want) {
  $ok = ($actual -is [decimal]) -and ($actual -eq $want)
  if ($ok) { $script:pass++; $tag = 'PASS' } else { $script:fail++; $tag = 'FAIL' }
  Say ("[{0}] {1} -> value {2} (expected {3})" -f $tag, $name, $actual, $want)
}

# ---- ALM 2 ----
$S2 = 'Alm2ManualData'; $H2 = 'SB:11:00:00:00'; $A = 'SB:11:01:00:00'; $B = 'SB:11:02:00:00'
$made = New-Object System.Collections.Generic.List[string]
if (Check 'ALM2 create SB:11:01 b1 = 100' (Api $md POST $S2 (Row $A '1' '100')) @(201) { param($x) "amount=$((J $x).Amount) createdBy=$((J $x).CreatedBy)" }) { $made.Add("$A|1") }
Is 'ALM2 header b1 = 100' (Amt $S2 $H2 '1') 100
if (Check 'ALM2 create SB:11:02 b1 = 50.5' (Api $md POST $S2 (Row $B '1' '50.5')) @(201)) { $made.Add("$B|1") }
if (Check 'ALM2 create SB:11:02 b10 = 10 (bucket 10)' (Api $md POST $S2 (Row $B '10' '10')) @(201)) { $made.Add("$B|10") }
Is 'ALM2 header b1 = 150.50' (Amt $S2 $H2 '1') 150.5
Is 'ALM2 header b10 = 10' (Amt $S2 $H2 '10') 10

$null = Check 'ALM2 duplicate create refused' (Api $md POST $S2 (Row $A '1' '1')) @(400, 409)
$null = Check 'ALM2 header group refused (009)' (Api $md POST $S2 (Row $H2 '2' '5')) @(400)
$null = Check 'ALM2 non-92 child refused (009)' (Api $md POST $S2 (Row 'SB:11:03:00:00' '2' '5')) @(400)
$null = Check 'ALM2 month 13 refused (010)' (Api $md POST $S2 (Row $A '1' '1' '13')) @(400)
$null = Check 'ALM2 bucket 11 refused (002, not in /FS00/ALMTR005)' (Api $md POST $S2 (Row $A '11' '1')) @(400)
$null = Check 'ALM2 ALM 1 group refused (002)' (Api $md POST $S2 (Row 'AA:02:01:00:00' '1' '1')) @(400)
$null = Check 'ALM2 string amount refused (L-244)' (Api $md POST $S2 (Row $A '2' '"5"')) @(400)

$g = Fresh $md (K $S2 $A '1')
$null = Check 'ALM2 read SB:11:01 b1 + ETag' $g @(200) { param($x) "etag=$($x.ETag)" }
$null = Check 'ALM2 PATCH with stale ETag refused' (Api $md PATCH (K $S2 $A '1') '{"Amount":1}' @{ 'If-Match' = 'W/"20000101000000.0000000"' }) @(412)
$null = Check 'ALM2 PATCH SB:11:01 b1 = 200' (Api $md PATCH (K $S2 $A '1') '{"Amount":200}' @{ 'If-Match' = $g.ETag }) @(200, 204)
Is 'ALM2 header b1 = 250.50' (Amt $S2 $H2 '1') 250.5
$null = Check 'ALM2 DELETE header refused (009)' (Api $md DELETE (K $S2 $H2 '1') $null @{ 'If-Match' = '*' }) @(400)

foreach ($k in @($made)) {
  $grp, $bkt = $k.Split('|')
  if (Check "ALM2 DELETE $grp b$bkt" (Api $md DELETE (K $S2 $grp $bkt) $null @{ 'If-Match' = '*' }) @(204)) { $null = $made.Remove($k) }
}
$null = Check 'ALM2 header b10 gone (sum 0)' (Fresh $md (K $S2 $H2 '10')) @(404)
$null = Check 'ALM2 period empty after clean-up' (Fresh $md "$S2`?`$filter=FiscalYear eq '2099'&`$count=true") @(200) { param($x) $n = (J $x).'@odata.count'; if ($n -ne 0) { "FAIL count=$n" } else { 'count=0' } }

# ---- ALM 3 (no source-92 group on TFSIN) ----
$S3 = 'Alm3ManualData'
$null = Check 'ALM3 GET collection' (Api $md GET "$S3`?`$top=1&`$count=true" $null) @(200) { param($x) "count=$((J $x).'@odata.count')" }
$null = Check 'ALM3 header group refused (009)' (Api $md POST $S3 (Row 'IA:01:00:00:00:00' '1' '5')) @(400)
$null = Check 'ALM3 source-99 group refused (009)' (Api $md POST $S3 (Row 'IA:07:01:00:00:00' '1' '5')) @(400)
$null = Check 'ALM3 ALM 2 group refused (002)' (Api $md POST $S3 (Row $A '1' '5')) @(400)
$null = Check 'ALM3 month 13 refused (010)' (Api $md POST $S3 (Row 'IA:01:00:00:00:00' '1' '1' '13')) @(400)
$null = Check 'ALM3 period still empty' (Fresh $md "$S3`?`$filter=FiscalYear eq '2099'&`$count=true") @(200) { param($x) $n = (J $x).'@odata.count'; if ($n -ne 0) { "FAIL count=$n" } else { 'count=0' } }

if ($made.Count) { Say ("LEFT BEHIND (delete by hand): " + ($made -join ', ')) }
Done
