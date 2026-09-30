# ALM 2 Quarterly Report: OData Web API for /FS00/ALMR017 + ALM app Structural Liquidity Report

- **Date:** 2026-09-27
- **Started:** 23:48
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (as the other ALM APIs, to confirm)
- **Transport:** `DS4K907106` / task `DS4K907108` (as the other ALM APIs, to confirm)
- **Requested by:** human: "Start this tcode /FS00/ALMT036 - Generate Quarterly ALM2 Report for ALM2 with ODATA API and linked this app in to structural liquidity app"

## Scope

As for `/FS00/ALMR008` (`2026-09-27-1619-alm1-quarterly-report-api.md`): an OData V4 Web API returning what `/FS00/ALMR017`
("Generate Quarterly ALM2 Report", tcode `/FS00/ALMT036`, TSTC) shows, and the ALM app's ALM2: Structural Liquidity →
Reports → **Structural Liquidity Report** tile (placeholder until now) wired to it. Out of scope: changing `/FS00/ALMR017` or `/FS00/` tables.

## Analysis

`/FS00/ALMR017` = main + `_TOP` + `_F01` (1,339 lines), read in full; copies in `evidence/2026-09-27-2348-alm2-quarterly-report-api/`.
Header comments still say `/FS00/ALMR008` — it is a copy of the ALM 1 report.

Selection: company code, month (N2), year (N4), unit radio (crore / lakh / thousand / INR default), `P_CHECK` show zero rows,
`P_ISPLIT` hide interest-split rows, layout. Dates: `gv_date` = month end, `gv_sdate` = +1 (key date); buckets `/FS00/ALMFM001`
type `02` on the key date (10 buckets, `/FS00/ALMTR005`). Rows: every `/FS00/ALMTR002` group + XBRL header row `A` (ctot `X110`).

Per group, by `ZSRC` (TFSIN: 151 heading groups without a source, 34 with one):

| Source | TFSIN groups | Amounts in `/FS00/ALMR017` |
|---|---|---|
| blank | 151 | TB: `/FS00/ALMTR018` rows with `ZGR_ID` = group and `ZCAL = '99'` → balance from `SUBMIT /FS00/ALMR010` (`p_as`), sign −1 if `ZTYPE3 = '02'`, into bucket `ZBU_ID`; group gets `zsrc = 99`. **TFSIN: only 1 of 660 mapping rows has `ZCAL = 99`** (L-612 swap) |
| 01–06 (07) | 6 (SA:06:09:0x, product 15A) | CP BENPOS: `SUBMIT /FS00/ALMR021 rb_cp`, `os_amt` of rows with `source` = group source into bucket `bkt_no` |
| 13–19 | 14 (SA:06:10:01:0x portfolio 1000, SA:06:10:02:0x portfolio 2000) | NCD BENPOS: `SUBMIT /FS00/ALMR021 rb_ncd`, only if `zgrp4 = '01'`, only `portfolio = '1000'` hard-coded (`IN rt_rportb` commented out) |
| 11 | 4 (10C, 10B, 10E + ttype 200/201/202, 10E + 210) | TRM principal O/S: `SUBMIT /FS00/ALMR015`, rows with product in `ZPRODUCT` and txn type in `ZTTYPE` (if any), B01..B10 |
| 64 | 1 (SA:07:04 interest payable) | TRM accrual: `SUBMIT /FS00/ALMR014`, **all** rows (`WHERE sgsart IN rt_prd` commented out), `tot` into bucket `buck` |
| 09 | 1 (SB:04:02:01 products 20A,21A,22A,22B) | TRM investment principal: `SUBMIT /FS00/ALMR018`, **all** rows B_01..B_10 (product list ignored) |
| 59 / 60 | 2 + 2 | Provisions: `SUBMIT /FS00/ALMR024` → `/FS00/ALMTR028` shape, `ZBUC1..10` where `zsrc` = group source |
| 92 | 2 (SB:11:01, SB:11:02) | Manual: `/FS00/ALMTR017` (company/month/year, `ZCODE` = group), `ZBUC1..10` |

