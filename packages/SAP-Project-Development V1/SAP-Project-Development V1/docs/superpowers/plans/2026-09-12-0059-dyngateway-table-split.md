# Dynamic Gateway Table Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `ZFS_T_SLC_DYNGW` table with four purpose-built tables, move transaction ownership out of the RAP saver so an aborted batch actually rolls back, and add an error taxonomy, registry change history and an idempotency key.

**Architecture:** Four tables — `ZFS_T_SLC_GWREG` (allow-list, buffered), `ZFS_T_SLC_GWREGH` (allow-list change history), `ZFS_T_SLC_GWCALL` (one row per HTTP call) and `ZFS_T_SLC_GWSTEP` (one row per step, composition child). A new orchestrator `ZCL_FS_SLC_GW_TXN` owns the LUW above RAP and rolls back *before* writing the log, which closes L-350 and lets the `DESTINATION 'NONE'` durable-emit path be deleted. Everything is built alongside the old table and cut over in one task.

**Tech Stack:** ABAP (classic, not ABAP Cloud strict), RAP unmanaged BO, OData V4 A2X, DDIC transparent tables, ABAP Unit. No local build — every verification runs on `DS4`/`100` over MCP.

**Spec:** `docs/superpowers/specs/2026-09-12-0051-dyngateway-table-split-design.md`

## Global Constraints

Copied verbatim from the spec and `CLAUDE.md`. Every task's requirements implicitly include these.

- **System:** `DS4_100_NIIF` (`DS4` / client `100`, user `FS_DEV3`). Confirm before any write.
- **Package:** `ZFS_SLC_BTP`. **Transport:** `DS4K907263` (task `DS4K907264`).
- **Routing is per object: `adt-mcp` creates, `mcp-abap-abap-adt-api` changes.** No drifting to whichever server is open. A creation falling back to `mcp-abap-abap-adt-api` is legitimate only when `adt-mcp` genuinely cannot do it, and the reason goes in the worklog.
- **Naming gate is pre-create.** Record `NAMING: <name> -> matches <pattern row>` **before** the create call. All fourteen lines are pre-recorded in §8 of the spec — copy the relevant one into the worklog at the moment of creation. Stop and ask on any mismatch.
- **`deleteObject` is denied project-wide.** A shell created and then rejected is orphaned permanently. Validate before creating (Task 1).
- **Messages only from `ZFS_TRM_MSG`.** Next free number is **037**. Any message created goes into `docs/message-catalog/DS4_100_NIIF.md` in the same turn, and into the completion report.
- **Never create an object the human did not ask for.** If a task cannot be done with the objects listed, stop and report what is blocked.
- **Transparent table names: max 16 characters, platform-enforced.**
- **The five audit fields are mandatory on every table** (`docs/ddic-table-template.md`) — without them the RAP generators silently emit no ETag and no lock (L-218).
- **Two-step table build** (L-217): `adt-mcp` creates the skeleton, fields go in via `setObjectSource`; use `key client : mandt not null`.
- **Every activity: a `worklog/DS4_100_NIIF/` file + a ledger entry in the same turn** (L-200/L-234).
- **The four action URLs and their ten-field payloads must not change** beyond the optional `RequestId`.
- **Publish the service binding with `python scripts/sap-gui-publish-service.py --group-id zfs_sb_dyngateway_o4_api --yes`** — `publishServiceBinding` over ADT reports success without publishing (L-220/L-232).
- **Verification runs on SAP, never locally.** "Test" means: activation with 0 messages, ABAP Unit via `abap_run_unit_tests`, ATC via `abap_atc_run`, `scripts/gateway-regression.ps1`, and the acceptance suite in `docs/dyngateway-integration-guide.md` §12.
- **Repo commits carry docs, worklog and scripts only.** No ABAP source lives in this repo; the SAP-side record is the transport.

---

### Task 1: Pre-flight — inventory and settle the RAP validation risk

Nothing is created in this task. It exists because `deleteObject` is denied project-wide, so a wrong create is permanent. Open risk 1 in the spec must be answered before Task 2.

**Files:**
- Create: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0116-gwsplit-preflight.md`
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: a confirmed object inventory, and a recorded answer to "does RAP accept write actions on a read-only projection?" — Task 9 depends on this answer.

- [ ] **Step 1: Confirm the system and the destination**

```
mcp__sap-gui__sap_get_session_info
```
Expected: `system_name: DS4`, `client: 100`, `user: FS_DEV3`. `sap_connect` returning `ok` is not proof of logon — read `user` (L-213).

- [ ] **Step 2: List what actually exists in the package**

```
mcp__mcp-abap-abap-adt-api__nodeContents
  parent_type: DEVC/K
  parent_name: ZFS_SLC_BTP
```
Record every `ZCL_FS_SLC_GW_*`, `ZIF_FS_SLC_GW_*`, `ZFS_*DynGateway*` and `ZFS_AE_*` object in the worklog. `searchObject` has been returning HTTP 400 intermittently — if `nodeContents` also fails, retry once, then fall back to SE80 read-only in `sap-gui`. Do not guess names.

- [ ] **Step 3: Validate the risky object shape BEFORE creating anything**

```
mcp__adt-mcp__abap_creation-run_validation
  objectType: DDLS/DF
  name: ZFS_R_DynGwCallTP
  package: ZFS_SLC_BTP
```
Then validate the projection `ZFS_C_DynGwCallTP` and the behaviour definition. The question being answered: **can a BDEF declaring write actions sit on a read-only projection?** Record the literal response.

- [ ] **Step 4: Record the decision**

If validation accepts it, Task 9 proceeds as designed. If it rejects it, Task 9 uses the fallback from spec §4 — a dedicated action-carrier entity over a single-row source, with the same action names and URLs. Write the chosen path into the worklog as a `Decision:` line. **Do not create the object either way in this task.**

- [ ] **Step 5: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0116-gwsplit-preflight.md
git commit -m "worklog: gateway split pre-flight - inventory and RAP action validation"
```

---

### Task 2: Create the two call-log tables

**Files:**
- Create on SAP: `ZFS_T_SLC_GWCALL`, `ZFS_T_SLC_GWSTEP`
- Create: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0133-gwsplit-tables.md`

**Interfaces:**
- Consumes: the inventory from Task 1
- Produces: `zfs_t_slc_gwcall` and `zfs_t_slc_gwstep` as activated DDIC types. Tasks 4, 6 and 7 declare `TYPE zfs_t_slc_gwcall` / `TYPE zfs_t_slc_gwstep` against these exact names.

- [ ] **Step 1: Record the naming gate**

Write into the worklog, before any create call:

```
NAMING: ZFS_T_SLC_GWCALL -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWSTEP -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
```

- [ ] **Step 2: Create both skeletons with adt-mcp**

```
mcp__adt-mcp__abap_creation-create_object
  objectType: TABL/DT
  name: ZFS_T_SLC_GWCALL
  description: Dynamic Gateway - Call Log Header
  package: ZFS_SLC_BTP
  transport: DS4K907263
