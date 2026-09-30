# ALM 1 Quarterly Report: OData Web API for /FS00/ALMR008 + ALM app tile

- **Date:** 2026-09-27
- **Started:** 16:19
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (as the other ALM APIs)
- **Transport:** `DS4K907106` / task `DS4K907108`
- **Requested by:** human: "start this once the above session is done Build the same for the prorgam /FS00/ALMR008 Generate Quarterly ALM1 Report in the ALM 1 page new tiles"

## Scope

As for `/FS00/ALMR003` (`2026-09-27-1545-alm1-trm-repayment-cashflows-api.md`): an OData V4 Web API that returns what `/FS00/ALMR008`
("Generate Quarterly ALM1 Report", tcode `/FS00/ALMT031`) shows, and a new tile on the ALM1: Dynamic Liquidity page of the ALM app.
Out of scope: changing `/FS00/ALMR008` or the `/FS00/` tables.

## Program analysis (`/FS00/ALMR008`, sources in `evidence/2026-09-27-1619-alm1-quarterly-report-api/`)

Selection: company code, month (NUMC 2), year (NUMC 4), unit (crores / lakhs / thousands / INR), "show zero rows" (`P_CHECK`),
"hide interest split" (`P_ISPLIT`), layout.

Dates: `gv_date` = last day of the month, `gv_sdate` = +1 day (key date), `gv_edate` = key date + 6 months. Buckets: `/FS00/ALMFM001`
type `01` on the key date.

Rows: **every `/FS00/ALMTR001` group** (ALM 1 report format) plus an "XBRL Code" header row (`A`) with the bucket XBRL codes. Per group, by `ZSRC`:

| Source | Amounts |
|---|---|
| 09–12 (TRM) | `SUBMIT /FS00/ALMR003` with the same selection, output taken from memory (`cl_salv_bs_runtime_info`); rows with `stype` = the group's source and product type in the group's `ZPRODUCT` list (comma-separated, up to 10) are summed |
| 92 (manual) | `/FS00/ALMTR011` row of the period (`ZCODE` = group ID), buckets 1–5 |
| 23–29, 43–49, 69–80, 85–87 (budget) | `/FS00/ALMTR006` budget grouping with that source → `/FS00/ALMTR010` amounts (company, group, `zdate` between key date and +6 months, highest version first). A budget in the month of `gv_edate` is split over buckets 1–3 by the percentages of `/FS00/ALMTR013` (latest `zeff_date` ≤ key date); other budgets go to the bucket whose day range holds `zdate − key date` |

Then: total = B1..B5; unit division; level totals (4th level ← 5th, 3rd ← 4th, 1st ← 3rd, subtracting children flagged `ZNEG`);
subtotals `AA:99:99:99:99` / `AB:99:99:99:99` (sum of the `xx:yy:00:00:00` rows of AA / AB); `AC` = AB − AA (mismatch); `AD` = cumulative AC;
`AE` = AC / AA × 100 (%). Zero rows hidden unless `P_CHECK`; interest-split rows hidden with `P_ISPLIT`. Colours: `C700` AA/AB, `C300` 99-rows,
`C100` level-1 rows, AC/AD/AE own colours; `ZINT_SPL` marks the row.

Actions on the ALV (PF-status):
- **SAVE** (auth `ZFS_ALM_S1` 01): refuses if `/FS00/ALMTR014` already has the period, else stores every row with a total (group, name, B1..B5)
- **LOCK** (auth `ZFS_ALM_L1` 05): needs saved data; writes `/FS00/ALMTR012` (source `01`, date = last day of month, lock `X`) and sets `ZLOCK` on `/FS00/ALMTR014`.
  This is the period lock that `/FS00/ALMR029` (Update Manual Data) and the new Manual Data API check
- **DELETE** (auth `ZFS_ALM_D1` 06): refused when locked; deletes the period from `/FS00/ALMTR014`
- **REF** refresh; hotspot on a TRM row → `/FS00/ALMR003` with the group's product types

Tables: `/FS00/ALMTR014` "ALM1 RBI Data Save" has **10** bucket columns (`ZBUC1..ZBUC10`), `ZNS_AMT`, `ZLOCK`; `/FS00/ALMTR013` has
`ZBUC1..3` + `ZTOT` (month-1 split); `/FS00/ALMTR010` key company/year/date/group/name/version, amount `ZAMT`.

