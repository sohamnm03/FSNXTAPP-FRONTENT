# TC-019 — FWZZ create a Class (26B) then FTR_CREATE a deal against it, WebGUI

- **Case id:** TC-019
- **Lane:** web (WebGUI)
- **Transaction / app:** `FWZZ` (Class), then `FTR_CREATE`
- **Spec file:** `web-tests/tests/fwzz-then-ftr-26b-mutual-fund.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthik.r@fourthsignal.com)
- **Created:** 2026-08-20
- **Status:** active
- **Writes to the database:** yes — creates one new Class (FWZZ) and one Investment transaction against it (FTR_CREATE), 2 writes total

## Purpose

Proves the full lifecycle the requester asked for: create a Class for
product type `26B` (Inv: Mutual Funds) via `FWZZ`, then create an
`FTR_CREATE` transaction of the **same** product type against that exact
class id, with mock data. TC-017 proved the class half in isolation; this
case is the first in this workspace to drive `FTR_CREATE` with `26B` at all,
and the first to chain the two transactions so the class id used by the deal
is the one this run just created — never a pre-existing or guessed id.

Does **not** cover: settlement, posting, or any product type other than
`26B`. Company code `9990` only — `9800` and `1000` (the only two this
workspace had used before) both refuse `26B` outright.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | registry guard in `sap-system.ts` + smoke suite |
| 2 | Business Partner `700000453` carries role `TR0150` (Issuer) | confirmed by TC-017 — Check (F8) reports "Data is consistent" |
| 3 | Product type `26B` is configured for company code `9990` | confirmed live, `discover-ftr-26b-cocode.spec.ts` — `9990` accepts it, `9800`/`1000` refuse it |
| 4 | Securities Account `1000` exists | confirmed live — its own F4 returns exactly one row |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Screen model control | Value |
|---|---|---|
| **Class (FWZZ)** | | |
| Product Type | `fwzz-create-dialog.productType` | `26B` (Inv:MF) |
| Short Name | `fwzz-create-dialog.shortName` | `NIIF BAL ADV` |
| Long Name | `fwzz-create-dialog.longName` | `NIIF Balanced Advantage Fund - Growth` |
| Issuer | `fwzz-class-master.issuer` | `700000453` (TATA FIN PVT.LTD / MUMBAI) |
| Issue Currency | `fwzz-class-master.issueCurrency` | `INR` |
| Issue Start Date | `fwzz-class-master.issueStartDate` | `20.08.2026` — added 2026-08-20 at the requester's direction; optional field, unset by TC-017 |
| Nominal Value | `fwzz-class-master.nominalValue` | `100000` — added 2026-08-20 at the requester's direction; optional field, unset by TC-017 |
| **Deal (FTR_CREATE)** | | |
| Company Code | `ftr-create-entry.companyCode` | `9990` (XYZ Ltd) |
| Product Type | `ftr-create-entry.productType` | `26B` |
| Financial Transaction Type | `ftr-create-entry.transactionType` | `100` (Investment) |
| Security Class ID Number | `ftr-create-entry.classId` | the id this run's own FWZZ write just created |
| Business Partner Number | `ftr-create-entry.partner` | `400000003` |
| Securities Account | `ftr-26b-deal.securitiesAccount` | `1000` |
| General Valuation Class | `ftr-26b-deal.generalValuationClass` | `Short Term` |
| Number of Units | `ftr-26b-deal.numberOfUnits` | `1000` |
| Price | `ftr-26b-deal.price` | `100` |
| Calculation Date / Payment Date | `ftr-26b-deal.{calculationDate,paymentDate}` | today — read off SAP's own `Position Value Date` default, never hardcoded |

Mock data authored by Claude at the user's request, 2026-08-20 — see
`test-data/fwzz-then-ftr-26b-mutual-fund.dataset.json`'s `authorised` note
for how every deal-side value was found live rather than guessed.

## Steps

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | Open FWZZ, press Create (id left blank) | `openClassEntry` | 26B is internally numbered — same finding as TC-017 |
| 2 | Fill + confirm the Create Class dialog | `fillCreateDialog` | Status/Reference radios left at SAP's defaults (Active, Without Reference) |
| 3 | Switch to Basic Data, fill Issuer + Issue Currency | `fillClassBasicData` | — |
| 4 | Check (F8) — validates only | `checkClass` | — |
| 5 | **Save the class (writes)** | `saveClass` | **WRITE 1** — human confirms first |
| 6 | Open FTR_CREATE, fill co.code / 26B / txn type / **the new class id** / partner | `openMutualFundDealEntry` | reaches `SAPLTTM_UI_FRAMEWORK/1110` — a different program from the term-loan screens |
| 7 | Fill Securities Account, General Valuation Class, Units, Price, Calculation/Payment Date (derived from SAP's own default) | `fillMutualFundDeal` | — |
| 8 | Check (F6) — validates only | `checkMutualFundDeal` | tolerates exactly one known warning, "No payment details entered for transaction" — fails on anything else |
| 9 | **Save the deal (writes)** | `saveMutualFundDeal` | **WRITE 2** — human confirms first. Presses Enter (to re-validate and clear the payment-details warning) *before* Save — a bare Save press does not commit, see Known deviations |

## Assertions

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | Product Type as typed (class) | `26B` | `mRead`, checked in `fillCreateDialog` |
| 2 | Issuer / Issue Currency round-trip (class) | contain `700000453` / `INR` | `mRead` |
| 3 | Check (F8) result (class) | no errors | `readPopup` |
| 4 | ID Number after Save (class) | a real, non-placeholder value | `mRead` |
| 5 | Number of Units round-trip (deal) | `1000` (compared numerically — SAP reformats to `1,000`) | `mRead` |
| 6 | Securities Account / General Valuation Class round-trip (deal) | `1000` / contains `Short Term` | `mRead` |
| 7 | Check (F6) result (deal) | clean, or only the known payment-details warning | `statusMessage` |
| 8 | Save confirmation names the deal | a 4–12 digit deal number | `statusMessage` |

## Writes

- **Step 5 — Save the class.** Creates one new Class (`26B`). Confirmed by the human at run time.
- **Step 9 — Save the deal.** Creates one Investment transaction (`26B`/`100`) against that class, in company code `9990`. Confirmed by the human at run time.

Every other step is read-only — Create (F5, step 2) and Enter (step 6) open
screens but do not commit, and both Check calls (steps 4, 8) validate
without committing.

## Cleanup

Both objects are left in place: the Class, identified by its server-assigned
ID Number, and the deal, identified by SAP's own confirmation number — both
recorded in the run's result file and in
`results/web/.../tc-019-{class-id,deal-number}.txt`. None required beyond
that.

## Known deviations

- **Company code `9990`, not `9800` or `1000`.** Both of the company codes
  this workspace had used before refuse `26B` outright: "Product type 26B
  not available in company code 9800/1000". `discover-ftr-26b-cocode.spec.ts`
  read the Company Code field's own F4 (12 codes) and tried each untested
  one live; `0001` and `9990` both accept it — `9990` was chosen per the
  requester's direction.
- **The FTR_CREATE deal screen for 26B is a different program entirely** from
  the term-loan screens this workspace already models
  (`SAPLTTM_UI_FRAMEWORK/1110`, not `SAPLFTR_IRATE`) — its own Check button
  is F6, not F8, and it has 8 tabs (Structure, Administr., Other Flows,
  Payment Details, Cash Flow, Memos, Partner Assignment, Status) where the
  term-loan screen has none of the same names.
- **General Valuation Class on the deal screen is a dropdown, not an F4
  field.** `openValueHelp` throws "did not open on F4" — use `selectDropdown`
  (as `fillMutualFundDeal` does). Discovered the hard way: the first attempt
  at this field left a stray overlay (`urPopupWindowBlockLayer`) that blocked
  every subsequent click until the run was restarted.
- **Check (F6) reports "No payment details entered for transaction" as a
  status-bar WARNING**, not an error — the status text is literally prefixed
  "Warning:". This case's `checkMutualFundDeal` tolerates exactly that one
  message and fails on anything else; the Payment Details tab itself is
  never filled or even opened by this case.
- **Save itself still refuses past that warning on the first press, and a
  second or third bare Save press changes nothing.** Confirmed live,
  `discover-ftr-26b-save-twice.spec.ts` — pressing the one real Save control
  (`M0:50::btn[11]`, the only Save-related element on screen, confirmed by
  `discover-ftr-26b-save-button.spec.ts`) three times in a row changed
  neither the Transaction field nor the status message. **The sequence that
  actually commits is Enter, Save, Enter** — confirmed live the same day
  against class `300025` (a class TC-019's own first, buggy live run had
  already created but left with no deal): the confirmation ("Financial
  transaction saved under number 23000140") appeared only after the
  *second* Enter, not right after the Save click. `saveMutualFundDeal` runs
  this exact three-step sequence, checking the status message for a deal
  number after each step so it stops as soon as SAP reports one; a Save
  button that fails to resolve after the first Enter is treated as a
  possible symptom of the deal already being saved (the screen can move on),
  not as an error in itself.
- **Calculation Date and Payment Date are never hardcoded.** SAP defaults
  `Position Value Date` to the run's own current date on every attempt;
  `fillMutualFundDeal` reads that value back off the screen and reuses it
  for the two fields that are *not* auto-defaulted, so this case does not go
  stale the day after it is authored.
- **Business Partner `400000003` resolves to a different display name in
  this context** ("MUFG Bank Ltd / 25/1 Macquarie Place / Sydney NSW 2000")
  than it does on the FTR term-loan screens elsewhere in this suite (where it
  is used as a plain deal counterparty). Not investigated further — the
  partner number itself is what this case asserts, not the resolved name.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-20 | FAIL (class write succeeded, deal write did not) | `results/TC-019-2026-08-20-0025.md` | Created Class `300025` (WRITE 1 succeeded). WRITE 2 failed: `saveMutualFundDeal` pressed Save once and read no deal number back — a bare Save press does not commit past the payment-details warning (see Known deviations). |
| 2026-08-20 | (manual, not the frozen script) | — | Confirmed the real sequence live against the same orphaned class `300025`: Enter, Save, Enter produced "Financial transaction saved under number 23000140" — the confirmation only appeared after the *second* Enter. Not run through `saveMutualFundDeal`, so not counted as a case run. |
| 2026-08-20 | FAIL (class write succeeded, deal write did not) | `results/TC-019-2026-08-20-0045.md` | First fix attempt (Enter-then-Save only) was incomplete — created Class `300026` (WRITE 1), but `saveMutualFundDeal`'s Save click failed to resolve (the screen had already moved on after the first Enter) and the module raised before trying the second Enter. Corrected to the full three-step Enter/Save/Enter sequence with a status check after each step. |
| 2026-08-20 | PASS | `results/TC-019-2026-08-20-0050.md` | Both writes succeeded: Class `300027`, deal `23000142` (confirmation: "Financial transaction saved under number 23000142" — appeared after the second Enter, as expected). One deviation recorded: the same benign "unexpected popup right after Create (F5)" false-positive TC-017 hit (the WebGUI sidebar's System Info panel, no message, no buttons) — fixed in `fillCreateDialog` (and in TC-017's own spec) after this run, so it does not count toward the freeze gate but a future run should be genuinely clean. |

Two PASS runs of the frozen script, with no deviations, are needed before
`Status:` may become `frozen`. It is `draft` until the script has run at
least once as written.
