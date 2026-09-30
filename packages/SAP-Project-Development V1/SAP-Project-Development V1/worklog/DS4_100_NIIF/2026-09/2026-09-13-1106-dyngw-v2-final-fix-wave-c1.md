# Dynamic Gateway v2 — final fix wave: C-1, per-step RUNS_IN_CALLER_LUW

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (task DS4K907264)
- **Requested by:** niranjan.k@fourthsignal.com

## Scope

Closes **C-1**, the single Critical returned by the final whole-branch review of the Dynamic
Gateway v2 build. `ZCL_FS_DYN_HDL_FUNC` resolves its call mode per *step* inside `PREPARE` — a blank
`CALL_MODE` on the registry row falls back to `TFDIR-FMODE`, so any remote-enabled BAPI resolves to
`'R'`, which sets `mv_dest = 'NONE'` and makes `EXECUTE` run `CALL FUNCTION ... DESTINATION 'NONE'`:
a synchronous RFC that implicitly commits the caller's LUW. The LUW guard asked a per-*kind* static
(`ZCL_FS_DYN_FACTORY=>RUNS_IN_CALLER_LUW`) that answered `abap_true` for every `FUNC` step, so
`CHECK_LUW_COHERENCE` never saw it. That is **L-350 reproduced inside v2, on the most-used kind, by
default** — a batch `[TABL INSERT, FUNC on a remote BAPI, TABL INSERT that fails]` committed step 1
permanently while reporting `RolledBack: true`.

The fix is granularity, not logic: `runs_in_caller_luw( )` becomes an **instance** method on
`ZIF_FS_DYN_HANDLER`, valid after `PREPARE`. Also in scope: the documentation correction across four
files (the step-kind table asserted the opposite as fact) and the deferred-limit record for L-491.

