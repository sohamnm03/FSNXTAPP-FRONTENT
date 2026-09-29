# Reorganize worklog and message catalog per SAP system

- **Date:** 2026-08-22
- **System:** DS4_100_NIIF | DS4_100_TFSIN
- **Package:** n/a — repository structure only, no SAP objects touched
- **Transport:** n/a
- **Requested by:** human ("keep the files organized per system" — message catalog and worklog
  called out as system-specific)

## Scope

Repository-organization task only, no ABAP objects created or changed. Partition the two
artifacts the human flagged as system-specific — `worklog/` and `docs/message-catalog.md` — into
one subfolder/file per SAP system (`config/sap-systems.json` `systems[].id`), and update every
doc that cites their old flat paths. Out of scope: `lessons/lessons-ledger.md` (kept as a single
workspace-wide ledger — lessons are about workflow/tooling, not tied to one SAP instance) and
`docs/naming-conventions.md`/other runbooks beyond the one message-catalog path reference.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Split fully per-system now, or leave as-is since only one system is enabled? | Organize per-system now (folders keyed by `system-id`), even though `DS4_100_TFSIN` is currently disabled — the structure should be ready for it | 2026-08-22 |

## Naming gate

No new SAP objects — naming gate not applicable.

## Todo

- [x] 1. Move the 9 existing `worklog/*.md` files into `worklog/DS4_100_NIIF/` (all were built
      against that system); leave `_TEMPLATE.md` at the `worklog/` root.
- [x] 2. Move `docs/message-catalog.md` to `docs/message-catalog/DS4_100_NIIF.md`; add
      `docs/message-catalog/README.md` indexing per-system files.
- [x] 3. Fix cross-references between moved worklog files that pointed at the old flat paths.
- [x] 4. Update `CLAUDE.md` (non-negotiable 8, index table, working agreement §2/§3, workspace map).
- [x] 5. Update `AGENTS.md` standing agreements §2/§3.
- [x] 6. Update `.github/copilot-instructions.md` and `docs/naming-conventions.md` message-catalog
      path references.
- [x] 7. Record L-234 in the lessons ledger.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP objects; repository files only |

## Delivery checks

- [ ] Pretty Printer — n/a
- [ ] Syntax check clean — n/a
- [ ] Activated, nothing left inactive — n/a
- [ ] ATC / Code Inspector — n/a
- [ ] ABAP Unit green — n/a
- [ ] Text symbols and selection texts maintained — n/a
- [x] Every reference to the old `worklog/*.md` and `docs/message-catalog.md` paths in
      `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `docs/naming-conventions.md`,
      and within the worklog files themselves has been updated to the new per-system paths.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-234
