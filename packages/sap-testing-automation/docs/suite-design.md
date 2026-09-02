# Suite design

Four pieces sit between a test case and the SAP screen it drives. They exist
because the same four gaps kept costing runs: a screen handle copy-pasted into
three specs, business data typed inline, a discovery spec counted as a regression
answer, and a screen that changed without anything noticing.

| Piece | Lives in | Answers |
|---|---|---|
| **Screen models** | `web-tests/screens/*.json` | Where is this field, and how do I address it? |
| **Business components** | `web-tests/modules/*.ts` | What are the steps of "settle a deal"? |
| **Datasets** | `test-data/*.dataset.json` | What values does this run write? |
| **Suites** | `config/suites.json` | Is this spec a regression answer or an experiment? |

The change-impact check (`npm run test:model-check`) reads the first of those and
reports on the rest. That is the point of keeping them as data rather than code.

## Screen models

One JSON file per SAP screen. It is the only place a handle appears — a field
title, the `nth` that disambiguates a repeated title, a positional button id.

```json
{
  "id": "tbb1-selection",
  "transaction": "TBB1",
  "dynpro": "RFTBB1 / 1000",
  "usedBy": ["TC-002", "TC-004", "TC-005", "TC-008"],
  "anchor": "Company Code",
  "controls": {
    "postingDate": {
      "kind": "input",
      "title": "Posting Date in the Document",
      "nth": 1,
      "expectDuplicates": 2,
      "verify": true
    }
  }
}
```

Specs address controls by **name**, never by title or id:

```ts
const tbb1 = screen('tbb1-selection');
await openScreen(page, tbb1);              // runs the t-code, waits for `anchor`
await mSet(page, tbb1, 'postingDate', '01.01.2026');
```

Four fields carry more weight than they look like they do:

- **`verify`** — type it back-verified. ITS drops leading keystrokes when a field
  re-renders under focus, and for an identifier a dropped digit selects a
  different, real document. `mSet` reads the flag and picks
  `setFieldVerified` or `setField`, so a spec cannot get this wrong by forgetting.
- **`reformats`** — SAP rewrites the value on the round trip (`100000` comes back
  `100,000.00`). Never string-compared; the spec checks it numerically.
- **`expectDuplicates`** — how many inputs legitimately share this title. TBB1 has
  two called "Posting Date in the Document": `nth` 0 is a selection filter and
  `nth` 1 is the date that stamps the document. A third one appearing would
  silently redefine `nth` 1 and post under the wrong date with nothing on screen
  to show for it. This number is what catches that.
- **`usedBy`** — the cases that depend on the screen. It is what turns "this
  control moved" into "TC-002 and TC-008 will fail".

A screen no t-code reaches directly carries a `reach` block naming the previous
screen and the dataset row that gets there:

```json
"reach": { "from": "ftr-create-entry", "dataset": "term-loan-single", "row": "baseline" }
```

The model check fills the prior screen from that row by matching control names to
row fields, presses Enter, and lands on the target. It never saves.

### When a screen changes

Rediscover it, update the model, re-run the cases its `usedBy` names. Do **not**
patch a spec around a drifted handle — the model is what every case shares, and a
spec-local workaround puts the next case back where this one started.

## Business components

`web-tests/modules/treasury.ts` holds the steps: `openDealEntry`, `fillTermLoan`,
`saveDeal`, `settleDeal`, `postFlows`. `web-tests/modules/session.ts` holds the
ones every case repeats — `assertDevSystem`, reading a refusal line, parsing a
document number out of SAP's own confirmation.

TC-002 (one deal, staged) and TC-008 (ten deals, batched) drove the same three
writes through the same three screens with two copies of the code. They now share
one. The split of responsibility is the part worth keeping straight:

> A component performs the step and **reports** what SAP did.
> The spec decides what counts as a pass.

So nothing in `treasury.ts` throws on a business outcome. A refused save is a
return value, because TC-002 must fail on it and TC-008 must record it as
`REFUSED` and move to the next row — the same step, two different verdicts.
Mechanical failures (a field that will not accept a value, a button with no layout
box) still throw, from `webgui.ts`.

## Datasets

A dataset is the data table a case iterates, kept out of the spec:

```json
{
  "id": "term-loan-batch",
  "case": "TC-008",
  "system": "DS4_100_NIIF",
  "authorised": "Amounts and dates were put to the requester and confirmed before the first run.",
  "defaults": { "companyCode": "9800", "productType": "10B", "currency": "AUD" },
  "rows": [
    { "id": "01", "amount": "100000", "startDate": "01.01.2026", "endDate": "31.12.2026" }
  ]
}
```

A resolved row is `defaults` + the row + three derived dates. Adding an eleventh
term loan is a data edit; the spec does not change.

```ts
const ds = loadDataset('term-loan-batch');
for (const row of selectRows(ds)) { test(`deal ${row.id}`, ...); }
```

```bash
$env:DATASET_ROWS="03,07"    # drive only those rows
```

Four deliberate choices in `web-tests/dataset.ts`:

- **`system` pins the landscape.** Company codes, product types and partners are
  master data — they exist on the system they were discovered on and nowhere
  else by right. `loadDataset` refuses a dataset whose `system` is not the one
  under test, before the browser opens. Without it, NIIF's partner `700000453`
  run against another landscape either burns a save on a refusal or, worse,
  matches a *different* real partner holding that number.
- **Dates are derived, once.** Contract Date must be `<=` Term Start or SAP
  refuses the save outright, and the TBB1 cutoff and posting date are the deal's
  own start date in every row written so far. All three default to `startDate`, so
  the constraint lives in one place instead of being retyped correctly thirty
  times. An explicit value still wins.
