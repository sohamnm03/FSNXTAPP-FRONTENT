# Dynamic OData Gateway — `ZFS_T_SLC_DYNGW` + RAP unmanaged Web API

- **Date:** 2026-09-09
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** Karthik R

## Scope

Build one OData V4 Web API that dispatches **dynamically**, so no new ABAP object is needed per
integration target. Three capabilities, each a static RAP action:

1. `CallFunctionModule` — call any registered FM, passing IMPORTING / EXPORTING / TABLES / CHANGING
   parameters through as JSON.
2. `ExecuteTableCrud` — INSERT / MODIFY / DELETE against any registered table.
3. `RunQuery` — dynamic SELECT over any registered table or CDS view entity, with a projected field
   list, a structured filter, a sort and a row cap.

Persistence is a new table `ZFS_T_SLC_DYNGW` that is **both** the allowlist registry (`entry_type`
= `R`) and the call log (`entry_type` = `L`). A RAP **unmanaged** BO gives hand-coded CRUD over it,
so maintaining the registry and reading the audit trail happen through the same service.

**Out of scope:** any UI or console; OData V2; draft; any target-specific wrapper object; ATC
exemption requests (findings on the dynamic statements are documented as accepted, not exempted).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Table role — registry, log, or both? | **Both, in one table**, discriminated by `entry_type` (`R`/`L`) | 2026-09-09 |
| 2 | How are the three capabilities reached? | **Three static RAP actions** on the root entity | 2026-09-09 |
| 3 | Parameter payload format | **JSON strings** via `/ui2/cl_json`, name/value based | 2026-09-09 |
| 4 | Language version + safety posture (dynamic `CALL FUNCTION` / dynamic SQL are not allowed in ABAP for Cloud Development) | **Standard ABAP** dispatch + **enforced registry allowlist**; ATC findings on the dynamic statements accepted and documented | 2026-09-09 |
| 5 | Table name — inherit the siblings' `_T_`-less deviation? | No. **`ZFS_T_SLC_DYNGW`**, fully conformant; the siblings' exception was cap-driven and does not apply here | 2026-09-09 |
| 6 | **Draft on the RAP BO** (rule 7 / L-224 — never decided by the agent) | **No draft.** Machine-to-machine Web API; a draft table would have no consumer | 2026-09-09 |
| 7 | Where does the dispatch logic live? | **Local classes inside the behaviour pool** — zero extra global objects (rule 3 / L-216) | 2026-09-09 |
| 8 | Service binding flavour | **OData V4 Web API** | 2026-09-09 |
| 9 | Root view name — the conformant `ZFS_R_DynGatewayTP` is rejected by `run_validation` for `Unmanaged` | **`ZFS_I_DynGateway`** + a new documented exception row; chosen over probing `ZFS_R_` first because a rejected shell cannot be deleted | 2026-09-09 |
| 10 | Dynamic SELECT filter contract | **Structured filter list** validated via `CL_ABAP_DYN_PRG`; no raw WHERE string accepted | 2026-09-09 |
| 11 | RAP LUW — the action runs in the modify phase, but DB writes belong in save | **Execute in the action** (result returned synchronously), **buffer the log row** and write it in `LSC_DynGateway~save` | 2026-09-09 |
| 12 | FM call mode (L-227: update-task internals dump from a behaviour class) | **Auto-detect from `TFDIR-FMODE`** — RFC-enabled to `DESTINATION 'NONE'`, else local; overridable per registry row via `call_mode` | 2026-09-09 |
| 13 | Seed the registry? | **Yes, 3 read-only targets** so all three modes are smoke-tested end to end | 2026-09-09 |

### Stated concern, acknowledged by the human before approval

This service is remote ABAP execution over HTTP: a caller who reaches it inherits the service
user's authorisations. The mitigations are the registry allowlist (nothing runs unregistered), the
per-target `allow_read`/`allow_write` flags, `CL_ABAP_DYN_PRG` validation of every dynamic name and
literal, and the `max_rows` cap. Raised before design, restated in the plan, approved as designed.

## Naming gate

One line per object, recorded **before** its create call (`docs/naming-conventions.md`, L-027):

