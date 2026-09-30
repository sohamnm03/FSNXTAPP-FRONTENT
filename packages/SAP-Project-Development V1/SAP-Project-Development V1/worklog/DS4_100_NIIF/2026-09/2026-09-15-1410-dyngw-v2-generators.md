# dyngw v2 generators — Phase 1: transport, worklog, and the number-range fact-check

- **Date:** 2026-09-15
- **Started:** 14:10
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907300
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Task 1 of a 9-task plan (`docs/superpowers/plans/2026-09-15-1410-dyngw-v2-generators.md`, spec
`docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md`) that adds server-side field
generators (UUID, number range, audit fields) to the existing dynamic gateway v2
(`ZFS_SB_DYNGW_O4_API`, package `ZFS_DYN_GW`). This task builds **nothing** — it confirms the SAP
destination, opens a transport for all eight later tasks, and fact-checks whether number range
object `ZFS_OTTK_D` can actually supply numbers for `ZOTTK_NO` in table `ZFS_SLC_OTTK_BTP`
(the premise the whole "number-range generator" feature rests on). Out of scope: any ABAP object,
message, or registry change — those belong to Tasks 2–9.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Transport `DS4K907300` was created by Task 1 in error, before it was known that the gateway's objects are already CTS-locked under `DS4K907263`. `E071` confirms it holds **zero objects**. Delete it? | **Human will delete it themselves, later.** No agent is to delete it. It is inert and blocks nothing in the meantime. | 2026-09-15 |
| 2 | Spec §15 Q2 — console rows created in Phase 2 will draw `ZOTTK_NO` from the live `ZFS_OTTK_D` sequence, and a burned number cannot be recovered (L-284). Is test data landing in the real number space intended, or should Phase 2 use a separate test band? | **Answered: yes, the live sequence is correct.** The generator should draw exactly as the real BO would — that is the entire point of the feature. Phase 2's console will therefore create rows indistinguishable from BO-created ones. | 2026-09-15 (Task 9) |
| 3 | Messages 050–054 landed on request `DS4K907018` (task `DS4K907194`), **not** on the gateway's `DS4K907263`, because `ZFS_TRM_MSG` already carried a lock there and ADT silently files under an existing lock. Matches the precedent recorded for the 2026-09-13 wave. Should the two requests be released together? | *for the human* — if `DS4K907018` is not released alongside `DS4K907263`, the importing system gets code raising messages that do not exist there yet. | |

## Naming gate

No objects created this task — only a transport (not a named repository object) and reads.
Naming gate applies from Task 2 onward.

## Step 1 — Confirm the destination

`mcp__adt-mcp__abap_list_destinations` returned exactly one destination: `DS4_100_NIIF`. No
ambiguity with `DS4_100_TFSIN` (not listed / disabled). `mcp-abap-abap-adt-api` `healthcheck`
returned `{"status":"healthy"}`. Proceeded on `DS4_100_NIIF`.

## Step 2 — Transport

Created via `mcp__adt-mcp__abap_transport-create` (destination `DS4_100_NIIF`, package
`ZFS_DYN_GW`, description "dyngw v2 server-side field generators", `isCreation: false` — this is
a workbench transport for later changes, not a new-object transport):

**Transport: `DS4K907300`**

This is the transport every later task (2–9) must reuse.

## Steps 3–5 — `ZFS_OTTK_D` number-range fact-check

**Step 3 — `NRIV` intervals for `ZFS_OTTK_D`** (`mcp-abap-abap-adt-api` `runQuery`):

```
SELECT object, subobject, nrrangenr, fromnumber, tonumber, nrlevel, externind
  FROM nriv WHERE object = 'ZFS_OTTK_D'
```

| OBJECT | NRRANGENR | FROMNUMBER | TONUMBER | NRLEVEL |
|---|---|---|---|---|
| ZFS_OTTK_D | 01 | 100001 | 999999 | 100050 |

(One row only; `EXTERNIND` not set — internal number assignment, consistent with a generator
drawing the next number itself.)

**Step 4 — live key values in `ZFS_SLC_OTTK_BTP`** (`mcp-abap-abap-adt-api` `runQuery`):

```
SELECT MAX( zottk_no ) AS max_no, MIN( zottk_no ) AS min_no, COUNT(*) AS rows
  FROM zfs_slc_ottk_btp
```

`MAX_NO = 100050`, `MIN_NO = 100049`, `ROWS = 2`.

**Step 5 — the three conditions, judged against the actual values above:**

1. **At least one interval exists for `ZFS_OTTK_D`.** PASS — one row, interval `01`,
   `100001`–`999999`.
2. **`NRLEVEL` is at or above `MAX(zottk_no)`.** PASS — `NRLEVEL = 100050`, `MAX(zottk_no) =
   100050`. Equal, so the next number issued (`100051`) does not collide with the existing max
   (`100050`); the level is exactly caught up with the live data, not behind it.
3. **`TONUMBER` fits `ZOTTK_NO`'s DDIC width.** Read data element `ZSGSLCDT_OTNO` via
   `getObjectSource` on `/sap/bc/adt/ddic/dataelements/zsgslcdt_otno`: built-in type `CHAR`,
   domain `CHAR6`, `dataTypeLength = 000006` (6 characters). `TONUMBER = '999999'` is exactly 6
   characters. PASS — fits with no headroom to spare (the interval's ceiling is the field's
   ceiling), which is fine but worth flagging: this interval cannot be widened without also
   widening `ZSGSLCDT_OTNO` (currently 393,949 numbers of headroom remain before `999999` is
   reached, at 2 rows consumed so far).

**Verdict: all three conditions hold — `ZFS_OTTK_D` can serve `ZOTTK_NO` on
`ZFS_SLC_OTTK_BTP`.** The generator design in Tasks 2–9 may proceed on this number range object.

## Todo

- [x] 1. Transport, worklog, and the number-range fact-check (this task) — `DS4K907300` created,
      `ZFS_OTTK_D` verified fit.
- [x] 2. Messages 050–054 (`ZFS_TRM_MSG`).
- [x] 3. Registry columns (`ZFS_T_DYN_REG`: `ALLOW_GEN` / `GEN_NR_OBJECT`) — done on transport
      `DS4K907263` / task `DS4K907264` (not `DS4K907300`), see below.
- [x] 4. Handler contract — `generatejson` on the step, `consumes_number_range` on the interface.
- [x] 5. `ZCL_FS_DYN_GENERATE` and its unit tests — created on `DS4K907263`, 10 of 10 unit
      tests green, ATC clean of priority 1/2. **Re-verified independently** (see Task 5
      verification note below): `unitTestRun` shows all 10 test methods with empty `alerts`,
      and a fresh `abap_atc_run`/`abap_atc_get_result` returned the identical single priority-3
      finding and no priority 1/2.
- [x] 6. Wire the generator into `ZCL_FS_DYN_HDL_TABLE` — activated clean, whole-package
      `unitTestRun` green (all classes, all `alerts: []`), including `LTC_GENERATE`'s 11 tests.
- [x] 7. Contract fields and the dispatcher guard — `GenerateJson` on `ExecuteTableCrud` (the
      signed-off breaking change) and on the batch step entity, `Committed`/`RolledBack` (shipped as
      `IsCommitted`/`IsRolledBack` — `COMMITTED` is a CDS reserved word) on every action result, the
      054 dry-run guard in `ZCL_FS_DYN_DISPATCH`, and a pre-existing gap in `LCL_GUARDED_HANDLER`
      (inside `ZCL_FS_DYN_FACTORY`) found and fixed along the way — see the Task 7 section below.
- [x] 8. Publish and prove it live — **10 of 14 criteria PASS, 3 FAIL/FAIL-partial (9, 11, 14)**,
      full detail below and in `.superpowers/sdd/2026-09-15-1410-dyngw-v2-generators/task-8-report.md`.
- [x] 9. Documentation, ledger, and the stale-rule correction.

## Task 8 — Publish and prove it live

**Service:** `ZFS_SB_DYNGW_O4_API` was already published when this task started —
`sap-gui-publish-service.py --group-id ZFS_SB_DYNGW_O4_API` reported "not in the unpublished list",
and `$metadata` already carried `GenerateJson`/`IsCommitted`/`IsRolledBack`, so no republish was
needed. No object created or changed; no transport used.

**Registry (emptied before this run, per the brief):**

| Target | Kind | Route | Result |
|---|---|---|---|
| `ZFS_SLC_OTTK_BTP` | TABL | `RegisterTarget` (IsActive/AllowRead/AllowWrite) then `PATCH /Registry` for `AllowGen`/`GenNrObject` | Two-step — see criterion 11 below, `RegisterTarget` alone refuses the AllowGen/GenNrObject keys |
| `ZFS_T_TRM_PROBE` | TABL | `RegisterTarget`, AllowWrite true, no AllowGen | Clean |
| `NUMBER_GET_NEXT` | FUNC | `RegisterTarget`, AllowWrite true, `CallMode:"L"` | Clean |

### Criteria (spec section 12)

