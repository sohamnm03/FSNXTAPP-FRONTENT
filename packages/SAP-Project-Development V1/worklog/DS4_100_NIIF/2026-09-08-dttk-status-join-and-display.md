# DTTK status join (ZSGSLCTR_DT_STAT) + status desc shown everywhere DTTK is displayed

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026" — existing, `ZFS_CDS_SLC_002` was already
  registered against it, per L-273)
- **Requested by:** human

## Scope

1. `ZFS_CDS_SLC_002` (DTTK Details CDS view) inner-joined to `ZSGSLCTR_DT_STAT`, replacing a
   pre-existing dead/wrong join (see Lessons), exposing a status-description field mirroring
   `ZFS_CDS_SLC_001`'s existing `Zstat_desc` pattern. Propagated through
   `ZFS_C_SlcDttkDetailTP` to the already-published `ZFS_SB_SLCDTTKDETAIL_O4_API`.
2. Every place across the web consoles that displays a DTTK status now shows "code - description"
   instead of the bare code: `web/dttk-console/index.html` (table pill, edit-modal subtitle,
   display-only-modal subtitle), `web/ottk-dttk-console/index.html` (table pill),
   `web/deal-id-console/index.html` (DTTK panel pill).

Out of scope: no change to OTTK's own status handling (already correct), no new SAP objects, no
change to create/update behavior logic, `workbench-v43.html` left untouched (not served —
`sap_config.json` points at `index.html`).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | DTTK `100040` has a blank status; `ZSGSLCTR_DT_STAT` has no blank-code row, so an inner join would make it disappear from every DTTK list. Inner join as literally requested, or left outer (matches OTTK's own join style) to keep it visible? | Inner join as stated | 2026-09-08 |

## Naming gate

No new objects created. New CDS field named `zstat_desc`/`ZstatDesc`, mirroring the existing
`ZFS_CDS_SLC_001`/`ZFS_C_SlcOttkDetailTP` sibling field name exactly (same concept, same name, on
the DTTK side):

```
NAMING: ZstatDesc -> matches sibling field ZFS_C_SlcOttkDetailTP-ZstatDesc (same pattern, DTTK side)
```

## Todo

- [x] 1. Found the DTTK status table `ZSGSLCTR_DT_STAT` and its OTTK counterpart
      `ZSGSLCTR_OT_STAT`; read both to confirm structure (`<x>_ST_ID`, `<x>_ST_NAME`,
      `<x>_ST_DESC`) and content (7 status codes each, no code `04`, no blank code)
- [x] 2. Read `ZFS_CDS_SLC_001` (OTTK) as the working pattern to mirror: `left outer join
      zsgslctr_ot_stat as STAT on STAT.zottk_st_id = a.zottk_st`, exposing
      `cast(concat_with_space(...) as zsgslcdt_ottk_st_desc1 preserving type) as Zstat_desc`
- [x] 3. Read `ZFS_CDS_SLC_002` (DTTK) and found it already had a join to `STAT` — but pointed at
      `zsgslctr_ot_stat` (OTTK's table) keyed on `a.zdttk_st`, and never referenced in any exposed
      field (L-287) — a dead, wrong join, not a working one to extend
- [x] 4. Checked live status values actually in use: OTTK/DTTK both currently only show blank,
      `01`, `06` — all present in the respective status tables except blank
- [x] 5. Flagged the blank-status risk before writing any code; human chose inner join as stated
      (L-289)
- [x] 6. Replaced the dead join with `inner join zsgslctr_dt_stat as STAT on STAT.zdttk_st_id =
      a.zdttk_st`, added `zstat_desc` field; first attempt reused
      `ZSGSLCDT_DTTK_ST_DESC preserving type` and failed activation (length mismatch, data element
      is `CHAR120` vs. computed 45) — fixed by casting to plain `abap.char(120)` (L-288)
- [x] 7. Propagated `zstat_desc as ZstatDesc` into `ZFS_C_SlcDttkDetailTP`
- [x] 8. Activated both together; only the pre-existing AccessControl-annotation warning (same
      class as the Deal ID activity), nothing new
- [x] 9. Verified live: `runQuery` against `ZFS_CDS_SLC_002` and a live OData read through
      `dttk-console`'s own proxy both show `ZstatDesc` populated (e.g. "06 - Fully Assigned to Deal
      ID"), no republish needed; confirmed DTTK `100040` (blank status) is now absent from the
      result set system-wide, as accepted
- [x] 10. Updated every DTTK status display found by grepping `ZdttkSt`/`statusPill` across
      `web/`: `dttk-console` (list pill, edit subtitle, and the display-only subtitle, which
      previously showed no status at all), `ottk-dttk-console` (list pill), `deal-id-console`
      (DTTK panel pill) — each now shows `ZstatDesc||ZdttkSt`
- [x] 11. Verified live in a browser (Playwright): `dttk-console`'s own list and edit-modal
      subtitle, and `deal-id-console`'s DTTK panel, all show the description text

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CDS_SLC_002 | DDLS/DF (changed) | ZFS_SLC_BTP | DS4K907263 | Activated |
| ZFS_C_SLCDTTKDETAILTP | DDLS/DF (changed) | ZFS_SLC_BTP | DS4K907263 | Activated |
| web/dttk-console/index.html | local file (changed) | n/a | n/a | Verified in browser |
| web/ottk-dttk-console/index.html | local file (changed) | n/a | n/a | Changed; not separately re-tested live this turn (same one-line pill fix as the other two, already proven working there) |
| web/deal-id-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No new ABAP objects created.

## Delivery checks

- [x] Syntax check clean — `activateObjects` returned `success:true`, `inactive:[]`
- [x] Activated, nothing left inactive
- [x] Functional test in a real browser against the live system (dttk-console, deal-id-console)
- [ ] ATC / Code Inspector — not run (join + field addition only)
- [ ] ABAP Unit — not applicable, no behavior code changed
- [x] Object list confirmed in the transport (`transportInfo` showed `ZFS_CDS_SLC_002` locked
      under request DS4K907263 / task DS4K907264 before the edit)

Pre-existing `W` (warning) activation messages noted, not introduced by this change: an
`AccessControl` annotation mismatch between `ZFS_CDS_SLC_002` (`#NOT_REQUIRED`) and
`ZFS_C_SlcDttkDetailTP` (`#CHECK`) — same class of warning as the Deal ID activity, pre-existing.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-287, L-288, L-289
