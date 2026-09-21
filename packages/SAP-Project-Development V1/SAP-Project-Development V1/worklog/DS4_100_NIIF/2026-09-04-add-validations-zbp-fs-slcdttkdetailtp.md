# Add basic field validations to ZBP_FS_SLCDTTKDETAILTP

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Mirror the validations just added to `ZBP_FS_SLCOTTKDETAILTP` (`LHC_SlcOttkDetail`) onto the DTTK
sibling `ZBP_FS_SLCDTTKDETAILTP` (`LHC_SlcDttkDetail`, over root view `ZFS_CDS_SLC_002` / table
`zfs_slc_dttk_btp`): (1) `Zdate` must be later than the current system date, (2) the entity's own
value field must be greater than zero. Change only, no new object — routed through
`mcp-abap-abap-adt-api` per CLAUDE.md rule 6 / L-212. Applied the shared-private-validation-method
pattern from L-248 and the two corrections from L-249/L-250 (50-char message cap, no `IS NOT
INITIAL` guard on the positivity check) from the start — no rediscovery needed this time.

Out of scope: any other field on this BO, the sibling OTTK BO (not touched further), draft (not
requested, not applicable).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | `zfs_slc_dttk_btp` carries **two** value-shaped fields relevant here: `ZottkValue` (the parent OTTK record's value, carried for reference) and `ZdttkValue` (this DTTK record's own value). Which one gets the "greater than zero" rule? | Not explicitly asked — resolved by field semantics: `ZdttkValue` is this entity's own value field, structurally analogous to `ZottkValue` on the OTTK BO (same role, different entity). Applied the rule to `ZdttkValue`. Flagged to the human in the same turn rather than silently assumed. | 2026-09-04 |

## Naming gate

Not applicable — no new object created, only an existing behavior implementation class changed.

## Todo

- [x] 1. Add private validation method `validate_zdate_zdttk_value` (shared by `create`/`update`) to
      `ZBP_FS_SLCDTTKDETAILTP`'s `LHC_SlcDttkDetail`, following the L-248 pattern
- [x] 2. Wire into `create` (against the incoming entity row, after the existing `Zbukrs` mandatory
      check) and `update` (against the merged row, post `CORRESPONDING BASE(...)`)
- [x] 3. Apply L-249 (kept both message texts ≤50 chars from the start: 44 and 49 chars) and L-250
      (no `IS NOT INITIAL` guard on the `ZdttkValue` check; kept it for `Zdate` only)
- [x] 4. Activate — clean first time (`inactiveObjects` `[]`; only the pre-existing benign
      `READ ZFS_CDS_SLC_002 not implemented` warning)
- [x] 5. Live functional test (PowerShell, `dangerouslyDisableSandbox`) against
      `ZFS_SB_SLCDTTKDETAIL_O4_API` — all 7 cases (invalid-today, invalid-zero, invalid-negative,
      valid create, invalid-past PATCH, invalid-zero PATCH, valid PATCH) behaved exactly as expected
      on the first run; both messages confirmed rendering in full (no truncation). No test data left
      behind — the one created record (`ZdttkNo 100024`) was deleted via the API and re-`GET`
      confirmed 404.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_SLCDTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active, changed (not created) |

## Delivery checks

- [x] Pretty Printer — hand-written with consistent indentation, matching the existing file's style
- [x] Syntax check clean — activation surfaced no errors
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — not re-run separately; activation's only diagnostic is the pre-existing
      benign `READ ZFS_CDS_SLC_002 not implemented` warning, unchanged from the original build
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — `setObjectSource`/`activateObjects` operated against
      `DS4K907263`
- [x] Live functional test — full CREATE/PATCH matrix for both rules via the published API, no test
      data left behind

## Lessons raised

None new — reused L-248/L-249/L-250 without incident (no new bugs found this time, since both
gotchas from the OTTK build were already designed around).
