# Dynamic OData Gateway v2 — consumer API reference

Field-by-field wire contract for `ZFS_SB_DYNGW_O4_API`. Built 2026-09-12/13. Every request/response
shape below is taken from `.superpowers/sdd/2026-09-12-dyngw-v2/task-18-report.md`, which is the
live, verified evidence — a real call made against `DS4_100_NIIF` and its real output read back —
not a re-derivation from the design spec. Where a shape is **specified but not yet exercised live**,
this document says so explicitly; do not read a code block here as proof it was run.

See [`dyngw-v2-how-it-works.md`](dyngw-v2-how-it-works.md) for the architecture and design
reasoning, and [`dyngw-v2-integration-guide.md`](dyngw-v2-integration-guide.md) for a setup
walkthrough. This supersedes nothing about v1's own reference (`dynamic-gateway-api.md`) — that
service is separate and still running.

---

## 1 · Endpoint

```
<host>:<port>/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001
```

| Part | Value |
|---|---|
| Binding | `zfs_sb_dyngw_o4_api` |
| Repository segment | `srvd_a2x` |
| Service definition | `zfs_sd_dyngw` |
| Version | `0001` |
| Client | `?sap-client=100` on every call |
| Action namespace | `com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001` |

Entity sets: `CallLog` (read-only), `CallStep` (read-only, composed under `CallLog`), `Registry`
(read/write CRUD), `RegistryHistory` (read-only). Actions are `POST`ed against `CallLog`:

```
POST <base>/CallLog/<ns>.RunQuery?sap-client=100
POST <base>/CallLog/<ns>.CallFunctionModule?sap-client=100
POST <base>/CallLog/<ns>.ExecuteTableCrud?sap-client=100
POST <base>/CallLog/<ns>.SubmitReport?sap-client=100
POST <base>/CallLog/<ns>.RegisterTarget?sap-client=100
POST <base>/CallLog/<ns>.ExecuteBatch?sap-client=100
```

`<ns>` = `com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001`.

## 2 · Auth and CSRF

Same pattern as v1: basic auth, CSRF token fetched from `$metadata` or any `GET`, reused on every
write. Plain `GET`s need no token.

```
GET  <base>/$metadata?sap-client=100
     X-CSRF-Token: Fetch
-> response header x-csrf-token: <token>, plus a session cookie

POST <base>/CallLog/<ns>.<Action>?sap-client=100
     X-CSRF-Token: <token>
     Cookie: <from the GET>
     Content-Type: application/json
```

`abap_boolean` fields (`IsActive`, `AllowRead`, `AllowWrite`) are `Edm.Boolean` over OData V4:
send unquoted `true`/`false`, never `"X"` — `"X"` is refused with HTTP 400
`CX_SXML_PARSE_ERROR` ("Error while parsing an XML stream"), not a clean validation message
(L-475, found live).

## 3 · Per-action request shapes

Each action takes its own typed shape (not one shared flat object, unlike v1) — this is
`ZFS_AE_DynGwQuery`/`Func`/`Table`/`Submit`/`Register`/`Batch`, so a `RunQuery` call never sends
`StepsJson` or `ImportJson`.

### 3.1 `RunQuery`

```json
{ "TargetName":"T000", "FieldsJson":"[\"MANDT\",\"MTEXT\"]",
  "FilterJson":"", "OrderByJson":"", "MaxRows":3, "SkipRows":0, "RequestId":"" }
```

**Proved live** (Task 18 §4): the exact call above → HTTP 200, `ExecStatus:"S"`,
`ResultCount:3`, `RowsJson` carrying `MANDT`/`MTEXT` for clients 000/050/100, plus a `GwUuid`.

Refusal, same shape, unregistered target:

```json
{ "TargetName":"ZZ_UNKNOWN", "FieldsJson":"", "FilterJson":"", "OrderByJson":"",
  "MaxRows":0, "SkipRows":0, "RequestId":"" }
```

