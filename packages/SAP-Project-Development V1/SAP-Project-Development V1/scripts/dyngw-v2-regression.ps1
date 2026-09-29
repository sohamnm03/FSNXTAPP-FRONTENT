<#
.SYNOPSIS
    Dynamic Gateway v2 (ZFS_SB_DYNGW_O4_API) regression suite - Task 20.

.DESCRIPTION
    One case per action, the refusal paths, the three mandated proofs (L-350 closure,
    unregistered SUBM, EXECUTE-vs-ADMIN split), and the full spec section 3 capability
    matrix. Every case states its expected result explicitly so a reader can tell a real
    pass from a vacuous one. Built PowerShell 5.1-safe: every JSON array is hand-built as
    a string, never produced by ConvertTo-Json, because ConvertTo-Json collapses a
    one-element array into a bare object and the gateway then answers "Invalid JSON"
    (L-315). sap-client=100 is appended to every URL (L-253/L-325).

    THIS SCRIPT WRITES TO THE SAP SYSTEM WHEN RUN. It is authored, not yet executed -
    Task 20's live-run phase is dispatched separately once Task 18's forensic review of
    ZFS_T_DYN_REG / ZFS_T_DYN_REGH clears (its two live rows are current evidence). Do
    not run this script against DS4_100_NIIF until that clearance is given.

    Safety interlock: every case that performs a write (POST/PATCH/DELETE, or a batch
    containing a write step) is gated behind -Live. Without -Live the script only proves
    connectivity (a GET on $metadata) and prints the full case list with what each would
    do; nothing is sent to the service.

.PARAMETER Live
    Actually execute the write-bearing cases. Omit for a dry inventory of what the suite
    covers. Required before Proof 1, Proof 2, most of the capability matrix, and any
    RegisterTarget/ExecuteTableCrud/ExecuteBatch case can run for real.

