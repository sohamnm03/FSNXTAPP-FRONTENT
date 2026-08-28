# TC-009 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1: term loan created, settled, posted and month-end valued

- **Case id:** TC-009
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `web-tests/tests/ftr-term-loan-accrual-valuation.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthik.r@fourthsignal.com)
- **Created:** 2026-08-18
- **Status:** active
- **Writes to the database:** yes — creates an interest rate instrument, settles it, posts its due flows, then runs month-end accrual/deferral (TPM44) and valuation (TPM1) for the same deal

## Purpose

Extends TC-002's term loan lifecycle (create → settle → post) with the two
month-end treasury runs that follow it in practice: `TPM44` (accrual/deferral of
interest expense/revenue) and `TPM1` (valuation), both scoped to the one deal by
its Financial Transaction number, for the first month-end key date only.

Does **not** cover: month 2 onward (the deal runs 12 months; this case runs
TPM44/TPM1 once, at the first month-end — see Known deviations), reversal of
any of the five steps, or verification of the resulting FI documents in `FB03`.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Company code `1000` exists | shown on the FTR_CREATE deal screen |
| 2 | Product type `22A` ("TL - Disbursements") with transaction type `100` ("Disbursement-Term Loan Plan") lands on the same deal screen shape as `10B`/`200` (`SAPLFTR_IRATE/1100`, same field titles) | **confirmed** — `discover-ftr-1000-22a.spec.ts`, 2026-08-18: same screen, same titles (Amount as Text Field, Payment Currency, Term Start, End of Term, Nominal Interest Rate, Contract Date, Frequency Indicator). `ftr-deal-irate.json` and `treasury.ts` needed no changes |
| 3 | Business partner `700000453` exists with a treasury role | **confirmed** — resolves to "TATA FIN PVT.LTD / Nariman Point, Mumbai / MUMBAI 400021" on the deal screen |
| 4 | Currency `INR` is accepted for this product type | **confirmed** — defaults to `INR` on the deal screen for product type `22A`, no override needed |
| 5 | A screen model, `treasury.ts` component and dataset exist for `TPM44` and `TPM1` | **built 2026-08-18** — `web-tests/screens/tpm44-selection.json`, `tpm1-selection.json`; `runAccrualDeferral`/`runValuation` in `treasury.ts`; `test-data/term-loan-accrual-valuation.dataset.json`. The `Test Run` checkbox ids (invisible to `dumpScreen`) were found with a `[role="checkbox"]` dump — `discover-tpm-checkboxes.spec.ts` — the same technique TBB1's `M0:46:::31:5` came from |
| 6 | "General Valuation Class: short term" resolves to a concrete value | **confirmed, and it is two distinct fields, not one.** (a) The FTR_CREATE deal screen (Administr. tab) has its own required dropdown, **"General Valuation Class"** — the first live attempt (2026-08-18) was refused at the check-run with `Fill the following required field: General Valuation Class` before anything saved. Its exact option label is `Short Term` (`discover-ftr-gvc-field-type.spec.ts`). (b) TPM44/TPM1's selection-screen **"Valuation Class"** is a separate, coded filter field — Valuation Area `001` / Valuation Class `0005` = "Short Term" (`discover-tpm-valuation-class.spec.ts`). Both must be set; neither substitutes for the other |
| 7 | The deal is **not already settled** if re-running the settle step | spec detects and skips — see Known deviations |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

**Executable copy:** `test-data/term-loan-accrual-valuation.dataset.json`, row
`baseline`. The table below is the specification; the dataset is what the spec
actually reads and validates on load.

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `1000` |
| Product Type | `SFGTYP` | `22A` |
| Financial Transaction Type | `SFHAART` | `100` |
| Business Partner Number | `PARTNR` | `700000453` (TATA FIN PVT.LTD) |
| Term Start | `DBLFZ` | `01.01.2026` |
| End of Term | `DELFZ` | `31.12.2026` |
| Amount | `BNWHR` | `100000` |
| Payment Currency | `WAERS` | `INR` (product-type default, confirmed) |
| Nominal Interest Rate | `PKOND` | `10` |
| Contract Date | `DVTRAB` | `01.01.2026` — defaults to today on screen; must be `<=` Term Start or SAP refuses the save, same as TC-002 |
| General Valuation Class (deal screen, Administr. tab) | — | `Short Term` — a required dropdown for this product type; exact option label, not a coded key. **Not the same field as TPM44/TPM1's Valuation Class below** |
| TBB1 up to and incl. due date | — | `01.01.2026` |
| TBB1 posting date (Posting Control) | — | `01.01.2026` |
| TPM44 Accrual/Deferral Key Date | — | `31.01.2026` — month-end of the term's start month, not the start date itself |
| TPM1 Key Date for Valuation | — | `31.01.2026` (same key date, so both runs value/accrue as of the same point) |
| TPM44 / TPM1 Treasury Valuation Area | — | `001` |
| TPM44 / TPM1 Valuation Class | — | `0005` ("Short Term") — read from the field's own F4 value help, not guessed |
| TPM1 Valuation Category | — | `Mid-Year Valuation with Reset` — **mandatory and not in the original request.** TPM1 will not execute without it. Chosen as the conventional month-end (non-year-end) interim valuation; **needs requester confirmation** |

## Steps

Web lane. Run with `FLOW_STAGE` set — see the header comment in the spec.
Steps 1–9 mirror TC-002 exactly (see that case for the full field-by-field
breakdown); steps 10–13 are new.

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Open FTR_CREATE, fill co.code/product/txn type/partner | `setFieldVerified` | by `title` |
| 3 | **Confirm system is DS4 / 100** | `screenInfo` | **stop if it is not** |
| 4 | Enter → deal screen (`TM_51` / `SAPLFTR_IRATE 1100`) | `pressKey` | `Enter` |
| 5 | Fill amount, term start/end, contract date (currency defaults to INR) | `setField` / `setFieldVerified` | by `title` |
| 6 | Enter; confirm the working-day dialog | `handleKnownPopups` | `SAFE_POPUP` |
| 6b | Switch to Administr. tab, select General Valuation Class = `Short Term`, switch back to Structure | `mClick` / `selectDropdown` | tab ids `M0:46:2::0:0-title` / `M0:46:2::0:3-title`; SAP refuses a tab switch while a required Structure-tab field is empty, so this must come after step 5 |
| 7 | **Save the deal** | `clickButton` | resolved by `findSaveButton` |
| 8 | Open FTR_EDIT, fill co.code + deal no, click **Settle**, **Save** | `setFieldVerified` / `clickButton` | `M0:46:::5:8` (settle), `findSaveButton` (save) |
| 9 | Open TBB1, fill selection + both dates, Test Run off, **execute** — no simulation pass first | `setFieldVerified` / `setCheckbox` / `clickButton` | `M0:46:::31:5` (Test Run), `M0:50::btn[8]` (Execute, F8) |
| 10 | Open TPM44, fill Company Code, Financial Transaction (the deal no.), Valuation Area/Class, Accrual/Deferral Key Date `31.01.2026` | `runAccrualDeferral` (`treasury.ts`) | screen `tpm44-selection`: `companyCode`, `transaction`, `valuationArea`, `valuationClass`, `keyDate` |
| 11 | TPM44 with **Test Run off** — **posts**, run directly | `mSetCheckbox` | `M0:46:::41:5` |
| 12 | Open TPM1, fill Company Code, Financial Transaction, Valuation Area/Class, **Valuation Category** (mandatory), Key Date for Valuation `31.01.2026` | `runValuation` (`treasury.ts`) | screen `tpm1-selection`: same control names plus `valuationCategory` |
| 13 | TPM1 with **Test Run off** — **posts**, run directly | `mSetCheckbox` | `M0:46:::43:5` |
| 13b | Press **Run Valuation** on the positions screen F8 lands on | `mClick` | `M0:48::btn[8]` — F8 alone only *selects*; without this nothing is valued |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | System / client | info area | `DS4` / `100`, re-checked at each t-code | `screenInfo` |
| 2 | Amount after round trip | `Amount as Text Field` | `100000` (numeric) | `readField` |
| 3 | Term start / end | `Term Start` / `End of Term` | `01.01.2026` / `31.12.2026` | `readField` |
| 4 | Payment currency | `Payment Currency` | `INR` | `readField` |
| 5 | Nominal interest rate | `Nominal Interest Rate` | `10` (SAP renders `10.0000000`) | `readField` |
| 6 | Save not refused (create, settle) | message area | no line starting `Error:` | `bodyText` |
| 7 | Create confirmation | status bar | matches `interest rate instrument <n> ... is created` | `statusMessage` |
| 8 | Settle confirmation | status bar | matches `is changed` / `is settled` | `statusMessage` |
| 9 | TBB1 live post | application log | contains the deal no.; does not read as `Test run was successful` | `bodyText` |
| 10 | TPM44 selection | screen | Company Code `1000`, Financial Transaction = the deal no., Valuation Class `0005`, Key Date `31.01.2026` | `readField` |
| 11 | TPM44 Test Run flag | `M0:46:::41:5` | `false` — driven and read back before the run, since it defaults to ON | `readCheckbox` |
| 12 | TPM44 run result | application log | contains the deal no. | `bodyText` |
| 13 | TPM1 selection | screen | same filters as TPM44, Key Date for Valuation `31.01.2026` | `readField` |
| 14 | TPM1 Test Run flag | `M0:46:::43:5` | `false` — driven and read back before the run, since it defaults to ON | `readCheckbox` |
| 15 | TPM1 run result | application log | contains the deal no. | `bodyText` |

## Writes

Five, all authorised by the requester:

1. **`FTR_CREATE` Save** — creates the interest rate instrument.
2. **`FTR_EDIT` → Settle → Save** — settles it.
3. **`TBB1` with Test Run off** — posts the due flows, run directly (no
   simulation pass) per the requester's 2026-08-18 standing instruction: never
   run a screen with its Test Run checkbox checked.
4. **`TPM44` with Test Run off** — posts accrual/deferral for the deal at the
   `31.01.2026` key date, run directly.
5. **`TPM1` with Test Run off** — posts the valuation run for the deal at the
   same key date, run directly.

Each write is photographed as it completes — `evidence/tc-009-<deal>-1-created.png`
through `-5-tpm1-live.png` — same convention as TC-002.

## Cleanup

None performed. The deal is left in place, created, settled, posted and
month-end valued — it is not a reusable fixture. Identify it by company code
`1000` + the deal number recorded in `results/web/tc-009-deal-number.txt` and
the result file. Reversal of any step is not covered by this case.

## Known deviations

Inherited from TC-002 (expected to reproduce here — confirm on first run):

- Working-day dialog on `01.01.2026` (public holiday) — confirmed with **Copy**
  only if it matches `SAFE_POPUP`.
- Check-run dialog on both saves — confirmed only when terminations and errors
  are both zero.
- TBB1's two `Posting Date in the Document` fields — the Posting Control one
  (`nth 1`) is the one that stamps the document.
- TBB1/TPM44/TPM1 `Test Run` all default to ON — each must be explicitly
  cleared and read back, never assumed.
- **No simulation pass before any of the three live runs, as of 2026-08-18.**
  Earlier runs did a Test Run ON pass first (TBB1, then TPM44, then TPM1) to
  prove the selection found the deal before committing. Per the requester's
  standing instruction, every screen with a Test Run checkbox now runs
  straight to the live commit — the checkbox is still driven to `false` and
  read back, just never driven to `true` first. The idempotent-resume
  detection ("No flows exist for processing", "List does not contain any
  data") now reads off the live run's own result instead of a prior
  simulation's.
- ITS drops leading keystrokes on identifier/date fields — go through
  `setFieldVerified`.

New to this case:

- **"General Valuation Class" is two unrelated fields with confusingly similar
  names.** The FTR_CREATE deal screen (Administr. tab) has its own required
  dropdown, distinct from TPM44/TPM1's "Valuation Class" selection filter. The
  first live attempt (2026-08-18) hit this directly: the check-run refused the
  save with `Fill the following required field: General Valuation Class`
  before anything committed (0 terminations, 2 errors — correctly blocked,
  no deal created). Setting TPM44/TPM1's filter alone would **not** have
  satisfied this; the deal screen's own dropdown must be set too.
- **The Administr. tab dropdown is not free text.** It carries
  `aria-controls`/`aria-haspopup` like `Frequency Indicator` — typing a coded
  value like `0005` into it does nothing (the field stays empty). It must be
  driven with `selectDropdown`, matching one of its exact option labels
  (`Short Term`, `Long Term`, `Liabilities`, ...), never a key.
- **SAP refuses a tab switch on this screen while a required field on the
  current tab is empty.** The first attempt to click the Administr. tab
  before filling Term Start silently stayed on Structure and showed "Enter
  the start of term for the transaction" — not a click failure, a validation
  gate. Fill the Structure tab first.
- **TPM1 is a two-step transaction, and step one writes nothing.** F8 only
  *selects* positions, landing on "Display Selected Treasury Positions for
  Valuation" with the deal listed as "Valuation Allowed". The valuation needs
  the **"Run Valuation"** button (`M0:48::btn[8]`) on that screen. A run of
  this case reported PASS having pressed only F8 and had valued nothing —
  which is why `runValuation` now presses it and the spec asserts the live run
  moved off the positions screen.
- **TPM1's "Valuation Category" is mandatory.** Without it TPM1 refuses with
  `Make an entry in mandatory field "Valuation Category"` — and the refusal is
  silent in every other signal: no dialog is raised, the selection screen still
  looks correct, and only the status bar says so. `TpmRunResult.refusedToRun`
  exists for exactly this and is asserted on every TPM call.
- **TBB1 returns its result differently for this company code.** Company 1000
  produces an "Information Overview" modal (Posting Log / Messages) where
  company 9800 (TC-002) produces an inline list. Its rows are an ALV grid, not
  a tree: the text cell is the hotspot, and the icon cell, Enter and
  double-click all do nothing. `postFlows` drills into it **only when it is
  present**, so TC-002's path is unchanged.
- **Re-running is idempotent, and each step says so differently.** Settle:
  "Settlement already carried out". TBB1: "No flows exist for processing".
  TPM44: "List does not contain any data". Each is matched explicitly and the
  corresponding write skipped, rather than being inferred from an absent deal
  number.
- **TPM44/TPM1 `Test Run` checkboxes are invisible to `dumpScreen`.** WebGUI
  renders them as `[role="checkbox"]` divs, not `<input type=checkbox>` — found
  with a targeted `[role="checkbox"], [role="radio"]` dump
  (`discover-tpm-checkboxes.spec.ts`), same as TBB1's.
- **Company Code opens an async autocomplete that can block the next field,
  on every screen it appears on.** Typing Company Code triggers an inline
  "Search Results" suggestion list, rendered after a server round trip
  rather than synchronously with the keystrokes. Left open, it overlaps
  whichever field sits below it and intercepts every click there until the
  caller's action timeout gives up — a mechanical failure with nothing
  written. First seen on FTR_CREATE (two consecutive attempts, 2026-08-18,
  deal 160249) and fixed there with `dismissLiveSearch()`
  (`web-tests/webgui.ts`) right after Company Code is set. The same failure
  then recurred on **TBB1's live post** (2026-08-18, deal 160252 — the WRITE
  3 live call failed on the "Financial Transaction" field, leaving the deal
  created and settled but not posted, accrued or valued), proving the bug
  belongs to Company Code itself, not to FTR_CREATE. `dismissLiveSearch()`
  is now called after every `companyCode` field on every screen in
  `treasury.ts` — `openDealEntry`, `settleDeal`, `postFlows`,
  `runAccrualDeferral`, `runValuation`.
- **TPM44/TPM1 only run once at one key date.** The deal's term runs 12
  months; a single run at `31.01.2026` only picks up whatever is due by that
  date (see TC-002's "TBB1 posts only what is due by its cutoff" — the same
  mechanic applies to TPM44/TPM1's key date). Running all twelve months was
  explicitly deferred, per the requester's choice on 2026-08-18, to a later
  case/run.
- **`Valuation Class` is a coded value, not free text.** `0005` under
  Valuation Area `001` = "Short Term" — read from the field's own F4 value
  help (`discover-tpm-valuation-class.spec.ts`), which also lists `0006` =
  "Long Term" and several others under Valuation Areas `001`/`002`/`003`. Do
  not type "short term" into the field itself.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1313.md` | Deal 160247 created, settled, posted, accrued (TPM44) and valued (TPM1) at key date 31.01.2026 — all five writes. First clean end-to-end run. Deal 160246 from earlier discovery is partial (TPM1 never performed) and is not a clean example |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1630.md` | Deal 160248 created, settled, posted, accrued and valued at key date 31.01.2026 — all five writes, 2.4 min. Requested data matched the `baseline` dataset row exactly; General Valuation Class and TPM1 Valuation Category re-confirmed with the requester before the run |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1610.md` | Deal 160249 created, settled, posted, accrued and valued at key date 31.01.2026 — all five writes, 2.8 min. First two attempts failed mechanically (Company Code's async autocomplete blocked Product Type, nothing written) — fixed with `dismissLiveSearch()` in `webgui.ts`/`treasury.ts`; third attempt passed clean |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1623.md` | Deal 160250 created, settled, posted, accrued and valued at key date 31.01.2026 — all five writes, 2.8 min, one continuous run, no deviations. Confirms the autocomplete fix from the 160249 run held |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1636.md` | Deal 160251 created, settled, posted, accrued and valued at key date 31.01.2026 — all five writes, 2.6 min, one continuous run, no deviations |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1644.md` | Deal 160252 — first attempt created+settled then failed mechanically on TBB1's live post (Company Code's autocomplete now recurring outside FTR_CREATE); fixed by extending `dismissLiveSearch()` to every `companyCode` field in `treasury.ts`; resumed with `DEAL_NO=160252` and completed TBB1 post, TPM44 and TPM1 clean |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1730.md` | Deal 160253 created, settled, posted, accrued and valued at key date 31.01.2026 — all five writes, one clean flow (staged create + resume), no deviations. Requested data matched the `baseline` dataset row exactly |
| 2026-08-18 | PASS | `results/TC-009-2026-08-18-1915.md` | Deal 160254 — first run after removing the Test Run simulation pass from `treasury.ts`/the spec. All five writes, one continuous run, 2.0 min, no deviations. Confirms TBB1/TPM44/TPM1 all run straight to the live commit (checkbox `true -> false`, no simulation call) |
