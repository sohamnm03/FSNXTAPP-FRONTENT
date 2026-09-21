# RAP Unmanaged BO with Hand-Coded CRUD — Web API Pattern

Runbook for "create an unmanaged RAP BO, hand-implement CRUD/lock/save/validation, expose as a
Web API" on top of an existing table. Distilled from the `ZFS_T_TRM_LIMPT` → `TrmLimPtTP` build.
No generator supports `implementationType: Unmanaged` — this is entirely hand-crafted CDS/BDEF/class,
created object-by-object via `abap_creation-create_object` + `mcp-abap-abap-adt-api` source calls.

## 1. Layering — behavior attaches to the table-select view, not a re-projected root

`docs/naming-conventions.md` calls for `ZFS_I_<Entity>` (interface, no behavior) →
`ZFS_R_<Entity>TP` (restricted reuse view, carries the BDEF) → `ZFS_C_<Entity>TP` (projection,
exposed). **This 3-layer shape does not work for `implementationType: Unmanaged`.**

`abap_creation-run_validation` for `BDEF/BDO` rejects `Unmanaged` on a root entity that is itself
`as projection on <other view>`, with `The specified implementation type Unmanaged for root entity
<X> is not valid` — no further detail. Confirmed empirically: the same call against a view that
selects **directly from the table** validates fine. This matches SAP's own unmanaged samples (e.g.
`ZI_RAP_Travel_U_####`), where the behavior is declared directly on the interface view.

**Working shape for unmanaged:** `ZFS_I_<Entity>` is `define root view entity` (must be root — see
§2), selects directly from the table, and **carries the BDEF**. `ZFS_R_<Entity>TP` is skipped
entirely. `ZFS_C_<Entity>TP` projects straight onto `ZFS_I_<Entity>` and carries the projection
BDEF (`projection; strict(2); define behavior for ZFS_C_... { use create; use update; use delete; }`).

If a `ZFS_R_<Entity>TP` shell was already created before this constraint was discovered, it cannot
be deleted (`deleteObject` is a denied permission project-wide) — leave it orphaned/inactive-of-use
and note it in the build report rather than silently absorbing it into the chain.

## 2. `ROOT` keyword propagation

`define root view entity B as projection on A` fails activation with `ROOT keyword not valid since
A is not a root property` unless `A` is *also* `define root view entity`. Both the interface view
and the projection view need the `root view entity` keyword when one projects onto the other for
RAP purposes — "root" here is the CDS composition-root keyword, a different concept from "the RAP
BO root layer" in the naming doc, and the two must still agree.

## 3. Unmanaged BDEF — what's valid and what isn't

Confirmed shape (activates clean or with only cosmetic warnings):

```abap
unmanaged implementation in class zbp_fs_<entity>tp unique;
strict ( 2 );

define behavior for ZFS_I_<Entity> alias <Alias>
etag master LastChangedAt
lock master
authorization master ( global )

{
  create;
  update;
  delete;

  field ( readonly )        Pid, LocalCreatedBy, LocalCreatedAt, LocalLastChangedBy, LocalLastChangedAt, LastChangedAt;
  field ( mandatory : create ) CoCode, TxnNo;
  field ( readonly : update )  CoCode, TxnNo;

  mapping for ZFS_T_TRM_LIMPT
  {
    Pid = pid;
    CoCode = co_code;
    ...
  }
}
```

