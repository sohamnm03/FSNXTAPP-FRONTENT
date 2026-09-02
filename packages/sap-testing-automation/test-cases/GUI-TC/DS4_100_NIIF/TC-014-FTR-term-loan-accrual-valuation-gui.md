# TC-014 — FTR_CREATE / FTR_EDIT / TBB1 / TPM44 / TPM1 (SAP GUI for Windows): term loan created, settled, posted and month-end valued

- **Case id:** TC-014
- **Lane:** sap-gui (SAP GUI for Windows)
- **Transaction / app:** `FTR_CREATE`, `FTR_EDIT`, `TBB1`, `TPM44`, `TPM1`
- **Spec file:** `gui_tests/cases/tc014_term_loan_accrual_valuation.py` (run it with `scripts/run-gui-case.ps1 -Case TC-014`; see `docs/unattended-runs.md` § The GUI lane)
- **System:** DS4_100_NIIF (DS4 / client 100)
- **Type:** functional
- **Author:** Claude (requested by karthikitram@gmail.com)
- **Created:** 2026-08-19
- **Status:** active
- **Writes to the database:** yes — creates an interest rate instrument, settles it, posts its due flows, then runs month-end accrual/deferral (TPM44) and valuation (TPM1) for the same deal

## Purpose

GUI-lane sibling of **TC-009** (web lane, WebGUI/ITS). Same business flow, same
test data, same five writes — driven through SAP GUI for Windows (`sap-gui`
MCP server for the first run, `gui_tests/` thereafter) instead of a browser. Exists because a transaction reachable both
ways is not the same rendering path in each and does not fail the same way
(CLAUDE.md) — element ids, popup shapes and at least one failure mode
(see Known deviations) are specific to this lane and were not assumed from
TC-009's web-lane notes.

Does **not** cover: month 2 onward, reversal of any of the five steps,
or verification of the resulting FI documents in `FB03`.

The 2026-08-19 run was model-driven, and was used to scope the GUI lane's
frozen-script harness (`gui_tests/`, built the same day) from a real run rather
than from guesswork — so the notes below are the source for what that harness
has to handle.

## Preconditions

Same as TC-009 #1–6 (company code `1000`, product type `22A`/txn type `100`,
partner `700000453`, currency `INR` default, General Valuation Class /
Valuation Class distinction). Re-confirmed independently on this lane during
the 2026-08-19 run — see Steps.

| # | Condition | Confirmed this run |
|---|---|---|
| 1 | Company code `1000` exists | deal screen header, `VTGFHA-BUKRS` = `1000` |
| 2 | Product type `22A`/txn type `100` lands on `SAPLFTR_IRATE 1100` | same screen/program as web lane's `TM_51` |
| 3 | Partner `700000453` resolves | `VTGFHA-XKONTRH` = "TATA FIN PVT.LTD / Nariman Point, Mumbai / MUMBAI 400021" |
| 4 | Currency `INR` defaults | `VTG_INVEST-WZBETR` = `INR`, not changeable |
| 5 | General Valuation Class / TPM44-TPM1 Valuation Class are two distinct fields | confirmed — see Steps 6b, 10, 12 |
| 6 | Deal not already settled on re-run | not exercised this run (fresh deal) |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

Identical to TC-009's `baseline` row (`test-data/term-loan-accrual-valuation.dataset.json`).
No GUI-lane-specific single-deal dataset exists yet — this run typed the same table
TC-009 documents. See TC-009 for the full field/value table.

**Data-driven / batch mode (added 2026-08-21):** `gui_tests/cases/tc014_term_loan_accrual_valuation.py`'s
`run()` now also accepts `--rows`, driving one full create → settle → post →
TPM44 → TPM1 lifecycle per row of `test-data/term-loan-accrual-valuation-batch.dataset.json`
— the same 10-row dataset TC-012 (web lane) already runs, same profile as this
case's baseline (co.code `1000`, product `22A`, partner `700000453`, `INR`),
different amount/start date per row (100k–550k, Jan–Oct 2026 starts, one month
apart). Opt-in: no `defaultRows` is set in `config/gui-runs.json`, so the plain
command is unchanged and still drives only the single `BASELINE` deal.

```
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Rows all -DryRun
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Rows all
```

Batch rows do not support `--resume` — each row is its own deal, so there is no
single deal number to resume against. If a batch run stops partway,
`scripts/check-run.ps1 -Latest` shows which rows already landed; re-run with
`--rows` limited to what's still missing rather than the full set, to avoid a
duplicate deal for a row already saved.

## Steps

GUI lane. Every element id below is what `sap_get_screen_elements` returned on
2026-08-19 against DS4/100 — do not reuse against another system without
re-discovering (CLAUDE.md rule 4).

