# TC-012 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1: 10 term loans, batch create-settle-post-accrue-value

- **Case id:** TC-012
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `web-tests/tests/ftr-term-loan-accrual-valuation-batch.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-18
- **Status:** active
- **Writes to the database:** yes — up to 50 (create + settle + post + TPM44 + TPM1, x10 deals)

## Purpose

Extends TC-009's single-deal term loan + month-end lifecycle (proven — deals
160252–160254) to a batch of 10, each with a different amount and a different
term, to check the same create → settle → post → accrue → value mechanics
hold across varying deal sizes and start dates, and to measure total run time
for a 10-deal batch under the current no-simulation Test Run behavior (see
`feedback_test_run_checkbox_always_live` — every screen with a Test Run
checkbox runs straight to the live commit, never simulated first).

Does **not** cover: the SAP GUI lane, reversal, or any structural variant
(interest frequency, repayment method, day-count) — those are TC-003's scope.
Each row runs TPM44/TPM1 once, at its own first month-end key date, not the
full 12-month term — same deliberate limitation as TC-009.

## Preconditions

Same as TC-009 #1–7 (company code `1000`, product type `22A` / txn type `100`,
partner `700000453`, currency `INR` default, General Valuation Class `Short
Term`, TPM44/TPM1 Valuation Area `001` / Class `0005`, TPM1 Valuation
Category `Mid-Year Valuation with Reset`). Additionally: none of the 10 deals
below already exist under these dates/amounts on DS4/100.

## Test data

**Executable copy:**
`test-data/term-loan-accrual-valuation-batch.dataset.json`. The table below
is the specification; that file is what the spec reads, one test per row.
Adding an eleventh deal is an edit to the dataset — the spec does not
change. Drive a subset with `$env:DATASET_ROWS="03,07"`.

Held constant across all 10 deals: Company Code `1000`, Product Type `22A`,
Financial Transaction Type `100`, Business Partner `700000453`, Currency
`INR`, Nominal Interest Rate `10`, General Valuation Class `Short Term`,
TPM44/TPM1 Valuation Area `001` / Valuation Class `0005`, TPM1 Valuation
Category `Mid-Year Valuation with Reset`. Contract Date defaults to each
deal's own Term Start (same reasoning as TC-009 — SAP refuses a contract date
after the term start). TBB1's due date and posting date default to each
deal's own Term Start.

Amount and dates continue the same monthly-step pattern already confirmed for
TC-008's batch (100k stepping by 50k, one month apart), applied to TC-009's
product/partner/currency profile. Each row's TPM44/TPM1 key date is its own
first month-end after term start. Confirmed via AskUserQuestion before
creation (2026-08-18).

| # | Amount (INR) | Term Start | End of Term | Key Date (TPM44/TPM1) |
|---|---|---|---|---|
| 01 | 100,000 | 01.01.2026 | 31.12.2026 | 31.01.2026 |
| 02 | 150,000 | 01.02.2026 | 31.01.2027 | 28.02.2026 |
| 03 | 200,000 | 01.03.2026 | 28.02.2027 | 31.03.2026 |
| 04 | 250,000 | 01.04.2026 | 31.03.2027 | 30.04.2026 |
| 05 | 300,000 | 01.05.2026 | 30.04.2027 | 31.05.2026 |
| 06 | 350,000 | 01.06.2026 | 31.05.2027 | 30.06.2026 |
| 07 | 400,000 | 01.07.2026 | 30.06.2027 | 31.07.2026 |
| 08 | 450,000 | 01.08.2026 | 31.07.2027 | 31.08.2026 |
| 09 | 500,000 | 01.09.2026 | 31.08.2027 | 30.09.2026 |
| 10 | 550,000 | 01.10.2026 | 30.09.2027 | 31.10.2026 |

## Steps

Ten repetitions of TC-009's steps 2–13b (see that case file for the full
step/API table), one per deal in the table above, run back-to-back in
`web-tests/tests/ftr-term-loan-accrual-valuation-batch.spec.ts`:

1. FTR_CREATE → fill → Administr. tab (General Valuation Class) → Enter → **save** (WRITE 1) → capture deal number
2. FTR_EDIT → select deal → Settle → **save** (WRITE 2)
3. TBB1 → Test Run off → **post** (WRITE 3), run directly — no simulation pass first
4. TPM44 → Test Run off → **accrue** (WRITE 4), run directly, at the row's own key date
5. TPM1 → Test Run off → **value** (WRITE 5), run directly, incl. pressing "Run Valuation"

Per the requester's 2026-08-18 standing instruction (never run a screen with
its Test Run checkbox checked), every Test Run checkbox is driven straight to
`false` and read back — no screen is ever run with it checked.

Each deal's result (verdict, deal number, message, timestamps) is written to
`results/web/tc-012-deal-<id>.json` as soon as that deal finishes, and merged
into `results/web/tc-012-batch-summary.md` after the batch. A deal already
recorded as `VALUED` is skipped on a re-run of the spec — re-settling,
re-posting or re-accruing an already-progressed deal is not idempotent, so a
batch that partially failed can be resumed without touching the deals that
already succeeded.

## Assertions

Same assertions as TC-009 (system/client, round-tripped amount, dates,
currency, rate, save not refused, create confirmation, check-run severity,
settlement mode/confirmation, TBB1/TPM44/TPM1 selection fields, Test Run flag
cleared before each live run, TPM44 protocol produced, TPM1 moved past
position selection into an actual valuation), applied per deal.

## Writes

Up to 50, all authorised in advance by the requester via the confirmed matrix
above: one `FTR_CREATE` save, one `FTR_EDIT` settle save, one `TBB1` live
post, one `TPM44` live accrual run and one `TPM1` live valuation run per
deal, each run directly with no simulation pass.

## Cleanup

None performed. All 10 deals are left in place, created, settled, posted,
accrued and valued. None are reusable fixtures. Identify them by company code
`1000` + the deal numbers in `results/web/tc-012-batch-summary.md`. To undo,
use `FTR_EDIT` → Reverse per deal, and reverse the resulting FI documents;
neither is covered here.

## Known deviations

Inherits all of TC-009's known deviations (working-day dialog, check-run
dialog, the two TBB1 fields sharing a title, Test Run defaulting to ON but
never driven to `true`, no simulation pass before any live run, TPM1 being a
two-step transaction, TBB1's Information Overview modal for company code
`1000`, Company Code's async autocomplete needing `dismissLiveSearch()`,
idempotent-resume wording differing per transaction). Additionally:

- **Idempotent resume is per-deal, not per-write**, extended across five
  steps instead of three. If a deal fails between any two steps, re-running
  the spec re-opens from the recorded verdict (`CREATED` → settle,
  `SETTLED` → post, `POSTED` → TPM44, `ACCRUED` → TPM1) without repeating a
  write that already committed.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-18 | 10/10 VALUED (with incident) | `results/TC-012-2026-08-18-1928.md` | Deals 160255-160259, 160262, 160264, 160266-160268 (10 tracked, all five writes each); 19 min 57 sec total. **Incident:** a shell-tool timeout did not actually kill the first invocation's process, so a second (resume) invocation ran rows 06-09 concurrently with the still-running first one, producing 4 extra fully-processed duplicate deals (160260, 160261, 160263, 160265) not in the tracked outcome. See the result file's "Incident" section |
