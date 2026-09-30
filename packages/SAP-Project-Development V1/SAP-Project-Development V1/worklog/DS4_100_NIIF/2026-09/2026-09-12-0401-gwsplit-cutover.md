# Task 7 — Rewrite the log writer onto the new tables (GWCALL/GWSTEP cutover)

## L-350 STATUS: OPEN, ACCEPTED (option a) — 2026-09-12

**L-350 is not fixed. It is open, and the human has chosen to accept the gap rather than force a
design the RAP kernel refuses to run.** `ZCL_FS_SLC_GW_TXN=>finish( )` no longer issues `ROLLBACK
WORK` / `COMMIT WORK` — it only inserts the two log rows into whatever LUW RAP is already managing,
and RAP's own save sequence commits them. `decide( )` still computes `rollback` correctly as an
*analysis* of whether the batch should have been undone, but nothing acts on that analysis any
more. **Consequence:** when a batch step fails after an earlier step already wrote something (a
`TABL` write, an `FUNC` call on the shared RFC session), those earlier writes are **not undone**.
This is the original defect L-350 was opened to describe, now open again, on purpose, because the
alternative — issuing `ROLLBACK WORK`/`COMMIT WORK` from inside RAP action processing — is not
merely inadvisable, it is a documented ABAP runtime error (`BEHAVIOR_ILLEGAL_STATEMENT`) that took
the entire gateway down (see the finding below). Do not "fix" this by reintroducing the
transaction statements. Any future fix needs a different mechanism entirely (e.g. an async RFC/
`CALL FUNCTION ... IN BACKGROUND TASK`-style commit-independent write, or accepting the gap
permanently) — that is a design decision for a human, not a mid-task patch.

## RESUMED again 2026-09-12 — service restored (L-350 option a)

Per the coordinator's explicit instruction, changed `ZCL_FS_SLC_GW_TXN` (outside Task 7's
original Files list, authorised for this specific fix) and executed the priority-ordered
checklist:

**Step 1 — restore the service.** `ZCL_FS_SLC_GW_TXN=>finish( )` rewritten to only
`INSERT zfs_t_slc_gwcall` / `INSERT zfs_t_slc_gwstep FROM TABLE`, no transaction statement.
`decide( )` untouched. Activated (0 messages). Re-ran Task 4's 5 unit tests via `unitTestRun` —
all 5 pass (`ALL_STEPS_OK_COMMITS`, `BUSINESS_ERROR_DOES_NOT_ABORT`,
`COMMIT_NEVER_ALL_OK_ROLLS_BACK`, `COMMIT_NEVER_STILL_ROLLS_BACK`, `FAILED_STEP_ROLLS_BACK` — no
alerts on any). Live verification call (`RunQuery` on `ZFS_CDS_SLC_001`, `RequestId=restore-001`):
**HTTP 200**, `ExecStatus='E'`, `MessageText="Target ZFS_CDS_SLC_001 is not registered for the
dynamic gateway"` (message 017, correct against the empty allow-list). `ZFS_T_SLC_GWCALL` and
`ZFS_T_SLC_GWSTEP` each had exactly 1 row after, `GWSTEP.step_index = 1`. **Service restored.**

**Step 2 — the R4 proof.** Two consecutive `RunQuery` calls, both with `"RequestId":""` (empty
string, field present) — both **HTTP 200**, `ExecStatus='E'` (017), distinct `GwUuid` values.
`ZFS_T_SLC_GWCALL` grew from 1 to 3 rows total; the two new rows' `REQUEST_ID` columns are each
**exactly equal to their own `CALL_UUID`** (`5254001FE7A21FD1ABC9626026D8C000` and
`...626026D9A000` respectively) — the unique index `REQ` tolerated both inserts with no collision.
**R4 proof: PASS.**

