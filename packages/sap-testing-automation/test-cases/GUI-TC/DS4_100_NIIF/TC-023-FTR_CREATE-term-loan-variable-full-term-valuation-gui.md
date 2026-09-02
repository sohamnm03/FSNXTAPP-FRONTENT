# TC-023 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1 (SAP GUI for Windows): term loan with variable interest, settled, posted and valued for every month of the term

- **Case id:** TC-023
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `gui_tests/cases/tc023_term_loan_variable_full_term_valuation.py` (run it with `scripts/run-gui-case.ps1 -Case TC-023`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by saumya.s@fourthsignal.com)
- **Created:** 2026-08-24
- **Status:** draft
- **Writes to the database:** yes — creates an interest rate instrument with variable interest, settles it, posts its due flows, then runs month-end accrual/deferral (TPM44) and valuation (TPM1) for **every** month-end across the full term (12 pairs for this baseline)

## Purpose

Proves the full term-loan lifecycle — create, settle, post, then accrue and
value **every month of the term**, not just the first — for a deal carrying
**variable** interest, on the `1000` / `22A` / `100` profile, through SAP GUI
for Windows.

This is a new combination, not a new business question: TC-021 already proves
create -> settle -> post -> one month's accrual/valuation for this exact deal
profile, and explicitly scopes out "month 2 onward". This case exists because
the request that produced it asked for TPM44/TPM1 to be run for all months of
the term. It reuses TC-021's create/settle/post logic unchanged
(`fill_term_loan_variable` / `VariableRateTerms` from TC-015's side,
`settle_deal` / `post_flows` from TC-014's) and loops the same
`run_accrual_deferral` / `run_valuation` TC-014 uses once per calendar
month-end from the term start through the term end, rather than once.

Does **not** cover: reversal of any step, verification of the resulting FI
documents in `FB03`, or a non-zero interest spread (see TC-015's Known
deviations — markup/markdown is left blank and SAP stores it as zero). A
different term start/end changes how many month-ends `KEY_DATES` computes —
this case's baseline is fixed at `01.01.2026`-`31.12.2026` (12 month-ends).

## Preconditions

Same as TC-014/TC-015/TC-021 (company code `1000`, product type `22A`/txn
type `100`, partner `700000453`, currency `INR` default) plus TC-015's
variable-interest preconditions.

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
| 10 | TPM44/TPM1 accept being run repeatedly for successive key dates on the same deal within one session | unverifiable before running — no earlier case has run either transaction more than once per deal per session |
| 11 | Deal not already settled/posted/valued for a given month on re-run | `settle_deal`/`post_flows`/`run_accrual_deferral`/`run_valuation` all detect and skip idempotently |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `BASELINE` / `TERMS` / `KEY_DATES`
(`gui_tests/cases/tc023_term_loan_variable_full_term_valuation.py`), the same
convention TC-014/TC-015/TC-021 follow. `KEY_DATES` is computed, not typed by
hand, from `BASELINE.term_start`/`term_end` via `calendar.monthrange` — one
month-end per calendar month in that range.

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
| Reference Interest Rate | `VTG_IRATE_STRUCTURE-SZSREF` | `RBI_REPO` — reused from TC-015's data decision |
| Interest Frequency | `VTG_IRATE_STRUCTURE-SRHYTHM` | `Monthly` (key `3`) |
| Contract Date | `VTGFHAZU-XVTRAB` | `01.01.2026` |
| General Valuation Class | `VTGFHA-RCOMVALCL` | `Short Term` (key `5`) |
| TBB1 Up to Due Date / Posting Date | `P_DZTERM` / `P_BUDAT` | `01.01.2026` / `01.01.2026` |
| TPM44/TPM1 Valuation Area / Class | `SO_VAREA-LOW` / `SO_VCLS-LOW` | `001` / `0005` |
| TPM44/TPM1 Key Dates | `P_KEYDAT` / `KEYDATE` | `31.01.2026`, `28.02.2026`, `31.03.2026`, `30.04.2026`, `31.05.2026`, `30.06.2026`, `31.07.2026`, `31.08.2026`, `30.09.2026`, `31.10.2026`, `30.11.2026`, `31.12.2026` — one TPM44+TPM1 pair each, in order |
| TPM1 Valuation Category | `cmbVALCAT` | `Mid-Year Valuation with Reset` — always this value for this workspace |

## Steps

GUI lane, frozen script. Every element id lives in `gui_tests/screens/ftr-entry.json`,
`ftr-deal-irate.json`, `tbb1-selection.json`, `tpm44-selection.json` and
`tpm1-selection.json` — all discovered live on DS4/100 by TC-014 and TC-015 on
2026-08-19 and unchanged here (CLAUDE.md rule 4: no literal id in a case).

Stages: `entry` -> `fill` -> `save` -> `settle` -> `post` -> `tpm`.
A run stops after the stage it was asked for; `entry` and `fill` write
**nothing**. `tpm` is one stage covering all 12 month-ends — there is no
per-month stopping point.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | runs again on every `start_transaction`; **stop if it is not** (rule 1) |
| 2 | Open `FTR_CREATE`, fill co.code / product type / txn type / partner | `open_deal_entry` | each field set and read back |
| 3 | Fill amount, term start/end, contract date | `fill_term_loan_variable` | structure fields first |
| 4 | Interest Cat. → `Variable`, then Enter | `fill_term_loan_variable` | the `T1 183` error on this Enter is expected |
| 5 | Reference Interest Rate → `RBI_REPO`, then Enter | `fill_term_loan_variable` | unlocks Frequency; warning `T1 129` recorded, non-blocking |
| 6 | Confirm the working-day dialog if raised | `fill_term_loan_variable` → `_confirm_working_day_dialog` | only the "Not a Working Day" family is auto-confirmed |
| 7 | Frequency → `Monthly` | `fill_term_loan_variable` | refuses with `WriteRefused` if still read-only |
| 8 | Administr. tab → General Valuation Class = `Short Term`, back to Structure | `fill_term_loan_variable` | successful switch is indirect proof the Structure fields were accepted |
| 9 | **Save the deal** | `save_deal` | **WRITE 1** — confirmed by the human at run time |
| 10 | Open FTR_EDIT, click **Settle**, **Save** | `settle_deal` | **WRITE 2** — COM-disconnect-safe (`write_guarded`) |
| 11 | Open TBB1, Test Run off, **execute** — no simulation pass first | `post_flows` | **WRITE 3** |
| 12 | For each of the 12 key dates, in order: open TPM44, Test Run off, **execute**; then open TPM1, Valuation Category = `Mid-Year Valuation with Reset`, Test Run off, **execute**, then **Run Valuation** | `run_accrual_deferral` / `run_valuation`, looped | **WRITES 4-27** — 24 writes, one TPM44 + one TPM1 per month-end |

## Assertions

Every row is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot disagree
— same convention as TC-021. Steps 1-11's assertions are identical to
TC-021's (system/client, field round-trips, interest structure, create/settle
confirmations, TBB1 posting log). Additionally, for **each** of the 12 key
dates:

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | TPM44 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 2 | TPM44 protocol mentions the key date | that month's key date present | `run_accrual_deferral` |
| 3 | TPM1 Valuation Category | `Mid-Year Valuation with Reset` | `select_combobox` |
| 4 | TPM1 Test Run cleared | `false`, read back off the control | `set_test_run_off` |
| 5 | TPM1 moved past position selection into an actual valuation | screen title contains `Valuation Log` | `run_valuation` |

