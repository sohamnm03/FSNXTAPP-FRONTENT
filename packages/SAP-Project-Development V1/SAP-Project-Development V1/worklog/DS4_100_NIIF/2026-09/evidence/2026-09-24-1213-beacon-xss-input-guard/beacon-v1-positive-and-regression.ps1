<#
.SYNOPSIS
    V1 positive control + read regression for the XSS input guard.
.DESCRIPTION
    P1 posts ONE clean line (with ordinary punctuation & ' " % ( ) but no < or >) to V1. It must be
    accepted (HTTP 201), proving the guard does not block legitimate text. The line is built so R044
    can never post an FI document: a valid company, INR, a G/L account present in SKB1 and a new
    ref_no keep it out of FORM validate, and a single line per ref_no makes process_data mark it 'F'
    ("contains only one line item") without calling the BAPI.
    R1/R2 re-read an existing request through the two GET paths to show they are unaffected.
#>
param([string] $OutFile)

$HostName = 'vhnlqds4ap01.sap.niififl.in'; $Port = 44300; $User = 'FS_DEV3'
$Pw = [Environment]::GetEnvironmentVariable('SAP_DS4_100_NIIF_PASSWORD')
if (-not $Pw) { Write-Error 'SAP_DS4_100_NIIF_PASSWORD is not set'; exit 1 }
$Base = "https://$($HostName):$($Port)/sap/opu/odata/sap/ZFS_BEACON_ACCOUNTING_V1_SRV"
$Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($User):$($Pw)"))

$session = $null
$r = Invoke-WebRequest -Uri "$Base/?sap-client=100" -Method Get -UseBasicParsing -SessionVariable session `
       -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = 'Fetch'; Accept = 'application/json' }
$token = $r.Headers['x-csrf-token']

function Call([string]$method, [string]$path, [string]$body) {
    $h = @{ Authorization = $Auth; 'X-CSRF-Token' = $token; Accept = 'application/json' }
    try {
        if ($body) {
            $resp = Invoke-WebRequest -Uri "$Base/$path" -Method $method -UseBasicParsing -WebSession $session -Headers $h `
                      -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))
        } else {
            $resp = Invoke-WebRequest -Uri "$Base/$path" -Method $method -UseBasicParsing -WebSession $session -Headers $h
        }
        return [pscustomobject]@{ Status = [int]$resp.StatusCode; Body = $resp.Content }
    } catch {
        $er = $_.Exception.Response
        $b = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return [pscustomobject]@{ Status = $(if ($er) { [int]$er.StatusCode } else { 0 }); Body = $b }
    }
}

$line = '{"RequestId":"XSSPOS01","LineNo":"1","Company":"1000","NaturalAc":"0000205000","Currency":"INR",' +
        '"DebitCreditFlag":"S","RefNo":"XSS-POS-01","TrnNo":"XSSPOS01","TrnType":"AUDITTEST",' +
        '"LineDescription":"Clean text: A&B ''x'' \"y\" 50% (ok)"}'
$p1 = Call 'POST' 'zfs_s_018_hdSet?sap-client=100' ('{"RequestId":"XSSPOS01","NP_ACC":[' + $line + ']}')
$r1 = Call 'GET'  "zfs_s_018_hdSet('100000000001')?`$expand=NP_ACC&sap-client=100" $null
$r2 = Call 'GET'  "zfs_t_091_itSet?`$filter=RequestId eq '100000000001'&sap-client=100" $null

$res = @(
  [pscustomobject]@{ Case='P1'; What='clean line with & '' " % ( ) is accepted'; Status=$p1.Status; Pass=($p1.Status -eq 201); Body=$p1.Body },
  [pscustomobject]@{ Case='R1'; What='GET header + $expand=NP_ACC for 100000000001'; Status=$r1.Status; Pass=($r1.Status -eq 200 -and $r1.Body -match '"NP_ACC"'); Body=$r1.Body },
  [pscustomobject]@{ Case='R2'; What='GET zfs_t_091_itSet filtered on 100000000001'; Status=$r2.Status; Pass=($r2.Status -eq 200 -and $r2.Body -match '100000000001'); Body=$r2.Body }
)
$res | Format-Table Case, What, Status, Pass -AutoSize | Out-String -Width 200
if ($OutFile) { $res | ConvertTo-Json -Depth 4 | Out-File -FilePath $OutFile -Encoding utf8 }
