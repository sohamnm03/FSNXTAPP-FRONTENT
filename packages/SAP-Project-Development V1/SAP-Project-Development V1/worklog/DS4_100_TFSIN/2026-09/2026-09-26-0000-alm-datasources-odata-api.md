# ALM Data Sources OData API from /FS00/ALMP005

- **Date:** 2026-09-26
- **Started:** 00:00  <!-- session start; exact time not captured -->
- **System:** DS4_100_TFSIN (corrected by the human: the program lives on TFSIN, not NIIF)
- **Package:** `ZFS_ALM_API` (human, 2026-09-26)
- **Transport:** `DS4K907106` (task `DS4K907107`, FS_DEV)
- **Requested by:** saumya.s

## Scope

Analyse `/FS00/ALMP005` on TFSIN and build an OData V4 RAP Web API for the same data, consumed by the
Data Sources page of `D:\SAP Tool\SAP - ALM Application` (`config/datasources-odata.json`).
Out of scope: changing `/FS00/ALMP005` or the `/FS00/ALMTR*` tables.

Connectivity: TFSIN reachable over the pinned `abap-adt-ds4-100-tfsin` server (reads OK).
`adt-mcp` (the creation server) failed at session start with ECONNREFUSED. NIIF is unreachable (VPN).

## Program analysis: /FS00/ALMP005 "Data Sources Maintenance" (package `/FS00/ALM`)

Includes `_TOP` and `_F01` (1972 lines). Screen 9000 hosts a `CL_GUI_HTML_VIEWER` that loads SMW0 object
`/FS00/DATASOURCES`. ABAP bakes the data into the page as `*`/`!`-separated strings and receives
`SAPEVENT` actions. Five tabs, one table each, plus lookups:

| Tab | Table | Key (after MANDT) | Non-key | Ops in program |
|---|---|---|---|---|
| Source groups | `/FS00/ALMTR007` | ZSRC_GRP C2 | ZSRC_GRP_DESC C60 | create (single + bulk), update desc, delete |
| Data sources | `/FS00/ALMTR008` | ZSRC C2 | ZSRC_DESC C80, ZEXL_SRC C80, ZGRP_CD C2, ZGRP_DESC C60 (derived) | create, update, delete |
| Product master | `/FS00/ALMTR026` | ZBUKRS C4, ZPRD_TYPE C3 | ZPRD_DESC C30 (derived), ZPRINC/ZPRINC_TPM12/ZPRINC_ALM2 C1 | create, update, delete |
| TRM flow mapping | `/FS00/ALMTR009` | ZS_TYPE C2, ZFLOW C8, ZSGSART C3, ZSFHAART C3 | ZS_DESC, ZFLOW_DESC, ZSGSART_DESC, ZTXN_DESC (all derived) | create, delete (no update, all fields are key) |
| Investor segments | `/FS00/ALMTR029` | ZBP_GRP N3, ZSEGMENT C3 | ZBP_GRP_DESC C30 (derived) | create, delete |

All five tables: delivery class A, and the audit stamp is split into ZCREATED_BY/DATE/TIME and
ZCHANGED_BY/DATE/TIME. There is **no timestamp field**, so a managed BO gets no total ETag (L-218).
That points to an **unmanaged BO**, or managed with unmanaged save and a calculated ETag.

Validation rules in the program (the API must enforce the same ones):
- Keys are upper-cased and condensed. A mandatory field left blank means the row is skipped.
- 007: code + description required. Create refuses an existing key, update refuses a missing one.
- 008: src + desc + group required. The group must exist in 007, and ZGRP_DESC is copied from 007.
- 026: company code must exist in `T001`, product type must exist in `TZPAT` (spras = sy-langu), and
  ZPRD_DESC is copied from `TZPAT-LTX`. Flags are upper-cased, not validated.
