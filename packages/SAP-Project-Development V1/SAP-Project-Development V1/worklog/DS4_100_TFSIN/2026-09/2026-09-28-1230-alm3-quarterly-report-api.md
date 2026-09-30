# ALM 3 Quarterly Report: OData Web API for /FS00/ALMR022 + ALM app Interest Rate Sensitivity Report

- **Date:** 2026-09-28
- **Started:** 12:30
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (as the ALM 2 report)
- **Transport:** `DS4K907106` / task `DS4K907108` (chosen by the human for the ALM 2 report the same morning; to confirm at the first create)
- **Requested by:** human: "paralley u can start the ALM 3 report /FS00/ALMT042 - Generate Quarterly ALM3 Report also with the subagents its similar to ALM 2 report"

## Scope

As for `/FS00/ALMR017` (`2026-09-27-2348-alm2-quarterly-report-api.md`, running in parallel): an OData V4 Web API returning what
`/FS00/ALMR022` ("Generate Quarterly ALM3 Report", tcode `/FS00/ALMT042`, TSTC) shows, with Save / Lock / Delete, and the ALM app's
ALM3: Interest Rate Sensitivity → Reports tile (placeholder "Interest Rate Sensitivity Report", to confirm) wired to it. Out of scope:
changing `/FS00/ALMR022` or `/FS00/` tables.

## Analysis

Read-only subagent; `/FS00/ALMR022` main + `_TOP` + `_F01` (1,328 lines) read in full and diffed line by line against `/FS00/ALMR017`;
copies in `evidence/2026-09-28-1230-alm3-quarterly-report-api/`. Could not read: `/FS00/ALMFM001` (HTTP 400, as before).

**Same as ALMR017:** selection screen and main; dates; `/FS00/ALMFM001` type `02` (10 ALM 2-3 buckets, XBRL X010, X20 (sic), X030…X100);
the SUBMIT set (R010 `p_as`, R014, R015, R018, R021 CP + NCD, R024) — **no feeder beyond the ALM 2 set**; CP 01–07, 64, 09, 59/60 rules;
`abs()` + unit per row; computed-row formulas; zero / interest-split filters; Save/Lock/Delete **unreachable** (PF-status callback commented)
and aimed at the ALM 1 targets (`/FS00/ALMTR014`, lock `01`).

**Different:**
- Grouping `/FS00/ALMTR003` (180 rows on TFSIN): IDs `IA:06:01:01:01:00` (6 levels, 17 chars; TFSIN uses 5), headings `IA` (liabilities /
  outflows) / `IB` (inflows), totals `IA/IB:99:99:99:99:99`; fields add `ZGRP6`, `ZNS` (non-sensitive), `ZINT_TYPE` (01 fixed / 02 floating);
  **no `ZPORTFOLIO`**. Level totals: 5 passes (6→5, 5→4, 4→3, 3→2, ZNEG subtracts); subtotals Σ `xx:yy:00:00:00:00` rows.
- **11th column B11 "Non-sensitive"** (XBRL X110; Total X120): only TB fills it (groups with `ZNS = X`); Total = B1..B11; computed rows over 11.
- TB: mapping matched on **`ZGRP_ID`** (ALM 3 group) with `ZCAL = '99'`, bucket still **`ZBU_ID`** (ALM 2), or B11 when the group has `ZNS`;
  `ZBU3_ID`/`ZSNS` unused.
- Source 11 also by **`FVAR(2) = ZINT_TYPE`** (R015 fixed/variable = reference rate blank or not; API: `FixedOrVariable`).
- NCD: only `zgrp4 = '01'` groups, **no portfolio filter** (all portfolios).
- Manual 92 from `/FS00/ALMTR030` (API: `ZFS_T_ALM3_MAN`, ALM 3 Manual Data BO).
- Computed rows `IA:99:99:99:99:99_A1` "Cumulative Outflows" Y1230, `IC` "C. Mismatch (IB-IA)" Y1770, `ID` "D. Cumulative mismatch" Y1780
  (Total = Σ cumulative, as Q6), `IE` "E. Mismatch as % of Total Outflows" Y1790, `IF` "F. Cumulative Mismatch as % of Cumulative Total Outflows" Y1800.
