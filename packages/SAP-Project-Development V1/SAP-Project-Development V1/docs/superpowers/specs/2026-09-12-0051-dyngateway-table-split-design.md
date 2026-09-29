# Dynamic OData Gateway — splitting registry from call log

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Status:** design approved in chat, spec awaiting human review
- **Requested by:** human (vinit.s@fourthsignal.com)
- **Supersedes:** the single-table model in `docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md`

## 1 · Why

`ZFS_T_SLC_DYNGW` holds two unrelated things in one table, told apart by `ENTRY_TYPE`: an
allow-list (configuration) and a call log (history). The human hit this repeatedly while running
the FTR test case — one registration produced three rows, and the table could not be read without
knowing which of ~20 always-blank columns to ignore.

It is not only a readability problem. A single table can carry only one delivery class, one
buffering setting, one retention policy and one authorization profile, and the two row kinds want
opposite values for all four:

| Property | Allow-list wants | Call log wants |
|---|---|---|
| Delivery class | `C` (customizing) | `L` (transient, never transported) |
| Buffering | fully buffered | never buffered |
| Retention | indefinite | deliberate, with deletion |
| Volume | ~50 rows | unbounded |
| Primary access | `(kind, name)` | `(timestamp)` |
| Who may write | administrators | the runtime only |

The concrete cost today: `ZCL_FS_SLC_GW_REGISTRY=>resolve` runs on **every single dispatch** and
cannot use a table buffer, because the same table is taking constant log inserts.

Two defects are in scope because the split is the natural moment to fix them:

- **L-350** — an aborted batch does not roll its writes back. The durable log's
  `DESTINATION 'NONE'` call is a synchronous RFC, which implicitly commits the caller's LUW,
  committing the very writes the abort exists to undo.
- **L-369** — registering or deleting an allow-list row via `POST`/`DELETE` is not logged at all.
  A target can be registered, used and deregistered with only the usage visible.

## 2 · Decisions taken

| # | Decision | Chosen | By |
|---|---|---|---|
| 1 | Outcome | Design **and** implement | human, 2026-09-12 |
| 2 | OData compatibility | Break freely; design clean | human, 2026-09-12 |
| 3 | Purpose of the log | **Real audit trail** — complete, immutable, deliberate retention | human, 2026-09-12 |
| 4 | L-350 rollback vs durability | **Roll back first, then log** | human, 2026-09-12 |
| 5 | Idempotency key | **In scope** | human, 2026-09-12 |
| 6 | Transaction ownership | Move out of the RAP saver into an explicit orchestrator | human, 2026-09-12 |

Decision 3 is what makes `GWREGH` (§3.2) mandatory rather than optional: an audit trail that omits
changes to the permission list is not an audit trail.

## 3 · Data model

Four tables replace one. Every column below belongs to exactly one of them; nothing is blank
because it belongs to the other kind of row.

### 3.1 · `ZFS_T_SLC_GWREG` — the allow-list

Configuration. Small, read on every dispatch, changed rarely.

| Field | Type | Purpose |
|---|---|---|
| `client` | `mandt` | key |
| `reg_uuid` | `sysuuid_x16` | key |
| `target_kind` | `char(4)` | `FUNC` \| `TABL` \| `QURY` \| `SUBM` |
| `target_name` | `char(30)` | FM / table / CDS view / report |
| `operation` | `char(10)` | pins the row to one operation; blank = any |
| `is_active` | `char(1)` | kill switch |
| `allow_read` / `allow_write` | `char(1)` | the two permissions |
| `call_mode` | `char(1)` | `FUNC` only: `R` \| `L` \| blank = auto |
| `max_rows` | `int4` | row ceiling; `0` = none |
| `log_level` | `char(1)` | `A` \| `E` \| `N` |
| `descr` | `char(60)` | free text |
| + 5 audit fields + RAP admin fields | | per `docs/ddic-table-template.md` |

- **Delivery class `C`.** These rows are configuration and *should* travel on a customizing
  request, which is a deliberate change from today's `A`. It does not weaken L-335's warning —
  what a QA box may reach still has to be decided per system — but it makes moving a reviewed
  allow-list between systems possible instead of forbidden.
