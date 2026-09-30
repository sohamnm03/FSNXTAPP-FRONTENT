# Dynamic gateway — framework refactor design (deferred; **revision 3** 2026-09-10)

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Package:** ZFS_SLC_BTP (nothing created yet)
- **Transport:** DS4K907263 (nothing recorded yet)
- **Requested by:** human

## Scope

Design only. Extract the dynamic gateway's 2,186-line behaviour-pool include into a pluggable
framework of 9 global classes with a class-based error model and ABAP Unit coverage of the
validation chain. **Human deferred implementation** — "will make this changes later".

Design: [`docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md`](../../docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md)

**Out of scope, and deliberately so:** the OData contract. No change to the abstract entities,
either BDEF, the service definition or the binding, therefore **no republish**.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Who is the framework reused by? | **Pluggable kinds** — an interface + factory so a fifth kind is one new class and zero edits. Not a generic component for other BOs; no second consumer exists and guessing their needs would bake the guess into the interfaces. | 2026-09-10 |
| 2 | How should errors travel? | **`ZCX_FS_GW_ERROR`**, `CX_STATIC_CHECK` + `IF_T100_MESSAGE`, converted to an outcome at the dispatcher boundary. Rule 9; removes ~40 check-and-return pairs. | 2026-09-10 |
| 3 | How far should the response go? | **Unchanged, byte-for-byte.** The requirement was already met — every activity returns status, message, rows, counts, duration and the `GwUuid` log key. Enriching it would have cost a republish for no functional gain, and keeping it identical makes the refactor verifiable by diff. | 2026-09-10 |
| 4 | How many global objects? | **9.** Shrinks the pool to ~150 lines, which is what ends the paste-cycle problem. | 2026-09-10 |
| 5 | Migration approach? | **B — build fully, switch once.** All 9 built with no pastes (new, small objects), then one reversible paste. | 2026-09-10 |
| 6 | Unit tests? | **Yes**, on `prepare` only. Test includes cost no objects. | 2026-09-10 |
| 7 | Is `CL_OSQL_TEST_ENVIRONMENT` available on this release? | **Open** — verify in Phase A before relying on it for the registry tests. | — |
| 8 | Will ATC tolerate dynamic `CALL FUNCTION` / Open SQL in a *global* class as it did in a behaviour pool? | **Open** — run ATC in Phase A, before the switch. Promoted to a hard Phase-A gate in rev 2. | — |
| 9 | **(rev 2)** Log fields stored only, or stored **and exposed** over OData? | **Open — needs the human.** Option A (store only) keeps decision 3 and needs no republish; option B exposes step rows to consumers but costs a CDS/BDEF change, a republish, and the clean byte-diff property. A recommended. | — |
| 10 | **(rev 2)** Approve `REGI` as a fifth step kind, so provisioning a system is one call? | **Yes — approved, and enabled in `OPEN` mode for the testing phase**, with `ZCL_FS_SLC_GW_REGPOL` as the provision to tighten later. Exit criterion recorded. | 2026-09-10 |
| 12 | **(rev 3)** Which authorization object carries the register permission in `AUTH` mode? | **Open.** Not guessed — inventing an auth object is unrequested surface (rule 6). Needed only before leaving `OPEN`. | — |
| 13 | **(rev 3)** Rate limits / batch-size cap values? | **Open.** Needs your traffic expectations, not my guess. | — |
| 11 | **(rev 2)** Who owns log retention? Nothing purges the table. | **Open — operational.** Deliberately not solved by inventing a purge job (rule 6). | — |

## Revision 2 (2026-09-10) — what changed and why

Human asked for the plan to be re-examined and improved, and for a logging mechanism to be added.
Decisions 1–6 were re-read and **stand unchanged** — decision 3 (byte-identical response, making
regression a diff) is the strongest call in the document and rev 2 protects it rather than
trading it away.

| Change | Driver |
|---|---|
| **Log survives a rollback** — the aborting path emits through `DESTINATION 'NONE'`, a separate LUW | The staged-row + RAP-saver design means an aborted batch's log rolls back with the work. The call you most need to explain leaves no trace. This is the mechanical cause of L-313's "empty 400", and it is a logging defect, not a platform limit |
| **A row per step**, parent call row + child step rows | A 12-step batch recorded one row; "which step failed" was not a column |
| **Phase marker** `P`/`X` | A `prepare` rejection and an `execute` failure have different causes and fixes, and looked identical |
| **Caps + `LOG_LEVEL`** | `ResponseJson` stored whole `RowsJson` payloads; ~180 log rows to 24 registry rows on DS4/100 already |
| **10th class `ZCL_FS_SLC_GW_LOG` + RFC FM `ZFS_RFC_DYNGW_LOG`** | The out-of-band writer needs an RFC entry point; mirrors the existing `ZFS_RFC_DYNGW_SUBMIT` |
| **`REGI` as a fifth step kind** *(proposed, unapproved)* | Human asked why registration and execution are separate calls. Merging them into the actions would dissolve the security boundary; a separately-authorised `REGI` step gives one-call provisioning (the real L-335 pain) without that. Also the first real test of decision 1's "a new kind is one class, zero edits" |
| **Fresh baseline before the switch; archive the old source to a file; questions 7–8 become hard gates** | Phase C diffed against hand-written run books; rollback rested on "preserve the source" |

