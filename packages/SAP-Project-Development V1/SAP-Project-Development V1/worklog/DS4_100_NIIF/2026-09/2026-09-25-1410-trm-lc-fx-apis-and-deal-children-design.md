# TRM LC + FX Web APIs, and writable deal child entities — design

- **Date:** 2026-09-25
- **Started:** 14:10
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP (human-confirmed)
- **Transport:** DS4K907209 (human-confirmed)
- **Requested by:** human: "1. Do it For LC BAPIs, FX BAPIs exactly same process like Interest rate
  Instrument  2. and do it for condition, addl flow, main flow, payment details"
- **Follows:** `2026-09-25-1308-trm-irate-crud-odata-api.md`, `2026-09-25-1354-trm-irate-settle-action.md`

## Scope

Design only in this activity (architectural path: questions, design, written spec, plan). Nothing is
created on SAP until the spec and plan are approved.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | FX scope | **FX transactions only** (`BAPI_FTR_FXT_DEALCREATE/DEALCHANGE/DEALGET/REVERSE/SETTLE`) | 2026-09-25 |
| 2 | LC scope | **Same set + Present/Terminate** (`BAPI_FTR_LC_DEALCREATE/DEALCHANGE/DEALGET/REVERSE/SETTLE` + `_PRESENT` + `_TERMINATE`) | 2026-09-25 |
| 3 | Child entities read-only or writable | **Fully writable** | 2026-09-25 |
| 4 | Which BOs get child entities | **Every BO where the BAPI has them** | 2026-09-25 |
| 5 | Design approval (first version: children per product BO via DEALCHANGE) | **Superseded by the human**: "condition, addl flow, main flow, payment details do it separate odata API irrespective whatever the product category" | 2026-09-25 |
| 7 | Revised design approval (one generic deal-item API over `BAPI_FTR_CONDITION_*`/`ADDFLOW_*`/`MAINFLOW_*`/`PAYDET_*`; LC and FX roots header-only) | Approved in conversation, with: **core fields for condition**, **ActivityCategory yes**, **same package and TR** | 2026-09-25 |
| 8 | LC test data (product type / company code) | not answered; spec assumes `38A` / `9999`, to confirm before Phase 3 | — |
| 9 | Written spec review (`docs/superpowers/specs/2026-09-25-1410-trm-deal-apis-design.md`) | **Approved**, with "add it for options BAPIs also" — FX option API added as spec §6a, build phase 3 (LC moves to phase 4) | 2026-09-25 |
| 10 | Implementation plan | Phase 1 written: `docs/superpowers/plans/2026-09-25-1410-trm-dealitem-api-phase1.md` (7 tasks). Plans 2 (FX), 3 (FX option), 4 (LC) follow after Phase 1, from the spec; awaiting plan review + execution method | 2026-09-25 |
| 6 | Settled indicator on the entity (L-571), and DELETE-on-settled semantics | **ActivityCategory yes**; DELETE keeps reversing one activity at a time | 2026-09-25 |

## Facts read (local catalog `context/sap-bapis/`, plus 2 `VTBFHA` queries)

- Child tables per BO (from each DEALGET signature): IRATE = CONDITION, ADDFLOW, MAINFLOW,
  PAYMENTDETAIL · LC = CONDITION, ADDFLOW, PAYMENTDETAIL (no MAINFLOW; LC also has presentations,
  documents, nominated banks, cash collateral, which are out of the stated scope) · FX = ADDFLOW,
  PAYMENTDETAIL.
- Child row keys: `BAPI_FTR_CONDITION-CONDITION_KEY`, `BAPI_FTR_FLOW-FLOW_KEY`,
  `BAPI_FTR_MAINFLOW-FLOW_KEY`; `BAPI_FTR_PAYDET` has **no key field**. `TABLEINDEX` links a value
  row to its `X` row.
- `BAPI_FTR_LC_TERMINATE` needs `TERMINATE_DATE` (+ optional `TERMINATE_DATE_INCLUSIVE`);
  `BAPI_FTR_LC_PRESENT` needs `ACTION_TYPE` + `PRESENTATION`/`FLOW`/`INVOICE` tables. Both need a
  parameter entity (new `ZFS_AE_*` objects).
- Deals by product category: FX = `SANLF 600` (company 9990: 40A 788, 40B 389, 40D 36; 9800: 40A 11);
  company **1000 has no FX and no LC deals**. LC candidate `SANLF 850` / `38A` in 9999 (8 deals), to
  be confirmed.

## Revision after the human's redirect (2026-09-25)

The four child types become **one separate, product-independent OData API** instead of children of
each product BO. Found product-independent, released BAPI families (all `RODIR.RELEASED = X`):
`BAPI_FTR_CONDITION_CREATE/CHANGE/DELETE/GETLIST`, `BAPI_FTR_ADDFLOW_*`, `BAPI_FTR_MAINFLOW_*`,
`BAPI_FTR_PAYDET_*`. Each is keyed on company code + deal + its own item key, so no
complete-indicator rewriting is needed:

- condition: `SIDE` + `CONDITIONKEY` (create also takes `EFFECTIVEFROM`, `REFERENCECONDITIONKEY`)
- additional flow / main flow: `SIDE` + `FLOWKEY`
- payment detail: `DIRECTION` + `EFFECTIVEDATE` + `FLOWTYPE` + `PAYMENTCURRENCY`

Field counts (value structures): condition change 83 / detail 91 · addflow 26 / detail 30 ·
mainflow 11 / detail 17 · paydet create 21, change 16 / detail 35.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-572, L-573, L-574

## 2026-09-25 15:42 — Plan 2 (FX) written

`docs/superpowers/plans/2026-09-25-1542-trm-fx-api-phase2.md`: 4 tasks (set-up + RED script,
read-only API, writable API + Settle, acceptance). Human instruction during writing: use the DEAL*
BAPIs (DEALCREATE/DEALCHANGE/DEALGET), recorded as L-581. The plan's deviation from the spec is
the LeadCurrency/FollowCurrency elements (create-only), which await human approval. No objects were
created on SAP. There were read-only lookups only (FM signatures, DD03L, I_FinancialTransaction,
TZPAT, AT10T).

## 2026-09-25 16:34 — Plan 4 (LC) written; Phase 3 (FX options) on hold

The human said "hold the fx options and continue LC". Plan file:
`docs/superpowers/plans/2026-09-25-1634-trm-lc-api-phase4.md`, 5 tasks:
1. set-up + RED script
2. read-only API
3. CRUD + Settle
4. Terminate/Present with two abstract entities
5. acceptance

- **Read-only discovery (L-585):** exactly 8 LC deals, all 9999 / 38A. This confirms the spec's assumed
  test data, and **closes spec §10 risk 1** subject to the human's approval of the plan. Also found:
  AT02T activity categories for 850, the Present ACTION_TYPE values, and the BAPI signatures.
- **Deviations awaiting approval:** read-only `LastPresentationItem`/`LastPresentationStatus` plus
  `PresentationItem` in the Present parameter; `ValuationClass`/`FlowType`; `DiscrepancyCurrency`; the
  Phase 2 review fixes carried in.
- **Blocker for execution:** the ADT runQuery session is exhausted; `/mcp` reconnect needed.
- **Also recorded:** L-585 corrects L-581. Category 600 has 40A/40B/40C/40D, not only 40A/40B.
