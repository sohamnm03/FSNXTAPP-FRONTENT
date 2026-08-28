# SAP Testing Automation

Functional / front-end test automation for **SAP S/4HANA** on system `DS4`, client `100`.

This workspace exercises what the SAP development project built, and records what it observes.
**No ABAP source lives here** — the sibling workspace `SAP-Project-Development V1` builds the
ABAP objects; this one tests them.

## Two lanes

| Lane | Drives | How |
|---|---|---|
| **`sap-gui`** | SAP GUI for Windows — classic Dynpro t-codes, ALV grids, table controls, trees | SAP GUI Scripting COM API, via an MCP server (57 tools) |
| **`web-tests/`** | Fiori, WebGUI, UI5 in a browser | `playwright-sap`, a Playwright fork with UI5-aware locators |

Both lanes read the same system registry (`config/sap-systems.json`) and the same credential.
Pick the lane by what the user actually uses — a t-code reachable both ways renders differently
in each and doesn't fail the same way.

## Quick start

```bash
# Regenerate MCP config from the system registry (after any edit to config/sap-systems.json)
powershell -ExecutionPolicy Bypass -File "scripts\sync-sap-systems.ps1"

# Web lane: install once, then run a suite
npm install --prefix web-tests && npm run install-browsers --prefix web-tests
npm run test:regression --prefix web-tests

# GUI lane: reinstall the vendored MCP server if the .venv is missing
python -m venv "tools\mcp-sap-gui\.venv"
"tools\mcp-sap-gui\.venv\Scripts\python.exe" -m pip install "mcp-sap-gui[screenshots]==0.2.2"

# Run a case unattended (either lane), no model in the loop
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -List
```

Restart Claude Code after regenerating `.mcp.json` — MCP servers read their environment at startup.

## Layout

| Path | Contains |
|---|---|
| `config/` | System registry, suite classification, and the unattended-run catalogs for both lanes |
| `scripts/` | PowerShell entry points — sync config, run a case, check a suite/run, build the dashboard |
| `test-cases/` | One markdown file per test case — `GUI-TC/` and `Web-TC/`, from `_TEMPLATE.md` |
| `test-data/` | Dataset JSON files a data-driven case iterates over |
| `web-tests/` | The Fiori/WebGUI/UI5 lane — Playwright specs, config, fixtures, screen models |
| `gui_tests/` | The GUI lane's frozen-script harness (runner, session controller, journal, per-module flows) |
| `dashboard/` | The results dashboard (template + payload schema) |
| `docs/` | Setup and authoring guides — see below |
| `.claude/agents/` | Read-only review subagents for a case file or a spec diff |
| `.claude/skills/` | `/check-run`, `/new-test-case` |
| `results/`, `evidence/`, `logs/` | Run output, screenshots, audit log — gitignored (live SAP data) |

## Documentation

- `docs/sap-gui-mcp-setup.md` — driving SAP GUI via the MCP server
- `docs/web-testing-setup.md` — driving Fiori/UI5 with `playwright-sap`
- `docs/test-authoring-guide.md` — writing and running a test case
- `docs/suite-design.md` — screen models, datasets, suites, change impact after a transport
- `docs/unattended-runs.md` — running a case with no model in the loop, and recovering an
  interrupted run
- `dashboard/README.md` — the results dashboard

## Ground rules

Full detail lives in `CLAUDE.md` (read by Claude Code automatically); the essentials:

1. Confirm the target system (`DS4` / client `100`) before any step that writes — never assume
   `sap_connect_existing` attached to the right session.
2. A step that commits data is named and confirmed by a human before it runs. Read-only checks
   never need asking.
3. Element ids are discovered from the live screen, never hand-written.
4. Every run writes a result file, including a skipped or blocked one — no invented values.
5. No production system is ever configured or driven here.
6. One session, one case at a time, unless a human explicitly asks for more.
