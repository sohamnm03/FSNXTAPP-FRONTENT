# Results dashboard

One pass/fail summary and trend across every run under `results/`, with a clickable link
to each run's own result file.

- `template.html` — the UI. Committed. It renders whatever JSON sits in its
  `<script id="dashboard-payload">` block; the block ships empty.
- `payload.sample.json` — a two-run payload showing every field.
- `../scripts/build-dashboard.ps1` — scans `results/*.md`, builds the payload, injects it
  into a copy of the template.

The **rendered** dashboard is never committed. It embeds live DS4 business data, so it is
written to `results/`, which is gitignored.

## Build it

```bash
powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1"
```

Writes `results/dashboard.html` and opens it in a browser by default, plus
`results/dashboard-payload.json` (the payload alone, if you want to feed it somewhere else).

| Flag | Effect |
|---|---|
| `-NoOpen` | Skip opening the dashboard (CI, headless boxes) |
| `-NoDetail` | Do not embed result-file text. Rows then link to the `.md` files on disk instead of opening them in the drawer — smaller file, but the links only work locally |
| `-PayloadFile <path>` | Render a payload you wrote by hand instead of scanning `results/` |

## What it shows

| Panel | Reads |
|---|---|
| Pass rate (hero) | share of runs in the current selection whose verdict is `PASS` |
| Runs by verdict | one stacked bar, fixed order PASS → PARTIAL → BLOCKED → FAIL → other |
| Pass rate by test case | horizontal ranking, worst case first, banded good/watch/bad — answers "which case is failing", not "is today better than yesterday" |
| Object lifecycle | funnel of created → settled → posted across every object written in the selection — a gap between stages is unfinished business sitting in DS4 |
| Runs table | every run, with its verdict, its object count, and a link to its result file |
| Table view | the run-by-date numbers behind the trend chart, toggled from the filter row |

Four filters scope every panel above: **Date**, **Lane**, **Case**, **Verdict**.

The Date filter opens on the **system date**, so the dashboard answers "what ran today" the
moment it is opened — it is the only filter that starts with a value. On a day with no runs
that selection is legitimately empty: each panel then names the date it filtered on rather
than showing bare dashes, and **All dates** clears it back to every run. It matches the
run's date only, not its time, so every run of that day is in scope.

`lane` keeps the registry id (`web`, `sap-gui`); the UI shows it as **Web Lane** and
**GUI Lane**. An unknown lane id is displayed unchanged — extend `LANES` in
`template.html` to name a new one.

Only `PASS` counts as passed. `PARTIAL`, `BLOCKED`, `FAIL` and anything unrecognised
count as not-passed — a partial run is never rounded up. An unrecognised verdict keeps
its own word in the table (a run marked `CREATED` shows "Created", not "Other"), and the
full verdict line is the pill's tooltip.

Verdict colour is never the only channel: every verdict carries a glyph and its word.
Under deuteranopia the pass green and fail red sit only ΔE 4.1 apart, so colour alone
would not be readable.

## Multiple objects per run

A run is not the unit that matters once a case writes to a live client. `TC-003` is one
green row that created 6 deals from 10 attempted variants; a batch case can leave ten
term loans behind a single run row. The dashboard tracks two things beyond pass/fail:

- **"Objects" column, Runs table.** Per run: how many objects were written, out of how
  many attempted, with their numbers. Three consecutive numbers collapse to a range
  (`200116–200125`); non-consecutive stay comma-separated. A run whose objects section
  the builder could not parse reads **"not recorded"** — never `0`, which would claim
  the run wrote nothing when the truth is only that this file didn't say.
- **"Written to DS4" modal**, opened from a case's hotspot in the Runs table (the case id,
  e.g. `TC-002`, underlines on hover). One row per *object*, not per run — the create, the
  later settle, and the later post of the same deal merge into one row with a lifecycle
  trail, because they are the same document. Identity is `type + company code + number`,
  not the number alone: `200128` in `9800` and `100024` in `9999` are different objects.
  Scoped to that one case, further narrowed by whichever Date / Lane / Verdict filters are
  active — changing a filter while the modal is open re-narrows it live, same as the Runs
  table. Opening it closes an open result drawer and vice versa; only one overlay shows at
  a time.
- **Dirty-run banner.** Appears only when a run that did **not** pass still wrote
  objects still sitting in the system — the case a plain pass-rate number hides. Silent
  when there are none.
- **Runs/Objects toggle** on the "per date" chart — a batch run makes runs-per-date
  understate write volume against objects-per-date by however large the batch was.

