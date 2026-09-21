# Install the SAP GUI Scripting MCP server (`sap-gui`)

- **Date:** 2026-08-16
- **System:** DS4_100_NIIF
- **Package:** — (no SAP objects created)
- **Transport:** — (workspace tooling only)
- **Requested by:** Karthik

## Scope

Install `kts982/mcp-sap-gui` into this workspace as a front-end automation and
functional-testing server, wired to the credentials already registered for
`DS4_100_NIIF`. In scope: vendored install, registry-driven configuration,
generator support, verification against the live system, documentation. Out of
scope: any ABAP object, any change to the ADT servers, and any Fiori/Web GUI
automation (the server does not cover it).

Chosen over `mario-andreschak/mcp-sap-gui` — see L-214.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Screenshot-coordinate or Scripting-API server? | Scripting API (`kts982`) — coordinates cannot assert | 2026-08-16 |
| 2 | Separate credentials for SAP GUI? | No — reuse `adt.user` + `SAP_DS4_100_NIIF_PASSWORD` | 2026-08-16 |
| 3 | Read-only or read-write? | Read-write (`profile: full`); it is a testing tool. Blocklist still applies | 2026-08-16 |
| 4 | Restrict to a t-code whitelist? | No — the ask is general t-code testing. Revisit if it ever points at PS4 | 2026-08-16 |

## Naming gate

Not applicable — no SAP objects created. MCP server name follows the generator
convention in `docs/sap-systems.md`: default system → `sap-gui`.

## Todo

- [x] 1. Vendor `mcp-sap-gui[screenshots]==0.2.2` into `tools\mcp-sap-gui\.venv`
- [x] 2. Add the `sapGui` block to `DS4_100_NIIF` in `config/sap-systems.json`
- [x] 3. Teach `scripts/sync-sap-systems.ps1` to emit/validate `sap-gui` servers
- [x] 4. Regenerate `.mcp.json` + `enabledMcpjsonServers`
- [x] 5. Gitignore the venv, `__pycache__`, and `logs/`
- [x] 6. Verify the MCP handshake (57 tools)
- [x] 7. Verify SAP GUI Scripting is enabled client- and server-side
- [x] 8. Write `docs/sap-gui-mcp-setup.md`; update `docs/sap-systems.md`, `CLAUDE.md`
- [x] 9. Raise L-213, L-214
- [ ] 10. Restart Claude Code so `sap-gui` appears in `/mcp` — **human action**
- [ ] 11. First real run: log on to DS4/100 by hand, `sap_connect_existing`, drive one t-code end to end

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | no SAP objects created |

### Files changed

| File | Change |
|---|---|
| `config/sap-systems.json` | `sapGui` block on `DS4_100_NIIF` (enabled) and `DS4_100_TFSIN` (disabled) |
| `scripts/sync-sap-systems.ps1` | validation + emission of `sap-gui` / `sap-gui-<sysid>-<client>` servers |
| `.mcp.json` | regenerated — `sap-gui` added |
| `.claude/settings.local.json` | regenerated — `sap-gui` in `enabledMcpjsonServers`; **no new secret** |
| `.gitignore` | `tools/**/.venv/`, `__pycache__/`, `logs/` |
| `docs/sap-gui-mcp-setup.md` | new |
| `docs/sap-systems.md` | `sapGui` block documented; troubleshooting row |
| `CLAUDE.md` | MCP routing — when to use `sap-gui` |
| `lessons/lessons-ledger.md` | L-213, L-214 |
| `tools/mcp-sap-gui/.venv/` | new, gitignored |

## Delivery checks

Adapted — this is tooling, not an ABAP delivery.

- [x] `sync-sap-systems.ps1 -Check` passes; registry valid, all secrets configured
- [x] `.mcp.json` regenerates deterministically and contains no plaintext secret
- [x] MCP handshake OK — 57 tools listed
- [x] SAP GUI Scripting engine reachable (`MajorVersion` 8000)
- [x] Server-side scripting confirmed — a scripted logon screen was driven and read
- [x] Live session opened against DS4/100 and closed again cleanly
- [x] Venv, audit log and secrets all gitignored
- [ ] Verified inside Claude Code after restart — pending human action

## Verification detail (2026-08-16)

```
MCP handshake            57 tools
Scripting engine         OK, MajorVersion 8000, 0 open connections
sap_connect              system=DS4 client=100 lang=EN, screen SAPMSYST/S000/500
sap_get_screen_info      wnd[1] "License Information for Multiple Logons"
sap_disconnect           released=true, action=closed
```

The logon reached DS4 client 100 and stopped at the multiple-logon dialog —
`user` came back empty, so the logon did **not** complete. Recorded as L-213;
the working path is `sap_connect_existing` against a hand-made logon.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-213, L-214.
