# Backfill HHmm into every dated file name in the repo

- **Date:** 2026-09-14
- **Started:** 12:28
- **System:** DS4_100_NIIF
- **Package:** n/a — repository housekeeping, no ABAP object created or changed
- **Transport:** n/a
- **Requested by:** aster.t@fourthsignal.com

## Scope

L-502 established that a worklog file name carries a `HHmm` segment, because several activities a
day is routine here and the time is what orders them. Only one file had ever been named that way
(`2026-09-13-1514-worklog-time-and-grouping.md`); everything older kept the flat `YYYY-MM-DD-<slug>`
form. This activity backfills the time segment across the whole repository — 120 renames — and
repairs every cross-reference that pointed at an old name.

In scope: worklog `.md` files, their `evidence/<stem>/` folders (renamed in lockstep so the
folder still matches its worklog, as the working agreement requires), `docs/superpowers/plans/`
and `docs/superpowers/specs/`, the two date-suffixed `docs/dyngateway-*-2026-09-10.md` runbooks,
and the dated artifacts inside evidence folders (`registry-backup-2026-09-11.json`,
`FTR-DealCreate-OData-TestCase-2026-09-11.docx`, and six similar).

Out of scope, deliberately: the `YYYY-MM` month folders (a grouping level, not a date);
`.superpowers/sdd/` (point-in-time SDD briefs, reports and review diffs — historical records, and
their own directory names are not worklog stems); `logs/sap-gui-audit.jsonl` (append-only audit);
`graphify-out/` and `dashboard/output/` (generated); `tools/` (vendored). No SAP object was touched
and no MCP server was called.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Format `HH-MM` as first asked, or the established `HHmm`? | `HHmm` — keeps L-502, `scripts/build-dashboard.ps1` and the one already-migrated file valid; no doc or parser change needed | 2026-09-14 |
| 2 | Where does the time come from for files that never had one? | Git first-commit time, rename-aware (`git log --follow`) | 2026-09-14 |
| 3 | Git times turned out degenerate on bulk-committed days (21 files on 2026-09-08 all `2231`). Accept the ties, spread them, or invent a working day? | Keep the real commit time as the base, then increment one minute per file in git order so each file is distinct and stably ordered. Minutes after the first on a tied day are **synthetic** | 2026-09-14 |
| 4 | How wide should the rename go? | Everything dated, including evidence folders and the dated artifacts inside them | 2026-09-14 |

## Naming gate

No SAP object created. `NAMING:` lines are not applicable to this activity — the names changed here
are repository file names, governed by the working agreement's worklog naming rule (L-502), not by
`docs/naming-conventions.md`.

## Todo

- [x] 1. Inventory every tracked path carrying a `YYYY-MM-DD` (224 paths, 120 rename targets).
- [x] 2. Derive the first-commit time per path with `git log --follow` (rename-aware).
- [x] 3. Spread same-day ties by one minute, ordered by `(commit time, path)`.
- [x] 4. Resolve each evidence folder to its worklog's new stem so the pair stays matched.
- [x] 5. Apply 120 `git mv` renames, deepest path first so folder moves land last.
- [x] 6. Rewrite cross-references in live docs; leave historical and generated artifacts alone.
- [x] 7. Refresh the two now-stale comments in `scripts/build-dashboard.ps1`.
- [x] 8. Regenerate the dashboard and confirm every worklog entry reports a time.
- [x] 9. Ledger entry L-507 and this worklog.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No ABAP object created or changed |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source touched
- [x] Syntax check clean — n/a, no ABAP source touched
- [x] Activated, nothing left inactive — n/a, no ABAP source touched
- [x] ATC / Code Inspector — n/a, no ABAP source touched
- [x] ABAP Unit green — n/a, no ABAP source touched
- [x] Text symbols and selection texts maintained — n/a, none involved
- [x] Object list confirmed in the transport — n/a, no transport
- [x] 120 renames applied, 0 failures, no duplicate target names
- [x] 190 stale references rewritten across 48 files; a re-scan of the live tree finds none left
- [x] `scripts/build-dashboard.ps1` regenerates: 98 runs, every worklog entry carrying a time

## Verification

```
moved=120 failed=0
DUPLICATE TARGETS: []
files updated: 48  replacements: 190
Payload: dashboard/output/dashboard-payload.json  (98 worklog entries)
```

A re-scan for every old basename across the live tree (excluding `.superpowers/`, `logs/`,
`tools/`, `graphify-out/`, `dashboard/output/`) returns only the `before-tree.md` / `after-tree.md`
snapshots and the narrative lines of `2026-09-14-1209-repo-layout-realignment.md` — all three are
records of the *earlier* layout move and describe paths as they were at that time, so they are
correctly left unrewritten.

## Known issue found, not fixed

`scripts/build-dashboard.ps1` claims to skip `evidence/` folders but picked up
`evidence/2026-09-14-1209-repo-layout-realignment/{before,after}-tree.md` as two worklog runs with
a null date and null time. This is a pre-existing scanner bug, unrelated to the rename — it was
exposed because that activity's evidence happens to be markdown. Not touched here; it belongs to
whoever owns that activity.

## Evidence

The rename plan (`old<TAB>new`, 120 rows) is reproducible from git at any time and was not
committed as a separate artifact; the renames themselves are the evidence and are visible as
`R` entries in `git status`.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-507.