```
Repeat for `ZFS_T_SLC_GWSTEP`, description `Dynamic Gateway - Call Log Step`.

- [ ] **Step 3: Set the fields on GWCALL via setObjectSource**

Two-step build per L-217 — the skeleton has no usable fields until this runs.

```abap
@EndUserText.label : 'Dynamic Gateway - Call Log Header'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #L
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zfs_t_slc_gwcall {

  key client            : mandt not null;
  key call_uuid         : sysuuid_x16 not null;
  action                : abap.char(20);
  request_id            : abap.char(36);
  commit_mode           : abap.char(6);
  exec_status           : abap.char(1);
  error_category        : abap.char(8);
  message_id            : arbgb;
  message_no            : msgnr;
  message_text          : abap.char(220);
  step_count            : int4;
  result_count          : int4;
  duration_ms           : int4;
  request_json          : abap.string(0);
  request_truncated     : abap.char(1);
  executed_by           : syuname;
  executed_at           : timestampl;
  zcreated_by           : tb_cruser;
  zcreated_date         : tb_dcrdat;
  zcreated_time         : tb_tcrtim;
  zchanged_by           : tb_upuser;
  zchanged_date         : tb_dupdat;
  zchanged_time         : tb_tuptim;
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```

Use `mcp__mcp-abap-abap-adt-api__lock` → `setObjectSource` (objectSourceUrl `/sap/bc/adt/ddic/tables/zfs_t_slc_gwcall/source/main`, transport `DS4K907263`) → `unLock`. **Unlock before activating** — activation fails with "User FS_DEV3 is currently editing" otherwise.

- [ ] **Step 4: Set the fields on GWSTEP**

```abap
@EndUserText.label : 'Dynamic Gateway - Call Log Step'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #L
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zfs_t_slc_gwstep {

  key client            : mandt not null;
  key step_uuid         : sysuuid_x16 not null;
  call_uuid             : sysuuid_x16;
  step_index            : int4;
  step_kind             : abap.char(4);
  target_name           : abap.char(30);
  operation             : abap.char(10);
  reg_uuid              : sysuuid_x16;
  exec_status           : abap.char(1);
  severity              : abap.char(1);
  error_category        : abap.char(8);
  message_id            : arbgb;
  message_no            : msgnr;
  message_text          : abap.char(220);
  result_count          : int4;
  duration_ms           : int4;
  response_json         : abap.string(0);
  response_truncated    : abap.char(1);
  zcreated_by           : tb_cruser;
  zcreated_date         : tb_dcrdat;
  zcreated_time         : tb_tcrtim;
  zchanged_by           : tb_upuser;
  zchanged_date         : tb_dupdat;
  zchanged_time         : tb_tuptim;
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```

- [ ] **Step 5: Activate both in ONE call**

```
mcp__adt-mcp__abap_activate_objects
  objects: [ZFS_T_SLC_GWCALL, ZFS_T_SLC_GWSTEP]
```
Expected: 0 messages. Activating dependent DDIC objects in one call avoids the ordering failures of L-209.

- [ ] **Step 6: Verify the shape came out right**

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWCALL
```
Expected: `CNT = 0` — proves the table exists and is readable. Repeat for `ZFS_T_SLC_GWSTEP`.

- [ ] **Step 7: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0133-gwsplit-tables.md
git commit -m "worklog: create GWCALL and GWSTEP call-log tables"
```

---

### Task 3: Create the two registry tables

**Files:**
- Create on SAP: `ZFS_T_SLC_GWREG`, `ZFS_T_SLC_GWREGH`
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0133-gwsplit-tables.md`

**Interfaces:**
- Consumes: nothing from Task 2 (independent)
- Produces: `zfs_t_slc_gwreg` and `zfs_t_slc_gwregh` as activated DDIC types. Task 8 declares against these names.

- [ ] **Step 1: Record the naming gate**

```
NAMING: ZFS_T_SLC_GWREG  -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (15 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWREGH -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
```

- [ ] **Step 2: Create both skeletons with adt-mcp**

Same call shape as Task 2 Step 2. Descriptions: `Dynamic Gateway - Allow List` and `Dynamic Gateway - Allow List History`.

- [ ] **Step 3: Set the fields on GWREG**

Note `deliveryClass : #C` — this is configuration and is a deliberate change from the old table's `#A` (spec §3.1, open risk 3).

```abap
@EndUserText.label : 'Dynamic Gateway - Allow List'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zfs_t_slc_gwreg {

  key client            : mandt not null;
  key reg_uuid          : sysuuid_x16 not null;
  target_kind           : abap.char(4);
  target_name           : abap.char(30);
  operation             : abap.char(10);
  is_active             : abap.char(1);
  allow_read            : abap.char(1);
  allow_write           : abap.char(1);
  call_mode             : abap.char(1);
  max_rows              : int4;
  log_level             : abap.char(1);
  descr                 : abap.char(60);
  zcreated_by           : tb_cruser;
  zcreated_date         : tb_dcrdat;
  zcreated_time         : tb_tcrtim;
  zchanged_by           : tb_upuser;
  zchanged_date         : tb_dupdat;
  zchanged_time         : tb_tuptim;
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```

- [ ] **Step 4: Set the fields on GWREGH**

```abap
@EndUserText.label : 'Dynamic Gateway - Allow List History'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zfs_t_slc_gwregh {

  key client            : mandt not null;
  key hist_uuid         : sysuuid_x16 not null;
  reg_uuid              : sysuuid_x16;
  change_type           : abap.char(1);
  target_kind           : abap.char(4);
  target_name           : abap.char(30);
  before_json           : abap.string(0);
  after_json            : abap.string(0);
  source                : abap.char(4);
  call_uuid             : sysuuid_x16;
  changed_by            : syuname;
  changed_at            : timestampl;
  zcreated_by           : tb_cruser;
  zcreated_date         : tb_dcrdat;
  zcreated_time         : tb_tcrtim;
  zchanged_by           : tb_upuser;
  zchanged_date         : tb_dupdat;
  zchanged_time         : tb_tuptim;
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```

- [ ] **Step 5: Activate both in one call, then verify**

```
mcp__adt-mcp__abap_activate_objects
  objects: [ZFS_T_SLC_GWREG, ZFS_T_SLC_GWREGH]
```
Expected: 0 messages. Then `SELECT COUNT(*)` on each — expect 0.

- [ ] **Step 6: Add the technical settings**

`GWREG` must be **fully buffered** and `GWCALL` / `GWSTEP` / `GWREGH` must **not** be buffered. Buffering is a technical setting, not part of the DDL source. Set it in SE11 → Technical Settings (`sap-gui`, read/maintain only — this is a technical setting, not ABAP source, so it is not the forbidden case). Record in the worklog which tables were set to which.

Expected for `GWREG`: Buffering switched on, "Fully Buffered".

- [ ] **Step 7: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0133-gwsplit-tables.md
git commit -m "worklog: create GWREG and GWREGH registry tables, set buffering"
```

---

### Task 4: `ZCL_FS_SLC_GW_TXN` — the transaction decision, test-first

This is the L-350 fix. The decision logic is a **pure function** so it can be unit tested without a database; the LUW statements live in a thin method around it.

**Files:**
- Create on SAP: `ZCL_FS_SLC_GW_TXN` + its test include
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md`

**Interfaces:**
- Consumes: `zcl_fs_slc_gw_base=>ty_step_result`, `tt_step_result` (existing, unchanged)
- Produces:
  - `zcl_fs_slc_gw_txn=>ty_decision` — `BEGIN OF ty_decision, rollback TYPE abap_bool, exec_status TYPE c LENGTH 1, failed_step TYPE i, END OF ty_decision`
  - `zcl_fs_slc_gw_txn=>decide( it_results TYPE zcl_fs_slc_gw_base=>tt_step_result, iv_commit_mode TYPE c ) RETURNING VALUE(rs_decision) TYPE ty_decision`
  - `zcl_fs_slc_gw_txn=>finish( is_decision TYPE ty_decision, it_call TYPE ..., it_steps TYPE ... )` — performs `ROLLBACK WORK` / log write / `COMMIT WORK`

  Task 7 calls `decide( )` then `finish( )`. No other component touches transaction control.

- [ ] **Step 1: Record the naming gate and create the class shell**

```
NAMING: ZCL_FS_SLC_GW_TXN -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

```
mcp__adt-mcp__abap_creation-create_object
  objectType: CLAS/OC
  name: ZCL_FS_SLC_GW_TXN
  description: Dynamic Gateway - transaction orchestrator
  package: ZFS_SLC_BTP
  transport: DS4K907263
```

- [ ] **Step 2: Create the test include and write the failing tests**

```
mcp__mcp-abap-abap-adt-api__createTestInclude
  objectUrl: /sap/bc/adt/oo/classes/zcl_fs_slc_gw_txn
```

Then `setObjectSource` on `/sap/bc/adt/oo/classes/zcl_fs_slc_gw_txn/includes/testclasses`:

```abap
CLASS ltc_gw_txn DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS all_steps_ok_commits            FOR TESTING.
    METHODS failed_step_rolls_back          FOR TESTING.
    METHODS commit_never_still_rolls_back   FOR TESTING.
    METHODS commit_never_all_ok_rolls_back  FOR TESTING.
    METHODS business_error_does_not_abort   FOR TESTING.

    METHODS result
      IMPORTING iv_step          TYPE i
                iv_status        TYPE c
                iv_category      TYPE c
      RETURNING VALUE(rs_result) TYPE zcl_fs_slc_gw_base=>ty_step_result.
ENDCLASS.

CLASS ltc_gw_txn IMPLEMENTATION.

  METHOD result.
    rs_result-step           = iv_step.
    rs_result-execstatus     = iv_status.
    rs_result-error_category = iv_category.
  ENDMETHOD.

  METHOD all_steps_ok_commits.
    DATA(lt) = VALUE zcl_fs_slc_gw_base=>tt_step_result(
      ( result( iv_step = 1 iv_status = 'S' iv_category = space ) )
      ( result( iv_step = 2 iv_status = 'S' iv_category = space ) ) ).

    DATA(ls) = zcl_fs_slc_gw_txn=>decide( it_results     = lt
                                          iv_commit_mode = 'AUTO' ).

    cl_abap_unit_assert=>assert_equals( act = ls-rollback    exp = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls-exec_status exp = 'S' ).
  ENDMETHOD.

  METHOD failed_step_rolls_back.
    DATA(lt) = VALUE zcl_fs_slc_gw_base=>tt_step_result(
      ( result( iv_step = 1 iv_status = 'S' iv_category = space ) )
      ( result( iv_step = 2 iv_status = 'E' iv_category = 'TARGET' ) ) ).

    DATA(ls) = zcl_fs_slc_gw_txn=>decide( it_results     = lt
                                          iv_commit_mode = 'AUTO' ).

    cl_abap_unit_assert=>assert_equals( act = ls-rollback    exp = abap_true ).
    cl_abap_unit_assert=>assert_equals( act = ls-exec_status exp = 'E' ).
    cl_abap_unit_assert=>assert_equals( act = ls-failed_step exp = 2 ).
  ENDMETHOD.

  METHOD commit_never_still_rolls_back.
    " CommitMode NEVER means "do not commit", not "do not roll back".
    DATA(lt) = VALUE zcl_fs_slc_gw_base=>tt_step_result(
      ( result( iv_step = 1 iv_status = 'E' iv_category = 'TARGET' ) ) ).

    DATA(ls) = zcl_fs_slc_gw_txn=>decide( it_results     = lt
                                          iv_commit_mode = 'NEVER' ).

    cl_abap_unit_assert=>assert_equals( act = ls-rollback exp = abap_true ).
  ENDMETHOD.

  METHOD commit_never_all_ok_rolls_back.
    " The case that makes NEVER mean anything. finish( ) must COMMIT WORK
    " to make the log durable, and COMMIT WORK commits EVERYTHING pending -
    " so without an explicit rollback, NEVER would commit the caller's work
    " via the log's own commit, which is precisely what NEVER promises not
    " to do. Rolling back first discards the work and leaves the commit
    " carrying only the log.
    DATA(lt) = VALUE zcl_fs_slc_gw_base=>tt_step_result(
      ( result( iv_step = 1 iv_status = 'S' iv_category = space ) )
      ( result( iv_step = 2 iv_status = 'S' iv_category = space ) ) ).

    DATA(ls) = zcl_fs_slc_gw_txn=>decide( it_results     = lt
                                          iv_commit_mode = 'NEVER' ).

    cl_abap_unit_assert=>assert_equals( act = ls-rollback exp = abap_true ).
    " Every step succeeded, so the OUTCOME is still S - only the work is discarded.
    cl_abap_unit_assert=>assert_equals( act = ls-exec_status exp = 'S' ).
  ENDMETHOD.

  METHOD business_error_does_not_abort.
    " A BAPI that returned E in RETURN dispatched fine. Whether that should
    " abort the batch is the caller's decision, not the dispatcher's - so the
    " transaction is NOT rolled back on a BUSINESS category alone.
    DATA(lt) = VALUE zcl_fs_slc_gw_base=>tt_step_result(
      ( result( iv_step = 1 iv_status = 'S' iv_category = 'BUSINESS' ) ) ).

    DATA(ls) = zcl_fs_slc_gw_txn=>decide( it_results     = lt
                                          iv_commit_mode = 'AUTO' ).

    cl_abap_unit_assert=>assert_equals( act = ls-rollback exp = abap_false ).
  ENDMETHOD.

ENDCLASS.
```

**Note:** `ty_step_result` does not have an `error_category` component yet — Task 5 adds it. Run these tests expecting a *syntax* failure at this point; that is the intended red state.

- [ ] **Step 3: Run the tests and confirm they fail**

```
mcp__adt-mcp__abap_run_unit_tests
  objectName: ZCL_FS_SLC_GW_TXN
```
Expected: FAIL — `decide` is not defined, and `error_category` is not a component of `ty_step_result`.

- [ ] **Step 4: Add both foundation-class members, in ONE edit**

`setObjectSource` on `ZCL_FS_SLC_GW_BASE`. Two additions, made together and activated once:

1. A line in `ty_step_result`, after `execstatus`:

```abap
             error_category TYPE c LENGTH 8,
```

2. A table type in the public section, next to the other `tt_*` declarations:

```abap
    TYPES tt_log_step TYPE STANDARD TABLE OF zfs_t_slc_gwstep WITH EMPTY KEY.
```

These are the only changes to the foundation class in the whole plan. Activate after unlocking.

- [ ] **Step 5: Write the minimal implementation**

`setObjectSource` on `/sap/bc/adt/oo/classes/zcl_fs_slc_gw_txn/source/main`:

```abap
**********************************************************************
* Dynamic gateway - transaction orchestrator.
*
* ONE component owns the LUW, and it sits ABOVE RAP. Nothing below it
* issues COMMIT or ROLLBACK.
*
* L-350: the old design emitted the durable log through a synchronous
* DESTINATION 'NONE' RFC, which implicitly commits the CALLER - so an
* aborting batch committed the very writes the abort existed to undo.
* Rolling back BEFORE writing the log removes the hazard rather than
* working around it: there is no pending work left for any implicit
* commit to catch.
*
* COMMIT/ROLLBACK WORK inside a RAP behaviour implementation breaks
* RAP's transactional contract. That is why this class is called from
* the action, not from the saver.
**********************************************************************
CLASS zcl_fs_slc_gw_txn DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES: BEGIN OF ty_decision,
             rollback    TYPE abap_bool,
             exec_status TYPE c LENGTH 1,
             failed_step TYPE i,
           END OF ty_decision.

    "! Pure: decides commit vs rollback from the step results alone.
    "! No database, no transaction statements - so it is unit testable.
    CLASS-METHODS decide
      IMPORTING it_results        TYPE zcl_fs_slc_gw_base=>tt_step_result
                iv_commit_mode    TYPE clike
      RETURNING VALUE(rs_decision) TYPE ty_decision.

    "! Applies the decision: rollback first, then log, then commit.
    CLASS-METHODS finish
      IMPORTING is_decision TYPE ty_decision
                is_call     TYPE zfs_t_slc_gwcall
                it_steps    TYPE zcl_fs_slc_gw_base=>tt_log_step.

ENDCLASS.


CLASS zcl_fs_slc_gw_txn IMPLEMENTATION.

  METHOD decide.
    rs_decision-exec_status = zcl_fs_slc_gw_base=>c_status-ok.

    LOOP AT it_results INTO DATA(ls_result).
      " A BUSINESS error means the target ran and said no. That is a
      " valid outcome of a working dispatch, not a reason to roll back -
      " the caller decides via CommitMode whether to care.
      IF ls_result-execstatus = zcl_fs_slc_gw_base=>c_status-error.
        rs_decision-rollback    = abap_true.
        rs_decision-exec_status = zcl_fs_slc_gw_base=>c_status-error.
        rs_decision-failed_step = ls_result-step.
        RETURN.
      ENDIF.
    ENDLOOP.

    " NEVER discards the work even when every step succeeded. finish( )
    " has to COMMIT WORK to make the log durable, and COMMIT WORK commits
    " everything pending - so without this, NEVER would commit the caller's
    " work through the log's own commit. Rolling back first leaves the
    " commit carrying only the log. The outcome stays S: the steps worked,
    " the caller simply asked for the writes not to be kept.
    IF iv_commit_mode = zcl_fs_slc_gw_base=>c_commit-never.
      rs_decision-rollback = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD finish.
    " Order is the whole point. Roll back first so the LUW is clean,
    " THEN write the log, THEN commit - so the commit carries the log
    " and nothing else.
    IF is_decision-rollback = abap_true.
      ROLLBACK WORK.
    ENDIF.

    INSERT zfs_t_slc_gwcall FROM @is_call.
    IF it_steps IS NOT INITIAL.
      INSERT zfs_t_slc_gwstep FROM TABLE @it_steps.
    ENDIF.

    COMMIT WORK.
  ENDMETHOD.

ENDCLASS.
```

`tt_log_step` was already added to `ZCL_FS_SLC_GW_BASE` in Step 4 — do not edit that class again here.

- [ ] **Step 6: Activate and run the tests**

```
mcp__mcp-abap-abap-adt-api__activateByName
  objectName: ZCL_FS_SLC_GW_TXN
  objectUrl: /sap/bc/adt/oo/classes/zcl_fs_slc_gw_txn
```
Unlock before activating. Expected: 0 messages.

```
mcp__adt-mcp__abap_run_unit_tests
  objectName: ZCL_FS_SLC_GW_TXN
```
Expected: 4 tests, all PASS.

- [ ] **Step 7: Run ATC on the new class**

```
mcp__adt-mcp__abap_atc_run
  objectName: ZCL_FS_SLC_GW_TXN
```
`ROLLBACK WORK` / `COMMIT WORK` may be flagged. **If ATC raises a priority 1 or 2 finding on the transaction statements, stop and report it** — spec open risk 2 says that outcome returns to the human, and the fallback is L-350 option (a). Do not suppress the finding.

- [ ] **Step 8: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md
git commit -m "worklog: ZCL_FS_SLC_GW_TXN - rollback before log, closes L-350"
```

---

### Task 5: Error taxonomy classifier, test-first

**Files:**
- Create on SAP: `ZCL_FS_SLC_GW_CLASSIFY` + test include
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md`

**Interfaces:**
- Consumes: `zcl_fs_slc_gw_base=>ty_outcome`
- Produces: `zcl_fs_slc_gw_classify=>of_message( iv_msgno TYPE symsgno ) RETURNING VALUE(rv_category) TYPE c LENGTH 8` and `zcl_fs_slc_gw_classify=>of_bapi_return( it_return TYPE bapiret2_t ) RETURNING VALUE(rv_category) TYPE c LENGTH 8`. Task 7 calls both.

- [ ] **Step 1: Naming gate and class shell**

```
NAMING: ZCL_FS_SLC_GW_CLASSIFY -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```
Create with `adt-mcp` as in Task 4 Step 1, description `Dynamic Gateway - error classification`.

- [ ] **Step 2: Write the failing tests**

```abap
CLASS ltc_classify DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS unregistered_is_client   FOR TESTING.
    METHODS not_permitted_is_auth    FOR TESTING.
    METHODS dynamic_failure_is_target FOR TESTING.
    METHODS success_is_blank         FOR TESTING.
    METHODS bapi_error_is_business   FOR TESTING.
    METHODS bapi_warning_is_blank    FOR TESTING.
ENDCLASS.

CLASS ltc_classify IMPLEMENTATION.

  METHOD unregistered_is_client.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_message( '017' ) exp = 'CLIENT' ).
  ENDMETHOD.

  METHOD not_permitted_is_auth.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_message( '018' ) exp = 'AUTH' ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_message( '033' ) exp = 'AUTH' ).
  ENDMETHOD.

  METHOD dynamic_failure_is_target.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_message( '020' ) exp = 'TARGET' ).
  ENDMETHOD.

  METHOD success_is_blank.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_message( '026' ) exp = space ).
  ENDMETHOD.

  METHOD bapi_error_is_business.
    DATA(lt) = VALUE bapiret2_t(
      ( type = 'W' id = 'FTR_GUI' number = '220' )
      ( type = 'E' id = 'FTR0'    number = '161' ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_bapi_return( lt ) exp = 'BUSINESS' ).
  ENDMETHOD.

  METHOD bapi_warning_is_blank.
    " The FTR partner warning is the real case: a W must NOT make the
    " step look failed - deal 0000000160445 was created with one.
    DATA(lt) = VALUE bapiret2_t(
      ( type = 'W' id = 'FTR_GUI' number = '220' )
      ( type = 'I' id = 'FTR0'    number = '162' ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_fs_slc_gw_classify=>of_bapi_return( lt ) exp = space ).
  ENDMETHOD.

ENDCLASS.
```

- [ ] **Step 3: Run and confirm failure**

```
mcp__adt-mcp__abap_run_unit_tests
  objectName: ZCL_FS_SLC_GW_CLASSIFY
```
Expected: FAIL — `of_message` / `of_bapi_return` not defined.

- [ ] **Step 4: Implement**

```abap
CLASS zcl_fs_slc_gw_classify DEFINITION
  PUBLIC
  ABSTRACT
  FINAL.

  PUBLIC SECTION.

    CONSTANTS: BEGIN OF c_cat,
                 client   TYPE c LENGTH 8 VALUE 'CLIENT',
                 auth     TYPE c LENGTH 8 VALUE 'AUTH',
                 target   TYPE c LENGTH 8 VALUE 'TARGET',
                 business TYPE c LENGTH 8 VALUE 'BUSINESS',
               END OF c_cat.

    "! Whose problem is this message? See the spec's taxonomy table.
    CLASS-METHODS of_message
      IMPORTING iv_msgno          TYPE symsgno
      RETURNING VALUE(rv_category) TYPE c LENGTH 8.

    "! BUSINESS is the case ExecStatus cannot express: the dispatch
    "! worked and the target refused the request. A W or I is NOT an
    "! error - the FTR partner-validity warning rides along with every
    "! successful deal create.
    CLASS-METHODS of_bapi_return
      IMPORTING it_return         TYPE bapiret2_t
      RETURNING VALUE(rv_category) TYPE c LENGTH 8.

ENDCLASS.


CLASS zcl_fs_slc_gw_classify IMPLEMENTATION.

  METHOD of_message.
    CASE iv_msgno.
      WHEN '017' OR '019' OR '021' OR '022' OR '023' OR '024'
        OR '025' OR '028' OR '029' OR '030' OR '034' OR '035'.
        rv_category = c_cat-client.
      WHEN '018' OR '031' OR '033'.
        rv_category = c_cat-auth.
      WHEN '020' OR '027' OR '032'.
        rv_category = c_cat-target.
      WHEN OTHERS.
        CLEAR rv_category.          " 026 / 036 and anything unclassified
    ENDCASE.
  ENDMETHOD.

  METHOD of_bapi_return.
    LOOP AT it_return TRANSPORTING NO FIELDS
         WHERE type = 'E' OR type = 'A'.
      rv_category = c_cat-business.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
```

- [ ] **Step 5: Activate, run tests, run ATC**

Expected: activation 0 messages; 6 tests PASS; ATC clean.

- [ ] **Step 6: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md
git commit -m "worklog: error taxonomy classifier with BUSINESS category"
```

---

### Task 6: Idempotency — replay detection, test-first

**Files:**
- Create on SAP: `ZCL_FS_SLC_GW_IDEM` + test include
- Modify: `ZFS_AE_DynGwRequest` (add `RequestId`), `ZFS_AE_DynGwResponse` (add `Replayed`)
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md`

**Interfaces:**
- Consumes: `zfs_t_slc_gwcall`
- Produces: `zcl_fs_slc_gw_idem=>find_replay( iv_request_id TYPE clike ) RETURNING VALUE(rs_call) TYPE zfs_t_slc_gwcall` — returns an initial structure when there is no prior call. Task 7 calls it before executing anything.

- [ ] **Step 1: Naming gate and class shell**

```
NAMING: ZCL_FS_SLC_GW_IDEM -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

- [ ] **Step 2: Add the unique index that makes this safe**

In SE11 → `ZFS_T_SLC_GWCALL` → Indexes, create index `REQ`:
- Fields: `CLIENT`, `REQUEST_ID`
- **Unique index**, with "Index does not apply to all table rows" / null-value handling so blank `REQUEST_ID` rows are not constrained.

This is what prevents two concurrent retries from both executing. A `SELECT`-then-`INSERT` check cannot.

- [ ] **Step 3: Write the failing tests**

```abap
CLASS ltc_idem DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS blank_id_never_replays FOR TESTING.
ENDCLASS.

CLASS ltc_idem IMPLEMENTATION.

  METHOD blank_id_never_replays.
    " An omitted RequestId must preserve today's behaviour exactly:
    " every call executes. This is the opt-in guarantee.
    DATA(ls) = zcl_fs_slc_gw_idem=>find_replay( space ).
    cl_abap_unit_assert=>assert_initial( ls ).
  ENDMETHOD.

ENDCLASS.
```

Only the blank case is unit tested — the hit/miss cases need committed rows and are covered by the live acceptance test in Task 12 Step 4. Testing them here would require a database dependency this class deliberately does not have.

- [ ] **Step 4: Run and confirm failure**

Expected: FAIL — `find_replay` not defined.

- [ ] **Step 5: Implement**

```abap
CLASS zcl_fs_slc_gw_idem DEFINITION
  PUBLIC
  ABSTRACT
  FINAL.

  PUBLIC SECTION.
    "! Returns the earlier call for this RequestId, or an initial
    "! structure if there was none. A blank RequestId never replays,
    "! so omitting it preserves the pre-idempotency behaviour exactly.
    CLASS-METHODS find_replay
      IMPORTING iv_request_id  TYPE clike
      RETURNING VALUE(rs_call) TYPE zfs_t_slc_gwcall.
ENDCLASS.


CLASS zcl_fs_slc_gw_idem IMPLEMENTATION.

  METHOD find_replay.
    CLEAR rs_call.
    IF iv_request_id IS INITIAL.
      RETURN.
    ENDIF.

    SELECT SINGLE * FROM zfs_t_slc_gwcall
      WHERE request_id = @iv_request_id
      INTO @rs_call.
  ENDMETHOD.

ENDCLASS.
```

- [ ] **Step 6: Extend the request and response abstract entities**

`setObjectSource` on `ZFS_AE_DynGwRequest`, adding one field:

```abap
  RequestId : abap.char(36);
```

and on `ZFS_AE_DynGwResponse`:

```abap
  Replayed : abap.char(1);
```

Both are additive — existing callers that send neither are unaffected.

- [ ] **Step 7: Activate all three, run tests**

Activate `ZFS_AE_DynGwRequest`, `ZFS_AE_DynGwResponse` and `ZCL_FS_SLC_GW_IDEM` in one `abap_activate_objects` call. Expected: 0 messages, 1 test PASS.

- [ ] **Step 8: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0148-gwsplit-orchestrator.md
git commit -m "worklog: idempotency key with unique index replay guard"
```

---

### Task 7: Rewrite the log writer onto the new tables

The service still runs off `ZFS_T_SLC_DYNGW` until this task. After it, logging is entirely on `GWCALL`/`GWSTEP` and the durable-emit RFC path is gone.

**Files:**
- Modify on SAP: `ZCL_FS_SLC_GW_LOG` (rewrite), `ZBP_FS_DYNGATEWAYTP` (stop staging log rows in the saver)
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md`

**Interfaces:**
- Consumes: `zcl_fs_slc_gw_txn=>decide`/`finish`, `zcl_fs_slc_gw_classify=>of_message`/`of_bapi_return`, `zcl_fs_slc_gw_idem=>find_replay`
- Produces: `zcl_fs_slc_gw_log=>build_call( … ) RETURNING VALUE(rs_call) TYPE zfs_t_slc_gwcall` and `zcl_fs_slc_gw_log=>build_steps( … ) RETURNING VALUE(rt_steps) TYPE zcl_fs_slc_gw_base=>tt_log_step`

- [ ] **Step 1: Read the current implementation before changing it**

```
mcp__mcp-abap-abap-adt-api__getObjectSource
  objectSourceUrl: /sap/bc/adt/oo/classes/zcl_fs_slc_gw_log/source/main
```
Identify every place it writes `ZFS_T_SLC_DYNGW`, every `ENTRY_TYPE`/`PHASE`/`STEP_INDEX` assignment, and the `DESTINATION 'NONE'` emit. Record the line ranges in the worklog — the rewrite must remove all of them.

- [ ] **Step 2: Add the payload cap**

Every write of `request_json` / `response_json` passes through:

```abap
  METHOD cap_payload.
    CONSTANTS c_cap TYPE i VALUE 8192.
    IF strlen( iv_json ) <= c_cap.
      rv_json = iv_json.
      RETURN.
    ENDIF.
    rv_json      = iv_json(c_cap).
    ev_truncated = abap_true.
  ENDMETHOD.
```

Set `request_truncated` / `response_truncated` from `ev_truncated`. Unbounded strings on an audit table are what eventually hurts (spec §6).

- [ ] **Step 3: Rewrite the writer**

`build_call( )` fills `zfs_t_slc_gwcall`: `call_uuid` from `zcl_fs_slc_gw_base=>new_uuid( )`, `action`, `request_id`, `commit_mode`, `exec_status` from the decision, `error_category` from `zcl_fs_slc_gw_classify`, `step_count` = lines of steps, `duration_ms`, capped `request_json`, `executed_by` = `sy-uname`, `executed_at` from `GET TIME STAMP FIELD`. Call `zcl_fs_slc_gw_base=>audit_fields( )` for the audit block.

> **`request_id` must never be written blank — this is load-bearing, not a nicety.** Task 6 created
> a **unique** index on `ZFS_T_SLC_GWCALL(CLIENT, REQUEST_ID)`, and classic SE11 offers no way to
> exempt blank values from a unique index. ABAP stores an initial `CHAR` as spaces, not `NULL`, so
> two rows with a blank `request_id` in the same client collide — meaning **the second call from
> any caller who does not send a `RequestId` would fail on INSERT**, breaking the service for
> everyone not using idempotency.
>
> So: when the caller supplies no `RequestId`, write the row's own `call_uuid` into `request_id`.
> It is a GUID, so uniqueness holds by construction. `zcl_fs_slc_gw_idem=>find_replay( )` already
> returns immediately on a blank *input*, so a caller who sends nothing still never matches a
> replay, and a caller who sends a real key still matches normally. Do not echo this synthetic
> value back to the caller as if they had sent it — `Replayed` stays blank and the response's
> behaviour is unchanged.
>
> Verify with the live test in Task 12 Step 3 **and** by issuing two consecutive calls with no
> `RequestId` at all; both must succeed and produce two rows.

`build_steps( )` fills one `zfs_t_slc_gwstep` per step with `step_index` starting at **1** — there is no step 0 any more. Set `severity` from `exec_status`, `error_category` from the classifier, `reg_uuid` from the registry row that authorised it, capped `response_json`.

**Delete entirely:** the `DESTINATION 'NONE'` durable emit, `ENTRY_TYPE`, `PHASE`, `TARGET_KIND='BTCH'` and the `STEP_INDEX = 0` parent convention. The parent is now a `GWCALL` row, not a log row wearing a costume.

- [ ] **Step 4: Stop the RAP saver writing the log**

`ZBP_FS_DYNGATEWAYTP`'s `LSC_DynGateway~save` currently drains `zcl_fs_slc_gw_base=>gt_log`. Remove that. The log is now written by `zcl_fs_slc_gw_txn=>finish( )` from the action, outside RAP's save sequence — that is the whole point of decision 6. Leave `gt_log` declared for now; Task 13 removes it once nothing references it.

- [ ] **Step 5: Activate everything changed, in one call**

```
mcp__adt-mcp__abap_activate_objects
  objects: [ZCL_FS_SLC_GW_LOG, ZBP_FS_DYNGATEWAYTP]
```
Expected: 0 messages.

- [ ] **Step 6: Smoke test one live call**

Run one `RunQuery` against a registered target through `scripts/gateway-regression.ps1`'s `query` case, then:

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWCALL
```
Expected: `CNT = 1`. And `SELECT COUNT(*) FROM ZFS_T_SLC_GWSTEP` expects `1` — one step, `step_index = 1`, **not** 0.

- [ ] **Step 7: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md
git commit -m "worklog: log writer on GWCALL/GWSTEP, durable-emit RFC removed"
```

---

### Task 8: Registry reads from GWREG, and the change history

**Files:**
- Modify on SAP: `ZCL_FS_SLC_GW_REGISTRY`, `ZCL_FS_SLC_GW_REGI`
- Create on SAP: `ZCL_FS_SLC_GW_REGLOG`
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md`

**Interfaces:**
- Consumes: `zfs_t_slc_gwreg`, `zfs_t_slc_gwregh`
- Produces: `zcl_fs_slc_gw_reglog=>record( iv_change_type TYPE c, is_before TYPE zfs_t_slc_gwreg, is_after TYPE zfs_t_slc_gwreg, iv_source TYPE c, iv_call_uuid TYPE sysuuid_x16 )` — called by `ZCL_FS_SLC_GW_REGI` and by the Registry BO's CRUD handlers in Task 9.

- [ ] **Step 1: Point the registry reader at GWREG**

In `ZCL_FS_SLC_GW_REGISTRY`, change every `SELECT … FROM zfs_t_slc_dyngw WHERE entry_type = 'R'` to `SELECT … FROM zfs_t_slc_gwreg`, and **delete the `entry_type` predicate** — the table no longer needs one. `resolve`, `exists`, `committed_row` and `declare_pending` all change. The per-request buffer and `reset` stay exactly as they are.

- [ ] **Step 2: Naming gate and create the history writer**

```
NAMING: ZCL_FS_SLC_GW_REGLOG -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
```

```abap
CLASS zcl_fs_slc_gw_reglog DEFINITION
  PUBLIC
  ABSTRACT
  FINAL.

  PUBLIC SECTION.
    CONSTANTS: BEGIN OF c_change,
                 insert TYPE c LENGTH 1 VALUE 'I',
                 update TYPE c LENGTH 1 VALUE 'U',
                 delete TYPE c LENGTH 1 VALUE 'D',
               END OF c_change.

    CONSTANTS: BEGIN OF c_source,
                 odata TYPE c LENGTH 4 VALUE 'ODAT',
                 regi  TYPE c LENGTH 4 VALUE 'REGI',
               END OF c_source.

    "! One row per change to the allow-list, whatever route made it.
    "! L-369: POST/DELETE left no trace at all, so a target could be
    "! registered, used and deregistered with only the usage visible.
    CLASS-METHODS record
      IMPORTING iv_change_type TYPE c
                is_before      TYPE zfs_t_slc_gwreg OPTIONAL
                is_after       TYPE zfs_t_slc_gwreg OPTIONAL
                iv_source      TYPE clike
                iv_call_uuid   TYPE sysuuid_x16 OPTIONAL.
ENDCLASS.


CLASS zcl_fs_slc_gw_reglog IMPLEMENTATION.

  METHOD record.
    DATA ls_hist TYPE zfs_t_slc_gwregh.
    DATA lv_now  TYPE timestampl.

    GET TIME STAMP FIELD lv_now.

    ls_hist-client      = sy-mandt.
    ls_hist-hist_uuid   = zcl_fs_slc_gw_base=>new_uuid( ).
    ls_hist-change_type = iv_change_type.
    ls_hist-source      = iv_source.
    ls_hist-call_uuid   = iv_call_uuid.
    ls_hist-changed_by  = sy-uname.
    ls_hist-changed_at  = lv_now.

    " Denormalised on purpose: after a delete the registry row is gone,
    " and a history row that cannot name what was removed is useless.
    ls_hist-reg_uuid    = COND #( WHEN is_after-reg_uuid IS NOT INITIAL
                                  THEN is_after-reg_uuid
                                  ELSE is_before-reg_uuid ).
    ls_hist-target_kind = COND #( WHEN is_after-target_kind IS NOT INITIAL
                                  THEN is_after-target_kind
                                  ELSE is_before-target_kind ).
    ls_hist-target_name = COND #( WHEN is_after-target_name IS NOT INITIAL
                                  THEN is_after-target_name
                                  ELSE is_before-target_name ).

    IF is_before IS NOT INITIAL.
      ls_hist-before_json = zcl_fs_slc_gw_base=>to_json( is_before ).
    ENDIF.
    IF is_after IS NOT INITIAL.
      ls_hist-after_json = zcl_fs_slc_gw_base=>to_json( is_after ).
    ENDIF.

    zcl_fs_slc_gw_base=>audit_fields( CHANGING cs_row = ls_hist ).
    INSERT zfs_t_slc_gwregh FROM @ls_hist.
  ENDMETHOD.

