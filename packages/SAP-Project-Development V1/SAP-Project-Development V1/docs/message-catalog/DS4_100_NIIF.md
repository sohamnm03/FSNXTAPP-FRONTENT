# Message Catalog — `ZFS_TRM_MSG`

Local mirror of message class **`ZFS_TRM_MSG`** on `DS4_100_NIIF`. **Enabled 2026-08-16 on human
instruction** (L-210).

## How this file is used

- `ZFS_TRM_MSG` is the **only** message class for new development in this workspace. It supersedes
  `ZFS_TEST_VS` (L-154, now history — readable, never extended).
- **Pick messages from the table below. Do not query `T100` for routine lookups.** That is the
  whole point of the mirror.
- If nothing here fits: create the message in `ZFS_TRM_MSG` on the system, add the row here **in
  the same turn**, and **list it in the completion report** (number, type, text).
- Never substitute a text symbol for a missing message (L-211). Create the message.
- If a system read ever contradicts this file, **the system wins** — correct the file and record
  the discrepancy in `lessons/lessons-ledger.md`.

## Message type convention

The type is chosen at the `MESSAGE` call site, not stored in `T100` — the same number can be
issued as `S`, `W`, `E` or `A`. The *Intended type* column below records how the text is worded
and therefore how it should normally be issued.

## Verification status

| | |
|---|---|
| Class | `ZFS_TRM_MSG` — "TRM Project Message Class", package `ZFS_K2_CC_VS`, transport `DS4K907018` |
| Created | 2026-08-16 (the class did not exist before — `T100A` had no row) |
| Last successful read of `T100` | **2026-08-16** |
| Status | ✅ **VERIFIED** — table below matches `T100` for language EN |

Read back with
`SELECT ARBGB, MSGNR, TEXT FROM T100 WHERE SPRSL = 'E' AND ARBGB = 'ZFS_TRM_MSG'`.

## Confirmed messages

