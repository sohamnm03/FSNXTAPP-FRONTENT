# Test case — FTR term-loan lifecycle executed through Dynamic Gateway **v2**

**Purpose.** Confirm that the full treasury lifecycle previously driven through gateway **v1**
(`worklog/DS4_100_NIIF/2026-09/2026-09-11-1241-ftr-deal-lifecycle-via-odata.md`) can be performed end to end
through **v2** (`ZFS_SB_DYNGW_O4_API`), across all step kinds the lifecycle needs.

| | |
|---|---|
| **System** | `DS4`, client `100` (`DS4_100_NIIF`) |
| **Executed by** | `FS_DEV3` |
| **Date** | 2026-09-13 |
| **Service** | `ZFS_SB_DYNGW_O4_API` (v2) |
| **Driven from** | PowerShell (`Invoke-WebRequest`), not `/IWFND/GW_CLIENT` |
| **Raw transcript** | `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2/raw-calls.log` — every request and response verbatim |

## Result

**All five lifecycle steps completed through v2.** Same business outcome as the v1 run, on a new deal.

| # | Step | Kind | v1 result | **v2 result** | Verdict |
|---|---|---|---|---|---|
| 1 | Create term loan — `BAPI_FTR_IRATE_DEALCREATE` | `FUNC` | deal 0000000160440 | **deal 0000000160455** | PASS |
| 2 | Settle — `BAPI_FTR_IRATE_SETTLE` | `FUNC` | activity 00002 | **activity 00002, status 20** | PASS |
| 3 | TBB1 post — `RFTBBB00` | `SUBM`/JOB | FI doc 0600000270 | **FI doc 0600000273** | PASS |
| 4a | TPM44 accrual — `RTPM_ACCRUAL_DEFERRAL` | `SUBM`/JOB | 0600000271 + 0600000272, 849.32 | **0600000274 + 0600000275, 849.32** | PASS |
| 4b | TPM1 valuation — `RTPM_TRL_VALUATION` | `SUBM`/JOB | no write-ups/downs | **no write-ups or write-downs** | PASS |
| 5 | Fee row — `ZSGSLCTR_FEEDATA` | `TABL` | 1 row | **1 row (`ZOTTK_NO 999998`)** | PASS |

The accrual is independently checkable: 100,000 × 10% × 31/365 = **849.32 INR**, 31 days of January
on act/365 — the same figure v1 produced, from a separately created deal.

---

## 1 · Endpoint and conventions

```
Base URL
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001

Action namespace
com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001

Every action is POSTed to the CallLog entity set:
POST <base>/CallLog/<namespace>.<Action>?sap-client=100
     X-CSRF-Token: <token from GET $metadata with X-CSRF-Token: Fetch>
     Content-Type: application/json
```

`sap-client=100` on **every** URL (L-253/L-325). A refusal is **HTTP 200** with `ExecStatus 'E'`,
not an HTTP error.

### JSON nesting — the trap that cost this run its first attempt

A batch step nests **three** levels: the HTTP body → `StepsJson` (a string holding an array) →
each step's `ImportJson`/`TablesJson`/`FilterJson` (strings holding objects/arrays). The rule
(L-335) is **build the innermost text plain, then escape exactly once per level you ascend.**
Hand-escaping the inner JSON *and* then escaping again produced:

```json
{"ExecStatus":"E","ErrorCategory":"CLIENT","MessageNo":"22",
 "MessageText":"Invalid JSON in parameter StepsJson"}
```

Message **022** cannot tell you which level broke — it reports only that the outermost parse failed.

---

## 2 · Registration (`RegisterTarget`)

The allow-list is `deliveryClass #A` application data and does **not** travel with a transport, so
every target must be registered on each system. Six targets, one call each:

```json
POST <base>/CallLog/<ns>.RegisterTarget?sap-client=100

{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"UPSERT",
 "ImportJson":"{\"TargetKind\":\"FUNC\",\"IsActive\":true,\"AllowRead\":true,
   \"AllowWrite\":true,\"CallMode\":\"L\",\"MaxRows\":0,\"LogLevel\":\"A\",
   \"Descr\":\"FTR term loan create - v2 lifecycle test\"}","RequestId":""}
```