- **`mapping for <table> { ... }` is valid and useful for unmanaged** — it doesn't drive automatic
  SQL (that's managed-only) but it powers `CORRESPONDING #( entity MAPPING FROM ENTITY )` /
  `MAPPING TO ENTITY` in your own handler code, so you don't hand-assign every field.
- **`validation ... on save { ... }` is REJECTED** for plain unmanaged: `"validation" requires the
  implementation type "unmanaged" with draft or the implementation type "managed"`. Do the checks
  inline inside `create`/`update` instead (append to `failed-<alias>`/`reported-<alias>` directly)
  — this is the correct place for "validation control" on a plain (non-draft) unmanaged BO, not a
  BDEF-level `validation` operation.
- **`strict ( 2 )` requires an `authorization` clause** on every entity (`authorization master
  ( global )` or `( instance )`) — omitting it is a hard activation error, not a warning.
  **`( global )` still REQUIRES a `GET_GLOBAL_AUTHORIZATIONS` handler method — this is not
  optional** (corrected 2026-09-04, L-238, after a prior version of this doc claimed otherwise and
  that was proven wrong by a live test). The `GLOBAL AUTHORIZATION ... not implemented` warning does
  not block *activation*, but the framework calls this method on every modifying request at
  *runtime* regardless of a DCL being present — a DCL only covers **instance** authorization, a
  separate check. Skipping the handler activates clean and then dumps
  (`CX_RAP_HANDLER_NOT_IMPLEMENTED` / `RAISE_SHORTDUMP`) on the first live `POST`/`PATCH`/`DELETE`.
  Minimal implementation for a DCL-only scheme (defer the actual decision to the DCL, just satisfy
  the framework's callback):
  ```abap
  METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
    IMPORTING REQUEST requested_authorizations FOR <Alias> RESULT result.
  ```
  ```abap
  METHOD get_global_authorizations.
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.
  ```
  The component names are `%create`/`%update`/`%delete` — **not** `%global-create` etc. (a natural
  but wrong guess). Only a live functional test surfaces the missing handler; a clean activation and
  clean ATC run both stay silent about it.
- Key fields should be flagged `field ( readonly : update )` (warning if omitted, not an error).

## 4. `SAVER ... is not implemented` — a saver class is expected even for plain unmanaged

Test-compiling an empty behavior-pool shell against the BDEF surfaces warnings for every declared
operation, always including `The operation "SAVER <entity>" is not implemented` — even with no
`with additional save`/draft addition in the BDEF. A local class inheriting
`cl_abap_behavior_saver` redefining `SAVE` (not `SAVE_MODIFIED` — that's the managed/additional-save
hook, see `[[rap-managed-additional-save-pattern]]`) is expected to exist.

If your `create`/`update`/`delete` handler methods already do direct Open SQL (`INSERT`/`UPDATE`/
`DELETE FROM <table>`) rather than buffering into a legacy layer, `SAVE` can be a deliberate no-op —
RAP's own save-sequence COMMIT WORK/ROLLBACK WORK still governs whether those statements land,
exactly like any other Open SQL inside an implicit LUW. Add the class purely to satisfy the
framework's expectation and close the warning:

```abap
CLASS lsc_<entity>tp DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.
CLASS lsc_<entity>tp IMPLEMENTATION.
  METHOD save.
    " Persistence already committed directly in create/update/delete.
  ENDMETHOD.
ENDCLASS.
```

## 5. `%key` exists on `entities` (FOR CREATE/UPDATE) but NOT on `keys` (FOR DELETE/LOCK/READ)

`ls_entity-%key` (inside `create`/`update`, importing `entities`) compiles fine. The identical
pattern on `keys` (inside `delete`/`lock`, importing `keys`) fails: `The data object "LS_KEY" does
not have a component called "%KEY"`. For `delete`/`lock`, build the failed/mapped/reported key
structure field-by-field instead: `VALUE #( %key-pid = ls_key-pid %key-cocode = ls_key-cocode ... )`.

## 6. UUID key generation is manual (no `numbering: managed` for unmanaged)

Generate the technical key inside `create`, then report it via `mapped-<alias>` keyed by `%cid`:

```abap
TRY.
    ls_db-pid = cl_system_uuid=>create_uuid_x16_static( ).
  CATCH cx_uuid_error.
    " append %cid to failed/reported and CONTINUE
ENDTRY.
...
APPEND VALUE #( %cid = ls_entity-%cid %key-pid = ls_db-pid %key-cocode = ls_db-co_code %key-txnno = ls_db-txn_no )
  TO mapped-trmlimit.
```

Admin timestamp fields (`abp_creation_tstmpl`, `abp_lastchange_tstmpl`, etc.) are **TIMESTAMPL-based,
not UTCLONG** — `GET TIME STAMP FIELD lv_ts.` compiles; assigning `utclong_current( )` to them does
not (`The result type of "UTCLONG_CURRENT" cannot be converted`). Verify with a throwaway
`syntaxCheckCode` snippet before committing to one or the other on a new table — don't assume.

## 7. Locking — `cl_abap_lock_object_factory`, not `CALL FUNCTION 'ENQUEUE_...'`

Unmanaged has no automatic lock (that's tied to managed's `persistent table` clause), so `lock
master;` needs a real `FOR LOCK` handler. Calling the generated `ENQUEUE_E<name>` function module
directly is an unreleased API under ABAP Cloud rules. Use the released wrapper instead:

```abap
METHOD lock.
  TRY.
      DATA(lo_lock) = cl_abap_lock_object_factory=>get_instance( iv_name = 'EZFS_T_TRM_LIMPT' ).
    CATCH cx_abap_lock_failure.
      " lock object itself unavailable — fail all keys, RETURN
  ENDTRY.
  LOOP AT keys INTO DATA(ls_key).
    TRY.
        lo_lock->enqueue( it_parameter = VALUE #(
          ( name = 'PID' value = REF #( ls_key-pid ) )
          ( name = 'CO_CODE' value = REF #( ls_key-cocode ) )
          ( name = 'TXN_NO' value = REF #( ls_key-txnno ) ) ) ).
      CATCH cx_abap_foreign_lock INTO DATA(lx_fl).
        " %key-pid/%key-cocode/%key-txnno into failed/reported; lx_fl->user_name for the message
      CATCH cx_abap_lock_failure.
        " technical failure
    ENDTRY.
  ENDLOOP.
ENDMETHOD.
```

The lock object itself (`ENQU/DL`, name `EZFS_T_<NAME>` per the Dictionary naming row) is created
via `abap_creation-create_object` with just `{ packageName, name, primaryTable }` — the ADT default
auto-selects every primary-key field of `primaryTable` as a lock parameter (confirmed: activating it
produced only a benign warning — `Lock parameter TXN_NO meaningless...` — not an error — for a
3-component key). No separate field-selection step was needed or available through these MCP tools.

**The lock object name has its own 16-char cap, independent of the table name's own cap (L-242).**
`E` + a full-length 16-char table name (the platform max for a transparent table, L-099) is 17
characters and `run_validation` rejects it (`ENQU/DL` `name` field `maxLength: 16`). Character-count
the proposed lock object name against the *actual* table name before proposing it — don't assume the
`EZFS_T_<NAME>` convention always has room; shorten by dropping a redundant segment (e.g. an `AREA`
already implied by the rest of the name) and record the shortened name as a naming-gate deviation
with the reason, not silently.

## 8. Free-text validation messages without a message class

`new_message_with_text( text = '...' severity = if_abap_behv_message=>severity-error )` (inherited
from `CL_ABAP_BEHV`, available in any behavior handler) reports a message without needing a T100
entry — use this for inline `create`/`update` validation failures instead of registering new numbers
in `ZFS_TEST_VS` (which is for FM/report-style messages, not RAP behavior messages).

**Standard shape for a basic field validation: one private helper method on the LHC class, called
from every `create`/`update` that needs it — never duplicate the `IF` checks inline (L-248).** The
BDEF-level `validation ... on save { }` operation is not an option here at all — it is rejected
outright for a plain (non-draft) unmanaged BO, so this is not a fallback style choice, it is the only
place these checks can live:

```abap
PRIVATE SECTION.
  TYPES: BEGIN OF ty_validation_result,
           valid   TYPE abap_bool,
           msgtext TYPE string,
         END OF ty_validation_result.

  METHODS validate_<aspect>
    IMPORTING iv_<field1>      TYPE <table>-<field1>
              iv_<field2>      TYPE <table>-<field2>
    RETURNING VALUE(rs_result) TYPE ty_validation_result.
```

```abap
METHOD validate_<aspect>.
  rs_result-valid = abap_true.
  IF iv_<field1> IS NOT INITIAL AND <condition that fails>.
    rs_result-valid   = abap_false.
    rs_result-msgtext = '<message text, 50 chars max — see the note below>'.
    RETURN.
  ENDIF.
  " further checks, same shape ...
ENDMETHOD.
```

Two gotchas found building this pattern's first real user (L-249/L-250):

- **`NEW_MESSAGE_WITH_TEXT`'s text is silently capped at 50 characters** — no error, no truncation
  marker, it just stops mid-word in the OData error payload. Character-count every message text
  against this cap before writing it (a `ZFS_TRM_MSG` catalog message via `NEW_MESSAGE` is not
  affected — only this free-text path).
- **`IS NOT INITIAL` cannot guard a "must be positive"/"must be non-zero" check on a CURR/DEC/QUAN
  field** — a numeric field's ABAP-initial value **is** zero, so "not supplied" and "supplied as 0"
  are indistinguishable, and the guard silently exempts the one value the rule exists to catch. Only
  use `IS NOT INITIAL` as a skip-guard for fields where the initial value is a genuine sentinel
  distinguishable from every valid value (e.g. `DATS`-initial `'00000000'` for a date check) — for a
  bare positivity/non-zero check, test the condition unconditionally instead.

Call it as a functional expression from both `create` (against the incoming entity row) and `update`
(against the **merged** row, i.e. after `CORRESPONDING BASE( ls_db ) ls_entity MAPPING FROM ENTITY`,
so a partial `PATCH` is checked against the row's final state, not just the delta):

```abap
DATA(ls_check) = validate_<aspect>( iv_<field1> = ls_entity-<field1> iv_<field2> = ls_entity-<field2> ).
IF ls_check-valid = abap_false.
  APPEND VALUE #( %cid = ls_entity-%cid %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-<alias>.
  APPEND VALUE #( %cid = ls_entity-%cid
                   %msg = NEW_MESSAGE_WITH_TEXT( text = ls_check-msgtext severity = if_abap_behv_message=>severity-error ) )
    TO reported-<alias>.
  CONTINUE.
ENDIF.
```

The caller — not the shared method — builds the `failed`/`reported` entry, because `create` keys it
by `%cid` and `update`/`delete` key it by `%key-<field>`; that shape genuinely differs per operation
and doesn't belong inside the shared validation method. Skip a check silently when its field is
initial unless the field is separately `field ( mandatory )` in the BDEF — "not supplied" is not the
same failure as "supplied and invalid."

## 9. Service definition/binding creation quirks

- `SRVD/SRV` creation via `abap_creation-create_object` needs `sourceType` (`"S"`) even though the
  schema doesn't mark it required — omitting it throws a raw NPE (`serviceDefinitionInfo.sourceType
  is null`) rather than a clean validation error.
- `referencedObject` on a fresh `DDLS/DF`/`SRVD/SRV` create can spuriously fail with `Referenced
  object is inactive` immediately after the referenced object was activated (propagation lag between
  `adt-mcp` and `mcp-abap-abap-adt-api`). Workaround: omit `referencedObject` from the create call
  (it's optional) and hand-write the full source via `setObjectSource` instead of relying on the
  generator's auto-population.
- Web API binding type string is `"OData V4 - Web API"` (vs `"OData V4 - UI"`) in
  `abap_creation-get_object_type_details` for `SRVB/SVB`.

## 10. Publish with `scripts/sap-gui-publish-service.py`

Same as `[[rap-managed-additional-save-pattern]]` §6 — `publishServiceBinding` returns
`{"status":"success"}` unconditionally and cannot be trusted. Publish with the script, not that call:

```powershell
"tools\mcp-sap-gui\.venv\Scripts\python.exe" scripts\sap-gui-publish-service.py `
  --group-id <BINDING_NAME> --yes
```

This is the standard publish step for every RAP binding (managed or unmanaged) in this workspace as
of 2026-08-22 (L-229/L-232) — see `docs/sap-gui-object-automation.md` Script 3.

If the script's row-match still fails (L-237, not yet fixed) and you fall back to the manual
`/IWFND/V4_ADMIN` `sap-gui` flow: the "Get Service Groups" step can first demand a non-blank
**System Alias** on `IP_SYSTEM_ALIAS`, blocking with "Specify a System Alias" if it's left empty
(L-246, seen 2026-09-04, not mentioned in the original L-232 write-up). Set focus on that field,
send `F4`, read the hit-list grid, and pick **`LOCAL`** (`RFC_DEST = NONE`) for any locally-hosted
service in this workspace, then proceed with filtering as before.

## 11. `update`/`delete` handlers: a positional `SELECT col, col, ... INTO @wa` must match *this*
table's own field order — never copy a sibling BO's list verbatim

A plain `SELECT col_a, col_b, ... INTO @ls_wa` (no `INTO CORRESPONDING FIELDS OF`) assigns
**positionally** against the target structure's component order, not by name. Two tables that look
identical in shape (same domain, same era, mostly-overlapping field names) can still declare fields
in a different order — copying a sibling BO's `update` method's `SELECT` list as a starting point can
silently misalign columns, surfacing only as an activation error like `"The data type of the
component \"X\" of \"LS_WA\" is not compatible with the data type of \"Y\""` (L-243, 2026-09-04).
Always re-derive the column list from **this** table's own `getObjectSource`, field by field — don't
assume a same-shaped sibling table shares the order.

Also list **every** column of the table in that `SELECT`, not just the ones the CDS view/BDEF expose
— a partial list followed by `MODIFY <table> FROM ls_wa` silently zeroes out every unselected column
on every update, including columns that exist on the table but aren't part of this BO's exposed API.

## 12. Functional smoke test gotchas — OData JSON typing and the Bash/PowerShell sandbox

Two findings from live-testing a freshly published binding (L-244/L-245, 2026-09-04):

- **A CURR/DEC field must be sent as a bare JSON number, never a quoted string.** A payload like
  `{"Amount": "10000.00"}` fails with `CX_SXML_PARSE_ERROR` / `"Property 'Amount' at offset '...' has
  invalid value '10000.00'"`. Send `{"Amount": 10000.00}` instead. Building the body via PowerShell's
  `@{ ... } | ConvertTo-Json` quotes any value that started life as a string — make the hashtable
  value an actual numeric type, or assemble the JSON as a raw string literal.
- **The Bash/PowerShell tool sandbox silently no-ops non-`GET` calls to an external host.** A `POST`/
  `PATCH`/`DELETE` inside a normal (sandboxed) call throws a `System.Net.WebException` with a
  **null** `Response` and an **empty** `Message` — it looks like a TLS/network failure but isn't one;
  the request never left the sandbox. The identical call with `dangerouslyDisableSandbox: true`
  returns the real HTTP response. Recognize this signature (contentless exception, non-`GET` verb)
  and reach for the sandbox override rather than debugging connectivity.

## Worked example object names (ZFS_T_TRM_LIMPT)

`ZFS_I_TrmLimPt` (interface + root + BDEF, unmanaged) · `ZFS_C_TrmLimPtTP` (projection + BDEF) ·
`ZBP_FS_TRMLIMPTTP` (`LHC_TRMLIMPTTP` + `LSC_TRMLIMPTTP`) · `EZFS_T_TRM_LIMPT` (lock object) ·
`ZFS_SD_TRMLIMPT` · `ZFS_SB_TRMLIMPT_O4_API` · `ZFS_I_TRMLIMPT` (DCL). All in `ZFS_K2_AI_DEV`.
`ZFS_R_TrmLimPtTP` was created first per the naming doc's 3-layer expectation, then found unusable
for `Unmanaged` per §1 — left orphaned in the package (deletion denied by policy).
