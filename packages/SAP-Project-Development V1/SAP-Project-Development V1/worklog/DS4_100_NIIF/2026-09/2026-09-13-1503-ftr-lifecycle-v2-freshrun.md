# FTR lifecycle through dyngw v2 — fresh-system re-run with per-step table evidence

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (no repository changes — allow-list and business data only)
- **Transport:** none (allow-list rows are `deliveryClass #A` application data)
- **Requested by:** niranjan.k@fourthsignal.com

## Scope

Re-run the full FTR term-loan lifecycle through v2 **from an empty system**, documenting the
framework's own five tables after **every** step, with a field-by-field explanation of why each
column holds the value it does.

- **Test case:** `docs/dyngw-v2-ftr-lifecycle-freshrun-testcase.md`
- **Word deliverable:** `~/Downloads/DynGW-v2-FTR-Lifecycle-FreshSystem-TestCase-2026-09-13.docx`
- **Evidence:** `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-1310-ftr-lifecycle-v2-fresh/`
  (`raw-calls.log`, `snapshots/` — 40 JSON files, `screenshots/` — 6 PNG)

The five tables (`ZFS_T_DYN_CALL`, `_REG`, `_REGH`, `_STEP`, `ZFS_T_TRM_PROBE`) were emptied by the
**system owner**, not by an agent — the framework refuses to delete its own tables (039/AUTH), which
is the self-protection that closes v1's privilege-escalation hole.

## Outcome

**15 calls, 15 steps, zero failures.** Deal **0000000160456**.

| # | Step | Kind | Result |
|---|---|---|---|
| 0 | Baseline | — | four tables at **0 rows** — the fresh-system premise, evidenced not asserted |
| 1 | Register six targets | REGI | 6 × `ExecStatus S` |
| 2a/2b | `BAPI_FTR_IRATE_DEALCREATE` | FUNC | dry run, then deal **0000000160456** |
| 3 | `BAPI_FTR_IRATE_SETTLE` | FUNC | settled |
| 4a/4b | `RFTBBB00` (TBB1) | SUBM/JOB | FI doc **0600000276** |
| 5a/5b | `RTPM_ACCRUAL_DEFERRAL` (TPM44) | SUBM/JOB | FI docs **0600000277** + **0600000278**, 849.32 INR |
| 6 | `RTPM_TRL_VALUATION` (TPM1) | SUBM/JOB | no write-ups/downs — correct |
| 7 | `ZSGSLCTR_FEEDATA` | TABL | 1 row (`ZOTTK_NO 999997`) |

Table growth, captured after each step: Registry 0→1→6; History 0→1→6; CallLog 0→6→15;
CallStep 0→6→15. **One call, one log row, one step row — no fan-out, no gaps.**

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Snapshot the framework tables via ADT SQL or the service's own entity sets? | **Entity sets** (`/Registry`, `/RegistryHistory`, `/CallLog`, `/CallStep`). Avoids the ADT ~36-query ceiling (L-384) and proves the audit trail through the product's own read surface. | 2026-09-13 |
| 2 | Does a `REGI` step inside `ExecuteBatch` populate `REGH.CALL_UUID`, unlike the single-shot action? | **Untested** — every registration here used single-shot `RegisterTarget`. See L-501. | open |

## Naming gate

Not applicable — no repository objects created.

## Delivery checks

- [x] Verified live end-to-end; postings confirmed in `VTBFHA`, `BKPF`, `ZSGSLCTR_FEEDATA` over
      **ADT SQL**, a channel independent of the gateway
- [x] Framework tables evidenced after every step (10 snapshots × 4 tables)
- [x] **Screenshots captured** — 6 PNG, embedded in the Word deliverable
- [x] Field-by-field data dictionary for all five tables
- [ ] ATC / ABAP Unit — n/a, no objects changed

## Findings

- **L-501 (new):** `ZFS_T_DYN_REGH.CALL_UUID` is all zeros on every row written by a single-shot
  `RegisterTarget` — the history cannot be joined to the call log. Important, not Critical: the
  change itself is fully recorded; only the join is lost.
- **`REG_UUID` zero on a `REGI` step row is correct**, not a defect — a REGI step *creates* a
  registration rather than being dispatched against one. Documented so nobody "fixes" it.
- **The log is written after the execution session returns** — `EXECUTED_AT` precedes
  `LOCAL_CREATED_AT` by ~28 ms. That ordering is the L-350 architecture working.
- **A dry run is logged like any other call.** Correct: absence would make the log a success journal.

## Process notes

**Screenshot capture had to be fixed twice, and the first failure is the instructive one.**
Selecting "the largest SAP window" captured the **wrong session** five times — real SAP screens,
plausibly named files, showing a table that was not the one navigated to. Nothing about those images
looked wrong; they were caught only by opening them. Captures are now selected **by window title**
and refuse to save when nothing matches. Deleted the bad files rather than shipping them.

`SE16N` is blocked by the sap-gui security policy; `SE16` is permitted and was used instead. The
policy was **not** altered to work around the block.

## Left on the system

**Business data:** deal `0000000160456` + settlement; FI documents `0600000276`, `0600000277`,
`0600000278`; one `ZSGSLCTR_FEEDATA` row (`ZOTTK_NO 999997`).
**Framework data:** 6 registry rows, 6 history rows, 15 call-log rows, 15 step rows.
**Jobs:** `ZFSDYN_RFTBBB00` ×2, `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` ×2, `ZFSDYN_RTPM_TRL_VALUATION`.

> **OPEN RISK:** six write-capable targets are registered and active — any caller with `ZFS_DYNGW`
> execute rights can create and settle FTR deals and post treasury flows through v2. Deactivate with
> `RegisterTarget` / `Operation UPDATE` / `{"IsActive":false}` when testing is finished.

## Lessons raised

**L-501**.
