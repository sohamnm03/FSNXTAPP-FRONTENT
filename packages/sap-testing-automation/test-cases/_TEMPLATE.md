# TC-<nnn> — <transaction or app>: <what this case proves>

- **Case id:** TC-<nnn>
- **Lane:** sap-gui (SAP GUI for Windows) | web (Fiori / WebGUI / UI5)
- **Transaction / app:** <TCODE or Fiori app id>
- **Spec file:** — (web lane only: `web-tests/tests/<name>.spec.ts`)
- **System:** <system id from config/sap-systems.json, e.g. DS4_100_NIIF> (<SYSID> / client <nnn>) — must match the `test-cases/<lane>/<system id>/` folder this file is filed under
- **Type:** smoke | functional | negative | regression
- **Author:** <name>
- **Created:** YYYY-MM-DD
- **Status:** draft | active | frozen
- **Writes to the database:** no | yes — <what gets created or changed>

## Purpose

<One or two sentences: what behaviour this case proves, and what it does not
cover. If there is a sibling case for the negative path, name it.>

## Preconditions

| # | Condition | How to check |
|---|---|---|
| 1 | <e.g. material 100-100 exists in plant 1000> | <t-code / query> |
| 2 | | |

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Technical name | Value |
|---|---|---|
| | | |

## Steps

GUI lane:

| # | Action | Tool | Element / argument |
|---|---|---|---|
| 1 | Attach to the open session | `sap_connect_existing` | — |
| 2 | Confirm system is DS4 / 100 | `sap_get_session_info` | **stop if it is not** |
| 3 | Start the transaction | `sap_execute_transaction` | `<TCODE>` |
| 4 | | | |

Web lane:

| # | Action | API | Locator / argument |
|---|---|---|---|
| 1 | Open a page in the logged-in context | `sapPage` fixture | — |
| 2 | Navigate | `sapPage.goto` | `sapSystem.flpUrl` / `sapSystem.webguiUrl` |
| 3 | | `getByRoleUI5` | |

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
| 1 | | | | `sap_read_field` |
| 2 | Message | `message_id` / `message_number` | e.g. `V1` / `311`, type not `E` | `sap_get_screen_info` |

Every assertion names a field and an expected value. "Works correctly" is not an
assertion — see `docs/test-authoring-guide.md`.

## Writes

<List every step that commits to the database, or write "None — read-only case".
Each one is confirmed by the human at run time.>

## Cleanup

<What to undo, or "None required". If the case creates a document, say whether
it is left in place and how it is identified.>

## Known deviations

<Popups or screen variants seen during authoring that the steps already handle,
so the next person does not treat them as new failures.>

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| | | | |
