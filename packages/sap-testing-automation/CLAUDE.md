# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# SAP Testing Automation

Functional / front-end test automation for SAP S/4HANA on `DS4` client `100`. **No ABAP source
lives here** — this workspace exercises what the development project built, and records what it
observes.

Sibling workspace: `D:\SAP Tool\SAP-Project-Development V1` builds the ABAP objects. This one
tests them. Keep the split — never create or edit an ABAP object from here.

## Two lanes

| Lane | Drives | How | Docs |
|---|---|---|---|
| **`sap-gui`** | SAP GUI for Windows — classic Dynpro t-codes, ALV grids, table controls, trees | SAP GUI Scripting COM API, via MCP server (57 tools) | `docs/sap-gui-mcp-setup.md` |
| **`web-tests/`** | Fiori, WebGUI, UI5 in a browser | `playwright-sap` (a Playwright fork with UI5-aware locators) | `docs/web-testing-setup.md` |

Pick by what the user actually uses. A transaction reachable both ways is not the same rendering
path in each and does not fail the same way. A flow spanning both gets split, with the boundary
noted in the case file.

Both lanes read the **same** `config/sap-systems.json` and the **same** credential
(`SAP_DS4_100_NIIF_PASSWORD` in `.claude/settings.local.json`). One registry, one secret.

## Non-negotiables

1. **Confirm the system before every run.** `sap_get_session_info` must report `DS4` / client
   `100` before any step that writes. SAP Logon Pad on this machine also holds
   **"NIIF - Production"** and **"TFSIN - S4 Production"**; `sap_connect_existing` attaches to
   whatever session is open, not to what the registry says.
2. **`ok` is not "logged on", and absence proves nothing.** `sap_connect` returns `ok` when the
   COM call didn't raise — read `user` from `sap_get_session_info`; empty means you're still on
   the logon screen. Prefer `sap_connect_existing`. Same trap in the web lane: assert something
   is **present** before asserting the password box is **absent** — `toHaveCount(0)` is true of a
   page that hasn't rendered yet.
3. **Never save without saying so.** Any step that commits (`sap_send_key` with `Save`/`F11`,
   posting, a create/change t-code) is named in the test case **before** it runs and confirmed by
   the human at run time. Read-only verification never needs asking; a database write always does.
3a. **A Test Run checkbox is never used to simulate first.** TBB1, TPM44, TPM1 and any future
   screen with the same pattern default the checkbox to ON; every flow drives it to `false` and
   reads it back, then runs once, live — no separate simulation pass before the real write.
4. **Discover, never guess, element ids.** Call `sap_get_screen_elements` on an unfamiliar screen
   and use what it returns. A hand-written id that doesn't exist fails as "not found", which reads
   like a product bug and isn't one.
5. **Record what actually happened.** Every run writes a result file under `results/`. If a step
   was skipped, blocked, or produced an unexpected screen, that goes in the file — a test report
   that hides a skipped step is worse than no report.
6. **Never invent a result.** No expected value is ever written down as observed. If a screen
   couldn't be read, the field is `NOT OBSERVED`, not a plausible number.
7. **No production.** Do not add a production system to `config/sap-systems.json`, and do not
   drive a session that turns out to be on `PS4`. Stop and report instead.
8. **`.mcp.json` is generated.** Edit `config/sap-systems.json` and rerun the sync script. Never
   hand-edit `.mcp.json` or commit a password.
9. **Multiple sessions only when the human asks.** Both lanes default to one session running one
   case at a time — `web-tests/playwright.config.ts` pins `workers: 1` / `fullyParallel: false`
   because cases share test data on one client, and the GUI lane drives a single SAP GUI session
   per run. Opening a second SAP GUI session (`sap_connect`), attaching to more than one at once,
   or running cases in parallel (e.g. `npx playwright test --workers=N`) happens only for a given
   run when the human explicitly asks for it — never on your own initiative, and never by editing
   the config defaults. Confirm which cases run together, and that they don't share writable test
   data, before starting.

## Index — read before doing