| # | Check | Result |
|---|---|---|
| 1 | `ZFS_OTTK_D` interval vs existing data | PASS — `NRLEVEL`/live max both 100050 |
| 2 | Old-shape `ExecuteTableCrud` | PASS — HTTP 400, non-nullable `GenerateJson` |
| 3 | `INSERT` with all three generators | PASS — `ZOTTK_NO:"100051"`, `IsCommitted 'X'` |
| 4 | Independent re-read | PASS — matches exactly, audit fields populated |
| 5 | Bad generator field | PASS — 050 |
| 6 | Wrong NR object | PASS — 051 |
| 7 | `AllowGen` false | PASS — 052 |
| 8 | `CommitMode NEVER` dry-run guard | PASS — 054, `NRLEVEL` unchanged (100051 both sides) |
| 9 | `IsCommitted`/`IsRolledBack` on abort | **FAIL (partial)** — status fields and row-rollback correct, but the number range was NOT durably burned (see L-519) |
| 10 | `GenerateJson` inside `ExecuteBatch` | PASS — `ZOTTK_NO:"100052"` |
| 11 | `REGI` sets `AllowGen`/`GenNrObject` | **FAIL, then FIXED — see Fix round 1** — `RegisterTarget` originally refused both as unknown fields (034); fixed live in `ZCL_FS_DYN_HDL_REGI`, then re-run for real and PASSED |
| 12 | Self-protection on `ZFS_T_DYN_REG` | PASS — 039, nothing written (re-confirmed after the fix, still PASS) |
| 13 | Generator on MODIFY/DELETE | PASS — both refused 052 |
| 14 | `MODIFY` with `SysFields` only | **FAIL** — `LOCAL_LAST_CHANGED_AT` advanced correctly, but `MODIFY` replaced the whole row and wiped `LOCAL_CREATED_AT`/`LOCAL_CREATED_BY` plus every unlisted business field (see L-520). Not addressed in fix round 1 (out of scope per the coordinator's instructions). |

**Lessons raised (same turn):** L-517 (RegisterTarget couldn't set the two new columns — **fixed**,
see below), L-519 (number range survives-rollback guarantee does not hold as implemented for
`ZFS_OTTK_D` — still open), L-520 (`MODIFY` is full-row replace, not a merge, and the generator
doesn't protect create-audit columns — still open). **L-518 was wrong** (claimed the `/Registry`
entity path bypasses 039 self-protection) — the coordinator found the actual logic lives in
`ZBP_FS_DYNGWREGTP`'s `includes/implementations` (`lhc_dyngwreg`, `validatetarget`), not the
near-empty `source/main` I read; L-518 is marked wrong in place and superseded by **L-521**.

**Evidence:** every payload/response for all 14 original criteria, the registration calls, the
compatibility check, the follow-up number-reuse probe, and the fix-round-1 re-test of criteria 11/12
is under `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/`.

### Fix round 1 — 2026-09-15, criterion 11 / L-517

**Change:** `ZCL_FS_DYN_HDL_REGI`'s `ty_payload` gained `allowgen TYPE zfs_t_dyn_reg-allow_gen` and
`gennrobject TYPE zfs_t_dyn_reg-gen_nr_object`; `apply_payload`'s `CASE lv_key` gained
`WHEN 'ALLOWGEN'.` and `WHEN 'GENNROBJECT'.` lines, same pattern as the four existing settable
columns (`AllowRead`/`AllowWrite`/`CallMode`/`MaxRows`/`LogLevel`). No other field whitelist or
`CORRESPONDING` found gating these columns elsewhere in the class.

**Routing:** `mcp-abap-abap-adt-api` `lock` → `setObjectSource` → `unLock` (change to an existing
object). Transport `DS4K907263`, confirmed via `transportInfo` before the write (class already
locked under this request from earlier task work, task `DS4K907264`).

**Activation:** `mcp-abap-abap-adt-api activateObjects` (object-reference form, package
`ZFS_DYN_GW`) — `"success":true`, `"messages":[]`, `"inactive":[]`.

**Unit tests:** `mcp-abap-abap-adt-api unitTestRun` on package `ZFS_DYN_GW` — **18 test classes,
148 test methods, 0 non-empty alerts**. Every existing test stayed green.

**Re-test, before/after:**

| | Before | After |
|---|---|---|
| `RegisterTarget` with `AllowGen`/`GenNrObject` | `ExecStatus 'E'`, message 034 "unknown field ALLOWGEN" | `RegisterTarget UPDATE` on `ZFS_T_TRM_PROBE`, `ExecStatus 'S'` |
| `/RegistryHistory` | no row (refused before write) | `ChangeType 'U'` row: `BeforeJson` `"ALLOW_GEN":""`, `AfterJson` `"ALLOW_GEN":"X","GEN_NR_OBJECT":"ZFS_OTTK_D"` |

Criterion 12 re-run immediately after: `RegisterTarget` `INSERT` on `ZFS_T_DYN_REG` with
`AllowGen:true` → refused, `ExecStatus 'E'`, `ErrorCategory 'AUTH'`, message **039** — unchanged.

**Result: criterion 11 now PASSES through the sanctioned action (no `/Registry` PATCH needed);
criterion 12 still PASSES.**

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_DYN_REG` | TABL/DT | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZFS_R_DYNGWREGTP` | DDLS/DF | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZFS_C_DYNGWREGTP` | DDLS/DF | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZFS_R_DYNGWREGTP` behavior definition | BDEF/BDO | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZBP_FS_DYNGWREGTP` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZIF_FS_DYN_HANDLER` | INTF/OI | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZCL_FS_DYN_HDL_QUERY` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZCL_FS_DYN_HDL_FUNC` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZCL_FS_DYN_HDL_SUBMIT` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active |
| `ZCL_FS_DYN_HDL_REGI` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active — Task 4 added `consumes_number_range`; **fix round 1 (2026-09-15)** added `ALLOWGEN`/`GENNROBJECT` to `ty_payload` and `apply_payload`'s accepted-key `CASE` (L-517), activated clean, whole-package unit tests (18 classes, 148 methods) stayed green |
| `ZCL_FS_DYN_HDL_TABLE` | CLAS/OC | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Changed, active — Task 6 replaced the placeholder `consumes_number_range` with a real delegation to `zcl_fs_dyn_generate=>will_draw_number`; `execute` now calls `zcl_fs_dyn_generate=>apply` per row immediately before `modify_table` and fills `result-rowsjson` from the rows as written via `zcl_fs_dyn_json=>to_json` |
| `ZCL_FS_DYN_GENERATE` | CLAS/OC (+ its `testclasses` include) | ZFS_DYN_GW | DS4K907263 | **Created, active** — the one and only new object of this plan; 10 of 10 unit tests green, ATC clean of priority 1/2 (one priority-3 SLIN finding, not fixed, reasoned in Task 5 section) |

_(Task 1 itself created no repository objects — only a transport. Task 2's five `ZFS_TRM_MSG`
messages are tracked in the message catalog, not repeated here. Task 3's five objects above are
the first repository objects this worklog lists.)_

### Task 4 — Handler contract (`generatejson` + `consumes_number_range`) — COMPLETE

**Scope (per `task-4-brief.md`):** add `generatejson TYPE ty_json` as the last field of
`zif_fs_dyn_handler~ty_step` (so positional `CORRESPONDING`/`MOVE-CORRESPONDING` elsewhere is
unaffected), and add `consumes_number_range() RETURNING VALUE(result) TYPE abap_bool` to
`ZIF_FS_DYN_HANDLER`, mirroring `runs_in_caller_luw`'s contract exactly: instance method, valid
only after `prepare`, erring toward the safe (permissive-refusal) answer when unprepared.

**Routing:** `mcp-abap-abap-adt-api` (`lock` → `setObjectSource` → `unLock`) for all six objects —
this task only changes existing objects, no creation. `healthcheck` returned `{"status":"healthy"}`
before starting.

**Transport:** `transportInfo` was called on the interface and all five classes before any write;
every one of the six confirmed the same CTS lock: request `DS4K907263`, task `DS4K907264`
("SLC: BTP K2 on 04.09.2026"). Per L-512, `setObjectSource`'s `transport` parameter took the
**request** (`DS4K907263`), not the task — passed correctly on the first attempt this time.

**Writes made:**

1. `ZIF_FS_DYN_HANDLER` (INTF/OI) — added `generatejson TYPE ty_json` as the last component of
   `ty_step`, and `METHODS consumes_number_range RETURNING VALUE(result) TYPE abap_bool.` after
   `runs_in_caller_luw`, with the doc comment from the brief verbatim.
2. `ZCL_FS_DYN_HDL_QUERY` (CLAS/OC) — added `METHOD zif_fs_dyn_handler~consumes_number_range.`
   (constant `abap_false`) immediately after `runs_in_caller_luw`'s method, before `prepare`.
3. `ZCL_FS_DYN_HDL_FUNC` (CLAS/OC) — same, placed after the long `runs_in_caller_luw` comment
   block (the L-350/final-review-C-1 explanation), before `prepare`.
4. `ZCL_FS_DYN_HDL_SUBMIT` (CLAS/OC) — same, after `runs_in_caller_luw`, before `prepare`.
5. `ZCL_FS_DYN_HDL_REGI` (CLAS/OC) — same, after `runs_in_caller_luw`, before `prepare`.
6. `ZCL_FS_DYN_HDL_TABLE` (CLAS/OC) — **placeholder, not the real implementation.** Per the task
   dispatch's explicit instruction (deviating from the brief's "leave it temporarily unactivatable"
   option), this class also got a constant `abap_false` `consumes_number_range`, with a comment
   explaining Task 6 replaces it with a real read of the step's `GenerateJson`. Reason: Task 5 runs
   ABAP Unit tests, which need the package to compile — every task must leave the package
   activatable, and a broken window here would have blocked Task 5.

None of the five handler classes declares interface methods explicitly in a separate `definitions`
include — all five use plain `INTERFACES zif_fs_dyn_handler.` in the class definition, so no second
edit was needed anywhere for the method signature itself.

**Activation — one call, all six objects, via `mcp-abap-abap-adt-api activateObjects`** (not
`adt-mcp abap_activate_objects`, which fails "Project must not be `<null>`" on existing objects per
L-371). Object-reference form (`adtcore:uri`/`adtcore:type`/`adtcore:name`/`adtcore:parentUri` = the
`ZFS_DYN_GW` package URI). Result: `"success": true`, `"messages": []`, `"inactive": []` — a clean
activation with no warnings, unlike Task 3's two pre-existing TPC warnings on the projection view
(unrelated objects, not touched this task).

**Draft on the RAP BO:** not touched — this task changed only an interface and five CLAS/OC
handler classes, no RAP BO involved.

**Delivery checks for Task 4:**

- [x] Pretty Printer — not separately run; each write preserved the surrounding file's existing
      indentation/casing style, and the new lines were typed to match it (the interface's `TYPES`
      block, and each class's existing `runs_in_caller_luw` comment-and-method shape).
- [x] Syntax check clean — implied by a clean activation (empty `inactive`, no messages).
- [x] Activated, nothing left inactive — confirmed above, `"inactive": []`.
- [ ] ATC / Code Inspector — not run this task.
- [ ] ABAP Unit — none exists yet for these classes; Task 5 adds the generator's own unit tests.
- [x] Text symbols and selection texts — not applicable, no screen-facing object touched.
- [x] Object list confirmed in the transport — `transportInfo` named `DS4K907263`/`DS4K907264` for
      all six objects before writing; all six writes used `transport: DS4K907263`.

### Task 2 — Messages 050–054 (`ZFS_TRM_MSG`)

**Routing:** `mcp-abap-abap-adt-api` (`lock` → `setObjectSource` → `unLock` on
`/sap/bc/adt/messageclass/zfs_trm_msg`) — the confirmed fallback for message classes, since
`adt-mcp` has no `MSAG/N` adapter (working agreement rule 5, `AGENTS.md`).

**Pre-check:** `getObjectSource` on `/sap/bc/adt/messageclass/zfs_trm_msg` and
`SELECT msgnr, text FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG' AND msgnr >= '045'`
confirmed **049** was the highest existing message and **050** was free — not blocked.

**NAMING:** `ZFS_TRM_MSG` -> matches the listed exception row in `docs/naming-conventions.md`
(*Classic & Misc* section) — no new object name to gate; messages are numbered rows within the
existing class, not separately named objects.

**Messages added** (type `E`, transport `DS4K907300`):

| No | Text |
|---|---|
| 050 | Generator field &1 does not exist on target &2 |
| 051 | Number range object &1 is not permitted for target &2 |
| 052 | Generation is not permitted for target &1 |
| 053 | Number range &1 could not supply a number for &2 |
| 054 | Number range generation is not allowed with commit mode NEVER |

**Verification:** `SELECT COUNT(*) FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'` read
**49** before the write and **54** after. A row read of 050–054 matched the brief's texts
character-for-character. A full re-read of 001–049 confirmed all 49 pre-existing messages survived
byte-for-byte — no wording, whitespace, or typo changed.

`activateObjects` on the message class returned a warning ("Activation/Generation tool for
ZFS_TRM_MSG not found") with `success: true` and an empty `inactive` list — consistent with L-400's
prior note that `MSAG/N` needs no activation step; `setObjectSource` writes `T100` directly.

**Catalog:** `docs/message-catalog/DS4_100_NIIF.md` updated in this same turn — five rows added to
the confirmed-messages table plus a dated change-history paragraph naming this plan, transport
`DS4K907300`, and the 49 → 54 `T100` counts. Next free number recorded as **055**.

### Task 3 — Registry columns (`ZFS_T_DYN_REG`) — COMPLETE

**Unblocked and done on the second attempt, on the correct transport.** The prior attempt's
blocker (below, kept for context) is resolved: this run used **request `DS4K907263`, task
`DS4K907264`** ("SLC: BTP K2 on 04.09.2026") — the transport the objects were already CTS-locked
to — not `DS4K907300`, which is superseded for this task. `transportInfo` was called on every one
of the five objects before writing it and confirmed `DS4K907263`/`DS4K907264` as the only option
each time (`EXISTING_REQ_ONLY: X`).

**One gotcha found and self-corrected in this run:** the first `setObjectSource` on
`ZFS_T_DYN_REG` was tried with `transport: DS4K907264` (the **task**, matching what `transportInfo`
lists under `TASKS`) and failed with the same "already locked in request DS4K907263" error the
prior attempt hit. Retried with `transport: DS4K907263` (the **request**, not the task) and it
succeeded immediately. `setObjectSource`'s `transport` parameter wants the request number, not the
task number, even though the task is what shows as modifiable. Recorded as a follow-up note under
L-512 below.

**Writes made (all `lock` → `setObjectSource` → `unLock` via `mcp-abap-abap-adt-api`, transport
`DS4K907263`):**

1. `ZFS_T_DYN_REG` (TABL/DT) — inserted `allow_gen : abap_boolean;` / `gen_nr_object : nrobj;`
   after `log_level`, before `descr`, exactly as staged.
2. `ZFS_R_DYNGWREGTP` (DDLS/DF) — added `allow_gen as AllowGen,` / `gen_nr_object as GenNrObject,`
   after `log_level as LogLevel,`, before `descr as Descr,`. First write introduced a stray extra
   space of column alignment on the `log_level`/`descr` lines relative to the original file (not
   part of the intended change); caught on a re-read and corrected with a second `setObjectSource`
   before moving on, restoring the original spacing exactly and keeping only the two new lines.
3. `ZFS_C_DYNGWREGTP` (DDLS/DF) — added `AllowGen,` / `GenNrObject,` after `LogLevel,`, before
   `Descr,`.
4. `ZFS_R_DYNGWREGTP` behavior definition (BDEF/BDO) — added `AllowGen = allow_gen; GenNrObject =
   gen_nr_object;` to the mapping, after `LogLevel`, before `Descr`. No `field()` treatment needed —
   matches `LogLevel`'s ordinary-attribute treatment, not `readonly`/`mandatory`.
5. `ZFS_C_DYNGWREGTP` behavior definition (BDEF/BDO) — confirmed unchanged, per the prior attempt's
   correct judgment (`projection; use create/update/delete;` only, no field list).
6. `ZBP_FS_DYNGWREGTP` (CLAS/OC, `implementations` include) — per the prior attempt's settled
   finding that `lsc_dyngwreg->save_modified` enumerates every registry field, added
   `allow_gen`/`gen_nr_object` to both branches: the create branch's `VALUE #(...)` (after
   `log_level`, before `descr`) and the update branch's per-field `%control` checks (two new `IF
   <ls_update>-%control-AllowGen = if_abap_behv=>mk-on. ... ENDIF.` /
   `...-%control-GenNrObject...` blocks, placed after the `LogLevel` block and before the `Descr`
   block, matching that block's exact shape). No other method in the file references these fields.

**Activation — one call, all six objects, via `mcp-abap-abap-adt-api activateObjects`** (not
`adt-mcp abap_activate_objects`, which rejects `/sap/bc/adt/...` URIs for existing objects per
L-371 — `"Project must not be <null>"` on the first attempt). Used object-reference form
(`adtcore:uri`/`adtcore:type`/`adtcore:name`/`adtcore:parentUri` = the `ZFS_DYN_GW` package URI)
per L-404. Result: `"success": true`, `"inactive": []`. Two pre-existing warnings surfaced
("Transactional Provider Contract expected for Projection View ZFS_C_DynGwRegTP") — unrelated to
this change (the projection view already lacked a TPC before this task), not introduced by it, and
not blocking.

**Verification (Step 7):**

```
SELECT target_kind, target_name, allow_gen, gen_nr_object FROM zfs_t_dyn_reg
```

Returned `values: []` — zero rows, as expected (the gateway's registry tables were emptied before
this run). The query compiled and both new columns (`ALLOW_GEN`, `GEN_NR_OBJECT`) appear in the
result's column list, proving the DDIC change is active end to end. No row exists to check the
"initial/blank by default" property against, but an empty registry is itself consistent with
nothing having been generation-enabled by this change.

**Draft on the RAP BO:** not touched — this task added ordinary attributes, not draft, so rule 7's
human-confirmation gate does not apply here.

---

**Prior attempt (same day, earlier) — BLOCKED, no write made, kept verbatim below for context.**

**Scope (per `task-3-brief.md`):** add `allow_gen` (`abap_boolean`) and `gen_nr_object` (`nrobj`)
to `ZFS_T_DYN_REG` (after `log_level`, before `descr`), expose both on `ZFS_R_DYNGWREGTP` /
`ZFS_C_DYNGWREGTP`, add them to the `ZFS_R_DYNGWREGTP` behavior definition's mapping (ordinary
maintainable attributes, no `readonly`/`mandatory`), and — because `ZBP_FS_DYNGWREGTP`'s
`implementations` include does enumerate every registry field in `lsc_dyngwreg->save_modified`
(the create branch's `VALUE #(...)` and the update branch's per-field `%control` checks, matching
how `LogLevel`/`Descr` are already handled) — add the two fields there as well, so the
`ZFS_T_DYN_REGH` audit trail's before/after JSON stays complete.