Then: every bucket `abs()` then ÷ unit **per row before the totals**; level totals 4th ← 5th, 3rd ← 4th, 1st ← 3rd (`ZNEG` subtracts);
`SA/SB:99:99:99:99` = Σ `xx:yy:00:00:00` rows of SA / SB; `SA:99:99:99:99_A1` cumulative outflows (Y1260); `SC` = SB − SA (Y1820);
`SD` cumulative SC (Y1830, **Total = Σ of the cumulative values**); `SE` = SC / SA × 100 per bucket (0 when SA ≤ 0; Total = (SB−SA)/SA rounded
4 dp × 100) (Y1840); `SF` = SD / cumulative SA × 100 (Y1850, no Total). Zero rows hidden unless `P_CHECK` (coloured rows stay);
`P_ISPLIT` hides interest-split rows. Hotspot drills to R021/R015/R014/R018/R010/R023.

Save / Lock / Delete in `USER_COMMAND`: **unreachable** (`i_callback_pf_status_set` commented out, so no buttons), and a verbatim ALM 1
copy: writes `/FS00/ALMTR014` (ALM **1** snapshot, buckets 1–5 only) and lock `/FS00/ALMTR012` source `01` (the ALM 1 lock). TFSIN has
`/FS00/ALMTR015` "ALM2 RBI Data Save" (key company/month/year/date/group, `ZBUC1..ZBUC8`, `BUC9`, `BUC10`, `ZLOCK`, 6 audit fields; **empty**) and
lock domain `/FS00/ALMDM0006` `02` = ALM2. Auth objects `ZFS_ALM_*` do not exist on TFSIN (as for ALM 1).

Defects spotted (technical unless marked):

| # | Defect | Effect |
|---|---|---|
| Q1 | NCD: portfolio `'1000'` hard-coded and only `zgrp4 = '01'` | the 7 portfolio-2000 groups (SA:06:10:02:0x) are always 0 |
| Q2 | source 64: product filter commented out | every accrual (also on assets) lands in "interest payable" |
| Q3 | source 09: `ZPRODUCT` list ignored; `<fs_pinv>` unassigned if R018 returns nothing → dump | all investments in the one group; possible short dump |
| Q4 | `abs()` per row before level totals (business rule?) | a negative leaf is added, not netted; `ZNEG` still subtracts |
| Q5 | unit division per row before summing | rounding differences in totals (API returns INR, app scales — as ALM 1) |
| Q6 | SD Total = Σ cumulative values | meaningless total (ALM 1 API: last cumulative value) |
| Q7 | Save/Lock/Delete unreachable, and target ALM 1 table/lock | no ALM 2 snapshot or lock at all today |
| Q8 | TB via `/FS00/ALMR010` inherits its defects (first row per GL, no ledger) and the L-612 mapping swap | TB groups almost all 0 on TFSIN |

Existing APIs this can reuse: TB balances `ZFS_C_AlmGlBalance` (R010 fixed), `ZCL_FS_ALM_TRMPRIN_QUERY` (R015), `ZCL_FS_ALM_TRMACCR_QUERY` (R014),
`ZFS_T_ALM2_MAN` (ALM 2 manual data API — written by the app instead of `/FS00/ALMTR017`). No API yet for R021, R018, R024 (subagent reading them).

### Feeders R021 / R018 / R024 (read-only subagent, sources in evidence `almr021_*`, `almr018_*`, `almr024_*`, read in full)

- **R021 (CP + NCD BENPOS, 550 lines):** investor holdings from `ZTRM_T0008` (CP) / `ZTRM_T0009` (NCD) ⋈ `/FS00/CDS0004`, BP group `BP3010` type 801,
  segment `/FS00/ALMTR029`, source = `/FS00/ALMTR008` `ZEXL_SRC = '<grp>-<segment>'`. CP amount = `abs(amaqu_val_pc)` from `RTPM_TRL_SHOW_POSITION_VALUES`
  (full position on **every** investor row, not pro-rated), bucket by maturity. NCD = amortised O/S (FL04 + premium via `/FSPL/TRM_R0214`, FL31/51/52) ×
  investor share, bucket by first FL04. Defects: CP over-count per investor; NCD capture reset (`set( display = true )`); duplicate `/FS00/ALMTR029` keys
  003/004; several sources unreachable by mapping; first FL04 only. **TFSIN: CP table empty; NCD `ZBP_INV` blank on all rows → sources 13–19 = 0.**
  Native rebuild medium–large; SUBMIT + capture small (needs the capture re-set).
