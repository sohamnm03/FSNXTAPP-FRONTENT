# ALM 2 and ALM 3 Update Manual Data in ZFS_SB_ALMMANUAL_O4_API, linked to the ALM app's ALM 2 / ALM 3 Update Manual Data tiles

- **Date:** 2026-09-27
- **Started:** 21:19
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API`
- **Transport:** `DS4K907106` (task `DS4K907108`), chosen by the human from `abap_transport-get`
- **Requested by:** human: "in the OData ZFS_SB_ALMMANUAL_O4_API same like ALM 1, do it for ALM2 and ALm3 create a table build the ODATA API and map it with Manual update in both alm2 and alm3 in alm application." Then: "for ALM2 and ALm3 refer the respective grouping and bucket tables"

## Scope

As ALM 1 (`2026-09-27-0000-alm1-manual-data-odata-api.md`): a new table per area, one row per company code / year / month /
group / bucket, and CRUD entity sets `Alm2ManualData` and `Alm3ManualData` in `ZFS_SB_ALMMANUAL_O4_API`, then the ALM app's
ALM 2 and ALM 3 Update Manual Data tiles switched from the local store to the service. Groups: ALM 2 `/FS00/ALMTR002`, ALM 3
`/FS00/ALMTR003`. Buckets: both `/FS00/ALMTR005` ("ALM 2-3 Buckets", 10 buckets 01–10). Out of scope: changing `/FS00/ALMP003`,
`/FS00/ALMTR017`, `/FS00/ALMTR030` or any `/FS00/` object.

## Analysis

- **SAP program:** `/FS00/ALMP003` "Update Manual Data ALM2" (tcode `/FS00/ALMT020`), one module pool for both areas via radio
  button `rb_alm2`/`rb_alm3`. Save tables `/FS00/ALMTR017` (ALM 2) and `/FS00/ALMTR030` (ALM 3), both wide: `ZBUC1..ZBUC10` + `ZTOTAL`,
  key `ZBUKRS/ZMONTH/ZYEAR/ZCODE`. 10 columns = 10 buckets, so unlike ALM 1 nothing is lost in the wide shape.
  Readers: `/FS00/ALMR017` (quarterly ALM 2), `/FS00/ALMR022` (quarterly ALM 3), `/FS00/ALMR023`, `/FS00/ALMP007` (upload), function groups ALMFG017/ALMFG026.
- **Rules in `/FS00/ALMP003`:**
  - company code, month, year all required ("Inputs not valid")
  - groups: all rows of the area's grouping table, minus `ZINT_SPLIT` set and source ≠ 92, sorted by ID
  - **only source-92 rows remain in the grid** (`DELETE gt_data WHERE zsrc <> 92` in PBO), so only those are saved
  - header aggregation (Grp3..5 = `00`, source ≠ 92 gets the sum of children with the same first 6 chars, Grp4 = Grp5 = `00`) is
    computed in `process_data` **but never saved**: the header rows are deleted from the grid right after (L-609)
  - period lock: `/FS00/ALMTR012`, `ZSOURCE = '01'`, last day of month, `ZLOCK = 'X'` → screen read-only (same row as ALM 1)
  - save = `MODIFY` every grid row (buckets, total, ZDESC = group name, create stamp only), `COMMIT WORK AND WAIT`
  - display unit (rupees / lakhs / crores) is a screen scaling only; stored amounts are in rupees
- **Data on TFSIN:** `/FS00/ALMTR002` 2 groups with source 92; `/FS00/ALMTR003` **no** source-92 group (9 × source 99) (L-609).
  ALM 3 grouping has 6 levels (`ZGRP6`).
- **ALM app:** already prepared, uncommitted: `config/manualdata-odata.json` has `alm2`/`alm3` tables on entity sets
  `Alm2ManualData`/`Alm3ManualData`, same fields as ALM 1; `config/catalog.mjs` has the two tiles; `server/manualdata.mjs`,
  `engine/manualdata.py`, `src/pages/ManualData.jsx` handle `area` alm2/alm3 (ALM 3 uses the ALM 2 buckets).
- 21:19 `adt-mcp` was ECONNREFUSED at session start (VS Code not listening yet); port 2236 up later, reconnected through `/mcp`.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | One table per area or one shared table with an area key | **Two tables**, `ZFS_T_ALM2_MAN` / `ZFS_T_ALM3_MAN` | 2026-09-27 |
| 2 | Add the two entities to the existing service or separate services | **Existing service** `ZFS_SD_ALMMANUAL` / `ZFS_SB_ALMMANUAL_O4_API`; BO objects created one by one (no generator, so no extra SD/SB) | 2026-09-27 |
| 3 | Save rules: header sums stored (as ALM 1 API) or not (as `/FS00/ALMP003`); ALM 3 has no source-92 group | **As ALM 1 API**: source 92 only, period lock, header sums stored. ALM 3 stays read-only until a group gets source 92 | 2026-09-27 |
| 4 | Draft (L-224) | **No draft** | 2026-09-27 |
| 5 | Package / transport | `ZFS_ALM_API`, `DS4K907106` | 2026-09-27 |

## Naming gate

Name searches `ZFS_T_ALM2*`, `ZFS_T_ALM3*`, `ZFS_*ALM2MAN*`, `ZFS_*ALM3MAN*`: to be run right before create.

```
NAMING: ZFS_T_ALM2_MAN -> matches Transparent table ZFS_T_<AREA>_<NAME>, AREA=ALM2, 14 chars (max 16)
NAMING: ZFS_T_ALM3_MAN -> matches Transparent table ZFS_T_<AREA>_<NAME>, AREA=ALM3, 14 chars
NAMING: ZFS_R_Alm2ManualTP / ZFS_R_Alm3ManualTP -> matches Restricted reuse view ZFS_R_<Entity> (RAP BO root); BDEF same name
NAMING: ZFS_C_Alm2ManualTP / ZFS_C_Alm3ManualTP -> matches Consumption / projection view ZFS_C_<Entity>; projection BDEF same name
NAMING: ZBP_FS_ALM2MANUALTP / ZBP_FS_ALM3MANUALTP -> matches Behavior implementation class ZBP_FS_<Entity>
(no new SRVD/SRVB: entities added to existing ZFS_SD_ALMMANUAL / ZFS_SB_ALMMANUAL_O4_API)
```

## Todo

- [x] 1. Read grouping/bucket/save tables, `/FS00/ALMP003`, data, ALM app state
- [x] 2. Design decisions from the human (questions 1–4)
- [x] 3. Build tables, BO, service entities
  - 21:40 **blocked:** `adt-mcp` connected, but `abap_list_destinations` = `[]`. Only one `adt-lsc` (pid 26300, started 21:16) owns port 2236,
    so its VS Code window has no ADT logon yet (L-333/L-598). Human logged on, `/mcp` reconnect → `[DS4_100_TFSIN]`
  - Name search: only `ZFS_T_ALM_MANUAL` and SMW0 `/FS00/ALM2MANUALDATA` exist; all new names free
  - Tables: `adt-mcp` create (skeleton), fields via change server (L-217), activated
  - 4 DDLS: `adt-mcp` create. The two root views failed once with `partner '10.110.0.33:3300' not reached` (nothing created, checked in TADIR), retry OK. Sources via change server; one unlock round hit ETIMEDOUT on 44300, retry OK
  - 4 BDEF (2 managed, 2 projection) + 2 CLAS: `adt-mcp` create, sources via change server, all six activated in one `activateObjects` call. `inactiveObjects` = `[]`
  - No generator used (answer 2), so no extra SRVD/SRVB was created
  - `ZFS_SD_ALMMANUAL`: `Alm2ManualData`/`Alm3ManualData` added, activated. The published binding shows all three sets in `$metadata` without republishing
  - No new messages: 002, 003, 008, 009, 010 cover every rule
- [x] 4. Activate, ATC: ATC (default variant) **0 findings** on the 2 classes, 2 BDEFs, 2 tables (worklist `52540030422E1FD1AECFB0C3F65C0000`)
- [x] 5. Smoke test `scripts/alm-manual-tests/smoke-alm23.ps1` (sandboxed PowerShell), company 1000, period 2099/12, key-free guard first (L-608):
  run 1 **29/33**: the 4 header-sum checks failed on a bug in my script (string compare of `100.00` against `100`); run 2 **33/33**
  (`evidence/2026-09-27-2119-alm2-alm3-manual-data-odata-api/smoke-run-2.txt`). ALM 2 header `SB:11:00:00:00` = 100 → 150.50 → 250.50 and bucket 10 = 10 → gone;
  refusals 009 (header, non-92 child, ALM 3 source-99 and header groups), 010, 002 (bucket 11, cross-area group), duplicate, string amount, stale ETag 412.
  Both periods empty after clean-up; Alm1ManualData still answers
- [x] 6. ALM app (`D:\SAP Tool\SAP - ALM Application`), on top of the earlier uncommitted ALM 2/3 preparation:
  - `engine/manualdata.py`: ALM 2 / ALM 3 now drop interest-split groups unless source 92, as `/FS00/ALMP003` `get_data` does (the
    prepared code listed every group); `tests/test_manualdata.py` new test, `tests/manualdata.test.mjs` expectation corrected
  - `config/manualdata-odata.json`: comment says live, names the tables and what SAP reports do not see
  - No change needed in `server/manualdata.mjs`, `src/pages/ManualData.jsx`, `config/catalog.mjs` (already area-aware); `.env` already has `SAP_MANUALDATA_URL`
  - `npm test` **35/35**, `npm run test:python` **28/28**, `npm run build` OK
  - Live round trip through a temporary instance on port 8097 (`scripts/alm-manual-tests/app-roundtrip-alm23.ps1`): run 1 12/12 but its ALM 3
    refusal passed on the bucket, not the source (L-610); run 2 **12/12** (`evidence/.../app-roundtrip-run-2.txt`). ALM 2: odata mode, 10 buckets,
    183 rows, only `SB:11:01`/`SB:11:02` editable; key in 3 → header 1350.50 / 25.00; change + clear → 1450.50 / gone; header refused; clear all → empty.
    ALM 3: 178 rows, ALM 2 buckets, nothing editable, source-99 refused
  - `ZFS_T_ALM2_MAN` / `ZFS_T_ALM3_MAN` count after all tests = 0
- [ ] 7. Human: restart the ALM app on 8093 so it loads the engine change

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_ALM2_MAN, ZFS_T_ALM3_MAN | TABL | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_R_Alm2ManualTP, ZFS_R_Alm3ManualTP | DDLS + BDEF (managed, additional save) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_Alm2ManualTP, ZFS_C_Alm3ManualTP | DDLS + BDEF (projection) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALM2MANUALTP, ZBP_FS_ALM3MANUALTP | CLAS (LHC_/LSC_ALM2MANUAL, LHC_/LSC_ALM3MANUAL) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMMANUAL | SRVD (changed: + Alm2ManualData, Alm3ManualData) | ZFS_ALM_API | DS4K907106 | active; binding ZFS_SB_ALMMANUAL_O4_API unchanged, published |

## Open items for the human

- `/FS00/ALMTR017` / `/FS00/ALMTR030` stay as they were; `/FS00/ALMR017`, `/FS00/ALMR022`, `/FS00/ALMR023` do not see amounts keyed in the app. No data migration was requested.
- ALM 3 has no source-92 group on TFSIN, so its tile is read-only until a group in `/FS00/ALMTR003` gets source 92 (Report Formats tile).
- The period lock (message 008) was not tested live: `/FS00/ALMTR012` is empty on TFSIN (as ALM 1).
- The API stores header sums; `/FS00/ALMP003` computes but never saves them (L-609). Chosen by the human (answer 3).

## Delivery checks

- [x] Syntax check clean / activated, nothing left inactive
- [x] ATC: 0 findings
- [x] ABAP Unit: none applicable (no test class requested; rule 3)
- [x] Text elements: none needed
- [x] Object list confirmed in the transport: `E071` shows all 13 on `DS4K907108`

## Lessons raised

L-609, L-610
