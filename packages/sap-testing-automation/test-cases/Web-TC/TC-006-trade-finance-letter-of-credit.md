# TC-006 — FTR_CREATE: Trade Finance (Letter of Credit, Sight LC) create → settle → post

- **Case id:** TC-006
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE` (create, opens t-code `FTRTLC01`), `FTR_EDIT → Settle`, `TBB1` (post)
- **Spec file:** `web-tests/tests/business-area-flows.spec.ts` (`DEAL_KEY=TF`)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional / regression
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** blocked — cannot complete on this system; see Known deviations
- **Writes to the database:** none committed. Every save attempt was refused
  before anything was written — see below.

## Purpose

One full create → settle → post cycle for the **Trade Finance** business area.
Reuses the shared runner in `business-area-flows.spec.ts`, same as TC-004/005/007.

## Why this product type

`38A` "Letter of Credit" is the direct, unambiguous match for "trade finance"
among the 146 product types on this system (siblings `38B` SBLC, `38C` Bank
Guarantee cover the same ground and were not needed once `38A` proved to
work). Its own F4 lists 4 transaction types
(`results/web/ftr-txn-types-38A.txt`); `100` "Sight LC" was chosen as the
simplest — no acceptance/usance financing terms to configure.

## Test data

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `9800` |
| Product Type | `VTGART` | `38A` (Letter of Credit) |
| Financial Transaction Type | `GESCHAEFTSART` | `100` (Sight LC) |
| Business Partner Number | `GPART` | `400000003` |
| Amount | — | `1000000` |
| Credit Amount Currency | `WAERS` | `AUD` (defaults from product type — not set explicitly) |
| Term From | — | `01.01.2026` — set explicitly, not left at SAP's today default (see TC-004's dating rationale) |
| Term To | — | `01.07.2026` |
| Contract Date | — | `01.01.2026` |
| Payment Term | — | `By Sight Payment` — matches the Sight LC transaction type |
| Beneficiary | — | **could not be satisfied** — see Known deviations. Not free text despite accepting typed input; requires a Vendor-role Business Partner, and none exists on this system. |
| Advising Bank / Confirming Bank | — | never reached — the run never got past Beneficiary |
| General Valuation Class | — | **not offered anywhere on this screen** — see Known deviations |
| TBB1 up to and incl. due date | — | never reached |
| TBB1 posting date (Posting Control) | — | never reached |

## Steps

Web lane, via the shared runner, staged like TC-002:

| # | Action | API | Notes |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | `FTR_CREATE`: Company Code, Product Type `38A`, Txn Type `100`, Partner, Enter | `openTransaction`, `setFieldVerified` | Opens `SAPLFTR_TLC/1111` (t-code `FTRTLC01`) — a third distinct deal-screen program |
| 3 | Fill Amount, Term To; select Payment Term; Enter | `setField`, `selectDropdown` | Rehearsed at `FLOW_STAGE=fill` first, no write |
| 4 | **Save** (WRITE 1) | `clickButton` + `handleSaveDialogs` | Captures the deal number |
| 5 | `FTR_EDIT`, select the deal, click Settle | `openTransaction`, `clickButton` | Same generic settle path as TC-002/004/005 |
| 6 | **Save the settlement** (WRITE 2) | `clickButton` + `handleSaveDialogs` | Skipped if already settled |
| 7 | `TBB1`, Test Run OFF, execute (WRITE 3) | `setCheckbox`, `clickButton` | Run directly — no simulation pass first, per the requester's 2026-08-18 standing instruction: never run a screen with its Test Run checkbox checked |

Run with:

```powershell
$env:DEAL_KEY="TF"; $env:FLOW_STAGE="post"; npx playwright test tests/business-area-flows.spec.ts -g "TC-006"
```

## Assertions

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | System / client, every transaction | `DS4` / `100` | `screenInfo` |
| 2 | Deal-screen error line after Enter | absent | `bodyText` |
| 3 | Save confirmation | a 5–12 digit deal number present | `bodyText` / `statusMessage` |
| 4 | Settlement status | matches `is changed\|is settled` (or already settled) | `statusMessage` |
| 5 | TBB1 live run | selected this deal, does **not** report "test run was successful" | `bodyText` |

## Writes

None completed — every save attempt was refused before committing anything:

1. **`FTR_CREATE` → Save** — **blocked**, never succeeded. See Known deviations.
2. **`FTR_EDIT` → Settle → Save** — not reached.
3. **`TBB1` with Test Run off** — not reached.

## Cleanup

None required — nothing was created.

## Known deviations

- **No simulation pass before the TBB1 live post, as of 2026-08-18.** Not
  reached in this case's run (TBB1 was never reached), but the process
  applies on any future re-run: TBB1 (and every other screen with a Test Run
  checkbox) runs straight to the live commit, per the requester's standing
  instruction — the checkbox is still driven to `false` and read back, just
  never driven to `true` first.
- **10 tabs on this deal screen** — Structure, Collateral, Presentation,
  Administration, Other Flows, Payment Details, Cash Flow, Memos, Partner
  Assignment, Status. Only Structure fields were needed for the data this
  case attempts.
- **`General Valuation Class` is required by Save's own check run
  (`"Fill the following required field: General Valuation Class"`) but is
  not present on any of this screen's 10 tabs** — checked systematically,
  not assumed (`results/web/probe-38a-valuation-class.txt`). Unlike TC-004
  (money market) and TC-007 (FX), where the same field lives on
  Administration and can be set, this product type appears to be missing the
  customizing assignment that would put a fillable field on screen at all.
  There is nothing this workspace's UI-driving test can do about a field
  that was never rendered.
- **`Beneficiary` looked optional on first discovery** (`FLOW_STAGE=fill`
  passed with it blank) **but is mandatory at Save**, revealed only by the
  check run: `"Enter the beneficiary"`. `FLOW_STAGE=fill` stops before Save,
  so it never exercises the check run — a case can look complete at `fill`
  and still be unable to save. Record this pattern for any future case using
  this shared runner.
- **`Beneficiary` is not free text, despite accepting typed input.** It
  validates against real Business Partner master data with a Vendor role:
  - Arbitrary text (`"Test Beneficiary Pty Ltd"`, silently truncated to
    `"TEST BENEF"` by the field's own length limit) → `"Business partner
    TEST BENEF does not exist"`.
  - This workspace's usual counterparty, `400000003` → `"BP role of
    0400000003 does not belong to the vendor"`.
  - A second known partner, `700000046` (issuer behind TC-005's debenture
    security classes) → the identical refusal, `"BP role of 0700000046 does
    not belong to the vendor"`.
  - The field's own F4 confirms it, not just these three attempts: **0 rows
    with every filter cleared** (`results/web/probe-beneficiary-cleared.txt`)
    — no Vendor-role business partner exists on DS4/100 at all.
