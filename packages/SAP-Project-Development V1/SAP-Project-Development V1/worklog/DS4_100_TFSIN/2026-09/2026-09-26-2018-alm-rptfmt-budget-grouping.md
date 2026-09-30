# ALM Report Formats API: add Budget grouping (/FS00/ALMTR006)

- **Date:** 2026-09-26
- **Started:** 20:18
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API`
- **Transport:** `DS4K907106` (same as the rest of `ZFS_SB_ALMRPTFMT_O4_API`)
- **Requested by:** human: "in the OData ZFS_SB_ALMRPTFMT_O4_API add 1 more table budget grouping for crud table name: /FS00/ALMTR006"

## Scope

Add a fourth CRUD entity `BudgetGrouping` over `/FS00/ALMTR006` to the existing service `ZFS_SD_ALMRPTFMT` /
`ZFS_SB_ALMRPTFMT_O4_API`, on the same unmanaged pattern as `Alm1..3Grouping`
(`2026-09-26-1551-alm-reportformats-timebuckets-odata-api.md`). Out of scope: the `/FS00/` table and its
maintenance, and the ALM app (no Budget page wired unless asked).

## Analysis

- `/FS00/ALMR028` does **not** read or write `/FS00/ALMTR006`. The table is maintained by a table maintenance
  generator (function group `/FS00/ALMFG006`). Its rules are in the events in `/FS00/LALMFG006F01`
  (`/fs00/almtr006_create` / `_change`):
  - `ZGRP_ID` = `ZGRP1` alone when `ZGRP2` and `ZGRP3` are blank, otherwise `g1:g2:g3`
  - `ZSRC_DESC` and `ZLCR_SRC_DESC` are derived from `/FS00/ALMTR008-ZSRC_DESC` (the events do not check that the source exists)
  - audit fields stamped on create / change
- Table: key `ZGRP_ID` C20 · `ZGRP1..3` C2 · `ZGRP_NAME` C100 · `ZSRC` C2 + `ZSRC_DESC` C80 · `ZLCR_SRC` C2 +
  `ZLCR_SRC_DESC` C80 · 6 split audit fields. 41 rows live (`AA:01:00`, `BB`, ...).
- Other readers: `/FS00/ALMP001`, `/FS00/ALMP006`, `/FS00/ALMR001`, `/FS00/ALMR007`, `/FS00/ALMR008`.

## Design

- Properties: GroupId · Grp1..3, GroupName, Source, SourceDesc(ro), LcrSource, LcrSourceDesc(ro), audit (ro), ChangeStamp (ro).
- Rules, as for the siblings: Grp1 + GroupName required, no `:` in parts, client-sent GroupId must equal the
  derived value, Source and LcrSource must exist in ALMTR008 (stricter than the TMG, in line with the siblings), create refuses an existing key.
- No draft (not requested; same as the siblings).
- Messages: existing `ZFS_TRM_MSG` 001–007 on TFSIN. No new message needed.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Package / transport | Same as the service (`ZFS_ALM_API`, `DS4K907106`) | 2026-09-26 (default) |
| 2 | Draft (L-224) | Not requested, no draft | 2026-09-26 |
| 3 | Entity set name | `BudgetGrouping` (the human's wording) | 2026-09-26 (default) |

## Naming gate

```
NAMING: EZFS_T_ALMBGRP -> matches Lock object EZFS_T_<NAME> (14 chars)
NAMING: ZFS_I_AlmBudGrp -> Interface view ZFS_I_<Entity> carrying the unmanaged BDEF (same platform-forced shape as ZFS_I_AlmGrp1..3, exception row ZFS_I_DynGateway rationale)
NAMING: ZFS_C_AlmBudGrpTP -> matches Projection ZFS_C_<Entity>, Entity = AlmBudGrpTP
NAMING: ZBP_FS_ALMBUDGRPTP -> matches Behavior pool ZBP_FS_<Entity>
NAMING: ZFS_SD_ALMRPTFMT (changed, not created) -> existing
```

## Todo

- [x] 1. Lock object `EZFS_T_ALMBGRP` (adt-mcp)
- [x] 2. `ZFS_I_AlmBudGrp` DDLS + BDEF, `ZFS_C_AlmBudGrpTP` DDLS + BDEF (all four created by adt-mcp, source via change server).
  The DDLS `run_validation` with `referencedObject` answered `partner '10.110.0.33:3300' not reached`; without it the validation passed
- [x] 3. Behavior pool `ZBP_FS_ALMBUDGRPTP` (adt-mcp create, change server source). The first syntax check caught an inline `DATA` with
  `INTO CORRESPONDING` in `delete`. Fixed: an existence check, and only the key is buffered for the delete
- [x] 4. Exposed in `ZFS_SD_ALMRPTFMT` as `BudgetGrouping` (change server). Activated: ENQU + 2 BDEF + CLAS in one adt-mcp call, SRVD via the change server. `inactiveObjects` = `[]`
- [x] 5. **No re-publish needed**: the binding was already published and `$metadata` lists `BudgetGrouping` straight after the SRVD activated
- [x] 6. Smoke test `scripts/alm-rptfmt-timebkt-tests/budget-smoke.ps1`: **20 passed, 0 failed** (`evidence/2026-09-26-2018-alm-rptfmt-budget-grouping/smoke-run-1.txt`).
  Test rows `ZT` and `ZT:Z1:Z1` deleted and confirmed 404; count back to the 41 live rows

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| EZFS_T_ALMBGRP | ENQU | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmBudGrp | DDLS + BDEF (unmanaged) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_AlmBudGrpTP | DDLS + BDEF (projection) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMBUDGRPTP | CLAS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMRPTFMT | SRVD (changed) | ZFS_ALM_API | DS4K907106 | active, `BudgetGrouping` exposed |

No new messages: uses `ZFS_TRM_MSG` 001, 002, 003, 004, 005, 006, 007 (TFSIN catalog).

## Delivery checks

- [x] Syntax check clean
- [x] Activated, nothing left inactive
- [ ] ATC (default variant, run `52540030422E1FD1AEB536A9F5484000`): 0 prio 1. **2 × prio 2** (`EXISTS`, `FEW`, "problematic SELECT *"), the same
  pair the sibling pools carry. The `update` read must stay `SELECT *` (a full-row `UPDATE ... FROM TABLE`), so it is an exemption candidate, not fixed.
  2 × prio 3 SLIN 1700 on property names used as message variables (`'Grp1'`, `` `Source` ``), as the siblings. BDEFs: 0 findings
- [x] ABAP Unit: none applicable (same as the siblings, no test objects without a request, rule 3)
- [x] Transport: all created objects recorded on `DS4K907106` at create

## Lessons raised

L-600
