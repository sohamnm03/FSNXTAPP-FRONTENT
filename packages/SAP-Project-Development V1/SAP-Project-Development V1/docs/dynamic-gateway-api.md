# Dynamic OData Gateway — consumer API reference

How to call `ZFS_SB_DYNGATEWAY_O4_API` from BTP, Postman, PowerShell or any HTTP client.
Built 2026-09-09/10; every example below was run against `DS4/100` and its real output pasted in.
Design rationale and test evidence: `worklog/DS4_100_NIIF/2026-09-09-dynamic-odata-gateway.md`.
Worked end-to-end examples (mock inserts, CDS reads, `BAPI_FTR_IRATE_CREATE`,
`BAPI_BUPA_CREATE_FROM_DATA`): **`dyngateway-live-test-2026-09-10.md`**.

## 1 · Endpoint

```
https://vhnlqds4ap01.sap.niififl.in:44300
  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/
```

| Part | Value | Note |
|---|---|---|
| Binding | `zfs_sb_dyngateway_o4_api` | |
| Repository segment | **`srvd_a2x`** | not `srvd` — that returns 403 with a misleading message (L-252) |
| Service definition | `zfs_sd_dyngateway` | |
| Version | `0001` | |
| Client | **`?sap-client=100` on every single call** | omitting it lands on client 050 and returns 401 that looks like a bad password (L-253) |
| Action namespace | `com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001` | prefix for every action name |

Entity set: `DynGateway`. Actions: `CallFunctionModule`, `ExecuteTableCrud`, `RunQuery`,
`ExecuteBatch`.

## 2 · Auth and CSRF

Basic auth. Every **POST/PATCH/DELETE** needs a CSRF token plus the session cookie from the same
conversation. Fetch once, reuse:

```
GET  /$metadata?sap-client=100
     Authorization: Basic <base64 user:pass>
     X-CSRF-Token: Fetch
→ response header  x-csrf-token: <token>   (+ set-cookie)
```

Then on every write:

```
POST /DynGateway/<namespace>.<Action>?sap-client=100
     Authorization: Basic ...
     X-CSRF-Token: <token>
     Content-Type: application/json
     Cookie: <from the fetch>
```

Plain `GET`s need no token.

## 3 · The request body

Every action takes the **same** flat JSON object. Send all fields; leave unused ones as `""` / `0`.
`MaxRows` must be an unquoted number (L-244).

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"",
  "FieldsJson":"", "FilterJson":"", "OrderByJson":"", "MaxRows":0,
  "StepsJson":"", "CommitMode":"" }
