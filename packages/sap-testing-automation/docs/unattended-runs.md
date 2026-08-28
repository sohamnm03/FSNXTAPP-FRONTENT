# Unattended runs

Running a case without a model in the loop.

## What was already model-free, and what was not

The web lane has never needed a model to *drive* SAP. The specs know the steps,
`web-tests/screens/*.json` knows the handles, `test-data/*.dataset.json` knows
the values, and `config/suites.json` knows which specs are a regression answer.
`npx playwright test` has always run all of that on its own.

Three things still went through a person on every run:

| Step | Was | Is now |
|---|---|---|
| Turning "run TC-009" into a command | Read the case file, assemble `FLOW_STAGE=... npx playwright test ...` | `config/runs.json` + `scripts/run-case.ps1 -Case TC-009` |
| Writing `results/TC-*.md` afterwards | Transcribed by hand from the session | The run writes it — `web-tests/reporters/result-file.ts` |
| Rebuilding the dashboard | Remembered, or not | The last step of `run-case.ps1` |

The second is the one that mattered. Every downstream artifact — the dashboard,
the freeze gate's PASS count, a case's Run history — reads the run file, and the
run file was a retelling. CLAUDE.md rules 5 (*record what actually happened*) and
6 (*never invent a result*) both applied precisely at the step where nothing
enforced them. Now the values in the report are the strings the run read off the
screen, because the run is what wrote them down.

## Running a case

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\run-case.ps1" -Case TC-009
```

In order, that: resolves the case from `config/runs.json`; runs
`scripts\check-suite.ps1`; refuses to start on top of a live batch lock; states
every database write and waits for a `yes`; runs Playwright with the run
identity in the environment; prints the verdict and the run file; rebuilds
`results/dashboard.html`.

| Flag | For |
|---|---|
| `-Stage save` | Stop a staged case at a stage (`TC-002`, `TC-009`) |
| `-Rows "01,03"` | Drive only those dataset rows |
| `-Resume 160254` | Settle/post an existing document instead of creating another |
| `-RunBy "..."` | Who is answerable. Recorded verbatim in the run file |
| `-Tag create-only` | Suffix for the run filename |
| `-SetEnv @{K='V'}` | Anything else the spec reads |
| `-Yes` | Skip the confirmation, for a scheduled run authorised in advance |
| `-DryRun` | Print what would run and stop |

`-Suite verification` and `-Suite model-check` run the read-only suites; neither
asks for confirmation, because neither writes.

### The confirmation is the point

CLAUDE.md rule 3 says a database write is named before it runs and confirmed at
run time. `run-case.ps1` prints what the case writes and which system it writes
to, and waits. `-Yes` is how a scheduled run carries an authorisation given in
advance — deliberately explicit, so an unattended run is something someone chose
rather than something that happened.

## What the existing way of working does *not* lose

Nothing here changes `npx playwright test`. Run it exactly as before and it
behaves exactly as before — **including not writing a run file**.

The run file is written only when a run asked to be recorded, by
`SAP_WRITE_RESULT=1`:

- `scripts\run-case.ps1` sets it, so every run through it is recorded;
- set it yourself for an ad-hoc `npx playwright test`.

`SAP_RUN_ID` is **not** the signal. `playwright.config.ts` fills that in on every
run so the worker processes and this reporter agree on one journal filename,
which makes it useless as a statement of intent.

That gate exists because a session that drives a spec and then writes its own
result file by hand would otherwise produce **two** records of one run. Both
would land in the dashboard, and — worse — two files from a single passing run
would satisfy the freeze gate's "must pass twice" on their own. So the default
is off, and the model-driven way of working is untouched.

## What a generated run file contains

The same shape as `results/_TEMPLATE.md`, from two sources merged:

- **The run journal** (`web-tests/journal.ts`) — what the spec recorded as it
  went: steps, assertions *with the values that came off the screen*, documents,
  evidence, deviations. Authoritative wherever present.
- **Playwright's own view** — test titles, statuses, errors, and every `expect`
  step. Always available and needs no spec change.

The second is why this worked on day one for nine specs that knew nothing about
it. An uninstrumented spec still produces a correctly named, correctly shaped
run file; instrumenting it upgrades the report from "these assertions held" to
"this field read `100,000.00`".

Nothing is filled in. An assertion Playwright saw pass but whose value nobody
recorded prints `NOT OBSERVED` in the Observed column and `pass` in Result —
both true. There is no code path that writes an expected value into an observed
cell.

### Already instrumented, for every spec

These are recorded from shared code, so every case gets them without touching a
spec:

| Recorded | From |
|---|---|
| System confirmation (rule 1) | `assertDevSystem` — the run file's `confirmed via screenInfo: yes/no` is that call, not an assurance written afterwards |
| Every screenshot | `captureEvidence` — the Evidence table lists what was captured, not what someone remembered |
| Documents, with lifecycle | `saveDeal`, `settleDeal`, `postFlows`, `runAccrualDeferral`, `runValuation` — one row per object, merged across create → settle → post → accrue → value |
| The write steps | The same functions, including a refused save, which records as an attempted document with no number |

The document *type* comes from SAP's own confirmation line
(`documentDescriptor` in `web-tests/modules/session.ts`) — "Interest rate
instrument 160254 in company code 1000 is created". The product type a spec
asked for is only the fallback: one is what was requested, the other is what was
created.

## Instrumenting a spec

Import the journal and record as you go. Every call is safe — a journal that
cannot write must never fail a test that is otherwise fine, so all of these
swallow their own errors.

```ts
import { journal } from '../journal';