**Proved live**: HTTP 200 (not 400), `ExecStatus:"E"`, `ErrorCategory:"CLIENT"` — the **header**
carries message **045** ("Batch aborted at step 1: Target ZZ_UNKNOWN is not registered for the
dynami", truncated at 50 chars), the **step** row carries the real message **017** ("Target
ZZ_UNKNOWN is not registered for the dynamic gateway"). This 045-vs-017 split applies to every
single-shot action's refusal, not just `RunQuery` — see §5.

`SkipRows` pages; a paged read without a stable, explicit sort is refused with message **042**
("Paging requires a stable sort order for &1") — specified, not yet exercised live.

### 3.2 `CallFunctionModule` (`ZFS_AE_DynGwFunc`)

```json
{ "TargetName":"", "ImportJson":"{}", "TablesJson":"{}", "RequestId":"" }
```

`ImportJson` = `{"PARAM":value,...}` for IMPORTING (and, local mode only, CHANGING) parameters.
`TablesJson` = `{"TABPARAM":[...],...}` for TABLES parameters — **not authored live in this
build's own smoke test**; the mechanics (a parameter not named is never bound, `CallMode`
`R`/`L`/auto, generic/`CLIKE` types refused) carry over unchanged from v1's proved behaviour and
are treated here as **built, not independently re-proved for v2**.

### 3.3 `ExecuteTableCrud` (`ZFS_AE_DynGwTable`)

```json
{ "TargetName":"", "Operation":"INSERT", "ImportJson":"[{...}]",
  "GenerateJson":"", "RequestId":"" }
```

`ImportJson` is always an array of row objects. `INSERT` uses `ACCEPTING DUPLICATE KEYS` — see
§6 for why a primary-key collision here is a **partial-write success** (message 048), not a
refusal, and why that matters for the L-350 rollback claim.

**`GenerateJson` — proved live** (Task 8, this dyngw v2 generators build, 2026-09-15). Server-side
field generation for `TABL` writes only. **This field's addition is a deliberate, signed-off
breaking change** — `GenerateJson` is generated `Nullable="false"` like every other action
parameter, so it is now mandatory on the wire for every `ExecuteTableCrud` caller: send it empty
(`""`) when you want no generation, never omit it. **Proved live** (criterion 2): the old shape
with no `GenerateJson` is refused with HTTP 400, `/IWCOR/CX_OD_EP_PARAM_ERROR`, "No value for
mandatory parameter 'GenerateJson' specified".

```json
{
  "Uuid": ["UUID"],
  "NumberRange": [{"Field": "ZOTTK_NO", "Object": "ZFS_OTTK_D"}],
  "SysFields": "AUDIT"
}
```

| Key | Meaning | Status |
|---|---|---|
| `Uuid` | Array of field names, each filled server-side with a fresh `sysuuid_x16` | **Proved live** — criterion 3, `RowsJson` carried the assigned `UUID` |
| `NumberRange` | Array of `{Field, Object}`. `Object` is optional — omitted, it defaults to the registry row's `GenNrObject`; supplied, it must equal it or the step is refused (message 051) | **Proved live** — criterion 3/10, `ZOTTK_NO` assigned from `ZFS_OTTK_D`; criterion 6 refusal also proved |
| `SysFields` | `"AUDIT"` (the five RAP audit fields, by exact name, only where present) or an explicit array `[{"Field":"...","Value":"USER"\|"DATE"\|"TIME"\|"TIMESTAMP"\|"TIMESTAMPL"}]` for a legacy audit block | **Proved live** — criterion 3 (`"AUDIT"` form) and criterion 14 (explicit-shape MODIFY case) |

**Generation is restricted by `Operation` — proved live (criterion 13a/13b):**

| Operation | `Uuid` | `NumberRange` | `SysFields` |
|---|---|---|---|
| `INSERT` | yes | yes | yes |
| `MODIFY` | no (refused, message 052) | no (refused, message 052) | yes |
| `DELETE` | no — `GenerateJson` must be empty (refused, message 052 otherwise) | no | no |

A generated field overwrites whatever the caller's row carried for it — naming a field in
`GenerateJson` is an explicit per-field opt-in.

**Known limits, stated plainly (see §8 for the full list):**
- One number range object per registry row (`GenNrObject`); a target needing two number-ranged
  fields is not supported.
- Generators apply to `TABL` writes only, never `FUNC` imports or `SUBM` selections.
- **A generated `NumberRange` value is NOT reliably outside rollback on this system —
  see L-519 and §9 below; this corrects the original design's claim.**
