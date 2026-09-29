# Populate log/audit fields in ZBP_FS_SLCOTTKDETAILTP and ZBP_FS_SLCDTTKDETAILTP

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — both classes activated clean, both live-tested, no test data left behind

## Scope

`ZBP_FS_SLCOTTKDETAILTP` (`LHC_SlcOttkDetail`, over `zfs_slc_ottk_btp`) never populated any of the
table's log/audit fields on create or update — both the business "log" fields
(`zcreated_by`/`zcreated_date`/`zcreated_time`/`zchanged_by`/`zchanged_date`/`zchanged_time`) and the
standard RAP audit block (`local_created_by`/`local_created_at`/`local_last_changed_by`/
`local_last_changed_at`/`last_changed_at`, per L-218) sat blank on every row, even though all eleven
are exposed read-only via the CDS view and BDEF. Since this is a hand-coded **unmanaged** BO, RAP's
own automatic admin-data population never applies — nothing but explicit ABAP code in the handler
fills them. Human confirmed (asked via `AskUserQuestion`) both sets should be wired up, not just one.

Mid-task the human asked for the identical fix on the sibling `ZBP_FS_SLCDTTKDETAILTP`
(`LHC_SlcDttkDetail`, over `zfs_slc_dttk_btp`), which had the same gap.

For both classes:
- **create**: all eleven fields set — `zcreated_*`/`zchanged_*` to `sy-uname`/`sy-datum`/`sy-uzeit`,
  `local_created_*`/`local_last_changed_*`/`last_changed_at` to `sy-uname`/now (changed = created on
  the initial insert, which is the expected convention).
- **update**: the pre-existing creation values (`zcreated_by`/`zcreated_date`/`zcreated_time`,
  `local_created_by`/`local_created_at`) are captured from the freshly-read `ls_db` *before* the
  `CORRESPONDING ... MAPPING FROM ENTITY` merge and restored immediately after it, then
  `zchanged_*`/`local_last_changed_*`/`last_changed_at` are set to now. This was necessary, not just
  tidy: the pre-existing `CORRESPONDING` merge (documented data-loss defect, L-251) overwrites every
  mapped field from `ls_entity` unconditionally, including these read-only ones (which are always
  initial in `ls_entity` since the client can never send them) — without the explicit restore, every
  `PATCH` would have silently blanked the creation log fields. This fixes that blanking specifically
  for these 5 fields; **L-251's general defect on other business fields is untouched and still open**
  (out of scope here, not requested).

Out of scope: the general L-251 `%control` fix for non-log fields, draft (not applicable, plain
unmanaged BOs), any other object.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Table has two distinct sets of log fields (business `zcreated_by`/`zchanged_by` vs. the standard RAP `local_*` audit block) — which should be populated? | Both, on human instruction (`AskUserQuestion`, "Both sets (Recommended)" selected) | 2026-09-07 |

## Naming gate

Not applicable — no new object created, only two existing behavior implementation classes changed.

## Todo

- [x] 1. Read `ZBP_FS_SLCOTTKDETAILTP`'s `implementations` include, the table, BDEF and root CDS view
      to confirm both field sets exist, are exposed read-only, and are currently never set
- [x] 2. Ask which field set(s) to populate — human chose both
- [x] 3. Add the 11-field population block to `LHC_SlcOttkDetail.create` (all fields, this-moment values)
- [x] 4. Add preserve-then-restore + refresh-changed logic to `LHC_SlcOttkDetail.update`
- [x] 5. Hit a real, persistent `LIMU CINC ... already locked` error trying to write the include —
      traced via `transportInfo`'s `LOCKS` block to a stale enqueue under task `DS4K907264`
      (independent of the SE80 editor the human also had open and closed); resolved once the human
      cleared it via SM12 (L-260)
- [x] 6. First activation attempt failed: `utclong_current( )` is not assignable to
      `local_created_at`/`local_last_changed_at`/`last_changed_at` on this system — they resolve to
      `TIMESTAMPL`, not `UTCLONG` (L-259). Fixed with `GET TIME STAMP FIELD` into a `TIMESTAMPL` var.
- [x] 7. Activated `ZBP_FS_SLCOTTKDETAILTP` clean (only the pre-existing benign
      `READ ZFS_CDS_SLC_001 not implemented` warning)
- [x] 8. Human asked mid-task to do the same for `ZBP_FS_SLCDTTKDETAILTP` — applied the identical
      pattern to `LHC_SlcDttkDetail` (message number 016 for not-found, `zdttk_no` key, `zfs_slc_dttk_btp`)
- [x] 9. Activated `ZBP_FS_SLCDTTKDETAILTP` clean (only the pre-existing benign
      `READ ZFS_CDS_SLC_002 not implemented` warning)
- [x] 10. `inactiveObjects` confirmed `[]`
- [x] 11. Live functional test, both services (PowerShell's `Invoke-WebRequest` TLS-handshake-failed
      in this sandbox against this host — worked around with `curl -k` instead, `dangerouslyDisableSandbox`
      per L-245): `POST` → 201 for both `SlcOttkDetail` (`ZottkNo` `100041`) and `SlcDttkDetail`
      (`ZdttkNo` `100028`), all 11 log fields populated to the creating user/now; `PATCH` (single-field,
      `ZottkValue`/`ZdttkValue` only) → 200, confirmed `zcreated_by`/`zcreated_date`/`zcreated_time`/
      `LocalCreatedBy`/`LocalCreatedAt` **unchanged** from create while `zchanged_*`/
      `LocalLastChangedBy`/`LocalLastChangedAt`/`LastChangedAt` advanced to the patch time; `DELETE` →
      204; re-`GET` → 404. No test data left behind.
- [x] 12. Lessons recorded: L-259 (TIMESTAMPL vs UTCLONG), L-260 (stale CINC lock diagnosis/fix)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_SLCOTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active, changed (not created) |
| ZBP_FS_SLCDTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active, changed (not created) |

## Delivery checks

- [x] Pretty Printer — hand-written with consistent indentation matching each existing file's style;
      no separate pass run
- [x] Syntax check clean — activation surfaced no errors after the L-259 fix
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]` (final state, both classes)
- [x] ATC / Code Inspector — not re-run separately; activation's only diagnostic on either class is the
      pre-existing benign `READ ... not implemented` warning, unchanged from the original build
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — every `setObjectSource`/`activateObjects` call operated
      against `DS4K907263`
- [x] Live functional test — full CREATE → PATCH → DELETE → re-GET cycle on both `SlcOttkDetail` and
      `SlcDttkDetail` via their published OData V4 APIs, log fields verified field-by-field as above.
      No test data left behind (both created records deleted through the API itself; re-`GET`
      confirmed 404 on both).

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-259, L-260.
