# Dynamic gateway — extract pool logic into global classes (in progress)

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** human

## Scope

The **structural half only** of the framework design — move the behaviour pool's local classes
into global classes so a future change touches a small object instead of a 2,186-line include.
Human scoped it explicitly: *"structural suggestion — moving pool logic into global classes —
would have saved us three paste cycles today. just make only this changes."*

**In scope:** 7 global classes, 1:1 extraction, same static-method design, same signatures, same
logic, plus the batch orchestration (moved on the human's confirmation, because leaving
`executebatch` in the pool would keep a paste in the loop for every batch change).

**Out of scope, still in the design doc:** the handler interface, the factory, `ZCX_FS_GW_ERROR`,
`runs_in_caller_luw( )`, stateful handlers, deleting `ty_plan`, unit tests. Error handling stays
the `ty_outcome` struct. Response contract untouched.

Design: `docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md`

## Naming gate

Validated against `docs/naming-conventions.md`, row *Class: `ZCL_FS_<AREA>_<NAME>`*, AREA = SLC:

```
NAMING: ZCL_FS_SLC_GW_BASE     -> matches Class row
NAMING: ZCL_FS_SLC_GW_REGISTRY -> matches Class row
NAMING: ZCL_FS_SLC_GW_FUNC     -> matches Class row
NAMING: ZCL_FS_SLC_GW_TABLE    -> matches Class row
NAMING: ZCL_FS_SLC_GW_QUERY    -> matches Class row
NAMING: ZCL_FS_SLC_GW_SUBMIT   -> matches Class row
NAMING: ZCL_FS_SLC_GW_DISPATCH -> matches Class row
```

## Todo

- [x] 1. Naming gate recorded before any create call.
- [x] 2. Generate the 7 class sources **mechanically** from the verified pool source — slice each
      `DEFINITION..ENDCLASS` + `IMPLEMENTATION..ENDCLASS` pair, rewrite the header to a global
      class, rename every `lcl_*` cross-reference. No logic retyped by hand.
- [x] 3. Hand-write the two non-mechanical moves: `audit_fields` into BASE (shared by the CRUD
      handlers and the log writer), and `run_single` / `run_batch` / `finish` into DISPATCH with
      the RAP plumbing stripped (`keys` / `result` / `failed-` / `reported-` become
      `is_req` / `es_resp` / `ev_abort`).
- [x] 4. **Unblocked** — the human restarted; `abap_list_destinations` returned `[DS4_100_NIIF]`
      again and all 7 shells were created with `adt-mcp` on `DS4K907263`.
- [x] 5. All 7 sources pushed with `setObjectSource` and **activated** — five in two batches while
      building, the last two together. No errors, nothing left inactive.
- [x] 8. ATC, DEFAULT variant, per class: **0 priority-1 and 0 priority-2 everywhere.**
      Priority-3 infos: BASE 0 · REGISTRY 1 · FUNC 6 · TABLE 2 · QUERY 4 · SUBMIT 0 ·
      DISPATCH 3 = **16 total, down from the pool's 22.**
- [x] 7. **Pool switched — no paste needed.** At 313 lines the include is well inside safe
      transmission size, so it went in with an ordinary `setObjectSource`. Activated: one warning,
      the known benign *"READ ZFS_I_DYNGATEWAY is not implemented"* (L-308), nothing inactive.
      `CCIMP` confirmed at **313 lines** on the system.
- [x] 6. **Regression green — every result identical to the pre-refactor run.**

## Generated, ready to push

`<scratchpad>/gen/` — 1,958 lines total, zero `lcl_` references remaining:

| File | Lines | From pool lines |
|---|---|---|
| `zcl_fs_slc_gw_base.abap` | 457 | 65–428 + `audit_fields` |
| `zcl_fs_slc_gw_registry.abap` | 94 | 434–521 |
| `zcl_fs_slc_gw_func.abap` | 314 | 527–834 |
| `zcl_fs_slc_gw_table.abap` | 115 | 840–948 |
| `zcl_fs_slc_gw_query.abap` | 287 | 954–1234 |
| `zcl_fs_slc_gw_submit.abap` | 288 | 1255–1521 |
| `zcl_fs_slc_gw_dispatch.abap` | 403 | 1524–1659 + orchestration |

## Phase A complete — 7 global classes live

| Object | Lines | ATC (p1/p2/p3) | Replaces |
|---|---|---|---|
| `ZCL_FS_SLC_GW_BASE` | 423 | 0/0/0 | `lcl_gw` + `audit_fields` |
| `ZCL_FS_SLC_GW_REGISTRY` | 95 | 0/0/1 | `lcl_registry` |
| `ZCL_FS_SLC_GW_FUNC` | 315 | 0/0/6 | `lcl_fm_caller` |
| `ZCL_FS_SLC_GW_TABLE` | 116 | 0/0/2 | `lcl_table_crud` |
| `ZCL_FS_SLC_GW_QUERY` | 288 | 0/0/4 | `lcl_query_rnr` |
| `ZCL_FS_SLC_GW_SUBMIT` | 289 | 0/0/0 | `lcl_submit_runner` |
| `ZCL_FS_SLC_GW_DISPATCH` | 404 | 0/0/3 | `lcl_dispatcher` + batch orchestration |