ENDCLASS.
```

- [ ] **Step 3: Point REGI at the new table and make it record history**

In `ZCL_FS_SLC_GW_REGI`: change `INSERT zfs_t_slc_dyngw` / `UPDATE zfs_t_slc_dyngw` to `zfs_t_slc_gwreg`, remove the `entry_type` assignment (the table has no such column), and call `zcl_fs_slc_gw_reglog=>record( )` immediately after a successful write with `iv_source = c_source-regi`. Keep message **036** — it is correct and was added for exactly this step (L-370).

- [ ] **Step 4: Activate all three in one call**

```
mcp__adt-mcp__abap_activate_objects
  objects: [ZCL_FS_SLC_GW_REGISTRY, ZCL_FS_SLC_GW_REGI, ZCL_FS_SLC_GW_REGLOG]
```
Expected: 0 messages.

- [ ] **Step 5: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md
git commit -m "worklog: registry on GWREG, change history closes L-369"
```

---

### Task 9: CDS views, BOs and the OData surface

Use the path decided in Task 1 Step 4 — designed shape if validation accepted it, fallback action-carrier entity if it did not.

**Files:**
- Create on SAP: `ZFS_R_DynGwRegTP`, `ZFS_C_DynGwRegTP`, `ZBP_FS_DYNGWREGTP`, `ZFS_R_DynGwCallTP`, `ZFS_R_DynGwStepTP`, `ZFS_C_DynGwCallTP`, `ZFS_C_DynGwStepTP`, `ZBP_FS_DYNGWCALLTP`, `ZFS_I_DynGwRegHist`
- Modify on SAP: `ZFS_SD_DYNGATEWAY`
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md`

**Interfaces:**
- Consumes: all four tables; the Task 1 decision
- Produces: entity sets `Registry`, `RegistryHistory`, `CallLog` (with `_Steps`), `CallStep`

- [ ] **Step 1: Record all nine naming-gate lines**

Copy verbatim from spec §8 into the worklog before the first create call.

- [ ] **Step 2: Create the CallLog root and its Steps child**

`ZFS_R_DynGwCallTP` selects from `zfs_t_slc_gwcall` and declares the composition:

```abap
define root view entity ZFS_R_DynGwCallTP
  as select from zfs_t_slc_gwcall
  composition [0..*] of ZFS_R_DynGwStepTP as _Steps
{
  key call_uuid          as CallUuid,
      action             as Action,
      request_id         as RequestId,
      commit_mode        as CommitMode,
      exec_status        as ExecStatus,
      error_category     as ErrorCategory,
      message_id         as MessageId,
      message_no         as MessageNo,
      message_text       as MessageText,
      step_count         as StepCount,
      result_count       as ResultCount,
      duration_ms        as DurationMs,
      request_json       as RequestJson,
      request_truncated  as RequestTruncated,
      executed_by        as ExecutedBy,
      executed_at        as ExecutedAt,
      _Steps
}
```

`ZFS_R_DynGwStepTP` selects from `zfs_t_slc_gwstep` with `association to parent ZFS_R_DynGwCallTP as _Call on $projection.CallUuid = _Call.CallUuid`.

**A `where` clause goes after the `{ }` field list, never before it** (L-241). Restate `@Semantics` annotations per field rather than relying on propagation (L-239).

- [ ] **Step 3: Create the Registry BO and the history view**

`ZFS_R_DynGwRegTP` over `zfs_t_slc_gwreg`; `ZFS_I_DynGwRegHist` over `zfs_t_slc_gwregh` (read-only, no `TP`, no behaviour).

- [ ] **Step 4: Behaviour definitions**

`ZFS_R_DynGwRegTP` gets full CRUD. Its create/update/delete handlers each call `zcl_fs_slc_gw_reglog=>record( iv_source = c_source-odata )` — **this is what closes L-369 for the `POST`/`DELETE` route.**

`ZFS_R_DynGwCallTP` is read-only and carries the four actions bound to the collection. `ZFS_R_DynGwStepTP` is read-only.

**Draft is not enabled on any of these.** Do not accept a generator's draft-table suggestion — draft needs explicit human confirmation (L-224) and none was given.

- [ ] **Step 5: Rewire the service definition**

`ZFS_SD_DYNGATEWAY`: expose `ZFS_C_DynGwRegTP as Registry`, `ZFS_I_DynGwRegHist as RegistryHistory`, `ZFS_C_DynGwCallTP as CallLog`, `ZFS_C_DynGwStepTP as CallStep`. **Remove `DynGateway`.**

- [ ] **Step 6: Activate everything in one call**

If the generators are used, take object names from the returned `generatedObjects` — they upper-case CDS names (L-219). Expected: 0 messages.

- [ ] **Step 7: Publish the binding**

```bash
python scripts/sap-gui-publish-service.py --group-id zfs_sb_dyngateway_o4_api --yes
```
Its `"ok"` is the verification (L-232). "Get Service Groups" may first demand a non-blank System Alias — F4 and pick `LOCAL` (L-246).

- [ ] **Step 8: Prove the new surface responds**

```
GET <base>/CallLog?sap-client=100&$top=1&$expand=_Steps
```
Expected: HTTP 200, and the call from Task 7 Step 6 comes back with its one step nested under `_Steps`.

- [ ] **Step 9: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md
git commit -m "worklog: CDS views, BOs and OData surface on the split tables"
```

