<#
.SYNOPSIS
    XSS input-guard negative tests for the Beacon accounting OData V2 services.
.DESCRIPTION
    Posts deep-insert payloads that each carry HTML/script characters. Every case must be
    refused with HTTP 400 and ZFS_TRM_MSG/055, and nothing may be saved (the caller checks
    ZFS_T_072 afterwards). Arrays are hand-built JSON, never ConvertTo-Json (L-315).
    sap-client=100 is on every URL (L-253). The password comes from the env var named in
    config/sap-systems.json.
#>
param(
    [Parameter(Mandatory)] [ValidateSet('ZFS_BEACON_ACCOUNTING_V1_SRV','ZFS_BEACON_ACCOUNTING_LOCL_SRV')] [string] $Service,
    [Parameter(Mandatory)] [string] $IdPrefix,
    [string] $OutFile
)

$HostName = 'vhnlqds4ap01.sap.niififl.in'
$Port     = 44300
$User     = 'FS_DEV3'
$Pw       = [Environment]::GetEnvironmentVariable('SAP_DS4_100_NIIF_PASSWORD')
if (-not $Pw) { Write-Error 'SAP_DS4_100_NIIF_PASSWORD is not set'; exit 1 }

$Base = "https://$($HostName):$($Port)/sap/opu/odata/sap/$Service"
$Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($User):$($Pw)"))

$session = $null
$r = Invoke-WebRequest -Uri "$Base/?sap-client=100" -Method Get -UseBasicParsing -SessionVariable session `
       -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/json' }
$token = $r.Headers['x-csrf-token']

# Every line is single-line per ref_no, with a real company, INR and a G/L account that exists in
# SKB1. If the guard ever failed, R044 would only mark that one ref 'F', never reaching FORM
# validate, whose UPDATE ... WHERE ref_no = ref_no marks every row in ZFS_T_072.
function Item([string]$line, [string]$ref, [string]$extra) {
    return '{"RequestId":"__RID__","LineNo":"' + $line + '","Company":"1000","NaturalAc":"0000205000","Currency":"INR","DebitCreditFlag":"S","RefNo":"' + $ref + '"' + $extra + '}'
}

$cases = @(
    @{ id = 'N1'; what = 'script tag in LineDescription';   header = '';       items = @( (Item '1' "XSS-$IdPrefix-N1" ',"LineDescription":"<script>alert(1)</script>"') ) },
    @{ id = 'N2'; what = 'img onerror in Remark1';          header = '';       items = @( (Item '1' "XSS-$IdPrefix-N2" ',"Remark1":"<img src=x onerror=alert(1)>"') ) },
    @{ id = 'N3'; what = 'lone > in RefNo';                 header = '';       items = @( (Item '1' "XSS-$IdPrefix-N3>1" '') ) },
    @{ id = 'N4'; what = 'tag in header RequestId';         header = 'RIDTAG'; items = @( (Item '1' "XSS-$IdPrefix-N4" '') ) },
    @{ id = 'N5'; what = 'JSON unicode-escaped script tag'; header = '';       items = @( (Item '1' "XSS-$IdPrefix-N5" ',"LineDescription":"<script>x</script>"') ) },
    @{ id = 'N6'; what = 'two bad fields on two lines';     header = '';       items = @( (Item '1' "XSS-$IdPrefix-N6A" ',"LineDescription":"<b>one</b>"'), (Item '2' "XSS-$IdPrefix-N6B" ',"BatchId":"<i>two</i>"') ) }
)

$results = @()
foreach ($c in $cases) {
    $rid = if ($c.header -eq 'RIDTAG') { '<b>' + $IdPrefix + '</b>' } else { "$IdPrefix$($c.id)" }
    $items = ($c.items | ForEach-Object { $_.Replace('__RID__', $rid) }) -join ','
    $body = '{"RequestId":"' + $rid + '","NP_ACC":[' + $items + ']}'
    $status = $null; $respBody = $null; $ctype = $null; $nosniff = $null
    try {
        $resp = Invoke-WebRequest -Uri "$Base/zfs_s_018_hdSet?sap-client=100" -Method Post -UseBasicParsing -WebSession $session `
                  -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = $token; Accept = 'application/json' } `
                  -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))
        $status = [int]$resp.StatusCode; $respBody = $resp.Content
        $ctype = $resp.Headers['Content-Type']; $nosniff = $resp.Headers['X-Content-Type-Options']
    } catch {
        $er = $_.Exception.Response
        if ($er) {
            $status = [int]$er.StatusCode
            $ctype = $er.Headers['Content-Type']; $nosniff = $er.Headers['X-Content-Type-Options']
            # PS 5.1 has already drained the response stream; the body is in ErrorDetails.
            $respBody = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else {
                (New-Object IO.StreamReader($er.GetResponseStream())).ReadToEnd() }
        } else { $respBody = $_.Exception.Message }
    }
    $has055 = ($respBody -match 'ZFS_TRM_MSG') -and ($respBody -match '055')
    $results += [pscustomobject]@{
        Case = $c.id; What = $c.what; RequestId = $rid; Status = $status
        Msg055 = $has055; ContentType = $ctype; NoSniff = $nosniff
        Pass = ($status -eq 400 -and $has055)
        Request = $body; Response = $respBody
    }
}

$results | Format-Table Case, What, RequestId, Status, Msg055, Pass, ContentType, NoSniff -AutoSize | Out-String -Width 250
if ($OutFile) { $results | ConvertTo-Json -Depth 4 | Out-File -FilePath $OutFile -Encoding utf8 }
