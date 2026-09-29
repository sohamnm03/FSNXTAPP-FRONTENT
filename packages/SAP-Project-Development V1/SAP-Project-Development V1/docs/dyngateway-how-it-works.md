# The Dynamic OData Gateway — how it works and how to call it

- **Service:** `ZFS_SB_DYNGATEWAY_O4_API` (service definition `ZFS_SD_DYNGATEWAY`, service binding
  `ZFS_SB_DYNGATEWAY_O4_API`, OData v4)
- **System:** `DS4_100_NIIF` (`DS4` / client `100`)
- **Behind it:** `ZBP_FS_DYNGATEWAYTP` (behaviour pool) delegating to 12 global classes
  (`ZCL_FS_SLC_GW_*`) plus `ZFS_RFC_DYNGW_SUBMIT` / `ZFS_RFC_DYNGW_LOG` (RFC-enabled function
  modules)
- **Data:** one table, `ZFS_T_SLC_DYNGW`

This file is the conceptual and practical guide: what the service is, how the pieces fit together,
and the exact JSON for every call shape. For the field-by-field wire contract see
`docs/dynamic-gateway-api.md`; for a step-by-step client walkthrough with PowerShell/curl helpers
see `docs/dyngateway-integration-guide.md`. This document exists to explain *why* it works the way
it does, not just *what* to send.

---

## 1 · The one-paragraph mental model

The gateway is a **generic, allow-listed remote-control panel** for four kinds of ABAP operation
that would otherwise each need their own bespoke API: calling a function module, reading a table
or CDS view, writing a table, and running an executable report. Nothing runs unless it is on an
allow-list first. Every call is logged. The caller never sends ABAP — only JSON naming a target
and a payload — and the gateway does the dynamic dispatch on the caller's behalf.

It exists because building one bespoke OData service per BAPI/table/report the business needs is
slow, and most of those needs are read a CDS view, run a report, or call one BAPI. The gateway
turns that into configuration (one allow-list row) instead of a new development object.

**This is not a general integration platform and it is not "clean core".** Dynamic `CALL
FUNCTION`, dynamic Open SQL and `SUBMIT` are all things ABAP Cloud forbids, and this service does
all three, on purpose, behind an allow-list, an audit log and (eventually) authorization. See
`docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md` §*Clean-core position* for the
full reasoning. If this system ever moves to ABAP Cloud, this service does not come with it as
written.

---

## 2 · Architecture — what actually runs when you call it

```
HTTP/OData v4 request
        |
        v
ZBP_FS_DYNGATEWAYTP  (behaviour pool, ~150 lines - pure delegation)
        |
        v
ZCL_FS_SLC_GW_DISPATCH   <- single dispatch entry point, everything routes through here
        |
        +--> ZCL_FS_SLC_GW_REGISTRY   the allow-list check (every call starts here)
        |
        +--> ZCL_FS_GW_HANDLER_FACTORY -> one of:
        |        ZCL_FS_SLC_GW_FUNC    dynamic CALL FUNCTION
        |        ZCL_FS_SLC_GW_TABLE   dynamic INSERT / MODIFY / DELETE
        |        ZCL_FS_SLC_GW_QUERY   dynamic SELECT
        |        ZCL_FS_SLC_GW_SUBMIT  SUBMIT a report (via a separate RFC session)
        |        ZCL_FS_SLC_GW_REGI    register/update an allow-list row
        |
        +--> ZCL_FS_SLC_GW_RUNTIME    the one class that actually does the forbidden things
        |        (dynamic CALL FUNCTION, dynamic SELECT/INSERT/MODIFY/DELETE, the SUBMIT RFC)
        |
        +--> ZCL_FS_SLC_GW_LOG        stages / caps / writes the call-log row
        |
        v
ZFS_T_SLC_DYNGW   (one table: allow-list rows AND call-log rows)
```

Every handler implements one contract, `ZIF_FS_SLC_GW_HANDLER`: `kind()`, `needs_write()`,
`runs_in_caller_luw()`, `prepare(...)` (validate, never touch data), `execute()` (do the thing).
That split is what makes `ExecuteBatch` safe: **every step in a batch is validated before any
step executes.** A batch that fails validation runs nothing at all.

---

## 3 · The URL

```
https://<host>:<port>/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
```

For `DS4_100_NIIF`:

```
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
```

Rules that matter, all measured the hard way:

| Rule | Why |
|---|---|
| `srvd_a2x`, never `srvd` | `srvd` returns 403 with a misleading message |
| `?sap-client=100` on **every** URL, including `$metadata` | omit it and you land on the default client and get a 401 that looks like a bad password |
| Actions are named with the full namespace | `com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.<ActionName>` |
| `GET`/`PATCH`/`DELETE` address the entity directly | `<base>/DynGateway` and `<base>/DynGateway(<uuid>)` |
| `POST` an action | `<base>/DynGateway/<namespace>.<ActionName>` |

Fetch `$metadata` first on any new system — the response headers hand you a fresh
`x-csrf-token`, which every write and every action call needs.

```
GET  <base>/$metadata?sap-client=100
```

---

## 4 · Auth and CSRF

Basic auth (or your configured auth) plus a CSRF token fetched from `$metadata` or any `GET`:

```
GET <base>/$metadata?sap-client=100
  Header: X-CSRF-Token: Fetch
  -> response header x-csrf-token: <token>

POST/PATCH/DELETE ...
  Header: X-CSRF-Token: <token>
```

