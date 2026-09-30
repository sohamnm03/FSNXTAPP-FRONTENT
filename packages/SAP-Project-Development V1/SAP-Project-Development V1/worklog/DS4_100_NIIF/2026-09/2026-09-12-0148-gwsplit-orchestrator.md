# ZCL_FS_SLC_GW_TXN - transaction orchestrator (Task 4, L-350 fix)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** controller (dyngateway-table-split plan, Task 4)

## Scope

Build `ZCL_FS_SLC_GW_TXN`, a pure decision function `decide( )` plus a thin
`finish( )` that owns ROLLBACK WORK / log write / COMMIT WORK for the dynamic
gateway. This is the fix for L-350: the durable log's synchronous RFC used to
implicitly commit the caller's LUW, so an aborted batch kept the very writes
the abort existed to undo. Also touches `ZCL_FS_SLC_GW_BASE` once, adding
`error_category` to `ty_step_result` and a new `tt_log_step` table type -
the only change to that foundation class in the whole plan. Test-first:
tests written and run red before the implementation exists. Out of scope:
Task 7 wiring (calls `decide()`/`finish()`), Task 5 (uses `error_category`
elsewhere).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does ATC flag COMMIT/ROLLBACK WORK at priority 1/2? | No — one priority-3 finding on `ROLLBACK WORK` ("Critical Statements", msg 0007). COMMIT WORK was not flagged at all. Not a stop condition. | 2026-09-12 |

## Naming gate

```
NAMING: ZCL_FS_SLC_GW_TXN -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

Recorded before the create call, per L-215/non-negotiable rule 1.

## Todo

- [x] 1. Create class shell `ZCL_FS_SLC_GW_TXN` via `adt-mcp` (create)
- [x] 2. Create test include, write 5 failing tests
- [x] 3. Run unit tests, confirm RED (syntax failure expected - error_category missing, decide undefined)
- [x] 4. Add `error_category` + `tt_log_step` to `ZCL_FS_SLC_GW_BASE` in one edit, activate
- [x] 5. Write `decide( )` / `finish( )` implementation
- [x] 6. Activate, confirm nothing left inactive, run unit tests -> GREEN (5/5)
- [x] 7. Run ATC on the new class - stop if priority 1/2 finding on transaction statements (result: 1 priority-3 finding only, continued)
- [x] 8. Read back final source to `.superpowers/sdd/.../source/task-4/`
- [x] 9. Commit worklog

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_SLC_GW_TXN | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | created, written, activated (0 msgs), ATC 0/0/1 |
| ZCL_FS_SLC_GW_BASE | CLAS/OC (existing, modified) | ZFS_SLC_BTP | DS4K907263 | `error_category` + `tt_log_step` added in one edit, activated (0 msgs) |

## Test run — RED (before implementation)

`abap_run_unit_tests` on the class after the test include was written but before Step 4/5:
activation itself failed —

```
abap:/repotree-v1/DS4_100_NIIF/System%20Library/ZFS_SLC_BTP/Source%20Code%20Library/Classes/ZCL_FS_SLC_GW_TXN/zcl_fs_slc_gw_txn.clas.testclasses.abap
  - The data object "RS_RESULT" does not have a component called "ERROR_CATEGORY". [Ln 23, Col 15]
  - Method "DECIDE" is unknown or PROTECTED or PRIVATE. [Ln 31, Col 35]
```

`abap_run_unit_tests` then refused to run at all ("Activate the following objects and run the
unit tests again") — confirming the intended red state exactly as the brief predicted.

## Test run — GREEN (after implementation)

After Step 4 (`ZCL_FS_SLC_GW_BASE` additions) and Step 5 (`decide`/`finish` implementation),
activation of both classes: 0 messages each. `abap_run_unit_tests`: **Overall Test Run Status:
[PASSED]**. `unitTestRun` detail — 5/5 methods, no alerts on any:
`ALL_STEPS_OK_COMMITS`, `BUSINESS_ERROR_DOES_NOT_ABORT`, `COMMIT_NEVER_ALL_OK_ROLLS_BACK`,
`COMMIT_NEVER_STILL_ROLLS_BACK`, `FAILED_STEP_ROLLS_BACK`.

`inactiveObjects` checked after each activation (L-372) — the returned list is identical
before and after this task's activations (pre-existing unrelated inactive objects from other
work: `ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`, two
transport headers) — nothing from this task left inactive.

## ATC result

`abap_atc_run` on `ZCL_FS_SLC_GW_TXN` → 1 finding, **priority 3**: "Critical Statements" /
"Use of ROLLBACK WORK" (message 0007). `COMMIT WORK` was not flagged at all. No priority 1 or 2
finding — the L-350 stop condition did not trigger; continued per the brief.

## Notable friction

`createTestInclude` reported `-32603` twice ("Resource ... could not be successfully created")
but the include had actually been created on the first call — confirmed via `getObjectSource`
on `.../includes/testclasses` returning the stub comment. Proceeded with `setObjectSource`
directly rather than retrying creation a third time.

`activateByName` hit a transient `connect ETIMEDOUT 10.40.1.33:44300` on the very first
activation attempt (empty class skeleton); switched to `adt-mcp abap_activate_objects` with
the `abap:/repotree-v1/...` filePath (L-371) and it activated cleanly. Used
`abap_activate_objects` for that one activation and `activateByName` for the rest once the
change/change server was responsive again.

## Read-back source files

- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-4/ZCL_FS_SLC_GW_TXN.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-4/ZCL_FS_SLC_GW_TXN_TESTS.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-4/ZCL_FS_SLC_GW_BASE.abap`