- **Validation happens on load, not on use.** A malformed date, a contract date
  after the term start, a duplicate row id — all fail before the browser opens. A
  bad date that reaches SAP burns a real save on a refusal.
- **Business values are never defaulted.** Amount, term and partner missing from a
  row is an error, not a guess. Every value this suite writes to a live client was
  agreed in advance, and `authorised` records by whom.

A dataset row id is also how a run is identified afterwards — `DATASET_ROWS` names
the same ids that appear in the result artifacts and the batch summary.

## System scoping

Everything a run produces is written under the registry id of the system it ran
against:

```
results/web/DS4_100_NIIF/tc-009-deal-number.txt
evidence/DS4_100_NIIF/tc-002-200146-1-created.png
```

This is enforced in `writeArtifact`, `readArtifact`, `captureEvidence` and
`dumpScreen` (`web-tests/webgui.ts`), not in the specs — so every case gets it,
including ones not written yet.

Two landscapes issue transaction numbers from their own ranges, so the same
number is a **different, real document** on each. Unscoped, the failure is not a
messy report — it is a wrong-system write:

> `tc-009-deal-number.txt` holds `160254` from a NIIF run. A later run against
> another landscape reads it back and settles and posts whatever real
> transaction happens to hold `160254` there.

`readArtifact` therefore reads only the current system's directory. Another
landscape's artifact is not a usable fallback, so its absence has to look like
absence. The batch lock (`acquireBatchLock`) is scoped the same way, for the
opposite reason: it guards against duplicate writes *on one client*, so two runs
against two different landscapes are legitimately concurrent and must not block
each other.

`results/web/html-report/` and `results/web/test-output/` stay unscoped —
Playwright writes those itself from `playwright.config.ts`.

## Suites

`config/suites.json` says which specs are a regression answer and which are not.
It becomes one Playwright project per suite.

| Suite | Contains | Run it |
|---|---|---|
| `regression` | Case-backed and deterministic. Every spec is named by a `test-cases/Web-TC/<system id>/TC-*.md`. | `npm run test:regression --prefix web-tests` |
| `verification` | Read-only, repeatable, no case file of its own — connectivity and after-the-fact document checks. | `npm run test:verification --prefix web-tests` |
| `model-check` | The change-impact check. Read-only. | `npm run test:model-check --prefix web-tests` |
| `exploratory` | Discovery: finding screens, ids and edge cases. Non-deterministic by design. | `npm run test:explore --prefix web-tests` |

`web-tests/suites.ts` refuses to load if a spec on disk is unclassified or claimed
twice. Unclassified would mean it belongs to no project and silently never runs
again — the worst outcome available here. Claimed twice would mean it runs twice
against a live client, and for a case that writes, that is two documents where one
was authorised.

A new probe spec goes in `exploratory`. It graduates by getting a case file,
passing twice with no deviations, and being moved to `regression` — see
`test-authoring-guide.md` § Freezing.

### The freeze gate

```bash
powershell -ExecutionPolicy Bypass -File "scripts\check-suite.ps1"
```

Seven read-only checks; exits 1 on any failure, so it can gate a run.

| # | Check |
|---|---|
| 1 | Every spec in `web-tests/tests/` is classified by exactly one suite |
| 2 | Every spec `config/suites.json` names actually exists |
| 3 | No `discover-*` / `probe-*` / `explore-*` spec is in `regression` |
| 4 | Every `regression` spec is named by a case file's **Spec file:** line |
| 5 | Every case whose Status is `frozen` is in `regression` and names a spec |
| 6 | Every frozen case has at least two `PASS` runs recorded under `results/` |
| 7 | Every case file sits under `test-cases/<lane>/<system id>/`, that system id is one `config/sap-systems.json` actually lists, and the case's `- **System:**` header agrees with it |

Check 6 is the one the authoring guide already asked for in prose: *do not freeze
a case that has never passed.* A frozen broken test fails forever and gets ignored.

It also prints a case-by-case table — status, suite, PASS count, spec — which is
the fastest way to see what is actually ready to freeze.

## Change impact

```bash
npm run test:model-check --prefix web-tests
```

Read-only. Nothing writes. For every screen model it opens the screen on the live
system, compares what is there against what the model declares, and names the
cases at risk. Report: `results/web/screen-drift.md`.

| Finding | Means |
|---|---|
| **MISSING** | A required control is not on the screen. Cases using it will fail. |
| **AMBIGUITY CHANGED** | A different number of inputs share a title than the model expects. The `nth` a case relies on may now address a different field — this is the dangerous one, because it fails silently rather than loudly. |
| **on screen, claimed by no control** | Informational. Often nothing; a new mandatory field is how a save starts being refused. |
| absent (optional) | A control marked `optional` is not rendered on this variant. Not drift. |

Run it after a transport lands in DS4, **before** trusting a green regression run.
Element ids and screen structure vary with customising, and the failure a drifted
handle produces reads like a product bug when it is not one.

The check is a gate as well as a report: a screen with breaking drift fails its
own test, with the at-risk case ids in the failure message.

## What this is not

- It does not make the model-driven lane deterministic. `exploratory` is still
  exploratory; the split just stops it being mistaken for a regression answer.
- Screen models are **not** portable between systems with different customising.
  `capturedOnSystem` records the registry id each was discovered on, and
  `openScreen` refuses to drive a model whose id does not match the system under
  test. Moving a case to another landscape means rediscovering, not editing.
  (`capturedOn` stays as the human-readable "DS4 / 100" — it cannot do this job
  on its own, because two landscapes in the registry share SYSID `DS4` and
  client `100`.)
- The change-impact check compares against the model, not against SAP's metadata.
  It catches a handle that moved. It cannot tell you a field's *meaning* changed
  while its title stayed put — only a real assertion on a real value does that.
