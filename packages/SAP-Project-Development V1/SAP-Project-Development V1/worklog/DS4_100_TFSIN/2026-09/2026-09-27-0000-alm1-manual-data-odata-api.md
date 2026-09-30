# ALM 1 Update Manual Data OData API on /FS00/ALMTR011, linked to the ALM app's Update Manual Data tile

- **Date:** 2026-09-27
- **Started:** 00:00 (session start; exact start time not recorded)
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (proposed, same as the other ALM APIs — to confirm)
- **Transport:** `DS4K907106` / FS_DEV3 task `DS4K907108` (proposed — to confirm)
- **Requested by:** human: "Build the ODATA web API for the table /FS00/ALMTR011 and link it with Update manual data in alm1 in ALM application"

## Scope

A CRUD OData V4 Web API on `/FS00/ALMTR011` following the rules of `/FS00/ALMR029` ("ALM1 Update Manual Data",
tcode `/FS00/ALMT055`, SMW0 page `/FS00/ALM1MANUALDATA`). Then switch the ALM app's **Update Manual Data** tile
(`module: 'manualdata'`, `D:\SAP Tool\SAP - ALM Application`) from its local store to the service. Out of scope:
changing `/FS00/ALMR029`, `/FS00/ALMP002` or the `/FS00/` tables.

## Analysis

### Table /FS00/ALMTR011 ("ALM1 Data"), delivery class A

| Field | Type | Notes |
|---|---|---|
| key ZBUKRS | BUKRS | |
| key ZMONTH | NUMC 2 (`/FS00/ALMDT0031`) | |
| key ZYEAR | NUMC 4 (`/FS00/ALMDT0032`) | |
| key ZCODE | CHAR 20 (`/FS00/ALMDT0033` "Structural Code") | = ALM 1 `ZGRP_ID` from `/FS00/ALMTR001` |
| ZDESC | CHAR 40 | group name, set on create only |
| ZDATE | DATS | not written by ALMR029 |
| ZFROZEN | CHAR 6 | not written by ALMR029 |
| ZEFF | DEC 10,7 | "Percentage Rate", not written by ALMR029 |
| ZTOTAL | CURR 20,2 | = ZBUC1+…+ZBUC5, recomputed on every save |
| ZBUC1..ZBUC5 | CURR 20,2 | bucket amounts; currency ref `VTBFHAPO-WZBETR` (no currency field in the table) |
| 6 audit fields | TB_CRUSER … TB_TUPTIM | split date/time, no timestamp |

Data on TFSIN: company code 1000, periods 2025/03, 2025/10, 2025/11, 2026/03, 94–96 rows each.

**The table is wide: one row per group with five bucket columns.** `/FS00/ALMTR004` (ALM 1 time buckets) has
**seven** buckets (1–7). Only buckets 1–5 have a column, so buckets 6 and 7 cannot be stored.

### /FS00/ALMR029 rules

- Selection: company code (T001 + `F_BKPF_BUK` 03), month (T247), year. All three mandatory.
- Groups: all `/FS00/ALMTR001` rows, **minus** those with `ZINT_SPL` set and source ≠ 92, sorted by ID.
- Editable: only groups with `ZSRC = '92'`. Non-92 rows are sent in the grid but ignored on save.
- **Period lock:** `/FS00/ALMTR012` row with `ZBUKRS`, `ZSOURCE = '01'`, `ZDATE` = last day of the month and
  `ZLOCK = 'X'` → "This period is locked and cannot be updated". The table is empty on TFSIN.
- **Header aggregation:** a row with Grp3 = Grp4 = Grp5 = `00` and source ≠ 92 gets the sum of its children
  (same first 6 characters of ID, Grp4 = Grp5 = `00`, not the header itself), on load and on save.
- **Save writes every grid row**, not only the changed ones: UPDATE if the row exists (buckets, total,
  changed-stamp), else MODIFY a new one (ZDESC = group name, both stamps). So one save materialises a row for
  every listed group and refreshes the header totals. `COMMIT WORK AND WAIT`.
- Amount parse: commas removed, `-` anywhere makes it negative, decimals truncated to 2.

### Gap against the ALM app's placeholder contract (`config/manualdata-odata.json`, "NOT YET LIVE")

