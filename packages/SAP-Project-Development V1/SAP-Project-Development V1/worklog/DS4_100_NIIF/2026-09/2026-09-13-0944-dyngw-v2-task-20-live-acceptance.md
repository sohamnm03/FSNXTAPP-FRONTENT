# Task 20 — regression suite live acceptance run

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (no new objects; this task creates no SAP objects)
- **Requested by:** coordinator dispatch, "live acceptance phase of Task 20"

## Scope

Run `scripts/dyngw-v2-regression.ps1 -Live` against `DS4_100_NIIF` client 100, judge Proof 1 (the
L-350 closure) on its merits, run the full spec §3 capability matrix, and record actual live
results. No SAP objects, roles or users created. Full report appended to
`.superpowers/sdd/2026-09-12-dyngw-v2/task-20-report.md`.

## What happened

1. Pre-flight `GET /$metadata?sap-client=100` confirmed the service reachable and obtained a CSRF
   token before any write. No sign of a concurrent re-publish was observed at any point in the run
   (no CSRF failures, no metadata shape change, no 5xx burst).
2. First `-Live` run: 15 PASS / 5 FAIL / 3 BLOCKED / 3 SKIP.
3. Investigated every FAIL with source review (`ZCL_FS_DYN_RUNTIME`, `ZCL_FS_DYN_HDL_QUERY`,
   `ZCL_FS_DYN_HDL_FUNC`) and targeted raw-body diagnostics rather than guessing. Found and fixed
   **three bugs in the regression script itself** (L-488, L-489, L-490) — none in the product. Left
   one genuine product/design finding (L-491, `FUNC` targets always require `AllowWrite:true`) and
   one state artifact (A-REGI-1 re-registering an already-registered fixture from the first pass).
4. Final `-Live` run: **18 PASS / 2 FAIL (both explained) / 3 BLOCKED / 3 SKIP.**
5. Judged Proof 1 on its own merits rather than accepting the script's PASS label at face value:
   **not proved** as the phase-2 write-then-rollback property the brief states. The REGI
   reproduction is a phase-1 catch (nothing ever executed), which the brief itself says proves
   nothing about rollback. See the report §3 for the full reasoning.

## Naming gate

No objects created; not applicable.

## Todo

- [x] 1. Pre-flight connectivity/CSRF check, watch for concurrent-republish signature.
- [x] 2. Run the full regression suite live.
- [x] 3. Diagnose every FAIL — script bug vs. product defect — before drawing conclusions.
- [x] 4. Fix confirmed script bugs in `scripts/dyngw-v2-regression.ps1`; re-run to a clean result.
- [x] 5. Judge Proof 1 on the property the brief states, not on the script's PASS/FAIL label.
- [x] 6. Append live results to `task-20-report.md`.
- [x] 7. Ledger entries L-488..L-491, same turn.
- [x] 8. This worklog file.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| (none created) | — | — | — | — |

Live data changes (not DDIC objects): `ZFS_T_DYN_REG` gained one row, `FUNC/RFC_SYSTEM_INFO`
(`AllowWrite:false`), registered by case `A-REGI-1` as a deliberate reusable read-only fixture — see
the report and L-491 for why it currently cannot be called. `ZFS_T_DYN_REG` for `ZZPROOF1` was
never persisted (P1-REGI-VERIFY confirmed 0 rows both times). No other table was written.

## Delivery checks

- [x] Lessons ledger updated in the same turn (L-488, L-489, L-490, L-491).
- [x] Worklog file (this one) opened in the same turn.
- [x] Report appended to `.superpowers/sdd/2026-09-12-dyngw-v2/task-20-report.md`.
- [x] No SAP object, role, user, or profile created.
- [x] Proof 1 verdict stated explicitly as NOT proved, with reasoning, per the brief's own
      instruction not to report an unproven closure as proved.

## Open items for the human

See the live-acceptance report §6 in full; summary:

1. Proof 1 needs either a human-named probe table with a secondary unique index, or a ruling that
   the phase-1 REGI corroboration is accepted as sufficient assurance without closing L-350's
   literal write-then-rollback claim.
2. Proof 3 needs a restricted (`EXECUTE`-only) SAP user — unchanged prerequisite from Task 18/20
   authoring.
3. A-FUNC-3 needs a human-named FM with a CHANGING parameter.
4. A-SUBM-2 needs a report registered as a SUBM target (RSPARAM named as a safe candidate).
5. A-TABL-3/MODIFY/DELETE/write-row-budget need a human-approved non-framework writable table.
6. L-491 needs a ruling: is blanket `AllowWrite:true`-for-all-FUNC-calls the intended design?