journal.forCase('TC-009');                    // only if the case file cannot say it
journal.meta('Dataset row', row.id);          // extra header line

journal.step('FTR_CREATE entry', 'ok');       // Steps executed
journal.step('TBB1 post', 'skipped', 'stage stopped before it');

// Record the value that was actually read. Asserts nothing, so the row reads
// "recorded — not asserted" unless a verdict is passed explicitly.
journal.check('amount survives the round trip', row.amount, filled.amount);

// Record and assert together, so report and verdict cannot disagree
journal.checked('term start', row.startDate, filled.termStart, (o) =>
  expect(o).toBe(row.startDate));

journal.deviation('A working-day dialog appeared and was confirmed.');
journal.verdict('PARTIAL', 'rows 07-10 were not reached');
```

Two of those carry more weight than they look like they do:

- **`deviation`** is what the freeze gate reads. `scripts\check-suite.ps1`
  refuses to count a PASS run that recorded one toward the two clean runs a case
  needs to freeze. Recording one therefore costs something — which is exactly
  why the run has to record it, instead of a narrator deciding afterwards
  whether the popup "really counted".
- **`verdict`** is only for what Playwright cannot see. A precondition that was
  not met is `BLOCKED`, not a product failure; a batch that wrote six of ten
  rows is `PARTIAL` even though every test passed. Otherwise the verdict is
  derived: any test failed → `FAIL`, some failed → `PARTIAL`, all passed →
  `PASS`.

A section the run recorded nothing for says so — "None recorded by this run" —
except Deviations, which writes exactly `None.` because that is the one spelling
`check-suite.ps1` recognises as clean.

## Where things land

| Path | What |
|---|---|
| `results/TC-<case>-<date>-<time>.md` | The run file |
| `results/web/<SYSTEM_ID>/journal/<run id>.ndjson` | The raw journal, one JSON object per line |
| `results/dashboard.html` | Rebuilt at the end of every `run-case.ps1` run |

Journals are kept. They are the evidence behind the rendered file, and they are
what to read when a run file says something surprising.

## Scheduling one

`run-case.ps1` is a plain script with an exit code — the test run's own. A
scheduled task needs `-Yes` (the authorisation is given when the schedule is
created, not at 2am) and usually `-RunBy`:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\SAP Tool\SAP-Testing-Automation\scripts\run-case.ps1" `
  -Case TC-009 -Yes -RunBy "nightly regression (Task Scheduler)"
