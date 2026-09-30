# Dynamic Gateway v2 — rollback probe table for the L-350 phase-2 proof

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263
- **Requested by:** niranjan.k@fourthsignal.com ("create ZFS_T_TRM_PROBE with a unique index")

## Scope

A writable probe table so the dynamic gateway's **phase-2 rollback** can be reproduced live. This is
the build's single largest unproven claim: L-350 ("an aborted batch does NOT roll its writes back")
is what the v2 rebuild exists to close, and no test has ever executed a phase-2 write and then
failed a later step. Out of scope: any change to framework code, and the read-only `FUNC` opt-out.

**Why a probe table is needed at all.** `ZFS_T_DYN_REG` holds three targets — `QURY/T005`,
`QURY/T000`, `FUNC/RFC_SYSTEM_INFO` — all read-only, none `TABL`. The framework's own tables are
permanently unregistrable by design.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | The human first named `ZFS_T_DYN_PROBE`. Usable? | **No.** It matches `REJECT_OWN_OBJECT`'s `'ZFS_T_DYN_*'` self-protection pattern (read at source in both `ZCL_FS_DYN_HDL_REGI` and `ZCL_FS_DYN_HDL_TABLE`) and would be refused **039/AUTH** at registration. Renamed. | 2026-09-13 |
| 2 | Would a duplicate **primary** key make the second step fail? | **No** — `MODIFY_TABLE` runs `INSERT ... ACCEPTING DUPLICATE KEYS`, so it is absorbed as a partial write: message 048, `STATUS 'S'`, no abort. This is exactly why Task 20's attempt proved nothing. | 2026-09-13 |
| 3 | Will a unique **secondary** index violation abort phase 2 cleanly, or short-dump? | **Cleanly.** `ZCL_FS_DYN_RUNTIME~MODIFY_TABLE` catches `CX_SY_OPEN_SQL_DB` and converts it to `ZCX_FS_DYN_ERROR` → `STATUS 'E'` → phase-2 abort → `ROLLBACK WORK`. Verified at source before building. | 2026-09-13 |
| 4 | Can an agent create the unique index? | **NO — hard blocker, see below.** | 2026-09-13 |

## Naming gate

```
NAMING: ZFS_T_TRM_PROBE -> matches ZFS_T_<AREA>_<NAME> (AREA=TRM, NAME=PROBE), 15 chars <= 16 cap
```

Chosen over `ZFS_T_DYNGW_PROBE`, which would also escape the three self-protection patterns (ABAP
`CP` treats `_` as a literal; only `*` and `+` are wildcards). Picking a name *because* it slips past
a security wildcard is how a protected namespace decays, and a probe table is not framework
infrastructure — it belongs outside the protected prefix on the merits.

## Todo

- [x] 1. Naming gate recorded before the create call.
- [x] 2. Verify at source that a unique secondary index is the right lever (open questions 2 and 3).
- [x] 3. Create the table skeleton via `adt-mcp` (`TABL/DT`), package `ZFS_DYN_GW`.
- [x] 4. Add fields via `setObjectSource` (two-step DDIC build, L-217).
- [x] 5. Activate — clean, `messages: []`, `inactive: []`.
- [x] 6. ~~Unique secondary index~~ — **abandoned as blocked (L-495); option 2 taken instead**, and
      it needed no DDIC object.
- [x] 7. Registered the probe as a `TABL` target (`AllowWrite:true`) via `RegisterTarget`.
- [x] 8. **`ZFS_DYNGW` grant PROVED, read-only, for the first time in this build** — `RunQuery` on
      `T005` answered `ExecStatus 'S'` with one row. Every previous live authorization test proved a
      *refusal*; a successful grant had never been measured. L-426 is closed by observation.
- [x] 9. **Reproduction run and re-read: THE ROW IS GONE. Phase-2 rollback PROVED (L-496).**

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_TRM_PROBE | TABL/DT | ZFS_DYN_GW | DS4K907263 | **Created, active** |
| ZFS_T_TRM_PROBE~UNQ (unique index on UNIQ_VAL) | TABL/DI | ZFS_DYN_GW | — | **NOT CREATED — blocked** |