- **Fully buffered**, unique index on `(client, target_kind, target_name)`.
- Buffer invalidation on write is acceptable: writes are rare and administrative.

### 3.2 · `ZFS_T_SLC_GWREGH` — allow-list change history

Append-only. One row per change to `GWREG`, whatever route made it — OData `POST`/`PATCH`/`DELETE`
or a `REGI` batch step. This closes L-369.

| Field | Type | Purpose |
|---|---|---|
| `client`, `hist_uuid` | | key |
| `reg_uuid` | `sysuuid_x16` | the registry row affected |
| `change_type` | `char(1)` | `I` insert · `U` update · `D` delete |
| `target_kind`, `target_name` | | denormalised, so a deleted row is still identifiable |
| `before_json` / `after_json` | `string` | the row either side of the change; `before` empty on `I`, `after` empty on `D` |
| `source` | `char(4)` | `ODAT` (CRUD) \| `REGI` (batch step) |
| `call_uuid` | `sysuuid_x16` | the call that caused it, when there was one |
| `changed_by` / `changed_at` | | who and when |

Delivery class `A`. No delete exposed over OData: history is not editable.

### 3.3 · `ZFS_T_SLC_GWCALL` — one row per HTTP call

| Field | Type | Purpose |
|---|---|---|
| `client`, `call_uuid` | | key. `call_uuid` is the `GwUuid` returned to the caller |
| `action` | `char(20)` | `RunQuery` \| `ExecuteTableCrud` \| `CallFunctionModule` \| `ExecuteBatch` |
| `request_id` | `char(36)` | caller-supplied idempotency key (§5.3); blank if not sent |
| `commit_mode` | `char(6)` | `AUTO` \| `ALWAYS` \| `NEVER` |
| `exec_status` | `char(1)` | `S` \| `E` |
| `error_category` | `char(8)` | §5.2 |
| `message_id`, `message_no`, `message_text` | | the outcome |
| `step_count` | `int4` | steps run |
| `result_count` | `int4` | rows returned / affected |
| `duration_ms` | `int4` | total server-side time |
| `request_json` | `string` | the request as received, capped (§6) |
| `request_truncated` | `char(1)` | `X` if the cap was hit |
| `executed_by`, `executed_at` | | who and when |

Delivery class `L`. Not buffered. Index on `(client, executed_at)` and `(client, executed_by)`.
A **unique** index on `(client, request_id)` where `request_id` is non-blank enforces idempotency.

### 3.4 · `ZFS_T_SLC_GWSTEP` — one row per step

Composition child of `GWCALL`. A single-shot action writes exactly one step row, so there is no
special case: every call has ≥ 1 step.

| Field | Type | Purpose |
|---|---|---|
| `client`, `step_uuid` | | key |
| `call_uuid` | `sysuuid_x16` | **FK to `GWCALL`** |
| `step_index` | `int4` | 1..n, always ≥ 1 |
| `step_kind` | `char(4)` | `FUNC` \| `TABL` \| `QURY` \| `SUBM` \| `REGI` |
| `target_name`, `operation` | | what it addressed |
| `reg_uuid` | `sysuuid_x16` | which allow-list row authorised it |
| `exec_status` | `char(1)` | `S` \| `E` \| `P` (planned, never executed) |
| `severity` | `char(1)` | `S` \| `W` \| `E` \| `A` — §5.2 |
| `error_category` | `char(8)` | §5.2 |
| `message_id`, `message_no`, `message_text` | | the outcome |
| `result_count`, `duration_ms` | `int4` | |
| `response_json` | `string` | this step's result, capped (§6) |
| `response_truncated` | `char(1)` | `X` if the cap was hit |

Delivery class `L`. Index on `(client, call_uuid, step_index)`.

### 3.5 · What disappears

`ENTRY_TYPE`; `TARGET_KIND = 'BTCH'`; `STEP_INDEX = 0` meaning "not a step"; `PHASE`; the
registry columns sitting blank on every log row and the log columns blank on every registry row.

Counting calls stops needing a filter: one row in `GWCALL` is one call.

## 4 · OData surface

The service definition `ZFS_SD_DYNGATEWAY` and binding `ZFS_SB_DYNGATEWAY_O4_API` are **reused**,
so the base URL is unchanged.