1. The app models **one row per (period, group, bucket)** with a single `Amount`. The table has one row per group
   with `Bucket1..5` + `Total`. Either the API exposes the table shape (and the app's engine/server change) or the
   API pivots.
2. The app shows all seven ALM 1 buckets; only five can be stored.
3. The app deletes a row when the amount is blank/zero. The program never deletes; it stores zeros.
4. The app does no period lock and no header aggregation.
5. The app does not apply the `ZINT_SPL` filter.

## Open items for the human

- `/FS00/ALMTR011` stays as it was. Amounts keyed in the app go to `ZFS_T_ALM_MANUAL`, which `/FS00/ALMR029`, `/FS00/ALMR023` and
  the quarterly report `/FS00/ALMR008` do not read. Existing ALMTR011 data (4 periods of company 1000) was not migrated; that was not requested.
- The period lock (message 008) was not tested live: `/FS00/ALMTR012` is empty on TFSIN.
- Message 009 shows a blank source as "has source ;" for groups without a source (e.g. headers).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Entity shape | **Table shape** of the new table (below): one entity row per table row | 2026-09-27 |
| 2 | Buckets 6 and 7 | **All 7 ALM 1 buckets.** Human: "Create a new table ... This will give us more dynamic option". Confirmed layout: **new table, one row per bucket**, key company code / year / month / group ID / bucket + amount | 2026-09-27 |
| 2a | Role of the new table | **Replaces `/FS00/ALMTR011` for the app.** `/FS00/ALMTR011` stays unchanged and is not written; `/FS00/ALMR029`/`R008` will not see amounts keyed in the app. No data migration was requested | 2026-09-27 |
| 3 | Save rules | **In the API:** period lock (`/FS00/ALMTR012`), source 92 only, header sums | 2026-09-27 |
| 4 | Draft (L-224) | **No draft** | 2026-09-27 |
| 5 | Package / transport | `ZFS_ALM_API`, `DS4K907106` (FS_DEV3 task `DS4K907108`) | 2026-09-27 |
| 6 | Managed instead of unmanaged? (human asked) | **Managed** (human: "yes go ahead with managed"). Semantic key, no UUID. Rules: validations on save + `with additional save` for the header sums | 2026-09-27 |

## Naming gate

Entity `AlmManualTP` (the SD/SB names are the ones the app's contract already expects). Name searches `ZFS_T_ALM*`, `ZFS_*ALMMAN*`: no hits.

```
NAMING: ZFS_T_ALM_MANUAL -> matches Transparent table ZFS_T_<AREA>_<NAME>, AREA=ALM, 16 chars
NAMING: ZFS_R_AlmManualTP -> matches Restricted reuse view ZFS_R_<Entity> (RAP BO root), Entity=AlmManualTP; BDEF same name
NAMING: ZFS_C_AlmManualTP -> matches Consumption / projection view ZFS_C_<Entity>; projection BDEF same name
NAMING: ZBP_FS_ALMMANUALTP -> matches Behavior implementation class ZBP_FS_<Entity>
NAMING: ZFS_R_AlmManualTP (DCLS) -> matches Access control, same name as the view it protects (L-122)
NAMING: ZFS_SD_ALMMANUAL -> matches Service definition ZFS_SD_<Entity>, TP stripped
NAMING: ZFS_SB_ALMMANUAL_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API, 23 chars (max 26)
```

## Design (as built)

Managed BO with additional save, no draft, semantic key, on the new table `ZFS_T_ALM_MANUAL`:

| Field | Type | Property |
|---|---|---|
| key BUKRS | BUKRS | CompanyCode |
| key ZYEAR | `/FS00/ALMDT0032` NUMC 4 | FiscalYear |
| key ZMONTH | `/FS00/ALMDT0031` NUMC 2 | FiscalPeriod |
| key GRP_ID | `/FS00/ALMDT0001` CHAR 20 (ALM 1 `ZGRP_ID`) | GroupId |
| key BUCKET | `/FS00/ALMDT0013` NUMC 2 (ALM 1 `ZBUC`) | Bucket |
| AMOUNT | `abap.dec(20,2)` (the `/FS00/` CURR domain would need a currency reference; the ALM amounts carry none) | Amount (`Edm.Decimal` 20,2) |
| 5 RAP audit fields | template | CreatedBy, CreatedAt, ChangedBy, ChangedAt (ETag), LastChangedAt |

- Service `ZFS_SB_ALMMANUAL_O4_API` / `ZFS_SD_ALMMANUAL`, entity set **`Alm1ManualData`**.
- `create/update/delete ( precheck )` (all rules are on the key, and a validation cannot fire on delete):
  company code in `I_CompanyCode` (002), year given (003), month 01–12 (010), group in `/FS00/ALMTR001` (002)
  with source 92 (009), bucket in `/FS00/ALMTR004` (002), period not locked in `/FS00/ALMTR012` (008).
- `save_modified`: for every changed (company, year, month, Grp1:Grp2 prefix), the non-92 header group
  (Grp3..5 = `00`) gets the per-bucket sum of its children (same prefix, Grp4 = Grp5 = `00`, Grp3 ≠ `00`), as in
  `/FS00/ALMR029` `aggregate_group_totals`. Zero sums are deleted, not stored. Groups with `ZINT_SPL` and source ≠ 92
  are left out, as in `build_grouping`.
- `@AccessControl.authorizationCheck: #NOT_REQUIRED`, no DCL, same as the other ALM APIs. Global authorization allows everything;
  the service start authorization is the gate.

## Todo

- [x] 1. Read the table, data elements, data, lock table, ALM 1 buckets, `/FS00/ALMR029` TOP + F01; compare with the app
- [x] 2. Design decisions from the human (questions 1–6)
- [x] 3. Build. Table: `adt-mcp` create, then fields via the change server (L-217). Messages 008–010: change server (no MSAG adapter in `adt-mcp`), verified in `T100`, catalog updated. RAP stack: `adt-mcp` generator `webapiservice` (7 objects), then all changes via the change server. Everything active, `inactiveObjects` = `[]`. Remaining activation notes: 3 × "secondary key ENTITY/ID not used" performance hints in `save_modified`
  - 09:31 to about 09:40 TFSIN was unreachable (ping and TCP 44300 both failed). It came back without any change on our side
- [x] 4. Publish: `scripts/sap-gui-publish-service.py` failed to find its controls (L-237) on the TFSIN session (connection 0). Done by hand with `sap-gui`: `/IWFND/V4_ADMIN` → Publish Service Groups → alias `LOCAL`, group `ZFS_SB_ALMMANUAL*` → row → PUBLISH → description "ALM 1 manual data" → "New service group(s) successfully published"
- [x] 5. Smoke test `scripts/alm-manual-tests/smoke.ps1` (sandboxed PowerShell): run 1 **26/27** (my test expected a key PATCH to be refused, but it is ignored, L-603); run 2 **29/29** (`evidence/2026-09-27-0000-alm1-manual-data-odata-api/smoke-run-2.txt`). Header sums checked through create/update/delete, bucket 7 stored, all validations fire, stale ETag = 412. `ZFS_T_ALM_MANUAL` count after clean-up = 0
  - **Not tested:** the period lock (message 008). `/FS00/ALMTR012` is empty on TFSIN, and writing a lock row into a `/FS00/` table was not part of the request
- [x] 6. ALM app (`D:\SAP Tool\SAP - ALM Application`):
  - `config/manualdata-odata.json`: live contract (was "NOT YET LIVE"); stamps mapped to `CreatedBy/CreatedAt/ChangedBy/ChangedAt`; `numbers: ["amount"]`
  - `server/maintenance.mjs`: fields listed in `mapping.numbers` go out as JSON numbers (Edm.Decimal, L-244)
  - `engine/manualdata.py`: interest-split groups left out unless source 92, as `/FS00/ALMR029` `build_grouping`
  - `tests/manualdata.test.mjs` (numeric Amount bodies; seed group `LIAB:BORR` now filtered), `tests/test_manualdata.py` (new filter test)
  - `.env`: `SAP_MANUALDATA_URL` set
  - `npm test` **23/23**, `npm run test:python` **27/27**, `npm run build` OK
  - Live round trip through a temporary instance on port 8096 (`scripts/alm-manual-tests/app-roundtrip.ps1`): **11/11** (`evidence/.../app-roundtrip-run-4.txt`). Odata mode, 74 company codes, all 7 buckets, 96 groups; key in 3 amounts incl. bucket 7 → SAP header sum 1350.50 / 25.00; change + clear → 1450.50 / gone; header refused by the engine; clear all → period empty. Runs 1–3 failed on bugs in my script (L-604), not in the app; no SAP writes happened in run 1
  - The UI (`src/pages/ManualData.jsx`) needed no change: it already builds its columns from the ALM 1 time buckets
- [x] 7. ATC (default variant): first run 0 errors, 1 × prio 2 (`SELECT` on `/FS00/ALMTR001` without `WHERE`) and 4 × prio 3 (3 × secondary key not used, 1 × SLIN 1700). All fixed (`WHERE zgrp4 = '00' AND zgrp5 = '00'`, `USING KEY entity/id`, `##NO_TEXT` on property names). Rerun: **0 findings**. Smoke test rerun after the fix: 29/29 (`smoke-run-3.txt`)
- [ ] 8. Human: restart the ALM app on 8093 so it loads `SAP_MANUALDATA_URL` and the new server code

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_ALM_MANUAL | TABL | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_R_AlmManualTP | DDLS + BDEF (managed, additional save) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_AlmManualTP | DDLS + BDEF (projection) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMMANUALTP | CLAS (LHC_ALMMANUAL, LSC_ALMMANUAL) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMMANUAL | SRVD | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMMANUAL_O4_API | SRVB (OData V4 Web API) | ZFS_ALM_API | DS4K907106 | active, published |
| ZFS_TRM_MSG 008–010 | MSAG | ZFS_ALM_API | tasks DS4K907107 / DS4K907108 | on system |

## Delivery checks

- [x] Syntax check clean / activated, nothing left inactive
- [x] ATC: 0 findings after fixes (worklist `52540030422E1FD1AEC8E4A308F5C000`)
- [x] ABAP Unit: none applicable (no test class was requested; rule 3)
- [x] Text elements: none needed
- [x] Transport: `E071` shows TABL/DDLS/BDEF/SRVB/G4BA/MSAG on `DS4K907108`, MSAG also on `DS4K907107` (L-355)

## Lessons raised

L-602, L-603, L-604
