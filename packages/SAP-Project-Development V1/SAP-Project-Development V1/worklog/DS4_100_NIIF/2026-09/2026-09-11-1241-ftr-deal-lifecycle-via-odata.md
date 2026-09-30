# Term loan lifecycle through the dynamic gateway: create, settle, post, month-end

- **Date:** 2026-09-11
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP (gateway changes)
- **Transport:** DS4K907263
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

Human asked for a full term-loan lifecycle driven **through OData** (`ZFS_SB_DYNGATEWAY_O4_API`
via `/IWFND/GW_CLIENT`), not by driving the t-codes:

1. Create a term loan via `BAPI_FTR_IRATE_DEALCREATE` — CoCd 1000, product 22A, txn type 100,
   partner 700000453, 01.01.2026–31.12.2026, INR 100,000, 10% fixed, **monthly** interest
2. Settle it via `BAPI_FTR_IRATE_SETTLE`
3. TBB1 for the same CoCd + deal, due date and posting date both 01.01.2026
4. TPM44 and TPM1 for the first month-end from the start date (31.01.2026)
5. One new row in `ZSGSLCTR_FEEDATA`

Out of scope: nothing was created in the ABAP repository beyond the two gateway changes below.

## Outcome

**All five steps complete.** Every step ran as a test run first, then for real.

| # | Step | Result |
|---|---|---|
| 1 | `BAPI_FTR_IRATE_DEALCREATE` | ✅ deal **0000000160440** — 10% fixed, monthly interest, bullet repayment |
| 2 | `BAPI_FTR_IRATE_SETTLE` | ✅ activity 00002 (category 20) in `VTBFHAZU` |
| 3 | TBB1 / `RFTBBB00` | ✅ posted — FI document **0600000270** (01.01.2026) |
| 4 | TPM44 / `RTPM_ACCRUAL_DEFERRAL` | ✅ posted — FI documents **0600000271** (accrual 849.32 INR, 31.01.2026) and **0600000272** (reset, 01.02.2026) |
| 4 | TPM1 / `RTPM_TRL_VALUATION` | ✅ ran clean — *"no write-ups or write-downs"*, so **no documents**, which is the correct answer for a fixed-rate loan at amortised cost |
| 5 | `ZSGSLCTR_FEEDATA` row | ✅ inserted and verified by `SELECT` |

The accrual figure checks out independently: 100,000 × 10% × 31/365 = **849.32 INR**, exactly
31 days of January on act/365.

## Gateway changes made (both activated, 0 messages)

| Object | Change | Lesson |
|---|---|---|
| `ZCL_FS_SLC_GW_SUBMIT` | Removed the `Z*`/`Y*` namespace guard in `prepare_plan`; added local `c_capture_job` and accept `JOB` as a mode | L-359, L-360 |
| `ZFS_RFC_DYNGW_SUBMIT` | New `JOB` capture mode: `JOB_OPEN` → `SUBMIT VIA JOB` → `JOB_CLOSE` → `COMMIT WORK` → poll `TBTCO` → spool via `TBTCP-LISTIDENT` + `RSPO_RETURN_ABAP_SPOOLJOB`; envelope extended with `JOBNAME`/`JOBCOUNT`/`JOBSTATUS`/`SPOOLID` | L-360 |

`ZCL_FS_SLC_GW_BASE` was deliberately **not** touched — the `JOB` constant sits in the submit class
instead, to keep a one-line addition off the foundation class every handler compiles against. Move
it to `c_capture` when that class is next opened for another reason.

## Key findings

- The namespace guard and the `SUBC` check **shared message 027**, which made the guard look like
  "the report isn't executable". Cost real diagnostic time (L-359).
- Report **PARAMETERS already worked** — `prepare_plan` derives `KIND` from
  `RS_REFRESH_FROM_SELECTOPTIONS`, so `P_TEST` binds like any select-option. No change needed.
