# TC-020 — FWZZ create a Class (26B) then FTR_CREATE a deal against it (SAP GUI for Windows)

- **Case id:** TC-020
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FWZZ` (Class), then `FTR_CREATE`
- **Spec file:** `gui_tests/cases/tc020_fwzz_then_ftr_26b_mutual_fund.py` (run it with `scripts/run-gui-case.ps1 -Case TC-020`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthik.r@fourthsignal.com)
- **Created:** 2026-08-20
- **Status:** active
- **Writes to the database:** yes — creates one new Class (FWZZ) and one Investment transaction against it (FTR_CREATE), 2 writes total

## Purpose

GUI-lane sibling of TC-019 (web lane, WebGUI/ITS). Proves the same chained
flow — create a Class for product type `26B` via `FWZZ`, then create an
`FTR_CREATE` transaction of the same product type against that exact class
id — through **SAP GUI for Windows**. Reuses TC-018's proven FWZZ functions
(three prior live classes: `300023`, `300026`, `300027`) for the class half;
the FTR_CREATE half is new to this lane.

A notable finding while building this case: the FTR_CREATE deal screen turned
out to be the **exact same program** (`SAPLTTM_UI_FRAMEWORK`) on both lanes,
with the **identical** Enter/Save/Enter commit sequence the web lane found —
see Known deviations. That is strong evidence the quirk is a backend/business
logic behavior of the transaction itself, not an artifact of either rendering
path.

Does **not** cover: settlement, posting, or any product type other than
`26B`. Company code `9990` only, per the web lane's finding (`9800`/`1000`
both refuse `26B`) — not independently re-tried on this lane since it is
master data, not a rendering-path fact.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | `assert_dev_system` — **stop if it is not** (rule 1) |
| 2 | Business Partner `700000453` carries role `TR0150` (Issuer) | confirmed by TC-018 |
| 3 | Product type `26B` is configured for company code `9990` | confirmed live on the web lane, not re-tested independently here |
| 4 | Securities Account `1000` exists | confirmed live on the web lane (its own F4 returns exactly one row) |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `CLASS_DATA` / `DEAL_SPEC`
(`gui_tests/cases/tc020_fwzz_then_ftr_26b_mutual_fund.py`), mirroring TC-019's
(web lane) baseline exactly.

| Field | Technical name | Value |
|---|---|---|
| **Class (FWZZ)** | | |
| Product Type | `SECURITY_CREATE-PRODUCT_TYPE` | `26B` (Inv:MF) |
| Short Name | `SECURITY_CREATE-SHORT_TEXT` | `NIIF BAL ADV` |
| Long Name | `SECURITY_CREATE-LONG_TEXT` | `NIIF Balanced Advantage Fund - Growth` |
| Issuer | `SECURITYV-ISSUER` | `700000453` (TATA FIN PVT.LTD / MUMBAI) |
| Issue Currency | `SECURITYV-ISSUE_CURRENCY` | `INR` |
| Issue Start Date | `SECURITYV-ISSUE_START` | `20.08.2026` — added 2026-08-20 at the requester's direction; optional field, unset by TC-018 |
| Nominal Value | `SECURITYV-NOMINAL_VALUE_S` | `100000` — added 2026-08-20 at the requester's direction; optional field, unset by TC-018 |
| **Deal (FTR_CREATE)** | | |
| Company Code | `FTR_ENTRY-BUKRS` | `9990` (XYZ Ltd) |
| Product Type | `FTR_ENTRY-SGSART` | `26B` |
| Transaction Type | `FTR_ENTRY-SFHAART` | `100` (Investment) |
| Security Class | `FTR_ENTRY-RANL` | the id this run's own FWZZ write just created |
| Business Partner | `FTR_ENTRY-KONTRH` | `400000003` |
| Securities Account | `TTMS_SEC_STRUCTURE-RLDEPO` | `1000` |
| General Valuation Class | `TTMS_SEC_STRUCTURE-RCOMVALCL` | key `5` ("Short Term") |
| Number of Units | `TTMS_SEC_STRUCTURE-XASTUECK` | `1000` |
| Price | `TTMS_SEC_STRUCTURE-BUPRC` | `100` |
| Calculation Date / Payment Date | `TTMS_SEC_STRUCTURE-{DVALUTX,XZTERM}` | today — read off SAP's own `Position Value Date` default, never hardcoded |

## Steps

GUI lane, frozen script. Every element id lives in
`gui_tests/screens/{fwzz-entry,fwzz-create-dialog,fwzz-class-master,ftr-entry,ftr-26b-deal}.json`
with the date it was discovered — a case never contains a literal id
(CLAUDE.md rule 4). The FTR_CREATE ids were discovered with
`sap_get_screen_elements` / `sap_get_toolbar_buttons` on DS4/100 on
2026-08-20; re-discover before reusing against another system.

Stages: `class-entry` → `class-dialog` → `class-basic` → `class-save` →
`deal-entry` → `deal-fill` → `deal-save`. A run stops after the stage it was
asked for. Every stage before `class-save`/`deal-save` writes **nothing**.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | **stop if it is not** (rule 1) |
| 2 | Open FWZZ, press Create (id left blank) | `open_class_entry` → `open_create_dialog` | 26B is internally numbered |
| 3 | Fill + confirm the Create Class dialog | `fill_create_dialog` → `press_create_confirm` | Status/Reference radios driven explicitly |
| 4 | Fill Basic Data, Check (F8) | `fill_basic_data`, `check_class` | — |
| 5 | **Save the class (writes)** | `save_class` | **WRITE 1** — human confirms first |
| 6 | Open FTR_CREATE, fill co.code / 26B / txn type / **the new class id** / partner | `open_mutual_fund_deal_entry` | reaches `SAPLTTM_UI_FRAMEWORK/1110` |
| 7 | Fill Securities Account, General Valuation Class, Units, Price, Calculation/Payment Date (derived from SAP's own default) | `fill_mutual_fund_deal` | — |
| 8 | Check (F6) — validates only | `check_mutual_fund_deal` | tolerates exactly one known warning |
| 9 | **Save the deal (writes)** | `save_mutual_fund_deal` | **WRITE 2** — human confirms first. Runs Enter, Save, Enter — a bare Save press does not commit, see Known deviations |

## Assertions

Every row below is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot
disagree.

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | Product Type as typed (class) | `26B` | `set_field_verified` |
| 2 | Issuer / Issue Currency round-trip (class) | `700000453` / `INR` | `set_field_verified` |
| 3 | Issuer resolves to a name (class) | non-blank | `read_field`, after Enter |
| 4 | Check (F8) result (class) | "Data is consistent" | `read_field` / `get_screen_info` |
| 5 | ID Number after Save (class) | a real, non-placeholder value | `read_field` |
| 6 | Number of Units / Price round-trip (deal) | `1000` / `100` | `read_field` |
| 7 | Securities Account round-trip (deal) | `1000` | `set_field_verified` |
| 8 | Check (F6) result (deal) | clean, or only the known payment-details warning | `get_screen_info` |
| 9 | Save confirmation names the deal | "Financial transaction \<number\> saved" | `get_screen_info` |

## Writes

- **Step 5 — Save the class.** Creates one new Class (`26B`). Confirmed by the human at run time.
- **Step 9 — Save the deal.** Creates one Investment transaction (`26B`/`100`) against that class, in company code `9990`. Confirmed by the human at run time.

Every other step is read-only.

## Cleanup

Both objects are left in place: the Class, identified by its server-assigned
ID Number, and the deal, identified by SAP's own confirmation number — both
recorded in the run's result file. None required beyond that.

## Known deviations

- **The FTR_CREATE deal screen for 26B is the exact same program
  (`SAPLTTM_UI_FRAMEWORK/1110`) on this lane as on the web lane** — not a
  coincidence of similar customising, but literally the same backend
  transaction rendered two ways. Its Check button is F6 (`tbar[1]/btn[6]`),
  not F8.
- **General Valuation Class is a `GuiComboBox`, selected by key (`5` =
  "Short Term"), not by typing text.** Key `1` ("Short-term investments") is
  a different, similarly-named entry — do not confuse them.
- **Check (F6) reports "No payment details entered for transaction" as a
  status-bar WARNING** (message class `FTR0`, number `030`, type `W`), not an
  error. `check_mutual_fund_deal` tolerates exactly that one message and
  fails on anything else; the Payment Details tab itself is never filled or
  even opened by this case.
- **Save itself still refuses past that warning on a single press.** The
  sequence that actually commits is **Enter, Save, Enter** — confirmed live,
  2026-08-20, against an orphaned class (`300026`, created by an earlier web
  lane run) before this case module existed: pressing Save right after Check
  reproduced the identical warning, message class `FTR0` `030`, with the
  Transaction field unchanged; the confirmation ("Financial transaction saved
  under number 23000143", message `T1` `033`) appeared only after the
  *second* Enter, and the screen navigated back to `FTR_ENTRY` at that point.
  `save_mutual_fund_deal` runs this exact three-step sequence, checking the
  status message for a deal number after each step, and treats a Save button
  that fails to resolve after the first Enter as a possible symptom of the
  deal already being saved (the screen can move on) rather than an error in
  itself — identical design to the web lane's `saveMutualFundDeal`.
- **Calculation Date and Payment Date are never hardcoded.** SAP defaults
  `Position Value Date` to the run's own current date on every attempt;
  `fill_mutual_fund_deal` reads that value back off the screen and reuses it
  for the two fields that are *not* auto-defaulted.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-20 | PASS | `results/TC-020-2026-08-20-0102.md` | First run of the frozen script, first-try clean — no fix cycle needed (the class flow was already proven by TC-018, and the deal flow's Enter/Save/Enter sequence had already been confirmed live before this module was written). Created Class `300028`, deal `23000144`. One deviation recorded: the known, deliberately-tolerated "No payment details entered for transaction" warning — logged by `check_mutual_fund_deal` on purpose, not a bug, but it still means this run does not count toward the freeze gate under `check-suite.ps1`'s rule 6 (any recorded deviation disqualifies a PASS). |

Two PASS runs of the frozen script, with no deviations, are needed before
`Status:` may become `frozen`. It is `draft` until the script has run at
least once as written.
