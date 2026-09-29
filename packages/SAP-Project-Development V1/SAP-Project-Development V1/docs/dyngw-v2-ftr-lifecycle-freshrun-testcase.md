# Test case — FTR term-loan lifecycle through Dynamic Gateway v2, executed on a FRESH system

**What makes this run different.** The five gateway tables were emptied by the system owner before
this run, so the gateway started with **no allow-list, no history and no logs** — a freshly imported
system. Every step below is followed by a snapshot of all four framework tables, so the audit trail
is shown *accumulating*, row by row, rather than asserted after the fact.

| | |
|---|---|
| **System** | `DS4`, client `100` (`DS4_100_NIIF`) |
| **Executed by** | `FS_DEV3` |
| **Date** | 2026-09-13 |
| **Service** | `ZFS_SB_DYNGW_O4_API` (v2) |
| **Deal created** | **0000000160456** |
| **Raw transcript** | `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/raw-calls.log` |
| **Snapshots** | `…/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/snapshots/` — 40 JSON files, 4 tables × 10 snapshots |

## Result — 15 calls, 15 steps, zero failures

| # | Step | Kind | Result |
|---|---|---|---|
| 0 | Baseline | — | all four tables **0 rows** — the fresh-system premise, evidenced |
| 1 | Register six targets | REGI | 6 registered, `ExecStatus S` |
| 2a | `BAPI_FTR_IRATE_DEALCREATE` dry run | FUNC | `TESTRUN X` + `CommitMode NEVER` — nothing created |
| 2b | `BAPI_FTR_IRATE_DEALCREATE` real | FUNC | deal **0000000160456** |
| 3 | `BAPI_FTR_IRATE_SETTLE` | FUNC | settled |
| 4a/4b | `RFTBBB00` (TBB1) test + real | SUBM/JOB | FI doc **0600000276** |
| 5a/5b | `RTPM_ACCRUAL_DEFERRAL` (TPM44) test + real | SUBM/JOB | FI docs **0600000277** + **0600000278**, accrual **849.32 INR** |
| 6 | `RTPM_TRL_VALUATION` (TPM1) | SUBM/JOB | no write-ups or write-downs — correct |
| 7 | `ZSGSLCTR_FEEDATA` | TABL | 1 row (`ZOTTK_NO 999997`) |

Accrual verified independently: 100,000 × 10% × 31/365 = **849.32 INR**.

---

## 1 · Endpoint — the full URLs used

**Base URL**

```
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001
```

**CSRF token and metadata**

```
GET  https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001/$metadata?sap-client=100
     X-CSRF-Token: Fetch
→ 200, response header X-CSRF-Token carries the token; the session cookie must be kept
```

**The two action endpoints used**

```
POST .../zfs_sd_dyngw/0001/CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.RegisterTarget?sap-client=100
POST .../zfs_sd_dyngw/0001/CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.ExecuteBatch?sap-client=100
     X-CSRF-Token: <token>
     Content-Type: application/json
     Accept: application/json
```

**The four read endpoints — the framework tables' own OData surface**

```
GET .../zfs_sd_dyngw/0001/Registry?sap-client=100          → ZFS_T_DYN_REG
GET .../zfs_sd_dyngw/0001/RegistryHistory?sap-client=100   → ZFS_T_DYN_REGH
GET .../zfs_sd_dyngw/0001/CallLog?sap-client=100           → ZFS_T_DYN_CALL
GET .../zfs_sd_dyngw/0001/CallStep?sap-client=100          → ZFS_T_DYN_STEP
```

Every snapshot in this document was taken through these four GETs — the **product's own read
surface**, not a database back door. `sap-client=100` on every URL (L-253/L-325). A refusal is
**HTTP 200 with `ExecStatus 'E'`**, never an HTTP error code.

### JSON nesting — three levels inside a batch

The HTTP body → `StepsJson` (a **string** holding an array) → each step's
`ImportJson`/`TablesJson`/`FilterJson` (**strings** holding objects/arrays). Build the innermost
text plain and escape exactly **once per level you ascend** (L-335). Hand-escaping and then
escaping again produces `MessageNo 022, "Invalid JSON in parameter StepsJson"`, which cannot tell
you which level broke.

---

## 2 · Step 0 — the fresh-system baseline

