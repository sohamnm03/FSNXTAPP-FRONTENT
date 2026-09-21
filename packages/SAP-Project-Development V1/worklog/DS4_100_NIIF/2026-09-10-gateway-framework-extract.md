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

Design: `docs/superpowers/specs/2026-09-10-gateway-framework-design.md`

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
- [ ] 4. **BLOCKED — create the 7 class shells.** See below.
- [ ] 5. Push each source with `setObjectSource`; activate all 7 together.
- [ ] 6. Regression: re-run `s14`–`s17` and the FTR/BP suites, diff against the run books.
- [ ] 7. One paste to shrink `CCIMP` to ~200 lines.
- [ ] 8. ATC on the new classes.

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

## BLOCKED — no MCP route to creating a global class (L-333)

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

**Needed from the human, either one:**

1. **Restore `adt-mcp`'s destination** — it follows the VS Code ADT logon, so opening or
   refreshing the ABAP project there (or restarting that server) should bring it back. Then I
   finish autonomously: create, push, activate, ATC, regression, and hand over one final paste.
2. **Create 7 empty classes** in ADT or SE24 (package `ZFS_SLC_BTP`, transport `DS4K907263`, names
   above). `setObjectSource` works fine, so I fill and activate them from there.

Nothing is locked. Nothing partial was written. The service is untouched and live on the current
code throughout — Phase A by design.

## Object list

| Object | Type | Status |
|---|---|---|
| `ZCL_FS_SLC_GW_BASE` … `_DISPATCH` (7) | CLAS/OC | source generated, **not created** |
| `ZBP_FS_DYNGATEWAYTP` | CLAS | untouched, live |

## Lessons raised

**L-333** — probe `abap_list_destinations` first when `adt-mcp` misbehaves; and the change server
is not a fallback for `CLAS/OC` creation.
