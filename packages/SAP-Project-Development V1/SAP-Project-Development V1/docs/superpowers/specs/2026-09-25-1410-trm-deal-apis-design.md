# TRM deal APIs — deal items, FX transaction, FX option, letter of credit — design

- **Date:** 2026-09-25 · **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Package / transport:** `ZFS_SLC_APP` / `DS4K907209` (FS_DEV3 task `DS4K907260`) — human-confirmed
- **Worklog:** `worklog/DS4_100_NIIF/2026-09/2026-09-25-1410-trm-lc-fx-apis-and-deal-children-design.md`
- **Ledger:** L-572 (instruction), L-573 (generic item BAPIs), L-571 (reversal = latest activity)
- **Status:** approved by the human 2026-09-25, with FX options added (§6a)

## 1. Goal

Four new OData V4 Web APIs, built the same way as the interest rate instrument API
(`ZFS_SB_TRMIRATE_O4_API`, worklogs `2026-09-25-1308-…` and `…-1354-…`):

1. **Deal items** — condition, additional flow, main flow, payment detail — as **one
   product-independent API**: any financial transaction, whatever its product category (human
   instruction, L-573).
2. **FX transaction** — header CRUD + Settle.
3. **Letter of credit** — header CRUD + Settle, Terminate, Present.
4. **FX option** — header CRUD + Settle, Exercise, Expire, KnockIn, KnockOut (§6a).

Plus: a read-only `ActivityCategory` on all four header APIs, including the existing IRATE one
(human decision), so a caller can see that a deal is settled (L-571).

## 2. Decisions on record

| Decision | Value | Source |
|---|---|---|
| FX scope | FX transactions (`BAPI_FTR_FXT_*`); no swaps | human |
| FX options | plain currency options (`FTR_BAPI_FXOPTIONS`), full lifecycle actions (§6a) | human, after spec approval |
| LC scope | CRUD + Settle + Present + Terminate | human |
| Deal items | separate, product-independent, **fully writable** API | human |
| Condition fields | **core set** (§4.1); flows and payment details expose all their fields | human |
| `ActivityCategory` | yes, on IRATE, FX and LC | human |
| Package / transport | `ZFS_SLC_APP` / `DS4K907209` | human |
| Draft | **no draft** on any of the new BOs (carried over from the IRATE decision, L-224) | human, IRATE activity |
| Delete of a header | reversal, reason `04`; reverses the **latest activity** (L-571) | human, IRATE activity |
| LC test data | `38A` in company code `9999` — the only category 850 deals (L-585); plan 4 approved on that basis | human, 2026-09-25 |

## 3. Shared pattern (unchanged from IRATE)

Every API is a set of **root custom entities** (`ZFS_CE_*TP`) with an **unmanaged, strict(2),
non-draft** BDEF, `authorization master ( global )` and `lock master`:

- Each write handler calls its BAPI `DESTINATION 'NONE'` (L-227). On success it calls
  `BAPI_TRANSACTION_COMMIT` (`WAIT = 'X'`) in the same session, on error `BAPI_TRANSACTION_ROLLBACK`.
  **Each operation commits on its own**, so `$batch` changesets are not atomic, and a failure after
  the commit reports an error for a write that happened (L-568). The saver `SAVE` is an empty no-op.
- The `FOR LOCK` handler is empty: the BAPIs enqueue in the `'NONE'` session, and a RAP-side lock
  would collide with them.
- BAPI `RETURN` messages are passed through as SAP's own messages. An RFC failure uses
  `ZFS_TRM_MSG` **020**. **No new messages are planned**; if one is needed, it is created and added
  to `docs/message-catalog/DS4_100_NIIF.md` in the same turn.
- Every `RETURN` table is typed `WITH DEFAULT KEY` (L-568).
- PATCH sets the `X` flag only for fields present in `%control` (L-365 discipline).
- Reads for GET go through a query class (`IF_RAP_QUERY_PROVIDER`). Unsupported `$filter` fields
  raise `CX_RAP_QUERY_COND` (L-567).
- Publish with `scripts/sap-gui-publish-service.py`; creation routing per L-546/L-564 (DDLS, SRVD
  and classes via `mcp-abap-abap-adt-api createObject` + transport; BDEF and SRVB via `adt-mcp` with
  the top-level transport); `transportInfo` after every create.

