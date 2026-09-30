# ALM 1 TRM Repayment Cashflows: OData Web API for /FS00/ALMR003 + ALM app report

- **Date:** 2026-09-27
- **Started:** 15:45
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (proposed, as the other ALM APIs)
- **Transport:** `DS4K907106` / task `DS4K907108` (proposed)
- **Requested by:** human: "Create the ODATA web aPI for the report /FS00/ALMR003 and build the report under data preparation alm 1 as TRM Repayment Cashflows - ALM1"

## Scope

A read-only OData V4 Web API that returns what `/FS00/ALMR003` shows, and a new app entry **TRM Repayment Cashflows - ALM1**
under ALM1: Dynamic Liquidity → Data Preparation in the ALM app (`D:\SAP Tool\SAP - ALM Application`), next to Update Manual Data.
Out of scope: changing `/FS00/ALMR003` or the `/FS00/` objects it reads, and the deal drill-down (`/FS00/ALMFM002`, SAP GUI only).

## Program analysis (`/FS00/ALMR003`, sources in `evidence/2026-09-27-1545-alm1-trm-repayment-cashflows-api/`)

Selection: `P_BUKRS` (req.), `P_MON` C2 (req.), `P_YEAR` C4 (req.), `S_RFHA` deal numbers, `S_PRD` product types,
unit radio buttons (crores / lakhs / thousands / INR, default INR), ALV layout.

`get_data`:
1. Key date = last day of the month + 1 (first day of the next month).
2. Buckets: `/FS00/ALMFM001` `im_type = '01'` (ALM 1), `im_date` = key date → `/FS00/ALMTT001` (bucket, from date, to date).
3. Cash flows: `/FS00/CDS0002` (TRM flows) ⋈ `/FS00/ALMTR009` (flow type + product type → ALM source type `ZS_TYPE`/`ZS_DESC`),
   `trldate >= key date`, valuation area `001`, product type in `S_PRD`.
4. Deals: `/FS00/CDS0001` for `P_BUKRS`, matched on the deal number (money market) or on the security ID (securities, one row per security).
5. Per deal/security, two passes: **interest** (source types 10, 12) and **principal** (09, 11). Each flow's `POSITION_AMT` goes to the
   bucket whose date range holds its `trldate`; buckets **01–05 only**; total = sum. A row is output only if the total ≠ 0.
   Amounts divided by 10^7 / 10^5 / 10^3 for the chosen unit.
6. Columns: company code, deal no., class ID (security), activity, product type + text, transaction type + text, customer + name,
   start date, end date, source type + desc, date, B01..B05, total.

### Defects found in the program (they change the numbers)

| # | Defect | Effect |
|---|---|---|
| D1 | `gs_data` buckets are not cleared between the interest pass and the principal pass | the **principal row also contains the interest amounts** |
| D2 | `S_RFHA` (deal number) is on the selection screen but never used | the deal filter has no effect |
| D3 | only buckets 01–05 are filled | ALM 1 has 7 buckets (`/FS00/ALMTR004`); flows in buckets 6–7 are dropped, also from the total |
| D4 | `stype`/`sdesc`/`date` are overwritten by each flow | the row shows the type and date of the **last** flow of the pass (e.g. type 10 or 12, whichever came last) |
| D5 | the company code filters the deals, not the flows | no effect on the result (the flows are matched to deals of `P_BUKRS`), but it reads flows of all company codes |

## Read route

The change server `abap-adt-ds4-100-tfsin` answered HTTP 400 on every call from 15:4x (`runQuery`, `getObjectSource`, `searchObject`,
`dropSession`), while `Test-NetConnection` and an authenticated ADT REST GET worked. So the three program sources were read with
plain ADT REST GETs (read-only, `sap-client=100`). Changes still need the change server: a Claude Code restart may be required.

## Design

Read-only **custom entity** with a query provider class (the logic is procedural: bucket dates from `/FS00/ALMFM001`,
grouping, sums), exposed as an OData V4 Web API.

- `ZFS_CE_AlmTrmRepay`, parameters **`P_CompanyCode`**, **`P_FiscalYear`**, **`P_FiscalPeriod`**. Parameters instead of mandatory
  filters: the framework then enforces them, and no new exception class is needed (`CX_RAP_QUERY_PROVIDER` is abstract and carries
  no `ZFS_TRM_MSG` text; an extra class was not requested, rule 3). An invalid month or an unknown company code returns no rows.
