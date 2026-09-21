# AGENTS.md — ABAP project workspace

Workspace-wide rules for **every** AI coding agent working in this repository — Claude Code,
Codex, GitHub Copilot, Cursor. This file is canonical; `.github/copilot-instructions.md` and
`.cursor/rules/` defer to it. Claude Code additionally reads `CLAUDE.md`, which repeats the
standing agreements below and adds harness-specific detail.

**There is no ABAP source in this repository.** The objects live on the SAP system and are
reached over MCP. Nothing here compiles; there is no local build, lint or test step.

---

## Target system

This project targets **SAP S/4HANA on-prem (`DS4`, client `100`) in the ABAP Cloud
development model**, registered as `DS4_100_NIIF` in `config/sap-systems.json`.

BTP ABAP Environment is **not** a target. The two scopes differ in released APIs, allowed
CDS annotations and ATC variants — never silently mix them. If a request is ambiguous, ask
before generating code.

---

## Standing agreements

These four bind every activity, not just ABAP builds. They exist because each was a
correction the human had to issue once already.

1. **Lessons capture.** `lessons/lessons-ledger.md` is the durable record. Any instruction
   the human asks to be noted, any correction to how work is done, and any non-obvious
   platform behaviour found while building becomes an `L-nnn` entry — written **in the same
   turn the instruction is given**. Append-only: never renumber, never delete; supersede
   with a new entry. New entries start at **L-200**. Read the ledger before planning any
   build — it outranks the generic examples in `docs/` when the two disagree.

2. **Todo list per activity.** Every activity opens a work plan under
   `worklog/<system-id>/`, copied from `worklog/_TEMPLATE.md` (the template stays at the
   `worklog/` root, shared across systems) and named `YYYY-MM-DD-<slug>.md`, carrying scope,
   open questions, the `NAMING:` gate lines, the numbered todo list, the object list and the
   delivery checks. `<system-id>` matches `config/sap-systems.json` `systems[].id` — worklogs
   are per-system because everything they record (objects, transports, open questions) is only
   meaningful against one system (L-234). Keep it current — it is the handover artifact
   between sessions.

3. **Messages come from `ZFS_TRM_MSG` only.** Every user-facing message in every
   development uses message class `ZFS_TRM_MSG` — never a text symbol, never an inline
   literal, never another class. Pick from `docs/message-catalog/<system-id>.md`, the local
   mirror for that system — message numbers are per-system state, so never reuse one across
   systems (L-234); do not query `T100` for routine lookups. If nothing fits, create the
   message in `ZFS_TRM_MSG`, add it to that system's catalog file **in the same turn**, and
   list every created message (number, type, text) in the completion report. `ZFS_TEST_VS` is
   superseded history — readable, never extended (L-210).

4. **Text elements: one named exception.** Do not create or modify text symbols, selection
   texts or list headings via ADT, `INSERT TEXTPOOL`, or a helper class. The one sanctioned
   route is `sap-gui` screen automation through `docs/sap-gui-object-automation.md` (SE38
   Text Elements), authorized 2026-08-22 (L-229). Outside that script, list in the completion
   report exactly what the human must maintain: program, text ID and key, proposed wording,
   maximum length. Text symbols still belong in the source for screen furniture (block
   titles, grid title, header lines) (L-211).

---

## General rules

- Follow `docs/naming-conventions.md` for every new or changed SAP artifact name. All custom objects begin with `ZFS` unless the naming document lists a human-approved exception.
- Before creating any SAP object, validate the proposed name against `docs/naming-conventions.md` and record `NAMING: <name> -> matches <pattern row | exception row>` in the work report. If the name does not match, stop before creation and ask for a corrected or explicitly approved name. A name a **generator** proposes gets the same gate — the RAP generators suggest names that do not match this convention, and those suggestions are discarded, not adopted.
- Use cloud-compliant ABAP syntax and APIs. Released APIs (C1 release contract) only.
- **No local or temporary objects.** Every object is created in a real `ZFS*` package and
  recorded on a transport request. There is no throwaway tier in this workspace (L-215).