**Routing confirmed:** `mcp-abap-abap-adt-api` (`lock` → `setObjectSource` → `unLock`) for all five
objects — this task only changes existing objects, no creation. `mcp-abap-abap-adt-api healthcheck`
returned `{"status":"healthy"}` before starting.

**Read, drafted, staged (not written) — all five objects, matching each file's own casing/style:**

| Object | Type | Change staged |
|---|---|---|
| `ZFS_T_DYN_REG` | TABL/DT | Insert `allow_gen : abap_boolean;` / `gen_nr_object : nrobj;` after `log_level`, before `descr` |
| `ZFS_R_DYNGWREGTP` | DDLS/DF | Add `allow_gen as AllowGen,` / `gen_nr_object as GenNrObject,` after `log_level as LogLevel,` |
| `ZFS_C_DYNGWREGTP` | DDLS/DF | Add `AllowGen,` / `GenNrObject,` after `LogLevel,` |
| `ZFS_R_DYNGWREGTP` behavior definition | BDEF/BDO | Add `AllowGen = allow_gen; GenNrObject = gen_nr_object;` to the mapping, after `LogLevel` |
| `ZFS_C_DYNGWREGTP` behavior definition | BDEF/BDO | **No change needed** — it is `projection; use create/update/delete;` only, no field list to extend |

