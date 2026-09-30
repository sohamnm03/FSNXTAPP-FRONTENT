# TRM IRATE + FX create: report the deal number when the commit fails (review finding F1)

- **Date:** 2026-09-25
- **Started:** 16:22
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP (pools); ZFS_K2_CC_VS (`ZFS_TRM_MSG`)
- **Transport:** DS4K907209 (pools, task DS4K907260); DS4K907018 (message, task DS4K907194, where `ZFS_TRM_MSG` is locked)
- **Requested by:** human ("yes fix F1, then go ahead with plan 3")

## Scope

This fixes final-review finding F1 of Phase 2 (`2026-09-25-1550-trm-fx-api-phase2.md`) in
`ZBP_FS_TRMIRATETP` and `ZBP_FS_TRMFXTP`.

The problem: DEALCREATE returns a deal number, then `BAPI_TRANSACTION_COMMIT` fails (RFC exception, or
an E/A return), possibly after the commit already went through. The create failure path then reports
only the error and drops the number. A caller who retries can create a duplicate.

The fix: when the commit was attempted and the result has an error, add `ZFS_TRM_MSG` **058**
carrying the company code and deal number.

Out of scope: any other finding (F2–F12 stay deferred), and the deal-item pools (flows use message 057).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Fix F1 in both IRATE and FX? | Yes (human) | 2026-09-25 |

## Naming gate

No new repository object. Message 058 goes into `ZFS_TRM_MSG`, which is the listed exception row in
`docs/naming-conventions.md` (the only message class for new development).

## Todo

- [x] 1. Message **058** (E) "Deal &1 &2 may be saved despite the error - check before retrying":
      - whole-document MSAG PUT (L-225) on DS4K907018
      - T100 verified (055–058 present and correct)
      - catalog row added; next free is 059
- [x] 2. `ZBP_FS_TRMIRATETP` `create`:
      - `lv_committed` is set when `end_luw( abap_true )` is called
      - if the result then has an error, 058 is added (v1 = company code, v2 = deal number, ALPHA out)
        before the failed/reported entries
      - no other method changed
- [x] 3. `ZBP_FS_TRMFXTP` `create`: the same change (its TradedCurrency version kept)
- [x] 4. Both pools activated in one call, no messages; ATC **0 findings**. Regression:
      - `irate-regression.ps1` **IRATE GREEN**:
        - a create refused by the BAPI (transaction type 999) → 400 **without** 058 (rolled back, no deal)
        - a good create → 201, test deal **1000/160543** reversed (ActiveStatus 3)
      - `fx-crud.ps1 -Stage all` (`evidence/…/fx-regression`) **SUITE GREEN**, test deal **9990/40000891**
        reversed in 2 DELETEs
      - The 058 path itself (commit RFC failure after DEALCREATE succeeded) cannot be triggered without
        fault injection, so it is verified by activation, code review and these regressions only
        (same standard as Phase 1 F2).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_TRM_MSG` 058 | MSAG message | ZFS_K2_CC_VS | DS4K907018 | new, verified in T100 |
| `ZBP_FS_TRMIRATETP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | changed (create), active |
| `ZBP_FS_TRMFXTP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | changed (create), active |

## Delivery checks

- [x] Activated, nothing left inactive
- [x] ATC: 0 findings
- [x] Regression suites GREEN (IRATE + FX)

## Hold

The human said "hold the FX option build now" (2026-09-25, during this activity). Plan 3 has not been
started: no plan written, no objects, no discovery.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-584