| Target | Kind | `CallMode` | `AllowWrite` |
|---|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | `FUNC` | **`L`** | true |
| `BAPI_FTR_IRATE_SETTLE` | `FUNC` | **`L`** | true |
| `RFTBBB00` | `SUBM` | — | true |
| `RTPM_ACCRUAL_DEFERRAL` | `SUBM` | — | true |
| `RTPM_TRL_VALUATION` | `SUBM` | — | true |
| `ZSGSLCTR_FEEDATA` | `TABL` | — | true |

All six answered `ExecStatus 'S'`.

**`CallMode 'L'` on the two BAPIs is load-bearing, not cosmetic.** Left blank, a remote-enabled
BAPI resolves to `'R'` via `TFDIR-FMODE`, which means `CALL FUNCTION ... DESTINATION 'NONE'` — a
separate session with its own LUW that commits itself. A creating BAPI there would persist
regardless of `CommitMode`, so `TESTRUN='X'` + `CommitMode NEVER` would stop being a guarantee.
`'L'` keeps the call inside the execution session's LUW, where the framework's own COMMIT/ROLLBACK
actually governs it.

**All three `SUBM` reports passed v2's registration qualifier (message 043).** v2 refuses a `SUBM`
target that has no `TRDIR` entry, is not `SUBC '1'`, or references a `CL_GUI_*` control. None of the
three treasury reports is GUI-dependent by that check, confirmed by running v2's own query
(`WBCROSSGT` joined to `D010INC`, per L-409) before attempting registration.

---

## 3 · Step 1 — create the deal (`FUNC`, deep structures)

**Test run first** (`TESTRUN:"X"`, `CommitMode NEVER`), then real — the same discipline the v1 run used.

```json
POST <base>/CallLog/<ns>.ExecuteBatch?sap-client=100

{"CommitMode":"AUTO",
 "StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",
   \"Operation\":\"\",\"ImportJson\":\"{ ...GENERALCONTRACTDATA / GENERALCONTRACTDATAX /
   INTERESTRATEINSTRUMENT / INTERESTRATEINSTRUMENTX / TESTRUN... }\",
   \"TablesJson\":\"{\\\"CONDITION\\\":[],...,\\\"RETURN\\\":[]}\",
   \"FieldsJson\":\"\",\"FilterJson\":\"\",\"OrderByJson\":\"\",
   \"MaxRows\":0,\"SkipRows\":0}]","RequestId":""}
```

Business payload (inner `ImportJson`, shown unescaped) — copied verbatim from the v1 run:

```json
{"GENERALCONTRACTDATA":{"COMPANY_CODE":"1000","PRODUCT_TYPE":"22A","TRANSACTION_TYPE":"100",
  "PARTNER":"0700000453","CONTRACT_DATE":"2026-01-01","VALUATION_CLASS":"0001"},
 "GENERALCONTRACTDATAX":{"COMPANY_CODE":"X","PRODUCT_TYPE":"X","TRANSACTION_TYPE":"X",
  "PARTNER":"X","CONTRACT_DATE":"X","VALUATION_CLASS":"X"},
 "INTERESTRATEINSTRUMENT":{"CURRENCY":"INR","START_TERM":"2026-01-01","END_TERM":"2026-12-31",
  "NOMINAL_AMOUNT":100000,"INTEREST_RATE_STRUCTURE":"1","INTEREST_CONDITION_TYPE":"1200",
  "INTEREST_RATE":10,"INTEREST_CALC_METH":"3","FREQUENCY_CATEGORY":"3","FREQUENCY":1,
  "FREQUENCY_UNIT":"2","INTEREST_CALENDAR_ID":"01","EFFECTIVE_FROM":"2026-01-01",
  "REPAY_STRUCTURE":"1","REPAY_CONDITION_TYPE":"1120"},
 "INTERESTRATEINSTRUMENTX":{...all "X"...},
 "TESTRUN":""}
```

**Dry-run response** — `ExecStatus 'S'`, `FINANCIALTRANSACTION: "\\INTERN\\"` (the test-run
placeholder), `RETURN` carrying *"BAPI was executed successfully"*.

**Real response:**

