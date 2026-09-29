# Smoke test for ZFS_SB_ALMRPTFMT_O4_API and ZFS_SB_ALMTIMEBKT_O4_API (DS4_100_TFSIN).
# Creates temporary rows (group parts ZT/Z1, a free bucket number from 99 down), exercises
# CRUD + ETag + validations, and deletes every row it created.
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

# ============================== Report Formats ==============================
$rf = Connect "$Base/sap/opu/odata4/sap/zfs_sb_almrptfmt_o4_api/srvd_a2x/sap/zfs_sd_almrptfmt/0001"
Say "Report Formats root: $($rf.Root)"
$m = Api $rf GET '$metadata' $null @{ Accept = 'application/xml' }
Check 'RF $metadata' $m @(200) { param($r) 'sets: ' + (([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', ') + ' | flags: ' + (([regex]::Matches($r.Body, 'Property Name="(InterestSplit|Negative|NonSensitive)" Type="([^"]+)"') | ForEach-Object { $_.Groups[2].Value } | Select-Object -Unique) -join ',') }
foreach ($set in 'Alm1Grouping', 'Alm2Grouping', 'Alm3Grouping') {
  Check "GET $set (count)" (Api $rf GET "$set`?`$top=2&`$count=true" $null) @(200) { param($x) "count=$((J $x).'@odata.count')" }
}
$src = (J (Api $rf GET 'Alm1Grouping?$top=1&$filter=Source ne ''''' $null)).value | Select-Object -First 1
$srcCode = if ($src) { $src.Source } else { '01' }

# ALM 1: compact ID from non-blank parts
$r = Api $rf POST 'Alm1Grouping' ('{"Grp1":"ZT","Grp2":"Z1","GroupName":"Smoke ALM1","Source":"' + $srcCode + '","XbrlCode":"SMOKE","InterestSplit":true}')
Check 'Alm1 create (GroupId derived ZT:Z1, source texts)' $r @(201) { param($x) $j = J $x; if ($j.GroupId -ne 'ZT:Z1') { "FAIL id=$($j.GroupId)" } else { "id=$($j.GroupId) srcDesc=$($j.SourceDesc) srcGrp=$($j.SourceGroup)" } }
Check 'Alm1 create duplicate refused' (Api $rf POST 'Alm1Grouping' '{"Grp1":"ZT","Grp2":"Z1","GroupName":"dup"}') @(400, 409)
Check 'Alm1 create wrong GroupId refused' (Api $rf POST 'Alm1Grouping' '{"GroupId":"XX","Grp1":"ZT","Grp2":"Z2","GroupName":"x"}') @(400)
Check 'Alm1 create colon in part refused' (Api $rf POST 'Alm1Grouping' '{"Grp1":"Z:","GroupName":"x"}') @(400)
Check 'Alm1 create unknown source refused' (Api $rf POST 'Alm1Grouping' '{"Grp1":"ZT","Grp2":"Z3","GroupName":"x","Source":"Q9"}') @(400)
$g = Fresh $rf "Alm1Grouping('ZT:Z1')"
Check 'Alm1 read + ETag' $g @(200) { param($x) "etag=$($x.ETag)" }
Start-Sleep -Seconds 2
Check 'Alm1 update (current ETag)' (Api $rf PATCH "Alm1Grouping('ZT:Z1')" '{"GroupName":"Smoke ALM1 v2","Negative":true}' @{ 'If-Match' = $g.ETag }) @(200, 204)
Check 'Alm1 update stale ETag refused' (Api $rf PATCH "Alm1Grouping('ZT:Z1')" '{"GroupName":"stale"}' @{ 'If-Match' = $g.ETag }) @(412)
Check 'Alm1 read after update' (Fresh $rf "Alm1Grouping('ZT:Z1')") @(200) { param($x) $j = J $x; if ($j.GroupName -ne 'Smoke ALM1 v2' -or $j.Negative -ne $true) { "FAIL name=$($j.GroupName) neg=$($j.Negative)" } else { "name=$($j.GroupName) neg=$($j.Negative)" } }

# ALM 2: Grp1 alone, else all five joined
$r = Api $rf POST 'Alm2Grouping' '{"Grp1":"ZT","Grp2":"Z1","GroupName":"Smoke ALM2","Portfolio":"P1"}'
Check 'Alm2 create (GroupId ZT:Z1:::)' $r @(201) { param($x) $j = J $x; if ($j.GroupId -ne 'ZT:Z1:::') { "FAIL id=$($j.GroupId)" } else { "id=$($j.GroupId)" } }
Check 'Alm2 create without name refused' (Api $rf POST 'Alm2Grouping' '{"Grp1":"ZT","Grp2":"Z9"}') @(400)
Check 'Alm2 update' (Api $rf PATCH "Alm2Grouping('ZT:Z1:::')" '{"TransactionType":"100"}' @{ 'If-Match' = '*' }) @(200, 204)

# ALM 3: six parts, interest type domain
$r = Api $rf POST 'Alm3Grouping' '{"Grp1":"ZT","Grp2":"Z1","GroupName":"Smoke ALM3","InterestType":"01","NonSensitive":true}'
Check 'Alm3 create (GroupId ZT:Z1::::)' $r @(201) { param($x) $j = J $x; if ($j.GroupId -ne 'ZT:Z1::::') { "FAIL id=$($j.GroupId)" } else { "id=$($j.GroupId) intType=$($j.InterestType)" } }
Check 'Alm3 create bad interest type refused' (Api $rf POST 'Alm3Grouping' '{"Grp1":"ZT","Grp2":"Z9","GroupName":"x","InterestType":"09"}') @(400)
Check 'Alm3 update' (Api $rf PATCH "Alm3Grouping('ZT:Z1::::')" '{"InterestType":"02"}' @{ 'If-Match' = '*' }) @(200, 204)

foreach ($k in "Alm3Grouping('ZT:Z1::::')", "Alm2Grouping('ZT:Z1:::')", "Alm1Grouping('ZT:Z1')") {
  Check "DELETE $k" (Api $rf DELETE $k $null @{ 'If-Match' = '*' }) @(204)
  Check "GET $k after delete" (Fresh $rf $k) @(404)
}

# ============================== Time Buckets ==============================
$tb = Connect "$Base/sap/opu/odata4/sap/zfs_sb_almtimebkt_o4_api/srvd_a2x/sap/zfs_sd_almtimebkt/0001"
Say "Time Buckets root: $($tb.Root)"
Check 'TB $metadata' (Api $tb GET '$metadata' $null @{ Accept = 'application/xml' }) @(200) { param($r) 'sets: ' + (([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', ') }
foreach ($set in 'Alm1Bucket', 'Alm2Bucket') { Check "GET $set (count)" (Api $tb GET "$set`?`$top=2&`$count=true" $null) @(200) { param($x) "count=$((J $x).'@odata.count')" } }
Check 'GET FrequencyDomain' (Api $tb GET 'FrequencyDomain' $null) @(200) { param($x) $v = (J $x).value; if ($v.Count -ne 6) { "FAIL rows=$($v.Count)" } else { ($v | ForEach-Object { "$($_.DomainField)/$($_.Value)=$($_.Text)" }) -join ' ' } }

$used1 = (J (Api $tb GET 'Alm1Bucket?$top=100' $null)).value | ForEach-Object { $_.Bucket }
$used2 = (J (Api $tb GET 'Alm2Bucket?$top=100' $null)).value | ForEach-Object { $_.Bucket }
$b = (99..90 | ForEach-Object { '{0:D2}' -f $_ } | Where-Object { $used1 -notcontains $_ -and $used2 -notcontains $_ } | Select-Object -First 1)
Say "Test bucket: $b"

$r = Api $tb POST 'Alm1Bucket' ('{"Bucket":"' + $b + '","Description":"Smoke ALM1 bucket","XbrlCode":"SMOKE","FromNo":"1","FromFreq":"02","ToNo":"3","ToFreq":"02","RbiNo":"9","FromDays":"30","ToDays":"90"}')
Check 'Alm1Bucket create' $r @(201) { param($x) $j = J $x; "bucket=$($j.Bucket) from=$($j.FromNo)/$($j.FromFreq) to=$($j.ToNo)/$($j.ToFreq)" }
Check 'Alm1Bucket duplicate refused' (Api $tb POST 'Alm1Bucket' ('{"Bucket":"' + $b + '","Description":"d","XbrlCode":"x"}')) @(400, 409)
Check 'Alm1Bucket bad frequency refused' (Api $tb POST 'Alm1Bucket' '{"Bucket":"89","Description":"d","XbrlCode":"x","FromFreq":"09"}') @(400)
Check 'Alm1Bucket non-numeric days refused' (Api $tb POST 'Alm1Bucket' '{"Bucket":"89","Description":"d","XbrlCode":"x","FromDays":"1A"}') @(400)
Check 'Alm1Bucket update' (Api $tb PATCH "Alm1Bucket('$b')" '{"ToNo":"6"}' @{ 'If-Match' = '*' }) @(200, 204)
Check 'Alm1Bucket read after update' (Fresh $tb "Alm1Bucket('$b')") @(200) { param($x) $j = J $x; if ([int]$j.ToNo -ne 6) { "FAIL toNo=$($j.ToNo)" } else { "toNo=$($j.ToNo)" } }

$r = Api $tb POST 'Alm2Bucket' ('{"Bucket":"' + $b + '","Description":"Smoke ALM2 bucket","XbrlCode":"SMOKE","FromNo":"0","FromFreq":"01","ToNo":"1","ToFreq":"02","ToDays":"30"}')
Check 'Alm2Bucket create' $r @(201)
Check 'Alm2Bucket create without frequency refused' (Api $tb POST 'Alm2Bucket' '{"Bucket":"89","Description":"d","XbrlCode":"x","FromFreq":"01"}') @(400)
Check 'Alm2Bucket update' (Api $tb PATCH "Alm2Bucket('$b')" '{"Description":"Smoke ALM2 bucket v2"}' @{ 'If-Match' = '*' }) @(200, 204)

foreach ($k in "Alm2Bucket('$b')", "Alm1Bucket('$b')") {
  Check "DELETE $k" (Api $tb DELETE $k $null @{ 'If-Match' = '*' }) @(204)
  Check "GET $k after delete" (Fresh $tb $k) @(404)
}

Say ''
Say "RESULT: $($script:pass) passed, $($script:fail) failed"
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