- **Conclusion: this case cannot be completed from this workspace as it
  stands.** Both blockers (`General Valuation Class` unfillable, no
  Vendor-role partner for `Beneficiary`) are SAP master-data / customizing
  gaps, not defects in the test. Fixing either means work in the sibling
  `SAP-Project-Development V1` workspace (customizing) or business-partner
  master-data maintenance — out of scope here by design (CLAUDE.md: "No ABAP
  source lives here"). If that work happens, this case's spec and data
  (`business-area-flows.spec.ts`, `DEAL_KEY=TF`) are ready to run as-is;
  nothing about the test itself needs to change.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | BLOCKED | `results/TC-006-2026-08-17-1630.md` | No document created — General Valuation Class unfillable, no Vendor-role partner exists for Beneficiary |
| 2026-08-17 | BLOCKED | `results/TC-006-2026-08-17-1900-existing-deal.md` | Different company code (`9999`), a pre-existing deal (`100011`, BP `400000000`, Beneficiary BP `400000001`) — created/settled outside this workspace, proving both `9800` blockers are avoidable there (Gen. Valuation Class field exists, Beneficiary accepts a real vendor BP). TBB1 post still finds nothing due — same account-assignment gap pattern as TC-004/005. No write attempted. |
| 2026-08-17 | CREATED (create-only) | `results/TC-006-2026-08-17-1930-create-9999.md` | New deal `100024` on co.code `9999`, same partner pair (`400000000` / Beneficiary `400000001`), General Valuation Class = Short-term investments. Save succeeded (0 errors; the "Partner ... cannot be used" message is a warning, same as TC-004/005). Settle/TBB1 deliberately not attempted this run. |