```json
"exportjson":"{\"COMPANYCODE\":\"1000\",\"FINANCIALTRANSACTION\":\"0000000160455\"}"
"tablesjson":"{...,\"RETURN\":[
   {\"TYPE\":\"W\",\"ID\":\"FTR_GUI\",\"NUMBER\":220,
    \"MESSAGE\":\"Partner 700000453 cannot be used, as per contract 01.01.2026\"},
   {\"TYPE\":\"I\",\"ID\":\"FTR0\",\"NUMBER\":162,
    \"MESSAGE\":\"BAPI was executed successfully\"}]}"
```

The `W` message appears in the v1 run too and is not fatal.

**Business verification** (`VTBFHA`, read over ADT — an independent channel, not the gateway):

| RFHA | BUKRS | SFHAART | SGSART | RANTYP |
|---|---|---|---|---|
| 0000000160455 | 1000 | 100 | 22A | 5 |

This step also demonstrates two contract properties: **deeply nested structures** round-trip, and an
**output-only `TABLES` parameter comes back** because it was sent as `[]` (L-314).

---

## 4 · Step 2 — settle (`FUNC`)

```json
ImportJson: {"COMPANYCODE":"1000","FINANCIALTRANSACTION":"0000000160455","TESTRUN":""}
TablesJson: {"RETURN":[]}
```

Response: `ExecStatus 'S'`,
`exportjson {"RETURNFINANCIALTRANSACTION":"0000000160455","RETURNCOMPANYCODE":"1000"}`.

**Business verification** (`VTBFHAZU`): two activity rows —

| RFHA | RFHAZU | SFGZUSTT | SFUNKTV |
|---|---|---|---|
| 0000000160455 | 1 | 10 | 0001 |
| 0000000160455 | **2** | **20** | 0002 |

Activity `00002`, status category `20` — identical to the v1 outcome.

---

## 5 · Step 3 — TBB1 posting (`SUBM`, capture mode `JOB`)

`Operation` carries the capture mode. **`JOB` is supported by v2** — the handler accepts
`SALV / LIST / MEMO / NONE / JOB`.

```json
{"Kind":"SUBM","TargetName":"RFTBBB00","Operation":"JOB",
 "FilterJson":"[
   {\"field\":\"S_BUKRS\",\"kind\":\"S\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"1000\",\"high\":\"\"},
   {\"field\":\"S_RFHA\",\"kind\":\"S\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"0000000160455\",\"high\":\"\"},
   {\"field\":\"P_DZTERM\",\"kind\":\"P\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"20260101\",\"high\":\"\"},
   {\"field\":\"P_BUDAT\",\"kind\":\"P\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"20260101\",\"high\":\"\"},
   {\"field\":\"P_BLDAT\",\"kind\":\"P\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"20260101\",\"high\":\"\"},
   {\"field\":\"P_TEST\",\"kind\":\"P\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"\",\"high\":\"\"}]",
 ...}
```

`FilterJson` for a `SUBM` step is a list of **selection-screen values** (one `RSPARAMS` row each),
not a WHERE clause. Dates go in **internal format `YYYYMMDD`** — these values reach the report
through `SUBMIT ... WITH SELECTION-TABLE`, which expects internal, not display, format.

**Test run response** (spool captured back through the gateway, `resultcount 10`):

```
|Records passed |        1|
|Type|CoCd|Trans.|Message text           |PTyp|Name              |TTyp|...
|    |1000|160455|Test run was successful|22A |TL - Disbursements|100 |Disbursement-Term Loan Plan|
```

**Real run:** *"Transactions were updated successfully"*.

**Business verification** (`BKPF`):

| BUKRS | BELNR | GJAHR | BLART | BUDAT | TCODE | AWTYP | AWKEY |
|---|---|---|---|---|---|---|---|
| 1000 | **0600000273** | 2026 | T1 | 01.01.2026 | TBB1 | TR-TM | 0000001198R12026 |

---

## 6 · Step 4a — TPM44 accrual (`SUBM`, `JOB`)

