# RAP Managed BO with Additional Save — Web API Pattern

Runbook for "create a RAP Managed BO with additional save, exposed as a Web API" on top of
an existing table. Distilled from the `ZFS_T_TRM_LIMITP` → `TrmLimitPTP` build. Read this before
repeating the scenario — it captures syntax that isn't discoverable from generator output alone.

## 1. Table prerequisite

The table needs a technical UUID key field for the RAP root to key off cleanly (see
`docs/ddic-table-template.md`). Composite keys (client + UUID + existing business keys) are fine —
the generator maps every DB key field to a CDS key field 1:1; it does not let you demote a table key
to a non-key CDS field.

## 2. Pick the generator

| Scenario | Generator ID |
|---|---|
| Table doesn't exist yet, need Fiori UI | `x-ui-service` |
| Table exists, need Fiori UI | `uiservice` |
| Table exists, Web API only (no Fiori) | `webapiservice` |

Get the ID list with `mcp__adt-mcp__abap_generators-list_generators` — the IDs are one word, no
hyphens (`webapiservice`, not `webapi-service`; this differs from what some generic RAP-generator
skill docs say).

For `webapiservice`, `mcp__adt-mcp__abap_generators-get_schema` (with `referencedObjectType: "TABL"`,
`referencedObjectName: "<table>"`) returns a `referenceContent` block with **suggested** names
(`ZR_FS_<TABLE>`, `ZC_FS_<TABLE>`, `ZBP_FS_<TABLE>`, `ZAPI_FS_<TABLE>_O4`). **Do not use these
verbatim** — they don't match `docs/naming-conventions.md` (root/projection views must be
`ZFS_R_`/`ZFS_C_`, not `ZR_FS_`/`ZC_FS_`). Build conformant names yourself:

| Layer | Pattern | Notes |
|---|---|---|
| Root view + BDEF | `ZFS_R_<Entity>TP` | TP suffix since additional save implies transactional |
| Projection view + BDEF | `ZFS_C_<Entity>TP` | |
| Behavior pool | `ZBP_FS_<ENTITY>TP` (upper case) | |
| Service definition | `ZFS_SD_<Entity>` | TP stripped |
| Service binding | `ZFS_SB_<Entity>_O4_API` | TP stripped; **max 26 chars** — keep `<Entity>` short |
| Access control (DCL) | same name as the root view it protects | `ZFS_R_<Entity>TP` (L-122) |

**Before submitting the spec, search for every one of these names** (`searchObject` with the right
`objType`: `DDLS/DF`, `CLAS/OC`, `SRVD/SRV`, `SRVB/SVB`). A prior generator run — yours or someone
else's, possibly on a *different* source table — can already occupy the "obvious" entity name and
the generator will reject the whole spec with `<name> of type <X> already exists` and zero objects
created. If that happens, do not delete the pre-existing objects (deletion is denied by policy);
pick a different entity name, confirm with the human, re-check for collisions, then generate.

## 3. Generate and activate

`mcp__adt-mcp__abap_generators-generate_objects` returns the actual created object list — use those
names/URIs, not the ones you submitted (the generator can still adjust them). Activate everything via
`mcp__mcp-abap-abap-adt-api__activateObjects` (`adt-mcp`'s own `abap_activate_objects` wants
`abap:/repotree-v1/...` file URIs, not `/sap/bc/adt/...` ADT paths — passing an ADT path there throws
`Project must not be <null>`).

## 4. Enable additional save — exact syntax

The generator never sets this up; you add it by hand after generation.

**BDEF change** — the addition goes on the `managed` keyword itself, not as a separate `with`
statement:

```abap
managed with additional save implementation in class ZBP_FS_<ENTITY>TP unique;
strict ( 2 );
```

`with additional save;` as its own line **fails to parse** — `"BOPF | draft | hierarchy" was
expected, not "additional".` The standalone `with ...;` statement only accepts BOPF/draft/hierarchy
additions; additional save is not one of them.

**Saver class** — a local class inheriting `cl_abap_behavior_saver`, added to the behavior pool's
`implementations` include (same include as the `LHC_` handler class):

