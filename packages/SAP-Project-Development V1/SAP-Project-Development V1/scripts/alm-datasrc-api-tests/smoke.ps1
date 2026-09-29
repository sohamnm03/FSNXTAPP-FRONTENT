# Smoke test for ZFS_SB_ALMDATASRC_O4_API (DS4_100_TFSIN).
# Creates temporary rows with keys starting ZT, exercises CRUD + ETag + validations,
# and deletes every row it created. Password comes from $env:SAP_DS4_100_TFSIN_PASSWORD.
param(
  [string]$Base = 'https://vhtfqds4ap01.sap.tfsin.co.in:44300',
  [string]$User = 'FS_DEV3',
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
$root = "$Base/sap/opu/odata4/sap/zfs_sb_almdatasrc_o4_api/srvd_a2x/sap/zfs_sd_almdatasrc/0001"
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:$env:SAP_DS4_100_TFSIN_PASSWORD"))
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:log = New-Object System.Collections.Generic.List[string]
$script:pass = 0; $script:fail = 0

function Say([string]$t) { $script:log.Add($t); Write-Output $t }

function Api([string]$Method, [string]$Path, [string]$Body, [hashtable]$Extra = @{}) {
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  $h = @{ Authorization = $auth; Accept = 'application/json' }
  foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
  if ($Method -ne 'GET') { $h['X-CSRF-Token'] = $script:token }
  $p = @{ Method = $Method; Uri = "$root/$Path${sep}sap-client=100"; Headers = $h; WebSession = $session; UseBasicParsing = $true; TimeoutSec = 90 }
  if ($Body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes($Body); $p['ContentType'] = 'application/json' }
  try { $r = Invoke-WebRequest @p; return @{ Status = [int]$r.StatusCode; Body = $r.Content; ETag = $r.Headers['ETag'] } }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ Status = 0; Body = $_.Exception.Message; ETag = $null } }
    # PowerShell 5.1 has already consumed the response stream; the body is in ErrorDetails.
    $txt = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }
    return @{ Status = [int]$resp.StatusCode; Body = $txt; ETag = $null }
  }
}

function Check([string]$Name, $Res, [int[]]$Expect, [scriptblock]$Extra) {
  $ok = $Expect -contains $Res.Status
  $note = ''
  if ($ok -and $Extra) { $note = & $Extra $Res; if ($note -like 'FAIL*') { $ok = $false } }
  if (-not $ok -or $Res.Status -ge 400) {
    $b = $Res.Body; if ($b.Length -gt 300) { $b = $b.Substring(0, 300) }
    $note = "$note | body: $b"
  }
  if ($ok) { $script:pass++ ; $tag = 'PASS' } else { $script:fail++ ; $tag = 'FAIL' }
  Say ("[{0}] {1} -> HTTP {2} (expected {3}) {4}" -f $tag, $Name, $Res.Status, ($Expect -join '/'), $note)
}

function Fresh([string]$Path) {
  try { $r = Invoke-WebRequest -Uri "$root/${Path}?sap-client=100" -Headers @{ Authorization = $auth; Accept = 'application/json' } -UseBasicParsing -TimeoutSec 90
        return @{ Status = [int]$r.StatusCode; Body = $r.Content; ETag = $r.Headers['ETag'] } }
  catch { return @{ Status = [int]$_.Exception.Response.StatusCode; Body = $(if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }); ETag = $null } }
}

function J($Res) { try { return $Res.Body | ConvertFrom-Json } catch { return $null } }