```
/Registry                      CRUD        the allow-list
/RegistryHistory               read-only   who changed what, when
/CallLog                       read-only   one entity per call
/CallLog(<uuid>)?$expand=_Steps            header and every step, one request
/CallStep                      read-only   steps, for cross-call queries
```

`/DynGateway` is retired. Decision 2 permits this.

**The four actions keep their exact URLs and their ten-field payloads.** Every saved test payload
in `worklog/DS4_100_NIIF/manual-test-payloads-2026-09-11-1237.txt` continues to work unchanged, except
that the response gains the fields in §5.

The actions bind to the `CallLog` collection — invoking one creates a call-log entry, which is
coherent. **Build-time risk:** RAP may refuse actions that write on a read-only projection. If it
does, the fallback is a dedicated action-carrier entity over a single-row source, with the same
action names and URLs. This must be settled with `abap_creation-run_validation` before any
object is created, because a rejected shell cannot be removed (`deleteObject` is denied
project-wide) and would be orphaned permanently — the trap recorded for `ZFS_I_DynGateway`.

## 5 · Transactions and error handling

### 5.1 · One owner for the transaction

The defect in L-350 is not the RFC itself but that nothing owned the LUW. A new orchestrator
`ZCL_FS_SLC_GW_TXN` owns it, and no component below it touches transaction control:

```
phase 1  validate every step            nothing written; fail fast on any step
phase 2  execute steps in order
         on failure:
             ROLLBACK WORK              the work is undone; the LUW is now clean
             write GWCALL + GWSTEP      nothing uncommitted remains to be wrongly committed
             COMMIT WORK                commits the log only
         on success:
             write GWCALL + GWSTEP
             COMMIT WORK
return HTTP 200 with ExecStatus
```

Because the rollback precedes the log write, L-350's hazard cannot recur: there is no pending work
for any implicit commit to catch. The `DESTINATION 'NONE'` durable-emit mechanism is **deleted**,
which also removes one session round-trip from every aborted call.

This is the pattern SAP's own Application Log uses (`ROLLBACK WORK` → `BAL_DB_SAVE` →
`COMMIT WORK`). It is only safe **outside** a RAP behaviour implementation — `COMMIT`/`ROLLBACK
WORK` inside one breaks RAP's transactional contract and will be flagged by ATC. Hence decision 6:
the actions stop staging work in RAP's buffer and stop signalling failure through `failed` /
`reported`; `ZCL_FS_SLC_GW_TXN` decides the outcome and reports it in the payload.

**Unchanged and still true:** a `SUBM` step owns its own session and LUW entirely, so it is not
covered by this rollback. That has always been the case and remains documented as a limit.

### 5.2 · Error taxonomy

Every step row carries `severity` and `error_category`, so "whose problem is this?" is a column,
not an exercise in reading message text:

| `error_category` | Meaning | Example | Who fixes it |
|---|---|---|---|
| *(blank)* | success | | — |
| `CLIENT` | the request was wrong | unknown target (017), bad operator (024), malformed JSON (022) | the caller |
| `AUTH` | not permitted | operation not allowed (018), not authorised to register (033) | an administrator |
| `TARGET` | the target failed technically | FM dumped, report died, `sy-subrc <> 0` (020) | the ABAP developer |
| `BUSINESS` | the target ran and said no | BAPI returned `E` in `RETURN` | the business user |

`BUSINESS` is the category that does not exist today and causes the most confusion: a BAPI that
fails still reports `ExecStatus='S'`, because the dispatch worked. With the taxonomy, the call
row's `error_category = 'BUSINESS'` says so directly, while `exec_status` keeps its existing
meaning for compatibility.

**To be unambiguous about the combination**, because the two columns answer different questions:

| `exec_status` | `error_category` | Means |
|---|---|---|
| `S` | *(blank)* | dispatched, and the target was happy |
| `S` | `BUSINESS` | **dispatched fine, but the target refused the business request** — a BAPI that returned `E` in `RETURN`. Nothing technical went wrong |
| `E` | `CLIENT` / `AUTH` | the gateway refused it; the target was never reached |
| `E` | `TARGET` | the gateway tried and the target failed technically |