## 4. API 1 — deal items (`ZFS_SB_TRMDEALITEM_O4_API`)

Four independent root entities in one service. Each BDEF can hold only one root, so there are four
BDEFs and four behavior pools, and one shared query class.

| Entity set | Custom entity + BDEF | Behavior pool | Key | BAPIs |
|---|---|---|---|---|
| `Condition` | `ZFS_CE_TrmDealCondTP` | `ZBP_FS_TRMDEALCONDTP` | CompanyCode, FinancialTransaction, Side, ConditionKey | `BAPI_FTR_CONDITION_CREATE / _CHANGE / _DELETE / _GETLIST` |
| `AdditionalFlow` | `ZFS_CE_TrmDealAddFlowTP` | `ZBP_FS_TRMDEALADDFLOWTP` | CompanyCode, FinancialTransaction, Side, FlowKey | `BAPI_FTR_ADDFLOW_*` |
| `MainFlow` | `ZFS_CE_TrmDealMainFlowTP` | `ZBP_FS_TRMDEALMAINFLOWTP` | CompanyCode, FinancialTransaction, Side, FlowKey | `BAPI_FTR_MAINFLOW_*` |
| `PaymentDetail` | `ZFS_CE_TrmDealPayDetTP` | `ZBP_FS_TRMDEALPAYDETTP` | CompanyCode, FinancialTransaction, Direction, EffectiveDate, FlowType, PaymentCurrency | `BAPI_FTR_PAYDET_*` |

Shared: query class `ZCL_FS_TRM_DEALITEM_QUERY` (dispatches on `io_request->get_entity_id( )`),
service definition `ZFS_SD_TRMDEALITEM`, binding `ZFS_SB_TRMDEALITEM_O4_API` (25 chars, under the 26 cap).

### 4.1 Fields

- **Condition — core set (~20):** ConditionKey (readonly), Side (key, default 0), Condition
  (readonly), ConditionType, EffectiveFrom, AmountCalcRule, PercentageRate, Amount, Currency
  (readonly: in `BAPI_FTR_COND_DETAIL` and `…CHANGEX`, **not** in `BAPI_FTR_COND_CHANGE`), CalcBaseAmount,
  RefInterestRate, RateMarkupOrDown, CalcMethod, CalcCalendar, Frequency, FrequencyUnit, CalcDate,
  CalcDateInclusive, CalcDateMonthEnd, DueDate, DueDateMonthEnd, ShiftDays.
  Create-only input: `ReferenceConditionKey` (the BAPI's non-optional `REFERENCECONDITIONKEY`; its
  meaning is confirmed in Phase 1 — blank may be accepted).
- **AdditionalFlow — all fields** of `BAPI_FTR_ADDFLOW_DETAIL` (30): the 26 of `…_CHANGE` are
  writable; FlowKey, InterestCalcDays, PostingStatus, FlowSide are read-only.
- **MainFlow — all fields** of `BAPI_FTR_MAINFLOW_DETAIL` (17): the 11 of `…_CHANGE` writable; FlowKey,
  FlowSign, PaymentCur(ISO), PostingStatus, FlowSide read-only. SAP may refuse main-flow writes on
  deals whose flows are generated from conditions; the BAPI's message is passed through.
- **PaymentDetail — all fields** of `BAPI_FTR_PAYDET_DETAIL` (35): key fields are writable only on
  create; the 16 of `…_CHANGE` are writable on update; the bank-account text fields are read-only.

### 4.2 Operations

- **POST** → `*_CREATE`; the BAPI returns the new ConditionKey / FlowKey (payment detail echoes its
  natural key), which is reported in `mapped`.
- **PATCH** → `*_CHANGE` with the `X` structure built from `%control`.
- **DELETE** → `*_DELETE`. This is a real delete of the item (not a deal reversal).
- **GET** → `*_GETLIST` for one deal. **A `$filter` with `CompanyCode eq …` and
  `FinancialTransaction eq …` is mandatory**: the BAPIs read per deal, so a filter-less GET
  answers with `CX_RAP_QUERY_COND`. Other `$filter`/`$orderby`, `$top`/`$skip` and `$count` are
  applied in ABAP to that one deal's rows.
