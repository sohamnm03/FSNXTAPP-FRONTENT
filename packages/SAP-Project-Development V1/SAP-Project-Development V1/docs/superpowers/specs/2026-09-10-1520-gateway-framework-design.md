# Design — extract the dynamic gateway into a pluggable global-class framework

- **Date:** 2026-09-10
- **Status:** **approved, implementation deferred by the human** ("will make this changes later")
- **Revision 2 — 2026-09-10:** call logging reworked into a first-class, rollback-safe,
  per-step mechanism (decisions 7–10, new §*Call logging*, 10th class + 1 RFC FM). Migration
  hardened: fresh baseline before the switch, the old source archived to a file, the two
  unverified questions promoted to hard Phase-A gates. Decisions 1–6 stand unchanged.
- **Revision 3 — 2026-09-10:** benchmarked against `claude-abap-skills/abap-cloud-rap` and Clean
  ABAP, and reworked for maintainability and scale (decisions 11–16). Adds an explicit **clean-core
  position**, a single **runtime port** isolating every ABAP-Cloud-forbidden construct behind one
  interface, **constructor injection** and the removal of static state, a **handler conformance
  test**, **idempotency**, and **contract versioning**. `REGI` is **approved and enabled** for the
  current testing phase as a single endpoint, with a policy switch that tightens it later without
  a redesign. Decisions 1–10 stand unchanged.
- **System:** DS4_100_NIIF (`DS4` / client `100`) · package `ZFS_SLC_BTP` · transport `DS4K907263`
- **Supersedes nothing.** Extends the service built in
  `worklog/DS4_100_NIIF/2026-09/2026-09-09-2233-dynamic-odata-gateway.md` and
  `worklog/DS4_100_NIIF/2026-09/2026-09-10-1243-dyngateway-submit-kind.md`.

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
| 4 | **9 global objects, full decomposition** (10 + 1 FM after rev 2) | Shrinks `CCIMP` to ~150 lines of delegation, which ends the paste-cycle problem for good |
| 5 | **Approach B — build fully, switch once** | All risk concentrated in one reversible paste; service stays live throughout |
| 6 | **Include ABAP Unit tests** | Test includes are not separate objects, so no rule-3 cost |
| 7 | **The log survives a rollback** — the failure path writes out-of-band through the `DESTINATION 'NONE'` session, which is a separate LUW | An aborted batch stops being undiagnosable (L-313). The happy path is unchanged and still costs one commit |
| 8 | **A row per step, not per call** — a parent call row plus one child row per batch step | "Which step failed" becomes a column instead of a guess |
| 9 | **A phase marker** on every row — `prepare` rejection vs `execute` failure | The two failure classes have different causes and different fixes; today they look identical |
| 10 | **Payload caps and a log level** | Stops the log table growing without bound and stops whole `RowsJson` payloads being stored twice |
| 11 | **(rev 3) The clean-core position is written down**, not implied | Every ABAP-Cloud-forbidden construct is deliberate, named, and confined. The design stops pretending the question is only about ATC |
| 12 | **(rev 3) One runtime port** — all dynamic `CALL FUNCTION`, dynamic SELECT, `SUBMIT` and the RFC session behind `ZIF_FS_SLC_GW_RUNTIME`, with one production adapter | `execute` becomes unit-testable with a fake; the non-compliant surface is one class instead of five; a future clean-core migration swaps the adapter, not the framework |
| 13 | **(rev 3) Constructor injection; no static state** | `pending_log`/`clear_log` statics are gone. Tests stop being order-dependent, nothing leaks between requests |
| 14 | **(rev 3) A handler conformance test** every handler's test include inherits | A sixth kind inherits baseline coverage rather than starting at zero — this is what makes "pluggable" mean "safely pluggable" |
| 15 | **(rev 3) Idempotency key** stored on the log row with a unique index | A client that times out mid-create can retry safely. Today a retry duplicates the business partner |
| 16 | **(rev 3) `ApiVersion` on the request, defaulted** | The contract gains a way to evolve. Absent it, the first change breaks every consumer at once |

Decision 3 also settles the "response after the activity performed" requirement: the service
already returns `ExecStatus`, `MessageText`, `RowsJson`, `ExportJson`, `TablesJson`,
`ResultCount`, `DurationMs` and `GwUuid` (the call-log key) for every activity. Nothing is
missing; enriching it would have cost a republish for no functional gain.