.PARAMETER ProbeTable
    The literal-brief form of Proof 1 case P1-TABL needs a real, already-registered-safe,
    NON-framework writable table with a genuine primary key, so a duplicate INSERT can be
    attempted against it. No such table was created or assumed for this authoring pass
    (project rule 3: never create an object nobody asked for) - naming one is a human
    decision. Leave this blank and P1-TABL is skipped with a loud message; P1-REGI (the
    corroborating, side-effect-free reproduction of the same guarantee, using the
    registry's own duplicate-registration guard) always runs under -Live regardless.

.PARAMETER ProbeKeyField
    Primary key field of -ProbeTable, required if -ProbeTable is supplied.

.PARAMETER ProbeKeyValue
    A key value to insert twice for P1-TABL. Default is a value that is obviously a probe
    and will not collide with real data by accident.

.NOTES
    Base URL, action namespace and entity set names are taken verbatim from Task 18's
    live report (.superpowers/sdd/2026-09-12-dyngw-v2/task-18-report.md), not re-derived:
        <host>/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001
        namespace com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001
        entity sets: CallLog, CallStep, Registry, RegistryHistory
    Connection facts (host, user) are read from config/sap-systems.json; the password is
    read from the environment variable named there (SAP_DS4_100_NIIF_PASSWORD), never
    hard-coded (docs/sap-systems.md).
#>
[CmdletBinding()]
param(
    [switch] $Live,
    [string] $ProbeTable    = "",
    [string] $ProbeKeyField = "",
    [string] $ProbeKeyValue = "DYNGW-T20-PROOF1-PROBE"
)

# ----------------------------------------------------------------------------------
# 0. Configuration - verified facts, not guesses. See task-18-report.md and
#    config/sap-systems.json (read 2026-09-13 for this script).
# ----------------------------------------------------------------------------------
$Script:HostName   = "vhnlqds4ap01.sap.niififl.in"
$Script:Port        = 44300
$Script:Client      = "100"
$Script:User        = "FS_DEV3"
$Script:PwEnvVar    = "SAP_DS4_100_NIIF_PASSWORD"
$Script:ServicePath = "/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001"
$Script:BaseUrl     = "https://$($Script:HostName):$($Script:Port)$($Script:ServicePath)"
$Script:Ns          = "com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001"

$Script:Password = [Environment]::GetEnvironmentVariable($Script:PwEnvVar)
if ($Live -and -not $Script:Password) {
    Write-Error "Environment variable $($Script:PwEnvVar) is not set. Cannot run -Live without it."
    exit 1
}

$Script:Cred = $null
if ($Script:Password) {
    $sec = ConvertTo-SecureString $Script:Password -AsPlainText -Force
    $Script:Cred = New-Object System.Management.Automation.PSCredential ($Script:User, $sec)
}

$Script:Session = $null   # WebRequestSession, holds cookies across calls
$Script:CsrfToken = $null

$Script:Results = New-Object System.Collections.ArrayList

# ----------------------------------------------------------------------------------
# 1. Small helpers
# ----------------------------------------------------------------------------------

function Write-CaseHeader {
    param([string]$Id, [string]$Title)
    Write-Host ""
    Write-Host "==== $Id : $Title ====" -ForegroundColor Cyan
}

function Add-Result {
    param(
        [string] $Id,
        [string] $Title,
        [ValidateSet("PASS","FAIL","BLOCKED","SKIP","DRYRUN")] [string] $Status,
        [string] $Expected,
        [string] $Actual,
        [string] $Note = ""
    )
    $row = [PSCustomObject]@{
        Id       = $Id
        Title    = $Title
        Status   = $Status
        Expected = $Expected
        Actual   = $Actual
        Note     = $Note
    }
    [void]$Script:Results.Add($row)

    $color = switch ($Status) {
        "PASS"    { "Green" }
        "FAIL"    { "Red" }
        "BLOCKED" { "Yellow" }
        "SKIP"    { "DarkYellow" }
        "DRYRUN"  { "Gray" }
    }
    Write-Host "[$Status] $Id - $Title" -ForegroundColor $color
    Write-Host "    expected: $Expected"
    Write-Host "    actual:   $Actual"
    if ($Note) { Write-Host "    note:     $Note" }
}

# Establishes the cookie/session + CSRF token every write needs. Read-only GETs do not
# strictly need the token, but fetching it here also proves the service answers.
function Connect-Gateway {
    $url = "$($Script:BaseUrl)/`$metadata?sap-client=$($Script:Client)"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Get `
                    -Headers @{ "X-CSRF-Token" = "Fetch" } `
                    -Credential $Script:Cred `
                    -SessionVariable sessionVar `
                    -UseBasicParsing
        $Script:Session   = $sessionVar
        $Script:CsrfToken = $resp.Headers["X-CSRF-Token"]
        return @{ ok = $true; status = $resp.StatusCode; token = $Script:CsrfToken }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

# Calls one static action bound to CallLog, e.g. Invoke-Action -Action RunQuery -BodyJson $json
function Invoke-Action {
    param(
        [Parameter(Mandatory)] [string] $Action,
        [Parameter(Mandatory)] [string] $BodyJson
    )
    $url = "$($Script:BaseUrl)/CallLog/$($Script:Ns).$Action`?sap-client=$($Script:Client)"
    $headers = @{
        "X-CSRF-Token" = $Script:CsrfToken
        "Content-Type" = "application/json"
        "Accept"       = "application/json"
    }
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Post -Body $BodyJson `
                    -Headers $headers -Credential $Script:Cred -WebSession $Script:Session `
                    -UseBasicParsing
        $obj = $null
        if ($resp.Content) { $obj = $resp.Content | ConvertFrom-Json }
        return @{ ok = $true; httpStatus = [int]$resp.StatusCode; body = $obj; raw = $resp.Content }
    } catch [System.Net.WebException] {
        $r = $_.Exception.Response
        $code = if ($r) { [int]$r.StatusCode } else { -1 }
        $stream = $null
        $text = ""
        if ($r) {
            $stream = $r.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
        }
        $obj = $null
        try { if ($text) { $obj = $text | ConvertFrom-Json } } catch {}
        return @{ ok = $false; httpStatus = $code; body = $obj; raw = $text }
    } catch {
        return @{ ok = $false; httpStatus = -1; body = $null; raw = $_.Exception.Message }
    }
}

# Plain entity-set GET, used for verification reads (e.g. "does the probe row exist?")
# rather than exercising an action - no ADT/RFC channel is used by this script at all,
# consistent with the authoring-phase scope (OData only).
function Get-EntitySet {
    param(
        [Parameter(Mandatory)] [string] $EntitySet,
        [string] $Filter = "",
        [string] $Extra  = ""
    )
    $qs = "sap-client=$($Script:Client)"
    if ($Filter) { $qs += "&`$filter=$([uri]::EscapeDataString($Filter))" }
    if ($Extra)  { $qs += "&$Extra" }
    $url = "$($Script:BaseUrl)/$EntitySet`?$qs"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Get -Headers @{ "Accept" = "application/json" } `
                    -Credential $Script:Cred -WebSession $Script:Session -UseBasicParsing
        $obj = $resp.Content | ConvertFrom-Json
        return @{ ok = $true; httpStatus = [int]$resp.StatusCode; body = $obj }
    } catch {
        return @{ ok = $false; httpStatus = -1; body = $null; raw = $_.Exception.Message }
    }
}

function Get-ActionResultField {
    param($Response, [string]$Field)
    if ($null -eq $Response.body) { return $null }
    return $Response.body.$Field
}

# ----------------------------------------------------------------------------------
# 2. JSON built BY HAND. Every array literal below is typed out as text - never piped
#    through ConvertTo-Json - per L-315. Helper only assembles the outer envelope; the
#    *Json string fields are themselves hand-written JSON text (one or two levels of
#    escaping, matching L-472/task-18's finding that v2 batches carry two levels, not
#    v1's three).
# ----------------------------------------------------------------------------------

function New-ActionBody {
    param([hashtable]$Fields)
    $parts = foreach ($k in $Fields.Keys) {
        $v = $Fields[$k]
        if ($null -eq $v) {
            "`"$k`":null"
        } elseif ($v -is [bool]) {
            "`"$k`":$(if ($v) {'true'} else {'false'})"
        } elseif ($v -is [int] -or $v -is [long]) {
            "`"$k`":$v"
        } else {
            # string field - escape embedded quotes and backslashes only; the *Json
            # fields are pre-built JSON text passed in as a string value, so this
            # produces the correctly-escaped nested JSON without a second pass through
            # any JSON serializer (that second pass is exactly what breaks the L-315
            # single-element-array case).
            # NOTE (2026-09-13 live acceptance, L-488): the replacement operand of
            # -replace is a LITERAL string, not a C-style escape string - PowerShell
            # single quotes do not interpret backslash at all. '\\\\' is therefore
            # FOUR literal backslash characters, not two, and every pre-escaped
            # nested-JSON quote (\") in a hand-built StepsJson/ImportJson value was
            # being quadrupled instead of doubled, corrupting any field with more
            # than one level of JSON nesting (StepsJson, batch ImportJson) while
            # leaving single-level fields (FieldsJson standalone, empty arrays)
            # untouched - which is exactly the pass/fail split the first live run
            # produced. '\\' (2 literal backslash chars) is the correct replacement.
            $escaped = $v -replace '\\', '\\' -replace '"', '\"'
            "`"$k`":`"$escaped`""
        }
    }
    return "{" + ($parts -join ",") + "}"
}

# ----------------------------------------------------------------------------------
# 3. Verified payloads (also mirrored into worklog/DS4_100_NIIF/dyngw-v2-payloads-2026-09-12-0918.txt)
# ----------------------------------------------------------------------------------

# --- RunQuery: happy path against the already-registered QURY/T000 (task-18-report.md S4) ---
$Payload_RunQuery_T000 = New-ActionBody @{
    TargetName  = "T000"
    FieldsJson  = '["MANDT","MTEXT"]'
    FilterJson  = ""
    OrderByJson = ""
    MaxRows     = 3
    SkipRows    = 0
    RequestId   = ""
}

# --- RunQuery: refusal, unregistered target (task-18-report.md S4) ---
$Payload_RunQuery_Unregistered = New-ActionBody @{
    TargetName  = "ZZ_UNKNOWN"
    FieldsJson  = '["MANDT"]'
    FilterJson  = ""
    OrderByJson = ""
    MaxRows     = 3
    SkipRows    = 0
    RequestId   = ""
}

# --- RunQuery: paging without ORDER BY -> refused 042 (spec 3.3, ZCL_FS_DYN_RUNTIME source review) ---
$Payload_RunQuery_PagingNoSort = New-ActionBody @{
    TargetName  = "T000"
    FieldsJson  = '["MANDT","MTEXT"]'
    FilterJson  = ""
    OrderByJson = ""
    MaxRows     = 2
    SkipRows    = 1
    RequestId   = ""
}