```
GET .../Registry?sap-client=100          → {"value":[]}   0 rows
GET .../RegistryHistory?sap-client=100   → {"value":[]}   0 rows
GET .../CallLog?sap-client=100           → {"value":[]}   0 rows
GET .../CallStep?sap-client=100          → {"value":[]}   0 rows
```

`ZFS_T_TRM_PROBE` was emptied in the same pass.

**Why this matters.** The allow-list is `deliveryClass #A` application data and does **not** travel
with a transport. An imported system therefore looks exactly like this, and answers `017`
("target not registered") to every call until targets are registered on it. Step 1 is not test
setup — it is what provisioning a new system actually involves.

> The framework **refuses to delete its own tables** (`ZFS_T_DYN_*` → message **039/AUTH**), which
> is the self-protection that closes v1's privilege-escalation hole. Emptying them is therefore a
> human action by design, and was performed by the system owner.

---

## 3 · Step 1 — register the six targets

**Request** (one per target; `BAPI_FTR_IRATE_DEALCREATE` shown in full):

```
POST .../CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.RegisterTarget?sap-client=100
```
```json
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"INSERT",
 "ImportJson":"{\"TargetKind\":\"FUNC\",\"IsActive\":true,\"AllowRead\":true,\"AllowWrite\":true,\"CallMode\":\"L\",\"MaxRows\":0,\"LogLevel\":\"A\",\"Descr\":\"FTR term loan create\"}",
 "RequestId":""}
```

**Response** — `{"ExecStatus":"S","ResultCount":1, …}`.

**The six targets**

| Target | Kind | CallMode | Why this kind |
|---|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | FUNC | **L** | creates the deal |
| `BAPI_FTR_IRATE_SETTLE` | FUNC | **L** | settles it |
| `RFTBBB00` | SUBM | — | TBB1 posting run |
| `RTPM_ACCRUAL_DEFERRAL` | SUBM | — | TPM44 month-end accrual |
| `RTPM_TRL_VALUATION` | SUBM | — | TPM1 valuation |
| `ZSGSLCTR_FEEDATA` | TABL | — | the fee row |

**`CallMode 'L'` is load-bearing.** Left blank, a remote-enabled BAPI resolves to `'R'` through
`TFDIR-FMODE`, which means `CALL FUNCTION … DESTINATION 'NONE'` — a separate session with its own
LUW that commits itself. A creating BAPI there persists regardless of `CommitMode`, so
`TESTRUN='X'` + `CommitMode NEVER` would stop being a guarantee. `'L'` keeps the call inside the
execution session's LUW, where the framework's COMMIT/ROLLBACK actually governs it.

### Snapshot after the FIRST registration — one row in each table

This is the clearest view of the audit trail, because exactly one thing has happened.

| Table | Rows |
|---|---|
| `Registry` | **1** |
| `RegistryHistory` | **1** |
| `CallLog` | **1** |
| `CallStep` | **1** |

### Snapshot after all six

| Table | Rows |
|---|---|
| `Registry` | **6** |
| `RegistryHistory` | **6** |
| `CallLog` | **6** |
| `CallStep` | **6** |

One registration produces exactly one row in each of the four tables — no fan-out, no gaps.

---

## 4 · FIELD-BY-FIELD: what every column holds and why

This section answers "why is this data here" column by column, using the **actual rows** this run
produced.

### 4.1 `ZFS_T_DYN_REG` — the allow-list

The security boundary. Nothing runs unless a row here permits it.

