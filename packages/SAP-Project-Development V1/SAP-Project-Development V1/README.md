# SAP Project Development

Control plane for an SAP S/4HANA system. **No ABAP source lives in this repository** — the
objects live on `DS4` client `100` and are reached over MCP. Nothing here builds, lints or tests
locally; verification runs *on SAP*.

What this repo actually holds is the **record and the wiring**: the connection registry, the
conventions every agent must follow, a durable worklog of every activity with its evidence, an
append-only lessons ledger, and the runbooks written from builds that already happened.

## Start here

| You are | Read, in this order |
|---|---|
| An **agent** (Claude Code, Codex, Copilot, Cursor) | [`AGENTS.md`](AGENTS.md) — the canonical rules for every agent. Claude Code additionally reads [`CLAUDE.md`](CLAUDE.md), which carries the same rules plus a task-routing index. |
| A **human** picking the work up | This file, then [`lessons/lessons-ledger.md`](lessons/lessons-ledger.md), then the newest file under `worklog/DS4_100_NIIF/` |
| Setting the workspace **up** | [`docs/sap-systems.md`](docs/sap-systems.md) → [`docs/abap-mcp-setup.md`](docs/abap-mcp-setup.md) → [`docs/sap-gui-mcp-setup.md`](docs/sap-gui-mcp-setup.md) |

> `lessons/lessons-ledger.md` **outranks** `docs/` wherever the two disagree. The ledger is
> append-only and records what the platform actually did, not what the runbook expected.

## Layout

```
config/sap-systems.json     The only hand-edited connection truth. Non-secret metadata only.
  └─ scripts/sync-sap-systems.ps1 ─▶ .mcp.json                 (generated, never hand-edit)
                                  └▶ .claude/settings.local.json

docs/                       Runbooks, written from builds that already happened.
  message-catalog/<sys>.md    Per-system ZFS_TRM_MSG catalogue. Message numbers are per-system.
  superpowers/{plans,specs}/  Curated design specs and implementation plans.

lessons/lessons-ledger.md   Append-only L-nnn corrections and platform gotchas. Outranks docs/.

worklog/<system-id>/<YYYY-MM>/
  YYYY-MM-DD-HHmm-<slug>.md   One file per activity. The session-to-session handover artifact.
  evidence/<worklog-stem>/    Screenshots, transcripts, payload dumps. Committed, not ignored.
  _TEMPLATE.md                At the worklog/ root, shared across systems.

scripts/                    The only local automation: registry sync, dashboard build,
                            SAP GUI screen automation, regression suites.
web/<name>-console/         Standalone browser consoles over the OData services
                            (index.html + proxy.py + sap_config.json each).
dashboard/                  Worklog completion-rate dashboard. Renders to gitignored output/.
graphify-out/               Knowledge graph of this repo. Read GRAPH_REPORT.md before
                            answering architecture questions. cache/ is gitignored.
tools/                      Vendored MCP servers. Gitignored — bootstrap, don't commit.
claude-abap-skills/         Vendored Clean ABAP / RAP rule-set copies.
```

Agent rule-sets are mirrored so the workspace is not agent-dependent: `.github/copilot-instructions.md`
and `.cursor/rules/` both defer to `AGENTS.md`. **Change a standing rule in `AGENTS.md` too**, or
the three drift apart (L-221).

## The non-negotiables, in brief

`AGENTS.md` is authoritative — this is orientation, not a substitute.

1. **Naming is gated before creation.** Validate against `docs/naming-conventions.md` and record
   the `NAMING:` line *before* the create call. Mismatch means stop and ask.
2. **No `$TMP`.** Every object goes in a real `ZFS*` package on a transport.
3. **Never create an object nobody asked for.** A blocked step reported honestly is the correct
   outcome; an unrequested object on the system is not.
4. **Messages only from `ZFS_TRM_MSG`** — never a text symbol, an inline literal or another class.
5. **Routing is per object:** `adt-mcp` creates, `mcp-abap-abap-adt-api` changes. Text elements
   and transaction codes are the two named exceptions, created only via the `sap-gui` script.
6. **Draft on a RAP BO needs human confirmation** — never on an agent's own judgement.
7. **Every activity opens a worklog file and a ledger entry in the same turn.**

## Local commands

Verification (syntax, activation, ATC, ABAP Unit) runs **on SAP** via MCP. The only local commands
wire the servers up and render the dashboard:

```powershell
# After editing config/sap-systems.json - regenerates .mcp.json + enabledMcpjsonServers
powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1

# Validate the registry and report drift without writing. Exits 1 on error or missing password.
powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1 -Check

# Render the worklog completion dashboard to the gitignored dashboard/output/
powershell -ExecutionPolicy Bypass -File scripts\build-dashboard.ps1
```

Restart Claude Code after a sync — MCP servers are read only at startup. For RAP generator work
start with `MCP_TIMEOUT=600000 claude`; a multi-entity BO takes 60–180 s.

## Secrets

Secrets never enter the registry. A system names its `adt.passwordEnvVar`, the generated
`.mcp.json` holds only `${VAR}`, and the value lives in the gitignored
`.claude/settings.local.json` `env` block.

Live-session artifacts from OData smoke tests (`cookies.txt`, `headers.txt`) are gitignored
anywhere in the tree — they carry a real `SAP_SESSIONID_*` and `x-csrf-token`.

## Conventions worth knowing before you write anything

- **Worklog filenames carry `HHmm`**, the 24h local start time. Several activities a day is
  routine here (21 on 2026-09-08) and the time is what orders them (L-502).
- **Evidence is committed**, and lives in a sibling `evidence/<worklog stem>/` folder named
  exactly like its worklog minus `.md`. Never drop an artifact loose.
- **Lessons start at L-200.** L-013…L-198 are reserved; see the ledger's *Inherited* table.
  Append-only: never renumber or delete, supersede with a new entry plus a `Superseded by` line.
- **`docs/` paths are load-bearing.** Several hundred references point at them from worklogs,
  the ledger and the agent rule-sets. Renaming a doc means fixing every one.
