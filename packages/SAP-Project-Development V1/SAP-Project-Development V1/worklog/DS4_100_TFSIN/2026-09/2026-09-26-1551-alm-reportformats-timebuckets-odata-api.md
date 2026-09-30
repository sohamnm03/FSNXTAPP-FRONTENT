# ALM Report Formats + Time Buckets OData APIs from /FS00/ALMR028 and /FS00/ALMR027

- **Date:** 2026-09-26
- **Started:** 15:51
- **System:** DS4_100_TFSIN
- **Package:** `ZFS_ALM_API` (same as the Data Sources API)
- **Transport:** `DS4K907106` (same as the Data Sources API)
- **Requested by:** saumya.s. Brief: "understand the program /FS00/ALMR028 - Report format and /FS00/ALMR027 -
  time buckets same way how u did for the above same thing needs to be done"

## Scope

Same as `2026-09-26-0000-alm-datasources-odata-api.md`: analyse both HTML-workbench programs, build a CRUD
OData V4 Web API per program on the same `/FS00/` tables, test it live, and switch the ALM app's
Report Formats and Time Buckets pages to it. Out of scope: changing the programs or `/FS00/` tables.

## Program analysis

### /FS00/ALMR028 — Report Formats (SMW0 page `/FS00/REPORTFORMATS`)

| Tab | Table | Key | Fields | Program rules |
|---|---|---|---|---|
| ALM 1 grouping | `/FS00/ALMTR001` | ZGRP_ID C20 | ZGRP1..5 C2, ZGRP_NAME C100, ZSRC C2 (+ZSRC_DESC/ZGRP_CD/ZGRP_DESC derived from ALMTR008), ZXBRL C10, ZS_TYPE C2, ZS_DESC C80 (free text), ZPRODUCT C100, ZINT_SPL/ZNEG flags | create needs Grp1. ID = non-blank parts joined with `:`. MODIFY (= upsert!). Update by ID (all non-key fields). Delete by ID |
| ALM 2 grouping | `/FS00/ALMTR002` | ZGRP_ID C20 | ZGRP1..5, ZGRP_NAME, ZXBRL, ZSRC (+ZSRC_DESC), ZPRODUCT C100, ZTTYPE C100, ZPORTFOLIO C100, ZINT_SPLIT/ZNEG | Grp1 + name required, source must exist in ALMTR008 if given. ID = Grp1 alone, else `g1:g2:g3:g4:g5`. Create = MODIFY keeping the old created-stamp |
| ALM 3 grouping | `/FS00/ALMTR003` | ZGRP_ID C20 | ZGRP1..6, ZGRP_NAME, ZXBRL, ZNS flag, ZSRC (+desc), ZINT_TYPE (domain `/FS00/ALMDM0002`: 01 Fixed / 02 Floating), ZINT_SPLIT, ZPRODUCT, ZNEG, ZTTYPE | as ALM 2 with six parts |

### /FS00/ALMR027 — Time Buckets (SMW0 page `/FS00/TIMEBUCKETS`)

| Tab | Table | Key | Fields | Program rules |
|---|---|---|---|---|
| ALM 1 buckets | `/FS00/ALMTR004` | ZBUC NUMC2 | ZDESC C40, ZXBRL C10, ZFR_NO NUMC2, ZFR_TP, ZTO_NO NUMC2, ZTO_TP, ZRBI NUMC2, ZF_DAYS/ZT_DAYS **CHAR 5** | only the bucket is required. The UI shows Day(s)/Month(s)/Year(s), but **stores codes 01/02/03**. MODIFY (upsert) |
| ALM 2/3 buckets | `/FS00/ALMTR005` | ZBUC NUMC2 | as above without ZRBI; ZF_DAYS/ZT_DAYS **NUMC 5** | bucket numeric, desc + XBRL required, numbers numeric, both frequencies must be domain values. Create = MODIFY keeping the created-stamp |

Frequency domain `/FS00/ALMDM0001` (ZFR_TP and ZTO_TP of both tables): 01 Day(s), 02 Month(s), 03 Year(s).
All five tables: split date/time stamps, no timestamp. Same design as the Data Sources BOs applies.

## Gap against the ALM app (proposed contract, never confirmed)

1. **Report Formats key.** The app addresses rows by `Grp1..Grp5` (`key: {grp1..}`), but the tables' key is
   the derived `ZGRP_ID`. The API keys on `GroupId`, which needs a one-line engine change per op so the
   app sends `{groupId|grpId: gid}` as the key.
