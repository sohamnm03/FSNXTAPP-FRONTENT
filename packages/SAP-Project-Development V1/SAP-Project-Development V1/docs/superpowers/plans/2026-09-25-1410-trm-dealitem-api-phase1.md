# TRM deal-item API (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `ZFS_SB_TRMDEALITEM_O4_API`, one product-independent OData V4 Web API with writable
`Condition`, `AdditionalFlow`, `MainFlow` and `PaymentDetail` entity sets over the released
`BAPI_FTR_CONDITION_*`, `BAPI_FTR_ADDFLOW_*`, `BAPI_FTR_MAINFLOW_*` and `BAPI_FTR_PAYDET_*` BAPIs, and
add a read-only `ActivityCategory` to the existing interest rate instrument API.

**Architecture:** Four independent root custom entities (one BDEF + behavior pool each, unmanaged,
strict(2), no draft) share one query class that reads per deal through the `*_GETLIST` BAPIs and applies
`$filter`/`$orderby`/paging in ABAP. Every write calls its BAPI `DESTINATION 'NONE'` and commits or
rolls back in that session (L-227). Nothing is built or tested locally: every object is created and
activated on DS4/100 over MCP, and every task ends with a live PowerShell test against the published service.

**Tech Stack:** ABAP RAP (unmanaged custom entities, SAP_BASIS 758), CDS, OData V4, MCP servers
`adt-mcp` / `mcp-abap-abap-adt-api` / `sap-gui`, PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-09-25-1410-trm-deal-apis-design.md` (§3 shared pattern, §4 API 1,
§7 ActivityCategory, §9 Phase 1). Phases 2–4 (FX, FX option, LC) get their own plans after this one.

## Global Constraints

- System `DS4_100_NIIF` (DS4, client 100) only. Confirm with `sap_get_session_info` before the publish step.
- Package `ZFS_SLC_APP`, transport `DS4K907209` (FS_DEV3 task `DS4K907260`); `transportInfo` after every create.
- No `$TMP`, no helper/runner/test objects on SAP (rule 3). Only the objects named in this plan.
- Naming gate: a `NAMING:` line in the phase worklog **before** each create call.
- Routing: DDLS, SRVD and classes via `mcp-abap-abap-adt-api createObject` + transport (L-546 fallback,
  reason recorded in the worklog); BDEF and SRVB via `adt-mcp create_object` with top-level
  `transportRequestNumber` (L-564). All changes via `mcp-abap-abap-adt-api` lock/setObjectSource/unLock.
- No draft (L-224). No new message except **056** (Task 1). Messages from `ZFS_TRM_MSG` only.
- Every `RETURN` table typed `WITH DEFAULT KEY` (L-568). No `COMMIT WORK`/`ROLLBACK WORK` in behavior code.
- Live tests: sandboxed PowerShell, `sap-client=100` on every URL, one fresh cookie session per call (L-569).
- Budget `runQuery`: about 30 per ADT session (L-569). Ask the human for `/mcp` reconnect between tasks if calls start failing.
- Worklog `worklog/DS4_100_NIIF/2026-09/<YYYY-MM-DD>-<HHmm>-trm-dealitem-api-phase1.md` (actual start
  time, L-502); evidence in `worklog/DS4_100_NIIF/2026-09/evidence/<same stem>/`; a ledger entry in the
  same turn as any new finding or instruction.

## Review Focus

1. **A GET without the deal filter** — must answer a clean 4xx/5xx refusal with message 056, never an
   empty 200 or a dump. Pinned by step `2-list-without-deal-filter` of `dealitem-crud.ps1` (every item task).
2. **A POST that fails after the BAPI committed** (L-568) — the caller sees an error while the item
   exists. Pinned by the row-count check (`rows after` = `rows before`) in every item task, and Task 7
   re-lists every set once more.
3. **A two-sided deal (`Side` 1/2)** — the `*_GETLIST` calls pass no `SIDE`, so only side 0 might come
   back. Task 7 step 3 reads a swap-like deal (if one exists in 1000) and records whether both sides appear.
4. **`FinancialTransaction` in the filter without leading zeros** (`'160534'` vs `'0000000160534'`) —
   `get_deal` applies `ALPHA = IN`. Pinned by every test, which filters on the unpadded number.
5. **A `$filter` on a non-key field** (e.g. `ConditionType eq '1200'`) — must filter, not be ignored.
   Task 3 step 9 runs one and checks the row count drops.

---

## File structure

| Object / file | Responsibility |
|---|---|
| `ZFS_CE_TrmIrateTP` (changed) | + `ActivityCategory` element |
| `ZCL_FS_TRM_IRATE_QUERY` (changed) | fills `ActivityCategory` from DEALGET |
| `ZFS_TRM_MSG` 056 (new message) | "filter on company code and deal is required" |
| `ZFS_CE_TrmDealCondTP` / `…AddFlowTP` / `…MainFlowTP` / `…PayDetTP` + BDEF each | one entity set each |
| `ZBP_FS_TRMDEALCONDTP` / `…ADDFLOWTP` / `…MAINFLOWTP` / `…PAYDETTP` | create/update/delete/read over the item BAPIs |
| `ZCL_FS_TRM_DEALITEM_QUERY` | GET for all four sets: per-deal GETLIST + ABAP filter/sort/page |
| `ZFS_SD_TRMDEALITEM`, `ZFS_SB_TRMDEALITEM_O4_API` | service definition, OData V4 Web API binding |
| `scripts/trm-deal-api-tests/trm-odata.ps1` | shared PowerShell call/log helper |
| `scripts/trm-deal-api-tests/dealitem-crud.ps1` | CRUD test for one entity set |
| `scripts/trm-deal-api-tests/dealitem-discover.ps1` | finds real values for create payloads |

---

### Task 1: Phase set-up — worklog, message 056, test scripts, `ActivityCategory`, test deal

**Files:**
- Create: `worklog/DS4_100_NIIF/2026-09/<YYYY-MM-DD>-<HHmm>-trm-dealitem-api-phase1.md` (from `worklog/_TEMPLATE.md`)
- Create: `scripts/trm-deal-api-tests/trm-odata.ps1`, `dealitem-crud.ps1`, `dealitem-discover.ps1`
- Modify: `docs/message-catalog/DS4_100_NIIF.md` (row 056, next free → 057)
- Modify on SAP: `ZFS_TRM_MSG`, `ZFS_CE_TrmIrateTP`, `ZCL_FS_TRM_IRATE_QUERY`

**Interfaces:**
- Produces: message `ZFS_TRM_MSG` 056; `Invoke-Trm $service $step $method $path $body $log` returning
  `{Status, Content, Messages}`; `Get-KeyPredicate $row $keyNames`; `$deal` (a new 22A deal number, stored in the worklog).

- [ ] **Step 1: Open the worklog**

Copy `worklog/_TEMPLATE.md` to the worklog path above (real start time). Scope = spec §4 + §7 Phase 1.
Open questions: carry over spec §10 risks 2, 3, 5. Todo = Tasks 1–7 of this plan.

- [ ] **Step 2: Write the three test scripts**

`scripts/trm-deal-api-tests/trm-odata.ps1`:

```powershell
# Shared helper for the TRM deal API live tests (dot-source it).
# One fresh cookie session per call: a GET reusing the session of a PATCH/DELETE answered 501 (L-569).
# Needs $env:SAP_DS4_100_NIIF_PASSWORD; sap-client=100 on every URL (L-253).
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script:SapHost = 'https://vhnlqds4ap01.sap.niififl.in:44300'
if (-not $env:SAP_DS4_100_NIIF_PASSWORD) { throw 'SAP_DS4_100_NIIF_PASSWORD not set' }
$script:Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:$($env:SAP_DS4_100_NIIF_PASSWORD)"))

function Invoke-Trm {
  param([string]$Service, [string]$Step, [string]$Method, [string]$Path, [string]$Body, [string]$Log)
  $base = "$script:SapHost/sap/opu/odata4/sap/$($Service.ToLower())"
  $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $h = @{ Authorization = $script:Auth; Accept = 'application/json' }
  if ($Path -eq '$metadata') { $h['Accept'] = 'application/xml' }
  if ($Method -ne 'GET') {
    $t = Invoke-WebRequest -UseBasicParsing -Uri "$base/`$metadata?sap-client=100" -Headers @{ Authorization = $script:Auth; 'x-csrf-token' = 'Fetch'; Accept = 'application/xml' } -WebSession $ws
    $h['x-csrf-token'] = $t.Headers['x-csrf-token']
    if ($Method -in 'PATCH', 'DELETE') { $h['If-Match'] = '*' }
  }
  $sep = if ($Path.Contains('?')) { '&' } else { '?' }
  $u = "$base/$Path${sep}sap-client=100"
  $status = 0; $content = ''; $msgs = ''
  try {
    if ($Body) { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -Method $Method -Headers $h -WebSession $ws -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -ContentType 'application/json' }
    else       { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -Method $Method -Headers $h -WebSession $ws }
    $status = [int]$r.StatusCode; $content = $r.Content; $msgs = $r.Headers['sap-messages']
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
    $content = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
  }
  $entry = "### $Step`n$Method $u`n"; if ($Body) { $entry += "Body: $Body`n" }
  $entry += "Status: $status`nsap-messages: $msgs`n$content`n`n"
  if ($Log) { Add-Content -Path $Log -Value $entry -Encoding UTF8 }
  Write-Host "[$Step] $status"
  return [pscustomobject]@{ Status = $status; Content = $content; Messages = $msgs }
}

# Build an OData key predicate from an entity JSON object and the key names.
# Edm.Date values (yyyy-mm-dd) are unquoted, everything else is a quoted string.
function Get-KeyPredicate {
  param($Row, [string[]]$KeyNames)
  $parts = foreach ($k in $KeyNames) {
    $v = [string]$Row.$k
    if ($v -match '^\d{4}-\d{2}-\d{2}$') { "$k=$v" } else { "$k='$v'" }
  }
  return '(' + ($parts -join ',') + ')'
}
```

`scripts/trm-deal-api-tests/dealitem-crud.ps1`:

```powershell
# Live CRUD test for one entity set of ZFS_SB_TRMDEALITEM_O4_API against one deal.
# Usage:
#   .\dealitem-crud.ps1 -EvidenceDir <dir> -Set Condition -Company 1000 -Deal 160534 `
#       -KeyNames CompanyCode,FinancialTransaction,Side,ConditionKey `
#       -CreateBody '{...}' -PatchBody '{"PercentageRate":12.5}' -PatchField PercentageRate
# Writes <EvidenceDir>\<Set>-crud-log.txt. Exit 0 = every step as expected, 1 = a step failed.
param([string]$EvidenceDir, [string]$Set, [string]$Company, [string]$Deal, [string[]]$KeyNames,
      [string]$CreateBody, [string]$PatchBody, [string]$PatchField)
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$svc = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$log = Join-Path $EvidenceDir "$Set-crud-log.txt"
$filter = "`$filter=CompanyCode eq '$Company' and FinancialTransaction eq '$Deal'"
$fail = $false

$before = Invoke-Trm $svc "1-list-before" GET "$Set`?$filter&`$count=true" $null $log
if ($before.Status -ne 200) { exit 1 }
$countBefore = ($before.Content | ConvertFrom-Json).'@odata.count'
Write-Host "rows before: $countBefore"

$noFilter = Invoke-Trm $svc "2-list-without-deal-filter" GET "$Set" $null $log
if ($noFilter.Status -lt 400) { Write-Host 'EXPECTED a 4xx/5xx refusal without the deal filter'; $fail = $true }

$c = Invoke-Trm $svc "3-create" POST $Set $CreateBody $log
if ($c.Status -ne 201) { Write-Host 'create failed'; exit 1 }
$row = $c.Content | ConvertFrom-Json
$key = Get-KeyPredicate $row $KeyNames
Write-Host "created $Set$key"

$r = Invoke-Trm $svc "4-read" GET "$Set$key" $null $log
if ($r.Status -ne 200) { $fail = $true }

if ($PatchBody) {
  $p = Invoke-Trm $svc "5-patch" PATCH "$Set$key" $PatchBody $log
  if ($p.Status -ne 200) { $fail = $true }
  $r2 = Invoke-Trm $svc "6-read-after-patch" GET "$Set$key" $null $log
  $want = ($PatchBody | ConvertFrom-Json).$PatchField
  $got = ($r2.Content | ConvertFrom-Json).$PatchField
  $ok = ([string]$got -eq [string]$want)
  $gd = 0.0; $wd = 0.0
  if (-not $ok -and [double]::TryParse([string]$got, [ref]$gd) -and [double]::TryParse([string]$want, [ref]$wd)) { $ok = ($gd -eq $wd) }
  if (-not $ok) { Write-Host "PATCH not applied: $PatchField = $got, expected $want"; $fail = $true }
}

$d = Invoke-Trm $svc "7-delete" DELETE "$Set$key" $null $log
if ($d.Status -ne 204) { $fail = $true }

$after = Invoke-Trm $svc "8-list-after" GET "$Set`?$filter&`$count=true" $null $log
$countAfter = ($after.Content | ConvertFrom-Json).'@odata.count'
Write-Host "rows after: $countAfter"
if ($countAfter -ne $countBefore) { Write-Host 'row count did not return to its starting value'; $fail = $true }

if ($fail) { exit 1 } else { exit 0 }
```

`scripts/trm-deal-api-tests/dealitem-discover.ps1`:

```powershell
# Find real values to build create payloads from: reads the given entity set for the first
# N 22A deals of company 1000 and prints the first non-empty rows.
# Usage: .\dealitem-discover.ps1 -EvidenceDir <dir> -Set AdditionalFlow -Top 40
param([string]$EvidenceDir, [string]$Set, [int]$Top = 40)
. (Join-Path $PSScriptRoot 'trm-odata.ps1')
$log = Join-Path $EvidenceDir "$Set-discover-log.txt"
$irate = 'zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001'
$item = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$deals = (Invoke-Trm $irate 'deals' GET "InterestRateInstrument?`$top=$Top&`$filter=CompanyCode eq '1000' and ProductType eq '22A'&`$orderby=FinancialTransaction desc" $null $log).Content | ConvertFrom-Json
foreach ($d in $deals.value) {
  $res = Invoke-Trm $item "items-$($d.FinancialTransaction)" GET "$Set`?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$($d.FinancialTransaction)'" $null $log
  $rows = ($res.Content | ConvertFrom-Json).value
  if ($rows.Count -gt 0) { $rows | Select-Object -First 3 | ConvertTo-Json -Depth 3; break }
}
```

- [ ] **Step 3: Create message 056**

`mcp-abap-abap-adt-api` `lock` `/sap/bc/adt/messageclass/zfs_trm_msg`, `getObjectSource`, add the message
**056** with text `Filter on CompanyCode and FinancialTransaction (eq) is required` (61 chars), `setObjectSource`
with transport `DS4K907209`, `unLock` (confirmed MSAG route, L-225 context). Verify with
`runQuery "SELECT msgnr, text FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG' AND msgnr = '056'"`.
In the same turn, add to `docs/message-catalog/DS4_100_NIIF.md`:

```
| 056 | E | Filter on CompanyCode and FinancialTransaction (eq) is required | — | `ZCL_FS_TRM_DEALITEM_QUERY` — a GET on any deal-item entity set without an `eq` filter on both deal key fields |
```

and change **Next free number** to **057**.

- [ ] **Step 4: Check that `CX_RAP_QUERY_COND` takes a T100 `textid`**

`getObjectSource` `/sap/bc/adt/oo/classes/cx_rap_query_cond/source/main`. If its `CONSTRUCTOR` has a
`TEXTID` parameter and the class implements `IF_T100_MESSAGE`, keep the `RAISE … EXPORTING textid = …`
in the query class as written. If not, replace that statement in every version of the query class in this
plan with `RAISE EXCEPTION TYPE cx_rap_query_cond.` and record the finding in the ledger.

- [ ] **Step 5: Test first — `ActivityCategory` must not exist yet**

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$ev = 'worklog\DS4_100_NIIF\2026-09\evidence\<worklog stem>'; New-Item -ItemType Directory -Force $ev | Out-Null
$irate = 'zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001'
$r = Invoke-Trm $irate 'ac-before' GET "InterestRateInstrument(CompanyCode='1000',FinancialTransaction='160533')" $null "$ev\activitycategory-log.txt"
($r.Content | ConvertFrom-Json).PSObject.Properties.Name -contains 'ActivityCategory'
```
Expected: `False`.

- [ ] **Step 6: Add `ActivityCategory` to the IRATE entity and query class**

`ZFS_CE_TrmIrateTP` (`/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmiratetp/source/main`): add after `ActiveStatus`:

```abap
      ActivityCategory     : tb_sfgzuty;
```

`ZCL_FS_TRM_IRATE_QUERY` (`…/zcl_fs_trm_irate_query/source/main`), in `read_deal`, add to the `es_deal = VALUE #( … )`
after `ActiveStatus = ls_general-active_status_transaction`:

```abap
                       ActivityCategory     = ls_general-activity_cat
```

Add `ActivityCategory` to the BDEF `ZFS_CE_TRMIRATETP` readonly list:
`field ( readonly ) FinancialTransaction, ActiveStatus, ActivityCategory;`.
Activate CE, query class, BDEF and `ZBP_FS_TRMIRATETP` in one `activateObjects` call; expect no errors.
(The CTE in `select` does not select it, so it is not filterable — spec §7.)

- [ ] **Step 7: Run the test again**

Re-run Step 5's commands, then print the value:
```powershell
($r.Content | ConvertFrom-Json).ActivityCategory
```
Expected: `True` for the property check, and a two-digit category for 160533 (its settlement was
reversed, so expect `10`). Record the value in the worklog.

- [ ] **Step 8: Create the test deal through the IRATE API**

```powershell
$c = Invoke-Trm $irate 'test-deal' POST 'InterestRateInstrument' '{"CompanyCode":"1000","ProductType":"22A","TransactionType":"100","Partner":"0700000453","ContractDate":"2026-09-25","ValuationClass":"0001","Currency":"INR","StartTerm":"2026-10-01","EndTerm":"2027-09-30","NominalAmount":100000,"InterestRate":10}' "$ev\test-deal-log.txt"
$deal = ($c.Content | ConvertFrom-Json).FinancialTransaction; $deal
```
Expected: 201 and a deal number. Write it in the worklog as **the Phase 1 test deal**; every later task
sets `$deal` to it. Check `ActivityCategory` in the response is `10`.

- [ ] **Step 9: Commit**

```bash
git add scripts/trm-deal-api-tests docs/message-catalog/DS4_100_NIIF.md worklog/DS4_100_NIIF/2026-09/*trm-dealitem-api-phase1* worklog/DS4_100_NIIF/2026-09/evidence lessons/lessons-ledger.md
git commit -m "TRM deal-item API phase 1 task 1: message 056, test scripts, IRATE ActivityCategory"
```

---

### Task 2: Query class, service and binding — read-only `Condition`