- ALM 3 targets exist: `/FS00/ALMTR016` "ALM3 RBI Data Save" (`ZBUC1..ZBUC10`, **`ZNS_AMT`**, `ZLOCK`, audit; **empty**), lock domain `03` = ALM3.

Groups with a source on TFSIN: 11 ×6 (10C/200 fixed + floating, 10B/200 fixed + floating, 10E fixed (ttype 200,201,202,210) + floating);
CP 01–07 ×7 (15A); NCD 13–19 ×14 (IA:06:06:01:* fixed, IA:06:06:02:* floating, 15D, no ZINT_TYPE); 64 ×1; 59, 60 ×1 each (both `ZNS = X`);
09 ×4 (IB:04:01:01 22A,22B/01; IB:04:01:07 21A/01; IB:04:02:01 22A,22B/02; IB:04:02:07 21A/02); **99 ×9** (IA:07:01/02/03/08, IA:09, IB:07/08,
IB:09:01/02). No ZNEG, no ZINT_SPLIT, no source 92. TB mapping: `ZGRP_ID` blank on all 660 rows, `ZBU3_ID` 0 (L-612 swap) → every ALM 3 TB group 0.
`/FS00/ALMTR030` 3 rows, all 11/2025; `/FS00/ALMTR012` empty.

| # | Defect | Effect |
|---|---|---|
| R1 | TB only for blank-source groups; 9 groups are coded source 99, no branch | those 9 always 0 |
| R2 | TB bucket from ALM 2 `ZBU_ID`, not `ZBU3_ID`; `ZSNS` ignored | wrong ALM 3 buckets once mapped |
| R3 | B11 only via TB for `ZNS` groups; 59/60 have `ZNS` but are provisions | B11 always 0; provisions in B1..10 |
| R4 | 09 ignores `ZPRODUCT` and `ZINT_TYPE` | each of 4 groups gets the whole R018 total (IB:04 4×) |
| R5 | NCD only `zgrp4 = '01'` (fixed), all portfolios; NCD groups carry no `ZINT_TYPE` | floating NCD groups always 0 |
| R6 | 64 all accruals (Q2) | all in IA:07:04 |
| R7 | no ALM 3 group has source 92 | manual data never shown (config) |
| R8 | level 6 mishandled (no leaf total; level-4 pass would add level-6 rows) | latent, no level-6 rows on TFSIN |
| R9 | B11 included in Total, cumulative and % rows | business question |
| R10 | config: `IB:99:99:99:99:99` named "C. Mismatch (B - A)" Y1770 but holds total inflows; `IC` also Y1770; "B. TOTAL INFLOWS" IB:14:01 an ordinary row | naming/code mismatch, as ALM 2 |
| R11 | Save/Lock/Delete unreachable, ALM 1 targets (Q7) | no ALM 3 snapshot / lock |
| R12 | Q4/Q5/Q6/Q8, R021 CP over-count, NCD capture reset | as ALM 2 |