All on `DS4K907263`, all active. **The live service is still running the old local classes** — the
pool has not been touched, which is Phase A working as designed.

Two defects found and fixed while extracting, both introduced by the earlier `SUBM` edit:

1. `BASE` had inherited the pool's whole-architecture banner, which described local classes that no
   longer live there. Replaced with a class-scoped header; the architecture overview stays in the
   pool where it belongs.
2. The dispatcher's banner had ended up above `lcl_submit_runner` (the `SUBM` insertion landed
   between the banner and its class), leaving the dispatcher undocumented. Both restored.

## Phase B done — `CCIMP` 2,186 -> 313, and it needed no paste

The write that had required a human three times this day was a routine `setObjectSource`, because
the file is now small enough to transmit. That is the refactor justifying itself on the step that
completed it (L-334).

What stays in the pool: `get_global_authorizations`, `create`, `update`, `delete`, `lock`, the four
action methods (now pure delegation), and `~save`. `audit_fields` moved to `BASE` because both the
CRUD handlers and the call-log writer need it.

Rollback copy of the pre-switch source: `<scratchpad>/pool-ccimp-ROLLBACK.abap`.

## Phase C — regression, all identical

Compared against the output captured in `docs/dyngateway-live-test-2026-09-10-1520.md` and
`docs/dyngateway-submit-2026-09-10-1520.md`. The contract is byte-identical by design, so any difference
would have been a regression rather than a judgement call.

| Suite | Covers | Result |
|---|---|---|
| `s15` negative suite | 017, 018, 023, 024, 025, 028, 029, 030, two-phase `P` | **10/10 identical** |
| `s17` | `LIST` / `SALV` / `NONE` capture on `ZFS_R_TRM_FWDTXN` | identical rows, envelopes, counts |
| `s16` | `MEMO` execute-phase 032 · composition `[SUBM, QURY]` | identical |
| `t30` | batch `QURY` x3 + `FUNC` (`RFC_READ_TABLE`) | identical |
| `t05`, `t02` | single-shot `CallFunctionModule`, `RunQuery` | identical |
| `t11` | single-shot `ExecuteTableCrud` + L-312 duplicate path | `020 "INSERT: 2 of 2 row(s) already exist"`, no data changed, no dump |

Every step kind and both entry points exercised: `run_single` for `FUNC`/`TABL`/`QURY`, `run_batch`
for `QURY`/`FUNC`/`SUBM` plus composition and two-phase validation.

One expected difference, not a regression: `s16` test B now answers **017** rather than 020,
because `s17` had retired the `ZFS_SLC_DEM003` row as inactive earlier in the session.

## Resolved — no MCP route to creating a global class (L-333)

**`adt-mcp` has lost its destination.** `abap_list_destinations` returns `[]`; it returned
`[DS4_100_NIIF]` earlier this session, and the two `FUGR` creations that succeeded happened while
it still did. That one fact explains three failures that looked unrelated:

| Tool | Message |
|---|---|
| `abap_creation-create_object` `CLAS/OC` | *"Cannot invoke IProject.getFile(...) because project is null"* |
| `abap_activate_objects` | *"Project must not be <null>"* |
| `abap_atc_run` | *"No project found for destination DS4_100_NIIF"* |

**And the rule-5 fallback does not cover classes.** `mcp-abap-abap-adt-api` answers
*"Unsupported object type"* for `CLAS/OC` on `validateNewObject`, HTTP 400 on `createObject`, and
HTTP 400 on `objectTypes`. It works for `MSAG`; it does not work for `CLAS/OC`.

**Resolved by a restart.** `abap_list_destinations` came back as `[DS4_100_NIIF]` and class
creation worked immediately. The lesson stands: that probe is the real liveness check for
`adt-mcp`, and the change server is still not a fallback for `CLAS/OC`.

## Object list

| Object | Type | Status |
|---|---|---|
| `ZCL_FS_SLC_GW_BASE` … `_DISPATCH` (7) | CLAS/OC | **created, pushed, activated, ATC clean** |
| `ZBP_FS_DYNGATEWAYTP` | CLAS | **switched to delegation, 313 lines, active**

## Delivery checks

- [x] Syntax clean; all 8 objects activated, nothing left inactive
- [x] ATC DEFAULT variant — **0 priority-1, 0 priority-2** on all seven new classes
- [x] Regression against captured output — every suite identical
- [x] No contract change: no abstract entity, BDEF, service definition or binding touched, **no
      republish**
- [x] Rollback copy of the pre-switch include preserved
- [ ] Pretty Printer — the mechanical rename left a few continuation lines unevenly indented in the
      new classes. Cosmetic and ABAP-legal; a Pretty Printer pass in ADT would tidy it

## Lessons raised

**L-333** — probe `abap_list_destinations` first when `adt-mcp` misbehaves; and the change server
is not a fallback for `CLAS/OC` creation.
**L-334** — holding the wire contract byte-identical made the regression a diff; the extraction
paid for itself on the write that completed it.