# --- RunQuery: paging WITH a stable sort -> must succeed (spec 3.3 "Paging" row) ---
# NOTE (L-489): ZCL_FS_DYN_HDL_QUERY~RESOLVE_ORDER_BY / CHECK_PAGING_ORDER deserialize
# OrderByJson into a table of {field, descending} objects, not bare strings - a plain
# ["MANDT"] deserializes with FIELD blank on every row, so the paging guard's own
# stable-sort check fails it as 042 (looks identical to the "no sort at all" refusal,
# which is why the first live run's A-QURY-4 result was indistinguishable from A-QURY-3
# until the raw body was inspected). Source-verified 2026-09-13, live acceptance.
$Payload_RunQuery_PagingWithSort = New-ActionBody @{
    TargetName  = "T000"
    FieldsJson  = '["MANDT","MTEXT"]'
    FilterJson  = ""
    OrderByJson = '[{"field":"MANDT","descending":false}]'
    MaxRows     = 2
    SkipRows    = 1
    RequestId   = ""
}

# --- RegisterTarget: single-shot INSERT of a harmless read-only FUNC target,
#     RFC_SYSTEM_INFO - standard, remote-enabled, side-effect-free, returns system info.
#     Chosen specifically because it takes no CHANGING parameter and touches nothing,
#     so registering it is a safe, reusable regression fixture. ---
$Payload_RegisterTarget_Func = New-ActionBody @{
    TargetName = "RFC_SYSTEM_INFO"
    Operation  = "INSERT"
    ImportJson = '{"TargetKind":"FUNC","Operation":"","IsActive":true,"AllowRead":true,"AllowWrite":false,"CallMode":"","MaxRows":10,"LogLevel":"A","Descr":"dyngw v2 regression: read-only FUNC fixture"}'
    RequestId  = ""
}

# --- RegisterTarget: duplicate of an already-registered target -> refused 035 ---
$Payload_RegisterTarget_DuplicateT000 = New-ActionBody @{
    TargetName = "T000"
    Operation  = "INSERT"
    ImportJson = '{"TargetKind":"QURY","Operation":"","IsActive":true,"AllowRead":true,"AllowWrite":false,"CallMode":"","MaxRows":10,"LogLevel":"A","Descr":"duplicate probe - must be refused"}'
    RequestId  = ""
}

# --- RegisterTarget: self-protection -> refused 039 (task-18-report.md S2, "Assertion 2") ---
$Payload_RegisterTarget_SelfProtect = New-ActionBody @{
    TargetName = "ZFS_T_DYN_REG"
    Operation  = "INSERT"
    ImportJson = '{"TargetKind":"TABL","Operation":"","IsActive":true,"AllowRead":true,"AllowWrite":true,"CallMode":"","MaxRows":10,"LogLevel":"A","Descr":"self-protect probe - must be refused"}'
    RequestId  = ""
}

# --- CallFunctionModule: happy path, RFC_SYSTEM_INFO, no IMPORTING needed ---
$Payload_CallFunctionModule_Happy = New-ActionBody @{
    TargetName = "RFC_SYSTEM_INFO"
    ImportJson = "[]"
    TablesJson = "[]"
    RequestId  = ""
}

# --- CallFunctionModule: refusal, nonexistent FM -> 019 ---
$Payload_CallFunctionModule_Missing = New-ActionBody @{
    TargetName = "ZZ_NOT_A_REAL_FM"
    ImportJson = "[]"
    TablesJson = "[]"
    RequestId  = ""
}

# --- ExecuteTableCrud: empty ImportJson -> refused 022 (task-13-report.md S2.2) ---
$Payload_ExecuteTableCrud_EmptyArray = New-ActionBody @{
    TargetName = "ZFS_T_DYN_REG"     # self-protection fires first (039); see note in case P-TABL-1
    Operation  = "INSERT"
    ImportJson = "[]"
    RequestId  = ""
}

# --- ExecuteTableCrud: self-protection -> refused 039 (proof 3, case 2) ---
$Payload_ExecuteTableCrud_SelfProtect = New-ActionBody @{
    TargetName = "ZFS_T_DYN_REG"
    Operation  = "INSERT"
    ImportJson = '[{"TARGET_KIND":"TABL","TARGET_NAME":"ZZ_PROBE"}]'
    RequestId  = ""
}

# --- SubmitReport: refusal, unregistered RSUSR003 (proof 2) ---
$Payload_SubmitReport_Unregistered = New-ActionBody @{
    TargetName = "RSUSR003"
    Operation  = "SALV"
    ImportJson = ""
    FilterJson = ""
    MaxRows    = 10
    RequestId  = ""
}

# --- ExecuteBatch: malformed StepsJson -> refused 022 (task-18-report.md S4, L-477) ---
$Payload_ExecuteBatch_MalformedSteps = New-ActionBody @{
    CommitMode = "AUTO"
    RequestId  = ""
    StepsJson  = "[{not json"
}

# --- ExecuteBatch: empty StepsJson array -> legitimate no-op, must succeed (L-477) ---
$Payload_ExecuteBatch_EmptySteps = New-ActionBody @{
    CommitMode = "AUTO"
    RequestId  = ""
    StepsJson  = "[]"
}

# --- ExecuteBatch: two QURY steps against T000 - happy composite path ---
$Payload_ExecuteBatch_TwoQuery = New-ActionBody @{
    CommitMode = "AUTO"
    RequestId  = "T20-BATCH-TWOQUERY-0002"   # -0001 is burned: it recorded the pre-L-488-fix
                                              # escaping-bug error (022) and idempotency would
                                              # replay that error forever, not re-execute
    StepsJson  = '[{"Kind":"QURY","TargetName":"T000","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"MANDT\"]","FilterJson":"","OrderByJson":"","MaxRows":1,"SkipRows":0},{"Kind":"QURY","TargetName":"T005","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"LAND1\"]","FilterJson":"","OrderByJson":"","MaxRows":1,"SkipRows":0}]'
}

# --- ExecuteBatch: idempotency replay - same RequestId as the case above, second call ---
# (reuses $Payload_ExecuteBatch_TwoQuery verbatim; see case B-IDEMPOTENT)

