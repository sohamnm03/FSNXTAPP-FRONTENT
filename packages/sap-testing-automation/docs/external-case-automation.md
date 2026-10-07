# External case automation (saved scripts)

Every app-created case is a Markdown file (`TC-nnn-*.md`, the readable steps) plus a
matching script beside it: `TC-nnn-*.py` (SAP GUI) or `TC-nnn-*.spec.ts` (web). The user
only ever picks the `.md`; FSNXT finds the script, checks it, and runs it without a model.

## How the script is produced

You (the model) never write the script. After a **fully successful, observed** run, write
a JSON plan to the path the prompt names (`.fsnxt-plans/<basename>.json` in the case folder
when creating a case — temporary, deleted by the app, never a deliverable; `automation.json` in the run folder when running an older case).
The app validates it and renders the `.py` / `.spec.ts`. A failed, blocked or partial run
produces no plan. Never reuse a document number from authoring; capture it.

## Plan shape

```json
{ "version": 1, "caseId": "TC-007", "lane": "gui", "systemId": "DS4_100_NIIF",
  "observedOutcome": "PASS", "steps": [ { "action": "...", "label": "..." } ] }
```

Include **every** precondition, step and assertion from the Markdown, in order. Use only
controls and values actually discovered. No credentials, cookies or machine paths.

| action | gui | web | fields |
|---|---|---|---|
| `transaction` | yes | yes | `value` t-code |
| `fill` | yes | yes | `target`, `value` (read back and asserted) |
| `press` / `click` | `press` | `click` | `target` control id |
| `key` | yes | yes | `value`: numeric VKey (gui) / key name (web) |
| `tab` | yes | no | `target` |
| `select` | yes | yes | `target`, `value` |
| `check` | yes | yes | `target`, boolean `value` |
| `assert` | yes | yes | `source` (`field`/`status`/`text`/`value`/`checked`), `expected`, `match` (`equals`/`contains`), optional `capture` + `pattern` (one group) + `documentType` |

GUI `target`s are discovered ids (`wnd[0]/...`); web `target`s are the field title for
`fill`/`select`/field asserts, or the control id for `click`/`check`.

## Exact spelling (the app rejects anything else)

- GUI `target`: `wnd[0]/usr/...` — never the `/app/con[0]/ses[0]/` prefix.
- Always record `FTR_ENTRY-BUKRS` as an explicit verified `fill`; a repeat run must not
  depend on the SAP user's current default company code. Existing signed sidecars that omitted
  it are completed from the exact technical-name/value row in their matching Markdown.
- GUI tab controls (a final id segment beginning with `tabp`) always use
  `action:"tab"`; never encode a tab as `press` or `select`.
- GUI `key` `value`: numeric VKey as a string (`"0"` Enter, `"11"` Save, `"3"` Back, `"8"` Execute).
- `pattern`: single-escaped regex, e.g. `"instrument (\\d+) in"` (as written in the JSON file).
- `source:"popup"` reads the open popup's text; assert it with `contains` only, never a derived count.
- GUI `source:"field"` and `source:"value"` comparisons ignore SAP's leading/trailing
  display padding. Record the canonical business value (for example `100,000,000.00`);
  punctuation, signs and decimal digits still have to match.
- GUI `source:"text"` on an ALV/`GuiGridView` target reads the grid's row and cell
  contents, not its COM type name. Use `match:"contains"` with an observed cell value.
- GUI `source:"status"` exposes the SAP message id/number, message text, program / screen
  number, and active screen title, joined with ` | `. `equals` passes when it matches one of
  those values exactly (e.g. the title alone); `contains` searches the whole joined text.
  Record that title exactly as returned. For compatibility with existing cases, a recorded
  section-qualified title such as `Create Interest Rate Instrument: Structure` also matches
  SAP GUI's stable base title `Create Interest Rate Instrument:` only when the next recorded
  control is present on that screen; unrelated titles and missing subscreens do not match.
- At run time the exact recorded GUI control id is always tried first. If its container path
  includes a tab that is not active, the runtime selects that recorded tab and tries the exact id
  again. If the remaining container path has drifted, it may use a live control only when the same
  SAP technical name occurs exactly once on the current screen. Missing or ambiguous controls stop
  the run without guessing.

## Writes

Any step that writes to the database sets `"write": true` and is **immediately** followed
by an `assert` (only popup confirmations may sit between) with `"verifiesWrite": true` that reads the real success result (document
number, status message). `${name}` placeholders may only refer to values captured earlier.

## At run time

FSNXT re-reads the `.md`, requires the script's embedded case hash, lane, case id and SAP
system to match, shows the usual confirmation of database writes, runs the script with
no retries, and builds the result and report from its observations. If the `.md` is edited
the script no longer matches and the case runs interactively once to prepare a new one.