2. **ALM 1 frequencies.** The app keeps ALM 1 frequencies as the texts "Day(s)"/"Month(s)"/"Year(s)",
   and its seed uses D/M/Y for ALM 2. Live data holds codes 01/02/03 in both tables. The API exposes
   codes plus a `FrequencyDomain` lookup. The app has to use the domain lookup for ALM 1 too (engine,
   `src/pages/time-buckets/rules.js`, seed, tests).
3. **Field lengths.** The app allows group parts up to 20 characters and buckets up to 10 alphanumeric;
   the tables have C2 parts and a NUMC2 bucket. The API enforces the table types.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Package / transport | Same as Data Sources (`ZFS_ALM_API`, `DS4K907106`). Default taken; the human can redirect | 2026-09-26 |
| 2 | Draft (L-224) | Not requested, **no draft** | 2026-09-26 |
| 3 | Create semantics | Program upserts; API **refuses an existing key** (same as the Data Sources API and the app's own engine) | 2026-09-26 |
| 4 | Source existence check for ALM 1 (program derives but does not check) | Checked for all three, as the app already does | 2026-09-26 |

## Design

Two services, names as the app's contract proposed:
- `ZFS_SB_ALMRPTFMT_O4_API` / `ZFS_SD_ALMRPTFMT` with `Alm1Grouping`, `Alm2Grouping`, `Alm3Grouping`
- `ZFS_SB_ALMTIMEBKT_O4_API` / `ZFS_SD_ALMTIMEBKT` with `Alm1Bucket`, `Alm2Bucket`, `FrequencyDomain`

Five unmanaged BOs on the Data Sources pattern: `ZFS_I_*` root + BDEF, `ZFS_C_*TP` projection, pool with
transactional buffer, lock object, global auth, `etag master ChangeStamp` (date+time concat), no draft.
- Groupings: `GroupId` key, `readonly : update`. On create the server derives it from the parts; if the
  client sends one, it must equal the derived value.
- Buckets: `Bucket` key (NUMC 2).

Properties (consistent across entities; the app's `fields` map translates):
- ALM 1 grouping: GroupId · Grp1..5, GroupName, Source, SourceDesc(ro), SourceGroup(ro), SourceGroupDesc(ro),
  XbrlCode, SourceType, SourceTypeDesc, Product, InterestSplit, Negative
- ALM 2 grouping: GroupId · Grp1..5, GroupName, XbrlCode, Source, SourceDesc(ro), Product, TransactionType,
  Portfolio, InterestSplit, Negative
- ALM 3 grouping: GroupId · Grp1..6, GroupName, XbrlCode, NonSensitive, Source, SourceDesc(ro), InterestType,
  InterestSplit, Product, Negative, TransactionType
- ALM 1 bucket: Bucket · Description, XbrlCode, FromNo, FromFreq, ToNo, ToFreq, RbiNo, FromDays, ToDays
- ALM 2 bucket: Bucket · Description, XbrlCode, FromNo, FromFreq, ToNo, ToFreq, FromDays, ToDays
- All: CreatedBy/Date/Time, ChangedBy/Date/Time, ChangeStamp (ro)
- FrequencyDomain: DomainField (ZFR_TP / ZTO_TP), Value, Text. Direct `DD07T` select for
  `/FS00/ALMDM0001`: `DDCDS_CUSTOMER_DOMAIN_VALUE_T` joins a software-component scope that may exclude `/FS00/`

Validation:
- Groupings: Grp1 + GroupName required; no `:` in parts; Source must exist in ALMTR008 (texts derived);
  InterestType ∈ {01, 02} or blank.
- Buckets: Description + XbrlCode required; frequency must be a domain value (required for ALM 2 as in the
  program, optional for ALM 1); ALM 1 From/To days digits only.

New messages (TFSIN catalog): 006 `&1 must be &2`, 007 `&1 must not contain &2`.

## Naming gate

```
NAMING: EZFS_T_ALMGRP1 / EZFS_T_ALMGRP2 / EZFS_T_ALMGRP3 / EZFS_T_ALMBKT1 / EZFS_T_ALMBKT2 -> match Lock object EZFS_T_<NAME> (14 chars)
NAMING: ZFS_I_AlmGrp1 / ZFS_I_AlmGrp2 / ZFS_I_AlmGrp3 / ZFS_I_AlmBkt1 / ZFS_I_AlmBkt2 -> Interface view ZFS_I_<Entity> carrying the unmanaged BDEF (runbook §1 forced shape, as ZFS_I_AlmDataSrc)
NAMING: ZFS_C_AlmGrp1TP / ZFS_C_AlmGrp2TP / ZFS_C_AlmGrp3TP / ZFS_C_AlmBkt1TP / ZFS_C_AlmBkt2TP -> match Projection ZFS_C_<Entity>, Entity = <X>TP
NAMING: ZBP_FS_ALMGRP1TP / ZBP_FS_ALMGRP2TP / ZBP_FS_ALMGRP3TP / ZBP_FS_ALMBKT1TP / ZBP_FS_ALMBKT2TP -> match Behavior pool ZBP_FS_<Entity>
NAMING: ZFS_I_AlmFreqDomainVH -> matches Interface view ZFS_I_<Entity> (read-only, no TP)
NAMING: ZFS_SD_ALMRPTFMT / ZFS_SD_ALMTIMEBKT -> match Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMRPTFMT_O4_API / ZFS_SB_ALMTIMEBKT_O4_API -> match Service binding ZFS_SB_<Entity>_O4_API
NAMING: ZFS_TRM_MSG 006, 007 -> exception row "Message class: ZFS_TRM_MSG"
```

## Account switch (15:5x)

FS_DEV stopped logging on to TFSIN (adt-mcp + one REST check: 401). Human: "for TFSIN user id password use
FS_dev3". FS_DEV3 was verified; the workspace (`config/sap-systems.json`, `settings.local.json`, sync) and the ALM
app (`.env`, `config/sap-services.json`) were moved to FS_DEV3. The ALM live read is OK as FS_DEV3. FS_DEV3 has task
`DS4K907108` on `DS4K907106`. Pending: Claude Code restart (change server) + VS Code ADT re-logon as FS_DEV3
(adt-mcp). See L-597.

## Routing deviation (16:1x)

After the FS_DEV3 switch, `adt-mcp` `abap_list_destinations` kept answering `[]`, three times, across a VS Code
reconnect and an `/mcp` reconnect, although `~/.adtls/destinations.json` holds `DS4_100_TFSIN` (user FS_DEV3).
Human: "try adt-mcp if its not connected use abap-adt-ds4-100-tfsin to start". So the CDS views are created
through the change server (`createObject`) as the rule-5 fallback, and this is the recorded reason. That server
**cannot** create `ENQU/DL` or `BDEF/BDO` (not in its `CreatableTypes`), so the lock objects and BDEFs wait for
`adt-mcp`.

## Todo

- [x] 1. Read both programs, DDIC of 5 tables, domains; compare with the app
- [x] 2. Messages 006, 007 created (change server), catalog updated
- [x] 3. All active: the 5 BOs activated first time (adt-mcp back at 16:3x). Earlier note: **Blocked 15:5x:** `adt-mcp` create of `EZFS_T_ALMGRP1` answered `Name or password is incorrect (repeat logon)`, then refused further calls (`Logon has failed before. Request is not sent to avoid user getting locked`). Nothing was created. Not retried. Needs the human to re-logon the VS Code ADT destination `DS4_100_TFSIN`
- [x] 4. Publish: the human's first attempt did not register the groups (both `$metadata` 404 "not published"). On request ("can u try from ur side now with sap-gui"), both were published via `sap-gui` in the now-scriptable TFSIN session (`/app/con[2]`, FS_DEV3, DS4/100): `/IWFND/V4_ADMIN` → Publish Service Groups → alias LOCAL, filter `ZFS_SB_ALM*` → each row → PUBLISH → "New service group(s) successfully published" (both). The script itself hardcodes connection 0, which had no session, so the steps were driven by hand
- [x] 5. Smoke test `scripts/alm-rptfmt-timebkt-tests/smoke.ps1`: **42 passed, 0 failed** on the first run (`evidence/.../smoke-run-1.txt`). All `ZT:Z1*` groupings and bucket 99 deleted, confirmed 404. Findings L-598, L-599
- [x] 6. ALM app (`D:\SAP Tool\SAP - ALM Application`), done ahead of the publish:
  - `config/reportformats-odata.json`: fields map + `flagType: boolean`
  - `config/timebuckets-odata.json`: stamp map
  - `engine/reportformats.py`: op key = `{groupId|grpId: gid}` (the table key) instead of the parts
  - `engine/timebuckets.py` + `src/pages/time-buckets/rules.js`: ALM 1 frequencies from the domain lookup (codes),
    like ALM 2/3; `config/timebuckets-seed.json` moved to codes 01/02/03
  - tests updated (`test_reportformats.py`, `test_timebuckets.py`, `reportformats.test.mjs`, `timebuckets.test.mjs`)
  - `npm test` 19/19, Python 22/22, `npm run build` OK
  - `.env`: `SAP_REPORTFORMATS_URL` / `SAP_TIMEBUCKETS_URL` set. Live read through the app's `createReportFormats`/`createTimeBuckets().view()`: odata mode; alm1/2/3 groupings 147/183/178, buckets 7/10, freqDomain 6, sources 55. NUMC bucket keys `'1'` and `'01'` both address the row (L-599)
  - Not changed (optional): app field lengths are longer than the tables (parts 20 vs 2, bucket 10 vs NUMC 2, XBRL 40 vs 10);
    the API refuses over-long values

## ALM app tiles, end to end (human: "add these 2 services in ALM applications of Report and bucket tiles")

The Report Formats and Time Buckets tiles are built-in modules (`config/catalog.mjs`, `module: 'reportformats'` /
`'timebuckets'`), bound to `SAP_REPORTFORMATS_URL` / `SAP_TIMEBUCKETS_URL`. Those were already set; the running
server (port 8093, restarted by the human) reports both as configured. Through its HTTP API (demo sign-in):
- `GET /api/reportformats`: odata, `ZFS_SB_ALMRPTFMT_O4_API`, alm1/2/3 = 147/183/178, sources 55
- `GET /api/timebuckets`: odata, `ZFS_SB_ALMTIMEBKT_O4_API`, alm1/2 = 7/10, freqDomain 6
- Write round trip through the app:
  - `alm1` grouping `ZT:Z1`: created 1, updated 1, deleted 1 (GroupId key path)
  - `alm1` bucket `99`: created 1, updated 1, deleted 1 (frequency codes)
  - Both then confirmed 404 on SAP

## ATC (default variant, 2026-09-26, whole ZFS_ALM_API incl. the Data Sources objects)

- **10 behavior pools** (run `52540030422E1FD1AEB181DD7758C000`): **0 errors**, 18 × prio 2, 11 × prio 3.
  - Prio 2, "Search problematic SELECT * statements", twice per pool:
    - `EXISTS` on the `update` read. That read needs the full row: the `UPDATE ... FROM TABLE` must not blank
      columns (runbook §11). Keep it; exemption candidate.
    - `FEW` (0 % of fields used) on the `delete` read. That one could select only the key. Fixable.
  - Prio 3, SLIN 1700 "Strings without text elements are not translated":
    - Property names passed as message variables ('Source', 'Grp1', 'Description'): technical identifiers,
      candidates for `##NO_TEXT`.
    - The prose fragment 'a whole number' (ZBP_FS_ALMBKT1TP, message 006): should become its own `ZFS_TRM_MSG`
      message (rule 4).
- **20 BDEFs** (run `52540030422E1FD1AEB18386701C4000`): 0 findings.
- **CDS views / SRVD** (`52540030422E1FD1AEB1869D0DC44000`, also with `DDLS/DF`/`SRVD/SRV` types): the worklist came
  back with **no objects**. No findings reported, but this does not prove the variant checked those types.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_TRM_MSG 006, 007 | MSAG | ZFS_ALM_API | DS4K907106 | on system |
| EZFS_T_ALMGRP1..3, EZFS_T_ALMBKT1..2 | ENQU | ZFS_ALM_API | DS4K907106 | active (adt-mcp) |
| ZFS_I_AlmGrp1..3, ZFS_I_AlmBkt1..2 | DDLS (change server) + BDEF (adt-mcp) | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_AlmGrp1TP..3TP, ZFS_C_AlmBkt1TP..2TP | DDLS (change server) + BDEF (adt-mcp) | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMGRP1TP..3TP, ZBP_FS_ALMBKT1TP..2TP | CLAS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmFreqDomainVH | DDLS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMRPTFMT, ZFS_SD_ALMTIMEBKT | SRVD | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SB_ALMRPTFMT_O4_API, ZFS_SB_ALMTIMEBKT_O4_API | SRVB | ZFS_ALM_API | DS4K907106 | active, published (sap-gui) |

`inactiveObjects` for FS_DEV3 = `[]` after the build.

## Lessons raised

L-597, L-598, L-599