All three read back from SAP with `getObjectSource` after final activation, matching what SAP
holds.

## Delivery checks

- [x] Pretty Printer (source written pre-formatted; no separate pretty-print pass needed)
- [x] Syntax check clean (activation succeeded with 0 messages on both classes)
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — priority 1 and 2 resolved (none raised; 1 priority-3 accepted)
- [x] ABAP Unit green — 5/5
- [x] Text symbols and selection texts maintained — n/a, no screen elements in this class
- [x] Object list confirmed in the transport (DS4K907263)

## Lessons raised

None new — no human correction or previously-undocumented platform behaviour surfaced beyond
what L-371/L-372 already cover (both of which were given to me as context, not discovered here).
`createTestInclude`'s misleading -32603-despite-success behaviour is worth flagging as a
candidate lesson but is not recorded as an L-nnn here since it was not a human correction; noted
in "Notable friction" above for visibility.

## Fix round 1 (post-review, same day)

Reviewer approved Spec + Quality on the implementation; two defects found in the brief's own
test source (copied verbatim, correctly). Both are test-only fixes — the implementation classes
were not touched:

1. `commit_never_still_rolls_back` fed a failed step, so `decide( )` returned via the error
   branch before the `NEVER` check was ever reached — same path as `failed_step_rolls_back`
   under a different name. Replaced with a version that also asserts `exec_status = 'E'` and
   `failed_step = 1`, pinning that NEVER does not mask a failure's status.
2. The `result( )` test helper's `iv_category TYPE c` (no length) silently truncated
   `'TARGET'`/`'BUSINESS'` to 1 character before reaching `error_category`. Confirmed L-373 by
   trying the inline fix first — `iv_category TYPE c LENGTH 8` in the signature was accepted by
   `setObjectSource` but failed activation (`Unable to interpret "8"`). Fixed with a named
   `TYPES ty_category TYPE c LENGTH 8.` alias instead, same pattern as `ZCL_FS_SLC_GW_BASE`.

Re-activated (0 messages), `inactiveObjects` re-checked (unchanged, nothing from this task
left inactive), full test class re-run: 5/5 passing, no alerts. Archived test file
`.superpowers/sdd/.../source/task-4/ZCL_FS_SLC_GW_TXN_TESTS.abap` overwritten with the
read-back source. Full detail in `task-4-report.md` "Fix round 1" section.

---

# Task 5 — ZCL_FS_SLC_GW_CLASSIFY (error taxonomy classifier)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** controller (dyngateway-table-split plan, Task 5)

## Scope

Build `ZCL_FS_SLC_GW_CLASSIFY`, a pure static classifier turning a dynamic-gateway `symsgno`
or a `bapiret2_t` into a `CLIENT` / `AUTH` / `TARGET` / `BUSINESS` / blank category. Consumes
`zcl_fs_slc_gw_base=>ty_outcome`. Produces `of_message( )` and `of_bapi_return( )`, both
called by Task 7. Test-first: 6 tests written and run red before the implementation exists.
Does not touch `ZCL_FS_SLC_GW_BASE` (per instruction — Task 4 made the only authorised change).

## Naming gate