```

Two things to know before scheduling anything that writes:

- **The browser is visible, always.** `playwright.config.ts` pins
  `headless: false` on purpose, and a scheduled task therefore needs to run in a
  session that has a desktop. This is not an oversight to work around — a
  headless SAP run that "passes" is unreviewable, and TC-001 defect D1 is this
  app reporting success while writing nothing.
- **Every run writes real documents to DS4/100.** A nightly TC-008 is ten more
  deals every night. Scope it with `-Rows`, or schedule `-Suite verification`,
  which writes nothing.

## Recovering from an interrupted run

A session can stop mid-run — network drop, killed shell, closed window — after
some of it already wrote to SAP. Two things are true at that moment:

- **The journal has everything up to the stop.** `web-tests/journal.ts`
  appends and flushes one line per action, so a killed process loses at most
  the one line it was writing, never what came before.
- **No run file exists yet.** `results/TC-*.md` is rendered by
  `web-tests/reporters/result-file.ts`'s `onEnd`, which only fires on a clean
  Playwright exit. A hard kill never reaches it — the journal is the only
  record until someone reads it.

`scripts\check-run.ps1` reads that journal back, so the decision to resume or
re-run is made from what actually happened, not from what the last message on
screen seemed to say:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -Latest
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -RunId 20260819-124024
```

