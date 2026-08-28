# TC-002 — FTR_CREATE / FTR_EDIT / TBB1: term loan created, settled and posted

- **Case id:** TC-002
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`
- **Spec file:** `web-tests/tests/ftr-term-loan-flow.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** active
- **Writes to the database:** yes — creates an interest rate instrument, settles it, and posts its flows

## Purpose

Proves the end-to-end term loan lifecycle in WebGUI: an interest rate instrument
(product type 10B, term loan) can be created in `FTR_CREATE`, settled in
`FTR_EDIT`, and its due flows posted in `TBB1`.

Does **not** cover: the same flow in SAP GUI (a different rendering path — see
`docs/web-testing-setup.md` § Which lane), reversal (`FTR_EDIT` → Reverse),
accrual/deferral, or verification of the resulting FI document in `FB03`.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `9800` (Motherson Group) exists | shown on the FTR_CREATE deal screen |
| 2 | Product type `10B` (Term Loan) with transaction type `200` (TL) is configured | FTR_CREATE entry screen accepts them |
| 3 | Business partner `400000003` (MUFG Bank Ltd) exists with a treasury role | partner name resolves on the deal screen |
| 4 | Currency `AUD` is the product type default | asserted, not assumed — see Assertions #4 |
| 5 | The deal is **not already settled** if re-running the settle step | spec detects and skips — see Known deviations |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

**Executable copy:** `test-data/term-loan-single.dataset.json`, row `baseline`
(row `monthly` is the month-end interest variant). The table below is the
specification; the dataset is what the spec actually reads, and it validates the
contract-date constraint on load rather than discovering it at the save. Select a
row with `$env:DATASET_ROWS="monthly"`.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `9800` |
| Product Type | `SFGTYP` | `10B` |
| Financial Transaction Type | `SFHAART` | `200` |
| Business Partner Number | `PARTNR` | `400000003` |
| Term Start | `DBLFZ` | `01.01.2026` |
| End of Term | `DELFZ` | `31.12.2026` |
| Amount | `BNWHR` | `100000` |
| Payment Currency | `WAERS` | `AUD` |
| Nominal Interest Rate | `PKOND` | `10` |
| Interest frequency | `SRHYTHM` | *default* `At End of Term`; set with `INTEREST_FREQUENCY` |
| Contract Date | `DVTRAB` | `01.01.2026` — **not in the original request**, see Writes |
| TBB1 up to and incl. due date | — | `01.01.2026` |
| TBB1 posting date (Posting Control) | — | `01.01.2026` |

## Steps

Web lane. Run with `FLOW_STAGE` set — see the header comment in the spec.

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Open FTR_CREATE | `openTransaction` | `FTR_CREATE` |
| 3 | **Confirm system is DS4 / 100** | `screenInfo` | **stop if it is not** |
| 4 | Fill co.code, product type, txn type, partner | `setFieldVerified` | by `title` |
| 5 | Enter → deal screen (`TM_51` / `SAPLFTR_IRATE 1100`) | `pressKey` | `Enter` |
| 6 | Fill amount, rate, term start/end, contract date | `setField` / `setFieldVerified` | by `title` |
| 7 | Enter; confirm the working-day dialog | `handleKnownPopups` | `SAFE_POPUP` |
| 8 | **Save the deal** | `clickButton` | resolved by `findSaveButton` |
| 9 | Confirm the check-run dialog (0 errors only) | `handleSaveDialogs` | — |
| 10 | Capture the deal number from the message | `bodyText` | regex on the confirmation line |
| 11 | Open FTR_EDIT, fill co.code + deal no | `setFieldVerified` | by `title` |
| 12 | Click **Settle** | `clickButton` | `M0:46:::5:8` |
| 13 | **Save the settlement** | `clickButton` | resolved by `findSaveButton` |
| 14 | Open TBB1, fill selection + both dates | `setFieldVerified` | see Known deviations |
| 15 | TBB1 with **Test Run off** — runs straight to the live post, no simulation pass first | `setCheckbox` | `M0:46:::31:5` = false |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | System / client | info area | `DS4` / `100`, re-checked at each t-code | `screenInfo` |
| 2 | Amount after round trip | `Amount as Text Field` | `100000` (numeric; SAP renders `100,000.00`) | `readField` |
| 3 | Term start / end | `Term Start` / `End of Term` | `01.01.2026` / `31.12.2026` | `readField` |
| 4 | Payment currency | `Payment Currency` | `AUD` | `readField` |
| 5 | Nominal interest rate | `Nominal Interest Rate` | `10` (SAP renders `10.0000000`) | `readField` |
| 6 | Save not refused | message area | no line starting `Error:` | `bodyText` |
| 7 | Create confirmation | status bar | matches `interest rate instrument <n> ... is created` | `statusMessage` |
| 8 | Check run severity | dialog toolbar | `0` terminations **and** `0` errors before confirming | `readCheckRun` |
| 9 | Settlement mode | screen | Activity = `Contract settlement`, deal no present in inputs | `inputValues` |
| 10 | Settle confirmation | status bar | matches `is changed` / `is settled` | `statusMessage` |
| 11 | TBB1 selection | screen | due date and Posting-Control posting date both `01.01.2026` | `readField` |
| 12 | Test Run flag | `M0:46:::31:5` | `false` — driven and read back before the live post, since it defaults to ON | `readCheckbox` |
| 13 | Live post result | application log | contains the deal no, and **not** `Test run was successful` | `bodyText` |

