# TC-011 — ZFS_ODEMO_M009: create a new Bond Class with valid mock data

- **Case id:** TC-011
- **Lane:** web (WebGUI)
- **Transaction / app:** `ZFS_ODEMO_M009` (Bond Workbench)
- **Spec file:** `web-tests/tests/zfs-odemo-m009-create-bond-class.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude
- **Created:** 2026-08-18
- **Status:** active
- **Writes to the database:** yes — creates one new Bond Class

## Purpose

Proves that a brand-new Bond Class can be created through `ZFS_ODEMO_M009`'s
"Create Bond" panel (`bc-*` fields), and that it appears in the Bond Register
with a real, server-assigned Class ID. This is the sibling write path to
TC-010 (`Create Issuance`, which requires an existing class) and is not
covered by it.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | registry guard in `sap-system.ts` + smoke suite |
| 2 | Chromium installed for `playwright-sap` | `npm run install-browsers --prefix web-tests` |
| 3 | Company code `9803` exists | offered by the `bc-cocode` autocomplete |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Element id | Value |
|---|---|---|
| Company Code | `bc-cocode` → hidden `bc-cocode-hidden` | `9803` (CIM Tools Pvt Ltd) |
| Product Type | `bc-prodtype` → hidden `bc-prodtype-hidden` | `22B` — Loan Debentures (the only option; pre-filled, not typed) |
| Short Name | `bc-shortname` | `SSN - Jul 29` |
| Long Name | `bc-longname` | `5.625 Senior Secured Notes - Jul 29` |
| ISIN | `bc-isin` | `USN8106HAA16` |
| Face Value | `bc-facevalue` | `1,000` |
| Start Date | `bc-startdate` | `11-07-2024` |
| End Date | `bc-enddate` | `11-07-2029` |
| Currency | `bc-currency` | `USD` |
| Int Cal Method | `bc-intcalmethod` | blank |
| Coupon Rate | `bc-couponrate` | blank |
| Next Due Date | `bc-nextduedate` | blank |
| Coupon Frequency | `bc-couponfreq` | blank |

Short Name, Long Name, ISIN, Face Value, Currency and the Start/End Date were
deliberately mirrored from the existing Class ID `200216` at the user's
request. Company Code `9803` and the blank coupon fields were confirmed with
the user separately, since Class 200216's own Company Code and coupon terms
could not be read — see Known deviations.

**Reusing ISIN `USN8106HAA16` is intentional, not an oversight.** The user
confirmed this after being shown that the register already tolerates
duplicate ISINs across classes (e.g. `200210`–`200212` all carry ISIN
`ISIN1234`).

## Steps

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Navigate to the transaction | `sapPage.goto` | `${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009` |
| 3 | Prove the page rendered, then that we are past logon | `expect` | `body` visible, then `input[type=password]` count 0 |
| 4 | Find the app frame | `sapPage.frames()` | url contains `HTML000001.htm` |
| 5 | Set page size to 50 and record every existing Class ID | `#bc-page-size`, `input.bc-issuance-select[data-class-id]` | before-set, for post-write diffing |
| 6 | Fill the Company Code autocomplete by clicking an option | `#bc-cocode`, `#bc-cocode-drop` | verify `#bc-cocode-hidden` |
| 7 | Fill Short Name, Long Name, ISIN, Face Value | `fill` | — |
| 8 | Fill Start Date, End Date | typed digits | `autoSlashDate` formats them; date-hidden calendar overlay needs `force: true` |
| 9 | Select Currency | `selectOption` | `USD` |
| 10 | Gate: refuse to submit if any required value is empty | — | throws before any write |
| 11 | **Create the Bond Class (writes)** | `#bc-submit-btn` | **human confirms first** — no review dialog exists for this path, unlike Create Issuance |
| 12 | Re-find the app frame, re-set page size 50, diff the Class ID set | `sapPage.frames()` re-find | the handle goes stale on the ITS round trip |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Hidden autocomplete value | `bc-cocode-hidden` | `9803` | `inputValue()` |
| 2 | Start / end date as filled | `bc-startdate`, `bc-enddate` | `11-07-2024`, `11-07-2029` | `toBe` |
| 3 | Exactly one new Class ID appears after the write | Class ID set diff | exactly 1 new id, and it is **not** `NEW-…` (see Known deviations) | set difference |
| 4 | New row's data matches what was submitted | `data-short-name`, `data-isin`, `data-face-value`, `data-currency` | `SSN - Jul 29`, `USN8106HAA16`, `1000`, `USD` | `getAttribute` |
| 5 | Total Bonds count increased by 1 | KPI tile text | `53` (was `52`) | text match |

Assertion 3 is the one that matters most. `createBond()`'s own source
generates a **client-side placeholder** `classId: "NEW-" + (++_bondClassSeq)`
for an offline/browser-preview fallback branch; if the WebGUI detection
(`isFioriWebGui()`) misidentifies the environment the same way `ZFS_ODEMO_M006`'s
`isSapGuiHtmlViewer()` did (TC-001, defect D1), the form would never reach the
real backend and the register would show nothing new, or a `NEW-…` row that
does not survive a fresh page load.

## Writes

Step 11 commits one new Bond Class. Confirmed by the human at run time. Every
other step is read-only.

## Cleanup

The Bond Class would be left in place, identified by its server-assigned
Class ID (recorded in the run's result file). Nothing to clean up so far — no
run has been recorded yet.

## Known deviations

- **No review/confirm dialog on this path.** Unlike Create Issuance
  (`openCreateIssuancePopup` → "Confirm, Create Issuance"), `bc-submit-btn`'s
  `type="submit"` directly invokes `createBond()` via the form's
  `onsubmit="return createBond();"` — passing validation submits immediately.
  There is no safe way to "peek" at a rendered confirmation before committing;
  the human confirmation happens before the click itself, not before a
  cancel-able review step.
- **The Class ID hotspot popup (`openClassIdHotspot`) is broken.** Clicking a
  Class ID button in the register does not show a details popup as its name
  suggests — it navigates the whole app frame away to an unrelated "Display
  Class" Dynpro screen with a blank ID Number field. Discovered while trying
  to read Class 200216's Company Code/coupon terms for this case; documented
  here so the next person doesn't re-trigger it expecting a modal. Not used by
  this case's own steps.
- `createBond()`'s in-memory `record.classId` is always `"NEW-"+seq` — this is
  scaffolding for an offline preview branch, not the real persisted value.
  This case verifies the register's real, server-assigned Class ID instead of
  trusting anything client-side.
- The app frame url is `…/HTML000001.htm` under a session-specific path, same
  as `ZFS_ODEMO_M006` and TC-010.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-18 | PASS | `results/TC-011-2026-08-18-1436.md` | Created Class ID 200219 (Total Bonds 53 → 54). One deviation: post-write verification initially failed to re-find the app frame despite the write succeeding — fixed by verifying via fresh navigation instead of reusing the frame handle; see result file. |
