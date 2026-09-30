# FTR lifecycle through dyngw v2 — second fresh-system re-run, one Word document per step

- **Date:** 2026-09-13 (started 20:26 local)
- **System:** DS4_100_NIIF (DS4, client 100, user `FS_DEV3`)
- **Package:** ZFS_DYN_GW — **no repository changes**; allow-list rows and business data only
- **Transport:** none (allow-list rows are `deliveryClass #A` application data)
- **Requested by:** the human, in session

## Scope

Repeat the `2026-09-13-ftr-lifecycle-via-dyngw-v2` / `…-v2-freshrun` test case on a system the
human emptied again (`ZFS_T_DYN_CALL`, `ZFS_T_DYN_REG`, `ZFS_T_DYN_REGH`, `ZFS_T_DYN_STEP`,
`ZFS_T_TRM_PROBE`), and produce **one Word document per step** in `~/Downloads`, each one
self-contained for a reader who does not yet know what Dynamic Gateway v2 is.

Each per-step document carries:

- what Dynamic Gateway v2 is, and where this step fits (repeated per document, by design —
  the documents are meant to be readable one at a time)
- the **full URL** of every call the step makes
- the **exact JSON** sent and the exact JSON returned
- which of the five tables the step changed, and **why each column holds what it holds**
- **SE16 screenshots** of those tables, taken after the step

## Method

- The call sequence is byte-for-byte the previous fresh run's (`ftr-v2-fullrun.ps1`), re-cut into
  phases (`ftr-v2-phased.ps1`) so SAP GUI screenshots can be taken between steps. Each phase opens
  its own HTTP session and CSRF token; a gateway call carries no client-side state between phases,
  so phasing changes nothing about what executes.
- Framework tables are snapshotted through the **service's own entity sets** (`/Registry`,
  `/RegistryHistory`, `/CallLog`, `/CallStep`) — the product's own read surface, not a database
  back door, and it avoids the ADT ~36-query ceiling (L-384).
- Business outcomes are verified over **ADT SQL**, a channel independent of the component
  under test.
- Screenshots are taken from SE16 (SE16N is blocked by the sap-gui security policy; the policy was
  **not** altered), selected **by window title** and refusing to save when nothing matches (the
  L-502-era wrong-window trap).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | One document per numbered step (0–7), or one per sub-call (2a/2b, 4a/4b, 5a/5b)? | **Per numbered step**, sub-calls covered inside their step's document, plus one overview document | 2026-09-13 |

## Naming gate

Not applicable — no repository objects are created. The six registry rows are application data
carrying SAP-standard target names (`BAPI_FTR_IRATE_*`, `RFTBBB00`, `RTPM_*`) and one existing
customer table (`ZSGSLCTR_FEEDATA`); none is a new `ZFS*` object.

## Todos