## Objects — 14 classes/interfaces + 1 RFC FM, all name-gated

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
NAMING: ZCL_FS_SLC_GW_LOG          -> ZCL_FS_<AREA>_<NAME>          (rev 2)
NAMING: ZFS_RFC_DYNGW_LOG          -> mirrors ZFS_RFC_DYNGW_SUBMIT  (rev 2)
NAMING: ZIF_FS_SLC_GW_RUNTIME      -> ZIF_FS_<AREA>_<NAME>          (rev 3)
NAMING: ZCL_FS_SLC_GW_RUNTIME      -> ZCL_FS_<AREA>_<NAME>          (rev 3)
NAMING: ZCL_FS_SLC_GW_REGI         -> ZCL_FS_<AREA>_<NAME>          (rev 3)
NAMING: ZCL_FS_SLC_GW_REGPOL       -> ZCL_FS_<AREA>_<NAME>          (rev 3)
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
| `ZCL_FS_SLC_GW_DISPATCH` | `lcl_dispatcher` + the batch loop | single-shot and batch orchestration, RFC session lifecycle |
| `ZCL_FS_SLC_GW_LOG` **(rev 2)** | the dispatcher's inline log staging | collect, cap, level-filter and emit call and step rows |
| `ZFS_RFC_DYNGW_LOG` **(rev 2, FM)** | — | RFC-enabled writer so the failure path commits in its own LUW |
| `ZIF_FS_SLC_GW_RUNTIME` **(rev 3)** | — | the port: every ABAP-Cloud-forbidden construct, declared in one place |
| `ZCL_FS_SLC_GW_RUNTIME` **(rev 3)** | the dynamic calls inside each handler, + the RFC session | the one non-clean-core class; owns the `DESTINATION 'NONE'` session lifecycle |
| `ZCL_FS_SLC_GW_REGI` **(rev 3)** | — | the `REGI` step kind: register targets inside a batch |
| `ZCL_FS_SLC_GW_REGPOL` **(rev 3)** | — | who may register: `OPEN` / `AUTH` / `OFF`, read once per request |

`ZCL_FS_SLC_GW_HANDLER_TEST` (rev 3, the conformance base class) lives in a test include and is
not a separate object.

Unchanged: `ZFS_T_SLC_DYNGW`, `ZFS_I_DynGateway`, `ZFS_C_DynGatewayTP`, both BDEFs,
`ZFS_AE_DynGwRequest`, `ZFS_AE_DynGwResponse`, `ZFS_SD_DYNGATEWAY`,
`ZFS_SB_DYNGATEWAY_O4_API`, `ZFS_RFC_DYNGW_SUBMIT`, `ZFS_TRM_MSG`.

## Clean-core position (rev 3) — read this before anything else

`claude-abap-skills/abap-cloud-rap` states that ABAP Cloud forbids `SUBMIT`, `CALL TRANSACTION`,
classic dynpro and unreleased function modules; requires released APIs only; and forbids direct
`SELECT` on SAP-owned tables in favour of released CDS entities. `CLAUDE.md` non-negotiable 9
repeats it.

**This gateway does all three of those things on purpose.** Dynamic `CALL FUNCTION`, dynamic
`SELECT` over registered tables (`T000` and `VTBFHA` are registered today), and `SUBMIT` of
executable reports are not incidental — they are the product. Refactoring into well-structured
classes makes the non-compliance *maintainable*; it does not make it compliant, and no amount of
decomposition will.

Stated plainly, so nobody has to rediscover it:

| | |
|---|---|
| **What this is** | A deliberately classic-ABAP, on-stack integration gateway, guarded by an allow-list, an audit log and authorization |
| **What it is not** | ABAP Cloud compatible. It will not pass `ABAP_CLOUD_DEVELOPMENT_DEFAULT`, and it cannot be lifted to the BTP ABAP Environment as written |
| **Why that is accepted** | It solves a real integration need that released APIs do not cover for these targets, on a system where the classic scope is available |
| **What contains the risk** | The allow-list is the boundary (§11); every call is audited; and — new in rev 3 — **every forbidden construct lives behind one interface in one class** |
| **The exit** | If this system moves to ABAP Cloud, the framework survives and `ZCL_FS_SLC_GW_RUNTIME` is replaced with an adapter built on released APIs. Kinds whose semantics have no released equivalent (`SUBM` above all) die with it. That is the migration, and it is knowable now |

Decision 12 is what turns this from a slogan into a structural property: **the blast radius of the
clean-core decision is one class.** Risk 1 in the original plan asked whether ATC would tolerate
dynamic calls in a global class — that was the wrong question at the wrong altitude. The right one
is *where does the non-compliance live and how do we replace it*, and the answer is now a name.

## The runtime port (rev 3)

Every operation the ABAP Cloud scope forbids goes behind one narrow interface. Not one interface
per operation — the cohesive thing here is "the unsafe stuff", and splitting it three ways would
add objects without adding substitutability.