```

**The `*Json` fields are strings that contain JSON**, so their inner quotes are escaped. That is the
one thing people get wrong. Build them with your language's JSON serialiser rather than by hand.

| Field | Used by | Meaning |
|---|---|---|
| `TargetName` | all single-shot | FM / table / CDS view name |
| `Operation` | `ExecuteTableCrud` | `INSERT` \| `MODIFY` \| `DELETE` |
| `ImportJson` | `CallFunctionModule` | `{"PARAM":value,...}` — the FM's IMPORTING (and CHANGING) parameters |
| `ImportJson` | `ExecuteTableCrud` | `[{row},{row}]` — the rows to write |
| `TablesJson` | `CallFunctionModule` | `{"TAB":[{row},...]}` — TABLES parameters |
| `FieldsJson` | `RunQuery` | `["COL_A","COL_B"]`; omit for all columns |
| `FilterJson` | `RunQuery` | `[{"Field":"..","Op":"..","Low":"..","High":".."}]` |
| `OrderByJson` | `RunQuery` | `[{"Field":"..","Descending":true}]` |
| `MaxRows` | `RunQuery` | capped by the target's registered `MaxRows` |
| `StepsJson` | `ExecuteBatch` | array of steps — see §7 |
| `CommitMode` | `ExecuteBatch` | `AUTO` (default) \| `ALWAYS` \| `NEVER` |

Filter operators: `EQ NE GT GE LT LE BT LIKE IN`. `BT` uses `Low`+`High`; `IN` takes a
comma-separated list in `Low` (`"100049,100050"`); `LIKE` takes SQL wildcards (`"1000%"`).
Anything else is refused with message 024.

## 4 · The response

Every action returns the same shape:

| Field | Meaning |
|---|---|
| `ExecStatus` | `S` executed · `E` refused or failed |
| `MessageText` | the reason, from `ZFS_TRM_MSG` (max 220 chars) |
| `RowsJson` | `RunQuery` → the rows. `ExecuteBatch` → the per-step result array |
| `ExportJson` | `CallFunctionModule` → the FM's EXPORTING params (and `CHANGING` under its own key when present) |
| `TablesJson` | `CallFunctionModule` → TABLES parameters after the call |
| `ResultCount` | rows returned / rows affected / steps run |
| `DurationMs` | server-side time |
| `GwUuid` | key of the call-log row; `GET DynGateway(<uuid>)` to read the full request/response later |

**A refusal is a normal HTTP 200 with `ExecStatus: "E"`** — not an HTTP error. Check `ExecStatus`,
not just the status code.

## 5 · Reading a table or a CDS view

`POST /DynGateway/<ns>.RunQuery?sap-client=100`

```json
{ "TargetName":"ZFS_SLC_OTTK_BTP", "Operation":"", "ImportJson":"", "TablesJson":"",
  "FieldsJson":"[\"ZOTTK_NO\",\"ZBUKRS\",\"ZDATE\"]",
  "FilterJson":"[{\"Field\":\"ZBUKRS\",\"Op\":\"EQ\",\"Low\":\"SG03\",\"High\":\"\"}]",
  "OrderByJson":"[{\"Field\":\"ZOTTK_NO\",\"Descending\":true}]",
  "MaxRows":3, "StepsJson":"", "CommitMode":"" }
```

Real response:

```
ExecStatus=S  ResultCount=2  ms=55
RowsJson: [{"ZOTTK_NO":"100050","ZBUKRS":"SG03","ZDATE":"2026-09-08"},
           {"ZOTTK_NO":"100049","ZBUKRS":"SG03","ZDATE":"2026-09-08"}]
```

A CDS view entity is read exactly the same way — put the view name in `TargetName`.

## 6 · Calling a function module

`POST /DynGateway/<ns>.CallFunctionModule?sap-client=100`

```json
{ "TargetName":"DATE_GET_WEEK", "Operation":"",
  "ImportJson":"{\"DATE\":\"20260910\"}",
  "TablesJson":"", "FieldsJson":"", "FilterJson":"", "OrderByJson":"",
  "MaxRows":0, "StepsJson":"", "CommitMode":"" }