## Writes

Three, all authorised by the requester:

1. **`FTR_CREATE` Save** — creates the interest rate instrument.
2. **`FTR_EDIT` → Settle → Save** — settles it.
3. **`TBB1` with Test Run off** — posts the due flows, run directly (no
   simulation pass) per the requester's 2026-08-18 standing instruction: never
   run a screen with its Test Run checkbox checked.

Each write is photographed as it completes, on **every** run and regardless of
`DISCOVER` — `evidence/tc-002-<deal>-1-created.png`, `-2-settled.png`,
`-3-tbb1-live.png`. The SAP status-bar confirmation is the evidence that the
write happened; keeping it only as a line of text in the flow log left a green
run with nothing a human could look at.

A fourth value had to be decided at run time and is **not** from the original
request: **Contract Date**. It defaults to today, and SAP hard-refuses the save
with `Error: Contract date is after start of term` for a term starting
01.01.2026. The deal cannot exist without a contract date on or before the term
start; `01.01.2026` was chosen and confirmed by the requester.

## Cleanup

None performed. The deal is left in place, created **and settled and posted** —
it is not a reusable fixture. Identify it by company code `9800` + the deal
number in `results/web/tc-002-deal-number.txt`. To undo, use `FTR_EDIT` →
Reverse, and reverse the FI document; neither is covered by this case.

## Known deviations

Handled by the steps — do not treat these as new failures:

- **Working-day dialog.** `01.01.2026` is a public holiday, so term start (and
  contract date) trip *"Not a Working Day / Adopt Date Anyway?"*. Confirmed with
  **Copy**, which adopts the requested date. Only dialogs matching `SAFE_POPUP`
  are auto-confirmed. **It does not appear on every run** — the 20:33 run on
  2026-08-17 saw none at all with identical data. Its absence is not a failure:
  the dates are read back off the screen after Enter regardless, and that is what
  the assertions check. Do not add an assertion that a dialog *was* handled.
- **Check-run dialog on save.** Both saves raise *"Check run: Display messages"*
  with **0 terminations, 0 errors, 2 warnings, 1 information**. It is confirmed
  **only** when terminations and errors are both zero — the counters are read,
  not the text. The two warnings are recorded, not suppressed:
  *"No payment details entered for transaction"* and *"Partner 400000003 cannot
  be used, as per contract 01.01.2026"*.
- **TBB1 has two fields titled `Posting Date in the Document`.** `nth 0` (y=867)
  is the selection filter *"Up to and Incl. Posting Date"*; `nth 1` (y=1027) is
  *Posting Control → Posting Date*, the one that stamps the document. Addressing
  by `.first()` posts under the wrong date with nothing on screen to show it.
- **TBB1 `Test Run` defaults to ON.** Left alone, a "post" simulates, reports
  success and writes nothing. The flag is set explicitly and read back.
- **No simulation pass before the live post, as of 2026-08-18.** Earlier runs
  did a Test Run ON pass first to prove the selection found the deal before
  committing. Per the requester's standing instruction, every screen with a
  Test Run checkbox now runs straight to the live commit — the checkbox is
  still driven to `false` and read back (see above), just never driven to
  `true` first.
