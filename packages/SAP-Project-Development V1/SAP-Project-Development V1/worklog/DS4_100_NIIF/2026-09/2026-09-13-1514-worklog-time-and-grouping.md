# Worklog file naming: add a time, group by month, consolidate evidence

- **Date:** 2026-09-13
- **Started:** 15:14
- **System:** DS4_100_NIIF
- **Package:** n/a — repository convention and tooling only, no SAP objects touched
- **Transport:** n/a
- **Requested by:** human ("for worklog or evidence file name with addition to the date capture
  the time also and see you can group it also better")

## Scope

Change how worklog and evidence files are named and laid out, and migrate everything already on
disk to the new shape. Worklog files gain a 24h `HHmm` start time in the name and move into
`<YYYY-MM>/` month folders; evidence moves next to the worklog that produced it, in a folder named
after that worklog's stem, and the duplicate empty `evidence/<system-id>/` root at the repo top is
retired. `scripts/build-dashboard.ps1`, `dashboard/template.html`, `worklog/_TEMPLATE.md`,
`CLAUDE.md` and `AGENTS.md` follow.

Out of scope: back-filling times onto the 94 migrated files (a commit timestamp is not a start
time), and any change to what a worklog *contains* beyond the new `Started:` field and `Evidence`
section.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | How deep should the grouping go — month folders, day folders, or stay flat? | Month folders: `worklog/<system-id>/<YYYY-MM>/` | 2026-09-13 |
| 2 | Migrate the 94 existing worklogs, or apply the convention to new files only? | Migrate all with `git mv`; existing files keep their date-only stem, no invented times | 2026-09-13 |
| 3 | Should evidence be gitignored, as `dashboard/README.md` claimed, or committed? | Committed — 108 evidence files were already tracked; the ignore rule was an unanchored `evidence/**` that would have silently swallowed every *new* one | 2026-09-13 |

## Naming gate

No SAP objects — the naming gate does not apply. The repository file convention set here is
recorded in L-502 instead.

## Todo

- [x] 1. Move all 94 worklog `*.md` into `worklog/DS4_100_NIIF/<YYYY-MM>/` with `git mv`
- [x] 2. Move the six `evidence/<date-slug>/` folders into their month folder's `evidence/`
- [x] 3. File the nine loose artifacts (docx/json/txt) from the system root into the evidence
      folder of the activity that produced each one
- [x] 4. Repoint every reference to the old paths across `docs/`, `lessons/`, `worklog/`,
      `dashboard/` (26 files)
- [x] 5. Retire the empty top-level `evidence/DS4_100_NIIF/` and remove the unanchored
      `evidence/**` ignore rule; update `dashboard/README.md`
- [x] 6. `scripts/build-dashboard.ps1`: recurse into month folders, skip `evidence/`, parse the
      optional `HHmm` into a `time` field, emit the month in `worklogPath`/`worklogUrl`
- [x] 7. `dashboard/template.html`: show the time under the date, tie-break the sort on it, add it
      to the drawer title
- [x] 8. `worklog/_TEMPLATE.md`: target-path header comment, `Started:` field, `Evidence` section
- [x] 9. `CLAUDE.md` §2 + workspace map, `AGENTS.md` rule 2
- [x] 10. L-502 in `lessons/lessons-ledger.md`
- [x] 11. Rebuild the dashboard and verify 93 entries with month-qualified paths

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP objects; repository convention and tooling only |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source
- [x] Syntax check clean — n/a, no ABAP source
- [x] Activated, nothing left inactive — n/a
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit green — n/a
- [x] Text symbols and selection texts maintained — n/a
- [x] `scripts/build-dashboard.ps1` runs clean: 93 entries, every `worklogPath` month-qualified,
      `time` null on migrated entries
- [x] No dangling references to the old paths (`grep` over `docs/`, `lessons/`, `worklog/`,
      `dashboard/`, `scripts/`, `CLAUDE.md`, `AGENTS.md` returns nothing)
- [x] Nothing loose left in `worklog/DS4_100_NIIF/` — only the two month folders

## Evidence

None — the migration's evidence is the git history of the moves themselves and the rebuilt
dashboard, which is gitignored output.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-502