```abap
CLASS lsc_<entity>tp DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_<entity>tp IMPLEMENTATION.
  METHOD save_modified.
    " additional persistence beyond the managed table
  ENDMETHOD.
ENDCLASS.
```

Only `SAVE_MODIFIED` is mandatory for plain `with additional save`. Two mistakes to avoid:

- Redefining `SAVE` instead of `SAVE_MODIFIED` — `SAVE` is the **unmanaged**-behavior save hook;
  `SAVE_MODIFIED` (importing `create`/`update`/`delete`) is the managed one.
- Adding `FINALIZE` / `CHECK_BEFORE_SAVE` without a reason — they compile, but pulling in a method
  the framework isn't expecting for this save variant surfaces as a **misleading** error on
  activation: `The method "FINALIZE" cannot be redefined in accordance with BEHAVIOR definition
  "<root>".` The error names the first method in the list, not necessarily the wrong one — if you
  see it, first check every redefined method is actually appropriate for the declared save variant,
  and try activating the class in isolation to narrow it down.
- `CLEANUP` / `CLEANUP_FINALIZE` need the `and cleanup` addition on the BDEF line; don't redefine
  them unless you've added that.

Activate the BDEF alone first, then the class alone — activating both in one call can validate the
class against a stale (pre-edit) BDEF version and throw the FINALIZE-style error even when the
source is correct; activating BDEF → class sequentially avoids that ordering issue.

## 5. Access control (DCL)

`@AccessControl.authorizationCheck: #CHECK` (which the generator always sets) makes the service
**reject every request** until a DCL exists for that view. This is a functional gap, not a
nice-to-have — always create one (or explicitly get sign-off to ship without it).

Name: same as the protected view (`ZFS_R_<Entity>TP`, per L-122 — no independent pattern to satisfy).

Minimal open-access DCL (ask the human whether open access or an auth-object-gated one is
appropriate for the data — see `[[rap-post-generation-authorization]]`):

```abap
@EndUserText.label: '<description>'
@MappingRole: true
define role ZFS_R_<ENTITY>TP {
  grant select on ZFS_R_<ENTITY>TP;
}
```

`grant select on <view> aspect all;` **fails** (`Unexpected token "aspect"`) — `ASPECT ALL` is CDS
view-entity syntax, not DCL syntax. Plain `grant select on <view>;` is the unrestricted form.

## 6. Publish the service binding

**`mcp__mcp-abap-abap-adt-api__publishServiceBinding` can return `{"status":"success"}` without
actually publishing anything.** Confirmed reproducible (same binding, both `"active"` and `"0001"`
as `version`, both original-case and lowercase `name` — always `"success"`, never actually
published). Don't trust the return value.

**Publish with `scripts/sap-gui-publish-service.py`** (human instruction, 2026-08-22 — L-229/L-232)
— this is now the standard step for every RAP publish in this workspace, not a fallback to reach for
only when something else fails:

```powershell
"tools\mcp-sap-gui\.venv\Scripts\python.exe" scripts\sap-gui-publish-service.py `
  --group-id <BINDING_NAME> --yes
```

Omit `--yes` first to confirm the binding is actually in the unpublished-candidates list before
committing. The script drives the same `/IWFND/V4_ADMIN` → Publish Service Groups → ALV `PUBLISH`
flow directly (`mcp_sap_gui.sap_controller.SAPGUIController`, no MCP protocol layer, no per-field
model round trip — one process call) and reports `"ok": true/false` plus whether the group still
shows as unpublished afterward — that result **is** the verification, no separate `fetch_services`
call needed. Full flow detail and known deviations: `docs/sap-gui-object-automation.md` Script 3.

## Worked example object names (ZFS_T_TRM_LIMITP)

`ZFS_R_TrmLimitPTP` (root+BDEF) · `ZFS_C_TrmLimitPTP` (projection+BDEF) ·
`ZBP_FS_TRMLIMITPTP` (`LHC_TRMLIMITPTP` + `lsc_trmlimitptp`) · `ZFS_SD_TRMLIMITP` ·
`ZFS_SB_TRMLIMITP_O4_API` · `ZFS_R_TRMLIMITPTP` (DCL). All in `ZFS_K2_AI_DEV`.
