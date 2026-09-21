# Design — extract the dynamic gateway into a pluggable global-class framework

- **Date:** 2026-09-10
- **Status:** **approved, implementation deferred by the human** ("will make this changes later")
- **System:** DS4_100_NIIF (`DS4` / client `100`) · package `ZFS_SLC_BTP` · transport `DS4K907263`
- **Supersedes nothing.** Extends the service built in
  `worklog/DS4_100_NIIF/2026-09-09-dynamic-odata-gateway.md` and
  `worklog/DS4_100_NIIF/2026-09-10-dyngateway-submit-kind.md`.

## Why

`ZBP_FS_DYNGATEWAYTP===========CCIMP` is **2,186 lines** holding every local class of the dynamic
OData gateway. Three consequences, all felt on 2026-09-10:

1. **Any change costs a manual paste.** ADT has no partial-source write, and `setObjectSource`
   takes the source as a parameter, so changing one method means re-transmitting the whole
   include — for a file this size that is a transcription task with a real corruption mode, and
   the direct ADT `PUT` alternative is refused by the permission classifier (L-325). Adding one
   step kind took **three** paste cycles.
2. **Adding a kind edits shared types.** `ty_plan` is a union struct with one component per kind
   (`fm`, `tab`, `qry`, `sub`), so a fifth kind touches a type every handler sees.
3. **Nothing is unit-testable.** Every path needs a live RAP action and, for `SUBM`, a live
   report. The validation chain — the part that prevents the L-310/L-313 class of undiagnosable
   failure — has no automated coverage at all.

## Decisions taken (human, 2026-09-10)

| # | Decision | Consequence |
|---|---|---|
| 1 | **Pluggable kinds** — an interface every handler implements, plus a factory resolving `TargetKind` → handler | A fifth kind is one new class and one registry row, with no edit to the dispatcher, the pool, or any existing class |
| 2 | **Class-based exception** carrying the `ZFS_TRM_MSG` number | Matches CLAUDE.md rule 9; removes ~40 repeated `es_out = fail( … ). RETURN.` pairs; message formatting lands in one place |
| 3 | **Response contract unchanged, byte-for-byte** | No BDEF, service-definition or binding change. **No republish.** Every existing consumer and both run books stay valid, and the refactor becomes verifiable by diffing against captured output |
| 4 | **9 global objects, full decomposition** | Shrinks `CCIMP` to ~150 lines of delegation, which ends the paste-cycle problem for good |
| 5 | **Approach B — build fully, switch once** | All risk concentrated in one reversible paste; service stays live throughout |
| 6 | **Include ABAP Unit tests** | Test includes are not separate objects, so no rule-3 cost |

Decision 3 also settles the "response after the activity performed" requirement: the service
already returns `ExecStatus`, `MessageText`, `RowsJson`, `ExportJson`, `TablesJson`,
`ResultCount`, `DurationMs` and `GwUuid` (the call-log key) for every activity. Nothing is
missing; enriching it would have cost a republish for no functional gain.

## Objects — 9, all name-gated

Validated against `docs/naming-conventions.md`. `AREA = SLC`, consistent with the existing
`ZFS_SLC_*` objects. All ≤ 30 characters. **Re-validate immediately before each create call and
record the `NAMING:` line then** — the gate is pre-create, and this list is a proposal, not the
gate itself.

```
NAMING: ZIF_FS_SLC_GW_HANDLER      -> ZIF_FS_<AREA>_<NAME>
NAMING: ZCX_FS_GW_ERROR            -> ZCX_FS_<NAME>
NAMING: ZCL_FS_SLC_GW_REGISTRY     -> ZCL_FS_<AREA>_<NAME>
NAMING: ZCL_FS_GW_HANDLER_FACTORY  -> ZCL_FS_<NAME>_FACTORY
NAMING: ZCL_FS_SLC_GW_FUNC         -> ZCL_FS_<AREA>_<NAME>
NAMING: ZCL_FS_SLC_GW_TABLE        -> ZCL_FS_<AREA>_<NAME>
NAMING: ZCL_FS_SLC_GW_QUERY        -> ZCL_FS_<AREA>_<NAME>
NAMING: ZCL_FS_SLC_GW_SUBMIT       -> ZCL_FS_<AREA>_<NAME>
NAMING: ZCL_FS_SLC_GW_DISPATCH     -> ZCL_FS_<AREA>_<NAME>
```