- **Never create helper, runner, scratch or test objects the human did not ask for.** If a task
  cannot be completed with the requested objects, stop and report what is blocked and why (L-216).
- Create new ABAP development objects via an ABAP MCP server, not by hand-writing source files.
- Prefer modern ABAP constructs: inline declarations, `VALUE #( )`, string templates, `COND` / `SWITCH`, table expressions, class-based exceptions, `NEW` over `CREATE OBJECT`.
- Prefer CDS-based data access over `SELECT` from physical tables.
- **CDS view entity restrictions that only surface at activation, not in the source itself:**
  `@Metadata.ignorePropagatedAnnotations: true` blocks a passthrough field from inheriting the base
  entity's `@Semantics.amount.currencyCode` / quantity-unit annotation — restate it explicitly on
  every exposed CURR/QUAN field or activation fails with "reference information missing" (L-239).
  `define view entity` (modern syntax) refuses a classic ABAP Dictionary database view (SE11 type
  `VIEW`) as a join source — replace it with the released `I_*` CDS equivalent, never drop back to
  legacy `define view` syntax to work around it (L-240). A `where` clause on a view entity goes
  **after** the `{ }` field list, not before it (L-241).
- Use RAP for new transactional behaviour. Do not write `BAPI`-style update logic by hand.
- **Draft is never enabled on my own judgement.** In any RAP development, stop and ask the human
  before adding, removing or accepting draft — `with draft;`, a draft table, the draft actions
  (`Prepare`, `Edit`, `Activate`, `Discard`, `Resume`), or a generator that switches it on
  implicitly. Record the answer in the worklog's *Open questions* table before continuing (L-224).

---

## Choosing between MCP servers

Routing is **per object**, not per session and not per capability. Three servers are
configured; `.mcp.json` is generated from `config/sap-systems.json` by
`scripts/sync-sap-systems.ps1` and must never be hand-edited.

| Server | Use it for |
|---|---|
| `adt-mcp` (official SAP ADT MCP) | The **initial creation** of any object, activation, transports, ATC, ABAP Unit, RAP generators. It has no read-source and no repository-search tool. |
| `mcp-abap-abap-adt-api` | Any **change to an object that already exists** — source edits, re-activation, lock/unlock. Also all **reading**: `getObjectSource`, `searchObject`, `nodeContents`, `usageReferences`, `tableContents`, `runQuery`. |
| `sap-gui` | Anything happening on a **screen** rather than on an object: running a t-code, driving a selection screen, reading an ALV, front-end testing. Never use it to edit ABAP source. **Two named exceptions** (L-229): text-element maintenance (SE38) and transaction-code creation (SE93), both only via `docs/sap-gui-object-automation.md`. |

So: **`adt-mcp` creates, `mcp-abap-abap-adt-api` changes.** No carve-out for any category of
object, and no drifting to whichever server is already open in the conversation. Falling
back to `mcp-abap-abap-adt-api` for a *creation* is legitimate whenever `adt-mcp` genuinely
cannot do it — unsupported object type, or **confirmed unreachable** — and the reason is
written into the worklog at the time (L-212). Message classes (`MSAG/N`) are a confirmed
unsupported-type case. **"Confirmed unreachable" (human-broadened rule, L-339, 2026-09-18):**
when `abap_list_destinations` returns `[]`, or any `adt-mcp` creation call fails with the
"project is null" / "no project found for `<destination>`" family of errors (the L-333
liveness probe), `mcp-abap-abap-adt-api` `validateNewObject`/`createObject` may be used to
create **any** object type in this project until `adt-mcp` recovers — run the probe first and
record the result. Transaction codes remain a standing exception regardless of reachability —
neither ADT server can create `TRAN/T` at all — routed instead to `sap-gui` (SE93) per
`docs/sap-gui-object-automation.md`, not to `mcp-abap-abap-adt-api` (L-229).