| Column | Value after step 1 | What it is and why it holds that |
|---|---|---|
| `CLIENT` | `100` | Client. Standard `MANDT` key — the allow-list is client-specific. |
| `REG_UUID` | `5254001f-…-5b3945d32000` | **Primary key**, generated by the REGI handler at INSERT. Every step that later uses this target stamps this UUID onto its `CallStep` row, which is how an execution is tied back to the permission that allowed it. |
| `TARGET_KIND` | `FUNC` | One of `FUNC`/`TABL`/`QURY`/`SUBM`. With `TARGET_NAME` it forms the identity — the same name may exist under two kinds. `REGI` is rejected here: it is a step kind, not a registrable kind. |
| `TARGET_NAME` | `BAPI_FTR_IRATE_DEALCREATE` | The FM, table, view or report. CHAR30. |
| `OPERATION` | *(blank)* | Optional **operation pin**. Blank = any operation. Set to e.g. `INSERT` it restricts the target to that operation, enforced by the dispatcher for FUNC/QURY/SUBM and internally by the TABL handler. Left blank here so the same row serves the dry run and the real call. |
| `IS_ACTIVE` | `X` | Kill switch. Blank and "no row at all" deliberately produce the **same** `017` refusal — a distinct message would tell an unauthorised caller that the target exists. |
| `ALLOW_READ` | `X` | Permits read operations. |
| `ALLOW_WRITE` | `X` | Permits write operations. **Required for every `FUNC` call** even a read-only FM, because `FUNC~NEEDS_WRITE` is unconditionally true (L-491). It fails closed — it demands more privilege, never less. |
| `CALL_MODE` | `L` | `L` local / `R` remote / blank = fall back to `TFDIR-FMODE`. See above — this single character decides whether the call shares the caller's LUW. |
| `MAX_ROWS` | `0` | Per-target row ceiling. **`0` means "no override from this target"**, never "unlimited" — a trap worth stating explicitly. |
| `LOG_LEVEL` | `A` | How much of the call is logged. `A` = all. This column lives **here**, not on the call log (L-484). |
| `DESCR` | `FTR term loan create` | Free text for operators. |
| `LOCAL_CREATED_BY` / `_AT` | `FS_DEV3` / `09:15:08.189676` | Audit: who first created the row, when. |
| `LOCAL_LAST_CHANGED_BY` / `_AT` | `FS_DEV3` / same | Audit: last change. Equal to created on an INSERT. |
| `LAST_CHANGED_AT` | same | ETag field — the RAP total-etag used for optimistic locking. |

### 4.2 `ZFS_T_DYN_REGH` — allow-list change history

Every change to the security boundary leaves a record. *"A change to the security boundary is the
last thing that should be invisible."*

| Column | Value | What it is and why |
|---|---|---|
| `CLIENT` | `100` | Client. |
| `HIST_UUID` | `5254001f-…-5b3945d34000` | Primary key of the history row itself. |
| `REG_UUID` | `5254001f-…-5b3945d32000` | **Points at the registry row that changed** — identical to §4.1's key. This is the join. |
| `CHANGE_TYPE` | `I` | `I` insert / `U` update / `D` delete. All six rows here are `I` — six brand-new registrations. |
| `TARGET_KIND` / `TARGET_NAME` | `FUNC` / `BAPI_FTR_IRATE_DEALCREATE` | Denormalised on purpose: a `D` row must still say what was deleted after the registry row is gone. |
| `SOURCE` | `REGI` | Which door made the change — `REGI` (a gateway step/action) or `ODAT` (direct OData write on the Registry entity). Lets an auditor tell self-service changes from API-driven ones. |
| `CALL_UUID` | **`00000000-…-000000000000`** | *Should* tie the change to the call that made it. **It is zeros on all six rows — see finding F-1.** |
| `BEFORE_JSON` | *(empty)* | Pre-image. Empty on an `I` because nothing existed before. On a `U` it carries the full prior row, so a widening can be reconstructed. |
| `AFTER_JSON` | 452 chars: `{"CLIENT":"100","REG_UUID":"UlQAH+eiH9Gr6Fs5RdMgAA==","TARGET_KIND":"FUNC",…}` | Post-image — the complete row as written. Note `REG_UUID` appears here **base64-encoded**, because it is a raw 16-byte field serialised by `/ui2/cl_json`. |
| `CHANGED_BY` / `CHANGED_AT` | `FS_DEV3` / `09:15:08.195193` | Who and when. |
| `LOCAL_*` / `LAST_CHANGED_AT` | `FS_DEV3`, same stamps | Standard audit/ETag block. |

### 4.3 `ZFS_T_DYN_CALL` — the call log header, one row per request