A PowerShell session (`-SessionVariable`) carries the cookie the token is bound to automatically;
if you build your own client, keep the session/cookie from the `GET` and reuse it for the write.

---

## 5 · `ZFS_T_SLC_DYNGW` — the one table behind everything

**One table holds two unrelated kinds of row**, told apart by `EntryType`:

| `EntryType` | What it is | Who writes it |
|---|---|---|
| `R` | a registry row — an allow-listed target | you, via `POST`/`PATCH`/`DELETE`, or a `REGI` step |
| `L` | a call-log row — a record of one dispatch | the gateway itself, never you |

This is why the same OData entity set (`DynGateway`) is used both to manage the allow-list and to
read the audit trail: it is the same table, filtered by `EntryType`.

### Registry columns (`EntryType = 'R'`)

| Field | Meaning |
|---|---|
| `Uuid` | the key. Generated on create; never supply your own |
| `TargetKind` | `FUNC` \| `TABL` \| `QURY` \| `SUBM` |
| `TargetName` | FM name / table or CDS entity name / report name, `CHAR(30)` |
| `Operation` | pins the row to one operation: a `TABL` operation, or a `SUBM` capture mode. Blank = any |
| `IsActive` | `X` = callable. Clearing it is an **instant kill switch — no transport** |
| `AllowRead` / `AllowWrite` | the two permissions a call is checked against |
| `CallMode` | `FUNC` only: `R` = force `DESTINATION 'NONE'`, `L` = force local, blank = auto-detect from `TFDIR-FMODE` |
| `MaxRows` | the row-count ceiling. **`0` means no ceiling** — see §11 |
| `LogLevel` | `A` (all, default) \| `E` (errors only) \| `N` (none) — not yet exposed over OData, see §5.1 |
| `Descr` | free text, yours to use |

### Call-log columns (`EntryType = 'L'`)

| Field | Meaning |
|---|---|
| `GwUuid` | the key, and the same value the response handed you as `GwUuid` |
| `RegistryUuid` | which allow-list row authorised this call |
| `RequestJson` / `ResponseJson` | the full request and response, capped (see §5.1) |
| `ExecStatus` / `MessageId` / `MessageNo` / `MessageText` | the outcome |
| `ResultCount` / `DurationMs` | rows affected/returned, and how long it took |
| `ExecutedBy` / `ExecutedAt` | who and when |

### 5.1 · What is stored but not exposed

Four columns exist on the table and are **deliberately not in the OData projection**
(`ZFS_I_DynGateway`): `LogLevel`, `ParentUuid`, `StepIndex`, `Phase`. This was decision "option A"
in the framework design — store per-step detail and a phase marker for a batch's audit trail
(so `SE16` and a future report can use it), without changing the OData contract, which would need
a republish. Query them directly against the table if you need step-level detail; the API surface
answers with the parent call row only.

---

## 6 · How the registry (allow-list) actually works

`ZCL_FS_SLC_GW_REGISTRY=>resolve` is called on **every single dispatch**, before anything else:

1. Look up `EntryType='R', TargetKind=<kind>, TargetName=<name>, IsActive='X'`.
   - No match → refused, message **017** *"Target &1 is not registered"*.
2. If the row pins an `Operation` and the call's operation differs → refused, **018**.
3. If the call needs to write (`FUNC`, `TABL` write ops, `SUBM`) and `AllowWrite` is not set →
   **018**. If it only reads and `AllowRead` is not set → **018**.
4. Otherwise: permitted. The row (including its `MaxRows` ceiling and `LogLevel`) travels forward
   into the handler that does the actual work.

**Buffered per request, not per call.** A batch that names the same target five times triggers
one `SELECT` against the allow-list, not five — `resolve` caches by `(kind, name)` in a
request-scoped buffer (`ZCL_FS_SLC_GW_REGISTRY=>reset` clears it at the start of every action).

**Why `FUNC` and `SUBM` always need `AllowWrite`, even to "read" something:** a function module or
an executable report can do *anything* its caller's authorizations allow — there is no way to
prove in advance that it only reads. So both kinds are gated on write permission unconditionally.
Only `QURY` (a plain `SELECT`) is genuinely read-only, and only `TABL` lets you separate read
from write per-operation.

**The kill switch is real and instant.** `PATCups IsActive` to blank on a registry row and the
very next call against that target answers 017 — no transport, no restart, no cache to clear
(the per-request buffer is rebuilt every action).

### Managing the allow-list directly

Plain CRUD on the same entity set:

```json
POST <base>/DynGateway?sap-client=100
{ "EntryType":"R", "TargetKind":"QURY", "TargetName":"ZFS_CDS_SLC_001",
  "Operation":"SELECT", "IsActive":"X", "AllowRead":"X", "AllowWrite":"",
  "CallMode":"", "MaxRows":20, "Descr":"CDS view read" }
```

```
PATCH <base>/DynGateway(<uuid>)?sap-client=100
{ "IsActive":"" }                          <- kill switch

DELETE <base>/DynGateway(<uuid>)?sap-client=100
```

This is the only way to register a target on a **fresh** system — until `REGI` (§8) does it in
bulk, in one call.

---

## 7 · The four actions and their JSON

Every action shares a request shape (`ZFS_AE_DynGwRequest`) and a response shape
(`ZFS_AE_DynGwResponse`); each action only reads the fields relevant to it. Send the fields you
don't need as empty string / 0 — the examples below only show what matters per call.

### 7.1 `RunQuery` — read a table or CDS view