| Object | Replaces | Job |
|---|---|---|
| `ZIF_FS_SLC_GW_HANDLER` | `lcl_gw` types/constants | shared types, constants, the handler contract |
| `ZCX_FS_GW_ERROR` | `lcl_gw=>fail` | `IF_T100_MESSAGE` exception, one `textid` per message number |
| `ZCL_FS_SLC_GW_REGISTRY` | `lcl_registry` | allow-list, buffered for one request |
| `ZCL_FS_GW_HANDLER_FACTORY` | the `CASE` in `lcl_dispatcher` | kind → a fresh handler instance |
| `ZCL_FS_SLC_GW_FUNC` | `lcl_fm_caller` | dynamic `CALL FUNCTION` |
| `ZCL_FS_SLC_GW_TABLE` | `lcl_table_crud` | dynamic INSERT/MODIFY/DELETE |
| `ZCL_FS_SLC_GW_QUERY` | `lcl_query_rnr` | dynamic SELECT |
| `ZCL_FS_SLC_GW_SUBMIT` | `lcl_submit_runner` | report submit via `ZFS_RFC_DYNGW_SUBMIT` |
| `ZCL_FS_SLC_GW_DISPATCH` | `lcl_dispatcher` + the batch loop | single-shot and batch orchestration, RFC session lifecycle, log staging |

Unchanged: `ZFS_T_SLC_DYNGW`, `ZFS_I_DynGateway`, `ZFS_C_DynGatewayTP`, both BDEFs,
`ZFS_AE_DynGwRequest`, `ZFS_AE_DynGwResponse`, `ZFS_SD_DYNGATEWAY`,
`ZFS_SB_DYNGATEWAY_O4_API`, `ZFS_RFC_DYNGW_SUBMIT`, `ZFS_TRM_MSG`.

## The contract

```abap
INTERFACE zif_fs_slc_gw_handler PUBLIC.

  TYPES ty_kind    TYPE c LENGTH 4.
  TYPES ty_status  TYPE c LENGTH 1.
  TYPES ty_msgtext TYPE c LENGTH 220.
  TYPES: BEGIN OF ty_step,     ... END OF ty_step.      " as today
  TYPES: BEGIN OF ty_outcome,  ... END OF ty_outcome.   " as today
  TYPES: BEGIN OF ty_request,  ... END OF ty_request.   " mirrors ZFS_AE_DynGwRequest
  TYPES: BEGIN OF ty_response, ... END OF ty_response.  " mirrors ZFS_AE_DynGwResponse
  CONSTANTS: BEGIN OF c_kind, func, tabl, qury, subm, batch, END OF c_kind.
  CONSTANTS: BEGIN OF c_status, ok, error, planned, END OF c_status.

  METHODS kind               RETURNING VALUE(rv_kind) TYPE ty_kind.
  METHODS needs_write        RETURNING VALUE(rv_flag) TYPE abap_bool.
  METHODS runs_in_caller_luw RETURNING VALUE(rv_flag) TYPE abap_bool.

  METHODS prepare IMPORTING is_step TYPE ty_step
                            is_reg  TYPE zfs_t_slc_dyngw
                  RAISING   zcx_fs_gw_error.

  METHODS execute RETURNING VALUE(rs_out) TYPE ty_outcome
                  RAISING   zcx_fs_gw_error.

ENDINTERFACE.
```

Three design points, each load-bearing:

**Handlers are stateful per step.** `prepare` stores its plan in the instance; `execute` reads it.
This **deletes `ty_plan` entirely**, which is what makes "new kind = one new class, zero edits"
literally true. The factory returns a fresh instance per step.

**`runs_in_caller_luw( )` generalises the `lv_dirty` rule.** Today the dispatcher hard-codes
`IF kind = subm AND lv_dirty = abap_false`. Instead each handler declares its own transactional
nature — `FUNC` and `TABL` return `abap_true`, `QURY` and `SUBM` `abap_false` — and the dispatcher
aborts only when something already executed returns true. A future kind states its own semantics
instead of the dispatcher knowing about it. See L-328 for why the asymmetry exists.

