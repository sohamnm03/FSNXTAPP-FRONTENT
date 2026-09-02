# TC-013 — FTR_CREATE: term loan with variable interest rate (create only)

- **Case id:** TC-013
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE`
- **Spec file:** `web-tests/tests/ftr-term-loan-variable-rate.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-19
- **Status:** active
- **Writes to the database:** yes — creates one interest rate instrument

## Purpose

Proves a term loan can be created in `FTR_CREATE` with **variable** interest
(company code `1000`, product type `22A`, transaction type `100`, partner
`700000453` — the same profile TC-009/TC-012 use for fixed-rate loans),
instead of the fixed nominal rate every prior FTR_CREATE case has used.

Deliberately **create only**. Settlement and posting behave identically for
any interest structure and are already proven by TC-002; repeating them here
would add commits and no information (same scoping reasoning as TC-003).

Does **not** cover: settlement, posting, reversal, accrual/valuation, or
whether `Interest Markup/Markdown` / `Interest Rate for the First Period`
are actually mandatory — both were left blank and accepted by the screen
before save, but save-time behaviour was not tested (see Known deviations).

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `1000` exists | shown on the FTR_CREATE deal screen (confirmed by TC-009) |
| 2 | Product type `22A` with transaction type `100` is configured | FTR_CREATE entry screen accepts them (confirmed by TC-009) |
| 3 | Business partner `700000453` (TATA FIN PVT.LTD) exists | partner name resolves on the deal screen |
| 4 | Interest Category `Variable` is offered on this product/txn-type combination | confirmed live — `discover-ftr-1000-22a-variable-rate.spec.ts`, 2026-08-19 |
| 5 | Reference Interest Rate `RBI_REPO` exists on DS4 | confirmed live via the field's own F4 search help (16 codes total) — same discovery run |
| 6 | General Valuation Class resolves to `Short Term` | **required for this product/company combination** — TC-009's first live attempt on this same 1000/22A profile was refused at the check-run with `Fill the following required field: General Valuation Class` before anything saved; `Short Term` is the confirmed option label (`discover-ftr-gvc-field-type.spec.ts`). Not yet confirmed whether it is still required once Interest Category is Variable rather than Fixed — TC-013 sets it defensively, and the check-run will show if it was unnecessary |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

**Executable copy:** `test-data/term-loan-variable-rate.dataset.json`, row `baseline`.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `1000` |
| Product Type | `SFGTYP` | `22A` |
| Financial Transaction Type | `SFHAART` | `100` |
| Business Partner Number | `PARTNR` | `700000453` |
| Term Start | `DBLFZ` | `01.01.2026` |
| End of Term | `DELFZ` | `31.12.2026` |
| Amount | `BNWHR` | `100000` |
| Payment Currency | `WAERS` | `INR` |
| Interest Category | — | `Variable` |
| Reference Interest Rate | — | `RBI_REPO` — **not in the original request**, see Known deviations |
| Interest frequency | `SRHYTHM` | `Monthly` |
| Contract Date | `DVTRAB` | `01.01.2026` — **not in the original request**, defaults to Term Start |
| General Valuation Class (deal screen, Administr. tab) | — | `Short Term` — **not in the original request**, required for this product/company combination on every prior 1000/22A case (TC-009); see Preconditions #6 |

## Steps

