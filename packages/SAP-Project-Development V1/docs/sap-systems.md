# SAP System Registry

This workspace connects to SAP systems through a single source of truth:
`config/sap-systems.json`. Everything else — `.mcp.json`, the enabled-server
list — is generated from it.

## Layout

| File | Committed | Contains | Edited by |
| --- | --- | --- | --- |
| `config/sap-systems.json` | yes | Non-secret metadata for every system | you |
| `.claude/settings.local.json` | **no** (gitignored) | Passwords and bearer tokens | you |
| `.mcp.json` | no (generated) | MCP server entries, `${VAR}` refs only | `scripts/sync-sap-systems.ps1` |
| `~/.adtls/destinations.json` | n/a (outside repo) | VS Code ADT RFC logon | VS Code ADT extension |

The split is the point: connection facts are shareable and reviewable, secrets
never leave the machine, and no password is ever written into a generated file.

## Adding a system

1. Append an entry to `systems[]` in `config/sap-systems.json`:

   ```json
   {
     "id": "DQ4_200_NIIF",
     "label": "NIIF S/4HANA Quality (DQ4, client 200)",
     "enabled": true,
     "role": "quality",
     "developmentModel": "s4-onprem-abap-cloud",
     "systemId": "DQ4",
     "client": "200",
     "language": "EN",
     "adt": {
       "url": "https://<host>:<https-port>",
       "user": "FS_DEV",
       "passwordEnvVar": "SAP_DQ4_200_NIIF_PASSWORD",
       "tlsRejectUnauthorized": true
     },
     "rfc": {
       "applicationServer": "<ip-or-host>",
       "systemNumber": "00",
       "sncType": "0",
       "adtlsDestinationId": "DQ4_200_NIIF"
     },
     "conventions": {
       "namespace": "ZFS",
       "transportRequired": true
     }
   }
   ```

   Convention for `id`: `<SYSID>_<CLIENT>_<LANDSCAPE>`. Convention for
   `passwordEnvVar`: `SAP_<ID>_PASSWORD`.

2. Add the password to the `env` block of `.claude/settings.local.json`:

   ```json
   "SAP_DQ4_200_NIIF_PASSWORD": "..."
   ```

3. Regenerate and restart:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1
   ```

   Then restart Claude Code — MCP servers read their environment at startup.

## Server naming

The generator derives the MCP server name so that tool names stay predictable:

- The **default system** (`defaultSystem` in the registry) always maps to
  `mcp-abap-abap-adt-api`. This name is deliberately stable: `CLAUDE.md`
  routing rules and existing `mcp__mcp-abap-abap-adt-api__*` tool names depend
  on it. Changing which system is default therefore re-points that server
  rather than renaming it.
- **Every other enabled system** maps to `abap-adt-<sysid>-<client>`, e.g.
  `abap-adt-dq4-200`, exposing `mcp__abap-adt-dq4-200__*` tools.
- Set `mcpServerName` on a system to override either rule.

Each enabled system runs its own Node process, so several systems can be
addressed in one session without restarting or switching context.

### SAP GUI scripting servers

A system may also carry an optional `sapGui` block. When `sapGui.enabled` is
true the generator emits a **second** server for that system — `sap-gui` for the
default system, `sap-gui-<sysid>-<client>` otherwise — running the SAP GUI
Scripting MCP server vendored in `tools\mcp-sap-gui`. It reuses the same
`adt.user`, `adt.passwordEnvVar`, `client` and `language`, so there is no second
credential to maintain.

```json
"sapGui": {
  "enabled": true,
  "logonDescription": "NIIF - Development",
  "readOnly": false,
  "profile": "full",
  "auditLog": "logs/sap-gui-audit.jsonl"
}
```

`logonDescription` must match the SAP Logon Pad entry name exactly — it is the
argument to `sap_connect`. Full reference: `docs/sap-gui-mcp-setup.md`.

### Two systems with the same SYSID and client

`DS4_100_NIIF` and `DS4_100_TFSIN` are different landscapes that both present
as `DS4` client `100`. Two consequences:

- The derived name `abap-adt-ds4-100` is ambiguous between them, so
  `DS4_100_TFSIN` carries an explicit `mcpServerName` of
  `abap-adt-ds4-100-tfsin`. Never let the derived rule pick the name for either
  of them.
- `adt-mcp` cannot disambiguate at all — it follows whichever destination VS
  Code is logged on to, and its responses look identical for both. Before using
  `adt-mcp` for creation, activation, transports, ATC or RAP generators, confirm
  which destination VS Code holds — `abap_list_destinations` reports what it can
  currently see (as of this writing, `DS4_100_NIIF` only, even though both
  destinations exist in `~/.adtls/destinations.json`). When in doubt, do the work
  through the system's own `abap-adt-*` server, which is pinned by URL.

### Status of `DS4_100_TFSIN`

Registered but `enabled: false`. Two facts are still missing:

1. **ADT HTTPS endpoint.** The registry currently holds
   `https://10.110.0.33:44300`, guessed from the RFC application server and the
   default ICM HTTPS port for instance `00`. The host answered nothing (no ICMP,
   no TCP on 44300/8000/3200/3300/443) from the workstation, so it could not be
   probed — it is presumably behind a VPN or SAP router. An IP-based URL will
   also fail certificate validation even once reachable; prefer the FQDN.
