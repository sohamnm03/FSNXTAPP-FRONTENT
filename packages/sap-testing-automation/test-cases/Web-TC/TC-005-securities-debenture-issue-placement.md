# TC-005 — FTR_CREATE: Securities (Debenture issue placement) create → settle → post

- **Case id:** TC-005
- **Lane:** web (WebGUI — classic Dynpro through ITS)
- **Transaction / app:** `FTR_CREATE` (create, opens t-code `TS01`), `FTR_EDIT → Settle`, `TBB1` (post)
- **Spec file:** `web-tests/tests/business-area-flows.spec.ts` (`DEAL_KEY=SEC`)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional / regression
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-17
- **Status:** active — create + settle proven; post blocked, see Known deviations
- **Writes to the database:** yes — one securities position and its settlement (posting did not complete — see below)

## Purpose

One full create → settle → post cycle for the **Securities** business area.
Reuses the shared runner in `business-area-flows.spec.ts`, same as TC-004/006/007.

## Why this product type (and not a Stock)

The obvious candidate, `01A` (Stocks), **refused at the entry screen**:
`Error: Make an entry in mandatory field "Security Class ID"`. Every security
transaction needs a Security Class ID naming an actual security master
record, and `01A` has **zero** classes configured for company code `9800` on
this system — confirmed, not assumed: the Security Class ID field's own F4
value help returned 0 rows when scoped to `01A`, and clearing every filter on
that same F4 surfaced the full unrestricted list (230 classes) with **not one**
tagged product type `01A` — see `results/web/probe-security-class*.txt`.

`22B` (Loan: Debentures) does have real, populated master data — the same 230
classes filtered down to it, e.g. `200000 "AMPLUS So DEB"`, `200006 "8%
DEBENTURE"`. Debentures are debt securities, so this is a genuine securities
instrument, and it is the one product type this exploration proved actually
has working reference data on DS4/100 — CLAUDE.md rule 4 ("discover, never
guess"): a technically-plausible product type with no master data behind it
is not usable, whatever its name suggests.

## Test data

| Field | Technical name | Value |
|---|---|---|
| Company Code | `BUKRS` | `9800` |
| Product Type | `VTGART` | `22B` (Loan: Debentures) |
| Financial Transaction Type | `GESCHAEFTSART` | `100` (Issue Placement) |
| Business Partner Number | `GPART` | `400000003` |
| Security Class ID Number | — | `200000` ("AMPLUS So DEB") — one of 230 real classes on this system, entered on the **entry** screen before Enter, not the deal screen |
| Securities Account | — | `1000` ("Issuance Securities Account") — the **only** entry its own F4 offers |
| Number of Units | — | `100` |
| Security Price (unit quotation) | — | `1000` |
| Position Value Date | — | `01.01.2026` |
| Calculation Date | — | `01.01.2026` |
| Payment Date | — | `01.01.2026` |
| Currency Unit of the Rate (both occurrences) | — | `INR` (defaults from the security class) |
| Payment Currency | `WAERS` | `INR` (defaulted, not set explicitly) |
| Contract Date | — | `01.01.2026` — set explicitly, same rule as TC-002/004 |
| TBB1 up to and incl. due date | — | `01.01.2026` |
| TBB1 posting date (Posting Control) | — | `01.01.2026` |

## Steps

Web lane, via the shared runner, staged like TC-002:

| # | Action | API | Notes |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | `FTR_CREATE`: Company Code, Product Type `22B`, Txn Type `100`, Partner, **Security Class ID `200000`**, Enter | `openTransaction`, `setFieldVerified` | Opens `SAPLTTM_UI_FRAMEWORK/1110` (t-code `TS01`) — a different screen program from the loan/deposit deal screen |
| 3 | Fill Securities Account, units, price, dates, currency-unit fields; Enter | `setField` | Rehearsed at `FLOW_STAGE=fill` first, no write |
| 4 | **Save** (WRITE 1) | `clickButton` + `handleSaveDialogs` | Captures the deal number |
| 5 | `FTR_EDIT`, select the deal, click Settle | `openTransaction`, `clickButton` | Same generic settle path as TC-002/004 |
| 6 | **Save the settlement** (WRITE 2) | `clickButton` + `handleSaveDialogs` | Skipped if already settled |
| 7 | `TBB1`, Test Run OFF, execute (WRITE 3) | `setCheckbox`, `clickButton` | Run directly — no simulation pass first, per the requester's 2026-08-18 standing instruction: never run a screen with its Test Run checkbox checked |

Run with:

```powershell
$env:DEAL_KEY="SEC"; $env:FLOW_STAGE="post"; npx playwright test tests/business-area-flows.spec.ts -g "TC-005"
```

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

1. **`FTR_CREATE` → Save** — creates the securities transaction. **Done** — deal `150071`.
2. **`FTR_EDIT` → Settle → Save** — settles it. **Done**.
3. **`TBB1` with Test Run off** — intended to post the flow due `01.01.2026`.
   **Not reached**: this run's Test Run ON simulation (the process at the
   time — see Known deviations for the 2026-08-18 change to run TBB1
   directly) found nothing to post, the same shape of failure as TC-004
   (Money Market). See Known deviations.

