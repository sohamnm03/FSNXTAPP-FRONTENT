# FTR term-loan lifecycle re-executed through Dynamic Gateway v2

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (no repository changes — allow-list data only)
- **Transport:** none (allow-list rows are `deliveryClass #A` application data)
- **Requested by:** niranjan.k@fourthsignal.com

## Scope

Confirm that the treasury lifecycle proved on gateway **v1** on 2026-09-11
(`2026-09-11-1241-ftr-deal-lifecycle-via-odata.md`) can be executed end to end through **v2**
(`ZFS_SB_DYNGW_O4_API`): create a term loan, settle it, post it (TBB1), run month-end
(TPM44 + TPM1), and insert a fee row.

**Full test case with every URL, request/response JSON and verification:**
`docs/dyngw-v2-ftr-lifecycle-testcase.md`.
**Raw transcript:** `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2/raw-calls.log`.

Out of scope: no ABAP object was created or changed.

## Outcome

**All five steps completed through v2**, same business outcome as v1 on a new deal.

| # | Step | Kind | v2 result |
|---|---|---|---|
| 1 | `BAPI_FTR_IRATE_DEALCREATE` | FUNC | deal **0000000160455** |
| 2 | `BAPI_FTR_IRATE_SETTLE` | FUNC | activity **00002**, status category 20 |
| 3 | `RFTBBB00` (TBB1) | SUBM/JOB | FI doc **0600000273** (01.01.2026) |
| 4a | `RTPM_ACCRUAL_DEFERRAL` (TPM44) | SUBM/JOB | FI docs **0600000274** (accrual 849.32) + **0600000275** (reset) |
| 4b | `RTPM_TRL_VALUATION` (TPM1) | SUBM/JOB | no write-ups or write-downs — correct, nothing to post |
| 5 | `ZSGSLCTR_FEEDATA` | TABL | 1 row (`ZOTTK_NO 999998`) |

Accrual checks out independently: 100,000 × 10% × 31/365 = **849.32 INR**.

Every step ran as a **test run first, then for real**, matching the v1 discipline.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Would v2's `SUBM` qualifier (043) refuse the treasury reports, as its `CL_GUI_*` rule suggested? | **No.** v2's own check (`WBCROSSGT` joined to `D010INC`, L-409) returns clean for all three; all registered `ExecStatus 'S'`. | 2026-09-13 |
| 2 | Does v2 support `JOB` capture, which v1 had to build for these reports? | **Yes** — `CHECK_MODE` accepts `SALV/LIST/MEMO/NONE/JOB`. The API doc listing only four modes was wrong and is corrected (L-500). | 2026-09-13 |
| 3 | Register the BAPIs with which `CALL_MODE`? | **`L`.** Blank resolves to `'R'` for a remote-enabled BAPI → `DESTINATION 'NONE'` → its own self-committing LUW, which would defeat `TESTRUN` + `CommitMode NEVER`. `'L'` keeps it inside the execution session's LUW. | 2026-09-13 |
| 4 | Is remote-mode (`'R'`) `FUNC` proved by this run? | **No — deliberately not exercised.** Still open. | 2026-09-13 |

## Naming gate

Not applicable — no repository objects created.

## Todo

- [x] 1. Register the six lifecycle targets in v2's allow-list.
- [x] 2. DEALCREATE dry run (`TESTRUN 'X'` + `CommitMode NEVER`), then real.
- [x] 3. Settle; verify in `VTBFHAZU`.
- [x] 4. TBB1 via `SUBM`/`JOB`; verify in `BKPF`.
- [x] 5. TPM44 and TPM1 via `SUBM`/`JOB`; verify in `BKPF`.
- [x] 6. Fee row via `TABL` INSERT; verify by `SELECT`.
- [x] 7. Capture the v2 framework-table logging proof for every activity.
- [x] 8. Write the test case, correct the API doc, raise lessons.
- [ ] 9. **Deactivate the six registrations** — human decision, see the open risk below.

## Object list

