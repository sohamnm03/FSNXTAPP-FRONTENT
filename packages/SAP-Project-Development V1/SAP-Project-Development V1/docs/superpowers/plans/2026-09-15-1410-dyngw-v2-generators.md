# Dynamic Gateway v2 — Server-Side Field Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a caller ask the gateway to fill a `TABL` write's UUID, number-range and audit fields server-side, so no client ever invents a key — and expose the transaction outcome it already computes.

**Architecture:** One new stateless class, `ZCL_FS_DYN_GENERATE`, turns a parsed `GenerateJson` plus the target's DDIC field list plus the registry row into a filled row. `ZCL_FS_DYN_HDL_TABLE` calls it per row immediately before `MODIFY_TABLE`. Permission is hybrid: the registry row permits (`allow_gen`, `gen_nr_object`), the call names the fields. The "no number burned on a dry run" guard needs `CommitMode`, which handlers do not receive, so it rides on a new `ZIF_FS_DYN_HANDLER` method answered after `prepare` — the same shape as the existing `runs_in_caller_luw`.

**Tech Stack:** ABAP on S/4HANA on-premise (`DS4`/100), RAP managed BOs, CDS abstract entities, OData V4 (`SRVD_A2X`), `CL_NUMBERRANGE_RUNTIME`, `/ui2/cl_json`, ABAP Unit, ATC. No local build — every verification runs on SAP over MCP.

**Spec:** `docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md`

## Global Constraints

