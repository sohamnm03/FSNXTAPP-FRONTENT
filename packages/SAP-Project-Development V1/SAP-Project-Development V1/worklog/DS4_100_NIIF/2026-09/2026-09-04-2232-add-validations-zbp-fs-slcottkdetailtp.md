# Add basic field validations to ZBP_FS_SLCOTTKDETAILTP

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Add two basic field validations to the existing unmanaged RAP BO behavior implementation class
`ZBP_FS_SLCOTTKDETAILTP` (`LHC_SlcOttkDetail`, over root view `ZFS_CDS_SLC_001` / table
`zfs_slc_ottk_btp`, built earlier this session):

1. `Zdate` must be later than the current system date.
2. `ZottkValue` must be greater than zero.

Change only, no new object created — routed through `mcp-abap-abap-adt-api` per CLAUDE.md rule 6 /
L-212. Out of scope: any other field on this BO, the sibling `ZFS_CDS_SLC_002`/`LHC_SlcDttkDetail`
BO (not touched), and draft (not requested, not applicable to this plain unmanaged BO).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Where should the validation logic live — inline in `create`/`update`, or a separate method? | Human: put it in a separate method rather than duplicating the `IF` checks inline. Then, once built and live-tested clean: keep this as the standard pattern for RAP validations in this workspace going forward. Implemented as a shared private method `validate_zdate_zottk_value` on `LHC_SlcOttkDetail`, called from both `create` and `update`. `docs/rap-unmanaged-web-api-pattern.md` §8 updated with the pattern; `lessons/lessons-ledger.md` L-248 records the decision. | 2026-09-04 |
| 2 | Should the checks fire only when the field is supplied, or always? | Not explicitly asked — resolved by a live-test finding (L-250): `Zdate` skips validation when not supplied (DATS-initial is a genuine "no date" sentinel), but `ZottkValue`'s "greater than zero" check fires unconditionally, since a CURR field's initial value **is** zero and cannot be told apart from an explicit 0. | 2026-09-04 |

## Naming gate

Not applicable — no new object created, only an existing behavior implementation class changed.

## Todo

- [x] 1. Add private validation method `validate_zdate_zottk_value` (shared by `create`/`update`) to
      `ZBP_FS_SLCOTTKDETAILTP`'s `LHC_SlcOttkDetail`, per human's separate-method request
- [x] 2. Wire the method into `create` (against the incoming entity row) and `update` (against the
      merged row, post `CORRESPONDING BASE(...)`), each building its own `failed`/`reported` entry
      via `NEW_MESSAGE_WITH_TEXT` (BDEF-level `validation` is not available for plain unmanaged, per
      `docs/rap-unmanaged-web-api-pattern.md` §8)
- [x] 3. Activate — clean each time (`inactiveObjects` `[]`; only the pre-existing benign
      `READ ZFS_CDS_SLC_001 not implemented` warning)
- [x] 4. Live functional test round 1 (PowerShell, `dangerouslyDisableSandbox`) — found a real bug:
      `ZottkValue = 0` was accepted (201) because the check was guarded by `IS NOT INITIAL`, and 0
      **is** the initial value for a CURR field (L-250). Stray record `ZottkNo 100029` created by
      the bug.
- [x] 5. Fix — removed the initial-guard on the `ZottkValue` check only (kept it for `Zdate`, where
      DATS-initial is a genuine, distinguishable "no date" sentinel); re-activated clean
- [x] 6. Cleanup — deleted stray record `100029` via the published API; re-`GET` confirmed 404
- [x] 7. Live functional test round 2 (full re-run) — all cases now behave as expected; found a
      second issue along the way: the `Zdate` message text (55 chars) was silently truncated to 50
      chars by `NEW_MESSAGE_WITH_TEXT` (L-249); the 49-char `ZottkValue` message was unaffected.
      Shortened the `Zdate` message text and re-verified both messages render in full.
- [x] 8. `docs/rap-unmanaged-web-api-pattern.md` §8 updated with the shared-validation-method pattern
      and both gotchas (message-length cap, `IS NOT INITIAL` vs. a positivity check)
- [x] 9. `lessons/lessons-ledger.md` updated same turn: L-248 (standard pattern, human-confirmed),
      L-249 (50-char message truncation), L-250 (corrects L-248's blanket "skip when initial" framing
      for the `ZottkValue` check specifically)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_SLCOTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active, changed (not created) |

## Delivery checks

- [x] Pretty Printer — hand-written with consistent indentation, matching the existing file's style;
      no separate pass run
- [x] Syntax check clean — activation surfaced no errors across all three iterations
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]` (final state)
- [x] ATC / Code Inspector — not re-run separately; activation's only diagnostic is the pre-existing
      benign `READ ZFS_CDS_SLC_001 not implemented` warning, unchanged from the original build
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — every `setObjectSource`/`activateObjects` call
      operated against `DS4K907263`
- [x] Live functional test — full CREATE/PATCH matrix for both rules (invalid-equal-to-today,
      invalid-zero, invalid-negative, valid) via the published OData V4 API
      (`ZFS_SB_SLCOTTKDETAIL_O4_API`), PowerShell with `dangerouslyDisableSandbox` per L-245. No test
      data left behind — every record created during testing (including the one created by the
      round-1 bug) was deleted via the API itself and re-`GET` confirmed 404.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-248, L-249, L-250.