- 009: src/flow/product required, transaction type optional. The derived texts come from 008,
  `TRDC_DFLOWTYPE_T`, `TZPAT` and `AT10T`. **No existence check** on src/flow/product: a missing one
  just leaves its text blank.
- 029: BP group required and must exist in `TP019T` with grp_typ '801'. The segment may be blank.
  ZBP_GRP_DESC is copied from `TP019T-TEXT30`.
- Deleting a source group does **not** check whether 008 still references it (open question 6).
- Messages are inline literals, not `ZFS_TRM_MSG` (the API must not copy them, rule 4).

Lookups: `TZPAT` (product type), `T001` (company code), `TRDC_DFLOWTYPE_T` (flow type),
`AT10T` (txn type per product type), `TP019T` grp_typ 801 (BP group).

## Gap against the ALM app's proposed contract

The app's field names (`SRC`, `XL_SRC`, `GRP_CD`, `BUKRS`, `PRD_TYPE`, `PRINC`, `TPM12`, `ALM2`,
`S_TYPE`, `FLOW`, `PRD`, `TTYP`, `GRP`, `SEG`, `CRT_BY`…) are **not** the table names. The app's
`tables.<t>.fields` map exists for exactly this: app field -> RAP property. So the app can be
adapted with a config-only change, and the API keeps honest names derived from the tables.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Package and transport | `ZFS_ALM_API`, `DS4K907106` | 2026-09-26 |
| 2 | `ZFS_TRM_MSG` does not exist on TFSIN (L-590). Create it + `docs/message-catalog/DS4_100_TFSIN.md`? | **Yes, create it** | 2026-09-26 |
| 3 | Match the ALM app: keep its service/entity-set names, map fields in its config? | **Map in ALM config.** RAP properties take descriptive names from the tables; `datasources-odata.json` `fields` maps app field -> property | 2026-09-26 |
| 4 | Draft? (L-224) | Not requested, **no draft**. The ALM app sends plain POST/PATCH/DELETE | 2026-09-26 |
| 5 | `adt-mcp` down | Human restarted it; `abap_list_destinations` = `[DS4_100_TFSIN]` | 2026-09-26 |
| 6 | Refuse deleting a source group still used by a data source? | **Match program**: allow it | 2026-09-26 |
| 7 | Scope of operations | Human: **"it should CRUD API"**. Create/read/update/delete on all five entities. TRM flow and investor segment have only key fields, so update there re-derives the description texts and the change stamp | 2026-09-26 |

## Design

One OData V4 Web API service `ZFS_SB_ALMDATASRC_O4_API` (SD `ZFS_SD_ALMDATASRC`), matching the root
URL already in the ALM app. Five **unmanaged** root BOs: the tables have split date/time stamps and no
timestamp, so a managed BO gets no ETag (L-218), and the `/FS00/` tables are not ours to change. Each
BO follows `docs/rap-unmanaged-web-api-pattern.md`: a `ZFS_I_*` root view on the table carries the
BDEF, plus a `ZFS_C_*TP` projection, a pool with `LHC_`+`LSC_`, a lock object and a global-auth
handler (L-238). No ETag (the ALM app sends `If-Match: *`). Validations run inline in create/update,
mirroring `/FS00/ALMP005`, but a bad row is **refused with a message** instead of silently skipped.
Keys are upper-cased + condensed as in the program. Stamps are set server-side
(`sy-uname`/`sy-datum`/`sy-uzeit`).

| Entity set | Table | Properties (key · non-key) |
|---|---|---|
| SourceGroup | /FS00/ALMTR007 | SourceGroup · SourceGroupDesc |
| DataSource | /FS00/ALMTR008 | Source · SourceDesc, ExcelSource, SourceGroup, SourceGroupDesc(ro) |
| ProductMaster | /FS00/ALMTR026 | CompanyCode, ProductType · ProductTypeDesc(ro), Principal, PrincipalTpm12, PrincipalAlm2 |
| TrmFlowMapping | /FS00/ALMTR009 | SourceType, FlowType, ProductType, TransactionType · SourceTypeDesc, FlowTypeDesc, ProductTypeDesc, TransactionTypeDesc (all ro) |
| InvestorSegmentMapping | /FS00/ALMTR029 | BpGroup, Segment · BpGroupDesc(ro) |

