# TRM deal-item API (Phase 1) — build

- **Date:** 2026-09-25
- **Started:** 14:37
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP
- **Transport:** DS4K907209 (FS_DEV3 task DS4K907260)
- **Requested by:** human ("go ahead" with the Phase 1 plan)
- **Plan:** `docs/superpowers/plans/2026-09-25-1410-trm-dealitem-api-phase1.md` · **Spec:**
  `docs/superpowers/specs/2026-09-25-1410-trm-deal-apis-design.md` (§3, §4, §7, §9 Phase 1)
- **Execution:** inline (executing-plans); ledger `.superpowers/sdd/2026-09-25-1410-trm-dealitem-api-phase1/progress.md`

## Scope

`ZFS_SB_TRMDEALITEM_O4_API` with writable Condition / AdditionalFlow / MainFlow / PaymentDetail over the
released product-independent item BAPIs, plus a read-only `ActivityCategory` on the IRATE API. Out of
scope: FX, FX option, LC (plans 2–4).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Spec risk 2: what `BAPI_FTR_CONDITION_CREATE` needs in `REFERENCECONDITIONKEY` | **The key of an existing condition of the same deal is accepted** (`0100020261001`); new key returned `0100020270101`. Blank not tried (no failure to retry from) | 2026-09-25 |
| 2 | Spec risk 3: are manual main flows accepted on a 22A deal | **Yes** — plan outcome (a): POST 1100 flow 201, PATCH, DELETE all accepted on 1000/160537 | 2026-09-25 |
| 3 | Spec risk 5: 501 on same-session GET after a write | not addressed here; tests use fresh sessions | — |
| 4 | Review Focus 3: do the GETLIST calls (no `SIDE` passed) return side 1/2 rows of two-sided deals | **No** — the final reviewer read the FMs: they filter on `SIDE` (default 0). Fixed: reads sides 0/1/2 and merges (L-580) | 2026-09-25 |

## Naming gate

```
NAMING: ZCL_FS_TRM_DEALITEM_QUERY -> matches "RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY", AREA = TRM
NAMING: ZFS_CE_TrmDealCondTP -> matches "Custom entity ZFS_CE_<Entity>", <Entity> = TrmDealCondTP
NAMING: ZFS_SD_TRMDEALITEM -> matches "Service definition ZFS_SD_<Entity>"
NAMING: ZFS_SB_TRMDEALITEM_O4_API -> matches "Service binding ZFS_SB_<Entity>_<O4>_<API>" (25 chars, cap 26)
```

Routing: DDLS/SRVD/CLAS via `mcp-abap-abap-adt-api createObject` + transport — `adt-mcp` cannot put
these on a named transport (L-546); BDEF/SRVB via `adt-mcp` top-level `transportRequestNumber` (L-564).

## Todo

- [x] 1. Set-up:
      - scripts `scripts/trm-deal-api-tests/{trm-odata,dealitem-crud,dealitem-discover}.ps1` (from the plan verbatim)
      - message **056** "Filter on CompanyCode and FinancialTransaction (eq) is required" created in `ZFS_TRM_MSG`
        via the whole-document XML write (L-225) on **DS4K907018 / task DS4K907194** — the class is locked
        there (`transportInfo`), not on DS4K907209. `T100`: 56 rows, 056 text correct. Catalog updated, next free 057.
      - `CX_RAP_QUERY_COND` constructor takes `TEXTID like IF_T100_MESSAGE=>T100KEY` → the plan's RAISE stands
      - `ActivityCategory` (`tb_sfgzuty`, from DEALGET `ACTIVITY_CAT`) added to `ZFS_CE_TrmIrateTP`,
        `ZCL_FS_TRM_IRATE_QUERY`, BDEF readonly list; activated with the pool in one call, no messages.
        RED: property absent on 160533 · GREEN: `ActivityCategory` 10 (settlement reversed), `ActiveStatus` 3
      - **Phase 1 test deal: `1000/0000000160537`** (22A, INR 100,000, created via the IRATE API, `ActivityCategory` 10)
- [x] 2. Query class + read-only Condition + service/binding published
      - RED: `Condition` GET → 404 (service absent)
      - `ZFS_CE_TrmDealCondTP`, `ZCL_FS_TRM_DEALITEM_QUERY`, `ZFS_SD_TRMDEALITEM` (mcp-abap createObject +
        transport), `ZFS_SB_TRMDEALITEM_O4_API` (adt-mcp, top-level transport): all `transportInfo`
        DS4K907209 / DS4K907260, all activated clean; published via the script (`ok: true`)
      - Fix 1: `CREATE DATA … TYPE RANGE OF (name)` is invalid ABAP → RTTI-built range + `TYPE HANDLE`
        (typed `IN` on a generic field symbol compiles)
      - Fix 2 (L-575): `/IWBEP/CM_V4_MED/082` — set `Condition` → type `ConditionType` clashed with the
        property `ConditionType`; renamed to **`ConditionTypeCode`**
      - GREEN: deal 160537 → 200, 2 conditions (1200 at 10 %, 1120), keys `0100020261001`/`0200020261001`;
        no deal filter → 500 `ZFS_TRM_MSG/056` with its text
