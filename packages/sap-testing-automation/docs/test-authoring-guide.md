# Test Authoring Guide

How a test case gets written, run and recorded in this workspace.

## The shape of a test case

One markdown file per case in `test-cases/`, copied from `_TEMPLATE.md` and named
`TC-<nnn>-<tcode>-<slug>.md` — e.g. `TC-001-MM03-display-material-basic.md`.

Cases are filed by lane, because the two lanes are not interchangeable as
evidence and a reader should not have to open a file to learn which one it is:

| Folder | Holds |
|---|---|
| `test-cases/GUI-TC/` | `- **Lane:** sap-gui` — driven by `gui_tests/`, registered in `config/gui-runs.json` |
| `test-cases/Web-TC/` | `- **Lane:** web` — driven by a `web-tests/tests/*.spec.ts`, registered in `config/runs.json` |
| `test-cases/_TEMPLATE.md` | Neither — the template serves both lanes and stays at the root |

The `- **Lane:**` header is still what *declares* the lane; the folder follows
it. Ids stay unique across both folders (there is one TC-014, not one per
lane), so a case can move folders without renaming, and every lookup finds a
case by id wherever it sits.

A case covers **one transaction and one scenario**. "Create a sales order" and
"create a sales order with an invalid material" are two cases, not one, because
they have different expected outcomes and one failing should not hide the other.

The same scenario over **different data** is the opposite: one case, many rows.
Ten term loans differing only in amount and term are ten rows of a dataset, not
ten cases — see `suite-design.md` § Datasets. The test is whether adding another
row changes any code. If it does, the data is in the wrong place.

Three parts do the work:

- **Preconditions** — what must be true before step 1. Data that must exist, a
  config setting, a prior document number. If a precondition can't be met the
  case is *blocked*, not *failed*, and that distinction goes in the result.
- **Steps** — numbered, each one action. An action is a t-code, a field entry, a
  button press, a key. Name the element id once you know it.
- **Assertions** — each names a **field** and an **expected value**. "The order
  is created" is not an assertion. "`VBAK-VBELN` is non-empty and message
  `V1 311` is displayed" is.

## Discovering element ids

Never write an id from memory. On the screen you care about:

```
sap_execute_transaction("MM03")
sap_get_screen_elements()          -> real ids, types, current values
```

Take the ids from that output and paste them into the case. Ids look like
`wnd[0]/usr/ctxtRMMG1-MATNR`. They are stable for a given system and screen
variant, and they are *not* portable between systems with different customising —
if a case is moved to another landscape, rediscover.

For an ALV or table control, `sap_read_table` returns rows and column metadata;
use `sap_get_column_info` first when you need the technical column names.

In the **web lane** a discovered handle does not go into the spec. It goes into a
screen model in `web-tests/screens/*.json`, and the spec addresses it by name —
one file to fix when a transport moves a field, instead of every spec that touched
it. The model also records how many inputs legitimately share a title, which is
the only thing that catches a new field silently redefining an `nth`. See
`suite-design.md` § Screen models.

## Writing assertions that mean something

| Weak | Strong |
|---|---|
| "Material displays correctly" | `MAKT-MAKTX` equals `Steel Plate 10mm` |
| "No errors" | `sap_get_screen_info().message_type` is not `E` |
| "The grid has data" | `sap_read_table` returns ≥ 1 row and column `MATNR` contains `100-100` |
| "It saved" | Message `V1 311` present **and** the document number is non-empty |

Read the message from `sap_get_screen_info` — it returns `message`,
`message_type`, `message_id` and `message_number`, so an assertion can pin the
exact message class and number rather than matching English text.

## Running a case

1. **Log on by hand** to DS4 / client 100 in SAP Logon Pad.
2. `sap_connect_existing()` — or `sap_list_connections()` first if several
   sessions are open, then attach to the right index.
3. **`sap_get_session_info()` and confirm `DS4` / `100`.** Non-negotiable rule 1.
   The Logon Pad also holds two production entries.
4. Walk the steps. After each one that changes the screen, read
   `sap_get_screen_info` — an unexpected popup is much cheaper to catch
   immediately than three steps later.
5. Evaluate the assertions and write the result file.

### Steps that write