```
NAMING: ZFS_T_SLC_DYNGW          -> matches Dictionary row ZFS_T_<AREA>_<NAME>, AREA=SLC, 15 <= 16
NAMING: EZFS_T_DYNGW             -> matches Dictionary row EZFS_T_<NAME>, 12 <= 16 (L-242 cap)
NAMING: ZFS_I_DynGateway         -> matches exception row added 2026-09-09 (docs/naming-conventions.md)
NAMING: ZFS_AE_DynGwRequest      -> matches CDS row ZFS_AE_<Entity>
NAMING: ZFS_AE_DynGwResponse     -> matches CDS row ZFS_AE_<Entity>
NAMING: ZFS_C_DynGatewayTP       -> matches CDS row ZFS_C_<Entity>, <Entity>=DynGatewayTP
NAMING: ZBP_FS_DYNGATEWAYTP      -> matches CDS row ZBP_FS_<Entity>, upper case
NAMING: LHC_DynGateway           -> matches local-class row LHC_<Entity>, TP stripped (L-226)
NAMING: LSC_DynGateway           -> matches local-class row LSC_<Entity>, TP stripped (L-226)
NAMING: ZFS_SD_DYNGATEWAY        -> matches CDS row ZFS_SD_<Entity>, TP stripped
NAMING: ZFS_SB_DYNGATEWAY_O4_API -> matches CDS row ZFS_SB_<Entity>_<O2/O4>_<UI/API>
NAMING: ZFS_I_DynGateway (DCL)   -> matches DCL row "same name as the view it protects" (L-122)
```

## Preconditions verified on the system before any create

- Package `ZFS_SLC_BTP` exists (DEVC/K, "SLC BTP solution", transport layer ZDS4).
- Transport `DS4K907263` — workbench request, `TRSTATUS = D` (modifiable), owner `FS_DEV3`, offered
  for this package with `RECORDING = X`. Pass the **request**, never a task under it (L-273).
- All 11 requested data elements exist: `TB_CRUSER`/`TB_UPUSER` CHAR 12, `TB_DCRDAT`/`TB_DUPDAT`
  DATS, `TB_TCRTIM`/`TB_TUPTIM` TIMS, and the three `ABP_*_TSTMPL` are **DEC 21,7 (`TIMESTAMPL`)** —
  so `GET TIME STAMP FIELD` with a `timestampl` local, never `utclong_current( )` (L-259).
- Live sibling `ZFS_SLC_OTTK_BTP` uses `key client : mandt not null;` and
  `dataMaintenance : #RESTRICTED` — live package wins over `docs/ddic-table-template.md`'s
  `#ALLOWED`.
- Next free `ZFS_TRM_MSG` number on this system: **017**.

## Todo

