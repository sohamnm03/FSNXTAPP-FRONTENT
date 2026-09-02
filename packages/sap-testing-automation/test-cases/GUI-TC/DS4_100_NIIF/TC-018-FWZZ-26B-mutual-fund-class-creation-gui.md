# TC-018 — FWZZ (SAP GUI for Windows): create a Class for product type 26B (Inv: Mutual Funds)

- **Case id:** TC-018
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FWZZ` (Class)
- **Spec file:** `gui_tests/cases/tc018_fwzz_mutual_fund_class.py` (run it with `scripts/run-gui-case.ps1 -Case TC-018`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthik.r@fourthsignal.com)
- **Created:** 2026-08-19
- **Status:** draft
- **Writes to the database:** yes — creates one new Class (server-assigned id)

## Purpose

Proves a new Class can be created in `FWZZ` for product type `26B` ("Inv:MF" —
Investment: Mutual Funds), through **SAP GUI for Windows**.

GUI-lane sibling of **TC-017** (web lane, WebGUI/ITS). Same product type, same
mock data (Issuer `700000453`, currency `INR`), same business question,
different rendering path: a transaction reachable both ways is not the same
rendering path in each and does not fail the same way (CLAUDE.md). The two are
**not** interchangeable as evidence, and this case does not inherit TC-017's
run history or its known deviations.

Deliberately **create only**, mirroring TC-017's scope. Does **not** cover:
Change, Delete, Display of an existing class, the Conditions / Exchanges /
Security Swap / Regulatory Reporting / User Data tabs (unreachable without
Issuer filled — see Known deviations), or any product type other than `26B`.

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | Session is on DS4 / client 100 | `assert_dev_system` — **stop if it is not** (rule 1) |
| 2 | Business Partner `700000453` carries role `TR0150` (Issuer) | confirmed live via `securities.fill_basic_data` — Issuer resolves to a name ("TATA FIN PVT.LTD / MUMBAI 400021") and `securities.check_class` (Check, F8) reports "Data is consistent" |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Held in the case module as `BASELINE`
(`gui_tests/cases/tc018_fwzz_mutual_fund_class.py`), not in
`test-data/*.dataset.json` — nothing else reads these values yet, the same
convention TC-014/TC-015 follow. Mirrors TC-017's (web lane)
`test-data/fwzz-mutual-fund-class.dataset.json` baseline row exactly.

| Field | Technical name | Value |
|---|---|---|
| ID Number | `SECURITY_CREATE-SECURITY_NEW` | left blank — 26B is internally numbered |
| Product Type | `SECURITY_CREATE-PRODUCT_TYPE` | `26B` (Inv:MF) |
| Status | `SECURITY_CREATE-ACTIVE` (radio) | Active — driven explicitly, not trusted at default |
| Reference | `SECURITY_CREATE-NO_TEMPLATE` (radio) | Without Reference — driven explicitly, not trusted at default |
| Short Name | `SECURITY_CREATE-SHORT_TEXT` | `NIFTY50 IDX FUN` (max 15 chars) |
| Long Name | `SECURITY_CREATE-LONG_TEXT` | `NIIF Nifty 50 Index Fund - Growth` (max 60 chars) |
| Issuer | `SECURITYV-ISSUER` | `700000453` (TATA FIN PVT.LTD / MUMBAI 400021) |
| Issue Currency | `SECURITYV-ISSUE_CURRENCY` | `INR` |

## Steps

GUI lane, frozen script. Every element id lives in
`gui_tests/screens/fwzz-entry.json`, `fwzz-create-dialog.json` and
`fwzz-class-master.json` with the date it was discovered — a case never
contains a literal id (CLAUDE.md rule 4). Ids were discovered with
`sap_get_screen_elements` / `sap_get_toolbar_buttons` on DS4/100 on
2026-08-19; re-discover before reusing against another system or another
product type.

Stages: `entry` → `dialog` → `basic` → `save`. A run stops after the stage it
was asked for. `entry`, `dialog` and `basic` write **nothing**.

| # | Action | Component | Notes |
|---|---|---|---|
| 1 | **Confirm system is DS4 / 100** | `sap.attach()` + `assert_dev_system` | runs again on every `start_transaction`; **stop if it is not** (rule 1) |
| 2 | Open `FWZZ`, leave ID Number blank | `open_class_entry` | never types an id — 26B assigns numbers internally |
| 3 | Press Create — opens the modal dialog | `open_create_dialog` | raises if screen 115 is not reached |
| 4 | Drive Status → Active, Reference → Without Reference, fill Product Type / Short Name / Long Name | `fill_create_dialog` | radios driven explicitly — `read_field` on a `GuiRadioButton` returns its label, not whether it is selected |
| 5 | Press Create (F5) — opens the class master | `press_create_confirm` | handles an unexpected popup defensively (none expected — the id field was never typed) |
| 6 | Read ID Number — expect the internal-numbering placeholder | `press_create_confirm` | `\INTERN\`, recorded, not yet a real id |
| 7 | Switch to Basic Data, fill Issuer + Issue Currency, Enter to resolve the Issuer's name | `fill_basic_data` | raises `WriteRefused` if Issuer does not resolve to a name |
| 8 | Check (F8) — validates only | `check_class` | raises if a popup appears or the status message reads as an error |
| 9 | **Save the class** (Ctrl+S) | `save_class` | **WRITE 1** — named in Writes, confirmed by the human at run time |
| 10 | Read the ID Number field — now the server-assigned number | `save_class` | raises if it still reads the placeholder |
| 11 | Re-Display the new class fresh, re-read Short Name (Search Terms) then Issuer (Basic Data) | `verify_persisted` | Short Name is read **before** switching tabs — TC-017 (web lane) found the opposite order loses it |

## Assertions

Every row below is emitted by the run itself from its journal
(`gui_tests/render_result.py`), so the report and the verdict cannot disagree.

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | Product Type as typed | `SECURITY_CREATE-PRODUCT_TYPE` | `26B` | `set_field_verified` |
| 2 | ID Number before Save | `SECURITYV-SECURITY_NUMBER` | literal placeholder `\INTERN\` | `read_field` |
| 3 | Issuer as typed | `SECURITYV-ISSUER` | `700000453` | `set_field_verified` |
| 4 | Issue Currency as typed | `SECURITYV-ISSUE_CURRENCY` | `INR` | `set_field_verified` |
| 5 | Issuer resolves to a name | `SECURITYV-ISSUER_TEXT` | non-blank (a business partner name) | `read_field`, after Enter |
| 6 | Check (F8) result | status bar message | "Data is consistent", message type not `E` | `read_field` / `get_screen_info` |
| 7 | ID Number after Save | `SECURITYV-SECURITY_NUMBER` | a real, non-placeholder value (the new class id) | `read_field` |
| 8 | Re-Display: Short Name persisted | `SECURITYV-SHORT_TEXT` (Search Terms) | `NIFTY50 IDX FUN` | `read_field`, fresh navigation |
| 9 | Re-Display: Issuer persisted | `SECURITYV-ISSUER` (Basic Data) | contains `700000453` | `read_field`, fresh navigation |

## Writes

- **Step 9 — Save the class.** Creates **one** new Class (product type `26B`,
  Issuer `700000453`, currency `INR`). Id is server-assigned. Named before it
  runs and confirmed by the human at run time (CLAUDE.md rule 3) —
  `gui_tests/run.py` prints it and waits for a `yes`.

That is the only write. Stages `entry`, `dialog` and `basic` make **zero**
writes, so `--stage basic` answers "does the harness work, right up to the
edge of Save" without touching the database.

No Test Run checkbox is involved — `FWZZ` has none. Rule 3a applies to
TBB1 / TPM44 / TPM1, which this case does not drive.

## Cleanup

The Class is left in place, identified by its server-assigned ID Number
(recorded in the run's result file). None required beyond that.

## Known deviations

- **The class master opens on "Search Terms", not "Basic Data".** The fields
  26B actually requires (Issuer, Issue Currency) live on Basic Data, one tab
  over — found the same way the web lane found it.
- **Switching tabs away from Basic Data is blocked until Issuer is filled**
  (confirmed on the web lane as "Make an entry in mandatory field \"Issuer\"");
  this case does not attempt any tab beyond Basic Data, so it was not
  independently re-confirmed on this rendering path.
- **26B is internally numbered.** The entry screen's ID Number field is never
  typed into — Check/Create refuses a typed one with "Numbers assigned to
  product type 26B internally", the identical message the web lane found.
- **Issuer must be a Business Partner in role `TR0150`.** `700000453`
  ("TATA FIN PVT.LTD / MUMBAI") is confirmed valid by a live Check (F8): "Data
  is consistent" (message class 65, number 202). A different, plain deal
  counterparty (`400000003`) was not re-tried on this lane — the web lane
  already found it refused ("does not exist in role TR0150"), and there is no
  reason a different rendering path of the same backend check would accept it.
- **Check (F8)'s clean result prints straight to the status bar here, with no
  popup** — different from the web lane's ITS rendering, which shows the
  identical text ("Data is consistent") inside a popup dialog. `check_class`
  was only exercised against the **clean** case live; an unclean Check (e.g.
  Issuer or Issue Currency missing) was not independently confirmed on this
  lane. It reads a popup too, if one appears, so that untested path fails
  loudly rather than being misread as a pass.
- **A COM disconnect hit mid-discovery** (a `read_field` call immediately
  after setting Issuer/Issue Currency, before Check was ever pressed) —
  `(-2147417848, 'The object invoked has disconnected from its clients.')`,
  the identical failure class TC-014 documents. `sap_connect_existing`
  reattached, but the session had reset to `SESSION_MANAGER`, losing all
  in-progress screen state. Since nothing had been saved at that point, this
  cost only a redo of the discovery sequence from FWZZ's entry screen, not a
  write to verify — the module's `write_guarded()`-style caution is reserved
  for `save_class`, where an actual commit is at stake.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-19 | PASS | `results/TC-018-2026-08-19-2349.md` | First run of the frozen script. Created Class `300023`. Zero deviations — every assertion passed, including the post-write re-Display of Short Name and Issuer. Counts toward the freeze gate (one of two needed). |

Two PASS runs of the frozen script, with no deviations, are needed before
`Status:` may become `frozen`. It is `draft` until the script has run at least
once as written.
