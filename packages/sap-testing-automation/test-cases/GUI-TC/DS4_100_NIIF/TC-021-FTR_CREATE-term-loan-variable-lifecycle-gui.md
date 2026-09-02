# TC-021 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1 (SAP GUI for Windows): term loan with variable interest, settled, posted and month-end valued

- **Case id:** TC-021
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `gui_tests/cases/tc021_term_loan_variable_lifecycle.py` (run it with `scripts/run-gui-case.ps1 -Case TC-021`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by saumya.s@fourthsignal.com)
- **Created:** 2026-08-24
- **Status:** draft
- **Writes to the database:** yes — creates an interest rate instrument with variable interest, settles it, posts its due flows, then runs month-end accrual/deferral (TPM44) and valuation (TPM1) for the same deal

## Purpose

Proves the full term-loan lifecycle — create, settle, post, accrue, value —
for a deal carrying **variable** interest, on the `1000` / `22A` / `100`
profile, through SAP GUI for Windows.

This is a new combination, not a new business question: TC-014 already proves
the settle -> TBB1 -> TPM44 -> TPM1 lifecycle (fixed interest), and TC-015
already proves the variable-interest deal screen fill (create only, deliberately
scoped out settlement and posting as adding no new information at the time).
This case exists because the request that produced it asked for both together.
It reuses both proven pieces from `gui_tests/modules/treasury.py` unchanged —
`fill_term_loan_variable` / `VariableRateTerms` from TC-015's side,
`settle_deal` / `post_flows` / `run_accrual_deferral` / `run_valuation` from
TC-014's — rather than re-deriving either.

Does **not** cover: month 2 onward, reversal of any of the five steps,
verification of the resulting FI documents in `FB03`, or a non-zero interest
spread (see TC-015's Known deviations — markup/markdown is left blank and SAP
stores it as zero).

## Preconditions

Same as TC-014/TC-015 (company code `1000`, product type `22A`/txn type `100`,
partner `700000453`, currency `INR` default) plus TC-015's variable-interest
preconditions.

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `1000` exists | deal screen header `VTGFHA-BUKRS` = `1000` |
| 2 | Product type `22A`/txn type `100` lands on `SAPLFTR_IRATE 1100` | `open_deal_entry` raises `WriteRefused` if it does not |
| 3 | Partner `700000453` resolves | `VTGFHA-XKONTRH` resolves to a name |
| 4 | Currency `INR` defaults | `VTG_INVEST-WZBETR` = `INR`, not changeable |
| 5 | Interest Category `Variable` (key `2`) is offered on this product/txn-type combination | confirmed live by TC-015, 2026-08-19 |
| 6 | Reference Interest Rate `RBI_REPO` exists on DS4 | confirmed live by TC-015, 2026-08-19 |
| 7 | Interest frequency `Monthly` (key `3`) is offered | confirmed live by TC-015, 2026-08-19 |
| 8 | General Valuation Class `Short Term` (key `5`) resolves and is required | confirmed live by TC-015, 2026-08-19 |
| 9 | General Valuation Class / TPM44-TPM1 Valuation Class are two distinct fields | confirmed by TC-014 — see its Steps 6b, 10, 12 |
| 10 | Deal not already settled on re-run | not exercised until this case's first run |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `BASELINE` / `TERMS` / `TPM`
(`gui_tests/cases/tc021_term_loan_variable_lifecycle.py`), the same convention
TC-014 and TC-015 both follow.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `FTR_ENTRY-BUKRS` | `1000` |
| Product Type | `FTR_ENTRY-SGSART` | `22A` |
| Transaction Type | `FTR_ENTRY-SFHAART` | `100` |
| Partner | `FTR_ENTRY-KONTRH` | `700000453` |
| Amount | `VTG_INVEST-XZBETR` | `100000` |
| Term Start | `VTG_TERM-XBLFZ` | `01.01.2026` |
| End of Term | `VTG_TERM-XELFZ` | `31.12.2026` |
| Payment Currency | `VTG_INVEST-WZBETR` | `INR` — asserted, never set |
| Interest Category | `VTG_IRATE_STRUCTURE-IRATE_STRUCTURE` | `Variable` (key `2`) |
| Reference Interest Rate | `VTG_IRATE_STRUCTURE-SZSREF` | `RBI_REPO` — **not in the original request**, reused from TC-015's data decision, see Known deviations |
| Interest Frequency | `VTG_IRATE_STRUCTURE-SRHYTHM` | `Monthly` (key `3`) |
| Contract Date | `VTGFHAZU-XVTRAB` | `01.01.2026` |
| General Valuation Class | `VTGFHA-RCOMVALCL` | `Short Term` (key `5`) |
| TBB1 Up to Due Date / Posting Date | `P_DZTERM` / `P_BUDAT` | `01.01.2026` / `01.01.2026` |
| TPM44/TPM1 Valuation Area / Class | `SO_VAREA-LOW` / `SO_VCLS-LOW` | `001` / `0005` |
| TPM44/TPM1 Key Date | `P_KEYDAT` / `KEYDATE` | `31.01.2026` — month-end of the term start, one month only |
| TPM1 Valuation Category | `cmbVALCAT` | `Mid-Year Valuation with Reset` — always this value for this workspace |

## Steps

GUI lane, frozen script. Every element id lives in `gui_tests/screens/ftr-entry.json`,
`ftr-deal-irate.json`, `tbb1-selection.json`, `tpm44-selection.json` and
`tpm1-selection.json` — all discovered live on DS4/100 by TC-014 and TC-015 on
2026-08-19 and unchanged here (CLAUDE.md rule 4: no literal id in a case).