| Doing this | Read | Watch for |
|---|---|---|
| **Driving SAP GUI (t-codes, ALV)** | `docs/sap-gui-mcp-setup.md` | Prefer `sap_connect_existing`; SAP Logon Pad must be running |
| **Driving Fiori / WebGUI / UI5** | `docs/web-testing-setup.md` | Use the `sapPage` fixture, never the raw `page` — SAP kills a saved `storageState` session |
| Writing a new test case | `docs/test-authoring-guide.md`, `test-cases/_TEMPLATE.md` (stays at the root — it serves both lanes) | One t-code or app per case; every assertion names a field and an expected value |
| **Reviewing a case or spec before it runs** | `.claude/agents/` | `case-file-reviewer` for a `TC-*.md`, `spec-safety-reviewer` for a spec or its diff — both read-only |
| Running a case | `docs/test-authoring-guide.md` § Running | Confirm `DS4`/`100` first; write the result file even on failure |
| **Running a web-lane case unattended (no model)** | `docs/unattended-runs.md` | `scripts/run-case.ps1 -Case TC-nnn` — resolves, confirms the writes, runs, writes the run file, rebuilds the dashboard |
| **Running a GUI-lane case unattended (no model)** | `docs/unattended-runs.md` § The GUI lane | `scripts/run-gui-case.ps1 -Case TC-nnn` — same loop, driving `SAPGUIController` directly. `-Stage entry` writes nothing, so it is the harness smoke test |
| **A session stopped mid-run (network/system issue)** | `docs/unattended-runs.md` § Recovering from an interrupted run | `scripts/check-run.ps1 -Latest` before touching anything — the journal survives a kill, the run file does not |
| **Making a run record itself** | `docs/unattended-runs.md` § Instrumenting a spec | `journal.check` records the value read off the screen; `journal.deviation` is what the freeze gate counts |
| **Addressing a field or button in the web lane** | `docs/suite-design.md` § Screen models | Never a literal title or id in a spec — add it to `web-tests/screens/*.json` and address it by name |
| **Adding rows to a data-driven case** | `docs/suite-design.md` § Datasets | Edit `test-data/*.dataset.json`, not the spec; dates validate on load |
| **Deciding whether a spec is a regression answer** | `docs/suite-design.md` § Suites | Every spec belongs to exactly one suite in `config/suites.json`; discovery specs never go in `regression` |
| **After a transport lands in DS4** | `docs/suite-design.md` § Change impact | Run the model check before trusting a green regression run — a drifted handle reads like a product bug |
| Connections, credentials, adding a system | `docs/sap-gui-mcp-setup.md` § Configuration | Reuses `SAP_DS4_100_NIIF_PASSWORD`; secrets only in `.claude/settings.local.json` |
| Locating a UI5 control | `docs/web-testing-setup.md` § The SAP-specific API | `getByRoleUI5` over CSS — UI5 regenerates DOM between releases |
| Turning a case into a repeatable script | `docs/test-authoring-guide.md` § Freezing | The model as test driver is exploratory, not regression |
| Reporting a batch of runs | `dashboard/README.md` | Rebuild the dashboard after a run; only `PASS` counts as passed |

## Layout

