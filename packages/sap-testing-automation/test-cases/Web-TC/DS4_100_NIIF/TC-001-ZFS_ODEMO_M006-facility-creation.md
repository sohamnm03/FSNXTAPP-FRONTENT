# TC-001 — ZFS_ODEMO_M006: create a facility with valid mock data

- **Case id:** TC-001
- **Lane:** web (WebGUI) — **not** sap-gui, see Known deviations
- **Transaction / app:** `ZFS_ODEMO_M006` (Facility Creation) — program `ZFS_DEMO_M006`, screen `9000`
- **Spec file:** `web-tests/tests/zfs-odemo-m006-create-facility.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude
- **Created:** 2026-08-16
- **Status:** active (currently failing — two open product defects)
- **Writes to the database:** yes — creates one facility record

## Purpose

Proves that a facility can be created through `ZFS_ODEMO_M006` in the ITS WebGUI
with a complete, valid set of input values, and that the new facility appears in
the Facility Register. Does not cover input validation — that belongs in a
sibling negative case once the happy path works.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | registry guard in `sap-system.ts` + smoke suite |
| 2 | Chromium installed for `playwright-sap` | `npm run install-browsers --prefix web-tests` |
| 3 | Company code `9803`, partner `9800`, product type `ICF`, currency `USD` exist | offered by the form's own autocompletes |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Element id | Value |
|---|---|---|
| Company Code | `i-cocode` → hidden `h-cocode` | `9803` (CIM Tools Pvt Ltd) |
| Business Partner | `i-partner` → hidden `h-partner` | `9800` (Motherson Group) |
| Facility Name | `i-facname` | `TEST FACILITY CLAUDE 001` |
| Product Type | `i-prdtype` → hidden `h-prdtype` | `ICF` (Inter Co. Facility) |
| Start Date | `i-startdate` | `01-09-2026` |
| End Date | `i-enddate` | `31-08-2027` |
| Limit Amount | `i-limitamt` | `5,000,000` |
| Currency | `i-currency` → hidden `h-currency` | `USD` |
| Interest Category | `i-intcat` | `F` — Fixed |
| Interest Type | `i-intsubcat` | `01` — Simple Interest |
| Interest Calc. Method | `i-icm` | `2` — act/360 |
| Repayment Type | `i-repaytype` | `F` — Final Repayment |
| Frequency | `i-freq` | `Q` — Quarterly |
| Interest Rate | `i-intrate` | `7.25` |
| Spread / Ref. rate | `i-spread` / `i-refintrate` | blank |

**Company code, partner, product type and currency are custom autocompletes.**
The visible `i-*` input is display text only; the posted value lives in a sibling
hidden `h-*` input that is set **only when an option in `#d-*` is clicked**.
Typing the code and moving on leaves the hidden field empty and posts a partial
record. Always click the option, then assert the `h-*` value.

## Steps

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Navigate to the transaction | `sapPage.goto` | `${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006` |
| 3 | Prove the page rendered, then that we are past logon | `expect` | `body` visible, then `input[type=password]` count 0 |
| 4 | Find the app frame | `sapPage.frames()` | url contains `HTML000001.htm` |
| 5 | Record the register row count before the write | `frame.locator('table tbody tr')` | — |
| 6 | Fill the four autocompletes by clicking an option | `#i-*`, `#d-* > *` | verify `#h-*` |
| 7 | Fill name, dates, amount, interest details | `fill` / `type` / `selectOption` | dates typed as digits — `autoSlashDate` formats them |
| 8 | Gate: refuse to submit if any required value is empty | — | throws before any write |
| 9 | **Create the facility (writes)** | `#submit-btn` | **human confirms first** |
| 10 | Re-find the app frame and read the register | `sapPage.frames()` | the handle goes stale on the ITS round trip |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Hidden autocomplete values | `h-cocode`, `h-partner`, `h-prdtype`, `h-currency` | `9803`, `9800`, `ICF`, `USD` | `inputValue()` |
| 2 | Start / end date | `i-startdate`, `i-enddate` | `01-09-2026`, `31-08-2027` | `toBe` |
| 3 | Register contains the new facility | register table text | contains `TEST FACILITY CLAUDE 001` | `toContain` |
| 4 | Register row count | `N records` | 9 (was 8) | text match |

Assertion 3 is the one that matters. Both of the app's create paths currently
report success while writing nothing, so any assertion weaker than "the record
exists afterwards" passes on a broken transaction.

## Writes

Step 9 commits one facility record. Confirmed by the human at run time
(confirmed for the 2026-08-16 run). Every other step is read-only.

## Cleanup

The facility would be left in place, identified by `TEST FACILITY CLAUDE 001`.
Nothing to clean up so far — no record has ever been created by this case.

## Known deviations

- **SAP GUI cannot run this transaction.** Screen 9000 renders a single empty
  `SAP.HTMLControl.1` container with no fields and no application menu, in every
  session tried. This case is WebGUI-only.
- **The ITS round trip invalidates the frame handle.** After the submit the old
  `Frame` object silently resolves to the WebGUI shell, so a post-submit read
  through it returns shell text and looks like an empty result. Re-find the frame
  by URL after every round trip.
- The app frame url is `…/HTML000001.htm` under a session-specific path.

## Open defects blocking this case

| Id | Summary |
|---|---|
| **D1** | `isSapGuiHtmlViewer()` is true in Chromium (`window.external` always exists), so WebGUI takes the SAP GUI branch, fires a sapevent, shows *"Facility creation request sent to SAP TRM"* and clears the form — writing nothing. |
| **D2** | `createFacilityViaOData()` posts `Action`/`Getdata`/`CoCode`/`BpName`/`StartDate` with OData **V2** `/Date(ms)/` values; the deployed V4 service declares `Bukrs`/`FacName`/`StartDt`/`EndDt` as `Edm.Date`. Gateway returns HTTP 400 `Property 'Action' is invalid`. |

Both are described in full in `results/TC-001-2026-08-16-1947.md`. Fixes belong in
the sibling development workspace, not here.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-16 | FAIL | `results/TC-001-2026-08-16-1947.md` | No facility created. D1 and D2 found. Register unchanged at 8 records. |