- **R018 (investments, source 09, 391 lines):** products `/FS00/ALMTR026` `ZPRINC_ALM2` (20A, 21A, 22A, 22B, 11C, 04J, 04H), amounts from
  `RTPM_TRL_SHOW_POSITION_VALUES` (area 001, month end): 20A market value (else book value) bucketed on deal end `DELFZ`; 21A (MF) in bucket 1;
  22A/22B book/market by valuation class, on class end date; 11C/04J/04H no branch → 0. Date-based buckets, signs as delivered. Defects: ranges
  applied after copy (no effect), market-currency/position-currency mix, obsolete `WITH KEY` form, `LEAVE LIST-PROCESSING` when empty.
  **TFSIN: 20A/21A positions likely.** Native rebuild medium (around the proven RTPM SUBMIT, L-615).
- **R024 (provisions, 59/60, 893 lines, ALM 2 path ≈ 60):** `/FS00/ALMTR028` rows by company/month/year: 59 = rows 52 + 58 + `/FS00/ALMTR027` GL
  0010501020; 60 = rows 51 + 57 + GLs 0010501022/26/27; `abs()` after netting. Writes only on an interactive popup (not used by ALM 2).
  **TFSIN: data only for 1000/11/2025.** Native rebuild small.

**Only sources 09, 11, 64, 92 (and TB, if mapped) can show amounts for 1000/09/2026 on TFSIN** (L-617).

ALM 2 manual data BO (`ZBP_FS_ALM2MANUALTP` `is_locked`) checks lock source **`01`** (as `/FS00/ALMP003`), so an ALM 2 lock written with
source `02` would not freeze ALM 2 manual entry unless that check changes.

~00:2x: `abap-adt-ds4-100-tfsin` answers 400 on `getObjectSource` of `ZCL_FS_ALM_QTRRPT_QUERY` and 500 on `runQuery` (healthcheck "healthy").

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Feeders without an API (R021, R018, R024) | **Mixed:** R024 native, R018 native around the RTPM SUBMIT, R021 SUBMIT + capture (defects kept, listed) | 2026-09-28 |
| 2 | Save / Lock / Delete | **ALM 2 tables:** snapshot `/FS00/ALMTR015`, lock `/FS00/ALMTR012` source `02`, ALM 1 API rules; ALM 2 Manual Data BO lock check `01` → `02`; **no draft** | 2026-09-28 |
| 3 | `/FS00/ALMR017` defects | **Fix technical** Q1 (group `ZPORTFOLIO`), Q2/Q3 (group `ZPRODUCT`), Q6 (SD total = last cumulative), no-data dump; keep `abs()` per row (Q4) | 2026-09-28 |
| 4 | App placement | **Replace the placeholder** "Structural Liquidity Report" tile (ALM2 → Reports) | 2026-09-28 |
| 5 | R021 NCD cannot be captured: `get_amort_logs` ends with `cl_salv_bs_runtime_info=>set( display = abap_true )`, so R021's own `REUSE_ALV_GRID_DISPLAY_LVC` really displays inside the OData call (CP path unaffected) | **Both native** (CP and NCD rebuilt in the query class; supersedes the R021 part of answer 1) | 2026-09-28 |
| 6 | SaveSnapshot cannot build the report inside the RAP action (SUBMIT forbidden, L-618) | **App sends the snapshot**: action parameter (abstract entity, rows as a JSON string); SAP checks period, save-once, known group IDs, stores the rows as sent | 2026-09-28 |

## Design

