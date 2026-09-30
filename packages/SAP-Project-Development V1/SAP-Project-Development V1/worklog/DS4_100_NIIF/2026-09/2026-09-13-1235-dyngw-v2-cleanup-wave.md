# Dynamic Gateway v2 — cleanup wave: two parked Importants + the L-493 test pair

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (task DS4K907264)
- **Requested by:** niranjan.k@fourthsignal.com

## Scope

The last three items before handover of the Dynamic Gateway v2 build. All three are changes to
**existing** objects; **no object was created and none was deleted.**

1. **Fix 1 — an all-out-of-LUW batch claimed a rollback that did not happen.** `RUN` set
   `result-rolled_back = abap_true` on every failure path, including for a batch
   `[FUNC remote, FUNC remote that fails]` that `CHECK_LUW_COHERENCE` legally passes because it holds
   no in-LUW write. Step 1's RFC hop commits its own work; the claim was a loss of atomicity
   reported as a success. The `ROLLBACK WORK` statement stays; the **claim** is now gated.
2. **Fix 2 — the interface contract and its only varying implementer disagreed.**
   `ZCL_FS_DYN_HDL_FUNC~RUNS_IN_CALLER_LUW` answered `xsdbool( mv_dest IS INITIAL )`, i.e.
   `abap_true` with no resolved state, against a contract that says err toward `abap_false`.
3. **Fix 3 — two live tests asserting against the ambient contents of `ZFS_T_DYN_REG`** (L-493), one
   red and one green-but-rotting. Fixed together by controller ruling.

**Out of scope, deliberately:** the real phase-2 rollback path (proved live earlier today, L-496) is
untouched; `NEEDS_WRITE` and `RUNS_IN_CALLER_LUW` stay separate predicates (L-351);
`RUNS_IN_CALLER_LUW` stays an instance method (L-492); exposing `Committed`/`RolledBack` on the
OData action result (L-497) was not attempted.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Should the `rolled_back` narrowing apply to the `CommitMode NEVER` path too? | **No.** There the flag answers "did you honour NEVER?", not "was work recovered"; a read-only dry run answering `abap_false` would be the misleading one. Implementer decision, pinned by two tests in both directions and documented in the class comment and L-498. | 2026-09-13 |
| 2 | Does the narrowing apply to a **phase-1** refusal? | **Yes, by the same rule.** `PHASE_ONE_FAILURE_ROLLS_BACK` (one unregistered read step) now expects `rolled_back = abap_false` while still asserting the `ROLLBACK WORK` was issued; `SUBM_WITH_WRITE_IS_REFUSED` (a TABL write was planned before the guard refused the batch) expects `abap_true`. | 2026-09-13 |
| 3 | Was the named-constant refactor in `ZCL_FS_DYN_HDL_FUNC` in scope? | **Raised by the controller mid-wave; answered: more surface than the fix strictly needs, behaviour-identical, and kept.** See "The one scope question" below. Revertible in one edit if the controller prefers. | 2026-09-13 |

## Naming gate

No object was created, so no naming gate applies. `docs/naming-conventions.md` does not cover method
or local-test-class member names. Two **reserved target names** were introduced as test constants —
`ZFS_NEVER_REGISTERED_FACTORY`, `ZFS_NEVER_REGISTERED_REGISTRY`. They name nothing on any system and
must never be registered in `ZFS_T_DYN_REG`; each test verifies that for itself.

## Todo

- [x] 1. `ZCL_FS_DYN_DISPATCH` — `MV_IN_LUW_WRITE`, set in `PHASE_ONE` from
      `needs_write AND in_caller_luw` as each step is planned; both failure paths in `RUN` claim
      `rolled_back` from it; `CommitMode NEVER` unchanged.
- [x] 2. Dispatcher tests — `OUT_OF_LUW_ABORT_CLAIMS_NONE` (new), the paired assertion in
      `FAILED_STEP_ROLLS_BACK`, updated `PHASE_ONE_FAILURE_ROLLS_BACK`, pinned `NEVER` path.
      `LTD_RUNTIME~CALL_FUNCTION` now honours `FAIL_ON_STEP` so a FUNC batch can be made to abort.
- [x] 3. `ZCL_FS_DYN_HDL_FUNC` — `result = xsdbool( mv_mode = c_mode_local )`.
- [x] 4. FUNC tests — `UNPREPARED_NOT_IN_LUW`, `FAILED_PREPARE_NOT_IN_LUW`,
      `PREPARED_MODE_DECIDES_LUW` (the control, both modes).
- [x] 5. `LTC_FACTORY_LIVE~REAL_REGISTRY_EMPTY_017` -> `REAL_UNREGISTERED_017`, premise established
      by `SELECT`, `017` coverage and rendered text kept.
- [x] 6. `LTC_REGISTRY~LIVE_UNREGISTERED_IS_017` — same treatment, plus the rendered-text assertion
      it lacked.
- [x] 7. Corrected the stale "ZFS_T_DYN_REG is empty" premise in the `LTC_FACTORY_LIVE` and
      `REAL_QUERY_DISPATCH_RUNS` comments.