```
NAMING: ZCL_FS_SLC_GW_CLASSIFY -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

Recorded before the create call, per L-215/non-negotiable rule 1.

## Todo

- [x] 1. Create class shell `ZCL_FS_SLC_GW_CLASSIFY` via `adt-mcp` (create)
- [x] 2. Create test include, write 6 failing tests
- [x] 3. Run unit tests, confirm RED
- [x] 4. Write `of_message( )` / `of_bapi_return( )` implementation
- [x] 5. Activate, confirm nothing left inactive, run unit tests -> GREEN (6/6)
- [x] 6. Run ATC (0 findings)
- [x] 7. Read back final source to `.superpowers/sdd/.../source/task-5-6/`
- [x] 8. Commit worklog

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_SLC_GW_CLASSIFY | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | created, written, activated (0 msgs), ATC 0 findings |

## Test run — RED (before implementation)

`abap_activate_objects` on the class with the test include already written (methods not yet
implemented — shell only had `PUBLIC SECTION. PROTECTED SECTION. PRIVATE SECTION.`):

```
abap:/repotree-v1/.../ZCL_FS_SLC_GW_CLASSIFY/zcl_fs_slc_gw_classify.clas.testclasses.abap
  - Method "OF_MESSAGE" is unknown or PROTECTED or PRIVATE. [Ln 17, Col 37]
  - Method "OF_MESSAGE" is unknown or PROTECTED or PRIVATE. [Ln 22, Col 37]
  - Method "OF_MESSAGE" is unknown or PROTECTED or PRIVATE. [Ln 24, Col 37]
  - Method "OF_MESSAGE" is unknown or PROTECTED or PRIVATE. [Ln 29, Col 37]
  - Method "OF_MESSAGE" is unknown or PROTECTED or PRIVATE. [Ln 34, Col 37]
  - Method "OF_BAPI_RETURN" is unknown or PROTECTED or PRIVATE. [Ln 42, Col 37]
  - Method "OF_BAPI_RETURN" is unknown or PROTECTED or PRIVATE. [Ln 52, Col 37]
```

`abap_run_unit_tests` refused to run at all beforehand ("Activate the following objects and run
the unit tests again") — same red-state shape as Task 4.

## Test run — GREEN (after implementation)

Activation: 0 messages. `abap_run_unit_tests`: **Overall Test Run Status: [PASSED]**.
`unitTestRun` detail — 6/6 methods, no alerts on any: `UNREGISTERED_IS_CLIENT`,
`NOT_PERMITTED_IS_AUTH`, `DYNAMIC_FAILURE_IS_TARGET`, `SUCCESS_IS_BLANK`,
`BAPI_ERROR_IS_BUSINESS`, `BAPI_WARNING_IS_BLANK`.

`inactiveObjects` after activation: only the pre-existing unrelated objects
(`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`, two transport
headers) — nothing from this task left inactive.

## ATC result

`abap_atc_run` on `ZCL_FS_SLC_GW_CLASSIFY` → 0 findings.

## Notable friction — L-373 (new lesson)

`setObjectSource` repeatedly failed with `MCP error -32603: ... An error occured during the save
operation. The changes were not stored.` whenever the source contained a method parameter typed
inline as `TYPE c LENGTH 8` (the exact type the brief specifies for `rv_category`), reproduced
across 7+ retries and bisected down to a single throwaway method. `TYPE string` on the same
parameter saved instantly; `TYPE c LENGTH 8` inside a `CONSTANTS BEGIN OF ... END OF` block (not
a method signature) also saved fine. Fix: declared `TYPES ty_category TYPE c LENGTH 8.` in the
class and used `ty_category` in both method signatures instead of the inline literal — same
runtime type (`c` length 8), so Task 7's callers see no difference. Recorded as **L-373** in
`lessons/lessons-ledger.md`.

## Read-back source files

- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZCL_FS_SLC_GW_CLASSIFY.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZCL_FS_SLC_GW_CLASSIFY_TESTS.abap`

Both read back from SAP with `getObjectSource` after final activation, matching what SAP holds.

## Delivery checks (Task 5)

- [x] Pretty Printer (source written pre-formatted)
- [x] Syntax check clean (activation 0 messages)
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — 0 findings
- [x] ABAP Unit green — 6/6
- [x] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed in the transport (DS4K907263)

---

# Task 6 — ZCL_FS_SLC_GW_IDEM (idempotency / replay detection)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** controller (dyngateway-table-split plan, Task 6)

## Scope