## Cleanup

None required — left in DS4/100 as a permanent record.

## Known deviations

- **No simulation pass before the TBB1 live post, as of 2026-08-18.** This
  case's one run (see Writes, deal `150071`) predates the change and used a
  Test Run ON simulation first. Per the requester's standing instruction,
  TBB1 (and every other screen with a Test Run checkbox) now runs straight to
  the live commit on a re-run — the checkbox is still driven to `false` and
  read back, just never driven to `true` first.
- **`01A` (Stocks) cannot be used on this system** — see "Why this product
  type" above. Do not retry it without first confirming a Security Class ID
  exists for it; the F4 is the way to check, not a guess.
- **The Security Class ID belongs on the *entry* screen**, before Enter — every
  other case in this workspace (TC-002/003/004) only needed Company Code /
  Product Type / Txn Type / Partner there. Omitting it produces `Error: Make
  an entry in mandatory field "Security Class ID"` and the deal screen never
  opens.
- **`Fill out all required entry fields` is not diagnostic on its own.** It
  fired twice while discovering this case's data — first for a blank `Int.
  Calc.Method`-style dropdown (not applicable here, that was TC-004's error;
  for `22B` it was a blank `Calculation Date`), then again for a second,
  easy-to-miss occurrence of `Currency Unit of the Rate` (the field's title is
  not unique — one instance sits by the trade price, a second by the Limit
  Price block). Diagnosed both times by diffing the full-screen dump
  (`dumpOnFailure`) for empty, non-readonly inputs rather than guessing which
  field the message meant.
- **`Payment Date` can silently disappear from the screen and reappear.**
  Measured once during discovery (its title was present, then absent, then
  present again across otherwise-identical runs) — treat its absence as a
  possible screen-rebuild artifact, not evidence the field was removed for
  good, before deciding it is optional.
- **`Contract Date` must be set explicitly once the position's own dates are
  in the past** — same rule as TC-004, discovered there first. Left at SAP's
  default (today), a past `Position Value Date` violates an implicit
  "contract date `<=` position date" constraint.
- **`findSaveButton`'s Ctrl+S match was too broad.** It resolved to
  `M0:48::btn[37]`, tooltip `"(Ctrl+Shift+F1)"` = "User Status" — a real,
  clickable button whose tooltip merely *contains* "Ctrl+S" as a literal
  substring. The click succeeded and produced a save-shaped but wrong
  refusal: `"SEC 0 has no user status"`. Fixed in `webgui.ts` to require an
  exact `"(Ctrl+S)"` tooltip match — a shared-helper fix, not specific to
  this screen.
- **Re-clicking Settle on an already-settled deal reads differently here than
  on TC-002's loan.** This screen (t-code `TS04`) refuses with `"This
  function is not available for activity category Contract Settlement"`
  rather than TC-002's `"Settlement already carried out"`. Same fact,
  different wording — `business-area-flows.spec.ts` now recognises both.
- **TBB1 does not find this deal's flow either, for the same likely reason as
  TC-004.** The save/settle check run carried the identical warning,
  `"Partner 400000003 cannot be used, as per contract 01.01.2026"`. See
  TC-004's Known deviations for the full reasoning — this looks like a
  partner/G/L configuration gap on DS4/100, not a defect in this case.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-17 | PARTIAL | `results/TC-005-2026-08-17-1615.md` | Deal 150071 created and settled; TBB1 post blocked (same partner/GL gap as TC-004) |