An object's number is missing for two different reasons, and the dashboard says which:
**NOT OBSERVED** means the write happened but nothing on screen showed the number;
**"—"** means there was no document to number (a refused save, a variant that never
created). Reusing an existing document without creating one (`state: "reused"`) doesn't
count toward "Objects written".

### Recording objects in a result file

Tier 1 — the `_TEMPLATE.md` table already works if the columns are literally
`| Type | Number | Left in place? |`:

```markdown
## Documents created

| Type | Number | Left in place? |
|---|---|---|
| Interest rate instrument (term loan), co.code 9800 | **200128** | yes — created, settled and posted |
```

Anything shaped differently — a variant matrix, a batch, one-line prose — will not
parse under tier 1 and reads as "not recorded". Add a fenced ` ```objects ` block
instead; it always wins where present:

````markdown
```objects
attempted: 10
Term Loan | 200110 | 9800 | created | left-in-place | V01 baseline
Term Loan | 200111 | 9800 | created settled | left-in-place | V02
Term Loan |         | 9800 | not-created |     | V07 — refused at save
```
````

Columns: `Type | Number | Company code | Lifecycle words | Cleanup | Label`. Lifecycle
words are any of `created settled posted reversed`, space-separated; leave Number blank
and write `not-created` for an attempt that produced nothing. Trailing columns may be
omitted. `attempted:` is optional — it defaults to the row count, so set it explicitly
only when some attempts produced no row at all (refused before anything could be
recorded).

Writing `None. No write occurred — ...` under the heading (TC-006, TC-007) is read as
a **recorded** zero, not a gap — a stated "nothing happened" is a fact, distinct from a
section the parser couldn't read at all.

## Payload schema

```jsonc
{
  "title":       "SAP test results",           // header
  "system":      "DS4 / client 100",           // subtitle
  "generatedAt": "2026-08-17 20:10",           // subtitle
  "chips":       ["13 runs", "7 test cases"],  // optional pills under the title
  "footer":      "…",                          // optional footer line; omitted entirely by the builder -- the footer only shows if you write one
  "runs": [
    {
      "id":          "TC-002-2026-08-17-1328-monthly-month-end",  // unique, required
      "case":        "TC-002",                 // grouping key + Case filter
      "title":       "FTR term loan — create, settle, post",
      "lane":        "web",                    // "web" | "sap-gui" — Lane filter
      "transaction": "FTR_CREATE, FTR_EDIT, TBB1",
      "verdict":     "PASS",                   // PASS | FAIL | BLOCKED | PARTIAL | anything else
      "verdictRaw":  "PASS — all three writes",// optional, shown as the pill tooltip
      "ranAt":       "2026-08-17 13:28",       // date drives the trend; sorts the table
      "assertions":  { "passed": 18, "failed": 0, "notObserved": 0 },  // optional
      "resultFile":  "results/TC-002-….md",    // shown when there is no link
      "resultUrl":   "./TC-002-….md",          // optional: opens in a new tab
      "detail":      "# TC-002 …",             // optional: full markdown, opens in the drawer
      "objects": {                             // optional: see "Multiple objects per run" above
        "recorded":  true,                     // false -> "not recorded"; omit the whole key for the same effect
        "attempted": 1,
        "items": [
          { "type": "Interest rate instrument (term loan)", "number": "200128",
            "companyCode": "9800", "state": "posted",
            "lifecycle": ["created", "settled", "posted"], "cleanup": "left-in-place" }
        ]
      }
    }
  ]
}
```

Every field except `id` is optional; a missing one renders as `—` rather than a guess.

**`detail` wins over `resultUrl`.** With `detail`, the row opens a drawer that renders the
result markdown in place — which is what makes the dashboard shareable, since a published
copy has no access to files on this machine. With only `resultUrl`, the row is a plain
link that resolves relative to the dashboard file (so `./TC-002-….md` works from
`results/`).

## Feeding it a payload directly

The builder's parsing follows `results/_TEMPLATE.md` by convention, not by contract — it
reads the `# ` heading, the `- **Verdict:**` and `- **Case:**` bullets, and the result
column of the `## Assertions` table, and pulls Lane and Transaction from the linked case
file. A run file that deviates gets `null` fields, never invented ones.

When that is not good enough, write the payload yourself and render it:

```bash
powershell -ExecutionPolicy Bypass -File "scripts\build-dashboard.ps1" -PayloadFile "results\my-payload.json"
```

## Sharing it

`results/dashboard.html` is self-contained — no CDN, no external fonts, no fetch — so it
can be published as an artifact and handed to someone as a link. Before doing that, note
what goes with it: a payload built with `detail` carries the **full text of every result
file**, including deal numbers, partner numbers and amounts from a live SAP system. Build
with `-NoDetail`, or filter the payload down, if that data should not leave the machine.