| No. | Intended type | Text | Placeholders | Used by |
|---|---|---|---|---|
| 001 | S (display like W) | No data found for the selection | — | `ZFS_R_TRM_FWDTXN` — empty result, and empty selection match |
| 002 | E | ALV layout variant &1 does not exist | &1 = variant name | `ZFS_R_TRM_FWDTXN` — `VALIDATE_SELECTION` |
| 003 | S (display like E) | You are not authorized to display any company code in the selection | — | `ZFS_R_TRM_FWDTXN` — empty authorized range |
| 004 | S (display like W) | Maximum of &1 rows reached - the list is truncated | &1 = row cap | `ZFS_R_TRM_FWDTXN` — row cap hit |
| 005 | E | User ID &1 already exists in the system | &1 = user ID | `ZFS_C_UserProvisionTP` — create, duplicate pre-check |
| 006 | E | Mandatory field &1 is missing for user type &2 | &1 = field name, &2 = user type | `ZFS_C_UserProvisionTP` — create/update validation |
| 007 | E | User type &1 is not supported | &1 = supplied value | `ZFS_C_UserProvisionTP` — create validation |
| 008 | E | BAPI user creation failed: &1 | &1 = BAPI message text | `ZFS_C_UserProvisionTP` — create, `BAPI_USER_CREATE1` failure |
| 009 | S | User &1 created successfully | &1 = created user ID | `ZFS_C_UserProvisionTP` — create success |
| 010 | E | BAPI user update failed: &1 | &1 = BAPI message text | `ZFS_C_UserProvisionTP` — update, `BAPI_USER_CHANGE` failure |
| 011 | S | User &1 updated successfully | &1 = created user ID | `ZFS_C_UserProvisionTP` — update success |
| 012 | E | BAPI user deletion failed: &1 | &1 = BAPI message text | `ZFS_C_UserProvisionTP` — delete, `BAPI_USER_DELETE` failure |
| 013 | S | User &1 deleted successfully | &1 = created user ID | `ZFS_C_UserProvisionTP` — delete success |
| 014 | E | Outward SLC tracking record &1 does not exist | &1 = OTTK tracking number | `ZFS_I_SlcOttk` (`LHC_SlcOttk`) update/delete, `ZFS_CDS_SLC_001` (`LHC_SlcOttkDetail`) update/delete, and `ZFS_C_DealIdTP` (`LHC_DealIdTP`) create — record-not-found, reused across all three |
| 015 | E | Outward SLC tracking record &1 already exists | &1 = OTTK tracking number | **Created but not currently used** — planned for a create-time duplicate check on `ZFS_CDS_SLC_001` (`LHC_SlcOttkDetail`) before the human redirected `ZottkNo` generation to the `ZFS_OTTK_D` number range mid-build, which makes a duplicate structurally impossible in normal use. Left on the system rather than deleted (no delete route); available if a future BO needs an "already exists" message |
| 016 | E | DTTK tracking record &1 does not exist | &1 = DTTK tracking number | `ZFS_CDS_SLC_002` (`LHC_SlcDttkDetail`) — update/delete, record-not-found; also `ZFS_I_SlcDttkFee` (`LHC_SlcDttkFee`) — update/delete of a charge line whose DTTK row is missing, and `ZFS_C_DealIdTP` (`LHC_DealIdTP`) create (reused rather than adding a new message, mirroring how 014 is shared across the OTTK BOs) |
| 017 | E | Target &1 is not registered for the dynamic gateway | &1 = target name | `ZFS_I_DynGateway` (`LHC_DynGateway`) — all three dispatch actions, registry lookup miss or `is_active` not set |
| 018 | E | Operation &1 is not permitted for target &2 | &1 = operation, &2 = target name | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `allow_read`/`allow_write` gate, and an `ExecuteTableCrud` operation the registry row does not list |
| 019 | E | Function module &1 does not exist | &1 = FM name | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `CallFunctionModule`, `TFDIR` lookup miss |
| 020 | E | Dynamic call of &1 failed: &2 | &1 = target name, &2 = failure text (`sy-msg*` or exception) | `ZFS_I_DynGateway` (`LHC_DynGateway`) — non-zero `sy-subrc` from the dynamic `CALL FUNCTION`, or a failed dynamic INSERT/MODIFY/DELETE/SELECT |
| 021 | E | Table or view &1 does not exist | &1 = table or CDS entity name | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `ExecuteTableCrud` / `RunQuery`, RTTI lookup miss on the source |
| 022 | E | Invalid JSON in parameter &1 | &1 = payload field name (`ImportJson`, `FilterJson`, …) | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `/ui2/cl_json` deserialization failure |
| 023 | E | Field &1 is not a component of &2 | &1 = field name, &2 = source name | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `RunQuery`, a projected/filtered/sorted field absent from the source's component list |
| 024 | E | Filter operator &1 is not supported | &1 = supplied operator | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `RunQuery`, operator outside the EQ/NE/GT/GE/LT/LE/BT/LIKE/IN whitelist. This is the injection gate |
| 025 | E | Requested row count &1 exceeds the registered limit &2 | &1 = requested, &2 = registry `max_rows` | `ZFS_I_DynGateway` (`LHC_DynGateway`) — `RunQuery` row cap |
| 026 | S | &1 executed successfully, &2 row(s) affected | &1 = target name, &2 = row count | `ZFS_I_DynGateway` (`LHC_DynGateway`) — success path of all three dispatch actions |