```
→ `ExecStatus=S  ExportJson={"WEEK":202637}`

With TABLES (`RFC_READ_TABLE`): put them in `TablesJson`, e.g.
`"{\"FIELDS\":[{\"FIELDNAME\":\"MANDT\"},{\"FIELDNAME\":\"MTEXT\"}]}"` — they come back filled in
`TablesJson`.

Only parameters you actually send are bound; everything else keeps the FM's own defaults.

## 7 · Many operations in one call — `ExecuteBatch`

`StepsJson` is an ordered array. Each step names its own `Kind` and target, so one HTTP call can
drive several BAPIs, write several tables and read several tables/views. A target may repeat.

```json
"StepsJson": "[
  {\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_..._CREATE\",\"ImportJson\":\"{...}\"},
  {\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_..._CHANGE\",\"ImportJson\":\"{...}\"},
  {\"Kind\":\"TABL\",\"TargetName\":\"ZTAB_A\",\"Operation\":\"INSERT\",\"ImportJson\":\"[{...}]\"},
  {\"Kind\":\"TABL\",\"TargetName\":\"ZTAB_B\",\"Operation\":\"MODIFY\",\"ImportJson\":\"[{...}]\"},
  {\"Kind\":\"QURY\",\"TargetName\":\"ZFS_SLC_OTTK_BTP\",\"MaxRows\":5},
  {\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"MaxRows\":5}
]"
```

A step takes the same field names as the single-shot actions, plus
`Kind` = `FUNC` | `TABL` | `QURY` | `SUBM`. `SUBM` exists **only** as a batch step — there is no
single-shot `SubmitProgram` action — so even one report runs through `ExecuteBatch`. See §11.

`RowsJson` comes back as the per-step array — note the keys are **upper case** here:

```
overall=S  steps=2  ms=222
step 1  QURY  ZFS_SLC_OTTK_BTP  status=S  rows=2
   [{"ZOTTK_NO":"100049","ZBUKRS":"SG03"},{"ZOTTK_NO":"100050","ZBUKRS":"SG03"}]
step 2  QURY  ZFS_CDS_SLC_001   status=S  rows=2
   [{"ZOTTK_NO":"100049","ZBUKRS":"SG03","ZSTR":"DSX"},{"ZOTTK_NO":"100050",...}]
```

Per-step fields: `STEP`, `KIND`, `TARGETNAME`, `OPERATION`, `EXECSTATUS`, `MESSAGENO`,
`MESSAGETEXT`, `EXPORTJSON`, `TABLESJSON`, `ROWSJSON`, `RESULTCOUNT`, `DURATIONMS`.
`EXECSTATUS = P` means *planned but never executed* — the batch was rejected in validation.

### Behaviour on failure

- **Any step fails validation** (unregistered, no permission, bad operator/field/operation) →
  nothing executes at all, HTTP 200, `ExecStatus=E`, every step reported.
- **A step fails at runtime** → the whole call aborts: RFC session rolled back, table writes rolled
  back, and the answer is **HTTP 400 with an empty body**. Nothing partial is ever committed, but
  the reason does not reach you (L-313). Validate inputs client-side for anything you need
  diagnosed.

### Transactions

FUNC steps share one `DESTINATION 'NONE'` RFC session, so several BAPIs commit together via
`BAPI_TRANSACTION_COMMIT` — `CommitMode` `AUTO` commits only if every FUNC step succeeded, `ALWAYS`
commits regardless, `NEVER` leaves it to you. TABL steps commit in the RAP LUW.
`SUBM` steps are a **third, separate group**: the report runs behind its own
`DESTINATION 'NONE'` session and commits or not on its own, before control returns.
**Each group is atomic in itself; none of the three is atomic with the others.**

One consequence, deliberate: a failed `SUBM` step is reported as a per-step error with HTTP 200
rather than aborting the batch — there is nothing to roll back, and aborting would replace the
reason with an empty body (L-328). That holds only while no `TABL` or `FUNC` step has already
executed in the same call; after that the abort takes precedence and the whole batch rolls back
as usual.

## 8 · Managing the allow-list

Nothing runs unless it is registered. The registry is plain CRUD on the same entity set.

```
GET    /DynGateway?sap-client=100&$filter=EntryType eq 'R'
POST   /DynGateway?sap-client=100          + CSRF
PATCH  /DynGateway(<GwUuid>)?sap-client=100 + CSRF + If-Match: *
DELETE /DynGateway(<GwUuid>)?sap-client=100 + CSRF + If-Match: *
```

Create body:

```json
{ "EntryType":"R", "TargetKind":"QURY", "TargetName":"ZFS_CDS_SLC_001",
  "Operation":"SELECT", "IsActive":"X", "AllowRead":"X", "AllowWrite":"",
  "CallMode":"", "MaxRows":20, "Descr":"CDS view read" }
```

| Field | Meaning |
|---|---|
| `TargetKind` | `FUNC` \| `TABL` \| `QURY` \| `SUBM` |
| `IsActive` | `X` = callable. Clear it to switch a target off instantly, no transport |
| `AllowRead` / `AllowWrite` | `QURY` needs read; `TABL` and **all `FUNC`** need write |
| `Operation` | pin a `TABL` row to one operation, or blank for all three |
| `CallMode` | `R` = `DESTINATION 'NONE'`, `L` = local, blank = auto from `TFDIR-FMODE` |
| `MaxRows` | ceiling for `RunQuery` |

Currently registered on `DS4/100` (24 rows; inactive ones marked):

```
FUNC  RFC_SYSTEM_INFO · RFC_READ_TABLE · CONVERSION_EXIT_ALPHA_INPUT · DATE_GET_WEEK · MONTH_NAMES_GET
FUNC  BAPI_FTR_IRATE_CREATE · BAPI_BUPA_CREATE_FROM_DATA      <- write-capable
FUNC  RPY_PROGRAM_READ                                        <- INACTIVE (reads any ABAP source)
QURY  ZFS_SLC_OTTK_BTP (50) · ZFS_CDS_SLC_001 (20) · ZFS_CDS_SLC_002 (20) · ZSGSLCTR_BPEXT (20)
QURY  ZSGSLCTR_FEEDATA (50) · ZSGSLCTR_DEALID (50) · VTBFHA (20) · VTBFHAPO (20)
QURY  FUPARAREF (100)                                         <- INACTIVE
TABL  ZFS_T_SLC_DYNGW · ZSGSLCTR_FEEDATA (INSERT) · ZSGSLCTR_DEALID (INSERT)
SUBM  ZFS_R_TRM_FWDTXN (25) · ZFS_LMS_R033 (20) · ZFS_FI_R047 (20)
SUBM  ZFS_SLC_DEM003                                          <- INACTIVE, CL_GUI program, dumps
```

`SUBM` rows are write-capable by nature and every one carries `AllowWrite`. Clear `IsActive` to
switch any row off instantly, with no transport.

The two `FUNC` rows added on 2026-09-10 let any caller of this service create financial
transactions and business partners. Clear `IsActive` to switch either off instantly.

`EntryType='L'` rows are the call log — written by the gateway, readable with the same `GET`.

## 9 · Messages

`ZFS_TRM_MSG` 017–026: 017 not registered · 018 operation not permitted · 019 FM does not exist ·
020 dynamic call failed · 021 table/view does not exist · 022 invalid JSON · 023 field not a
component · 024 operator not supported · 025 row count over the limit · 026 success.

`SUBM` adds 027–032: 027 program does not exist or is not executable · 028 output mode not
supported · 029 selection value invalid or over length · 030 variant does not exist for the
program · 031 not authorised to submit the program · 032 no output could be captured in that mode.
It reuses 017, 018, 022, 023, 024, 025 and 026 unchanged.

## 11 · Running an executable report — `Kind = 'SUBM'`

`SUBMIT` has **no `EXPORTING` parameters** — a report is not a function module, and there is no
generic way to read its internal data. So the caller names a capture mechanism and the gateway
applies it:

| `Operation` | Mechanism | Comes back in |
|---|---|---|
| `SALV` | `cl_salv_bs_runtime_info` armed before the submit, `get_data_ref( )` after | `ROWSJSON` — the report's own internal table, **typed** |
| `LIST` | `EXPORTING LIST TO MEMORY` + `LIST_FROM_MEMORY` / `LIST_TO_ASCI` | `ROWSJSON` — `[{"LINE":1,"TEXT":"…"}]` |
| `MEMO` | `IMPORT gw_json FROM MEMORY ID <id>` | envelope `MEMO` field |
| `NONE` | run only | messages only |

**Use `SALV` by default for any ALV report.** The interceptor covers `REUSE_ALV_GRID_DISPLAY` as
well as `cl_salv_table` (L-330), so both report patterns work, and it is the cheaper mode because
display is suppressed — measured 42 ms against 177 ms for `LIST` on the same report. `LIST` is for
reports that genuinely `WRITE` their own output.

Field mapping for a `SUBM` step:

| Field | Meaning |
|---|---|
| `TargetName` | the report name |
| `Operation` | capture mode, as above; blank defaults to `SALV` |
| `FilterJson` | the **selection table**: `[{"Field":"SO_DATE","Op":"BT","Low":"20260101","High":"20260131"}]` — `Kind` and `Sign` optional, `Sign` defaults `I`, `Kind` is taken from the program's real selection screen |
| `ImportJson` | run envelope: `{"Variant":"ZDEFAULT","MemoryId":"GW_JSON"}` |
| `MaxRows` | cap on rows/lines returned, ceilinged by the registry row |

`EXPORTJSON` always carries the run envelope, in every mode:

```json
{"PROGRAM":"ZFS_R_TRM_FWDTXN","MODE":"SALV","VARIANT":"","CAPTURED":15,
 "TRUNCATED":true,"SYSUBRC":0,"MSGID":"","MSGNO":0,"MSGTY":"","MSGTX":"","MEMO":""}
```

`SYSUBRC` and `MSGID`/`MSGNO`/`MSGTX` are the report's own `sy-subrc` and `sy-msg*` captured
straight after the submit — often the only diagnosis a report offers.

Worked call:

```json
POST /DynGateway/<ns>.ExecuteBatch?sap-client=100
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"", "FieldsJson":"",
  "FilterJson":"", "OrderByJson":"", "MaxRows":0, "CommitMode":"NEVER",
  "StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"SALV\",\"MaxRows\":15}]" }
```

### Qualify a report before you register it

Three cheap reads, all before the registry row exists. Skipping them is how you get a failure that
explains nothing (L-321, L-331):

1. **`WBCROSSGT`** for the report's includes — any `CL_GUI_*` reference is a **hard disqualifier**.
   There is no GUI in this session; the report will kill the RFC work process, which surfaces as
   `020` *"connection closed (no data)"*.
2. **The `_TOP` include** — an `OBLIGATORY` select-option must be supplied in `FilterJson` or the
   submit stalls on the selection screen.
3. **A timed trial run** at the realistic selection width, because runtime is the real limit and
   nothing in the gateway can bound it.

### How it runs, and why

The gateway does not submit the report itself. It calls `ZFS_RFC_DYNGW_SUBMIT` with
`DESTINATION 'NONE'`, so the report executes in its own internal session and its own LUW and a
report that commits cannot corrupt the RAP transaction (L-227). That is also why the capture lives
in that function module rather than in the behaviour pool: the SALV interceptor, the list memory
and ABAP memory are all session-local, so nothing could be read back afterwards.

Before submitting, the wrapper re-checks `TRDIR-SUBC = '1'` and does an explicit
`AUTHORITY-CHECK OBJECT 'S_PROGRAM'` on the program's authorisation group — explicit, because an
implicit failure inside the RAP action would reach the caller as an empty body. It always clears
the interceptor afterwards, on every path: a left-armed interceptor silently corrupts the next
unrelated ALV in that session.

## 10 · Known limits

- An FM with **generic** parameter types (`CLIKE`, `ANY`, untyped) cannot be called dynamically —
  refused with a clear message (L-311). Rules out conversion exits and most `STRING_*` utilities.
- `CHANGING` parameters need `CallMode = L`; RFC has no CHANGING.
- A filter literal longer than its column, or non-numeric against a numeric column, is refused
  before it reaches SQL (L-310).
- An aborted batch gives no error body (L-313).
- An FM's **output-only** `TABLES` parameter must still be sent as `[]`, or the gateway does not
  bind it and its content never reaches you — `RETURN` included (L-314).
- `RunQuery` validates field names against the **non-flattened** structure, so a column that lives
  in a DDIC `.INCLUDE` is refused as *"Field X is not a component"*; and omitting `FieldsJson` on
  such a table fails outright. Always send an explicit `FieldsJson` for SAP-standard tables (L-316).
- `CallFunctionModule` **never commits**. A creating BAPI must go through `ExecuteBatch` with
  `CommitMode` `AUTO`/`ALWAYS`, and `ExecStatus='S'` only means the dispatch worked — a BAPI that
  failed still reports `S`, with the errors in `RETURN` (L-317).
- The service user's authorisations are what a caller effectively gets. **Write access to the
  registry rows is privileged** — treat it as such. That applies to `SUBM` exactly as to the other
  three kinds: an earlier build refused `SUBM` registration through the service, which cost real
  friction without adding protection because the registry table is reachable through `TABL`
  anyway (L-326, L-327).
- A `SUBM` target's practical limit is **runtime, not rows**. `MaxRows` caps what comes back, never
  the work the report does; a selection wide enough to exceed the work-process limit returns an
  error the gateway cannot make specific. Record the safe selection width in the row's `Descr`
  (L-329).
- `MEMO` mode is implemented but **unproven** — it needs a report that exports a single `GW_JSON`
  string, and none exists yet.