# --- Proof 1 (P1-REGI): two REGI steps registering the SAME (TargetKind, TargetName) in
#     one batch. Step 2's application-level duplicate check (ZCL_FS_DYN_HDL_REGI, message
#     035) sees step 1's own PENDING declaration (declare_pending / L-344's buffer) and
#     refuses in PHASE 1, before ANYTHING has executed - so this reproduces the L-350
#     guarantee (nothing partially committed on an aborted batch) with NO write to any
#     external table and NO risk to production data. See the report for why this, rather
#     than the brief's literal TABL wording, is the case the script treats as authoritative. ---
$Script:Proof1ProbeTargetKind = "QURY"
$Script:Proof1ProbeTargetName = "ZZPROOF1"   # obviously synthetic; 8 chars, fits TargetName
$Payload_Proof1_Regi = New-ActionBody @{
    CommitMode = "AUTO"
    RequestId  = "T20-PROOF1-REGI-0003"   # -0001/-0002 burned (escaping bug run, then the
                                           # correct-but-mislabeled-FAIL run under the old
                                           # zero-padded MessageNo assertion)
    StepsJson  = ('[{"Kind":"REGI","TargetName":"' + $Script:Proof1ProbeTargetName + '","Operation":"INSERT","ImportJson":"{\"TargetKind\":\"' + $Script:Proof1ProbeTargetKind + '\",\"IsActive\":true,\"AllowRead\":true,\"AllowWrite\":false,\"MaxRows\":10,\"LogLevel\":\"A\",\"Descr\":\"proof1 step1\"}","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"SkipRows":0},' +
                  '{"Kind":"REGI","TargetName":"' + $Script:Proof1ProbeTargetName + '","Operation":"INSERT","ImportJson":"{\"TargetKind\":\"' + $Script:Proof1ProbeTargetKind + '\",\"IsActive\":true,\"AllowRead\":true,\"AllowWrite\":false,\"MaxRows\":10,\"LogLevel\":\"A\",\"Descr\":\"proof1 step2 - duplicate, must abort the batch\"}","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"SkipRows":0}]')
}

# --- Proof 3: RegisterTarget and TABL write, run under a caller that holds EXECUTE but
#     not ADMIN. BLOCKED - no such caller exists and none may be created (see case P3). ---

# ----------------------------------------------------------------------------------
# 4. Case runner
# ----------------------------------------------------------------------------------

function Invoke-DryRunNote {
    param([string]$Id, [string]$Title, [string]$WouldDo)
    Add-Result -Id $Id -Title $Title -Status "DRYRUN" -Expected $WouldDo -Actual "not sent (-Live not supplied)"
}

function Run-ActionCase {
    param(
        [string]   $Id,
        [string]   $Title,
        [string]   $Action,
        [string]   $BodyJson,
        [scriptblock] $Assert,     # receives $resp (Invoke-Action result); returns @{ pass=[bool]; expected=...; actual=... }
        [string]   $WouldDo
    )
    Write-CaseHeader -Id $Id -Title $Title
    if (-not $Live) {
        Invoke-DryRunNote -Id $Id -Title $Title -WouldDo $WouldDo
        return
    }
    $resp = Invoke-Action -Action $Action -BodyJson $BodyJson
    $verdict = & $Assert $resp
    Add-Result -Id $Id -Title $Title `
        -Status ($(if ($verdict.pass) {"PASS"} else {"FAIL"})) `
        -Expected $verdict.expected -Actual $verdict.actual -Note $verdict.note
}

# ----------------------------------------------------------------------------------
# 5. Connectivity (always runs, read-only)
# ----------------------------------------------------------------------------------

Write-Host "Dynamic Gateway v2 regression suite - Task 20" -ForegroundColor White
Write-Host "Base URL: $($Script:BaseUrl)"
Write-Host "Live mode: $Live"
Write-Host ""