**Report** (read-only): custom entity `ZFS_CE_AlmQtr2Report(P_CompanyCode, P_FiscalYear, P_FiscalPeriod)`, query provider
`ZCL_FS_ALM_QTR2RPT_QUERY`. One row per `/FS00/ALMTR002` group plus the report's computed rows `SA:99:99:99:99_A1` (cumulative outflows,
Y1260), `SC` (mismatch SB−SA, Y1820), `SD` (cumulative mismatch, Y1830), `SE` (mismatch % of outflows, Y1840) and `SF` (cumulative mismatch %,
Y1850). No XBRL header row (the app takes bucket XBRL codes from Time Buckets, as ALM 1). Elements: GroupId (key), GroupName, Source, XbrlCode,
Product, TransactionType, Portfolio, InterestSplit, Negative, RowStyle (`HEADING` SA/SB, `SUBTOTAL` xx:99:99:99:99, `LEVEL1` xx:yy:00:00:00,
`CUMULATIVE` A1/SD, `MISMATCH` SC, `PERCENT` SE/SF), SourceIncomplete (a captured feeder failed), Bucket1..10, Total. INR; zero and
interest-split rows returned, hidden by app toggles (the report's `P_CHECK`/`P_ISPLIT`).

Per group, by source (report rules; decided fixes marked ✱):
- blank: TB, `/FS00/ALMTR018` rows `ZGR_ID` = group, `ZCAL = '99'`, balance from `ZFS_I_AlmGlBalance` (company, month end) into bucket `ZBU_ID`,
  −1 if `ZTYPE3 = '02'`; Source shown as `99` when a mapped account was found (as the report)
- 01–07 CP ✱native: `/FS00/CDS0004` 15A ⋈ `ZTRM_T0008` (latest record ≤ month end per ISIN + investor), group `BP3010` type 801, segment
  `/FS00/ALMTR029`, source `/FS00/ALMTR008` `ZEXL_SRC = '<grp>-<seg>'`, `ZGRP_CD = 'A4'`; amount |amortised acquisition value| of the security from
  `RTPM_TRL_SHOW_POSITION_VALUES` (area 001, month end), ✱summed over all position rows and pro-rated by the investor's units (R021 put the whole
  position on every investor); bucket = first whose day range holds maturity − month end
- 13–19 NCD ✱native: `ZTRM_T0009` as CP with `ZGRP_CD = 'A3'`; share = face value × units / Σ FL04+FL36 (area 002); O/S = premium path
  (`DBT_A053` − (Σ R0214 rev − Σ R0214 amt SE1200/blank − amort002)) if an FL36 exists, + first FL04, − FL31/51/52 signed flows ≤ month end;
  × share; bucket by first FL04 date; portfolio of the first FL01. `/FSPL/TRM_R0214` captured by the query class itself (fail soft). Group rows:
  source = group source ✱and portfolio in the group's `ZPORTFOLIO` (report: `'1000'` hard-coded and only `zgrp4 = '01'`)
- 11: `ZCL_FS_ALM_TRMPRIN_QUERY` rows (new public `get_rows`), product in `ZPRODUCT`, transaction type in `ZTTYPE` (if any)
- 64: `ZCL_FS_ALM_TRMACCR_QUERY` rows (new public `get_rows`), ✱product in `ZPRODUCT` (all if blank)
- 09 ✱native R018: products `/FS00/ALMTR026` `ZPRINC_ALM2` ✱of the company code; positions from the same RTPM capture (deals + securities):
  20A market value else book value on deal end `DELFZ`; 21A same, bucket 1 (month end + 1); 22A/22B book value if no market value or valuation
  class 0005, on class end date; others 0; ✱one bucket per amount (date range, lower bucket on overlap); group rows ✱product in `ZPRODUCT`
- 59/60 ✱native R024: `/FS00/ALMTR028` of the period (none → 0): 59 = sources 52 + 58 + `/FS00/ALMTR027` GL 0010501020; 60 = 51 + 57 + GLs
  0010501022/26/27; |bucket|
- 92: `ZFS_T_ALM2_MAN` of the period (ALM 2 Manual Data API)

