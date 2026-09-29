# Standing rule — RAP draft needs human confirmation

- **Date:** 2026-08-16
- **System:** n/a (workspace rule capture, no SAP object touched)
- **Package:** n/a
- **Transport:** n/a
- **Requested by:** Karthik

## Scope

Capture the human's standing instruction: *"For any RAP developments, for the Draft method always
ask the human for the confirmation, don't do it on your own."* Recorded as `L-224` and written into
the rule files that bind every agent. Out of scope: no SAP object was created, changed or read; no
existing RAP BO was audited for its current draft setting.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does the rule also cover *removing* draft from an existing BO? | Assumed yes — the rule is written to cover both directions and generator-implicit draft. Correct me if it is meant one-way only. | — |

## Naming gate

n/a — no object created.

## Todo

- [x] 1. Append `L-224` to `lessons/lessons-ledger.md`
- [x] 2. Add the rule to `AGENTS.md` (canonical for all agents, L-221)
- [x] 3. Add it to `CLAUDE.md` — non-negotiable #7 + *Watch for* on both RAP index rows
- [x] 4. Open this worklog file

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP object touched |

Files changed: `lessons/lessons-ledger.md`, `AGENTS.md`, `CLAUDE.md`, this worklog.

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a
- [x] Activated, nothing left inactive — n/a
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit green — n/a, no ABAP written
- [x] Text symbols and selection texts maintained — none needed
- [x] Object list confirmed in the transport — n/a

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-224.
