# dyngw v2 Task 21 — documentation

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (no SAP objects created or changed by this task — read-only)
- **Transport:** n/a — this task writes no SAP objects
- **Requested by:** human (Task 21 of the 21-task dyngw v2 plan)

## Scope

Write the v2 documentation set (`docs/dyngw-v2-how-it-works.md`, `docs/dyngw-v2-api.md`,
`docs/dyngw-v2-integration-guide.md`), add index rows to `CLAUDE.md` and `AGENTS.md` marking the
v1 gateway docs superseded (not deleted — v1 is still running), reconcile the message catalog
against the live system, and add ledger entries. No SAP object creation; only two read-only
`runQuery` calls against `T100` to reconcile the message catalog.

Out of scope: any SAP object creation/change, any role/user creation, any live acceptance testing
of the gateway itself (that is Task 20's live-run phase, still pending per its own report).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does the message catalog carry drift against `ZFS_TRM_MSG` 037-049? | No. `SELECT` against `T100` returned all 13 rows (037-049) matching the catalog text verbatim, and `MAX(msgnr)/COUNT(*)` confirmed 49 rows, max 049 — the catalog's "next free number: 050" is correct. | 2026-09-13 |

## Naming gate

No SAP objects created — naming gate not applicable to this task.

## Todo

- [x] 1. Read task-21-brief.md, task-18-report.md, v1 docs, ledger L-400+, message catalog
- [x] 2. Reconcile message catalog 037-049 against live `T100` (two `runQuery` calls)
- [x] 3. Write `docs/dyngw-v2-how-it-works.md`
- [x] 4. Write `docs/dyngw-v2-api.md`
- [x] 5. Write `docs/dyngw-v2-integration-guide.md`
- [x] 6. Add CLAUDE.md index row (v2, current) and mark v1's row superseded (kept, not deleted)
- [x] 7. Add AGENTS.md gateway-doc pointer (v2 current, v1 superseded)
- [x] 8. Ledger entries L-485, L-486
- [x] 9. This worklog + task-21-report.md + commit

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | no SAP objects touched by this task |

## Delivery checks

- [ ] Pretty Printer — n/a (no ABAP)
- [ ] Syntax check clean — n/a (no ABAP)
- [x] Activated, nothing left inactive — n/a, no SAP objects
- [ ] ATC / Code Inspector — n/a
- [ ] ABAP Unit green — n/a, "no ABAP touched"
- [ ] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed — none created
- [x] Message catalog reconciled against live `T100`, no drift found

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-485, L-486.