All five also expose read-only CreatedBy/CreatedDate/CreatedTime/ChangedBy/ChangedDate/ChangedTime.

Lookups (read-only):
- ProductType -> released `I_FinancialInstrProdTypeText` (TZPAT)
- CompanyCode -> released `I_CompanyCode`
- FlowType -> `TRDC_DFLOWTYPE_T`, TransactionType -> `AT10T`, BpGroup -> `TP019T` grp_typ 801. These
  are **direct table selects**: no released view over these tables was found on TFSIN, and the BO
  tables themselves are unreleased `/FS00/`, so the stack is Standard ABAP either way.

Messages: `ZFS_TRM_MSG` (TFSIN) 001–006, generic `&1 &2` wording (see catalog).

## Naming gate

```
NAMING: ZFS_TRM_MSG -> matches exception row "Message class: ZFS_TRM_MSG"
NAMING: EZFS_T_ALMSRCGRP -> matches Lock object EZFS_T_<NAME> (16 chars)
NAMING: EZFS_T_ALMDATSRC -> matches Lock object EZFS_T_<NAME> (16 chars)
NAMING: EZFS_T_ALMPRDMST -> matches Lock object EZFS_T_<NAME> (16 chars)
NAMING: EZFS_T_ALMTRMFLW -> matches Lock object EZFS_T_<NAME> (16 chars)
NAMING: EZFS_T_ALMINVSEG -> matches Lock object EZFS_T_<NAME> (16 chars)
NAMING: ZFS_I_AlmProductTypeVH, ZFS_I_AlmCompanyCodeVH, ZFS_I_AlmFlowTypeVH, ZFS_I_AlmTxnTypeVH, ZFS_I_AlmBpGroupVH -> match Interface view ZFS_I_<Entity> (read-only, no TP)
NAMING: ZFS_I_AlmSrcGrp, ZFS_I_AlmDataSrc, ZFS_I_AlmPrdMast, ZFS_I_AlmTrmFlow, ZFS_I_AlmInvSeg -> Interface view ZFS_I_<Entity>, carrying the unmanaged BDEF per rap-unmanaged doc §1 (runbook-forced shape, same as ZFS_I_TrmLimPt / exception row ZFS_I_DynGateway)
NAMING: ZFS_C_AlmSrcGrpTP, ZFS_C_AlmDataSrcTP, ZFS_C_AlmPrdMastTP, ZFS_C_AlmTrmFlowTP, ZFS_C_AlmInvSegTP -> match Projection ZFS_C_<Entity>, Entity = <X>TP
NAMING: ZBP_FS_ALMSRCGRPTP, ZBP_FS_ALMDATASRCTP, ZBP_FS_ALMPRDMASTTP, ZBP_FS_ALMTRMFLOWTP, ZBP_FS_ALMINVSEGTP -> match Behavior pool ZBP_FS_<Entity>; local LHC_/LSC_ strip TP (L-226)
NAMING: ZFS_SD_ALMDATASRC -> matches Service definition ZFS_SD_<Entity>
NAMING: ZFS_SB_ALMDATASRC_O4_API -> matches Service binding ZFS_SB_<Entity>_O4_API
```

Note on the `ZFS_I_` BO roots: the CDS row says "never `ZFS_I_<Entity>`" for a BO root. But runbook
§1 makes `ZFS_I_` + BDEF the **only working shape** for unmanaged, and the existing unmanaged BOs
already use it. This is the runbook-forced shape, not a new stylistic deviation. It is flagged in the
completion report.

## Decisions during build