- [x] 3. Writable Condition
      - NAMING: `ZFS_CE_TRMDEALCONDTP` (BDEF) → "same as root view"; `ZBP_FS_TRMDEALCONDTP` → `ZBP_FS_<Entity>`;
        `LHC_TRMDEALCOND`/`LSC_TRMDEALCOND` → LHC_/LSC_<Entity> (TP stripped)
      - RED: steps 1–2 pass, `3-create` → 405
      - BDEF (adt-mcp, DS4K907209 confirmed) + pool (mcp-abap createObject + transport); plan sources with
        `ConditionType` → `ConditionTypeCode` (L-575). Activated together, no messages
      - GREEN `dealitem-crud.ps1`: POST 201 `FTR0 162` → key `0100020270101` · GET 200 · PATCH `PercentageRate` 12.5
        200 and read back · DELETE 204 · rows 2 → 2
      - Step 9 (Review Focus 5): `ConditionTypeCode eq '9999'` → 0, `eq '1200'` → 1, `PercentageRate gt 50` → 1 (typed compare)
- [x] 4. AdditionalFlow
      - NAMING: `ZFS_CE_TrmDealAddFlowTP` → Custom entity ZFS_CE_<Entity>; BDEF same name; `ZBP_FS_TRMDEALADDFLOWTP`
        → ZBP_FS_<Entity>; `LHC_/LSC_TRMDEALADDFLOW` (TP stripped). All `transportInfo` DS4K907209
      - Order changed (ruling): CE + query branch + SRVD first so the discovery can read through the API
      - `SADL_GW_V4_MODEL/004`: `LocalCurRate : tb_khwkurs` has conversion exit EXCRT → `abap.dec(9,5)` (L-577)
      - Discovery: flow type 1440/sign `-` on deal 170092, but **refused for 22A/100** (`T0 096`); 1430 taken
        from `VTBFHAPO` flows of 22A/100 deals
      - RED: POST 405 · first GREEN attempt exposed the **temporary FLOWKEY** (`99999999999990000000007`) → GET 404,
        stray flow left (real key `20260925145832000100001`), removed via DELETE 204. Create handler now maps
        the post-commit key via GETLIST before/after in the `'NONE'` session (L-577)
      - GREEN: POST 201 → `20260925150116000100001` · GET 200 · PATCH `PaymentAmount` 750 200 + read back ·
        DELETE 204 · rows 0 → 0
- [x] 5. MainFlow
      - NAMING: `ZFS_CE_TrmDealMainFlowTP` / BDEF / `ZBP_FS_TRMDEALMAINFLOWTP` / `LHC_/LSC_TRMDEALMAINFLOW` (all DS4K907209)
      - `LocalCurRate` typed `abap.dec(9,5)` up front (EXCRT, L-577); post-commit key mapping built in as for AdditionalFlow
      - RED: POST 405 · GREEN: POST 201 `FTR0 162` → `20260925150530000100001` (1100, 2027-03-31, 100) · GET 200 ·
        PATCH `PaymentAmount` 250 200 + read back · DELETE 204 · rows 1 → 1 — **manual main flows are accepted** (spec risk 3)
- [x] 6. PaymentDetail
      - NAMING: `ZFS_CE_TrmDealPayDetTP` / BDEF / `ZBP_FS_TRMDEALPAYDETTP` / `LHC_/LSC_TRMDEALPAYDET` (all DS4K907209)
      - `/IWCOR/CX_OD_EDM_FACET_ERROR` "'00000000' violates Nullable=false": key `EffectiveDate` DATS → `abap.char(8)` (L-578);
        payment details of 22A deals commonly carry an initial effective date
      - Discovery: no payment detail with house bank/method on 60 deals → body mirrors the deal's own row (ruling)
      - RED: POST 405 · GREEN: POST 201 `FTR0 162` (`+`/20261001/blank/INR) · GET 200 · PATCH `IndividualPayment` true
        200 + read back · DELETE 204 · rows 2 → 2
- [x] 7. Acceptance, clean-up, hand-over
      - ATC (`adt-mcp`, default variant): **0 findings** on the query class, 4 pools, 4 BDEFs, `ZCL_FS_TRM_IRATE_QUERY`, `ZBP_FS_TRMIRATETP`
      - Full back-to-back re-run of the four CRUD suites (`evidence/…/rerun/`): all exit 0
      - Review Focus 3 (two-sided deal): 26A deal `1000/35000020` → Condition 2 rows, MainFlow 1 row, **only Side 0**.
        Inconclusive — no evidence this deal has a second side; recorded as open (L-579)
      - Test deal `1000/0000000160537` reversed through the IRATE API: DELETE 204 → `ActiveStatus` 3 (one DELETE; no
        settlement had been posted)
      - Final check: deal reversed, all four sets still answer 200 for it

## Final review and fix pass

Fresh reviewer (read-only, live sources): 1 Critical, 3 Important, 6 Minor. One fix pass, each RED→GREEN
where testable (`.superpowers/…/fix-tests.ps1`, evidence `fixpass-log.txt`):