Stages: `entry` -> `fill` -> `save` -> `settle` -> `post` -> `tpm44` -> `tpm1`.
A run stops after the stage it was asked for; `entry` and `fill` write **nothing**.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | runs again on every `start_transaction`; **stop if it is not** (rule 1) |
| 2 | Open `FTR_CREATE`, fill co.code / product type / txn type / partner | `open_deal_entry` | each field set and read back |
| 3 | Fill amount, term start/end, contract date | `fill_term_loan_variable` | structure fields first — SAP refuses the Administr. tab switch while any is empty |
| 4 | Interest Cat. → `Variable`, then Enter | `fill_term_loan_variable` | the `T1 183` error on this Enter is expected — proves the interest block rebuilt |
| 5 | Reference Interest Rate → `RBI_REPO`, then Enter | `fill_term_loan_variable` | unlocks Frequency; warning `T1 129` recorded, non-blocking |
| 6 | Confirm the working-day dialog if raised | `fill_term_loan_variable` → `_confirm_working_day_dialog` | only the "Not a Working Day" family is auto-confirmed |
| 7 | Frequency → `Monthly` | `fill_term_loan_variable` | refuses with `WriteRefused` if still read-only |
| 8 | Administr. tab → General Valuation Class = `Short Term`, back to Structure | `fill_term_loan_variable` | successful switch is indirect proof the Structure fields were accepted |
| 9 | **Save the deal** | `save_deal` | **WRITE 1** — confirmed by the human at run time |
| 10 | Open FTR_EDIT, click **Settle**, **Save** | `settle_deal` | **WRITE 2** — COM-disconnect-safe (`write_guarded`), verified via the read-only History screen |
| 11 | Open TBB1, Test Run off, **execute** — no simulation pass first | `post_flows` | **WRITE 3** |
| 12 | Open TPM44, Test Run off, **execute** | `run_accrual_deferral` | **WRITE 4** |
| 13 | Open TPM1, Valuation Category = `Mid-Year Valuation with Reset`, Test Run off, **execute**, then **Run Valuation** | `run_valuation` | **WRITE 5** — F8 only selects positions; the write is pressing Run Valuation |

## Assertions

Every row is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot disagree —
same convention as TC-015.

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | System / client | `DS4` / `100`, logged-on user | `assert_dev_system` |
| 2 | Amount / Term Start / End round-trip | `100000` / `01.01.2026` / `31.12.2026` | `set_field_verified` |
| 3 | Interest category | `Variable` | `select_combobox` |
| 4 | Reference interest rate | `RBI_REPO` | `set_field_verified` |
| 5 | Interest frequency | `Monthly` | `select_combobox` |
| 6 | General Valuation Class | `Short Term` | `select_combobox` |
| 7 | Create check-run | 0 terminations, 0 errors | `read_check_run` |
| 8 | Create confirmation names the deal | `interest rate instrument <n> ... is created` | `save_deal` → `describe` |
| 9 | Settle confirmed | `is changed` / `is settled`, or already-settled on resume | `settle_deal` |
| 10 | TBB1 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 11 | TBB1 live post names the deal in its posting log | posting log contains the deal number | `post_flows` |
| 12 | TPM44 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 13 | TPM44 protocol mentions the key date | `31.01.2026` present | `run_accrual_deferral` |
| 14 | TPM1 Valuation Category | `Mid-Year Valuation with Reset` | `select_combobox` |
| 15 | TPM1 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 16 | TPM1 moved past position selection into an actual valuation | screen title contains `Valuation Log` | `run_valuation` |

## Writes

Five, all authorised by the requester (conversation confirmation, 2026-08-24):

1. **`FTR_CREATE` Save** — creates the interest rate instrument (variable interest, `RBI_REPO`, monthly).
2. **`FTR_EDIT` → Settle → Save** — settles it.
3. **`TBB1` with Test Run off** — posts the due flows, run directly.
4. **`TPM44` with Test Run off** — posts accrual/deferral at key date `31.01.2026`.
5. **`TPM1` with Test Run off** — posts valuation at the same key date.

## Cleanup

None required. The deal is left in place — created, settled, posted and
month-end valued — same convention as TC-014.

## Known deviations

Carried forward from TC-014 and TC-015, since this case's script is those two
cases' logic unchanged, only stitched together and pointed at the same deal:

- **`Ref. Int. Rate` = `RBI_REPO` is a data decision, not a discoverable
  default**, reused from TC-015 rather than re-decided: the request that
  produced this case did not name a reference rate either. Change it in the
  case module (`TERMS`) if a different rate is intended.
- **`T1 183` on the Interest Cat. → Variable Enter is expected**, not a
  failure — it proves the interest block rebuilt and the reference rate is
  mandatory.
- **Warning `W T1 129`** ("No interest calculation method entered for
  reference interest rate") is expected on the reference-rate Enter,
  non-blocking.
- **One non-blocking check-run warning at save/settle:** *"Partner 700000453
  cannot be used, as per contract 01.01.2026"*. Confirmed only at 0
  terminations / 0 errors, same rule as every other FTR_CREATE case.
- **TBB1/TPM44/TPM1 `Test Run` all default to ON** — each driven to `false`
  and confirmed before executing (CLAUDE.md rule 3a).
- **A COM disconnect mid-settle is handled, not assumed away** — `settle_deal`
  uses the same `write_guarded` path TC-014's incident forced into
  `treasury.py`: on a transport drop it reconnects and checks the read-only
  History screen before deciding whether to retry, never assuming either way.
- **`Interest Markup/Markdown` and `Interest Rate for the First Period` are
  left blank** — SAP stores both as `0.0000000` (confirmed by TC-015), so this
  deal carries variable interest at the `RBI_REPO` rate with zero spread.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| | | | Not yet run. Two PASS runs of the frozen script, with no deviations, are needed before `Status:` may become `frozen` (same rule as TC-015). |