Any step that commits — `sap_send_key("Save")`, a posting, a create/change
t-code — is called out in the case's **Writes** section before the run, and
confirmed by the human at run time. The server also prompts through MCP
elicitation on Save, but that is a backstop, not the plan.

If a run creates a document, record its number in the result file. An
untracked document on a dev system is somebody else's confusing afternoon.

## Recording the result

In the web lane a run can write this file itself — see `docs/unattended-runs.md`.
`scripts\run-case.ps1` turns that on; a plain `npx playwright test` does not, so
what follows is still how a hand-driven run is recorded, in either lane.

One file per run in `results/`, named `<case-id>-<YYYY-MM-DD-HHmm>.md`. It records
the case, system, who ran it, the observed value for every assertion, and the
verdict: **PASS**, **FAIL**, **BLOCKED** (a precondition wasn't met) or
**PARTIAL** (some steps ran, the rest didn't).

Rules that matter more than the format:

- A value that could not be read is `NOT OBSERVED`. Never a plausible guess.
- A skipped step is written down as skipped, with the reason.
- A deviation from the case — a popup that wasn't in the script, a different
  screen — is recorded even when the assertions still pass. That is next
  month's flaky test explaining itself in advance.
- Screenshots go in `evidence/` and are referenced by filename. Take one on any
  failure via `sap_screenshot`.

`results/` and `evidence/` are gitignored: they contain live business data.

## Freezing a case for regression

The MCP server makes the model the test driver. That is excellent for exploring
a transaction, discovering ids and drafting a case — and non-deterministic for a
suite you run every sprint. Two different jobs:

| Phase | Driver | Good at |
|---|---|---|
| **Author** | model, through `sap-gui` | Finding the screens, ids and edge cases; adapting when the screen isn't what you expected |
| **Regress** | frozen script, same Scripting API | Running the same thing the same way, unattended, with a diffable result |

Once a case passes twice with no deviations, its steps and assertions are stable
enough to freeze: the element ids, inputs and expected values are all in the
case file already, so the script is a mechanical transcription of it against the
same COM API the MCP server uses. Keep the case file as the specification; the
script is the executable copy of it.

Do not freeze a case that has never passed. A frozen broken test is worse than
no test — it fails forever and gets ignored.

### The gate

In the web lane this is enforced rather than trusted. `config/suites.json` puts
every spec in exactly one suite, and only `regression` is a regression answer:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\check-suite.ps1"
```

It fails the build if a spec is unclassified, if a `discover-*` or `probe-*` spec
has crept into `regression`, if a `regression` spec has no case file naming it, or
if a case marked `frozen` has fewer than two `PASS` runs recorded under `results/`.
That last one is the "never passed" rule above, as a check instead of a habit.

Setting a case's **Status** to `frozen` is therefore a claim the gate verifies. It
also prints status, suite and PASS count per case, which is the quickest way to see
what is actually ready. Details in `suite-design.md` § Suites.

## Scope limits

Two lanes, two reaches:

- **`sap-gui`** — SAP GUI for Windows: classic Dynpro t-codes, ALV grids, table
  controls, trees. Windows only, no SAP GUI for Java.
- **`web-tests/`** — Fiori, WebGUI and UI5 in a browser, via `playwright-sap`.
  See `docs/web-testing-setup.md`.

Pick the lane your users actually use. The same transaction in SAP GUI and in
WebGUI is not the same rendering path and does not fail the same way. A scenario
spanning both is split into two cases with the boundary noted in each.

Everything below applies to both lanes; where the mechanics differ, the web
lane's equivalents are:

| GUI lane | Web lane |
|---|---|
| `sap_get_screen_elements` | `npm run codegen`, or Playwright UI mode |
| `sap_read_field` | `expect(locator).toHaveValue(...)` |
| `sap_read_table` | `expect(rows).toHaveCount(...)` over a UI5 table locator |
| `sap_get_screen_info().message_type` | The message strip / `MessageBox` locator |
| Element id (`wnd[0]/usr/ctxt…`) | `getByRoleUI5('ControlType', { property: value })`, or a named control in `web-tests/screens/*.json` |
| Result file in `results/` | Result file in `results/` **plus** the HTML report in `results/web/` |
| Rediscover ids after a transport | `npm run test:model-check --prefix web-tests` — reports drift and names the cases at risk |

Neither lane covers backend-only logic. ABAP Unit and ATC belong in the sibling
development workspace.