2. **Password** for `FS_DEV`, as `SAP_DS4_100_TFSIN_PASSWORD` in the `env` block
   of `.claude/settings.local.json`.

With both in place, set `enabled: true` and rerun the sync script.

## Validating

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1 -Check
```

Writes nothing; exits non-zero if the registry is malformed or a password is
missing. It checks required fields, `client` being three digits, `adt.url`
being `scheme://host[:port]` with no trailing path, duplicate ids, server-name
collisions, an unknown `defaultSystem`, and a missing Node entry point. It
warns on plain `http` and on disabled TLS validation.

To verify a system is actually reachable before wiring it up:

```bash
curl -sS -o /dev/null -w "%{http_code} tls=%{ssl_verify_result}\n" \
  -u 'USER:PASSWORD' \
  "https://<host>:<port>/sap/bc/adt/discovery?sap-client=<client>"
```

`200` means credentials and the ADT service are good. `401` with no credentials
is expected and healthy. `tls=0` means the certificate validates against the
system trust store — leave `tlsRejectUnauthorized` at `true`. A non-zero value
means self-signed or otherwise untrusted; prefer importing the CA over setting
`tlsRejectUnauthorized` to `false`.

## The two MCP servers, and why only one is in the registry

- **`adt-mcp`** — the ADT MCP server hosted by the VS Code ABAP extension on
  `http://localhost:2236/mcp`. It follows whichever system VS Code is logged on
  to (`~/.adtls/destinations.json`), so it is **not** part of the registry and
  cannot be pointed at a second system independently. Its bearer token comes
  from the VS Code setting `adt.mcpServer.token` and lives in
  `ADT_MCP_TOKEN`. The generator preserves this entry verbatim.
- **`mcp-abap-abap-adt-api`** (and its per-system siblings) — a Node server
  talking ADT over HTTPS with its own credentials. This is the one that scales
  across systems.

Per `CLAUDE.md`, `adt-mcp` handles initial object creation, activation,
transports, ATC, ABAP Unit and RAP generators; `mcp-abap-abap-adt-api` handles
changes to already-created objects and any creation `adt-mcp` cannot perform.
Because `adt-mcp` is single-system, work on a non-default system runs entirely
through that system's `abap-adt-*` server.

## Rotating a secret

Passwords and the ADT token both live in `.claude/settings.local.json`. Replace
the value and restart Claude Code; no regeneration needed, since `.mcp.json`
only holds `${VAR}` references. The ADT token is rotated in VS Code
(`adt.mcpServer.token`) and must be copied across.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `adt-mcp` 401 | `ADT_MCP_TOKEN` unset or stale vs. `adt.mcpServer.token` |
| `adt-mcp` unreachable | VS Code not running, or `adt.mcpServer.enabled` is false |
| `abap-adt-*` auth failure | Wrong password, locked user, or wrong `client` |
| `abap-adt-*` TLS error | Untrusted certificate — import the CA |
| Server missing from `/mcp` | Not in `enabledMcpjsonServers`; rerun the sync script |
| Changes not picked up | Claude Code not restarted |
| `sap-gui` won't start | venv missing at `tools\mcp-sap-gui\.venv` — see `docs/sap-gui-mcp-setup.md` |