- Deal-level locking is left to the BAPIs, as in §3.

## 5. API 2 — FX transaction (`ZFS_SB_TRMFX_O4_API`)

`ZFS_CE_TrmFxTP` (+ BDEF), `ZBP_FS_TRMFXTP`, `ZCL_FS_TRM_FX_QUERY`, `ZFS_SD_TRMFX`,
`ZFS_SB_TRMFX_O4_API`.

- List from released `I_FinancialTransaction` with `FinancialInstrProductCategory = '600'`, each page
  row enriched by `BAPI_FTR_FXT_DEALGET` (the IRATE query-class pattern).
- POST → `BAPI_FTR_FXT_DEALCREATE` (`GENERALCONTRACTDATA(X)` + `FOREX(X)`); PATCH →
  `BAPI_FTR_FXT_DEALCHANGE`; DELETE → `BAPI_FTR_FXT_REVERSE`, reason 04; action `Settle` →
  `BAPI_FTR_FXT_SETTLE`. The `ADDFLOW`/`PAYMENTDETAIL` tables are passed empty with blank
  complete-indicators; items are maintained through API 1.
- Fields: key, product/transaction type, partner, contract date, portfolio, valuation class,
  BuyCurrency, SellCurrency, BuyAmount, SellAmount, ValueDate, SpotRate, SwapRate, ForwardRate,
  ActiveStatus, ActivityCategory. Change is limited to the fields in `BAPI_FTR_CHANGE_FXT`
  (amounts, value date, rates).
- **As built (Phase 2, 2026-09-25):** plus `LeadCurrency`, `FollowCurrency` (human-approved) and
  `TradedCurrency` (required by DEALCREATE, FTR_GUI 141), all create-only. The amount must be entered
  in the traded currency (T7 366); the other side is computed (L-582).

## 6. API 3 — letter of credit (`ZFS_SB_TRMLC_O4_API`)

`ZFS_CE_TrmLcTP` (+ BDEF), `ZBP_FS_TRMLCTP`, `ZCL_FS_TRM_LC_QUERY`, `ZFS_SD_TRMLC`,
`ZFS_SB_TRMLC_O4_API`, and two parameter entities.

- List from `I_FinancialTransaction`, category **850 (to be confirmed)**, enriched by
  `BAPI_FTR_LC_DEALGET`.
- POST → `BAPI_FTR_LC_DEALCREATE` (`GENERALCONTRACTDATA(X)` + `LETTEROFCREDIT(X)`); PATCH →
  `BAPI_FTR_LC_DEALCHANGE`; DELETE → `BAPI_FTR_LC_REVERSE`, reason 04.
- Actions:
  - `Settle` → `BAPI_FTR_LC_SETTLE` (no parameters).
  - `Terminate` → `BAPI_FTR_LC_TERMINATE`; parameter entity `ZFS_AE_TrmLcTerminate`
    (TerminateDate, TerminateDateInclusive).
  - `Present` → `BAPI_FTR_LC_PRESENT`; parameter entity `ZFS_AE_TrmLcPresent` carrying `ACTION_TYPE`
    plus **one presentation as flat fields** (FlowType, PresentationBank, ShipmentDate,
    PresentationDate, PaymentDate, PresentationAmount, PresentationCurrency, Discrepancy,
    DiscrepancyAmount). Presentation flows and invoices are **out of scope**: deep action
    parameters do not work on this release (CLAUDE.md, dyngw v2 notes).
- Fields: key, product/transaction type, partner, contract date, portfolio, StartTerm, EndTerm,
  Amount, Currency, LcNumber, Applicant, Beneficiary, IssuingBank, AdvisingBank, PlaceOfExpiry,
  PaymentTerm, ActiveStatus, ActivityCategory, TerminateDate (read-only).
- **As built (Phase 4, 2026-09-25, human-approved additions):**
  - `ValuationClass`, `FlowType`, and read-only `LastPresentationItem`/`LastPresentationStatus`
  - `PresentationItem` and `DiscrepancyCurrency` in the Present parameter
  - Terminate needs a settled contract (T1 221)
  - every Present parameter is mandatory in OData V4
  - **`BAPI_FTR_LC_PRESENT` dumps in BAPI mode** (null GUI object in `TLC_DI_SET_PRESENTATION`,
    L-586). Present is built but blocked until SAP corrects it.

