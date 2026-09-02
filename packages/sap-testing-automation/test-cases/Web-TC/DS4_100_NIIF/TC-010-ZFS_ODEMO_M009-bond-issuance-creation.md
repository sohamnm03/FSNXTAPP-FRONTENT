# TC-010 — ZFS_ODEMO_M009: create a bond issuance with valid mock data

- **Case id:** TC-010
- **Lane:** web (WebGUI)
- **Transaction / app:** `ZFS_ODEMO_M009` (Bond Workbench)
- **Spec file:** `web-tests/tests/zfs-odemo-m009-create-bond-issuance.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude
- **Created:** 2026-08-18
- **Status:** active
- **Writes to the database:** yes — creates one bond issuance transaction

## Purpose

Proves that a bond issuance can be created through `ZFS_ODEMO_M009` in the ITS
WebGUI against an existing, unissued Bond Class, and that the new issuance
(Trans No, units, price, placement) appears on that class's row in the Bond
Register. Does not cover creating a new Bond Class itself (`Create Bond`,
`bc-*` fields) or the Redemption path (`Redemption`, `redemption-*` fields) —
those are separate write paths on the same screen and would need sibling
cases.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | registry guard in `sap-system.ts` + smoke suite |
| 2 | Chromium installed for `playwright-sap` | `npm run install-browsers --prefix web-tests` |
| 3 | Bond Class `200194` exists and has no issuance yet (row checkbox `data-trans-no` empty) | discovered via `discover-zfs-odemo-m009-issuance-panel.spec.ts`; re-checked by this case itself before writing |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Element id | Value |
|---|---|---|
| Class ID (selected via row checkbox, not typed) | `bt-classid` / hidden `bt-classid-hidden` | `200194` — Senior Secured / Senior Secured Note121, USD, ISIN ISIN1234 |
| Issuance Date | `bt-issuancedate` | `15-08-2026` |
| No Of Units | `bt-units` | `5,000` |
| Issuance Price | `bt-price` | `100.00` |
| Issuance Placement (readonly, auto-derived = units × price) | `bt-placement` | `500,000.00` (0.50 M) |

Class ID `200216` was considered first but rejected: it already carries
issuance Trans No `150070`, and `Create Issuance` only enables for a class
with no existing issuance (see `updateCreateIssuanceButton()` in the app's own
JS, captured during discovery). `200194` was confirmed as an unissued class
instead.

The placement value was confirmed with the human before this case was
authored: the value first stated (`5.00 M`) did not match `5,000 × 100.00`;
every existing register row's placement equals `units × price`, so `0.50 M`
was used instead — see the discovery log for the reasoning.

**`bt-classid` and `bt-currency-hidden` are pre-filled from the selected register
row, not typed.** There is no autocomplete to drive on this panel, unlike
`ZFS_ODEMO_M006`'s company code / partner / product type / currency fields.

## Steps

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Navigate to the transaction | `sapPage.goto` | `${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009` |
| 3 | Prove the page rendered, then that we are past logon | `expect` | `body` visible, then `input[type=password]` count 0 |
| 4 | Find the app frame | `sapPage.frames()` | url contains `HTML000001.htm` |
| 5 | Search the register for Class ID `200194` | `#bc-search` + Search button | — |
| 6 | Read `data-trans-no` off the row's checkbox; refuse if not empty | `input.bc-issuance-select` | throws before any write |
| 7 | Select the row checkbox | `input.bc-issuance-select` | enables `#bc-create-issuance-btn` |
| 8 | Open the Create Issuance panel | `#bc-create-issuance-btn` | — |
| 9 | Verify the panel pre-filled Class ID / Currency from the row | `#bt-classid-hidden`, `#bt-currency-hidden` | — |
| 10 | Fill Issuance Date, No Of Units, Issuance Price | `#bt-issuancedate`, `#bt-units`, `#bt-price` | date typed as digits — `autoSlashDate` formats it |
| 11 | Read back the auto-derived Issuance Placement | `#bt-placement` | readonly field, not typed |
| 12 | Gate: refuse to submit if any required value is empty, or placement ≠ units × price | — | throws before any write |
| 13 | Open the review dialog | `#bt-submit-btn` | not yet a write |
| 14 | **Confirm the issuance (writes)** | button role "Confirm, Create Issuance" | **human confirms first** |
| 15 | Close the success dialog if one appears | button role "Done" | — |
| 16 | Re-search the register and re-read the row | `sapPage.frames()` re-find, `#bc-search` | verification, not a write |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Issuance Date as filled | `bt-issuancedate` | `15-08-2026` | `toBe` |
| 2 | No Of Units as filled | `bt-units` | `5000` (numeric) | numeric compare |
| 3 | Issuance Price as filled | `bt-price` | `100.00` (numeric) | numeric compare |
| 4 | Issuance Placement as auto-derived | `bt-placement` | `500000` (numeric) | numeric compare |
| 5 | Register row for `200194` after the write | `data-trans-no` | non-empty | `getAttribute` |
| 6 | Register row units/price after the write | `data-no-of-units`, `data-issuance-price` | `5000`, `100.00` (numeric) | numeric compare |

Assertion 5 is the one that matters. Everything before it can look healthy
while the review dialog was cancelled or the confirm click silently failed;
only a re-read of the row after the round trip proves the issuance exists.

## Writes

Step 14 commits one bond issuance transaction against Class ID `200194`.
Confirmed by the human at run time. Every other step is read-only, including
opening the review dialog (step 13) — it only renders a summary.

## Cleanup

The issuance would be left in place, identified by Class ID `200194` and its
new Trans No (recorded in the run's result file / `tc-010-run-log.txt`).
Nothing to clean up so far — no run has been recorded yet.

## Known deviations

- **`Create Issuance` starts disabled and stays disabled for most rows.** It
  only enables once a row with an empty `data-trans-no` is selected — i.e. a
  Bond Class that has never been issued. Every row on the register's first
  page already carries an issuance; the unissued classes (`200194`, `200191`,
  `200190`, `200183`, `200179`, `200178`, `200177`, `200173`, `200146`,
  `200137` as of 2026-08-18) had to be found by paging through the full
  register and inspecting each row's `data-trans-no` attribute.
- **The review dialog's buttons carry no `id`.** Addressed by
  `getByRole('button', { name, exact: true })` on `"Cancel"` and
  `"Confirm, Create Issuance"` instead.
- The app frame url is `…/HTML000001.htm` under a session-specific path, same
  as `ZFS_ODEMO_M006`.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-18 | PASS | `results/TC-010-2026-08-18-1405.md` | Created Trans No 150072 against Class ID 200194. Two deviations along the way (wrong-modal detection, frame detach on post-write verification) — both fixed in the spec; see result file. |