**Out of scope, deliberately:** the read-only `FUNC` opt-out (I-3 / L-491) — deferred by controller
ruling, documented as a known limit; and the live phase-2 rollback reproduction, which remains
blocked on a human-named writable probe target.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Keep `ZCL_FS_DYN_FACTORY=>RUNS_IN_CALLER_LUW` as the per-kind default (final review's recommendation) or delete it? | **Delete.** A predicate that must not be asked per kind should not remain askable per kind; the dispatcher comment now says never reintroduce it. Controller ruling, superseding the review. | 2026-09-13 |
| 2 | Does `NEEDS_WRITE` collapse into the new predicate? | **No.** Different questions; they deliberately disagree for `SUBM` (`true`/`false`, L-351). C-1 was a granularity defect in the second predicate only. | 2026-09-13 |
| 3 | Is L-426 (`ZFS_DYNGW` granted to nobody) still open? | **UNRESOLVED — two records disagree.** A test-include comment claims the role was created and assigned to `FS_DEV3`; L-426 and the final review say it is granted to nobody. Needs reconciliation against PFCG before any live grant test is believed. | open |

## Naming gate

No new objects were created, so no naming gate applies. `runs_in_caller_luw` is a method on the
existing `ZIF_FS_DYN_HANDLER`; method names are not covered by `docs/naming-conventions.md`.

## Todo

- [x] 1. `ZIF_FS_DYN_HANDLER` — add `runs_in_caller_luw` as an instance method, documented as valid
      only after `PREPARE`, erring toward `abap_false` with no resolved state.
- [x] 2. `ZCL_FS_DYN_HDL_FUNC` — `result = xsdbool( mv_dest IS INITIAL ).`
- [x] 3. `ZCL_FS_DYN_HDL_QUERY` / `_TABLE` / `_REGI` — return `abap_true`; `_SUBMIT` — `abap_false`.
- [x] 4. `LCL_GUARDED_HANDLER` — delegate the new method (the dispatcher only ever holds the wrapper).
- [x] 5. `ZCL_FS_DYN_DISPATCH~PHASE_ONE` — set `ls_plan-in_caller_luw` from the handler instance
      after `PREPARE` succeeds; `PHASE_TWO` sets `is_outside_rollback` from the same plan row.
- [x] 6. `ZCL_FS_DYN_FACTORY` — delete the per-kind static, leaving a comment saying why.
- [x] 7. Activate interface + 5 handlers + factory + include + dispatcher in **one**
      `activateObjects` call, then run the tests (L-398: `unitTestRun` runs the *inactive* include).
- [x] 8. Regression tests pinning C-1, with a falsifiability check in both directions.
- [x] 9. ATC over the eight changed objects.
- [x] 10. Correct the step-kind table and known-limit text in `dyngw-v2-how-it-works.md`,
      `dyngw-v2-api.md`, `dyngw-v2-integration-guide.md` and the `CLAUDE.md` index row.
- [x] 11. Ledger L-492 (the fix and its lesson) and L-493 (the red factory test).
- [ ] 12. **Live phase-2 rollback proof — BLOCKED, human prerequisite.** See below.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZIF_FS_DYN_HANDLER | INTF/OI | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_HDL_FUNC | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_HDL_QUERY | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_HDL_TABLE | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_HDL_SUBMIT | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_HDL_REGI | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |
| ZCL_FS_DYN_FACTORY (+ test include) | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active — per-kind static deleted |
| ZCL_FS_DYN_DISPATCH | CLAS/OC | ZFS_DYN_GW | DS4K907264 | Changed, active |

No object was created and none was deleted.

## Delivery checks

- [x] Pretty Printer
- [x] Syntax check clean
- [x] Activated, nothing left inactive — `inactiveObjects` returns nothing from `ZFS_DYN_GW`,
      confirmed independently by a second agent after the commit
- [x] ATC — **0 P1, 0 P2**, 32 P3 infos across the eight changed objects
- [x] ABAP Unit — **74 of 75 pass** across 7 classes. Dispatcher 17/17 including all four C-1
      guards (`REMOTE_FUNC_WITH_WRITE_REFUSED`, `BLANK_MODE_REMOTE_REFUSED`,
      `LOCAL_FUNC_WITH_WRITE_ALLOWED`, `REMOTE_FUNC_OUTSIDE_ROLLBACK`); `HDL_FUNC` 5/5, `TABLE` 9/9,
      `QUERY` 9/9, `SUBMIT` 9/9, `REGI` 14/14. **The one red test is L-493, not this fix** — see below.
- [x] Text symbols and selection texts — none applicable, no report or screen object touched
- [x] Object list confirmed in the transport

**Falsifiability check, in both directions** (the guard against a test that cannot fail — this
build's signature failure mode): hard-coding `FUNC` to `abap_true` turns `REMOTE_FUNC_WITH_WRITE_
REFUSED` and `BLANK_MODE_REMOTE_REFUSED` red; hard-coding it to `abap_false` turns
`LOCAL_FUNC_WITH_WRITE_ALLOWED` red. `BLANK_MODE_REMOTE_REFUSED` exercises C-1 exactly as it ships —
**no `CALL_MODE` at all**, falling back to `TFDIR-FMODE`.

## What is proved, and what is not

- **C-1 is closed by source inspection plus a falsifiable unit test. It has not been measured
  live.** Stated that way deliberately.
- **L-350's phase-2 rollback closure remains UNPROVEN.** Note the change this fix makes to the
  proof: the final review's "Shape B" — `[TABL ok, FUNC remote, TABL fail]` — is now **refused in
  phase 1** by this very fix, so it executes nothing and can no longer double as the phase-2 proof.
  Closing L-350 needs a **writable, registered `TABL` probe target**; `ZFS_T_DYN_REG` holds three
  rows (`QURY/T005`, `QURY/T000`, `FUNC/RFC_SYSTEM_INFO`), all read-only, none `TABL`. Creating one
  would mean creating a registration and a writable table — both forbidden to an agent (rule 3), so
  the implementer stopped rather than manufacture the proof. **This is a human prerequisite.**
- **`ZFS_DYNGW` grants remain a human PFCG prerequisite (L-426)** — with open question 3 above
  unresolved.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-492** (a capability question
whose answer `PREPARE` can change cannot be answered from a per-kind static; includes the reversal
of the Task 15 controller ruling, and the rule that `NEEDS_WRITE` and `RUNS_IN_CALLER_LUW` must not
be collapsed), **L-493** (`LTC_FACTORY_LIVE~REAL_REGISTRY_EMPTY_017` asserts `ZFS_T_DYN_REG` is
empty and now measures the database rather than the resolver — reported, not fixed).

## Process note

Two implementers were live on these objects at once: the fix wave's original agent, assessed as
dead after ending its session with no commit, no report and no ledger entry, **woke up and finished**
while a replacement was running. No damage resulted — the replacement's SAP interaction was entirely
read-only (`getObjectSource`, `unitTestRun`, one `SELECT`, ATC), and it independently re-verified the
active state as coherent and single-authored. The replacement's documentation edits to
`dyngw-v2-how-it-works.md` were swept into the survivor's commit `c1ce973`; its remaining edits
(`dyngw-v2-api.md`, `dyngw-v2-integration-guide.md`, `CLAUDE.md`, two insertions into L-492) are in
the follow-up commit alongside this worklog. Recorded because "no commit and no report" is not
evidence that an agent has stopped working — in this workspace the ABAP reaches SAP long before any
of those artifacts exist.