**`ZBP_FS_DYNGWREGTP` (CLAS/OC) — judged, not edited yet.** `getObjectSource` on both the main
include (empty `DEFINITION`/`IMPLEMENTATION` shell) and the `implementations` include (560 lines:
`lcl_dyngwreg_buffer`, `lhc_dyngwreg`, `lsc_dyngwreg`) was read in full. `lsc_dyngwreg->save_modified`
does enumerate registry fields — the create branch builds `ls_after_c` with a `VALUE #(...)` naming
every column through `log_level`/`descr`, and the update branch has one `IF <ls_update>-%control-xxx
= if_abap_behv=>mk-on.` block per field (including `LogLevel` and `Descr`) — so per the brief's own
test ("a validation, a `CORRESPONDING`, a field list") this **does** qualify, and the plan is to add
matching `allow_gen`/`gen_nr_object` lines in both branches once Steps 1–4 are unblocked. No
validation, authorization check or `CORRESPONDING` elsewhere in the file references these two new
fields, so nothing else in the class needs touching.

**Blocker — hit at `setObjectSource`, not at `lock`.** All five `lock` calls succeeded (clean lock
handles for the table, both DDL sources, and the root behavior definition — the projection BDEF was
deliberately left unlocked since it needs no edit). Every `setObjectSource` call against transport
`DS4K907300` (the transport this whole plan is scoped to, per Task 1) failed identically:

> *Object R3TR TABL ZFS_T_DYN_REG is already locked in request DS4K907263 of user FS_DEV3*

(and the equivalent for `ZFS_R_DYNGWREGTP` DDLS, `ZFS_C_DYNGWREGTP` DDLS, `ZFS_R_DYNGWREGTP` BDEF).
`transportInfo` on `/sap/bc/adt/ddic/tables/zfs_t_dyn_reg` confirmed why: the object already carries
a **modifiable (`TRSTATUS D`) CTS lock under transport `DS4K907263`**, task `DS4K907264`, description
*"SLC: BTP K2 on 04.09.2026"*, owned by `FS_DEV3`, dated 2026-09-04 — unrelated to this plan and not
mentioned in Task 1's worklog. `transportInfo`'s `EXISTING_REQ_ONLY: X` flag means the object may
**only** be changed inside the request it is already locked to; `DS4K907300` is refused outright.
Recorded as **L-512** in `lessons/lessons-ledger.md`.

**No write was made.** All five `lock` handles were released with `unLock` immediately on hitting the
blocker — confirmed `"status":"success"` on every unlock. The table, both CDS views, and the
behavior definition are unchanged and unlocked on the system; the behavior pool class was never
touched (only read).

**What is needed to unblock:** a human decision on `DS4K907263` / task `DS4K907264` — release it,
reassign `ZFS_T_DYN_REG` (and its dependent DDLS/BDEF) out of it, or confirm this task should target
`DS4K907263` instead of `DS4K907300` (which would mean amending this plan's stated transport, not a
call to make unilaterally). Until then Task 3 (and everything downstream that depends on
`allow_gen`/`gen_nr_object` existing — Tasks 5, 6) is blocked.

### Task 5 — `ZCL_FS_DYN_GENERATE` and its unit tests — COMPLETE

**Naming gate, recorded before the create call:**

`NAMING: ZCL_FS_DYN_GENERATE -> matches pattern row "Class | ZCL_FS_<AREA>_<NAME>"
(docs/naming-conventions.md line 116), AREA = DYN` — consistent with the live family
`ZCL_FS_DYN_AUTH` / `_BUDGET` / `_JSON` / `_REGISTRY` / `_RUNTIME`.

**Routing:** creation via `adt-mcp` `abap_creation-create_object` (CLAS/OC, package `ZFS_DYN_GW`);
every later edit via `mcp-abap-abap-adt-api` `lock`/`setObjectSource`/`unLock`. Transport: the
**request** `DS4K907263` (not task `DS4K907264`, per L-512).

**TDD, red before green, twice — the actual output, not a claim:**

| Step | Run | Result |
|---|---|---|
| 4 | 7 tests against the two empty stub methods | **FAILED** — 4 failed assertions, 3 passed. `draws_when_nr_requested` `Expected [X] Actual []`; `fit_keeps_significant_digits` `Expected [0000100051] Actual []`; `fit_pads_to_width` `Expected [000000000000100051] Actual []`; `fit_refuses_when_too_wide` hit the explicit `fail( )`. The three that "passed" are the `abap_false` expectations, which an empty method satisfies trivially — noted rather than hidden: `draws_when_nr_requested` is the one that discriminates, and it was red. |
| 6 | same 7 after implementing `fit_number` / `will_draw_number` | **PASSED** |
| 8a | 10 tests, `apply` not yet declared | Activation **refused**: three `Method "APPLY" is unknown or PROTECTED or PRIVATE.` errors at the three call sites. |
| 8b | 10 tests, `apply` declared with an empty body | **FAILED** — 3 failed assertions, 7 passed: `apply_refuses_on_delete`, `apply_refuses_when_gen_off`, `apply_refuses_wrong_nr_object`, each on its own `fail( )` text. |
| 10 | 10 tests after implementing `apply` | **PASSED** — 10 of 10. |

**Two corrections to the brief's illustrative code, applied:**

1. The brief's `RAISE EXCEPTION TYPE zcx_fs_dyn_error MESSAGE e053(zfs_trm_msg) WITH ...` does not
   compile — `ZCX_FS_DYN_ERROR`'s constructor has a mandatory `errcat` and routes message variables
   through public `MV_MSGV1..4`. Copied `ZCL_FS_DYN_HDL_TABLE`'s idiom verbatim instead:
   `RAISE EXCEPTION NEW zcx_fs_dyn_error( errcat = ... msgv1 = CONV #( ... ) textid = VALUE #( msgid = c_msgid msgno = '0nn' ) )`.
   `errcat` per the dispatch: `CLIENT` for 050/052 and for the 022 reuse, `TARGET` for 051/053.
2. Tests assert `err->msgno`, this codebase's own public READ-ONLY attribute, not
   `err->if_t100_message~t100key-msgno`.

**One genuine platform finding, recorded as L-513:** `CL_NUMBERRANGE_RUNTIME=>NUMBER_GET`'s `NUMBER`
is typed on the **class's own** `NR_NUMBER` alias, not the identically named DDIC data element, and
it cannot be received into an inline `DATA( )`. See the ledger entry.

**Design decisions inside `APPLY` that the brief left open:**

- **`SysFields` is polymorphic** (the string `"AUDIT"` or an array of `{Field, Value}`), and no one
  ABAP structure holds both shapes. `PARSE_REQUEST` therefore deserializes in two passes, each
  declaring only the components it can accept, and picks the pass by a `pcre` probe for
  `"SYSFIELDS"\s*:\s*\[`. `/ui2/cl_json` ignores JSON names it finds no component for, which is
  what makes the split safe rather than lossy.
