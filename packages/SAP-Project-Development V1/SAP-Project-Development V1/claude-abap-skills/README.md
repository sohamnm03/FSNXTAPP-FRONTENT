# claude-abap-skills

**The official SAP ABAP MCP Server gives your AI coding agent hands. This library gives it a brain.**

Two Claude Code plugins for modern ABAP development — SAP BTP ABAP Environment and S/4HANA on-prem in the ABAP Cloud development model. They live together in this repo but are independent — install either or both. An [`AGENTS.md` template](templates/AGENTS.md) is also provided for use with other AI coding agents (GitHub Copilot, Cursor, …).

---

## What this is

A collection of **always-on rules, prompt templates, and slash commands** that turn raw AI-agent output into production-quality modern ABAP, RAP, and ABAP CDS.

This is **not** an MCP server. There is no system connector code here. All system access — reading objects, writing source, running ATC, executing ABAP Unit — flows through MCP servers you connect yourself.

| Component                                  | Role                                                                         |
|--------------------------------------------|------------------------------------------------------------------------------|
| `SAPSE.adt-vscode` (official SAP MCP)      | **Hands** — create/activate objects, run ATC, run unit tests, generate RAP services, transports |
| [ARC-1](https://github.com/arc-mcp/arc-1) (community MCP, optional) | **Eyes** — read source, search the repository, dependency/where-used analysis, API release state; also a second pair of hands when its write scope is enabled |
| `claude-abap-skills` (this repo)           | **Brain** — what to write, what to avoid, how to structure RAP, how to review |

The skills route **per capability**: the official server first for anything that changes the system and for ATC, ARC-1 for everything read-shaped (which the official server does not offer at all), pasted source when neither is connected. See "Tool routing" below.

---

## The two plugins

### `clean-abap`
Universal Clean ABAP rules plus two skills (the rules in `CLAUDE.md` are read by each skill on invocation, not loaded at session start):

- **`/clean-abap:review`** — review existing ABAP against the rule set, structured report grouped by severity
- **`/clean-abap:refactor`** — refactor to Clean ABAP style in deterministic passes, behavior-preserving, asks before writing back

### `abap-cloud-rap`
ABAP Cloud / RAP rules plus three skills (rules read on invocation, as above):

- **`/abap-cloud-rap:rap-bo-design`** — design a complete RAP business object end-to-end; drives the SAP ADT MCP `x-ui-service` / `ui-service` / `webapi-service` generators
- **`/abap-cloud-rap:atc-remediation`** — walk ATC violations methodically, grouped by category, refuses pseudo-comment suppressions by default
- **`/abap-cloud-rap:clean-core-check`** — audit objects for clean core compliance (released APIs, no SAP table reads, no classic constructs, no SAP-standard modifications)

Each plugin is **independent** — install either or both. They do not load each other's rules at runtime; the layering is conceptual, not enforced by Claude Code. If you want Clean ABAP rules applied to a Cloud/RAP skill invocation, install both plugins and reference the Clean ABAP plugin's behaviour explicitly.

---

## Supported systems

- **SAP BTP ABAP Environment** (Steampunk)
- **SAP S/4HANA on-prem**, when developed in the **ABAP Cloud development model**

Where the two diverge — released-API surface, allowed `@AbapCatalog` annotations, ATC variants — the skills call it out explicitly and ask which system you are targeting if unclear.

### Not supported

- SAP ECC
- Classic non-Cloud development model on S/4HANA (any release)
- Classic dynpro, logical databases, SAP Query, classic batch input
- BAPI-style transactional code where RAP is the modern alternative

PRs adding content for unsupported scopes will be closed — see `CONTRIBUTING.md`.

---

## Prerequisites

1. **[Claude Code](https://docs.claude.com/en/docs/claude-code)** installed
2. The **official SAP ABAP MCP Server**, distributed as part of the [`SAPSE.adt-vscode`](https://marketplace.visualstudio.com/items?itemName=SAPSE.adt-vscode) extension, installed and connected to your ABAP system. Enable it under VS Code settings: `adt.mcpServer.enabled: true`
3. A target system: BTP ABAP Environment or S/4HANA on-prem in Cloud development model
4. *Optional but recommended* — a read-capable MCP such as [ARC-1](https://github.com/arc-mcp/arc-1). Without one, the review, refactor, and clean-core-check skills can only work on source you paste in, because the official server cannot read existing objects.

See `docs/mcp-setup.md` for connection details.

---

## Install

Two commands. Both plugins, available in every Claude Code session.

```bash
# 1. Register this repo as a plugin source for Claude Code
claude plugin marketplace add https://github.com/matt1as/claude-abap-skills

# 2. Install both plugins (or just one — they work independently, but pair best together)
claude plugin install clean-abap
claude plugin install abap-cloud-rap
```

Verify:

```bash
claude plugin list
```

You should see both plugins listed. The five skills auto-register and become invokable as `/clean-abap:review`, `/clean-abap:refactor`, `/abap-cloud-rap:rap-bo-design`, `/abap-cloud-rap:atc-remediation`, `/abap-cloud-rap:clean-core-check`.

### Important — `MCP_TIMEOUT`

The `rap-bo-design` skill drives the SAP ADT MCP's RAP generators, which routinely take 60–180 s for a multi-entity BO. Claude Code's default MCP tool timeout (~30 s) is shorter. Launch Claude Code with a longer timeout when generation is on the plan:

```bash
MCP_TIMEOUT=600000 claude   # 10 minutes — plenty of headroom
```

---

## Workspace bootstrap for other AI coding agents — `AGENTS.md` template

The plugins are packaged for Claude Code, but the rule sets they enforce describe ABAP, not any specific agent. AI coding agents that read an `AGENTS.md` workspace bootstrap — GitHub Copilot in VS Code, Cursor, and others — can pick up the same guardrails.

[`templates/AGENTS.md`](templates/AGENTS.md) is a drop-in template for an ABAP project workspace. Copy it to the root of your ABAP project, fill in the placeholders (target system, package prefix, GitHub owner), and trim sections that don't apply.

It covers:

- The same modern-ABAP, released-API, Cloud-development-model guardrails as the plugins
- VS Code virtual-workspace quirks, scoped so they don't fire in Eclipse or out-of-process MCP clients
- Pointers back into the installed plugins' rule files and slash commands
- The `MCP_TIMEOUT` caveat for RAP generators

The template follows the convention SAP recommends in its [ADT-for-VS-Code FAQ](https://community.sap.com/t5/technology-blog-posts-by-sap/abap-development-tools-for-visual-studio-code-your-questions-answered/ba-p/14269432) and extends it with the project's full rule set.

---

## Updating

```bash
claude plugin marketplace update claude-abap-skills
claude plugin update clean-abap
claude plugin update abap-cloud-rap
```

---

## Uninstall

```bash
claude plugin uninstall clean-abap
claude plugin uninstall abap-cloud-rap
claude plugin marketplace remove claude-abap-skills
```

---

## Repo layout

```
claude-abap-skills/
├── .claude-plugin/marketplace.json    # manifest listing both plugins
├── clean-abap/                        # Plugin 1
│   ├── .claude-plugin/plugin.json
│   ├── CLAUDE.md                      # universal Clean ABAP rule set
│   ├── review/SKILL.md
│   └── refactor/SKILL.md
├── abap-cloud-rap/                    # Plugin 2
│   ├── .claude-plugin/plugin.json
│   ├── CLAUDE.md                      # RAP / ABAP Cloud overlay rule set
│   ├── rap-bo-design/SKILL.md
│   ├── atc-remediation/SKILL.md
│   └── clean-core-check/SKILL.md
├── templates/
│   └── AGENTS.md                      # workspace bootstrap for any AI coding agent
├── docs/mcp-setup.md
├── CLAUDE.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## Tool routing — official MCP first, ARC-1 as fallback

The official `SAPSE.adt-vscode` MCP is **creation-focused**: strong at bootstrapping and changing a system, and it now ships ATC — but it still has no way to *read* an existing object or *search* the repository. ARC-1 is the mirror image: rich reads, gated writes.

So the skills do not pick a server; they pick a server **per capability**:

| Capability                              | Primary                                                     | Fallback                              |
|-----------------------------------------|-------------------------------------------------------------|---------------------------------------|
| Read source of an existing object       | `arc-1` `SAPRead`                                           | paste from ADT                        |
| Search repository / list a package      | `arc-1` `SAPSearch`, `SAPRead type=DEVC`                    | ask the user                          |
| Dependencies, where-used, CDS impact    | `arc-1` `SAPContext`, `SAPNavigate`                         | ask the user                          |
| Run ATC                                 | `abap-adt` `abap_atc_run` + `abap_atc_get_result`           | `arc-1` `SAPDiagnose action="atc"`    |
| ATC quick fixes                         | `abap-adt` deterministic quickfixes / AI fix                | `arc-1` `SAPDiagnose` quickfix        |
| List ATC check variants                 | `arc-1` `SAPDiagnose action="atc_variants"`                 | ask the user                          |
| Run ABAP Unit                           | `abap-adt` `abap_run_unit_tests`                            | `arc-1` `SAPDiagnose action="unittest"` |
| Syntax-check existing / draft source    | `arc-1` `SAPDiagnose action="syntax"`                       | activate and read the error           |
| Generate a full RAP stack                | `abap-adt` `abap_generators-*`                              | none — only SAP ships the generators  |
| Create objects, write source, activate  | `abap-adt` (`abap_creation-*`, `abap_activate_objects`)     | `arc-1` `SAPWrite` + `SAPActivate`, when write scope is on |
| Transports                              | `abap-adt` `abap_transport-*`                               | `arc-1` `SAPTransport`                |
| API release contract (C0–C4)            | read `arc-1` `SAPRead type=API_STATE` / set `SAPManage action="set_api_state"` | ADT |

**This table is an observation, not a contract.** It reflects `SAPSE.adt-vscode` **1.1.1** (verified 2026-08) and a contemporaneous ARC-1 — notably, 1.1.1 ships ATC, which earlier versions did not. Both servers gain tools over time, so the skills key off *"is this tool present in the session"*, never off a version number. If the live tool list disagrees with this table, the live list wins.

Notes worth knowing before you rely on this:

- **Official-MCP tools take a `destination`**; ARC-1 is bound to one system with no selector. If you work against several systems, only the official server can switch.
- **ARC-1 writes are opt-in and self-declaring.** They are gated behind server-side flags (`SAP_ALLOW_WRITES` and friends). The gating is observable rather than guessable: when write scope is off, the mutating actions are simply **absent from each tool's `action` enum**. The skills check that before promising a write.
- **A successful ARC-1 write means "lint passed", not "this compiles."** `SAPWrite` blocks on abaplint errors by default (`SAP_LINT_BEFORE_WRITE`, `FUNC` excluded), and can additionally run SAP's server-side syntax check (`SAP_CHECK_BEFORE_WRITE`) — but that one is advisory by design, because intermediate writes in a multi-object sequence legitimately fail to compile until their dependencies land. Activation is the real gate, so the skills read the object back after writing and confirm `SAPRead type=INACTIVE_OBJECTS` is clear after activating.
- **Neither server is required.** With nothing connected, all five skills still work on pasted source. They will never fabricate source, findings, or object names.

ARC-1 is optional and community-maintained — install it only if you want the read/search half. See [`arc-mcp/arc-1`](https://github.com/arc-mcp/arc-1).

---

## Contributing

Contributions are very welcome. The bar is **high quality, opinionated, enforced rules** with working ABAP/CDS/BDEF code examples and a clear rationale. See `CONTRIBUTING.md` for the full process and scope policy.

---

## License

Apache 2.0 — see `LICENSE`.

## Author

[Mattias Johansson](https://github.com/matt1as)
