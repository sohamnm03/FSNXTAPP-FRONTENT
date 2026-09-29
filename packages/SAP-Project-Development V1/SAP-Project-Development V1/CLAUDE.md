# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# SAP Project Development

Control plane for an SAP S/4HANA system. **No ABAP source lives here** — the objects are on
`DS4` client `100` and are reached over MCP. Nothing builds, lints or tests locally.
Shared with Codex/Copilot/Cursor, which read `AGENTS.md`.

## Non-negotiables

1. **Naming gate is pre-create.** Validate against `docs/naming-conventions.md`, record
   `NAMING: <name> -> matches <pattern row | exception row>` **before** the create call, stop and
   ask on a mismatch. Copies and generator-suggested names get the same gate — never inherit a
   non-conformant name.
2. **No `$TMP`, no throwaway tier.** Every object goes in a real `ZFS*` package on a transport (L-215).
3. **Never create an object the human didn't ask for** — no helper, runner, test or scratch objects,
   however convenient. If the task can't be done with the requested objects, **stop and report**
   what is blocked and why (L-216).
4. **Messages only from `ZFS_TRM_MSG`** — never a text symbol, an inline literal, or another class (L-210).
5. **Text elements and transaction codes are the two named exceptions** to "never create by any
   route": both may be created/maintained via the `sap-gui` automation script in
   `docs/sap-gui-object-automation.md` — SE38 for text elements, SE93 for tcodes — and nothing else.
   Every other object still follows rule 6 unchanged; ADT/`setObjectSource` still cannot touch text
   elements (L-211/L-229).
6. **Routing is per object: `adt-mcp` creates, `mcp-abap-abap-adt-api` changes** — except text
   elements and transaction codes, created only via the `sap-gui` script (L-212/L-229).
7. **Draft on a RAP BO needs human confirmation** — never add, remove or accept draft (incl. a
   generator turning it on) on my own judgement; ask, and record the answer (L-224).
8. **Every activity: a `worklog/<system-id>/` file + a ledger entry in the same turn** (L-200/L-234).
9. Released APIs only · `ZFS` namespace · RAP for new transactional behavior · CDS over SQL on
   SAP-owned tables · modern syntax, class-based exceptions.

## Index — read before doing

`lessons/lessons-ledger.md` outranks `docs/` wherever they disagree. The `L-nnn` notes below are
the trap you'd otherwise hit; the ledger entry has the full context.