| # | Action | Tool | Element / argument |
|---|---|---|---|
| 1 | Attach to the open session | `sap_connect_existing` | — |
| 2 | **Confirm system is DS4 / 100** | `sap_get_session_info` | user `FS_DEV`, client `100` — **stop if not** |
| 3 | Start FTR_CREATE | `sap_execute_transaction` | `FTR_CREATE` |
| 4 | Fill co.code/product/txn type/partner | `sap_set_field` | `ctxtFTR_ENTRY-BUKRS`, `-SGSART`, `-SFHAART`, `-KONTRH` |
| 5 | Enter → deal screen | `sap_send_key` | `Enter` → `TM_51` / `SAPLFTR_IRATE 1100` |
| 6 | Fill amount, term start/end, rate, contract date | `sap_set_field` | `...NOMFLOW:1203/txtVTG_INVEST-XZBETR`, `...TERM:1204/ctxtVTG_TERM-XBLFZ`/`-XELFZ`, `...IRATE:1201/txtVTG_IRATE_STRUCTURE-PKOND`, `...CONTRACT:0800/ctxtVTGFHAZU-XVTRAB` |
| 6a | Enter to validate | `sap_send_key` | `Enter` — no working-day dialog this run (see Known deviations) |
| 6b | Switch to Administr. tab, select Gen. Valn Class = `Short Term`, switch back | `sap_select_tab` / `sap_select_combobox_entry` | tabs `tabpMMFD03`/`tabpMMFD01`; combobox `...POSITION_ALLOCATION:0140/cmbVTGFHA-RCOMVALCL` |
| 7 | **Save the deal** | `sap_send_key` | `Save` (F11) → check-run popup, confirm only at 0 term / 0 err |
| 8 | Open FTR_EDIT, fill co.code + deal no, click **Settle**, **Save** | `sap_set_field` / `sap_press_button` / `sap_send_key` | `ctxtFTR_ENTRY-BUKRS`/`-RFHA`, `usr/btnSETTLE`, `Save` |
| 9 | Open TBB1, fill selection + both dates, Test Run off, **execute** — no simulation pass first | `sap_set_field` / `sap_select_checkbox` / `sap_send_key` | `ctxtS_RFHA-LOW`, `ctxtP_DZTERM`, `ctxtP_DBUCHU`, `ctxtP_BUDAT`, `chkP_TEST`=false, `Execute` (F8) |
| 9a | Drill into the result popup's Posting Log row | `sap_select_table_row` then `sap_double_click_cell` | grid `usr/cntlCUSTOM_CONTROL1/shellcont/shell`, row 0, column `PROTOCOL_TYPE_TEXT` — **select before double-click; double-click alone on an unselected row does nothing** (new for this lane, see Known deviations) |
| 10 | Open TPM44, fill Company Code (prefilled), Valuation Area/Class, Financial Transaction, Key Date | `sap_set_field` | `ctxtSO_VAREA-LOW`, `ctxtSO_VCLS-LOW`, `ctxtSO_OTCNR-LOW`, `ctxtP_KEYDAT` |
| 11 | TPM44 with **Test Run off** — posts, run directly | `sap_select_checkbox` / `sap_send_key` | `chkP_TEST`=false, `Execute` — lands directly on an inline ALV result (no popup) |
| 12 | Open TPM1, fill Valuation Area/Class, Transaction, **Valuation Category** (mandatory), Key Date for Valuation | `sap_set_field` / `sap_select_combobox_entry` | `ctxtSO_VCLS-LOW`, `ctxtSO_OTCNR-LOW`, `ctxtKEYDATE`, combobox `cmbVALCAT` = `Mid-Year Valuation with Reset` |
| 13 | TPM1 with **Test Run off** — F8 only selects | `sap_select_checkbox` / `sap_send_key` | `chkX_SIMULA`=false, `Execute` → `SAPLSLVC_FULLSCREEN 500` "Display Selected Treasury Positions for Valuation" |
| 13b | Press **Run Valuation** on the positions screen | `sap_press_button` | app toolbar `tbar[1]/btn[8]` ("Run Valuation", tooltip confirmed via `sap_get_toolbar_buttons`) → lands on "Valuation Log" |

## Assertions