1. [x] Verify the five tables are empty — **all five at 0 rows**, evidenced
2. [x] Step 0 baseline: OData snapshot + 5 SE16 screenshots
3. [x] Step 1 — register the six targets (REGI) — 6 × `ExecStatus S`
4. [x] Step 2 — `BAPI_FTR_IRATE_DEALCREATE` dry run + real (FUNC) — deal **0000000160457**
5. [x] Step 3 — `BAPI_FTR_IRATE_SETTLE` (FUNC)
6. [x] Step 4 — `RFTBBB00` / TBB1 test + real (SUBM) — FI doc **0600000279**
7. [x] Step 5 — `RTPM_ACCRUAL_DEFERRAL` / TPM44 test + real (SUBM) — **0600000280** + **0600000281**
8. [x] Step 6 — `RTPM_TRL_VALUATION` / TPM1 (SUBM) — no write-ups/downs, correct
9. [x] Step 7 — `ZSGSLCTR_FEEDATA` fee row (TABL) — 1 row
10. [x] Verify business outcomes over ADT SQL (`VTBFHA`, `BKPF`, `ZSGSLCTR_FEEDATA`)
11. [x] Build the per-step Word documents into `~/Downloads` — 9 files

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-2026-ftr-lifecycle-v2-fresh-perstep-docs/`
— `raw-calls.log`, `snapshots/` (JSON per table per step), `screenshots/` (SE16 PNG per table
per step), `state.json`.

## Outcome

**15 calls, 15 steps, zero failures** — the same shape as the earlier fresh run, on a
re-emptied system. Deal **0000000160457**.

| # | Step | Kind | Result |
|---|---|---|---|
| 0 | Baseline | — | four tables at **0 rows**, `ZFS_T_TRM_PROBE` 0 — evidenced |
| 1 | Register six targets | REGI | 6 × `ExecStatus S` |
| 2a/2b | `BAPI_FTR_IRATE_DEALCREATE` | FUNC | dry run, then deal **0000000160457** |
| 3 | `BAPI_FTR_IRATE_SETTLE` | FUNC | settled |
| 4a/4b | `RFTBBB00` (TBB1) | SUBM/JOB | FI doc **0600000279** |
| 5a/5b | `RTPM_ACCRUAL_DEFERRAL` (TPM44) | SUBM/JOB | FI docs **0600000280** + **0600000281**, 849.32 INR |
| 6 | `RTPM_TRL_VALUATION` (TPM1) | SUBM/JOB | no write-ups/downs — correct |
| 7 | `ZSGSLCTR_FEEDATA` | TABL | 1 row (`ZOTTK_NO 999997`, `ZDTTK_NO 160457`) |

Table growth captured after every step: Registry 0→1→6; History 0→1→6; CallLog 0→6→15;
CallStep 0→6→15. Accrual verified by hand: 100,000 × 10% × 31/365 = **849.32 INR**.

## Deliverables — nine Word documents in `~/Downloads`

| File | Covers |
|---|---|
| `DynGW-v2-Step-Overview-and-How-To-Use.docx` | what v2 is, how and where to use it, the run summary, the two stated limits |
| `DynGW-v2-Step-0-Baseline.docx` | the empty-system starting point |
| `DynGW-v2-Step-1-Register-Targets.docx` | REGI, plus the field-by-field dictionary for all four tables |
| `DynGW-v2-Step-2-Create-Deal.docx` | FUNC, dry run and real |
| `DynGW-v2-Step-3-Settle-Deal.docx` | FUNC |
| `DynGW-v2-Step-4-TBB1-Post-Flows.docx` | SUBM, and how `FilterJson` works for a report |
| `DynGW-v2-Step-5-TPM44-Accrual.docx` | SUBM, with the arithmetic check and the FB03 document |
| `DynGW-v2-Step-6-TPM1-Valuation.docx` | SUBM, the step whose correct answer is "nothing happened" |
| `DynGW-v2-Step-7-Fee-Row.docx` | TABL INSERT, final state, and the open risk |

Each document repeats the "what is Dynamic Gateway v2" primer so it can be read alone, and
carries the full URL, the exact request JSON (also shown with its nested string layers decoded),
the verbatim response, the before/after row counts for all five tables, SE16 screenshots of the
tables that changed, and — where applicable — independent verification read over ADT SQL.

## Delivery checks

- [x] Verified live end-to-end; postings confirmed in `VTBFHA`, `BKPF` and `ZSGSLCTR_FEEDATA`
      over **ADT SQL**, a channel independent of the gateway
- [x] Framework tables evidenced after every step, by OData snapshot **and** SE16 screenshot
      (35 PNG, every one checked for the wrong-window fault — see L-503)
- [x] One Word document per step in `~/Downloads`, plus an overview
- [x] ATC / ABAP Unit — n/a, no objects changed

## Findings

- **L-503 (new):** `SetForegroundWindow` is advisory — the title-matching screenshot helper saved
  three captures of the *editor* under SAP file names. Fixed with a foreground verification loop
  plus a brightness sanity check; both now refuse to save rather than saving something wrong.
- **L-504 (new):** L-501 reproduces exactly — all six `REGH.CALL_UUID` values are zeros again on a
  second independent fresh run, so the defect is deterministic rather than a one-off. Whether a
  `REGI` step inside a batch behaves differently is **still untested**, both runs having used the
  single-shot action.
- **Re-confirmed:** the durable log is written after the execution session returns
  (`EXECUTED_AT 15:08:57.612238` vs `LOCAL_CREATED_AT 15:08:57.897047`, ~285 ms).
- **Re-confirmed:** a dry run is logged like any other call, and `REG_UUID` zero on a `REGI` step
  row is correct rather than a defect.
- **New, minor:** the step 7 `TABL` INSERT did not collide with the previous run's fee row
  because `ZDTTK_NO` is part of the key — both `ZOTTK_NO 999997` rows now coexist
  (`ZDTTK_NO 160456` and `160457`).

## Process notes

Two step-0 SE16 captures (`ZFS_T_DYN_REGH`, `ZFS_T_DYN_CALL` empty) were lost to the L-503 fault
and **could not be retaken** — by the time it surfaced, both tables had filled. They were replaced
with a different, honest proof: SE16 filtered to rows timestamped before the run started, which
returns "No table entries found", plus a widened-filter positive control showing the filter itself
works. The substitution is stated in the Step 0 document rather than glossed over; the
contemporaneous OData snapshots remain the primary evidence for those two tables.

The SAP GUI session dropped twice (a stale COM handle after a window-state change) and was
reconnected with `sap_connect_existing`; no gateway call was affected, since the run is driven
over HTTPS and not through the GUI. `SE16N` remains blocked by the sap-gui security policy;
`SE16` was used and the policy was **not** altered.

## Left on the system

**Business data:** deal `0000000160457` and its settlement; FI documents `0600000279`,
`0600000280`, `0600000281`; one `ZSGSLCTR_FEEDATA` row (`ZOTTK_NO 999997`, `ZDTTK_NO 160457`).
**Framework data:** 6 registry rows, 6 history rows, 15 call-log rows, 15 step rows.
**Jobs:** `ZFSDYN_RFTBBB00` ×2, `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` ×2, `ZFSDYN_RTPM_TRL_VALUATION`.

> **OPEN RISK:** six write-capable targets are registered and active — any caller with
> `ZFS_DYNGW` execute rights can create and settle FTR deals and post treasury flows through v2.
> Deactivate with `RegisterTarget` / `Operation UPDATE` / `{"IsActive":false}` when testing is
> finished.

## Lessons raised

**L-503**, **L-504**.