- **`SysFields: "AUDIT"` never raises 050.** Spec 5.2 says it fills the five RAP names *only where
  the field exists*, so a target without a RAP audit block is filled with whatever it has and is not
  refused. The explicit array form **is** validated, because the caller named those fields.
- **An unknown `Value` in the explicit form reuses 022**, with the reason inside `SYMSGV`'s fifty
  characters — the idiom `ZCL_FS_DYN_HDL_TABLE` already uses for "no rows to write" — rather than
  inventing a sixth message number.
- **A `CX_UUID_ERROR` raises the class's default 047** generic carrier. A platform failure with no
  better word for it is exactly what 047 exists for; inventing 055 for it would not have been
  authorised by this task.
- **Field resolution reuses `ZCL_FS_DYN_RUNTIME~COMPONENTS_OF`** as instructed — no second DDIC
  reader. `APPLY` instantiates `NEW zcl_fs_dyn_runtime( )` for the one call.

**Object list addition:**

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_GENERATE` | CLAS/OC (+ its `testclasses` include) | ZFS_DYN_GW | DS4K907263 | **Created, active** — the one and only new object of this plan |

**ATC (Step 11):** `abap_atc_run` / `abap_atc_get_result` on `ZCL_FS_DYN_GENERATE` returned **one**
finding, **priority 3**: SLIN 1713 *"Strings without text elements are not translated:
`|GenerateJson (SysFields Value |`"*. **No priority 1 or 2 findings, and nothing exempted.** The
priority 3 is left as is and not fixed: the literal is a diagnostic fragment inside a `SYMSGV`
message variable, not screen text, and the only sanctioned route to a text element on this project
is SE38 via `docs/sap-gui-object-automation.md` (working agreement rule 4) — creating one to silence
a priority 3 would be an unrequested object.

**Delivery checks for Task 5:**

- [x] Pretty Printer — not separately run; the source was typed to the surrounding files' own
      style (hand-aligned `TYPES`/`IMPORTING` blocks, `"` comment blocks where the reasoning is
      non-obvious), and no line of another object was reformatted.
- [x] Syntax check clean — implied by the final clean activation.
- [x] Activated, nothing left inactive — `"success": true`, `"messages": []`, `"inactive": []`.
- [x] ATC — no priority 1 or 2; the single priority 3 is reasoned above.
- [x] ABAP Unit — **10 of 10 passing**, each having been observed red first.
- [x] Text symbols and selection texts — none created or modified; see the ATC note.
- [x] Object list confirmed in the transport — created directly on request `DS4K907263`.

### Task 5, fix round 1 — number-burned-before-refusal ordering defect — COMPLETE

**Review finding (Important):** `apply`'s `SysFields` loop validated each entry's `Value` against
its enum only inside the side-effect `CASE`, which runs **after** the `NumberRange` loop has
already called `cl_numberrange_runtime=>number_get`. A payload combining a valid `NumberRange`
entry with an invalid `SysFields` `Value` therefore passed all seven prior gates, drew and
permanently burned (L-284) a live number, and only then raised 022 — the exact ordering violation
spec 5.2a and the class's own header comment ("every refusal is raised BEFORE any side effect")
forbid.

**Fix applied (routing `mcp-abap-abap-adt-api` `lock`/`setObjectSource`/`unLock`, transport
`DS4K907263` — the request, confirmed again via `transportInfo` before writing):**

1. Pulled the `SysFields` `Value` enum check (`USER`/`DATE`/`TIME`/`TIMESTAMP`/`TIMESTAMPL`) into
   a new up-front loop (step 5a, right after the three `check_field` existence loops, before the
   operation gate) — it needs no live data, so validating it there costs nothing. The original
   `CASE` in the side-effect loop is kept as a defensive fallback, now unreachable for a bad
   `Value`, with a comment saying so.
2. **Review Minor 1, same class of defect:** `char_length`'s `CAST cl_abap_elemdescr` shape check
   was also running inside the draw loop, so with two or more `NumberRange` entries an earlier
   field's number could burn before a later field's cast failure was discovered. Added step 7a: a
   new private table type `ty_nr_width` (`field`/`width`) and a precompute loop that calls
   `char_length` for every `NumberRange` entry right after the object-match check (step 7) and
   before any side effect. The draw loop now reads the precomputed width from `lt_width[ field =
   ... ]-width` instead of calling `char_length` itself, so it only draws.
3. **Review Minor 2, left alone as instructed:** `fit_number`'s own overflow refusal cannot move —
   the drawn value's digit count is unknowable until `NUMBER_GET` has already returned it. Added a
   one-line comment at that raise site naming this an accepted, unavoidable residual, distinct from
   the two orderings fixed above, so a future reader does not try to relocate it.

**Test added — proves the ordering, not merely that 022 is raised:**
`apply_refuses_sysfield_order` (renamed from the review's suggested
`apply_refuses_sysfield_before_draw`, which at 35 characters exceeded the 30-character method-name
limit and failed activation on the first attempt — corrected and re-activated). `reg-gen_nr_object
= 'ZNOSUCHNR'` (an object that does not exist), payload
`{"NumberRange":[{"Field":"ZOTTK_NO"}],"SysFields":[{"Field":"ZBUKRS","Value":"BOGUS"}]}`,
operation `INSERT`, target `ZFS_SLC_OTTK_BTP`. Asserts `msgno = 022`. This discriminates: with the
fix, the `SysFields` shape check refuses with 022 before the `NumberRange` loop ever calls
`NUMBER_GET`. Without it, `NUMBER_GET` against the non-existent `ZNOSUCHNR` object would raise 053
instead — the exact failure this test exists to catch. `ZBUKRS` (`zbukrs TYPE bukrs`) confirmed as
a real component of `ZFS_SLC_OTTK_BTP` via `getObjectSource` before writing the test, so
`check_field` passes and the test isolates the ordering question alone. Burns nothing regardless of
outcome, because the number range object never exists to draw from.

**Verification:**

| Check | Before fix (round 0, prior session) | After fix (round 1, this session) |
|---|---|---|
| `unitTestRun` | 10 of 10 passing (did not yet include the ordering test) | **11 of 11 passing** — all `alerts: []`, including `APPLY_REFUSES_SYSFIELD_ORDER` |
| `abap_atc_run` / `abap_atc_get_result` | 1 finding, priority 3 (SLIN 1713) | **2 findings, both priority 3** (SLIN 1713) — the same literal now appears at both the new up-front raise site and the now-unreachable defensive one in the `CASE`; **no priority 1 or 2**, nothing exempted, same reasoning as round 0 (diagnostic `SYMSGV` fragment, not screen text; no sanctioned route to a text element here) |
| Activation | — | Clean on the second attempt only — first attempt failed on `APPLY_REFUSES_SYSFIELD_BEFORE_DRAW` exceeding the 30-character method-name limit; renamed to `APPLY_REFUSES_SYSFIELD_ORDER` (29 chars) and re-activated clean, `"success": true`, `"inactive": []` |

**Object list:** no change — same object (`ZCL_FS_DYN_GENERATE` + its `testclasses` include),
same transport `DS4K907263`.

## Delivery checks

- [ ] Pretty Printer
- [ ] Syntax check clean
- [ ] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved
- [ ] ABAP Unit green (or "none applicable" with a reason)
- [ ] Text symbols and selection texts maintained
- [ ] Object list confirmed in the transport

_(Not applicable to Task 1 — no ABAP objects built. Task 2 modified an existing message class only —
no pretty printer/syntax check/ATC/unit-test surface applies to `T100` rows; "activated" is
satisfied per the note above. Task 3: activated with no errors and `inactive: []` (checked above);
pretty printer/ATC/ABAP Unit not separately run — none of the five changed objects introduced new
executable logic beyond two `IF`/`ENDIF` control-flag blocks matching an existing pattern verbatim;
no text symbols or selection texts involved; object list confirmed against `transportInfo` for
every object before writing.)_

## Evidence

No screenshots, transcripts or payload dumps beyond the query results already transcribed above
in full; no evidence folder created for this activity.

## Lessons raised

None for Task 1/2 — see their sections above. **Task 3 raised L-512** (the blocker, prior attempt)
and a follow-up note on the same entry: `setObjectSource`'s `transport` parameter takes the CTS
**request** number (`DS4K907263`), not the **task** number (`DS4K907264`) that `transportInfo`
shows as the modifiable, lockable unit — passing the task number reproduces the same "already
locked in request ..." error as passing the wrong transport entirely.

## Task 6 — Wire the generator into `ZCL_FS_DYN_HDL_TABLE`

**Read first:** `getObjectSource` on `ZCL_FS_DYN_HDL_TABLE` (main include + `testclasses`),
`ZCL_FS_DYN_HDL_QUERY`, `ZCL_FS_DYN_HDL_FUNC` and `ZCL_FS_DYN_HDL_SUBMIT` (to confirm the
`rowsjson`-filling pattern — none of the three honours `reg-log_level` inside the handler; each
just serialises the rows/exports it has and lets the log layer decide what survives, so `TABL`
follows the same shape rather than inventing a cap of its own), and `ZCL_FS_DYN_JSON` (confirmed
`to_json` is `PUBLIC`, `CLASS-METHODS`, takes `data TYPE any`). Also re-read `ZIF_FS_DYN_HANDLER`
to confirm `prepare` already receives `step` and `reg`, and `ZCL_FS_DYN_GENERATE`'s public
`apply`/`will_draw_number` signatures from Task 5.