---

### Task 10: Migrate the registry rows

**Files:**
- Create: `worklog/DS4_100_NIIF/2026-09/2026-09-12-gwsplit-migration.md`

**Interfaces:**
- Consumes: `ZFS_T_SLC_DYNGW`, `ZFS_T_SLC_GWREG`
- Produces: a populated allow-list on the new table

- [ ] **Step 1: Record the before state**

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_DYNGW WHERE ENTRY_TYPE = 'R'
```
Write the number into the worklog. Save the full rows to `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-12-gwsplit/registry-before.json` as a restore reference.

- [ ] **Step 2: Copy the rows through the gateway's own OData surface**

For each `EntryType='R'` row, `POST /Registry` with the same `TargetKind`, `TargetName`, `Operation`, `IsActive`, `AllowRead`, `AllowWrite`, `CallMode`, `MaxRows`, `Descr`.

Using the service rather than a SQL `INSERT` is deliberate: it exercises the new CRUD path and produces `GWREGH` history rows, so the migration is itself audited.

**`reg_uuid` will be newly generated.** The spec says preserve the old `uuid`; that is not possible through the OData create, which assigns the key. Preserving it would need a direct SQL insert and would bypass the history. **Record this deviation in the worklog** — nothing references a registry UUID externally, so the cost is nil, but the spec and reality must agree.

- [ ] **Step 3: Verify row-for-row**

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT TARGET_KIND, TARGET_NAME, IS_ACTIVE, ALLOW_READ, ALLOW_WRITE, MAX_ROWS FROM ZFS_T_SLC_GWREG ORDER BY TARGET_NAME
```
Compare against the saved JSON. Every field must match. Expected count equals Step 1's count.

