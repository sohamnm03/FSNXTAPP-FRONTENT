# TC-004 — FTR_CREATE: Money Market (Fixed-Term Deposit) create → settle → post

- **Case id:** TC-004
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE` (create), `FTR_EDIT → Settle`, `TBB1` (post)
- **Spec file:** `web-tests/tests/business-area-flows.spec.ts` (`DEAL_KEY=MM`)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional / regression
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** active — create + settle proven; post blocked, see Known deviations
- **Writes to the database:** yes — one money market deal and its settlement (posting did not complete — see below)

## Purpose

One full create → settle → post cycle for the **Money Market** business area, so
a later run has a proven product type / transaction type / field set and does
not have to rediscover any of it. Mirrors TC-002's term-loan flow, reusing the
same generic runner (`business-area-flows.spec.ts`) shared with TC-005/006/007.

## Why this product type

`FTR_CREATE`'s Product Type field offers 146 entries on DS4/100, company code
`9800` (captured read-only via its own F4 value help —
`results/web/ftr-product-types.txt`, method documented in `webgui.ts`'s
`openValueHelp` / `readSearchHelp`). Money-market-shaped candidates: `51A`
Fixed-Term Deposit, `52A` Deposit at Notice, `53A` Commercial Paper, `57A`
Fiduciary Deposit. `51A` was picked as the most standard "Money Market
Investment" deal and confirmed to accept a deal on this system —
`results/web/ftr-txn-types-51A.txt` lists its 4 transaction types; `100`
(Investment) was chosen over `200` (Borrowing) so this case reads as a
placement of funds, not a loan (already proven by TC-002/003).

## Test data

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `9800` |
| Product Type | `VTGART` | `51A` (Fixed-Term Deposit) |
| Financial Transaction Type | `GESCHAEFTSART` | `100` (Investment) |
| Business Partner Number | `GPART` | `400000003` — same partner TC-002/003 used |
| Term Start | — | `01.01.2026` — **not** a future date; see Known deviations |
| End of Term | — | `01.07.2026` (6 months) |
| Amount | `BNWHR` | `500000` |
| Payment Currency | `WAERS` | `AUD` (defaults from product type — not set explicitly) |
| Interest rate (`Percentage rate for condition items`) | `PKOND` | `8` |
| Interest Calculation Method | — | `act/365` — mandatory dropdown, no SAP default; see Known deviations |
| General Valuation Class | — | `Short-term investments` — Administration tab, mandatory at save, not visible before then |
| Contract Date | — | `01.01.2026` — must be set explicitly; not required when Term Start is in the future (see Known deviations) |
| TBB1 up to and incl. due date | — | `01.01.2026` |
| TBB1 posting date (Posting Control) | — | `01.01.2026` |

## Steps

Web lane, via the shared runner (`business-area-flows.spec.ts`), staged like TC-002:

| # | Action | API | Notes |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | `FTR_CREATE`, fill Company Code / Product Type / Txn Type / Partner, Enter | `openTransaction`, `setFieldVerified` | Opens `SAPLTM00/1100` (t-code `TM01`) |
| 3 | Fill Term Start, End of Term, Amount, rate, Contract Date; select Interest Calc. Method | `setField`, `selectDropdown` | Read-only up to here — rehearsed at `FLOW_STAGE=fill` before any write |
| 3b | Open Administration tab, select General Valuation Class, then Enter | `clickButton`, `selectDropdown` | Tab resolved by its visible text at run time, not a hardcoded id — a working-day round trip can renumber the tab strip's positional ids |
| 4 | **Save** (WRITE 1) | `clickButton` + `handleSaveDialogs` | Captures the deal number from the confirmation text |
| 5 | `FTR_EDIT`, select the deal, click Settle | `openTransaction`, `clickButton` | Same button id as TC-002 (`M0:46:::5:8`) |
| 6 | **Save the settlement** (WRITE 2) | `clickButton` + `handleSaveDialogs` | Skipped if already settled (idempotent rerun) |
| 7 | `TBB1`, Test Run OFF, execute (WRITE 3) | `setCheckbox`, `clickButton` | Run directly — no simulation pass first, per the requester's 2026-08-18 standing instruction: never run a screen with its Test Run checkbox checked |

Run with:

```powershell
$env:DEAL_KEY="MM"; $env:FLOW_STAGE="post"; npx playwright test tests/business-area-flows.spec.ts -g "TC-004"
```

Or step through stages (`entry` → `fill` → `save` → `settle-open` → `settle` →
`post`) the same way TC-002 does, to see each write before it commits.

## Assertions

| # | Field / source | Expected | Read with |
|---|---|---|---|
| 1 | System / client, every transaction | `DS4` / `100` | `screenInfo` |
| 2 | Deal-screen error line after Enter | absent | `bodyText` |
| 3 | Save confirmation | a 5–12 digit deal number present | `bodyText` / `statusMessage` |
| 4 | Settlement status | matches `is changed\|is settled` (or already settled) | `statusMessage` |
| 5 | TBB1 live run | selected this deal, does **not** report "test run was successful" | `bodyText` |

## Writes

Two committed; the third was attempted but blocked (see Known deviations):

1. **`FTR_CREATE` → Save** — creates the money market deal. **Done** — deal `1000229`.
2. **`FTR_EDIT` → Settle → Save** — settles it. **Done**.
3. **`TBB1` with Test Run off** — intended to post the disbursement flow due
   `01.01.2026`. **Not reached**: this run's Test Run ON simulation (the
   process at the time — see Known deviations for the 2026-08-18 change to
   run TBB1 directly) found nothing to post, despite the flow existing, being
   due, and being flagged for posting on the deal's own Cash Flow tab. See
   Known deviations.

## Cleanup

None required — the deal is left in DS4/100 as a permanent record, same
convention as TC-002/003.

## Known deviations

- **No simulation pass before the TBB1 live post, as of 2026-08-18.** This
  case's one run (see Writes, deal `1000229`) predates the change and used a
  Test Run ON simulation first. Per the requester's standing instruction,
  TBB1 (and every other screen with a Test Run checkbox) now runs straight to
  the live commit on a re-run — the checkbox is still driven to `false` and
  read back, just never driven to `true` first.
- **`Interest Calculation Method` has no SAP default on this product type**,
  unlike the 10B term loan (which defaults to act/365 silently). Left blank,
  the deal screen refuses with `Error: Make an entry in mandatory field
  "Int.Calc.Method"`. Select any option from its own dropdown list — see
  `results/web/deal-screen-51A-100.txt` for the full 30-entry list. `act/365`
  was chosen to match the day-count convention proven elsewhere in this
  workspace (TC-002 baseline, TC-003 V01–V05).
- **`General Valuation Class` is mandatory at Save but not visible before
  then.** It is not on the Structure tab captured by the initial field
  discovery; it lives on Administration, discovered only because Save's own
  check run named it: `Fill the following required field: General Valuation
  Class`. `Short-term investments` was picked to match the 6-month term.
- **`Contract Date` must be set explicitly once Term Start is in the past.**
  The first attempt (deal `1000228`) used a future Term Start (`01.09.2026`)
  and never hit this, because SAP's own default Contract Date (today) was
  still `<=` Term Start. Moving Term Start to `01.01.2026` (to match
  TC-002/003's convention and let the flow actually become due, see below)
  exposed the same "Contract date is after start of term" constraint TC-002
  documents — except here it surfaced as a *tab click silently doing
  nothing* rather than a visible error line, because the underlying Enter
  round trip left the screen in an inline-error state that swallowed the
  next click. Diagnosed by comparing a working run's log (no popup before the
  tab click) against a failing one (a working-day popup appeared first) —
  not by reading an error message, because none was shown at that point.
- **TBB1 will not post a flow before its own due date arrives**, no matter
  what the selection screen's own due-date cutoff says. The first attempt
  (deal `1000228`, Term Start `01.09.2026`, still in the future relative to
  this run) created and settled cleanly, but its disbursement flow — read
  directly off the deal's own Cash Flow tab — showed as `PS=1 "Flagged for
  posting"` and TBB1's live run still selected nothing. Moving the whole
  deal's dates into the past (deal `1000229`, Term Start `01.01.2026`,
  matching TC-002/003) removes this specific cause but did **not** fix
  posting — see the next point.