```abap
INTERFACE zif_fs_slc_gw_runtime PUBLIC.

  METHODS call_function  IMPORTING iv_name    TYPE rs38l_fnam
                                   iv_mode    TYPE ty_call_mode      " local | DESTINATION 'NONE'
                         CHANGING  ct_params  TYPE abap_func_parmbind_tab
                                   ct_tables  TYPE abap_func_tabbind_tab
                         RAISING   zcx_fs_gw_error.

  METHODS select_rows    IMPORTING iv_entity  TYPE tabname
                                   it_fields  TYPE ty_fields
                                   it_where   TYPE ty_where
                                   it_order   TYPE ty_order
                                   iv_max     TYPE i
                         EXPORTING et_rows    TYPE REF TO data
                         RAISING   zcx_fs_gw_error.

  METHODS modify_rows    IMPORTING iv_entity  TYPE tabname
                                   iv_op      TYPE ty_operation
                                   ir_rows    TYPE REF TO data
                         RETURNING VALUE(rv_count) TYPE i
                         RAISING   zcx_fs_gw_error.

  METHODS submit_report  IMPORTING iv_program TYPE progname
                                   iv_mode    TYPE ty_capture
                                   it_sel     TYPE rsparams_tt
                                   iv_max     TYPE i
                         RETURNING VALUE(rs_out) TYPE ty_capture_result
                         RAISING   zcx_fs_gw_error.

  METHODS commit_session.
  METHODS rollback_session.

ENDINTERFACE.
```

Three things fall out of this, and they are the whole reason rev 3 exists:

**`execute` becomes testable.** A handler is constructed with a runtime; a test constructs it with
a fake. `ZCL_FS_SLC_GW_FUNC=>execute` can now be tested for "builds the right parameter bind table,
maps the RETURN table, treats an `E` row as failure" with no live BAPI, no commit and no cleanup.
The original plan declined to test `execute` at all and said so honestly — rev 3 removes the reason
it had to.

**The RFC session lifecycle lands where it belongs.** `commit_session`/`rollback_session` are on
the runtime, not the dispatcher, because the `DESTINATION 'NONE'` session *is* runtime
infrastructure. This also answers the "god dispatcher" objection without inventing a class: the
dispatcher orchestrates, the runtime owns the session.

**The clean-core exit becomes a swap.** One adapter, one interface, one replacement.

## Dependency injection and the end of static state (rev 3)

The rev-1 dispatcher exposed `CLASS-METHODS run_single`, `pending_log( )` and `clear_log( )` —
static methods over a static accumulator. That is global mutable state: order-dependent tests, no
parallel safety, and a silent leak if `clear_log` is ever skipped on an error path. Clean ABAP is
explicit about this, and it is the kind of thing that is free to fix now and expensive later.

Rev 3 makes the dispatcher an instance, built once per request by the pool:

```abap
DATA(lo_gw) = NEW zcl_fs_slc_gw_dispatch(
                io_runtime  = NEW zcl_fs_slc_gw_runtime( )
                io_registry = NEW zcl_fs_slc_gw_registry( )
                io_log      = NEW zcl_fs_slc_gw_log( ) ).
```

The factory receives the runtime and hands it to each handler it builds. Nothing reaches for a
global; every collaborator arrives through a constructor. A test builds the same graph with fakes
in three lines and no framework.

`ZIF_FS_SLC_GW_HANDLER` gains no constructor — interfaces cannot declare one — so the contract is
that a handler takes its collaborators in `CONSTRUCTOR` and the factory is the single place that
knows how to build one. That is asserted by the conformance test rather than left to convention.

## Handler conformance test (rev 3)

`ZCL_FS_SLC_GW_HANDLER_TEST` is an abstract ABAP Unit class that every handler's test include
inherits. It is what makes "pluggable" mean "safely pluggable" — a sixth kind starts with coverage
instead of at zero.

What it asserts for any handler, without knowing which one it has:

- `kind( )` is non-initial, four characters, and unique across the factory's registrations.
- `execute` before `prepare` fails cleanly with `zcx_fs_gw_error`, never a short dump.
- `prepare` **raises** on invalid input rather than returning a failed outcome — the whole point of
  decision 2, and the easiest thing for a new handler to get wrong.
- `needs_write( ) = abap_true` implies `runs_in_caller_luw( ) = abap_true`; a handler that writes
  but claims not to participate in the LUW is incoherent and would break abort handling.
- The handler holds no state across two `prepare` calls on the same instance.
- Every `zcx_fs_gw_error` it raises carries a `textid` from `ZFS_TRM_MSG` — no bare exceptions.

A new kind implements the interface, subclasses this test, and finds out immediately whether it
honours the contract.

## Idempotency (rev 3)

The documented pattern for creating anything is `ExecuteBatch` + `CommitMode`. If the client's
connection drops after the commit but before the response arrives, it cannot know whether the
business partner was created — and a retry creates a second one. This is a correctness gap in the
exact flow the run books recommend, and rev 2 accidentally built the infrastructure to close it.

- The request carries an optional `IdempotencyKey` (client-generated, e.g. a UUID).
- The log row stores it under a **unique index**.
- On arrival: if the key exists, **return the stored response and execute nothing**. If not,
  insert the key as part of the same LUW as the work, so the key and the effect commit or roll
  back together.
- No key supplied → today's behaviour exactly. Existing consumers are unaffected.

The unique index is what makes it correct under concurrency: two simultaneous retries race on the
insert, one wins, the loser reads the winner's response.

## Contract versioning (rev 3)