## 6a. API 4 — FX option (`ZFS_SB_TRMFXOPT_O4_API`)

Added on human instruction after spec approval ("add it for options BAPIs also"). Covers the plain
currency option BAPIs of `FTR_BAPI_FXOPTIONS` (all `RODIR.RELEASED = X`). Average-rate, basket/correlation
and forward-volatility variants, and the unreleased `FTR_BAPI_SEOPTIONS` family, are **out of scope**.

`ZFS_CE_TrmFxOptTP` (+ BDEF), `ZBP_FS_TRMFXOPTTP`, `ZCL_FS_TRM_FXOPT_QUERY`, `ZFS_SD_TRMFXOPT`,
`ZFS_SB_TRMFXOPT_O4_API` (22 chars), and parameter entity `ZFS_AE_TrmFxOptExercise`.

- There is **no DEAL\* variant** for options. POST → `BAPI_FTR_CREATE_FXOPTIONS`, which has **no `X`
  structures**: every supplied field is taken as is, like the simple `BAPI_FTR_IRATE_CREATE`. PATCH →
  `BAPI_FTR_CHANGE_FXOPTIONS` (`GENERALCONTRACTDATA(X)` + `FOREX(X)`). GET enrichment →
  `BAPI_FTR_FXOPTION_GETDETAIL`. DELETE → `BAPI_FTR_REVERSE_FXOPTIONS`, reason 04.
- Actions, parameterless: `Settle` (`BAPI_FTR_SETTLE_FXOPTIONS`), `Expire` (`…EXPIRE…`), `KnockIn`,
  `KnockOut`. `Exercise` → `BAPI_FTR_EXERCISE_FXOPTIONS` with `ZFS_AE_TrmFxOptExercise`
  (ExecutionDate, mandatory; optional cash settlement CashDate, CashAmount, CashCurrency,
  CashFlowType — the flat `BAPI_FTR_EXITE_FXOPTION` structure).
- Fields: key, product/transaction type, partner, contract date, portfolio, OptionType,
  PutCallIndicator, LeadCurrency, FollowCurrency, StrikeRate, UnderlyingAmount, UnderlyingCurrency,
  UnderlyingValueDate, ExpirationDate, ExerciseType, SettlementIndicator, BarrierType,
  BarrierRate1, BarrierRate2, PremiumFlowType, PremiumPaymentDate, PremiumAmount, PremiumCurrency,
  ExerciseDate (read-only), ActiveStatus, ActivityCategory.
- List from `I_FinancialTransaction`; the option **product category is to be confirmed** from
  `VTBFHA`/`TZPA` at the start of the phase (candidate `SANLF 760`, `41A` in 9990).

## 7. `ActivityCategory` on the header APIs

A read-only `ActivityCategory` element on `ZFS_CE_TrmIrateTP`, `…FxTP`, `…FxOptTP` and `…LcTP`, filled from
DEALGET's `RETURNGENERALCONTRACTDATA-ACTIVITY_CAT` (e.g. 10 contract, 20 settlement), plus the
matching element in the list CTEs where `I_FinancialTransaction` offers it (otherwise filled only by
the DEALGET enrichment and not filterable). DELETE keeps reversing one activity at a time.
**Correction (L-582):** the category values depend on the product category (AT02T). For 550 (IRATE),
10 = contract and 20 = settlement. For 600 (FX), 10 = order, 20 = contract and 30 = settlement.

## 8. Objects

