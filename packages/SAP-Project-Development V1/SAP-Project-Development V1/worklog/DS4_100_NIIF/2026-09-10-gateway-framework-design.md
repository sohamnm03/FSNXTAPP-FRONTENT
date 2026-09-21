# Dynamic gateway — framework refactor design (deferred)

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Package:** ZFS_SLC_BTP (nothing created yet)
- **Transport:** DS4K907263 (nothing recorded yet)
- **Requested by:** human

## Scope

Design only. Extract the dynamic gateway's 2,186-line behaviour-pool include into a pluggable
framework of 9 global classes with a class-based error model and ABAP Unit coverage of the
validation chain. **Human deferred implementation** — "will make this changes later".

Design: [`docs/superpowers/specs/2026-09-10-gateway-framework-design.md`](../../docs/superpowers/specs/2026-09-10-gateway-framework-design.md)

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
| 8 | Will ATC tolerate dynamic `CALL FUNCTION` / Open SQL in a *global* class as it did in a behaviour pool? | **Open** — run ATC in Phase A, before the switch. | — |

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
