# Rectify activation error on ZFS_CDS_SLC_002

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed

## Scope

Fix the pre-existing CDS view entity `ZFS_CDS_SLC_002` ("DTTK Details", built over table
`zfs_slc_dttk_btp` — the table copied into this package earlier today) so it activates cleanly.
The view was an exact structural clone of `ZFS_CDS_SLC_001`'s original defects — same
`@Metadata.ignorePropagatedAnnotations: true` blocking currency-annotation inheritance (L-239) and
the same `left outer join ificompanycode` classic-DDIC-view join (L-240) — so both known fixes were
applied in a single pass instead of the field-by-field discovery the first occurrence needed.
Nothing created here; only the existing view's source corrected via `mcp-abap-abap-adt-api` (change
routing, L-212).

## Open questions

None — purely a technical activation fix on an existing object, same pattern as the prior
`ZFS_CDS_SLC_001` fix earlier this session.

## Naming gate

Not applicable — no object created. `ZFS_CDS_SLC_002`'s own name predates this activity.

## Todo

- [x] 1. Confirm `mcp-abap-abap-adt-api` connectivity (a prior task this session hit a transient
      `connect ETIMEDOUT 10.40.1.33:44300` on every call; cleared by this task's start — `login`'s
      known response-serialization bug fired once, harmless, login itself succeeded)
- [x] 2. Read source, run `activateObjects` to get the real error (systematic debugging — reproduce
      before fixing, not guess) — confirmed identical `SD_CDS_ENTITY 086` on `ZOTTK_VALUE`
- [x] 3. Fix both known root causes in one pass (L-239 currency annotations on every exposed CURR
      field, L-240 `IFICOMPANYCODE` → `I_CompanyCode`), since the pattern was already proven on
      `ZFS_CDS_SLC_001` earlier today
- [x] 4. Activate — succeeded clean, no errors or warnings at all (unlike `ZFS_CDS_SLC_001`, this
      view's `zref_int` CASE already has an `ELSE 'Fixed'` branch, so it didn't hit that benign
      warning either)
- [x] 5. Confirm `inactiveObjects` returns `[]`

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CDS_SLC_002 | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active (changed, not created) |

## Delivery checks

- [x] Pretty Printer — only the necessary lines edited, existing formatting preserved
- [x] Syntax check clean — activation returned zero messages (errors or warnings)
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — not run (pre-existing object activation fix, no new object)
- [x] ABAP Unit — n/a, CDS view entity
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — `setObjectSource`/`activateObjects` both operated
      against `DS4K907263`

## Lessons raised

None new — this activity **confirmed** L-239 and L-240 as a recurring pattern (same defect shape on
a sibling view built the same way), rather than surfacing a new finding. No ledger entry added to
avoid duplicating those two.