| Path | Committed | Contains |
|---|---|---|
| `config/sap-systems.json` | yes | Which SAP systems may be driven, and how. Non-secret. Source of truth for **both** lanes. |
| `config/suites.json` | yes | Which suite each web-lane spec belongs to — `regression`, `verification`, `model-check`, `exploratory`. One Playwright project per suite. |
| `scripts/sync-sap-systems.ps1` | yes | Generates `.mcp.json` + the enabled-server list from the registry |
| `scripts/check-suite.ps1` | yes | Read-only gate: every spec classified, every regression spec case-backed, every frozen case proven by two PASS runs |
| `config/runs.json` | yes | How to run each **web-lane** case without a model deciding anything — spec, project, stage, dataset rows, and what it writes. A case absent from it cannot be launched by id |
| `config/gui-runs.json` | yes | The same, for the **GUI lane** — which module drives each case, its stages, and what it writes |
| `scripts/run-case.ps1` | yes | The web lane's unattended entry point: preflight, write confirmation, run, run file, dashboard |
| `scripts/run-gui-case.ps1` | yes | The GUI lane's equivalent. Same flags where they mean the same thing; `-Stage entry` writes nothing |
| `gui_tests/` | yes | The GUI lane's frozen-script harness — `run.py` (runner), `session.py` (`SAPGUIController` + this workspace's rules), `journal.py`, `render_result.py`, `datasets.py`, `screens.py` + `screens/`, `modules/treasury.py`, `modules/securities.py`, `cases/`. Underscore, not `gui-tests`: a hyphen is not importable in Python |
| `scripts/check-run.ps1` | yes | Read-only recovery check for an interrupted run — reads a run's journal (**both lanes**; `-Lane gui`/`-Lane web` narrows), lists documents it wrote and their lifecycle, checks for a live run lock. Touches no SAP system |
| `web-tests/journal.ts` | yes | The run journal — how a spec records what SAP did, so the run file is emitted rather than transcribed |
| `web-tests/reporters/` | yes | `result-file.ts` renders `results/TC-*.md` from the journal plus Playwright's own view. Off unless `SAP_WRITE_RESULT=1` is set |
| `web-tests/screens/` | yes | Screen models — one JSON per SAP screen, holding every field title and element id the suite relies on |
| `web-tests/modules/` | yes | Reusable business components — `openDealEntry`, `fillTermLoan`, `saveDeal`, `settleDeal`, `postFlows`, `runAccrualDeferral`, `runValuation`, `assertDevSystem` |
| `dashboard/` | yes | The results dashboard — `template.html` (the UI), the payload schema, a sample payload |
| `scripts/build-dashboard.ps1` | yes | Turns `results/*.md` into a payload and renders the dashboard |
| `web-tests/` | yes (not `node_modules`) | The Fiori / WebGUI / UI5 lane — `playwright-sap` specs, config, fixtures |
| `test-cases/` | yes | One markdown file per test case, from `_TEMPLATE.md`. Filed by lane: `GUI-TC/` for `sap-gui` cases, `Web-TC/` for web-lane cases. The **Lane:** header inside the file and the folder must agree — the folder is not what decides the lane, the header is |
| `test-data/` | yes | Input data a case needs — `*.dataset.json` are the data tables a data-driven case iterates |
| `docs/` | yes | Setup and authoring guides |
| `results/` | **no** | One file per run — outcome, observed values, deviations. `results/web/` holds the Playwright HTML report, traces and web-lane journals; `results/gui/` holds GUI-lane journals and run locks; `results/dashboard.html` is the rendered dashboard. |
| `evidence/` | **no** | Screenshots from `sap_screenshot` |
| `logs/sap-gui-audit.jsonl` | **no** | Audit trail of every MCP tool call |
| `.claude/hooks/` | yes | `guard-generated-files.ps1` — a `PreToolUse` guard that refuses an edit to `.mcp.json` or to a run file that already exists |
| `.claude/agents/` | yes | Review subagents — `case-file-reviewer`, `spec-safety-reviewer`. Read-only; neither runs a spec nor touches SAP |
| `.claude/skills/` | yes | `/check-run` (read an interrupted run's journal), `/new-test-case` (scaffold a case and register it) |
| `.claude/settings.local.json` | **no** | The SAP password. Never commit. |
| `.mcp.json` | **no** | Generated. `${VAR}` references only. |
| `tools/mcp-sap-gui/.venv` | **no** | Vendored `mcp-sap-gui` 0.2.2. Recreate, don't commit. |
| `web-tests/node_modules`, `.env`, `.auth` | **no** | Vendored `playwright-sap` 1.1.6, local secret, cached session. |

`results/`, `evidence/` and `logs/` are gitignored because they hold live business data pulled
off a real SAP system.

## MCP servers

| Server | Use for |
|---|---|
| `sap-gui` | The whole GUI lane. Runs a t-code, fills a selection screen, reads a field / ALV / tree, handles popups, takes screenshots. 57 tools. Bound to `DS4_100_NIIF` (SAP Logon "NIIF - Development"). |

The web lane is **not** an MCP server — it's a Playwright suite you run with `npm test`. No ADT
server is configured here by design: reading or changing ABAP source belongs in the sibling
development project. If a test needs to know what a program does internally, ask for the source
rather than reaching for a different server.

### The GUI tools you will actually use

| Need | Tool |
|---|---|
| Attach to the open session | `sap_connect_existing` |
| Check where you are | `sap_get_session_info`, `sap_get_screen_info` |
| Start a t-code | `sap_execute_transaction` |
| See what's on screen | `sap_get_screen_elements` |
| Fill / read a field | `sap_set_field`, `sap_set_batch_fields`, `sap_read_field` |
| Press something | `sap_press_button`, `sap_send_key`, `sap_select_menu` |
| Read an ALV or table control | `sap_read_table`, `sap_get_column_info`, `sap_get_cell_info` |
| Deal with a dialog | `sap_get_popup_window`, `sap_handle_popup` |
| Capture evidence | `sap_screenshot` |

## Safety rails already in place

- **Blocklist, always on.** `SU01`, `PFCG`, `SE16N` and other admin t-codes are refused, including
  via OK-code bypass. This is the server's own list and is not configurable away.
- **Save confirmation.** `sap_send_key` with `Save`/`F11` prompts through MCP elicitation before
  committing.
- **`readOnly` / `allowedTransactions`** in `config/sap-systems.json` — one edit plus a regenerate
  turns the whole server into look-but-don't-touch, or pins it to a named list of t-codes.
- **Audit log** at `logs/sap-gui-audit.jsonl`: every tool call, with timing and status.
- **Generated files are guarded.** `.claude/hooks/guard-generated-files.ps1` runs as a `PreToolUse`
  hook on `Edit`/`Write` and refuses two edits that used to be rules nothing enforced: `.mcp.json`
  (rule 8 — it is generated, and a hand-edit silently disappears at the next regenerate), and any
  `results/*.md` **that already exists** (rules 5 and 6 — a run file is a record of a live run, not
  a draft to revise). Creating a *new* run file by hand is deliberately still allowed, so the
  model-driven lane that writes its own record is unaffected.

In the web lane, `sap-system.ts` **throws** if the resolved base URL looks like production
(`prd`, `ps4`, `prod`), including via a `SAP_BASE_URL` override.

None of these replace rule 1. Neither lane can tell a dev system from a production one on its own
— only you can, by reading `sap_get_session_info` or the URL under test.

## Scope limits

- **GUI lane:** Windows only, SAP GUI for Windows only. No SAP GUI for Java. Screen structure
  varies with customising, so element ids discovered on one system are not portable to another.
- **Web lane:** `playwright-sap` is a *fork* of Playwright (its `1.1.6` is not upstream 1.1.6);
  the bundled Chromium 138 puts its base around upstream Playwright 1.53. Browser and security
  updates arrive when the fork maintainer rebases. Fine for a dev-system lane — don't build
  anything on it that needs a patched browser on a schedule.
- Neither lane covers SAP GUI for Java, mobile clients, or backend-only logic. ABAP Unit and ATC
  belong in the sibling development workspace.

## Commands

Regenerate MCP config after editing the registry:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\sync-sap-systems.ps1"
```

Validate without writing anything:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\sync-sap-systems.ps1" -Check
```

Run the web lane. One project per suite (`config/suites.json`) — pick the one that
answers your question rather than running everything:

```bash
npm run test:regression   --prefix web-tests   # case-backed, deterministic
npm run test:verification --prefix web-tests   # read-only checks
npm run test:model-check  --prefix web-tests   # screen drift, after a transport
npm run test:explore      --prefix web-tests   # discovery — never a regression answer
npm test                  --prefix web-tests   # every suite
```

Running any of the above (or a direct `npx playwright test`) from Claude Code's Bash/PowerShell
tool needs `dangerouslyDisableSandbox: true` — the sandboxed shell can't reach the SAP host or
open a real browser window otherwise.

Run a case unattended — resolves it from `config/runs.json`, runs the preflight,
names every database write and waits for a yes, writes the run file, rebuilds
the dashboard. This is the whole loop without a model in it
(`docs/unattended-runs.md`):

```bash
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -Case TC-009
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -Case TC-002 -Stage save -Rows baseline
```

`npx playwright test` is unchanged and still writes no run file — the record is
written only when a run asks for it (`SAP_WRITE_RESULT=1`, which `run-case.ps1`
sets). A session that drives a spec and then writes its own result file by hand
is therefore unaffected.

Run a **GUI-lane** case the same way. Drives `SAPGUIController` directly, so no
model reads a screen at run time (`docs/unattended-runs.md` § The GUI lane):

```bash
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -DryRun
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014
```

`-Stage entry` makes **zero** database writes — reach for it when the question is
"does the harness work", not "does the business flow work". The GUI lane needs
the vendored interpreter (`tools\mcp-sap-gui\.venv`), which carries `pywin32`
and `mcp_sap_gui`; `run-gui-case.ps1` supplies it and says so if it is missing.

Check the suite is consistent before a run — every spec classified, every frozen
case proven (read-only, touches no SAP system):

```bash
powershell -ExecutionPolicy Bypass -File "scripts\check-suite.ps1"
```

Check what an interrupted run actually did before resuming or re-running it —
reads the run's journal (survives a kill; the run file does not), lists
documents written with their lifecycle, and checks for a live batch lock
(read-only, touches no SAP system):

```bash
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -Latest
```

Rebuild the results dashboard after a run (writes `results/dashboard.html` **and opens it** —
opening is the default now; pass `-NoOpen` only when there is no browser to open, e.g. CI):

```bash
powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1"
```

Reinstall the GUI server (after a clone, or if the venv is gone):

```bash
python -m venv "tools\mcp-sap-gui\.venv" && "tools\mcp-sap-gui\.venv\Scripts\python.exe" -m pip install "mcp-sap-gui[screenshots]==0.2.2"
```

Reinstall the web lane (after a clone):

```bash
npm install --prefix web-tests && npm run install-browsers --prefix web-tests
```

Restart Claude Code after any regeneration — MCP servers read their environment at startup.