| Column | `RegisterTarget` row | `ExecuteBatch` row | What it is and why |
|---|---|---|---|
| `CLIENT` | `100` | `100` | Client. |
| `CALL_UUID` | `5254001f-…-5b297b40c000` | *(own UUID)* | Primary key, and the parent key every `CallStep` row carries. |
| `ACTION` | `RegisterTarget` | `ExecuteBatch` | Which of the six actions was invoked. |
| `REQUEST_ID` | `5254001FE7A21FD1ABE85B297B406000` | *(generated)* | **Idempotency key.** The caller may supply one; when omitted the framework generates it. Replaying the same `RequestId` returns the original result instead of re-executing — see `REPLAYED`. |
| `COMMIT_MODE` | *(blank)* | `AUTO` / `NEVER` | Blank on `RegisterTarget` because a single-shot action has no batch commit semantics; `AUTO` commits on success, `NEVER` is the dry run that throws successful work away on purpose. Both appear in this run. |
| `EXEC_STATUS` | `S` | `S` | Did the **dispatch** work. Deliberately separate from whether the business target was happy. |
| `ERROR_CATEGORY` | *(blank)* | *(blank)* | `CLIENT` / `AUTH` / `TARGET` / `BUSINESS` on failure — what a caller branches on. |
| `REPLAYED` | `false` | `false` | True when the result was served from the idempotency window rather than re-executed. |
| `MESSAGE_ID` / `_NO` / `_TEXT` | blank / `000` / blank | — | Call-level message. Populated on a refusal (e.g. `045` "Batch aborted at step &1"). |
| `STEP_COUNT` | `1` | `1` | Steps in the request. Every call in this run carried a single step. |
| `RESULT_COUNT` | `1` | `10` / `25` / `1` | Aggregate rows touched or returned. For a `SUBM` step this is the **captured spool line count**. |
| `DURATION_MS` | `0` | `0`–`1000` | Wall-clock. |
| `REQUEST_TRUNCATED` | `false` | `false` | True when `REQUEST_JSON` was cut to fit; here nothing was truncated. |
| `REQUEST_JSON` | `{"Action":"RegisterTarget","CommitMode":"","RequestId":"","Steps":[{"index":1,"kind":"REGI",…}]}` | *(the batch)* | **The request as the framework understood it**, normalised — not the raw HTTP body. This is what makes the log replayable and is the single most useful forensic field. |
| `EXECUTED_BY` / `_AT` | `FS_DEV3` / `09:15:08.205206` | — | Who called and when. |
| `LOCAL_*` / `LAST_CHANGED_AT` | — | — | Audit/ETag block. Note `LOCAL_CREATED_AT` is fractionally **later** than `EXECUTED_AT`: the log is written from the RAP LUW *after* the execution session returns, which is exactly the design that keeps the durable log's own write out of the caller's transaction (L-350). |

### 4.4 `ZFS_T_DYN_STEP` — one row per step

| Column | `REGI` step | `SUBM` step | What it is and why |
|---|---|---|---|
| `CLIENT` | `100` | `100` | Client. |
| `STEP_UUID` | `…-5b297b40e000` | *(own)* | Primary key of the step row. |
| `CALL_UUID` | `…-5b297b40c000` | *(parent)* | **Foreign key to `ZFS_T_DYN_CALL`** — identical to §4.3's key. Groups the steps of one call. |
| `STEP_INDEX` | `1` | `1` | Position within the batch. All 15 steps here are index 1 (single-step calls). |
| `STEP_KIND` | `REGI` | `SUBM` | The five kinds: `FUNC`/`TABL`/`QURY`/`SUBM`/`REGI`. |
| `TARGET_NAME` | `BAPI_FTR_IRATE_DEALCREATE` | `RFTBBB00` | What was addressed. |
| `OPERATION` | `INSERT` | `JOB` | Overloaded by kind: for `TABL`/`REGI` it is the CRUD verb; **for `SUBM` it is the capture mode**. |
| `REG_UUID` | **zeros** | **set** | The allow-list row that permitted this step. **Zero on a `REGI` step is correct, not a defect** — a REGI step *creates* a registration, it is not dispatched against one. Populated on every FUNC/SUBM/TABL step, which is the audit join back to §4.1. |
| `EXEC_STATUS` | `S` | `S` | Did the dispatch work. |
| `SEVERITY` | `S` | `S` | `S`/`W`/`E`. Diverges from `EXEC_STATUS` on a partial write (`W` + message 048). |
| `ERROR_CATEGORY` | blank | blank | As §4.3. |
| `MESSAGE_ID`/`_NO`/`_TEXT` | `ZFS_TRM_MSG` / `036` / *"Target … registered, 1 row(s) affected"* | `ZFS_TRM_MSG` / `026` | **036 is REGI-specific on purpose**: the shared 026 reads *"&1 executed successfully"*, which for a registration asserts an execution that never happened — a human once read their own call log and asked whether the BAPI had also been invoked (L-370). |
| `RESULT_COUNT` | `1` | `10` / `25` | Rows affected, or spool lines captured. |
| `DURATION_MS` | `0` | `0` | Step wall-clock. |
| `RESPONSE_TRUNCATED` | `false` | `false` | True when `RESPONSE_JSON` was capped. |
| `RESPONSE_JSON` | *(empty)* | *(the captured spool / export data)* | The step's payload, subject to `LOG_LEVEL` on the registry row. |
| `LOCAL_*` / `LAST_CHANGED_AT` | — | — | Audit/ETag block. |