Decision 3 froze the response byte-for-byte, which is the right **migration tactic** — it is what
turns regression into a diff. Rev 1 quietly promoted it to an architectural principle, leaving the
contract with no way to ever change. Those are different things.

- The request gains `ApiVersion`, defaulting to `1` when absent.
- The dispatcher records it on the log row, so consumer migration is measurable rather than
  guessed.
- Version `1` behaviour is frozen and stays byte-identical, so the refactor is still verifiable by
  diff and decision 3 is untouched.

Adding the field is a contract change and therefore a republish. **Do it in the same republish as
the rev-2 log-exposure decision if that goes ahead**, so the service is published once, not twice.

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

## Call logging (rev 2)

### What is wrong with the log today

The dispatcher stages one row and `LSC_DYNGATEWAY~save` drains it. Four consequences, in order of
how much they hurt:

1. **The log dies with the LUW it describes.** Staged row + RAP saver = the caller's LUW. When a
   batch aborts, the request is failed so the LUW rolls back, and the log row rolls back with it.
   The call you most need to explain is the one that leaves no trace. This is the mechanical cause
   behind L-313's "400 with an empty body — the reason cannot reach you"; it reads like a platform
   limitation and is actually a logging defect.
2. **One row per call.** A batch of twelve steps produces one row, so *which* step failed is not a
   column — at best it is prose inside `ResponseJson`, and on an abort not even that.
3. **No phase marker.** A Phase-1 `prepare` rejection (bad field name, unregistered target — the
   caller's fault, nothing ran) and a Phase-2 `execute` failure (the BAPI said no — something may
   have run) are different events with different fixes, and today they look identical.
4. **Unbounded growth, sharing the allow-list's table.** `ResponseJson` holds whole `RowsJson`
   payloads, so a 1,000-row read is stored twice — once to the caller, once forever. On DS4/100 the
   table is already ~180 log rows to 24 registry rows after a few days, and every allow-list read
   scans past them.

### The mechanism

`ZCL_FS_SLC_GW_LOG` owns all of it. The dispatcher calls it; nothing else does.

```abap
CLASS-METHODS start_call  IMPORTING iv_kind TYPE ty_kind
                                    is_request TYPE ty_request
                          RETURNING VALUE(rv_call_uuid) TYPE sysuuid_x16.

CLASS-METHODS record_step IMPORTING iv_call_uuid TYPE sysuuid_x16
                                    iv_index     TYPE i
                                    iv_phase     TYPE ty_phase   " 'P' prepare | 'X' execute
                                    is_outcome   TYPE ty_outcome
                                    io_error     TYPE REF TO zcx_fs_gw_error OPTIONAL.

CLASS-METHODS finish_call IMPORTING iv_call_uuid TYPE sysuuid_x16
                                    is_response  TYPE ty_response
                                    iv_durable   TYPE abap_bool DEFAULT abap_false.
```

**`iv_durable` is the whole point.** It selects between two emit paths:

| Path | When | How | Cost |
|---|---|---|---|
| **In-LUW** (as today) | the call succeeded, or failed without aborting | rows staged, drained by `LSC_DYNGATEWAY~save` | nothing extra — one commit, unchanged |
| **Out-of-band** | the dispatcher is about to set `ev_abort`, i.e. the LUW is doomed | `CALL FUNCTION 'ZFS_RFC_DYNGW_LOG' DESTINATION 'NONE'`, which commits in its own LUW | one RFC round trip, only on the path that was going to lose the data |

The `DESTINATION 'NONE'` session is a separate LUW — that is precisely why `FUNC` steps use it and
why `CommitMode` exists. Rev 2 reuses the mechanism the codebase already relies on rather than
inventing a second one. It is not `IN UPDATE TASK`, which would roll back with the caller.

**Logging must never change the outcome.** Every emit is wrapped and swallowed: a log failure is
reported through `sy-subrc` into a short dump-free no-op, never into `ExecStatus`. A gateway that
refuses a valid call because its audit trail was unavailable would be a worse bug than the one
being fixed.

### Caps and levels (decision 10)

- `RequestJson` and `ResponseJson` are capped at a documented byte length, truncated with a
  `…[truncated <n> bytes]` marker so a reader can see it happened.
- **A successful `QURY` does not store its rows.** `ResultCount` already carries the useful fact;
  the payload went to the caller. Failures store everything — that is when it is worth keeping.
- A `LOG_LEVEL` on the registry row: `A` all calls · `E` errors only · `N` none. Default `A`,
  preserving today's behaviour for every existing row.
- **Retention is an operational gap, not a code one.** Nothing purges this table. Rev 2 does not
  invent a purge job — that would be an object nobody asked for (rule 6). It records the gap here
  and proposes the decision be taken before the log volume triples with per-step rows.

### The DDIC question — needs a human decision

Per-step rows and the phase marker need three fields the table does not have: `PARENT_UUID`,
`STEP_INDEX`, `PHASE` (plus `LOG_LEVEL` for the level). Adding fields to `ZFS_T_SLC_DYNGW` is a
DDIC change; **whether they are exposed is the fork**, and it collides with decision 3:

| Option | Consequence |
|---|---|
| **A — store, do not expose** *(recommended)* | Fields added to the table and populated; the CDS projection is untouched, so the OData contract stays byte-identical and **there is still no republish**. Step detail is readable in `SE16` and by any future consumer, but not over the API yet. Decision 3 survives intact |
| **B — store and expose** | Step rows readable over OData, which is what a BTP consumer actually wants. Costs a CDS + BDEF change, a **republish**, and gives up "the refactor is verifiable by diff" as a clean property |

A is recommended because it makes the failure *recoverable* now at zero contract cost, and leaves
B available as a later, separately-verified change. The value of rev 2 is durability and
granularity of the record; reading it over OData is a convenience that can wait for its own
republish. **This is a decision for the human, not an assumption — it is not settled below.**

## Registration and execution in one call (rev 2)

**The question:** why register with `POST /DynGateway` and then call the action separately — why not
one endpoint?

### Why not simply merge them

Because the allow-list is the security boundary (§11), not bookkeeping. The gateway will run any
function module, table operation or report named in a request body; the *only* thing standing
between a caller and arbitrary execution is that somebody registered the target first. A call that
registers and immediately executes lets the caller supply both the permission and the thing it
permits, and the boundary becomes a formality. `IsActive`, `AllowRead`/`AllowWrite`, the `MaxRows`
ceiling and `Operation` pinning all stop meaning anything if the caller writes them.

So: **not by dissolving the separation.** But the pain behind the question is real, and it has a
name — L-335. Allow-list rows are `deliveryClass #A` and do not travel with the transport, so a
freshly imported system answers `017` to everything until every target is re-registered on it, one
`POST` at a time. *That* deserves a single call.

### `REGI` — a fifth step kind

`ExecuteBatch` already runs an ordered list of steps in one request. Registration becomes a step
kind like any other:

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"", "FieldsJson":"",
  "FilterJson":"", "OrderByJson":"", "MaxRows":0, "CommitMode":"AUTO",
  "StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"T000\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"MaxRows\\\":20}\"}]" }