```
P_DEA    = X          (OTC product group - see the warning below)
SO_BUKRS = 1000
SO_OTCNR = 0000000160455
P_KEYDAT = 20260131   P_FIDATE = 20260131   P_DOCDAT = 20260131
P_RDATE  = 20260201   P_RFIDAT = 20260201
P_TEST   = X (test) / '' (real)
```

**Test-run posting log**, returned through the gateway (`resultcount 25`):

```
|Records passed Header  |        2|
|Records passed Position|        4|
|  160455  1000 001 Accrual/deferral        31.01.2026   IndAS
|40 106070  Int Receivable - TL    Loan: Accruals: Revenue          849.32  INR
|50 301170  Interest Income - TL   Loan: Accruals: Revenue          849.32- INR
|  160455  1000 001 Accrual/deferral reset  01.02.2026   IndAS
|40 301170  Interest Income - TL   Loan: Reset Accruals: Revenue    849.32  INR
|50 106070  Int Receivable - TL    Loan: Reset Accruals: Revenue    849.32- INR
```

Real run produced reference keys `0000001199R12026` and `0000001200R12026`.

**Business verification** (`BKPF`):

| BELNR | BUDAT | TCODE | AWKEY |
|---|---|---|---|
| **0600000274** | 31.01.2026 | TPM44 | 0000001199R12026 |
| **0600000275** | 01.02.2026 | TPM44 | 0000001200R12026 |

---

## 7 · Step 4b — TPM1 valuation (`SUBM`, `JOB`)

`RTPM_TRL_VALUATION` uses **bare** parameter names — `KEYDATE`, `VALCAT`, `X_SIMULA` — not `P_*`.

```
P_DEA = X   SO_BUKRS = 1000   SO_OTCNR = 0000000160455
KEYDATE = 20260131   VALCAT = 2   P_FIDAT = 20260131   P_DOC = 20260131
X_SIMULA = '' (real run; the flag DEFAULTS to 'X')
```

Response, `ExecStatus 'S'`:

```
|Records passed |        1|
|    |1000|001|      1|22A |160455 |The valuation of the position resulted in no write-ups or write-downs|
```

**No document is the correct answer** for a fixed-rate loan at amortised cost — its economics
surface as the TPM44 accrual. Same outcome as v1.

---

## 8 · Step 5 — fee row (`TABL` INSERT)

```json
{"Kind":"TABL","TargetName":"ZSGSLCTR_FEEDATA","Operation":"INSERT",
 "ImportJson":"[{\"CLIENT\":\"100\",\"ZTYPE\":\"02\",\"ZFEE_TYPE\":\"F01\",
   \"ZOTTK_NO\":\"999998\",\"ZDTTK_NO\":\"160455\",\"ZSGSART\":\"22A\",
   \"ZCAT\":\"02\",\"ZCODE\":\"01\",\"ZB_AMT\":100000,\"ZRATE\":10,\"ZDAY\":\"31\",
   \"ZAMT\":849.32,\"ZF_AMT\":849.32,\"ZCREATED_BY\":\"FS_DEV3\",
   \"ZCREATED_DATE\":\"2026-09-13\"}]"}
```

Response: `ExecStatus 'S'`, `resultcount 1`. Verified by `SELECT`:

| ZOTTK_NO | ZDTTK_NO | ZFEE_TYPE | ZSGSART | ZB_AMT | ZAMT | ZF_AMT | ZCREATED_BY |
|---|---|---|---|---|---|---|---|
| 999998 | 160455 | F01 | 22A | 100000 | 849.32 | 849.32 | FS_DEV3 |

---

## 9 · v2 framework tables — the logging proof, per activity

Every activity above wrote to the framework's own tables. This is v2's audit trail and it was
verified by direct `SELECT`, not inferred from responses.

### `ZFS_T_DYN_REG` — the allow-list (six rows added)

`QURY/T000`, `QURY/T005`, `FUNC/RFC_SYSTEM_INFO` (pre-existing), plus the six registered here.
`TABL/ZFS_T_TRM_PROBE` and `FUNC/NUMBER_GET_NEXT` remain from the L-350 proof, deactivated.

### `ZFS_T_DYN_REGH` — registration change history

Every `RegisterTarget` writes a history row with `change_type`, `source 'REGI'`, the call UUID and
a before/after image. *(Query not re-run at the end of this session — the ADT session reached its
query ceiling, L-384. The rows are written by the same code path proved in Task 18.)*

