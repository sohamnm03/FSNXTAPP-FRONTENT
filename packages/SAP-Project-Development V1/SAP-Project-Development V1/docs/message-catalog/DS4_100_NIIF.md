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

All 32 are flagged **self-explanatory**, so no long text is required.

**Next free number: 033.**

Messages **027–032** were added on 2026-09-10 for the dynamic gateway's `SUBM` step kind
(`worklog/DS4_100_NIIF/2026-09-10-dyngateway-submit-kind.md`), on transport `DS4K907018`, and
verified in `T100` after the write. `SUBM` also **reuses** 017, 018, 022, 023, 024, 025 and 026
rather than adding near-duplicates.

## Naming

`ZFS_TRM_MSG` is a **listed exception** to the `ZFS_MSG_<AREA>` pattern — named by the human, valid
as-is. See the *Classic & Misc* section of `docs/naming-conventions.md`. Do not "correct" it.