```
POST <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
{
  "TargetName": "ZFS_CDS_SLC_001",
  "FieldsJson": "[\"ZOTTK_NO\",\"ZBUKRS\"]",
  "FilterJson": "[{\"Field\":\"ZBUKRS\",\"Op\":\"EQ\",\"Low\":\"SG03\"}]",
  "OrderByJson": "[{\"Field\":\"ZOTTK_NO\",\"Descending\":false}]",
  "MaxRows": 20
}
```

- `FieldsJson` omitted → every column except `CLIENT`/`MANDT`.
- `FilterJson` `Op` is whitelisted: `EQ NE GT GE LT LE BT LIKE IN`. Anything else → **024**.
- Every literal is checked against its column's real length and type before it is ever quoted
  into SQL — a too-long or wrong-kind literal is refused with **020**, never a dump.
- Response: `RowsJson` = `[{...},{...}]`, `ResultCount` = rows returned.

### 7.2 `CallFunctionModule` — dynamic `CALL FUNCTION`

```
POST <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
{
  "TargetName": "RFC_SYSTEM_INFO",
  "ImportJson": "{}",
  "TablesJson": "{}"
}
```

- `ImportJson` = `{"PARAM": value, ...}` for the FM's IMPORTING (and, in local mode, CHANGING)
  parameters. Only send what the FM actually declares.
- `TablesJson` = `{"TABPARAM": [...], ...}` for TABLES parameters. **A TABLES parameter you don't
  name is never bound at all**, even an output-only one — send it as `[]` or its content never
  comes back. See §9 for the full mechanics and a live example.
- Response: `ExportJson` carries every EXPORTING parameter automatically — you never ask for
  them by name. `TablesJson` carries the TABLES/CHANGING content after the call.

### 7.3 `ExecuteTableCrud` — dynamic `INSERT`/`MODIFY`/`DELETE`

```
POST <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteTableCrud?sap-client=100
{
  "TargetName": "ZSGSLCTR_DEALID",
  "Operation": "INSERT",
  "ImportJson": "[{\"DEAL_ID\":\"D0001\",\"BUKRS\":\"SG03\"}, {\"DEAL_ID\":\"D0002\",\"BUKRS\":\"SG03\"}]"
}
```

- `ImportJson` is always an **array** of row objects, even for one row.
- `Operation` must be `INSERT` \| `MODIFY` \| `DELETE` and must match what the allow-list row
  permits (a row can be pinned to one operation).
- `INSERT` uses `ACCEPTING DUPLICATE KEYS` — a duplicate key is reported as a normal message
  (**020**, "N of M rows already exist"), never an uncatchable dump.
- Response: `ResultCount` = rows actually affected (`sy-dbcnt`).

### 7.4 `ExecuteBatch` — many operations, one call, one LUW

```
POST <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
{
  "CommitMode": "AUTO",
  "StepsJson": "[
    {\"Kind\":\"QURY\",\"TargetName\":\"T000\",\"FieldsJson\":\"[\\\"MANDT\\\"]\",\"MaxRows\":5},
    {\"Kind\":\"FUNC\",\"TargetName\":\"RFC_SYSTEM_INFO\",\"ImportJson\":\"{}\",\"TablesJson\":\"{}\"}
  ]"
}
```

`StepsJson` is a JSON **string** containing an array — note it is nested one level: you are
sending a string that, once parsed, is itself JSON. Each step takes the same field names as the
single-shot actions above, plus `Kind`.

**Validation runs for every step before any step executes.** If step 3 of 5 fails validation
(unregistered target, bad field, bad operator, over the row cap, …), **nothing runs at all** —
not steps 1–2, not step 3, not 4–5. The response is `ExecStatus=E`, HTTP 200, and every step is
reported with `EXECSTATUS='P'` (planned, never executed).

Only a **runtime** failure (something that has to actually run to fail) can abort a batch after
some steps have executed. See §12 for exactly what "abort" means and its current limitation.

`CommitMode` governs the shared `DESTINATION 'NONE'` RFC session that every `FUNC` step in the
batch shares: `AUTO` (default) commits only if every FUNC step succeeded; `ALWAYS` commits
regardless; `NEVER` leaves the commit to you (useful for read-only batches, or when the caller
wants to inspect the result before deciding).

---

## 8 · The five step kinds inside `ExecuteBatch`

| Kind | Does | Needs `AllowWrite`? | Rolls back on abort? |
|---|---|---|---|
| `FUNC` | dynamic `CALL FUNCTION` | always | yes (shared RFC session) |
| `TABL` | dynamic `INSERT`/`MODIFY`/`DELETE` | yes | yes (RAP LUW) |
| `QURY` | dynamic `SELECT` | no (read only) | n/a (nothing written) |
| `SUBM` | `SUBMIT` an executable report | always | **no** — owns its own session/LUW |
| `REGI` | register/update an allow-list row | n/a — gated by policy, not the allow-list | yes (RAP LUW, same as `TABL`) |

### `FUNC` step

```json
{"Kind":"FUNC","TargetName":"BAPI_BUPA_CREATE_FROM_DATA",
 "ImportJson":"{\"PERSONDATA\":{...}}",
 "TablesJson":"{\"ADDRESSDATA\":[{...}]}"}
```

### `TABL` step

```json
{"Kind":"TABL","TargetName":"ZSGSLCTR_DEALID","Operation":"INSERT",
 "ImportJson":"[{\"DEAL_ID\":\"D0003\"}]"}
```

### `QURY` step