Write-CaseHeader -Id "CONNECT" -Title "GET `$metadata, sap-client=$($Script:Client), obtain CSRF token"
$conn = Connect-Gateway
if ($conn.ok) {
    Add-Result -Id "CONNECT" -Title "Metadata reachable, CSRF token obtained" -Status "PASS" `
        -Expected "HTTP 200 and a non-empty X-CSRF-Token" `
        -Actual "HTTP $($conn.status), token length $($conn.token.Length)"
} else {
    Add-Result -Id "CONNECT" -Title "Metadata reachable, CSRF token obtained" -Status "FAIL" `
        -Expected "HTTP 200 and a non-empty X-CSRF-Token" -Actual $conn.error
    if ($Live) {
        Write-Error "Cannot proceed -Live without connectivity. Stopping."
        # Fall through to summary rather than exit, so the dry-run cases below still print.
    }
}

# ==================================================================================
# SECTION A - one case per action, happy path (spec 3.1-3.5)
# ==================================================================================

Run-ActionCase -Id "A-QURY-1" -Title "RunQuery happy path against registered QURY/T000" `
    -Action "RunQuery" -BodyJson $Payload_RunQuery_T000 `
    -WouldDo "POST CallLog/RunQuery, expect HTTP 200, ExecStatus S, ResultCount 3, RowsJson carrying MANDT/MTEXT" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "HTTP 200, ExecStatus S"; actual = "HTTP $($r.httpStatus), ExecStatus $(Get-ActionResultField $r 'ExecStatus'), ResultCount $(Get-ActionResultField $r 'ResultCount')" }
    }

Run-ActionCase -Id "A-QURY-2" -Title "RunQuery refusal: unregistered target -> 017" `
    -Action "RunQuery" -BodyJson $Payload_RunQuery_Unregistered `
    -WouldDo "POST CallLog/RunQuery, expect HTTP 200 (not an HTTP error), ExecStatus E, header MessageNo 045, some row/step carrying 017" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "HTTP 200, ExecStatus E (a refusal is 200, never a non-200 - see task-18 S4/L-478)"; actual = "HTTP $($r.httpStatus), ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-QURY-3" -Title "RunQuery: Skip without OrderBy -> refused 042" `
    -Action "RunQuery" -BodyJson $Payload_RunQuery_PagingNoSort `
    -WouldDo "POST CallLog/RunQuery with SkipRows=1, OrderByJson empty; expect ExecStatus E, message 042" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, paging-without-sort refused (spec 3.3 Paging row; source-verified in ZCL_FS_DYN_RUNTIME~SELECT_ROWS and the handler's own 042 guard)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-QURY-4" -Title "RunQuery: Skip WITH a stable OrderBy -> succeeds (spec 3.3 Paging row)" `
    -Action "RunQuery" -BodyJson $Payload_RunQuery_PagingWithSort `
    -WouldDo "POST CallLog/RunQuery with SkipRows=1, OrderByJson [MANDT]; expect ExecStatus S" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S - this is the row v1 could not do at all"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), ResultCount $(Get-ActionResultField $r 'ResultCount')" }
    }

Run-ActionCase -Id "A-REGI-1" -Title "RegisterTarget: single-shot INSERT of a harmless FUNC fixture (RFC_SYSTEM_INFO)" `
    -Action "RegisterTarget" -BodyJson $Payload_RegisterTarget_Func `
    -WouldDo "POST CallLog/RegisterTarget; expect ExecStatus S, message 036; one ZFS_T_DYN_REGH row change_type I" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S, message 036 (spec 3.5 'Callable without a batch envelope')"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')"; note = "Leaves RFC_SYSTEM_INFO registered for the FUNC cases below; this is a deliberate, reusable, read-only fixture, not left-over test debris (it is documented here, not invented silently)." }
    }

Run-ActionCase -Id "A-REGI-2" -Title "RegisterTarget: duplicate of an existing target -> refused 035" `
    -Action "RegisterTarget" -BodyJson $Payload_RegisterTarget_DuplicateT000 `
    -WouldDo "POST CallLog/RegisterTarget for T000 (already registered per task-18); expect ExecStatus E, message 035, ZFS_T_DYN_REG unchanged" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 035 'Target T000 is already registered'"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-REGI-3" -Title "RegisterTarget: self-protection on ZFS_T_DYN_REG -> refused 039 (= proof 3 case 2's registration half)" `
    -Action "RegisterTarget" -BodyJson $Payload_RegisterTarget_SelfProtect `
    -WouldDo "POST CallLog/RegisterTarget for ZFS_T_DYN_REG; expect ExecStatus E, message 039, nothing written" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 039 (task-18-report.md S2 'Assertion 2')"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-FUNC-1" -Title "CallFunctionModule happy path: RFC_SYSTEM_INFO (no IMPORTING/TABLES needed)" `
    -Action "CallFunctionModule" -BodyJson $Payload_CallFunctionModule_Happy `
    -WouldDo "POST CallLog/CallFunctionModule; requires A-REGI-1 to have run first (target must be registered); expect ExecStatus S" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S, ExportJson carrying RFC_SYSTEM_INFO's EXPORTING structure"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-FUNC-2" -Title "CallFunctionModule: nonexistent FM -> refused 019" `
    -Action "CallFunctionModule" -BodyJson $Payload_CallFunctionModule_Missing `
    -WouldDo "POST CallLog/CallFunctionModule for ZZ_NOT_A_REAL_FM; expect ExecStatus E, message 017 (not registered) - 019 only fires for a REGISTERED target whose TFDIR lookup then misses, which cannot happen for a name that was never registered at all; corrected from the brief's literal expectation after re-reading ZFS_I_DynGateway's own ordering" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E (017 registry-miss, since ZZ_NOT_A_REAL_FM was never registered)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-FUNC-3" -Title "CallFunctionModule: CHANGING parameter in RFC mode -> must be refused, clear message" `
    -Action "CallFunctionModule" -BodyJson (New-ActionBody @{ TargetName = "__NEEDS_HUMAN_CHOICE__"; ImportJson = "[]"; TablesJson = "[]"; RequestId = "" }) `
    -WouldDo "BLOCKED BY DESIGN: needs a registered FM that has at least one CHANGING parameter and CallMode R. No such FM is registered on this system and none was chosen here (rule 3 - no invented target). A human must name one (or accept registering a standard SAP FM with a CHANGING parameter, e.g. from the BAPI catalogue) before this case can run for real." `
    -Assert {
        param($r)
        @{ pass = $false; expected = "n/a - placeholder body, do not send"; actual = "n/a" }
    }
if (-not $Live) {
    # Overwrite the auto-added DRYRUN row above with an explicit BLOCKED marker so this
    # gap cannot be mistaken for "covered".
    $Script:Results.RemoveAt($Script:Results.Count - 1) | Out-Null
    Add-Result -Id "A-FUNC-3" -Title "CallFunctionModule: CHANGING parameter in RFC mode -> must be refused, clear message" `
        -Status "BLOCKED" -Expected "spec 3.1 'CHANGING parameters ... RFC mode refused with a clear message'" `
        -Actual "not runnable - no CHANGING-parameter FM is registered or chosen" `
        -Note "Human decision needed: name a real function module with a CHANGING parameter before this case can be authored further."
} else {
    $Script:Results.RemoveAt($Script:Results.Count - 1) | Out-Null
    Add-Result -Id "A-FUNC-3" -Title "CallFunctionModule: CHANGING parameter in RFC mode -> must be refused, clear message" `
        -Status "BLOCKED" -Expected "spec 3.1 'CHANGING parameters ... RFC mode refused with a clear message'" `
        -Actual "not sent - no CHANGING-parameter FM is registered or chosen" `
        -Note "Human decision needed: name a real function module with a CHANGING parameter before this case can run."
}

Run-ActionCase -Id "A-TABL-1" -Title "ExecuteTableCrud: empty ImportJson array -> refused (self-protection 039 fires first on this target)" `
    -Action "ExecuteTableCrud" -BodyJson $Payload_ExecuteTableCrud_EmptyArray `
    -WouldDo "POST CallLog/ExecuteTableCrud, TargetName ZFS_T_DYN_REG, ImportJson []; expect ExecStatus E. Order matters (ZCL_FS_DYN_HDL_TABLE~PREPARE runs reject_own_object BEFORE parse_rows), so the message will be 039, not 022 - deliberately chosen against a self-protected target so this case needs no external table at all. See A-TABL-3 for the 022 case proper." `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 039 (self-protection precedes the empty-array check - confirmed by reading ZCL_FS_DYN_HDL_TABLE~PREPARE's TRY block order)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Run-ActionCase -Id "A-TABL-2" -Title "ExecuteTableCrud: self-protection on ZFS_T_DYN_REG -> refused 039 (proof 3 case 2)" `
    -Action "ExecuteTableCrud" -BodyJson $Payload_ExecuteTableCrud_SelfProtect `
    -WouldDo "POST CallLog/ExecuteTableCrud, TargetName ZFS_T_DYN_REG, one real-shaped row; expect ExecStatus E, message 039, table unchanged" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 039"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

if ($ProbeTable -and $ProbeKeyField) {
    $importRow = '[{"' + $ProbeKeyField + '":"' + $ProbeKeyValue + '"}]'
    $Payload_ExecuteTableCrud_Happy = New-ActionBody @{
        TargetName = $ProbeTable
        Operation  = "INSERT"
        ImportJson = $importRow
        RequestId  = ""
    }
    Run-ActionCase -Id "A-TABL-3" -Title "ExecuteTableCrud happy path: single INSERT against the configured probe table" `
        -Action "ExecuteTableCrud" -BodyJson $Payload_ExecuteTableCrud_Happy `
        -WouldDo "POST CallLog/ExecuteTableCrud against -ProbeTable; expect ExecStatus S, ResultCount 1. LEAVES ONE ROW BEHIND - clean it up (RegisterTarget was not asked to delete it, and this script does not delete rows in someone else's table on its own authority)." `
        -Assert {
            param($r)
            $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
            @{ pass = $ok; expected = "ExecStatus S, ResultCount 1"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), ResultCount $(Get-ActionResultField $r 'ResultCount')" }
        }
} else {
    Add-Result -Id "A-TABL-3" -Title "ExecuteTableCrud happy path (real INSERT/MODIFY/DELETE against a live target)" `
        -Status "SKIP" -Expected "spec 3.2 basic CRUD rows" `
        -Actual "skipped - no -ProbeTable/-ProbeKeyField configured" `
        -Note "Needs a real, human-approved, non-framework writable table. Provide -ProbeTable/-ProbeKeyField to run this and P1-TABL below."
}

Run-ActionCase -Id "A-SUBM-1" -Title "SubmitReport: unregistered RSUSR003 -> refused 017 (this IS proof 2 - see also section C)" `
    -Action "SubmitReport" -BodyJson $Payload_SubmitReport_Unregistered `
    -WouldDo "POST CallLog/SubmitReport for RSUSR003 (deliberately never registered); expect ExecStatus E, message 017, nothing runs" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 017, 'nothing runs' (no ALV, no list, no job) - spec Proof 2"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo')" }
    }

Add-Result -Id "A-SUBM-2" -Title "SubmitReport happy path against a real, qualified, registered report" `
    -Status "SKIP" -Expected "spec 3.4 rows (SALV/LIST/MEMO/NONE capture modes, variant, RSPARAMS bounds)" `
    -Actual "skipped - no report is registered as a SUBM target on this system" `
    -Note "Registering a report is itself a live RegisterTarget write with SUBM qualification (043 gate) that a human should approve the choice of program for, per the same rule-3 reasoning as -ProbeTable. A safe standard candidate exists (RSPARAM, used live in task-13's LTC_FACTORY_LIVE) and is named here for whoever runs this suite to register first if desired."

Run-ActionCase -Id "A-BATCH-1" -Title "ExecuteBatch: malformed StepsJson -> refused 022 (L-477)" `
    -Action "ExecuteBatch" -BodyJson $Payload_ExecuteBatch_MalformedSteps `
    -WouldDo "POST CallLog/ExecuteBatch with StepsJson='[{not json'; expect ExecStatus E, message 022 'Invalid JSON in parameter StepsJson'. Task 18 found and fixed a defect here (malformed = successful empty batch) - this case is the regression guard for that exact fix." `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E"
        @{ pass = $ok; expected = "ExecStatus E, message 022 - NOT ExecStatus S with an empty StepsJson result (that was the pre-fix defect, L-477)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo'), StepsJson `"$(Get-ActionResultField $r 'StepsJson')`"" }
    }

