# TC-017 — FWZZ: create a Class for product type 26B (Inv: Mutual Funds)

- **Case id:** TC-017
- **Lane:** web (WebGUI)
- **Transaction / app:** `FWZZ` (Class)
- **Spec file:** `web-tests/tests/fwzz-mutual-fund-class-create.spec.ts`
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude
- **Created:** 2026-08-19
- **Status:** active
- **Writes to the database:** yes — creates one new Class (server-assigned id)

## Purpose

Proves that a brand-new Class can be created through `FWZZ` for product type
`26B` ("Inv:MF" — Investment: Mutual Funds), and maps the screen along the
way: nothing in this workspace had driven FWZZ before this case was authored.
Covers the Create dialog, the class master's mandatory fields for this
product type, and the id's internal numbering. Does not cover any other
product type on this screen, the Conditions/Exchanges/Security
Swap/Regulatory Reporting/User Data tabs (unreachable without first
satisfying the Basic Data gate — see Known deviations), or Change/Delete.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | registry guard in `sap-system.ts` + smoke suite |
| 2 | Business Partner `700000453` carries role `TR0150` (Issuer) | `discover-fwzz-26b-issuer-typed.spec.ts` — Check (F8) reports "Data is consistent" |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Screen model control | Value |
|---|---|---|
| Product Type | `fwzz-create-dialog.productType` | `26B` (Inv:MF) |
| Short Name | `fwzz-create-dialog.shortName` | `NIFTY50 IDX FUN` (max 15 chars) |
| Long Name | `fwzz-create-dialog.longName` | `NIIF Nifty 50 Index Fund - Growth` |
| Status | (radio, left at default) | Active |
| Reference | (radio, left at default) | Without Reference |
| ID Number | `fwzz-create-dialog.idNumber` | left blank — 26B is internally numbered |
| Issuer Identity Key | `fwzz-class-master.issuer` | `700000453` (TATA FIN PVT.LTD / MUMBAI 400021) |
| Issue Currency | `fwzz-class-master.issueCurrency` | `INR` |

Mock data authored by Claude at the user's request ("use your own data"),
2026-08-19 — see `test-data/fwzz-mutual-fund-class.dataset.json`'s
`authorised` note for exactly how Issuer `700000453` was found valid (not
invented: discovered live via Check (F8), after a first candidate,
`400000003`, was tried and refused).

