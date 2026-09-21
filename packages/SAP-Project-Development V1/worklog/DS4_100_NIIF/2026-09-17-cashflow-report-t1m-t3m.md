# Cashflow report, key date T-1 month to T+3 months (ALV, Pattern A)

- **Date:** 2026-09-17
- **System:** DS4_100_NIIF
- **Package:** TBD — pending naming gate + AREA confirmation (likely `ZFS_TRM` or existing TRM package)
- **Transport:** TBD
- **Requested by:** adil.a@fourthsignal.com

## Scope

Build a classic ALV report (Pattern A, `REUSE_ALV_GRID_DISPLAY`) that lists cashflows for a
selection window computed from a single "key date" selection-screen field: `key date - 1 month`
through `key date + 3 months`. The human confirmed the underlying data comes from transaction
**TPM13** (Treasury/Cash Management side) rather than a project CDS view — the exact table(s) /
CDS view / function module TPM13 reads from still needs to be identified via `mcp-abap-abap-adt-api`
`getObjectSource`/`searchObject` before any SELECT is written; nothing may be invented per
`alv-report-standards.md` §14. Out of scope this turn: any object creation — this session hit a
tooling blocker (below) before any read of the live system was possible.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which ALV pattern? | Pattern A — `REUSE_ALV_GRID_DISPLAY` | 2026-09-17 |
| 2 | Cashflow data source? | "TPM13 report" — exact table/CDS/FM behind it still to be traced via ADT read tools once connected | 2026-09-17 |
| 3 | Company code / other selection fields besides key date? | Company code only (BUKRS select-option) | 2026-09-17 |
| 4 | AREA code for naming (`ZFS_R_<AREA>_<NAME>`) — TRM? | TRM | 2026-09-17 |
| 5 | Does the report need to run in background (no manual interaction)? | Yes — must run in background | 2026-09-17 |

## Tooling blocker found and fixed this turn

`adt-mcp`, `mcp-abap-abap-adt-api`, and `sap-gui` were listed in **both** `enabledMcpjsonServers`
and `disabledMcpjsonServers` in `.claude/settings.local.json` — none of their tools loaded in this
session. `scripts/sync-sap-systems.ps1` never writes `disabledMcpjsonServers`, so it was a stray
manual/UI edit, not sync drift. Removed the `disabledMcpjsonServers` key. See `lessons-ledger.md`
**L-334** for full detail, including the separate `adt-mcp`↔VS Code (`localhost:2236`) prerequisite
that a Claude Code restart alone does not satisfy.

**2026-09-17, later session:** the exact same contradiction was found again on resume — `.mcp`
tools were still entirely absent. `disabledMcpjsonServers` had reappeared in
`.claude/settings.local.json` with the same three servers, undoing the fix above (the file's
contents suggest the earlier removal never actually persisted, or was overwritten by something
else — unconfirmed). Removed it again this turn. See `lessons-ledger.md` **L-335**. This activity
is still blocked pending confirmation that a real restart brings the tools up.

**Still required before any live MCP call in this activity:**
1. Restart Claude Code (picks up the settings fix; brings up `mcp-abap-abap-adt-api` and `sap-gui`).
2. For `adt-mcp` specifically: VS Code open, `SAPSE.adt-vscode` logged on to the `DS4_100_NIIF`
   destination, `adt.mcpServer.enabled = true` — port 2236 was not listening when checked.
3. After restart, confirm with `healthcheck`/`adtDiscovery`/`abap_list_destinations` before trusting
   the fix this time — a prior worklog note that it was "fixed" was not sufficient proof (L-335).

**2026-09-17, third session:** identical contradiction found a fourth time — brand-new session,
zero SAP MCP tools present (not even deferred). `disabledMcpjsonServers` was back with all three
servers in `.claude/settings.local.json`. Removed the key again. See `lessons-ledger.md` **L-337**:
L-336's proposed script-level fix was never implemented in `scripts/sync-sap-systems.ps1`, so the
recurrence is expected until that script actually reconciles the disabled list — this is a manual,
per-session fix until then. **This activity remains blocked on a Claude Code restart** before any
`getObjectSource`/`searchObject` read of TPM13's data source, or any create call, can happen.

## Naming gate

Not reached yet — no object name has been proposed. Will be recorded here, one line per object,
**before** any create call, once the report name/AREA is confirmed.

## Todo

- [ ] 1. Confirm MCP connectivity restored (`healthcheck`, `adtDiscovery`, `abap_list_destinations`)
- [ ] 2. Trace TPM13's data source (program/FM/CDS/table) via `getObjectSource` / `searchObject` —
      no SELECT is written until this is a real, confirmed object
- [ ] 3. Ask remaining open questions (#3–#5 above)
- [ ] 4. Confirm report name against `docs/naming-conventions.md`, record `NAMING:` line
- [ ] 5. Build TOP include (key-date parameter + derived T-1m/T+3m range, default/validation logic)
- [ ] 6. Build F01 include per `alv-report-standards.md` §5.2 form list
- [ ] 7. Field catalog, GUI status, activation (single `activateObjects` call across all includes)
- [ ] 8. Delivery checks per template

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| | | | | not yet created |

## Delivery checks

- [ ] Pretty Printer
- [ ] Syntax check clean
- [ ] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved
- [ ] ABAP Unit green (or "none applicable" with a reason)
- [ ] Text symbols and selection texts maintained
- [ ] Object list confirmed in the transport

## Lessons raised

L-334 (stray `disabledMcpjsonServers` blocking all three project MCP servers), L-335 (fix didn't
persist across sessions), L-336 (sync script should own the disabled list), L-337 (L-336's fix
still not implemented, recurred a fourth time).