- [ ] **Step 4: Confirm the history was written**

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWREGH WHERE CHANGE_TYPE = 'I'
```
Expected: equal to the number of rows migrated. This is L-369 demonstrably closed.

- [ ] **Step 5: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-gwsplit-migration.md worklog/DS4_100_NIIF/2026-09/evidence/2026-09-12-gwsplit/
git commit -m "worklog: migrate allow-list rows to GWREG via the OData surface"
```

---

### Task 11: Retention report

**Files:**
- Create on SAP: `ZFS_R_GWLOG_PURGE`
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md`

**Interfaces:**
- Consumes: `zfs_t_slc_gwcall`, `zfs_t_slc_gwstep`
- Produces: nothing other tasks depend on

- [ ] **Step 1: Naming gate and create**

```
NAMING: ZFS_R_GWLOG_PURGE -> matches "Executable program | ZFS_R_<NAME>"
```
Confirm that row in `docs/naming-conventions.md` before creating; if the pattern for executable reports differs, use the documented one and record the line.

- [ ] **Step 2: Write it**

Selection screen: `p_days` (age in days, **default 90**) and `p_test` (test run, default `'X'`).

Deletes `GWSTEP` rows first, then `GWCALL` — child before parent. **Must not delete any row whose `executed_at` is inside the idempotency window**, default 30 days, exposed as `p_idem`; a purged `request_id` stops protecting against replay (spec §5.3). Guard: `p_days` below `p_idem` is refused with an error on the selection screen.

Text elements (`p_days`, `p_test`, `p_idem` selection texts) **cannot be created from ADT** — list them in the completion report for the human to maintain via SE38, or create them through `docs/sap-gui-object-automation.md`, which is the one sanctioned route (L-229).

- [ ] **Step 3: Activate and run in test mode**

Run with `p_test = 'X'` and a large `p_days`. Expected: reports the count it *would* delete, deletes nothing. Verify with a `SELECT COUNT(*)` before and after that the numbers are unchanged.

- [ ] **Step 4: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md
git commit -m "worklog: retention report with idempotency-window guard"
```

