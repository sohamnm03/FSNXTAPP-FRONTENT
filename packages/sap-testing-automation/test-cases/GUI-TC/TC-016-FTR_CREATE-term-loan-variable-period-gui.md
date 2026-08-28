# TC-016 — FTR_CREATE: a variable-rate term loan's interest period is set, not defaulted

- **Case id:** TC-016
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** FTR_CREATE
- **Spec file:** — (GUI lane: `gui_tests/cases/tc016_term_loan_variable_period.py`)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** karthik.r@fourthsignal.com
- **Created:** 2026-08-19
- **Status:** draft
- **Writes to the database:** yes — one interest rate instrument per selected dataset row. Nothing is settled or posted.

## Purpose

Proves that the **length** of a variable-rate deal's interest period is accepted
on the 1000 / 22A / 100 profile and survives a save — monthly, quarterly and
half-yearly — and that SAP derives the period it was given rather than its own
default.

This is a different claim from TC-015, which is why that case is untouched.
TC-015 selects `Monthly` and *accepts* the interest period the screen defaults to
(`Every 1 Months`). TC-016 **sets** the count. A case that only ever accepted a
default could not have caught a period being silently ignored.

Not covered: settlement, posting, accrual and valuation. Those behave identically
for any interest structure and are already proven by TC-002 (web) and TC-014
(GUI); repeating them here would add commits and no information.

## The thing to know before reading the steps

**There is no "Quarterly" or "Half-yearly" frequency on this screen.** The
Interest Frequency dropdown was read live on DS4/100 on 2026-08-19 and offers
exactly seven entries:

| Key | Label |
|---|---|
| 1 | At End of Term |
| 5 | On First Day of Month |
| 2 | On Last Day of Month |
| 3 | Monthly |
| 4 | Daily |
| 0 | Manual Input |
| (blank) | (blank) |

The adjacent unit dropdown (`ARHYTM_UNIT`) offers only `Days` and `Months` and
reads `changeable=false` — it is derived, not chosen. So with `Monthly` selected
the unit is Months and the period is set by the **count** beside it
(`ARHYTM`, labelled `Every`), which is changeable and defaults to `1`:

| Asked for | Frequency | Every | Unit |
|---|---|---|---|
| Monthly | Monthly | 1 | Months |
| Quarterly | Monthly | 3 | Months |
| Half-yearly | Monthly | 6 | Months |

Anyone reading a request for "quarterly interest", looking for a Quarterly
dropdown entry and not finding one will assume the screen model has drifted, and
will go looking for a product bug that does not exist. Hence this section.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | `sap_get_session_info` — **stop if it is not** |
| 2 | Company code `1000` accepts product type `22A`, transaction type `100` | FTR_CREATE entry screen accepts them without error |
| 3 | Business partner `700000453` exists and resolves on the deal screen | Partner name renders next to the number |
| 4 | Reference interest rate `RBI_REPO` exists in the field's F4 list | F4 on Reference Interest Rate |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Rows live in `test-data/term-loan-variable-period.dataset.json` — add a period by
adding a row there, never by editing `gui_tests/modules/treasury.py`.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | 1000 |
| Product Type | `SFHAART` | 22A |
| Transaction Type | `SFHAZUART` | 100 |
| Business Partner | `PARTNR` | 700000453 |
| Amount | `BZBETR` | 100000 |
| Payment Currency | `WAERS` | INR (product default — asserted, never set) |
| Term Start | `XBLFZ` | 01.01.2026 |
| End of Term | `XELFZ` | 31.12.2026 |
| Contract Date | `DVTRAB` | 01.01.2026 (must be on or before term start) |
| Interest Category | — | Variable (key 2) |
| Reference Interest Rate | `SREFZS` | RBI_REPO |
| Interest Frequency | — | Monthly (key 3) |
| **Interest period** | **`ARHYTM`** | **per row: 1 / 3 / 6** |
| Interest period unit | `ARHYTM_UNIT` | Months — derived and read-only, asserted never set |
| General Valuation Class | — | Short Term (required on this profile) |
| Nominal Percentage Rate | `PKOND` | **not addressed** — removed from the screen when Interest Category is Variable |