- Synchronous `SUBM` cannot run GUI-capable reports at all; `JOB` mode is the fix (L-360).
- **TPM44 was never slow — it was unfiltered.** `SO_DEALN` is not a field on that selection screen,
  so the filter was silently dropped and the report processed 2,055 positions across the company
  code in 301 s. The human spotted it from the spool. The real field is **`SO_OTCNR`**; with it the
  same call takes 2.3 s and 25 lines. A wrong `SELNAME` is dropped, not refused, so its only symptom
  is scope (L-361). Poll budget was raised 120 s → 400 s anyway.
- TPM1's test flag is **`X_SIMULA`**, not a `P_*` name, and `VALCAT` must be set (`2` = mid-year
  valuation with reset). It correctly posts nothing here — a fixed-rate loan at amortised cost has
  no market-value movement; its economics surface as the TPM44 accrual.

## Naming gate

Not applicable — no new repository objects. Changes were to two existing `ZFS_*` objects.

## Left on the system

**Registry rows (`ZFS_T_SLC_DYNGW`, `EntryType='R'`, all `IS_ACTIVE='X'`, `ALLOW_WRITE='X'`):**

| Target | Kind | Note |
|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | FUNC | **can create FTR deals** |
| `BAPI_FTR_IRATE_SETTLE` | FUNC | **can settle FTR deals** |
| `RFTBBB00` | SUBM | **can post treasury flows (TBB1)** |
| `RTPM_ACCRUAL_DEFERRAL` | SUBM | TPM44 |
| `RTPM_TRL_VALUATION` | SUBM | TPM1 |
| `RSPARAM` | SUBM | probe target only — **should be deleted or deactivated** |
| `RS_REFRESH_FROM_SELECTOPTIONS` | FUNC | read-only helper |
| `ZFS_CDS_SLC_001`, `ZSGSLCTR_FEEDATA`, `RFC_SYSTEM_INFO`, `ZFS_R_TRM_FWDTXN` | various | from the earlier variation suite |

> **Open risk:** with the namespace guard gone, these rows mean any gateway caller can create and
> settle FTR deals and post treasury flows. Clear `IS_ACTIVE` on the four write-capable rows when
> this testing is finished.

**Business data created:** deal `0000000160440`, its settlement, FI documents `0600000270`,
`0600000271` and `0600000272`, one row in `ZSGSLCTR_FEEDATA` (`ZOTTK_NO 999999`).
Background jobs `ZFSGW_RFTBBB00`, `ZFSGW_RTPM_ACCRUAL_DEFERRAL` and `ZFSGW_RTPM_TRL_VALUATION`
in SM37.

## Evidence

- **Word report:** `worklog/DS4_100_NIIF/FTR-Lifecycle-via-OData-Test-Report.docx` — 18 pages,
  10 embedded screenshots. Per test case: request URL, request JSON, response/spool output,
  expected, actual, verdict.
- **Screenshots:** `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-11-1244-dyngateway-variations/` — the `07`–`14`
  and `20` series belong to this activity (the `00`–`06` series is the earlier variation suite).

## Delivery checks

- [x] Syntax check clean — both objects activated with 0 messages
- [x] Activated, nothing left inactive
- [ ] ATC — not run on the two changed objects
- [ ] ABAP Unit — none applicable
- [x] Verified live end-to-end for all five steps; every posting confirmed against `BKPF`
- [ ] Object list confirmed in the transport — not re-checked (see L-355, objects may sit on an
      older open task regardless of the `DS4K907263` argument passed)

## Lessons raised

**L-359, L-360, L-361**.

## Next session

1. **Deactivate the write-capable registry rows** (the open risk above) and delete the `RSPARAM`
   probe row — nothing further needs them
2. Run ATC on `ZCL_FS_SLC_GW_SUBMIT` and `ZFS_RFC_DYNGW_SUBMIT`
3. Confirm the two objects actually sit on `DS4K907263` (L-355 — they may have landed on an older
   open task regardless of the argument passed)
4. Move `c_capture_job` into `ZCL_FS_SLC_GW_BASE` next time that class is opened
5. Optional: an async `JOB` variant that returns the job id without waiting, for genuine mass runs
   (not needed for deal-level testing — see L-361)