| # | Field / source | Expected | Observed | Read with |
|---|---|---|---|---|
| 1 | System / client / user | `DS4` / `100` | `DS4` / `100` / `FS_DEV` | `sap_get_session_info` |
| 2 | Partner resolves | TATA FIN PVT.LTD | confirmed on deal screen | `sap_get_screen_elements` |
| 3 | Currency defaults | `INR` | confirmed, not changeable | `sap_get_screen_elements` |
| 4 | Amount / Term Start / End / Rate round-trip | `100000` / `01.01.2026` / `31.12.2026` / `10` | **NOT OBSERVED** — set via `sap_set_field`, not independently re-read after Enter/save (see note below) | — |
| 5 | Create check-run | 0 terminations, 0 errors | `0` / `0` (1 warning: partner contract-date notice) | `sap_get_popup_window` |
| 6 | Create confirmation | `interest rate instrument <n> ... is created` | "Interest rate instrument 160275 in company code 1000 is created" | `sap_get_popup_window` (post-confirm screen) |
| 7 | Settle check-run (final successful attempt) | 0 terminations, 0 errors | `0` / `0` (1 warning) | `sap_get_popup_window` |
| 8 | Settle confirmation | `is changed` / `is settled` | "Interest rate instrument 160275 in company code 1000 is changed" | screen message |
| 9 | TBB1 live post | contains deal no.; not a Test Run | Posting Log: 2 rows, deal `160275`, both green, Company `1000`, Product `22A` | `sap_read_table` on Posting Log ALV |
| 10 | TBB1 Test Run flag | `false`, driven and read back | driven false; confirmed visually via `sap_screenshot` before execute | `sap_screenshot` |
| 11 | TPM44 result | contains deal no. | result list scoped to the sole filter value `160275`; postings `AD1000`/`AD1001`, 849.31 INR each, key date 31.01.2026 | `sap_get_screen_elements` (labels) |
| 12 | TPM44 Test Run flag | `false` | driven false; confirmed via `sap_select_checkbox` response | — |
| 13 | TPM1 selection / positions | Transaction `160275`, "Valuation Allowed" | confirmed on positions screen, green status | `sap_screenshot` |
| 14 | TPM1 Test Run flag | `false` | driven false; confirmed via `sap_select_checkbox` response | — |
| 15 | TPM1 run result | contains deal no. | Valuation Log: green, "Valuation On 31.01.2026", Transaction `160275`, Co `1000`, PTyp `22A`, VA `001` | `sap_screenshot` |

**Note on #4:** unlike the web lane's `setFieldVerified`, this run did not call
`sap_read_field` on Amount/Term Start/End/Rate after setting them — the tab
switch to Administr. succeeding is indirect evidence Term Start was accepted
(SAP blocks the switch otherwise, see Known deviations), but the exact stored
values were not independently re-read before save. A frozen script for this
lane should read these back explicitly, the way `setFieldVerified` does.

## Writes

Five, all authorised by the requester (see conversation confirmation,
2026-08-19), same as TC-009:

1. **`FTR_CREATE` Save** — creates the interest rate instrument. **Deal 160275.**
2. **`FTR_EDIT` → Settle → Save** — settles it. Required a retry — see Known deviations (COM disconnect).
3. **`TBB1` with Test Run off** — posts the due flows, run directly.
4. **`TPM44` with Test Run off** — posts accrual/deferral at key date `31.01.2026`.
5. **`TPM1` with Test Run off** — posts valuation at the same key date.

No screenshots were saved to `evidence/` for this run — see Known deviations
("No automated evidence capture for the GUI lane"). What's recorded above is
what was read back from the screen at each step, not saved image files.

## Cleanup

None performed. Deal 160275 is left in place — created, settled, posted and
month-end valued — same convention as TC-009. Not a reusable fixture.

## Known deviations

- **No working-day dialog appeared this run**, unlike some TC-002/TC-009 runs
  — consistent with the existing observation that it's session-dependent, not
  data-dependent.