### `ZFS_T_DYN_CALL` — call log header, one row per action

| ACTION | EXEC_STATUS | COMMIT_MODE | STEP_COUNT | EXECUTED_BY | EXECUTED_AT |
|---|---|---|---|---|---|
| ExecuteBatch | S | AUTO | 1 | FS_DEV3 | 20260913071746 |
| ExecuteBatch | S | NEVER | 1 | FS_DEV3 | 20260913071607 |
| ExecuteBatch | **E** | NEVER | 0 | FS_DEV3 | 20260913071511 |
| RegisterTarget | S | | 1 | FS_DEV3 | 20260913071511 |
| RegisterTarget | S | | 1 | FS_DEV3 | 20260913071511 |
| RegisterTarget | S | | 1 | FS_DEV3 | 20260913071511 |

The `E` row is the 022 JSON-nesting failure — **refusals are logged too**, which is what makes the
log an audit trail rather than a success journal.

### `ZFS_T_DYN_STEP` — one row per step, including failures

| # | KIND | TARGET | OP | STATUS | SEV | MSG | ROWS |
|---|---|---|---|---|---|---|---|
| 1 | TABL | ZSGSLCTR_FEEDATA | INSERT | S | S | 000 | 1 |
| 1 | SUBM | RTPM_TRL_VALUATION | JOB | S | S | 026 | 10 |
| 1 | SUBM | RTPM_ACCRUAL_DEFERRAL | JOB | S | S | 026 | 25 |
| 1 | SUBM | RTPM_ACCRUAL_DEFERRAL | JOB | S | S | 026 | 25 |
| 1 | SUBM | RFTBBB00 | JOB | S | S | 026 | 10 |
| 1 | SUBM | RFTBBB00 | JOB | S | S | 026 | 10 |
| 1 | SUBM | RFTBBB00 | JOB | **E** | E | **020** | 0 |
| 1 | FUNC | BAPI_FTR_IRATE_SETTLE | | S | S | 000 | 0 |
| 1 | FUNC | BAPI_FTR_IRATE_DEALCREATE | | S | S | 000 | 0 |
| 1 | FUNC | BAPI_FTR_IRATE_DEALCREATE | | S | S | 000 | 0 |

Each `SUBM` pair is test run then real run; the `E` row is the timed-out unfiltered first attempt
(section 11). Every step carries `reg_uuid`, tying the execution back to the allow-list row that
permitted it.

---

## 10 · What this test case proves about v2

| Capability | Status |
|---|---|
| `FUNC` with deeply nested BAPI structures | **proved** |
| `FUNC` output-only `TABLES` round-trip (`RETURN`) | **proved** |
| `FUNC` in local mode (`CALL_MODE 'L'`), creating + committing | **proved** |
| `SUBM` in `JOB` capture mode, spool returned to the caller | **proved**, all three reports |
| `SUBM` selection-screen binding (`PARAMETERS` + `SELECT-OPTIONS`) | **proved** |
| `TABL` INSERT | **proved** |
| `RegisterTarget` incl. `SUBM` qualification (043) | **proved** |
| Call/step logging incl. failures | **proved** |
| `ExecuteBatch` + `CommitMode` driving a creating BAPI | **proved** |

**Still not proved by this test case:** `FUNC` in **remote** mode (`CALL_MODE 'R'`) — deliberately
avoided here, because a remote BAPI commits its own LUW and would defeat the test-run-first
discipline. A multi-step batch mixing several business steps in one call was also not exercised;
every call above carried a single step.

---

## 11 · Findings from this run

### F-1 · L-361 recurs in v2, and it cost a runaway job

The first TBB1 attempt sent `P_BUKRS`, `SO_GSART`, `SO_RFHA`, `P_BISDAT` — **none of which exist on
`RFTBBB00`**. v2 dropped all of them silently. The report ran with **no company code, no deal, no
product filter**, `P_DZTERM` defaulted to today, and the job was still running at the 400 s budget:

```json
{"status":"E","msgno":20,
 "msgtext":"Dynamic call of RFTBBB00 failed: job ZFSDYN_RFTBBB00/12484700 still 'R' after 400s"}
```

