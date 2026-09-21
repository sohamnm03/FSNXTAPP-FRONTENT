# Deal ID status join (ZSGSLCTR_DEAL_ST) + Deal ID list popup

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (existing — "Deal ID unmanaged RAP Web API over ZSGSLCTR_DEALID")
- **Requested by:** human

## Scope

Two changes to the existing Deal ID feature, no new objects:
1. `ZFS_I_DealId` (CDS interface view) inner-joined to `ZSGSLCTR_DEAL_ST` (SLC Deal ID Status
   table) to expose the status description alongside the existing bare status code, propagated
   through `ZFS_C_DealIdTP` (projection view) to the already-published
   `ZFS_SB_DEALID_O4_API` service.
2. `web/deal-id-console/index.html` — new "Deal ID list" button in the top bar, opening a
   read-only, searchable popup listing every Deal ID with full details including status and
   status description.

Out of scope: no changes to the create/update behavior logic, no new SAP objects, no draft, no
new messages.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Popup columns: full detail row or just ID + status? | Full details (Deal ID, OTTK No, DTTK No, Entity ID, Structure, Deal Amt, Currency, Description, Status, Status Desc) with a search box | 2026-09-08 |

## Naming gate

No new objects created. One new CDS field added to existing views — named for consistency with
sibling fields already in the same view (`ZdealIdDesc`, `ZentDesc` elsewhere in the console use
the same `Desc` suffix convention; `docs/naming-conventions.md` line 101, CDS fields are CamelCase):

```
NAMING: ZdealStatDesc -> matches existing CamelCase field-alias convention (docs/naming-conventions.md:101), Desc-suffix precedent (ZdealIdDesc, ZentDesc)
```

## Todo

- [x] 1. Read current `ZFS_I_DealId` / `ZFS_C_DealIdTP` source and `ZSGSLCTR_DEAL_ST` structure
      (`ZSLC_DEAL_STAT` code + `ZSLC_DEAL_SDESC` description, 100 char)
- [x] 2. Confirm existing Deal ID rows are all status `01` (create handler hardcodes `01`), so an
      inner join drops no current rows
- [x] 3. Lock, edit, unlock `ZFS_I_DealId`: add `inner join zsgslctr_deal_st as stat on
      stat.zslc_deal_stat = a.zdeal_stat`, expose `stat.zslc_deal_sdesc as ZdealStatDesc`
- [x] 4. Lock, edit, unlock `ZFS_C_DealIdTP`: propagate `ZdealStatDesc` into the projection
- [x] 5. Activate both in one `activateObjects` call (L-209)
- [x] 6. Verify live: `tableContents` on `ZFS_I_DEALID` and a live OData GET through the console's
      own proxy, both showing `ZdealStatDesc` populated (e.g. `01` → "Create Deal ID") with no
      republish needed (L-255/L-285)
- [x] 7. Add "Deal ID list" button to the console top bar + a modal (styled like the existing
      `ottkModal`) with search box and full-detail table
- [x] 8. Wire the popup to fetch `/api/dealid/DealId` fresh on open, render rows, filter on
      search input, close on Escape/backdrop/Close button
- [x] 9. Functional test in a real browser (Playwright) against the live system: opened the
      popup, confirmed all 3 existing Deal IDs listed with Status + Status Desc, confirmed the
      search box filters correctly

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_DEALID | DDLS/DF (changed) | ZFS_SLC_BTP | DS4K907279 | Activated |
| ZFS_C_DEALIDTP | DDLS/DF (changed) | ZFS_SLC_BTP | DS4K907279 | Activated |
| web/deal-id-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No new ABAP objects created.

## Delivery checks

- [x] Pretty Printer — not applicable (CDS DDL, no ABAP statements added)
- [x] Syntax check clean — `activateObjects` returned `success:true`, `inactive:[]`
- [x] Activated, nothing left inactive
- [ ] ATC / Code Inspector — not run (field addition + join only, no new logic)
- [ ] ABAP Unit — not applicable, no behavior code changed
- [ ] Text symbols and selection texts — not applicable
- [x] Object list confirmed in the transport (`inactiveObjects` before activation showed both
      under DS4K907280 / parent DS4K907279)

Two pre-existing `W` (warning) activation messages noted, not introduced by this change: an
`AccessControl` annotation mismatch between `ZFS_I_DealId` (`#NOT_REQUIRED`) and
`ZFS_C_DealIdTP` (`#CHECK`) — this mismatch existed in the source before this edit.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-285