| Doing this | Read | Watch for |
|---|---|---|
| **Anything** | `lessons/lessons-ledger.md`, `worklog/_TEMPLATE.md` | Ledger entry in the same turn as the instruction |
| Naming any object | `docs/naming-conventions.md` | `ZFS_TRM_MSG` is a listed exception — don't "correct" it |
| ALV / executable report | `docs/alv-report-standards.md` | Ask Pattern A vs B, recommend B (L-202/203) · activate program + all includes in **one** `activateObjects` call (L-209) · no GUI status is creatable from ADT, omit the callback (L-204) |
| Transparent table | `docs/ddic-table-template.md` | The 5 audit fields are mandatory — without them the RAP generators silently emit no ETag and no lock (L-218) · two-step build: `adt-mcp` skeleton, then fields via `setObjectSource`; use `key mandt : mandt` (L-217) |
| RAP managed BO | `docs/rap-managed-additional-save-pattern.md` | Generators upper-case your CDS names — use the returned `generatedObjects` for every follow-up call (L-219) · `publishServiceBinding` reports success without publishing — **publish with `scripts/sap-gui-publish-service.py --group-id <binding> --yes`**, the standard step now, not a fallback (L-220/L-232) · **draft: ask first**, incl. the generator's draft-table suggestion (L-224) |
| RAP unmanaged BO | `docs/rap-unmanaged-web-api-pattern.md` | A saver class is expected even for plain unmanaged · publish the same way, via `scripts/sap-gui-publish-service.py` (L-232) · **draft: ask first** (L-224) · lock object name still hits the 16-char cap even mirroring a full-length table name (L-242) · never copy a sibling BO's raw `SELECT col, col, ... INTO @wa` column list without re-deriving order from *this* table (L-243) |
| CDS view entity (plain or RAP root) | — | `ignorePropagatedAnnotations: true` drops `@Semantics.amount.currencyCode`/quantity refs on passthrough fields — restate per field (L-239) · `define view entity` refuses a classic DDIC `VIEW` as a source — use the released `I_*` replacement instead (L-240) · a `where` clause goes **after** the `{ }` field list, not before it (L-241) |
| **Calling the dynamic gateway v2** (`ZFS_SB_DYNGW_O4_API`, package `ZFS_DYN_GW`) | **`docs/dyngw-v2-integration-guide.md` first**, then `docs/dyngw-v2-api.md` for the field-by-field contract, and `docs/dyngw-v2-how-it-works.md` for the architecture and the proved-vs-unproven ledger of what this rebuild does and does not close | Six actions (`RunQuery`/`CallFunctionModule`/`ExecuteTableCrud`/`SubmitReport`/`RegisterTarget`/`ExecuteBatch`), five step kinds, all against `CallLog`/`CallStep`/`Registry`/`RegistryHistory` · self-protection (target names matching `ZFS_T_DYN_*`/`ZFS_RFC_DYN_*` refused with **039**) closes v1's privilege-escalation hole, proved live · the L-350 rollback rebuild (`ZCL_FS_DYN_DISPATCH`) **is proved end to end** — **L-496 (2026-09-13) proved phase-2 abort/rollback live**, with a positive control (the identical write run alone, uncommitted, to confirm the empty table after an abort means "rolled back," not "never wrote") — a plain primary-key `TABL` collision still does not exercise it (partial-write success, message 048, not a refusal); use a secondary-unique-index collision instead · `ZFS_DYNGW` authorization object (`ACTVT`/`ZDYNKIND`/`ZDYNTGT`) restricting a real restricted user is **built but unproven** — no restricted user exists yet, an agent may not create one · `ZDYNTGT` must be maintained as single values only, never a range spanning `*` (interval evaluation brackets the literal `*`) · `/CallLog` needs full `ZDYNTGT` scope, `/CallStep` can be genuinely restricted, so a target-scoped auditor sees steps but an empty call log · a batch mixing an out-of-LUW step with an in-LUW write step is refused in phase 1 — out-of-LUW means `SUBM` **and** a `FUNC` step in call mode `R`, which is the DEFAULT for any remote-enabled FM because a blank `CALL_MODE` falls back to `TFDIR-FMODE` (L-492); set the registry row's `CALL_MODE` to `L` to bring a `FUNC` step inside the batch's transaction · every `FUNC` target must be registered `AllowWrite: true` even when the FM is read-only — deferred known limit, fails closed (L-491) · `CommitMode` `ALWAYS`/`AUTO` are currently synonyms · deep action parameters (a real nested composition) don't work on this release, hence the `StepsJson` string fallback · **watch-list addition (2026-09-15): server-side field generators** (`GenerateJson` on `ExecuteTableCrud`/`TABL` steps — UUID, number range, audit-field generation; `IsCommitted`/`IsRolledBack` now exposed on every action result; messages 050–054) — **proved live**, 12 of 14 acceptance criteria passed (11 outright, 1 after a live fix), 2 failed, **except**: a generated number range value is **not** reliably outside rollback on this system, contradicting the original design's unconditional claim (L-519), and `ExecuteTableCrud MODIFY` is a full-row replace that silently blanks every column (including create-audit fields) a caller's payload omits (L-520, undecided, not fixed) — see `docs/dyngw-v2-api.md`/`docs/dyngw-v2-how-it-works.md` for the corrected account |
| Calling the dynamic gateway **v1** (`ZFS_SB_DYNGATEWAY_O4_API`) — **superseded by v2 above, still running, not decommissioned** | **`docs/dyngateway-integration-guide.md` first** (URLs, JSON nesting, templates, acceptance suite), then `docs/dynamic-gateway-api.md` for the field-by-field contract, worked examples in `docs/dyngateway-live-test-2026-09-10-1520.md` and `docs/dyngateway-submit-2026-09-10-1520.md` | One endpoint, four actions and **five step kinds** — `FUNC`/`TABL`/`QURY`/`SUBM`/`REGI`; `ExecuteBatch` runs many steps in one call, and `SUBM` (run an executable report) exists **only** as a batch step · use capture mode `SALV` for any ALV report, it covers `REUSE_ALV` as well as `cl_salv_table` and is cheaper (L-330) · **qualify a `SUBM` target before registering it** — a `CL_GUI_*` reference in `WBCROSSGT` is a hard disqualifier and an `OBLIGATORY` select-option must be supplied (L-321/L-329/L-331) · nothing runs unless registered in `ZFS_T_SLC_DYNGW` · a refusal is HTTP 200 with `ExecStatus='E'`, not an HTTP error · an aborted batch returns 400, now **with** a reason in the body · **an aborted batch does NOT roll its writes back** — the durable log's RFC implicitly commits the caller's LUW (L-350) · an FM's **output-only** `TABLES` param must be sent as `[]` or its content never comes back (L-314) · `RunQuery` refuses fields that live in a DDIC `.INCLUDE`, and the all-columns default breaks on such tables — always send `FieldsJson` (L-316) · a **creating BAPI needs `ExecuteBatch` + `CommitMode`**; `CallFunctionModule` never commits, and `ExecStatus='S'` only means the dispatch worked — parse `RETURN` (L-317) · the allow-list rows are **`deliveryClass #A` application data and do not travel with the transport** — a freshly imported system answers `017` to everything until targets are registered on it (L-335), which is what the **`REGI`** step kind is for: one `ExecuteBatch` provisions a whole system, and a later step in the same batch may use a target an earlier `REGI` declared (L-344) · the `*Json` fields nest JSON **two** levels deep single-shot and **three** inside a batch step; build innermost-first and let the serialiser escape — `022` cannot tell you which level broke (L-335) |
| Publishing any RAP service binding | `docs/sap-gui-object-automation.md` Script 3 | `scripts/sap-gui-publish-service.py --group-id <binding> --yes` — its `"ok"` result is the verification, no separate `fetch_services` needed (L-232) · "Get Service Groups" may first demand a non-blank System Alias (F4 → pick `LOCAL`) before it will list anything (L-246) |
| Live OData smoke test (PowerShell) | — | CURR/DEC fields must be unquoted JSON numbers, not strings (L-244) · **run sandboxed first** — `POST`/`PATCH`/`DELETE` reach the SAP host fine, and `dangerouslyDisableSandbox` is refused by the auto-mode classifier, so L-245's workaround is obsolete (L-318) · PowerShell 5.1 `ConvertTo-Json` collapses a 1-element array to an object and the gateway then answers `Invalid JSON` — build arrays by hand (L-315) · `sap-client=100` on **every** URL, ADT REST included, or you get a 401 that looks like a bad password (L-253/L-325) |
| Any `MESSAGE` | `docs/message-catalog/<system-id>.md` | One catalog file per system (L-234); don't query `T100` routinely; next free number is in the catalog |
| Connections, MCP setup | `docs/sap-systems.md`, `docs/abap-mcp-setup.md` | `.mcp.json` is generated — never hand-edit |
| Driving screens / t-codes | `docs/sap-gui-mcp-setup.md` | `sap_connect` returning `ok` ≠ logged on — read `user` from `sap_get_session_info` (L-213) · prefer `sap_connect_existing` |
| Text elements / tcode creation via sap-gui | `docs/sap-gui-object-automation.md` | Only these two object categories may be created via `sap-gui`, only via that script (L-229) |
| ABAP style, RAP design | `claude-abap-skills/{clean-abap,abap-cloud-rap}/CLAUDE.md` | Plugins: `/clean-abap:review`, `/clean-abap:refactor`, `/abap-cloud-rap:{rap-bo-design,atc-remediation,clean-core-check}` |