## Writes

Twenty-seven, all authorised by the requester (conversation confirmation, 2026-08-24):

1. **`FTR_CREATE` Save** — creates the interest rate instrument (variable interest, `RBI_REPO`, monthly).
2. **`FTR_EDIT` → Settle → Save** — settles it.
3. **`TBB1` with Test Run off** — posts the due flows, run directly.
4-27. **`TPM44` then `TPM1`, Test Run off, once per month-end** — `31.01.2026`, `28.02.2026`, `31.03.2026`, `30.04.2026`, `31.05.2026`, `30.06.2026`, `31.07.2026`, `31.08.2026`, `30.09.2026`, `31.10.2026`, `30.11.2026`, `31.12.2026` (12 pairs, 24 writes).

## Cleanup

None required. The deal is left in place — created, settled, posted and
valued through every month of the term — same convention as TC-014/TC-021.

## Known deviations

Carried forward from TC-014/TC-015/TC-021, since this case's script is those
cases' logic unchanged through `post`, only the final stage loops:

- **`Ref. Int. Rate` = `RBI_REPO` is a data decision, not a discoverable
  default**, reused from TC-015. Change it in the case module (`TERMS`) if a
  different rate is intended.
- **`T1 183` on the Interest Cat. → Variable Enter is expected**, not a
  failure.
