# Deal ID create: OTTK/DTTK status update (05/06) and ZACC_TYPE classification

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (existing)
- **Requested by:** user, ABAP reference snippets pasted in two follow-up messages

## Scope

After a Deal ID is created:
1. Update the parent OTTK's and DTTK's status field to `05` (Partially Assigned) or `06` (Fully
   Assigned), based on whether the new deal amount is less than the balance still available on
   that ticket.
2. Set `ZSGSLCTR_DEALID-ZACC_TYPE` on the new row: `01` only when **both** the OTTK's and DTTK's
   own classification field are `01`, else `02`.

The user's reference snippets named `zsgslctr_ottk`/`zsgslctr_dttk` and `zsgslctr_dttk-zacc_type`.
Verified before writing any code that those are not what this console/BO actually reads — see
Open questions.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Reference snippet named `zsgslctr_ottk`/`zsgslctr_dttk`; the console's own OTTK/DTTK data is confirmed (via `ZFS_CDS_SLC_001`/`ZFS_CDS_SLC_002`) to come from `zfs_slc_ottk_btp`/`zfs_slc_dttk_btp` instead. Which pair should the status update target? | `ZFS_SLC_OTTK_BTP` / `ZFS_SLC_DTTK_BTP` (Recommended) | 2026-09-08 |

## Naming gate

NAMING: N/A -> changes an existing method's body only (`ZBP_FS_DEALIDTP-create`); no new object.

## Todo

- [x] 1. Verified field names before writing code (not assumed symmetric): `zfs_slc_ottk_btp` has
      `acc_type` (no `Z`), `zfs_slc_dttk_btp` has `zacc_type` (with `Z`) — read both tables'
      `getObjectSource` directly.
- [x] 2. In `LHC_DEALIDTP-create`, before the `INSERT`: read `acc_type`/`zacc_type` for the
      selected OTTK/DTTK, compute `ZACC_TYPE = '01'` only when both are `'01'`, else `'02'`; also
      read `zottk_value`/`zdttk_value` and the sum of `zdeal_amt` already booked against each
      ticket in `zsgslctr_dealid`, to get each ticket's pre-this-deal balance.
- [x] 3. After a successful `INSERT`: `UPDATE zfs_slc_ottk_btp SET zottk_st` and
      `UPDATE zfs_slc_dttk_btp SET zdttk_st` to `'05'` (new deal amount < balance) or `'06'`
      (amount consumes the full remaining balance).
- [x] 4. Deliberately omitted the reference snippet's explicit `COMMIT WORK AND WAIT` calls — this
      BO's established pattern (see `LSC_DEALIDTP-save`'s own comment, L-227) is no explicit commit
      inside behavior handlers; RAP's own save sequence governs persistence. Also: an explicit
      `COMMIT WORK`/`ROLLBACK WORK` inside a RAP behavior class is a hard syntax error, not just a
      style deviation (L-227 item 1) — the snippet's calls could not have been used verbatim here
      even setting style aside.
- [x] 5. Preserved every out-of-band edit already present in `create` exactly as found:
      `ls_db-zdeal_stat = '01'` and the single `ls_db-zsblc_txn = space` line (this is now the
      *third* round of external edits to this method observed across this session's activities —
      not reverted, not questioned, just built on top of).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_DEALIDTP | CLAS/OC | ZFS_SLC_BTP | DS4K907279 | Changed: `LHC_DEALIDTP-create` now sets `ZACC_TYPE` and updates `zfs_slc_ottk_btp`/`zfs_slc_dttk_btp` status after insert |

No local files touched this activity.

## Delivery checks

- [x] `ZBP_FS_DEALIDTP` activated clean. Only the pre-existing benign warning (`READ ZFS_I_DEALID`
      not implemented) plus two new warnings from the balance-subtraction arithmetic ("For the
      result of a computation with type P, the type P(8,0) is used here implicitly") — both benign,
      same class of warning SAP always emits for untyped DEC arithmetic; no explicit intermediate
      variable was introduced to silence them since neither balance value is stored or compared
      beyond the immediate `COND` check.
- [ ] **Not live-tested with a real Create** — same standing discipline as every prior activity on
      this table (no synthetic row without being asked). The next real Create through the console is
      the first true end-to-end verification of this change: confirm `ZACC_TYPE` lands correctly on
      the new row, and confirm the OTTK/DTTK status fields flip to `05`/`06` as expected on the
      `_btp` tables.
- SAP Pretty Printer, ATC, ABAP Unit, text elements, transport-contents confirmation: not
  separately run this turn.

## Lessons raised

L-283: legacy reference snippets can name the wrong table pair (verify against what the feature's
own read path actually queries); `zfs_slc_ottk_btp`/`zfs_slc_dttk_btp` don't share the
classification field's name (`acc_type` vs `zacc_type`). Full detail in
`lessons/lessons-ledger.md`.

## Handover

Both requested pieces (status update, classification) are implemented and activated clean, but
unverified against a real Create — that's the next real console Create's job. If the balance
figures ever need to reflect the *DTTK's own* trade value differently from OTTK's (e.g. a deal can
be partially assigned against one ticket but fully against the other), the current logic already
handles that correctly since OTTK and DTTK balances/statuses are computed and set independently.
The `zdeal_stat`/`zsblc_txn` out-of-band edits noted in the previous worklog remain unresolved as
an open question for whoever is editing this method in parallel — still worth confirming intent
directly with them.