**Files:** on SAP only — create `ZCL_FS_TRM_DEALITEM_QUERY`, `ZFS_CE_TrmDealCondTP`, `ZFS_SD_TRMDEALITEM`,
`ZFS_SB_TRMDEALITEM_O4_API`; worklog + evidence.

**Interfaces:**
- Consumes: message 056, `Invoke-Trm`, `$deal` (Task 1).
- Produces: `zcl_fs_trm_dealitem_query=>tt_return` (`STANDARD TABLE OF bapiret2 WITH DEFAULT KEY`),
  `tt_condition`, `read_conditions( iv_company_code, iv_transaction ) EXPORTING et_rows et_return`; the published
  service path `zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001`.

- [ ] **Step 1: Test first**

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
Invoke-Trm $svc 'cond-read' GET "Condition?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$deal'" $null "$ev\task2-log.txt"
```
Expected: 404 or `-1` (service does not exist).

- [ ] **Step 2: Naming gate**

```
NAMING: ZCL_FS_TRM_DEALITEM_QUERY -> matches "RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY", AREA = TRM
NAMING: ZFS_CE_TrmDealCondTP -> matches "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealCondTP
NAMING: ZFS_SD_TRMDEALITEM -> matches "Service definition ZFS_SD_<Entity>"
NAMING: ZFS_SB_TRMDEALITEM_O4_API -> matches "Service binding ZFS_SB_<Entity>_<O4>_<API>" (25 chars, cap 26)
```

- [ ] **Step 3: Create the condition custom entity**

`mcp-abap-abap-adt-api createObject` `DDLS/DF` `ZFS_CE_TrmDealCondTP`, parent `ZFS_SLC_APP`
(`/sap/bc/adt/packages/zfs_slc_app`), transport `DS4K907209`; `lock` → `setObjectSource`
(`/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealcondtp/source/main`) → `unLock`; `transportInfo` expects `DS4K907209`. Source:

```abap
@EndUserText.label: 'Deal condition (any product)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_TRM_DEALITEM_QUERY'
define root custom entity ZFS_CE_TrmDealCondTP
{
  key CompanyCode           : bukrs;
  key FinancialTransaction  : tb_rfha;
  key Side                  : tb_rkondgr;
  key ConditionKey          : tb_bapi_cond_key;
      ConditionNumber       : tb_kond;
      ConditionType         : skoart;
      EffectiveFrom         : dguel_kp;
      AmountCalcRule        : tb_scondamount;
      PercentageRate        : pkond;
      Amount                : bapibkondsign;
      Currency              : swhrkond;
      CalcBaseAmount        : bapitfm_bbasis2;
      RefInterestRate       : szsref;
      RateMarkupOrDown      : tb_zzs;
      CalcMethod            : szbmeth;
      CalcCalendar          : tfmskalidwt;
      Frequency             : tfmarhy;
      FrequencyUnit         : tfmurhy;
      CalcDate              : dvalut;
      CalcDateInclusive     : tb_svincl;
      CalcDateMonthEnd      : vvsbult;
      DueDate               : dfaell;
      DueDateMonthEnd       : sfult;
      ShiftDays             : tb_afvgstage;
      ReferenceConditionKey : tb_bapi_cond_key;
}
```

- [ ] **Step 4: Create the query class**

`createObject` `CLAS/OC` `ZCL_FS_TRM_DEALITEM_QUERY`, `ZFS_SLC_APP`, transport `DS4K907209`,
description "Query provider - deal items (any product)". Write `source/main`:

```abap
CLASS zcl_fs_trm_dealitem_query DEFINITION
  PUBLIC FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_return    TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    TYPES tt_condition TYPE STANDARD TABLE OF zfs_ce_trmdealcondtp WITH EMPTY KEY.

    CLASS-METHODS read_conditions
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_condition
                et_return       TYPE tt_return.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_deal,
             company_code TYPE bukrs,
             transaction  TYPE tb_rfha,
           END OF ty_deal.

    METHODS get_deal
      IMPORTING io_request     TYPE REF TO if_rap_query_request
      RETURNING VALUE(rs_deal) TYPE ty_deal
      RAISING   cx_rap_query_provider.

    METHODS respond
      IMPORTING io_request  TYPE REF TO if_rap_query_request
                io_response TYPE REF TO if_rap_query_response
      CHANGING  ct_rows     TYPE STANDARD TABLE
      RAISING   cx_rap_query_provider.
ENDCLASS.


CLASS zcl_fs_trm_dealitem_query IMPLEMENTATION.
  METHOD if_rap_query_provider~select.
    " The item BAPIs read per deal: CompanyCode and FinancialTransaction (eq) are mandatory.
    DATA(ls_deal) = get_deal( io_request ).

    CASE io_request->get_entity_id( ).
      WHEN 'ZFS_CE_TRMDEALCONDTP'.
        DATA lt_cond TYPE tt_condition.
        read_conditions( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_cond ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_cond ).
    ENDCASE.
  ENDMETHOD.

  METHOD get_deal.
    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    LOOP AT lt_ranges INTO DATA(ls_range).
      IF    lines( ls_range-range ) <> 1
         OR ls_range-range[ 1 ]-sign   <> 'I'
         OR ls_range-range[ 1 ]-option <> 'EQ'.
        CONTINUE.
      ENDIF.
      CASE ls_range-name.
        WHEN 'COMPANYCODE'.
          rs_deal-company_code = ls_range-range[ 1 ]-low.
        WHEN 'FINANCIALTRANSACTION'.
          rs_deal-transaction = |{ CONV tb_rfha( ls_range-range[ 1 ]-low ) ALPHA = IN }|.
      ENDCASE.
    ENDLOOP.

    IF rs_deal-company_code IS INITIAL OR rs_deal-transaction IS INITIAL.
      " ZFS_TRM_MSG 056: $filter on CompanyCode and FinancialTransaction is required
      RAISE EXCEPTION TYPE cx_rap_query_cond
        EXPORTING textid = VALUE scx_t100key( msgid = 'ZFS_TRM_MSG'
                                              msgno = '056' ).
    ENDIF.
  ENDMETHOD.

  METHOD respond.
    DATA lr_range TYPE REF TO data.
    FIELD-SYMBOLS <lt_range> TYPE STANDARD TABLE.

    " Paging must be read even when only $count is requested.
    DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
    DATA(lv_size) = io_request->get_paging( )->get_page_size( ).

    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    " Remaining $filter conditions are applied in ABAP to this one deal's rows, typed
    " against each element so numbers and dates compare as values, not text.
    LOOP AT lt_ranges INTO DATA(ls_range)
         WHERE name <> 'COMPANYCODE' AND name <> 'FINANCIALTRANSACTION'.
      LOOP AT ct_rows ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_range-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE cx_rap_query_cond.
        ENDIF.
        IF lr_range IS NOT BOUND.
          DATA(lv_type) = cl_abap_typedescr=>describe_by_data( <lv_value> )->absolute_name.
          CREATE DATA lr_range TYPE RANGE OF (lv_type).
          ASSIGN lr_range->* TO <lt_range>.
          MOVE-CORRESPONDING ls_range-range TO <lt_range>.
        ENDIF.
        IF NOT <lv_value> IN <lt_range>.
          DELETE ct_rows.
        ENDIF.
      ENDLOOP.
      FREE lr_range.
    ENDLOOP.

    DATA(lt_sort) = io_request->get_sort_elements( ).
    IF lt_sort IS NOT INITIAL.
      DATA(lt_order) = VALUE abap_sortorder_tab( FOR ls_sort IN lt_sort
                                                 ( name       = ls_sort-element_name
                                                   descending = ls_sort-descending ) ).
      SORT ct_rows BY (lt_order).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( ct_rows ) ).
    ENDIF.

    IF io_request->is_data_requested( ).
      IF lv_offset > 0.
        DELETE ct_rows TO lv_offset.
      ENDIF.
      IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( ct_rows ) > lv_size.
        DELETE ct_rows FROM lv_size + 1.
      ENDIF.
      io_response->set_data( ct_rows ).
    ENDIF.
  ENDMETHOD.

  METHOD read_conditions.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_cond_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_CONDITION_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    conditions             = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-direction
                      ConditionKey         = ls_detail-condition_key
                      ConditionNumber      = ls_detail-condition
                      ConditionType        = ls_detail-condition_type
                      EffectiveFrom        = ls_detail-effective_from
                      AmountCalcRule       = ls_detail-amount_calc_rule
                      PercentageRate       = ls_detail-percentage_rate
                      Amount               = ls_detail-amount
                      Currency             = ls_detail-currency
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      RefInterestRate      = ls_detail-ref_interest_rate
                      RateMarkupOrDown     = ls_detail-rate_markup_or_down
                      CalcMethod           = ls_detail-calc_method
                      CalcCalendar         = ls_detail-calc_calendar
                      Frequency            = ls_detail-frequency
                      FrequencyUnit        = ls_detail-frequency_unit
                      CalcDate             = ls_detail-calc_date
                      CalcDateInclusive    = ls_detail-calc_date_inclusive
                      CalcDateMonthEnd     = ls_detail-calc_date_month_end
                      DueDate              = ls_detail-due_date
                      DueDateMonthEnd      = ls_detail-due_date_month_end
                      ShiftDays            = ls_detail-shift_days ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

Activate the custom entity and the class together. Expected: no errors.

**If activation rejects `IF NOT <lv_value> IN <lt_range>`** (a generically typed field symbol as the
right-hand side of `IN`), restrict non-key filtering to `eq` and replace the inner test with

```abap
        IF NOT line_exists( ls_range-range[ low = CONV string( <lv_value> ) ] ).
          DELETE ct_rows.
        ENDIF.
```

(and drop `lr_range`/`<lt_range>`). Record which variant activated in the worklog; Task 3 Step 9 still
must pass with either.

- [ ] **Step 5: Service definition and binding**

`createObject` `SRVD/SRV` `ZFS_SD_TRMDEALITEM` (transport `DS4K907209`), source:

```abap
@EndUserText.label: 'Deal items (any product) CRUD API'
define service ZFS_SD_TRMDEALITEM {
  expose ZFS_CE_TrmDealCondTP as Condition;
}
```

Activate. Then `adt-mcp abap_creation-create_object` `SRVB/SVB`,
`objectContent {"packageName":"ZFS_SLC_APP","name":"ZFS_SB_TRMDEALITEM_O4_API","description":"Deal items (any product) CRUD API","bindingType":"OData V4 - Web API","serviceDefinition":"ZFS_SD_TRMDEALITEM"}`,
`transportRequestNumber DS4K907209`; `transportInfo`; `activateByName`. Confirm `sap_get_session_info`
shows DS4/100, then publish:

```powershell
& "tools\mcp-sap-gui\.venv\Scripts\python.exe" scripts\sap-gui-publish-service.py --group-id ZFS_SB_TRMDEALITEM_O4_API --yes
```
Expected: `"ok": true`, `still_in_unpublished_list: false`.

- [ ] **Step 6: Run the test**

Re-run Step 1, plus the refusal and a filter check:

```powershell
$all = Invoke-Trm $svc 'cond-read' GET "Condition?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$deal'&`$count=true" $null "$ev\task2-log.txt"
Invoke-Trm $svc 'cond-no-filter' GET 'Condition' $null "$ev\task2-log.txt"
```
Expected: first call **200** with `@odata.count` ≥ 1 (the 22A deal's interest condition, `ConditionKey` filled);
second call a 4xx/5xx whose body contains message 056's text (or, per Task 1 Step 4, a textless refusal).

- [ ] **Step 7: Commit** — `git add` worklog + evidence; `git commit -m "TRM deal-item API task 2: query class, Condition read, service published"`.

---

### Task 3: Writable `Condition`

**Files:** on SAP — create BDEF + pool for the condition entity (the entity exists from Task 2); worklog + evidence.

**Interfaces:**
- Consumes: `zcl_fs_trm_dealitem_query=>tt_return`, `…=>read_conditions` (this task), `dealitem-crud.ps1`, `$deal`.
- Produces: entity set `Condition` with POST/GET/PATCH/DELETE.

Session set-up for this task (values from the worklog):

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc  = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$ev   = 'worklog\DS4_100_NIIF\2026-09\evidence\<worklog stem>'   # the Phase 1 worklog's own stem
$deal = '<Phase 1 test deal number recorded in the worklog by Task 1 Step 8>'
```

Prepare the create payload first (the test needs it):

Build `$condBody` from the deal's own interest condition, read in step 1 of the test log
(`Condition-crud-log.txt`, `1-list-before`): take the row whose `ConditionType` is the nominal-interest
type of the deal, and post a **second** interest condition effective three months after `StartTerm`:

```powershell
$first = ((Invoke-Trm $svc 'probe' GET "Condition?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$deal'" $null $null).Content | ConvertFrom-Json).value | Select-Object -First 1
$condBody = '{"CompanyCode":"1000","FinancialTransaction":"' + $deal + '","Side":"' + $first.Side +
            '","ConditionType":"' + $first.ConditionType + '","EffectiveFrom":"2027-01-01","PercentageRate":12,' +
            '"ReferenceConditionKey":"' + $first.ConditionKey + '"}'
```

`ReferenceConditionKey` = the existing condition's key: `BAPI_FTR_CONDITION_CREATE` imports it as
non-optional (spec risk 2). If the POST answers 400 with a message about the reference condition,
retry once with `"ReferenceConditionKey":""` and record in the worklog which one SAP accepts.

- [ ] **Step 1: Run the test first and confirm it fails**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set Condition -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,ConditionKey `
  -CreateBody $condBody -PatchBody '{"PercentageRate":12.5}' -PatchField PercentageRate
```
Expected: steps 1–2 pass, step `3-create` answers **405/501** (entity not creatable yet), the script exits 1.

- [ ] **Step 2: Naming gate, then create the custom entity**

Append to the phase worklog's naming section, **before** the create:

```
NAMING: ZFS_CE_TrmDealCondTP -> matches CDS "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealCondTP (transactional, TP once)
NAMING: ZFS_CE_TrmDealCondTP (BDEF) -> matches "Behavior definition: same as root view"
NAMING: ZBP_FS_TRMDEALCONDTP -> matches "Behavior implementation class ZBP_FS_<Entity>"
NAMING: LHC_TRMDEALCOND / LSC_TRMDEALCOND -> match LHC_/LSC_<Entity> (TP stripped, L-226)
```

The custom entity `ZFS_CE_TrmDealCondTP` already exists and is active (Task 2): **do not create or change it**.



- [ ] **Step 3: Query class — no change**

`ZCL_FS_TRM_DEALITEM_QUERY` from Task 2 already serves `Condition`; nothing to write.

- [ ] **Step 4: Create the BDEF and write it**

`adt-mcp abap_creation-run_validation`, then `abap_creation-create_object`, `objectType BDEF/BDO`,
`objectContent {"behaviorDefinitionType":"definition","packageName":"ZFS_SLC_APP","rootEntity":"ZFS_CE_TRMDEALCONDTP","name":"ZFS_CE_TRMDEALCONDTP","description":"Condition (any product) - CRUD API","implementationType":"Unmanaged"}`,
top-level `transportRequestNumber DS4K907209` (L-564). `transportInfo` on
`/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealcondtp`: expect `DS4K907209`. Then `lock` → `setObjectSource` → `unLock`
on `/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealcondtp/source/main`:

```abap
unmanaged implementation in class zbp_fs_trmdealcondtp unique;
strict ( 2 );

define behavior for ZFS_CE_TrmDealCondTP alias DealCondition
lock master
authorization master ( global )
{
  create;
  update;
  delete;

  field ( readonly ) ConditionKey, ConditionNumber, Currency;
  field ( mandatory : create ) CompanyCode, FinancialTransaction, ConditionType, EffectiveFrom;
  field ( readonly : update ) CompanyCode, FinancialTransaction, Side, EffectiveFrom, ReferenceConditionKey;
}
```

- [ ] **Step 5: Create the behavior pool**

`mcp-abap-abap-adt-api createObject` `CLAS/OC` `ZBP_FS_TRMDEALCONDTP` in `ZFS_SLC_APP`, transport `DS4K907209`,
description "Behavior pool for ZFS_CE_TrmDealCondTP". `lock` the class, then write the main include
(`/sap/bc/adt/oo/classes/zbp_fs_trmdealcondtp/source/main`):

```abap
CLASS zbp_fs_trmdealcondtp DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zfs_ce_trmdealcondtp.
ENDCLASS.


CLASS zbp_fs_trmdealcondtp IMPLEMENTATION.
ENDCLASS.
```

and the implementations include (`/sap/bc/adt/oo/classes/zbp_fs_trmdealcondtp/includes/implementations`),
then `unLock`:

```abap
CLASS lhc_trmdealcond DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    TYPES tt_return TYPE zcl_fs_trm_dealitem_query=>tt_return.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR DealCondition RESULT result.

    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE DealCondition.

    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE DealCondition.

    METHODS delete FOR MODIFY
      IMPORTING keys FOR DELETE DealCondition.

    METHODS read FOR READ
      IMPORTING keys FOR READ DealCondition RESULT result.

    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK DealCondition.

    METHODS has_error
      IMPORTING it_return       TYPE tt_return
      RETURNING VALUE(rv_error) TYPE abap_bool.

    METHODS rfc_error
      IMPORTING iv_function      TYPE csequence
                iv_text          TYPE csequence
      RETURNING VALUE(rs_return) TYPE bapiret2.

    METHODS end_luw
      IMPORTING iv_commit        TYPE abap_bool
      RETURNING VALUE(rt_return) TYPE tt_return.

    METHODS to_message
      IMPORTING is_return     TYPE bapiret2
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
ENDCLASS.


CLASS lhc_trmdealcond IMPLEMENTATION.
  METHOD create.
    DATA ls_value  TYPE bapi_ftr_cond_change.
    DATA ls_valuex TYPE bapi_ftr_cond_changex.
    DATA lv_new_key TYPE tb_bapi_cond_key.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, ls_valuex, lv_new_key, lt_return, lv_msgtxt.

      IF ls_entity-%control-ConditionType = if_abap_behv=>mk-on.
        ls_value-condition_type = ls_entity-ConditionType.
        ls_valuex-condition_type = abap_true.
      ENDIF.
      IF ls_entity-%control-AmountCalcRule = if_abap_behv=>mk-on.
        ls_value-amount_calc_rule = ls_entity-AmountCalcRule.
        ls_valuex-amount_calc_rule = abap_true.
      ENDIF.
      IF ls_entity-%control-PercentageRate = if_abap_behv=>mk-on.
        ls_value-percentage_rate = ls_entity-PercentageRate.
        ls_valuex-percentage_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-Amount = if_abap_behv=>mk-on.
        ls_value-amount = ls_entity-Amount.
        ls_valuex-amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseAmount = if_abap_behv=>mk-on.
        ls_value-calc_base_amount = ls_entity-CalcBaseAmount.
        ls_valuex-calc_base_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-RefInterestRate = if_abap_behv=>mk-on.
        ls_value-ref_interest_rate = ls_entity-RefInterestRate.
        ls_valuex-ref_interest_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-RateMarkupOrDown = if_abap_behv=>mk-on.
        ls_value-rate_markup_or_down = ls_entity-RateMarkupOrDown.
        ls_valuex-rate_markup_or_down = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcMethod = if_abap_behv=>mk-on.
        ls_value-calc_method = ls_entity-CalcMethod.
        ls_valuex-calc_method = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcCalendar = if_abap_behv=>mk-on.
        ls_value-calc_calendar = ls_entity-CalcCalendar.
        ls_valuex-calc_calendar = abap_true.
      ENDIF.
      IF ls_entity-%control-Frequency = if_abap_behv=>mk-on.
        ls_value-frequency = ls_entity-Frequency.
        ls_valuex-frequency = abap_true.
      ENDIF.
      IF ls_entity-%control-FrequencyUnit = if_abap_behv=>mk-on.
        ls_value-frequency_unit = ls_entity-FrequencyUnit.
        ls_valuex-frequency_unit = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDate = if_abap_behv=>mk-on.
        ls_value-calc_date = ls_entity-CalcDate.
        ls_valuex-calc_date = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDateInclusive = if_abap_behv=>mk-on.
        ls_value-calc_date_inclusive = ls_entity-CalcDateInclusive.
        ls_valuex-calc_date_inclusive = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDateMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_date_month_end = ls_entity-CalcDateMonthEnd.
        ls_valuex-calc_date_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-DueDate = if_abap_behv=>mk-on.
        ls_value-due_date = ls_entity-DueDate.
        ls_valuex-due_date = abap_true.
      ENDIF.
      IF ls_entity-%control-DueDateMonthEnd = if_abap_behv=>mk-on.
        ls_value-due_date_month_end = ls_entity-DueDateMonthEnd.
        ls_valuex-due_date_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-ShiftDays = if_abap_behv=>mk-on.
        ls_value-shift_days = ls_entity-ShiftDays.
        ls_valuex-shift_days = abap_true.
      ENDIF.

      " DESTINATION 'NONE': the item BAPIs use the update task (L-227); commit or roll back
      " in the same session right after the call (per-operation commit, spec section 3).
      CALL FUNCTION 'BAPI_FTR_CONDITION_CREATE'
        DESTINATION 'NONE'
        EXPORTING  companycodein          = ls_entity-CompanyCode
                   financialtransactionin = ls_entity-FinancialTransaction
                   condition              = ls_value
                   conditionx             = ls_valuex
                   effectivefrom          = ls_entity-EffectiveFrom
                   referenceconditionkey  = ls_entity-ReferenceConditionKey
                   side                   = ls_entity-Side
        IMPORTING  conditionkey           = lv_new_key
        TABLES     return                 = lt_return
        EXCEPTIONS system_failure         = 1 MESSAGE lv_msgtxt
                   communication_failure  = 2 MESSAGE lv_msgtxt
                   OTHERS                 = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_CONDITION_CREATE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ) ) TO lt_return.
      ENDIF.

      IF NOT ( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ).
        APPEND VALUE #( %cid        = ls_entity-%cid
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealcondition.
      ELSE.
        APPEND VALUE #( %cid                      = ls_entity-%cid
                      %key-CompanyCode          = ls_entity-CompanyCode
                      %key-FinancialTransaction = ls_entity-FinancialTransaction
                      %key-Side                 = ls_entity-Side
                      %key-ConditionKey         = lv_new_key ) TO mapped-dealcondition.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %cid = ls_entity-%cid
                        %msg = to_message( ls_return ) ) TO reported-dealcondition.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD update.
    DATA ls_value  TYPE bapi_ftr_cond_change.
    DATA ls_valuex TYPE bapi_ftr_cond_changex.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, ls_valuex, lt_return, lv_msgtxt.

      IF ls_entity-%control-ConditionType = if_abap_behv=>mk-on.
        ls_value-condition_type = ls_entity-ConditionType.
        ls_valuex-condition_type = abap_true.
      ENDIF.
      IF ls_entity-%control-AmountCalcRule = if_abap_behv=>mk-on.
        ls_value-amount_calc_rule = ls_entity-AmountCalcRule.
        ls_valuex-amount_calc_rule = abap_true.
      ENDIF.
      IF ls_entity-%control-PercentageRate = if_abap_behv=>mk-on.
        ls_value-percentage_rate = ls_entity-PercentageRate.
        ls_valuex-percentage_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-Amount = if_abap_behv=>mk-on.
        ls_value-amount = ls_entity-Amount.
        ls_valuex-amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseAmount = if_abap_behv=>mk-on.
        ls_value-calc_base_amount = ls_entity-CalcBaseAmount.
        ls_valuex-calc_base_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-RefInterestRate = if_abap_behv=>mk-on.
        ls_value-ref_interest_rate = ls_entity-RefInterestRate.
        ls_valuex-ref_interest_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-RateMarkupOrDown = if_abap_behv=>mk-on.
        ls_value-rate_markup_or_down = ls_entity-RateMarkupOrDown.
        ls_valuex-rate_markup_or_down = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcMethod = if_abap_behv=>mk-on.
        ls_value-calc_method = ls_entity-CalcMethod.
        ls_valuex-calc_method = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcCalendar = if_abap_behv=>mk-on.
        ls_value-calc_calendar = ls_entity-CalcCalendar.
        ls_valuex-calc_calendar = abap_true.
      ENDIF.
      IF ls_entity-%control-Frequency = if_abap_behv=>mk-on.
        ls_value-frequency = ls_entity-Frequency.
        ls_valuex-frequency = abap_true.
      ENDIF.
      IF ls_entity-%control-FrequencyUnit = if_abap_behv=>mk-on.
        ls_value-frequency_unit = ls_entity-FrequencyUnit.
        ls_valuex-frequency_unit = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDate = if_abap_behv=>mk-on.
        ls_value-calc_date = ls_entity-CalcDate.
        ls_valuex-calc_date = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDateInclusive = if_abap_behv=>mk-on.
        ls_value-calc_date_inclusive = ls_entity-CalcDateInclusive.
        ls_valuex-calc_date_inclusive = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDateMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_date_month_end = ls_entity-CalcDateMonthEnd.
        ls_valuex-calc_date_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-DueDate = if_abap_behv=>mk-on.
        ls_value-due_date = ls_entity-DueDate.
        ls_valuex-due_date = abap_true.
      ENDIF.
      IF ls_entity-%control-DueDateMonthEnd = if_abap_behv=>mk-on.
        ls_value-due_date_month_end = ls_entity-DueDateMonthEnd.
        ls_valuex-due_date_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-ShiftDays = if_abap_behv=>mk-on.
        ls_value-shift_days = ls_entity-ShiftDays.
        ls_valuex-shift_days = abap_true.
      ENDIF.

      CALL FUNCTION 'BAPI_FTR_CONDITION_CHANGE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_entity-CompanyCode
                   financialtransaction  = ls_entity-FinancialTransaction
                   conditionkey          = ls_entity-ConditionKey
                   condition             = ls_value
                   conditionx            = ls_valuex
                   side                  = ls_entity-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_CONDITION_CHANGE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_entity-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealcondition.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_entity-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealcondition.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD delete.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT keys INTO DATA(ls_key).
      CLEAR: lt_return, lv_msgtxt.

      " A real delete of the item (not a deal reversal).
      CALL FUNCTION 'BAPI_FTR_CONDITION_DELETE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_key-CompanyCode
                   financialtransaction  = ls_key-FinancialTransaction
                   conditionkey          = ls_key-ConditionKey
                   side                  = ls_key-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_CONDITION_DELETE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealcondition.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealcondition.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read.
    LOOP AT keys INTO DATA(ls_key).
      zcl_fs_trm_dealitem_query=>read_conditions( EXPORTING iv_company_code = ls_key-CompanyCode
                                                     iv_transaction  = ls_key-FinancialTransaction
                                           IMPORTING et_rows         = DATA(lt_rows)
                                                     et_return       = DATA(lt_return) ).
      READ TABLE lt_rows INTO DATA(ls_row) WITH KEY Side = ls_key-Side ConditionKey = ls_key-ConditionKey.
      IF sy-subrc <> 0 OR has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-not_found ) TO failed-dealcondition.
        CONTINUE.
      ENDIF.
      APPEND CORRESPONDING #( ls_row ) TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_global_authorizations.
    " Instance checks are the FTR BAPIs' own; the framework only needs this answered (L-238).
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.

  METHOD lock.
    " Deliberately empty: the BAPIs enqueue the deal in the DESTINATION 'NONE' session, a
    " different lock owner; a lock taken here would collide with them.
    RETURN.
  ENDMETHOD.

  METHOD has_error.
    rv_error = xsdbool(    line_exists( it_return[ type = 'E' ] )
                        OR line_exists( it_return[ type = 'A' ] ) ).
  ENDMETHOD.

  METHOD rfc_error.
    rs_return = VALUE #( type       = 'E'
                         id         = 'ZFS_TRM_MSG'
                         number     = '020'
                         message_v1 = iv_function
                         message_v2 = iv_text ).
  ENDMETHOD.

  METHOD end_luw.
    DATA ls_return TYPE bapiret2.
    DATA lv_msgtxt TYPE c LENGTH 220.

    IF iv_commit = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        DESTINATION 'NONE'
        EXPORTING  wait                  = abap_true
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_COMMIT'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ELSEIF ls_return-type CA 'EA'.
        APPEND ls_return TO rt_return.
      ENDIF.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
        DESTINATION 'NONE'
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_ROLLBACK'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD to_message.
    ro_msg = new_message( id       = is_return-id
                          number   = is_return-number
                          severity = SWITCH #( is_return-type
                                               WHEN 'E' OR 'A' THEN if_abap_behv_message=>severity-error
                                               WHEN 'W'        THEN if_abap_behv_message=>severity-warning
                                               WHEN 'I'        THEN if_abap_behv_message=>severity-information
                                               ELSE                 if_abap_behv_message=>severity-success )
                          v1       = is_return-message_v1
                          v2       = is_return-message_v2
                          v3       = is_return-message_v3
                          v4       = is_return-message_v4 ).
  ENDMETHOD.
ENDCLASS.


CLASS lsc_trmdealcond DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.


CLASS lsc_trmdealcond IMPLEMENTATION.
  METHOD save.
    " Deliberately empty: each BAPI call was committed or rolled back in its own
    " DESTINATION 'NONE' session by the handler (L-227).
    RETURN.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 6: Service definition — no change**

`ZFS_SD_TRMDEALITEM` already exposes `Condition` (Task 2).

- [ ] **Step 7: Activate everything in one call**

`mcp-abap-abap-adt-api activateObjects` with the BDEF and the pool in **one** array. Expected: `success: true`, no `E` messages. Then `inactiveObjects`: none of these names
may be listed (L-543). If the class reports a type error on a field, compare the element's data element
with `context/sap-bapis/json/structures.json` for that BAPI field before changing anything.

- [ ] **Step 8: Run the test and confirm it passes**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set Condition -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,ConditionKey `
  -CreateBody $condBody -PatchBody '{"PercentageRate":12.5}' -PatchField PercentageRate
```
Expected: every step logs its expected status (200 / refusal / 201 / 200 / 200 / 200 / 204 / 200),
`rows after` = `rows before`, exit code **0**. Confirm in the log that the POST response carries the
new key and that step 6 shows the patched value.

- [ ] **Step 9: A non-key `$filter` really filters (Review Focus 5)**

```powershell
$sel = Invoke-Trm $svc 'cond-filter-type' GET "Condition?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$deal' and ConditionType eq '9999'&`$count=true" $null "$ev\task3-log.txt"
($sel.Content | ConvertFrom-Json).'@odata.count'
```
Expected: **0** (no condition type 9999), while the unfiltered count from Step 8 was ≥ 1.

- [ ] **Step 10: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09 lessons/lessons-ledger.md
git commit -m "TRM deal-item API task 3: Condition create/update/delete live"
```

---

### Task 4: `AdditionalFlow`

**Files:** on SAP — create `ZFS_CE_TrmDealAddFlowTP` + BDEF + `ZBP_FS_TRMDEALADDFLOWTP`, change `ZCL_FS_TRM_DEALITEM_QUERY` and `ZFS_SD_TRMDEALITEM`; worklog + evidence.

**Interfaces:**
- Consumes: `zcl_fs_trm_dealitem_query=>tt_return`, `…=>read_addflows` (this task), `dealitem-crud.ps1`, `$deal`.
- Produces: entity set `AdditionalFlow` with POST/GET/PATCH/DELETE.

Session set-up for this task (values from the worklog):

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc  = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$ev   = 'worklog\DS4_100_NIIF\2026-09\evidence\<worklog stem>'   # the Phase 1 worklog's own stem
$deal = '<Phase 1 test deal number recorded in the worklog by Task 1 Step 8>'
```

Prepare the create payload first (the test needs it):

Discover a flow type SAP accepts as an *other flow* on a 22A deal, then build the body:

```powershell
.\scripts\trm-deal-api-tests\dealitem-discover.ps1 -EvidenceDir $ev -Set AdditionalFlow -Top 40
```

Take `FlowType`, `FlowSign` and `PaymentCur` from the first row printed. If none of the 40 deals has
an additional flow, the discovery prints nothing: stop and ask the human for an other-flow type valid
for product type 22A (do not guess one).

```powershell
$addflowBody = '{"CompanyCode":"1000","FinancialTransaction":"' + $deal + '","Side":"0","FlowType":"<FlowType from discovery>",' +
               '"FlowSign":"<FlowSign from discovery>","PaymentDate":"2026-12-15","PaymentAmount":500,"PaymentCur":"INR"}'
```

- [ ] **Step 1: Run the test first and confirm it fails**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set AdditionalFlow -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,FlowKey `
  -CreateBody $addflowBody -PatchBody '{"PaymentAmount":750}' -PatchField PaymentAmount
```
Expected: the first call answers **404** (entity set `AdditionalFlow` not in the service yet), the script exits 1.

- [ ] **Step 2: Naming gate, then create the custom entity**

Append to the phase worklog's naming section, **before** the create:

```
NAMING: ZFS_CE_TrmDealAddFlowTP -> matches CDS "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealAddFlowTP (transactional, TP once)
NAMING: ZFS_CE_TrmDealAddFlowTP (BDEF) -> matches "Behavior definition: same as root view"
NAMING: ZBP_FS_TRMDEALADDFLOWTP -> matches "Behavior implementation class ZBP_FS_<Entity>"
NAMING: LHC_TRMDEALADDFLOW / LSC_TRMDEALADDFLOW -> match LHC_/LSC_<Entity> (TP stripped, L-226)
```

`mcp-abap-abap-adt-api createObject` (L-546: a DDLS on a named transport):
`objtype DDLS/DF`, `name ZFS_CE_TrmDealAddFlowTP`, `parentName ZFS_SLC_APP`, `parentPath /sap/bc/adt/packages/zfs_slc_app`,
`transport DS4K907209`, description = the label below. Then `lock` → `setObjectSource`
(`/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealaddflowtp/source/main`, transport `DS4K907209`) → `unLock` with:

```abap
@EndUserText.label: 'Deal additional flow (any product)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_TRM_DEALITEM_QUERY'
define root custom entity ZFS_CE_TrmDealAddFlowTP
{
  key CompanyCode          : bukrs;
  key FinancialTransaction : tb_rfha;
  key Side                 : tb_rkondgr;
  key FlowKey              : tb_bapi_flow_key;
      FlowType             : tb_sfhazba;
      FlowSign             : tb_ssign;
      PaymentDate          : tb_dzterm;
      PaymentAmount        : bapitb_bzbetr;
      PaymentCur           : tb_wzbetr;
      PaymentCurIso        : isocd;
      LocalCurRate         : tb_khwkurs;
      LocalCurAmount       : bapitb_hwbetr;
      CurrentRate          : tb_shwkakt;
      FixedRate            : tb_shwkfix;
      FixedAmount          : tb_shwbfix;
      CalcFrom             : dbervon;
      CalcFromIncl         : tb_sinclv;
      CalcFromMonthEnd     : vvsultvon;
      CalcTo               : dberbis;
      CalcToIncl           : tb_sinclb;
      CalcToMonthEnd       : vvsultbis;
      InterestCalcMethod   : szbmeth;
      InterestCalcExpon    : tfm_sintcomp;
      InterestCalendar     : tfmskalidwt;
      InterestCalcDays     : vvatage;
      CalcBaseDays         : abastage;
      CalcBaseAmount       : bapibbasis;
      CalcBaseCur          : tb_wbasis;
      CalcBaseCurIso       : isocd;
      PercentageRate       : pkond;
      Assignment           : dzuonr;
      PostingStatus        : tb_sbewebe;
}
```

Run `transportInfo` on `/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealaddflowtp`: expect `DS4K907209` / task `DS4K907260`.
Do **not** activate yet (the query class does not know the entity).

- [ ] **Step 3: Extend the query class**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/oo/classes/zcl_fs_trm_dealitem_query/source/main`
with the complete source below (adds `tt_addflow`, `read_addflows` and its `WHEN` branch):