No objects created or changed. Six **allow-list rows** added to `ZFS_T_DYN_REG`:
`BAPI_FTR_IRATE_DEALCREATE` (FUNC, CallMode L), `BAPI_FTR_IRATE_SETTLE` (FUNC, CallMode L),
`RFTBBB00` (SUBM), `RTPM_ACCRUAL_DEFERRAL` (SUBM), `RTPM_TRL_VALUATION` (SUBM),
`ZSGSLCTR_FEEDATA` (TABL) — all `IS_ACTIVE`, all `ALLOW_WRITE`.

## v2 framework-table proof

- **`ZFS_T_DYN_REG`** — six rows added, each carrying `reg_uuid` referenced by every step below.
- **`ZFS_T_DYN_REGH`** — a history row per registration (`source 'REGI'`, before/after image).
- **`ZFS_T_DYN_CALL`** — one row per action, verified: `RegisterTarget` ×6 and `ExecuteBatch` ×10,
  with `commit_mode`, `step_count`, `executed_by`, `executed_at`. **Includes the failed call**
  (the 022 JSON-nesting refusal) — refusals are logged, not just successes.
- **`ZFS_T_DYN_STEP`** — one row per step including the failed `RFTBBB00` attempt
  (`exec_status 'E'`, message 020), each carrying `reg_uuid` back to the permitting allow-list row.

Tables read directly by `SELECT` over ADT, independent of the gateway.

## Delivery checks

- [x] Syntax check / activation — n/a, no objects changed
- [x] ATC — n/a
- [x] ABAP Unit — n/a
- [x] Verified live end-to-end; every posting confirmed against `BKPF`, `VTBFHA`, `VTBFHAZU`
- [x] Text symbols — n/a
- [ ] **Screenshots — NOT captured.** `sap_screenshot` returns a blank image here; the SAP GUI
      window is not rendered to a visible desktop session. `FB03` was driven interactively on
      document `0600000274` and reached "Display Document: Data Entry View", so GUI confirmation
      exists as screen state even though the image does not. To get screenshots, the SAP GUI window
      must be open and visible when the run executes.

## Left on the system

**Business data:** deal `0000000160455` + settlement; FI documents `0600000273`, `0600000274`,
`0600000275`; one `ZSGSLCTR_FEEDATA` row (`ZOTTK_NO 999998`).
**Jobs:** `ZFSDYN_RFTBBB00` ×3 (one cancelled), `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` ×2,
`ZFSDYN_RTPM_TRL_VALUATION`.

> **OPEN RISK, identical to the one v1's run recorded:** six write-capable targets are registered
> and active, so any caller with `ZFS_DYNGW` execute rights can create and settle FTR deals and post
> treasury flows through v2. Deactivate when testing is done —
> `RegisterTarget` / `Operation UPDATE` / `{"IsActive":false}`.

## Incident — unfiltered TBB1 job

The first TBB1 attempt used selection names that do not exist on `RFTBBB00`. v2 dropped all of them
silently, so the report ran with no company code, no deal and no product filter, due date defaulted
to today. The step failed on the 400 s poll budget; `BKPF` confirmed nothing had posted; the human
cancelled the job in SM37. Correct names were then read from `RFTBBB00_SEL` and the re-run selected
exactly one record. Raised as **L-498**, with the recommendation that v2 refuse an unknown `SELNAME`
rather than drop it — every other unknown-field surface in v2 already refuses by name (L-405).

## Lessons raised

**L-498** (a non-existent `SUBM` selection name is silently dropped; in `JOB` capture that means a
detached, write-enabled, unfiltered run, and the poll budget is not a safety control),
**L-499** (`RFTBBB00` recomputes its due/posting/document dates from day offsets in batch mode, so
absolute dates can be ignored under `JOB` capture), **L-500** (v2 supports five capture modes
including `JOB`, not the four documented; `P_DEA` gates the whole TPM selection; TPM1 uses bare
parameter names; all three reports' test flags default to ON).

## Next session

1. Decide on deactivating the six registrations (todo 9).
2. Consider the L-498 fix: refuse an unknown `SELNAME` at `PREPARE` instead of dropping it.
3. Remote-mode (`CALL_MODE 'R'`) `FUNC` is still unproven end to end.
4. Capture screenshots if a visible SAP GUI session is available.
