# TC-022 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1 (SAP GUI for Windows): term loan with fixed interest, a mid-term rate change, settled and month-end valued

- **Case id:** TC-022
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `gui_tests/cases/tc022_term_loan_fixed_rate_change.py` (run it with `scripts/run-gui-case.ps1 -Case TC-022`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by saumya.s@fourthsignal.com)
- **Created:** 2026-08-24
- **Status:** draft
- **Writes to the database:** yes — creates an interest rate instrument carrying two dated interest conditions, settles it, posts its due flows, then runs month-end accrual/deferral (TPM44) and valuation (TPM1)

## Purpose

Proves the term-loan lifecycle — create, settle, post, accrue, value — for a
**fixed**-interest deal on the `1000` / `22A` / `100` profile, where the
interest structure carries **two** dated conditions: 8% from the term start,
and a mid-term change to 9% effective 20.08.2026, both entered during the same
unsaved create.

This exercises two things no earlier case did:

1. **Setting the Frequency dropdown on a Fixed-rate deal at all.** TC-014
   never touched it and left it at the screen default (`At End of Term`).
   TC-015/TC-016/TC-021 set it, but only on a **Variable**-rate deal, where
   the field behaves differently (locked until a reference rate is entered).
   This case is the first to drive it on the Fixed path.
2. **A second, later-dated interest condition on the same deal**, added via
   the deal screen's `Conditions` → `Copy condition` flow — discovered live on
   DS4/100, 2026-08-24, while building this case (see `add_interest_condition`,
   `gui_tests/modules/treasury.py`). No earlier case ever opened that screen.