- **Deal `1000229`'s disbursement flow is still not found by TBB1**, despite
  being due, in the past, and confirmed `"Flagged for posting"` on the deal's
  own Cash Flow tab, using the identical TBB1 selection pattern that posts
  TC-002's 10B term loan successfully. The save/settle check run's own
  warning is the likely explanation: `"Partner 400000003 cannot be used, as
  per contract 01.01.2026"` — a warning, so it does not block create/settle,
  but it points at a G/L/account-assignment gap for this partner on this
  product category. **This appears to be a genuine SAP customizing limitation
  on DS4/100, not a defect in this test** — the same partner posts cleanly
  for the term loan. See `results/TC-004-2026-08-17-1600.md` for the full
  diagnostic trail (cash-flow read, TBB1 selection-field verification, log
  expansion) before concluding this.
- **`selectDropdown`'s equality check was widened** (`webgui.ts`) from exact
  match to "read-back value contains the requested option" — needed for
  `General Valuation Class`/`Interest Calculation Method` here too, though
  first hit on TC-007's `Traded Currency`: selecting `USD` read back as
  `"USD United States Dollar"` once the round trip had a real value to
  describe. That is SAP enriching the display, not a refusal — a genuine
  refusal (TC-003 V07) still fails the check, because the read-back text is
  then a *different* option's label, not a superset of the one requested.
- **`findSaveButton`'s Ctrl+S match was too broad** and could resolve to an
  unrelated button whose tooltip merely contains "Ctrl+S" as a substring
  (`"(Ctrl+Shift+F1)"` = "User Status", hit on TC-005's screen but the same
  class of bug could affect any screen with a similarly-tooltipped button).
  Fixed in `webgui.ts` to require an exact `"(Ctrl+S)"` match.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | PARTIAL | `results/TC-004-2026-08-17-1600.md` | Deal 1000229 created and settled; TBB1 post blocked (partner/GL gap). Deal 1000228 (future-dated first attempt) also created and settled, never posted. |
