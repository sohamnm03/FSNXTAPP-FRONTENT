# CLAUDE.md refresh and agent rule-file sync

- **Date:** 2026-08-16
- **System:** n/a — repository documentation only, nothing created on SAP
- **Package:** n/a
- **Transport:** n/a
- **Requested by:** human (`/init` with "share me the plan and suggestion before changes")

## Scope

Rewrite `CLAUDE.md` so a cold instance is productive without reading the whole repo:
add an orientation section (this workspace holds no ABAP source — it drives one through
MCP), a commands section, and a short "known platform boundaries" section citing `L-nnn`
rather than restating the ledger. All six standing Working Agreement sections are kept
**verbatim** — they are human-issued and not mine to reword.

Then remove the dual-agent contradiction: `AGENTS.md` is still the unfilled upstream
template (target system `TODO`, generic per-capability MCP routing, no knowledge of the
standing agreements) while `CLAUDE.md` states the opposite. `AGENTS.md` becomes the
canonical workspace-wide rule file; `.github/copilot-instructions.md` is reduced to a
short pointer at it instead of a byte-identical copy.

**Out of scope** (human chose scope option 1 of 3): the three drifted lines in
`worklog/_TEMPLATE.md`, and the repo-wide mojibake re-encode of `.github/**` and
`.cursor/rules/*.mdc`. Both are recorded below as known-open so the next session does not
have to rediscover them. No SAP object is created, changed or read in this activity.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | How far to take the pass? | Scope option 1 — `CLAUDE.md` + `AGENTS.md` + `.github/copilot-instructions.md`. | 2026-08-16 |
| 2 | Relationship between `AGENTS.md` and the Copilot file? | `AGENTS.md` canonical; the Copilot file defers to it. | 2026-08-16 |

## Naming gate

Not applicable — no SAP object is created in this activity.

## Todo

- [x] 1. Read the workspace: rule files, docs, ledger, registry, sync script, worklogs
- [x] 2. Share findings and the proposed shape before changing anything
- [x] 3. Open this worklog
- [x] 4. Rewrite `CLAUDE.md`
- [x] 5. Rewrite `AGENTS.md` — fill the target system, replace the MCP-server section with
      the per-object routing rule, add the standing agreements and `sap-gui`
- [x] 6. Reduce `.github/copilot-instructions.md` to a pointer at `AGENTS.md`
- [x] 7. Record the lessons raised in `lessons/lessons-ledger.md`
- [x] 8. Report the known-open items left by the chosen scope
- [x] 9. **Trim `CLAUDE.md` to an index-led shape** (human instruction, second pass) — 292 → 135
      lines, no rule clause dropped; boundaries moved onto Index rows instead of a section (L-223)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `CLAUDE.md` | repo file | n/a | n/a | rewritten |
| `AGENTS.md` | repo file | n/a | n/a | rewritten |
| `.github/copilot-instructions.md` | repo file | n/a | n/a | replaced with a pointer |
| `lessons/lessons-ledger.md` | repo file | n/a | n/a | L-221, L-222, L-223 appended |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP
- [x] Activated, nothing left inactive — n/a, nothing on the system
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit — none applicable, no ABAP object touched
- [x] Text elements — none; nothing to hand to the human (agreement §4)
- [x] Messages created in `ZFS_TRM_MSG` — none
- [x] Object list confirmed in the transport — n/a
- [x] `AGENTS.md` and `CLAUDE.md` agree on target system, MCP routing and the agreements
- [x] New files written as UTF-8 without BOM

## Known open after this activity

1. `worklog/_TEMPLATE.md` still says *"Text symbols and selection texts maintained"* as a
   delivery check, which contradicts agreement §4 (never maintain them — report them). It
   also has no line for messages created in `ZFS_TRM_MSG` (§3) and no line for an MCP
   routing deviation reason (§5 / L-212). This file's own checklist above shows the
   corrected shape.
2. `AGENTS.md`, `.github/**` (5 prompts, 3 instruction files) and `.cursor/rules/*.mdc`
   were double-encoded UTF-8 with a BOM — em dashes render `â€"`. `AGENTS.md` and
   `.github/copilot-instructions.md` are fixed by being rewritten here; the other **8
   files are still mojibake**.
3. `arc-1` was cited by `CLAUDE.md` as the read path but is not in `.mcp.json`. Removed
   from `CLAUDE.md`; `docs/abap-mcp-setup.md` §"Optional — add a read-capable MCP (ARC-1)"
   and `.github/instructions/abap-cloud-rap.instructions.md` still describe it as if
   present.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-221, L-222, L-223.
