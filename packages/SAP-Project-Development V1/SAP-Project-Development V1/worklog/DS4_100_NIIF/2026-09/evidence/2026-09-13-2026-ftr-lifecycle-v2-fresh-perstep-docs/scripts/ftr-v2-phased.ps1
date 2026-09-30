<#
  FTR term-loan lifecycle through dyngw v2 - PHASED re-run from an empty system.

  Same call sequence as the 2026-09-13 fresh run (ftr-v2-fullrun.ps1), but broken into
  phases so SAP GUI table screenshots can be taken between them. Each phase opens its own
  HTTP session and fetches its own CSRF token - a gateway call carries no client-side state
  between phases, so this changes nothing about what is executed.

  State that MUST survive between phases (the deal number) is written to state.json.

  JSON nesting (L-335): build innermost PLAIN, one Esc() pass per level ascended.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Phase
)

$ErrorActionPreference = "Stop"

$HostName = "vhnlqds4ap01.sap.niififl.in"
$Port     = 44300
$Client   = "100"
$User     = "FS_DEV3"
$BaseUrl  = "https://$($HostName):$($Port)/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001"
$Ns       = "com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001"

$EvDir    = "D:\SAP Tool\SAP-Project-Development V1\worklog\DS4_100_NIIF\2026-09\evidence\2026-09-13-2026-ftr-lifecycle-v2-fresh-perstep-docs"
$Evidence = "$EvDir\raw-calls.log"
$SnapDir  = "$EvDir\snapshots"
$StateFile= "$EvDir\state.json"
New-Item -ItemType Directory -Force -Path $SnapDir | Out-Null

$pw = [Environment]::GetEnvironmentVariable("SAP_DS4_100_NIIF_PASSWORD")
if (-not $pw) { Write-Error "SAP_DS4_100_NIIF_PASSWORD not set"; exit 1 }
$sec  = ConvertTo-SecureString $pw -AsPlainText -Force
$Cred = New-Object System.Management.Automation.PSCredential ($User, $sec)

function Log { param([string]$Text) $Text | Add-Content -Path $Evidence -Encoding utf8 }

$state = @{}
if (Test-Path $StateFile) {
    $j = Get-Content $StateFile -Raw | ConvertFrom-Json
    $j.PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value }
}
function Save-State { ($state | ConvertTo-Json) | Set-Content -Path $StateFile -Encoding utf8 }

$resp = Invoke-WebRequest -Uri "$BaseUrl/`$metadata?sap-client=$Client" -Method Get `
            -Headers @{ "X-CSRF-Token" = "Fetch" } -Credential $Cred -SessionVariable s -UseBasicParsing
$Csrf = $resp.Headers["X-CSRF-Token"]
$headers = @{ "X-CSRF-Token" = $Csrf; "Content-Type" = "application/json"; "Accept" = "application/json" }
Write-Host "[connect] HTTP $($resp.StatusCode), CSRF acquired - phase $Phase" -ForegroundColor Cyan

if ($Phase -eq "0") {
    Remove-Item $Evidence -ErrorAction SilentlyContinue
    Log @"
################################################################################
 FTR TERM-LOAN LIFECYCLE THROUGH DYNAMIC GATEWAY v2 - FRESH-SYSTEM RUN (PHASED)
 System   : DS4 client 100 (DS4_100_NIIF)      User: $User
 Started  : $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
 Base URL : $BaseUrl
 Namespace: $Ns
################################################################################
"@
}

function Esc { param([string]$str) return ($str -replace '\\','\\' -replace '"','\"') }
function Sel { param($f,$k,$v) return '{"field":"' + $f + '","kind":"' + $k + '","sign":"I","op":"EQ","low":"' + $v + '","high":""}' }

function Snapshot {
    param([string] $Tag)
    $sets = @("Registry","RegistryHistory","CallLog","CallStep")
    Log ""
    Log "================================================================================"
    Log "FRAMEWORK TABLE SNAPSHOT - $Tag   ($((Get-Date).ToString('HH:mm:ss')))"
    Log "================================================================================"
    $summary = @{}
    foreach ($set in $sets) {
        $url = "$BaseUrl/$set`?sap-client=$Client"
        try {
            $r = Invoke-WebRequest -Uri $url -Method Get -Headers @{Accept="application/json"} `
                     -Credential $Cred -WebSession $s -UseBasicParsing
            $json = $r.Content
            $obj  = $json | ConvertFrom-Json
            $n    = @($obj.value).Count
        } catch {
            $json = $_.Exception.Message; $n = -1
        }
        $summary[$set] = $n
        Log ""
        Log "GET $url"
        Log "rows: $n"
        Log $json
        $safeTag = ($Tag -replace '[^A-Za-z0-9]+','-')
        $json | Out-File "$SnapDir\$safeTag--$set.json" -Encoding utf8
    }
    Write-Host ("  snapshot [{0}]  Registry={1} History={2} CallLog={3} CallStep={4}" -f `
        $Tag, $summary.Registry, $summary.RegistryHistory, $summary.CallLog, $summary.CallStep) -ForegroundColor DarkCyan
}