```json
{"Kind":"QURY","TargetName":"ZFS_CDS_SLC_001","FieldsJson":"[\"ZOTTK_NO\"]","MaxRows":10}
```

### `SUBM` step — run an executable report

`SUBM` **only** exists as a batch step — there is no single-shot "SubmitProgram" action, even for
one report.

```json
{"Kind":"SUBM","TargetName":"ZFS_R_TRM_FWDTXN","Operation":"SALV",
 "ImportJson":"{\"Variant\":\"\",\"MemoryId\":\"\"}",
 "FilterJson":"[{\"Field\":\"S_BUKRS\",\"Op\":\"EQ\",\"Low\":\"SG03\"}]",
 "MaxRows":15}
```

- `Operation` here is the **capture mode**: `SALV` (any ALV report, `REUSE_ALV` included — this is
  cheapest and covers the most reports) \| `LIST` (classic list, as text lines) \| `MEMO` (the
  report exports one `GW_JSON` string) \| `NONE` (run only, no output captured).
- `FilterJson` here is the report's **selection screen** — same shape as a `QURY` filter, plus
  `Kind`/`Sign` (`S`/`P`, `I`/`E`), because select-options need both.
- The report runs behind `CALL FUNCTION ZFS_RFC_DYNGW_SUBMIT DESTINATION 'NONE'` — its own
  internal session and its own LUW, so a report that commits internally cannot corrupt this
  request's transaction. This is also why a failed `SUBM` step, on its own, does **not** abort the
  batch (§12) — there is nothing here for a rollback to undo.
- A report must be qualified before registering it as `SUBM`: `Z*`/`Y*` namespace, `TRDIR-SUBC =
  '1'` (an executable report, not an include/module pool), and no `CL_GUI_*` reference anywhere
  in its call tree (a GUI-bound program dumps under `SUBMIT` with no front end). See
  `docs/dyngateway-integration-guide.md` §*Qualify a report* for the exact check.

### `REGI` step — see §9, its own section

---

## 9 · `REGI` — registering targets from inside a batch

### The problem it solves

Allow-list rows are `deliveryClass #A` — **application data, not development objects** — so they
do **not travel with the transport**. Import the gateway's classes onto a fresh system and every
call answers 017 until every target is registered there by hand, one `POST` at a time. `REGI`
turns that into one `ExecuteBatch` call with one step per target.

### The shape

```json
{"Kind":"REGI","TargetName":"T000","Operation":"INSERT",
 "ImportJson":"{\"TargetKind\":\"QURY\",\"Operation\":\"SELECT\",\"IsActive\":\"X\",\"AllowRead\":\"X\",\"MaxRows\":20,\"Descr\":\"client table\"}"}
```

**Two different `Operation` fields, deliberately reusing the same name `TABL` already uses:**

| Where | Values | Means |
|---|---|---|
| the step's own `Operation` | `INSERT` (default) \| `UPDATE` \| `UPSERT` | what to do to the **registry row itself** |
| the `Operation` inside `ImportJson` | e.g. `SELECT` | the operation the **registered target** gets pinned to |

`ImportJson` for a `REGI` step accepts exactly the allow-list columns you're allowed to set:
`TargetKind`, `Operation`, `IsActive`, `AllowRead`, `AllowWrite`, `CallMode`, `MaxRows`, `Descr`,
`LogLevel`. `Uuid`, `EntryType` and the audit fields are the gateway's business, never yours.

### The three step operations

| Step `Operation` | Behaviour |
|---|---|
| `INSERT` (default) | creates a new row. **Fails with 035** if the target already exists — widening an existing registration is never accidental |
| `UPDATE` | merges — **only the fields present in `ImportJson` change**; everything else keeps its current value. Fails with 017 if the target does not exist |
| `UPSERT` | resolved during validation: `UPDATE` if the target already exists, `INSERT` otherwise |

**Why `INSERT` defaults and doesn't widen:** if a caller could silently flip `IsActive` back on or
raise a `MaxRows` ceiling just by registering "again", the allow-list would stop meaning anything.
Widening an existing registration must be typed out as `UPDATE`, on purpose.

### Register and use it in the SAME call

This is the feature that makes `REGI` worth having rather than just a faster `POST`:

```json
{"StepsJson":"[
  {\"Kind\":\"REGI\",\"TargetName\":\"T005\",\"Operation\":\"INSERT\",
   \"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"MaxRows\\\":5}\"},
  {\"Kind\":\"QURY\",\"TargetName\":\"T005\",\"FieldsJson\":\"[\\\"LAND1\\\"]\",\"MaxRows\":3}
]"}
```

`T005` does not exist in the allow-list when this request is sent. Both steps still come back
`S`. This works because `ExecuteBatch` validates every step **before** any step executes (§7.4) —
step 2's validation would normally see an empty allow-list and refuse with 017. `REGI`'s
`prepare()` publishes its intent into the same per-request buffer `ZCL_FS_SLC_GW_REGISTRY`
already uses for caching (`declare_pending`), so step 2 resolves against "committed rows *plus*
what earlier `REGI` steps in this batch declared" — and a `REGI` that comes *after* the step using
its target still fails cleanly in phase 1, rather than behaving like a caching accident.

Verified live, 2026-09-11: a `[REGI T005, QURY T005]` batch returns both steps `S`, the `QURY`
step returning real rows from a target that was not in the allow-list moments before.

### Who is allowed to register — `ZCL_FS_SLC_GW_REGPOL`

