# NIIF MCP connectivity repair

- **Date:** 2026-09-17
- **System:** DS4_100_NIIF
- **Package:** N/A — local connectivity/configuration activity
- **Transport:** N/A — no SAP objects changed
- **Requested by:** human

## Scope

Diagnose why `adt-mcp`, `mcp-abap-abap-adt-api`, and `sap-gui` are absent from the agent session,
verify connectivity to NIIF without changing SAP objects, and repair local MCP startup configuration.
SAP development and object changes are out of scope.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Is NIIF reachable and are the configured credentials accepted? | Yes — TCP 44300/3200, authenticated ADT discovery, and MCP `adtDiscovery` succeed. | 2026-09-17 |
| 2 | Is the official `adt-mcp` bridge running with an active destination? | Bridge is running; `abap_list_destinations` returns `[]`, so VS Code ADT must reconnect to `DS4_100_NIIF`. | 2026-09-17 |
| 3 | Can the SAP GUI MCP process start? | Yes after rebuilding the venv with local Python 3.14; 57 tools registered and an existing DS4/100 session was attached. | 2026-09-17 |

## Naming gate

Not applicable — no SAP object is being created.

## Todo

- [x] 1. Validate registry, generated MCP configuration, secrets, and runtime paths.
- [x] 2. Verify NIIF network and authenticated ADT connectivity.
- [x] 3. Start `mcp-abap-abap-adt-api`, list tools, and call `healthcheck` / `adtDiscovery`.
- [x] 4. Connect to `adt-mcp`, list tools, and call `abap_list_destinations`.
- [x] 5. Reconcile contradictory enabled/disabled server lists and make sync enforce it.
- [x] 6. Rebuild and smoke-test the SAP GUI MCP virtual environment.
- [ ] 7. Restart the agent client and verify all three tool namespaces load.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| None | N/A | N/A | N/A | No SAP changes |

## Delivery checks

- [x] Registry validation clean
- [x] Authenticated ADT discovery successful
- [x] ABAP ADT stdio MCP tool registration successful
- [x] Official ADT HTTP MCP tool registration successful
- [x] SAP GUI MCP tool registration successful — 57 tools; existing `DS4`/`100` session attached
- [ ] Restarted-session tool visibility confirmed

## Remaining action

In VS Code, open or refresh the ADT project for destination `DS4_100_NIIF` and log on. The local
official MCP bridge is healthy and exposes 20 tools, but `abap_list_destinations` currently returns
`[]`. After that, restart the agent client so it reloads `.mcp.json` and the corrected enabled list.

The SAP GUI smoke test attached to `NIIF - Development` and confirmed `DS4` / client `100`, but the
open GUI session user is `FS_DEV`, not the registry ADT user `FS_DEV3`. Confirm the intended user
before any SAP GUI write.

## Lessons raised

L-336 — the sync script must reconcile the disabled list, not only write the enabled list.