Then |bucket| per row (Q4 kept), level totals 4th ← 5th, 3rd ← 4th, 1st ← 3rd with `ZNEG`, `xx:99:99:99:99` = Σ `xx:yy:00:00:00` of SA / SB,
A1 cumulative of SA99 (✱Total = bucket 10), SC = SB99 − SA99, SD cumulative SC (✱Total = bucket 10, Q6), SE = SC/SA99 × 100 (0 when SA99 ≤ 0;
Total = round((SB−SA)/SA, 4) × 100), SF = SD/A1 × 100 (0 when A1 ≤ 0; Total 0). ✱No dump when a feeder returns nothing.

**Period status + actions**: root custom entity `ZFS_CE_AlmQtr2Period` (CompanyCode, FiscalYear, FiscalPeriod: KeyDate, Saved, SavedRows,
SavedBy, SavedOn, Locked, LockedBy, LockedOn), unmanaged BDEF, behavior pool `ZBP_FS_ALMQTR2PERIOD`, actions `SaveSnapshot`, `LockPeriod`,
`DeleteSnapshot`, as ALM 1 but on **`/FS00/ALMTR015`** (buckets `ZBUC1..ZBUC8`, `BUC9`, `BUC10`) and lock source **`02`**; auth `ZFS_ALM_S1/L1/D1`
(the report's objects) checked only if defined. Messages 017–022 (ALM 2 texts of 011–016), 008/010/004/005 reused. `ZBP_FS_ALM2MANUALTP`
`is_locked`: source `01` → `02`. Service `ZFS_SD_ALMQTR2RPT` (`QuarterlyReport`, `QuarterlyPeriod`), binding `ZFS_SB_ALMQTR2RPT_O4_API`. No draft.

## Naming gate

TADIR `%ALMQTR2%`: no hits (2026-09-28).

```
NAMING: ZFS_CE_AlmQtr2Report -> matches Custom entity ZFS_CE_<Entity>
NAMING: ZFS_CE_AlmQtr2Period -> matches Custom entity ZFS_CE_<Entity>; its BDEF has the same name (Behavior definition = root view)
NAMING: ZCL_FS_ALM_QTR2RPT_QUERY -> matches RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY
NAMING: ZBP_FS_ALMQTR2PERIOD -> matches Behavior implementation class ZBP_FS_<Entity>
NAMING: ZFS_SD_ALMQTR2RPT -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMQTR2RPT_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API (24 chars)
NAMING: ZFS_TRM_MSG 017-022 -> exception row "Message class: ZFS_TRM_MSG"
NAMING: ZFS_AE_AlmQtr2Snapshot -> matches Abstract entity ZFS_AE_<Entity> (SaveSnapshot parameter, answer 6; TADIR ZFS_AE_ALMQTR%: no hits)
```

## Todo

- [x] 1. Read `/FS00/ALMR017` (main + includes) and the tables it reads/writes; sources to `evidence/2026-09-27-2348-alm2-quarterly-report-api/`
  (feeders R021/R018/R024 by a read-only subagent)
- [x] 2. Design decisions from the human (questions 1–5; transport `DS4K907106` chosen from `abap_transport-get`)
- [ ] 3. Build (messages, custom entities, query class, behavior pool, SRVD, SRVB), activate, ATC
  - [x] 3a. Messages 017–022 (change server, whole `mc:messageClass` XML, L-225), verified in `T100`, catalog updated
    (017 already saved, 018 not saved, 019/020/021 no auth save/lock/delete, 022 no amounts)
  - [x] 3b. `ZCL_FS_ALM_TRMPRIN_QUERY` (`tt_result` public) and `ZCL_FS_ALM_TRMACCR_QUERY`: public `get_rows` (no behaviour change), active
  - [x] 3c. `adt-mcp` created `ZFS_CE_AlmQtr2Report`, `ZFS_CE_AlmQtr2Period` (DDLS), `ZCL_FS_ALM_QTR2RPT_QUERY`, BDEF `ZFS_CE_ALMQTR2PERIOD`
    (unmanaged), `ZBP_FS_ALMQTR2PERIOD`; sources through the change server; all active, first activation without messages.
    Human mid-build: "use ur optimization skills for ABAP" (standing L-611): before the push the query class got one item table with
    sorted secondary keys (by source, by group — TB and manual pre-aggregated, no per-group scan), a single forward pass per level
    for the level totals instead of three O(n²) nested loops, sorted keys on positions and the amortisation log, 20A/22x master reads
    restricted to the captured positions, explicit field list on `/FS00/ALMTR002`; review fix before the push: the list range was typed
    C3 (portfolio `1000` would have been cut to `100`), now C20. Source copy `evidence/.../ZCL_FS_ALM_QTR2RPT_QUERY.abap`
  - [x] 3d. `ZBP_FS_ALM2MANUALTP` `is_locked` `01` → `02`: first `setObjectSource` failed `connect ETIMEDOUT 10.110.0.33:44300` (~06:37 UTC,
    not written, checked), retry with the same lock handle OK, active
  - [x] 3e. `adt-mcp` created `ZFS_SD_ALMQTR2RPT` (source via change server: `QuarterlyReport`, `QuarterlyPeriod`) and SRVB
    `ZFS_SB_ALMQTR2RPT_O4_API` (OData V4 Web API; left inactive by the create, activated). `inactiveObjects` empty afterwards
  - [x] 3f. ATC (default variant, worklist `52540030422E1FD1AEDED89C335EC000`): 0 findings on `ZBP_FS_ALMQTR2PERIOD`, BDEF, `ZBP_FS_ALM2MANUALTP`,
    `ZCL_FS_ALM_TRMACCR_QUERY`; prio 3 "Critical Statements 0005 – Call Executable Program" ×2 on `ZCL_FS_ALM_QTR2RPT_QUERY`
    (`RTPM_TRL_SHOW_POSITION_VALUES`, `/FSPL/TRM_R0214`) and the existing ×1 on `ZCL_FS_ALM_TRMPRIN_QUERY` — the capture route decided
    (answers 1/5, as R015 L-615). No prio 1/2
- [ ] 4. Publish (script), smoke test
  - SAP GUI was on the logon screen (`SAPMSYST` 500, L-213); human logged on ("SAP gui is logged on"), session DS4/100 FS_DEV3 confirmed.
    `scripts/sap-gui-publish-service.py --group-id ZFS_SB_ALMQTR2RPT_O4_API --yes` → "New service group(s) successfully published", `ok: true`
  - Smoke `scripts/alm-qtr-report-tests/smoke-alm2.ps1` run 1 **21/25** (`evidence/.../smoke-run-1.txt`), 1000/2026-09:
    report 188 rows in 6 s (the script expected 190; `/FS00/ALMTR002` has 183 groups (151 + 32), + 5 computed = 188: script error);
    Total = Σ 10 buckets on every row; temporary manual amount SB:11:01:00:00 b3 4,321.25 shown (ZFS_T_ALM2_MAN) and removed;
    **all 4 source-11 groups and the source-64 group = the TRM Data API bucket by bucket** (10C 55,563,692,968.56; 10B 307,630,000.00;
    10E/200-202 7,801,319,764,217.58; 10E/210 17,030,717,175.00; accrual 1,177,928,347.61); SA99/SB99 = Σ level-1 rows; SC = SB99 − SA99;
    SD b10 = total = Σ SC; A1 b10 = SA99 total; SE per bucket; source 09 SB:04:02:01:00 = 9,846,749,504.85; 59/60 = 0 (no provisions for
    the period); TB groups with source 99 = 0 (L-612); SourceIncomplete = 0; month 13 → 0 rows; Lock refused while not saved (018);
    second Delete refused (018); period afterwards not saved / not locked.
    **Save → HTTP 500, dump `BEHAVIOR_ILLEGAL_STATEMENT`**: SUBMIT inside the RAP action (L-618). Open question 6
  - Answer 6 → `adt-mcp` created abstract entity `ZFS_AE_AlmQtr2Snapshot` (`RowsJson : abap.string`; first label 41 chars → warning, shortened);
    BDEF `action SaveSnapshot parameter ZFS_AE_AlmQtr2Snapshot`; behavior pool: `snapshot_rows` parses with `/ui2/cl_json`, empty/unparsable
    → 003 (`RowsJson`), duplicate group → 001, unknown group → 002 (ALM 2 groups + the 5 computed row IDs), group names taken from
    `/FS00/ALMTR002`, rows with Total ≠ 0 stored. Activated; ATC 0 findings (worklist `52540030422E1FD1AEDF1E298754A000`)
  - Smoke run 2 22/25: the script's row JSON was malformed (PowerShell `,` binds tighter than `+`, L-619) and a Python escape turned ``
    into a bell character in a path — both script errors. Run 3 **29/29** (`evidence/.../smoke-run-3.txt`): everything of run 1 plus
    refusals 003/002/001, **Save 19 rows = rows with a total, `/FS00/ALMTR015` read back: 19 rows, Σ bucket 1 43,089,589,329.77 and
    Σ bucket 10 10,446,753,726.10 = the report**, second Save 017, Delete, second Delete 018; period afterwards not saved / not locked,
    temporary manual amount removed
  - **Not run: LockPeriod on a saved period** (writes `/FS00/ALMTR012` source 02, nothing in the API removes it) — needs the human's choice
    of period. Not compared against `/FS00/ALMT036` in SAP GUI: R021's NCD path would open its own ALV inside the run (L-617); the source
    11/64 groups equal the TRM Data APIs, which were proved against `/FS00/ALMT034` (L-615)
- [ ] 4. Publish (script), smoke test
- [x] 5. ALM app (`D:\SAP Tool\SAP - ALM Application`, app subagent, not committed): tile `structural-liquidity-report` (ALM2 → Reports,
  title "Structural Liquidity Report") → module `qtrreport`, area `alm2`, service `qtr2report` (`SAP_QTR2REPORT_URL` in `.env`).
  `server/qtrreport.mjs` generalised into one area-parameterised core (`AREAS`: alm1 7 buckets / alm2 10 buckets from Time Buckets, `sendRows`);
  **ALM 2 Save re-reads the report from SAP server-side and sends it as `RowsJson`** — browser rows ignored (test with an injected row).
  New `config/qtr2report-odata.json`, `config/qtr2report-seed.json`, `tests/qtr2report.test.mjs`; changed `server/app.mjs` (`?area=`),
  `server/config.mjs`, `config/catalog.mjs`, `src/main.jsx`, `src/pages/QuarterlyReport.jsx` (per-area texts, SourceIncomplete banner/tag),
  `src/pages/quarterly-report/rules.js`, `tests/helpers.mjs`, `tests/gateway.test.mjs`, `.env(.example)`; also `src/pages/Settings.jsx`
  (Service Mappings derive the contract from `app.service`, else the ALM 2 tile showed the ALM 1 variable; also corrects the GL tiles' labels).
  `npm test` **51/51**, `npm run test:python` **38/38** (rechecked by me), build OK. Live round trip
  `scripts/alm-qtr-report-tests/app-roundtrip-alm2.ps1` on temporary port 8098 run 1 **15/15** (`evidence/.../app-roundtrip-run-1.txt`):
  odata mode, 10 buckets X010…X100, key/snapshot dates, 188 rows = SAP in the same order, SA99 total = SAP, PERCENT rows SE/SF,
  Save 17 rows (= rows with a total without the smoke test's temporary manual amount), second Save refused 017, Delete, unknown action
  refused; 8098 stopped; period afterwards not saved / not locked. Lock not called. Not checked visually in a browser;
  CSV has the ALM 1 columns (TransactionType / Portfolio / SourceIncomplete not exported)
- [ ] 6. **Human: restart the ALM app on 8093** — `npm run build` replaced `dist`: until the restart, 8093 serves the new page with the old
  server, which ignores `area`, so the ALM 2 tile would show (and Save/Delete) the ALM 1 period

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CE_AlmQtr2Report | DDLS (custom entity, 3 parameters, 10 buckets) | ZFS_ALM_API | DS4K907106 (task DS4K907108) | active |
| ZFS_CE_AlmQtr2Period | DDLS (root custom entity) + BDEF (unmanaged, 3 actions) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_AE_AlmQtr2Snapshot | DDLS (abstract entity, SaveSnapshot parameter `RowsJson`) | ZFS_ALM_API | DS4K907106 | active |
| ZCL_FS_ALM_QTR2RPT_QUERY | CLAS (query provider of both; R018/R021/R024 rebuilt; public `get_items` added 2026-09-28 for the ALM 3 report, `2026-09-28-1230-alm3-quarterly-report-api.md`) | ZFS_ALM_API | DS4K907106 | active; regression smoke 29/29 after the change |
| ZBP_FS_ALMQTR2PERIOD | CLAS (behavior pool) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMQTR2RPT | SRVD | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMQTR2RPT_O4_API | SRVB (OData V4 Web API) + G4BA | ZFS_ALM_API | DS4K907106 | active, published |
| ZCL_FS_ALM_TRMPRIN_QUERY | CLAS (changed: public `tt_result` + `get_rows`) | ZFS_ALM_API | DS4K907106 | active |
| ZCL_FS_ALM_TRMACCR_QUERY | CLAS (changed: public `get_rows`) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALM2MANUALTP | CLAS (changed: ALM 2 lock check source `01` → `02`) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_TRM_MSG 017–022 | MSAG | ZFS_ALM_API | DS4K907106 (tasks DS4K907107/08) | on system |

## Open items for the human

- **Lock not tested live** on a saved period: it writes `/FS00/ALMTR012` source 02, which no API removes — choose a period if it should be proved.
- The ALM 2 lock is now source `02`; `/FS00/ALMP003` (SAP GUI ALM 2/3 manual data) still checks source `01`, so the SAP transaction is not frozen
  by an ALM 2 lock from the API (and the API's ALM 2 manual data no longer by an ALM 1 lock).
- Save stores the rows the caller sends (answer 6): SAP checks group IDs and the period rules, not the amounts. The ALM app re-reads the report from SAP
  server-side at save time rather than taking rows from the browser.
- `/FS00/ALMTR002`: `SA:99:99:99:99` is named "A1. Cumulative Outflows" (Y1260) but, as in `/FS00/ALMR017`, holds the non-cumulative total outflows,
  while "A. TOTAL OUTFLOWS" `SA:99:99:99:00` (Y1250) stays 0; the report's own cumulative row `SA:99:99:99:99_A1` repeats Y1260. Kept as the report
  does (report-format data vs. code; not changed).
- Sources that are 0 for 1000/2026-09 on TFSIN because of data, not code (L-617): CP 01–07 (`ZTRM_T0008` empty), NCD 13–19 (`ZBP_INV` blank), 59/60
  (provisions only for 11/2025), TB groups (L-612 mapping swap; `ZCAL = 99` on 1 row). The CP/NCD/provision code paths are therefore **unproven live**.
- Defaults I took, stated here: CP position shared among investors by units (1/n when no units); an ISIN's investor with several `/FS00/ALMTR029` segments
  takes the first that has a source; R021 ignores `ZDEL` on the BENPOS tables and so does the API (not changed, business?).
- ATC prio 3 ×2 "Call Executable Program" (RTPM, R0214) on the query class — the capture route decided.

## Delivery checks

- [x] Syntax check clean / activated, nothing left inactive (`inactiveObjects` empty)
- [x] ATC: no priority 1/2; prio 3 ×2 SUBMIT on the query class (decided route)
- [x] ABAP Unit: none applicable (not requested; rule 3)
- [x] Text elements: none needed (row names of the computed rows are report labels in constants, `##NO_TEXT`)
- [x] Object list confirmed in the transport: `E071` shows all 10 new/changed R3TR objects + G4BA on `DS4K907108`, MSAG on `DS4K907107/08`

## Lessons raised

L-617, L-618, L-619