- **ITS drops leading keystrokes.** `200105` was once entered as `00105`,
  selecting a different transaction. Identifiers and dates go through
  `setFieldVerified`, which reads back and retries. Amount and rate cannot use
  it — SAP reformats them — so they are checked numerically instead.
- **A settled deal cannot be settled twice.** Re-running lands on *"Error:
  Settlement already carried out"*; the spec detects this, skips write 2 and
  continues to TBB1.
- **`bodyText` returns labels only.** Field *values* live in input elements —
  assert them with `inputValues`/`readField`, never against body text.
- **`Frequency Indicator` is a dropdown list box, not a text field.** It is
  `readonly` with `ct="CB"`, so `setField` cannot drive it — use `selectDropdown`.
  Its six entries are `At End of Term`, `On First Day of Month`,
  `On Last Day of Month`, `Monthly`, `Daily`, `Manual Input`. **`Monthly` and
  `On Last Day of Month` are both monthly** (each exposes `1` / `Months`); they
  differ in the day interest falls on — the term-start day vs month end. For
  "monthly with month-end interest" pick `On Last Day of Month`; `Monthly` would
  look right and post on the wrong day.
- **TBB1 posts only what is due by its cutoff.** With month-end interest and a
  due date of `01.01.2026`, the 12 interest flows (31.01.2026 onward) are
  generated but **not** posted; only the borrowing flow is. The run reports
  success either way, so read the flow count, not just the status.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-1120.md` | Deal 200105 created, settled, posted |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-1229.md` | Deal 200106 created, settled, posted |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-1250.md` | Deal 200107 created, settled, posted — 93.5 s |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-1313.md` | Deal 200108 created, settled, posted — 98.1 s; first run with per-write screenshots |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-1328-monthly-month-end.md` | Deal 200109 — variant `INTEREST_FREQUENCY="On Last Day of Month"`; 12 month-end interest flows verified in the cash flow |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-2033.md` | Deal 200126 created, settled, posted — 1.4 min. First attempt failed in the logon fixture on `ERR_CONNECTION_TIMED_OUT` (host unreachable, nothing written); passed on re-run. No working-day dialog appeared this time — see deviation 3 |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-2055.md` | Deal 200127 created, settled, posted — 1.4 min. Working-day dialog **did** appear (1 popup, confirmed with `Copy`), 22 min after a run of identical data that saw none — the dialog is session-dependent, not data-dependent |
| 2026-08-17 | PASS | `results/TC-002-2026-08-17-2301.md` | Deal 200128 created, settled, posted — 1.6 min. Requested data identical to the spec's `DEAL` constants; working-day dialog appeared (1 popup, `Copy`). One flow posted (borrowing), as expected at `At End of Term` |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1136.md` | Deal 200140 created, settled, posted. First attempt failed on `ERR_CONNECTION_TIMED_OUT` (VPN off); second attempt created+settled 200140 in SAP but a spec defect in `settleDeal()` (asserted post-save text against a pre-save mode check) reported a false FAIL — fixed in `web-tests/modules/treasury.ts`; resumed with `DEAL_NO=200140` to complete TBB1 posting |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1210.md` | Deal 200141 created, settled, posted — 1.8 min, one continuous run, no assertion failures. First clean pass confirming the `settleDeal()` fix |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1337.md` | Deal 200142 created, settled, posted — 1.4 min, one continuous run, no assertion failures. Requested data matched the `baseline` dataset row exactly |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1441.md` | Deal 200143 created, settled, posted — 1.4 min, one continuous run, no assertion failures. Requested data matched the `baseline` dataset row exactly |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1600.md` | Deal 200144 created, settled, posted — 1.4 min. Requester asked for INR; SAP force-reverted currency to AUD for co.code 9800 / product type 10B (no write attempted for the INR try). Confirmed with requester, re-run with AUD; every other field matched the request exactly |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1617.md` | Deal 200145 created, settled, posted — 1.8 min, one continuous run, no assertion failures. Requested data matched the `baseline` dataset row exactly |
| 2026-08-18 | PASS | `results/TC-002-2026-08-18-1922.md` | Deal 200146 — first run after removing the Test Run simulation pass from `treasury.ts`/the spec. All three writes, one continuous run, 1.4 min, no deviations. Confirms TBB1 runs straight to the live commit (checkbox `true -> false`, no simulation call) |
