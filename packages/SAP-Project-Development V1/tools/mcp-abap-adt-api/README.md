# `mcp-abap-abap-adt-api` (local install)

This folder holds a project-local install of
[`mcp-abap-abap-adt-api`](https://github.com/mario-andreschak/mcp-abap-abap-adt-api),
the community MCP server that wraps the `abap-adt-api` client. It exposes 127
ADT tools (`getObjectSource`, `setObjectSource`, `lock`/`unLock`,
`activateObjects`, `createObject`, ATC, ABAP Unit, transports, abapGit,
debugger, traces, refactoring, `healthcheck`, `adtDiscovery`, …).

Per `CLAUDE.md` → *MCP Routing*, this server is the one used for **changes to
objects that already exist** and as the fallback when `adt-mcp` cannot create an
object type.

## What is installed here

- `package.json` — pins the dependency
- `node_modules/mcp-abap-abap-adt-api/dist/index.js` — the server entry point
  (stdio transport)

Reinstall / upgrade:

```bash
npm install mcp-abap-abap-adt-api@latest
```

(run it from this folder)

## How it is registered

Registration lives in the project-scoped `.mcp.json` at the repo root, under the
server name `mcp-abap-abap-adt-api`. It launches the entry point above with
`node` and passes SAP credentials through the `env` block.

## Credentials — you must supply these

The server refuses to start without `SAP_URL`, `SAP_USER`, and `SAP_PASSWORD`.
`.mcp.json` reads them from your Windows user environment variables, so no
password is stored in the repo. Set them once in PowerShell:

```powershell
setx SAP_URL "https://your-sap-host:44300"
```

```powershell
setx SAP_USER "YOUR_SAP_USER"
```

```powershell
setx SAP_PASSWORD "your-password"
```

Optional overrides (defaults are `100` / `EN`):

```powershell
setx SAP_CLIENT "100"
```

```powershell
setx SAP_LANGUAGE "EN"
```

`setx` only affects **new** processes — close and reopen Claude Code (and any
terminal you start it from) afterwards.

If your ABAP system uses a self-signed certificate, also set
`NODE_TLS_REJECT_UNAUTHORIZED` to `0`. That disables TLS verification for this
server's Node process — development systems only:

```powershell
setx NODE_TLS_REJECT_UNAUTHORIZED "0"
```

Alternative to environment variables: replace the `${...}` placeholders in
`.mcp.json` with literal values. Simpler, but it puts your SAP password in a
plaintext file in the project — only do that if that is acceptable here.

## Verifying

Start Claude Code in the project root, approve the project-scoped server when
prompted, then:

```bash
claude mcp list
```

Expected: `mcp-abap-abap-adt-api` — connected.

Then, from inside Claude Code, in this order:

1. `mcp__mcp-abap-abap-adt-api__healthcheck` — server process is alive
2. `mcp__mcp-abap-abap-adt-api__adtDiscovery` — returns the real ADT service
   catalog, which proves credentials and the `/sap/bc/adt` path work

Do **not** use the `login` tool as the connectivity check — it has a
response-serialization bug in this setup (see `CLAUDE.md`).

## Notes

- The upstream README mentions a `.env` file. That path only works when the
  server is built from a clone: `dotenv` resolves `../.env` relative to `dist/`,
  which here would land inside `node_modules` and be wiped on every reinstall.
  The `env` block in `.mcp.json` is used instead, and it takes precedence over
  `.env` regardless.
- Transport is stdio; there is no port to free and nothing to keep running in
  the background. Claude Code spawns the process itself.
- This is a separate server from `adt-mcp` (the `SAPSE.adt-vscode` extension's
  HTTP MCP on `localhost:2236`). Both can be connected at the same time — see
  `docs/abap-mcp-setup.md`.