- One row per **company code × deal (money market) or security × source type × currency**. Source types 10/12 = Interest, 09/11 =
  Principal (`FlowKind`). Grouping per source type rather than per kind: when a deal has only one type per kind (the normal case) this is
  exactly "deal × interest/principal"; if a deal has both 10 and 12 they are not mixed into one row with one label (D4).
- Key: `CompanyCode, DealNumber, SecurityId, SourceType, Currency`. Money market rows have a blank `SecurityId`, security rows a blank
  `DealNumber` (as the report). A security appears **once**, whatever the number of deals or duplicate `/FS00/CDS0001` rows (the report can
  repeat rows, because `/FS00/CDS0001` is `select distinct` over several joins and `lt_data_mm` is not de-duplicated).
- Fields: deal details from `/FS00/CDS0001` (Activity, ProductType/Text, TransactionType/Text, Customer/Name, StartDate, EndDate),
  SourceTypeDesc, FirstFlowDate/LastFlowDate (of the flows counted), **Bucket1..Bucket7**, Total (= sum of the seven), all in INR
  (`POSITION_AMT`, `abap.dec(23,2)`). Rows with Total = 0 are left out, as in the report.
- Flows: `/FS00/CDS0002` ⋈ `/FS00/ALMTR009` (flow type + product type; checked 2026-09-27: no duplicate pair, `ZSFHAART` always blank, so
  the join cannot double-count), valuation area `001`, `trldate` ≥ first day of the next month, **company code = `P_CompanyCode`** (D5),
  source type 09–12.
- Fixes: D1 (each row sums only its own flows), D2 (`$filter` on `DealNumber` works, like any other element), D3 (7 buckets), D4 (see above).
- `$filter`, `$orderby`, `$top`/`$skip`, `$count` handled in the provider (filter ranges applied to the result, `ProductType` and
  `DealNumber` also pushed into the SQL).

## Naming gate

Entity `AlmTrmRepay` (`ZFS_SB_ALMTRMREPAY_O4_API` = 25 chars, max 26). Searches `ZFS_CE_ALMTRM*`, `ZCL_FS_ALM*`, `ZFS_SD_ALMTRM*`,
`ZFS_SB_ALMTRM*`: no hits.

```
NAMING: ZFS_CE_AlmTrmRepay -> matches Custom entity ZFS_CE_<Entity>
NAMING: ZCL_FS_ALM_TRMREPAY_QUERY -> matches RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY, AREA=ALM
NAMING: ZFS_SD_ALMTRMREPAY -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMTRMREPAY_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API, 25 chars
```

## Tooling notes

- Change server: HTTP 400 on everything from 15:4x to about 16:3x; the human reconnected the MCP servers ("check MCPs now"), after which it works.
- `runQuery` still answers "Internal server error" to some statements (joins over `/FS00/CDS0002`, `DD03L` with several `IN` lists) while simple
  ones work. The same SQL through the ADT data preview (`POST /sap/bc/adt/datapreview/freestyle`, read-only) works when kept short.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Reproduce D1–D4, or fix them in the API | **Fix them**: separate interest/principal rows, deal filter applied, all 7 ALM 1 buckets | 2026-09-27 |
| 2 | Row shape | **One row per deal (or security) × interest/principal**, Bucket1..7 + Total | 2026-09-27 |
| 3 | Unit conversion | **In the app**; the API returns INR | 2026-09-27 |
| 4 | Package / transport | `ZFS_ALM_API` / `DS4K907106` (default, as the other ALM APIs) | 2026-09-27 |

## Todo

- [x] 1. Read `/FS00/ALMR003` (main, TOP, F01), `/FS00/CDS0001`, `/FS00/CDS0002`, `/FS00/ALMFM001`, `/FS00/ALMTT001`; the app's navigation
- [x] 2. Design decisions from the human (questions 1–4)
- [x] 3. Build: `adt-mcp` created the class, the custom entity (DDLS), SRVD (`sourceType S`) and SRVB (OData V4 - Web API); all source through the
  change server. All active, `inactiveObjects` = `[]`. The first class activation warned that `CX_RAP_QUERY_FILTER_NO_RANGE` was not declared.
  `CX_RAP_QUERY_PROVIDER` and `CX_RAP_QUERY_PROV_NOT_IMPL` are both abstract, so a filter that is not expressible as ranges now **returns no rows**
  (fail closed), a documented limit. Second activation: no messages
