# SAP GUI MCP Server (`sap-gui`)

The one server this workspace runs. Drives **SAP GUI for Windows** through the
**SAP GUI Scripting COM API**.

- Upstream: <https://github.com/kts982/mcp-sap-gui>, PyPI `mcp-sap-gui`
- Pinned: **0.2.2** with the `screenshots` extra
- Installed at: `tools\mcp-sap-gui\.venv` (gitignored — recreate, don't commit)
- 57 tools, MIT licensed

## Why the Scripting API and not screenshots

The other commonly-linked server, `mario-andreschak/mcp-sap-gui`, drives SAP by
screenshot plus pixel coordinates — the model looks at an image and clicks x/y.
That cannot assert. There is no way to state "field `NETWR` is 1,234.56" or "the
ALV returned 12 rows", only "the picture looked right", and every coordinate
breaks on a resolution, theme, GUI-version or screen-variant change. The
Scripting API returns named, typed elements, which is the precondition for a
test assertion. That is the whole reason this workspace exists.

## Prerequisites

| Requirement | Status on this machine | Checked |
| --- | --- | --- |
| SAP GUI for Windows | 8.00 Final Release, 64-bit | 2026-08-16 |
| Client-side scripting enabled | yes — engine responds, `MajorVersion` 8000 | 2026-08-16 |
| Server-side `sapgui/user_scripting` on DS4 | yes — a live session was enumerated over scripting | 2026-08-16 |
| SAP Logon Pad running, logged on to DS4/100 | required at call time | — |
| Python | 3.13.3, venv under `tools\mcp-sap-gui\.venv` | 2026-08-16 |

If client-side scripting is ever turned off, re-enable it by hand in
**SAP Logon → Options → Accessibility & Scripting → Scripting → Enable scripting**
(it is a security setting — do it deliberately, not by script). Server-side it is
the profile parameter `sapgui/user_scripting` and belongs to Basis.

## Configuration

`sap-gui` is generated into `.mcp.json` by `scripts/sync-sap-systems.ps1` from
`config/sap-systems.json`. **Never hand-edit `.mcp.json`.**

```json
{
  "id": "DS4_100_NIIF",
  "enabled": true,
  "systemId": "DS4",
  "client": "100",
  "language": "EN",
  "credentials": {
    "user": "FS_DEV",
    "passwordEnvVar": "SAP_DS4_100_NIIF_PASSWORD"
  },
  "sapGui": {
    "enabled": true,
    "logonDescription": "NIIF - Development",
    "readOnly": false,
    "profile": "full",
    "auditLog": "logs/sap-gui-audit.jsonl"
  }
}
```

| Field | Meaning |
| --- | --- |
| `logonDescription` | **Exact** SAP Logon Pad entry name — the argument to `sap_connect` |
| `readOnly` | `true` adds `--read-only`, disabling every mutating tool |
| `profile` | `exploration` \| `operator` \| `full` — how many tools are exposed |
| `auditLog` | JSON-lines audit trail, repo-relative; the directory is created for you |
| `allowedTransactions` | Optional array — whitelist mode; only these t-codes may run |
| `mcpServerName` | Optional override of the derived name |

Server naming: the default system gets `sap-gui`, any other gets
`sap-gui-<sysid>-<client>`. `DS4_100_TFSIN` is registered as a disabled template
with an explicit `mcpServerName`, because it shares SYSID and client with
`DS4_100_NIIF` and the derived name would collide.

### Credentials

Reused from the same registry entry — there is no second credential to maintain.
The generator emits `SAP_USER` / `SAP_PASSWORD` / `SAP_CLIENT` / `SAP_LANGUAGE`
into the server's env block, with the password as a `${SAP_DS4_100_NIIF_PASSWORD}`
reference resolved from `.claude/settings.local.json`:

```json
{
  "env": { "SAP_DS4_100_NIIF_PASSWORD": "..." },
  "enabledMcpjsonServers": ["sap-gui"]
}
```

That file is gitignored and is the only place a password exists. The server
refuses to take a password as a tool parameter at all. The env vars are scoped
to the server's child process.

To rotate: change the value, restart Claude Code. No regeneration needed —
`.mcp.json` holds only the `${VAR}` reference.

### Adding a system

1. Append to `systems[]` in `config/sap-systems.json` with its own `sapGui` block.
2. Add the password to the `env` block of `.claude/settings.local.json`.
3. Regenerate, then restart Claude Code:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\sync-sap-systems.ps1"
```

The generator refuses a registry with a missing `logonDescription`, a bad client
format, a duplicate id, a server-name collision, an unknown `defaultSystem`, or a
`sapGui` block on a system that has none. It warns loudly if a
`logonDescription` looks like production, and if a password is unset.

## Connecting

- **`sap_connect_existing()`** — attaches to an SAP session you are already
  logged on to. **This is the normal path.** Nothing is typed, no logon is
  consumed, no dialogs. Use `sap_list_connections` first if several sessions are
  open; it reports index, user, system, client and current t-code per session.
- **`sap_connect(system_description="NIIF - Development")`** — opens a fresh
  connection and types the credentials. Use only when nothing is logged on.

`sap_connect` lands on the **"License Information for Multiple Logons"** dialog
whenever `FS_DEV` already has a dialog session. The tool still returns `ok`, but
the logon has *not* completed: `sap_get_session_info` shows an empty `user` and
the screen is still `SAPMSYST` / `S000` / 500 with the popup on `wnd[1]`. Always
read `user` before trusting a connection. Clear the dialog with
`sap_get_popup_window` / `sap_handle_popup`, or avoid it by logging on by hand
once and using `sap_connect_existing`.

`sap_disconnect` closes only sessions the server itself opened; a session you
attached to is left alone.

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

## Safety

- **Blocklist, always on** — user admin, role maintenance, direct table
  maintenance and system administration t-codes are refused, OK-code bypass
  included. Not configurable away.
- **`--read-only`** (`readOnly: true`) disables every mutating tool.
- **`allowedTransactions`** flips to whitelist mode.
- **Save confirmation** — `sap_send_key` with `Save`/`F11` asks the MCP client to
  confirm. If the client doesn't support elicitation, the call fails rather than
  saving silently.
- **Audit log** — `logs/sap-gui-audit.jsonl`, every call with timing and status,
  secrets masked. Gitignored: it can contain business data.

The landscape hazard is real: SAP Logon Pad here also holds **"NIIF - Production"**
(PS4) and **"TFSIN - S4 Production"** (PS4). The registry binds `sap-gui` to
"NIIF - Development", but `sap_connect_existing` attaches to whatever is open.
Read `sap_get_session_info` and confirm `DS4` / `100` before anything that writes.

## Verification (2026-08-16)

```
MCP handshake         57 tools
Scripting engine      OK, MajorVersion 8000
sap_list_connections  con[0] "NIIF - Development", 3 sessions,
                      FS_DEV / DS4 / 100, t-codes /IWFND/V4_ADMIN, S000, SE80
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `GetObject('SAPGUI')` fails | SAP Logon Pad not running |
| `GetScriptingEngine` fails | Client-side scripting disabled in SAP Logon options |
| Connects but stays on `SAPMSYST` 500 | Multiple-logon dialog on `wnd[1]` — see § Connecting |
| Scripting works locally, refused on the server | `sapgui/user_scripting` is `FALSE` — Basis change |
| `sap-gui` missing from `/mcp` | Not in `enabledMcpjsonServers`; rerun the sync script and restart |
| Element "not found" | Id guessed rather than discovered — call `sap_get_screen_elements` |
| Save calls fail with an elicitation error | MCP client cannot prompt; use one that supports elicitation |
| Server won't start | venv missing — `python -m venv tools\mcp-sap-gui\.venv`, then pip install |