**Changes to `ZCL_FS_DYN_HDL_TABLE` (transport `DS4K907263`, locked/unlocked around the write):**

1. Two new private `DATA` fields: `ms_reg TYPE zfs_t_dyn_reg` and `mv_generatejson TYPE ty_json`
   (the class's own private alias for `zif_fs_dyn_handler=>ty_json`), alongside the existing
   `mv_target`/`mv_operation`. `mv_operation` and `ms_step` already existed and are reused as-is —
   `apply` and `will_draw_number` need nothing new from `prepare` beyond these two fields.
2. `prepare` now sets `ms_reg = reg` and `mv_generatejson = step-generatejson` right after
   `ms_step = step`, before the `TRY` block — the same place `mv_target`/`mv_operation` are
   derived — and clears both at the top alongside the existing `CLEAR:` list.
3. `zif_fs_dyn_handler~consumes_number_range` replaced the Task 4 placeholder (constant
   `abap_false`) with a real delegation:
   `result = zcl_fs_dyn_generate=>will_draw_number( generatejson = mv_generatejson operation = mv_operation ).`
   Comment updated to explain the pre-`PREPARE` safety (`mv_generatejson` initial → `will_draw_number`
   answers `abap_false`, which is safe because an unprepared step never executes) — the old
   "PLACEHOLDER (Task 4)" comment is gone.
4. `execute` now loops the deserialised row table (`ASSIGN mr_rows->* TO <lt_rows>`, already how
   the class reaches its rows) and calls `zcl_fs_dyn_generate=>apply` once per row, by reference
   (`REF #( <row> )`), **inside** the existing `TRY` and **before** the `modify_table` call, so a
   raised `zcx_fs_dyn_error` (050/051/052/053) is caught by the same `CATCH` that already converts
   errors to `status 'E'` outcomes — no new error-handling path was added.
5. After a successful `modify_table`, `result-rowsjson` is filled from the **same** field-symbol
   the generator loop wrote into, post-generation, via `zcl_fs_dyn_json=>to_json( <lt_rows> )` —
   so a caller now sees the assigned `UUID`/`ZOTTK_NO` etc., not the payload it sent. This fill
   happens once, before the complete/partial branch, so both a full write and a partial one
   (048) carry the written rows.

**Obsolete test check (brief's warning):** searched `ZCL_FS_DYN_HDL_TABLE`'s `testclasses` include
in full before writing — **no existing test asserts `rowsjson` at all** (empty or otherwise), so
the brief's warned-about obsolete assertion does not exist in this codebase's current state; no
test needed to be updated or weakened. `valid_insert_prepares_ok` (the happy-path test) sends no
`GenerateJson`, and `ZCL_FS_DYN_GENERATE=>apply` returns immediately on `generatejson IS INITIAL`
(confirmed by reading its source, step 1 of the method body), so that test's behaviour and
assertions are unaffected by this change and needed no edit.

**Verification:**

| Check | Result |
|---|---|
| `activateObjects` | Clean — `"success": true`, `"inactive": []` |
| `unitTestRun` on `/sap/bc/adt/packages/zfs_dyn_gw` (whole package, not just this class) | All 18 test classes returned with `alerts: []` throughout — `LTC_TABLE`, `LTC_GENERATE` (all 11 of Task 5's tests still green), `LTC_QUERY`, `LTC_FUNC`, `LTC_SUBMIT`, `LTC_REGI`, `LTC_DISPATCH`, `LTC_AUTH`, `LTC_BUDGET`, `LTC_DYN_LOG`, `LTC_FACTORY`, `LTC_JSON`, `LTC_REGISTRY`, `LTC_RUNTIME`, and the four `*_LIVE` classes — no failed assertion anywhere |

**Object list:** one object changed — `ZCL_FS_DYN_HDL_TABLE` (see the table above), same transport
`DS4K907263`. No new object created.

**Lessons raised:** none new for Task 6 — the transport/lock idiom from L-512 and the `getObjectSource`
routing already covered everything encountered.

## Task 7 — Contract fields and the dispatcher guard

**Read first:** `getObjectSource` on all three abstract entities (`ZFS_AE_DynGwTable`,
`ZFS_AE_DynGwStep`, `ZFS_AE_DynGwResult`), `ZCL_FS_DYN_JSON`, `ZIF_FS_DYN_HANDLER`,
`ZCL_FS_DYN_DISPATCH`, and — since it turned out not to be a class at all —
`objectStructure`/`getObjectSource` on `ZBP_FS_DYNGWCALLTP`'s `includes/implementations` (the
behavior-definition class's own `source/main` is an empty shell; the six action methods and
`METHOD dispatch` live in the `lhc_calllog` local handler class in that include, discovered via
`objectStructure` after the empty shell answer).

### THE BREAKING CHANGE (spec §7, signed off 2026-09-15)

`GenerateJson : abap.string(0);` added to `ZFS_AE_DynGwTable` (`ExecuteTableCrud`'s parameter), the
`GenerateJson` DDIC field is **generated `Nullable="false"`**, and OData V4 will now reject any
`ExecuteTableCrud` call that omits it with `/IWBEP/CM_V4H_RUN/006`. **Every existing caller of this
one action breaks until it adds the field** (an empty string is a legal "no generation wanted"
value — the break is about the field being present on the wire, not about its content). Confined to
this action only: `ZFS_AE_DynGwStep`'s own `GenerateJson` (added as the last field, matching the
brief's snippet) is not an OData parameter at all — its class comment already records it is not
reachable as a composition from `ZFS_AE_DynGwBatch` (L-470/L-472) and exists only as the typed
contract `StepsJson` is parsed against, case-insensitively — so nothing there is "generated" for
OData and nothing breaks.

### Step 4 — no change to `ZCL_FS_DYN_JSON`

Read the whole class. It is a generic serialize/deserialize/cap utility with no field-name
enumeration for steps anywhere in it. Batch-step parsing happens in `ZBP_FS_DYNGWCALLTP`'s
`executebatch` method, which calls `/ui2/cl_json=>deserialize` straight into
`ty_steps` (`zif_fs_dyn_handler=>ty_step`, case-insensitively) — and `ty_step` **already carries
`generatejson`**, added by Task 4 Step 1. Confirmed by reading `ZIF_FS_DYN_HANDLER`'s source
directly rather than assuming. Nothing to change here, exactly as the brief's second branch
anticipated.

### `ZFS_AE_DynGwResult`: `Committed`/`RolledBack` renamed to `IsCommitted`/`IsRolledBack`

First activation attempt with the brief's literal field names failed:

> `COMMITTED is a reserved word (choose another field name)` — `DDLS ZFS_AE_DYNGWRESULT`

`COMMITTED` is a CDS/ABAP reserved word (not caught by reading the brief, which is intent not a
literal DDL contract). Renamed both flags to `IsCommitted` / `IsRolledBack` to keep the same
information under a name CDS will accept — `RolledBack` on its own was never tested since the
DDLS failed to activate on the first field, but it was renamed to `IsRolledBack` alongside it for
symmetry rather than risk a second reserved-word round trip. `TY_RESULT`'s ABAP-side
`committed`/`rolled_back` fields are untouched — only the OData-facing abstract entity's spelling
changed.

### `ZCL_FS_DYN_DISPATCH`: the 054 guard

Added `check_dry_run_number_range`, a private method with the same `IMPORTING plan / EXPORTING
failed / CHANGING result` shape as `check_luw_coherence`, called from `phase_one` immediately after
`check_luw_coherence` — same footing: every step is planned, nothing has executed. Logic: if
`mv_commit_mode <> NEVER`, return immediately (no-op on every non-dry-run call, so this guard costs
nothing on the framework's normal path). Otherwise loop the plan for the first handler answering
`consumes_number_range( ) = abap_true`; if none, return; otherwise raise `zcx_fs_dyn_error` with
`errcat 'CLIENT'` and message 054 (no message variables per the catalog), apply it to that step's
result row via the existing `apply_error` helper, and call the existing `set_call_abort` helper —
the same two helpers `check_luw_coherence` already uses, so this guard introduces no parallel
refusal mechanism. **Self-correction while drafting:** the first version of this method contained a
leftover `READ TABLE plan INTO ls_plan WITH KEY handler = plan[ 1 ]-handler.` line ahead of the real
loop — dead code that would have thrown `CX_SY_ITAB_LINE_NOT_FOUND` on an empty plan and was never
sent to the class as final; caught and removed before the first `setObjectSource` round-trip
completed by re-reading the drafted source before submitting it.

### A pre-existing gap found and fixed: `LCL_GUARDED_HANDLER` never delegated `consumes_number_range`

First `unitTestRun` after activation (whole package) showed 2 real failures, both
`"kind":"exception"`:

> `Method call failed; the method ZIF_FS_DYN_HANDLER~CONSUMES_NUMBER_RANGE of the class
> LCL_GUARDED_HANDLER is not implemented` — `LTC_DISPATCH->NEVER_ROLLS_BACK_SUCCESS` and
> `LTC_DISPATCH_LIVE->REAL_QUERY_DISPATCH_RUNS` (both set `CommitMode = 'NEVER'`, the only path that
> calls the new guard).

`ZCL_FS_DYN_FACTORY=>handler_for` wraps every handler it returns in `lcl_guarded_handler` (a local
class in `ZCL_FS_DYN_FACTORY`'s own `includes/implementations`, not its `source/main` — found by
reading the class header comment, which names the wrapper and says "see the Local Types include",
then locating it via `objectStructure`'s include list rather than guessing). `ZCL_FS_DYN_DISPATCH`'s
`plan-handler` is **always** this wrapper, never the inner handler. The wrapper already delegates
`kind`, `needs_write` and `runs_in_caller_luw` straight through to the inner handler, but
`consumes_number_range` — added to `ZIF_FS_DYN_HANDLER` by Task 4, after this wrapper was last
touched — was never added to the wrapper. Because ABAP does not re-validate an already-active class
against a widened interface until that class is itself reactivated, this went undetected: the class
stayed active with a runtime (not compile-time) gap, invisible until something actually called the
missing method through the interface reference, which nothing did until Task 7's guard.

This is a genuine defect blocking the very feature Task 7 delivers — without it, `CommitMode NEVER`
on any batch touching a `TABL` step **dumps** instead of refusing cleanly, which is worse than the
049/054 refusal path this plan exists to add. Fixed by adding one delegating method to
`LCL_GUARDED_HANDLER`, matching the existing `runs_in_caller_luw` delegation pattern exactly (one
line, straight to `mo_inner->consumes_number_range( )`), with a header-comment note explaining what
happened and why it surfaced only now. No other object needed for this: `ZCL_FS_DYN_FACTORY` is the
only source of `lcl_guarded_handler`, and every one of the five concrete handler classes already
implements the real method (Task 4/6).

### `ZBP_FS_DYNGWCALLTP` (`includes/implementations`, class `lhc_calllog`)

- `executetablecrud`: added `generatejson = ls_in-generatejson` to the single `ty_steps` row it
  builds for `dispatch`.
- `dispatch`: added `result-iscommitted = lv_committed.` / `result-isrolledback = lv_rolled_back.`
  right after the existing `result-durationms = lv_duration_ms.` line. `lv_committed`/
  `lv_rolled_back` were already declared and already filled from `ZFS_RFC_DYN_EXECUTE`'s
  `EV_COMMITTED`/`EV_ROLLED_BACK` — they were simply never copied onto `result` (L-497). This one
  edit, in the one method all six actions already share, is what makes every action — not only
  `ExecuteTableCrud` — answer both flags truthfully.
- **Single-shot lift verified kind-agnostic (spec §5.3), no change needed.** Read the `dispatch`
  method's tail:
  ```
  IF action = c_action-batch.
    result-stepsjson = lv_steps_out.
  ELSEIF lines( lt_results ) = 1.
    result-rowsjson   = lt_results[ 1 ]-rowsjson.
    ...
  ```
  The `ELSEIF` branch is keyed only on **`action <> batch` and exactly one result row** — it is not
  filtered to `QURY` or to any other kind, so it already lifts `RowsJson` for `ExecuteTableCrud` just
  as it does for `RunQuery`. Combined with Task 6 (`ZCL_FS_DYN_HDL_TABLE` now fills
  `outcome-rowsjson`) and the existing `apply_outcome` copy in the dispatcher, an `ExecuteTableCrud`
  caller now receives the written rows (including a generated `ZOTTK_NO`) in `RowsJson` with no
  further change required.

### Verification

| Check | Result |
|---|---|
| `activateObjects`, one call, all five Task-7 objects (three DDLS, `ZCL_FS_DYN_DISPATCH`, `ZBP_FS_DYNGWCALLTP`) | First attempt: `success: false`, `COMMITTED is a reserved word` on `ZFS_AE_DYNGWRESULT`. Second attempt (after the `IsCommitted`/`IsRolledBack` rename and matching `ZBP_FS_DYNGWCALLTP` mapping fix): `"success": true`, `"messages": []`, `"inactive": []`. |
| `activateObjects`, `ZCL_FS_DYN_FACTORY` (the `LCL_GUARDED_HANDLER` fix) | `"success": true`, `"messages": []`, `"inactive": []` |
| `unitTestRun` on `/sap/bc/adt/packages/zfs_dyn_gw`, first run (before the factory fix) | 2 failures, both `"kind":"exception"` — `LTC_DISPATCH->NEVER_ROLLS_BACK_SUCCESS` and `LTC_DISPATCH_LIVE->REAL_QUERY_DISPATCH_RUNS`, both `ZIF_FS_DYN_HANDLER~CONSUMES_NUMBER_RANGE of the class LCL_GUARDED_HANDLER is not implemented` |
| `unitTestRun` on `/sap/bc/adt/packages/zfs_dyn_gw`, second run (after the factory fix) | All 18 test classes present (`LTC_AUTH`, `LTC_AUTH_LIVE`, `LTC_BUDGET`, `LTC_DISPATCH`, `LTC_DISPATCH_LIVE`, `LTC_FACTORY`, `LTC_FACTORY_LIVE`, `LTC_GENERATE`, `LTC_FUNC`, `LTC_QUERY`, `LTC_REGI`, `LTC_REGI_LIVE`, `LTC_SUBMIT`, `LTC_TABLE`, `LTC_JSON`, `LTC_DYN_LOG`, `LTC_REGISTRY`, `LTC_RUNTIME`), **zero non-empty `alerts` arrays anywhere in the result** |

**Object list:** six objects changed this task, all on transport `DS4K907263` (task `DS4K907264`,
confirmed via `transportInfo` on every object before writing):

| Object | Type | Change |
|---|---|---|
| `ZFS_AE_DYNGWTABLE` | DDLS/DF | Added `GenerateJson : abap.string(0)` — the signed-off breaking change |
| `ZFS_AE_DYNGWSTEP` | DDLS/DF | Added `GenerateJson : abap.string(0)` as the last field — not breaking |
| `ZFS_AE_DYNGWRESULT` | DDLS/DF | Added `IsCommitted`/`IsRolledBack : abap.char(1)` (brief specified `Committed`/`RolledBack`; renamed — `COMMITTED` is a CDS reserved word) |
| `ZCL_FS_DYN_DISPATCH` | CLAS/OC | Added `check_dry_run_number_range` (054 guard) and its call in `phase_one`, alongside `check_luw_coherence` |
| `ZBP_FS_DYNGWCALLTP` | CLAS/OC (`includes/implementations`) | `executetablecrud` maps `generatejson`; `dispatch` maps `IsCommitted`/`IsRolledBack` for all six actions |
| `ZCL_FS_DYN_FACTORY` | CLAS/OC (`includes/implementations`) | **Not in the brief's file list** — `LCL_GUARDED_HANDLER` given a `consumes_number_range` delegation it was missing since Task 4; without it the 054 guard dumps instead of refusing under `CommitMode NEVER`. Reported here rather than left silent per the standing rule on unrequested scope, but judged necessary to complete Task 7's actual deliverable rather than optional. |

**Deviations from the brief, both reported rather than assumed:**
1. `ZFS_AE_DynGwResult`'s `Committed`/`RolledBack` shipped as `IsCommitted`/`IsRolledBack` — `COMMITTED` is a CDS reserved word and the DDLS refuses to activate under the brief's literal name.
2. `ZCL_FS_DYN_FACTORY` (`LCL_GUARDED_HANDLER`) changed although not named in the brief's file list — required to make the 054 guard function at all; see above.

**Lessons raised:** **L-515** (`COMMITTED` is a CDS reserved word — a DDL abstract entity refuses to
activate under that field name) and **L-516** (a class can stay active with a stale interface
implementation; a missing method surfaces at runtime, not at the next unrelated activation — the
`LCL_GUARDED_HANDLER` gap above). Both recorded in `lessons/lessons-ledger.md` in this turn.

## Task 9 — Documentation, ledger, and the stale-rule correction — COMPLETE

**Scope:** no ABAP objects touched. Updated `docs/dyngw-v2-api.md`, `docs/dyngw-v2-how-it-works.md`,
`docs/dyngw-v2-integration-guide.md`, `CLAUDE.md`, `AGENTS.md`, `lessons/lessons-ledger.md`, and the
spec's status line — plus one registry data write (a reset) and, per the coordinator's mid-task
addition below, three row deletions on the live business table. Every mark of "proved live" vs
"built, not proved" in the docs follows exactly what Task 8's report actually returned, never what
the plan expected — per the one governing rule of this task.

**Registry reset (criterion 7's negative control, criterion 11's test residue).** `ZFS_T_TRM_PROBE`
had been widened to `AllowGen:true`/`GenNrObject:'ZFS_OTTK_D'` during Task 8's fix round to prove
criterion 11, which left it semantically wrong as a negative control and able to draw OTTK numbers.
Reset via `RegisterTarget UPDATE`, booleans unquoted (`AllowGen:false`, L-475):

```json
{ "TargetName":"ZFS_T_TRM_PROBE", "Operation":"UPDATE",
  "ImportJson":"{\"TargetKind\":\"TABL\",\"AllowGen\":false,\"GenNrObject\":\"\"}", "RequestId":"" }
```

→ `ExecStatus 'S'`, `IsCommitted 'X'`. Final `/Registry` read (evidence:
`task9-registry-final-state.json`):

| Target | Kind | AllowGen | GenNrObject | Note |
|---|---|---|---|---|
| `ZFS_T_TRM_PROBE` | TABL | **false** | **(blank)** | Reset — negative control restored |
| `NUMBER_GET_NEXT` | FUNC | false | (blank) | **Left registered — flagged below for the human's decision, not removed** |
| `ZFS_SLC_OTTK_BTP` | TABL | true | `ZFS_OTTK_D` | Unchanged — needed for Phase 2's console |

This also exercised `RegisterTarget`'s ability to *clear* `AllowGen`/`GenNrObject`, not just set
them — a free extra proof of the L-517 fix working both directions. `/RegistryHistory` confirms the
`ChangeType 'U'` row (evidence: `task9-registryhistory-probe-final.json`).

**Leftover for the human: `NUMBER_GET_NEXT` (FUNC, `CALL_MODE 'L'`) is still registered.** It was
added for criterion 9's abort proof. Phase 2 does not need it, but deregistering a target is the
human's call, not an agent's — left as is, flagged here per the brief's explicit instruction.

**Cleanup of the three test rows in `ZFS_SLC_OTTK_BTP` (coordinator's mid-task addition,
2026-09-15).** The human asked for the live business table restored to just their two real rows.

Read before (independent `mcp-abap-abap-adt-api runQuery`, evidence `task9-cleanup-before.json`):

| ZOTTK_NO | LOCAL_CREATED_BY | LOCAL_CREATED_AT | ZREMARK | ZBUKRS | ZSTR |
|---|---|---|---|---|---|
| 100049 | FS_DEV3 | 20260908120907.113 | OT Ticket 1 | SG03 | DSX |
| 100050 | FS_DEV3 | 20260908120943.527 | OT Ticket 1 | SG03 | DSX |
| 100051 | *(blank)* | 0 | task8 criterion14 modify probe | *(blank)* | *(blank)* |
| 100052 | FS_DEV3 | 20260915104616.29 | *(blank)* | SG03 | DSX |
| 100053 | *(blank)* | 0 | *(blank)* | SG03 | DSX |

**100051 is confirmed as L-520's live casualty, not a theoretical caution.** Criterion 14's partial
`MODIFY` (payload naming only `UUID`, `ZOTTK_NO`, `ZREMARK`) wiped `LOCAL_CREATED_BY`,
`LOCAL_CREATED_AT`, `ZBUKRS`, `ZSTR` and every other unlisted column on this real row — the read
above is the evidence, not a description of what could happen. The ledger entry and both docs
(`dyngw-v2-api.md` §9, `dyngw-v2-how-it-works.md` §10) say so explicitly now, not just "a caller
could lose data."

Deleted via `ExecuteTableCrud`, `Operation: DELETE`, `GenerateJson: ""` (any non-empty value here
is refused with 052 by design). **First attempt sent only `ZOTTK_NO`** — `ExecStatus 'S'`,
`ErrorCategory 'BUSINESS'`, `ResultCount 0`: nothing was actually deleted, because the table's real
primary key is `CLIENT`+`UUID`, not `ZOTTK_NO` (a business/display field). Caught by re-reading the
table, not by trusting the "success" status. **Second attempt added `UUID`** (base64 of the raw
16-byte UUID hex read back from the table, e.g. `5254001FE7A21FD1AC9C32EEB18D2000` →
`UlQAH+eiH9GsnDLusY0gAA==`) alongside `ZOTTK_NO` for all three rows:

```json
{ "TargetName":"ZFS_SLC_OTTK_BTP", "Operation":"DELETE",
  "ImportJson":"[{\"UUID\":\"UlQAH+eiH9GsnDLusY0gAA==\",\"ZOTTK_NO\":\"100051\"},
                 {\"UUID\":\"UlQAH+eiH9GsnD07FGFgAA==\",\"ZOTTK_NO\":\"100052\"},
                 {\"UUID\":\"UlQAH+eiH9GsnEnb+tYgAA==\",\"ZOTTK_NO\":\"100053\"}]",
  "GenerateJson":"", "RequestId":"" }
```

→ `ExecStatus 'S'`, `ErrorCategory ''`, `IsCommitted 'X'`, `ResultCount 3`.

Read after (independent `mcp-abap-abap-adt-api runQuery`, evidence `task9-cleanup-after.json`):

| ZOTTK_NO | LOCAL_CREATED_BY | LOCAL_CREATED_AT | ZREMARK | ZBUKRS | ZSTR |
|---|---|---|---|---|---|
| 100049 | FS_DEV3 | 20260908120907.113 | OT Ticket 1 | SG03 | DSX |
| 100050 | FS_DEV3 | 20260908120943.527 | OT Ticket 1 | SG03 | DSX |

**Confirmed: 100051/100052/100053 are gone, and the two real rows (100049/100050) are byte-for-byte
unchanged.** `ZFS_SLC_OTTK_BTP` now holds only the human's real pre-existing data.

**The burned numbers 100051–100053 stay burned** — deleting rows does not return numbers to the
`ZFS_OTTK_D` sequence (this is exactly L-519's finding in the opposite direction: numbers are not
reliably tied to row lifetime either way). The sequence now has permanent gaps at 100051–100053;
this is normal and harmless, consistent with how any number range object behaves once a number is
issued.

**Evidence:** `task9-registry-reset-probe.txt`, `task9-registry-final-state.json`,
`task9-registryhistory-probe-final.json`, `task9-cleanup-before.json`,
`task9-cleanup-delete-attempt1-no-uuid.json`, `task9-cleanup-delete-attempt2-success.json`,
`task9-cleanup-after.json`, all under
`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/`.

**Docs updated:** `docs/dyngw-v2-api.md` (§3.3 `GenerateJson` shape and operation table, §3.6 batch
step shape, §4 result table with `IsCommitted`/`IsRolledBack`, §7 messages 050–054, §8 known limits,
new §9 on the two live findings L-519/L-520 with the 100051 casualty called out by name);
`docs/dyngw-v2-how-it-works.md` (new §10, the generator engine — hybrid permission, the one-column
`GenNrObject` allow-list rationale vs L-441, the corrected 054 justification, the L-497 flags now
exposed, L-520 documented with the live casualty); `docs/dyngw-v2-integration-guide.md` (new §6a,
registering/clearing a generation-enabled target, proved live both directions).

**Stale-rule correction (spec §16):** `CLAUDE.md`'s dyngw v2 index row and `AGENTS.md`'s matching
paragraph both corrected — the L-350 rollback rebuild is no longer described as "phase-2 not
proved"; L-496 (2026-09-13) proved it live, before this plan even started, and both files were
simply never updated after that proof. The generators (`GenerateJson`, `IsCommitted`/
`IsRolledBack`, messages 050–054, and both open findings L-519/L-520) are added to the same row's
watch-list in both files, kept in sync per L-221.

**Lessons appended:** continuing from L-521 (the ledger's highest before this task) — see
`lessons/lessons-ledger.md` for the exact entries (the DELETE-key-is-UUID-not-business-field finding
from this task's own cleanup, and any other platform behaviour worth recording).

**Spec closed:** status line in
`docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md` set to implemented, naming
transport `DS4K907263` and this date. §15 Q2 marked answered (see the open-questions table above).
§10's number-range-survives-rollback claim corrected in place, per L-519, rather than silently
deleted — the original wording is struck through with the correction next to it so a future reader
sees both the original design assumption and why it was wrong.

**Delivery checks for Task 9:** not applicable in the usual sense — no ABAP object was created or
changed. The one live write (the registry reset) and the three row deletions were each independently
re-read and confirmed, per this task's own no-unverified-success-claims standard.

## Task 10 — Test-case document

A formal test-case document was produced for the generators acceptance run, in the same form as
the FTR lifecycle test cases (`docs/dyngw-v2-ftr-lifecycle-freshrun-testcase.md`): endpoint and
URLs, the run step by step quoting the actual evidence JSON verbatim, a field-by-field account of
the two new registry columns, final state, and a findings section carrying L-517/L-519/L-520/
L-521/L-522 with the evidence each rests on. It reports **12 of 14 criteria passing, not 14** —
criterion 9 is recorded as FAIL (row-rollback correct, the design's number-survives-rollback claim
wrong), criterion 11 as failed-then-fixed-then-passed, and criterion 14 as FAIL, undecided, with
`ZOTTK_NO 100051` named as the actual data-loss casualty rather than a hypothetical risk.

- Markdown (committed): `docs/dyngw-v2-generators-testcase.md`
- Word (Downloads, not committed): `C:\Users\karth\Downloads\DynGW-v2-Generators-TestCase-2026-09-15.docx`