It reports, read-only and without touching SAP: every document the run
recorded writing and the lifecycle stages reached for each (`created ->
settled -> posted -> ...`), the last action before the journal stops and
whether it ends in an explicit verdict, any batch lock in that system's
results folder and whether the pid holding it is still alive (the same check
`scripts\run-case.ps1` and `acquireBatchLock` do, for the same reason — see
`web-tests/webgui.ts`'s comment on the 2026-08-18 duplicate-write incident),
and whether a run file already landed near the same timestamp.

None of this is a fresh read of SAP — it is what the run *claimed* it did.
Before resuming a staged case with `-Resume`, or re-running anything this
lists, confirm the documents it names directly in SAP (CLAUDE.md rule 2's
"absence proves nothing" applies here too), and ask before assuming a prior
run is dead: a live lock's pid is a strong signal, but a lock that looks
stale because the machine rebooted is not proof the last write actually
landed.

## The GUI lane

Built, 2026-08-19. **TC-014** (deal 160275) was run model-driven first,
specifically so this was scoped from a real run rather than from guesswork;
`gui_tests/` is that scope implemented.

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -DryRun
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Stage save
powershell -ExecutionPolicy Bypass -File "scripts\run-gui-case.ps1" -Case TC-014 -Resume 160275
```

Same shape as `run-case.ps1` and the same flags where they mean the same thing
(`-Stage`, `-Resume`, `-RunBy`, `-Tag`, `-Yes`, `-DryRun`). In order it:
resolves the case from `config/gui-runs.json`; refuses to start on a live run
lock; names every database write and waits for a `yes`; confirms the
system/client before the first write **and at every t-code**; drives SAP;
renders `results/TC-*.md` from the journal the run itself wrote; rebuilds the
dashboard.

`-Stage entry` makes **zero** database writes — it opens FTR_CREATE, fills the
entry screen and stops — so it is the smoke test to reach for when the question
is "does the harness work", not "does the business flow work".

| Piece | What it is |
|---|---|
| `gui_tests/run.py` | The runner — resolve, confirm, lock, drive, render |
| `gui_tests/session.py` | `SAPGUIController` plus this workspace's rules (below) |
| `gui_tests/journal.py` | The journal, **same NDJSON schema as the web lane** |
| `gui_tests/render_result.py` | Journal → `results/TC-*.md` |
| `gui_tests/screens/*.json` + `screens.py` | Element ids, addressed by name |
| `gui_tests/modules/treasury.py` | The seven business components |
| `gui_tests/cases/*.py` | One module per case |
| `config/gui-runs.json` | Which module drives each case, and what it writes |

The package is `gui_tests` with an underscore, not `gui-tests` to match
`web-tests/` — a hyphen is not importable in Python.

### Why there is no second engine

`sap-gui`'s MCP server is a thin protocol wrapper around a plain, importable
class: `mcp_sap_gui.sap_controller.SAPGUIController`. Every MCP tool
(`sap_set_field`, `sap_send_key`, …) is a thin call into a same-named method on
it. `gui_tests/` imports that class and drives it directly — no protocol layer,
no model — exactly as `run-case.ps1` drives Playwright directly rather than
through a browser-automation model. Nothing about SAP GUI Scripting COM
automation is reimplemented here.

One thing that fell out for free: `take_screenshot(filepath=...)` has always
written a PNG to disk when called directly. The MCP tool never exposes that
parameter, which is why TC-014's model-driven run saved no evidence files. A
script gets per-write screenshots into `evidence/<system>/`, matching the web
lane's convention.

### The rules, as code rather than as discipline

Each of these was something the model-driven run did by hand, and therefore
something that could have been forgotten:

| Rule | Where it lives now |
|---|---|
| Rule 1 — confirm the system | `assert_dev_system()`, called before the first write and at every t-code; raises `SystemMismatch` |
| Rule 3 — name writes, confirm at run time | `confirm_writes()` prints them and waits; `--yes` for an authorisation given in advance. **Any** failure to get an explicit yes refuses — a non-interactive stdin cannot silently proceed |
| Rule 3a — Test Run always live | `set_test_run_off()` drives it `false` and records it; there is no code path that drives one `true` |
| Rule 4 — never guess an id | ids come from `screens/*.json`; an unknown name raises with the list of known ones |
| Rules 5 & 6 — record, never invent | the journal is written as the run goes and the run file is rendered from it; an unread value prints `NOT OBSERVED` and there is no path that writes an expected value into an observed cell |
| Rule 7 — no production | `resolve_system()` refuses a system whose id, name, label or role matches `prd`/`ps4`/`prod` |
| Rule 9 — one run at a time | a pid-bearing lock per case under `results/gui/<system>/`; a live pid refuses, and a torn lock is treated as held, not stale |

Check-run confirmation deserves its own line: `confirm_check_run()` reads the
**counters off the dialog's toolbar**, not the message text, and confirms only
at 0 terminations and 0 errors. Anything else is cancelled and raises. That is
not defensive coding for its own sake — see below.

### What the read-back and the COM guard are for

Two things in `session.py` exist because of specific, observed failures:

- **`set_field_verified()`** sets, re-reads and compares, tolerating SAP's own
  reformatting (`100000` → `100,000.00`, `10` → `10.0000000`) by comparing
  digits while *recording the raw string off the screen*. TC-014 set four
  fields and re-read none of them, so its run file reports them
  `NOT OBSERVED` — the run could not say what the deal actually held.
- **`write_guarded()`** is the COM-disconnect rule. TC-014's connection dropped
  in the instant after Save was sent for the settle; the call raised a
  *transport* error, so nothing in it said whether SAP had committed. Retrying
  blind risks a duplicate write; giving up risks reporting a failure that
  succeeded. So a write passes both the action and a **read-only verification
  callback** (for the FTR family, FTR_EDIT's History screen), and on a drop the
  guard reconnects, asks that callback what actually happened, and only retries
  if the write did *not* land. If the verification itself cannot run, it
  refuses to retry at all and says a human must check SAP — which is the one
  case where stopping is strictly better than continuing.

  A stale enqueue lock (`You are already editing transaction ...`) left by the
  crashed attempt's own session is expected on that path and is retried rather
  than failed; in TC-014 it cleared on the next attempt. And a check-run that
  comes back with errors it did not have before is very likely the previous
  attempt still settling server-side — cancelled and retried, never forced.

Both drops and lock conflicts are recorded as deviations, so a run that
survived one cannot present itself as clean: `scripts/check-suite.ps1` will not
count it toward the two clean runs a case needs to freeze.

### Reading an interrupted GUI-lane run

`scripts/check-run.ps1` reads both lanes — same schema, one tool. It reports
which lane each journal came from, and `-Lane gui` / `-Lane web` narrows it:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -Latest -Lane gui
```

The same caveat applies as ever, and applies harder here: the journal is what
the run *claimed*, never a fresh read of SAP. After a COM drop especially,
confirm the documents it names directly in SAP before resuming.

### What was scoped and is still not built

- **No dataset file.** TC-014's values live in its case module, not in
  `test-data/*.dataset.json`. When a second GUI-lane case needs the same row,
  move them.
- **`check-suite.ps1` does not validate GUI-lane cases.** It classifies web-lane
  specs against `config/suites.json`; nothing yet checks that a GUI-lane case is
  registered, that its module imports, or that its screen models resolve.
- **One case.** TC-014 only. The seven `treasury.py` components cover the
  FTR/TBB1/TPM44/TPM1 family, so a second term-loan-shaped case is mostly a
  case module; anything else needs new screen models first.
