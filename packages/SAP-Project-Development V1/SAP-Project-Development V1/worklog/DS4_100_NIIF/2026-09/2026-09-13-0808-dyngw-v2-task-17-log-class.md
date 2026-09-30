# Dyngw v2 Task 17 — ZCL_FS_DYN_LOG (call/step log builder and idempotency)

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (object actually landed on this request, not the task DS4K907264 named
  in the dispatch — see Open questions)
- **Requested by:** human, via `.superpowers/sdd/2026-09-12-dyngw-v2/task-17-brief.md`

## Scope

Build `ZCL_FS_DYN_LOG`, the class that shapes (never writes) the durable call/step log rows for
the dynamic gateway v2's RAP layer: `build_call` (one `ZFS_T_DYN_CALL` row), `build_steps` (the
`ZFS_T_DYN_STEP` rows for one call), and `find_replay` (a stored call row by `RequestId`, or
initial). Implements the blank-`request_id` rule from the Task 17 brief: a caller sending no
`RequestId` gets the row's own `call_uuid` written into `request_id`, so Task 3's unique index
never sees a second blank. Out of scope: any INSERT/COMMIT/MODIFY ENTITIES (Task 18's behaviour
pool does the actual persistence), and every other object in the framework — Task 16's CallLog/
CallStep BOs were being reviewed concurrently and were not touched.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Dispatch said objects land on task `DS4K907264`; `abap_transport-get` did not list it and `create_object`/`setObjectSource` both landed the object on `DS4K907263` itself. | Proceeded on `DS4K907263`, the parent request, since that is what the system actually offered and accepted — flagging here rather than forcing a task number the tooling did not surface. | 2026-09-13 |

## Naming gate

```
NAMING: ZCL_FS_DYN_LOG -> matches "Class | ZCL_FS_<AREA>_<NAME>" (AREA=DYN, NAME=LOG),
        docs/naming-conventions.md, consistent with sibling ZCL_FS_DYN_DISPATCH / ZCL_FS_DYN_JSON
        already live in ZFS_DYN_GW under the same pattern.
```

## Todo

- [x] 1. Read the Task 17 brief, `CLAUDE.md`, `lessons-ledger.md` L-400+.
- [x] 2. Read `ZCL_FS_DYN_DISPATCH` and `ZCL_FS_DYN_JSON` source (`mcp-abap-abap-adt-api`,
      read-only) to fix the exact field shapes `build_call`/`build_steps` must consume
      (`ty_result`, `ty_step_result`, `ZCL_FS_DYN_JSON=>cap`).
- [x] 3. NAMING gate recorded before create.
- [x] 4. Create `ZCL_FS_DYN_LOG` (CLAS/OC) via `adt-mcp`.
- [x] 5. Write RED: class body + test include with 5 tests from the brief, deliberately
      incomplete/wrong bodies so every assertion can fail for a real reason; activate; confirm
      RED via `unitTestRun`.
- [x] 6. Implement GREEN: real `build_call`/`build_steps`/`find_replay`/helpers; activate; confirm
      GREEN via `unitTestRun`.
- [x] 7. ATC run — 0 findings.
- [x] 8. Ledger entries L-460..L-462; this worklog; commit documentation.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_DYN_LOG | CLAS/OC | ZFS_DYN_GW | DS4K907263 | Created, active, ATC clean |
| ZCL_FS_DYN_LOG / TESTCLASSES | CLAS test include | ZFS_DYN_GW | DS4K907263 | Created, active, 5/5 green |

## Design notes (for Task 18's implementer)

- `build_call`'s `is_result` parameter is a **new** type `ty_call_result`, not
  `ZCL_FS_DYN_DISPATCH=>ty_result` directly — it carries `ty_result`'s header fields
  (`exec_status`, `error_category`, `msgid`, `msgno`, `msgtext`, `step_count`, `result_count`)
  **plus** `log_level` and `request_json`, which the dispatcher's result does not carry (log level
  is a registry-row property the RFC/behaviour-pool layer knows; the raw request JSON is the whole
  batch payload, assembled before dispatch). Task 18 maps `zcl_fs_dyn_dispatch=>run( )`'s `result`
  field-by-field into `ty_call_result` and sets `log_level`/`request_json` itself.
- `build_steps`'s `it_results` parameter reuses `ZCL_FS_DYN_DISPATCH=>ty_step_results` **verbatim**
  — that type's own doc comment in Task 15 states it is "shaped so that ZFS_T_DYN_STEP can be
  filled from it field for field by the logging layer above, without this class knowing that the
  table exists," which is exactly this class. So `run( )-steps` passes straight through with no
  reshaping.
- Each step's `response_json` is built from whichever of `rowsjson`/`exportjson`/`tablesjson` are
  non-blank (`rowsjson` for QURY/TABL; `exportjson` and/or `tablesjson` for FUNC — wrapped together
  as `{"export":...,"tables":...}` if a FUNC step populated both, so neither is silently dropped).
  This combination rule is not in the brief or covered by its tests; it is my design decision to
  reconcile three source fields into the table's one `RESPONSE_JSON` column, documented in the
  `combine_payload` method comment.
- Every step's `response_json` is always capped via `ZCL_FS_DYN_JSON=>cap` when non-blank — there
  is no per-step `log_level` gate (the type carries none), unlike the header, which the brief
  explicitly requires to consult `log_level` before serializing.

## Delivery checks

- [x] Pretty Printer (source read back matches intended layout; no re-format needed)
- [x] Syntax check clean (implied by clean activation, both RED and GREEN)
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — 0 findings (`abap_atc_run` on ZCL_FS_DYN_LOG)
- [x] ABAP Unit green — 5/5, `unitTestRun` on `/sap/bc/adt/oo/classes/zcl_fs_dyn_log`
- [x] Text symbols and selection texts — none apply (no screen elements)
- [ ] Object list confirmed in the transport — not independently verified via `transportInfo`
      (session already under load from earlier same-turn calls); recommend a follow-up check
      before release.

## Lessons raised

L-460, L-461, L-462 (see `lessons/lessons-ledger.md`).
