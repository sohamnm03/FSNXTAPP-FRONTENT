# TC-007 — FTR_CREATE: Foreign Exchange (FX Spot) create → settle → post

- **Case id:** TC-007
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE` (create, opens t-code `TX01`), `FTR_EDIT → Settle`, `TBB1` (post)
- **Spec file:** `web-tests/tests/business-area-flows.spec.ts` (`DEAL_KEY=FX`)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional / regression
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** blocked — cannot complete on this system; see Known deviations
- **Writes to the database:** none committed. Save was refused before
  anything was written — see below.

## Purpose

One full create → settle → post cycle for the **Foreign Exchange** business
area. Reuses the shared runner in `business-area-flows.spec.ts`, same as
TC-004/005/006.

## Why this product type

`60A` "Foreign exchange (FX)" is the general FX product type on this system
(siblings: `40A`/`40B` FX Forward/Spot as their own product types, `41A` FX
Options, `60N` Non-Deliverable Forward). `60A`'s own F4 lists 7 transaction
types (`results/web/ftr-txn-types-60A.txt`); `101` "Spot Transaction" was
chosen as the simplest FX deal shape — one rate, one value date, no forward
points or rollover mechanics.

## Test data

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `9800` |
| Product Type | `VTGART` | `60A` (Foreign Exchange) |
| Financial Transaction Type | `GESCHAEFTSART` | `101` (Spot Transaction) |
| Business Partner Number | `GPART` | `400000003` |
| FX Buy/Sell Indicator | — | `Buy` — SAP default, not overridden |
| Leading Currency | — | `AUD` (company code's own currency) |
| Following Currency | — | `USD` |
| Traded Currency | — | `USD` — dropdown; see Known deviations for its read-back quirk |
| Traded Amount | — | `10000` |
| Rate of Foreign Exchange Transaction | — | `1.5` — a placeholder rate; **not** a real market quote (see Known deviations) |
| Value Date | — | `01.01.2026` — **not** the real-market T+2 convention; see Known deviations |
| Contract Date | — | `01.01.2026` |
| General Valuation Class | — | `Short-term investments` — Administration tab (`Administr.`), mandatory at save |
| TBB1 up to and incl. due date | — | never reached |
| TBB1 posting date (Posting Control) | — | never reached |

## Steps

Web lane, via the shared runner, staged like TC-002:

| # | Action | API | Notes |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | `FTR_CREATE`: Company Code, Product Type `60A`, Txn Type `101`, Partner, Enter | `openTransaction`, `setFieldVerified` | Opens `SAPLTTM_UI_FRAMEWORK/1100` (t-code `TX01`) |
| 3 | Fill Leading/Following Currency, Traded Amount, Rate, Value Date, Contract Date; select Traded Currency | `setField`, `selectDropdown` | Rehearsed at `FLOW_STAGE=fill` first, no write |
| 3b | Open Administration tab (`"Administr."`), select General Valuation Class, then Enter | `clickButton`, `selectDropdown` | Same pattern as TC-004; discovered via Save's own check run, not the initial field capture |
| 4 | **Save** (WRITE 1) | `clickButton` + `handleSaveDialogs` | **Refused** — see Known deviations |
| 5 | `FTR_EDIT`, select the deal, click Settle | `openTransaction`, `clickButton` | Same generic settle path as TC-002/004/005/006 |
| 6 | **Save the settlement** (WRITE 2) | `clickButton` + `handleSaveDialogs` | Skipped if already settled |
| 7 | `TBB1`, Test Run OFF, execute (WRITE 3) | `setCheckbox`, `clickButton` | Run directly — no simulation pass first, per the requester's 2026-08-18 standing instruction: never run a screen with its Test Run checkbox checked |

Run with:

```powershell
$env:DEAL_KEY="FX"; $env:FLOW_STAGE="post"; npx playwright test tests/business-area-flows.spec.ts -g "TC-007"
```

## Assertions

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | System / client, every transaction | `DS4` / `100` | `screenInfo` |
| 2 | Deal-screen error line after Enter | absent (a rate-not-available *warning* is expected — see below) | `bodyText` |
| 3 | Save confirmation | a 5–12 digit deal number present | `bodyText` / `statusMessage` |
| 4 | Settlement status | matches `is changed\|is settled` (or already settled) | `statusMessage` |
| 5 | TBB1 live run | selected this deal, does **not** report "test run was successful" | `bodyText` |

## Writes

None completed — Save was refused before committing anything:

1. **`FTR_CREATE` → Save** — **blocked**, never succeeded. See Known deviations.
2. **`FTR_EDIT` → Settle → Save** — not reached.
3. **`TBB1` with Test Run off** — not reached.

## Cleanup

None required — nothing was created.

## Known deviations

- **No simulation pass before the TBB1 live post, as of 2026-08-18.** Not
  reached in this case's run (TBB1 was never reached), but the process
  applies on any future re-run: TBB1 (and every other screen with a Test Run
  checkbox) runs straight to the live commit, per the requester's standing
  instruction — the checkbox is still driven to `false` and read back, just
  never driven to `true` first.
- **`Enter a currency pair` fires if only `Traded Currency` is set.** The
  screen also needs `Leading Currency` and `Following Currency` filled
  explicitly — they are plain text fields, not derived from the dropdown.
- **`selectDropdown`'s exact-match check was too strict for this field** and
  had to be widened (`webgui.ts`, shared by every case using it). Selecting
  `USD` on `Traded Currency` read back as `"USD United States Dollar"` — SAP
  enriching the display once a real value exists to describe, not a refusal.
  The check now accepts the read-back value *containing* the requested
  option text; a genuine revert (TC-003 V07) still fails it, because the
  read-back is then a wholly different option's label.
- **`Value Date` moved from the original T+2 attempt (`19.08.2026`) to a past
  date (`01.01.2026`)** for the same reason as TC-004's Term Start: a
  future-dated flow was never going to be postable by TBB1 in this run
  regardless of the selection cutoff. Turned out not to matter — see below,
  the deal never got past Save either way.
- **`General Valuation Class` required and satisfiable here** (unlike
  TC-006's Letter of Credit) — lives on the Administration tab, abbreviated
  `"Administr."` on this screen. Setting it did **not** resolve the real
  blocker below; they are two independent gaps.
- **Save's check run refuses with a genuine error, not just a warning:**
  `"Recording position management: Error during distribution 9800"` /
  `"Update type is not assigned (see long text)"`. `handleSaveDialogs`
  correctly declines to auto-confirm a check run reporting errors, so nothing
  was written on any attempt.
- **Confirmed not currency-pair specific.** A second attempt with
  `INR`/`USD` (this company's likely home currency, given every other case
  in this workspace where SAP defaults the currency to either AUD or INR)
  produced the **identical** error — ruling out "this one pair isn't
  configured" in favour of "this product type's update-type assignment is
  missing on DS4/100 altogether." `results/web/probe-fx-inr-usd.txt`.
- **The rate `1.5` (and `80` for the INR/USD attempt) are placeholders**, not
  market-sourced quotes — chosen only to exercise the mechanics. Irrelevant
  in the end, since Save never got past the update-type error to validate a
  rate at all.
- **Conclusion: this case cannot be completed from this workspace as it
  stands.** The missing update-type assignment is SAP Treasury customizing,
  out of scope here (CLAUDE.md: "No ABAP source lives here"). If it is fixed
  in the sibling `SAP-Project-Development V1` workspace, this case's spec and
  data (`business-area-flows.spec.ts`, `DEAL_KEY=FX`) are ready to run as-is.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | BLOCKED | `results/TC-007-2026-08-17-1645.md` | No document created — "Update type is not assigned", confirmed not currency-pair specific |
