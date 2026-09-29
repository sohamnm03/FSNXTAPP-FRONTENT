# Worklog activity dashboard

One completion-rate summary and trend across every activity under `worklog/<system-id>/`, with
a clickable link to each entry's own worklog file.

This dashboard tracks development **activity** — build status per worklog entry — not test
execution. There is deliberately no verdict/pass-fail concept here: a worklog either has every
todo item and every applicable delivery check ticked off, or it doesn't.

- `template.html` — the UI. Committed. It renders whatever JSON sits in its
  `<script id="dashboard-payload">` block; the block ships empty.
- `payload.sample.json` — a three-entry payload showing every field.
- `../scripts/build-dashboard.ps1` — scans `worklog/<system-id>/*.md` across every system
  subfolder, builds the payload, injects it into a copy of the template.

The **rendered** dashboard is never committed — it reflects whatever is currently in `worklog/`,
which changes every activity. It is written to `dashboard/output/`, which is gitignored.

## Build it

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1"
```

Writes `dashboard/output/dashboard.html` and opens it in a browser by default, plus
`dashboard/output/dashboard-payload.json` (the payload alone, if you want to feed it somewhere
else).

| Flag | Effect |
|---|---|
| `-NoOpen` | Skip opening the dashboard (CI, headless boxes) |
| `-NoDetail` | Do not embed each worklog file's text. Rows then link to the `.md` files on disk instead of opening them in the drawer — smaller file, but the links only work locally |
| `-PayloadFile <path>` | Render a payload you wrote by hand instead of scanning `worklog/` |

## What it shows

| Panel | Reads |
|---|---|
| Completion rate (hero) | share of entries in the current selection with every todo item and every applicable delivery check ticked off |
| Entries by status | one stacked bar, Complete → In progress |
| Objects by type | horizontal bar ranking of repository object types built (`TABL/DT`, `DDLS/DF`, `BDEF/BDO`, `PROG/P`, `MSAG/N`, …), most common first — a plain count, not a rate |
| Worklog entries table | every entry, with its todo/delivery-check completion, object count, lessons raised, and a link to its worklog file |
| Table view | the per-date numbers behind the trend chart, toggled from the filter row |

Three filters scope every panel above: **Date**, **System**, **Object type**.

The Date filter opens on the **system date**, so the dashboard answers "what happened today" the
moment it is opened — it is the only filter that starts with a value. On a day with no entries
that selection is legitimately empty: each panel names the date it filtered on rather than
showing bare dashes, and **All dates** clears it back to every entry. It matches the entry's
date only, not a time (worklog filenames carry no time component).

**System** and **Object type** option lists are built dynamically from whatever values are
present in the payload — there is no hardcoded list, since more systems can be enabled at any
time (`config/sap-systems.json`) and object types are open-ended (ADT object-type codes).

Status colour is never the only channel: every status carries a glyph and its word.

## Status: complete vs. in-progress

An entry is `complete` only when **every** `## Todo` checkbox and **every** `## Delivery checks`
checkbox in the file is ticked. There is no third state, and the builder does not try to
interpret the text after a checkbox (an unchecked item marked "n/a" in prose is still counted as
undone) — spot-checking real worklogs during design showed authors already tick off
not-applicable items as `[x]` with an explanatory suffix, and leave genuinely undone items
unchecked. Plain checkbox counting already reflects author intent.

## Recording objects in a worklog

The `## Object list` table already works if the columns are literally
`| Object | Type | Package | Transport | Status |` (case-insensitive):

```markdown
## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_XA_USRREC` | TABL/DT | ZFS_K2_CC_VS | DS4K907018 | Done — activated, fields verified |
```

A row whose Object or Type cell is `—`/`n/a`/empty means the entry recorded zero objects, not a
gap ("No SAP objects; repository tooling only" reads as `recorded: true, items: []`). No
`## Object list` section at all, or a header that doesn't match this shape, reads as **not
recorded** — a gap the dashboard admits to, never invented as zero.

A `Type` cell with more than one code, e.g. `DDLS/DF, BDEF/BDO`, splits into one item per type
token (same object/package/transport/status on each) so the objects-by-type panel counts each
type separately.

