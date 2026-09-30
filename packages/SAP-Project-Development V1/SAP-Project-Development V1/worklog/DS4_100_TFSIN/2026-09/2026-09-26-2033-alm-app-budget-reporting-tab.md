# ALM app: Budget Reporting tab in Report Formats, on BudgetGrouping OData

- **Date:** 2026-09-26
- **Started:** 20:33
- **System:** DS4_100_TFSIN (read/write through `ZFS_SB_ALMRPTFMT_O4_API`; no SAP objects changed)
- **Package / Transport:** n/a (application code only, `D:\SAP Tool\SAP - ALM Application`)
- **Requested by:** human: "build another tab Budget Reporting same like other report in report format in the ALM application and use this odata for the CRUD"

## Scope

Add a fourth tab **Budget Reporting** to the ALM app's Report Formats module, the same kind of tab as ALM 1/2/3
Grouping (add, bulk edit, delete, filters, search, paste from Excel). CRUD goes through the `BudgetGrouping` entity
built in `2026-09-26-2018-alm-rptfmt-budget-grouping.md`. Out of scope: SAP objects, and restarting the human's
running app instance on port 8093.

## Design

The module is table-driven, so the tab is a new `budget` table in each layer:
- `engine/reportformats.py`: `SPEC['budget']` (3 parts, Group ID as ALM 2, name max 100). New `more_sources`
  spec key so a table can have a second source field: `lcrSource` is cleaned, checked against the ALM source master
  and derives `lcrSrcDesc` like `source` → `srcDesc`.
- `src/pages/report-formats/rules.js`: `grouping()` takes `title` (tab label "Budget Reporting") and `nameMax`,
  and two new layout items, `lcrSource` and `lcrSrcDesc`. Every source field in the tab is checked.
- `server/reportformats.mjs` `FIELDS.budget`, `config/reportformats-odata.json` `tables.budget` → `BudgetGrouping`
  (GroupId, Grp1..3, GroupName, Source, LcrSource, audit). The SAP-derived `SourceDesc`/`LcrSourceDesc` are not mapped:
  the descriptions come from the Data Sources master, as for the other tabs.
- `config/reportformats-seed.json`: two sample budget rows for local mode.
- Tests: JS (tab, Group ID, both sources, OData body for `BudgetGrouping`), Python (Group ID, view texts, LCR check, update data).
- README: four tabs.

## Todo

- [x] 1. Engine, rules, server fields, OData map, seed, README
- [x] 2. `npm test` **20/20**, `npm run test:python` **23/23**, `npm run build` OK
- [x] 3. Live round trip through a temporary app instance (port 8095, stopped afterwards):
  `scripts/alm-rptfmt-timebkt-tests/budget-app-roundtrip.ps1`, **9 passed, 0 failed** (`evidence/2026-09-26-2033-alm-app-budget-reporting-tab/app-roundtrip-run.txt`).
  Odata mode, alm1/2/3/budget = 147/183/178/41. Source text derived. Create `ZT:Z1:Z1` (LCR text derived), unknown LCR source refused
  by the engine (422, field `lcrSource`), update (LCR cleared), delete. Count back to 41, and `/FS00/ALMTR006` has no `ZT*` rows.
  Script fixes on the way (L-601): base URL `127.0.0.1`, `Origin` + `x-alm-request: 1` on writes, 422 body read from the response stream
- Not checked visually: the Playwright server is not connected, so the tab was not screenshotted. The tab uses the same `Workbench` as the other three
- [ ] 4. Human: restart the app on 8093 so it loads the new server field list (the engine is re-spawned per call, but `FIELDS`/the OData map are read at start)

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Tab label | "Budget Reporting" as the human named it (the other tabs say "... Grouping") | 2026-09-26 |

## Changed files (ALM app)

`engine/reportformats.py` · `src/pages/report-formats/rules.js` · `src/pages/ReportFormats.jsx` (comment) · `server/reportformats.mjs` ·
`config/reportformats-odata.json` · `config/reportformats-seed.json` · `tests/reportformats.test.mjs` · `tests/test_reportformats.py` · `README.md`

## Lessons raised

L-601
