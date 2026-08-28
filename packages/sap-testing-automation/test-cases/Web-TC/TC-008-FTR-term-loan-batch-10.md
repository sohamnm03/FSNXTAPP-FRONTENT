# TC-008 — FTR_CREATE / FTR_EDIT / TBB1: 10 term loans, batch create-settle-post

- **Case id:** TC-008
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`
- **Spec file:** `web-tests/tests/ftr-term-loan-batch.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** active
- **Writes to the database:** yes — up to 60 (create + settle + post, x20 deals; rows 11-20 currently create-only, see Run history)

## Purpose

Extends TC-002's single-deal term loan lifecycle (proven — deals 200105–200109)
to a batch of 10, each with a different amount and a different term, to check
the same create → settle → post mechanics hold across varying deal sizes and
start dates (including start dates that fall on a weekend or public holiday).

Does **not** cover: the SAP GUI lane, reversal, or any structural variant
(interest frequency, repayment method, day-count) — those are TC-003's scope.

## Preconditions

Same as TC-002 #1–4 (company code `9800`, product type `10B` / txn type `200`,
partner `400000003`, currency `AUD` default). Additionally: none of the 20
deals below already exist under these dates/amounts on DS4/100.

## Test data

**Executable copy:** `test-data/term-loan-batch.dataset.json`. The table below is
the specification; that file is what the spec reads, one test per row. Adding an
eleventh deal is an edit to the dataset — the spec does not change. Drive a subset
with `$env:DATASET_ROWS="03,07"`.

Held constant across all 10 deals: Company Code `9800`, Product Type `10B`,
Financial Transaction Type `200`, Business Partner `400000003`, Currency
`AUD`, Nominal Interest Rate `10`. Contract Date is set equal to each deal's
own Term Start (same reasoning as TC-002 — SAP refuses a contract date after
the term start).

Amount and dates were proposed by the assistant and confirmed by the
requester before the run: one-year terms starting on the 1st of consecutive
months, amount stepping by 50,000 AUD. Rows 01-10 were the original batch
(2026-08-17); rows 11-20 were added and confirmed via AskUserQuestion on
2026-08-18, continuing the same monthly-step/50k pattern into 2026-2027 start
dates so they could not collide with rows 01-10.

| # | Amount (AUD) | Term Start | End of Term | TBB1 due / posting date |
|---|---|---|---|---|
| 01 | 100,000 | 01.01.2026 | 31.12.2026 | 01.01.2026 |
| 02 | 150,000 | 01.02.2026 | 31.01.2027 | 01.02.2026 |
| 03 | 200,000 | 01.03.2026 | 28.02.2027 | 01.03.2026 |
| 04 | 250,000 | 01.04.2026 | 31.03.2027 | 01.04.2026 |
| 05 | 300,000 | 01.05.2026 | 30.04.2027 | 01.05.2026 |
| 06 | 350,000 | 01.06.2026 | 31.05.2027 | 01.06.2026 |
| 07 | 400,000 | 01.07.2026 | 30.06.2027 | 01.07.2026 |
| 08 | 450,000 | 01.08.2026 | 31.07.2027 | 01.08.2026 |
| 09 | 500,000 | 01.09.2026 | 31.08.2027 | 01.09.2026 |
| 10 | 550,000 | 01.10.2026 | 30.09.2027 | 01.10.2026 |
| 11 | 600,000 | 01.11.2026 | 31.10.2027 | 01.11.2026 |
| 12 | 650,000 | 01.12.2026 | 30.11.2027 | 01.12.2026 |
| 13 | 700,000 | 01.01.2027 | 31.12.2027 | 01.01.2027 |
| 14 | 750,000 | 01.02.2027 | 31.01.2028 | 01.02.2027 |
| 15 | 800,000 | 01.03.2027 | 29.02.2028 | 01.03.2027 |
| 16 | 850,000 | 01.04.2027 | 31.03.2028 | 01.04.2027 |
| 17 | 900,000 | 01.05.2027 | 30.04.2028 | 01.05.2027 |
| 18 | 950,000 | 01.06.2027 | 31.05.2028 | 01.06.2027 |
| 19 | 1,000,000 | 01.07.2027 | 30.06.2028 | 01.07.2027 |
| 20 | 1,050,000 | 01.08.2027 | 31.07.2028 | 01.08.2027 |