## Steps

| # | Action | Tool | Element / argument |
|---|---|---|---|
| 1 | Attach to the open session | `sap_connect_existing` | — |
| 2 | Confirm system is DS4 / 100 | `sap_get_session_info` | **stop if it is not** |
| 3 | Start the transaction | `sap_execute_transaction` | `FTR_CREATE` |
| 4 | Entry screen: company code, product, txn type, partner | `sap_set_field` | `ftr-entry` model |
| 5 | Deal screen: amount, term start, term end, contract date | `sap_set_field` | structure fields first — SAP refuses to move on while any is empty |
| 6 | Interest Cat. to Variable, then Enter | `sap_select_combobox_entry` | key `2`. The `T1 183` error (*Enter a reference interest rate*) here is **expected** and proves the block rebuilt |
| 7 | Reference Interest Rate, then Enter | `sap_set_field` | `RBI_REPO`. Warning `W T1 129` is expected and non-blocking |
| 8 | Interest Frequency to Monthly | `sap_select_combobox_entry` | key `3`. Only changeable once step 7 is accepted |
| 9 | **Interest period — Every N** | `sap_set_field` | the row's `periodCount`, read back before continuing |
| 10 | Administr. tab: General Valuation Class | `sap_select_combobox_entry` | `Short Term` |
| 11 | **WRITE** — save | `sap_send_key` `F11` | confirm the check run at 0 terminations / 0 errors only |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Amount | `BZBETR` | `100000` (digits — SAP reformats) | `sap_read_field` |
| 2 | Term start | `XBLFZ` | `01.01.2026` | `sap_read_field` |
| 3 | End of term | `XELFZ` | `31.12.2026` | `sap_read_field` |
| 4 | Payment currency | `WAERS` | `INR` | `sap_read_field` |
| 5 | Interest category | — | `Variable` | combobox read-back |
| 6 | Reference interest rate | `SREFZS` | `RBI_REPO` | `sap_read_field` |
| 7 | Interest frequency | — | `Monthly` | combobox read-back |
| 8 | **Interest period (set, not defaulted)** | `ARHYTM` | **the row's count, and `Months`** | `sap_read_field` |
| 9 | General Valuation Class | — | `Short Term` | combobox read-back |
| 10 | Create check run | toolbar counters | `0` terminations, `0` errors | `sap_get_popup_window` |
| 11 | Confirmation message | `message` | `Interest rate instrument <n> in company code 1000 is created` | `sap_get_screen_info` |

Assertion 8 is the whole point of this case. Assertions 1–7 and 9–11 are shared
with TC-015 and are here so that a failure is attributable.

## Known non-failures

Both are recorded in every run file, and neither is a defect in what this case
tests:

| What SAP says | Why it is not a failure |
|---|---|
| `W T1 129` — *No interest calculation method entered for reference interest rate* | About `RBI_REPO`'s own configuration, not this deal's Int.Calc.Method, which reads `act/365`. Non-blocking — deals 160279–160283 all saved through it |
| *Partner 700000453 cannot be used, as per contract 01.01.2026* | One warning at the create check run, with `0` errors. Seen on every deal created on this profile (160280–160283). Looks like the partner's authorisation window starts after the contract date — **worth clearing before any of these deals is settled**, but it does not block the create |

## Running it

```
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-016 -Rows quarterly -DryRun
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-016 -Rows quarterly
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-016 -Rows monthly,quarterly,half-yearly
```

`-Stage entry` and `-Stage fill` write **nothing**, so they are this case's
harness smoke test. `-Rows` defaults to `quarterly`; `all` runs every row and
creates one deal per row, so it is named explicitly rather than defaulted to.

## History

| Date | Deal | Row | Run file |
|---|---|---|---|
| 2026-08-19 | 160283 | half-yearly | `results/TC-015H-2026-08-19-2037.md` — created as a one-off before this case existed |