```abap
CLASS zcl_fs_trm_dealitem_query DEFINITION
  PUBLIC FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_return    TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    TYPES tt_condition TYPE STANDARD TABLE OF zfs_ce_trmdealcondtp WITH EMPTY KEY.
    TYPES tt_addflow   TYPE STANDARD TABLE OF zfs_ce_trmdealaddflowtp WITH EMPTY KEY.

    CLASS-METHODS read_conditions
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_condition
                et_return       TYPE tt_return.
    CLASS-METHODS read_addflows
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_addflow
                et_return       TYPE tt_return.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_deal,
             company_code TYPE bukrs,
             transaction  TYPE tb_rfha,
           END OF ty_deal.

    METHODS get_deal
      IMPORTING io_request     TYPE REF TO if_rap_query_request
      RETURNING VALUE(rs_deal) TYPE ty_deal
      RAISING   cx_rap_query_provider.

    METHODS respond
      IMPORTING io_request  TYPE REF TO if_rap_query_request
                io_response TYPE REF TO if_rap_query_response
      CHANGING  ct_rows     TYPE STANDARD TABLE
      RAISING   cx_rap_query_provider.
ENDCLASS.


CLASS zcl_fs_trm_dealitem_query IMPLEMENTATION.
  METHOD if_rap_query_provider~select.
    " The item BAPIs read per deal: CompanyCode and FinancialTransaction (eq) are mandatory.
    DATA(ls_deal) = get_deal( io_request ).

    CASE io_request->get_entity_id( ).
      WHEN 'ZFS_CE_TRMDEALCONDTP'.
        DATA lt_cond TYPE tt_condition.
        read_conditions( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_cond ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_cond ).
      WHEN 'ZFS_CE_TRMDEALADDFLOWTP'.
        DATA lt_addflow TYPE tt_addflow.
        read_addflows( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_addflow ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_addflow ).
    ENDCASE.
  ENDMETHOD.

  METHOD get_deal.
    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    LOOP AT lt_ranges INTO DATA(ls_range).
      IF    lines( ls_range-range ) <> 1
         OR ls_range-range[ 1 ]-sign   <> 'I'
         OR ls_range-range[ 1 ]-option <> 'EQ'.
        CONTINUE.
      ENDIF.
      CASE ls_range-name.
        WHEN 'COMPANYCODE'.
          rs_deal-company_code = ls_range-range[ 1 ]-low.
        WHEN 'FINANCIALTRANSACTION'.
          rs_deal-transaction = |{ CONV tb_rfha( ls_range-range[ 1 ]-low ) ALPHA = IN }|.
      ENDCASE.
    ENDLOOP.

    IF rs_deal-company_code IS INITIAL OR rs_deal-transaction IS INITIAL.
      " ZFS_TRM_MSG 056: $filter on CompanyCode and FinancialTransaction is required
      RAISE EXCEPTION TYPE cx_rap_query_cond
        EXPORTING textid = VALUE scx_t100key( msgid = 'ZFS_TRM_MSG'
                                              msgno = '056' ).
    ENDIF.
  ENDMETHOD.

  METHOD respond.
    DATA lr_range TYPE REF TO data.
    FIELD-SYMBOLS <lt_range> TYPE STANDARD TABLE.

    " Paging must be read even when only $count is requested.
    DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
    DATA(lv_size) = io_request->get_paging( )->get_page_size( ).

    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    " Remaining $filter conditions are applied in ABAP to this one deal's rows, typed
    " against each element so numbers and dates compare as values, not text.
    LOOP AT lt_ranges INTO DATA(ls_range)
         WHERE name <> 'COMPANYCODE' AND name <> 'FINANCIALTRANSACTION'.
      LOOP AT ct_rows ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_range-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE cx_rap_query_cond.
        ENDIF.
        IF lr_range IS NOT BOUND.
          DATA(lv_type) = cl_abap_typedescr=>describe_by_data( <lv_value> )->absolute_name.
          CREATE DATA lr_range TYPE RANGE OF (lv_type).
          ASSIGN lr_range->* TO <lt_range>.
          MOVE-CORRESPONDING ls_range-range TO <lt_range>.
        ENDIF.
        IF NOT <lv_value> IN <lt_range>.
          DELETE ct_rows.
        ENDIF.
      ENDLOOP.
      FREE lr_range.
    ENDLOOP.

    DATA(lt_sort) = io_request->get_sort_elements( ).
    IF lt_sort IS NOT INITIAL.
      DATA(lt_order) = VALUE abap_sortorder_tab( FOR ls_sort IN lt_sort
                                                 ( name       = ls_sort-element_name
                                                   descending = ls_sort-descending ) ).
      SORT ct_rows BY (lt_order).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( ct_rows ) ).
    ENDIF.

    IF io_request->is_data_requested( ).
      IF lv_offset > 0.
        DELETE ct_rows TO lv_offset.
      ENDIF.
      IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( ct_rows ) > lv_size.
        DELETE ct_rows FROM lv_size + 1.
      ENDIF.
      io_response->set_data( ct_rows ).
    ENDIF.
  ENDMETHOD.

  METHOD read_conditions.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_cond_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_CONDITION_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    conditions             = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-direction
                      ConditionKey         = ls_detail-condition_key
                      ConditionNumber      = ls_detail-condition
                      ConditionType        = ls_detail-condition_type
                      EffectiveFrom        = ls_detail-effective_from
                      AmountCalcRule       = ls_detail-amount_calc_rule
                      PercentageRate       = ls_detail-percentage_rate
                      Amount               = ls_detail-amount
                      Currency             = ls_detail-currency
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      RefInterestRate      = ls_detail-ref_interest_rate
                      RateMarkupOrDown     = ls_detail-rate_markup_or_down
                      CalcMethod           = ls_detail-calc_method
                      CalcCalendar         = ls_detail-calc_calendar
                      Frequency            = ls_detail-frequency
                      FrequencyUnit        = ls_detail-frequency_unit
                      CalcDate             = ls_detail-calc_date
                      CalcDateInclusive    = ls_detail-calc_date_inclusive
                      CalcDateMonthEnd     = ls_detail-calc_date_month_end
                      DueDate              = ls_detail-due_date
                      DueDateMonthEnd      = ls_detail-due_date_month_end
                      ShiftDays            = ls_detail-shift_days ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_addflows.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_addflow_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_ADDFLOW_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    additionalflows        = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-flow_side
                      FlowKey              = ls_detail-flow_key
                      FlowType             = ls_detail-flow_type
                      FlowSign             = ls_detail-flow_sign
                      PaymentDate          = ls_detail-payment_date
                      PaymentAmount        = ls_detail-payment_amount
                      PaymentCur           = ls_detail-payment_cur
                      PaymentCurIso        = ls_detail-payment_cur_iso
                      LocalCurRate         = ls_detail-local_cur_rate
                      LocalCurAmount       = ls_detail-local_cur_amount
                      CurrentRate          = ls_detail-current_rate
                      FixedRate            = ls_detail-fixed_rate
                      FixedAmount          = ls_detail-fixed_amount
                      CalcFrom             = ls_detail-calc_from
                      CalcFromIncl         = ls_detail-calc_from_incl
                      CalcFromMonthEnd     = ls_detail-calc_from_month_end
                      CalcTo               = ls_detail-calc_to
                      CalcToIncl           = ls_detail-calc_to_incl
                      CalcToMonthEnd       = ls_detail-calc_to_month_end
                      InterestCalcMethod   = ls_detail-interest_calc_method
                      InterestCalcExpon    = ls_detail-interest_calc_expon
                      InterestCalendar     = ls_detail-interest_calendar
                      InterestCalcDays     = ls_detail-interest_calc_days
                      CalcBaseDays         = ls_detail-calc_base_days
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      CalcBaseCur          = ls_detail-calc_base_cur
                      CalcBaseCurIso       = ls_detail-calc_base_cur_iso
                      PercentageRate       = ls_detail-percentage_rate
                      Assignment           = ls_detail-assignment
                      PostingStatus        = ls_detail-posting_status ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 4: Create the BDEF and write it**

`adt-mcp abap_creation-run_validation`, then `abap_creation-create_object`, `objectType BDEF/BDO`,
`objectContent {"behaviorDefinitionType":"definition","packageName":"ZFS_SLC_APP","rootEntity":"ZFS_CE_TRMDEALADDFLOWTP","name":"ZFS_CE_TRMDEALADDFLOWTP","description":"AdditionalFlow (any product) - CRUD API","implementationType":"Unmanaged"}`,
top-level `transportRequestNumber DS4K907209` (L-564). `transportInfo` on
`/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealaddflowtp`: expect `DS4K907209`. Then `lock` → `setObjectSource` → `unLock`
on `/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealaddflowtp/source/main`:

```abap
unmanaged implementation in class zbp_fs_trmdealaddflowtp unique;
strict ( 2 );

define behavior for ZFS_CE_TrmDealAddFlowTP alias DealAddFlow
lock master
authorization master ( global )
{
  create;
  update;
  delete;

  field ( readonly ) FlowKey, InterestCalcDays, PostingStatus;
  field ( mandatory : create ) CompanyCode, FinancialTransaction, FlowType, PaymentDate;
  field ( readonly : update ) CompanyCode, FinancialTransaction, Side;
}
```

- [ ] **Step 5: Create the behavior pool**

`mcp-abap-abap-adt-api createObject` `CLAS/OC` `ZBP_FS_TRMDEALADDFLOWTP` in `ZFS_SLC_APP`, transport `DS4K907209`,
description "Behavior pool for ZFS_CE_TrmDealAddFlowTP". `lock` the class, then write the main include
(`/sap/bc/adt/oo/classes/zbp_fs_trmdealaddflowtp/source/main`):

```abap
CLASS zbp_fs_trmdealaddflowtp DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zfs_ce_trmdealaddflowtp.
ENDCLASS.


CLASS zbp_fs_trmdealaddflowtp IMPLEMENTATION.
ENDCLASS.
```

and the implementations include (`/sap/bc/adt/oo/classes/zbp_fs_trmdealaddflowtp/includes/implementations`),
then `unLock`:

```abap
CLASS lhc_trmdealaddflow DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    TYPES tt_return TYPE zcl_fs_trm_dealitem_query=>tt_return.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR DealAddFlow RESULT result.

    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE DealAddFlow.

    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE DealAddFlow.

    METHODS delete FOR MODIFY
      IMPORTING keys FOR DELETE DealAddFlow.

    METHODS read FOR READ
      IMPORTING keys FOR READ DealAddFlow RESULT result.

    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK DealAddFlow.

    METHODS has_error
      IMPORTING it_return       TYPE tt_return
      RETURNING VALUE(rv_error) TYPE abap_bool.

    METHODS rfc_error
      IMPORTING iv_function      TYPE csequence
                iv_text          TYPE csequence
      RETURNING VALUE(rs_return) TYPE bapiret2.

    METHODS end_luw
      IMPORTING iv_commit        TYPE abap_bool
      RETURNING VALUE(rt_return) TYPE tt_return.

    METHODS to_message
      IMPORTING is_return     TYPE bapiret2
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
ENDCLASS.


CLASS lhc_trmdealaddflow IMPLEMENTATION.
  METHOD create.
    DATA ls_value  TYPE bapi_ftr_addflow_create.
    DATA lv_new_key TYPE tb_bapi_flow_key.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, lv_new_key, lt_return, lv_msgtxt.

      IF ls_entity-%control-FlowType = if_abap_behv=>mk-on.
        ls_value-flow_type = ls_entity-FlowType.
      ENDIF.
      IF ls_entity-%control-FlowSign = if_abap_behv=>mk-on.
        ls_value-flow_sign = ls_entity-FlowSign.
      ENDIF.
      IF ls_entity-%control-PaymentDate = if_abap_behv=>mk-on.
        ls_value-payment_date = ls_entity-PaymentDate.
      ENDIF.
      IF ls_entity-%control-PaymentAmount = if_abap_behv=>mk-on.
        ls_value-payment_amount = ls_entity-PaymentAmount.
      ENDIF.
      IF ls_entity-%control-PaymentCur = if_abap_behv=>mk-on.
        ls_value-payment_cur = ls_entity-PaymentCur.
      ENDIF.
      IF ls_entity-%control-PaymentCurIso = if_abap_behv=>mk-on.
        ls_value-payment_cur_iso = ls_entity-PaymentCurIso.
      ENDIF.
      IF ls_entity-%control-LocalCurRate = if_abap_behv=>mk-on.
        ls_value-local_cur_rate = ls_entity-LocalCurRate.
      ENDIF.
      IF ls_entity-%control-LocalCurAmount = if_abap_behv=>mk-on.
        ls_value-local_cur_amount = ls_entity-LocalCurAmount.
      ENDIF.
      IF ls_entity-%control-CurrentRate = if_abap_behv=>mk-on.
        ls_value-current_rate = ls_entity-CurrentRate.
      ENDIF.
      IF ls_entity-%control-FixedRate = if_abap_behv=>mk-on.
        ls_value-fixed_rate = ls_entity-FixedRate.
      ENDIF.
      IF ls_entity-%control-FixedAmount = if_abap_behv=>mk-on.
        ls_value-fixed_amount = ls_entity-FixedAmount.
      ENDIF.
      IF ls_entity-%control-CalcFrom = if_abap_behv=>mk-on.
        ls_value-calc_from = ls_entity-CalcFrom.
      ENDIF.
      IF ls_entity-%control-CalcFromIncl = if_abap_behv=>mk-on.
        ls_value-calc_from_incl = ls_entity-CalcFromIncl.
      ENDIF.
      IF ls_entity-%control-CalcFromMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_from_month_end = ls_entity-CalcFromMonthEnd.
      ENDIF.
      IF ls_entity-%control-CalcTo = if_abap_behv=>mk-on.
        ls_value-calc_to = ls_entity-CalcTo.
      ENDIF.
      IF ls_entity-%control-CalcToIncl = if_abap_behv=>mk-on.
        ls_value-calc_to_incl = ls_entity-CalcToIncl.
      ENDIF.
      IF ls_entity-%control-CalcToMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_to_month_end = ls_entity-CalcToMonthEnd.
      ENDIF.
      IF ls_entity-%control-InterestCalcMethod = if_abap_behv=>mk-on.
        ls_value-interest_calc_method = ls_entity-InterestCalcMethod.
      ENDIF.
      IF ls_entity-%control-InterestCalcExpon = if_abap_behv=>mk-on.
        ls_value-interest_calc_expon = ls_entity-InterestCalcExpon.
      ENDIF.
      IF ls_entity-%control-InterestCalendar = if_abap_behv=>mk-on.
        ls_value-interest_calendar = ls_entity-InterestCalendar.
      ENDIF.
      IF ls_entity-%control-CalcBaseDays = if_abap_behv=>mk-on.
        ls_value-calc_base_days = ls_entity-CalcBaseDays.
      ENDIF.
      IF ls_entity-%control-CalcBaseAmount = if_abap_behv=>mk-on.
        ls_value-calc_base_amount = ls_entity-CalcBaseAmount.
      ENDIF.
      IF ls_entity-%control-CalcBaseCur = if_abap_behv=>mk-on.
        ls_value-calc_base_cur = ls_entity-CalcBaseCur.
      ENDIF.
      IF ls_entity-%control-CalcBaseCurIso = if_abap_behv=>mk-on.
        ls_value-calc_base_cur_iso = ls_entity-CalcBaseCurIso.
      ENDIF.
      IF ls_entity-%control-PercentageRate = if_abap_behv=>mk-on.
        ls_value-percentage_rate = ls_entity-PercentageRate.
      ENDIF.
      IF ls_entity-%control-Assignment = if_abap_behv=>mk-on.
        ls_value-assignment = ls_entity-Assignment.
      ENDIF.

      " DESTINATION 'NONE': the item BAPIs use the update task (L-227); commit or roll back
      " in the same session right after the call (per-operation commit, spec section 3).
      CALL FUNCTION 'BAPI_FTR_ADDFLOW_CREATE'
        DESTINATION 'NONE'
        EXPORTING  additionalflow         = ls_value
                   companycodein          = ls_entity-CompanyCode
                   financialtransactionin = ls_entity-FinancialTransaction
                   side                   = ls_entity-Side
        IMPORTING  flowkey                = lv_new_key
        TABLES     return                 = lt_return
        EXCEPTIONS system_failure         = 1 MESSAGE lv_msgtxt
                   communication_failure  = 2 MESSAGE lv_msgtxt
                   OTHERS                 = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_ADDFLOW_CREATE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ) ) TO lt_return.
      ENDIF.

      IF NOT ( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ).
        APPEND VALUE #( %cid        = ls_entity-%cid
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealaddflow.
      ELSE.
        APPEND VALUE #( %cid                      = ls_entity-%cid
                      %key-CompanyCode          = ls_entity-CompanyCode
                      %key-FinancialTransaction = ls_entity-FinancialTransaction
                      %key-Side                 = ls_entity-Side
                      %key-FlowKey              = lv_new_key ) TO mapped-dealaddflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %cid = ls_entity-%cid
                        %msg = to_message( ls_return ) ) TO reported-dealaddflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD update.
    DATA ls_value  TYPE bapi_ftr_addflow_change.
    DATA ls_valuex TYPE bapi_ftr_addflow_changex.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, ls_valuex, lt_return, lv_msgtxt.

      IF ls_entity-%control-FlowType = if_abap_behv=>mk-on.
        ls_value-flow_type = ls_entity-FlowType.
        ls_valuex-flow_type = abap_true.
      ENDIF.
      IF ls_entity-%control-FlowSign = if_abap_behv=>mk-on.
        ls_value-flow_sign = ls_entity-FlowSign.
        ls_valuex-flow_sign = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentDate = if_abap_behv=>mk-on.
        ls_value-payment_date = ls_entity-PaymentDate.
        ls_valuex-payment_date = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentAmount = if_abap_behv=>mk-on.
        ls_value-payment_amount = ls_entity-PaymentAmount.
        ls_valuex-payment_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentCur = if_abap_behv=>mk-on.
        ls_value-payment_cur = ls_entity-PaymentCur.
        ls_valuex-payment_cur = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentCurIso = if_abap_behv=>mk-on.
        ls_value-payment_cur_iso = ls_entity-PaymentCurIso.
        ls_valuex-payment_cur_iso = abap_true.
      ENDIF.
      IF ls_entity-%control-LocalCurRate = if_abap_behv=>mk-on.
        ls_value-local_cur_rate = ls_entity-LocalCurRate.
        ls_valuex-local_cur_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-LocalCurAmount = if_abap_behv=>mk-on.
        ls_value-local_cur_amount = ls_entity-LocalCurAmount.
        ls_valuex-local_cur_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CurrentRate = if_abap_behv=>mk-on.
        ls_value-current_rate = ls_entity-CurrentRate.
        ls_valuex-current_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-FixedRate = if_abap_behv=>mk-on.
        ls_value-fixed_rate = ls_entity-FixedRate.
        ls_valuex-fixed_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-FixedAmount = if_abap_behv=>mk-on.
        ls_value-fixed_amount = ls_entity-FixedAmount.
        ls_valuex-fixed_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcFrom = if_abap_behv=>mk-on.
        ls_value-calc_from = ls_entity-CalcFrom.
        ls_valuex-calc_from = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcFromIncl = if_abap_behv=>mk-on.
        ls_value-calc_from_incl = ls_entity-CalcFromIncl.
        ls_valuex-calc_from_incl = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcFromMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_from_month_end = ls_entity-CalcFromMonthEnd.
        ls_valuex-calc_from_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcTo = if_abap_behv=>mk-on.
        ls_value-calc_to = ls_entity-CalcTo.
        ls_valuex-calc_to = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcToIncl = if_abap_behv=>mk-on.
        ls_value-calc_to_incl = ls_entity-CalcToIncl.
        ls_valuex-calc_to_incl = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcToMonthEnd = if_abap_behv=>mk-on.
        ls_value-calc_to_month_end = ls_entity-CalcToMonthEnd.
        ls_valuex-calc_to_month_end = abap_true.
      ENDIF.
      IF ls_entity-%control-InterestCalcMethod = if_abap_behv=>mk-on.
        ls_value-interest_calc_method = ls_entity-InterestCalcMethod.
        ls_valuex-interest_calc_method = abap_true.
      ENDIF.
      IF ls_entity-%control-InterestCalcExpon = if_abap_behv=>mk-on.
        ls_value-interest_calc_expon = ls_entity-InterestCalcExpon.
        ls_valuex-interest_calc_expon = abap_true.
      ENDIF.
      IF ls_entity-%control-InterestCalendar = if_abap_behv=>mk-on.
        ls_value-interest_calendar = ls_entity-InterestCalendar.
        ls_valuex-interest_calendar = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseDays = if_abap_behv=>mk-on.
        ls_value-calc_base_days = ls_entity-CalcBaseDays.
        ls_valuex-calc_base_days = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseAmount = if_abap_behv=>mk-on.
        ls_value-calc_base_amount = ls_entity-CalcBaseAmount.
        ls_valuex-calc_base_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseCur = if_abap_behv=>mk-on.
        ls_value-calc_base_cur = ls_entity-CalcBaseCur.
        ls_valuex-calc_base_cur = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcBaseCurIso = if_abap_behv=>mk-on.
        ls_value-calc_base_cur_iso = ls_entity-CalcBaseCurIso.
        ls_valuex-calc_base_cur_iso = abap_true.
      ENDIF.
      IF ls_entity-%control-PercentageRate = if_abap_behv=>mk-on.
        ls_value-percentage_rate = ls_entity-PercentageRate.
        ls_valuex-percentage_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-Assignment = if_abap_behv=>mk-on.
        ls_value-assignment = ls_entity-Assignment.
        ls_valuex-assignment = abap_true.
      ENDIF.

      CALL FUNCTION 'BAPI_FTR_ADDFLOW_CHANGE'
        DESTINATION 'NONE'
        EXPORTING  additionalflow        = ls_value
                   additionalflowx       = ls_valuex
                   companycode           = ls_entity-CompanyCode
                   financialtransaction  = ls_entity-FinancialTransaction
                   flowkey               = ls_entity-FlowKey
                   side                  = ls_entity-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_ADDFLOW_CHANGE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_entity-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealaddflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_entity-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealaddflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD delete.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT keys INTO DATA(ls_key).
      CLEAR: lt_return, lv_msgtxt.

      " A real delete of the item (not a deal reversal).
      CALL FUNCTION 'BAPI_FTR_ADDFLOW_DELETE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_key-CompanyCode
                   financialtransaction  = ls_key-FinancialTransaction
                   flowkey               = ls_key-FlowKey
                   side                  = ls_key-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_ADDFLOW_DELETE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealaddflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealaddflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read.
    LOOP AT keys INTO DATA(ls_key).
      zcl_fs_trm_dealitem_query=>read_addflows( EXPORTING iv_company_code = ls_key-CompanyCode
                                                     iv_transaction  = ls_key-FinancialTransaction
                                           IMPORTING et_rows         = DATA(lt_rows)
                                                     et_return       = DATA(lt_return) ).
      READ TABLE lt_rows INTO DATA(ls_row) WITH KEY Side = ls_key-Side FlowKey = ls_key-FlowKey.
      IF sy-subrc <> 0 OR has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-not_found ) TO failed-dealaddflow.
        CONTINUE.
      ENDIF.
      APPEND CORRESPONDING #( ls_row ) TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_global_authorizations.
    " Instance checks are the FTR BAPIs' own; the framework only needs this answered (L-238).
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.

  METHOD lock.
    " Deliberately empty: the BAPIs enqueue the deal in the DESTINATION 'NONE' session, a
    " different lock owner; a lock taken here would collide with them.
    RETURN.
  ENDMETHOD.

  METHOD has_error.
    rv_error = xsdbool(    line_exists( it_return[ type = 'E' ] )
                        OR line_exists( it_return[ type = 'A' ] ) ).
  ENDMETHOD.

  METHOD rfc_error.
    rs_return = VALUE #( type       = 'E'
                         id         = 'ZFS_TRM_MSG'
                         number     = '020'
                         message_v1 = iv_function
                         message_v2 = iv_text ).
  ENDMETHOD.

  METHOD end_luw.
    DATA ls_return TYPE bapiret2.
    DATA lv_msgtxt TYPE c LENGTH 220.

    IF iv_commit = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        DESTINATION 'NONE'
        EXPORTING  wait                  = abap_true
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_COMMIT'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ELSEIF ls_return-type CA 'EA'.
        APPEND ls_return TO rt_return.
      ENDIF.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
        DESTINATION 'NONE'
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_ROLLBACK'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD to_message.
    ro_msg = new_message( id       = is_return-id
                          number   = is_return-number
                          severity = SWITCH #( is_return-type
                                               WHEN 'E' OR 'A' THEN if_abap_behv_message=>severity-error
                                               WHEN 'W'        THEN if_abap_behv_message=>severity-warning
                                               WHEN 'I'        THEN if_abap_behv_message=>severity-information
                                               ELSE                 if_abap_behv_message=>severity-success )
                          v1       = is_return-message_v1
                          v2       = is_return-message_v2
                          v3       = is_return-message_v3
                          v4       = is_return-message_v4 ).
  ENDMETHOD.
