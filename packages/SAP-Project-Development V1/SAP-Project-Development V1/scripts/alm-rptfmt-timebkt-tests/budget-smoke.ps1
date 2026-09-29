# Smoke test for the BudgetGrouping entity (/FS00/ALMTR006) of ZFS_SB_ALMRPTFMT_O4_API (DS4_100_TFSIN).
# Creates temporary rows (group ZT, ZT:Z1:Z1), exercises CRUD + ETag + validations,
# and deletes every row it created.
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
  try { $r = Invoke-WebRequest -Uri "$($S.Root)/${Path}?sap-client=100" -Headers @{ Authorization = $auth; Accept = 'application/json' } -UseBasicParsing -TimeoutSec 90
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

$rf = Connect "$Base/sap/opu/odata4/sap/zfs_sb_almrptfmt_o4_api/srvd_a2x/sap/zfs_sd_almrptfmt/0001"
Say "Report Formats root: $($rf.Root)"
Check 'RF $metadata has BudgetGrouping' (Api $rf GET '$metadata' $null @{ Accept = 'application/xml' }) @(200) { param($r) $s = ([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', '; if ($s -notmatch 'BudgetGrouping') { "FAIL sets: $s" } else { "sets: $s" } }
Check 'GET BudgetGrouping (count)' (Api $rf GET 'BudgetGrouping?$top=2&$count=true' $null) @(200) { param($x) "count=$((J $x).'@odata.count')" }
foreach ($k in "BudgetGrouping('ZT')", "BudgetGrouping('ZT:Z1:Z1')") {
  if ((Fresh $rf $k).Status -eq 200) { Say "ABORT: $k already exists"; exit 1 }
}
$srcs = (J (Api $rf GET 'Alm1Grouping?$top=50&$filter=Source ne ''''' $null)).value | ForEach-Object { $_.Source } | Select-Object -Unique
$s1 = $srcs[0]; $s2 = if ($srcs.Count -gt 1) { $srcs[1] } else { $srcs[0] }
Say "Sources used: $s1 / $s2"

# Grp1 only -> GroupId = Grp1
Check 'Create Grp1 only (GroupId ZT)' (Api $rf POST 'BudgetGrouping' '{"Grp1":"ZT","GroupName":"Smoke budget header"}') @(201) { param($x) $j = J $x; if ($j.GroupId -ne 'ZT') { "FAIL id=$($j.GroupId)" } else { "id=$($j.GroupId)" } }
# Three parts -> g1:g2:g3, both source texts derived
$r = Api $rf POST 'BudgetGrouping' ('{"Grp1":"ZT","Grp2":"Z1","Grp3":"Z1","GroupName":"Smoke budget","Source":"' + $s1 + '","LcrSource":"' + $s2 + '"}')
Check 'Create ZT:Z1:Z1 with both sources' $r @(201) { param($x) $j = J $x; if ($j.GroupId -ne 'ZT:Z1:Z1' -or -not $j.SourceDesc -or -not $j.LcrSourceDesc) { "FAIL id=$($j.GroupId) srcDesc=$($j.SourceDesc) lcrDesc=$($j.LcrSourceDesc)" } else { "id=$($j.GroupId) srcDesc=$($j.SourceDesc) lcrDesc=$($j.LcrSourceDesc)" } }
Check 'Create duplicate refused' (Api $rf POST 'BudgetGrouping' '{"Grp1":"ZT","Grp2":"Z1","Grp3":"Z1","GroupName":"dup"}') @(400, 409)
Check 'Create wrong GroupId refused' (Api $rf POST 'BudgetGrouping' '{"GroupId":"XX","Grp1":"ZT","Grp2":"Z2","GroupName":"x"}') @(400)
Check 'Create colon in part refused' (Api $rf POST 'BudgetGrouping' '{"Grp1":"Z:","GroupName":"x"}') @(400)
Check 'Create unknown Source refused' (Api $rf POST 'BudgetGrouping' '{"Grp1":"ZT","Grp2":"Z3","GroupName":"x","Source":"Q9"}') @(400)
Check 'Create unknown LcrSource refused' (Api $rf POST 'BudgetGrouping' '{"Grp1":"ZT","Grp2":"Z3","GroupName":"x","LcrSource":"Q9"}') @(400)
Check 'Create empty GroupName refused' (Api $rf POST 'BudgetGrouping' '{"Grp1":"ZT","Grp2":"Z3","GroupName":""}') @(400)

$g = Fresh $rf "BudgetGrouping('ZT:Z1:Z1')"
Check 'Read + ETag' $g @(200) { param($x) "etag=$($x.ETag)" }
Start-Sleep -Seconds 2
Check 'Update (current ETag), clear LcrSource' (Api $rf PATCH "BudgetGrouping('ZT:Z1:Z1')" '{"GroupName":"Smoke budget v2","LcrSource":""}' @{ 'If-Match' = $g.ETag }) @(200, 204)
Check 'Update stale ETag refused' (Api $rf PATCH "BudgetGrouping('ZT:Z1:Z1')" '{"GroupName":"stale"}' @{ 'If-Match' = $g.ETag }) @(412)
Check 'Update unknown LcrSource refused' (Api $rf PATCH "BudgetGrouping('ZT:Z1:Z1')" '{"LcrSource":"Q9"}' @{ 'If-Match' = '*' }) @(400)
Check 'Read after update' (Fresh $rf "BudgetGrouping('ZT:Z1:Z1')") @(200) { param($x) $j = J $x; if ($j.GroupName -ne 'Smoke budget v2' -or $j.LcrSource -or $j.LcrSourceDesc -or -not $j.SourceDesc) { "FAIL name=$($j.GroupName) lcr=$($j.LcrSource)/$($j.LcrSourceDesc) src=$($j.Source)/$($j.SourceDesc)" } else { "name=$($j.GroupName) src=$($j.Source)/$($j.SourceDesc) lcr cleared" } }

foreach ($k in "BudgetGrouping('ZT:Z1:Z1')", "BudgetGrouping('ZT')") {
  Check "DELETE $k" (Api $rf DELETE $k $null @{ 'If-Match' = '*' }) @(204)
  Check "GET $k after delete" (Fresh $rf $k) @(404)
}
Check 'DELETE missing key refused' (Api $rf DELETE "BudgetGrouping('ZT:Z9:Z9')" $null @{ 'If-Match' = '*' }) @(404, 400)

Say ''
Say "RESULT: $($script:pass) passed, $($script:fail) failed"
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
