# ALM 2/3 TRM Data and Trial Balance Data: OData Web APIs + ALM app applications for six /FS00/ tcodes

- **Date:** 2026-09-27
- **Started:** 21:55
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API`
- **Transport:** `DS4K907106`, chosen by the human from `abap_transport-get`
- **Requested by:** human: "For ALM Application, ODATA API and Applications to be build 1. TRM Data tcodes are a. /FS00/ALMT033 - TRM Accrual
  Cashflow - ALM 2,3 b./FS00/ALMT034 - TRM Principal O/S - ALM 2,3 2. Trial Balance Data tcodes are a. /FS00/ALMT030 - ALM2 GL Account Balance
  Details b./FS00/ALMT029 - GL Account Details d./FS00/ALMT032 - GL Mapping Upload - ALM2/ALM3 e./FS00/ALMT035 - GL Mapping Update - Manual"

## Scope

For each tcode an OData V4 Web API that does what its program does, and an application in the ALM app
(`D:\SAP Tool\SAP - ALM Application`) under ALM2/ALM3 → Data Preparation → **TRM Data** / **Trial Balance Data** (folders already in
`config/catalog.mjs`, empty). Out of scope: changing the `/FS00/` programs or tables.

| # | Tcode | Program | Title | App folder |
|---|---|---|---|---|
| 1a | `/FS00/ALMT033` | `/FS00/ALMR014` | TRM Accrual Cashflow - ALM 2,3 | TRM Data |
| 1b | `/FS00/ALMT034` | `/FS00/ALMR015` | TRM Principal O/S - ALM 2,3 | TRM Data |
| 2a | `/FS00/ALMT030` | `/FS00/ALMR010` | ALM2 GL Account Balance Details | Trial Balance Data |
| 2b | `/FS00/ALMT029` | `/FS00/ALMR009` | GL Account Details | Trial Balance Data |
| 2d | `/FS00/ALMT032` | `/FS00/ALMR011` | GL Mapping Upload - ALM2/ALM3 | Trial Balance Data |
| 2e | `/FS00/ALMT035` | `/FS00/ALMR016` | GL Mapping Update - Manual | Trial Balance Data |

(The list has no item 2c: confirmed by the human 2026-09-27, "no 2c, go ahead".)

## Analysis

Sources in `evidence/2026-09-27-2155-alm23-trm-and-trial-balance-apis/` (read by read-only subagents).

### 2d/2e — `/FS00/ALMR011` (GL Mapping Upload) and `/FS00/ALMR016` (GL Mapping Update - Manual)

Both maintain **`/FS00/ALMTR018`** ("ALM2 GL Mapping", 660 rows on TFSIN). Key `MANDT` + `ZGL_ID` C10 only — **no company code**,
so the mapping is global. Fields: ZGL_DESC C50, ZGR_ID C20 (ALM 2 group), ZGR_DESC, ZCAL C2 (source), ZCAL_DESC, ZBU_ID N2 (bucket),
ZBU_DESC, ZBU3_ID N2, ZBU3_DESC, ZTYPE3 C2, ZSNS C2, ZGRP_ID C20 (ALM 3 group), ZGRP_NAME, 6 split audit fields.

- **R011:** `p_file` XLS/XLSX via `TEXT_CONVERT_XLS_TO_SAP` (header row skipped), 12 columns GL_ID, GL_DESC, CAL, CAL_DESC, GR_ID, GR_DESC,
  BU_ID, BU_DESC, GRP_ID, GRP_NAME, TYPE3, SNS. GL `ALPHA = IN`; only GR_DESC re-derived from TR002. `MODIFY ... FROM TABLE` (merge, never deletes),
  all 6 audit fields = now (creation stamp lost on re-upload), ZBU3_* blanked. No validation at all. `p_layout` dead.
- **R016:** `p_bukrs` (only for SKAT texts), editable ALV of all rows + 20 blank rows. Editable GL_ID, GR_ID, CAL_ID, BU_ID, TYPE, ALM3_GRP.
  Descriptions filled from SKAT/TR002/TR003/TR008/TR005 only when blank (stale after a code change). Save = `MODIFY` + `COMMIT WORK` per row, from a
  rebuilt row: **ZSNS, ZBU3_* and all audit fields blanked**. No validation, no delete (changing the GL inserts a new row).
- Messages in both are inline literals.
- Nothing in `ZFS_ALM_API` covers `/FS00/ALMTR018`.

### 2b — `/FS00/ALMR009` (GL Account Details)

G/L account **master-data list**, no balances, no `/FS00/` table, writes nothing. Selection: chart of accounts `p_chart` (req.), company code
`p_bukrs` (req.), creation-date range, balance-sheet-only checkbox. Reads SKB1 ⋈ SKA1 ⋈ SKAT (INNER, logon language) directly.
One row = account × company code: flags (posting blocks, creation block, deletion flag) as Yes/No, created on/by.
Released candidates: `I_GLAccountInCompanyCode`, `I_GLAccountInChartOfAccounts`, `I_GLAccountText` (to verify on TFSIN).
Defects: the two posting-block labels are swapped (SKB1 block shown as chart-level and vice versa); accounts without a text in the logon
language disappear; chart not checked against the company code's chart (T001-KTOPL).

### 2a — `/FS00/ALMR010` (ALM2 GL Account Balance Details)

Trial balance per G/L account **with its ALM 2/ALM 3 mapping from `/FS00/ALMTR018`**, writes nothing. Selection: company code, calendar
month + year (all req.), ALM 2 group, ALM 3 group, source range, checkboxes balance-sheet-only / keep zero balances / mapped-only, unit radio
(crore / lakh / thousand / rupees, default rupees). Balances by `SUBMIT RFSSLD00` for the fiscal period of the month
(`FTI_FISCAL_YEAR_MONTH_GET`), captured with `cl_salv_bs_runtime_info`; uses `ACYTD_BAL` (cumulative balance), sign as posted.
Mapping global (018 has no company code). One row = account: balance, absolute balance, ALM 2 group + desc, source + desc, bucket + desc,
type, ALM 3 group + desc, mapped Yes/No.
Defects: only the first RFSSLD00 row per account; scaling before the zero filter (small balances vanish in crore/lakh); an empty RFSSLD00
result stops the report; ledger not passed; ALM 3 bucket `ZBU3_*` never shown; a group filter turns "all accounts" into mapped-only;
`ZSNS` read but never used.
`/FS00/ALMTR022` ("Save ALM2 & ALM3 TB Data", key company/month/year/GL, balance, mapping, lock fields) matches R010's columns but is
**empty on TFSIN and R010 does not write it**; its writer was not found yet.

### 1a/1b — `/FS00/ALMR014` (TRM Accrual Cashflows) and `/FS00/ALMR015` (TRM Principal O/S)

Same selection: company code, month, year (req.), deals `S_RFHA`, securities `S_RANL`, product types `S_PRD`, R015 also transaction types
`S_TTYP`; unit radio (crore/lakh/thousand/INR). Buckets `/FS00/ALMFM001 im_type '02'` (= `/FS00/ALMTR005`, 10 buckets; the stored
`ZF_DAYS`/`ZT_DAYS` are 0, the FM computes them), matched on **days from month end** (`trldate − gv_date`). Flows `/FS00/CDS0002` by house flow
category `ZFS_FLOW` (FLnn), company code pushed into SQL, booking state 4 dropped. Deals/securities `/FS00/CDS0001`. One row per deal or
security, B01..B10 + total. Neither writes anything.

- **R014 accrual:** deals: `10F`/`202` = FL41 `valuation_amt` of the referenced deal on the month end; other `10F` = Σ FL52 − Σ FL51 (posted ≤ month
  end); others = FL42 of the first posting date after month end (the accrual reversal). Securities: Σ FL52 − Σ FL51 in valuation area 002. The whole
  amount goes to the bucket of the next FL11 (interest) flow (its date = "Int Payout Date").
- **R015 principal O/S:** products gated by `/FS00/ALMTR026` `ZPRINC`; deals live at month end. Deals: FL03/FL04 repayments per bucket (signed); `10E`
  (FX) = nominal of the first FL01 × `TCURR` rate `TRMR`, whole amount in the maturity bucket. Securities: `15D` from flows; products flagged
  `ZPRINC_TPM12` (on TFSIN: 10B, 10C, 10D, 15A, 15D, 23B, 11B, 11D, 04H, 04J) take the TPM12 amortised acquisition value by
  **`SUBMIT rtpm_trl_show_position_values`** captured with `cl_salv_bs_runtime_info`; no released CDS for TPM12 position values found.
  Adds reference rate, fixed/variable, O/S amount, repayment date.
- **R003's D1–D5 are gone** in both. New defects:

  | # | Prog | Defect | Effect |
  |---|---|---|---|
  | D6 | both | a security bought through a deal is listed from the deal and from the security list | counted twice |
  | D7 | R014 | total = B01..B09 | bucket 10 left out of the total; a row with only bucket 10 disappears |
  | D8 | R014 | STYPE/SDESC in the layout, never filled | empty columns |
  | D9 | R014 | placement needs a next FL11 flow posted after month end | accrual silently lost without one |
  | D10 | R014 | `valuation_amt` for 10F/202, `position_amt` otherwise; deals valuation area 001, securities 002 | mixed bases (business rule?) |
  | D11 | R015 | `DELETE gt_data WHERE sgsart = '10A'` at the end | 10A never shown (business rule?) |
  | D12 | R015 | security bucket loop without EXIT | amount in two buckets on an overlapping day |
  | D13 | R015 | 10E O/S = nominal of the first FL01 | partial repayments ignored (business rule?) |
  | D14 | R015 | TCURR date rebuilt from the user's date format | wrong/no rate unless DD.MM.YYYY |
  | D15 | R015 | `abs()` on the rate, FFACT/TFACT ignored | indirect quotes wrong |
  | D16 | R015 | `/FS00/ALMTR026` read without company code | other company's product flags apply |
  | D17 | R015 | empty product range selects everything | all products processed |
  | D18 | R015 | deal "others": repayment date never set, `trldate = month end` → day 0 | blank date; month-end flows may drop |
  | D19 | R015 | `15D`: first FL04 at any date | arbitrary (maybe future) repayment subtracted |

### Released CDS on TFSIN (TADIR)

`I_GLAccountInCompanyCode`, `I_GLAccountInChartOfAccounts`, `I_GLAccountText`, `I_JournalEntryItem`, `I_GLAccountLineItem`,
`I_GLAccountBalance`, `I_GLAcctBalance`, `I_FiscalCalendarDate`, `I_CompanyCode` exist (release state per view still to check).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | TRM defects D6–D19 | **Fix the technical ones** (D6, D7, D8, D12, D14, D15, D16, D17, D20); keep the rules that look intentional (D10 bases, D11 10A excluded, D13 10E nominal, D18, D19, D9) | 2026-09-27 |
| 2 | TPM12 amortised acquisition value (R015) | **SUBMIT `RTPM_TRL_SHOW_POSITION_VALUES`** from the query class and capture it, as R015 does (no released CDS) | 2026-09-27 |
| 3 | GL balances (R010) | **Released CDS** (`I_JournalEntryItem`, leading ledger, year to period incl. carry-forward; period via `I_FiscalCalendarDate`), verified against RFSSLD00 | 2026-09-27 |
| 4 | GL mapping (R011 + R016) | **One CRUD API on `/FS00/ALMTR018`**: validations, descriptions from SAP, stamps kept, real delete; upload = XLSX read in the app, merge; two tiles | 2026-09-27 |
| 5 | Draft on the GL mapping BO (L-224) | **No draft** | 2026-09-27 |
| 6 | Coding standard (human, standing) | "best practise, well optimised, modern syntax" — L-611 | 2026-09-27 |

Defaults taken by me (stated to the human): two services grouped by app folder, `ZFS_SB_ALMTRMDATA_O4_API` (TRM accrual + principal O/S) and
`ZFS_SB_ALMTBDATA_O4_API` (GL accounts, GL balances, GL mapping); R009 as a plain CDS view over released views with the posting-block labels
fixed; R010 read-only (it writes nothing); unit conversion in the app (API in INR); each app tile in both the ALM 2 and ALM 3 folders;
package `ZFS_ALM_API`, transport `DS4K907106` (to confirm at the first create).

## Design

**Trial Balance Data** — service `ZFS_SD_ALMTBDATA` / `ZFS_SB_ALMTBDATA_O4_API`:

- `GlAccount` = `ZFS_C_AlmGlAccount` (R009): view entity over `I_GLAccountInCompanyCode` ⋈ `I_CompanyCode` (chart **from the company code**) ⋈
  `I_GLAccountInChartOfAccounts`, left outer `I_GLAccountText` (session language, account kept without a text). Flags with the right labels:
  blocked for posting (chart), blocked for posting (company code), blocked for creation, marked for deletion; created on/by. `$filter` for
  company code, creation date, balance-sheet-only.
- `GlAccountBalance` = `ZFS_C_AlmGlBalance(P_CompanyCode, P_KeyDate)` (R010): all accounts of the company code, left outer the balance view
  `ZFS_I_AlmGlBalance` (Σ `I_JournalEntryItem`.AmountInCompanyCodeCurrency, ledger `0L`, fiscal year of the key date, periods 000..period of the
  key date via `I_CompanyCode`.FiscalYearVariant ⋈ `I_FiscalCalendarDate` — aggregated in the database), left outer the mapping
  `/FS00/ALMTR018` and the ALM 2/3 group names (`/FS00/ALMTR002`/`003`), bucket texts (`/FS00/ALMTR005`), `IsMapped`. Zero-balance,
  balance-sheet, mapped-only, source and group filters = `$filter`; unit conversion in the app. Fixes: all rows of an account summed, no rounding
  before filtering, the ALM 3 bucket shown, leading ledger explicit.
- `GlMapping` = unmanaged BO `ZFS_I_AlmGlMap` / `ZFS_C_AlmGlMapTP` / `ZBP_FS_ALMGLMAPTP` over `/FS00/ALMTR018` (R011 + R016), lock object
  `EZFS_T_ALMGLMAP`, ETag = changed date+time. Create/update/delete. GL key ALPHA-converted. Validations (`ZFS_TRM_MSG` 001–005): GL exists in a
  chart of accounts, ALM 2 group (`/FS00/ALMTR002`), source (`/FS00/ALMTR008`), bucket and ALM 3 bucket (`/FS00/ALMTR005`), ALM 3 group
  (`/FS00/ALMTR003`), sensitivity in domain `/FS00/ALMDM0009` (01/02). `ZTYPE3` not checked (data holds IA/IB against its domain, L-612).
  **On update only the fields sent are checked** (L-612). Descriptions derived by SAP, never taken from the caller. Stamps: created kept, changed set.

**TRM Data** — service `ZFS_SD_ALMTRMDATA` / `ZFS_SB_ALMTRMDATA_O4_API`: custom entities `ZFS_CE_AlmTrmAccrual` (R014) and
`ZFS_CE_AlmTrmPrincipal` (R015) with query classes `ZCL_FS_ALM_TRMACCR_QUERY` / `ZCL_FS_ALM_TRMPRIN_QUERY`, parameters company code, fiscal
year, month (as `ZFS_CE_AlmTrmRepay`), one row per deal or security, B01..B10 + total, INR.

## Naming gate

Searches `ZFS_%ALMGL%`, `ZBP_FS_ALMGL%`, `EZFS_T_ALMGL%`, `ZFS_%ALMTBDATA%`, `ZFS_%ALMTRMDATA%`, `ZFS_CE_ALMTRMA/P%`, `ZCL_FS_ALM_TRM%`: only the
existing `ZCL_FS_ALM_TRMREPAY_QUERY`.

```
NAMING: ZFS_C_AlmGlAccount -> matches Consumption view ZFS_C_<Entity> (read-only, no TP)
NAMING: ZFS_I_AlmGlBalance -> matches Interface view ZFS_I_<Entity> (read-only aggregate)
NAMING: ZFS_C_AlmGlBalance -> matches Consumption view ZFS_C_<Entity> (read-only, no TP)
NAMING: ZFS_I_AlmGlMap -> Interface view ZFS_I_<Entity> carrying the unmanaged BDEF (runbook §1 forced shape, as ZFS_I_AlmGrp2)
NAMING: ZFS_C_AlmGlMapTP -> matches Projection ZFS_C_<Entity>, Entity = AlmGlMapTP
NAMING: ZBP_FS_ALMGLMAPTP -> matches Behavior pool ZBP_FS_<Entity>
NAMING: EZFS_T_ALMGLMAP -> matches Lock object EZFS_T_<NAME> (15 chars, max 16)
NAMING: ZFS_SD_ALMTBDATA -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMTBDATA_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API (23 chars)
NAMING: ZFS_CE_AlmTrmAccrual / ZFS_CE_AlmTrmPrincipal -> match Custom entity ZFS_CE_<Entity>
NAMING: ZCL_FS_ALM_TRMACCR_QUERY / ZCL_FS_ALM_TRMPRIN_QUERY -> match RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY (as ZCL_FS_ALM_TRMREPAY_QUERY)
NAMING: ZFS_SD_ALMTRMDATA -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMTRMDATA_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API (24 chars)
```

## Todo

- [x] 1. Read the six programs, their tables/CDS, the precedent `/FS00/ALMR003` API (3 read-only subagents; TFSIN ADT failed mid-way, human reconnected `/mcp`)
- [x] 2. Design decisions from the human (questions 1–5)
- [x] 3. Build per API
  - **Trial Balance Data (done):** `ZFS_C_AlmGlAccount`, `ZFS_I_AlmGlBalance`, `ZFS_C_AlmGlBalance`, `ZFS_I_AlmGlMap`, `ZFS_C_AlmGlMapTP` (DDLS),
    `ZFS_I_AlmGlMap`/`ZFS_C_AlmGlMapTP` (BDEF), `ZBP_FS_ALMGLMAPTP`, `EZFS_T_ALMGLMAP`, `ZFS_SD_ALMTBDATA`, `ZFS_SB_ALMTBDATA_O4_API`: all `adt-mcp`
    created, sources via change server, all active. Published with `scripts/sap-gui-publish-service.py` (TFSIN session DS4/100 FS_DEV3 confirmed first):
    "New service group(s) successfully published". First service call dumped `RAISE_EXCEPTION`/`TYPE_NOT_FOUND`: parameter `P_KeyDate : abap.dats`
    → retyped `vdm_v_key_date` (L-613). Lock object warning "Lock parameter ZGL_ID meaningless" — same DD27S shape as `EZFS_T_ALMGRP2`, cosmetic.
    Smoke `scripts/alm-tb-data-tests/smoke.ps1`: run 1 28/31 (currency needed in an amount `$filter`, `/IWBEP/CM_V4S_RUN/031`; double sum; NUMC returned
    without leading zeros — script issues), run 2 **31/31**, run 3 after ATC fixes **31/31** (`evidence/.../tb-smoke-run-3.txt`).
    ATC: run 1 8 findings (4 × no WHERE on the small ALM master tables → `#EC CI_NOWHERE`; sorted-table sequential read; `SELECT *` in delete →
    key only; 2 × SLIN 1700 → `##NO_TEXT`), run 2 one left (`SELECT *` 4.8 %, full rows genuinely needed) → `#EC CI_ALL_FIELDS_NEEDED` prepared in
    `evidence/.../glmap-ZBP_FS_ALMGLMAPTP-impl.abap`; pushed after "continue now", ATC **0 findings** (worklist `52540030422E1FD1AED0D25976462000`),
    smoke run 4 **31/31** (`tb-smoke-run-4.txt`)
  - **TRM Data (in progress, PAUSED by the human's "wait" ~22:4x):** human asked "create other reports with parallel subagents" → two build
    subagents. Both stopped on "wait" with objects **created and source written but inactive**, nothing locked:
    `ZFS_CE_AlmTrmAccrual` + `ZCL_FS_ALM_TRMACCR_QUERY` (R014), `ZFS_CE_AlmTrmPrincipal` + `ZCL_FS_ALM_TRMPRIN_QUERY` (R015); source copies
    `evidence/.../r014-*`, `r015-*`. Next: syntax check, activate, ATC, SQL checks; then `ZFS_SD_ALMTRMDATA`/`ZFS_SB_ALMTRMDATA_O4_API`, publish, smoke.
    To confirm with the human: both agents read "D20" as other flow-reading issues (worklog table stops at D19; D20 = the overflow CATCH clearing the
    wrong variable) — their extra fixes (R014: filters no longer cut the referenced deal's FL41; all security flow blocks counted; deal repeated in the
    view counted once; R015: deal repeated in `/FS00/CDS0001` counted once) go beyond the approved list. After "continue now" I accepted
    them as technical fixes in the spirit of answer 1 (to be listed in the delivery report) and told both agents D20 = the overflow CATCH.
    Both resumed. Third subagent started on the ALM app Trial Balance tiles (4 apps × ALM 2/ALM 3 folders).
  - **R014 done (subagent):** `ZFS_CE_AlmTrmAccrual` + `ZCL_FS_ALM_TRMACCR_QUERY` active, ATC 0 (after 1 × sorted-table sequential read fixed).
    Extra fixes (accepted): filters no longer cut the referenced deal's FL41; all security flow blocks counted; deals repeated by `/FS00/CDS0001`
    (25 × 5520xxx) listed once. FL42 "earliest posting after month end" = program's first-row rule on 1000/2026-09 (0 difference). Oracle
    `evidence/.../r014-sql-oracle-1000-202609.txt`: 20 rows, 677,564,699.07.
  - `ZFS_SD_ALMTRMDATA` (TrmAccrualCashflow) + `ZFS_SB_ALMTRMDATA_O4_API` created by me (`adt-mcp`), active, published by script ("New service group(s)
    successfully published"). **Live = oracle:** 20 rows, total 677,564,699.07, B01 10,776,712.33 / B03 47,765,906.60 / B04 −250,181,824.27 /
    B05 165,786,132.90 / B06 584,836,037.57 / B07 118,581,733.94; Total = Σ buckets on every row; `ProductType eq '10F'` 7 rows −202,408,377.93;
    month 13 → 0 rows. TrmPrincipalOutstanding to be added when R015 is active.
  - **R015 done (subagent):** `ZFS_CE_AlmTrmPrincipal` + `ZCL_FS_ALM_TRMPRIN_QUERY` active; ATC: 4 of 5 fixed, 1 prio 3 left = "Critical
    Statements 0005 – Call Executable Program RTPM_TRL_SHOW_POSITION_VALUES" (the human's SUBMIT decision). D14/D15 via released
    `CL_EXCHANGE_RATES`; TPM12 SUBMIT once per request (securities only, p_dea off) and fail-soft: element `Tpm12CaptureFailed` marks securities
    without a captured value (`$filter=Tpm12CaptureFailed eq true`). Oracles `evidence/.../r015-sql-oracles-1000-202609.txt`.
  - Change server dropped again (HTTP 400 on lock); human reconnected `/mcp`. `ZFS_SD_ALMTRMDATA` + `TrmPrincipalOutstanding`, active.
    **Live = oracle** (1000/2026-09, 4 s): 610 rows; 10B 307,630,000.00 / 10C 55,563,692,968.56 / 10D 19,802,336,664.00 / 10F 103,422,506,736.40 /
    10E 7,818,392,981,392.58 (USD+JPY+INR/CHF as the oracle) / 15A 7,900,388,252.43 (30 rows, TPM12, 0 capture failures) / 15D 249,101,309,441.68 (131);
    Total = Σ buckets on every row.
  - **Against the SAP report:** `/FS00/ALMT034` run in SAP GUI (TFSIN session 1, display only) for 1000 / 09 / 2026 / product 15A: 30 securities +
    2 subtotal lines, total 7,900,388,252.43; all 30 equal the API row by row (amount and repayment date), 0 differences (L-615) R015 uses released `CL_EXCHANGE_RATES`
    (TCURF factors, indirect quotes) for D14/D15; TPM12 SUBMIT once per request, securities only
- [x] 4. Publish, test: both published by script; smoke `alm-tb-data-tests/smoke.ps1` 31/31 (run 4), `alm-trm-data-tests/smoke.ps1` run 1 26/27 (script: empty array → $null), run 2 **27/27** (`trm-smoke-run-2.txt`)
- [x] 5. ALM app applications, tests, round trip
  - **Trial Balance Data (app subagent, done):** 4 apps × `alm2-trial-balance` / `alm3-trial-balance`: GL Account Details, GL Account Balance Details,
    GL Mapping Upload (.xlsx via the browser's DecompressionStream, .csv; R011 12-column layout; preview then merge, never delete; template
    download), GL Mapping Update - Manual (maintenance workbench, value helps, changed fields only). New: `config/tbdata-odata.json`, `tbdata-seed.json`,
    `engine/glmapping.py`, `server/glmapping.mjs`, `server/tbdata.mjs`, `src/pages/GlAccounts.jsx`, `GlBalances.jsx`, `GlMapping.jsx`, `GlMappingUpload.jsx`,
    `src/pages/tb-data/*`, `src/tbdata.css`, tests; small edits to catalog, config, app, maintenance, Workbench, main, gateway test, README, `.env(.example)`
    (`SAP_TBDATA_URL`). `npm test` **44/44**, `npm run test:python` **38/38**, build OK. Live round trip `scripts/alm-tb-data-tests/app-roundtrip.ps1`
    on port 8098: **41/41** twice (`app-tb-roundtrip-run-1/2.txt`); only write = GL 0010000002 (guarded, created manual + upload, changed, deleted),
    afterwards 404 and 660 rows. Zero-balance filter sends the currency (probe per company code). Lesson L-616
  - **TRM Data (app subagent, done):** TRM Accrual Cashflow - ALM 2,3 and TRM Principal O/S - ALM 2,3 × `alm2-trm-data` / `alm3-trm-data`
    (module `trmdata`). `server/trmrepay.mjs` generalised into `trmReport(...)` (ALM 1 unchanged, checked in the browser); `TrmReport({def})`,
    10 ALM 2/3 bucket labels from Time Buckets; TPM12 warning banner + row marking on `Tpm12CaptureFailed`. New `config/trmdata-odata.json`,
    `trmdata-seed.json`, `server/trmdata.mjs`, `src/pages/TrmData.jsx`, `src/pages/trm-data/columns.js`, `tests/trmdata.test.mjs`; `.env(.example)`
    `SAP_TRMDATA_URL`. Round trip `scripts/alm-trm-data-tests/app-roundtrip.ps1` (read-only, port 8099): run 1 stopped on a script variable clash
    (`$d`/`$D`, L-604), run 2 **36/36** = all oracles. Rechecked by me: `npm test` **48/48**, `npm run test:python` **38/38**, build OK
- [ ] 6. Human: restart the ALM app on 8093 (new server modules and `.env` URLs `SAP_TBDATA_URL`, `SAP_TRMDATA_URL`)

## Open items for the human

- `/FS00/ALMTR018`: 659 of 660 rows have ALM 2 group and source swapped (L-612); `/FS00/ALMR010` finds no ALM 2 group for them. Not changed
  (not requested); the app and API allow field-by-field correction.
- `/FS00/ALMTR022` ("Save ALM2 & ALM3 TB Data") is empty and no program found writes it; the balance API does not save either (R010 doesn't).
- Extra technical fixes accepted beyond the approved list (deal repeated by `/FS00/CDS0001` counted once; filters no longer cut flows needed for
  the calculation; all security flow blocks counted) — listed in the delivery report.
- R015's TPM12 SUBMIT is an unreleased-report call (ATC prio 3), the human's decision.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_C_AlmGlAccount | DDLS (view entity, released `I_GL*`) | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_I_AlmGlBalance, ZFS_C_AlmGlBalance | DDLS (parameterised views, `I_JournalEntryItem` aggregate) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmGlMap, ZFS_C_AlmGlMapTP | DDLS + BDEF (unmanaged, projection) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMGLMAPTP | CLAS (LCL_BUFFER, LCL_MASTER, LHC_/LSC_ALMGLMAP) | ZFS_ALM_API | DS4K907106 | active |
| EZFS_T_ALMGLMAP | ENQU on /FS00/ALMTR018 | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMTBDATA / ZFS_SB_ALMTBDATA_O4_API | SRVD / SRVB (V4 Web API) | ZFS_ALM_API | DS4K907106 | active, published |
| ZFS_CE_AlmTrmAccrual / ZCL_FS_ALM_TRMACCR_QUERY | DDLS custom entity / CLAS query provider | ZFS_ALM_API | DS4K907106 | active |
| ZFS_CE_AlmTrmPrincipal / ZCL_FS_ALM_TRMPRIN_QUERY | DDLS custom entity / CLAS query provider | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMTRMDATA / ZFS_SB_ALMTRMDATA_O4_API | SRVD / SRVB (V4 Web API) | ZFS_ALM_API | DS4K907106 | active, published |

No messages created (existing `ZFS_TRM_MSG` 001–005 cover the GL mapping checks; the reports need none). No text elements.

## Delivery checks

- [x] Syntax check clean / activated, nothing left inactive
- [x] ATC: Trial Balance objects 0; R014 0; R015 1 × prio 3 "Call Executable Program RTPM_TRL_SHOW_POSITION_VALUES" (the human's SUBMIT decision)
- [x] ABAP Unit: none applicable (not requested; rule 3)
- [x] Text elements: none needed
- [x] Object list confirmed in the transport: `E071` shows all 17 objects + 2 × G4BA on `DS4K907108`

## Lessons raised

L-611, L-612, L-613, L-614, L-615, L-616