Reuse: native R018/R021/R024 of `ZCL_FS_ALM_QTR2RPT_QUERY`, TRMPRIN/TRMACCR `get_rows`, `ZFS_I_AlmGlBalance`, `ZFS_T_ALM3_MAN`. The ALM 3 manual BO
`ZBP_FS_ALM3MANUALTP` checks lock source `01` (as ALM 2's did).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | TB groups (R1/R2) | **Fix:** blank and source-99 groups, matched on `ZGRP_ID`, bucket `ZBU3_ID`, sign from `ZTYPE3`; group `ZNS` → bucket 11 | 2026-09-28 |
| 2 | Fixed/floating for 09 and NCD (R4/R5) | **Group product list + all fixed:** 09 only into `ZINT_TYPE` 01 groups (and by product), NCD only into the fixed (`zgrp4 = 01`) groups as the report | 2026-09-28 |
| 3 | Provisions 59/60 with `ZNS` (R3) | **As the report:** buckets 1–10 | 2026-09-28 |
| 4 | Bucket 11 in totals / gap rows (R9) | **As the report:** Total = B1..B11, computed rows over 11 buckets | 2026-09-28 |

Carried over from the ALM 2 answers (same program behaviour, stated to the human): feeders as built for ALM 2 (native R018/R021/R024, TRM APIs,
`ZFS_I_AlmGlBalance`), manual from `ZFS_T_ALM3_MAN`; technical fixes (R6 accrual product filter, R8 level 6, ID/A1 total = last bucket, no dump);
Save / Lock / Delete on the ALM 3 tables `/FS00/ALMTR016` (bucket 11 → `ZNS_AMT`) and lock source `03`, the ALM 3 Manual Data BO lock check → `03`;
SaveSnapshot takes the rows from the caller (L-618); no draft; replace the placeholder tile "Interest Rate Sensitivity Report"; package `ZFS_ALM_API`,
transport `DS4K907106`.

## Naming gate

TADIR `%QTR3%`: no hits (2026-09-28). `ZBP_FS_ALM3MANUALTP` `is_locked` checks source `01` (read, confirmed).

```
NAMING: ZFS_CE_AlmQtr3Report -> matches Custom entity ZFS_CE_<Entity>
NAMING: ZFS_CE_AlmQtr3Period -> matches Custom entity ZFS_CE_<Entity>; its BDEF has the same name
NAMING: ZFS_AE_AlmQtr3Snapshot -> matches Abstract entity ZFS_AE_<Entity>
NAMING: ZCL_FS_ALM_QTR3RPT_QUERY -> matches RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY
NAMING: ZBP_FS_ALMQTR3PERIOD -> matches Behavior implementation class ZBP_FS_<Entity>
NAMING: ZFS_SD_ALMQTR3RPT -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMQTR3RPT_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API (24 chars)
NAMING: ZFS_TRM_MSG 023-028 -> exception row "Message class: ZFS_TRM_MSG"
```

## Todo

- [x] 1. Read `/FS00/ALMR022` (main + includes), its feeders and tables; diff against `/FS00/ALMR017`; sources to `evidence/2026-09-28-1230-alm3-quarterly-report-api/`
- [x] 2. Design decisions (questions 1–4; the rest carried over from ALM 2)
- [x] 2b. Reuse without copying: `ZCL_FS_ALM_QTR2RPT_QUERY` gets a public `get_items` (feeder items + incomplete sources; principal items carry
  `int_type` = `FixedOrVariable(2)`); prepared in `evidence/2026-09-27-2348-alm2-quarterly-report-api/ZCL_FS_ALM_QTR2RPT_QUERY.abap`.
  ~07:42 UTC change server: `lock` → HTTP 400 twice (healthcheck "healthy"), reads 400 / `runQuery` 500 since ~07:3x; human reconnected
  (`check MCPs now`). Pushed, active; **ALM 2 regression smoke 29/29** (`evidence/2026-09-27-2348-alm2-quarterly-report-api/smoke-run-4-after-get_items.txt`)
- [x] 3. Build, activate, ATC
  - Messages 023–028 (ALM 3 texts of 017–022) via the change server (whole XML, L-225), verified in `T100`, catalog updated
  - `adt-mcp` created `ZFS_CE_AlmQtr3Report` (11 buckets, InterestType, NonSensitive), `ZFS_CE_AlmQtr3Period`, `ZFS_AE_AlmQtr3Snapshot`,
    `ZCL_FS_ALM_QTR3RPT_QUERY`, BDEF `ZFS_CE_ALMQTR3PERIOD` (unmanaged, SaveSnapshot with parameter), `ZBP_FS_ALMQTR3PERIOD`, `ZFS_SD_ALMQTR3RPT`,
    SRVB `ZFS_SB_ALMQTR3RPT_O4_API`; sources via change server; all active on first activation. Query class reuses the ALM 2 feeders through
    `get_items`; a generic depth-based roll-up (direct children only, fixes R8); TB on `ZGRP_ID`/`ZBU3_ID`, `ZNS` → bucket 11; source 11 by
    `ZINT_TYPE`; 09 floating groups and NCD `zgrp4 <> 01` get nothing (answer 2). Behavior pool: `/FS00/ALMTR016`, `ZNS_AMT` = bucket 11, lock `03`.
    `ZBP_FS_ALM3MANUALTP` `is_locked` `01` → `03`, active
  - ATC (worklist `52540030422E1FD1AEE0485CE6BEA000`): 0 findings on all ALM 3 objects and `ZBP_FS_ALM3MANUALTP`; `ZCL_FS_ALM_QTR2RPT_QUERY`
    the known prio 3 ×2 SUBMIT (decided route)
- [x] 4. Published by `scripts/sap-gui-publish-service.py --group-id ZFS_SB_ALMQTR3RPT_O4_API --yes` (session DS4/100 FS_DEV3 confirmed):
  "New service group(s) successfully published". Smoke `scripts/alm-qtr-report-tests/smoke-alm3.ps1`:
  - run 1 23/31: 185 rows expected (subagent's "180 groups"; `/FS00/ALMTR003` has **178**, + 5 = 183: script) and every action
    "Text hidden for information disclosure"; run 2 24/31 the same. Cause (printed body): `/IWCOR/CX_OD_URI_SYNTAX_ERROR` — the script's
    level-total loop `foreach ($k in $kids)` overwrote the period key `$K` (L-604, again) → malformed action URLs (L-620)
  - run 3 **31/31** (`evidence/.../smoke-run-3.txt`), 1000/2026-09: 183 rows (computed rows last, in order), Total = Σ 11 buckets;
    **all 6 source-11 groups = the TRM principal API by product / transaction type / interest type** (10C fixed 33,978,910,000.00 /
    floating 20,850,482,968.56 = all 10C/200; 10B 254,400,000.00 / 53,230,000.00; 10E fixed (200,201,202,210) 7,307,376,577,072.58 /
    floating 510,973,904,320.00); accrual IA:07:04 = 1,177,928,347.61 = API; 09 floating groups 0, fixed 22A/22B 4,203,985,707.63, 21A
    1,436,788,050.74; NCD floating 0; bucket 11 = 0 everywhere (no TB mapping, L-612); **every source-less parent = Σ its direct children**;
    IA99/IB99 = Σ level-1 rows; IC = IB99 − IA99 over 11 buckets; ID b11 = total = Σ IC; A1 b11 = IA99; IE per bucket; month 13 → 0 rows;
    Lock refused 024; Save refused 002 (an ALM 2 group) / 003; **Save 23 rows, `/FS00/ALMTR016` read back: 23 rows, Σ ZBUC1 77,238,691,893.87,
    Σ ZNS_AMT 5,640,773,758.37 = the report**; second Save 023; Delete; period afterwards not saved / not locked. Lock not run (as ALM 2)
- [x] 5. ALM app (app subagent, not committed): tile `interest-rate-report` "Interest Rate Sensitivity Report" (ALM3 → Reports) → module
  `qtrreport`, area `alm3`, service `qtr3report` (`SAP_QTR3REPORT_URL`). `server/qtrreport.mjs` `AREAS` + `alm3` (10 Time Buckets from table
  `alm2` + bucket 11 "Non-sensitive" X110, Total XBRL X120, RowsJson from a server-side SAP re-read); new `config/qtr3report-odata.json`,
  `config/qtr3report-seed.json`, `tests/qtr3report.test.mjs`; changed `server/config.mjs`, `config/catalog.mjs`, `src/pages/QuarterlyReport.jsx`
  (ALM 3 columns Trans. Type / Int Type / Non-sensitive, ALM 3 CSV extra columns), `src/pages/quarterly-report/rules.js`, `tests/gateway.test.mjs`,
  `tests/helpers.mjs`, `.env(.example)`. `npm test` **54/54**, `npm run test:python` **38/38** (rechecked by me), build OK. Round trip
  `scripts/alm-qtr-report-tests/app-roundtrip-alm3.ps1` on 8098: run 1 16/17 — the check expected XBRL X020 for bucket 2, SAP Time Buckets
  (`/FS00/ALMTR005`) stores **`X20`** (master data, also affects ALM 2; not changed); run 2 **17/17** (`evidence/.../app-roundtrip-run-2.txt`):
  183 rows = SAP in the same order, IA99 total = SAP, PERCENT rows IE/IF, Bucket11/Total/InterestType/NonSensitive/TransactionType = SAP on
  every row, Save 23 rows, second Save 023, Delete, unknown action refused; 8098 stopped; period not saved / not locked. Lock not called.
  Not checked visually in a browser
- [ ] 6. **Human: restart the ALM app on 8093** (new server code for the ALM 2 and ALM 3 areas; until then the new tiles show ALM 1 data)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CE_AlmQtr3Report | DDLS (custom entity, 3 parameters, 11 buckets) | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_CE_AlmQtr3Period | DDLS (root custom entity) + BDEF (unmanaged, 3 actions) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_AE_AlmQtr3Snapshot | DDLS (abstract entity, SaveSnapshot parameter) | ZFS_ALM_API | DS4K907106 | active |
| ZCL_FS_ALM_QTR3RPT_QUERY | CLAS (query provider of both) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMQTR3PERIOD | CLAS (behavior pool) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMQTR3RPT | SRVD | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMQTR3RPT_O4_API | SRVB (OData V4 Web API) + G4BA | ZFS_ALM_API | DS4K907106 | active, published |
| ZCL_FS_ALM_QTR2RPT_QUERY | CLAS (changed: public `get_items`, item `int_type`) | ZFS_ALM_API | DS4K907106 | active; ALM 2 regression 29/29 |
| ZBP_FS_ALM3MANUALTP | CLAS (changed: ALM 3 lock check `01` → `03`) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_TRM_MSG 023–028 | MSAG | ZFS_ALM_API | DS4K907106 | on system |

## Open items for the human

- Lock not tested live (writes `/FS00/ALMTR012` source 03, no API removes it). `/FS00/ALMP003` (SAP GUI) still checks lock `01` for ALM 3 manual data.
- TFSIN data: TB mapping has no ALM 3 group / bucket on any row (L-612) → TB groups and bucket 11 are 0; CP/NCD/provisions 0 as for ALM 2 (L-617);
  no ALM 3 group has source 92, so manual data never shows (R7, config).
- Config as the report (R10): `IB:99:99:99:99:99` is named "C. Mismatch (B - A)" (Y1770) but holds total inflows; the computed `IC` also carries Y1770.
- `/FS00/ALMTR005` bucket 2 XBRL code is `X20` (all others X0n0) — master data, used by the ALM 2 and ALM 3 reports and Time Buckets.
- Investments (09) and NCD are shown only in fixed-rate groups (answer 2) — no fixed/floating attribute exists for them.

## Delivery checks

- [x] Syntax check clean / activated, nothing left inactive
- [x] ATC: no priority 1/2 (0 findings on ALM 3 objects)
- [x] ABAP Unit: none applicable (not requested; rule 3)
- [x] Text elements: none needed
- [x] Object list confirmed in the transport: `E071` shows the 9 ALM 3 objects + G4BA + `ZBP_FS_ALM3MANUALTP` on `DS4K907108`

## Lessons raised

L-620

