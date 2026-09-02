---
name: new-test-case
description: Scaffold a new test-cases/{GUI-TC,Web-TC}/<system id>/TC-*.md from the template and register it in config/runs.json so it can be launched by id.
disable-model-invocation: true
---

# Scaffold a new test case

Creates the two files a case needs to exist: the case file itself, and its entry
in `config/runs.json`. Miss the second and `run-case.ps1` refuses the case
outright — *"A case absent from the manifest cannot be launched by id"* — which
is deliberate, because guessing a stage or a row set means writing the wrong
thing to a live client.

User-invoked only. Creating a case is an authoring decision, not something to
fire automatically.

## Before writing anything, establish these

Ask the user for whatever they have not already said:

| Needed | Why it cannot be defaulted |
|---|---|
| **Lane** — `sap-gui` or web | Different rendering path, different failure modes. Never inferred (a standing rule in this workspace). |
| **System** — an id from `config/sap-systems.json` | Screen ids, master data and element handles are not portable between landscapes (CLAUDE.md rule 4). Never inferred beyond the registry's `defaultSystem` — confirm it with the user rather than assuming. |
| **Transaction / app** | One case covers one transaction and one scenario. |
| **What it proves** | Becomes Purpose, and decides what the assertions are. |
| **Does it write?** | Every committing step must be named before it runs (rule 3). |
| **Data-driven?** | Rows go in `test-data/*.dataset.json`, never inline in the spec. |

Check the chosen system id is actually listed in `config/sap-systems.json` —
that file is the only source of valid ids, so a typo'd or not-yet-added system
would produce a folder `scripts/check-suite.ps1` (check 7) then refuses.

Pick the next free `TC-nnn` by listing `test-cases/` **recursively** — ids are
unique across every lane and system folder, so `TC-014` being in
`GUI-TC/DS4_100_NIIF/` still uses up `014`. Name the file
`TC-<nnn>-<TCODE>-<slug>.md` and write it into the folder that matches the
lane and system the user just gave you: `test-cases/GUI-TC/<system id>/` for
`sap-gui`, `test-cases/Web-TC/<system id>/` for web — e.g.
`test-cases/GUI-TC/DS4_100_NIIF/TC-024-...-gui.md`.

## Write the case file

Copy `test-cases/_TEMPLATE.md` and fill it in. Keep every header bullet — both
`scripts/check-suite.ps1` and `web-tests/reporters/result-file.ts` parse them,
so a malformed line silently breaks tooling:

- `- **Case id:** TC-nnn` — must match the filename
- `- **Spec file:**` — the web-lane spec, once it exists; `—` until then
- `- **System:**` — must match the `<system id>` folder the file is filed under
- `- **Status:** draft` — a new case is never `active`, never `frozen`
- `- **Writes to the database:**` — must agree with the Writes section

Two rules do most of the work:

**Every assertion names a field and an expected value.** "The order is created"
is not an assertion; "`VBAK-VBELN` is non-empty and message `V1 311` is
displayed" is. Pin the message class and number rather than English text.

**Every committing step appears in Writes.** Walk your own Steps table and check
each save/post/create against it. If the case touches TBB1, TPM44 or TPM1, the
Test Run checkbox is driven to `false`, read back, and run once live — never
simulated first (rule 3a).

Leave element ids blank rather than guessing them. Ids are discovered with
`sap_get_screen_elements` (GUI lane); in the web lane a handle goes into
`web-tests/screens/*.json` and the spec addresses it by name — never a literal
title in the case or the spec.

## Register it in config/runs.json

Add an entry under `cases`. Only `spec`, `summary` and `writes` are required:

```json
"TC-013": {
  "spec": "<name>.spec.ts",
  "summary": "<one line — what it does>",
  "writes": "<exactly what lands in the database, or omit if read-only>"
}
```

Add `stageEnv`/`stages`/`defaultStage` for a staged case, `rowsEnv`/`dataset`/
`defaultRows` for a data-driven one, `resumeEnv` if it can resume an existing
document, `batch: true` for a batch, and `note` for anything a runner should
know before starting (a known-failing case, a blocked one).

`writes` is what `run-case.ps1` prints and waits for a `yes` on. Make it
concrete — "creates an interest rate instrument, settles it, posts its flows
(3 writes)", not "writes some data".

## Finish

Run the read-only gate and report the result:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\check-suite.ps1"
```

A new `draft` case with no spec yet will not be in `regression` and should not
fail anything. If it does, fix it before the case ever runs.

Then tell the user what still has to happen before this case can run: the spec
itself, its suite classification in `config/suites.json`, and — for a
`regression` spec — that the case file names it on its `Spec file:` line.

Do not run the case. Do not create the spec unless asked. Do not set Status
beyond `draft`: `active` and `frozen` are claims the gate verifies, and a case
freezes only after two PASS runs with no deviations.