- [x] 4. Publish: `/IWFND/V4_ADMIN` by `sap-gui` (TFSIN session, connection 0) → alias `LOCAL`, group `ZFS_SB_ALMTRMREPAY*` → PUBLISH →
  "New service group(s) successfully published"
- [x] 5. Live test `scripts/alm-trm-repay-tests/smoke.ps1` (read-only): run 2 **17/17** (`smoke-run-2.txt`; run 1 15/17, both failures were my
  script: PS 5.1 single-row unwrapping and no `nextLink` follow). Company 1000, 2026-09 (flows 2026-10-01..2027-09-30): 324 rows; totals per source
  type **equal an independent SQL sum** (ADT data preview; money market by deal no., securities by security ID): 09 = 10,000,000.00,
  10 = 252,054.80, 11 = 177,512,778,684.18, 12 = 23,786,716,533.60. Total = Bucket1..7 on every row; 97 rows use buckets 6/7; 58 deals have
  separate interest and principal rows (D1 fixed); DealNumber filter works (D2); month 13 / unknown company → empty; no parameters → 400
- [x] 6. ATC (default variant) on the class and custom entity: **0 findings**
- [x] 7. ALM app (`D:\SAP Tool\SAP - ALM Application`), new module `trmrepay`, tile **TRM Repayment Cashflows - ALM1** under ALM1: Dynamic
  Liquidity → Data Preparation:
  - `config/trmrepay-odata.json` (contract), `config/trmrepay-seed.json` (sample rows without `SAP_TRMREPAY_URL`)
  - `server/trmrepay.mjs` (selection checks, optional Transaction No / Product Type lists as `$filter`, follows `nextLink`, bucket labels from
    Time Buckets ALM 1), `server/app.mjs` (`GET /api/trmrepay`), `server/config.mjs` (`SAP_TRMREPAY_URL`), `config/catalog.mjs`, `src/main.jsx`
  - `src/pages/TrmRepayment.jsx`, `src/pages/trm-repayment/rules.js`, `src/trmrepay.css`: company code / month / year / transactions / product
    types, Run; flow switch All / Interest / Principal; unit switch INR / Thousands / Lakhs / Crores (display only); search; sortable columns;
    totals row; CSV export
  - `tests/trmrepay.test.mjs` (3 tests), `tests/gateway.test.mjs` (catalog counts 15 apps / 9 services); `.env`, `.env.example`
  - `npm test` **26/26**, `npm run test:python` OK, `npm run build` OK
  - Live round trip on a temporary instance (port 8097, stopped afterwards): `scripts/alm-trm-repay-tests/app-roundtrip.ps1` **12/12**
    (`app-roundtrip-run-1.txt`): odata mode, 74 company codes, key date 2026-10-01, 7 labelled buckets, 324 rows = SAP, totals per source type =
    SAP, both filters, month 13 refused
  - **Not checked visually:** signing in through a browser tool would put the demo password in the transcript
- [ ] 8. Human: restart the ALM app on 8093 (new server module and `.env`), then look at the page

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CE_AlmTrmRepay | DDLS (custom entity, 3 parameters) | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZCL_FS_ALM_TRMREPAY_QUERY | CLAS (`IF_RAP_QUERY_PROVIDER`) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMTRMREPAY | SRVD (`TrmRepaymentCashflow`) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMTRMREPAY_O4_API | SRVB (OData V4 Web API) | ZFS_ALM_API | DS4K907106 | active, published |

No messages were created (none needed: parameters are enforced by the framework, invalid input returns no rows).
`E071`: CLAS, DDLS, SRVD, SRVB, G4BA on `DS4K907108`.

## Delivery checks

- [x] Syntax check clean / activated, nothing inactive
- [x] ATC: 0 findings
- [x] ABAP Unit: none (not requested)
- [x] Text elements: none
- [x] Transport: `E071` confirmed

## Lessons raised

L-605, L-606
