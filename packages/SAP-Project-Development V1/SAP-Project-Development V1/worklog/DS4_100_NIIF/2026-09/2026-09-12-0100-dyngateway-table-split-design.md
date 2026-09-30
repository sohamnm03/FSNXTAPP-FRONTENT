# Design: split ZFS_T_SLC_DYNGW into a registry and a call log

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** — (design only, nothing created)
- **Transport:** — (none yet)
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

Design only. The human, after reading their own `ZFS_T_SLC_DYNGW` rows during the FTR test case,
asked whether one table holding both the allow-list and the call log is standard practice, and
asked for a better architecture. Answer: it is not standard, and the reasons are concrete
(a single table can carry only one delivery class, one buffering setting, one retention policy).

Full brainstorming path followed: classification → constraint questions → three approaches →
sectioned design → written spec. **No objects created, nothing on DS4 changed.**

## Outcome

Spec committed: `docs/superpowers/specs/2026-09-12-0051-dyngateway-table-split-design.md` (commit
`e02d8d8`). Awaiting human review before an implementation plan is written.

## Decisions the human made

| # | Decision | Chosen |
|---|---|---|
| 1 | Outcome | Design **and** implement |
| 2 | OData compatibility | Break freely, design clean |
| 3 | Purpose of the log | **Real audit trail** |
| 4 | L-350 rollback vs durability | **Roll back first, then log** |
| 5 | Idempotency key | In scope |
| 6 | Transaction ownership | Move out of the RAP saver |

Decision 4 is the one L-350 explicitly reserved for the human and said must not be taken
silently. It is now taken, on the record.

## Design in one paragraph

Four tables replace one: `ZFS_T_SLC_GWREG` (allow-list, delivery class `C`, **fully buffered** —
impossible today), `ZFS_T_SLC_GWREGH` (allow-list change history, closing L-369),
`ZFS_T_SLC_GWCALL` (one row per HTTP call) and `ZFS_T_SLC_GWSTEP` (one row per step, composition
child). `ENTRY_TYPE`, `BTCH`, `PHASE` and `STEP_INDEX=0`-means-not-a-step all disappear. A new
orchestrator `ZCL_FS_SLC_GW_TXN` owns the LUW outside the RAP saver and rolls back *before*
writing the log, which closes L-350 and lets the `DESTINATION 'NONE'` durable-emit machinery be
deleted. The four action URLs and payloads are unchanged.

## Naming gate

Fourteen `NAMING:` lines recorded in §8 of the spec, **before** any create call. All four table
names land at 15–16 characters against the platform's 16-char cap.

## Delivery checks

- [ ] Pretty Printer — n/a, no source
- [ ] Syntax check — n/a
- [ ] Activated — n/a
- [ ] ATC — n/a
- [ ] ABAP Unit — n/a
- [x] Spec self-review run (placeholders, consistency, scope, ambiguity); two fixes applied
      inline — the `exec_status` / `error_category` combination table, and implementation phasing
- [x] Committed to git

## Lessons raised

**None.** The design cites L-335, L-350, L-355, L-364, L-366, L-369 and L-370 but discovered no
new platform behaviour — it is a response to findings already recorded.

## Next session

1. **Human reviews the spec** — this is the gate; nothing proceeds until then
2. On approval, write the implementation plan (phases 1–6 suggested in §11)
3. Open risk 1 must be settled first at build time: validate whether RAP accepts write actions on
   a read-only projection **before** creating any object, because a rejected shell cannot be
   removed and would be orphaned permanently
4. Unrelated and still open: deactivate the write-capable `BAPI_FTR_IRATE_DEALCREATE` registry row
   when FTR testing finishes