## Evidence linking

Evidence lives beside the worklog that produced it, at
`worklog/<system-id>/<YYYY-MM>/evidence/<worklog-stem>/`, and is committed. The folder name
matches the worklog file's stem, so worklog and evidence pair up by name. A worklog author
references a screenshot by relative path in prose or an Object-list `Status` cell — the
dashboard does **not** parse, validate, or embed these links; they are plain files a human
maintains by hand, the same way any other link in a markdown file works when the drawer
renders it.

The old top-level `evidence/<system-id>/` root was retired on 2026-09-13 (L-502) — it was
empty, and its gitignore rule silently shadowed the evidence actually in use.

## Payload schema

```jsonc
{
  "title":       "SAP development activity",      // header
  "system":      "DS4_100_NIIF",                   // subtitle — every system scanned, joined
  "generatedAt": "2026-08-24 19:10",               // subtitle
  "chips":       ["11 worklog entries", "1 system"], // optional pills under the title
  "footer":      "…",                              // optional footer line; omitted entirely by the builder — the footer only shows if you write one
  "runs": [
    {
      "id":             "2026-08-22-rap-user-provisioning-api",  // unique, required
      "system":         "DS4_100_NIIF",            // System filter — the containing folder name
      "date":           "2026-08-22",              // drives the trend and Date filter (from the filename prefix)
      "title":          "RAP OData V4 Web API — Third-Party SAP User Creation/Provisioning",
      "package":        "ZFS_K2_CC_VS",
      "transport":      "DS4K907018",
      "requestedBy":    "Saumya S (saumya.s@fourthsignal.com)",
      "todo":           { "checked": 9, "total": 9 },       // "## Todo" checkbox count
      "deliveryChecks": { "checked": 7, "total": 7 },       // "## Delivery checks" checkbox count
      "status":         "complete",                // "complete" | "in-progress" — derived, see above
      "objects": {                                 // see "Recording objects in a worklog" above
        "recorded":  true,                         // false -> "not recorded"; omit the whole key for the same effect
        "attempted": 5,
        "items": [
          { "object": "ZFS_T_XA_USRREC", "type": "TABL/DT", "package": "ZFS_K2_CC_VS",
            "transport": "DS4K907018", "status": "Done — activated, fields verified" }
        ]
      },
      "lessons":     ["L-227", "L-228"],           // L-nnn refs from "## Lessons raised"
      "worklogPath": "worklog/DS4_100_NIIF/2026-08/2026-08-22-1719-rap-user-provisioning-api.md",
      "worklogUrl":  "../../worklog/DS4_100_NIIF/2026-08/2026-08-22-1719-rap-user-provisioning-api.md",
      "detail":      "# RAP OData V4 …"            // optional: full worklog markdown, opens in the drawer
    }
  ]
}
```

Every field except `id` is optional; a missing one renders as `—` rather than a guess.

**`detail` wins over `worklogUrl`.** With `detail`, the row opens a drawer that renders the
worklog markdown in place — which is what makes the dashboard shareable, since a published copy
has no access to files on this machine. With only `worklogUrl`, the row is a plain link that
resolves relative to the dashboard file (so `../../worklog/DS4_100_NIIF/….md` works from
`dashboard/output/`).

## Feeding it a payload directly

The builder's parsing follows `worklog/_TEMPLATE.md` by convention, not by contract — it reads
the `- **Label:** value` bullets, the `## Todo` / `## Delivery checks` checkboxes, the
`## Object list` table, and the `L-nnn` references under `## Lessons raised`. A worklog file that
deviates gets `null`/empty fields, never invented ones.

When that is not good enough, write the payload yourself and render it:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1" -PayloadFile "dashboard\my-payload.json"
```

## Sharing it

`dashboard/output/dashboard.html` is self-contained — no CDN, no external fonts, no fetch — so it
can be published as an artifact and handed to someone as a link. Before doing that, note what
goes with it: a payload built with `detail` carries the **full text of every worklog file**,
which can include package/transport identifiers and other internal detail. Build with
`-NoDetail`, or filter the payload down, if that should not leave the machine.
