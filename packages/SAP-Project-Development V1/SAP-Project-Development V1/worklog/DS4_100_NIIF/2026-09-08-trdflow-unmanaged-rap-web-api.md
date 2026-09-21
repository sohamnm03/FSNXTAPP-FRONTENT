# Unmanaged RAP Web API over ZSGTSFTR_TRDFLOW

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907282 ("Unmanaged RAP Web API over ZSGTSFTR_TRDFLOW", new)
- **Requested by:** human ("create an unmanaged odata api for the table zsgtsftr_trdflow")

## Scope

Full CRUD unmanaged RAP Web API (OData V4) over the pre-existing table `ZSGTSFTR_TRDFLOW`
("Trade Flow Data", package `ZSGPTSF`), exposing all ~89 non-client fields. Built following
`docs/rap-unmanaged-web-api-pattern.md` and mirroring the most recent, most structurally similar
precedent in this workspace (`ZFS_I_DealId`/`ZBP_FS_DEALIDTP` — same shape: BDEF directly on the
interface view, no `_btp` copy, no true `LastChangedAt` timestamp, `authorization master
(global)` with no DCL).

Out of scope: no business logic beyond plain CRUD (nothing was asked for), no draft, no new
number range (keys `ZtfNo`/`ZtfSplit` are client-supplied, matching the table's existing key
shape — no generator/number-range object was requested or exists for this table).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | `zsgtsftr_trdflow` is not in the SLC domain (different package, different field prefix). Which ZFS package should the new objects go into — create a new `ZFS_TSF_BTP`, or reuse the existing `ZFS_SLC_BTP`? | Reuse `ZFS_SLC_BTP` | 2026-09-08 |
| 2 | Table has ~90 fields — expose all, or a specified subset? | All fields | 2026-09-08 |

## Naming gate

```
NAMING: ZFS_I_TrdFlow -> matches Interface view pattern ZFS_I_<Entity> (naming-conventions.md)
NAMING: ZFS_C_TrdFlowTP -> matches projection pattern ZFS_C_<Entity>TP
NAMING: ZBP_FS_TRDFLOWTP -> matches behavior implementation class pattern ZBP_FS_<Entity>
NAMING: EZFS_T_TRDFLOW -> matches lock object pattern EZFS_T_<NAME>, entity-name-based (mirrors EZFS_T_DEALID precedent, since the source table itself isn't ZFS_T_-named)
NAMING: ZFS_SD_TRDFLOW -> matches service definition pattern ZFS_SD_<Entity> (TP stripped)
NAMING: ZFS_SB_TRDFLOW_O4_API -> matches service binding pattern ZFS_SB_<Entity>_O4_API
```

No BDEF for the projection needed a separate naming check — behavior definitions take the name of
the view they attach to (`ZFS_I_TRDFLOW`, `ZFS_C_TRDFLOWTP`), already covered above.

## Todo

- [x] 1. Read `ZSGTSFTR_TRDFLOW` structure (89 fields + client, composite key `ztf_no`/`ztf_split`)
- [x] 2. Created transport DS4K907282
- [x] 3. Created + sourced `ZFS_I_TrdFlow` (interface + root, `select from zsgtsftr_trdflow`,
      `@Metadata.ignorePropagatedAnnotations: true`, all 89 fields CamelCase-aliased)
- [x] 4. First activation attempt failed: 8 CURR-typed fields (`ZallQuant`, `Zunit`, `Zcprice`,
      `Zttv`, `ZbalCpm`, `ZcpmAmt`, `Zamt`, `ZblkBal`) have no currency-code field anywhere on the
      table — fixed by casting each to a plain `abap.dec(<len>,<decimals>)` matching its domain's
      own length/decimals (L-292)
- [x] 5. Created + sourced `ZFS_C_TrdFlowTP` (1:1 projection, all 89 fields)
- [x] 6. Activated both views clean (only the standard, pre-existing-pattern AccessControl
      annotation warning seen on every sibling BO in this workspace)
- [x] 7. Created BDEF `ZFS_I_TRDFLOW` (unmanaged, `lock master` + `authorization master (global)`,
      no `etag master` — table has no true timestamp field, matching `ZFS_I_DealId`'s precedent
      exactly), full `mapping for zsgtsftr_trdflow` block