- **`MODIFY` replaces the whole row from `ImportJson`; it is not a merge — see L-520 and §9. A
  `MODIFY` payload that omits a column, including `LOCAL_CREATED_BY`/`LOCAL_CREATED_AT`, blanks
  it. This is pre-existing `ExecuteTableCrud` behaviour, not something `GenerateJson` introduced,
  but `SysFields:"AUDIT"` on `MODIFY` makes it easy to hit by advertising audit-field handling
  without warning about the rest of the row.**

### 3.4 `SubmitReport` (`ZFS_AE_DynGwSubmit`)

```json
{ "TargetName":"", "Operation":"SALV", "ImportJson":"{\"Variant\":\"\",\"MemoryId\":\"\"}",
  "FilterJson":"[]", "MaxRows":0, "RequestId":"" }
```

Same capture-mode mechanics as v1 (`SALV`/`LIST`/`MEMO`/`NONE`/**`JOB`**, `Operation` as the mode,
`FilterJson` as the selection table). **Not exercised live in v2** — no report is registered as a
`SUBM` target on this system yet; treated as built, not proved for v2 specifically.

### 3.5 `RegisterTarget` (`ZFS_AE_DynGwRegister`)

```json
{ "TargetName":"T001", "Operation":"INSERT",
  "ImportJson":"{\"TargetKind\":\"QURY\",\"Operation\":\"SELECT\",\"IsActive\":true,\"AllowRead\":true,\"MaxRows\":20}",
  "RequestId":"" }
```

Same `INSERT`(default)/`UPDATE`/`UPSERT` split as v1's `REGI` batch step. **Proved live**: two
`REGI` steps registering the same target in one batch fail cleanly in phase 1 with message 035,
before either step touches `ZFS_T_DYN_REG` (Task 20 §2, L-480) — this exercises the
duplicate-registration guard, not `RegisterTarget` as a single-shot action directly, but the guard
is shared code.

### 3.6 `ExecuteBatch` (`ZFS_AE_DynGwBatch`)

```json
{ "CommitMode":"AUTO", "RequestId":"",
  "StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"T000\",\"FieldsJson\":\"[\\\"MANDT\\\"]\",\"MaxRows\":5}]" }
```

`StepsJson` is a **string** containing a JSON array — one level of escaping, not the composition
a real `_Steps` array would have given (deep action parameters don't work on this release, L-472).
Each step object takes the same fields as the matching single-shot action, plus `Kind`
(`QURY`/`FUNC`/`TABL`/`SUBM`/`REGI`).

A `TABL` step gains the same `GenerateJson` field as §3.3, with the identical shape and the same
`Operation` restrictions. **Proved live** (criterion 10): a batch step
`{"Kind":"TABL","Operation":"INSERT",...,"GenerateJson":"{\"NumberRange\":[{\"Field\":\"ZOTTK_NO\"}]}"}`
under `CommitMode AUTO` assigned `ZOTTK_NO:"100052"` — confirming the string-parsed step path is
not subject to the `ExecuteTableCrud` signature break above (`ZFS_AE_DynGwStep` is not itself an
OData action parameter — `StepsJson` is a string parsed against its typed contract, so a step
object omitting `GenerateJson` stays valid even though the single-shot action's own parameter does
not).

**`GenerateJson` under `CommitMode 'NEVER'` — proved live** (criterion 8): a `NumberRange` request
is refused with message **054**, and `NRIV-NRLEVEL` is confirmed unchanged before/after — a dry
run does not draw a number. `Uuid` and `SysFields` are unaffected by `CommitMode`; neither has a
side effect outside the row.

**Proved live** (Task 18 §4, via `GET /CallLog?$expand=_Steps`):

```json
{"CallUuid":"5254001f-e7a2-1fd1-abe2-09245af40000","Action":"RunQuery",
 "RequestId":"5254001FE7A21FD1ABE208EA62178000","ExecStatus":"S","StepCount":1,"ResultCount":3,
 "ExecutedBy":"FS_DEV3","ExecutedAt":"2026-09-13T03:13:07.949017Z",
 "LastChangedAt":"2026-09-13T03:13:16.740316Z",
 "_Steps":[{"StepUuid":"5254001f-e7a2-1fd1-abe2-09245af42000",
            "CallUuid":"5254001f-e7a2-1fd1-abe2-09245af40000","StepIndex":1,"StepKind":"QURY",
            "TargetName":"T000","ExecStatus":"S","Severity":"S","ResultCount":3}]}
```

Confirmed: child `CallUuid` == header `CallUuid`; both UUIDs filled by managed numbering;
`LastChangedAt` populated on create; a blank `RequestId` on the wire comes back **as the row's own
`CallUuid`** (the idempotency rule, L-… see how-it-works §6).

Replay: the same `RequestId`, repeated, → HTTP 200, `Replayed:"X"`, same `GwUuid`, nothing
re-executed, nothing written a second time. **Proved live** (Task 18, not mandated by the brief
but demonstrated).

Malformed `StepsJson` (`"[{not json"`) → HTTP 200, `ExecStatus:"E"`, `ErrorCategory:"CLIENT"`,
message **022**. An empty batch (`"[]"`) → HTTP 200, `ExecStatus:"S"` — a legitimate no-op, not a
refusal. Both are **proved live** and both were the subject of a fix during Task 18 (L-477): the
first fix broke the second case, then both were corrected together.

## 4 · The response — `ZFS_AE_DynGwResult`, shared by all six actions

| Field | Meaning |
|---|---|
| `GwUuid` | the call's `CallUuid` — `GET /CallLog(<uuid>)` to read the full row |
| `ExecStatus` | `S` dispatched · `E` refused or failed |
| `ErrorCategory` | `BUSINESS` \| `CLIENT` \| `AUTH` \| `TARGET` \| blank — see how-it-works §5 |
| `Replayed` | `X` if this was an idempotency hit |
| `MessageId` / `MessageNo` / `MessageText` | always `ZFS_TRM_MSG` |
| `ResultCount` | rows returned/affected/steps run |
| `DurationMs` | server-side time |
| `RowsJson` | `RunQuery` → rows. `ExecuteBatch` → per-step outcome array |
| `ExportJson` | `CallFunctionModule` → EXPORTING (+ CHANGING) |
| `TablesJson` | `CallFunctionModule` → TABLES after the call |
| `StepsJson` | `ExecuteBatch` → the same per-step detail, as a string |
| `IsCommitted` | `'X'` when this call's LUW committed | **Proved live** (dyngw v2 generators, criterion 3/10) |
| `IsRolledBack` | `'X'` when this call's LUW was rolled back | **Proved live** (criterion 9) |

**Named `IsCommitted`/`IsRolledBack`, not `Committed`/`RolledBack`.** The design originally
specified the shorter names; `COMMITTED` is a **CDS reserved word** and the abstract entity
refuses to activate under it (L-515, found live). The `Is*` spelling is what the wire actually
carries — use it, not the design doc's original names.

**A refusal is a normal HTTP 200 with `ExecStatus:"E"`** for every validation-phase failure — not
an HTTP error. **Proved live** for `RunQuery` against an unknown target (§3.1). A **runtime**
failure mid-batch is the one case that is HTTP 400 with a reason in the body (message 045 naming
the step) — carried over from v1's behaviour, not independently re-proved for v2 in this build.

## 5 · The 045/017 header-vs-step split

Because every action is internally a batch, a **single-shot** action's own refusal is reported on
the call header as message **045** ("Batch aborted at step 1: …"), truncated to 50 characters by
the `MESSAGE … INTO` placeholder limit that produced it — the real, specific message (017, 019,
023, …) is on the step row. This is proved live (§3.1) and is not a bug to route around; it is a
direct, disclosed consequence of "every action is a batch under the hood" (L-478). A client that
only reads the header message will see a truncated, generic-sounding text; read the step row (or
`RowsJson`/`StepsJson` on a batch) for the actionable reason.

## 6 · `TABL` INSERT semantics and why they matter for rollback claims

`ExecuteTableCrud`'s `INSERT` uses `INSERT ... ACCEPTING DUPLICATE KEYS`. A **primary-key**
collision on that statement is `sy-subrc = 4`, not an exception — the handler reports this as
`ExecStatus:"S"`, `Severity:"W"`, message **048** ("&1: &2 of &3 row(s) written"), a partial-write
success, and the dispatcher's phase 2 does **not** treat a `W`-severity step as a reason to abort
or roll back. Practically: two `TABL INSERT` steps racing the same primary key in one batch will
**not** demonstrate the batch-abort/rollback path — the first row commits, and the response tells
you honestly that it did, in message text that states both counts. A genuine phase-2 abort
reproduction needs a target whose **secondary unique index** the second step's key violates; that
raises a real exception and does abort/roll back. See how-it-works §7 for what this means for the
L-350 claim specifically.

## 7 · Messages this API can return

`ZFS_TRM_MSG` **017–026** (carried over unchanged from v1's dispatch/registry gates), **027–032**
(`SUBM`), **033–036** (`REGI`), and v2's own **037–049**:

037 budget exceeded · 038 (reserved, replay wording not currently raised — see how-it-works §6 for
the actual replay signal, which is the `Replayed` field, not a message) · 039 self-protection
(reworded 2026-09-13 to be route-neutral — see message catalog) · 040 not authorized · 041 business
error (`BAPIRET2` scan) · 042 paging needs a stable sort · 043 `SUBM` target disqualified at
registration · 044 purge report success · 045 batch aborted at step N · 046 retention age below
the 30-day idempotency floor · 047 the exception class's own T100 default (seeing this means a
raise site forgot its own `textid`) · 048 partial write (`W` severity) · 049 internal gateway error
(the framework's own call sequence broken, not a caller error). Full text and exact consumer per
number: `docs/message-catalog/DS4_100_NIIF.md`. **Verified against the live system for this
report** (`SELECT … FROM t100 WHERE arbgb = 'ZFS_TRM_MSG'`, 2026-09-13): 49 rows, `037`–`049`
match the catalog text exactly, no drift.

**Generators add five more, 050–054, all `E`, all proved live (2026-09-15, this dyngw v2
generators build):**

| No | Text | Raised when | Status |
|---|---|---|---|
| 050 | Generator field &1 does not exist on target &2 | `GenerateJson` names a field the target has not got | **Proved live** — criterion 5 |
| 051 | Number range object &1 is not permitted for target &2 | `Object` supplied but ≠ the registry row's `GenNrObject`, or that column is blank | **Proved live** — criterion 6 |
| 052 | Generation is not permitted for target &1 | `GenerateJson` non-empty but `AllowGen` false, **or** a generator used outside its permitted `Operation` (`Uuid`/`NumberRange` on `MODIFY`, any generator on `DELETE`) | **Proved live** — criterion 7 (`AllowGen` false) and criteria 13a/13b (operation restriction) |
| 053 | Number range &1 could not supply a number for &2 | `CX_NUMBER_RANGES`, interval exhausted, or the drawn value does not fit the target field's width | **Built, not exercised live** — no test forced an exhausted interval or an overflow this session |
| 054 | Number range generation is not allowed with commit mode NEVER | `NumberRange` requested under `CommitMode 'NEVER'` | **Proved live** — criterion 8 |

## 8 · Known limits (repeated here for the reference reader, detailed in how-it-works)

- Action parameters are structurally mandatory, semantically optional; an unwanted field is sent
  empty/zero, never omitted.
- A `TABLES` parameter not named in `TablesJson` is not bound at all, even an output-only one.
- `MaxRows: 0` on a registry row means "no override from this target", never "unlimited".
- A batch mixing an **out-of-LUW** step with an in-LUW write step (`TABL`/`REGI`/local `FUNC`) is
  refused in phase 1. Out-of-LUW means a `SUBM` step **or a `FUNC` step that resolves to call mode
  `'R'`** — which is the default for any remote-enabled FM, because a blank `CALL_MODE` on the
  registry row falls back to `TFDIR-FMODE`. Set the row's `CALL_MODE` to `'L'` to bring a `FUNC`
  step inside the batch's transaction.
- An out-of-LUW step's own effects are outside any rollback — it owns its own LUW. That is every
  `SUBM` step and every `FUNC` step in call mode `'R'`; the step row reports
  `IsOutsideRollback: true`.
- Every `FUNC` target must be registered `AllowWrite: true`, even a read-only FM — `NEEDS_WRITE` is
  unconditionally true for the kind. Deferred, not fixed (L-491); it fails closed.
- `CommitMode` `AUTO` and `ALWAYS` are currently synonyms.
- `ZDYNTGT` must be maintained as single values on every `ZFS_DYNGW` role, never a range spanning
  `*`.
- `/CallLog` requires full `ZDYNTGT` scope (`*`) plus `ACTVT 03`; a target-scoped auditor sees
  `/CallStep` rows but an empty `/CallLog`.
- **One number range object per registry row** (`GenNrObject`, `ZFS_T_DYN_REG`). A target needing
  two number-ranged fields is not supported — the extension point is a child table, not built.
- **Generators apply to `TABL` writes only** — never `FUNC` import parameters or `SUBM` selection
  screens.
- **`GenerateJson`'s `Uuid`/`NumberRange` are refused on `MODIFY` and `DELETE`** (message 052);
  `SysFields` is refused only on `DELETE`. Generating a key on `MODIFY` would silently address a
  different row than the caller means, and a number burned on an update is a number spent for
  nothing.
- **A generated `NumberRange` value is NOT reliably outside rollback on this system** — corrected
  from the original design's claim. See §9 immediately below and L-519.
- **`ExecuteTableCrud MODIFY` is a full-row replace, not a field-level merge** — a data-loss trap,
  documented prominently in §9 below and L-520.

## 9 · Two live findings that correct or sharpen the original generator design

**L-519 — a generated number range value is not reliably outside rollback, correcting §10 of the
original design spec.** The design asserted "a number range is burned permanently and is never
rolled back… standard SAP: buffered, non-transactional" as an unconditional guarantee. Criterion 9
disproved this for `ZFS_OTTK_D` called through `CL_NUMBERRANGE_RUNTIME=>NUMBER_GET`: before an
abort batch, `NRIV-NRLEVEL` read 100052; the batch drew and used `ZOTTK_NO 100053`, then aborted
(`IsRolledBack 'X'`, row confirmed gone); `NRLEVEL` read 100052 again immediately after — unchanged
— and a later, unrelated, fully-successful `INSERT` **drew `100053` a second time**. The number was
rolled back with the row, not burned. Root cause not identified (candidates: `ZFS_OTTK_D`'s own
SNRO buffering setting, or `NUMBER_GET`'s behaviour differing from the classic `NUMBER_GET_NEXT`
FM). **Consequence for the 054 dry-run guard: it still stands, and for the right reason.** The
guard's original justification — "the number is gone forever, so a dry run must not gamble on
it" — no longer holds as an absolute; the corrected justification is that a number range's
buffering is configured per object and per system, so whether a draw survives a rollback is not
knowable from the call alone, and refusing under `CommitMode 'NEVER'` remains the only safe
default. Do not assume this finding generalizes to a different number range object without proving
it the same way (before/after/reuse), per the ledger entry.

**L-520 — `ExecuteTableCrud MODIFY` replaces the whole row from `ImportJson`; it does not merge.**
A caller sending only the columns it wants to change silently blanks every column it omitted,
**`LOCAL_CREATED_BY`/`LOCAL_CREATED_AT` included.** Criterion 14 sent `{UUID, ZOTTK_NO, ZREMARK}`
with `GenerateJson: {"SysFields":"AUDIT"}` — `LOCAL_LAST_CHANGED_AT` advanced correctly, but
`LOCAL_CREATED_AT` reset to zero, `LOCAL_CREATED_BY` blanked, and every other business field not
named in the payload was wiped. This is pre-existing `ExecuteTableCrud`/`MODIFY_TABLE` behaviour —
not introduced by the generator feature — but the feature makes it more dangerous to miss, because
`SysFields:"AUDIT"` on a `MODIFY` advertises audit-field handling without protecting the rest of
the row. **Every caller, human or generated console code, must resend the full row on every
`MODIFY`**, or accept permanent loss of every omitted column. `MODIFY`'s semantics were not
changed by this build; whether `ZCL_FS_DYN_HDL_TABLE` should read-merge before a `MODIFY` is an
open decision for the human, not made here.