A stale session is an auth failure, not a missing capability — reconnect, do not reroute.
`mcp-abap-abap-adt-api`'s `login` tool has a response-serialization bug here; check
connectivity with `healthcheck` or `adtDiscovery` instead.

No read-only third-party server (ARC-1 or similar) is currently configured. If **no** server
can read the source, ask for it to be pasted. Never invent source, ATC findings, object names
or release states.

---

## When running inside ADT for VS Code

These rules apply **only** when the workspace is hosted by ADT for VS Code (the SAP `SAPSE.adt-vscode` extension). They don't apply in ADT for Eclipse or when an MCP client is talking to the language server out-of-process.

- The ABAP repository is exposed as a **virtual workspace** — files don't live on local disk.
- Adjust file search to browse by directory first. Recursive content-grep over the virtual FS is unreliable.
- Add or edit source code through the VS Code editor. If a file isn't open yet, open it via the path the MCP server provides — don't try to write to local paths.
- `adt-mcp` follows whatever system VS Code is logged on to. `DS4_100_NIIF` and
  `DS4_100_TFSIN` are different landscapes that both report as `DS4` client `100` — confirm
  the active destination before any write.

---

## Testing

- Run unit tests after adding new tests or changing source code.
- Add unit tests to the `testclass` include — it's a dedicated file alongside the class.
- Use the MCP server's test-run tool (`abap_run_unit_tests` / `unitTestRun`) rather than
  asking the user to run tests manually.
- Front-end and functional testing goes through `sap-gui`. Use it to **discover** element
  ids and draft a flow, then freeze the steps and assertions into a deterministic script —
  leaving a model as the test driver keeps the run non-deterministic (L-214).

---

## Code-quality rule sets

This project keeps a local copy of [`claude-abap-skills`](https://github.com/matt1as/claude-abap-skills) under `claude-abap-skills/` for detailed rules and slash commands:

- **Clean ABAP** — naming, declarations, expressions, method shape, error handling, class structure.
  - Rules: `claude-abap-skills/clean-abap/CLAUDE.md`.
  - Commands: `/clean-abap:review`, `/clean-abap:refactor`.
- **ABAP Cloud / RAP** — RAP BO design, ATC remediation, clean-core compliance.
  - Rules: `claude-abap-skills/abap-cloud-rap/CLAUDE.md`.
  - Commands: `/abap-cloud-rap:rap-bo-design`, `/abap-cloud-rap:atc-remediation`, `/abap-cloud-rap:clean-core-check`.

Apply the plugin rule sets as defaults for any ABAP code generated or edited, not just when a slash command is invoked.

Also apply the project-specific naming convention in `docs/naming-conventions.md`. It overrides generic examples in imported rule sets when choosing names for this workspace.

Task-specific runbooks in `docs/` outrank both when they cover the object at hand:
`alv-report-standards.md`, `ddic-table-template.md`,
`rap-managed-additional-save-pattern.md`, `rap-unmanaged-web-api-pattern.md`.

---

## Out of scope — never suggest

- SAP ECC
- Classic non-Cloud ABAP development model (any release)
- Classic dynpro (SE51), screen exits, GUI status programming
- Logical databases, SAP Query, classic batch input
- Unreleased SAP APIs, function modules, classes, or CDS entities
- `SELECT` directly from SAP-owned application tables (e.g. `VBAK`, `MARA`)
- BAPI-style RFM modules where a released cloud API exists
- `FORM` / `PERFORM` routines, includes-only programs, classic exception groups
- `CALL FUNCTION ... DESTINATION` over released communication scenarios
- `$TMP` and any other local/temporary object tier

If legacy code surfaces, recognise the pattern, name it, and propose a modern Cloud-compatible alternative — don't extend the legacy pattern.

---

## Operational note — MCP timeout

The RAP generators (`x-ui-service`, `ui-service`) routinely take 60–180 s for a multi-entity BO. If your AI coding agent's MCP client has a short default tool timeout (~30 s is common), raise it to ~10 min (e.g. `MCP_TIMEOUT=600000`) when RAP generation is on the plan.