Build `ZCL_FS_SLC_GW_IDEM`, a pure static lookup: given a `RequestId`, return the earlier
`ZFS_T_SLC_GWCALL` row for it, or an initial structure if there was none (blank RequestId
always returns initial — opt-in, preserves pre-idempotency behaviour exactly). Consumes
`zfs_t_slc_gwcall`. Produces `find_replay( )`, called by Task 7 before executing anything.
Also adds the unique index `REQ` on `ZFS_T_SLC_GWCALL(CLIENT, REQUEST_ID)` with null-value
handling (blank `REQUEST_ID` rows unconstrained) via SE11/`sap-gui` — a DDIC technical
artifact, not ABAP source, per the brief's explicit carve-out. Extends `ZFS_AE_DynGwRequest`
(+`RequestId`) and `ZFS_AE_DynGwResponse` (+`Replayed`), both additive. Only one unit test by
design (`blank_id_never_replays`) — hit/miss cases need committed rows, covered later by
Task 12's live test.

## Naming gate

```
NAMING: ZCL_FS_SLC_GW_IDEM -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

Recorded before the create call, per L-215/non-negotiable rule 1.

## Todo

- [x] 1. Create class shell `ZCL_FS_SLC_GW_IDEM` via `adt-mcp` (create)
- [x] 2. Create unique index `REQ` on `ZFS_T_SLC_GWCALL(CLIENT, REQUEST_ID)` via SE11 (sap-gui) —
      unique index created and active; null-value handling for blank `REQUEST_ID` could **not**
      be found/configured — see concern below
- [x] 3. Create test include, write 1 failing test
- [x] 4. Run unit tests, confirm RED
- [x] 5. Write `find_replay( )` implementation
- [x] 6. Extend `ZFS_AE_DynGwRequest` (+RequestId) and `ZFS_AE_DynGwResponse` (+Replayed)
- [x] 7. Activate all three, confirm nothing left inactive, run unit tests -> GREEN (1/1)
- [x] 8. Read back final source to `.superpowers/sdd/.../source/task-5-6/`
- [x] 9. Commit worklog

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_SLC_GW_IDEM | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | created, written, activated (0 msgs) |
| ZFS_T_SLC_GWCALL~REQ | INDX (secondary index on existing table) | ZFS_SLC_BTP | DS4K907263 | created via SE11 (sap-gui), unique, active — see concern below |
| ZFS_AE_DYNGWREQUEST | DDLS/DF (existing, modified) | ZFS_SLC_BTP | DS4K907263 | `RequestId` added, activated (0 msgs) via `activateByName` |
| ZFS_AE_DYNGWRESPONSE | DDLS/DF (existing, modified) | ZFS_SLC_BTP | DS4K907263 | `Replayed` added, activated (0 msgs) via `activateByName` |

## Test run — RED (before implementation)

`abap_activate_objects` on the class with the test include written but `find_replay` not yet
implemented:

```
abap:/repotree-v1/.../ZCL_FS_SLC_GW_IDEM/zcl_fs_slc_gw_idem.clas.testclasses.abap
  - Method "FIND_REPLAY" is unknown or PROTECTED or PRIVATE. [Ln 13, Col 36]