| 027 | E | Program &1 does not exist or is not executable | &1 = program name | `ZFS_I_DynGateway` (`LCL_SUBMIT_RUNNER`) — `SUBM` step, `TRDIR` miss or `SUBC <> '1'` (an include, module pool, subroutine pool or function-group main program) |
| 028 | E | Output mode &1 is not supported for a SUBMIT step | &1 = supplied mode | `ZFS_I_DynGateway` (`LCL_SUBMIT_RUNNER`) — `Operation` outside the `SALV`/`LIST`/`MEMO`/`NONE` set |
| 029 | E | Value &1 for selection field &2 is invalid or exceeds its length | &1 = value, &2 = SELNAME | `ZFS_I_DynGateway` (`LCL_SUBMIT_RUNNER`) — `RSPARAMS` bounds: `SELNAME` over 8 chars, `LOW`/`HIGH` over 45, or a type-implausible literal. The `SUBM` analogue of L-310 |
| 030 | E | Variant &1 does not exist for program &2 | &1 = variant, &2 = program name | `ZFS_I_DynGateway` (`LCL_SUBMIT_RUNNER`) — `ImportJson.Variant` given but absent from `VARID` |
| 031 | E | You are not authorized to submit program &1 | &1 = program name | `ZFS_RFC_DYNGW_SUBMIT` — explicit `AUTHORITY-CHECK OBJECT 'S_PROGRAM'` on `TRDIR-SECU` before the `SUBMIT`, so a failure is a clean refusal rather than an empty body (L-313) |
| 032 | E | No output could be captured from program &1 in mode &2 | &1 = program name, &2 = capture mode | `ZFS_RFC_DYNGW_SUBMIT` — SALV interception returned nothing, or the list memory / ABAP memory id was empty. Distinguishes "this report is not SALV" from "the report legitimately returned no rows" |