## Steps

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Open `fwzz-entry`, confirm DS4/100 | `openScreen` | `screens/fwzz-entry.json` |
| 3 | Click Create (id field left blank) | `mClick` | `fwzz-entry.createButton` |
| 4 | Fill the Create Class dialog | `mSet` | `fwzz-create-dialog.{productType,shortName,longName}` |
| 5 | Click Create (F5) — opens the master, does not commit | `mClick` | `fwzz-create-dialog.createConfirmButton` |
| 6 | Switch to the Basic Data tab | `mClick` | `fwzz-class-master.basicDataTab` |
| 7 | Fill Issuer + Issue Currency | `mSet` | `fwzz-class-master.{issuer,issueCurrency}` |
| 8 | Check (F8) — validates only, never a save | `mClick` | `fwzz-class-master.checkButton` |
| 9 | **Save (writes)** | `mClick` | `fwzz-class-master.saveButton` — **human confirms first** |
| 10 | Read the id field, now the server-assigned number | `mRead` | `fwzz-class-master.idNumber` |
| 11 | Re-Display the new id fresh (not the live screen) and re-read Short Name / Issuer | `openTransaction` + `mClick` displayButton | proves persistence rather than trusting client state |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Session | `system` / `client` | contains `DS4` / `100` | `sap_get_session_info` equivalent (`screenInfo`) |
| 2 | Product Type round-trip | `fwzz-create-dialog.productType` | `26B` | `mRead` |
| 3 | ID Number before Save | `fwzz-class-master.idNumber` | literal placeholder `\INTERN\` | `mRead` |
| 4 | Issuer round-trip | `fwzz-class-master.issuer` | contains `700000453` | `mRead` |
| 5 | Issue Currency round-trip | `fwzz-class-master.issueCurrency` | `INR` | `mRead` |
| 6 | Check (F8) result | popup text | no `error` line; ideally "Data is consistent" | `readPopup` |
| 7 | ID Number after Save | `fwzz-class-master.idNumber` | a real, non-placeholder value (the new class id) | `mRead` |
| 8 | Re-Display: Short Name persisted | `fwzz-class-master.shortName` | `NIFTY50 IDX FUN` | `mRead`, fresh navigation |
| 9 | Re-Display: Issuer persisted | `fwzz-class-master.issuer` | contains `700000453` | `mRead`, fresh navigation |

## Writes

Step 9 commits one new Class. Confirmed by the human at run time. Every other
step is read-only — Create (F5, step 5) opens the maintenance screen but does
not commit, and Check (F8, step 8) validates without committing.

## Cleanup

The Class is left in place, identified by its server-assigned ID Number
(recorded in the run's result file and `results/web/.../tc-017-class-id.txt`).
None required beyond that.

## Known deviations

- **The class master opens on "Search Terms", not "Basic Data".** The fields
  26B actually requires (Issuer, Issue Currency) live on Basic Data, one click
  away — `discover-fwzz-26b-master.spec.ts` found this by walking the tab
  strip.
- **Switching tabs away from Basic Data is blocked until Issuer is filled**
  ("Make an entry in mandatory field \"Issuer\""), which is why Conditions /
  Exchanges / Security Swap / Regulatory Reporting / User Data were never
  reached during discovery — this case does not touch them either, since
  Issuer + Issue Currency are sufficient for Check (F8) to report the data
  consistent.
- **26B is internally numbered.** Typing an id on the entry screen is refused
  ("Numbers assigned to product type 26B internally — do not enter an ID
  number") — `discover-fwzz-26b-master.spec.ts`'s first run hit this before
  the spec was corrected to leave the field blank.
- **Issuer Identity Key's own F4 is empty on this client.** 0 rows, even with
  every filter cleared (`discover-fwzz-26b-issuer.spec.ts`) — no Business
  Partner is set up in role `TR0150` by default lookup. `700000453` was found
  valid only by typing it directly and running Check (F8); a different BP
  already used elsewhere in this suite as a plain deal counterparty
  (`400000003`) was tried first and refused ("does not exist in role
  TR0150") — do not assume any BP number works here without a Check first.
- **The Search Terms tab (entry screen) advertises an "SPPI" tab that the
  actual 26B master does not have**, which instead shows "Security Swap" in
  its place. Tab sets are product-type-dependent; not re-verified beyond 26B.
- **The first live run's own post-write verification (step 11) had a bug,
  not the write.** It clicked the Basic Data tab before reading Short Name —
  Short Name only exists on Search Terms — so it read `null` and the run
  file recorded a spurious FAIL, even though the class master screen title
  had already changed from "Create Class" to "Change Class" with id `300021`
  and Issuer read back correctly in the same run. Fixed in the spec (read
  Short Name on Search Terms before switching to Basic Data for Issuer) and
  confirmed by a separate read-only check,
  `verify-fwzz-300021.spec.ts` (`verification` suite): Short Name, Long Name,
  Product Type, Issuer and Issue Currency all persisted exactly as written.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-19 | FAIL (write succeeded) | `results/TC-017-2026-08-19-2307.md` | Created Class `300021` — the write itself succeeded (Check: "Data is consistent"; screen title changed to "Change Class"; Issuer re-read correctly). The FAIL is the spec's own post-write Short Name read, fixed since — see Known deviations. Confirmed by `verify-fwzz-300021.spec.ts` the same day: Short Name/Long Name/Product Type/Issuer/Issue Currency all persisted correctly. |
| 2026-08-19 | PASS | `results/TC-017-2026-08-19-2320.md` | Created Class `300022`, re-run with the Short Name fix in place — every assertion passed, including the post-write re-Display of Short Name and Issuer. One deviation recorded: `readPopup()` fires right after Create (F5) every run, but its content is only the WebGUI sidebar's System Info panel (System/Client/User/Screen/Transaction/timings — no message, no buttons); nothing was clicked and nothing else was affected. Because a PASS run that records any deviation does not count toward the freeze gate (`scripts/check-suite.ps1` check 6), this run — like the previous one — does not count, even though the write and every assertion were clean. Narrowing that popup check to ignore the button-less System Info panel would let a future run register as fully clean; not done yet. |
