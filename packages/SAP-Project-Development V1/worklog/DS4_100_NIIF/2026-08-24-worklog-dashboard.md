# Worklog activity dashboard

- **Date:** 2026-08-24
- **System:** DS4_100_NIIF
- **Package:** n/a — repository tooling only, no SAP objects touched
- **Transport:** n/a
- **Requested by:** human ("refer the dashboard template and logo and evidence in
  SAP-Testing-Automation and build it in this project the same way")

## Scope

Port the results-dashboard pattern from the sibling `SAP-Testing-Automation` project
(`dashboard/template.html` + `scripts/build-dashboard.ps1`, scanning markdown files by
convention and rendering a self-contained HTML dashboard) into this repo, adapted to what this
repo actually produces: development activity in `worklog/<system-id>/*.md`, not test runs.

One dashboard entry per worklog file. Panels: hero completion rate, entries-by-status trend,
objects-by-type ranking (from each file's Object list table), a worklog table with a detail
drawer rendering the full file. Filters: Date, System, Object type. New `evidence/<system-id>/`
folder (gitignored) for SAP GUI screenshots, referenced from worklogs by plain relative link —
no embedding, no build-script logic detecting or validating the links.

Out of scope: lessons-trend chart, object-lifecycle funnel (nothing here has a create→settle→post
document lifecycle the way TRM deals do in the reference project), image embedding for evidence.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | What should the dashboard's main unit/row be? | One row per worklog entry — system, date, objects, todo/delivery-check completion, lessons raised, transport | 2026-08-24 |
| 2 | Should the project get an `evidence/<system-id>/` screenshot folder, and how should worklogs link to it? | Yes, plain gitignored folder + manual relative links only; no embedding or drawer-rendering logic | 2026-08-24 |
| 3 | What branding should the dashboard header use? | Reuse the identical base64 logo embedded in the reference project's `template.html` | 2026-08-24 |
| 4 | Keep a separate `docs/superpowers/specs/` design doc, or fold the design into this worklog entry? | Fold into this worklog entry; drop the separate spec file — this repo's worklog + lessons-ledger process already serves that purpose (L-235) | 2026-08-24 |

## Naming gate

No new SAP objects — naming gate not applicable.

## Todo

- [x] 1. Remove `docs/superpowers/specs/2026-08-24-worklog-dashboard-design.md` (folded into
      this file)
- [x] 2. Add `scripts/lib-markdown.ps1` (`$DASH` + `Get-Field`, ported from the reference project)
- [x] 3. Add `dashboard/template.html` (ported UI — same logo/CSS/JS shell, re-pointed at worklog
      fields instead of test-run fields)
- [x] 4. Add `scripts/build-dashboard.ps1` (scans `worklog/<system-id>/*.md`, builds the payload,
      injects it into the template)
- [x] 5. Add `dashboard/payload.sample.json` and `dashboard/README.md`
- [x] 6. Add `.gitignore` entries: `dashboard/output/`, `evidence/*` + `!evidence/.gitkeep`
- [x] 7. Create `evidence/DS4_100_NIIF/.gitkeep`
- [x] 8. Run the build script against the real `worklog/DS4_100_NIIF/` and verify the rendered
      dashboard

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP objects; repository tooling only |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source
- [x] Syntax check clean — n/a, no ABAP source
- [x] Activated, nothing left inactive — n/a
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit green — n/a
- [x] Text symbols and selection texts maintained — n/a
- [x] Build script runs cleanly against the real `worklog/DS4_100_NIIF/` files and the rendered
      dashboard was reviewed

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-235