TBB1's due date and posting date are each deal's own Term Start — the same
convention TC-002 used, so the borrowing flow (drawdown) posts on day one of
each loan.

Note: 01.01.2026 (New Year's Day), 01.02.2026 and 01.03.2026 (Sundays) and
01.08.2026 (Saturday) are not working days, so those deals are expected to
raise SAP's "Not a Working Day — Adopt Date Anyway?" dialog on save, exactly
like TC-002. Confirmed with **Copy**, same as TC-002's `SAFE_POPUP`.

## Steps

Ten repetitions of TC-002's steps 2–16 (see that case file for the full
step/API table), one per deal in the table above, run back-to-back in
`web-tests/tests/ftr-term-loan-batch.spec.ts`:

1. FTR_CREATE → fill → Enter → **save** (WRITE 1) → capture deal number
2. FTR_EDIT → select deal → Settle → **save** (WRITE 2)
3. TBB1 → Test Run off → **post** (WRITE 3), run directly — no simulation
   pass first, per the requester's 2026-08-18 standing instruction: never run
   a screen with its Test Run checkbox checked

Each deal's result (verdict, deal number, message, timestamps) is written to
`results/web/tc-008-deal-<id>.json` as soon as that deal finishes, and merged
into `results/web/tc-008-batch-summary.md` after the batch. A deal already
recorded as `POSTED` is skipped on a re-run of the spec — re-settling or
re-posting an already-settled/posted deal is not idempotent (SAP refuses a
second settlement outright), so a batch that partially failed can be resumed
without touching the deals that already succeeded.

## Assertions

Same assertions as TC-002 (system/client, round-tripped amount, dates,
currency, rate, save not refused, create confirmation, check-run severity,
settlement mode/confirmation, TBB1 selection dates, Test Run flag cleared,
live post result), applied per deal.

## Writes

Up to 30, all authorised in advance by the requester via the confirmed matrix
above: one `FTR_CREATE` save, one `FTR_EDIT` settle save, and one `TBB1` live
post per deal, run directly with no simulation pass. Each write is
photographed — `evidence/tc-008-<id>-<dealno>-1-created.png`, `-2-settled.png`,
`-3-tbb1-live.png`.

## Cleanup

None performed. Rows 01-10 are left in place, created, settled and posted.
Rows 11-20 are left in place created only (settle/post were deliberately not
run this pass — see Run history). None are reusable fixtures. Identify them by
company code `9800` + the deal numbers in `results/web/tc-008-batch-summary.md`.
To undo, use `FTR_EDIT` → Reverse per deal, and reverse the resulting FI
documents; neither is covered here.

## Known deviations

Inherits all of TC-002's known deviations (working-day dialog, check-run
dialog, the two TBB1 fields sharing a title, Test Run defaulting to ON but
never driven to `true`, no simulation pass before the live post, ITS dropping
leading keystrokes, settlement not being repeatable). Additionally:

- **Idempotent resume is per-deal, not per-write.** If a deal fails between
  settle and post, re-running the spec re-opens FTR_EDIT for that deal,
  detects "Settlement already carried out", records it as `SETTLED` again
  without a second write, and proceeds straight to TBB1.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | 10/10 PASS | `results/web/tc-008-batch-summary.md` | Deals 200116–200125 created, settled, posted; 13.9 min total, 0 errors/terminations on any check run |
| 2026-08-18 | 10/10 CREATED (FLOW_STAGE=save) | `results/web/tc-008-batch-summary.md` | Deals 200130–200139 (rows 11-20) created only, by request — not settled or posted; 9.2 min total, 0 errors/terminations on any check run |