### Points that decide the design

1. **Manual data**: the report reads `/FS00/ALMTR011`, but the app's Update Manual Data now writes `ZFS_T_ALM_MANUAL` (decision of 2026-09-27).
2. **TRM data**: the report inherits `/FS00/ALMR003`'s defects (interest counted again in the principal row, D1 of that worklog).
3. **Buckets**: 5 here; the budget window is only 6 months (buckets 1–5). The TRM API and manual data now carry 7.
4. **Save / Lock / Delete** write `/FS00/ALMTR014` and `/FS00/ALMTR012`, behind authorization objects `ZFS_ALM_S1/L1/D1`.

## Design

**Report** (read-only): custom entity `ZFS_CE_AlmQtrReport` with parameters `P_CompanyCode`, `P_FiscalYear`, `P_FiscalPeriod`, query
provider `ZCL_FS_ALM_QTRRPT_QUERY`. One row per `/FS00/ALMTR001` group: GroupId (key), GroupName, Source, XbrlCode, Product,
InterestSplit, Negative, RowStyle (`HEADING` AA/AB, `SUBTOTAL` xx:99:99:99:99, `LEVEL1` xx:yy:00:00:00, `MISMATCH` AC, `CUMULATIVE` AD,
`PERCENT` AE, blank), Bucket1..7, Total. The XBRL header row of the report is not a data row: the app takes the bucket XBRL codes from Time Buckets.
Amounts in INR; `PERCENT` rows are percentages and are not scaled. Zero rows and interest-split rows are returned; hiding them is an app toggle
(the report's `P_CHECK` / `P_ISPLIT`).

Per group, by source (as the report, with the decided fixes):
- 09–12: rows of `ZCL_FS_ALM_TRMREPAY_QUERY` (new public method `get_rows`) with that source type and a product type in the group's `ZPRODUCT` list (all if blank)
- 92: `ZFS_T_ALM_MANUAL` of the period, buckets 1–7
- budget sources (the report's list): the first `/FS00/ALMTR006` budget group with that source → `/FS00/ALMTR010` for the company, latest version per
  month, dates from the key date to the end of bucket 7. Month 1 (the key date's month) → buckets 1–3 by the `/FS00/ALMTR013` split (latest
  `ZEFF_DATE` ≤ key date), else bucket 3. Later months → the bucket whose **date** range holds the budget date (the report matches on day counts, and
  a date on a bucket boundary, e.g. day 31, matched two buckets and was counted twice)
- then the report's level totals (4th ← 5th, 3rd ← 4th, 1st ← 3rd, `ZNEG` subtracts), subtotals `AA/AB:99:99:99:99`, AC = AB − AA, AD cumulative
  AC per bucket (Total = the last cumulative value; the report summed the cumulative values), AE = AC / AA × 100

**Period status + actions**: custom entity `ZFS_CE_AlmQtrPeriod` (key CompanyCode, FiscalYear, FiscalPeriod: Saved, SavedRows, SavedBy, SavedOn,
Locked, LockedBy, LockedOn) with an unmanaged BDEF (behavior pool `ZBP_FS_ALMQTRPERIOD`), instance actions `Save`, `Lock`, `DeleteSnapshot`:
- Save: refused if the period is already in `/FS00/ALMTR014` (011); stores every report row with Total ≠ 0 (INR, buckets 1–7, `ZDATE` = last day of
  the month); nothing to store → 016. Auth `ZFS_ALM_S1` ACTVT 01 if the object exists (013)
- Lock: needs saved data (012); refused if already locked (008); writes `/FS00/ALMTR012` (source `01`, last day of month, `X`) and sets `ZLOCK` in
  `/FS00/ALMTR014`. The report's "already locked" check omits the company code; this one includes it. Auth `ZFS_ALM_L1` 05 if it exists (014)
- DeleteSnapshot: refused when locked (008) or not saved (012); deletes the period from `/FS00/ALMTR014`. Auth `ZFS_ALM_D1` 06 if it exists (015)

Service `ZFS_SD_ALMQTRRPT` exposes `QuarterlyReport` and `QuarterlyPeriod`; binding `ZFS_SB_ALMQTRRPT_O4_API`. No draft.

## Naming gate

Search `*ALMQTR*`: no hits.

```
NAMING: ZFS_CE_AlmQtrReport -> matches Custom entity ZFS_CE_<Entity>
NAMING: ZFS_CE_AlmQtrPeriod -> matches Custom entity ZFS_CE_<Entity>; its BDEF has the same name (Behavior definition = root view)
NAMING: ZCL_FS_ALM_QTRRPT_QUERY -> matches RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY
NAMING: ZBP_FS_ALMQTRPERIOD -> matches Behavior implementation class ZBP_FS_<Entity>
NAMING: ZFS_SD_ALMQTRRPT -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMQTRRPT_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API (23 chars)
NAMING: ZFS_TRM_MSG 011-016 -> exception row "Message class: ZFS_TRM_MSG"
```

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Manual (source 92) amounts from `ZFS_T_ALM_MANUAL` or `/FS00/ALMTR011` | **`ZFS_T_ALM_MANUAL`** | 2026-09-27 |
| 2 | TRM amounts | **Fixed logic of `ZCL_FS_ALM_TRMREPAY_QUERY`** | 2026-09-27 |
| 3 | Buckets | **7** (budget window 12 months; snapshot in `ZBUC1..7` of `/FS00/ALMTR014`) | 2026-09-27 |
| 4 | Save / Lock / Delete | **Yes, with the report's rules and checks** | 2026-09-27 |
| 5 | Budget versions (the report sums all of them) | **Latest version** per budget group and month: latest `ZV_DATE`, then highest version number | 2026-09-27 |
| 6 | Month-1 budget (report compares with key date + 6 months, so month 1 is dropped; `/FS00/ALMTR013` empty on TFSIN) | **Split by `/FS00/ALMTR013` into buckets 1–3; without a split row the whole amount goes to bucket 3** | 2026-09-27 |
| 7 | `ZFS_ALM_S1/L1/D1` do not exist on TFSIN (`TOBJ` empty), so the report refuses Save/Lock/Delete for everyone | **Check only if the object exists**; otherwise the service start authorization is the gate | 2026-09-27 |

## Todo

- [x] 1. Read `/FS00/ALMR008` (main, TOP, F01) and the tables it reads/writes; budget, split, snapshot, lock data; `TOBJ` for the auth objects
- [x] 2. Design decisions from the human (questions 1–7)
- [x] 3a. Messages 011–016 created (change server), verified in `T100`, catalog updated
- [x] 3b. `ZCL_FS_ALM_TRMREPAY_QUERY`: public type `tt_result` + method `get_rows` (no behaviour change), active
- [x] 3c. `adt-mcp` created `ZFS_CE_AlmQtrReport`, `ZFS_CE_AlmQtrPeriod` (DDLS), `ZCL_FS_ALM_QTRRPT_QUERY`, BDEF `ZFS_CE_ALMQTRPERIOD`
  (unmanaged), `ZBP_FS_ALMQTRPERIOD`, `ZFS_SD_ALMQTRRPT`; all source through the change server. Active: both custom entities, the query class
  (first activation: 2 errors, a duplicated `option` in a range and amount parameter typing, fixed), the BDEF and the behavior pool (first
  activation: `%tky` not on lock keys and an untyped `VALUE #( )`, fixed)
- [x] 3d. `ZFS_SD_ALMQTRRPT` source (`QuarterlyReport`, `QuarterlyPeriod`): first try at 16:5x failed with `connect ETIMEDOUT` (TFSIN unreachable);
  done when it came back, with the edit lock still held by this session. `adt-mcp` created SRVB `ZFS_SB_ALMQTRRPT_O4_API`, active; published
  via `sap-gui` `/IWFND/V4_ADMIN` → "New service group(s) successfully published"
- [x] 3e. ATC (default variant): behavior pool, BDEF, TRM class 0 findings; query class first 1 × prio 2 (`/FS00/ALMTR001` without `WHERE`: intended,
  every group is a row → `"#EC CI_NOWHERE` with the reason) + 2 × prio 3 (`READ ... INDEX 1` without `ORDER BY` → `ORDER BY` added). Rerun: **0 findings**
- [x] 4. Live test `scripts/alm-qtr-report-tests/smoke.ps1`:
  - **run 1 16/20, and it deleted a real row (L-608).** The "temporary" manual amount `AA:02:01:00:00` bucket 1 already existed (12,000.00, keyed in
    through the app at about 09:48 UTC). The POST was refused with 400, and the clean-up deleted the row. **Restored at once** through the Manual Data API
    (12,000.00; header `AA:02:00:00:00` back to 12,500.00; only the creation timestamp changed). The other 3 failures came from reading the error body
    (PS 5.1 `ErrorDetails`)
  - Script fixed: it checks that the key is free (else aborts), deletes only what it created, uses `AA:02:03:00:00` bucket 2, and reads `ErrorDetails`
  - run 2 **20/20**, run 3 (after the ATC fixes) **20/20** (`smoke-run-3.txt`): 147 rows in ~1 s; Total = Bucket1..7; manual amount shown and in its
    level total; **14 TRM groups = TRM API** by source type + product types; AA:99 = sum of AA level-1 rows; AC = AB99 − AA99; AD bucket 7 = Σ AC = AD total;
    AE = AC / AA99 × 100 (−44.51 %); period not saved/locked, key date 2026-10-01; Lock refused while not saved (012); Save 47 rows = rows with a total;
    second Save refused (011); Delete; invalid month → no rows; temporary amount removed. `/FS00/ALMTR014` count afterwards = 0; the real
    manual rows of 1000/2026-09 are intact (500 + 12,000, header 12,500)
  - **Not run: LockPeriod on a saved period** (writes `/FS00/ALMTR012`, which nothing in the API can remove). Needs the human's choice of period
  - Budget amounts not checked against an independent sum yet (the budget sources for 1000 in this window come from `/FS00/ALMTR010`; logic reviewed only)
- [x] 4b. App round trip `scripts/alm-qtr-report-tests/app-roundtrip.ps1` on a temporary instance (port 8098, stopped): **12/12**
  (`app-roundtrip-run-1.txt`): odata mode, key/snapshot dates, 7 buckets with XBRL codes X010..X070, 147 rows = SAP, AA:99 total = SAP, % row flagged,
  Save 46 rows, second Save refused with SAP message 011, Delete, unknown action refused. Not checked visually (demo password, see TRM worklog)
- [x] 5. ALM app (done while SAP was down): module `qtrreport`, tile **Quarterly ALM1 Report** on the ALM1: Dynamic Liquidity page:
  - `config/qtrreport-odata.json`, `config/qtrreport-seed.json`, `server/qtrreport.mjs` (report + period status, `POST /api/qtrreport/action`
    → `SAP__self.SaveSnapshot|LockPeriod|DeleteSnapshot`; local preview keeps Save/Lock state in `data/qtrreport.json` with the same rules)
  - `server/trmrepay.mjs`: shared `bucketColumns` (labels + XBRL codes from Time Buckets; sample buckets taken in order)
  - `src/pages/QuarterlyReport.jsx`, `src/pages/quarterly-report/rules.js`, styles in `src/trmrepay.css`: Generate, unit switch, "Display zero values",
    "Hide interest split rows", search, XBRL header row, report row colours, Save / Lock / Delete with confirmation, CSV export
  - `server/app.mjs`, `server/config.mjs` (`SAP_QTRREPORT_URL`), `config/catalog.mjs`, `src/main.jsx`, `.env`, `.env.example`
  - `tests/qtrreport.test.mjs` (3), `tests/helpers.mjs` (temporary `QTRREPORT_STORE`), `tests/gateway.test.mjs` (16 apps / 10 services)
  - `npm test` **29/29**, Python OK, `npm run build` OK

- [ ] 6. Human: restart the ALM app on 8093; choose whether/where to test Lock

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CE_AlmQtrReport | DDLS (custom entity, 3 parameters) | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_CE_AlmQtrPeriod | DDLS (root custom entity) + BDEF (unmanaged, 3 actions) | ZFS_ALM_API | DS4K907106 | active |
| ZCL_FS_ALM_QTRRPT_QUERY | CLAS (query provider of both) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMQTRPERIOD | CLAS (behavior pool) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMQTRRPT | SRVD | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMQTRRPT_O4_API | SRVB (OData V4 Web API) | ZFS_ALM_API | DS4K907106 | active, published |
| ZCL_FS_ALM_TRMREPAY_QUERY | CLAS (changed: public `get_rows`) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_TRM_MSG 011–016 | MSAG | ZFS_ALM_API | tasks DS4K907107 / DS4K907108 | on system |

## Lessons raised

L-607, L-608