- **ETag / "RAP log fields" (human, 2026-09-26):** the human approved adding RAP audit fields to the
  tables. **Not done, deliberately.** `/FS00/ALMP005` keeps writing these tables and would never
  maintain new timestamp fields, so an ETag on them would miss the program's own edits. Instead each
  root view exposes `ChangeStamp = concat( zchanged_date, zchanged_time )`. Both writers maintain
  those two fields, so it is `etag master ChangeStamp` (projection `use etag`), with no `/FS00/`
  table change. Limit: two changes within the same second share a stamp.
- **Transactional buffer:** handlers validate and buffer (`lcl_buffer`), and the saver writes in
  `save`. `check_before_save` re-checks create keys against the DB. This departs from runbook §4's
  direct-SQL-in-handler shape.
- **Refuse, don't skip:** where the program silently skipped a bad row, the API returns an error
  message.
- **Blocked: source-group BDEF.** Writing the `ZFS_I_AlmSrcGrp` BDEF source was **denied by the Claude
  Code auto-mode classifier** ("Modify Shared Resources"), while the identical-shape writes for the
  other four BDEFs in the same batch went through. Not retried, per the denial. The BDEF shell stays
  inactive with its generated content, the pool `ZBP_FS_ALMSRCGRPTP` is not created, and
  `SourceGroup` is **not yet in the service definition**.

## Todo

- [x] 1. Read `/FS00/ALMP005` + includes, DDIC of the 5 tables, lookups
- [x] 2. Answers to open questions; design + naming gate
- [x] 3a. `ZFS_TRM_MSG` class created (change server, adt-mcp has no MSAG adapter, L-214)
- [x] 3b. Messages 001–005 created after the human released the lock; `T100` verified. Smoke run 4: 43/43, errors now read e.g. "SourceGroup ZT already exists" (`smoke-run-4.txt`)
- [x] 3c. 5 lock objects, 5 lookup views, 5 root views, 5 projections: active
- [x] 3d. DataSource / ProductMaster / TrmFlowMapping / InvestorSegmentMapping: BDEF + pool + projection BDEF active
- [x] 3e. SourceGroup: human approved the retry ("yes go ahead", 2026-09-26). BDEF written, `ChangeStamp` on both views, pool `ZBP_FS_ALMSRCGRPTP`, projection BDEF, added to SD. All active
- [x] 3f. `ZFS_SD_ALMDATASRC` (5 BOs + 5 lookups) + `ZFS_SB_ALMDATASRC_O4_API` active
- [x] 3g. Publish: done **manually by the human** in `/IWFND/V4_ADMIN` (2026-09-26). The ADT route was refused by the server: The direct ADT publish-job call answered `(Un-)Publishing of SRVB ZFS_SB_ALMDATASRC_O4_API in Customizing Client not allowed` (L-593). Needs Basis (SCC4) or another client
- [x] 4. Smoke test `scripts/alm-datasrc-api-tests/smoke.ps1`: **run 3 = 43 passed, 0 failed**
  (`evidence/2026-09-26-0000-alm-datasources-odata-api/smoke-run-3.txt`; runs 1–2 were harness fixes).
  Findings: flags are `Edm.Boolean` (L-594); empty PATCH on all-key entities is 501 (L-595); same-session
  GET-by-key after a write is 501 (L-596). All `ZT*` test rows were deleted. Run 1 left `DataSource('ZU')`,
  because group `Z9` exists; it was deleted and confirmed 404.
  **Side effect:** a diagnostic `PATCH SourceGroup('Z9')` re-wrote its unchanged description "ALM", so Z9's
  ChangedBy/Date/Time now read FS_DEV / 2026-09-26.