Three items above are **open decisions for the human**, not adopted: the DDIC expose/no-expose
fork, `REGI`, and log retention. Everything else is written into the design doc.

## Revision 3 (2026-09-10) — best-practice pass

Human asked for the plan to be converted to best global practice: well structured, scalable, easy
to maintain, with well-defined error handling and logging — and for **single-endpoint
register-and-execute to be enabled now**, with a provision to separate it later.

Benchmarked against `claude-abap-skills/abap-cloud-rap` and Clean ABAP rather than from memory.
Decisions 1–10 re-read and unchanged.

| Change | Driver |
|---|---|
| **Clean-core position written down** (decision 11) | The workspace ruleset forbids `SUBMIT`, dynamic `CALL FUNCTION` and direct SELECT on SAP-owned tables; this gateway does all three by design. Rev 1 treated it as an ATC question. It is a strategy question and now has a stated answer, containment and exit |
| **One runtime port** `ZIF_FS_SLC_GW_RUNTIME` (decision 12) | Isolates every forbidden construct in one class. Makes `execute` unit-testable, moves the RFC session out of the dispatcher, and turns a future clean-core migration into an adapter swap |
| **Constructor injection, static state removed** (decision 13) | `pending_log`/`clear_log` statics were global mutable state — order-dependent tests, no parallel safety, leak on an error path |
| **Handler conformance test** (decision 14) | Pluggable without it means a new kind starts with zero coverage. Now it inherits a contract test |
| **Idempotency key** (decision 15) | A client timing out mid-create cannot retry safely today; a retry duplicates the business partner. Rev 2's log table is the natural home |
| **`ApiVersion`** (decision 16) | Byte-identical response is a migration tactic that rev 1 promoted to a principle, leaving no way to evolve the contract |
| **`REGI` approved and enabled, `OPEN` mode** | Human decision. I raised the boundary objection; it was heard and overruled for the testing phase. Built as `ZCL_FS_SLC_GW_REGPOL` with `OPEN`/`AUTH`/`OFF`, so tightening is a mode change and not a redesign |

Object count 11 → 15. Stated in risk 8 as a trade rather than a free win.

**Exit criterion recorded for `OPEN` mode:** switch to `AUTH` before the first non-development
consumer, or before import to any system other than `DS4/100`, whichever comes first.

## Naming gate

Proposed and pattern-checked against `docs/naming-conventions.md`, **not yet gated** — the gate is
pre-create and must be re-recorded immediately before each create call:

```
ZIF_FS_SLC_GW_HANDLER      -> ZIF_FS_<AREA>_<NAME>
ZCX_FS_GW_ERROR            -> ZCX_FS_<NAME>
ZCL_FS_SLC_GW_REGISTRY     -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_GW_HANDLER_FACTORY  -> ZCL_FS_<NAME>_FACTORY
ZCL_FS_SLC_GW_FUNC         -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_SLC_GW_TABLE        -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_SLC_GW_QUERY        -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_SLC_GW_SUBMIT       -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_SLC_GW_DISPATCH     -> ZCL_FS_<AREA>_<NAME>
ZCL_FS_SLC_GW_LOG          -> ZCL_FS_<AREA>_<NAME>          (rev 2)
ZFS_RFC_DYNGW_LOG          -> mirrors ZFS_RFC_DYNGW_SUBMIT  (rev 2)
ZCL_FS_SLC_GW_REGI         -> ZCL_FS_<AREA>_<NAME>          (rev 3, approved)
ZIF_FS_SLC_GW_RUNTIME      -> ZIF_FS_<AREA>_<NAME>          (rev 3)
ZCL_FS_SLC_GW_RUNTIME      -> ZCL_FS_<AREA>_<NAME>          (rev 3)
ZCL_FS_SLC_GW_REGPOL       -> ZCL_FS_<AREA>_<NAME>          (rev 3)
```

## Todo

- [x] 1. Classify the work — architectural (new objects, new error model, restructured boundaries).
- [x] 2. Explore the existing structure; read the full 2,186-line include.
- [x] 3. Settle the six design decisions with the human.
- [x] 4. Present the design in three sections, approved section by section.
- [x] 5. Write the design doc.
- [ ] 6. **Deferred by the human.** Next step when picked up: `writing-plans` to turn the design
      into an implementation plan, then Phase A.

## Object list

Nothing created or changed. No transport entry.

## Delivery checks

- [x] No SAP object touched
- [x] Design approved section by section before being written down
- [x] Naming pattern-checked (gate itself deferred to create time, as required)
- [x] Every decision and its reasoning recorded, so a later session need not re-litigate
- [x] The two questions that need the system to answer them are flagged as open, not guessed

## Lessons raised

**L-332** — the design decisions and why the response contract was deliberately left alone.

**L-343** — rev 2: the log's durability defect, and why register-and-run must not be one call.

**L-344** — two-phase batch validation vs a step that depends on an earlier step's effect; the
`REGI` pending-registration overlay, correcting the first draft.

**L-345** — rev 3: the clean-core position, the runtime port, and enabling `REGI` as a switchable
policy rather than a hard-coded rule.