Registration authority is a **policy**, checked in `REGI`'s `prepare()`, never a hard-coded rule:

| Mode | Behaviour | Status on `DS4/100` |
|---|---|---|
| `OPEN` | anyone who can call the gateway can also register | **active now** — the current testing-phase decision |
| `AUTH` | needs a *separate* registration authorization from the one that permits gateway calls | built, but **fails closed** — the authorization object has not been named yet, so every `REGI` is refused under this mode until it is |
| `OFF` | `REGI` steps are rejected outright; registration is `POST /DynGateway` only | built, dormant |

The mode is a compiled constant (`ZCL_FS_SLC_GW_REGPOL=>c_active_mode`), not a data row — so
nobody can loosen the security boundary by writing to `ZFS_T_SLC_DYNGW` itself. Tightening it is a
one-line source change and a re-activation, not a redesign.

**Exit criterion, so `OPEN` does not quietly become permanent:** switch to `AUTH` before the first
non-development consumer is pointed at this service, or before it is imported to any system other
than `DS4/100` — whichever comes first.

### Transactional behaviour

`REGI` writes through plain Open SQL in the RAP LUW (same group as `TABL`), so a later step's
failure rolls a `REGI` step back with everything else — in principle. **See §12: this currently
does not hold when the batch aborts**, because of a defect in the durable-logging mechanism, not
in `REGI` itself.

---

## 10 · Function-module calls — how EXPORTING and TABLES come back

This is worth spelling out because it surprises people the first time: **you never ask for
EXPORTING parameters by name.** Every one of them comes back automatically in `ExportJson`.
**TABLES parameters are the opposite — silence means "not bound at all", not "empty".**

Verified live against `RFC_SYSTEM_INFO` and `MONTH_NAMES_GET`:

**A — EXPORTING, no request needed:**

```json
// Request
{"TargetName":"RFC_SYSTEM_INFO","ImportJson":"{}","TablesJson":"{}"}

// Response ExportJson (every EXPORTING param came back, unrequested)
{"RFCSI_EXPORT":{"RFCPROTO":"011","RFCSYSID":"DS4","RFCHOST":"vhnlqds4", "...": "..."},
 "CURRENT_RESOURCES":29,"MAXIMAL_RESOURCES":32,"S4_HANA":"X", "...": "..."}
```

**B — TABLES, named as `[]` → bound and returned:**

```json
// Request
{"TargetName":"MONTH_NAMES_GET","ImportJson":"{\"LANGUAGE\":\"E\"}",
 "TablesJson":"{\"MONTH_NAMES\":[]}"}

// Response TablesJson (the FM filled it; the gateway read it back)
{"MONTH_NAMES":[{"SPRAS":"E","MNR":1,"KTX":"JAN","LTX":"January"}, "...": "..." ]}
```

**C — same FM, TABLES param omitted → never bound → the call fails outright:**

```json
// Request
{"TargetName":"MONTH_NAMES_GET","ImportJson":"{\"LANGUAGE\":\"E\"}","TablesJson":"{}"}

// Response
{"ExecStatus":"E","MessageText":"Dynamic call of MONTH_NAMES_GET failed: ... mandatory ..."}
```