---

### Task 12: Cutover verification

**Files:**
- Modify: `scripts/gateway-regression.ps1`
- Modify: `worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md`

**Interfaces:**
- Consumes: everything
- Produces: a green regression run and a completed acceptance suite

- [ ] **Step 1: Update the regression script for the new surface**

`scripts/gateway-regression.ps1` line 13 builds the action URI from `/DynGateway/…`. Change to `/CallLog/…`. The six existing cases keep their payloads unchanged. Add a seventh:

```powershell
@{ Name='idempotent-replay'; Action='ExecuteBatch'; Values=@{StepsJson='[{"Kind":"QURY","TargetName":"ZFS_CDS_SLC_001","FieldsJson":"[\"ZOTTK_NO\"]","MaxRows":1}]'; RequestId='regr-replay-001'} }
```

- [ ] **Step 2: Run it twice**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gateway-regression.ps1
```
Expected first run: all seven cases HTTP 200. Expected second run: identical output, and the `idempotent-replay` case comes back with `Replayed = 'X'` and **the same `GwUuid` as the first run**.

- [ ] **Step 3: Confirm the replay executed nothing**

```
mcp__mcp-abap-abap-adt-api__runQuery
  sqlQuery: SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWCALL WHERE REQUEST_ID = 'regr-replay-001'