**Step 3 — the `RequestId`-mandatory question. Investigated, not guessed.** Fetched the live
`$metadata` and inspected it directly: **every** parameter on **every** one of the four actions
(`RunQuery`, `ExecuteTableCrud`, `ExecuteBatch`, `CallFunctionModule`) — `TargetName`, `Operation`,
`ImportJson`, `TablesJson`, `FieldsJson`, `FilterJson`, `OrderByJson`, `MaxRows`, `StepsJson`,
`CommitMode`, `RequestId` — is generated as `Nullable="false"`, uniformly, with no per-field
differentiation and no annotation anywhere in `ZFS_AE_DynGwRequest`'s DDL source that could
explain why any one of them would be optional. Independently confirmed the coordinator's baseline
claim empirically: a call omitting an **original** field (`TargetName`) fails with the identical
error class as omitting `RequestId` —
`/IWCOR/CX_OD_EP_PARAM_ERROR: "No value for mandatory parameter '<field>' specified"`, same code,
same category, only the field name differs.

**Finding: RequestId cannot be made optional via any CDS annotation on this abstract entity.**
There is no nullable/optional annotation available in ABAP CDS abstract-entity syntax for action
parameters at all — this is a fixed code-generation rule of the RAP/SRVD-V4 tooling for this
release (every elementary-typed field of an action parameter derived from an abstract entity
generates `Nullable="false"` unless the field's own ABAP type is inherently nullable, e.g. a raw
GUID reference — not the case for any of these `abap.char`/`abap.string`/`abap.int4` fields). This
is not new to `RequestId` and not introduced by Task 6: it has been true of the whole action
signature since the service was first built, just never previously exercised because every
existing caller and test script already sends all ten original fields (blank/zero, but present).