Run-ActionCase -Id "A-BATCH-2" -Title "ExecuteBatch: empty StepsJson '[]' -> legitimate no-op success (L-477)" `
    -Action "ExecuteBatch" -BodyJson $Payload_ExecuteBatch_EmptySteps `
    -WouldDo "POST CallLog/ExecuteBatch with StepsJson='[]'; expect ExecStatus S (an empty batch is legitimate, not an error)" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S - the second half of L-477's fix, which the first fix attempt broke"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus')" }
    }

Run-ActionCase -Id "A-BATCH-3" -Title "ExecuteBatch: two QURY steps, composite happy path" `
    -Action "ExecuteBatch" -BodyJson $Payload_ExecuteBatch_TwoQuery `
    -WouldDo "POST CallLog/ExecuteBatch, RequestId T20-BATCH-TWOQUERY-0001; expect ExecStatus S, StepsJson carrying two S outcomes" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S, ResultCount 2 (one row from each of T000/T005)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), ResultCount $(Get-ActionResultField $r 'ResultCount')" }
    }

Run-ActionCase -Id "B-IDEMPOTENT" -Title "ExecuteBatch: same RequestId replayed -> Replayed=true, nothing re-executed" `
    -Action "ExecuteBatch" -BodyJson $Payload_ExecuteBatch_TwoQuery `
    -WouldDo "POST the IDENTICAL body as A-BATCH-3 a second time; expect ExecStatus S, Replayed true, the SAME GwUuid as A-BATCH-3 returned, and no new CallLog/CallStep rows written" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "Replayed") -in @($true, "X", "true")
        @{ pass = $ok; expected = "Replayed true/X, same GwUuid as the first call"; actual = "Replayed $(Get-ActionResultField $r 'Replayed'), GwUuid $(Get-ActionResultField $r 'GwUuid')"; note = "Run A-BATCH-3 immediately before this case in the same session so the RequestId is genuinely a repeat, not a fresh one." }
    }

# ==================================================================================
# SECTION B - authorization / commit-mode capability rows not covered above
# ==================================================================================

