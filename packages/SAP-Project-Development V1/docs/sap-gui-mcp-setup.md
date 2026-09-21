# SAP GUI MCP Server (`sap-gui`)

Front-end automation and functional testing against **SAP GUI for Windows**,
driven through the **SAP GUI Scripting COM API**. This is the counterpart to the
ADT servers: `adt-mcp` / `mcp-abap-abap-adt-api` work on ABAP *objects*,
`sap-gui` works on *screens* — running a t-code, filling a selection screen,
reading an ALV, checking what a program actually shows the user.

- Upstream: <https://github.com/kts982/mcp-sap-gui>, PyPI `mcp-sap-gui`
- Pinned version: **0.2.2** with the `screenshots` extra
- Installed at: `tools\mcp-sap-gui\.venv` (gitignored — recreate, don't commit)
- 57 tools; MIT licensed

## Why this one

The other widely-linked server, `mario-andreschak/mcp-sap-gui`, drives SAP by
**screenshot plus pixel coordinates** — the model looks at an image and clicks
x/y. That cannot assert. There is no way to say "field `NETWR` is 1,234.56" or
"the ALV returned 12 rows", and every coordinate breaks on a resolution, theme,
GUI-version or screen-variant change. `kts982` uses the Scripting API, so screen
elements come back as named, typed values — which is what a test needs.

## Prerequisites

| Requirement | Status on this machine | Checked |
| --- | --- | --- |
| SAP GUI for Windows | 8.00 Final Release, 64-bit | 2026-08-16 |
| Client-side scripting enabled | yes — scripting engine responds, `MajorVersion` 8000 | 2026-08-16 |
| Server-side `sapgui/user_scripting` on DS4 | yes — a scripted logon screen was driven and read | 2026-08-16 |
| SAP Logon Pad running | required at call time; the server attaches to it | — |
| Python | 3.13.3, venv under `tools\mcp-sap-gui\.venv` | 2026-08-16 |

If scripting is ever turned off client-side, re-enable it in
**SAP Logon → Options → Accessibility & Scripting → Scripting → Enable scripting**
(do this by hand; it is a security setting). Server-side it is the profile
parameter `sapgui/user_scripting` and belongs to Basis.

## Configuration

`sap-gui` is generated into `.mcp.json` by `scripts/sync-sap-systems.ps1` from
the `sapGui` block on a system in `config/sap-systems.json` — the same rule as
every other server here. **Do not hand-edit `.mcp.json`.**

```json
"sapGui": {
  "enabled": true,
  "logonDescription": "NIIF - Development",
  "readOnly": false,
  "profile": "full",
  "auditLog": "logs/sap-gui-audit.jsonl"
}
```

| Field | Meaning |
| --- | --- |
| `enabled` | Emit a `sap-gui` server for this system |
| `logonDescription` | **Exact** entry name in SAP Logon Pad — the argument to `sap_connect` |
| `readOnly` | `true` adds `--read-only`, disabling every mutating tool |
| `profile` | `exploration` \| `operator` \| `full` — how many tools are exposed |
| `auditLog` | JSON-lines audit trail, repo-relative; the directory is created for you |
| `allowedTransactions` | Optional array — whitelist mode; only these t-codes may run |
| `mcpServerName` | Optional override of the derived server name |

Server naming follows the ADT convention: the default system gets `sap-gui`,
any other system gets `sap-gui-<sysid>-<client>`.

Credentials are **reused, not duplicated**: the generator takes `adt.user`,
`adt.passwordEnvVar`, `client` and `language` from the same system entry and
emits `SAP_USER` / `SAP_PASSWORD` / `SAP_CLIENT` / `SAP_LANGUAGE` into the
server's own env block, with the password as a `${VAR}` reference resolved from
`.claude/settings.local.json`. The server never accepts a password as a tool
parameter, and these env vars are scoped to its child process, so they do not
collide with the ADT server's identically-named variables.

Regenerate after any change, then restart Claude Code:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\sync-sap-systems.ps1"
```

## Connecting — prefer an existing session

Two ways in:

- **`sap_connect_existing()`** — attaches to an SAP session you are already
  logged on to. **This is the normal path.** Nothing is typed, no logon is
  consumed, no dialogs.
- **`sap_connect(system_description="NIIF - Development")`** — opens a fresh
  connection from SAP Logon Pad and types the credentials in. Use only when no
  session is open.

`sap_connect` lands on the **"License Information for Multiple Logons"** dialog
whenever `FS_DEV` already has a dialog session somewhere — the logon is not
complete at that point, `sap_get_session_info` reports an empty `user`, and the
screen is still `SAPMSYST` 500 with the popup on `wnd[1]`. Handle it with
`sap_get_popup_window` / `sap_handle_popup`, or avoid it entirely by logging on
by hand once and using `sap_connect_existing`. See L-213.

`sap_disconnect` closes only sessions the server itself opened; a session you
attached to with `sap_connect_existing` is left alone.

## The tool catalog (57)

| Group | Tools |
| --- | --- |
| Connection | `sap_connect`, `sap_connect_existing`, `sap_list_connections`, `sap_get_session_info`, `sap_disconnect`, `sap_set_policy_profile` |
| Navigation | `sap_execute_transaction`, `sap_send_key`, `sap_get_screen_info` |
| Fields & UI | `sap_read_field`, `sap_set_field`, `sap_set_batch_fields`, `sap_press_button`, `sap_select_tab`, `sap_select_checkbox`, `sap_select_radio_button`, `sap_get_combobox_entries`, `sap_select_combobox_entry`, `sap_read_textedit`, `sap_set_textedit`, `sap_set_focus`, `sap_select_menu`, `sap_read_shell_content` |
| Tables & grids | `sap_read_table`, `sap_get_column_info`, `sap_get_cell_info`, `sap_modify_cell`, `sap_get_current_cell`, `sap_set_current_cell`, `sap_double_click_cell`, `sap_select_table_row`, `sap_select_multiple_rows`, `sap_select_all_rows`, `sap_press_column_header`, `sap_scroll_table_control`, `sap_get_table_control_row_info`, `sap_select_all_table_control_columns`, `sap_get_alv_toolbar`, `sap_press_alv_toolbar_button`, `sap_select_alv_context_menu_item` |
| Popups & toolbars | `sap_get_popup_window`, `sap_handle_popup`, `sap_get_toolbar_buttons` |
| Trees | `sap_read_tree`, `sap_get_tree_node_children`, `sap_expand_tree_node`, `sap_collapse_tree_node`, `sap_select_tree_node`, `sap_double_click_tree_node`, `sap_double_click_tree_item`, `sap_click_tree_link`, `sap_search_tree_nodes`, `sap_find_tree_node_by_path` |
| Discovery | `sap_get_screen_elements`, `sap_screenshot` |
| Guidance | `sap_get_workflow_guide`, `sap_get_transaction_guide` |

`sap_get_screen_elements` is the one to reach for first on an unfamiliar screen:
it returns the real element ids, so nothing has to be guessed.

## Safety

- **Blocklist, always on.** User admin, role maintenance, direct table
  maintenance and system administration t-codes (`SU01`, `PFCG`, `SE16N`, …) are
  refused, including via OK-code bypass.
- **`--read-only`** disables every mutating tool. Set `readOnly: true` on the
  system for a look-but-don't-touch profile.
- **`allowedTransactions`** flips to whitelist mode — nothing but the listed
  t-codes runs.
- **Save confirmation.** `sap_send_key` with `Save`/`F11` asks the MCP client to
  confirm before committing. If the client does not support elicitation the call
  fails rather than saving silently.
- **Audit log** at `logs/sap-gui-audit.jsonl` records every tool call with
  timing and status, secrets masked. It is gitignored — it can contain business
  data.

Note the landscape hazard: SAP Logon Pad on this machine also holds
**"NIIF - Production"** (PS4) and **"TFSIN - S4 Production"** (PS4). The
`sap-gui` server is bound to `"NIIF - Development"` through the registry, but
`sap_connect_existing` attaches to *whatever session is open*. Confirm
`sap_get_session_info` reports `DS4` / client `100` before running anything that
writes.

## Using it as a test tool

The MCP server makes the model the test driver — excellent for exploring a
transaction, discovering element ids and drafting a flow, but non-deterministic
for a regression suite. The durable pattern:

1. Drive the flow once interactively through `sap-gui`; capture the element ids
   from `sap_get_screen_elements` and the expected values from `sap_read_field`
   / `sap_read_table`.
2. Freeze the resulting steps and assertions into a deterministic script against
   the same Scripting API for repeat runs.

Scope limits worth stating up front: Windows only, SAP GUI for Windows only — no
Java GUI, no Web GUI, **no Fiori** (that needs a browser driver). Screen
structure varies with customising, so element discovery is per system.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `GetObject('SAPGUI')` fails | SAP Logon Pad not running |
| `GetScriptingEngine` fails | Client-side scripting disabled in SAP Logon options |
| Connects but stays on `SAPMSYST` 500 | Multiple-logon dialog on `wnd[1]` — see L-213 |
| Scripting works locally, refused on the server | `sapgui/user_scripting` is `FALSE` — Basis change |
| `sap-gui` missing from `/mcp` | Not in `enabledMcpjsonServers`; rerun the sync script |
| Save calls fail with an elicitation error | MCP client cannot prompt; use a client that supports elicitation |
| Server won't start | venv missing — `python -m venv tools\mcp-sap-gui\.venv` then pip install |