# --- token + metadata ---------------------------------------------------------
$t = Invoke-WebRequest -Uri "$root/?sap-client=100" -Headers @{ Authorization = $auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/json' } -WebSession $session -UseBasicParsing -TimeoutSec 90
$script:token = $t.Headers['x-csrf-token']
Say "Service root: $root  (CSRF token fetched: $([bool]$script:token))"

$m = Api GET '$metadata' $null @{ Accept = 'application/xml' }
Check 'GET $metadata' $m @(200) { param($r) 'sets: ' + (([regex]::Matches($r.Body, 'EntitySet Name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ', ') }

# --- read every entity set ------------------------------------------------------
foreach ($set in 'SourceGroup','DataSource','ProductMaster','TrmFlowMapping','InvestorSegmentMapping','ProductType','CompanyCode','FlowType','TransactionType','BpGroup') {
  $r = Api GET "$set`?`$top=2&`$count=true" $null
  Check "GET $set (top 2, count)" $r @(200) { param($x) $j = J $x; "count=$($j.'@odata.count')" }
}

# --- pick reference values from the lookups -------------------------------------
$cc = (J (Api GET 'CompanyCode?$top=1' $null)).value[0].CompanyCode
$pts = (J (Api GET 'ProductType?$top=200' $null)).value | ForEach-Object { $_.ProductType }
$pmRows = (J (Api GET "ProductMaster?`$filter=CompanyCode eq '$cc'&`$top=5000" $null)).value | ForEach-Object { $_.ProductType }
$pt = $pts | Where-Object { $pmRows -notcontains $_ } | Select-Object -First 1
$ft = (J (Api GET 'FlowType?$top=1' $null)).value[0].FlowType
$bg = (J (Api GET 'BpGroup?$top=1' $null)).value[0].BpGroup
Say "Reference values: CompanyCode=$cc ProductType=$pt FlowType=$ft BpGroup=$bg"

# --- SourceGroup ----------------------------------------------------------------
$r = Api POST 'SourceGroup' '{"SourceGroup":"zt","SourceGroupDesc":"Smoke test group"}'
Check 'SourceGroup create (lower-case key zt)' $r @(201) { param($x) $j = J $x; if ($j.SourceGroup -ne 'ZT') { "FAIL key not upper-cased: $($j.SourceGroup)" } else { "key=$($j.SourceGroup) createdBy=$($j.CreatedBy) stamp=$($j.ChangeStamp)" } }
$r = Api POST 'SourceGroup' '{"SourceGroup":"ZT","SourceGroupDesc":"dup"}'
Check 'SourceGroup create duplicate refused' $r @(400,409)
$r = Api POST 'SourceGroup' '{"SourceGroup":"ZU","SourceGroupDesc":""}'
Check 'SourceGroup create without description refused' $r @(400)
$g = Api GET "SourceGroup('ZT')" $null
Check 'SourceGroup read + ETag' $g @(200) { param($x) "etag=$($x.ETag)" }
Start-Sleep -Seconds 2
$r = Api PATCH "SourceGroup('ZT')" '{"SourceGroupDesc":"Smoke test group v2"}' @{ 'If-Match' = $g.ETag }
Check 'SourceGroup update with current ETag' $r @(200,204)
$r = Api PATCH "SourceGroup('ZT')" '{"SourceGroupDesc":"stale write"}' @{ 'If-Match' = $g.ETag }
Check 'SourceGroup update with stale ETag refused' $r @(412)
$r = Fresh "SourceGroup('ZT')"
Check 'SourceGroup read after update' $r @(200) { param($x) $j = J $x; if ($j.SourceGroupDesc -ne 'Smoke test group v2') { "FAIL desc=$($j.SourceGroupDesc)" } else { "desc=$($j.SourceGroupDesc) changed=$($j.ChangedDate) $($j.ChangedTime)" } }

# --- DataSource -----------------------------------------------------------------
$r = Api POST 'DataSource' '{"Source":"ZT","SourceDesc":"Smoke test source","ExcelSource":"smoke.xlsx","SourceGroup":"zt"}'
Check 'DataSource create (group text derived)' $r @(201) { param($x) $j = J $x; if ($j.SourceGroupDesc -ne 'Smoke test group v2') { "FAIL groupDesc=$($j.SourceGroupDesc)" } else { "groupDesc=$($j.SourceGroupDesc)" } }
$groups = (J (Api GET 'SourceGroup?$top=5000' $null)).value | ForEach-Object { $_.SourceGroup }
$noGroup = 'QX','QY','QZ','XQ','YQ' | Where-Object { $groups -notcontains $_ } | Select-Object -First 1
$r = Api POST 'DataSource' ('{"Source":"ZU","SourceDesc":"x","SourceGroup":"' + $noGroup + '"}')
Check "DataSource create with unknown group $noGroup refused" $r @(400)
if ($r.Status -eq 201) { $null = Api DELETE "DataSource('ZU')" $null @{ 'If-Match' = '*' } }
$r = Api PATCH "DataSource('ZT')" '{"ExcelSource":"smoke-v2.xlsx"}' @{ 'If-Match' = '*' }
Check 'DataSource update' $r @(200,204)
$r = Fresh "DataSource('ZT')"
Check 'DataSource read after update' $r @(200) { param($x) $j = J $x; if ($j.ExcelSource -ne 'smoke-v2.xlsx') { "FAIL excel=$($j.ExcelSource)" } else { "excel=$($j.ExcelSource)" } }

# --- ProductMaster --------------------------------------------------------------
$pmKey = "ProductMaster(CompanyCode='$cc',ProductType='$pt')"
$r = Api POST 'ProductMaster' ('{"CompanyCode":"' + $cc + '","ProductType":"' + $pt + '","Principal":true,"PrincipalTpm12":false,"PrincipalAlm2":false}')
Check 'ProductMaster create (boolean flags, text derived)' $r @(201) { param($x) $j = J $x; if ($j.Principal -ne $true -or -not $j.ProductTypeDesc) { "FAIL principal=$($j.Principal) desc=$($j.ProductTypeDesc)" } else { "desc=$($j.ProductTypeDesc) principal=$($j.Principal)" } }
$r = Api POST 'ProductMaster' ('{"CompanyCode":"ZZZZ","ProductType":"' + $pt + '"}')
Check 'ProductMaster create with unknown company code refused' $r @(400)
$r = Api PATCH $pmKey '{"PrincipalTpm12":true}' @{ 'If-Match' = '*' }
Check 'ProductMaster update' $r @(200,204)
$r = Fresh $pmKey
Check 'ProductMaster read after update' $r @(200) { param($x) $j = J $x; if ($j.PrincipalTpm12 -ne $true) { "FAIL tpm12=$($j.PrincipalTpm12)" } else { "tpm12=$($j.PrincipalTpm12)" } }

# --- TrmFlowMapping -------------------------------------------------------------
$tfKey = "TrmFlowMapping(SourceType='ZT',FlowType='$ft',ProductType='$pt',TransactionType='')"
$r = Api POST 'TrmFlowMapping' ('{"SourceType":"zt","FlowType":"' + $ft + '","ProductType":"' + $pt + '","TransactionType":""}')
Check 'TrmFlowMapping create (texts derived)' $r @(201) { param($x) $j = J $x; "srcDesc=$($j.SourceTypeDesc) flowDesc=$($j.FlowTypeDesc) prdDesc=$($j.ProductTypeDesc)" }
$r = Api POST 'TrmFlowMapping' ('{"SourceType":"","FlowType":"' + $ft + '","ProductType":"' + $pt + '"}')
Check 'TrmFlowMapping create without source type refused' $r @(400)
$r = Api PATCH $tfKey '{}' @{ 'If-Match' = '*' }
Check 'TrmFlowMapping empty PATCH (gateway: not supported, all fields are key)' $r @(501)

# --- InvestorSegmentMapping -----------------------------------------------------
$isKey = "InvestorSegmentMapping(BpGroup='$bg',Segment='ZTS')"
$r = Api POST 'InvestorSegmentMapping' ('{"BpGroup":"' + $bg + '","Segment":"zts"}')
Check 'InvestorSegmentMapping create (text derived)' $r @(201) { param($x) $j = J $x; if ($j.Segment -ne 'ZTS') { "FAIL segment=$($j.Segment)" } else { "bpGroupDesc=$($j.BpGroupDesc)" } }
$r = Api POST 'InvestorSegmentMapping' '{"BpGroup":"999","Segment":"ZTS"}'
Check 'InvestorSegmentMapping create with unknown BP group refused' $r @(400)
$r = Api PATCH $isKey '{}' @{ 'If-Match' = '*' }
Check 'InvestorSegmentMapping empty PATCH (gateway: not supported, all fields are key)' $r @(501)

# --- cleanup: delete everything created, then confirm it is gone ----------------
foreach ($k in $isKey, $tfKey, $pmKey, "DataSource('ZT')", "SourceGroup('ZT')") {
  $r = Api DELETE $k $null @{ 'If-Match' = '*' }
  Check "DELETE $k" $r @(204)
  $r = Fresh $k
  Check "GET $k after delete" $r @(404)
}
$r = Api DELETE "SourceGroup('ZT')" $null @{ 'If-Match' = '*' }
Check 'DELETE non-existent SourceGroup refused' $r @(404)

Say ''
Say "RESULT: $($script:pass) passed, $($script:fail) failed"
if ($OutFile) { $script:log | Set-Content -Path $OutFile -Encoding utf8 }