- **Check-run dialog on both saves** — same pattern as TC-009 (0 terminations,
  0 errors, 1 warning: "Partner 700000453 cannot be used, as per contract
  01.01.2026"). Confirmed only at 0/0, same rule.
- **TBB1/TPM44/TPM1 `Test Run` all default to ON** — each driven to `false`
  and confirmed (by tool response or screenshot) before executing.
- **TBB1's result popup requires a select-then-double-click, not a plain
  double-click.** The "Information Overview" ALV grid's "Posting Log" row
  didn't drill in on the first `sap_double_click_cell` call; only after
  `sap_select_table_row` had focused/highlighted the row did the second
  double-click work. Not documented on the web lane (different rendering
  entirely — ITS renders this as a different control). A frozen GUI-lane
  script must select the row first.
- **A COM disconnect interrupted the settle save mid-flight.** After pressing
  Save on the settlement screen, the tool call returned
  `"Could not read screen information"` (`-2147417848`, "The object invoked
  has disconnected from its clients"). `sap_connect_existing` reconnected
  successfully but the session had reset to `SESSION_MANAGER` — all in-progress
  screen state (the settle-in-progress deal 160275) was lost. **Rather than
  assume the save had or hadn't gone through, the History button on FTR_EDIT
  (read-only) was used to check**: it showed only one activity ("1 Contract
  Active"), confirming settlement had **not** landed. Retrying Settle then hit
  `Error: You are already editing transaction 160275 in company code 1000` —
  a stale lock from the crashed session's own settle attempt. It cleared on
  the next retry with no explicit wait. The save after that produced a
  transient 2-error check-run ("Error during distribution", "... is being
  processed") — **cancelled rather than confirmed**, per the 0-errors-only
  rule; a further retry a short time later came back clean (0/0) and the save
  went through. **A frozen GUI-lane script needs to treat a COM disconnect as
  a hard stop requiring a live re-check (e.g. History) before any retry, and
  treat a non-zero-error check-run on retry as a signal to back off and retry
  again rather than force through.**
- **No automated evidence capture exists for the GUI lane.** The web lane's
  `captureEvidence` saves a PNG per write into `evidence/DS4_100_NIIF/`;
  `sap_screenshot` (the GUI-lane equivalent tool) only returns an inline image
  to the caller — nothing is written to disk. This run's evidence is the
  screen content read back at each step (popup text, ALV grid rows, status
  bar messages), not saved image files. A frozen GUI-lane script needs its own
  save-to-disk step if per-write screenshots are wanted, matching the web
  lane's convention.
- **GUI-lane element ids are SAP GUI Scripting paths**
  (`/app/con[0]/ses[0]/wnd[0]/usr/...`), unrelated to the web lane's ITS-based
  ids for the same fields — expected per CLAUDE.md ("element ids discovered on
  one system are not portable to another"), confirmed here that they're also
  not portable *between lanes* on the same system.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| 2026-08-19 | PASS | `results/TC-014-2026-08-19-1737.md` | Deal 160275 created, settled, posted, accrued (TPM44) and valued (TPM1) at key date 31.01.2026 — all five writes. First GUI-lane run of this flow. One incident: COM disconnect mid-settle-save required a verified retry (see Known deviations) — no duplicate writes resulted. |
| 2026-08-19 | FAIL | `results/TC-014-2026-08-19-1812.md` | **Not a test of the product — a harness bug, and an unintended live run.** While testing the new `gui_tests/` run-lock behaviour, a lock file was seeded with a Git Bash `$$` pid; that is a virtual MSYS pid, not a Windows one, so `_pid_alive()` correctly read it as stale and the run proceeded to SAP instead of being refused as the test intended. It then crashed in `fill_term_loan` on `NameError: _confirm_working_day_dialog is not defined` — a function referenced but never written. **Nothing was committed:** the crash landed after the deal screen was filled and before any Save, and the run file records `Documents created: None`. The missing function has since been implemented (it confirms only the "Not a Working Day" dialog family and refuses any unrecognised dialog). Lock refusal was then re-tested with a genuine live Windows pid and correctly refused with exit 2 without reaching SAP. The FTR_CREATE deal screen was left open, unsaved. |
| 2026-08-19 | PARTIAL | `results/TC-014-2026-08-19-1824.md` | **First scripted run (`gui_tests/`).** Deal **160276** created, settled and posted — writes 1-3 committed — then crashed with `AttributeError: 'list' object has no attribute 'get'`: `screen_labels()` was written against the MCP tool's JSON shape (`{"elements": [...]}`) rather than the library method's real return type (`List[ScreenElement]`). All 19 controller methods were audited; this was the only mismatch. **This run file under-reports:** it records 160276 as created+settled, but the TBB1 post had in fact committed (verified on screen: "Posted Transactions", two green rows) — the crash landed in the log *reader*, after the write. That exposed a second, worse defect: all three write functions recorded the write only *after* reading its result, so a reader crash erased the record of a real write. Fixed — each write is now claimed immediately after it is sent, then confirmed. |
| 2026-08-19 | PARTIAL | `results/TC-014-2026-08-19-1834-resume.md` | **Resume of 160276** (`--resume 160276`), completing writes 4 and 5. TPM44 posted accrual/deferral (AD1000/AD1001, 849.31 INR each, base 9,972.60 over 364 days) and TPM1 reached the Valuation Log, both at key date 31.01.2026. Settle and TBB1 correctly no-opped as already done. Deal 160276 is therefore complete across the two runs: created → settled → posted → accrued → valued. First run to save its own evidence PNGs (all five). Three reporting defects found in this run's own output and since fixed: (a) it claimed "WRITE 2 — ok" for a settle it had skipped; (b) it recorded assertion 2 as **fail** when TBB1's log was merely unreadable — "could not observe" is now `NOT OBSERVED` plus a deviation, never `fail`; (c) the Documents row showed a blank Type, because the create entry lives in the previous run's journal and nothing merges across runs. |