| 033 | E | You are not authorized to register gateway target &1 | &1 = target name | `ZCL_FS_SLC_GW_REGI` — `REGI` step refused by `ZCL_FS_SLC_GW_REGPOL` (`AUTH` mode without the registration authorization, or `OFF` mode) |
| 034 | E | Invalid registration payload for target &1: &2 | &1 = target name, &2 = reason | `ZCL_FS_SLC_GW_REGI` — `ImportJson` is not a valid registration row: unparseable, unknown `TargetKind`, or a missing mandatory column |
| 035 | E | Target &1 is already registered | &1 = target name | `ZCL_FS_SLC_GW_REGI` — `Operation` `INSERT` (the default) against a target that already has a registry row. Widening an existing registration must be typed out as `UPDATE` (L-344) |
| 036 | S | Target &1 registered, &2 row(s) affected | &1 = target name, &2 = row count | `ZCL_FS_SLC_GW_REGI` — success path of a `REGI` step. **Not** the generic 026: 026 reads "&1 executed successfully", which for a `REGI` step names the target being *registered* and so asserted an execution that never happened (L-370) |
| 037 | E | Request exceeds the &1 budget: &2 | &1 = budget name/kind, &2 = detail | `ZCL_FS_DYN_BUDGET` (dyngw v2, not yet built — Task 8+) — request-cost/budget guard |
| 038 | S | Request &1 replayed from call &2 | &1 = `RequestId`, &2 = original call UUID | dyngw v2 orchestrator — idempotency hit on a repeated `RequestId` |
| 039 | E | Target &1 belongs to the gateway framework and is not a permitted target | &1 = target name | dyngw v2 self-protection, **three consumers**: Task 4's RAP `validateTarget` (at registration), `ZCL_FS_DYN_HDL_TABLE=>REJECT_OWN_OBJECT` (a `TABL` step at execution — a **write**, where nothing is being registered) and `ZCL_FS_DYN_HDL_REGI=>REJECT_OWN_OBJECT` (a `REGI` step). **Reworded 2026-09-13** from "…and cannot be registered", which was false on the TABL route: a refused caller was told about an operation they never attempted. One concept, three routes, one route-neutral text |
| 040 | E | You are not authorized to &1 gateway targets | &1 = attempted operation (e.g. "register", "execute") | `ZCL_FS_DYN_AUTH` (dyngw v2) — `ZFS_DYNGW` authorization object check failed |
| 041 | E | &1 returned a business error: &2 | &1 = target name, &2 = business error text | dyngw v2 dispatcher — `BAPIRET2`/`RETURN` scan classifies the outcome as `ErrorCategory = BUSINESS` |
| 042 | E | Paging requires a stable sort order for &1 | &1 = source name | dyngw v2 `RunQuery` — a `Skip`/paged read was requested without an explicit, stable sort |
| 043 | E | Program &1 cannot be submitted: &2 | &1 = program name, &2 = reason | dyngw v2 `RegisterTarget` — `SUBM` target qualification at registration time (disqualifies e.g. a `CL_GUI_*` reference) |
| 044 | S | &1 call log row(s) and &2 step row(s) deleted | &1 = call rows deleted, &2 = step rows deleted | dyngw v2 `ZFS_R_DYN_PURGE` (not yet built) — retention/purge report success |
| 045 | E | Batch aborted at step &1: &2 | &1 = step index, &2 = abort reason | dyngw v2 `ExecuteBatch` — abort mid-batch (v1 overloaded 020 for this; v2 gives it its own number) |
| 046 | E | Retention age &1 days is below the minimum &2 days | &1 = requested `p_days`, &2 = idempotency-window floor constant (30) | dyngw v2 `ZFS_R_DYN_PURGE` — below-the-idempotency-floor refusal, raised when the selection-screen `p_days` is less than the 30-day floor; the report deletes nothing when this fires |
| 047 | E | Dynamic gateway error: &1 &2 &3 &4 | &1-&4 = the exception's `MSGV1`-`MSGV4` | dyngw v2 `ZCX_FS_DYN_ERROR` — the exception class's own **T100 default**, used when a raise site supplies no `textid`. Before it existed that fallback was `if_t100_message=>default_textid`, i.e. `SY`/`530`, which violates L-210; see L-400. Not raised deliberately by any handler — every handler passes an explicit `textid` — so a 047 in the log means a raise site forgot one |
| 048 | W | &1: &2 of &3 row(s) written | &1 = target name, &2 = rows the database actually touched (`SY-DBCNT`), &3 = rows the caller sent | dyngw v2 `ZCL_FS_DYN_HDL_TABLE=>ZIF_FS_DYN_HANDLER~EXECUTE` — the **partial-write** path (`INSERT ... ACCEPTING DUPLICATE KEYS` where `SY-DBCNT < LINES( )`, L-312). Replaces the reuse of **026** at severity `W`, which reported a partial outcome with a success text — the mistake L-370 already cost this project once |
| 049 | E | Internal gateway error in &1: &2 | &1 = target/step name, &2 = what was violated | dyngw v2 — the framework's own call sequence broken, not a caller error and nothing dynamic involved. Raised by `LCL_GUARDED_HANDLER` in `ZCL_FS_DYN_FACTORY` and by `ZCL_FS_DYN_HDL_REGI=>ZIF_FS_DYN_HANDLER~EXECUTE`, both for "execute called without a successful prepare". Both used **020** "Dynamic call of &1 failed" until 2026-09-13, which sent a debugger looking for a dynamic call that does not exist |
| 050 | E | Generator field &1 does not exist on target &2 | &1 = generator field name, &2 = target name | dyngw v2 server-side field generators (Tasks 2–9, `docs/superpowers/plans/2026-09-15-1410-dyngw-v2-generators.md`) — not yet built; raised when a registered generator config names a field absent from the target's structure |
| 051 | E | Number range object &1 is not permitted for target &2 | &1 = number range object, &2 = target name | dyngw v2 server-side field generators — not yet built; raised when a registration attempts to attach a number-range generator the target does not allow (e.g. self-protection or a disallowed object) |
| 052 | E | Generation is not permitted for target &1 | &1 = target name | dyngw v2 server-side field generators — not yet built; raised when a caller requests generation but the registry row does not have generation enabled for the target |
| 053 | E | Number range &1 could not supply a number for &2 | &1 = number range object, &2 = target/field name | dyngw v2 server-side field generators — not yet built; raised when `NUMBER_GET_NEXT` (or equivalent) fails to return a usable number, e.g. the interval is exhausted |
| 054 | E | Number range generation is not allowed with commit mode NEVER | — | dyngw v2 server-side field generators — not yet built; a number-range draw is only meaningful inside a commit, so it is refused outright under `CommitMode = NEVER` |
| 055 | E | Field &1 in line &2 contains HTML/script tag characters - not allowed | &1 = technical field name (from RTTI, never caller text), &2 = position in the request (0 = header, n = nth `NP_ACC` line) | Beacon accounting OData `CREATE_DEEP_ENTITY` input guard `CHECK_NO_MARKUP` in `ZCL_ZFS_BEACON_ACCO_01_DPC_EXT` (V1) and `ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT` (_LOCL): a character field contains `<` or `>`. The whole request is rejected (HTTP 400). Created 2026-09-24 on `DS4K907194` (task of `DS4K907018`, where the class is locked), for the XSS audit finding. It deliberately echoes no caller value (`worklog/DS4_100_NIIF/2026-09/2026-09-24-1213-beacon-xss-input-guard.md`) |
| 056 | E | Filter on CompanyCode and FinancialTransaction (eq) is required | — | `ZCL_FS_TRM_DEALITEM_QUERY` — a GET on any deal-item entity set (`ZFS_SB_TRMDEALITEM_O4_API`) without an `eq` filter on both deal key fields; raised as `CX_RAP_QUERY_COND` textid. Created 2026-09-25 on DS4K907018 (task DS4K907194, where `ZFS_TRM_MSG` is locked), verified in `T100` (56 rows) |
| 057 | E | Flow created on deal &1 but its key could not be determined | &1 = financial transaction | `ZBP_FS_TRMDEALADDFLOWTP` / `ZBP_FS_TRMDEALMAINFLOWTP` create — the flow was committed, but the post-commit re-list did not yield exactly one new matching flow; the caller must re-list the deal. Created 2026-09-25 on DS4K907018 (task DS4K907194), verified in `T100` |
| 058 | E | Deal &1 &2 may be saved despite the error - check before retrying | &1 = company code, &2 = financial transaction (ALPHA out) | `ZBP_FS_TRMIRATETP` / `ZBP_FS_TRMFXTP` create — DEALCREATE returned a deal number and the commit was attempted, but an error came back (commit RFC failure or E/A from `BAPI_TRANSACTION_COMMIT`); the deal may exist, so the caller must check before retrying (Phase 2 review finding F1). Created 2026-09-25 on DS4K907018 (task DS4K907194), verified in `T100` |

