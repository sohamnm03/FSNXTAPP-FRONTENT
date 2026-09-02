# TC-015 — FTR_CREATE (SAP GUI for Windows): term loan with variable interest, monthly

- **Case id:** TC-015
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FTR_CREATE`
- **Spec file:** `gui_tests/cases/tc015_term_loan_variable_rate.py` (run it with `scripts/run-gui-case.ps1 -Case TC-015`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthik.r@fourthsignal.com)
- **Created:** 2026-08-19
- **Status:** draft
- **Writes to the database:** yes — creates one interest rate instrument (term loan) with variable interest. Nothing is settled or posted

## Purpose

Proves a term loan can be created in `FTR_CREATE` with **variable** interest —
a reference interest rate plus a monthly interest frequency — on the
`1000` / `22A` / `100` profile, through **SAP GUI for Windows**.

GUI-lane sibling of **TC-013** (web lane, WebGUI/ITS). Same data, same business
question, different rendering path: a transaction reachable both ways is not the
same rendering path in each and does not fail the same way (CLAUDE.md). The two
are **not** interchangeable as evidence, and this case does not inherit TC-013's
run history.

Deliberately **create only**. Settlement and posting behave identically for any
interest structure and are already proven by TC-002 (web) and TC-014 (GUI);
repeating them here would add commits and no information — the same scoping
reasoning as TC-003 and TC-013.

Does **not** cover: settlement, posting, reversal, accrual/deferral (TPM44),
valuation (TPM1), or whether the monthly variable interest generates the
expected cash flow. The `Cash Flow` tab is never opened. A non-zero interest
spread is also out of scope — see Known deviations.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `1000` exists | deal screen header `VTGFHA-BUKRS` = `1000` |
| 2 | Product type `22A` / transaction type `100` lands on `SAPLFTR_IRATE 1100` | `FTR_CREATE` reaches `TM_51`; `open_deal_entry` raises `WriteRefused` if it does not |
| 3 | Business partner `700000453` (TATA FIN PVT.LTD) exists | `VTGFHA-XKONTRH` resolves to a name on the deal screen |
| 4 | Payment currency `INR` defaults for `22A` | `VTG_INVEST-WZBETR` = `INR`, `changeable: false` |
| 5 | Interest Category `Variable` (key `2`) is offered on this product/txn-type combination | confirmed live — `cmbVTG_IRATE_STRUCTURE-IRATE_STRUCTURE` listed 6 entries on 2026-08-19 |
| 6 | Reference Interest Rate `RBI_REPO` exists on DS4 | confirmed live — accepted by `VTG_IRATE_STRUCTURE-SZSREF` without error on 2026-08-19; originally read from the field's own F4 list (16 codes) |
| 7 | Interest frequency `Monthly` (key `3`) is offered | confirmed live — `cmbVTG_IRATE_STRUCTURE-SRHYTHM` listed 7 entries on 2026-08-19 |
| 8 | General Valuation Class `Short Term` (key `5`) resolves | **required for this product/company combination.** The field reports `required: true` while empty, with Variable interest as well as Fixed — confirmed live 2026-08-19 |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `BASELINE` / `TERMS`
(`gui_tests/cases/tc015_term_loan_variable_rate.py`), not in
`test-data/*.dataset.json` — nothing else reads these values yet, the same
convention TC-014 follows. Move them to a dataset when a second case needs them.

Identical to TC-013's `baseline` row and TC-014's profile except for the
interest structure.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `FTR_ENTRY-BUKRS` | `1000` |
| Product Type | `FTR_ENTRY-SGSART` | `22A` |
| Transaction Type | `FTR_ENTRY-SFHAART` | `100` |
| Partner | `FTR_ENTRY-KONTRH` | `700000453` |
| Amount | `VTG_INVEST-XZBETR` | `100000` |
| Term Start | `VTG_TERM-XBLFZ` | `01.01.2026` |
| End of Term | `VTG_TERM-XELFZ` | `31.12.2026` |
| Payment Currency | `VTG_INVEST-WZBETR` | `INR` — asserted, never set (read-only default) |
| Interest Category | `VTG_IRATE_STRUCTURE-IRATE_STRUCTURE` | `Variable` (driven by key `2`) |
| Reference Interest Rate | `VTG_IRATE_STRUCTURE-SZSREF` | `RBI_REPO` — **not in the original request**, see Known deviations |
| Interest Frequency | `VTG_IRATE_STRUCTURE-SRHYTHM` | `Monthly` (driven by key `3`) |
| Contract Date | `VTGFHAZU-XVTRAB` | `01.01.2026` — **not in the original request**, defaults to today, which is later than term start |
| General Valuation Class | `VTGFHA-RCOMVALCL` | `Short Term` (key `5`) — **not in the original request**, required by SAP |
| Percentage Rate | `VTG_IRATE_STRUCTURE-PKOND` | **not addressed** — removed from the screen when Interest Cat. is `Variable` |

## Steps

GUI lane, frozen script. Every element id lives in
`gui_tests/screens/ftr-deal-irate.json` and `ftr-entry.json` with the date it was
discovered — a case never contains a literal id (CLAUDE.md rule 4). Ids were
discovered with `sap_get_screen_elements` on DS4/100 on 2026-08-19; re-discover
before reusing against another system.

Stages: `entry` → `fill` → `save`. A run stops after the stage it was asked for.
`entry` and `fill` write **nothing**.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | runs again on every `start_transaction`; **stop if it is not** (rule 1) |
| 2 | Open `FTR_CREATE`, fill co.code / product type / txn type / partner | `open_deal_entry` | each field set and read back; raises if `SAPLFTR_IRATE` is not reached |
| 3 | Enter → deal screen `TM_51` / `SAPLFTR_IRATE 1100` | `open_deal_entry` | — |
| 4 | Fill amount, term start, term end, contract date | `fill_term_loan_variable` | **Structure fields first** — SAP refuses the Administr. tab switch while any is empty |
| 5 | Interest Cat. → `Variable` (key `2`), then Enter | `fill_term_loan_variable` | rebuilds the interest block. **This Enter fails with `T1 183` and that is expected** — see Known deviations |
| 6 | Reference Interest Rate → `RBI_REPO`, then Enter | `fill_term_loan_variable` | mandatory; unlocks Frequency. Raises warning `T1 129`, recorded not suppressed |
| 7 | Confirm the working-day dialog if raised | `_confirm_working_day_dialog` | — |
| 8 | Assert Frequency is now changeable, then set → `Monthly` (key `3`) | `fill_term_loan_variable` | refuses with `WriteRefused` if still read-only — the block did not rebuild |
| 9 | Read back currency, partner name, period count/unit, calc method, markup, first-period rate | `fill_term_loan_variable` | recorded whether or not asserted |
| 10 | Administr. tab → General Valuation Class = `Short Term`, then back to Structure | `fill_term_loan_variable` | a successful tab switch is also indirect proof the Structure fields were accepted |
| 11 | **Save the deal** (F11) | `save_deal` | **WRITE 1** — named in Writes, confirmed by the human at run time |
| 12 | Confirm the check-run dialog — only at 0 terminations / 0 errors | `sap.confirm_check_run` | anything else is cancelled and raises; nothing is committed |
| 13 | Capture the deal number from SAP's confirmation line | `save_deal` → `describe` | the document type comes from what SAP said it created, not from what was asked for |

## Assertions

Every row below is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot disagree.
Rows marked *recorded* are observations, not assertions.

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Amount, post-round-trip | `VTG_INVEST-XZBETR` | `100000` (compared on digits — SAP renders `100,000.00`) | `set_field_verified` |
| 2 | Term start | `VTG_TERM-XBLFZ` | `01.01.2026` | `set_field_verified` |
| 3 | End of term | `VTG_TERM-XELFZ` | `31.12.2026` | `set_field_verified` |
| 4 | Payment currency | `VTG_INVEST-WZBETR` | `INR` | `read_field` |
| 5 | Interest category | `VTG_IRATE_STRUCTURE-IRATE_STRUCTURE` | `Variable` (label compared case- and whitespace-insensitively; SAP pads it) | `select_combobox` |
| 6 | Reference interest rate | `VTG_IRATE_STRUCTURE-SZSREF` | `RBI_REPO` | `set_field_verified` |
| 7 | Interest frequency | `VTG_IRATE_STRUCTURE-SRHYTHM` | `Monthly` | `select_combobox` |
| 8 | Interest period as SAP derived it | `ARHYTM` / `ARHYTM_UNIT` | a count and a unit — expected `1` / `Months` | `read_field` — *recorded* |
| 9 | Interest calculation method (defaulted, not set) | `VTG_IRATE_STRUCTURE-SZBMETH` | whatever `22A` defaults to — expected `act/365` | `read_field` — *recorded* |
| 10 | Interest markup/markdown, left blank | `IRATE_MARKUP_DOWN` | blank or zero — SAP stores `0.0000000` | `read_field` — *recorded* |
| 11 | Interest rate for the first period, left blank | `PKOND1STPER` | blank or zero — SAP stores `0.0000000` | `read_field` — *recorded* |
| 12 | Business partner resolves on the deal screen | `VTGFHA-XKONTRH` | `700000453` resolves to a name | `read_field` — *recorded* |
| 13 | Nominal percentage rate is absent for a variable deal | `PKOND` | not addressed — replaced by the reference rate | *recorded* |
| 14 | General Valuation Class (Administr. tab) | `VTGFHA-RCOMVALCL` | `Short Term` | `select_combobox` |
| 15 | Check run at save | terminations / errors | `0` / `0` — a non-zero count cancels the dialog and fails the case **with no write** | `read_check_run` |
| 16 | Save confirmation names the deal | status bar, message `T4 222` | `Interest rate instrument <n> in company code 1000 is created`, `<n>` 4+ digits | `status_message` → `describe` |

## Writes

- **Step 11 — Save the deal.** Creates **one** interest rate instrument (term
  loan, variable interest on `RBI_REPO`, monthly) in company code `1000`.
  Named before it runs and confirmed by the human at run time (CLAUDE.md
  rule 3) — `gui_tests/run.py` prints it and waits for a `yes`.

That is the only write. Nothing is settled, posted, accrued or valued. Stages
`entry` and `fill` make **zero** writes, so `-Stage fill` answers "does the
harness work" without touching the database.

No Test Run checkbox is involved — `FTR_CREATE` has none. Rule 3a applies to
TBB1 / TPM44 / TPM1, which this case does not drive.

## Cleanup

None required. The deal is left in place, the same convention as every other
FTR_CREATE case (TC-002, TC-003, TC-008, TC-009, TC-012, TC-013, TC-014).

## Known deviations

- **Three values are not in the original request** and are supplied by this
  case because SAP will not save without them. Each is recorded rather than
  quietly defaulted:
  - **`Ref. Int. Rate` = `RBI_REPO`.** A **data decision**, not a discoverable
    default. Switching Interest Cat. to `Variable` and pressing Enter produces
    hard error `T1 183 — Enter a reference interest rate`, and `Frequency` reads
    `changeable: false` until it is filled. `RBI_REPO` was chosen by the
    requester from the field's own live F4 list (16 codes on DS4) on 2026-08-19.
    Change it in the case module if a different rate is intended.
  - **`Contract Date` = `01.01.2026`.** Defaults to today, which is later than
    the `01.01.2026` term start; SAP refuses that at save.
  - **`Gen. Valn Class` = `Short Term`.** SAP itself reports the field
    `required: true` while empty.
- **`T1 183` on step 5 is expected and is not a failure.** It is what proves the
  interest block rebuilt and the reference rate is mandatory. The script does not
  treat the status message as an error at that point — it records it and carries
  on. A case that asserted a clean status bar there would fail on correct
  behaviour.
- **Warning `W T1 129` — "No interest calculation method entered for reference
  interest rate" — appears on step 6, even though `Int.Calc.Method` already
  shows `act/365`.** Non-blocking: deal `160279` saved through it on 2026-08-19.
  It concerns the reference rate's own configuration, not the screen field.
  Recorded to the journal, never suppressed, and never treated as a failure — but
  a *different* message at that point still lands in the run file rather than
  vanishing. TC-013 predicted this warning would appear in the **check run**; it
  does not. It is a screen-level message on the Enter that accepts the rate.
- **One non-blocking check-run warning at save:** *"Partner 700000453 cannot be
  used, as per contract 01.01.2026"*. Errors and terminations are both `0`, so
  the save proceeds. Not specific to this case — TC-014 recorded the identical
  warning on the same partner and contract date, at both create and settle. It
  says the partner's validity does not cover a `01.01.2026` contract date; SAP
  permits it as a warning. Not investigated.
- **`Interest Markup/Markdown` and `Interest Rate for the First Period` are left
  blank, and SAP stores both as `0.0000000`.** Confirmed live, which settles
  TC-013's open question: a blank markup is treated as zero, not rejected. So
  this deal carries variable interest at the `RBI_REPO` rate with **zero
  spread**. Whether that is the intended economics is a data question for the
  requester, not a product finding — a case wanting a real spread should add the
  field to `VariableRateTerms` rather than typing an id into the case.
- **`--resume` is refused, not ignored.** The case is create-only, so there is no
  later stage to resume into, and a resume that quietly did nothing would look
  like a pass.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-19 | PASS | `results/TC-013-2026-08-19-1946-gui-lane-model-driven.md` | **Model-driven, and filed under TC-013's id because TC-015 did not exist yet.** Created deal `160279` on DS4/100 — the run this case and its script were scoped from. It does **not** count toward TC-015's freeze proof: it was not driven by `tc015_term_loan_variable_rate.py`, which did not exist at the time. |

Two PASS runs of the frozen script, with no deviations, are needed before
`Status:` may become `frozen`. It is `draft` until the script has run at least
once as written.