function Invoke-Action {
    param([string]$Action, [string]$BodyJson, [string]$Label)
    $url = "$BaseUrl/CallLog/$Ns.$Action`?sap-client=$Client"
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    try {
        $r = Invoke-WebRequest -Uri $url -Method Post -Body $BodyJson -Headers $headers `
                 -Credential $Cred -WebSession $s -UseBasicParsing
        $raw = $r.Content; $http = [int]$r.StatusCode
    } catch [System.Net.WebException] {
        $e = $_.Exception.Response
        $raw = (New-Object System.IO.StreamReader($e.GetResponseStream())).ReadToEnd()
        $http = [int]$e.StatusCode
    }
    Log ""
    Log "================================================================================"
    Log "$Label   ($stamp)"
    Log "================================================================================"
    Log "POST $url"
    Log "Headers: X-CSRF-Token: <token>; Content-Type: application/json; Accept: application/json"
    Log ""
    Log "--- REQUEST BODY ---"
    Log $BodyJson
    Log ""
    Log "--- RESPONSE (HTTP $http) ---"
    Log $raw
    $o = $null
    try { $o = $raw | ConvertFrom-Json } catch {}
    $st = if ($o) { $o.ExecStatus } else { "?" }
    $col = if ($st -eq "S") { "Green" } else { "Red" }
    Write-Host ("  {0,-52} -> {1} {2}" -f $Label, $st, $o.MessageText) -ForegroundColor $col
    return $o
}

function New-Batch {
    param([string]$Kind,[string]$Target,[string]$Operation="",[string]$Import="",
          [string]$Tables="",[string]$Filter="",[string]$CommitMode="AUTO")
    $st = '{"Kind":"' + $Kind + '","TargetName":"' + $Target + '","Operation":"' + $Operation + '"' +
          ',"ImportJson":"' + (Esc $Import) + '","TablesJson":"' + (Esc $Tables) + '"' +
          ',"FieldsJson":"","FilterJson":"' + (Esc $Filter) + '","OrderByJson":""' +
          ',"MaxRows":0,"SkipRows":0}'
    return '{"CommitMode":"' + $CommitMode + '","StepsJson":"' + (Esc "[$st]") + '","RequestId":""}'
}

function Register {
    param([string]$Name,[string]$Kind,[string]$CallMode="",[string]$Descr)
    $imp = '{"TargetKind":"' + $Kind + '","IsActive":true,"AllowRead":true,"AllowWrite":true' +
           ',"CallMode":"' + $CallMode + '","MaxRows":0,"LogLevel":"A","Descr":"' + $Descr + '"}'
    $body = '{"TargetName":"' + $Name + '","Operation":"INSERT","ImportJson":"' + (Esc $imp) + '","RequestId":""}'
    return (Invoke-Action -Action "RegisterTarget" -BodyJson $body -Label "REGISTER $Kind/$Name")
}

$tables = '{"CONDITION":[],"CONDITIONX":[],"FORMULAVARIABLE":[],"SINGLEDATE":[],"PAYMENTDETAIL":[],"PAYMENTDETAILX":[],"ADDFLOW":[],"ADDFLOWX":[],"MAINFLOW":[],"MAINFLOWX":[],"RETURN":[]}'
function DealImport { param([string]$TestRun)
  return '{"GENERALCONTRACTDATA":{"COMPANY_CODE":"1000","PRODUCT_TYPE":"22A","TRANSACTION_TYPE":"100","PARTNER":"0700000453","CONTRACT_DATE":"2026-01-01","VALUATION_CLASS":"0001"},"GENERALCONTRACTDATAX":{"COMPANY_CODE":"X","PRODUCT_TYPE":"X","TRANSACTION_TYPE":"X","PARTNER":"X","CONTRACT_DATE":"X","VALUATION_CLASS":"X"},"INTERESTRATEINSTRUMENT":{"CURRENCY":"INR","START_TERM":"2026-01-01","END_TERM":"2026-12-31","NOMINAL_AMOUNT":100000,"INTEREST_RATE_STRUCTURE":"1","INTEREST_CONDITION_TYPE":"1200","INTEREST_RATE":10,"INTEREST_CALC_METH":"3","FREQUENCY_CATEGORY":"3","FREQUENCY":1,"FREQUENCY_UNIT":"2","INTEREST_CALENDAR_ID":"01","EFFECTIVE_FROM":"2026-01-01","REPAY_STRUCTURE":"1","REPAY_CONDITION_TYPE":"1120"},"INTERESTRATEINSTRUMENTX":{"CURRENCY":"X","START_TERM":"X","END_TERM":"X","NOMINAL_AMOUNT":"X","INTEREST_RATE_STRUCTURE":"X","INTEREST_CONDITION_TYPE":"X","INTEREST_RATE":"X","INTEREST_CALC_METH":"X","FREQUENCY_CATEGORY":"X","FREQUENCY":"X","FREQUENCY_UNIT":"X","INTEREST_CALENDAR_ID":"X","EFFECTIVE_FROM":"X","REPAY_STRUCTURE":"X","REPAY_CONDITION_TYPE":"X"},"TESTRUN":"' + $TestRun + '"}'
}

$deal = [string]$state["deal"]

function Tbb1Filter { param([string]$Test)
  return "[" + ((Sel "S_BUKRS" "S" "1000"), (Sel "S_RFHA" "S" $deal), (Sel "P_DZTERM" "P" "20260101"),
                (Sel "P_BUDAT" "P" "20260101"), (Sel "P_BLDAT" "P" "20260101"),
                (Sel "P_TEST" "P" $Test) -join ",") + "]"
}
function Tpm44Filter { param([string]$Test)
  return "[" + ((Sel "P_DEA" "P" "X"), (Sel "SO_BUKRS" "S" "1000"), (Sel "SO_OTCNR" "S" $deal),
                (Sel "P_KEYDAT" "P" "20260131"), (Sel "P_FIDATE" "P" "20260131"),
                (Sel "P_DOCDAT" "P" "20260131"), (Sel "P_RDATE" "P" "20260201"),
                (Sel "P_RFIDAT" "P" "20260201"), (Sel "P_TEST" "P" $Test) -join ",") + "]"
}
function Tpm1Filter { param([string]$Sim)
  return "[" + ((Sel "P_DEA" "P" "X"), (Sel "SO_BUKRS" "S" "1000"), (Sel "SO_OTCNR" "S" $deal),
                (Sel "KEYDATE" "P" "20260131"), (Sel "VALCAT" "P" "2"),
                (Sel "P_FIDAT" "P" "20260131"), (Sel "P_DOC" "P" "20260131"),
                (Sel "X_SIMULA" "P" $Sim) -join ",") + "]"
}

switch ($Phase) {

"0" {
    Write-Host "`n=== STEP 0: baseline - the five tables should be EMPTY ===" -ForegroundColor Yellow
    Snapshot "step0-baseline-empty"
}

"1a" {
    Write-Host "`n=== STEP 1a: register the FIRST target ===" -ForegroundColor Yellow
    Register -Name "BAPI_FTR_IRATE_DEALCREATE" -Kind "FUNC" -CallMode "L" -Descr "FTR term loan create" | Out-Null
    Snapshot "step1a-after-register-dealcreate"
}

"1" {
    Write-Host "`n=== STEP 1: register the remaining five targets ===" -ForegroundColor Yellow
    Register -Name "BAPI_FTR_IRATE_SETTLE"     -Kind "FUNC" -CallMode "L" -Descr "FTR settle"          | Out-Null
    Register -Name "RFTBBB00"                  -Kind "SUBM" -Descr "TBB1 post treasury flows"          | Out-Null
    Register -Name "RTPM_ACCRUAL_DEFERRAL"     -Kind "SUBM" -Descr "TPM44 accrual/deferral"            | Out-Null
    Register -Name "RTPM_TRL_VALUATION"        -Kind "SUBM" -Descr "TPM1 valuation"                    | Out-Null
    Register -Name "ZSGSLCTR_FEEDATA"          -Kind "TABL" -Descr "fee data row"                      | Out-Null
    Snapshot "step1-after-all-registrations"
}

"2a" {
    Write-Host "`n=== STEP 2a: DEALCREATE dry run ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 2a DEALCREATE dry run (TESTRUN X, CommitMode NEVER)" `
        -BodyJson (New-Batch -Kind "FUNC" -Target "BAPI_FTR_IRATE_DEALCREATE" -Import (DealImport "X") -Tables $tables -CommitMode "NEVER") | Out-Null
    Snapshot "step2a-after-dealcreate-dryrun"
}

"2b" {
    Write-Host "`n=== STEP 2b: DEALCREATE real ===" -ForegroundColor Yellow
    $o = Invoke-Action -Action "ExecuteBatch" -Label "STEP 2b DEALCREATE real (CommitMode AUTO)" `
        -BodyJson (New-Batch -Kind "FUNC" -Target "BAPI_FTR_IRATE_DEALCREATE" -Import (DealImport "") -Tables $tables)
    Snapshot "step2b-after-dealcreate-real"
    $d = ""
    if ($o.StepsJson -match '\\"FINANCIALTRANSACTION\\":\\"(\d{13})\\"') { $d = $Matches[1] }
    if (-not $d) { Write-Error "could not parse the deal number from the response"; exit 1 }
    $state["deal"] = $d
    Save-State
    Write-Host "  DEAL CREATED: $d" -ForegroundColor Green
    Log ""
    Log "*** DEAL NUMBER PARSED FROM RESPONSE: $d ***"
}

"3" {
    if (-not $deal) { Write-Error "no deal in state.json"; exit 1 }
    Write-Host "`n=== STEP 3: settle deal $deal ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 3 SETTLE deal $deal" `
        -BodyJson (New-Batch -Kind "FUNC" -Target "BAPI_FTR_IRATE_SETTLE" `
            -Import ('{"COMPANYCODE":"1000","FINANCIALTRANSACTION":"' + $deal + '","TESTRUN":""}') `
            -Tables '{"RETURN":[]}') | Out-Null
    Snapshot "step3-after-settle"
}

"4a" {
    Write-Host "`n=== STEP 4a: TBB1 test run ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 4a TBB1 test run" `
        -BodyJson (New-Batch -Kind "SUBM" -Target "RFTBBB00" -Operation "JOB" -Filter (Tbb1Filter "X")) | Out-Null
    Snapshot "step4a-after-tbb1-test"
}

"4b" {
    Write-Host "`n=== STEP 4b: TBB1 real posting ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 4b TBB1 real posting" `
        -BodyJson (New-Batch -Kind "SUBM" -Target "RFTBBB00" -Operation "JOB" -Filter (Tbb1Filter "")) | Out-Null
    Snapshot "step4b-after-tbb1-real"
}

"5a" {
    Write-Host "`n=== STEP 5a: TPM44 test run ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 5a TPM44 test run" `
        -BodyJson (New-Batch -Kind "SUBM" -Target "RTPM_ACCRUAL_DEFERRAL" -Operation "JOB" -Filter (Tpm44Filter "X")) | Out-Null
    Snapshot "step5a-after-tpm44-test"
}

"5b" {
    Write-Host "`n=== STEP 5b: TPM44 real posting ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 5b TPM44 real posting" `
        -BodyJson (New-Batch -Kind "SUBM" -Target "RTPM_ACCRUAL_DEFERRAL" -Operation "JOB" -Filter (Tpm44Filter "")) | Out-Null
    Snapshot "step5b-after-tpm44-real"
}

"6" {
    Write-Host "`n=== STEP 6: TPM1 valuation ===" -ForegroundColor Yellow
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 6 TPM1 valuation" `
        -BodyJson (New-Batch -Kind "SUBM" -Target "RTPM_TRL_VALUATION" -Operation "JOB" -Filter (Tpm1Filter "")) | Out-Null
    Snapshot "step6-after-tpm1"
}

"7" {
    if (-not $deal) { Write-Error "no deal in state.json"; exit 1 }
    Write-Host "`n=== STEP 7: fee row (TABL INSERT) ===" -ForegroundColor Yellow
    $dealShort = $deal.TrimStart('0')
    Invoke-Action -Action "ExecuteBatch" -Label "STEP 7 TABL INSERT into ZSGSLCTR_FEEDATA" `
        -BodyJson (New-Batch -Kind "TABL" -Target "ZSGSLCTR_FEEDATA" -Operation "INSERT" `
            -Import ('[{"CLIENT":"100","ZTYPE":"02","ZFEE_TYPE":"F01","ZOTTK_NO":"999997","ZDTTK_NO":"' + $dealShort + '","ZSGSART":"22A","ZCAT":"02","ZCODE":"01","ZB_AMT":100000,"ZRATE":10,"ZDAY":"31","ZAMT":849.32,"ZF_AMT":849.32,"ZCREATED_BY":"FS_DEV3","ZCREATED_DATE":"2026-09-13"}]')) | Out-Null
    Snapshot "step7-final-after-fee-row"
    Log ""
    Log "################################################################################"
    Log " RUN COMPLETE  $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))   DEAL: $deal"
    Log "################################################################################"
}

default { Write-Error "unknown phase '$Phase'"; exit 1 }
}

Write-Host "phase $Phase done" -ForegroundColor Magenta