- [x] 8. Activate all four classes in **one** `activateObjects` call (L-398), then test.
- [x] 9. ATC over the four changed objects.
- [x] 10. Ledger L-498, L-499, L-500.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_DYN_DISPATCH (+ test include) | CLAS/OC | ZFS_DYN_GW | DS4K907263 | Changed, active |
| ZCL_FS_DYN_HDL_FUNC (+ test include) | CLAS/OC | ZFS_DYN_GW | DS4K907263 | Changed, active |
| ZCL_FS_DYN_FACTORY (test include only) | CLAS/OC | ZFS_DYN_GW | DS4K907263 | Changed, active |
| ZCL_FS_DYN_REGISTRY (test include only) | CLAS/OC | ZFS_DYN_GW | DS4K907263 | Changed, active |

`ZIF_FS_DYN_HANDLER` was **not** changed: the contract is right and the code was wrong.

## The one scope question, answered plainly

The controller asked why `RESOLVE_MODE`, `PREPARE` and `BUILD_PLAN` in `ZCL_FS_DYN_HDL_FUNC` were
touched when fix 2 was scoped to `RUNS_IN_CALLER_LUW`.

**They were touched in spelling only.** Two private constants were added —
`C_MODE_LOCAL VALUE 'L'` and `C_MODE_REMOTE VALUE 'R'` — and the bare `'L'` / `'R'` literals in those
three methods replaced by them. No branch, order or value changed; `RESOLVE_MODE` still answers the
registry row first and falls back to `TFDIR-FMODE`, `PREPARE` still sets `MV_DEST = 'NONE'` for `'R'`,
`BUILD_PLAN` still refuses `CHANGING` in `'R'`.

**Why it was done rather than left:** the whole content of fix 2 is that `MV_MODE` INITIAL is *not*
`'L'` — "not resolved" and "resolved to local" are different states that a bare literal repeated
across four methods invites someone to collapse again. Naming the two modes is what makes the new
predicate read as a comparison against a *known* mode rather than against a character.

It is still more surface than the minimum. It is covered by existing tests that would catch a
mistake in each of the three methods (`CHANGING_IN_RFC_MODE_REFUSED` for the `'R'` branch of
`BUILD_PLAN`, the two `TABLES_PARAM_*` tests for the `'L'` path, the dispatcher's four C-1 guards for
`RESOLVE_MODE`'s fallback), and all of them are green. **If the controller would rather have the
minimal diff, reverting to bare literals is one edit and breaks nothing.**

## Delivery checks

- [x] Pretty Printer — source written in house style, no formatter run was needed
- [x] Syntax check clean — activation returned `{"messages":[],"success":true,"inactive":[]}`
- [x] Activated, nothing left inactive — all four classes in **one** `activateObjects` call
- [x] ATC — **0 P1, 0 P2**, 13 P3 infos across the four changed objects
      (worklist `5254001FE7A21FD1ABE603B279F0A000`)
- [x] ABAP Unit — **88 tests, 0 alerts, across 8 classes**, measured on the **ACTIVE** version
      (activated first, per L-398; `inactive` came back empty from the activation itself).
      DISPATCH 18 · HDL_FUNC 8 · FACTORY 12 · REGISTRY 9 · HDL_TABLE 9 · HDL_QUERY 9 · HDL_SUBMIT 9 ·
      HDL_REGI 14. **The previously red `REAL_REGISTRY_EMPTY_017` is gone; its replacement
      `REAL_UNREGISTERED_017` is green.** No known-red test remains in the census.
- [x] Text symbols and selection texts — none applicable, no report or screen object touched
- [x] Object list confirmed in the transport (all four already on DS4K907263)

## Interruption and recovery

This wave was killed mid-flight by an org spend limit, after `ZCL_FS_DYN_DISPATCH/source/main` and
`ZCL_FS_DYN_HDL_FUNC/source/main` had been written but before anything was activated. The controller
found both inactive on SAP and re-dispatched. **Both writes were complete and coherent** — each was a
single whole-source `setObjectSource`, so a partial write was not possible — and were verified by
re-reading `?version=inactive` before any further work (L-398's companion read). Nothing was
discarded and nothing was rewritten from memory.

Mechanics re-confirmed on the way: `setObjectSource` on these objects needs
`transport = DS4K907263` (**the request**, not task `DS4K907264`) — L-471 — and `activateObjects`
refuses with *"User FS_DEV3 is currently editing …"* until every lock handle is released.

## What is proved, and what is not

- **Fix 1 is proved by unit test in both directions, not live.** `OUT_OF_LUW_ABORT_CLAIMS_NONE` and
  `FAILED_STEP_ROLLS_BACK` are a falsifiable pair: make the flag constant either way and one of them
  goes red. No live `ExecuteBatch` was run for this wave — and per **L-497** a live OData run could
  not have observed the flag anyway, since `RolledBack` is not on the action result.
- **Fix 2 closes an inert gap.** It was unreachable through the only caller, and it is fixed so that
  it stays unreachable by construction rather than by call-site discipline. No production behaviour
  changed; nothing about it was measured live, because there was nothing live to measure.
- **Fix 3 is a test-quality fix.** It proves nothing new about the framework; it makes two existing
  proofs survive the system being configured. Both tests still exercise the real `SELECT` and the
  real `017` refusal including rendered text.
- **L-496's phase-2 rollback path is untouched** and its guard test now asserts the flag it proves.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-498, L-499, L-500.**