So `exec_status = 'S'` continues to mean exactly what it means today — the dispatch worked — and
`error_category` is the new, separate answer to "did the thing I asked for actually happen?".
Callers who ignore `error_category` behave exactly as they do now.

**Determining `BUSINESS`:** for a `FUNC` step, if a bound `TABLES` parameter named `RETURN` typed
`BAPIRET2` comes back containing any row with `TYPE` in (`E`, `A`), the step is marked
`severity = 'E'`, `error_category = 'BUSINESS'`. This is a read of the result, not a policy — it
does not roll anything back on its own, because whether a BAPI error should abort the batch is
the caller's decision via `CommitMode`.

### 5.3 · Idempotency

A creating BAPI behind a network timeout is today unanswerable: the caller cannot tell whether the
deal was created, and retrying risks a duplicate FTR transaction.

- The request body gains an optional **`RequestId`** (client-generated, ≤ 36 chars).
- On arrival, if a `GWCALL` row already exists with that `request_id`, the gateway **does not
  execute anything**. It returns that call's stored outcome, with `Replayed = 'X'` in the
  response.
- Uniqueness is enforced by a unique database index, not by a `SELECT`-then-`INSERT`, so two
  concurrent retries cannot both execute.
- Omitting `RequestId` preserves today's behaviour exactly. It is opt-in.

Retention interacts with this: once a call row is deleted, its `RequestId` no longer protects
against a replay. The deletion report (§6) must not delete rows younger than the idempotency
window, and that window is a parameter with a documented default of 30 days.

### 5.4 · HTTP status discipline

One rule: **HTTP status describes the protocol outcome; the payload describes the business
outcome.**

| Situation | Status |
|---|---|
| Understood and processed, whatever the result | `200` + `ExecStatus` |
| Malformed request the service cannot parse | `400` |
| Not authenticated / not authorised | `401` / `403` |
| Unknown URL | `404` |

Today an aborted batch returns `400`, which conflates a business failure with a protocol failure.
Under this design it returns `200` with `ExecStatus='E'` and per-step detail. This is a contract
change, permitted by decision 2, and it removes the "empty body / unreadable abort" class of
problem for good.

## 6 · Performance

| Change | Why it matters |
|---|---|
| `GWREG` fully buffered | `resolve` runs on every dispatch. Impossible today because the table also takes log inserts. **The largest single win, and only the split unlocks it.** |
| Index `GWSTEP(client, call_uuid, step_index)` | makes `$expand=_Steps` a keyed read rather than a scan |
| One array `INSERT` per call for step rows | instead of row-by-row |
| Payload cap, default **8 KB**, with `*_truncated` flag | `request_json` / `response_json` are unbounded `string` today; this is what eventually hurts an audit table |
| Durable-emit RFC deleted | removes a session round-trip from the abort path |
| Retention report | a deletion program with an age parameter, respecting the idempotency window (§5.3) |

**Deliberately not done** (YAGNI): asynchronous logging, a separate payload table, partitioning.
The load is human-driven testing. If the log later grows, offloading payloads to a fifth table is
the next step — not now.

## 7 · Migration

1. Create the four tables alongside the existing one. Nothing is dropped in step 1.
2. Copy `ENTRY_TYPE='R'` rows into `GWREG`, preserving `reg_uuid` from the old `uuid` so existing
   references stay valid.
3. **Call-log rows are not migrated.** They are debugging history from testing, the human has
   emptied the table repeatedly, and the old row shape does not map cleanly onto the new
   header/step split. This is a deliberate loss and is recorded here so it is not a surprise.
4. Point the classes at the new tables; retire `/DynGateway`; republish the binding with
   `scripts/sap-gui-publish-service.py --group-id zfs_sb_dyngateway_o4_api --yes`.
5. Re-run `scripts/gateway-regression.ps1` plus the acceptance suite in
   `docs/dyngateway-integration-guide.md` §12.
6. Leave `ZFS_T_SLC_DYNGW` in place, unused, until the human confirms the new model. Delete it in
   a later, separate activity — `deleteObject` is denied project-wide, so removal needs its own
   decision.

## 8 · Naming gate

Recorded before any create call, per `docs/naming-conventions.md`:

```
NAMING: ZFS_T_SLC_GWREG      -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (15 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWREGH     -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWCALL     -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWSTEP     -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZCL_FS_SLC_GW_TXN    -> matches "Class | ZCL_FS_<AREA>_<NAME>", AREA=SLC
NAMING: ZFS_R_DynGwRegTP     -> matches "Restricted reuse view | ZFS_R_<Entity>" (RAP BO root)
NAMING: ZFS_C_DynGwRegTP     -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZBP_FS_DYNGWREGTP    -> matches "Behavior pool | ZBP_FS_<Entity>" (upper case)
NAMING: ZFS_R_DynGwCallTP    -> matches "Restricted reuse view | ZFS_R_<Entity>" (RAP BO root)
NAMING: ZFS_C_DynGwCallTP    -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZBP_FS_DYNGWCALLTP   -> matches "Behavior pool | ZBP_FS_<Entity>" (upper case)
NAMING: ZFS_R_DynGwStepTP    -> matches "Restricted reuse view | ZFS_R_<Entity>" (composition child)
NAMING: ZFS_C_DynGwStepTP    -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZFS_I_DynGwRegHist   -> matches "Interface view | ZFS_I_<Entity>" (read-only, no TP)
```

`ZFS_SD_DYNGATEWAY` and `ZFS_SB_DYNGATEWAY_O4_API` are reused, already conformant.

Lock objects are needed only if a BO is generated as managed with optimistic locking; the current
BO is unmanaged. `EZFS_T_GWREG` (12 chars) is reserved should one be required — L-242's 16-char
cap is not a risk at this length.

## 9 · Security

- `GWREG` write access stays the real control. Whoever can `POST /Registry` decides what the
  service may reach, including registering a `SUBM` target.
- `/RegistryHistory`, `/CallLog` and `/CallStep` are **read-only over OData**. No update, no
  delete. An audit trail that the audited party can edit is not one.
- Deletion happens only through the retention report (§6), which is a separate program with its
  own authorisation.
- The service user's own authorisations remain the effective ceiling on everything.

## 10 · Open risks

| # | Risk | Handling |
|---|---|---|
| 1 | RAP may refuse write actions on a read-only projection | validate with `run_validation` **before** creating anything (§4); fallback is a dedicated action-carrier entity |
| 2 | `ROLLBACK WORK` may still be flagged by ATC even outside the behaviour pool | run ATC early on `ZCL_FS_SLC_GW_TXN`; if flagged, the fallback is decision 4 option (a) from L-350 — accept lost failure logs — and that returns to the human |
| 3 | Delivery class change `A` → `C` on the registry | new table, so no conversion; but confirm with the human that allow-list rows *should* travel on customizing requests |
| 4 | Existing docs describe `/DynGateway` extensively | four docs need editing, not rewriting; scoped into the implementation plan |
| 5 | Transport split (L-355) | the new objects are new, so they can be placed on one request deliberately — unlike `ZFS_TRM_MSG`, which is already locked elsewhere |

## 11 · Suggested implementation phasing

This is large for one sitting, and the pieces have a natural order with a working system at the
end of each. The implementation plan should follow it, and each phase should end activated and
regression-tested rather than half-built:

| Phase | Delivers | Ends with |
|---|---|---|
| 1 | The four tables + `GWREG` migration + the Registry BO | allow-list served from its own buffered table; actions still logging the old way |
| 2 | `ZCL_FS_SLC_GW_TXN`, the CallLog/CallStep BOs, the rollback fix, durable-emit deleted | L-350 closed; logging on the new tables |
| 3 | `GWREGH` change history | L-369 closed; audit trail complete |
| 4 | Error taxonomy + HTTP status discipline | §5.2, §5.4 |
| 5 | Idempotency + retention report | §5.3, §6 |
| 6 | Documentation updates across the four gateway docs | contract matches reality |

Phases 1 and 2 are the ones that must not be split further — between them the service would be
logging to two places at once.

## 12 · Out of scope

Retiring `ZFS_T_SLC_DYNGW`; changing the four actions' request payloads beyond adding the optional
`RequestId`; anything about `SUBM` capture modes; the `AUTH` registration policy switch
(`ZCL_FS_SLC_GW_REGPOL` stays `OPEN`, and its exit criterion is unchanged).