ENDCLASS.


CLASS lsc_trmdealaddflow DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.


CLASS lsc_trmdealaddflow IMPLEMENTATION.
  METHOD save.
    " Deliberately empty: each BAPI call was committed or rolled back in its own
    " DESTINATION 'NONE' session by the handler (L-227).
    RETURN.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 6: Expose it in the service definition**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/ddic/srvd/sources/zfs_sd_trmdealitem/source/main`:

```abap
@EndUserText.label: 'Deal items (any product) CRUD API'
define service ZFS_SD_TRMDEALITEM {
  expose ZFS_CE_TrmDealCondTP as Condition;
  expose ZFS_CE_TrmDealAddFlowTP as AdditionalFlow;
}
```

- [ ] **Step 7: Activate everything in one call**

`mcp-abap-abap-adt-api activateObjects` with the custom entity, the query class, the BDEF, the pool and
the service definition (and the binding `/sap/bc/adt/businessservices/bindings/zfs_sb_trmdealitem_o4_api`)
in **one** array. Expected: `success: true`, no `E` messages. Then `inactiveObjects`: none of these names
may be listed (L-543). If the class reports a type error on a field, compare the element's data element
with `context/sap-bapis/json/structures.json` for that BAPI field before changing anything.

- [ ] **Step 8: Run the test and confirm it passes**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set AdditionalFlow -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,FlowKey `
  -CreateBody $addflowBody -PatchBody '{"PaymentAmount":750}' -PatchField PaymentAmount
```
Expected: every step logs its expected status (200 / refusal / 201 / 200 / 200 / 200 / 204 / 200),
`rows after` = `rows before`, exit code **0**. Confirm in the log that the POST response carries the
new key and that step 6 shows the patched value.

- [ ] **Step 9: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09 lessons/lessons-ledger.md
git commit -m "TRM deal-item API task 4: AdditionalFlow create/update/delete live"
```

---

### Task 5: `MainFlow`

**Files:** on SAP — create `ZFS_CE_TrmDealMainFlowTP` + BDEF + `ZBP_FS_TRMDEALMAINFLOWTP`, change `ZCL_FS_TRM_DEALITEM_QUERY` and `ZFS_SD_TRMDEALITEM`; worklog + evidence.

**Interfaces:**
- Consumes: `zcl_fs_trm_dealitem_query=>tt_return`, `…=>read_mainflows` (this task), `dealitem-crud.ps1`, `$deal`.
- Produces: entity set `MainFlow` with POST/GET/PATCH/DELETE.

Session set-up for this task (values from the worklog):

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc  = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$ev   = 'worklog\DS4_100_NIIF\2026-09\evidence\<worklog stem>'   # the Phase 1 worklog's own stem
$deal = '<Phase 1 test deal number recorded in the worklog by Task 1 Step 8>'
```

Prepare the create payload first (the test needs it):

Main flows of an interest rate instrument are generated from its conditions, so SAP may refuse a
manual one (spec risk 3). Build the body from the deal's own first main flow:

```powershell
$mf = ((Invoke-Trm $svc 'probe' GET "MainFlow?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '$deal'" $null $null).Content | ConvertFrom-Json).value | Select-Object -First 1
$mainflowBody = '{"CompanyCode":"1000","FinancialTransaction":"' + $deal + '","Side":"' + $mf.Side +
                '","FlowType":"' + $mf.FlowType + '","PaymentDate":"2027-03-31","PaymentAmount":100}'
```

**Acceptance for this set has two outcomes, both valid:** (a) the script exits 0; or (b) the POST
answers **400 with SAP's own message** (not a dump, not 500), in which case record the message in the
worklog and ledger as the main-flow limitation, and run only steps 1, 2 and 4 against an **existing**
main flow (key from `$mf`) to prove read works. A 500 is a failure in either case.

- [ ] **Step 1: Run the test first and confirm it fails**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set MainFlow -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,FlowKey `
  -CreateBody $mainflowBody -PatchBody '{"PaymentAmount":250}' -PatchField PaymentAmount
```
Expected: the first call answers **404** (entity set `MainFlow` not in the service yet), the script exits 1.

- [ ] **Step 2: Naming gate, then create the custom entity**

Append to the phase worklog's naming section, **before** the create:

```
NAMING: ZFS_CE_TrmDealMainFlowTP -> matches CDS "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealMainFlowTP (transactional, TP once)
NAMING: ZFS_CE_TrmDealMainFlowTP (BDEF) -> matches "Behavior definition: same as root view"
NAMING: ZBP_FS_TRMDEALMAINFLOWTP -> matches "Behavior implementation class ZBP_FS_<Entity>"
NAMING: LHC_TRMDEALMAINFLOW / LSC_TRMDEALMAINFLOW -> match LHC_/LSC_<Entity> (TP stripped, L-226)
```

`mcp-abap-abap-adt-api createObject` (L-546: a DDLS on a named transport):
`objtype DDLS/DF`, `name ZFS_CE_TrmDealMainFlowTP`, `parentName ZFS_SLC_APP`, `parentPath /sap/bc/adt/packages/zfs_slc_app`,
`transport DS4K907209`, description = the label below. Then `lock` → `setObjectSource`
(`/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealmainflowtp/source/main`, transport `DS4K907209`) → `unLock` with:

```abap
@EndUserText.label: 'Deal main flow (any product)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_TRM_DEALITEM_QUERY'
define root custom entity ZFS_CE_TrmDealMainFlowTP
{
  key CompanyCode          : bukrs;
  key FinancialTransaction : tb_rfha;
  key Side                 : tb_rkondgr;
  key FlowKey              : tb_bapi_flow_key;
      FlowType             : tb_sfhazba;
      FlowSign             : tb_ssign;
      PaymentDate          : tb_dzterm;
      PaymentAmount        : bapitb_bzbetr;
      PaymentCur           : tb_wzbetr;
      PaymentCurIso        : isocd;
      LocalCurRate         : tb_khwkurs;
      LocalCurAmount       : bapitb_hwbetr;
      CurrentRate          : tb_shwkakt;
      FixedRate            : tb_shwkfix;
      FixedAmount          : tb_shwbfix;
      Assignment           : dzuonr;
      PostingStatus        : tb_sbewebe;
      CalcDate             : dvalut;
      NominalAmount        : bapitm_bnwhr;
}
```

Run `transportInfo` on `/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealmainflowtp`: expect `DS4K907209` / task `DS4K907260`.
Do **not** activate yet (the query class does not know the entity).

- [ ] **Step 3: Extend the query class**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/oo/classes/zcl_fs_trm_dealitem_query/source/main`
with the complete source below (adds `tt_mainflow`, `read_mainflows` and its `WHEN` branch):

```abap
CLASS zcl_fs_trm_dealitem_query DEFINITION
  PUBLIC FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_return    TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    TYPES tt_condition TYPE STANDARD TABLE OF zfs_ce_trmdealcondtp WITH EMPTY KEY.
    TYPES tt_addflow   TYPE STANDARD TABLE OF zfs_ce_trmdealaddflowtp WITH EMPTY KEY.
    TYPES tt_mainflow  TYPE STANDARD TABLE OF zfs_ce_trmdealmainflowtp WITH EMPTY KEY.

    CLASS-METHODS read_conditions
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_condition
                et_return       TYPE tt_return.
    CLASS-METHODS read_addflows
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_addflow
                et_return       TYPE tt_return.
    CLASS-METHODS read_mainflows
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_mainflow
                et_return       TYPE tt_return.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_deal,
             company_code TYPE bukrs,
             transaction  TYPE tb_rfha,
           END OF ty_deal.

    METHODS get_deal
      IMPORTING io_request     TYPE REF TO if_rap_query_request
      RETURNING VALUE(rs_deal) TYPE ty_deal
      RAISING   cx_rap_query_provider.

    METHODS respond
      IMPORTING io_request  TYPE REF TO if_rap_query_request
                io_response TYPE REF TO if_rap_query_response
      CHANGING  ct_rows     TYPE STANDARD TABLE
      RAISING   cx_rap_query_provider.
ENDCLASS.


CLASS zcl_fs_trm_dealitem_query IMPLEMENTATION.
  METHOD if_rap_query_provider~select.
    " The item BAPIs read per deal: CompanyCode and FinancialTransaction (eq) are mandatory.
    DATA(ls_deal) = get_deal( io_request ).

    CASE io_request->get_entity_id( ).
      WHEN 'ZFS_CE_TRMDEALCONDTP'.
        DATA lt_cond TYPE tt_condition.
        read_conditions( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_cond ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_cond ).
      WHEN 'ZFS_CE_TRMDEALADDFLOWTP'.
        DATA lt_addflow TYPE tt_addflow.
        read_addflows( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_addflow ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_addflow ).
      WHEN 'ZFS_CE_TRMDEALMAINFLOWTP'.
        DATA lt_mainflow TYPE tt_mainflow.
        read_mainflows( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_mainflow ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_mainflow ).
    ENDCASE.
  ENDMETHOD.

  METHOD get_deal.
    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    LOOP AT lt_ranges INTO DATA(ls_range).
      IF    lines( ls_range-range ) <> 1
         OR ls_range-range[ 1 ]-sign   <> 'I'
         OR ls_range-range[ 1 ]-option <> 'EQ'.
        CONTINUE.
      ENDIF.
      CASE ls_range-name.
        WHEN 'COMPANYCODE'.
          rs_deal-company_code = ls_range-range[ 1 ]-low.
        WHEN 'FINANCIALTRANSACTION'.
          rs_deal-transaction = |{ CONV tb_rfha( ls_range-range[ 1 ]-low ) ALPHA = IN }|.
      ENDCASE.
    ENDLOOP.

    IF rs_deal-company_code IS INITIAL OR rs_deal-transaction IS INITIAL.
      " ZFS_TRM_MSG 056: $filter on CompanyCode and FinancialTransaction is required
      RAISE EXCEPTION TYPE cx_rap_query_cond
        EXPORTING textid = VALUE scx_t100key( msgid = 'ZFS_TRM_MSG'
                                              msgno = '056' ).
    ENDIF.
  ENDMETHOD.

  METHOD respond.
    DATA lr_range TYPE REF TO data.
    FIELD-SYMBOLS <lt_range> TYPE STANDARD TABLE.

    " Paging must be read even when only $count is requested.
    DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
    DATA(lv_size) = io_request->get_paging( )->get_page_size( ).

    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    " Remaining $filter conditions are applied in ABAP to this one deal's rows, typed
    " against each element so numbers and dates compare as values, not text.
    LOOP AT lt_ranges INTO DATA(ls_range)
         WHERE name <> 'COMPANYCODE' AND name <> 'FINANCIALTRANSACTION'.
      LOOP AT ct_rows ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_range-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE cx_rap_query_cond.
        ENDIF.
        IF lr_range IS NOT BOUND.
          DATA(lv_type) = cl_abap_typedescr=>describe_by_data( <lv_value> )->absolute_name.
          CREATE DATA lr_range TYPE RANGE OF (lv_type).
          ASSIGN lr_range->* TO <lt_range>.
          MOVE-CORRESPONDING ls_range-range TO <lt_range>.
        ENDIF.
        IF NOT <lv_value> IN <lt_range>.
          DELETE ct_rows.
        ENDIF.
      ENDLOOP.
      FREE lr_range.
    ENDLOOP.

    DATA(lt_sort) = io_request->get_sort_elements( ).
    IF lt_sort IS NOT INITIAL.
      DATA(lt_order) = VALUE abap_sortorder_tab( FOR ls_sort IN lt_sort
                                                 ( name       = ls_sort-element_name
                                                   descending = ls_sort-descending ) ).
      SORT ct_rows BY (lt_order).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( ct_rows ) ).
    ENDIF.

    IF io_request->is_data_requested( ).
      IF lv_offset > 0.
        DELETE ct_rows TO lv_offset.
      ENDIF.
      IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( ct_rows ) > lv_size.
        DELETE ct_rows FROM lv_size + 1.
      ENDIF.
      io_response->set_data( ct_rows ).
    ENDIF.
  ENDMETHOD.

  METHOD read_conditions.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_cond_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_CONDITION_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    conditions             = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-direction
                      ConditionKey         = ls_detail-condition_key
                      ConditionNumber      = ls_detail-condition
                      ConditionType        = ls_detail-condition_type
                      EffectiveFrom        = ls_detail-effective_from
                      AmountCalcRule       = ls_detail-amount_calc_rule
                      PercentageRate       = ls_detail-percentage_rate
                      Amount               = ls_detail-amount
                      Currency             = ls_detail-currency
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      RefInterestRate      = ls_detail-ref_interest_rate
                      RateMarkupOrDown     = ls_detail-rate_markup_or_down
                      CalcMethod           = ls_detail-calc_method
                      CalcCalendar         = ls_detail-calc_calendar
                      Frequency            = ls_detail-frequency
                      FrequencyUnit        = ls_detail-frequency_unit
                      CalcDate             = ls_detail-calc_date
                      CalcDateInclusive    = ls_detail-calc_date_inclusive
                      CalcDateMonthEnd     = ls_detail-calc_date_month_end
                      DueDate              = ls_detail-due_date
                      DueDateMonthEnd      = ls_detail-due_date_month_end
                      ShiftDays            = ls_detail-shift_days ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_addflows.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_addflow_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_ADDFLOW_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    additionalflows        = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-flow_side
                      FlowKey              = ls_detail-flow_key
                      FlowType             = ls_detail-flow_type
                      FlowSign             = ls_detail-flow_sign
                      PaymentDate          = ls_detail-payment_date
                      PaymentAmount        = ls_detail-payment_amount
                      PaymentCur           = ls_detail-payment_cur
                      PaymentCurIso        = ls_detail-payment_cur_iso
                      LocalCurRate         = ls_detail-local_cur_rate
                      LocalCurAmount       = ls_detail-local_cur_amount
                      CurrentRate          = ls_detail-current_rate
                      FixedRate            = ls_detail-fixed_rate
                      FixedAmount          = ls_detail-fixed_amount
                      CalcFrom             = ls_detail-calc_from
                      CalcFromIncl         = ls_detail-calc_from_incl
                      CalcFromMonthEnd     = ls_detail-calc_from_month_end
                      CalcTo               = ls_detail-calc_to
                      CalcToIncl           = ls_detail-calc_to_incl
                      CalcToMonthEnd       = ls_detail-calc_to_month_end
                      InterestCalcMethod   = ls_detail-interest_calc_method
                      InterestCalcExpon    = ls_detail-interest_calc_expon
                      InterestCalendar     = ls_detail-interest_calendar
                      InterestCalcDays     = ls_detail-interest_calc_days
                      CalcBaseDays         = ls_detail-calc_base_days
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      CalcBaseCur          = ls_detail-calc_base_cur
                      CalcBaseCurIso       = ls_detail-calc_base_cur_iso
                      PercentageRate       = ls_detail-percentage_rate
                      Assignment           = ls_detail-assignment
                      PostingStatus        = ls_detail-posting_status ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_mainflows.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_mainflow_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_MAINFLOW_GETLIST'
      EXPORTING companycode          = iv_company_code
                financialtransaction = iv_transaction
      TABLES    mainflows            = lt_detail
                return               = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-flow_side
                      FlowKey              = ls_detail-flow_key
                      FlowType             = ls_detail-flow_type
                      FlowSign             = ls_detail-flow_sign
                      PaymentDate          = ls_detail-payment_date
                      PaymentAmount        = ls_detail-payment_amount
                      PaymentCur           = ls_detail-payment_cur
                      PaymentCurIso        = ls_detail-payment_cur_iso
                      LocalCurRate         = ls_detail-local_cur_rate
                      LocalCurAmount       = ls_detail-local_cur_amount
                      CurrentRate          = ls_detail-current_rate
                      FixedRate            = ls_detail-fixed_rate
                      FixedAmount          = ls_detail-fixed_amount
                      Assignment           = ls_detail-assignment
                      PostingStatus        = ls_detail-posting_status
                      CalcDate             = ls_detail-calc_date
                      NominalAmount        = ls_detail-nominal_amount ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 4: Create the BDEF and write it**

`adt-mcp abap_creation-run_validation`, then `abap_creation-create_object`, `objectType BDEF/BDO`,
`objectContent {"behaviorDefinitionType":"definition","packageName":"ZFS_SLC_APP","rootEntity":"ZFS_CE_TRMDEALMAINFLOWTP","name":"ZFS_CE_TRMDEALMAINFLOWTP","description":"MainFlow (any product) - CRUD API","implementationType":"Unmanaged"}`,
top-level `transportRequestNumber DS4K907209` (L-564). `transportInfo` on
`/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealmainflowtp`: expect `DS4K907209`. Then `lock` → `setObjectSource` → `unLock`
on `/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealmainflowtp/source/main`:

```abap
unmanaged implementation in class zbp_fs_trmdealmainflowtp unique;
strict ( 2 );