Table shape: `key client : mandt`, `key probe_id : char10`, `uniq_val : char20` (the intended unique
index field), `payload : char50`, plus the five mandatory audit fields.

## THE BLOCKER — the unique index cannot be created by any sanctioned route (L-495)

- `adt-mcp` `get_all_creatable_objects` lists 24 types for this system and **no index type**.
- `mcp-abap-abap-adt-api` `createObject` with `objtype: 'TABL/DI'` → **`Unsupported object type`**.
- The index is **not expressible in the table's DDL** — `ZFS_T_DYN_REG` carries unique index `KND`
  and its `define table` source contains no trace of it.
- `sap-gui` may create only text elements and transaction codes (L-229). An index is neither, so
  SE11 is not available without the human widening that rule.

**Two ways forward, both needing the human:**

1. **Create the index in SE11 yourself** (or grant a one-time exception to use `sap-gui` for it).
   `ZFS_T_TRM_PROBE`, unique index on `UNIQ_VAL`. Then todos 7-9 run as written.
2. **Skip the index entirely.** The reachable alternative is a batch whose *second* step fails at
   call time while staying inside the caller's LUW: `[TABL INSERT into the probe (succeeds),
   FUNC registered with CALL_MODE 'L' against an FM that returns a non-zero SY-SUBRC (fails)]`.
   `CALL_MODE 'L'` keeps it in-LUW so the C-1 coherence guard still passes the batch, and the
   handler raises 020 with `STATUS 'E'` on a non-zero subrc, which aborts phase 2. This needs **no
   DDIC object** and no rule exception — only a second registration.

Option 2 is the one I would take: it proves the same property, needs nothing from you, and does not
widen a security-relevant rule for a test fixture.

## THE PROOF — run 2026-09-13, live on DS4_100_NIIF

Registered `NUMBER_GET_NEXT` as `FUNC` with **`CALL_MODE 'L'`** (load-bearing: the default `'R'`
would be refused in phase 1 by the C-1 guard, and the batch would never execute — another phase-1
catch wearing a phase-2 label). Then `ExecuteBatch`, `CommitMode AUTO`:

```
step 1  TABL  ZFS_T_TRM_PROBE  INSERT  -> status 'S', resultcount 1   (a REAL phase-2 write)
step 2  FUNC  NUMBER_GET_NEXT          -> status 'E', message 020
                                          "Object ZFSNOOBJ does not exist"
call    ExecStatus 'E', ErrorCategory 'TARGET', message 045 "Batch aborted at step 2"
```

**`SELECT` from `ZFS_T_TRM_PROBE` afterwards: EMPTY.**

**Positive control, and it is the half that makes this a proof.** An empty table is also exactly
what you see if the INSERT never worked — "the rollback undid it" would then be an assertion that
cannot fail, which is the defect this build has already caught three times. So the identical step 1
was run **alone**, same commit mode, nothing to abort: `status 'S'`, `resultcount 1`, and the row
**is present** afterwards (`RBCTRL01`). Same statement, same target, same mode; the only difference
is the later failure, and that difference is the rollback.

Both re-reads were done over **ADT**, not through the gateway — an independent channel, so the
verdict does not rest on the component under test.

## Delivery checks

- [x] Pretty Printer — n/a for DDL source
- [x] Syntax check clean
- [x] Activated, nothing left inactive
- [ ] ATC — not yet run on this object
- [x] ABAP Unit — none applicable (a table has no unit tests)
- [x] Text symbols and selection texts — none applicable
- [x] Object list confirmed in the transport (DS4K907263)

## Lessons raised

**L-494** (a DDIC table will not activate while the ADT lock that wrote its source is still held —
both servers answer "No active nametab exists", which reads like corruption and invites recreating a
perfectly good object into a permanent orphan) and **L-495** (neither ADT server can create a
secondary index, and `sap-gui` may not be used for one, so it is a human prerequisite that must be
surfaced at planning time).