- [x] 1. Worklog + naming-conventions exception row
- [x] 2. `ZFS_T_SLC_DYNGW` — skeleton (adt-mcp), fields (setObjectSource), activate
- [x] 3. `EZFS_T_DYNGW` lock object, activate
- [x] 4. `ZFS_I_DynGateway` root view, activate
- [x] 5. `ZFS_AE_DynGwRequest` + `ZFS_AE_DynGwResponse` abstract entities, activate
- [x] 6. `ZFS_I_DynGateway` unmanaged BDEF (CRUD + 3 static actions), activate
- [x] 7. `ZFS_C_DynGatewayTP` projection + projection BDEF, activate
- [x] 8. `ZBP_FS_DYNGATEWAYTP` behaviour pool — `FOR BEHAVIOR OF` header + implementations, activate
- [x] 9. `ZFS_I_DynGateway` DCL, activate
- [x] 10. `ZFS_SD_DYNGATEWAY` service definition + `ZFS_SB_DYNGATEWAY_O4_API` binding, activate
- [x] 11. Messages 017–026 in `ZFS_TRM_MSG` + catalog update in the same turn
- [x] 12. ATC run; priority 1/2 resolved, priority 3 documented
- [x] 13. Publish the binding
- [x] 14. Seed 3 registry rows via the service's own CRUD
- [x] 15. Live smoke test, all 11 cases
- [x] 16. Completion report

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_SLC_DYNGW` | TABL/DT | ZFS_SLC_BTP | DS4K907263 | **active** |
| `EZFS_T_DYNGW` | ENQU/DL | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_I_DynGateway` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_AE_DynGwRequest` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_AE_DynGwResponse` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **active** (`ResultCount`, not `RowCount` - L-314) |
| `ZFS_I_DynGateway` | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_C_DynGatewayTP` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_C_DynGatewayTP` | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZBP_FS_DYNGATEWAYTP` | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_I_DynGateway` | DCLS/DL | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_SD_DYNGATEWAY` | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | **active** |
| `ZFS_SB_DYNGATEWAY_O4_API` | SRVB/SVB | ZFS_SLC_BTP | DS4K907263 | **active + published** |

12 objects. Every one is mechanically required by `docs/rap-unmanaged-web-api-pattern.md` — no
helper class, no runner, no test program (rule 3 / L-216).

## API contract

Base URL (note the `srvd_a2x` segment, L-252, and `sap-client=100` on every call, L-253):

```
/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/?sap-client=100
```

### Registry row (`entry_type = 'R'`) — maintained by plain CRUD on `DynGateway`

| Field | Meaning |
|---|---|
| `TargetKind` | `FUNC` / `TABL` / `QURY` |
| `TargetName` | FM name, table name, or CDS view entity name |
| `Operation` | for `TABL`: `INSERT`, `MODIFY` or `DELETE`; blank means all three |
| `IsActive` | `X` = callable |
| `AllowRead` / `AllowWrite` | per-target read / write permission |
| `CallMode` | `R` = `DESTINATION 'NONE'`, `L` = local, blank = auto from `TFDIR-FMODE` |
| `MaxRows` | ceiling for `RunQuery` against this target |

### Action request (`ZFS_AE_DynGwRequest`)

| Field | Used by | Meaning |
|---|---|---|
| `TargetName` | all | FM / table / view name |
| `Operation` | `ExecuteTableCrud` | `INSERT`, `MODIFY` or `DELETE` |
| `ImportJson` | `CallFunctionModule` | `{"PARAM":<value>, ...}` for the FM's IMPORTING params |
| `ImportJson` | `ExecuteTableCrud` | `[{row}, {row}, ...]` — the rows to write |
| `TablesJson` | `CallFunctionModule` | `{"TAB":[{row},...], ...}` for TABLES / CHANGING params |
| `FieldsJson` | `RunQuery` | `["COL_A","COL_B"]`, or omitted for all columns |
| `FilterJson` | `RunQuery` | `[{"Field":"BUKRS","Op":"EQ","Low":"1000","High":""}, ...]` |
| `OrderByJson` | `RunQuery` | `[{"Field":"BUKRS","Descending":false}, ...]` |
| `MaxRows` | `RunQuery` | capped by the registry row's `MaxRows` |

### Action response (`ZFS_AE_DynGwResponse`)

`GwUuid` (the log row) · `ExecStatus` `S`/`E` · `MessageText` · `ExportJson` (FM EXPORTING) ·
`TablesJson` (FM TABLES/CHANGING after the call) · `RowsJson` (query result) · `RowCount` ·
`DurationMs`.

## Delivery checks

- [x] Pretty Printer — source written pre-formatted in house style
- [x] Syntax check clean
- [x] Activated — all 12 objects active; `inactiveObjects` lists only pre-existing DTTK-fee / deal-id items on other transports, none from this activity
- [x] ATC — final run on `ZBP_FS_DYNGATEWAYTP`: **0 errors, 0 warnings, 12 priority-3 infos** (see below)
- [x] ABAP Unit — none applicable (no test class requested; rule 3 forbids creating one unasked)
- [x] Text symbols and selection texts — none applicable (no program, no selection screen)
- [x] Object list confirmed in transport DS4K907263
- [x] Binding published — `isPublished: true`, verified via `fetch_services` and a live GET
- [x] Live smoke test — all cases green after two fixes (L-309, L-310)
- [x] Test data removed — 16 smoke-test log rows deleted, 0 leftover `ENTRY_TYPE='T'` rows; the 3 seeded registry rows kept as delivered

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-314** (`ROWCOUNT` is a
reserved CDS word — appended as L-307, renumbered twice; see its numbering note), **L-308** (`ABAP_FUNC_*BIND_TAB` are HASHED; a same-type `CONV #( )` is an
activation error; the `READ ... not implemented` line is a warning), **L-309** (a dynamic column /
ORDER BY list needs commas in strict Open SQL), **L-310** (an over-long filter literal causes an
uncatchable `SAPSQL_DATA_LOSS` — validate against the column's length and type first).

## Publish

`scripts/sap-gui-publish-service.py --group-id ZFS_SB_DYNGATEWAY_O4_API` reported
*"'ZFS_SB_DYNGATEWAY_O4_API' is not in the unpublished list (already published, or name is wrong)"*
— a **false negative**: `fetch_services` said `isPublished: false` and a live GET returned 404. The
row was plainly present in the `/IWFND/V4_ADMIN` grid, so this is **L-237's row-match bug
reproducing again**, unfixed. Published instead via the manual `sap-gui` flow: `/IWFND/V4_ADMIN`
(already on the Publish Service Groups screen, `IP_SYSTEM_ALIAS` = `LOCAL` per L-246) → Get Service
Groups (`tbar[1]/btn[8]`) → select row 0 → ALV toolbar `PUBLISH` → Continue → result popup
`MESSTXT1` = *"New service group(s) successfully published"*. Re-verified independently:
`fetch_services` now returns `isPublished: true`.

## Live smoke test — results

Base URL (`srvd_a2x` per L-252, `sap-client=100` on every call per L-253):
`/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/`
All mutating verbs run with `dangerouslyDisableSandbox` (L-245).

| # | Case | Result |
|---|---|---|
| 1 | Service doc + `$metadata` | ✅ 200 — `DynGateway` entity set, 3 actions, `ZFS_AE_DynGwResponse` complex type, namespace `com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001` |
| 2 | POST 3 registry rows | ✅ 201 each; also proves `GET_GLOBAL_AUTHORIZATIONS` is wired (no short dump, L-238) |
| 3 | `CallFunctionModule` `RFC_SYSTEM_INFO` | ✅ `S` — real `RFCSI_EXPORT` returned (`RFCSYSID DS4`, kernel 793). All 7 EXPORTING params bound, including three `SY-INDEX`-typed ones, validating the `SY-` → `SYST-` type resolution. Auto-detect chose `DESTINATION 'NONE'` |
| 4 | `RunQuery` 2 fields, cap 5 | ✅ `S`, 2 rows (`100049`/`100050`, `SG03`) — **failed first**, see L-309 |
| 5 | `ExecuteTableCrud` INSERT then DELETE | ✅ `S`, 1 row affected each |
| 6 | `RunQuery` unregistered `T000` | ✅ `E` + msg 017 |
| 7 | `RunQuery` operator `;DROP` | ✅ `E` + msg 024 — operator whitelist holds |
| 7b | `RunQuery` unknown field | ✅ `E` + msg 023 |
| 7c | `RunQuery` quoted-literal injection | ✅ `E` + msg 020 — **failed first with HTTP 500 / `SAPSQL_DATA_LOSS`**, see L-310. No injection occurred; `QUOTE` escaped correctly |
| 8 | INSERT with `AllowWrite` off | ✅ `E` + msg 018, restored |
| 9 | Call-log rows | ✅ 16 rows with kind, target, status, msgno, row count, duration, user |
| 10 | `IsActive` off → on | ✅ `E` + msg 017 while off, `S` after restore — allow-list is live data |
| 11 | Cleanup | ✅ 16 log rows deleted (204 each), 0 leftover test rows, 3 registry rows kept |

**Two real defects were found by the test and fixed**, both re-verified green afterwards with no
regression on the passing cases: L-309 (dynamic column list needs commas in strict Open SQL) and
L-310 (an over-long filter literal caused an uncatchable `SAPSQL_DATA_LOSS` dump).

## ATC — final run on `ZBP_FS_DYNGATEWAYTP`

**0 errors, 0 warnings, 12 priority-3 infos.** Accepted, with reasons:

- `AMB_SINGLE` — `SELECT SINGLE` on a partial key; same benign finding the sibling BOs carry.
- SLIN 1700/1713 untranslated literals — the diagnostic fragments fed into message 020's `&2`
  placeholder. House style per L-284 for BO-local diagnostics.
- SLIN W333 `READ ZFS_I_DYNGATEWAY is not implemented` — expected: reads are served by the
  projection's `provider contract transactional_query`, so no READ handler is needed.

Notably the dynamic `CALL FUNCTION` and dynamic Open SQL drew **no** findings under the default
check variant — the plan predicted they would, and that prediction was wrong.

## Seeded registry rows (delivered, not test data)

| Kind | Target | Active | Read | Write | MaxRows |
|---|---|---|---|---|---|
| FUNC | `RFC_SYSTEM_INFO` | X | X | X | 0 |
| QURY | `ZFS_SLC_OTTK_BTP` | X | X | — | 50 |
| TABL | `ZFS_T_SLC_DYNGW` | X | X | X | 0 |

`FUNC` targets require `AllowWrite` because an FM can do anything; that is deliberate, not an
oversight.


## Round 2 — 2026-09-10: batch dispatch, restructure, gap closure

Follow-up on three human requests: (1) make the behaviour pool well-structured and best-practice,
(2) let **one** call drive several BAPIs, several table writes and several table/CDS reads,
(3) close every untested gap.

### Decisions (2026-09-10)

| Question | Answer |
|---|---|
| BAPI commit handling | **Automatic, overridable** — `BAPI_TRANSACTION_COMMIT` on the shared `DESTINATION 'NONE'` session when every FUNC step succeeded; `CommitMode` = `AUTO` (default) / `ALWAYS` / `NEVER` |
| Failure policy mid-batch | **Always abort everything** — RFC session rolled back and the RAP request failed so table writes roll back too |

### What changed

- **`ZFS_AE_DynGwRequest`** gained `StepsJson` and `CommitMode`. No new objects — still 12.
- **`ExecuteBatch`** added to both BDEFs: an ordered array of steps, each with its own `Kind`
  (`FUNC`/`TABL`/`QURY`), target, operation and payload. Targets may repeat freely.
- **Behaviour pool restructured.** The three near-identical action methods collapsed into one
  `lcl_dispatcher`; every worker split into `PREPARE` (validate, touch nothing) and `EXECUTE`.
  That split is what makes **two-phase batching** possible: the whole batch is validated before the
  first write, so the common failures cost nothing and need no rollback. Also added: ABAP Doc on
  public methods, constants for every magic value, a per-request registry buffer (one SELECT per
  distinct target instead of one per step), and an `audit_fields` helper replacing three copies.
- **`CHANGING` parameters were bound as `EXPORTING`** — a real defect, now bound as
  `abap_func_changing` and returned to the caller under a `CHANGING` key.

### Transaction model (important, and not fully atomic)

FUNC steps share one `DESTINATION 'NONE'` RFC session, so several BAPIs commit or roll back
**together**. TABL steps run in the RAP LUW and commit with RAP's save. Each group is atomic in
itself; the two are separate LUWs and are **not** atomic with each other. `COMMIT WORK` cannot be
issued inside a behaviour class at all (L-227), which is why the commit must go through the RFC
session and the rollback must fail the RAP request.

### Test results — 2026-09-10

| # | Case | Result |
|---|---|---|
| B1 | **One call: RFC FM + local FM + table read + CDS view read + INSERT + MODIFY + DELETE** | ✅ all 7 steps `S`, 51 ms, no residue — this is the requested capability |
| B2 | Batch whose step 3 is unregistered | ✅ rejected in validation; steps 1–2 report `P` (planned, never run); **0 rows written** |
| B3 | Step 1 writes, step 2 fails at runtime | ✅ HTTP 400, **0 rows survive** — rollback proven |
| G1 | Single-shot `MODIFY` (insert-if-absent, then update) | ✅ `Descr` read back as `v2` |
| G2 | Filter operators `BT` / `IN` / `LIKE` / `NE` | ✅ all four — `IN` **failed first**, see below |
| G3 | Non-RFC FM in local `call_mode` (`DATE_GET_WEEK`) | ✅ `WEEK=202637` |
| G3b | FM with a **generic** (`CLIKE`) parameter | ✅ refused with a precise message instead of a misleading one |
| G4 | FM with `TABLES` over RFC (`RFC_READ_TABLE`) | ✅ `FIELDS` round-tripped enriched |
| G4b | FM with `TABLES` in local mode (`MONTH_NAMES_GET`) | ✅ all 12 months + `RETURN_CODE` |

**Three more defects found by testing and fixed:** L-311 (generic parameter types crash the binder
and were misreported as bad JSON), L-312 (`INSERT ... FROM TABLE` short-dumps on a duplicate key —
needs `ACCEPTING DUPLICATE KEYS`), and the `IN` operator bug — the L-310 length guard was applied to
the whole comma-separated list before splitting, so every `IN` list longer than its column was
rejected. Fixed by checking each element inside the `IN` branch.

### ATC — 2026-09-10

Whole object set: **0 errors, 0 warnings, 19 priority-3 infos**, same accepted categories as round 1.

### Known limitation, not fixed (L-313)

When a batch aborts, the caller gets **HTTP 400 with an empty body**. RAP returns no payload for an
action that fails via `failed`/`reported`, and filling `result` first does not change it (tested).
The staged log row rolls back with the LUW, so nothing persists either. Atomicity and diagnosability
are mutually exclusive in this design. The fix, if the trade is acceptable, is to buffer table writes
and run them only after every step has succeeded — then a failure needs no rollback and the full
per-step response can be returned. That changes read-after-write semantics within one batch, so it is
a product decision and was **not** made unilaterally.

### Still not exercised

A live `CHANGING` round trip. The binding is implemented and the RFC-refusal path is tested, but every
typed-`CHANGING` FM found on this system is either untyped/generic or a CATT/currency-conversion
utility with side effects, and calling one blind on a live system was not justified.

### Registry after round 2 (8 rows, all delivered)

`FUNC` RFC_SYSTEM_INFO · RFC_READ_TABLE · CONVERSION_EXIT_ALPHA_INPUT · DATE_GET_WEEK ·
MONTH_NAMES_GET | `QURY` ZFS_SLC_OTTK_BTP · ZFS_CDS_SLC_001 | `TABL` ZFS_T_SLC_DYNGW

All 29 smoke-test log rows deleted; 0 leftover `ENTRY_TYPE='T'` rows.

Lessons raised in round 2: **L-311**, **L-312**, **L-313** (and L-314 is L-311's renumbering).


## Round 3 — 2026-09-10: `reported-%other` experiment (negative result)

**Question from the human:** would switching the failure policy to "caller chooses per call"
(`CONTINUE` / `STOP` / `ABORT`) solve the empty-body problem of L-313?

**Answer: no.** It would let a caller *avoid* the empty body by choosing `CONTINUE` or `STOP`
(neither fails the RAP request, so both return HTTP 200 with the full per-step detail), but
`ABORT` — the only mode that rolls table writes back — still fails the RAP request and still
returns a bare 400. The dilemma survives inside `ABORT`.

**Hypothesis tested instead.** The empty body was originally attributed to RAP simply not
answering; on review a better hypothesis was that the message could not be *correlated*: on a plain
(non-`$batch`) action POST `%cid` is initial and a static action has no instance key. RAP's
instance-independent channel `reported-%other` should not need correlation.

**Implemented and measured — the hypothesis was wrong.**

| Attempt | Result |
|---|---|
| Fill `result` before failing | 400, `len=0` |
| Add `reported-%other` alongside the entity-keyed message | 400, `len=0` |
| `Accept: application/json` / `...;odata.metadata=full` / `*/*` | 400 / 406 / 400 — **`len=0` every time** |

Rollback verified correct throughout (`rows surviving = 0`), and B1 re-run green afterwards
(7 steps, no residue), so the experiment cost nothing in function.

**By-product worth keeping:** `reported-%other`'s line type is `REF TO if_abap_behv_message`, not a
structure with `%msg`. `APPEND VALUE #( %msg = ... ) TO reported-%other` fails activation with
*"The type REF TO IF_ABAP_BEHV_MESSAGE is not a structure"*; the correct form is
`APPEND new_message( ... ) TO reported-%other.` Both channels are now populated on abort — harmless,
and correct if a future stack starts serialising one of them.

L-313 has been **corrected in place** to record the tested root cause instead of the wrong one.

**The only remaining route to atomicity + diagnosis** is deferring table writes until every step has
succeeded, so a failure never needs a rollback. Not implemented — it changes read-after-write
semantics inside a batch and is a product decision.
