# Rectify activation error on ZFS_CDS_SLC_001

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Fix the pre-existing CDS view entity `ZFS_CDS_SLC_001` ("OTTK Details", built over table
`zfs_slc_ottk_btp`) so it activates cleanly. The view already existed inactive on the system
(owned by `FS_DEV3`, under task `DS4K907264`/transport `DS4K907263`) — nothing created here, only
the existing view's source corrected via `mcp-abap-abap-adt-api` (change routing, L-212). Out of
scope: the base table `zfs_slc_ottk_btp` itself (not modified, its own currency-annotation
qualification quirk left as-is per L-239/L-240), and the one remaining activation *warning*
(CASE without ELSE on `zref_int`, line 123) — not an error, not fixed, flagged in Delivery checks.

## Open questions

None — no naming, draft, or scope decision required; purely a technical activation fix on an
existing object.

## Naming gate

Not applicable — no object created. `ZFS_CDS_SLC_001`'s own name predates this activity and is out
of the naming gate as a pre-existing object (same treatment as the table in the `SlcOttk` worklog).

## Todo

- [x] 1. Root-cause the activation error via `activateObjects` (systematic debugging: read error,
      reproduce, trace) rather than guessing a fix
- [x] 2. Fix root cause 1 — restate `@Semantics.amount.currencyCode` on every CURR field the view
      exposes, since `@Metadata.ignorePropagatedAnnotations: true` blocks inheriting it from the
      base table (L-239)
- [x] 3. Fix root cause 2 — replace the join to classic DDIC view `IFICOMPANYCODE` (type VIEW,
      forbidden as a base object for `define view entity`) with the released CDS view `I_CompanyCode`
      (L-240)
- [x] 4. Activate — succeeded (one non-blocking warning remains, see Delivery checks)
- [x] 5. Confirm `inactiveObjects` returns `[]`

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CDS_SLC_001 | DDLS/DF | ZFS_SLC_BTP | DS4K907263 (pre-existing task DS4K907264) | active (changed, not created) |

## Delivery checks

- [x] Pretty Printer — not run; only the necessary lines edited, existing formatting preserved
- [x] Syntax check clean — `syntaxCheckCdsUrl` returned no findings before the fix (the failures were
      activation-time DDIC checks, not syntax errors)
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [ ] ATC / Code Inspector — not run (out of scope for a pre-existing object's activation fix;
      one activation **warning** remains: "CASE expression without ELSE branch can lead to NULL
      values" on `zref_int`, line 123 — flagged, not fixed, since it's a behavior judgment call
      (what should a non-matching `zref_int` resolve to) beyond "rectify the error")
- [x] ABAP Unit — n/a, CDS view entity
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — `setObjectSource`/`activateObjects` both operated
      against `DS4K907263`

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-239, L-240.
