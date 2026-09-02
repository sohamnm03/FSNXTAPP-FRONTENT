# TC-003 — FTR_CREATE: term loan variant matrix

- **Case id:** TC-003
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE` (create only), `FTR_EDIT → Display` (verification)
- **Spec file:** `web-tests/tests/ftr-variant-matrix.spec.ts`
- **Verification spec:** `web-tests/tests/verify-ftr-deals.spec.ts` (read-only)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional / exploratory-turned-regression
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** active
- **Writes to the database:** yes — one interest rate instrument per accepted variant

## Purpose

Establish, once, which structural variants of a 10B term loan SAP accepts on
DS4/100, which it refuses, and what it demands instead — so a later case can
pick a variant from a table instead of rediscovering the screen.

Deliberately **create only**. Settlement and posting behave identically for
every variant and are already proven by TC-002; repeating them here would add
twenty commits and no information.

Does **not** cover: settlement, posting, reversal, other product types, or
transaction types other than `200`.

## The variant surface (captured read-only)

`results/web/ftr-variant-fields.txt` holds the full capture: **8 dropdowns** with
every option and its Dynpro key, plus 22 text fields. Regenerate with
`DISCOVER=1 npx playwright test tests/discover-ftr-variants.spec.ts`.

| Dropdown | Options |
|---|---|
| Frequency Indicator (`SRHYTHM`) | At End of Term `1`, On First Day of Month `5`, On Last Day of Month `2`, Monthly `3`, Daily `4`, Manual Input `0` |
| Repayment Method | Final `1`, Instalment `2`, Annuity `3` |
| Interest Category | Fixed `1`, Variable `2`, Amount `3`, Scaled Interval `4`, Scaled Incremental `5` |
| Term Category | Fixed Term ` `, At Notice `X` |
| Interest Calculation Method | 30 entries — act/365 `3`, act/360 `2`, 360E/360 `1`, … |
| Calculation Period | Start Included ` `, End Included `X`, Start and End Included `Y`, Start and End Excluded `Z` |
| Rounding Category | Nearest ` `, Down `-`, Up `+`, Down If 5 `H` |
| Condition Group | `1000` only |

**Dropdowns are not text fields.** They are `readonly` with `ct="CB"`; `setField`
cannot drive them — use `selectDropdown`. Opening is not uniform: a force-click
opens *Frequency Indicator* but **not** *Term Category*; `Alt+ArrowDown` opens
both, so `selectDropdown` tries the click and then the accelerator.

## Test data

Identical to TC-002 for every variant — co.code `9800`, product `10B`, txn type
`200`, partner `400000003`, term `01.01.2026`–`31.12.2026`, `100000` AUD, rate
`10`, contract date `01.01.2026`. Only the variant field differs.

## Variants and results

| # | Variant | Field | Verdict | Deal |
|---|---|---|---|---|
| V01 | Baseline, SAP defaults | — | **CREATED** | 200110 |
| V02 | Interest monthly, month end | Frequency = On Last Day of Month | **CREATED** | 200111 |
| V03 | Interest monthly, term-start day | Frequency = Monthly | **CREATED** | 200112 |
| V04 | Interest monthly, first day | Frequency = On First Day of Month | **CREATED** | 200113 |
| V05 | Interest daily | Frequency = Daily | **CREATED** | 200114 |
| V06 | act/360 + End Included + Round Up | three fields | **CREATED** | 200115 |
| V07 | Term at notice | Term Category = At Notice | **REFUSED** | — |
| V08 | Instalment repayment | Repayment = Instalment | **REFUSED** | — |
| V09 | Annuity repayment | Repayment = Annuity | **REFUSED** | — |
| V10 | Variable interest | Interest Category = Variable | **REFUSED** | — |

## What each refusal actually means

Recorded so the next run does not have to rediscover them.

- **V07 — At Notice is not available for this product.** The option is in the
  generic list but SAP silently reverts the field to `Fixed Term`. It reverts
  with `End of Term` filled **and** with it left empty, so it is the product
  type / transaction type combination that rejects it, not a data conflict.
  There is no error message; the only symptom is the value changing back, which
  is why `selectDropdown` reads its value back and throws.
- **V08 / V09 — the cash flow builds correctly, but the deal will not save.**
  Selecting instalment or annuity grows the screen by `Treasury: Repayment
  Currency`, a **second** `Frequency Indicator` (repayment, default `Monthly`)
  and its `Defined Frequency` / `Unit`, and the Cash Flow tab then shows a
  correct schedule — 12 instalments of `8,333.33` plus the `100,000.00`
  drawdown. **Check** reports no errors, one warning (*"Repayment installment is
  determined internally"*). But Save produces no deal, no dialog and no message:
  the transaction stays on `SAPLFTR_IRATE/1100`. Ruled out: wrong Save button
  (resolved correctly to `M0:50::btn[11]`, tooltip `(Ctrl+S)`), a swallowed
  click (`Control+S` behaves the same), and saving from the Cash Flow tab
  (same from Structure; V01–V06 saved fine from Cash Flow). **Unresolved —
  worth re-testing in the `sap-gui` lane**, where the status bar is reliable;
  a WebGUI screen that refuses silently is exactly the case CLAUDE.md's
  "not the same rendering path" warning is about.
- **V10 — variable interest needs a reference rate.** `Error: Enter a reference
  interest rate`. The screen drops `Nominal Interest Rate` and grows
  `Reference Interest Rate`, `Interest Markup/Markdown` and `Interest Rate for
  the First Period`. Supply a reference rate that exists on DS4 to make this
  variant saveable — none was chosen, because picking one is a data decision.

## Verified on the saved deals, not on the entry screen

`verify-ftr-deals.spec.ts` reopens each deal through `FTR_EDIT → Display` and
reads what was stored. Full detail in `results/web/tc-003-saved-deals.md`.

| Deal | Frequency stored | Calc method | Cash-flow dates | Month-end |
|---|---|---|---|---|
| 200110 | At End of Term | act/365 | 2 | 1 |
| 200111 | On Last Day of Month | act/365 | 13 | **12** |
| 200112 | Monthly | act/365 | 13 | 1 |
| 200113 | On First Day of Month | act/365 | 13 | 1 |
| 200114 | Daily | act/365 | 31+ | 1 |
| 200115 | At End of Term | **act/360** | 2 | 1 |

200115 also stored `Round Up` and `End Included` against the baseline's
`Round to the Nearest` / `Start Included`.

## Known deviations

- **V03 and V04 are indistinguishable on this data.** `Monthly` and `On First
  Day of Month` both produced flows on the 1st of each month, because the term
  starts on `01.01.2026` and `Monthly` counts from the term start. They are
  genuinely different settings and would diverge for a term starting mid-month;
  do not use this data to tell them apart.
- **`Daily` reads as 31+ dates.** That is the visible ALV page, not the whole
  schedule — the grid was not paged. Treat the count as "many", not as 31.
- **`Frequency Indicator` is ambiguous once a repayment variant is active.**
  There are then two fields with that exact title — interest (upper) and
  repayment (lower). `selectDropdown` takes `nth`; the interest one is `nth 0`.
- **Re-running one variant used to destroy the summary.** The matrix now writes
  a per-variant JSON and rebuilds the summary by merging them, so
  `-g V08` no longer discards the other nine results.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | 6 CREATED / 4 REFUSED | `results/TC-003-2026-08-17-1402.md` | Deals 200110–200115; refusals documented |