$Payload_ExecuteBatch_CommitNever = New-ActionBody @{
    CommitMode = "NEVER"
    RequestId  = "T20-COMMITNEVER-0002"   # -0001-style id is burned: pre-L-488-fix escaping bug
    StepsJson  = '[{"Kind":"QURY","TargetName":"T000","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"MANDT\"]","FilterJson":"","OrderByJson":"","MaxRows":1,"SkipRows":0}]'
}
Run-ActionCase -Id "B-COMMITMODE-NEVER" -Title "ExecuteBatch: CommitMode NEVER rolls back a wholly successful run (dry run)" `
    -Action "ExecuteBatch" -BodyJson $Payload_ExecuteBatch_CommitNever `
    -WouldDo "POST CallLog/ExecuteBatch, CommitMode NEVER; expect ExecStatus S but the dispatcher's own RolledBack=true (per ZCL_FS_DYN_DISPATCH~RUN, CommitMode NEVER path) - a caller-requested throwaway of an otherwise-successful batch, distinct from an abort" `
    -Assert {
        param($r)
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "S"
        @{ pass = $ok; expected = "ExecStatus S (the run itself succeeded; CommitMode NEVER only discards it - source-verified in ZCL_FS_DYN_DISPATCH~RUN)"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus')"; note = "This action result does not expose Committed/RolledBack directly on the OData contract as far as this script can see from the outside; if the schema does carry it, assert it here too. Flagged, not assumed." }
    }

# ==================================================================================
# SECTION C - the three mandated proofs
# ==================================================================================

Write-Host ""
Write-Host "---- PROOF 1: the L-350 closure ----" -ForegroundColor Magenta

if ($ProbeTable -and $ProbeKeyField) {
    $importRows = '[{"' + $ProbeKeyField + '":"' + $ProbeKeyValue + '"},{"' + $ProbeKeyField + '":"' + $ProbeKeyValue + '"}]'
    $Payload_Proof1_Tabl = New-ActionBody @{
        CommitMode = "AUTO"
        RequestId  = "T20-PROOF1-TABL-0001"
        StepsJson  = ('[{"Kind":"TABL","TargetName":"' + $ProbeTable + '","Operation":"INSERT","ImportJson":"[{\"' + $ProbeKeyField + '\":\"' + $ProbeKeyValue + '\"}]","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"SkipRows":0},' +
                      '{"Kind":"TABL","TargetName":"' + $ProbeTable + '","Operation":"INSERT","ImportJson":"[{\"' + $ProbeKeyField + '\":\"' + $ProbeKeyValue + '\"}]","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"SkipRows":0}]')
    }
    Run-ActionCase -Id "P1-TABL" -Title "Literal brief form: two TABL INSERT steps, same primary key, against -ProbeTable" `
        -Action "ExecuteBatch" -BodyJson $Payload_Proof1_Tabl `
        -WouldDo "POST CallLog/ExecuteBatch, two identical single-row INSERTs against -ProbeTable/-ProbeKeyField=-ProbeKeyValue" `
        -Assert {
            param($r)
            $status = Get-ActionResultField $r "ExecStatus"
            if ($status -eq "E") {
                @{ pass = $true; expected = "ExecStatus E, message 045 naming step 2 (brief's literal expectation)"; actual = "ExecStatus E, MessageNo $(Get-ActionResultField $r 'MessageNo') - MATCHES the brief" }
            } elseif ($status -eq "S") {
                @{ pass = $false; expected = "ExecStatus E, message 045 naming step 2"; actual = "ExecStatus S - THIS IS THE KNOWN DISCREPANCY: ZCL_FS_DYN_RUNTIME~MODIFY_TABLE runs 'INSERT ... ACCEPTING DUPLICATE KEYS', which suppresses a PRIMARY KEY duplicate as sy-subrc=4 rather than raising an exception, so ZCL_FS_DYN_HDL_TABLE~EXECUTE reports step 2 as a PARTIAL WRITE (severity W, message 048), not a step failure - and the batch commits. If your -ProbeTable's key IS the primary key, this is expected given today's code, not a script bug. STOP and report per the brief; do not proceed to Task 21 on this basis alone - see report for the corroborating P1-REGI case, which reproduces the same guarantee (nothing committed on an aborted batch) without this ambiguity." }
            } else {
                @{ pass = $false; expected = "ExecStatus E or S (see note)"; actual = "ExecStatus $status - unexpected, investigate before drawing any conclusion" }
            }
        }

    Write-CaseHeader -Id "P1-TABL-VERIFY" -Title "SELECT-equivalent: RunQuery against -ProbeTable for the probe key, expect exactly the row count P1-TABL's own outcome implies"
    if ($Live) {
        $filterJson = '[{"field":"' + $ProbeKeyField + '","op":"EQ","value":"' + $ProbeKeyValue + '"}]'
        $verifyBody = New-ActionBody @{ TargetName = $ProbeTable; FieldsJson = ('["' + $ProbeKeyField + '"]'); FilterJson = $filterJson; OrderByJson = ""; MaxRows = 10; SkipRows = 0; RequestId = "" }
        $vr = Invoke-Action -Action "RunQuery" -BodyJson $verifyBody
        $count = Get-ActionResultField $vr "ResultCount"
        Add-Result -Id "P1-TABL-VERIFY" -Title "Row count for the probe key after P1-TABL" -Status $(if ($count -eq 0) {"PASS"} elseif ($count -eq 1) {"BLOCKED"} else {"FAIL"}) `
            -Expected "0 (v1's counter-example returned 1 - this is the number that must never come back non-zero after an abort)" `
            -Actual "$count" `
            -Note $(if ($count -eq 1) { "Consistent with the ACCEPTING DUPLICATE KEYS finding above: step 1's single row legitimately committed because the batch never aborted. This is NOT the L-350 counter-example (that was TWO rows surviving an abort); it is ordinary success. Still worth the human's attention because it means -ProbeTable now carries a probe row that must be deleted by hand (no delete route was invoked - this script does not delete rows in a table it does not own)." } elseif ($count -gt 1) { "UNEXPECTED - more than one row for a single-row key. STOP. Do not proceed to Task 21. Report this exactly." } else { "" })
        Add-Result -Id "P1-TABL-CLEANUP" -Title "Probe row cleanup reminder" -Status "SKIP" `
            -Expected "n/a" -Actual "n/a" `
            -Note "This script deliberately does NOT delete rows from -ProbeTable on its own authority (project rule 3/9: no unrequested action on someone else's table). If P1-TABL left a row behind, delete it by hand via ExecuteTableCrud DELETE or ADT, exactly as Task 3's own IDX_PROBE convention required."
    } else {
        Invoke-DryRunNote -Id "P1-TABL-VERIFY" -Title "Row count check for the probe key" -WouldDo "POST CallLog/RunQuery filtered to the probe key; compare ResultCount against P1-TABL's outcome"
    }
} else {
    Add-Result -Id "P1-TABL" -Title "Literal brief form: two TABL INSERT steps, same primary key" `
        -Status "SKIP" -Expected "brief step 2, row 1: two TABL INSERT steps, same key" `
        -Actual "skipped - no -ProbeTable/-ProbeKeyField configured (see script header; no object was created or assumed for this authoring pass)" `
        -Note "IMPORTANT even when skipped: source review of ZCL_FS_DYN_RUNTIME~MODIFY_TABLE shows INSERT runs ACCEPTING DUPLICATE KEYS, so a same-PRIMARY-KEY duplicate across two TABL steps will NOT raise a step error - it reports a partial write (S/048), and BOTH the batch commits and the first row is legitimately written. Reproducing a genuine abort via TABL would need a target whose SECONDARY unique index (not primary key) the second insert violates, since ACCEPTING DUPLICATE KEYS does not suppress those. This is a finding for the human, not a script defect - see the report."
}