```

**The two `Operation`s do different jobs.** The *step's* `Operation` is `INSERT` | `UPDATE` |
`UPSERT`, mirroring how `TABL` already uses that field — so no new field is needed. The one inside
`ImportJson` is the registration's own column (`SELECT` for a `QURY`). **`INSERT` is the default and
fails if the target already exists**: `UPSERT` would let a `REGI` step silently widen an existing
registration — flip `IsActive` back on, raise a `MaxRows` ceiling — which is exactly the L-342
situation. Widening must be typed out deliberately as `UPDATE`.

`CommitMode` does **not** govern `REGI`. That controls the `DESTINATION 'NONE'` session used by
`FUNC` steps; `REGI` writes through Open SQL in the caller's LUW and is committed by the RAP saver.
Because `runs_in_caller_luw( )` is true, a later step's failure rolls the registrations back with
everything else — provisioning is all-or-nothing, and you never get a half-registered system.

Provisioning a new system becomes **one** call carrying 24 `REGI` steps, with `CommitMode` giving
all-or-nothing. And it is the design's headline claim being cashed in: a fifth kind is
`ZCL_FS_SLC_GW_REGI` implementing `ZIF_FS_SLC_GW_HANDLER`, plus one factory row — **zero edits to
the dispatcher, the pool, or any existing handler**. If `REGI` cannot be added that cheaply, the
framework did not deliver decision 1 and that is worth discovering.

### What keeps it safe

1. **Registration authority is a policy decision, not a hard-coded rule** — see §*Status (rev 3)*.
   In `AUTH` mode a `REGI` step requires an authorization distinct from the one permitting gateway
   calls, so an ordinary consumer cannot self-register while a provisioning identity can. The
   current testing phase runs `OPEN`, by decision.
2. **Phase 1 must resolve against a pending-registration overlay.** *(corrected 2026-09-10 — the
   first draft of this section said "the handler clears the buffer in `execute`", which does not
   fix the problem.)* The batch validates every step before executing any. So in
   `[REGI T000, QURY T000]`, Phase 1 resolves `QURY T000` **before** Phase 2 creates the row,
   answers `017`, and rejects the batch — single-call register-and-use is structurally impossible
   against the two-phase design unless resolution accounts for it. Clearing a buffer in `execute`
   addresses Phase 2, by which point the batch is already dead.

   The fix: `ZCL_FS_SLC_GW_REGISTRY` resolves against committed rows **plus** the registrations
   declared by earlier `REGI` steps in the same batch, the overlay built in step order. Step 2
   validates against step 1's intent, and the fail-fast invariant survives — still nothing executes
   until everything validates. It also makes the ordering rule checkable: a `REGI` must precede any
   step using its target, and a forward reference fails in Phase 1 with a clear message instead of
   a caching ghost.
3. **`runs_in_caller_luw( ) = abap_true`** — `REGI` writes rows, so an abort after it must roll it
   back, exactly like `TABL`. No new rule; it declares its nature like every other handler.
4. **Every `REGI` step is logged** by the rev-2 mechanism, with the payload retained. A change to
   the security boundary is the last thing that should be invisible in the audit trail.

### Still not merged into the action bodies

`RunQuery` and friends keep taking a target that already exists. `REGI` is an explicit,
separately-authorised, separately-logged step that a caller has to *ask* for — it does not happen
as a side effect of calling something. The distinction between "I am changing what is permitted"
and "I am doing a permitted thing" stays visible in the request.

### Status (rev 3) — approved and enabled, single endpoint, for now

The human's decision, 2026-09-10: **`REGI` ships enabled in the current testing phase, so
registration and execution happen in one call.** The separation argued for above is not discarded
— it is built as a switch and turned off for now.

I raised the boundary objection and it was heard and overruled with a stated reason (early testing
convenience, tighten later). That is a legitimate call for a system in this phase, and it is
recorded here so the trade is visible rather than forgotten.

**The provision — `ZCL_FS_SLC_GW_REGPOL`.** Registration authority is a policy object consulted by
`ZCL_FS_SLC_GW_REGI=>prepare`, never an `IF` inside the handler:

| Mode | Behaviour | Status |
|---|---|---|
| `OPEN` | any caller permitted to call the gateway may also register | **active now**, testing phase |
| `AUTH` | `REGI` additionally requires the separate registration authorization | built, dormant |
| `OFF` | `REGI` steps are rejected outright; registration is `POST /DynGateway` only | built, dormant |

Tightening later is **a mode change, not a redesign** — no handler edit, no dispatcher edit, no
republish. That is the whole reason it is a policy object and not a flag.

**Safety rails that apply even in `OPEN` mode**, because "testing phase" is not "unlogged":

1. Every `REGI` step is logged with its full payload and the caller, exempt from the rev-3
   truncation rules. A change to the security boundary is the last thing that should be summarised
   away.
2. `Operation` defaults to `INSERT` — widening an existing registration still has to be typed out
   as `UPDATE`. `OPEN` mode relaxes *who* may register, never *what happens silently*.
3. `runs_in_caller_luw( ) = abap_true`, so a later step's failure rolls the registrations back.
4. The mode is read once per request and recorded on the call log row, so "was this registered
   under OPEN?" is answerable later by query rather than by memory.

**Exit criterion, so this does not quietly become permanent:** switch to `AUTH` before the first
non-development consumer is pointed at this service, or before the service is imported to any
system that is not `DS4/100` — whichever comes first. Registrations created under `OPEN` should be
reviewed at that point; the log rows identify them.

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

**`execute` IS unit-tested from rev 3.** The original text below stood only because the dynamic
calls were hard-wired into each handler; decision 12 puts them behind `ZIF_FS_SLC_GW_RUNTIME`, so
a handler can be constructed with a fake runtime and `execute` tested for parameter binding,
`RETURN` mapping, `E`-row handling and row counts with no live BAPI and no commit. What remains
un-unit-testable is `ZCL_FS_SLC_GW_RUNTIME` itself — one class, and deliberately the only one.

*Superseded (rev 1):* `execute` writes rows, calls BAPIs and submits reports. It stays covered by
the live OData suites in
`docs/dyngateway-live-test-2026-09-10-1520.md` and `docs/dyngateway-submit-2026-09-10-1520.md`.

`ZCL_FS_SLC_GW_REGISTRY=>resolve` selects from `ZFS_T_SLC_DYNGW`. Use
`CL_OSQL_TEST_ENVIRONMENT` to inject rows rather than touch the real allow-list — **verify that
framework exists on this release first**; fall back to read-only assertions against the real
allow-list if not.

Minimum cases per handler: unknown target → 017 · operation not permitted → 018 · bad JSON → 022 ·
unknown field → 023 · bad operator → 024 · over `MaxRows` → 025. Plus, for `SUBMIT`: non-executable
program → 027 · bad mode → 028 · over-length selection value → 029 · missing variant → 030. Plus,
for the factory: every known kind resolves, and an unknown kind fails cleanly.

**`ZCL_FS_SLC_GW_LOG` is unit-testable end to end (rev 2)** — truncation at the boundary byte,
the `…[truncated n bytes]` marker, level filtering (`A`/`E`/`N`), a successful `QURY` storing
`ResultCount` and no rows, and the phase marker landing as `P` or `X`. All of it is formatting and
filtering with no side effects, so it is the cheapest coverage in the framework. The one thing a
unit test cannot prove is that the out-of-band path survives a rollback — that needs a live
aborted batch, added to the Phase C suite as an explicit case: force a step to fail after another
has written, then confirm the log rows are still there once the LUW is gone.

**A mapping test (rev 2).** `ty_request`/`ty_response` mirror the abstract entities and are joined
by `CORRESPONDING`, which drops a field silently if either side is renamed. Assert component-name
equality between the mirror types and `ZFS_AE_DynGwRequest`/`ZFS_AE_DynGwResponse` via RTTI, so
drift fails a test instead of a customer call. L-341 is what this protects: the ten-field contract
is the thing consumers must match exactly.

The practical point: `abap_run_unit_tests` / `unitTestRun` means these are runnable **without a
paste, without live side effects, and without waiting on the human** — the opposite of every
verification loop this feature needed.

## Migration — approach B

**Phase A · build, service untouched.** Create all 9 objects with `adt-mcp`, write each with
`setObjectSource`. New and individually small, so **no pastes**. Activate, run ABAP Unit, run ATC.
The live service runs on the old code throughout, so a mistake here is invisible to consumers.

Dependency order, which matters for the syntax check:
**`ZCX_FS_GW_ERROR` → `ZIF_FS_SLC_GW_HANDLER` → `ZIF_FS_SLC_GW_RUNTIME` → `ZCL_FS_SLC_GW_RUNTIME`
→ `ZCL_FS_SLC_GW_REGISTRY` → `ZCL_FS_SLC_GW_REGPOL` → `ZCL_FS_SLC_GW_LOG` → the five handlers
(`FUNC`, `TABL`, `QURY`, `SUBM`, `REGI`) → `ZCL_FS_GW_HANDLER_FACTORY` → `ZCL_FS_SLC_GW_DISPATCH`.**
(rev 3 — the runtime port comes early because every handler takes it in `CONSTRUCTOR`.)

**Phase B · one paste.** `CCIMP` 2,186 → ~150 lines.

**Phase A gates (rev 2).** Open questions 7 and 8 are **blockers, not notes**: `CL_OSQL_TEST_ENVIRONMENT`
availability and ATC's tolerance of dynamic `CALL FUNCTION` in a global class are both answerable
in Phase A, and both change the plan if the answer is no. Neither may be assumed into Phase B.

**Phase A′ · capture a fresh baseline before touching anything (rev 2).** Phase C originally diffed
against output recorded in the run books, which are dated and were written by hand. Re-run the
suites against the **current, unmodified** service first and save the raw responses to files. A
baseline captured minutes before the switch is evidence; a transcript in a document is a
recollection. This costs one suite run and converts Phase C from "compare with the write-up" into
a byte diff of two files.

**Phase B · one paste.** `CCIMP` 2,186 → ~150 lines.

**Phase C · regression by diff.** Re-run the suites and diff against the Phase A′ capture. The
response is byte-identical by design, so **any** difference is a regression, not a judgement call.
Add the rollback-durability case from §Testing.

**Rollback: one paste.** **Archive the 2,186-line source to a file in the repo before Phase B
starts (rev 2)** — today's plan says "preserve" it, which is a hope, not a step. Transport version
history is the second copy, not the first.

## Out of scope

No change to the abstract entities, BDEFs, service definition or binding. **No republish** — under
rev-2 option A (see §*Call logging*); option B would forfeit this and must be decided first. New
message numbers **are** needed for `REGI` if it is approved (unauthorised registration, invalid
registration payload) — from `ZFS_TRM_MSG`, added to the catalog in the same turn as the create. No change to `ZFS_RFC_DYNGW_SUBMIT`. No unrelated refactoring of the RAP CRUD
handlers beyond moving shared helpers.

## Risks

| # | Risk | Handling |
|---|---|---|
| 1 | ATC may object to dynamic `CALL FUNCTION` / dynamic Open SQL in a **global** class where it tolerated them in a behaviour pool | Run ATC in Phase A, before the switch. The findings are the same accepted categories as the original build; document any new ones |
| 2 | `CL_OSQL_TEST_ENVIRONMENT` may not be available or may not support this table | Verify in Phase A; fall back to read-only assertions |
| 3 | A subtle behaviour change that the byte-diff does not cover, because no test exercises that path | The diff covers every path the two run books captured; anything outside that was never verified before this refactor either. State which paths those are |
| 5 | The out-of-band log write adds an RFC round trip to the failure path | Only on the aborting path, which is already the slow, rare one. Wrapped and swallowed, so a log failure cannot change `ExecStatus` |
| 6 | Per-step rows roughly triple log volume, into a table that nothing purges | Caps and `LOG_LEVEL` offset it; retention is flagged as an open operational decision, deliberately not solved by inventing a purge job (rule 6) |
| 7 | `REGI` lets a batch change the security boundary | Separate authorization checked in `prepare`, every step logged with its payload, buffer invalidation specified. Additive and unapproved — it can be dropped without affecting the refactor |
| 8 | 15 objects is a large surface for what was one include | Each is small and single-purpose, and the count is the price of decisions 1, 12 and 14. Stated as a trade, not a free win: the alternative that solves only the paste problem is 3–4 classes with no pluggability and no testable `execute` |
| 9 | `REGI` runs in `OPEN` mode, so any gateway caller can register a target | Accepted for the testing phase by explicit decision. Contained by: full payload logging of every `REGI`, `INSERT` default (no silent widening), mode recorded per call, and a written exit criterion. Tightening is a mode change, not a redesign |
| 10 | Phase A writes are ~200 lines each, not trivial | The honest claim is ten medium writes, each independently verifiable and individually re-writable — materially better than one 2,186-line transmission, but not the absence of the problem |
| 4 | Phase B is still one manual paste | Unavoidable while `setObjectSource` is the only sanctioned write path (L-325). It is the **last** one: at ~150 lines the pool is well within safe transmission size |

## Current state (corrected 2026-09-10) — the structural half is DONE

This section replaced a stale "Not started" note. The extraction actually happened earlier the
same day; see `worklog/DS4_100_NIIF/2026-09/2026-09-10-1246-gateway-framework-extract.md`.

**Complete and verified on DS4/100, transport DS4K907263:**

| | |
|---|---|
| 7 global classes | `ZCL_FS_SLC_GW_BASE`, `_REGISTRY`, `_FUNC`, `_TABLE`, `_QUERY`, `_SUBMIT`, `_DISPATCH` — created, pushed, activated |
| ATC | 0 priority-1, 0 priority-2 on all seven; 16 priority-3 infos, down from the pool's 22 |
| Pool | `CCIMP` 2,186 → **313 lines**, pure delegation, active |
| Regression | every suite identical to the pre-refactor capture (L-334) |

**Note the shape differs from this document's original object list.** The extract was a 1:1
mechanical move: **static-method classes around a `ZCL_FS_SLC_GW_BASE`** — there is no handler
interface, no factory, no exception class, and error handling is still the `ty_outcome` struct.
`ZCL_FS_SLC_GW_BASE` does not appear in the object table above at all. Any implementation of
rev 1 decisions 1–2 or rev 3 decisions 12–14 therefore **rewrites those seven classes**, rather
than creating them from nothing. Plan accordingly; this is churn on code that is currently green.

**Outstanding, in dependency order** *(updated 2026-09-11 — waves 1-3 are now DONE; see
`worklog/DS4_100_NIIF/2026-09/2026-09-11-1243-gateway-completion.md`)*:

| Wave | Content | Status |
|---|---|---|
| 1 | `ZCX_FS_GW_ERROR`, the runtime port, `ZCL_FS_SLC_GW_LOG` + `ZFS_RFC_DYNGW_LOG` | **done** 2026-09-10 |
| 2 | handlers on the interface with an injected runtime; factory; `runs_in_caller_luw( )` | **done** 2026-09-11 |
| 3 | `REGI` + `REGPOL`; messages 033-035; pending-registration overlay | **done** 2026-09-11 |
| 4 | `IdempotencyKey` + `ApiVersion` + the log-exposure fork — one republish, together | **still blocked** on the republish decision |

Live on `DS4/100`, transport `DS4K907263`: 12 gateway classes, ATC **0 priority-1, 0 priority-2**,
regression byte-identical to the captured baseline, and the `REGI` acceptance suite green
including single-call register-and-use.

**What the implementation changed about this document, and why:**

1. **`ty_plan` was not deleted.** The four original kinds still carry their plan structs; the
   handler instance now travels beside the plan so a stateful handler survives the phase-1 /
   phase-2 split. `REGI` uses no plan struct and no static wrapper at all, which is the end state
   — reached one kind at a time rather than in one unverifiable jump (L-354).
2. **The dispatcher was not left unedited by `REGI`.** The design predicted "zero edits to the
   dispatcher"; it needed one `CASE` branch, because the four legacy kinds have not migrated off
   their kind-specific registry-resolve arguments. The factory carries the construction knowledge,
   which is the part that mattered.
3. **The conformance invariant in §*Handler conformance test* is wrong as written** —
   `needs_write( ) → runs_in_caller_luw( )` is false for `SUBM`, correctly (L-351). Restate it as
   two questions before building the test. This is why the test include is not built yet.
4. **§*Registration and execution in one call* overstates atomicity.** "Provisioning is
   all-or-nothing, and you never get a half-registered system" does not hold: the durable log's
   own RFC implicitly commits the caller's LUW, so an aborted batch keeps its writes (**L-350**).
   That is the open decision this design now depends on, and it affects §*Call logging* too —
   rev 2 bought log durability with the atomicity of the work.
5. **`MAX_ROWS = 0` was fixed to mean "no ceiling" (2026-09-11, L-356), not designed that way
   originally.** The design never states what `0` should mean; the build had defaulted it to
   `c_max_rows_default` (100) in `QURY` and, worse, compared an *assumed* 100 against the ceiling
   in `SUBM` even when the caller sent no `MaxRows` at all — refusing any `SUBM` step against a
   target whose ceiling was below 100. Both now read `0` as uncapped, matching what the wrapper FM
   already did one layer down. Verified live: an uncapped target returns its full result set, and
   every pre-existing non-zero ceiling still bites exactly as before.