## Working agreement (standing, 2026-08-16)

**1 · Lessons.** Every instruction the human asks to be noted, every correction to how work is
done, and every non-obvious platform behaviour found while building becomes an `L-nnn` entry in
`lessons/lessons-ledger.md` — **written in the same turn**, not at the end of the task. Append-only:
never renumber or delete; supersede with a new entry plus a `Superseded by L-nnn` line. New entries
start at **L-200** (L-013…L-198 are reserved — see the ledger's *Inherited* table).

**2 · Worklog.** Every activity opens
`worklog/<system-id>/<YYYY-MM>/YYYY-MM-DD-HHmm-<slug>.md` from `worklog/_TEMPLATE.md` (the template
itself stays at the `worklog/` root, shared across systems), carrying scope, open questions,
`NAMING:` lines, numbered todos, object list and delivery checks. `HHmm` is the 24h local start
time — several activities a day is normal here, and the time is what orders them (L-502).
`<system-id>` matches `config/sap-systems.json` `systems[].id` (e.g. `DS4_100_NIIF`) — worklogs are
per-system because the objects, transports and open questions they record only make sense against
one system (L-234). Keep it current — it is the handover artifact between sessions. Drive
`TodoWrite` in parallel when exposed; the file is the durable copy and is required either way.

**2a · Evidence.** Screenshots, transcripts, payload dumps and exported reports go in
`worklog/<system-id>/<YYYY-MM>/evidence/<worklog stem>/` — one folder per activity, named exactly
like its worklog file minus `.md` — and are **committed**, not gitignored. Never drop an artifact
loose in the system folder. The old top-level `evidence/<system-id>/` root is retired (L-502).

**3 · Messages.** `ZFS_TRM_MSG` is the only message class for all new development. Pick from
`docs/message-catalog/<system-id>.md`, the local mirror for that system — message numbers are
per-system state, so never reuse a number across systems (L-234). Do **not** query `T100` for
routine lookups. If nothing fits: create the message on the system, add it to that system's
catalog file **in the same turn**, and list every
created message (number, type, text) in the completion report. If a system read contradicts the
catalog, the system wins — fix the catalog and note it in the ledger. `ZFS_TEST_VS` is superseded
history: readable, never extended.

**4 · Text elements.** Never create or modify text symbols, selection texts or list headings via
ADT, `INSERT TEXTPOOL`, or a helper class. The one sanctioned route is `sap-gui` screen automation
through `docs/sap-gui-object-automation.md` (SE38 Text Elements), on record as a named exception
since 2026-08-22 (L-229) — anything outside that script still defaults to the completion report
listing what the human must maintain: program, text ID and key (e.g. `TEXT-b01`, selection text
`S_BUKRS`), proposed wording, max length. Text symbols still belong in the *source* for screen
furniture (block titles, grid title, headers) — this is about *maintenance* of the text pool.
Messages never go here; they come from `ZFS_TRM_MSG`.

**5 · Routing.** `adt-mcp` creates, `mcp-abap-abap-adt-api` changes — per object, including anything
created mid-task, with no carve-out and no drifting to whichever server is already open. Falling back
to `mcp-abap-abap-adt-api` for a *creation* is legitimate only when `adt-mcp` genuinely cannot do it
(unsupported type, hard tool error) — and the reason goes in the worklog. Confirmed case: message
classes (`MSAG/N`), for which `adt-mcp` has no adapter. **Transaction codes are a second confirmed
case** — neither ADT server supports `TRAN/T` creation at all — routed instead to `sap-gui`
(SE93) via `docs/sap-gui-object-automation.md`, not to `mcp-abap-abap-adt-api` (L-229).

**6 · No invented objects.** Being able to build a workaround is not authorisation to build it. A
blocked step reported honestly is the correct outcome; an unrequested object on the system is not.

## MCP servers

| Server | Use for |
|---|---|
| `adt-mcp` | **Creation** of any object · activation · transports · ATC · ABAP Unit · RAP generators. No read-source, no search. |
| `mcp-abap-abap-adt-api` | **Changes** to existing objects · **all reads**: `getObjectSource`, `searchObject`, `nodeContents`, `usageReferences`, `tableContents`, `runQuery`. Check connectivity with `healthcheck`/`adtDiscovery` — its `login` tool has a serialization bug. |
| `sap-gui` | **Screens**, not objects: running t-codes, selection screens, reading an ALV, functional testing — **plus two named exceptions** (L-229): text-element maintenance (SE38) and transaction-code creation (SE93), both only via `docs/sap-gui-object-automation.md`. Bound to `DS4_100_NIIF` (SAP Logon "NIIF - Development"). Never edit ABAP source with it. Confirm `DS4`/`100` before any write — the Logon Pad also holds two production entries. |

No read-only third-party server (ARC-1 or similar) is configured; ignore references to `arc-1` in
older docs (L-222). If no server can read the source, ask for it pasted — never invent source,
object names, ATC findings or release states.

`adt-mcp` follows the VS Code ADT logon and cannot distinguish `DS4_100_NIIF` from `DS4_100_TFSIN`
(different landscapes, same SYSID and client). Confirm the active destination, or use the pinned
`abap-adt-ds4-100-tfsin`. `DS4_100_TFSIN` is currently disabled with an unverified URL.

## Commands

Verification (syntax, activation, ATC, ABAP Unit) runs **on SAP** via MCP, never locally. The only
local commands wire the servers up:

```powershell
# After editing config/sap-systems.json — regenerates .mcp.json + enabledMcpjsonServers
powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1

# Validate the registry and report drift without writing. Exits 1 on an error or a
# missing password, and prints the bootstrap commands if tools\ is not installed.
powershell -ExecutionPolicy Bypass -File scripts\sync-sap-systems.ps1 -Check
```

Restart Claude Code after a sync — MCP servers are read only at startup.
For RAP generator work start with `MCP_TIMEOUT=600000 claude`; a multi-entity BO takes 60–180 s.

## Workspace map

| Path | Role |
|---|---|
| `AGENTS.md` | Canonical rules for **all** agents; `.github/copilot-instructions.md` and `.cursor/rules/` defer to it. Change a standing rule there too, or the workspace becomes agent-dependent (L-221). |
| `lessons/lessons-ledger.md` | Append-only `L-nnn` corrections and gotchas. Outranks `docs/`. |
| `worklog/<system-id>/<YYYY-MM>/` | One file per activity, grouped by system then month; the session-to-session handover. Evidence in a sibling `evidence/<worklog stem>/`. |
| `docs/` | Runbooks written from builds that already happened. |
| `config/sap-systems.json` | The only hand-edited connection truth. |
| `tools/`, `claude-abap-skills/` | Vendored MCP servers (gitignored) and rule-set copies. |

```
config/sap-systems.json ──scripts/sync-sap-systems.ps1──▶ .mcp.json  (generated, never hand-edit)
                                                       └─▶ .claude/settings.local.json
```

Secrets never enter the registry: a system names its `adt.passwordEnvVar`, the generated `.mcp.json`
holds only `${VAR}`, and the value lives in the gitignored `settings.local.json` `env` block. Server
names are derived — **`mcp-abap-abap-adt-api` is hardcoded for the default system** because the
routing rules depend on it; other systems get `abap-adt-<sysid>-<client>`. The `adt-mcp` entry is
hand-managed and preserved verbatim by the script.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