`BKPF` confirmed nothing had posted; the human cancelled the job in SM37. **A wrong `SELNAME` is
dropped, not refused — its only symptom is scope.** The correct names, read from `RFTBBB00_SEL`:

| Wrong | Correct | |
|---|---|---|
| `P_BUKRS` | `S_BUKRS` | SELECT-OPTION, not PARAMETER |
| `SO_RFHA` | `S_RFHA` | |
| `SO_GSART` | `S_SGSART` | |
| `P_BISDAT` | `P_DZTERM` | due date, `OBLIGATORY`, defaults to `sy-datum` |
| `P_BUDAT` | `P_BUDAT` | correct, but in the posting block |

**Recommendation:** v2 should refuse an unknown `SELNAME` rather than drop it. Until then, read the
report's selection include before registering it, and always test-run first.

### F-2 · Batch mode rewrites `P_DZTERM` on `RFTBBB00`

```abap
IF sy-batch = abap_true AND cl_ftr_cloud_check=>is_treasury_active( ) = abap_true.
  lv_interval = p_duedat.  p_dzterm = lv_interval + sy-datum.
```

In `JOB` capture the report runs in batch, so where the treasury cloud switch is active the absolute
`P_DZTERM` is **overwritten by `P_DUEDAT` as a day offset**. It did not bite on `DS4` (the switch is
off — the posting landed on 01.01.2026 as sent), but it would on a system where it is on.

### F-3 · Test flags default to ON, which is the safe direction

`RFTBBB00 P_TEST` and `RTPM_TRL_VALUATION X_SIMULA` both default to `'X'`, and
`RTPM_ACCRUAL_DEFERRAL P_TEST` is a checkbox defaulting to `'X'`. **A real posting must clear the
flag explicitly**; an omitted flag is a dry run, not an accidental posting.

### F-4 · `P_DEA` gates the whole TPM selection

Both TPM reports select nothing at all unless the OTC product-group checkbox `P_DEA` is `'X'`,
however precise `SO_OTCNR` is — a filter that looks correct and returns an empty run.

### F-5 · Documentation defect (fixed separately)

`docs/dyngw-v2-api.md` states the capture modes are `SALV/LIST/MEMO/NONE`. The handler accepts
**`SALV/LIST/MEMO/NONE/JOB`**, and `JOB` is the mode this entire lifecycle depends on.

---

## 12 · Evidence

- **Full request/response transcript:** `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2/raw-calls.log`
  — every call in this document, verbatim, with URL, headers, request JSON and raw response.
- **Business verification** was read over **ADT SQL**, a channel independent of the gateway, so no
  verdict here rests on the component under test.
- **GUI confirmation:** `FB03` was opened on document `0600000274` / company code `1000` / year
  `2026` and reached *"Display Document: Data Entry View"*, confirming the document exists
  interactively as well as in `BKPF`.
- **Screenshots were NOT captured.** `sap_screenshot` returns a blank image in this environment —
  the SAP GUI window is not being rendered to a visible desktop session. This is a tooling
  limitation, not a missing result; every figure above is evidenced by the raw transcript and by
  independent database reads. To capture screenshots, the SAP GUI window must be open and visible
  (not minimised, not on a disconnected RDP session) when the run is executed.

## 13 · Left on the system

**Business data created:** deal `0000000160455` and its settlement; FI documents `0600000273`,
`0600000274`, `0600000275`; one row in `ZSGSLCTR_FEEDATA` (`ZOTTK_NO 999998`).

**Background jobs:** `ZFSDYN_RFTBBB00` (×3, one cancelled), `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` (×2),
`ZFSDYN_RTPM_TRL_VALUATION`.

> **OPEN RISK — the same one the v1 run recorded.** Six targets are registered `IS_ACTIVE` with
> `ALLOW_WRITE`, which means **any caller holding `ZFS_DYNGW` execute rights can now create and
> settle FTR deals and post treasury flows through v2**. Deactivate these rows when testing is
> finished; `RegisterTarget` with `Operation UPDATE` and `{"IsActive":false}` does it, and an
> UPDATE touches only the columns you send.