**Rule of thumb:** if a TABLES parameter is output-only (you don't need to send it rows), still
name it in `TablesJson` as an empty array — `{"PARAMNAME": []}` — or its content never reaches
you, and if the FM requires it, the call fails.

`CHANGING` parameters are only usable in **local mode** (`CallMode='L'` on the registry row, or
auto-detected when `TFDIR-FMODE` is not `R`) — RFC has no CHANGING, and the gateway refuses the
call with a clear message rather than silently dropping the parameter.

---

## 11 · Row caps — `MaxRows`, and what `0` means

Three places a ceiling can apply, and **there is always an effective one**:

| Layer | Value | Effect |
|---|---|---|
| Registry row `MaxRows` | a number, or `0` | the ceiling for that target. **`0` = no ceiling — every matching row comes back** |
| Caller's request `MaxRows` | a number, or omitted | may only **lower** the ceiling, never raise it. Omitted = use the ceiling as-is |

This applies identically to `RunQuery`/`QURY` steps and to `SUBM` steps (the capture mode's row
count). Requesting more than a non-zero ceiling fails with **025**.

**Verified live, 2026-09-11:** a target registered with `MaxRows:0` returned all 250 rows of a
250-row reference table with no `MaxRows` on the request, and exactly 7 rows when the request
asked for 7. Every pre-existing target with a non-zero ceiling (e.g. `T000` at 20) still refuses a
request that exceeds it (`MaxRows:999999` → 025 naming the limit).

**This is a deliberate per-target decision, not a default.** A target is capped unless *you*
explicitly register it with `MaxRows:0`. An uncapped dynamic `SELECT` or report capture on a
shared system is a real memory/runtime risk, so treat `0` as "I have thought about this target and
decided the full result set is safe and expected", not as the default choice.

---

## 12 · Errors, transactions, and the one open limitation

**A refusal is HTTP 200, `ExecStatus='E'` — never an HTTP error.** That's the whole point of the
exception→outcome boundary inside the dispatcher (`ZCX_FS_GW_ERROR` never escapes to RAP).

**An aborted batch is HTTP 400, and now carries the reason** (message 020 naming the failing
step) — the earlier defect where an aborted batch answered with an empty body is fixed.

**Transactions, three separate groups, none atomic with the others:**

| Group | Commits via |
|---|---|
| `FUNC` steps | the shared `DESTINATION 'NONE'` RFC session, governed by `CommitMode` |
| `TABL` / `REGI` steps | the RAP LUW (this request's own transaction) |
| `SUBM` steps | their own internal session and LUW — already committed or not before control returns |

**Known limitation — read before relying on all-or-nothing behaviour.** The call-log's durability
mechanism (built so an aborted batch still leaves an audit trail — see
`docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md` §*Call logging*) writes through a
synchronous RFC, and a synchronous RFC **implicitly commits the caller's own transaction**. That
means: **when a batch aborts, writes made by earlier `TABL`/`REGI` steps in the same call may
already be committed and will NOT be rolled back**, even though the response reports the batch as
aborted. This was found and measured on 2026-09-11 (lessons ledger L-350) and is an **open
decision**, not yet fixed. Until it is resolved: do not assume a failed batch left no trace —
check the actual state of anything a batch wrote, or make your writes idempotent.

**Messages.** All catalogued in `ZFS_TRM_MSG`; see `docs/message-catalog/DS4_100_NIIF.md` for the
full text of every number. The ones you'll meet most: **017** not registered · **018** operation
not permitted · **020** dynamic call failed (the general-purpose runtime failure, carries the real
reason as `&2`) · **022** invalid JSON in the named parameter · **023** unknown field · **024**
bad filter operator · **025** row count over the ceiling · **026** success · **027-032** `SUBM`-
specific (bad program, bad mode, bad selection, missing variant, not authorised, no output
captured) · **033-035** `REGI`-specific (not authorised to register, invalid registration
payload, already registered).

Note: a message substituted into another message's `&2` (as `ExecuteBatch` does when reporting a
step failure) is truncated at 50 characters by T100 substitution — the detail is real but the tail
can be cut. If you need the full text, read the per-step `MessageText` rather than the outer
message.

---

## 13 · Manual testing from inside the SAP system, step by step

Everything below runs in `/IWFND/GW_CLIENT` — no PowerShell, no external tool, nothing installed.
It drives this OData v4 service despite being the classic Gateway Client, and it fetches and
attaches its own CSRF token, so there is no separate token step. Verified working 2026-09-10 and
again 2026-09-11.

### 13.0 · One-time setup, every time you open the transaction

| # | Do | Detail |
|---|---|---|
| 1 | `/IWFND/GW_CLIENT` | |
| 2 | HTTP Method | **POST** (the actions never answer `GET` — only reading the entity set itself, §13.6, uses `GET`) |
| 3 | Protocol | `HTTPS` |
| 4 | Add a header row | `Content-Type` = `application/json` — **mandatory**. The body pane defaults to XML; without this header a well-formed JSON body is parsed as XML and refused with `400 CX_SXML_PARSE_ERROR` |
| 5 | Request URI | paste the path from each step below (host is implicit — you're already inside the system) |
| 6 | Body pane | paste the JSON body from each step below, exactly, including the outer `{ }` |
| 7 | **Execute** (F8) | |
| 8 | Read the result | `~status_code` first, then the body. `ExecStatus` is the field that matters; `RowsJson`/`TablesJson`/`ExportJson` are strings holding *more* JSON — copy them into a second pane or a JSON viewer to read nested content |

Base path for every URI below (already correct for `DS4_100_NIIF`, client 100):

```
/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
```

Action namespace prefix: `com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.`

**One-click liveness check, before testing anything else:** POST to any action with an **empty**
body (`{}`). You should get `400` `/IWBEP/CM_V4H_RUN/006` *"Non nullable action parameter…"* — that
is the action rejecting a missing parameter, which proves the POST reached the action layer at
all. If you instead get a 404, the URI or the `4` in `zfs_sb_dyngateway_o4_api` is wrong.

### 13.1 · `RunQuery` — read a registered table/CDS view

```
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
```
```json
{"TargetName":"T000","FieldsJson":"[\"MANDT\",\"MTEXT\"]","MaxRows":3}
```
**Expect:** `ExecStatus:"S"`, `ResultCount` ≤ 3, `RowsJson` a JSON-array string with `MANDT`/`MTEXT`.

Then try the negative cases, same URI, only the body changes:

| Variation | Body | Expect |
|---|---|---|
| unregistered target | `{"TargetName":"ZFS_GW_UNKNOWN"}` | `E`, msg **017** |
| unknown column | `{"TargetName":"T000","FieldsJson":"[\"ZZNOPE\"]"}` | `E`, msg **023** |
| bad operator | `{"TargetName":"T000","FilterJson":"[{\"Field\":\"MANDT\",\"Op\":\"XX\",\"Low\":\"100\"}]"}` | `E`, msg **024** |
| over the ceiling | `{"TargetName":"T000","MaxRows":999999}` | `E`, msg **025** naming the registered limit (20) |
| literal too long for the column | `{"TargetName":"T000","FilterJson":"[{\"Field\":\"MANDT\",\"Op\":\"EQ\",\"Low\":\"0123456789012345678901234567890123456789012345678901234567890\"}]"}` | `E`, msg **020** *"...exceeds the length of the field..."* — never a dump |

### 13.2 · `CallFunctionModule` — EXPORTING and TABLES, and the difference between them

**EXPORTING comes back automatically:**

```
POST .../DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
```
```json
{"TargetName":"RFC_SYSTEM_INFO","ImportJson":"{}","TablesJson":"{}"}
```
**Expect:** `S`, `ExportJson` contains `RFCSI_EXPORT` and several other fields — none of them were
requested by name.

**TABLES must be named to be bound at all — try both bodies against the same FM:**

```json
{"TargetName":"MONTH_NAMES_GET","ImportJson":"{\"LANGUAGE\":\"E\"}","TablesJson":"{\"MONTH_NAMES\":[]}"}
```
**Expect:** `S`, `TablesJson` contains 12 month rows.

```json
{"TargetName":"MONTH_NAMES_GET","ImportJson":"{\"LANGUAGE\":\"E\"}","TablesJson":"{}"}
```
**Expect:** `E` — the call fails because the mandatory `MONTH_NAMES` TABLES parameter was never
bound. This pair is the whole point of §10: silence on a TABLES parameter is not "empty", it is
"not sent to the FM at all".

**Generic-parameter refusal (no dump, ever):**

```json
{"TargetName":"CONVERSION_EXIT_ALPHA_INPUT","ImportJson":"{\"INPUT\":\"1\"}","TablesJson":"{}"}
```
**Expect:** `E`, msg **020** naming the generic parameter — a `CLIKE`/`ANY` parameter cannot be
bound dynamically, and the refusal is a message, not a short dump.

### 13.3 · `ExecuteTableCrud` — write your own table

`ZFS_T_SLC_DYNGW` itself is registered `TABL`, write-capable — safe to test against because it's
this service's own table, and the row is trivial to delete afterward.

```
POST .../DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteTableCrud?sap-client=100
```
```json
{"TargetName":"ZFS_T_SLC_DYNGW","Operation":"INSERT","ImportJson":"[{\"UUID\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAA0001\",\"CLIENT\":\"100\",\"ENTRY_TYPE\":\"L\",\"TARGET_NAME\":\"GUI_TEST_ROW\"}]"}
```
**Expect:** `S`, `ResultCount:1`. Then try an operation the target does not permit:

```json
{"TargetName":"ZFS_T_SLC_DYNGW","Operation":"TRUNCATE","ImportJson":"[{}]"}
```
**Expect:** `E`, msg **018**.

**Clean up:** delete the test row via SE16N on `ZFS_T_SLC_DYNGW`, or with `ExecuteTableCrud`
`Operation:"DELETE"` naming the same key.

### 13.4 · `ExecuteBatch` — every step kind, one at a time

Same URI throughout: `.../DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100`.
Note `StepsJson` is a **string** containing JSON — the escaping in these bodies is not optional.

**Two `QURY` steps together:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"T000\",\"FieldsJson\":\"[\\\"MANDT\\\"]\",\"MaxRows\":2},{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"FieldsJson\":\"[\\\"ZOTTK_NO\\\"]\",\"MaxRows\":2}]"}
```
**Expect:** `S`, `ResultCount:2`, both steps `EXECSTATUS:"S"` inside `RowsJson`.

**Phase-1 rejection — nothing executes when any step is invalid:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"T000\",\"FieldsJson\":\"[\\\"MANDT\\\"]\",\"MaxRows\":2},{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_GW_UNKNOWN\"}]"}
```
**Expect:** `E`, step 1 reports `EXECSTATUS:"P"` (planned, never run), step 2 `E` msg 017.

**`SUBM` — run a registered report (mode `SALV`, then `NONE`):**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"SALV\",\"MaxRows\":15}]"}
```
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"NONE\"}]"}
```
**Expect:** both `S`. `SALV` mode returns typed rows in the step's `ROWSJSON`; `NONE` returns
`RESULTCOUNT:0` with no rows — it only confirms the report ran.