- [x] 8. Created BDEF `ZFS_C_TRDFLOWTP` (projection, `use create/update/delete`)
- [x] 9. Created `ZBP_FS_TRDFLOWTP` (plain class first, per L-262 hand-wrote `FOR BEHAVIOR OF
      zfs_i_trdflow` into the main include before the implementations include would activate)
- [x] 10. Wrote `LHC_TRDFLOWTP` (create/update/delete/lock/get_global_authorizations) +
      `LSC_TRDFLOWTP` (no-op saver, persistence already committed via Open SQL) in the
      implementations include — `update` uses 81 individual `%control`-guarded field assignments
      (L-251/L-272 discipline: never a blind `CORRESPONDING ... MAPPING FROM ENTITY` on update)
- [x] 11. Created lock object `EZFS_T_TRDFLOW` (auto-selected both key fields)
- [x] 12. Activated projection BDEF + behavior pool class + lock object together — two benign
      warnings only (`Lock parameter ZTF_SPLIT meaningless...` — same class as the pattern doc's
      own example; `READ ZFS_I_TRDFLOW not implemented` — expected default-read behavior)
- [x] 13. Created + activated service definition `ZFS_SD_TRDFLOW` (`expose ZFS_C_TrdFlowTP as
      TrdFlow`)
- [x] 14. Created + activated service binding `ZFS_SB_TRDFLOW_O4_API` (OData V4 - Web API)
- [x] 15. Verified `inactiveObjects` clean — nothing from this build left inactive
- [x] 16. Verified projection view returns real live data via `tableContents`
      (`ZFS_C_TRDFLOWTP`) before publishing
- [x] 17. `scripts/sap-gui-publish-service.py --group-id ZFS_SB_TRDFLOW_O4_API --yes` hung for
      16+ minutes with zero output/log activity — killed both processes (confirmed via
      `fetch_services` that `isPublished` was still `false`, i.e. nothing had been touched) and
      drove the identical 11-step flow by hand via `sap-gui` MCP tools instead (L-293); worked on
      the first attempt, including the L-246 System Alias field (set to `LOCAL`)
- [x] 18. Confirmed `isPublished: true` via `fetch_services`
- [x] 19. Live smoke test: direct HTTPS GET (Basic Auth, TLS verify disabled — same approach as
      every console's `proxy.py`) against
      `.../zfs_sb_trdflow_o4_api/srvd_a2x/sap/zfs_sd_trdflow/0001/TrdFlow` returned HTTP 200 with
      real business data (vessel names, commodities, quantities, prices, dates) across all
      exposed fields

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_TRDFLOW | DDLS/DF | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZFS_C_TRDFLOWTP | DDLS/DF | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZFS_I_TRDFLOW | BDEF/BDO (unmanaged, on the interface view) | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZFS_C_TRDFLOWTP | BDEF/BDO (projection) | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZBP_FS_TRDFLOWTP | CLAS/OC (behavior pool: LHC_TRDFLOWTP, LSC_TRDFLOWTP) | ZFS_SLC_BTP | DS4K907282 | Activated |
| EZFS_T_TRDFLOW | ENQU/DL | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZFS_SD_TRDFLOW | SRVD/SRV | ZFS_SLC_BTP | DS4K907282 | Activated |
| ZFS_SB_TRDFLOW_O4_API | SRVB/SVB | ZFS_SLC_BTP | DS4K907282 | Activated + **published** |

No local files touched this activity.

## Delivery checks

- [x] Syntax check clean — every `activateObjects` call returned `success:true`
- [x] Activated, nothing left inactive (`inactiveObjects` confirmed)
- [x] Service binding published (`isPublished: true`, confirmed via `fetch_services`)
- [x] Live functional test: OData GET returns real data (HTTP 200)
- [ ] ATC / Code Inspector — not run
- [ ] ABAP Unit — not applicable, no test class requested
- [ ] **Create/Update/Delete not live-tested** — same standing discipline as `ZFS_I_DealId`'s own
      build: no synthetic row written to this real business table without being asked. The CRUD
      handlers activate clean and follow the exact same verified pattern as `LHC_DEALIDTP`, but a
      real Create/Update/Delete through this API is the next genuine end-to-end verification step
      whenever this API is actually consumed.
- [x] Object list confirmed in the transport (all objects created directly under DS4K907282)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-292, L-293