define behavior for ZFS_CE_TrmDealMainFlowTP alias DealMainFlow
lock master
authorization master ( global )
{
  create;
  update;
  delete;

  field ( readonly ) FlowKey, FlowSign, PaymentCur, PaymentCurIso, PostingStatus;
  field ( mandatory : create ) CompanyCode, FinancialTransaction, FlowType, PaymentDate;
  field ( readonly : update ) CompanyCode, FinancialTransaction, Side;
}
```

- [ ] **Step 5: Create the behavior pool**

`mcp-abap-abap-adt-api createObject` `CLAS/OC` `ZBP_FS_TRMDEALMAINFLOWTP` in `ZFS_SLC_APP`, transport `DS4K907209`,
description "Behavior pool for ZFS_CE_TrmDealMainFlowTP". `lock` the class, then write the main include
(`/sap/bc/adt/oo/classes/zbp_fs_trmdealmainflowtp/source/main`):

```abap
CLASS zbp_fs_trmdealmainflowtp DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zfs_ce_trmdealmainflowtp.
ENDCLASS.


CLASS zbp_fs_trmdealmainflowtp IMPLEMENTATION.
ENDCLASS.
```

and the implementations include (`/sap/bc/adt/oo/classes/zbp_fs_trmdealmainflowtp/includes/implementations`),
then `unLock`:

```abap
CLASS lhc_trmdealmainflow DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    TYPES tt_return TYPE zcl_fs_trm_dealitem_query=>tt_return.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR DealMainFlow RESULT result.

    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE DealMainFlow.

    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE DealMainFlow.

    METHODS delete FOR MODIFY
      IMPORTING keys FOR DELETE DealMainFlow.

    METHODS read FOR READ
      IMPORTING keys FOR READ DealMainFlow RESULT result.

    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK DealMainFlow.

    METHODS has_error
      IMPORTING it_return       TYPE tt_return
      RETURNING VALUE(rv_error) TYPE abap_bool.

    METHODS rfc_error
      IMPORTING iv_function      TYPE csequence
                iv_text          TYPE csequence
      RETURNING VALUE(rs_return) TYPE bapiret2.

    METHODS end_luw
      IMPORTING iv_commit        TYPE abap_bool
      RETURNING VALUE(rt_return) TYPE tt_return.

    METHODS to_message
      IMPORTING is_return     TYPE bapiret2
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
ENDCLASS.


CLASS lhc_trmdealmainflow IMPLEMENTATION.
  METHOD create.
    DATA ls_value  TYPE bapi_ftr_mainflow_create.
    DATA lv_new_key TYPE tb_bapi_flow_key.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, lv_new_key, lt_return, lv_msgtxt.

      IF ls_entity-%control-FlowType = if_abap_behv=>mk-on.
        ls_value-flow_type = ls_entity-FlowType.
      ENDIF.
      IF ls_entity-%control-PaymentDate = if_abap_behv=>mk-on.
        ls_value-payment_date = ls_entity-PaymentDate.
      ENDIF.
      IF ls_entity-%control-PaymentAmount = if_abap_behv=>mk-on.
        ls_value-payment_amount = ls_entity-PaymentAmount.
      ENDIF.
      IF ls_entity-%control-LocalCurRate = if_abap_behv=>mk-on.
        ls_value-local_cur_rate = ls_entity-LocalCurRate.
      ENDIF.
      IF ls_entity-%control-LocalCurAmount = if_abap_behv=>mk-on.
        ls_value-local_cur_amount = ls_entity-LocalCurAmount.
      ENDIF.
      IF ls_entity-%control-CurrentRate = if_abap_behv=>mk-on.
        ls_value-current_rate = ls_entity-CurrentRate.
      ENDIF.
      IF ls_entity-%control-FixedRate = if_abap_behv=>mk-on.
        ls_value-fixed_rate = ls_entity-FixedRate.
      ENDIF.
      IF ls_entity-%control-FixedAmount = if_abap_behv=>mk-on.
        ls_value-fixed_amount = ls_entity-FixedAmount.
      ENDIF.
      IF ls_entity-%control-Assignment = if_abap_behv=>mk-on.
        ls_value-assignment = ls_entity-Assignment.
      ENDIF.
      IF ls_entity-%control-CalcDate = if_abap_behv=>mk-on.
        ls_value-calc_date = ls_entity-CalcDate.
      ENDIF.
      IF ls_entity-%control-NominalAmount = if_abap_behv=>mk-on.
        ls_value-nominal_amount = ls_entity-NominalAmount.
      ENDIF.

      " DESTINATION 'NONE': the item BAPIs use the update task (L-227); commit or roll back
      " in the same session right after the call (per-operation commit, spec section 3).
      CALL FUNCTION 'BAPI_FTR_MAINFLOW_CREATE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_entity-CompanyCode
                   financialtransaction  = ls_entity-FinancialTransaction
                   mainflow              = ls_value
                   side                  = ls_entity-Side
        IMPORTING  returnflowkey         = lv_new_key
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_MAINFLOW_CREATE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ) ) TO lt_return.
      ENDIF.

      IF NOT ( has_error( lt_return ) = abap_false AND lv_new_key IS NOT INITIAL ).
        APPEND VALUE #( %cid        = ls_entity-%cid
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealmainflow.
      ELSE.
        APPEND VALUE #( %cid                      = ls_entity-%cid
                      %key-CompanyCode          = ls_entity-CompanyCode
                      %key-FinancialTransaction = ls_entity-FinancialTransaction
                      %key-Side                 = ls_entity-Side
                      %key-FlowKey              = lv_new_key ) TO mapped-dealmainflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %cid = ls_entity-%cid
                        %msg = to_message( ls_return ) ) TO reported-dealmainflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD update.
    DATA ls_value  TYPE bapi_ftr_mainflow_change.
    DATA ls_valuex TYPE bapi_ftr_mainflow_changex.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, ls_valuex, lt_return, lv_msgtxt.

      IF ls_entity-%control-FlowType = if_abap_behv=>mk-on.
        ls_value-flow_type = ls_entity-FlowType.
        ls_valuex-flow_type = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentDate = if_abap_behv=>mk-on.
        ls_value-payment_date = ls_entity-PaymentDate.
        ls_valuex-payment_date = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentAmount = if_abap_behv=>mk-on.
        ls_value-payment_amount = ls_entity-PaymentAmount.
        ls_valuex-payment_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-LocalCurRate = if_abap_behv=>mk-on.
        ls_value-local_cur_rate = ls_entity-LocalCurRate.
        ls_valuex-local_cur_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-LocalCurAmount = if_abap_behv=>mk-on.
        ls_value-local_cur_amount = ls_entity-LocalCurAmount.
        ls_valuex-local_cur_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-CurrentRate = if_abap_behv=>mk-on.
        ls_value-current_rate = ls_entity-CurrentRate.
        ls_valuex-current_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-FixedRate = if_abap_behv=>mk-on.
        ls_value-fixed_rate = ls_entity-FixedRate.
        ls_valuex-fixed_rate = abap_true.
      ENDIF.
      IF ls_entity-%control-FixedAmount = if_abap_behv=>mk-on.
        ls_value-fixed_amount = ls_entity-FixedAmount.
        ls_valuex-fixed_amount = abap_true.
      ENDIF.
      IF ls_entity-%control-Assignment = if_abap_behv=>mk-on.
        ls_value-assignment = ls_entity-Assignment.
        ls_valuex-assignment = abap_true.
      ENDIF.
      IF ls_entity-%control-CalcDate = if_abap_behv=>mk-on.
        ls_value-calc_date = ls_entity-CalcDate.
        ls_valuex-calc_date = abap_true.
      ENDIF.
      IF ls_entity-%control-NominalAmount = if_abap_behv=>mk-on.
        ls_value-nominal_amount = ls_entity-NominalAmount.
        ls_valuex-nominal_amount = abap_true.
      ENDIF.

      CALL FUNCTION 'BAPI_FTR_MAINFLOW_CHANGE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_entity-CompanyCode
                   financialtransaction  = ls_entity-FinancialTransaction
                   flowkey               = ls_entity-FlowKey
                   mainflow              = ls_value
                   mainflowx             = ls_valuex
                   side                  = ls_entity-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_MAINFLOW_CHANGE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_entity-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealmainflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_entity-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealmainflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD delete.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT keys INTO DATA(ls_key).
      CLEAR: lt_return, lv_msgtxt.

      " A real delete of the item (not a deal reversal).
      CALL FUNCTION 'BAPI_FTR_MAINFLOW_DELETE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_key-CompanyCode
                   financialtransaction  = ls_key-FinancialTransaction
                   flowkey               = ls_key-FlowKey
                   side                  = ls_key-Side
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_MAINFLOW_DELETE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealmainflow.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealmainflow.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read.
    LOOP AT keys INTO DATA(ls_key).
      zcl_fs_trm_dealitem_query=>read_mainflows( EXPORTING iv_company_code = ls_key-CompanyCode
                                                     iv_transaction  = ls_key-FinancialTransaction
                                           IMPORTING et_rows         = DATA(lt_rows)
                                                     et_return       = DATA(lt_return) ).
      READ TABLE lt_rows INTO DATA(ls_row) WITH KEY Side = ls_key-Side FlowKey = ls_key-FlowKey.
      IF sy-subrc <> 0 OR has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-not_found ) TO failed-dealmainflow.
        CONTINUE.
      ENDIF.
      APPEND CORRESPONDING #( ls_row ) TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_global_authorizations.
    " Instance checks are the FTR BAPIs' own; the framework only needs this answered (L-238).
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.

  METHOD lock.
    " Deliberately empty: the BAPIs enqueue the deal in the DESTINATION 'NONE' session, a
    " different lock owner; a lock taken here would collide with them.
    RETURN.
  ENDMETHOD.

  METHOD has_error.
    rv_error = xsdbool(    line_exists( it_return[ type = 'E' ] )
                        OR line_exists( it_return[ type = 'A' ] ) ).
  ENDMETHOD.

  METHOD rfc_error.
    rs_return = VALUE #( type       = 'E'
                         id         = 'ZFS_TRM_MSG'
                         number     = '020'
                         message_v1 = iv_function
                         message_v2 = iv_text ).
  ENDMETHOD.

  METHOD end_luw.
    DATA ls_return TYPE bapiret2.
    DATA lv_msgtxt TYPE c LENGTH 220.

    IF iv_commit = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        DESTINATION 'NONE'
        EXPORTING  wait                  = abap_true
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_COMMIT'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ELSEIF ls_return-type CA 'EA'.
        APPEND ls_return TO rt_return.
      ENDIF.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
        DESTINATION 'NONE'
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_ROLLBACK'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD to_message.
    ro_msg = new_message( id       = is_return-id
                          number   = is_return-number
                          severity = SWITCH #( is_return-type
                                               WHEN 'E' OR 'A' THEN if_abap_behv_message=>severity-error
                                               WHEN 'W'        THEN if_abap_behv_message=>severity-warning
                                               WHEN 'I'        THEN if_abap_behv_message=>severity-information
                                               ELSE                 if_abap_behv_message=>severity-success )
                          v1       = is_return-message_v1
                          v2       = is_return-message_v2
                          v3       = is_return-message_v3
                          v4       = is_return-message_v4 ).
  ENDMETHOD.
ENDCLASS.


CLASS lsc_trmdealmainflow DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.


CLASS lsc_trmdealmainflow IMPLEMENTATION.
  METHOD save.
    " Deliberately empty: each BAPI call was committed or rolled back in its own
    " DESTINATION 'NONE' session by the handler (L-227).
    RETURN.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 6: Expose it in the service definition**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/ddic/srvd/sources/zfs_sd_trmdealitem/source/main`:

```abap
@EndUserText.label: 'Deal items (any product) CRUD API'
define service ZFS_SD_TRMDEALITEM {
  expose ZFS_CE_TrmDealCondTP as Condition;
  expose ZFS_CE_TrmDealAddFlowTP as AdditionalFlow;
  expose ZFS_CE_TrmDealMainFlowTP as MainFlow;
}
```

- [ ] **Step 7: Activate everything in one call**

`mcp-abap-abap-adt-api activateObjects` with the custom entity, the query class, the BDEF, the pool and
the service definition (and the binding `/sap/bc/adt/businessservices/bindings/zfs_sb_trmdealitem_o4_api`)
in **one** array. Expected: `success: true`, no `E` messages. Then `inactiveObjects`: none of these names
may be listed (L-543). If the class reports a type error on a field, compare the element's data element
with `context/sap-bapis/json/structures.json` for that BAPI field before changing anything.

- [ ] **Step 8: Run the test and confirm it passes**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set MainFlow -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Side,FlowKey `
  -CreateBody $mainflowBody -PatchBody '{"PaymentAmount":250}' -PatchField PaymentAmount
```
Expected: every step logs its expected status (200 / refusal / 201 / 200 / 200 / 200 / 204 / 200),
`rows after` = `rows before`, exit code **0**. Confirm in the log that the POST response carries the
new key and that step 6 shows the patched value.

- [ ] **Step 9: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09 lessons/lessons-ledger.md
git commit -m "TRM deal-item API task 5: MainFlow create/update/delete live"
```

---

### Task 6: `PaymentDetail`

**Files:** on SAP — create `ZFS_CE_TrmDealPayDetTP` + BDEF + `ZBP_FS_TRMDEALPAYDETTP`, change `ZCL_FS_TRM_DEALITEM_QUERY` and `ZFS_SD_TRMDEALITEM`; worklog + evidence.

**Interfaces:**
- Consumes: `zcl_fs_trm_dealitem_query=>tt_return`, `…=>read_paydets` (this task), `dealitem-crud.ps1`, `$deal`.
- Produces: entity set `PaymentDetail` with POST/GET/PATCH/DELETE.

Session set-up for this task (values from the worklog):

```powershell
. .\scripts\trm-deal-api-tests\trm-odata.ps1
$svc  = 'zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001'
$ev   = 'worklog\DS4_100_NIIF\2026-09\evidence\<worklog stem>'   # the Phase 1 worklog's own stem
$deal = '<Phase 1 test deal number recorded in the worklog by Task 1 Step 8>'
```

Prepare the create payload first (the test needs it):

Discover an existing payment detail to copy the house bank and account from:

```powershell
.\scripts\trm-deal-api-tests\dealitem-discover.ps1 -EvidenceDir $ev -Set PaymentDetail -Top 40
```

Take `Direction`, `FlowType`, `HouseBank`, `AccountId`, `PaymentMethod` from the first row printed. If
nothing is printed, stop and ask the human for a house bank / account ID valid in company code 1000.

```powershell
$paydetBody = '{"CompanyCode":"1000","FinancialTransaction":"' + $deal + '","Direction":"<Direction>","EffectiveDate":"2026-10-01",' +
              '"FlowType":"<FlowType>","PaymentCurrency":"INR","HouseBank":"<HouseBank>","AccountId":"<AccountId>","PaymentMethod":"<PaymentMethod>"}'
```

The `<...>` values come from the discovery output; they are data, not placeholders to leave in.

- [ ] **Step 1: Run the test first and confirm it fails**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set PaymentDetail -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Direction,EffectiveDate,FlowType,PaymentCurrency `
  -CreateBody $paydetBody -PatchBody '{"PaymentMethod":"T"}' -PatchField PaymentMethod
```
Expected: the first call answers **404** (entity set `PaymentDetail` not in the service yet), the script exits 1.

- [ ] **Step 2: Naming gate, then create the custom entity**

Append to the phase worklog's naming section, **before** the create:

```
NAMING: ZFS_CE_TrmDealPayDetTP -> matches CDS "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealPayDetTP (transactional, TP once)
NAMING: ZFS_CE_TrmDealPayDetTP (BDEF) -> matches "Behavior definition: same as root view"
NAMING: ZBP_FS_TRMDEALPAYDETTP -> matches "Behavior implementation class ZBP_FS_<Entity>"
NAMING: LHC_TRMDEALPAYDET / LSC_TRMDEALPAYDET -> match LHC_/LSC_<Entity> (TP stripped, L-226)
```

`mcp-abap-abap-adt-api createObject` (L-546: a DDLS on a named transport):
`objtype DDLS/DF`, `name ZFS_CE_TrmDealPayDetTP`, `parentName ZFS_SLC_APP`, `parentPath /sap/bc/adt/packages/zfs_slc_app`,
`transport DS4K907209`, description = the label below. Then `lock` → `setObjectSource`
(`/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealpaydettp/source/main`, transport `DS4K907209`) → `unLock` with:

```abap
@EndUserText.label: 'Deal payment detail (any product)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_TRM_DEALITEM_QUERY'
define root custom entity ZFS_CE_TrmDealPayDetTP
{
  key CompanyCode            : bukrs;
  key FinancialTransaction   : tb_rfha;
  key Direction              : tb_ssign;
  key EffectiveDate          : tb_dzverb;
  key FlowType               : sbewart;
  key PaymentCurrency        : waers;
      PaymentCurrencyIso     : isocd;
      HouseBank              : hbkid;
      AccountId              : hktid;
      PaymentActivity        : tb_szart;
      PaymentRequest         : tb_spayrqk;
      Payer                  : tb_rpzahl_new;
      PartnerBank            : tb_rpbank;
      PaymentMethod          : dzlsch;
      PaymentMethodSuppl     : uzawe;
      DetGroupDefinition     : tb_sprgrd;
      IndividualPayment      : tb_sprsngk;
      EqualDirection         : tb_scspay;
      ConsideredPaymntMeth   : dzwels;
      PayerTransaction       : tb_rpzahl_new;
      AlternativePayerTrans  : tb_rpzahla;
      RepetitiveCode         : rpcode;
      RepetitiveCodeText     : rpcode_text;
      ScbankInd              : lzbkz;
      Supcountry             : landl;
      BankAccount            : bankn;
      BankControlKey         : bkont;
      BankAccountCurrency    : waers;
      BankAccountCurrencyIso : isocd;
      BankAccountName        : text1;
      BankAccount2           : bnkn2_bf;
      BankAccountGlAccount   : hkont;
      BankAccountBankref     : refzl;
      BankAccountCountry     : banks;
      BankAccountCountryIso  : intca;
      BankAccountBankKey     : bankk;
      SepaMandateId          : sepa_mndid;
}
```

Run `transportInfo` on `/sap/bc/adt/ddic/ddl/sources/zfs_ce_trmdealpaydettp`: expect `DS4K907209` / task `DS4K907260`.
Do **not** activate yet (the query class does not know the entity).

- [ ] **Step 3: Extend the query class**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/oo/classes/zcl_fs_trm_dealitem_query/source/main`
with the complete source below (adds `tt_paydet`, `read_paydets` and its `WHEN` branch):

```abap
CLASS zcl_fs_trm_dealitem_query DEFINITION
  PUBLIC FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_return    TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    TYPES tt_condition TYPE STANDARD TABLE OF zfs_ce_trmdealcondtp WITH EMPTY KEY.
    TYPES tt_addflow   TYPE STANDARD TABLE OF zfs_ce_trmdealaddflowtp WITH EMPTY KEY.
    TYPES tt_mainflow  TYPE STANDARD TABLE OF zfs_ce_trmdealmainflowtp WITH EMPTY KEY.
    TYPES tt_paydet    TYPE STANDARD TABLE OF zfs_ce_trmdealpaydettp WITH EMPTY KEY.

    CLASS-METHODS read_conditions
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_condition
                et_return       TYPE tt_return.
    CLASS-METHODS read_addflows
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_addflow
                et_return       TYPE tt_return.
    CLASS-METHODS read_mainflows
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_mainflow
                et_return       TYPE tt_return.
    CLASS-METHODS read_paydets
      IMPORTING iv_company_code TYPE bukrs
                iv_transaction  TYPE tb_rfha
      EXPORTING et_rows         TYPE tt_paydet
                et_return       TYPE tt_return.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_deal,
             company_code TYPE bukrs,
             transaction  TYPE tb_rfha,
           END OF ty_deal.

    METHODS get_deal
      IMPORTING io_request     TYPE REF TO if_rap_query_request
      RETURNING VALUE(rs_deal) TYPE ty_deal
      RAISING   cx_rap_query_provider.

    METHODS respond
      IMPORTING io_request  TYPE REF TO if_rap_query_request
                io_response TYPE REF TO if_rap_query_response
      CHANGING  ct_rows     TYPE STANDARD TABLE
      RAISING   cx_rap_query_provider.
ENDCLASS.


CLASS zcl_fs_trm_dealitem_query IMPLEMENTATION.
  METHOD if_rap_query_provider~select.
    " The item BAPIs read per deal: CompanyCode and FinancialTransaction (eq) are mandatory.
    DATA(ls_deal) = get_deal( io_request ).

    CASE io_request->get_entity_id( ).
      WHEN 'ZFS_CE_TRMDEALCONDTP'.
        DATA lt_cond TYPE tt_condition.
        read_conditions( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_cond ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_cond ).
      WHEN 'ZFS_CE_TRMDEALADDFLOWTP'.
        DATA lt_addflow TYPE tt_addflow.
        read_addflows( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_addflow ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_addflow ).
      WHEN 'ZFS_CE_TRMDEALMAINFLOWTP'.
        DATA lt_mainflow TYPE tt_mainflow.
        read_mainflows( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_mainflow ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_mainflow ).
      WHEN 'ZFS_CE_TRMDEALPAYDETTP'.
        DATA lt_paydet TYPE tt_paydet.
        read_paydets( EXPORTING iv_company_code = ls_deal-company_code
                               iv_transaction  = ls_deal-transaction
                     IMPORTING et_rows         = lt_paydet ).
        respond( EXPORTING io_request  = io_request
                           io_response = io_response
                 CHANGING  ct_rows     = lt_paydet ).
    ENDCASE.
  ENDMETHOD.

  METHOD get_deal.
    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    LOOP AT lt_ranges INTO DATA(ls_range).
      IF    lines( ls_range-range ) <> 1
         OR ls_range-range[ 1 ]-sign   <> 'I'
         OR ls_range-range[ 1 ]-option <> 'EQ'.
        CONTINUE.
      ENDIF.
      CASE ls_range-name.
        WHEN 'COMPANYCODE'.
          rs_deal-company_code = ls_range-range[ 1 ]-low.
        WHEN 'FINANCIALTRANSACTION'.
          rs_deal-transaction = |{ CONV tb_rfha( ls_range-range[ 1 ]-low ) ALPHA = IN }|.
      ENDCASE.
    ENDLOOP.

    IF rs_deal-company_code IS INITIAL OR rs_deal-transaction IS INITIAL.
      " ZFS_TRM_MSG 056: $filter on CompanyCode and FinancialTransaction is required
      RAISE EXCEPTION TYPE cx_rap_query_cond
        EXPORTING textid = VALUE scx_t100key( msgid = 'ZFS_TRM_MSG'
                                              msgno = '056' ).
    ENDIF.
  ENDMETHOD.

  METHOD respond.
    DATA lr_range TYPE REF TO data.
    FIELD-SYMBOLS <lt_range> TYPE STANDARD TABLE.

    " Paging must be read even when only $count is requested.
    DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
    DATA(lv_size) = io_request->get_paging( )->get_page_size( ).

    TRY.
        DATA(lt_ranges) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range INTO DATA(lx_range).
        RAISE EXCEPTION TYPE cx_rap_query_cond
          EXPORTING previous = lx_range.
    ENDTRY.

    " Remaining $filter conditions are applied in ABAP to this one deal's rows, typed
    " against each element so numbers and dates compare as values, not text.
    LOOP AT lt_ranges INTO DATA(ls_range)
         WHERE name <> 'COMPANYCODE' AND name <> 'FINANCIALTRANSACTION'.
      LOOP AT ct_rows ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_range-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE cx_rap_query_cond.
        ENDIF.
        IF lr_range IS NOT BOUND.
          DATA(lv_type) = cl_abap_typedescr=>describe_by_data( <lv_value> )->absolute_name.
          CREATE DATA lr_range TYPE RANGE OF (lv_type).
          ASSIGN lr_range->* TO <lt_range>.
          MOVE-CORRESPONDING ls_range-range TO <lt_range>.
        ENDIF.
        IF NOT <lv_value> IN <lt_range>.
          DELETE ct_rows.
        ENDIF.
      ENDLOOP.
      FREE lr_range.
    ENDLOOP.

    DATA(lt_sort) = io_request->get_sort_elements( ).
    IF lt_sort IS NOT INITIAL.
      DATA(lt_order) = VALUE abap_sortorder_tab( FOR ls_sort IN lt_sort
                                                 ( name       = ls_sort-element_name
                                                   descending = ls_sort-descending ) ).
      SORT ct_rows BY (lt_order).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( ct_rows ) ).
    ENDIF.

    IF io_request->is_data_requested( ).
      IF lv_offset > 0.
        DELETE ct_rows TO lv_offset.
      ENDIF.
      IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( ct_rows ) > lv_size.
        DELETE ct_rows FROM lv_size + 1.
      ENDIF.
      io_response->set_data( ct_rows ).
    ENDIF.
  ENDMETHOD.

  METHOD read_conditions.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_cond_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_CONDITION_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    conditions             = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-direction
                      ConditionKey         = ls_detail-condition_key
                      ConditionNumber      = ls_detail-condition
                      ConditionType        = ls_detail-condition_type
                      EffectiveFrom        = ls_detail-effective_from
                      AmountCalcRule       = ls_detail-amount_calc_rule
                      PercentageRate       = ls_detail-percentage_rate
                      Amount               = ls_detail-amount
                      Currency             = ls_detail-currency
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      RefInterestRate      = ls_detail-ref_interest_rate
                      RateMarkupOrDown     = ls_detail-rate_markup_or_down
                      CalcMethod           = ls_detail-calc_method
                      CalcCalendar         = ls_detail-calc_calendar
                      Frequency            = ls_detail-frequency
                      FrequencyUnit        = ls_detail-frequency_unit
                      CalcDate             = ls_detail-calc_date
                      CalcDateInclusive    = ls_detail-calc_date_inclusive
                      CalcDateMonthEnd     = ls_detail-calc_date_month_end
                      DueDate              = ls_detail-due_date
                      DueDateMonthEnd      = ls_detail-due_date_month_end
                      ShiftDays            = ls_detail-shift_days ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_addflows.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_addflow_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_ADDFLOW_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    additionalflows        = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-flow_side
                      FlowKey              = ls_detail-flow_key
                      FlowType             = ls_detail-flow_type
                      FlowSign             = ls_detail-flow_sign
                      PaymentDate          = ls_detail-payment_date
                      PaymentAmount        = ls_detail-payment_amount
                      PaymentCur           = ls_detail-payment_cur
                      PaymentCurIso        = ls_detail-payment_cur_iso
                      LocalCurRate         = ls_detail-local_cur_rate
                      LocalCurAmount       = ls_detail-local_cur_amount
                      CurrentRate          = ls_detail-current_rate
                      FixedRate            = ls_detail-fixed_rate
                      FixedAmount          = ls_detail-fixed_amount
                      CalcFrom             = ls_detail-calc_from
                      CalcFromIncl         = ls_detail-calc_from_incl
                      CalcFromMonthEnd     = ls_detail-calc_from_month_end
                      CalcTo               = ls_detail-calc_to
                      CalcToIncl           = ls_detail-calc_to_incl
                      CalcToMonthEnd       = ls_detail-calc_to_month_end
                      InterestCalcMethod   = ls_detail-interest_calc_method
                      InterestCalcExpon    = ls_detail-interest_calc_expon
                      InterestCalendar     = ls_detail-interest_calendar
                      InterestCalcDays     = ls_detail-interest_calc_days
                      CalcBaseDays         = ls_detail-calc_base_days
                      CalcBaseAmount       = ls_detail-calc_base_amount
                      CalcBaseCur          = ls_detail-calc_base_cur
                      CalcBaseCurIso       = ls_detail-calc_base_cur_iso
                      PercentageRate       = ls_detail-percentage_rate
                      Assignment           = ls_detail-assignment
                      PostingStatus        = ls_detail-posting_status ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_mainflows.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_mainflow_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_MAINFLOW_GETLIST'
      EXPORTING companycode          = iv_company_code
                financialtransaction = iv_transaction
      TABLES    mainflows            = lt_detail
                return               = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode          = iv_company_code
                      FinancialTransaction = iv_transaction
                      Side                 = ls_detail-flow_side
                      FlowKey              = ls_detail-flow_key
                      FlowType             = ls_detail-flow_type
                      FlowSign             = ls_detail-flow_sign
                      PaymentDate          = ls_detail-payment_date
                      PaymentAmount        = ls_detail-payment_amount
                      PaymentCur           = ls_detail-payment_cur
                      PaymentCurIso        = ls_detail-payment_cur_iso
                      LocalCurRate         = ls_detail-local_cur_rate
                      LocalCurAmount       = ls_detail-local_cur_amount
                      CurrentRate          = ls_detail-current_rate
                      FixedRate            = ls_detail-fixed_rate
                      FixedAmount          = ls_detail-fixed_amount
                      Assignment           = ls_detail-assignment
                      PostingStatus        = ls_detail-posting_status
                      CalcDate             = ls_detail-calc_date
                      NominalAmount        = ls_detail-nominal_amount ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_paydets.
    DATA lt_detail TYPE STANDARD TABLE OF bapi_ftr_paydet_detail.

    CLEAR: et_rows,
           et_return.

    " RETURN keeps the default key (L-568). Read-only BAPI, called locally.
    CALL FUNCTION 'BAPI_FTR_PAYDET_GETLIST'
      EXPORTING companycodein          = iv_company_code
                financialtransactionin = iv_transaction
      TABLES    paymentdetails         = lt_detail
                return                 = et_return.

    LOOP AT lt_detail INTO DATA(ls_detail).
      APPEND VALUE #( CompanyCode            = iv_company_code
                      FinancialTransaction   = iv_transaction
                      Direction              = ls_detail-direction
                      EffectiveDate          = ls_detail-effective_date
                      FlowType               = ls_detail-flow_type
                      PaymentCurrency        = ls_detail-payment_currency
                      PaymentCurrencyIso     = ls_detail-payment_currency_iso
                      HouseBank              = ls_detail-house_bank
                      AccountId              = ls_detail-account_id
                      PaymentActivity        = ls_detail-payment_activity
                      PaymentRequest         = ls_detail-payment_request
                      Payer                  = ls_detail-payer
                      PartnerBank            = ls_detail-partner_bank
                      PaymentMethod          = ls_detail-payment_method
                      PaymentMethodSuppl     = ls_detail-payment_method_suppl
                      DetGroupDefinition     = ls_detail-det_group_definition
                      IndividualPayment      = ls_detail-individual_payment
                      EqualDirection         = ls_detail-equal_direction
                      ConsideredPaymntMeth   = ls_detail-considered_paymnt_meth
                      PayerTransaction       = ls_detail-payer_transaction
                      AlternativePayerTrans  = ls_detail-alternative_payer_trans
                      RepetitiveCode         = ls_detail-repetitive_code
                      RepetitiveCodeText     = ls_detail-repetitive_code_text
                      ScbankInd              = ls_detail-scbank_ind
                      Supcountry             = ls_detail-supcountry
                      BankAccount            = ls_detail-bank_account
                      BankControlKey         = ls_detail-bank_control_key
                      BankAccountCurrency    = ls_detail-bank_account_currency
                      BankAccountCurrencyIso = ls_detail-bank_account_currency_iso
                      BankAccountName        = ls_detail-bank_account_name
                      BankAccount2           = ls_detail-bank_account_2
                      BankAccountGlAccount   = ls_detail-bank_account_gl_account
                      BankAccountBankref     = ls_detail-bank_account_bankref
                      BankAccountCountry     = ls_detail-bank_account_country
                      BankAccountCountryIso  = ls_detail-bank_account_country_iso
                      BankAccountBankKey     = ls_detail-bank_account_bank_key
                      SepaMandateId          = ls_detail-sepa_mandate_id ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 4: Create the BDEF and write it**

`adt-mcp abap_creation-run_validation`, then `abap_creation-create_object`, `objectType BDEF/BDO`,
`objectContent {"behaviorDefinitionType":"definition","packageName":"ZFS_SLC_APP","rootEntity":"ZFS_CE_TRMDEALPAYDETTP","name":"ZFS_CE_TRMDEALPAYDETTP","description":"PaymentDetail (any product) - CRUD API","implementationType":"Unmanaged"}`,
top-level `transportRequestNumber DS4K907209` (L-564). `transportInfo` on
`/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealpaydettp`: expect `DS4K907209`. Then `lock` → `setObjectSource` → `unLock`
on `/sap/bc/adt/bo/behaviordefinitions/zfs_ce_trmdealpaydettp/source/main`:

```abap
unmanaged implementation in class zbp_fs_trmdealpaydettp unique;
strict ( 2 );

define behavior for ZFS_CE_TrmDealPayDetTP alias DealPayDet
lock master
authorization master ( global )
{
  create;
  update;
  delete;

  field ( readonly ) PayerTransaction, AlternativePayerTrans, RepetitiveCodeText, BankAccount, BankControlKey,
                     BankAccountCurrency, BankAccountCurrencyIso, BankAccountName, BankAccount2,
                     BankAccountGlAccount, BankAccountBankref, BankAccountCountry, BankAccountCountryIso,
                     BankAccountBankKey;
  field ( mandatory : create ) CompanyCode, FinancialTransaction, Direction, EffectiveDate, FlowType, PaymentCurrency;
  field ( readonly : update ) CompanyCode, FinancialTransaction, Direction, EffectiveDate, FlowType, PaymentCurrency,
                              PaymentCurrencyIso;
}
```

- [ ] **Step 5: Create the behavior pool**

`mcp-abap-abap-adt-api createObject` `CLAS/OC` `ZBP_FS_TRMDEALPAYDETTP` in `ZFS_SLC_APP`, transport `DS4K907209`,
description "Behavior pool for ZFS_CE_TrmDealPayDetTP". `lock` the class, then write the main include
(`/sap/bc/adt/oo/classes/zbp_fs_trmdealpaydettp/source/main`):

```abap
CLASS zbp_fs_trmdealpaydettp DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zfs_ce_trmdealpaydettp.
ENDCLASS.


CLASS zbp_fs_trmdealpaydettp IMPLEMENTATION.
ENDCLASS.
```

and the implementations include (`/sap/bc/adt/oo/classes/zbp_fs_trmdealpaydettp/includes/implementations`),
then `unLock`:

```abap
CLASS lhc_trmdealpaydet DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    TYPES tt_return TYPE zcl_fs_trm_dealitem_query=>tt_return.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR DealPayDet RESULT result.

    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE DealPayDet.

    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE DealPayDet.

    METHODS delete FOR MODIFY
      IMPORTING keys FOR DELETE DealPayDet.

    METHODS read FOR READ
      IMPORTING keys FOR READ DealPayDet RESULT result.

    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK DealPayDet.

    METHODS has_error
      IMPORTING it_return       TYPE tt_return
      RETURNING VALUE(rv_error) TYPE abap_bool.

    METHODS rfc_error
      IMPORTING iv_function      TYPE csequence
                iv_text          TYPE csequence
      RETURNING VALUE(rs_return) TYPE bapiret2.

    METHODS end_luw
      IMPORTING iv_commit        TYPE abap_bool
      RETURNING VALUE(rt_return) TYPE tt_return.

    METHODS to_message
      IMPORTING is_return     TYPE bapiret2
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
ENDCLASS.


CLASS lhc_trmdealpaydet IMPLEMENTATION.
  METHOD create.
    DATA ls_value  TYPE bapi_ftr_paydet_create.
    DATA lv_direction        TYPE tb_ssign.
    DATA lv_effective_date   TYPE tb_dzverb.
    DATA lv_flow_type        TYPE sbewart.
    DATA lv_payment_currency TYPE waers.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, lv_direction, lv_effective_date, lv_flow_type, lv_payment_currency, lt_return, lv_msgtxt.

      IF ls_entity-%control-Direction = if_abap_behv=>mk-on.
        ls_value-direction = ls_entity-Direction.
      ENDIF.
      IF ls_entity-%control-PaymentCurrency = if_abap_behv=>mk-on.
        ls_value-payment_currency = ls_entity-PaymentCurrency.
      ENDIF.
      IF ls_entity-%control-PaymentCurrencyIso = if_abap_behv=>mk-on.
        ls_value-payment_currency_iso = ls_entity-PaymentCurrencyIso.
      ENDIF.
      IF ls_entity-%control-EffectiveDate = if_abap_behv=>mk-on.
        ls_value-effective_date = ls_entity-EffectiveDate.
      ENDIF.
      IF ls_entity-%control-FlowType = if_abap_behv=>mk-on.
        ls_value-flow_type = ls_entity-FlowType.
      ENDIF.
      IF ls_entity-%control-HouseBank = if_abap_behv=>mk-on.
        ls_value-house_bank = ls_entity-HouseBank.
      ENDIF.
      IF ls_entity-%control-AccountId = if_abap_behv=>mk-on.
        ls_value-account_id = ls_entity-AccountId.
      ENDIF.
      IF ls_entity-%control-PaymentActivity = if_abap_behv=>mk-on.
        ls_value-payment_activity = ls_entity-PaymentActivity.
      ENDIF.
      IF ls_entity-%control-PaymentRequest = if_abap_behv=>mk-on.
        ls_value-payment_request = ls_entity-PaymentRequest.
      ENDIF.
      IF ls_entity-%control-Payer = if_abap_behv=>mk-on.
        ls_value-payer = ls_entity-Payer.
      ENDIF.
      IF ls_entity-%control-PartnerBank = if_abap_behv=>mk-on.
        ls_value-partner_bank = ls_entity-PartnerBank.
      ENDIF.
      IF ls_entity-%control-PaymentMethod = if_abap_behv=>mk-on.
        ls_value-payment_method = ls_entity-PaymentMethod.
      ENDIF.
      IF ls_entity-%control-PaymentMethodSuppl = if_abap_behv=>mk-on.
        ls_value-payment_method_suppl = ls_entity-PaymentMethodSuppl.
      ENDIF.
      IF ls_entity-%control-DetGroupDefinition = if_abap_behv=>mk-on.
        ls_value-det_group_definition = ls_entity-DetGroupDefinition.
      ENDIF.
      IF ls_entity-%control-IndividualPayment = if_abap_behv=>mk-on.
        ls_value-individual_payment = ls_entity-IndividualPayment.
      ENDIF.
      IF ls_entity-%control-EqualDirection = if_abap_behv=>mk-on.
        ls_value-equal_direction = ls_entity-EqualDirection.
      ENDIF.
      IF ls_entity-%control-ConsideredPaymntMeth = if_abap_behv=>mk-on.
        ls_value-considered_paymnt_meth = ls_entity-ConsideredPaymntMeth.
      ENDIF.
      IF ls_entity-%control-RepetitiveCode = if_abap_behv=>mk-on.
        ls_value-repetitive_code = ls_entity-RepetitiveCode.
      ENDIF.
      IF ls_entity-%control-ScbankInd = if_abap_behv=>mk-on.
        ls_value-scbank_ind = ls_entity-ScbankInd.
      ENDIF.
      IF ls_entity-%control-Supcountry = if_abap_behv=>mk-on.
        ls_value-supcountry = ls_entity-Supcountry.
      ENDIF.
      IF ls_entity-%control-SepaMandateId = if_abap_behv=>mk-on.
        ls_value-sepa_mandate_id = ls_entity-SepaMandateId.
      ENDIF.

      " DESTINATION 'NONE': the item BAPIs use the update task (L-227); commit or roll back
      " in the same session right after the call (per-operation commit, spec section 3).
      CALL FUNCTION 'BAPI_FTR_PAYDET_CREATE'
        DESTINATION 'NONE'
        EXPORTING  companycodein          = ls_entity-CompanyCode
                   financialtransactionin = ls_entity-FinancialTransaction
                   directionin            = ls_entity-Direction
                   effectivedatein        = ls_entity-EffectiveDate
                   flowtypein             = ls_entity-FlowType
                   paymentcurrencyin      = ls_entity-PaymentCurrency
                   paymentdetail          = ls_value
        IMPORTING  direction              = lv_direction
                   effectivedate          = lv_effective_date
                   flowtype               = lv_flow_type
                   paymentcurrency        = lv_payment_currency
        TABLES     return                 = lt_return
        EXCEPTIONS system_failure         = 1 MESSAGE lv_msgtxt
                   communication_failure  = 2 MESSAGE lv_msgtxt
                   OTHERS                 = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_PAYDET_CREATE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF NOT ( has_error( lt_return ) = abap_false ).
        APPEND VALUE #( %cid        = ls_entity-%cid
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealpaydet.
      ELSE.
        APPEND VALUE #( %cid                      = ls_entity-%cid
                      %key-CompanyCode          = ls_entity-CompanyCode
                      %key-FinancialTransaction = ls_entity-FinancialTransaction
                      %key-Direction            = COND #( WHEN lv_direction IS NOT INITIAL THEN lv_direction ELSE ls_entity-Direction )
                      %key-EffectiveDate        = COND #( WHEN lv_effective_date IS NOT INITIAL THEN lv_effective_date ELSE ls_entity-EffectiveDate )
                      %key-FlowType             = COND #( WHEN lv_flow_type IS NOT INITIAL THEN lv_flow_type ELSE ls_entity-FlowType )
                      %key-PaymentCurrency      = COND #( WHEN lv_payment_currency IS NOT INITIAL THEN lv_payment_currency ELSE ls_entity-PaymentCurrency ) ) TO mapped-dealpaydet.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %cid = ls_entity-%cid
                        %msg = to_message( ls_return ) ) TO reported-dealpaydet.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD update.
    DATA ls_value  TYPE bapi_ftr_paydet_change.
    DATA ls_valuex TYPE bapi_ftr_paydet_changex.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT entities INTO DATA(ls_entity).
      CLEAR: ls_value, ls_valuex, lt_return, lv_msgtxt.

      IF ls_entity-%control-HouseBank = if_abap_behv=>mk-on.
        ls_value-house_bank = ls_entity-HouseBank.
        ls_valuex-house_bank = abap_true.
      ENDIF.
      IF ls_entity-%control-AccountId = if_abap_behv=>mk-on.
        ls_value-account_id = ls_entity-AccountId.
        ls_valuex-account_id = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentActivity = if_abap_behv=>mk-on.
        ls_value-payment_activity = ls_entity-PaymentActivity.
        ls_valuex-payment_activity = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentRequest = if_abap_behv=>mk-on.
        ls_value-payment_request = ls_entity-PaymentRequest.
        ls_valuex-payment_request = abap_true.
      ENDIF.
      IF ls_entity-%control-Payer = if_abap_behv=>mk-on.
        ls_value-payer = ls_entity-Payer.
        ls_valuex-payer = abap_true.
      ENDIF.
      IF ls_entity-%control-PartnerBank = if_abap_behv=>mk-on.
        ls_value-partner_bank = ls_entity-PartnerBank.
        ls_valuex-partner_bank = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentMethod = if_abap_behv=>mk-on.
        ls_value-payment_method = ls_entity-PaymentMethod.
        ls_valuex-payment_method = abap_true.
      ENDIF.
      IF ls_entity-%control-PaymentMethodSuppl = if_abap_behv=>mk-on.
        ls_value-payment_method_suppl = ls_entity-PaymentMethodSuppl.
        ls_valuex-payment_method_suppl = abap_true.
      ENDIF.
      IF ls_entity-%control-DetGroupDefinition = if_abap_behv=>mk-on.
        ls_value-det_group_definition = ls_entity-DetGroupDefinition.
        ls_valuex-det_group_definition = abap_true.
      ENDIF.
      IF ls_entity-%control-IndividualPayment = if_abap_behv=>mk-on.
        ls_value-individual_payment = ls_entity-IndividualPayment.
        ls_valuex-individual_payment = abap_true.
      ENDIF.
      IF ls_entity-%control-EqualDirection = if_abap_behv=>mk-on.
        ls_value-equal_direction = ls_entity-EqualDirection.
        ls_valuex-equal_direction = abap_true.
      ENDIF.
      IF ls_entity-%control-ConsideredPaymntMeth = if_abap_behv=>mk-on.
        ls_value-considered_paymnt_meth = ls_entity-ConsideredPaymntMeth.
        ls_valuex-considered_paymnt_meth = abap_true.
      ENDIF.
      IF ls_entity-%control-RepetitiveCode = if_abap_behv=>mk-on.
        ls_value-repetitive_code = ls_entity-RepetitiveCode.
        ls_valuex-repetitive_code = abap_true.
      ENDIF.
      IF ls_entity-%control-ScbankInd = if_abap_behv=>mk-on.
        ls_value-scbank_ind = ls_entity-ScbankInd.
        ls_valuex-scbank_ind = abap_true.
      ENDIF.
      IF ls_entity-%control-Supcountry = if_abap_behv=>mk-on.
        ls_value-supcountry = ls_entity-Supcountry.
        ls_valuex-supcountry = abap_true.
      ENDIF.
      IF ls_entity-%control-SepaMandateId = if_abap_behv=>mk-on.
        ls_value-sepa_mandate_id = ls_entity-SepaMandateId.
        ls_valuex-sepa_mandate_id = abap_true.
      ENDIF.

      CALL FUNCTION 'BAPI_FTR_PAYDET_CHANGE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_entity-CompanyCode
                   financialtransaction  = ls_entity-FinancialTransaction
                   direction             = ls_entity-Direction
                   effectivedate         = ls_entity-EffectiveDate
                   flowtype              = ls_entity-FlowType
                   paymentcurrency       = ls_entity-PaymentCurrency
                   paymentdetail         = ls_value
                   paymentdetailx        = ls_valuex
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_PAYDET_CHANGE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_entity-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealpaydet.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_entity-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealpaydet.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD delete.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT keys INTO DATA(ls_key).
      CLEAR: lt_return, lv_msgtxt.

      " A real delete of the item (not a deal reversal).
      CALL FUNCTION 'BAPI_FTR_PAYDET_DELETE'
        DESTINATION 'NONE'
        EXPORTING  companycode           = ls_key-CompanyCode
                   financialtransaction  = ls_key-FinancialTransaction
                   direction             = ls_key-Direction
                   effectivedate         = ls_key-EffectiveDate
                   flowtype              = ls_key-FlowType
                   paymentcurrency       = ls_key-PaymentCurrency
        TABLES     return                = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_PAYDET_DELETE'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-dealpaydet.
      ENDIF.
      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = to_message( ls_return ) ) TO reported-dealpaydet.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read.
    LOOP AT keys INTO DATA(ls_key).
      zcl_fs_trm_dealitem_query=>read_paydets( EXPORTING iv_company_code = ls_key-CompanyCode
                                                     iv_transaction  = ls_key-FinancialTransaction
                                           IMPORTING et_rows         = DATA(lt_rows)
                                                     et_return       = DATA(lt_return) ).
      READ TABLE lt_rows INTO DATA(ls_row) WITH KEY Direction = ls_key-Direction EffectiveDate = ls_key-EffectiveDate FlowType = ls_key-FlowType PaymentCurrency = ls_key-PaymentCurrency.
      IF sy-subrc <> 0 OR has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky        = ls_key-%tky
                        %fail-cause = if_abap_behv=>cause-not_found ) TO failed-dealpaydet.
        CONTINUE.
      ENDIF.
      APPEND CORRESPONDING #( ls_row ) TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_global_authorizations.
    " Instance checks are the FTR BAPIs' own; the framework only needs this answered (L-238).
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.

  METHOD lock.
    " Deliberately empty: the BAPIs enqueue the deal in the DESTINATION 'NONE' session, a
    " different lock owner; a lock taken here would collide with them.
    RETURN.
  ENDMETHOD.

  METHOD has_error.
    rv_error = xsdbool(    line_exists( it_return[ type = 'E' ] )
                        OR line_exists( it_return[ type = 'A' ] ) ).
  ENDMETHOD.

  METHOD rfc_error.
    rs_return = VALUE #( type       = 'E'
                         id         = 'ZFS_TRM_MSG'
                         number     = '020'
                         message_v1 = iv_function
                         message_v2 = iv_text ).
  ENDMETHOD.

  METHOD end_luw.
    DATA ls_return TYPE bapiret2.
    DATA lv_msgtxt TYPE c LENGTH 220.

    IF iv_commit = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        DESTINATION 'NONE'
        EXPORTING  wait                  = abap_true
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_COMMIT'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ELSEIF ls_return-type CA 'EA'.
        APPEND ls_return TO rt_return.
      ENDIF.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
        DESTINATION 'NONE'
        IMPORTING  return                = ls_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_TRANSACTION_ROLLBACK'
                          iv_text     = lv_msgtxt ) TO rt_return.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD to_message.
    ro_msg = new_message( id       = is_return-id
                          number   = is_return-number
                          severity = SWITCH #( is_return-type
                                               WHEN 'E' OR 'A' THEN if_abap_behv_message=>severity-error
                                               WHEN 'W'        THEN if_abap_behv_message=>severity-warning
                                               WHEN 'I'        THEN if_abap_behv_message=>severity-information
                                               ELSE                 if_abap_behv_message=>severity-success )
                          v1       = is_return-message_v1
                          v2       = is_return-message_v2
                          v3       = is_return-message_v3
                          v4       = is_return-message_v4 ).
  ENDMETHOD.
ENDCLASS.


CLASS lsc_trmdealpaydet DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.


CLASS lsc_trmdealpaydet IMPLEMENTATION.
  METHOD save.
    " Deliberately empty: each BAPI call was committed or rolled back in its own
    " DESTINATION 'NONE' session by the handler (L-227).
    RETURN.
  ENDMETHOD.
ENDCLASS.
```

- [ ] **Step 6: Expose it in the service definition**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/ddic/srvd/sources/zfs_sd_trmdealitem/source/main`:

```abap
@EndUserText.label: 'Deal items (any product) CRUD API'
define service ZFS_SD_TRMDEALITEM {
  expose ZFS_CE_TrmDealCondTP as Condition;
  expose ZFS_CE_TrmDealAddFlowTP as AdditionalFlow;
  expose ZFS_CE_TrmDealMainFlowTP as MainFlow;
  expose ZFS_CE_TrmDealPayDetTP as PaymentDetail;
}
```

- [ ] **Step 7: Activate everything in one call**

`mcp-abap-abap-adt-api activateObjects` with the custom entity, the query class, the BDEF, the pool and
the service definition (and the binding `/sap/bc/adt/businessservices/bindings/zfs_sb_trmdealitem_o4_api`)
in **one** array. Expected: `success: true`, no `E` messages. Then `inactiveObjects`: none of these names
may be listed (L-543). If the class reports a type error on a field, compare the element's data element
with `context/sap-bapis/json/structures.json` for that BAPI field before changing anything.

- [ ] **Step 8: Run the test and confirm it passes**

```powershell
.\scripts\trm-deal-api-tests\dealitem-crud.ps1 -EvidenceDir $ev -Set PaymentDetail -Company 1000 -Deal $deal `
  -KeyNames CompanyCode,FinancialTransaction,Direction,EffectiveDate,FlowType,PaymentCurrency `
  -CreateBody $paydetBody -PatchBody '{"PaymentMethod":"T"}' -PatchField PaymentMethod
```
Expected: every step logs its expected status (200 / refusal / 201 / 200 / 200 / 200 / 204 / 200),
`rows after` = `rows before`, exit code **0**. Confirm in the log that the POST response carries the
new key and that step 6 shows the patched value.

- [ ] **Step 9: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09 lessons/lessons-ledger.md
git commit -m "TRM deal-item API task 6: PaymentDetail create/update/delete live"
```

---

### Task 7: Phase 1 acceptance, clean-up and hand-over

**Files:** worklog + evidence; `lessons/lessons-ledger.md`; `docs/superpowers/specs/2026-09-25-1410-trm-deal-apis-design.md` (§10 outcomes).

- [ ] **Step 1: ATC on everything built or changed**

`adt-mcp abap_atc_run` with `ZCL_FS_TRM_DEALITEM_QUERY`, the four pools, the four BDEFs, `ZCL_FS_TRM_IRATE_QUERY`,
`ZBP_FS_TRMIRATETP`. Expected: no priority 1/2 findings; fix any before continuing.

- [ ] **Step 2: Full re-run**

Run the four `dealitem-crud.ps1` commands from Tasks 3–6 once more, back to back, against `$deal`
(new evidence file names: add `-EvidenceDir "$ev\rerun"`). Expected: exit 0 for each (or the documented
main-flow outcome (b)).

- [ ] **Step 3: Two-sided deal check (Review Focus 3)**

```powershell
$irate = 'zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001'
Invoke-Trm $svc 'side-check' GET "Condition?`$filter=CompanyCode eq '1000' and FinancialTransaction eq '<a deal with two sides, if any>'" $null "$ev\task7-log.txt"
```
Find a candidate first with `runQuery "SELECT bukrs, rfha FROM vtbfha WHERE bukrs = '1000' AND sanlf = '550' AND sgsart LIKE '26%'"` (26A/26B are swap-like
product types on this system). Record whether rows with `Side` 1 and 2 come back. If only side 0 appears,
record it as a limitation in the ledger (do not change code in this phase).

- [ ] **Step 4: Reverse the test deal**

```powershell
Invoke-Trm $irate 'reverse-test-deal' DELETE "InterestRateInstrument(CompanyCode='1000',FinancialTransaction='$deal')" $null "$ev\task7-log.txt"
Invoke-Trm $irate 'check-test-deal' GET "InterestRateInstrument(CompanyCode='1000',FinancialTransaction='$deal')" $null "$ev\task7-log.txt"
```
Expected: 204, then `ActiveStatus` **3**. If it is not 3 (latest activity was something else, L-571), repeat the DELETE.

- [ ] **Step 5: Record outcomes**

In the worklog: object list with transport per object, delivery checks, the `ReferenceConditionKey` finding,
the main-flow outcome, the side finding. In the spec §10: mark risks 2 and 3 resolved with the outcome. A
ledger entry for each finding that was not already recorded.

- [ ] **Step 6: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09 lessons/lessons-ledger.md docs/superpowers/specs/2026-09-25-1410-trm-deal-apis-design.md
git commit -m "TRM deal-item API phase 1: acceptance, test deal reversed, outcomes recorded"
```

- [ ] **Step 7: Hand over** — tell the human the service path, the four entity sets, the outcomes of spec
risks 2 and 3, and that plans 2 (FX), 3 (FX option) and 4 (LC) come next.
