# Deal ID create: coding-standards review — existence check, number-range ordering, redundant SELECTs

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (existing)
- **Requested by:** user ("check is that any wat u can optimise and better coding standards in ZBP_FS_DEALIDTP")

## Scope

Human asked for an optimization/coding-standards review of `ZBP_FS_DEALIDTP`, immediately after
the same-day OTTK/DTTK status-update + `ZACC_TYPE` build. Re-fetched live source first (no further
out-of-band edits since that build) and reviewed `create` end to end.

## Todo

- [x] 1. **Real gap, not just style**: `create` had no existence check on `ZottkNo`/`ZdttkNo` — an
      invalid ticket number previously fell through to an orphaned Deal ID insert, a balance
      computed against a zero trade value, and two silent no-op `UPDATE`s. Added a check via
      `sy-subrc` on the (now combined) OTTK/DTTK read, reusing `ZFS_TRM_MSG` 014/016 ("...does not
      exist") — the same messages the sibling `LHC_SlcOttkDetail`/`LHC_SlcDttkDetail` BOs already
      use for this exact condition.
- [x] 2. Moved the existence checks **before** `generate_deal_id( )`. `CL_NUMBERRANGE_RUNTIME=>
      NUMBER_GET` burns the number range permanently, not rolled back on failure — previously a
      request with a bad ticket number still wasted a real Deal ID number even though no row was
      ever created. This falls out of fix #1's reordering, not a separate change.
- [x] 3. Combined the two same-row `SELECT SINGLE`s per ticket (classification field + trade
      value) into one each — was issuing two DB round trips for data that comes off the same row.
- [x] 4. Explicitly typed the two balance variables (`CONV zfs_slc_ottk_btp-zottk_value(...)` /
      `CONV zfs_slc_dttk_btp-zdttk_value(...)`) instead of letting `DATA(...)` infer them from the
      subtraction — clears the implicit-`P(8,0)` activation warnings the prior build left behind.
- [x] 5. Investigated and **retracted** a suspected finding: the method's two
      `NEW_MESSAGE_WITH_TEXT( text = '...' )` calls looked like a `CLAUDE.md` rule-4 ("messages only
      from `ZFS_TRM_MSG`") violation at first glance. Checked
      `docs/rap-unmanaged-web-api-pattern.md` §8 before touching either — free-text
      `NEW_MESSAGE_WITH_TEXT` for validation genuinely local to one BO's own fields is documented,
      intentional house style here (confirmed against `LHC_SlcDttkDetail`, which uses the identical
      pattern). Left both messages untouched.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_DEALIDTP | CLAS/OC | ZFS_SLC_BTP | DS4K907279 | Changed: `LHC_DEALIDTP-create` — existence check + reordering + combined SELECTs + explicit balance types |

## Delivery checks

- [x] Activated clean — only the same pre-existing benign warning (`READ ZFS_I_DEALID` not
      implemented). The two implicit-`P(8,0)` warnings from the prior activation are gone.
- [ ] **Not live-tested with a real Create** — same standing discipline as every prior activity on
      this table. The new existence-check path (invalid `ZottkNo`/`ZdttkNo`) is also untested live;
      a deliberately-invalid, non-mutating POST (bad ticket number, valid-looking otherwise) would
      be the safe way to confirm message 014/016 comes back correctly without ever reaching INSERT.
- SAP Pretty Printer, ATC, ABAP Unit, text elements, transport-contents confirmation: not
  separately run this turn.

## Lessons raised

L-284: the real gaps (missing existence check, number-range-before-validation ordering) plus the
retracted false positive (existing `NEW_MESSAGE_WITH_TEXT` calls are documented house style, not a
rule-4 violation). Full detail in `lessons/lessons-ledger.md`.

## Handover

Message catalog rows 014/016 updated to list this BO as a third consumer (both already existed;
no new message class object created). The still-open item from the prior worklog — confirming
with whoever is editing `create` in parallel whether `zdeal_stat = '01'` is the intended value —
remains open, untouched here.