**`SUBM` security assertion — an unregistered, powerful SAP program must be refused:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"RSUSR003\",\"Operation\":\"SALV\"}]"}
```
**Expect:** `E`, msg **017** — nothing runs. **Do not skip this one**; it is the proof that
registration is the only thing standing between a caller and an arbitrary report.

**`REGI` — register a target and use it in the SAME call** (this is the L-335/L-344 feature —
one call provisions a target that did not exist a moment before):
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"T005\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"MaxRows\\\":5,\\\"Descr\\\":\\\"GUI manual test\\\"}\"},{\"Kind\":\"QURY\",\"TargetName\":\"T005\",\"FieldsJson\":\"[\\\"LAND1\\\"]\",\"MaxRows\":3}]"}
```
**Expect:** overall `S`, step 1 (`REGI`) `S` msg 026, step 2 (`QURY`) `S` with real country-code
rows. `T005` was not in the allow-list before this call.

**`REGI` re-run — the anti-widening guard:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"T005\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"IsActive\\\":\\\"X\\\"}\"}]"}
```
**Expect:** `E`, msg **035** *"Target T005 is already registered"* — `INSERT` never widens.

**`REGI` UPDATE — a partial merge, not a replace:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"T005\",\"Operation\":\"UPDATE\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"MaxRows\\\":11}\"}]"}
```
**Expect:** `S`. Check the row afterward (SE16N on `ZFS_T_SLC_DYNGW`, filter `TARGET_NAME = 'T005'`)
— `MAX_ROWS` is now 11 and `DESCR` still reads `"GUI manual test"`: only the field you sent
changed.

**Clean up `REGI` test data:** `DELETE .../DynGateway(<uuid>)?sap-client=100` using the `T005`
registry row's `Uuid` (read it from `GET .../DynGateway?sap-client=100&$filter=TargetName eq 'T005'`,
§13.6), or delete it via SE16N. Always remove a scratch registration before leaving it for someone
else to trip over.