# P1-REGI always runs under -Live: no external table, no risk, self-cleaning by construction
# (the duplicate is refused before either row is ever written - see method header comment above).
Run-ActionCase -Id "P1-REGI" -Title "Corroborating reproduction: two REGI steps registering the identical (TargetKind, TargetName)" `
    -Action "ExecuteBatch" -BodyJson $Payload_Proof1_Regi `
    -WouldDo "POST CallLog/ExecuteBatch, two REGI INSERT steps for $($Script:Proof1ProbeTargetKind)/$($Script:Proof1ProbeTargetName); expect ExecStatus E, header MessageNo 045 naming step 2, step 2's own MessageNo 035" `
    -Assert {
        param($r)
        # L-490 (live acceptance): MessageNo comes back as "45", not "045" - the OData
        # layer does not zero-pad. Compare numerically so the assertion does not fail
        # on a formatting difference that has nothing to do with the outcome itself.
        $ok = $r.ok -and $r.httpStatus -eq 200 -and (Get-ActionResultField $r "ExecStatus") -eq "E" -and [int](Get-ActionResultField $r "MessageNo") -eq 45
        @{ pass = $ok; expected = "ExecStatus E, header MessageNo 045 (the step-2 index is embedded in MessageText - inspect it: 'Batch aborted at step 2: ...')"; actual = "ExecStatus $(Get-ActionResultField $r 'ExecStatus'), MessageNo $(Get-ActionResultField $r 'MessageNo'), MessageText `"$(Get-ActionResultField $r 'MessageText')`"" }
    }

Write-CaseHeader -Id "P1-REGI-VERIFY" -Title "Confirm the probe target was never registered (GET /Registry, filtered)"
if ($Live) {
    $filter = "TargetKind eq '$($Script:Proof1ProbeTargetKind)' and TargetName eq '$($Script:Proof1ProbeTargetName)'"
    $gr = Get-EntitySet -EntitySet "Registry" -Filter $filter
    $rows = @()
    if ($gr.ok -and $gr.body.value) { $rows = $gr.body.value }
    Add-Result -Id "P1-REGI-VERIFY" -Title "ZFS_T_DYN_REG row count for the proof-1 probe target" `
        -Status $(if ($rows.Count -eq 0) {"PASS"} else {"FAIL"}) `
        -Expected "0 (this IS the L-350 closure: an aborted batch's phase-1 casualty must never have reached the database at all - v1's counter-example returned 1)" `
        -Actual "$($rows.Count)" `
        -Note $(if ($rows.Count -gt 0) { "STOP. Do not proceed to Task 21. Report this exactly per the brief's instruction on Proof 1." } else { "" })
} else {
    Invoke-DryRunNote -Id "P1-REGI-VERIFY" -Title "Registry row count for the proof-1 probe target" -WouldDo "GET Registry?`$filter=TargetKind eq '$($Script:Proof1ProbeTargetKind)' and TargetName eq '$($Script:Proof1ProbeTargetName)'; expect zero rows"
}

Write-Host ""
Write-Host "---- PROOF 2: SUBM against an unregistered target ----" -ForegroundColor Magenta
Write-Host "Covered by case A-SUBM-1 above (RSUSR003, deliberately never registered)." -ForegroundColor Gray

Write-Host ""
Write-Host "---- PROOF 3: EXECUTE vs ADMIN split ----" -ForegroundColor Magenta
Add-Result -Id "P3-REGISTER" -Title "RegisterTarget attempted by a caller holding EXECUTE but not ADMIN -> must be refused 040" `
    -Status "BLOCKED" -Expected "spec Proof 3 row 1: ExecStatus E, message 040" `
    -Actual "cannot be run - FS_DEV3 (this script's only credential) holds ALL FOUR ZFS_DYNGW activities (01/02/03/16), so it cannot demonstrate the EXECUTE/ADMIN split" `
    -Note "Per the brief: creating a role, user or profile is forbidden, and substituting the privileged user would pass whether or not the control works and prove nothing. Human prerequisite: a second SAP user holding only ZFS_DYNGW ACTVT 16 (EXECUTE), no 01/02/03 (ADMIN). Task 18 flagged the identical gap for G2's DCL test. This case is authored and ready to run the moment that user exists - see the report for the exact credential parameters this script would need (-User2/-Password2Env, not yet added, so nobody mistakes an unfinished parameter set for a working one)."

Add-Result -Id "P3-TABLWRITE" -Title "TABL write to ZFS_T_DYN_REG by the same restricted caller -> must be refused 039; ZFS_T_DYN_REG unchanged" `
    -Status "BLOCKED" -Expected "spec Proof 3 row 1: ExecStatus E, message 039" `
    -Actual "cannot be run - same prerequisite gap as P3-REGISTER" `
    -Note "The 039 self-protection mechanism itself IS exercised, with FS_DEV3, in A-TABL-2/A-REGI-3 above - what is missing here is specifically the AUTHORIZATION half (does a non-ADMIN caller get 040 before even reaching that self-protection check on RegisterTarget, and does 039 alone suffice to protect ZFS_T_DYN_REG from write access that carries ordinary EXECUTE). Do not read A-TABL-2/A-REGI-3 as satisfying this proof - they demonstrate the self-protection rule, not the authorization split around it."

# ==================================================================================
# 6. Summary
# ==================================================================================

Write-Host ""
Write-Host "==================== SUMMARY ====================" -ForegroundColor White
$Script:Results | Format-Table -Property Id, Status, Title -AutoSize | Out-String | Write-Host

$counts = $Script:Results | Group-Object Status | Select-Object Name, Count
foreach ($c in $counts) { Write-Host "$($c.Name): $($c.Count)" }

$failCount = ($Script:Results | Where-Object { $_.Status -eq "FAIL" }).Count
if ($Live -and $failCount -gt 0) {
    Write-Host ""
    Write-Host "$failCount case(s) FAILED. Do not treat this run as a clean acceptance pass." -ForegroundColor Red
    exit 1
}
if (-not $Live) {
    Write-Host ""
    Write-Host "This was a DRY RUN. No request was sent to DS4_100_NIIF. Re-run with -Live only after Task 18's forensic review of ZFS_T_DYN_REG/REGH has cleared." -ForegroundColor Yellow
}
exit 0