All 49 pre-existing messages remain flagged **self-explanatory**; 050–054 follow the same
convention.

**Next free number: 059.**

**Reconciled against the live system 2026-09-13 (Task 21, documentation).**
`SELECT msgnr, text FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG' AND msgnr BETWEEN '037'
AND '049'` returned 13 rows whose text matches every row in this file, verbatim, number for
number. `SELECT MAX( msgnr ), COUNT(*) FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'` ->
**49 rows, max 049** — confirms "next free number: 050" above and that no message beyond 049 has
been created since fix round 1. **No drift found**; this file already reflected the system
(fix round 1's own entry below had already brought it current).

Messages **037–045** were allocated on 2026-09-12, ahead of their consumers, for the dynamic
gateway v2 rebuild (`ZFS_DYN_GW` package) — Task 1 of the 21-task plan
(`docs/superpowers/plans/2026-09-12-1032-dyngw-v2.md`), so that Tasks 8–19 (which raise them) don't each
make a separate, collision-prone allocation against this shared "next free number". None of the
raising objects exist yet; the "raising object" column above names the class/report each message
is *planned* for per `docs/superpowers/specs/2026-09-12-1033-dyngw-v2-design.md` §9 — re-verify against
the actual class name once built, since design names can still drift during implementation. Landed
on transport **`DS4K907194`**, the same task under `DS4K907018` that already carries messages
017–036 for this class (confirmed live via `transportInfo` before creation, per L-355 — not
assumed to be the gateway's own `DS4K907263`, which does not hold this object at all).
(`worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md`.)

Message **047** was added on 2026-09-12 during the Task 6+8 fix round
(`worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md`, L-400), on transport
**`DS4K907194`** — the same task 033-046 used, confirmed live by `transportInfo` on
`/sap/bc/adt/messageclass/zfs_trm_msg` before the write, not assumed. Verified after the write with
`SELECT COUNT(*) FROM t100 WHERE arbgb = 'ZFS_TRM_MSG' AND sprsl = 'E'` -> **47**, and
`SELECT msgnr, text ... BETWEEN '044' AND '047'` -> 047 = `Dynamic gateway error: &1 &2 &3 &4`.
Note that `MSAG/N` needs **no** activation step: the `setObjectSource` PUT writes `T100` directly,
and `activateObjects` on a message class fails with *"Object type MSAD is not defined"* while the
messages are already live and the class is absent from `inactiveObjects`.

Message **036** was added on 2026-09-12 so a `REGI` step stops reporting itself with 026
(`worklog/DS4_100_NIIF/2026-09/2026-09-12-1738-regi-message-036.md`, L-370). Like 033–035 it landed on
**`DS4K907194`**, not on the gateway transport `DS4K907263` that carries the class raising it —
the L-355 split is unchanged and still has to be resolved before release.

The dynamic gateway v2 `TABL` handler (`ZCL_FS_DYN_HDL_TABLE`, Task 10, 2026-09-12) **created no
message**. It reuses 018 (operation outside INSERT/MODIFY/DELETE, or an operation the registry row
pins away from), 021 (source does not exist — raised by `ZCL_FS_DYN_RUNTIME=>COMPONENTS_OF`),
022 (`ImportJson` is not a JSON array), 037 (row set over the registered write-row ceiling) and
039 (self-protection: a `ZFS_T_DYN_*` / `ZFS_RFC_DYN_*` / `ZFS_T_SLC_GW*` target).

Messages **050–054** were added on 2026-09-15 for Task 2 of the 9-task dyngw v2 server-side field
generators plan (`docs/superpowers/plans/2026-09-15-1410-dyngw-v2-generators.md`,
`worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md`), on transport
**`DS4K907300`** — created by Task 1 of the same plan, confirmed the transport every task 2–9
reuses. Added via `lock`/`setObjectSource`/`unLock` on `/sap/bc/adt/messageclass/zfs_trm_msg`
through `mcp-abap-abap-adt-api` — the confirmed `MSAG/N` route, since `adt-mcp` has no adapter for
message classes. `SELECT COUNT(*) FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'` read
**49** immediately before the write and **54** immediately after; a row read of 050–054 matched the
brief's texts character-for-character, and a full re-read of 001–049 confirmed all pre-existing
messages survived byte-for-byte. None of the raising objects exist yet — Tasks 5, 6 and 7 raise
these once the generator handler, number-range wiring and dispatcher guard are built.

**Superseded 2026-09-13 (fix round 1).** The partial-write path used to reuse **026** at severity
`W`. That is a success text ("&1 executed successfully, &2 row(s) affected") carrying a partial
outcome: a caller reading the message alone was told the write succeeded, and only the severity —
plus a `ResultCount` they would have had to compare against their own row count — said otherwise.
It now raises **048** "&1: &2 of &3 row(s) written", which states both numbers in the text.

Messages **033–035** were added on 2026-09-11 for the dynamic gateway's `REGI` step kind
(`worklog/DS4_100_NIIF/2026-09/2026-09-11-1243-gateway-completion.md`), on transport `DS4K907263`, and verified
in `T100` after the write. `REGI` also **reuses** 017, 018, 020, 022 and 026 rather than adding
near-duplicates.

Messages **027–032** were added on 2026-09-10 for the dynamic gateway's `SUBM` step kind
(`worklog/DS4_100_NIIF/2026-09/2026-09-10-1243-dyngateway-submit-kind.md`), on transport `DS4K907018`, and
verified in `T100` after the write. `SUBM` also **reuses** 017, 018, 022, 023, 024, 025 and 026
rather than adding near-duplicates.

## Naming

`ZFS_TRM_MSG` is a **listed exception** to the `ZFS_MSG_<AREA>` pattern — named by the human, valid
as-is. See the *Classic & Misc* section of `docs/naming-conventions.md`. Do not "correct" it.

## Fix round 1 — 2026-09-13 (dyngw v2)

Message **039** reworded, and messages **048** (W) and **049** (E) created, in one
`lock`/`setObjectSource`/`unLock` on `/sap/bc/adt/messageclass/zfs_trm_msg` via
`mcp-abap-abap-adt-api` — the confirmed `MSAG` route, `adt-mcp` has no adapter. Transport
**`DS4K907194`**, confirmed live by `transportInfo` before the write (the object is locked in that
task; it is *not* on the gateway's own `DS4K907263`). Verified after the write with
`SELECT COUNT(*) FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'` -> **49** (was 47) and a
row read of 039-049; all 47 pre-existing messages survived unchanged.
(`worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md`, section "Fix round 1".)