**The atomicity case — confirm the current, known limitation (L-350), do not assume it is fixed:**
```json
{"CommitMode":"NEVER","StepsJson":"[{\"Kind\":\"TABL\",\"TargetName\":\"ZFS_T_SLC_DYNGW\",\"Operation\":\"INSERT\",\"ImportJson\":\"[{\\\"UUID\\\":\\\"BBBBBBBBBBBBBBBBBBBBBBBBBBBB0001\\\",\\\"CLIENT\\\":\\\"100\\\",\\\"ENTRY_TYPE\\\":\\\"L\\\",\\\"TARGET_NAME\\\":\\\"ATOMICITY_PROBE\\\"}]\"},{\"Kind\":\"TABL\",\"TargetName\":\"ZFS_T_SLC_DYNGW\",\"Operation\":\"INSERT\",\"ImportJson\":\"[{\\\"UUID\\\":\\\"BBBBBBBBBBBBBBBBBBBBBBBBBBBB0001\\\",\\\"CLIENT\\\":\\\"100\\\",\\\"ENTRY_TYPE\\\":\\\"L\\\",\\\"TARGET_NAME\\\":\\\"ATOMICITY_PROBE\\\"}]\"}]"}
```
**Expect:** `~status_code = 400`, body names message 020 and "batch step 2". **Then check
`ZFS_T_SLC_DYNGW` for `TARGET_NAME = 'ATOMICITY_PROBE'` (SE16N) — as of this writing it is
still there**, even though the batch reports itself as aborted. That is L-350: step 1's write is
not rolled back. Delete the row by hand afterward. Re-run this check after L-350 is fixed to
confirm the row is then correctly absent.

### 13.5 · Registry CRUD — register, kill-switch, delete

```
POST .../DynGateway?sap-client=100
```
```json
{"EntryType":"R","TargetKind":"QURY","TargetName":"T006","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":10,"Descr":"GUI manual registry test"}
```
**Expect:** `201 Created`, a `Uuid` in the response. Confirm it works: `RunQuery` §13.1 style
against `T006`. Then flip the kill switch:

```
PATCH .../DynGateway(<uuid-from-above>)?sap-client=100
```
```json
{"IsActive":""}
```
**Expect:** `204`. Repeat the `RunQuery` against `T006` — it now answers `E` msg 017, instantly, no
transport, no restart.

```
DELETE .../DynGateway(<uuid-from-above>)?sap-client=100
```
**Expect:** `204`. This is how you remove every scratch row this section creates.

### 13.6 · Reading the allow-list and the call log

```
GET .../DynGateway?sap-client=100&$filter=EntryType eq 'R'
GET .../DynGateway?sap-client=100&$filter=TargetName eq 'T005'
GET .../DynGateway(<GwUuid-from-any-response-above>)?sap-client=100
```
Switch the method radio back to **GET** for these three — everything else in this section is
`POST`. The third line reads back one call-log row in full, including `RequestJson` and
`ResponseJson` — useful for confirming exactly what a prior test sent and got back without
re-running it.

### 13.7 · Things that trip people up in `/IWFND/GW_CLIENT` specifically

- The body pane's format indicator reads **XML** by default — that's cosmetic once the
  `Content-Type: application/json` header row is set, but it is the first thing to check if a
  well-formed body is refused.
- Watch the service name for the missing `4`: `zfs_sb_dyngateway_o**4**_api`. Dropping it gives a
  404 that reads like an unpublished binding, not a typo.
- `sap-gui` screen automation cannot fill the body pane or the header grid reliably — this
  transaction is for a human at the keyboard, not for scripting. For automated/repeatable testing
  use the PowerShell client in `docs/dyngateway-integration-guide.md` §8 instead.
- Do **not** use *Edit → Default Input V4* — it loads SAP's own V4 demo request over your form,
  resets the method to `GET`, and discards your URI.
- After any `REGI` or registry-CRUD testing, confirm you have removed every scratch row
  (`$filter=TargetName eq '<your test name>'` should come back empty) before treating the system
  as clean for the next person.

---

## 14 · Quick reference

```
Base    : <host>/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
Actions : <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.<Action>
                RunQuery | CallFunctionModule | ExecuteTableCrud | ExecuteBatch
Entity  : <base>/DynGateway                    GET (filter by EntryType) / POST
          <base>/DynGateway(<uuid>)             GET / PATCH / DELETE
Always  : ?sap-client=100 on every URL, X-CSRF-Token on every write/action

Step kinds (ExecuteBatch only): FUNC · TABL · QURY · SUBM · REGI
  SUBM and REGI exist ONLY as batch steps - no single-shot action for either.

MaxRows : registry row wins; 0 = uncapped; caller may only ask for LESS, never more.
FUNC    : EXPORTING always comes back in ExportJson automatically.
          TABLES must be named as [] to be bound at all, even output-only.
Refusal : HTTP 200, ExecStatus='E'.  Batch abort: HTTP 400, reason now in the body.
Atomicity: NOT guaranteed on an aborted batch yet - see §12 / L-350.
```

---

*Companion documents:* `docs/dynamic-gateway-api.md` (full wire contract, field-by-field) ·
`docs/dyngateway-integration-guide.md` (client walkthrough, PowerShell/curl helpers, acceptance
suite) · `docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md` (the design and every
decision behind it) · `worklog/DS4_100_NIIF/2026-09/2026-09-11-1243-gateway-completion.md` (the build that
finished `REGI` and the handler framework) · `lessons/lessons-ledger.md` (`L-309` through `L-356`
cover this service specifically).
