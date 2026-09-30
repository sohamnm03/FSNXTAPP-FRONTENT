# Connect Codex to the existing SAP MCP servers

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF
- **Package:** N/A — local tooling
- **Transport:** N/A
- **Requested by:** human, implement the approved MCP connection plan

## Scope

Register the existing ADT read/change server and SAP GUI server in project Codex configuration.
Reuse generated MCP settings and existing gitignored credentials through a launcher. Preserve
the official ADT connection. Verify using read-only MCP requests; no SAP objects or business data changed.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Credential source? | Existing environment first, then `.claude/settings.local.json`; never copy into Codex config or print. | 2026-09-10 |

## Naming gate

NAMING: N/A -> no SAP artifact created or renamed.

## Todo

- [x] 1. Inspect existing setup and locate missing Codex registrations.
- [x] 2. Add launcher and project configuration, preserving source settings and audit arguments.
- [x] 3. Validate configuration and initialize/discover both MCP servers.
- [x] 4. Verify NIIF discovery and active source read; inspect SAP GUI sessions read-only.
- [ ] 5. Reload Codex extension: user action remains; no extension-reload control is exposed in this session. Connection verification already works through the SDK and configured launcher.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| .codex/config.toml | Local config | N/A | N/A | Added two MCP servers |
| scripts/codex-sap-mcp-launcher.mjs | Local launcher | N/A | N/A | Reuses existing configuration and credentials |

## Delivery checks

- [x] Launcher syntax and configuration validation; `codex mcp list` recognizes both enabled registrations and preserves `sap-adt`
- [x] MCP initialization and tool discovery: ADT read/change server 127 tools, SAP GUI 57 tools
- [x] NIIF `adtDiscovery` succeeded; `getObjectSource` returned active `ZCL_FS_SLC_GW_DISPATCH` source (422 total lines, first 8 read)
- [x] SAP GUI `sap_list_connections` confirmed `NIIF - Development`, DS4 client 100, one session at SESSION_MANAGER
- SAP Pretty Printer, activation, ATC, ABAP Unit, text elements and transport checks: N/A.

## Lessons raised

L-337 — Claude's MCP configuration and credential environment are not automatically loaded by Codex.

## Gateway-review handover

Source reads are now proven against SAP through the mandated MCP server. Read full active sources
before applying the earlier snapshot review: the active dispatch class reports 422 lines, while
the old extraction worklog reported 404. No SAP source, registry row or business data was modified.
The next extension session should load both new registrations after restarting the Codex extension.