| # | Finding | Fix | Test |
|---|---|---|---|
| F1 Critical | GETLISTs default `SIDE` 0 → side 1/2 rows of swaps never read; side ≠ 0 writes fail after commit | `read_*` read sides 0/1/2 and merge (errors only if no side readable), explicit `Side eq` passed through; pools pass the key's Side | swap 9990/23000069: sides [2] → [1,2]; `Side eq '1'` 0 → 3 rows |
| F2 Important | AddFlow/MainFlow key mapping fell back to a wrong/temporary key | GETLIST error ⇒ key unknown; exactly one new flow of that type+date required; Side from the found row; else failed + **`ZFS_TRM_MSG` 057** | not RED-able (ruling); regression suite GREEN |
| F3 Important | blank `EffectiveDate` ≠ `'00000000'` → GET 404 / PATCH 400 | normalised in query filter and create/update/delete/read; mapped key always 8 digits | deal 160539: GET/PATCH `EffectiveDate=''` 404/400 → 200/200 |
| F4 Important | GET hid BAPI errors (nonexistent deal → empty 200) | first E/A of GETLIST raised as `CX_RAP_QUERY_COND` | deal 999999: 200 → 500 `FTR0/004` |

Deferred minors (execution ledger): F5 refusals are HTTP 500 · F6 multi-condition deal filter · F7
`ReferenceConditionKey` create-only · F8 initial-key create shows only FTR0 162 · F9 NUMC Side filter ·
F10 ActivityCategory not filterable. Message **057** created (DS4K907018, T100 verified, catalog next free 058).
Regression after the pass: fix-tests 5/5, CRUD suites 4/4 (deal 160539), filter 1/1 — GREEN; ATC 0 findings;
deal `1000/0000000160539` reversed.

## Delivery checks

- [x] Activated, nothing left inactive (every activation `success: true`, no messages; `inactive: []`)
- [x] ATC — 0 findings
- [x] ABAP Unit: none (rule 3 — no unrequested test objects; covered by the live suites)
- [x] Live tests: all four entity sets create → read → change → delete, count restored, plus filter/refusal checks
- [x] Objects on DS4K907209 (`transportInfo` per create); message 056 on DS4K907018
- [x] Test data cleaned up: every created item deleted; test deal reversed

## Service

`/sap/opu/odata4/sap/zfs_sb_trmdealitem_o4_api/srvd_a2x/sap/zfs_sd_trmdealitem/0001/{Condition|AdditionalFlow|MainFlow|PaymentDetail}?sap-client=100`
GET needs `$filter=CompanyCode eq '<cc>' and FinancialTransaction eq '<deal>'` (otherwise 056). Keys:
Condition (CompanyCode, FinancialTransaction, Side, ConditionKey) · AdditionalFlow/MainFlow (…, Side, FlowKey) ·
PaymentDetail (…, Direction, EffectiveDate yyyymmdd text, FlowType, PaymentCurrency).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_TRM_MSG` 056, 057 | MSAG messages | ZFS_K2_CC_VS | DS4K907018 | new, verified in T100 |
| `ZFS_CE_TrmIrateTP` | DDLS | ZFS_SLC_APP | DS4K907209 | changed: + ActivityCategory, active |
| `ZCL_FS_TRM_IRATE_QUERY` | CLAS | ZFS_SLC_APP | DS4K907209 | changed: maps ActivityCategory, active |
| `ZFS_CE_TRMIRATETP` | BDEF | ZFS_SLC_APP | DS4K907209 | changed: ActivityCategory readonly, active |
| `ZFS_CE_TrmDealCondTP` | DDLS (root custom entity) | ZFS_SLC_APP | DS4K907209 | active |
| `ZCL_FS_TRM_DEALITEM_QUERY` | CLAS (query provider) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_SD_TRMDEALITEM` | SRVD | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_SB_TRMDEALITEM_O4_API` | SRVB (OData V4 Web API) | ZFS_SLC_APP | DS4K907209 | active, **published** |
| `ZFS_CE_TRMDEALCONDTP` | BDEF | ZFS_SLC_APP | DS4K907209 | active |
| `ZBP_FS_TRMDEALCONDTP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TrmDealAddFlowTP` | DDLS (root custom entity) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TRMDEALADDFLOWTP` | BDEF | ZFS_SLC_APP | DS4K907209 | active |
| `ZBP_FS_TRMDEALADDFLOWTP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TrmDealMainFlowTP` | DDLS (root custom entity) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TRMDEALMAINFLOWTP` | BDEF | ZFS_SLC_APP | DS4K907209 | active |
| `ZBP_FS_TRMDEALMAINFLOWTP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TrmDealPayDetTP` | DDLS (root custom entity) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TRMDEALPAYDETTP` | BDEF | ZFS_SLC_APP | DS4K907209 | active |
| `ZBP_FS_TRMDEALPAYDETTP` | CLAS (behavior pool) | ZFS_SLC_APP | DS4K907209 | active |

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-575, L-576, L-577, L-578, L-579, L-580