**Consequence, per the coordinator's own framing — this is a documentation task, not a code one.**
Every caller must now send `RequestId` as an eleventh field (an empty string is fine and behaves
exactly as "no RequestId" per `find_replay( )`'s blank-input short-circuit). Files affected, not
yet updated in this task (flagged for whoever owns doc maintenance):
- `worklog/DS4_100_NIIF/manual-test-payloads-2026-09-11-1237.txt` — saved payloads predate `RequestId`
  entirely and will now fail with `EP_PARAM_ERROR` if replayed verbatim.
- `docs/dyngateway-integration-guide.md`, `docs/dynamic-gateway-api.md`,
  `docs/dyngateway-how-it-works.md` and any other doc showing a full-body example — need an
  eleventh `RequestId` field added to every sample body (this project's own `scripts/gateway-
  regression.ps1` already had to be extended this same way to keep working).

No CDS object was changed while investigating this — the finding came from reading the existing
DDL, the live `$metadata`, and two live diagnostic calls (an omitted `RequestId`, an omitted
`TargetName`), not from an experimental edit.


## RESUMED 2026-09-12 — connectivity restored, then a live dump found (HARD STOP)

Connectivity to `mcp-abap-abap-adt-api` recovered. Resumed per the coordinator's checklist:

1. **`ZBP_FS_DYNGATEWAYTP` saver pushed and activated.** Re-acquired the lock (a fresh handle —
   the old one from the outage was gone), pushed the drafted empty `LSC_DynGateway~save`, unlocked.
2. **Ruling R6 wired into `ZCL_FS_SLC_GW_DISPATCH`.** Added `find_replay( )` check plus a new
   private `replay_response( )` method, called first thing in both `run_single` and `run_batch`
   (before the registry reset / StepsJson parse). A hit answers from the stored `GWCALL` row alone
   (`exec_status`, `message_text`, `result_count`, `duration_ms`, `Replayed = 'X'`) and returns
   immediately — no step runs, no new row is written. A blank `RequestId` still returns initial
   from `find_replay( )` and falls straight through, unaffected.
3. **All three activated**, `ZCL_FS_SLC_GW_LOG` and `ZCL_FS_SLC_GW_DISPATCH` with 0 messages;
   `ZBP_FS_DYNGATEWAYTP` with one **warning** (`W`, not an error): "The operation 'READ
   ZFS_I_DYNGATEWAY' is not implemented" — pre-existing (this BO has never implemented a READ
   operation; unrelated to this task's changes). `inactiveObjects` confirmed none of the three
   remain inactive; only the four pre-existing objects the controller said to ignore
   (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) are listed.
4. **Smoke test hit the HARD STOP.** See "Critical finding" below — stopped immediately, did not
   patch forward.

## CRITICAL FINDING — live dump, HARD STOP triggered

Two distinct failures, found in this order while attempting the required smoke test:

**Finding A (pre-existing, not from Task 7).** `scripts/gateway-regression.ps1`'s `query` case
(no `RequestId` in the body, matching every caller today) fails at the OData framework layer,
before reaching ABAP at all:
```
/IWCOR/CX_OD_EP_PARAM_ERROR: "No value for mandatory parameter 'RequestId' specified"
```
Reproduced twice (not transient). `ZFS_AE_DynGwRequest-RequestId` is apparently bound as a
**mandatory** OData action parameter, contradicting its documented design ("Optional - additive,
existing callers that send neither are unaffected" — Task 6's brief and the CDS field comment).
This predates Task 7 (the field and its activation are Task 6's), but was never exercised live
until now because nothing called `find_replay`/depended on it being truly optional before this
task's R6 wiring made `RequestId` load-bearing for every call.

**Finding B (the actual dump).** Retried the same `RunQuery` **with** an explicit `RequestId`
(`"DIAG-TEST-0001"`) to isolate whether Finding A was the only problem. It was not:
```
HTTP 500 — code: BEHAVIOR_ILLEGAL_STATEMENT
message: "ABAP Runtime error 'BEHAVIOR_ILLEGAL_STATEMENT'"
```
This is the RAP kernel refusing an explicit `COMMIT WORK`/`ROLLBACK WORK` issued while the current
LUW is under RAP's transactional control — exactly the risk Task 4's own header comment and the
design spec's "open risk 2" named, and which Task 4's ATC run only ever flagged as **priority 3**
(non-blocking) because ATC is a static check and cannot see that this method is invoked
synchronously from inside `LHC_DynGateway`'s action processing at runtime. `ZCL_FS_SLC_GW_TXN=>finish( )`
issues `COMMIT WORK` **unconditionally** on every call (and `ROLLBACK WORK` conditionally) — this
was built and activated in Task 4 but never actually exercised from a live dispatch path until
Task 7 wired `ZCL_FS_SLC_GW_DISPATCH=>finish( )` to call it. **Confirmed the dump writes nothing**:
`SELECT COUNT(*) FROM ZFS_T_SLC_GWCALL` and `...GWSTEP` both still `0` after the failing call.

**Effect on the live service right now:** every call — single-shot or batch, with or without a
`RequestId` — now either fails Finding A's OData parameter check or Finding B's dump. The gateway
is currently unusable end-to-end as a direct, immediate result of activating this task's changes.
This is squarely the documented **HARD STOP** ("if a gateway call errors ... STOP and report
BLOCKED with the exact error. Do not attempt to patch forward"). Stopped here; `ZCL_FS_SLC_GW_TXN`
is a Task 4 deliverable, not in this task's Files list, and its transaction design is exactly what
the spec's own "open risk 2" fallback says returns to the human, not to be patched by the
implementer mid-task.

**Not attempted, and will not be attempted without further instruction:** the two-consecutive-
no-`RequestId` proof (blocked twice over — Finding A rejects the call before ABAP runs, and even
past that, Finding B dumps), any fix to `ZCL_FS_SLC_GW_TXN`, or the `RequestId` mandatory-parameter
metadata issue.


- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** human (via controller, table-split plan Task 7)

## Scope

The service still ran off `ZFS_T_SLC_DYNGW` for its call log until this task. After it, logging
is entirely on `ZFS_T_SLC_GWCALL` / `ZFS_T_SLC_GWSTEP` and the `ZFS_RFC_DYNGW_LOG` durable-emit RFC
path is gone. This is the first task in the table-split plan that changes the behaviour of the
running service (Tasks 1-6 were additive only).

**Corrected routing (not in the original brief):** the brief named `ZCL_FS_SLC_GW_LOG` and
`ZBP_FS_DYNGATEWAYTP` as the files to change. Reading the current system showed the real dispatch
logic — including the old log-writing `finish( )` — lives in `ZCL_FS_SLC_GW_DISPATCH`, not the
behaviour pool (`LHC_DynGateway`'s four action methods are thin 8-38 line delegates to it, per the
2026-09-10 refactor recorded in Task 1). So the actual object list is:

- `ZCL_FS_SLC_GW_LOG` — rewritten: `build_call( )` / `build_steps( )` replace the old
  `ZFS_T_SLC_DYNGW`-shaped writer.
- `ZCL_FS_SLC_GW_DISPATCH` — private `finish( )` rewritten to call the new `ZCL_FS_SLC_GW_LOG`
  builders plus `ZCL_FS_SLC_GW_TXN=>decide( )` / `finish( )`, instead of writing
  `zfs_t_slc_dyngw` rows into `ZCL_FS_SLC_GW_BASE=>gt_log` itself.
- `ZBP_FS_DYNGATEWAYTP` (`includes/implementations`) — `LSC_DynGateway~save` emptied: it no
  longer drains `gt_log` into `ZFS_T_SLC_DYNGW`.

**Out of scope, by deliberate decision (see Concerns below):** wiring `zcl_fs_slc_gw_idem=>find_replay( )`
into `run_single`/`run_batch` to actually skip re-execution and set `Replayed='X'` on a match. Task
6's brief says "Task 7 calls it before executing anything", but Task 7's own Steps never instruct
that wiring — only the R4 blockquote, which cites `find_replay`'s blank-input short-circuit to
justify why a synthetic `request_id` is safe, not to request the skip-on-replay behaviour itself.
Given this is the first behaviour-changing task on a live service with a hard stop condition,
adding unrequested execution-skip logic beyond the literal brief was judged too much scope for one
dispatch. Flagged for the controller to decide whether it is a separate task.

Also out of scope, left alone deliberately: `LHC_DynGateway~executebatch`'s `IF lv_abort = abap_true`
block, which still fails the RAP request on an aborted batch (`failed-dyngateway` + `reported`).
Now that `ZCL_FS_SLC_GW_TXN=>finish( )` commits the log durably and explicitly from inside the
action (not the saver), this old RAP-failure path is likely redundant for rollback (already done)
and may still reproduce L-313's empty-body HTTP 400 on an aborted **batch** specifically. Single-shot
actions (`RunQuery`/`ExecuteTableCrud`/`CallFunctionModule`) are unaffected — only `executebatch`'s
abort branch touches `failed-dyngateway`. Not fixed here because it is outside the literal Step 4
instruction, is a batch-abort-only path not exercised by this task's required proofs, and changing
RAP failure semantics is a bigger behavioural change than "rewrite the log writer." Flagged for the
controller.

## Mid-task context change

The human deleted every row of `ZFS_T_SLC_DYNGW`, including the one registry row
(`BAPI_FTR_IRATE_DEALCREATE`), deliberately, partway through this task. The allow-list is empty.
Per the controller's instruction, this means:
- Every gateway call now answers `017` ("Target ... is not registered"), `ExecStatus='E'`, HTTP 200
  — expected behaviour against an empty allow-list, not a regression.
- The smoke test's real assertion is unchanged: one call must still produce exactly one `GWCALL`
  row and one `GWSTEP` row (`step_index = 1`), asserted on the new tables rather than on
  `ExecStatus='S'`.
- Optionally, one read-only `QURY` target may be self-registered via a `REGI` batch step
  (`ZFS_CDS_SLC_001`, `IsActive='X'`, `AllowRead='X'`, `AllowWrite` blank, `MaxRows` 5) to also
  prove a successful path. Nothing write-capable, and `BAPI_FTR_IRATE_DEALCREATE` is not
  re-registered.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does Task 7 also need to wire `find_replay( )` execution-skip, per Task 6's forward reference? | Not implemented here — out of Task 7's literal Steps; flagged for the controller. | 2026-09-12 |
| 2 | Does `LHC_DynGateway~executebatch`'s abort-fail-the-RAP-request path need to change now that TXN owns rollback explicitly? | Not changed here — flagged as a likely follow-up; not exercised by this task's required proofs. | 2026-09-12 |

## Naming gate

No new objects are created in this task — only existing objects are changed via
`mcp-abap-abap-adt-api` (per the routing table: `adt-mcp` creates, `mcp-abap-abap-adt-api`
changes). The naming gate does not apply.

## Todo

- [x] 1. Read `ZCL_FS_SLC_GW_LOG` current source; identify every `ZFS_T_SLC_DYNGW` write,
      `ENTRY_TYPE`/`PHASE`/`STEP_INDEX` assignment, and the `DESTINATION 'NONE'` emit.
- [x] 2. Discover the real routing: read `ZCL_FS_SLC_GW_DISPATCH` and confirm the old log-writing
      `finish( )` lives there, plus `ZBP_FS_DYNGATEWAYTP`'s `includes/implementations`
      (`LSC_DynGateway~save`).
- [x] 3. Read the Task 4/5/6 deliverables actually on the system (`ZCL_FS_SLC_GW_TXN`,
      `ZCL_FS_SLC_GW_CLASSIFY`, `ZCL_FS_SLC_GW_IDEM`, `ZCL_FS_SLC_GW_BASE`) to confirm the exact
      interfaces `ZCL_FS_SLC_GW_LOG`/`ZCL_FS_SLC_GW_DISPATCH` must call.
- [x] 4. Rewrite `ZCL_FS_SLC_GW_LOG`: `cap_payload( )` (8192-char cap), `build_call( )`,
      `build_steps( )`. Pushed via `setObjectSource` (lock/unlock), transport `DS4K907263`.
- [x] 5. Rewrite `ZCL_FS_SLC_GW_DISPATCH`'s private `finish( )` to call the new builders plus
      `ZCL_FS_SLC_GW_TXN=>decide( )`/`finish( )`; update `run_batch( )`'s tail to pass
      `it_res`/`it_reg_uuid` and drop the old `step_rows( )`/`emit_durable( )` calls. Pushed via
      `setObjectSource`.
- [ ] 6. Empty `LSC_DynGateway~save` in `ZBP_FS_DYNGATEWAYTP` (`includes/implementations`).
      **Source drafted and lock acquired (lockHandle held); push blocked by a sustained
      `mcp-abap-abap-adt-api` connectivity outage — see Concerns.**
- [ ] 7. Activate `ZCL_FS_SLC_GW_LOG`, `ZCL_FS_SLC_GW_DISPATCH`, `ZBP_FS_DYNGATEWAYTP` in one pass;
      confirm via `inactiveObjects`. **Blocked by the same outage — not yet attempted.**
- [ ] 8. Smoke test: one live call via `scripts/gateway-regression.ps1`'s `query` case (now
      expected to answer `017` against the empty allow-list), then confirm `GWCALL`/`GWSTEP` row
      counts. **Blocked — not yet attempted.**
- [ ] 9. Two consecutive calls with no `RequestId` — confirm both succeed (i.e. both are accepted
      for logging, `017` or not) and produce two `GWCALL` rows (Ruling R4 proof).
      **Blocked — not yet attempted.**
- [ ] 10. Read back final activated source of all three changed objects into
       `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-7/`.
       **Partially done — `ZCL_FS_SLC_GW_LOG` and `ZCL_FS_SLC_GW_DISPATCH` source is what was
       pushed (not yet re-read post-activation); `ZBP_FS_DYNGATEWAYTP` not yet pushed.**
- [ ] 11. Write the task-7 report and commit this worklog.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_SLC_GW_LOG | CLAS (rewrite) | ZFS_SLC_BTP | DS4K907263 | Source saved (inactive) |
| ZCL_FS_SLC_GW_DISPATCH | CLAS (rewrite) | ZFS_SLC_BTP | DS4K907263 | Source saved (inactive) |
| ZBP_FS_DYNGATEWAYTP | CLAS/behaviour pool (edit) | ZFS_SLC_BTP | DS4K907263 | **Locked, source not yet pushed** |

No object created. `ZFS_T_SLC_DYNGW`, `ZFS_RFC_DYNGW_LOG`/`ZFS_FG_DYNGW_LOG` untouched (left on
the system, unused after this cutover — `deleteObject` is denied project-wide).

## Delivery checks

- [ ] Pretty Printer — not run (blocked; source was hand-formatted consistently with existing style)
- [ ] Syntax check clean — not yet confirmed (activation blocked)
- [ ] Activated, nothing left inactive — **blocked, not attempted**
- [ ] ATC / Code Inspector — not run
- [ ] ABAP Unit — none applicable to these two classes (no test includes; `ZCL_FS_SLC_GW_TXN`,
      `ZCL_FS_SLC_GW_CLASSIFY`, `ZCL_FS_SLC_GW_IDEM` already have their own from Tasks 4-6)
- [ ] Text symbols and selection texts — not applicable
- [ ] Object list confirmed in the transport — not yet checked

## Concerns for the controller

1. **Sustained `mcp-abap-abap-adt-api` connectivity outage.** Starting partway through this task,
   every call to `mcp-abap-abap-adt-api` — `getObjectSource`, `setObjectSource`, `runQuery`,
   `inactiveObjects`, even against unrelated standard tables (`SFLIGHT`) — failed with
   `connect ETIMEDOUT 10.40.1.33:44300` or a bare `Internal server error`, for roughly 50 minutes
   of continuous retrying at spaced intervals (far longer than the documented "intermittent,
   pause and retry once" pattern). `healthcheck` on the same server kept reporting `"healthy"`
   throughout, so it does not exercise the actual ADT backend connection and is not a reliable
   signal here. `mcp__sap-gui__sap_get_session_info` and `mcp__adt-mcp__abap_list_destinations`
   both worked fine during the same window, confirming the outage is specific to this one
   MCP server's connection to the ADT backend (not a general VPN/system outage, and not a
   credential problem). New lesson raised: L-374.
2. **Task left mid-flight, safely.** `ZCL_FS_SLC_GW_LOG` and `ZCL_FS_SLC_GW_DISPATCH` have new
   source **saved but not activated** on the system. Inactive source does not run — the live
   service is still executing the **old**, pre-Task-7 active versions of both classes, so nothing
   user-facing has changed yet and the service is not in a half-migrated state at runtime.
   `ZBP_FS_DYNGATEWAYTP` is still **locked** (this session's lock handle) with its saver edit
   drafted but not pushed. Resuming this task needs: (a) confirm/re-acquire the lock on
   `ZBP_FS_DYNGATEWAYTP`, (b) push the saver source, (c) activate all three objects in one call,
   (d) run the smoke test and the two-consecutive-no-`RequestId` proof, (e) read back final source
   for the review package.
3. **Two scope questions flagged above** (Open questions 1 and 2) need a decision before Task 8+:
   whether `find_replay( )` execution-skip belongs in this task or a follow-up, and whether
   `LHC_DynGateway~executebatch`'s abort-handling still needs to fail the RAP request now that
   `ZCL_FS_SLC_GW_TXN` owns rollback explicitly.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-374 (see above), L-375
(ZCL_FS_SLC_GW_LOG's `build_call` inline `TYPE c LENGTH 20` parameter hit the same L-373 defect —
fixed the same way, with a named `TYPES ty_action` alias).
