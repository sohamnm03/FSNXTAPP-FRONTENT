# Dynamic Gateway v2 — Task 20: regression suite and payloads (authoring phase)

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (no SAP objects created or changed by this activity — see Scope)
- **Transport:** n/a — this task creates no SAP objects
- **Requested by:** coordinator, dyngw v2 build (task-20-brief.md)

## Scope

Author (not execute) `scripts/dyngw-v2-regression.ps1` and
`worklog/DS4_100_NIIF/dyngw-v2-payloads-2026-09-12-0918.txt` for the v2 dynamic gateway
(`ZFS_SB_DYNGW_O4_API`, published in Task 18). One case per action, the refusal paths, the three
mandated proofs (L-350 closure, unregistered SUBM, EXECUTE-vs-ADMIN split), and the full spec
section 3 capability matrix. **Explicitly out of scope, per the brief and the coordinator's
resume message:** running any request that writes — no POST/PATCH/DELETE against the live
service, no target registration, no probe rows, no batches. Read-only verification (`GET
$metadata`, entity-set GETs, SELECT-only `runQuery`) was used to confirm field/message names and,
critically, to read three handler classes' actual source so Proof 1 would be built on the real
mechanism rather than a guess.

Interrupted once mid-task by an org spend-limit (HTTP 429), resumed per the coordinator's message
with two updates: the registry-forensics blocker is resolved (Task 18's fix round will
DELETE-and-re-POST the `T000` row as its final act, so the live acceptance phase — dispatched
separately — starts clean), and the scope limit is now about sequencing rather than evidence
preservation. No write had been sent before the interruption; nothing changed as a result.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Can Proof 1 be built on the brief's literal "two `TABL` INSERT steps, same key"? | **No, not against a plain primary-key duplicate** — see L-479/L-480 and the report. Authored both the literal form (gated behind `-ProbeTable`, since no non-framework table was chosen) and a corroborating `REGI`-based reproduction that always runs under `-Live`. | 2026-09-13, this task |
| 2 | Which non-framework table should the literal `TABL` proof and the CRUD happy-path case write to? | Not answered here — project rule 3 forbids inventing one. Left as a required `-ProbeTable`/`-ProbeKeyField` parameter with a loud SKIP when unset. | open |
| 3 | Which function module should exercise the CHANGING-parameter-in-RFC-mode refusal (spec 3.1)? | Not answered here, same reasoning. Case authored as BLOCKED. | open |
| 4 | Which report should exercise SUBM's SALV/LIST/MEMO/NONE/variant/RSPARAMS rows (spec 3.4)? | Not answered here. RSPARAM named as a safe candidate (already run live once, Task 13) for a human to register if they choose. | open |

## Naming gate

No SAP object is created by this activity — nothing to name.

## Todo

- [x] 1. Read task-20-brief.md, task-18-report.md, the integration guide, and the ledger from
      L-470 onward.
- [x] 2. Read the spec's full section 3 capability matrix (3.1–3.6) and the plan's Task 20 section
      verbatim, rather than reconstructing them from memory.
- [x] 3. Read-only verify: base URL/namespace/entity sets/action parameter shapes (from task-18's
      live report and the plan), the message catalog (DS4_100_NIIF.md) for every message number
      used, and connection facts (config/sap-systems.json).
- [x] 4. Read, via `getObjectSource` (mcp-abap-abap-adt-api, a read tool — no write), the three
      classes Proof 1 depends on: `ZCL_FS_DYN_HDL_TABLE`, `ZCL_FS_DYN_RUNTIME`,
      `ZCL_FS_DYN_DISPATCH`, and `ZCL_FS_DYN_HDL_REGI`. This is what surfaced the
      `ACCEPTING DUPLICATE KEYS` finding (L-479) and the REGI phase-1 alternative (L-480) —
      without it the script would have shipped asserting an outcome the current code cannot
      produce, with no way to tell a real failure from an expected one.
- [x] 5. Write `scripts/dyngw-v2-regression.ps1`: connectivity check, one case per action (happy
      path + refusal), the composite/idempotency/commit-mode cases, the three proofs, and a
      pass/fail/blocked/skip summary. Hand-built every JSON array (L-315); `sap-client=100` on
      every URL; a `-Live` interlock gates every write-bearing case behind an explicit switch —
      without it the script only proves connectivity and prints what each case would do.
- [x] 6. Write `worklog/DS4_100_NIIF/dyngw-v2-payloads-2026-09-12-0918.txt`: every payload the script
      sends, each labelled as *verified live* (task-18-report.md), *source-verified* (read but not
      run), or *blocked* (needs a human decision this task could not make on its own).
- [x] 7. Parse-check the script (`[System.Management.Automation.Language.Parser]::ParseFile`,
      static AST parse only — no execution, no network call) — zero syntax errors.
- [x] 8. Ledger entries L-479/L-480 in this turn; this worklog file; the task-20 report.
- [ ] 9. (Deferred — separate dispatch) Run the suite with `-Live` once Task 18's fix round has
      landed, resolve the `-ProbeTable`/CHANGING-FM/SUBM-report open questions, and run Proof 3
      once a restricted (`EXECUTE`-only) principal exists.

## Object list

None — no SAP object was created, changed or activated by this activity.

## Delivery checks

- [x] Script parses clean (static AST check; not executed).
- [x] No SAP object created, changed, or activated.
- [x] No write sent to DS4_100_NIIF (verified: only `healthcheck`, `searchObject` and
      `getObjectSource` calls were made — all read-only).
- [x] Payload file cross-references every case in the script by number/ID.
- [ ] Live run, Proof 1/2 pass, Proof 3 unblocked — all deferred to the separately-dispatched
      live-acceptance phase.

## Lessons raised

L-479, L-480 (both in `lessons/lessons-ledger.md`, this turn).