### 4.5 `ZFS_T_TRM_PROBE` — not touched by this test case

The rollback probe table, emptied with the other four. It takes no part in the FTR lifecycle; it
exists only for the L-350 phase-2 rollback proof (`key client`, `key probe_id`, `uniq_val`,
`payload`, plus the five mandatory audit fields). **It remained empty for the whole of this run**,
which is itself a useful negative control: nothing in the lifecycle writes to it.

---

## 5 · Steps 2-7, with the table growth after each

### Step 2a — DEALCREATE dry run

```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",
  \"Operation\":\"\",\"ImportJson\":\"{…\\\"TESTRUN\\\":\\\"X\\\"}\",\"TablesJson\":\"{…\\\"RETURN\\\":[]}\",
  \"FieldsJson\":\"\",\"FilterJson\":\"\",\"OrderByJson\":\"\",\"MaxRows\":0,\"SkipRows\":0}]","RequestId":""}
```

Response `ExecStatus S`; `FINANCIALTRANSACTION` comes back as `\INTERN\` — the BAPI's test-run
placeholder, i.e. no number was assigned.

**After:** Registry 6, History 6, **CallLog 7, CallStep 7**. The dry run is logged like any other
call — a dry run is still an event worth auditing.

### Step 2b — DEALCREATE real

Same payload with `TESTRUN:""` and `CommitMode AUTO`.

```json
"exportjson":"{\"COMPANYCODE\":\"1000\",\"FINANCIALTRANSACTION\":\"0000000160456\"}"
"tablesjson":"{…\"RETURN\":[
   {\"TYPE\":\"W\",\"ID\":\"FTR_GUI\",\"NUMBER\":220,\"MESSAGE\":\"Partner 700000453 cannot be used, as per contract 01.01.2026\"},
   {\"TYPE\":\"I\",\"ID\":\"FTR0\",\"NUMBER\":162,\"MESSAGE\":\"BAPI was executed successfully\"}]}"
```

**After:** CallLog 8, CallStep 8. **Verified in `VTBFHA`:**

| RFHA | BUKRS | SFHAART | SGSART | RANTYP |
|---|---|---|---|---|
| 0000000160456 | 1000 | 100 | 22A | 5 |

This step also proves two contract properties: deeply nested structures round-trip, and an
**output-only `TABLES` parameter comes back because it was sent as `[]`** (L-314).

### Step 3 — settle

`ImportJson {"COMPANYCODE":"1000","FINANCIALTRANSACTION":"0000000160456","TESTRUN":""}`,
`TablesJson {"RETURN":[]}` → `ExecStatus S`.
**After:** CallLog 9, CallStep 9.

### Steps 4a/4b — TBB1 (`SUBM`, capture mode `JOB`)

`FilterJson` for a `SUBM` step is a list of **selection-screen values** (one `RSPARAMS` row each),
not a WHERE clause. Dates in **internal format `YYYYMMDD`** — the values reach the report through
`SUBMIT … WITH SELECTION-TABLE`.

```json
"FilterJson":"[{\"field\":\"S_BUKRS\",\"kind\":\"S\",\"sign\":\"I\",\"op\":\"EQ\",\"low\":\"1000\",\"high\":\"\"},
 {\"field\":\"S_RFHA\",\"kind\":\"S\",…,\"low\":\"0000000160456\"},
 {\"field\":\"P_DZTERM\",\"kind\":\"P\",…,\"low\":\"20260101\"},
 {\"field\":\"P_BUDAT\",\"kind\":\"P\",…,\"low\":\"20260101\"},
 {\"field\":\"P_BLDAT\",\"kind\":\"P\",…,\"low\":\"20260101\"},
 {\"field\":\"P_TEST\",\"kind\":\"P\",…,\"low\":\"X\"}]"
```

Test run spool, returned through the gateway: `Records passed 1`, *"Test run was successful"*.
Real run: *"Transactions were updated successfully"*.
**After:** CallLog 11, CallStep 11. **`BKPF`:** doc **0600000276**, `TBB1`, posted 01.01.2026.

### Steps 5a/5b — TPM44 (`SUBM`, `JOB`)

`P_DEA=X`, `SO_BUKRS=1000`, `SO_OTCNR=0000000160456`, `P_KEYDAT/P_FIDATE/P_DOCDAT=20260131`,
`P_RDATE/P_RFIDAT=20260201`, `P_TEST=X` then `''`.

Posting log returned through the gateway:

```
|  160456  1000 001 Accrual/deferral        31.01.2026   IndAS
|40 106070  Int Receivable - TL    Loan: Accruals: Revenue          849.32  INR
|50 301170  Interest Income - TL   Loan: Accruals: Revenue          849.32- INR
|  160456  1000 001 Accrual/deferral reset  01.02.2026   IndAS
```

**After:** CallLog 13, CallStep 13. **`BKPF`:** **0600000277** (31.01.2026) and **0600000278**
(01.02.2026).

### Step 6 — TPM1 (`SUBM`, `JOB`)

`KEYDATE=20260131`, `VALCAT=2`, `X_SIMULA=''`. Bare parameter names, not `P_*`.
Result: *"The valuation of the position resulted in no write-ups or write-downs"* — **no document is
the correct answer** for a fixed-rate loan at amortised cost.
**After:** CallLog 14, CallStep 14.

### Step 7 — fee row (`TABL` INSERT)

```json
"ImportJson":"[{\"CLIENT\":\"100\",\"ZTYPE\":\"02\",\"ZFEE_TYPE\":\"F01\",\"ZOTTK_NO\":\"999997\",
 \"ZDTTK_NO\":\"160456\",\"ZSGSART\":\"22A\",\"ZCAT\":\"02\",\"ZCODE\":\"01\",\"ZB_AMT\":100000,
 \"ZRATE\":10,\"ZDAY\":\"31\",\"ZAMT\":849.32,\"ZF_AMT\":849.32,\"ZCREATED_BY\":\"FS_DEV3\",
 \"ZCREATED_DATE\":\"2026-09-13\"}]"
```

`ExecStatus S`, `resultcount 1`. **Verified by `SELECT`:**

| ZOTTK_NO | ZDTTK_NO | ZFEE_TYPE | ZSGSART | ZB_AMT | ZAMT | ZF_AMT | ZCREATED_BY |
|---|---|---|---|---|---|---|---|
| 999997 | 160456 | F01 | 22A | 100000 | 849.32 | 849.32 | FS_DEV3 |

---

## 6 · Final state of the framework tables

**`Registry` — 6 rows**

| Kind | Target | IsActive | AllowRead | AllowWrite | CallMode | MaxRows | LogLevel |
|---|---|---|---|---|---|---|---|
| FUNC | BAPI_FTR_IRATE_DEALCREATE | X | X | X | L | 0 | A |
| FUNC | BAPI_FTR_IRATE_SETTLE | X | X | X | L | 0 | A |
| SUBM | RFTBBB00 | X | X | X | | 0 | A |
| SUBM | RTPM_ACCRUAL_DEFERRAL | X | X | X | | 0 | A |
| SUBM | RTPM_TRL_VALUATION | X | X | X | | 0 | A |
| TABL | ZSGSLCTR_FEEDATA | X | X | X | | 0 | A |

**`RegistryHistory` — 6 rows**, all `ChangeType I`, `Source REGI`, `BeforeJson` empty (nothing
existed before), `AfterJson` 434-452 chars each.

**`CallLog` — 15 rows**

| Action | CommitMode | ExecStatus | StepCount | ResultCount |
|---|---|---|---|---|
| RegisterTarget ×6 | *(blank)* | S | 1 | 1 |
| ExecuteBatch (dry run) | NEVER | S | 1 | 0 |
| ExecuteBatch (create) | AUTO | S | 1 | 0 |
| ExecuteBatch (settle) | AUTO | S | 1 | 0 |
| ExecuteBatch (TBB1 ×2) | AUTO | S | 1 | 10 |
| ExecuteBatch (TPM44 ×2) | AUTO | S | 1 | 25 |
| ExecuteBatch (TPM1) | AUTO | S | 1 | 10 |
| ExecuteBatch (fee row) | AUTO | S | 1 | 1 |

**`CallStep` — 15 rows**

| Kind | Target | Operation | Status | MsgNo | Rows | RegUuid |
|---|---|---|---|---|---|---|
| REGI ×6 | the six targets | INSERT | S | 036 | 1 | **zero (correct)** |
| FUNC | BAPI_FTR_IRATE_DEALCREATE ×2 | | S | 000 | 0 | set |
| FUNC | BAPI_FTR_IRATE_SETTLE | | S | 000 | 0 | set |
| SUBM | RFTBBB00 ×2 | JOB | S | 026 | 10 | set |
| SUBM | RTPM_ACCRUAL_DEFERRAL ×2 | JOB | S | 026 | 25 | set |
| SUBM | RTPM_TRL_VALUATION | JOB | S | 026 | 10 | set |
| TABL | ZSGSLCTR_FEEDATA | INSERT | S | 000 | 1 | set |

**15 calls, 15 steps, 15 log rows, 15 step rows — one-for-one, no gaps.**

---

## 7 · Findings

### F-1 · `ZFS_T_DYN_REGH.CALL_UUID` is all zeros — the history cannot be joined to the call log

All six history rows carry `CALL_UUID = 00000000-0000-0000-0000-000000000000`. The column exists to
tie a change of the security boundary to the request that made it; as it stands, an auditor holding
a history row **cannot tell which call created the registration**, and must fall back to matching on
`CHANGED_AT` timestamps.

Likely cause: the registry's per-request buffer adopts the call UUID via `RESET( call_uuid )`, which
the dispatcher passes on a batch. A **single-shot `RegisterTarget`** appears not to seed it, so
`CURRENT_CALL_UUID( )` returns initial and the history row records zeros. Every registration in this
run went through single-shot `RegisterTarget`, so every row shows the gap.

**Severity: Important, not Critical.** No control depends on it — the *change* is fully recorded,
with before/after images, actor and timestamp. What is lost is the join. Worth fixing precisely
because this table exists for auditability and a zero key is the one value that looks populated
until you read it.

### F-2 · `REG_UUID` zero on a `REGI` step is correct, and should stay that way

The contrast is visible in §6: six `REGI` steps carry zeros, the nine execution steps all carry a
real UUID. A REGI step *creates* a registration rather than being dispatched against one, so there
is no permitting row to record. Documented so nobody "fixes" it later.

### F-3 · The log is written after the execution session returns, and the timestamps show it

`EXECUTED_AT 09:15:08.205206` vs `LOCAL_CREATED_AT 09:15:08.233740` — the header row is created
~28 ms after the call executed. That ordering is the architecture working: the durable log is
written from the RAP LUW *after* the execution session has returned, because writing it from inside
would implicitly commit the caller's LUW and destroy the rollback guarantee (L-350).

### F-4 · A dry run is logged like any other call

Step 2a (`CommitMode NEVER`, `TESTRUN X`) produced a full `CallLog` + `CallStep` pair. Correct: a
dry run is an event an auditor may need to see, and its absence would make the log a success
journal rather than a record.

### F-5 · Carried forward from the previous run, unchanged

A `SUBM` selection name that does not exist on the report is **silently dropped** (L-498), and
`RFTBBB00` recomputes its dates from day offsets in batch mode (L-499). This run used the verified
names from the reports' own selection includes and every step selected exactly 1 record — but the
underlying framework behaviour is unchanged and still warrants a fix.

---

## 8 · Evidence

- **`raw-calls.log`** — the complete transcript: every request URL, headers, request body, raw
  response, and all ten framework-table snapshots inline, in execution order.
- **`snapshots/`** — 40 JSON files, `<step-tag>--<EntitySet>.json`, one per table per snapshot, so
  any point in the run can be inspected in isolation or diffed against the next.
- **Business outcomes** were read over **ADT SQL** — a channel independent of the gateway — so no
  verdict here rests on the component under test. `VTBFHA`, `BKPF` and `ZSGSLCTR_FEEDATA` confirm
  the deal, the three FI documents and the fee row.
- **Screenshots: captured** — see §10. Taken from SAP GUI after the run, against the live tables.

> **A capture trap worth recording.** Several SAP session windows were open at once (the operator's
> own SE16N sessions alongside the one being driven here). Selecting "the largest SAP window" saved
> the **wrong session** five times in a row — real SAP screens, plausibly titled files, showing a
> table that was simply not the one that had been navigated to. Nothing about those images looked
> wrong. The captures below are therefore selected **by window title**, and the capture refuses to
> save when no visible window matches. A screenshot of the wrong window is worse than no screenshot.

## 9 · Left on the system

**Business data:** deal `0000000160456` and its settlement; FI documents `0600000276`, `0600000277`,
`0600000278`; one `ZSGSLCTR_FEEDATA` row (`ZOTTK_NO 999997`).
**Framework data:** 6 registry rows, 6 history rows, 15 call-log rows, 15 step rows.
**Jobs:** `ZFSDYN_RFTBBB00` ×2, `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` ×2, `ZFSDYN_RTPM_TRL_VALUATION`.

> **OPEN RISK.** Six write-capable targets are registered and active, which means any caller holding
> `ZFS_DYNGW` execute rights can create and settle FTR deals and post treasury flows through v2.
> Deactivate them when testing is finished: `RegisterTarget` with `Operation UPDATE` and
> `{"IsActive":false}` — an UPDATE touches only the columns you send.

---

## 10 · Screenshots

All taken from SAP GUI against the live system after the run completed. Window selected by title,
so each image is the table it claims to be.

### Figure 1 — `ZFS_T_DYN_REG`, 6 rows (the allow-list built by step 1)

![ZFS_T_DYN_REG](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/01-ZFS_T_DYN_REG-6-rows.png)

`REG_UUID`, `TARGET_KIND`, `TARGET_NAME`, `IS_ACTIVE`, `ALLOW_READ`, `ALLOW_WRITE` and `CALL_MODE`
are all visible. Note `CALL_MODE = L` on the two `FUNC` rows and blank on the rest — the single
character that decides whether a call shares the caller's LUW.

### Figure 2 — `ZFS_T_DYN_REGH`, 6 rows (one history row per registration)

![ZFS_T_DYN_REGH](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/02-ZFS_T_DYN_REGH-6-rows.png)

Each row pairs its own `HIST_UUID` with the `REG_UUID` of the registry row it describes, all
`CHANGE_TYPE = I` and `SOURCE = REGI`.

### Figure 3 — `ZFS_T_DYN_CALL`, 15 rows (one per action)

![ZFS_T_DYN_CALL](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/03-ZFS_T_DYN_CALL-15-rows.png)

Six `RegisterTarget` calls followed by nine `ExecuteBatch` calls.

### Figure 4 — `ZFS_T_DYN_STEP`, 15 rows (one per step)

![ZFS_T_DYN_STEP](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/04-ZFS_T_DYN_STEP-15-rows.png)

`STEP_UUID` beside `CALL_UUID` on every row — the parent/child join that groups steps under their
call — then `STEP_KIND` (6 × `REGI`, 3 × `FUNC`, 5 × `SUBM`, 1 × `TABL`) and `OPERATION`, which
carries `INSERT` for TABL/REGI and the capture mode `JOB` for SUBM.

### Figure 5 — `ZFS_T_TRM_PROBE`, the negative control

![ZFS_T_TRM_PROBE](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/05-ZFS_T_TRM_PROBE-empty.png)

This is the Data Browser **selection screen**, which shows the table's structure (`PROBE_ID`,
`UNIQ_VAL`, `PAYLOAD` plus the five audit fields). **It is not itself proof of emptiness** — the
emptiness is evidenced by SE16 answering *"No table entries found for specified key"* on execution,
and by the OData snapshots. Stated precisely rather than captioned as something it is not.

### Figure 6 — FI document 0600000277, the TPM44 accrual

![FB03 0600000277](../worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/screenshots/06-FB03-0600000277-accrual.png)

Company code 1000, posting date 31.01.2026, period 10, currency INR. Two line items:
**PK 40 `106070` Int Rec - TL 849.32** debit against **PK 50 `301170` Interest Income - TL 849.32-**
credit. This is the accrual the gateway produced, viewed in the standard transaction — the arithmetic
(100,000 × 10% × 31/365) visible as a posted document.
