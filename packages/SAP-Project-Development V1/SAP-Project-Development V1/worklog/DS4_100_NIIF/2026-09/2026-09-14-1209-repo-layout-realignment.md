# Repository layout realignment — root clutter, tool output, README

- **Date:** 2026-09-14
- **Started:** 12:09
- **System:** n/a — workspace housekeeping only, no SAP object touched
- **Package:** n/a
- **Transport:** n/a
- **Requested by:** aster.t@fourthsignal.com

## Scope

Realign the repository's files and folders to standard practice **without deleting anything**.
In scope: root-level clutter, untracked-vs-tracked correctness of generated/tool output, a real
root `README.md`, an `.editorconfig`, and a tightened `.gitignore`.

**Explicitly out of scope** (decided with the human, 2026-09-14):

- Regrouping `docs/` into subfolders. 474 path references to `docs/*.md` exist across 102 files,
  53 of them historical worklogs and ledger entries. Renaming would either break them or force a
  rewrite of records-of-record. The flat `docs/` stays.
- `.superpowers/` — a tool-managed SDD workspace (`scripts/sdd-workspace` writes it and maintains
  a self-ignoring `.gitignore` containing `*`). Already 0 files tracked. Moving it would break the
  skill's path contract for no benefit. Left in place. `docs/superpowers/{plans,specs}` already
  holds the curated outputs and is correct.
- No SAP object created, changed, activated or transported.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | How deep should the realignment go, given the 474 cross-references? | Clean + README, keep every `docs/` path unchanged | 2026-09-14 |
| 2 | `cookies.txt`/`headers.txt` carry a live `SAP_SESSIONID_DS4_100` and CSRF token for `vhnlqds4ap01.sap.niififl.in` — how to handle? | Untrack + gitignore; keep the files on disk. History is **not** rewritten; the DS4 dev session ID from 2026-08-22 is long expired | 2026-09-14 |

## Naming gate

No SAP object created — the naming gate does not apply. Repository paths only.

## Todo

- [x] 1. Survey the tree; quantify cross-references before proposing any move
- [x] 2. Confirm depth and credential handling with the human
- [x] 3. Open this worklog
- [x] 4. Route the 4 `response_*.json` root artifacts into the evidence folder of the worklog that produced them
- [x] 5. Untrack + gitignore `cookies.txt` / `headers.txt`, move them beside the same evidence
- [x] 6. Move `.playwright-mcp/` raw tool output to `logs/playwright-mcp/` (already gitignored); keep the 2 curated PNGs as real evidence
- [x] 7. Untrack `graphify-out/cache/` (regenerable AST cache), keep the report/graph outputs tracked
- [x] 8. Write a root `README.md`
- [x] 9. Add `.editorconfig`
- [x] 10. Tighten `.gitignore`
- [x] 11. Ledger entries in this same turn
- [x] 12. Verify: nothing deleted, no broken reference, `git status` clean of stray root files

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP object touched |

## Delivery checks

Not applicable — no ABAP was written, so Pretty Printer, syntax check, activation, ATC and ABAP
Unit have nothing to run against. The equivalent checks for this activity:

- [x] Every moved file still exists on disk (nothing deleted)
- [x] `git status` shows moves as renames, not delete+add
- [x] No reference in `CLAUDE.md`, `AGENTS.md`, `.github/`, `.cursor/`, `scripts/` or `docs/` broken
- [x] Root holds only files that belong at root

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-14-1209-repo-layout-realignment/` — before/after
tree listings and the reference-integrity check output.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-505, L-506

## Outcome

Tracked files **488 → 324**. All 164 removals are untrackings of regenerable or sensitive
content; **not one file was deleted from disk** (verified per bucket in `after-tree.md`).

| Change | Detail |
|---|---|
| Root cleared | 6 curl artifacts → `worklog/DS4_100_NIIF/2026-08/evidence/2026-08-22-rap-user-provisioning-api/`. Root now holds 14 entries, all load-bearing. |
| Credentials untracked | `cookies.txt`, `headers.txt` — `git rm --cached` + `**/` gitignore patterns. History deliberately not rewritten (see open question 2). |
| Tool output relocated | 146 browser-MCP dumps → `logs/playwright-mcp/` (gitignored). The 2 real screenshots went to `evidence/2026-09-08-tf-manage-console-scaffold/` instead, as curated evidence. |
| Cache untracked | `graphify-out/cache/` (16 AST files). The graph outputs `GRAPH_REPORT.md`, `graph.json`, `graph.html`, `manifest.json` stay tracked — CLAUDE.md requires them on a fresh clone. |
| Added | `README.md` (root orientation, previously absent), `.editorconfig`. |
| Root cause fixed | `docs/dyngateway-integration-guide.md` §curl told readers to run `curl -c cookies.txt` in the working directory — exactly how the leak happened. Now uses a `mktemp` jar with a `trap` cleanup, plus a note that a cookie jar and header dump are credentials. |
| Graph refreshed | `graphify update .` re-run; the manifest still listed the old root paths. 210 nodes, 335 edges, 19 communities. |

### Deliberately not done

- **`docs/` was not regrouped into subfolders.** 474 references across 102 files, 53 of them
  historical worklogs and ledger entries. Every `docs/*.md` path is unchanged, so nothing broke.
- **`.superpowers/` was left alone.** It is a tool-managed SDD workspace with its own
  self-ignoring `.gitignore` (`*`) and 0 files tracked. Moving it would break the skill's path
  contract for no benefit.
- **Git history was not rewritten** for the leaked session ID — the human's call, recorded in
  L-506 with the reasoning so it is not later mistaken for an oversight.
- Nothing was committed. The working tree carries the change for review.
