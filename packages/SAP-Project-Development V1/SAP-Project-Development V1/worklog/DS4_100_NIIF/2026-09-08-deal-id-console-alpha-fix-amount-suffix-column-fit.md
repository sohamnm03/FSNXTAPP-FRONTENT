# Deal ID: NUMC20 truncation bug fix, K/M/B/T amount entry, content-driven column widths

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (existing)
- **Requested by:** user (three follow-up requests on `web/deal-id-console/`)

## Scope

1. Bug report: `ZBP_FS_DEALIDTP-generate_deal_id` produces a Deal ID that is all zeros — the human
   correctly diagnosed the cause (`NUMBER_GET`'s 20-char result truncated into the 10-char target
   field, taking the leading zero digits instead of the real ones) and the fix ("use the alpha
   input").
2. Deal ID Amt should accept K/M/B/T shorthand (e.g. "2.5M" → 2,500,000), matching every other
   amount field across the OTTK/DTTK consoles.
3. OTTK/DTTK grid text still truncating — the first column-width pass (fixed per-column pixel
   guesses) wasn't actually driven by the real data.

## Naming gate

NAMING: N/A -> item 1 changes an existing method's body only; no new object.

## Todo

- [x] 1. Fixed `LHC_DEALIDTP-generate_deal_id`: replaced `rv_deal_id = lv_number` with `CALL
      FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'` (strips `NUMBER_GET`'s NUMC20 leading zeros down to
      the significant value, then re-pads to fit `rv_deal_id`'s actual length) - standard SAP fix
      for exactly this class of bug, requested by name. Left an out-of-band edit already present
      in the same method (`ls_db-zsblc_txn` now set twice, ending at `'01'` instead of blank)
      untouched - not part of this report, not mine to silently revert.
- [x] 2. Ported the K/M/B/T amount-suffix helpers (`AMOUNT_MULTIPLIERS`, `parseAmountSuffix`,
      `formatAmountInput`, `applyAmountSuffix`) verbatim from `web/dttk-console/index.html` into
      `web/deal-id-console/index.html`; applied to `#dealAmt` (`fs-amount-input` class). Also
      matched DTTK console's Save-time guard: `createDealId` now force-applies the conversion
      before validating, in case the field is never blurred (e.g. the user clicks Create right
      after typing, without tabbing away).
- [x] 3. First pass (previous activity) used hand-picked per-column pixel widths - still an
      unmeasured guess, not "fit to data" as asked. Replaced with `table-layout:auto` (removed the
      `<colgroup>` and per-table `min-width` overrides) so each column sizes to its own actual
      widest rendered content, capped at `max-width:360px` so one outlier value can't blow out the
      whole table.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_DEALIDTP | CLAS/OC | ZFS_SLC_BTP | DS4K907279 | Changed: `generate_deal_id` uses `CONVERSION_EXIT_ALPHA_INPUT` |

Local files: `web/deal-id-console/index.html` (amount-suffix wiring, `table-layout:auto`).

## Delivery checks

- [x] `ZBP_FS_DEALIDTP` activated clean (only the same benign, already-known `READ ZFS_I_DEALID
      not implemented` warning as every prior activation of this class).
- [x] Not live-tested with a real Create (same reasoning as every prior activity on this table -
      no synthetic row without being asked; a real `NUMBER_GET` call also permanently advances the
      number range counter even when unused, so it isn't something to invoke just to test). This
      report was itself the human's own real-world test that first surfaced the bug; the fix
      itself is the standard, well-documented SAP idiom for this exact situation.
- [x] Amount-suffix verified live via real typed input: "2.5M" → "2,500,000" on blur; error state
      confirmed clears correctly on form reset.
- [x] Column-fit verified by measurement, not inspection: `scrollWidth > clientWidth` (the actual
      signal that ellipsis is hiding text) checked across every visible cell in both grids after
      loading real data - zero truncated cells in either table. Confirmed visually too (e.g.
      "STANDARD CHARTERED BANK SINGAPORE" and "WESTPAC BANKING CORPORATION" render in full).
- SAP Pretty Printer, ATC, ABAP Unit, text elements, transport-contents confirmation: not
  separately run this turn.

## Lessons raised

L-282: `cl_numberrange_runtime=>number_get`'s `NUMBER` is always `NUMC20` regardless of the
interval's own width - never assign it straight into a differently-sized target field; use
`CONVERSION_EXIT_ALPHA_INPUT`. Full detail in `lessons/lessons-ledger.md`.

## Handover

The next real Create ID attempt through the console is the first true end-to-end verification of
both this fix and the still-untested Create path from earlier activities. `ls_db-zsblc_txn`'s
out-of-band `'01'` override (noted above, not touched here) doesn't threaten key-uniqueness on its
own - `zdeal_id` is still generated uniquely per row, so `(zdeal_id, zsblc_txn)` stays unique even
with `zsblc_txn` fixed at `'01'` for every row - but it is a real, unexplained departure from the
"keep ZSBLC_TXN blank" decision this BO was originally built against (see the first Deal ID
worklog). Worth confirming with whoever made that edit whether `'01'` is now the intended value.