```

`abap_run_unit_tests` beforehand refused to run at all ("Activate the following objects...").

## Test run — GREEN

After implementation: activation 0 messages. `abap_run_unit_tests`: **Overall Test Run Status:
[PASSED]**. `unitTestRun` detail — 1/1 method, no alerts: `BLANK_ID_NEVER_REPLAYS`. Re-run again
after the two CDS abstract-entity changes and index creation — still PASSED (nothing in the
class depends on the new fields or the index; confirms no regression).

`inactiveObjects` after activating the class and both DDL sources in the same pass (class via
`adt-mcp abap_activate_objects` per L-371, both DDL sources via `activateByName` since no
`abap:/repotree-v1/...` filePath was on hand for pre-existing CDS objects from earlier tasks —
`activateByName` accepted the `/sap/bc/adt/...` URL without issue, 0 messages each): only the
four pre-existing unrelated objects remain (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`,
`ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) — nothing from this task left inactive.

## ATC result

`abap_atc_run` on `ZCL_FS_SLC_GW_IDEM` → 1 finding, **priority 3**: "Search problematic
statements for result of SELECT/OPEN CURSOR without ORDER BY" / "SELECT SINGLE is possibly not
unique" (`AMB_SINGLE`). This is exactly the risk the unique index `REQ` is meant to close —
ATC has no visibility into a secondary index and flags any `SELECT SINGLE` on a non-primary-key
`WHERE` conditionally. Not a stop condition (priority 3, same precedent as Task 4's L-350
finding); noted here rather than suppressed.

## Unique index — what was done, and a concern

Created via `sap-gui` SE11 (Table `ZFS_T_SLC_GWCALL` → Change → Indexes tab → Create): index ID
`REQ`, fields `CLIENT` then `REQUEST_ID` (in that order), **Unique** checkbox checked, "On table
buffer only" left unchecked (it's a real secondary DB index, not buffer-only). Saved to
transport DS4K907263, activated via the toolbar Activate (Ctrl+F3) → "Inactive Objects" picker →
selected only the `INDX ZFS_T_SLC_GWCALL REQ` row (the four pre-existing unrelated inactive
objects in that same picker were left unchecked/untouched, confirmed unchanged in
`inactiveObjects` before and after). Table screen afterwards read `Status: Active / Saved`,
`Index ZFS_T_SLC_GWCALL~REQ exists in database system HDB`.

**Concern — could not confirm null-value/partial-index handling for blank `REQUEST_ID`.** I
searched exhaustively for the "index does not apply to all table rows" / null-value-handling
control the brief calls for, and found no such control exposed anywhere in classic SE11 index
maintenance for this transparent table:
- The Index Type box offers only **Unique** and **On table buffer only** — no third option.
- The Index Fields grid has exactly 4 columns (Field name, Short Description, Data Type,
  Length) via `sap_get_column_info` — no nullability/exclusion column.
- The "further attributes" arrow button next to Full text index (`IDX_X_MORE`) is a no-op when
  Standard index is selected (pressed twice; no popup, no screen change) — it's for
  fuzzy/full-text index configuration, not standard/unique indexes.
- `Utilities → Settings...` is generic Workbench UI preferences, unrelated.
- The table's Fields (DEF) tab shows every non-key field, `REQUEST_ID` included, with the same
  unchecked `Key`/`Ini...` flags as every other non-key field — nothing distinguishes it as
  specially nullable at the database level.
- `ZFS_T_SLC_GWCALL` is currently empty (`SELECT COUNT(*)` = 0), so activating the unique index
  could not fail on existing data either way — this proves nothing about future behaviour.

The table is defined via the newer `define table` DDL syntax (`key client : mandt not null;` /
`key call_uuid : sysuuid_x16 not null;` for the key fields; `request_id : abap.char(36);` for
this one, with no `not null`). I considered whether the omitted `not null` on the non-key field
means it is genuinely SQL-nullable on HANA (which would make a blank `RequestId` store as NULL
and never collide, no separate index setting needed) — but the Fields tab shows the identical
unchecked-flag pattern on every other non-key field too, so this is not something distinguishing
`REQUEST_ID`, and I have no tool access to inspect the HANA catalog directly to confirm actual
column nullability. **I did not insert test rows to check empirically** — Task 6's own brief
defers exactly that ("the hit/miss cases need committed rows and are covered by the live
acceptance test in Task 12 Step 4"; "Do not invent database-dependent unit tests"), and I have
no sanctioned write path to insert throwaway log rows outside the real dispatch flow.

**Net position:** the index is created, unique, active, and matches the field spec
(`CLIENT`, `REQUEST_ID`) exactly. What I could **not** do is find or configure a SAP-level
"blank rows are exempt" mechanism through any tool available to me (`sap-gui`/SE11, `adt-mcp`,
`mcp-abap-abap-adt-api`) — if ABAP's Open SQL INSERT path writes an ordinary space-padded value
(not true NULL) for an omitted `RequestId`, this unique index **will** raise a duplicate-key
error the second time any row is written with a blank `REQUEST_ID`, which the brief says will be
most rows. This is reported as a concern rather than silently assumed safe or faked with a
non-unique index. Recommend Task 12's live test explicitly include a two-call, both-blank-
RequestId sequence as an early check, before relying on this index in production traffic.

## Read-back source files

- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZCL_FS_SLC_GW_IDEM.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZCL_FS_SLC_GW_IDEM_TESTS.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZFS_AE_DYNGWREQUEST.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-5-6/ZFS_AE_DYNGWRESPONSE.abap`

All four read back from SAP with `getObjectSource` after final activation, matching what SAP
holds. (The index itself has no ABAP source to read back — it is a DDIC technical artifact;
its definition is recorded above instead.)

## Delivery checks (Task 6)

- [x] Pretty Printer (source written pre-formatted)
- [x] Syntax check clean (activation 0 messages on all three ABAP/CDS objects)
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — 1 priority-3 finding (SELECT SINGLE possibly not unique), accepted,
  same precedent as L-350; no priority 1/2
- [x] ABAP Unit green — 1/1
- [x] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed in the transport (DS4K907263)
- [ ] Unique index blank-value handling — **not confirmed, see concern above**