```
Expected: `CNT = 1` after two runs. Two rows would mean idempotency is not working.

- [ ] **Step 4: Prove the L-350 fix with the exact scenario that failed before**

Send the batch from L-350: two `TABL` `INSERT` steps writing the *same* row, so step 2 fails on a duplicate key.

Expected, and all three must hold:
1. HTTP **200** with `ExecStatus='E'` (not the old 400 — spec §5.4)
2. A `GWCALL` row and both `GWSTEP` rows exist, step 2 `E` / `TARGET`
3. **Step 1's data row does NOT exist.** Under the old design it survived and had to be deleted by hand. This is the assertion the whole task exists for.

- [ ] **Step 5: Run the acceptance suite**

Work through `docs/dyngateway-integration-guide.md` §12, P1–P11 and N1–N10, adjusting expected HTTP codes where §5.4 changed them. Record pass/fail per case in the worklog.

- [ ] **Step 6: Run ATC across everything changed**

```
mcp__adt-mcp__abap_atc_run
  objectName: ZFS_SLC_BTP
```
Resolve priority 1 and 2 findings. Report anything on `ROLLBACK WORK` rather than suppressing it.

- [ ] **Step 7: Commit**

```bash
git add scripts/gateway-regression.ps1 worklog/DS4_100_NIIF/2026-09/2026-09-12-0401-gwsplit-cutover.md
git commit -m "test: regression on the split surface, L-350 rollback verified"
```

---

### Task 13: Documentation and cleanup

**Files:**
- Modify: `docs/dyngateway-integration-guide.md`, `docs/dynamic-gateway-api.md`, `docs/dyngateway-how-it-works.md`, `CLAUDE.md`, `AGENTS.md`
- Modify: `lessons/lessons-ledger.md`
- Modify on SAP: `ZCL_FS_SLC_GW_BASE` (remove `gt_log`)

- [ ] **Step 1: Remove the now-dead staging table**

Nothing references `zcl_fs_slc_gw_base=>gt_log` after Task 7. Confirm with `usageReferences` on it, then remove the declaration and re-activate. If anything still references it, leave it and record why.

- [ ] **Step 2: Rewrite the table section of each doc**

`dyngateway-how-it-works.md` §5 ("the one table behind everything") is now wrong in its premise and needs replacing with the four-table model. `dynamic-gateway-api.md` §8 and `dyngateway-integration-guide.md` §2.3 describe `/DynGateway` CRUD and must point at `/Registry` and `/CallLog`. §5 of the integration guide gains `RequestId` and `Replayed`; §13's troubleshooting row for HTTP 400 on an aborted batch is obsolete.

- [ ] **Step 3: Update the two agent rule files**

`CLAUDE.md`'s dynamic-gateway index row still says "nothing runs unless registered in `ZFS_T_SLC_DYNGW`" — change to `ZFS_T_SLC_GWREG`. Make the same change in `AGENTS.md`, or the workspace becomes agent-dependent (L-221).

- [ ] **Step 4: Write the ledger entries**

At minimum: L-350 marked resolved with the mechanism that fixed it, L-369 marked resolved by `GWREGH`, and a new entry for anything non-obvious found while building. Append-only — never renumber, never delete.

- [ ] **Step 5: Record what is deliberately left behind**

`ZFS_T_SLC_DYNGW` still exists, unused, with its old rows. `deleteObject` is denied project-wide so removing it is a separate decision for the human. State this in the completion report rather than acting on it.

- [ ] **Step 6: Commit**

```bash
git add docs/ lessons/lessons-ledger.md CLAUDE.md AGENTS.md worklog/
git commit -m "docs: four-table gateway model, L-350 and L-369 resolved"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 `GWREG` | 3 |
| §3.2 `GWREGH` | 3 (table), 8 (writer), 9 (OData CRUD path) |
| §3.3 `GWCALL` | 2 |
| §3.4 `GWSTEP` | 2 |
| §4 OData surface | 9 |
| §5.1 transaction ownership | 4, 7 |
| §5.2 error taxonomy | 5 |
| §5.3 idempotency | 6, 12 |
| §5.4 HTTP status discipline | 7, 12 |
| §6 performance (buffering, index, cap, retention) | 3, 6, 7, 11 |
| §7 migration | 10 |
| §8 naming gate | every creating task |
| §9 security (read-only log) | 9 |
| §10 risk 1 | 1 |
| §10 risk 2 | 4 |
| §10 risk 4 | 13 |

**Gap found and fixed:** spec §7 step 2 requires preserving `reg_uuid` on migration. Creating through OData cannot — the key is server-assigned. Task 10 Step 2 now names the deviation explicitly rather than silently breaking the spec.

**Type consistency:** `ty_decision` (Task 4) is consumed in Task 7 by the names defined there. `error_category` is `c LENGTH 8` in `ty_step_result` (Task 4 Step 4), on both tables (Tasks 2, 3) and as the return of `of_message`/`of_bapi_return` (Task 5) — consistent. `tt_log_step` is defined in Task 4 Step 4 and consumed in Task 7. `find_replay` returns `zfs_t_slc_gwcall` (Task 6) and is used in Task 7.

**Placeholder scan:** no TBD/TODO. Two places defer deliberately and say so: Task 11 Step 1 (confirm the executable-report naming row before creating) and Task 13 Step 1 (leave `gt_log` if still referenced).