Does **not** cover: month 2 onward (the run values one month only, before the
new condition's effective date — see Test data), reversal of any of the five
writes, verification of the resulting FI documents in `FB03`, or whether the
9% condition actually changes what TPM44/TPM1 compute (it postdates this
run's key date, so it cannot).

## Preconditions

Same as TC-014 (company code `1000`, product type `22A`/txn type `100`,
partner `700000453`, currency `INR` default, General Valuation Class /
Valuation Class distinction), plus the two new mechanisms above.

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `1000` exists | deal screen header `VTGFHA-BUKRS` = `1000` |
| 2 | Product type `22A`/txn type `100` lands on `SAPLFTR_IRATE 1100` | `open_deal_entry` raises `WriteRefused` if it does not |
| 3 | Partner `700000453` resolves | `VTGFHA-XKONTRH` resolves to a name |
| 4 | Currency `INR` defaults | `VTG_INVEST-WZBETR` = `INR`, not changeable |
| 5 | Frequency `On Last Day of Month` (key 2) is offered on Fixed interest | confirmed live by this case's own model-driven discovery, 2026-08-24 |
| 6 | The deal screen's `Conditions` button (Shift+F6) reaches an Overview of Conditions listing a `Nominal interest` row | confirmed live, 2026-08-24 — `add_interest_condition` raises `WriteRefused` if the row is missing |
| 7 | `Copy condition` (F5) on that row's Condition Details raises an `Eff. From` popup, and the resulting item's Dates tab is editable | confirmed live, 2026-08-24 |
| 8 | General Valuation Class / TPM44-TPM1 Valuation Class are two distinct fields | confirmed by TC-014 — see its Steps 6b, 10, 12 |
| 9 | Deal not already settled on re-run | not exercised until this case's first run |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `BASELINE` / `CONDITION_CHANGE` / `TPM`
(`gui_tests/cases/tc022_term_loan_fixed_rate_change.py`), the same convention
TC-014/TC-021 follow.

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
| Nominal Interest Rate | `VTG_IRATE_STRUCTURE-PKOND` | `8` (%) |
| Interest Frequency | `VTG_IRATE_STRUCTURE-SRHYTHM` | `On Last Day of Month` (key `2`) — see Known deviations on why this key, not `Monthly` |
| Contract Date | `VTGFHAZU-XVTRAB` | `01.01.2026` |
| General Valuation Class | `VTGFHA-RCOMVALCL` | `Short Term` (key `5`) |
| 2nd interest condition — Eff. From | `VTBEFINKO-DGUEL_KP` (popup) | `20.08.2026` |
| 2nd interest condition — Percentage Rate | `VTBKOND_MNT-PKOND_ALT` | `9` (%) |
| 2nd interest condition — Calculation/Due 1st date | `VTBKOND_MNT-DVALUT` / `-DFAELL` | `31.08.2026` (next month-end after 20.08.2026, matching the base condition's month-end convention) |
| 2nd interest condition — Month-end flags | `VTBKOND_MNT-SVULT` / `-SFULT` | both checked |
| TBB1 Up to Due Date / Posting Date | `P_DZTERM` / `P_BUDAT` | `01.01.2026` / `01.01.2026` |
| TPM44/TPM1 Valuation Area / Class | `SO_VAREA-LOW` / `SO_VCLS-LOW` | `001` / `0005` |
| TPM44/TPM1 Key Date | `P_KEYDAT` / `KEYDATE` | `31.01.2026` — month-end of the term start, one month only, **before** the 2nd condition's effective date |
| TPM1 Valuation Category | `cmbVALCAT` | `Mid-Year Valuation with Reset` — always this value for this workspace |

## Steps

GUI lane, frozen script. Every element id lives in `gui_tests/screens/ftr-entry.json`,
`ftr-deal-irate.json`, `ftr-interest-conditions.json`, `tbb1-selection.json`,
`tpm44-selection.json` and `tpm1-selection.json` — the first five discovered or
extended live on DS4/100 by this case, 2026-08-24; the TPM screens carried over
unchanged from TC-014/TC-021 (CLAUDE.md rule 4: no literal id in a case).

Stages: `entry` -> `fill` -> `condition` -> `save` -> `settle` -> `post` ->
`tpm44` -> `tpm1`. A run stops after the stage it was asked for; `entry`,
`fill` and `condition` write **nothing** — the second interest condition is
added to the still-open, unsaved Create screen, and lands with the same
Save as everything else.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | runs again on every `start_transaction`; **stop if it is not** (rule 1) |
| 2 | Open `FTR_CREATE`, fill co.code / product type / txn type / partner | `open_deal_entry` | each field set and read back |
| 3 | Fill amount, term start/end, rate `8`, contract date | `fill_term_loan` | structure fields first, same order TC-014 established |
| 4 | Frequency → `On Last Day of Month`, then Enter | `fill_term_loan` (new `frequency`/`frequency_key` args) | changeable immediately on the Fixed path — no reference-rate unlock dance |
| 5 | Administr. tab → General Valuation Class = `Short Term`, back to Structure | `fill_term_loan` | successful switch is indirect proof the Structure fields were accepted |
| 6 | `Conditions` (Shift+F6) → Overview of Conditions → double-click `Nominal interest` → Condition Details | `add_interest_condition` | raises `WriteRefused` if the row or the screen isn't what's expected |
| 7 | `Copy condition` (F5) → fill `Eff. From` = `20.08.2026` → confirm | `add_interest_condition` | creates a new dated item on the SAME condition — a rate change, not a new condition type |
| 8 | Dates tab → set Calculation/Due 1st date `31.08.2026`, check both Month-end flags | `add_interest_condition` | the new item's Dates tab is blank and must be filled, or Enter refuses with `T1 001` "Enter Due Date" |
| 9 | Amounts tab → Percentage Rate `9` | `add_interest_condition` | read back and compared digit-wise |
| 10 | Back to Overview of Conditions (F3), confirm the original `01.01.2026`/`8%` row is still present unchanged AND the new `20.08.2026`/`9%` row now also exists, back to Structure (F3) | `add_interest_condition` | raises `WriteRefused` rather than proceeding to Save if `Copy condition` overwrote the original instead of adding a new item |
| 11 | **Save the deal** | `save_deal` | **WRITE 1** — confirmed by the human at run time |
| 12 | Open FTR_EDIT, click **Settle**, **Save** | `settle_deal` | **WRITE 2** — COM-disconnect-safe (`write_guarded`), verified via the read-only History screen |
| 13 | Open TBB1, Test Run off, **execute** — no simulation pass first | `post_flows` | **WRITE 3** |
| 14 | Open TPM44, Test Run off, **execute** | `run_accrual_deferral` | **WRITE 4** |
| 15 | Open TPM1, Valuation Category = `Mid-Year Valuation with Reset`, Test Run off, **execute**, then **Run Valuation** | `run_valuation` | **WRITE 5** — F8 only selects positions; the write is pressing Run Valuation |

## Assertions

Every row is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot disagree
— same convention as TC-014/TC-021.

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | System / client | `DS4` / `100`, logged-on user | `assert_dev_system` |
| 2 | Amount / Term Start / End round-trip | `100000` / `01.01.2026` / `31.12.2026` | `set_field_verified` |
| 3 | Nominal interest rate | `8` | `set_field_verified` |
| 4 | Interest frequency | `On Last Day of Month` | `select_combobox` |
| 5 | General Valuation Class | `Short Term` | `select_combobox` |
| 6 | 2nd condition Eff. From | `20.08.2026` | `add_interest_condition` reading `itemEffectiveFrom` |
| 7 | 2nd condition rate | `9` | `set_field_verified` |
| 8 | Overview of Conditions lists BOTH items — the original unchanged AND the new one (rules out `Copy condition` overwriting instead of adding) | `01.01.2026 / 8%` still present unchanged, AND `20.08.2026 / 9%` newly present, AND the Nominal interest row count grew by exactly 1 | `add_interest_condition` reading the ALV back before and after; raises `WriteRefused` rather than proceeding to Save if any part of this fails |
| 9 | Create check-run | 0 terminations, 0 errors | `read_check_run` |
| 10 | Create confirmation names the deal | `interest rate instrument <n> ... is created` | `save_deal` → `describe` |
| 11 | Settle confirmed | `is changed` / `is settled`, or already-settled on resume | `settle_deal` |
| 12 | TBB1 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 13 | TBB1 live post names the deal in its posting log | posting log contains the deal number | `post_flows` |
| 14 | TPM44 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 15 | TPM44 protocol mentions the key date | `31.01.2026` present | `run_accrual_deferral` |
| 16 | TPM1 Valuation Category | `Mid-Year Valuation with Reset` | `select_combobox` |
| 17 | TPM1 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 18 | TPM1 moved past position selection into an actual valuation | screen title contains `Valuation Log` | `run_valuation` |

## Writes

Five, all authorised by the requester (conversation confirmation, 2026-08-24):

1. **`FTR_CREATE` Save** — creates the interest rate instrument (fixed 8%, On Last Day of Month, plus a second condition at 9% effective 20.08.2026).
2. **`FTR_EDIT` → Settle → Save** — settles it.
3. **`TBB1` with Test Run off** — posts the due flows, run directly.
4. **`TPM44` with Test Run off** — posts accrual/deferral at key date `31.01.2026`.
5. **`TPM1` with Test Run off** — posts valuation at the same key date.

## Cleanup

None required. The deal is left in place — created, settled, posted and
month-end valued — same convention as TC-014/TC-021.

## Known deviations

- **`On Last Day of Month` (key 2), not `Monthly` (key 3), was the frequency
  chosen for "monthly interest with month end interest".** The Frequency
  dropdown offers both as separate, mutually exclusive entries; the requester
  confirmed the calendar-month-end reading, 2026-08-24, before this case
  touched SAP. `Monthly` would recur every month on the term's own
  anniversary date, unrelated to the calendar month-end — a different deal,
  not covered here.
- **The second interest condition is added during the same unsaved create,
  not via a later `FTR_EDIT` change.** The requester confirmed this is
  acceptable, 2026-08-24 ("you can do it during creation time also"), and it
  is in fact the only path this case explored: `Copy condition` only appeared
  reachable from the still-open Structure screen's `Conditions` button. A
  later change through `FTR_EDIT` after settlement was not attempted and may
  behave differently — out of scope here.
- **A freshly copied interest condition item's Dates tab is blank and does
  not inherit the base item's schedule.** Left blank, validating the Amounts
  tab raises hard error `T1 001` "Enter Due Date". `add_interest_condition`
  sets the new item's Calculation/Due 1st date to `31.08.2026` (the next
  month-end after `20.08.2026`) with both Month-end flags checked, matching
  the base condition's own convention — a data decision, not a discoverable
  default, since nothing about the mechanism dictates what the new item's own
  schedule should be beyond "something valid".
- **This run's TPM44/TPM1 key date (`31.01.2026`) predates the second
  condition's effective date (`20.08.2026`).** The case therefore proves the
  two-condition structure is created, saved and settled correctly — not that
  the 9% rate affects any accrual or valuation this run performs. A case
  wanting to observe the rate change's effect would need a key date on or
  after `20.08.2026`, which is out of scope here (see Purpose).
- **One non-blocking check-run warning at save/settle:** *"Partner 700000453
  cannot be used, as per contract 01.01.2026"*. Confirmed only at 0
  terminations / 0 errors, same rule as every other FTR_CREATE case.
- **TBB1/TPM44/TPM1 `Test Run` all default to ON** — each driven to `false`
  and confirmed before executing (CLAUDE.md rule 3a).
- **A COM disconnect mid-settle is handled, not assumed away** — `settle_deal`
  uses the same `write_guarded` path TC-014's incident forced into
  `treasury.py`: on a transport drop it reconnects and checks the read-only
  History screen before deciding whether to retry, never assuming either way.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| | | | Not yet run. Two PASS runs of the frozen script, with no deviations, are needed before `Status:` may become `frozen` (same rule as TC-015/TC-021). |