Web lane. Run with `FLOW_STAGE` set — see the header comment in the spec.

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Open FTR_CREATE | `openTransaction` (via `openDealEntry`) | `FTR_CREATE` |
| 3 | **Confirm system is DS4 / 100** | `screenInfo` | **stop if it is not** |
| 4 | Fill co.code, product type, txn type, partner | `setFieldVerified` (via `openDealEntry`) | by `title` |
| 5 | Enter → deal screen (`TM_51` / `SAPLFTR_IRATE 1100`) | `pressKey` | `Enter` |
| 6 | Fill amount, term start/end, contract date | `mSet` (via `fillTermLoan`) | screen model `ftr-deal-irate` |
| 7 | Set Interest Category → Variable (rebuilds the interest block) | `selectDropdown` | `interestCategory` |
| 8 | Set Frequency Indicator → Monthly | `selectDropdown` | `frequencyIndicator` |
| 9 | Set Reference Interest Rate → RBI_REPO (typed directly, not chosen from F4) | `setFieldVerified` | `referenceInterestRate` |
| 9b | Switch to Administr. tab, select General Valuation Class = `Short Term`, switch back to Structure | `mClick` / `selectDropdown` | tab ids `M0:46:2::0:0-title` / `M0:46:2::0:3-title` — same requirement and mechanism as TC-009 step 6b, on the same product/company combination |
| 10 | Enter; confirm the working-day dialog if raised | `handleKnownPopups` | `SAFE_POPUP` |
| 11 | **Save the deal** | `clickButton` | resolved by `findSaveButton` |
| 12 | Confirm the check-run dialog (0 errors only — see Known deviations) | `handleSaveDialogs` | — |
| 13 | Capture the deal number from the message | `bodyText` | regex on the confirmation line |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Amount, post-round-trip | `BNWHR` | `100000` (compared numerically) | `mReadAll` |
| 2 | Term Start | `DBLFZ` | `01.01.2026` | `mReadAll` |
| 3 | End of Term | `DELFZ` | `31.12.2026` | `mReadAll` |
| 4 | Payment Currency | `WAERS` | `INR` | `mReadAll` |
| 5 | Interest Category | — | `Variable` | `mReadAll` |
| 6 | Reference Interest Rate | — | `RBI_REPO` | `mReadAll` |
| 7 | Frequency Indicator | `SRHYTHM` | `Monthly`, with a count and unit | `mRead` / `mReadOptional` |
| 8 | Save must not be refused before or during Save | — | no refusal text | `refusalLine` |
| 9 | Deal number | — | 5–12 digit number | captured from save confirmation |
| 10 | Check-run severity at save | terminations / errors | `0` / `0` — a non-zero count blocks the save and this case fails with no write, rather than being confirmed anyway | `readCheckRun` (via `handleSaveDialogs`) |

## Writes

- **Step 11 — Save the deal.** Creates one interest rate instrument in
  company code `1000`. Confirmed by the human at run time (CLAUDE.md rule 3).
  Nothing is settled or posted.

## Cleanup

None required. The deal is left in place, same convention as every other
FTR_CREATE case (TC-002, TC-003, TC-008, TC-009, TC-012).

## Known deviations

- **Reference Interest Rate is a data decision, not a discoverable default.**
  TC-003's `V10` variant (9800/10B profile) hit `Error: Enter a reference
  interest rate` and left it unresolved for that reason. TC-013 exists
  because the 1000/22A profile needed the same decision made — the F4
  search help was read live (16 codes) and `RBI_REPO` was chosen by the
  requester from that real list, not invented.
- **A non-blocking(?) check-run warning appears after Reference Interest
  Rate is set:** *"No interest calculation method entered for reference
  interest rate"*, even though `Interest Calculation Method` already shows
  `act/365`. Discovery did not save, so whether this is purely informational
  (like TC-002's own non-blocking check-run warnings) or an actual save-time
  blocker was **not resolved before this case was authored** — the shared
  `handleSaveDialogs()` only confirms a check run with 0 errors/0
  terminations, so if it does block, this case fails cleanly with no write
  and that becomes the next known deviation, not a guessed workaround.
- **`Interest Markup/Markdown` and `Interest Rate for the First Period`
  were left blank.** Both appeared on screen once Interest Category =
  Variable, both were empty with no mandatory-field indicator in discovery,
  and neither is set by this case. Untested whether SAP treats a blank
  markup as zero at save time.
- **General Valuation Class is set defensively, carried over from TC-009's
  finding on the identical 1000/22A profile** (fixed-rate case) rather than
  from anything the variable-rate discovery run itself observed — that run
  never opened the Administr. tab or clicked Save. If Interest Category =
  Variable turns out not to need it after all, the check-run will simply
  show no complaint about it; if TC-009's finding still holds, leaving it
  unset would have refused the save for a reason unrelated to the interest
  structure this case exists to test.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| | | | |