- **System:** `DS4_100_NIIF` (`DS4` / client `100`). Confirm before any write — the Logon Pad also holds two production entries.
- **Package:** `ZFS_DYN_GW`. **Transport: `DS4K907263`, task `DS4K907264`** ("SLC: BTP K2 on 04.09.2026", owner `FS_DEV3`, status `D` modifiable, target `PS4`). No `$TMP`, ever.
  **This is not a preference — it is forced.** The gateway's objects are already CTS-locked under
  `DS4K907263`, so `transportInfo` returns `EXISTING_REQ_ONLY: X` and offers no other request; a
  write against any other transport is refused at `setObjectSource`, after `lock` has already
  succeeded (L-512). Task 1 created `DS4K907300` before this was known — **that request is
  superseded and must not be used**, though it already carries the Task 2 message-class change
  (see the ledger's transport ruling). Always call `transportInfo` on an object before writing and
  use the request it names.
- **Routing (project rule 5):** `adt-mcp` **creates**; `mcp-abap-abap-adt-api` **changes** and does **all reads**. Message classes (`MSAG/N`) are the confirmed `adt-mcp` gap — Task 2 routes to `mcp-abap-abap-adt-api` and the reason goes in the worklog.
- **Naming gate (project rule 1):** record `NAMING: <name> -> matches <pattern row>` **before** every create call. This plan creates exactly one object; its gate line is in Task 5. On any mismatch: stop and ask.
- **Never create an object the human didn't ask for** (project rule 3). No helper, runner, scratch or extra objects. A class's own test include is part of that class, not a separate object — that is the established pattern in `docs/superpowers/plans/2026-09-12-1032-dyngw-v2.md`. If a step cannot be done with the objects in this plan, **stop and report**.
- **Messages:** `ZFS_TRM_MSG` only. Next free is **050** (catalog verified against `T100` 2026-09-13, 49 rows). New numbers written into `docs/message-catalog/DS4_100_NIIF.md` **in the same turn** as creation.
- **Text elements:** never via ADT or `INSERT TEXTPOOL`. This plan creates none.
- **ABAP idiom traps that will cost you a `-32603` save failure:**
  - **Never** write `TYPE c LENGTH n` inline in a method's `IMPORTING`/`EXPORTING`/`CHANGING`/`RETURNING` list. Declare a named `TYPES` alias first and reference it (L-373/L-375). Every signature in this plan already obeys this.
  - `CL_NUMBERRANGE_RUNTIME`'s method is **`NUMBER_GET`**, not `NUMBER_GET_NEXT` — the latter is the `CALL FUNCTION` one layer down and a natural wrong guess (L-280).
  - Catch `CX_NUMBER_RANGES` **only**, never also its subclass `CX_NR_OBJECT_NOT_FOUND` — both in one `TRY` is a hard syntax error, "already exists… uses the superclass" (L-280).
  - `NUMBER_GET`'s `NUMBER` is `NR_NUMBER` (`NUMC20`) whatever the interval's width; a direct assignment into a shorter field truncates **leading** digits (L-282).
- **Activation:** activate a program and all its includes in **one** `activateObjects` call (L-209).
- **Publishing:** `publishServiceBinding` reports success without publishing. Publish with `scripts/sap-gui-publish-service.py --group-id ZFS_SB_DYNGW_O4_API --yes`; its `"ok"` is the verification (L-220/L-232).
- **Live HTTP tests:** PowerShell, **sandboxed** (L-318). `sap-client=100` on every URL including `$metadata` (L-253/L-325). PowerShell 5.1 `ConvertTo-Json` collapses a 1-element array to an object — build arrays by hand (L-315). CURR/DEC fields unquoted numbers (L-244).
- **Every task ends with:** the Task 1 worklog updated (object list row + todo tick) and any new lesson appended to `lessons/lessons-ledger.md` **in the same turn**. New entries continue from the ledger's current highest `L-nnn`.
- **Git commits** cover repo artifacts only (worklog, docs, spec, plan). ABAP source lives on SAP; the transport is its version control.

---

## Task 1: Transport, worklog, and the number-range fact-check

The interval check comes first because it can invalidate the design. If `ZFS_OTTK_D` cannot supply numbers that fit `ZOTTK_NO`, stop and report rather than building on it (L-280).

**Files:**
- Create: `worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md` (from `worklog/_TEMPLATE.md`)
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: the transport number (used by every later task); the recorded `ZFS_OTTK_D` interval facts

- [ ] **Step 1: Confirm the destination**

`mcp__adt-mcp__abap_list_destinations`. Confirm `DS4` / client `100` / `DS4_100_NIIF` before any write. If ambiguous, stop and ask — `adt-mcp` cannot distinguish `DS4_100_NIIF` from `DS4_100_TFSIN`.

- [ ] **Step 2: Create the transport**

`mcp__adt-mcp__abap_transport-create` with description `dyngw v2 server-side field generators`. Record the returned number. `FS_DEV3` currently holds **no** open workbench transport (verified 2026-09-15), so this creates a fresh one.

- [ ] **Step 3: Read the number range object's intervals**

```
mcp__mcp-abap-abap-adt-api__runQuery
SELECT object, subobject, nrrangenr, fromnumber, tonumber, nrlevel, externind
  FROM nriv WHERE object = 'ZFS_OTTK_D'
```

- [ ] **Step 4: Read the live key values the interval must continue**

```
mcp__mcp-abap-abap-adt-api__runQuery
SELECT MAX( zottk_no ) AS max_no, MIN( zottk_no ) AS min_no, COUNT(*) AS rows
  FROM zfs_slc_ottk_btp
```

- [ ] **Step 5: Judge the fit and record it**

Three things must hold. Write each into the worklog with its actual value:
1. At least one interval exists for `ZFS_OTTK_D`.
2. `NRLEVEL` (the current level) is **at or above** `MAX( zottk_no )` — if it is below, the next number collides with an existing row.
3. `TONUMBER` fits `ZOTTK_NO`'s DDIC width (data element `ZSGSLCDT_OTNO`; read it with `getObjectSource` on `/sap/bc/adt/ddic/dataelements/zsgslcdt_otno`).

**If any of the three fails: stop and report.** Do not "fix" the interval — a number range is human-maintained state and rule 3 forbids inventing a repair.

- [ ] **Step 6: Open the worklog**

Copy `worklog/_TEMPLATE.md` to `worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md`. Fill scope (Phase 1 of the generators spec), the transport number, the Step 3–5 findings, the numbered todos (one per task in this plan), and an empty object list.

- [ ] **Step 7: Commit**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: open worklog, transport, ZFS_OTTK_D interval verified"
```

---

## Task 2: Messages 050–054

**Files:**
- Modify: `ZFS_TRM_MSG` (MSAG/N) on SAP, via `mcp-abap-abap-adt-api`
- Modify: `docs/message-catalog/DS4_100_NIIF.md`

**Interfaces:**
- Consumes: the Task 1 transport
- Produces: message numbers 050–054, referenced by Tasks 5, 6 and 7

- [ ] **Step 1: Read the current message class source**

`getObjectSource` on `/sap/bc/adt/messageclass/zfs_trm_msg`. Confirm 049 is the highest and 050 is free. If 050 already exists, **stop** — the catalog is stale and the system wins (working agreement rule 3).

- [ ] **Step 2: Add the five messages**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/messageclass/zfs_trm_msg`, on the Task 1 transport. Add exactly these, all type `E`:

| No | Text |
|---|---|
| 050 | `Generator field &1 does not exist on target &2` |
| 051 | `Number range object &1 is not permitted for target &2` |
| 052 | `Generation is not permitted for target &1` |
| 053 | `Number range &1 could not supply a number for &2` |
| 054 | `Number range generation is not allowed with commit mode NEVER` |

Preserve all 49 existing messages byte-for-byte.

- [ ] **Step 3: Verify against the live system**

```
mcp__mcp-abap-abap-adt-api__runQuery
SELECT COUNT(*) AS cnt FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'
```
Expected: **54** (was 49). Then read back 050–054 and compare the texts character-for-character with Step 2.

- [ ] **Step 4: Update the catalog in the same turn**

Add the five rows to `docs/message-catalog/DS4_100_NIIF.md`, and a dated paragraph in its change-history style naming this plan, the transport, and the `T100` count before and after.

- [ ] **Step 5: Commit**

```bash
git add docs/message-catalog/DS4_100_NIIF.md worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: messages 050-054 in ZFS_TRM_MSG, catalog updated"
```

---

## Task 3: Registry columns

**Files:**
- Modify: `ZFS_T_DYN_REG` (TABL/DT)
- Modify: `ZFS_R_DYNGWREGTP` (DDLS/DF), `ZFS_C_DYNGWREGTP` (DDLS/DF)
- Modify: `ZFS_R_DYNGWREGTP` and `ZFS_C_DYNGWREGTP` behavior definitions (BDEF/BDO)
- Modify: `ZBP_FS_DYNGWREGTP` (CLAS/OC) only if it enumerates fields

**Interfaces:**
- Consumes: the Task 1 transport
- Produces: `zfs_t_dyn_reg-allow_gen` (`abap_boolean`) and `zfs_t_dyn_reg-gen_nr_object` (`nrobj`, `CHAR(10)`, SAP-owned, package `SZN`) — read by Tasks 5 and 6 through the `reg` parameter of `ZIF_FS_DYN_HANDLER~prepare`

- [ ] **Step 1: Add the two columns to the table**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/ddic/tables/zfs_t_dyn_reg`. Insert **after `log_level`, before `descr`**, so the audit block stays last:

```abap
  log_level             : zfs_de_dyn_loglvl;
  allow_gen             : abap_boolean;
  gen_nr_object         : nrobj;
  descr                 : char60;
```

- [ ] **Step 2: Expose them on the interface view**

`getObjectSource` on `/sap/bc/adt/ddic/ddl/sources/zfs_r_dyngwregtp`, then add to the field list, following the casing the file already uses for its neighbours:

```
      allow_gen      as AllowGen,
      gen_nr_object  as GenNrObject,
```

- [ ] **Step 3: Expose them on the projection view**

Same for `/sap/bc/adt/ddic/ddl/sources/zfs_c_dyngwregtp`:

```
      AllowGen,
      GenNrObject,
```

- [ ] **Step 4: Add them to both behavior definitions**

Read `/sap/bc/adt/bo/behaviordefinitions/zfs_r_dyngwregtp` and `.../zfs_c_dyngwregtp`. Add `AllowGen` and `GenNrObject` to each field list, matching how `MaxRows` and `LogLevel` are declared there. If either file marks fields `readonly` or `mandatory`, follow the same treatment as `LogLevel` — these two are ordinary maintainable attributes, not keys.

- [ ] **Step 5: Check the behavior pool**

`getObjectSource` on `/sap/bc/adt/oo/classes/zbp_fs_dyngwregtp` including its `implementations` include. If it enumerates registry fields anywhere (a validation, a `CORRESPONDING`, a field list), add the two. If it does not, change nothing — say so in the worklog rather than editing for symmetry.

- [ ] **Step 6: Activate everything in one call**

`mcp__adt-mcp__abap_activate_objects` with all objects touched in Steps 1–5 in **one** call (L-209).
Expected: activation succeeds with no errors.

- [ ] **Step 7: Verify the columns exist and default correctly**

```
mcp__mcp-abap-abap-adt-api__runQuery
SELECT target_kind, target_name, allow_gen, gen_nr_object FROM zfs_t_dyn_reg
```
Expected: the query runs; every pre-existing row (if any) shows `allow_gen` initial and `gen_nr_object` blank — spec §9's "false by default, existing rows unaffected".

- [ ] **Step 8: Commit the worklog**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: registry columns allow_gen + gen_nr_object"
```

---

## Task 4: Handler contract — `generatejson` on the step, `consumes_number_range` on the interface

`ZIF_FS_DYN_HANDLER~prepare` receives `step` and `reg` but **not** `CommitMode`, so the 054 guard cannot live inside a handler. This task adds the question the dispatcher will ask, using the exact shape the interface already sets for `runs_in_caller_luw`: an instance method, valid only after `prepare`, erring toward the safe answer when unprepared.

**Files:**
- Modify: `ZIF_FS_DYN_HANDLER` (INTF/OI)
- Modify: `ZCL_FS_DYN_HDL_QUERY`, `ZCL_FS_DYN_HDL_FUNC`, `ZCL_FS_DYN_HDL_SUBMIT`, `ZCL_FS_DYN_HDL_REGI` (CLAS/OC)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `zif_fs_dyn_handler~ty_step-generatejson` (`ty_json`, i.e. `string`) — read by Task 6
  - `zif_fs_dyn_handler~consumes_number_range() RETURNING VALUE(result) TYPE abap_bool` — implemented for real by Task 6, called by Task 7

- [ ] **Step 1: Add `generatejson` to `ty_step`**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/oo/interfaces/zif_fs_dyn_handler`. Add as the **last** field so positional `CORRESPONDING`/`MOVE-CORRESPONDING` behaviour elsewhere is unaffected:

```abap
  TYPES: BEGIN OF ty_step,
           index      TYPE i,
           kind       TYPE ty_kind,
           targetname TYPE c LENGTH 30,
           operation  TYPE ty_operation,
           importjson TYPE ty_json,
           tablesjson TYPE ty_json,
           fieldsjson TYPE ty_json,
           filterjson TYPE ty_json,
           orderbyjson TYPE ty_json,
           maxrows    TYPE i,
           skiprows   TYPE i,
           generatejson TYPE ty_json,
         END OF ty_step.
```

- [ ] **Step 2: Add `consumes_number_range` to the interface**

In the same edit, after `runs_in_caller_luw`:

```abap
  "! Will executing this step draw a number from a number range object?
  "! INSTANCE, and VALID ONLY AFTER PREPARE - same contract as
  "! RUNS_IN_CALLER_LUW above, for the same reason: the answer depends on
  "! the step's own GenerateJson, not on the kind.
  "!
  "! A number range is burned permanently and is NOT rolled back (L-284),
  "! so the dispatcher refuses such a step under CommitMode 'NEVER' - a dry
  "! run must not consume a shared production sequence.
  "!
  "! Every implementation errs toward abap_false ONLY when it genuinely
  "! cannot draw a number. A handler that might must answer abap_true when
  "! unprepared, because a missed 'true' silently burns numbers on a dry run.
  METHODS consumes_number_range RETURNING VALUE(result) TYPE abap_bool.
```

- [ ] **Step 3: Implement it as a constant `abap_false` in the four non-TABL handlers**

For each of `ZCL_FS_DYN_HDL_QUERY`, `ZCL_FS_DYN_HDL_FUNC`, `ZCL_FS_DYN_HDL_SUBMIT`, `ZCL_FS_DYN_HDL_REGI` — `lock` → `setObjectSource` → `unLock` on the class's `implementations` include, adding:

```abap
  METHOD zif_fs_dyn_handler~consumes_number_range.
    " Generators are TABL-only (spec section 3). This kind cannot draw a
    " number, so the answer is constant and safe before PREPARE.
    result = abap_false.
  ENDMETHOD.
```

Add the method to each class's `definitions` include too if the class declares interface methods explicitly rather than relying on `INTERFACES`.

- [ ] **Step 4: Activate**

`mcp__adt-mcp__abap_activate_objects` — the interface and all four classes in **one** call.
Expected: activation succeeds. `ZCL_FS_DYN_HDL_TABLE` will **fail** here because it does not yet implement the new method — that is correct and expected; it is fixed in Task 6. If you prefer a green activation at every step, include `ZCL_FS_DYN_HDL_TABLE` with a temporary constant `abap_false` implementation and replace it in Task 6.

- [ ] **Step 5: Commit the worklog**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: handler contract gains generatejson + consumes_number_range"
```

---

## Task 5: `ZCL_FS_DYN_GENERATE` and its unit tests

The only new object. Pure logic, no database write, no knowledge of batches or transactions — which is what makes it unit-testable without touching a live number range. The `NUMBER_GET` call itself is proved live in Task 8.

`NAMING: ZCL_FS_DYN_GENERATE -> matches pattern row "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md line 116), AREA = DYN` — consistent with the live family `ZCL_FS_DYN_AUTH` / `_BUDGET` / `_JSON` / `_REGISTRY` / `_RUNTIME`. **Record this line in the worklog before the create call.**

**Files:**
- Create: `ZCL_FS_DYN_GENERATE` (CLAS/OC) + its test include — via `adt-mcp`
- Test: the class's own test include

**Interfaces:**
- Consumes: messages 050–054 (Task 2); `zfs_t_dyn_reg-allow_gen` / `-gen_nr_object` (Task 3)
- Produces:
  - `TYPES ty_operation TYPE c LENGTH 10.`
  - `TYPES ty_target TYPE c LENGTH 30.`
  - `CLASS-METHODS apply IMPORTING generatejson TYPE string, operation TYPE ty_operation, reg TYPE zfs_t_dyn_reg, target_name TYPE ty_target, CHANGING row TYPE REF TO data RAISING zcx_fs_dyn_error.`
  - `CLASS-METHODS will_draw_number IMPORTING generatejson TYPE string, operation TYPE ty_operation RETURNING VALUE(result) TYPE abap_bool.`
  - `CLASS-METHODS fit_number IMPORTING number TYPE nr_number, length TYPE i RETURNING VALUE(result) TYPE string RAISING zcx_fs_dyn_error.`

  Both `apply` and `will_draw_number` are called by Task 6. `fit_number` is public so its L-282 behaviour is directly testable.

- [ ] **Step 1: Record the naming gate, then create the class skeleton**

Write the `NAMING:` line above into the worklog. Then `mcp__adt-mcp__abap_creation-create_object`: type `CLAS/OC`, name `ZCL_FS_DYN_GENERATE`, package `ZFS_DYN_GW`, transport from Task 1, description `Dynamic Gateway - server-side field generators`.

- [ ] **Step 2: Write the public shell so the tests have something to compile against**

`lock` → `setObjectSource` → `unLock` on the class's main source. Named `TYPES` first — never `TYPE c LENGTH n` inline in a signature (L-373/L-375):

```abap
CLASS zcl_fs_dyn_generate DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES ty_operation TYPE c LENGTH 10.
    TYPES ty_target    TYPE c LENGTH 30.

    CLASS-METHODS fit_number
      IMPORTING number        TYPE nr_number
                length        TYPE i
      RETURNING VALUE(result) TYPE string
      RAISING   zcx_fs_dyn_error.

    CLASS-METHODS will_draw_number
      IMPORTING generatejson  TYPE string
                operation     TYPE ty_operation
      RETURNING VALUE(result) TYPE abap_bool.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_fs_dyn_generate IMPLEMENTATION.
  METHOD fit_number.
  ENDMETHOD.
  METHOD will_draw_number.
  ENDMETHOD.
ENDCLASS.
```

Activate. Expected: activates clean (empty methods are legal).

- [ ] **Step 3: Write the failing tests**

`createTestInclude` on the class, then `lock` → `setObjectSource` → `unLock` on the test include:

```abap
CLASS ltc_generate DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS fit_keeps_significant_digits FOR TESTING RAISING cx_static_check.
    METHODS fit_pads_to_width            FOR TESTING RAISING cx_static_check.
    METHODS fit_refuses_when_too_wide    FOR TESTING.
    METHODS draws_when_nr_requested      FOR TESTING RAISING cx_static_check.
    METHODS no_draw_when_only_uuid       FOR TESTING RAISING cx_static_check.
    METHODS no_draw_on_modify            FOR TESTING RAISING cx_static_check.
    METHODS no_draw_when_json_blank      FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS ltc_generate IMPLEMENTATION.

  METHOD fit_keeps_significant_digits.
    " L-282: NUMBER_GET returns NUMC20. A direct assignment into CHAR10
    " keeps the LEADING digits - i.e. ten zeros - and silently loses the
    " number. fit_number must keep the significant end.
    cl_abap_unit_assert=>assert_equals(
      exp = '0000100051'
      act = zcl_fs_dyn_generate=>fit_number( number = '00000000000000100051' length = 10 ) ).
  ENDMETHOD.

  METHOD fit_pads_to_width.
    cl_abap_unit_assert=>assert_equals(
      exp = '000000000000100051'
      act = zcl_fs_dyn_generate=>fit_number( number = '00000000000000100051' length = 18 ) ).
  ENDMETHOD.

  METHOD fit_refuses_when_too_wide.
    TRY.
        zcl_fs_dyn_generate=>fit_number( number = '00000000009999999999' length = 4 ).
        cl_abap_unit_assert=>fail( 'expected ZCX_FS_DYN_ERROR for a value wider than the target' ).
      CATCH zcx_fs_dyn_error.
        " expected
    ENDTRY.
  ENDMETHOD.

  METHOD draws_when_nr_requested.
    cl_abap_unit_assert=>assert_equals(
      exp = abap_true
      act = zcl_fs_dyn_generate=>will_draw_number(
              generatejson = '{"NumberRange":[{"Field":"ZOTTK_NO"}]}'
              operation    = 'INSERT' ) ).
  ENDMETHOD.

  METHOD no_draw_when_only_uuid.
    cl_abap_unit_assert=>assert_equals(
      exp = abap_false
      act = zcl_fs_dyn_generate=>will_draw_number(
              generatejson = '{"Uuid":["UUID"]}'
              operation    = 'INSERT' ) ).
  ENDMETHOD.

  METHOD no_draw_on_modify.
    " Spec section 5.2a: NumberRange is INSERT-only, so a MODIFY cannot
    " burn a number even if the caller asked for one.
    cl_abap_unit_assert=>assert_equals(
      exp = abap_false
      act = zcl_fs_dyn_generate=>will_draw_number(
              generatejson = '{"NumberRange":[{"Field":"ZOTTK_NO"}]}'
              operation    = 'MODIFY' ) ).
  ENDMETHOD.

  METHOD no_draw_when_json_blank.
    cl_abap_unit_assert=>assert_equals(
      exp = abap_false
      act = zcl_fs_dyn_generate=>will_draw_number(
              generatejson = ''
              operation    = 'INSERT' ) ).
  ENDMETHOD.

ENDCLASS.
```

- [ ] **Step 4: Run the tests and watch them fail**

`mcp__adt-mcp__abap_run_unit_tests` on `ZCL_FS_DYN_GENERATE`.
Expected: all seven **fail** — the two methods return initial values, so every `assert_equals` mismatches and `fit_refuses_when_too_wide` hits the explicit `fail`.

- [ ] **Step 5: Implement `fit_number` and `will_draw_number`**

```abap
  METHOD fit_number.
    DATA(significant) = condense( val = |{ number ALPHA = OUT }| ).
    IF strlen( significant ) > length.
      RAISE EXCEPTION TYPE zcx_fs_dyn_error
        MESSAGE e053(zfs_trm_msg) WITH significant length.
    ENDIF.
    result = |{ significant ALPHA = IN WIDTH = length }|.
  ENDMETHOD.

  METHOD will_draw_number.
    result = abap_false.
    IF generatejson IS INITIAL OR operation <> 'INSERT'.
      RETURN.
    ENDIF.
    " Cheap, allocation-free pre-check before the full parse. The real
    " parse happens in APPLY; this method only answers the dispatcher's
    " dry-run question and must never raise.
    IF contains( val = to_upper( generatejson ) sub = '"NUMBERRANGE"' ).
      result = abap_true.
    ENDIF.
  ENDMETHOD.
```

- [ ] **Step 6: Run the tests and watch them pass**

`mcp__adt-mcp__abap_run_unit_tests` on `ZCL_FS_DYN_GENERATE`.
Expected: all seven **pass**.

- [ ] **Step 7: Write the failing tests for `apply`'s refusal paths**

Append to `ltc_generate`. These exercise the three validation refusals without needing a live number range, by asking for generation the registry does not permit — which is refused before any `NUMBER_GET` call:

```abap
    METHODS apply_refuses_when_gen_off    FOR TESTING.
    METHODS apply_refuses_wrong_nr_object FOR TESTING.
    METHODS apply_refuses_on_delete       FOR TESTING.
```

```abap
  METHOD apply_refuses_when_gen_off.
    DATA reg TYPE zfs_t_dyn_reg.
    DATA row TYPE REF TO data.
    CREATE DATA row TYPE zfs_slc_ottk_btp.
    reg-allow_gen = abap_false.
    TRY.
        zcl_fs_dyn_generate=>apply(
          EXPORTING generatejson = '{"Uuid":["UUID"]}'
                    operation    = 'INSERT'
                    reg          = reg
                    target_name  = 'ZFS_SLC_OTTK_BTP'
          CHANGING  row          = row ).
        cl_abap_unit_assert=>fail( 'expected 052 when allow_gen is false' ).
      CATCH zcx_fs_dyn_error INTO DATA(err_off).
        cl_abap_unit_assert=>assert_equals( exp = 052 act = err_off->if_t100_message~t100key-msgno ).
    ENDTRY.
  ENDMETHOD.

  METHOD apply_refuses_wrong_nr_object.
    DATA reg TYPE zfs_t_dyn_reg.
    DATA row TYPE REF TO data.
    CREATE DATA row TYPE zfs_slc_ottk_btp.
    reg-allow_gen     = abap_true.
    reg-gen_nr_object = 'ZFS_OTTK_D'.
    TRY.
        zcl_fs_dyn_generate=>apply(
          EXPORTING generatejson = '{"NumberRange":[{"Field":"ZOTTK_NO","Object":"SOMETHING_ELSE"}]}'
                    operation    = 'INSERT'
                    reg          = reg
                    target_name  = 'ZFS_SLC_OTTK_BTP'
          CHANGING  row          = row ).
        cl_abap_unit_assert=>fail( 'expected 051 when Object does not match the registry row' ).
      CATCH zcx_fs_dyn_error INTO DATA(err_obj).
        cl_abap_unit_assert=>assert_equals( exp = 051 act = err_obj->if_t100_message~t100key-msgno ).
    ENDTRY.
  ENDMETHOD.

  METHOD apply_refuses_on_delete.
    DATA reg TYPE zfs_t_dyn_reg.
    DATA row TYPE REF TO data.
    CREATE DATA row TYPE zfs_slc_ottk_btp.
    reg-allow_gen = abap_true.
    TRY.
        zcl_fs_dyn_generate=>apply(
          EXPORTING generatejson = '{"Uuid":["UUID"]}'
                    operation    = 'DELETE'
                    reg          = reg
                    target_name  = 'ZFS_SLC_OTTK_BTP'
          CHANGING  row          = row ).
        cl_abap_unit_assert=>fail( 'expected 052 for any GenerateJson on a DELETE' ).
      CATCH zcx_fs_dyn_error INTO DATA(err_del).
        cl_abap_unit_assert=>assert_equals( exp = 052 act = err_del->if_t100_message~t100key-msgno ).
    ENDTRY.
  ENDMETHOD.
```

- [ ] **Step 8: Run and watch them fail**

Expected: three failures — `apply` does not exist yet, so the class does not activate. Add the `apply` signature from the **Interfaces** block above with an empty body, activate, and re-run: now the three fail on the missing `fail( )`/exception instead.

- [ ] **Step 9: Implement `apply`**

Order matters — every refusal is checked before any side effect, so a rejected call never burns a number:

1. `generatejson` initial → return unchanged.
2. `operation` = `DELETE` → raise `e052` with `target_name`.
3. `reg-allow_gen` false → raise `e052` with `target_name`.
4. Parse `generatejson` with `/ui2/cl_json=>deserialize` into a local type mirroring spec §5.2. Malformed → raise `e022` (the existing "cannot parse" message; do **not** invent a new number).
5. For every named field in `Uuid`, `NumberRange` and the explicit `SysFields` form: resolve it against the target's components via `ZCL_FS_DYN_RUNTIME`'s existing component reader. Not found → raise `e050` with the field and `target_name`.
6. `Uuid` / `NumberRange` present and `operation` <> `INSERT` → raise `e052` (spec §5.2a).
7. For each `NumberRange` entry: if `Object` is supplied and differs from `reg-gen_nr_object`, or `reg-gen_nr_object` is blank → raise `e051` with the requested object and `target_name`.
8. Only now, side effects. For each `Uuid` field assign `cl_system_uuid=>create_uuid_x16_static( )`. For each `NumberRange` field call
   `cl_numberrange_runtime=>number_get( EXPORTING nr_range_nr = '01' object = reg-gen_nr_object IMPORTING number = DATA(nr) )`, wrapped in `TRY ... CATCH cx_number_ranges INTO DATA(nr_err)` → raise `e053` with the object and field. **Catch `cx_number_ranges` only** — adding its subclass `cx_nr_object_not_found` to the same `CATCH` is a hard syntax error (L-280). Assign via `fit_number( number = nr length = <component length> )`.
9. `SysFields`: `"AUDIT"` fills `local_created_by` / `local_last_changed_by` ← `sy-uname` and `local_created_at` / `local_last_changed_at` / `last_changed_at` ← `cl_abap_tstmp` current timestampl, **only where the component exists**. The explicit array form maps each named field per its `Value` (`USER`/`DATE`/`TIME`/`TIMESTAMP`/`TIMESTAMPL`). On `MODIFY`, fill only the `*last_changed*` members of the `"AUDIT"` set.

A generated value overwrites whatever the row carried for that field (spec §5.2a).

- [ ] **Step 10: Run the full test class**

`mcp__adt-mcp__abap_run_unit_tests` on `ZCL_FS_DYN_GENERATE`.
Expected: all ten pass.

- [ ] **Step 11: ATC**

`mcp__adt-mcp__abap_atc_run` on `ZCL_FS_DYN_GENERATE`, then `abap_atc_get_result`.
Expected: no priority 1 or 2 findings. Fix any that appear; do not exempt.

- [ ] **Step 12: Commit the worklog**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: ZCL_FS_DYN_GENERATE with unit tests"
```

---

## Task 6: Wire the generator into `ZCL_FS_DYN_HDL_TABLE`

**Files:**
- Modify: `ZCL_FS_DYN_HDL_TABLE` (CLAS/OC)

**Interfaces:**
- Consumes: `zcl_fs_dyn_generate=>apply`, `=>will_draw_number` (Task 5); `ty_step-generatejson`, `consumes_number_range` (Task 4); `reg-allow_gen`, `reg-gen_nr_object` (Task 3)
- Produces: a `TABL` step whose outcome carries `rowsjson` filled with the rows as written; a real `consumes_number_range` answer

- [ ] **Step 1: Read the handler**

`getObjectSource` on `/sap/bc/adt/oo/classes/zcl_fs_dyn_hdl_table` (both includes). Locate `prepare`, `execute`, and where it deserialises `ImportJson` into its row table.

- [ ] **Step 2: Store the step in `prepare`**

`prepare` already receives `step` and `reg`. Keep `step-generatejson` and `step-operation` in instance attributes (`mv_generatejson`, `mv_operation`) alongside whatever it already retains, so `execute` and `consumes_number_range` can both see them.

- [ ] **Step 3: Implement the real `consumes_number_range`**

Replacing Task 4 Step 4's temporary constant if you added one:

```abap
  METHOD zif_fs_dyn_handler~consumes_number_range.
    " Valid only after PREPARE. Before it, mv_generatejson is initial and
    " WILL_DRAW_NUMBER answers abap_false - which is safe here because an
    " unprepared step never executes.
    result = zcl_fs_dyn_generate=>will_draw_number(
               generatejson = mv_generatejson
               operation    = mv_operation ).
  ENDMETHOD.
```

- [ ] **Step 4: Call the generator per row in `execute`**

Immediately before the existing `MODIFY_TABLE` call, for each row of the deserialised row table:

```abap
    LOOP AT <rows> ASSIGNING FIELD-SYMBOL(<row>).
      DATA(row_ref) = REF #( <row> ).
      zcl_fs_dyn_generate=>apply(
        EXPORTING generatejson = mv_generatejson
                  operation    = mv_operation
                  reg          = ms_reg
                  target_name  = ms_step-targetname
        CHANGING  row          = row_ref ).
    ENDLOOP.
```

`ZCX_FS_DYN_ERROR` propagates to the handler's existing error conversion, which already produces `status 'E'` plus the step message — so 050/051/052/053 land on the step row, exactly like every other refusal (the 045/017 split, L-478).

- [ ] **Step 5: Fill `rowsjson` with the rows as written**

After a successful `MODIFY_TABLE`, serialise the same row table — post-generation, so the caller sees the assigned `UUID` and `ZOTTK_NO` — into `result-rowsjson` using `ZCL_FS_DYN_JSON`, honouring the registry row's `log_level` cap the way the other handlers do. `ty_outcome-rowsjson` already exists; this fills a field rather than changing the interface.

- [ ] **Step 6: Activate**

`mcp__adt-mcp__abap_activate_objects` on `ZCL_FS_DYN_HDL_TABLE`.
Expected: clean — this is also what closes the deliberate Task 4 Step 4 gap.

- [ ] **Step 7: Run the whole package's unit tests**

`mcp__adt-mcp__abap_run_unit_tests` across `ZFS_DYN_GW`.
Expected: all pass. A pre-existing `ZCL_FS_DYN_HDL_TABLE` test that asserts an empty `rowsjson` will now fail — that assertion is obsolete, so update it to assert the written rows and say so in the worklog.

- [ ] **Step 8: Commit the worklog**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: TABL handler generates fields and returns written rows"
```

---

## Task 7: Contract fields and the dispatcher guard

**Files:**
- Modify: `ZFS_AE_DYNGWTABLE` (DDLS/DF), `ZFS_AE_DYNGWSTEP` (DDLS/DF), `ZFS_AE_DYNGWRESULT` (DDLS/DF)
- Modify: `ZCL_FS_DYN_JSON` (CLAS/OC) if its step parsing enumerates fields
- Modify: `ZCL_FS_DYN_DISPATCH` (CLAS/OC)
- Modify: `ZBP_FS_DYNGWCALLTP` (CLAS/OC) — the action implementations that map parameters in and the result out

**Interfaces:**
- Consumes: `consumes_number_range` (Task 4/6); message 054 (Task 2)
- Produces: the finished wire contract — `GenerateJson` on `ExecuteTableCrud` and on batch steps, `Committed`/`RolledBack` on every action result

- [ ] **Step 1: Add `GenerateJson` to the `ExecuteTableCrud` parameter**

`lock` → `setObjectSource` → `unLock` on `/sap/bc/adt/ddic/ddl/sources/zfs_ae_dyngwtable`:

```
      // Server-side field generation, spec 2026-09-15 section 5.2:
      // {"Uuid":[...],"NumberRange":[{"Field":..,"Object":..}],"SysFields":"AUDIT"}
      // Empty when the caller wants none. Permitted only where the target's
      // registry row sets ALLOW_GEN; NumberRange additionally needs
      // GEN_NR_OBJECT to match.
  GenerateJson : abap.string(0);
```

**This is the deliberate breaking change** (spec §7, signed off by the human 2026-09-15): the parameter is generated `Nullable="false"`, so every existing `ExecuteTableCrud` caller must now send the field. It is confined to this one action.

- [ ] **Step 2: Add `GenerateJson` to the batch step entity**

Same edit on `/sap/bc/adt/ddic/ddl/sources/zfs_ae_dyngwstep`, as the last field. **Not breaking** — that entity's own comment records that it is not reachable as a composition from `ZFS_AE_DynGwBatch` (L-470/L-472) and is only the typed contract `StepsJson` is parsed against, case-insensitively.

- [ ] **Step 3: Add the transaction flags to the result**

Same edit on `/sap/bc/adt/ddic/ddl/sources/zfs_ae_dyngwresult`:

```
      // 'X' when this call's LUW committed / was rolled back. The dispatcher
      // has always computed both; until now neither reached a caller (L-497).
  Committed  : abap.char(1);
  RolledBack : abap.char(1);
```

- [ ] **Step 4: Teach the step parser the new field**

`getObjectSource` on `/sap/bc/adt/oo/classes/zcl_fs_dyn_json`. If step parsing maps field names explicitly, add `generatejson`. If it deserialises straight into `zif_fs_dyn_handler=>ty_step` case-insensitively, Task 4 Step 1 already did the work — change nothing and record that in the worklog.

- [ ] **Step 5: Add the 054 guard to phase 1**

In `ZCL_FS_DYN_DISPATCH`, after every step has been prepared and where the existing LUW-coherence guard already walks the prepared handlers:

```abap
    IF ms_request-commitmode = 'NEVER'.
      LOOP AT mt_handlers INTO DATA(handler).
        IF handler->consumes_number_range( ) = abap_true.
          " L-284: a number range is burned permanently and is never rolled
          " back, so a dry run must not draw one.
          result = refuse( msgno = 054 errcat = 'CLIENT' step = sy-tabix ).
          RETURN.
        ENDIF.
      ENDLOOP.
    ENDIF.
```

Match the surrounding code's actual refusal helper and attribute names — the shape above is the intent, not a literal paste.

- [ ] **Step 6: Surface `Committed` / `RolledBack`**

`TY_RESULT` already carries `committed` and `rolled_back` and the dispatcher sets them on every path. In `ZBP_FS_DYNGWCALLTP`, wherever each of the six actions maps `TY_RESULT` onto `ZFS_AE_DynGwResult`, map the two fields through as `'X'`/`space`. Do this for **all six** actions, not just `ExecuteTableCrud` — the result entity is shared.

- [ ] **Step 7: Map `GenerateJson` in on `ExecuteTableCrud`**

In the same class, where `ExecuteTableCrud` builds its single `ty_step`, assign the new parameter to `step-generatejson`.

- [ ] **Step 8: Activate everything in one call**

`mcp__adt-mcp__abap_activate_objects` with all objects from Steps 1–7 in **one** call (L-209).
Expected: clean.

- [ ] **Step 9: Run the package's unit tests**

Expected: all pass.

- [ ] **Step 10: Commit the worklog**

```bash
git add worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md
git commit -m "dyngw v2 generators: GenerateJson on the wire, 054 dry-run guard, Committed/RolledBack exposed"
```

---

## Task 8: Publish and prove it live

Spec §12's fourteen acceptance criteria. Every call is recorded with its payload and response.

**Files:**
- Create: `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/` (transcripts, payload dumps)

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces: the proof that Phase 2 (the console) can be built against this API

- [ ] **Step 1: Republish the service binding**

```powershell
python scripts/sap-gui-publish-service.py --group-id ZFS_SB_DYNGW_O4_API --yes
```
Its `"ok"` **is** the verification — no separate `fetch_services` (L-232). `publishServiceBinding` over ADT reports success without publishing, so do not use it (L-220).

- [ ] **Step 2: Confirm the metadata carries the new fields**

```
GET <base>/$metadata?sap-client=100
```
Expected: `GenerateJson` on the `ExecuteTableCrud` action; `Committed` and `RolledBack` on the result type. `sap-client=100` is required even here (L-253/L-325).

- [ ] **Step 3: §12.2 — the compatibility check, before anything else**

`POST .../CallLog/<ns>.ExecuteTableCrud` with the **old** shape — `TargetName`, `Operation`, `ImportJson`, `RequestId`, no `GenerateJson`.
Expected: HTTP 400 `/IWBEP/CM_V4H_RUN/006 "Non nullable action parameter …"`, confirming spec §7.
**If it succeeds instead**, the non-nullable claim is wrong for this release — record the actual response and append a lesson. Either outcome is a result; neither is a reason to stop.

- [ ] **Step 4: Register the target with generation permitted**

`POST .../CallLog/<ns>.RegisterTarget`:

```json
{ "TargetName":"ZFS_SLC_OTTK_BTP", "Operation":"INSERT",
  "ImportJson":"{\"TargetKind\":\"TABL\",\"IsActive\":true,\"AllowRead\":true,\"AllowWrite\":true,\"AllowGen\":true,\"GenNrObject\":\"ZFS_OTTK_D\"}",
  "RequestId":"" }
```
Booleans unquoted `true` — `"X"` is an HTTP 400 XML parse error, not a clean refusal (L-475).

- [ ] **Step 5: §12.11 — confirm the registry history recorded it**

```
GET <base>/RegistryHistory?sap-client=100
```
Expected: a `CHANGE_TYPE 'I'` row whose `AFTER_JSON` contains both `ALLOW_GEN` and `GEN_NR_OBJECT`.

- [ ] **Step 6: §12.3 — the real thing**

`POST .../CallLog/<ns>.ExecuteTableCrud`:

```json
{ "TargetName":"ZFS_SLC_OTTK_BTP", "Operation":"INSERT",
  "ImportJson":"[{\"ZSTR\":\"DSX\",\"ZENT_ID\":\"E024\",\"ZTYPE\":\"01\",\"ZOTTK_CURR\":\"USD\",\"ZOTTK_VALUE\":1000000.00,\"ZBUKRS\":\"SG03\"}]",
  "GenerateJson":"{\"Uuid\":[\"UUID\"],\"NumberRange\":[{\"Field\":\"ZOTTK_NO\",\"Object\":\"ZFS_OTTK_D\"}],\"SysFields\":\"AUDIT\"}",
  "RequestId":"" }
```
Expected: HTTP 200, `ExecStatus 'S'`, `Committed 'X'`, and `RowsJson` carrying the assigned `UUID` and `ZOTTK_NO`. `ZOTTK_VALUE` unquoted (L-244).

- [ ] **Step 7: §12.4 — read the row back independently**

`RunQuery` on `ZFS_SLC_OTTK_BTP` (register it `QURY` first if needed) filtered to the new `ZOTTK_NO`.
Expected: the row exists; `ZOTTK_NO` matches `RowsJson` **including its leading digits** (the L-282 check that matters); `LOCAL_CREATED_BY` = `FS_DEV3`; the three timestamps populated.

- [ ] **Step 8: §12.5–12.7, 12.13 — the refusals**

Four calls, each HTTP 200 with `ExecStatus 'E'` and the named message **on the step row**, not the header's truncated 045:

| Call | Expect |
|---|---|
| `GenerateJson` naming `ZNOT_A_FIELD` | 050 |
| `NumberRange` with `"Object":"SOMETHING_ELSE"` | 051 |
| Generation against a target whose `AllowGen` is false (register `ZFS_T_TRM_PROBE` `TABL` without it) | 052 |
| `Uuid` on a `MODIFY`, and any `GenerateJson` on a `DELETE` | 052 |

- [ ] **Step 9: §12.8 — the dry-run guard, with the number checked either side**

Read `NRIV-NRLEVEL` for `ZFS_OTTK_D`. Then `ExecuteBatch` with `CommitMode 'NEVER'` and one `TABL` step requesting `NumberRange`.
Expected: refused with **054**, nothing written. Re-read `NRLEVEL`: **unchanged**. That second read is the whole point — a guard that refuses but has already drawn the number would look identical without it.

- [ ] **Step 10: §12.10 — generation inside a batch**

`ExecuteBatch`, `CommitMode 'AUTO'`, one `TABL` step carrying `GenerateJson` inside `StepsJson`. Mind the escaping: `*Json` fields nest **three** levels deep inside a batch step (L-335) — build innermost-first and let the serialiser escape.
Expected: `ExecStatus 'S'`, the step's `RowsJson` carrying its generated values. This also confirms Step 2's claim that the step path was never subject to the §7 break.

- [ ] **Step 11: §12.9 — `Committed` / `RolledBack` on an abort**

Reproduce L-496's shape with a generating step: `[TABL INSERT with GenerateJson, FUNC NUMBER_GET_NEXT with OBJECT 'ZFSNOOBJ']`, the `FUNC` target registered `CALL_MODE 'L'` so the LUW-coherence guard passes it.
Expected: `ExecStatus 'E'`, 045 naming step 2, `RolledBack 'X'`, `Committed` blank — and the inserted row **gone**, while `NRIV-NRLEVEL` has still advanced. That last pair is spec §10 made visible: the row rolls back, the number does not.

- [ ] **Step 12: §12.12 — the escalation check still holds**

`RegisterTarget` on `ZFS_T_DYN_REG` with `"AllowGen":true`.
Expected: refused, message **039**, nothing written to registry or history.

- [ ] **Step 13: §12.14 — `SysFields` on a MODIFY**

`ExecuteTableCrud` `MODIFY` on the Step 6 row with `GenerateJson` `{"SysFields":"AUDIT"}` and one changed business field.
Expected: `ExecStatus 'S'`; re-read shows `LOCAL_LAST_CHANGED_AT` advanced, `LOCAL_CREATED_AT` and the key untouched.

- [ ] **Step 14: Record the evidence and commit**

Save every payload and response under `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/`. Evidence is **committed**, not gitignored.

```bash
git add worklog/DS4_100_NIIF/2026-09/
git commit -m "dyngw v2 generators: live acceptance, all 14 criteria with evidence"
```

**If any criterion fails, stop and report it** rather than adjusting the criterion to match the behaviour.

---

## Task 9: Documentation, ledger, and the stale-rule correction

**Files:**
- Modify: `docs/dyngw-v2-api.md`, `docs/dyngw-v2-how-it-works.md`, `docs/dyngw-v2-integration-guide.md`
- Modify: `CLAUDE.md`, `AGENTS.md`
- Modify: `lessons/lessons-ledger.md`
- Modify: `docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md` (status line)

**Interfaces:**
- Consumes: the Task 8 results
- Produces: docs a Phase 2 implementer can build the console from

- [ ] **Step 1: Update the API reference**

In `docs/dyngw-v2-api.md`: `GenerateJson` in §3.3's `ExecuteTableCrud` shape and §3.6's step shape; `Committed`/`RolledBack` in §4's result table; messages 050–054 in §7; §8's known limits gain the one-NR-object-per-row limit, the operation restriction, and that generated numbers sit outside rollback. Mark each new shape **proved live** or **built, not proved** according to what Task 8 actually returned — never mark something proved because the plan expected it.

- [ ] **Step 2: Update the architecture doc**

In `docs/dyngw-v2-how-it-works.md`: a section on the generator engine — why permission is hybrid, why the number-range allow-list is one column rather than a list (the L-441 failure shape), and why a dry run refuses to draw. Update the L-497 discussion to say the flags are now exposed.

- [ ] **Step 3: Update the integration guide**

In `docs/dyngw-v2-integration-guide.md`: a subsection under §6 on registering a target with `AllowGen`/`GenNrObject`, and the §7 batching note that a generating step cannot ride a `CommitMode NEVER` batch. Add the generator checks to §9's proof-graded checklist.

- [ ] **Step 4: Correct the two stale rule files**

`CLAUDE.md`'s RAP/dyngw v2 index row says the L-350 rollback rebuild "is **not yet proved end to end** — phase-1 is proved, phase-2 abort/rollback is not". **L-496 proved it live on 2026-09-13** with a positive control. Correct the row, and add the generators to the same row's watch-list. Make the matching change in `AGENTS.md` — a standing rule changed in only one of the two makes the workspace agent-dependent (L-221).

- [ ] **Step 5: Append the lessons**

Continue from the ledger's current highest `L-nnn`. At minimum, one entry for whatever Task 8 Step 3 actually returned (the non-nullable break confirmed, or not). Add an entry for any platform behaviour found while building — `NUMBER_GET`'s width handling in practice, `/ui2/cl_json`'s treatment of a `sysuuid_x16` on the way out, anything the plan predicted wrongly. Append-only: never renumber or delete.

- [ ] **Step 6: Close the spec and the worklog**

Set the spec's status line to implemented, with the transport number and the Task 8 date. Tick every worklog todo, complete its object list, and answer its open questions — including spec §15's question 2 (the `ZOTTK_NO` band) if the human has answered it by then.

- [ ] **Step 7: Commit**

```bash
git add docs/ lessons/lessons-ledger.md CLAUDE.md AGENTS.md worklog/
git commit -m "dyngw v2 generators: docs, lessons, and the L-496 correction to CLAUDE.md/AGENTS.md"
```

---

## What this plan does not do

- **Phase 2, the console.** `web/dyngw-v2-console/` on port 8773 is scoped in spec §13 and gets its own plan once Task 8 passes.
- **Phase 3, step-output binding.** Spec §14 — designed, deferred, not built.
- **Generators for `FUNC` or `SUBM`.** Spec §3, out of scope.
- **Proving the authorization model against a restricted caller.** Spec §9 — that gap predates this change and this change does not close it.