| # | Object | Type | API |
|---|---|---|---|
| 1–4 | `ZFS_CE_TrmDealCondTP`, `…DealAddFlowTP`, `…DealMainFlowTP`, `…DealPayDetTP` | DDLS (root custom entity) + BDEF each | 1 |
| 5–8 | `ZBP_FS_TRMDEALCONDTP`, `…ADDFLOWTP`, `…MAINFLOWTP`, `…PAYDETTP` | CLAS (behavior pool) | 1 |
| 9 | `ZCL_FS_TRM_DEALITEM_QUERY` | CLAS | 1 |
| 10–11 | `ZFS_SD_TRMDEALITEM`, `ZFS_SB_TRMDEALITEM_O4_API` | SRVD, SRVB | 1 |
| 12–16 | `ZFS_CE_TrmFxTP` (+BDEF), `ZBP_FS_TRMFXTP`, `ZCL_FS_TRM_FX_QUERY`, `ZFS_SD_TRMFX`, `ZFS_SB_TRMFX_O4_API` | | 2 |
| 17–23 | `ZFS_CE_TrmLcTP` (+BDEF), `ZBP_FS_TRMLCTP`, `ZCL_FS_TRM_LC_QUERY`, `ZFS_SD_TRMLC`, `ZFS_SB_TRMLC_O4_API`, `ZFS_AE_TrmLcTerminate`, `ZFS_AE_TrmLcPresent` | | 3 |
| 24–29 | `ZFS_CE_TrmFxOptTP` (+BDEF), `ZBP_FS_TRMFXOPTTP`, `ZCL_FS_TRM_FXOPT_QUERY`, `ZFS_SD_TRMFXOPT`, `ZFS_SB_TRMFXOPT_O4_API`, `ZFS_AE_TrmFxOptExercise` | | 4 |
| changed | `ZFS_CE_TrmIrateTP`, `ZCL_FS_TRM_IRATE_QUERY` | + `ActivityCategory` | IRATE |

Every name is re-checked against `docs/naming-conventions.md` and recorded as a `NAMING:` line in
the phase's worklog **before** its create call.

## 9. Phases and acceptance

Each phase has its own worklog and ends with a live test on DS4/100 (sandboxed PowerShell, fresh
cookie session per call — L-569), evidence in that worklog's evidence folder, and ATC with no
priority 1/2 findings.

| Phase | Build | Live acceptance |
|---|---|---|
| 1 | API 1 (deal items) + `ActivityCategory` on IRATE | On a new 22A deal in company code 1000 (created through the IRATE API): for each of the four entity sets, GET list → POST one row → GET it → PATCH one field → DELETE it, each verified in `VTBFHA*`/GETLIST. Then reverse the deal. `ActivityCategory` shows 10, and 20 after `Settle`. |
| 2 ✅ done 2026-09-25 (worklog `2026-09-25-1550-trm-fx-api-phase2`, 4 test deals, all reversed) | API 2 (FX) + `ActivityCategory` | In company code 9990: list GET, POST an FX deal (payload found by reading an existing 40A deal with DEALGET), GET, PATCH an amount or rate, Settle, reverse (twice if settled). Add one payment detail to it through API 1 to prove product independence. |
| 3 | API 4 (FX option) + `ActivityCategory` | In the option company code (confirmed at phase start): list, POST an option (payload from an existing option's GETDETAIL), GET, PATCH the strike or premium, then on separate test options: Exercise, Expire, Settle; KnockIn/KnockOut only if a barrier option can be created. Reverse every test option. |
| 4 ✅ done 2026-09-25 except Present (SAP dump, L-586); worklog `2026-09-25-1640-trm-lc-api-phase4` | API 3 (LC) + `ActivityCategory` | After the human confirms the LC product type / company code: list, POST, GET, PATCH, Terminate, Present, Settle, reverse. |

Budget `runQuery` calls (~30 per ADT session, L-569) and reconnect the server between phases.

## 10. Risks and open points

0. **FX option product category** — to be confirmed at the start of its phase (§6a).

1. **LC test data** — **resolved 2026-09-25**: the only LC deals are 9999/38A (8 deals, L-585); plan 4 was approved on that basis.
2. **`REFERENCECONDITIONKEY`** — **resolved in Phase 1**: an existing condition key of the same deal is accepted (L-576).
3. **Main-flow writes** — **resolved in Phase 1**: accepted on a 22A deal (create/change/delete), L-579.
4. **Per-operation commit** (§3) — not atomic across a `$batch`.
5. **501 on a same-session GET after a write** (L-569) — still undiagnosed; applies to every API.
6. **Product authorisation** — the FTR BAPIs apply `T_DEAL_*` checks for the caller; the tests run
   as FS_DEV3 only.