- [x] 5. ALM app switched to TFSIN (human: "yes switch ALM app to TFSIN"). In `D:\SAP Tool\SAP - ALM Application`:
  - `config/datasources-odata.json`: full `fields` map, `flagType: "boolean"`
  - `config/sap-services.json`: system = TFSIN, user FS_DEV, `passwordEnv: SAP_DS4_100_TFSIN_PASSWORD`, connection check on this service's `$metadata`
  - `.env`: `SAP_USERNAME`, `SAP_DS4_100_TFSIN_PASSWORD` (copied, never printed), `SAP_DATASOURCES_URL`
  - `.env.example`, README, `docs/sap-connectivity.md`: updated
  - `tests/datasources.test.mjs` OData test moved from the old proposed names to the live contract
  - Verified: `npm test` 19/19, Python 22/22. Live read through the app's own `loadConfig`/`checkService`/`createDataSources().view()`: connection OK, mode `odata`, srcgrp 25 / ds 55 / pm 26 / trm 37 / seg 10 rows, all 5 lookups filled, flags come back as `X`/blank.
  - Gotcha: `loadConfig` prefers `SAP_PASSWORD` over the system's `passwordEnv`. This Claude session has a `SAP_PASSWORD` in its env, which gave a 401 until unset. The user's normal launch (`Start ALM.cmd`) is unaffected unless their Windows env defines `SAP_PASSWORD`.
- [ ] 6. ATC on the package

### ALM `fields` map to apply at step 5 (app field -> RAP property)

- ds: SRC->Source, SRC_DESC->SourceDesc, XL_SRC->ExcelSource, GRP_CD->SourceGroup, GRP_DESC->SourceGroupDesc
- pm: BUKRS->CompanyCode, PRD_TYPE->ProductType, PRD_DESC->ProductTypeDesc, PRINC->Principal, TPM12->PrincipalTpm12, ALM2->PrincipalAlm2
- trm: S_TYPE->SourceType, FLOW->FlowType, PRD->ProductType, TTYP->TransactionType, S_DESC->SourceTypeDesc, FLOW_DESC->FlowTypeDesc, PRD_DESC->ProductTypeDesc, TTYP_DESC->TransactionTypeDesc
- seg: GRP->BpGroup, SEG->Segment, GRP_DESC->BpGroupDesc
- srcgrp: ZSRC_GRP->SourceGroup, ZSRC_GRP_DESC->SourceGroupDesc, ZCREATED_BY->CreatedBy …
- all: CRT_BY/CRT_DT/CRT_TM/CHG_BY/CHG_DT/CHG_TM -> CreatedBy/CreatedDate/CreatedTime/ChangedBy/ChangedDate/ChangedTime

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_TRM_MSG | MSAG | ZFS_ALM_API | DS4K907106 | active, messages 001–005 |
| EZFS_T_ALMSRCGRP / ALMDATSRC / ALMPRDMST / ALMTRMFLW / ALMINVSEG | ENQU | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmProductTypeVH / CompanyCodeVH / FlowTypeVH / TxnTypeVH / BpGroupVH | DDLS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmDataSrc / PrdMast / TrmFlow / InvSeg | DDLS + BDEF | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_AlmDataSrcTP / PrdMastTP / TrmFlowTP / InvSegTP | DDLS + BDEF | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMDATASRCTP / ALMPRDMASTTP / ALMTRMFLOWTP / ALMINVSEGTP | CLAS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_I_AlmSrcGrp | DDLS + BDEF | ZFS_ALM_API | DS4K907106 | active |
| ZFS_C_AlmSrcGrpTP | DDLS + BDEF | ZFS_ALM_API | DS4K907106 | active |
| ZBP_FS_ALMSRCGRPTP | CLAS | ZFS_ALM_API | DS4K907106 | active |
| ZFS_SD_ALMDATASRC | SRVD | ZFS_ALM_API | DS4K907106 | active (all 5 BOs + 5 lookups) |
| ZFS_SB_ALMDATASRC_O4_API | SRVB | ZFS_ALM_API | DS4K907106 | active, published (manually by the human) |

Note: `/FS00/ALMP005` itself is listed as inactive on TFSIN. That is not from this activity, which only read it.

## Lessons raised

L-590 – L-596