**The globals know nothing about RAP.** `ty_request`/`ty_response` mirror the abstract entities
rather than referencing them, and the pool maps across with
`CORRESPONDING zif_fs_slc_gw_handler=>ty_request( ls_key-%param )`. This confines every RAP
concept to the pool, sidesteps an unverified question (whether abstract-entity types are usable as
ordinary ABAP types in a global class), and lets a unit test build a request with no RAP
machinery.

## Error model

`ZCX_FS_GW_ERROR` inherits `CX_STATIC_CHECK` and implements `IF_T100_MESSAGE`, with one `textid`
constant per message number the gateway raises (017–025, 027–032), `attr1`/`attr2` pointing at
`MV_V1`/`MV_V2` so `get_text( )` resolves `&1`/`&2`:

```abap
CONSTANTS:
  BEGIN OF program_invalid,                      " 027
    msgid TYPE symsgid      VALUE 'ZFS_TRM_MSG',
    msgno TYPE symsgno      VALUE '027',
    attr1 TYPE scx_attrname VALUE 'MV_V1',
    attr2 TYPE scx_attrname VALUE 'MV_V2',
    attr3 TYPE scx_attrname VALUE '',
    attr4 TYPE scx_attrname VALUE '',
  END OF program_invalid,
```

`CX_STATIC_CHECK` is the point: the compiler forces every caller to handle it, so a new handler
cannot silently drop an error the way returning a struct allows.

**The exception→outcome conversion lives in the dispatcher, not on the exception.** Putting a
`to_outcome( )` on the exception would make the interface raise the exception while the exception
returns an interface type — a circular dependency between two global objects. Converting at the
boundary is where it belongs anyway, and the exception then depends on nothing.

No exception may escape to the RAP framework: the service contract is HTTP 200 with
`ExecStatus='E'`, never an HTTP error.

## Dispatcher

```abap
CLASS-METHODS run_single IMPORTING iv_kind     TYPE ty_kind
                                   is_request  TYPE ty_request
                         RETURNING VALUE(rs_response) TYPE ty_response.

CLASS-METHODS run_batch  IMPORTING is_request  TYPE ty_request
                         EXPORTING es_response TYPE ty_response
                                   ev_abort    TYPE abap_bool.

CLASS-METHODS pending_log RETURNING VALUE(rt_log) TYPE tt_log.
CLASS-METHODS clear_log.
```

`ev_abort` is how the dispatcher says "fail the RAP request" without knowing what
`failed-dyngateway` is; the pool does that part.

Batch algorithm, semantics unchanged from the tested behaviour:

1. Deserialise `StepsJson`; empty or invalid → 022.
2. **Phase 1** — for each step: factory → handler, registry resolve, `prepare`. Record `P` on
   success. First rejection sets overall `E`, exits, and **nothing executes**.
3. **Phase 2** — execute in order. On failure, `ev_abort = ` whether any already-executed handler
   reports `runs_in_caller_luw( ) = abap_true`.
4. RFC session commit or rollback per `CommitMode`, if any FUNC step ran in RFC mode.
5. Build the response; stage the call-log row for the saver to drain.

**The RFC session lifecycle moves into the dispatcher.** Today `commit`/`rollback` are static
methods on `lcl_fm_caller`, so the dispatcher reaches into a worker. The `DESTINATION 'NONE'`
session is shared *across* FUNC steps, so it belongs to whoever shares it — this removes the
coupling rather than relocating it.

## The behaviour pool after the change

~150 lines. `LHC_DYNGATEWAY` keeps `get_global_authorizations`, `create`, `update`, `delete`,
`lock` and `audit_fields` — all genuinely RAP-shaped — and its four actions become:

```abap
METHOD executebatch.
  LOOP AT keys INTO DATA(ls_key).
    zcl_fs_slc_gw_dispatch=>run_batch(
      EXPORTING is_request  = CORRESPONDING zif_fs_slc_gw_handler=>ty_request( ls_key-%param )
      IMPORTING es_response = DATA(ls_resp)
                ev_abort    = DATA(lv_abort) ).
    APPEND VALUE #( %cid = ls_key-%cid
                    %param = CORRESPONDING zfs_ae_dyngwresponse( ls_resp ) ) TO result.
    IF lv_abort = abap_true.
      " unchanged: fail the request so the LUW rolls back (L-313 applies)
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

`LSC_DYNGATEWAY~save` drains `zcl_fs_slc_gw_dispatch=>pending_log( )`.

## Testing

The split is `prepare` versus `execute`, and it is not arbitrary.

**`prepare` is tested.** It is the validation chain — field names against RTTI, operators against
the whitelist, literal lengths, `TRDIR-SUBC`, variant existence, `RSPARAMS` bounds. It is exactly
what prevents the L-310/L-313 class of undiagnosable failure, and it reads the database but never
writes. Test includes (`CCAU`) on each handler, `RISK LEVEL HARMLESS DURATION SHORT`.

**`execute` is not unit-tested, and the spec says so rather than pretending.** It writes rows,
calls BAPIs and submits reports. It stays covered by the live OData suites in
`docs/dyngateway-live-test-2026-09-10.md` and `docs/dyngateway-submit-2026-09-10.md`.

`ZCL_FS_SLC_GW_REGISTRY=>resolve` selects from `ZFS_T_SLC_DYNGW`. Use
`CL_OSQL_TEST_ENVIRONMENT` to inject rows rather than touch the real allow-list — **verify that
framework exists on this release first**; fall back to read-only assertions against the real
allow-list if not.

Minimum cases per handler: unknown target → 017 · operation not permitted → 018 · bad JSON → 022 ·
unknown field → 023 · bad operator → 024 · over `MaxRows` → 025. Plus, for `SUBMIT`: non-executable
program → 027 · bad mode → 028 · over-length selection value → 029 · missing variant → 030. Plus,
for the factory: every known kind resolves, and an unknown kind fails cleanly.

The practical point: `abap_run_unit_tests` / `unitTestRun` means these are runnable **without a
paste, without live side effects, and without waiting on the human** — the opposite of every
verification loop this feature needed.

## Migration — approach B

**Phase A · build, service untouched.** Create all 9 objects with `adt-mcp`, write each with
`setObjectSource`. New and individually small, so **no pastes**. Activate, run ABAP Unit, run ATC.
The live service runs on the old code throughout, so a mistake here is invisible to consumers.

Dependency order, which matters for the syntax check:
**`ZCX_FS_GW_ERROR` → `ZIF_FS_SLC_GW_HANDLER` → `ZCL_FS_SLC_GW_REGISTRY` → the four handlers →
`ZCL_FS_GW_HANDLER_FACTORY` → `ZCL_FS_SLC_GW_DISPATCH`.**

**Phase B · one paste.** `CCIMP` 2,186 → ~150 lines.

**Phase C · regression by diff.** Re-run the existing scripts (`s14`–`s17` and the earlier FTR/BP
suites) and compare against the output already captured in the two run books. The response is
byte-identical by design, so **any** difference is a regression, not a judgement call.

**Rollback: one paste.** Preserve the 2,186-line source; it is also in the transport's version
history.

## Out of scope

No change to the abstract entities, BDEFs, service definition or binding. **No republish.** No new
message numbers. No change to `ZFS_RFC_DYNGW_SUBMIT`. No unrelated refactoring of the RAP CRUD
handlers beyond moving shared helpers.

## Risks

| # | Risk | Handling |
|---|---|---|
| 1 | ATC may object to dynamic `CALL FUNCTION` / dynamic Open SQL in a **global** class where it tolerated them in a behaviour pool | Run ATC in Phase A, before the switch. The findings are the same accepted categories as the original build; document any new ones |
| 2 | `CL_OSQL_TEST_ENVIRONMENT` may not be available or may not support this table | Verify in Phase A; fall back to read-only assertions |
| 3 | A subtle behaviour change that the byte-diff does not cover, because no test exercises that path | The diff covers every path the two run books captured; anything outside that was never verified before this refactor either. State which paths those are |
| 4 | Phase B is still one manual paste | Unavoidable while `setObjectSource` is the only sanctioned write path (L-325). It is the **last** one: at ~150 lines the pool is well within safe transmission size |

## Not started

No object created, no source written. The next step, when the human picks this up, is the
`writing-plans` skill to turn this into an implementation plan.