- **Warning `W T1 129`** ("No interest calculation method entered for
  reference interest rate") is expected on the reference-rate Enter,
  non-blocking.
- **One non-blocking check-run warning at save/settle:** *"Partner 700000453
  cannot be used, as per contract 01.01.2026"*.
- **TBB1/TPM44/TPM1 `Test Run` all default to ON** — each driven to `false`
  and confirmed before executing (CLAUDE.md rule 3a), every time, for every
  month.
- **`write_guarded` (the reconnect-and-verify path that classifies a dropped
  COM call as `ComDisconnected`) covers only `save_deal`/`settle_deal`**, same
  as TC-021 — it is not used by `post_flows`, `run_accrual_deferral` or
  `run_valuation` anywhere in this codebase, TC-023's 24-write TPM44/TPM1 loop
  included. A raw COM drop during any of those calls falls through to
  `run.py`'s generic exception handler as an unclassified error, not
  `ComDisconnected`. Recovery is the same as for any other unclassified
  failure: `scripts/check-run.ps1 -Latest` reads the journal to see which
  months actually posted before re-running with `--resume <deal>` — the
  already-completed months are then skipped idempotently.
- **A soft check failure mid-loop does not stop the loop.** The per-month
  assertions inside `run_accrual_deferral`/`run_valuation` (e.g. "protocol
  mentions the key date") use `journal.check`, which records pass/fail but
  never raises — same non-raising pattern TC-014's `--rows` batch already
  uses. If month N's check fails, months N+1 through 12 still run live and
  post real writes; nothing in this case aborts the loop early. A failed
  check is visible in the run file's Assertions table and should be read in
  full, not just the final verdict line.
- **`Interest Markup/Markdown` and `Interest Rate for the First Period` are
  left blank** — SAP stores both as `0.0000000`, so this deal carries
  variable interest at the `RBI_REPO` rate with zero spread throughout.
- **TPM1 at a key date equal to the deal's own End of Term returns "No
  positions selected" (`TPM_TLV1 003`, status type `S`) instead of a
  Valuation Log.** Observed live on DS4/100, 2026-08-24, first run: deal
  160302's month 1-11 valuations (Jan-Nov 2026) all completed normally, but
  the month 12 valuation at `31.12.2026` (== `term_end`) found nothing open
  to revalue and returned this message on the selection screen itself rather
  than advancing. Confirmed read-only after the run (`sap_get_screen_info`)
  that this is SAP's own response, not a stuck or ambiguous state, and that
  no spurious write occurred — nothing was posted for month 12's valuation.
  `run_valuation`'s "moved past position selection" assertion does not yet
  recognise this message as a legitimate "nothing to value" outcome (only
  the F8 selection step's `_assert_ran` checks for that family of message,
  and "No positions selected" isn't in its matched phrase list), so the run
  correctly reports this as a failed assertion rather than silently passing
  it — this is a case/module gap to close, not evidence the write silently
  failed. **A deal whose term end lands on a month-end key date will hit
  this on its last month** — expected, not a defect, until `treasury.py` is
  updated to treat it as idempotent-skip the way it already does for TBB1's
  "no flows exist" and TPM44/TPM1's "already run" cases.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-24 | FAIL | `results/TC-023-2026-08-24-1621.md` | Deal 160302: create, settle, TBB1 post, and 11 of 12 months' TPM44+TPM1 all passed (Jan-Nov 2026). Month 12 (31.12.2026, == term end) TPM1 returned "No positions selected" instead of a Valuation Log — see Known deviations. Requester reviewed and accepted this as the deal's maturity-date behaviour; no further live writes were made for this run. Two clean PASS runs with no deviations are still needed before `Status:` may become `frozen` (same rule as TC-015/TC-021) — this run does not count toward that. |
