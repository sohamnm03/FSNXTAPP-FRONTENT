# Gateway table split — Task 1 pre-flight (inventory + RAP validation gate)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 (not used — nothing created this activity)
- **Requested by:** vinit.s@fourthsignal.com (via plan `docs/superpowers/plans/2026-09-12-0059-dyngateway-table-split.md`, Task 1)

## Scope

Task 1 of the dynamic-gateway table-split plan. Creates nothing — `deleteObject` is denied
project-wide, so a wrongly created object would be permanently orphaned. This activity: (1)
confirms system/logon, (2) inventories package `ZFS_SLC_BTP`, (3) runs `run_validation` against
the risky BDEF shape (write actions on a read-only projection) without creating anything, (4)
records a Decision for Task 9, and (5) — per an additional ruling from the plan's own pre-flight
scan (`progress.md` Ruling C1) — reads (does not change) `ZBP_FS_DYNGATEWAYTP` / `LHC_DynGateway`
to establish where the four action implementations live today, since Task 9 depends on knowing
their size and shape.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does RAP accept write actions declared in a BDEF layered on an otherwise read-only projection? | Not conclusively provable by `run_validation` alone — see Decision below. Recommend the fallback (dedicated action-carrier entity, spec §4) unless the human accepts the residual risk. | 2026-09-12 |

## Naming gate

No objects created this activity — naming gate not applicable. The two DDLS names and one BDEF
name used in `run_validation` calls below are the plan's own proposed names
(`ZFS_R_DynGwCallTP`, `ZFS_C_DynGwCallTP`), validated but not created.

## Todo

- [x] 1. Confirm system/client/user via `sap_get_session_info`
- [x] 2. Inventory package `ZFS_SLC_BTP` (nodeContents/searchObject both 400'd twice — fell back
      to SE16 read of `TADIR` per the brief's fallback instruction)
- [x] 3. `run_validation` on `ZFS_R_DynGwCallTP` (DDLS/DF), `ZFS_C_DynGwCallTP` (DDLS/DF), and a
      BDEF/BDO referencing the projection
- [x] 4. Record the Decision
- [x] 5. Read `ZBP_FS_DYNGATEWAYTP` / `LHC_DynGateway` for the action-implementation ruling
- [x] 6. Commit this worklog

## Step 1 — system confirmation

`sap_connect("NIIF - Development")` then `sap_get_session_info()` (per L-213, `sap_connect`
returning `ok`/session data is not itself proof — the session info was read explicitly):

```
system_name: DS4
client:      100
user:        FS_DEV3
```
Confirmed. Matches `DS4_100_NIIF` / `FS_DEV3` from `config/sap-systems.json`.

## Step 2 — package inventory

`mcp__mcp-abap-abap-adt-api__nodeContents(parent_type="DEVC/K", parent_name="ZFS_SLC_BTP")` —
HTTP 400, retried once, HTTP 400 again.
`mcp__mcp-abap-abap-adt-api__searchObject(query="ZFS_SLC_BTP")` and again with
`query="ZFS_SLC_GW*", max=100` — HTTP 400 both times.

Fell back to SE80-equivalent read-only route via `sap-gui`: SE16 on table `TADIR`,
`DEVCLASS = ZFS_SLC_BTP` (SE80 itself is blocked by this project's transaction policy). 124
active entries (`DELFLAG` blank on all rows), full list below, grouped by `OBJECT`:

**BDEF (14):** ZFS_CDS_SLC_001, ZFS_CDS_SLC_002, ZFS_C_DEALIDTP, ZFS_C_DYNGATEWAYTP,
ZFS_C_SLCDTTKDETAILTP, ZFS_C_SLCDTTKFEETP, ZFS_C_SLCOTTKDETAILTP, ZFS_C_SLCOTTKFEETP,
ZFS_C_TRDFLOWTP, ZFS_I_DEALID, ZFS_I_DYNGATEWAY, ZFS_I_SLCDTTKFEE, ZFS_I_SLCOTTKFEE, ZFS_I_TRDFLOW

**CLAS (20):** ZBP_FS_DEALIDTP, ZBP_FS_DYNGATEWAYTP, ZBP_FS_SLCDTTKDETAILTP, ZBP_FS_SLCDTTKFEETP,
ZBP_FS_SLCOTTKDETAILTP, ZBP_FS_SLCOTTKFEETP, ZBP_FS_TRDFLOWTP, ZCL_FS_GW_HANDLER_FACTORY,
ZCL_FS_SLC_GW_BASE, ZCL_FS_SLC_GW_DISPATCH, ZCL_FS_SLC_GW_FUNC, ZCL_FS_SLC_GW_LOG,
ZCL_FS_SLC_GW_QUERY, ZCL_FS_SLC_GW_REGI, ZCL_FS_SLC_GW_REGISTRY, ZCL_FS_SLC_GW_REGPOL,
ZCL_FS_SLC_GW_RUNTIME, ZCL_FS_SLC_GW_SUBMIT, ZCL_FS_SLC_GW_TABLE, ZCX_FS_GW_ERROR

**DCLS (4):** ZFS_CDS_SLC_001, ZFS_CDS_SLC_002, ZFS_I_DYNGATEWAY, ZFS_I_SLCOTTKFEE

**DDLS (25):** ZFS_AE_DYNGWREQUEST, ZFS_AE_DYNGWRESPONSE, ZFS_CDS_SLC_001, ZFS_CDS_SLC_002,
ZFS_C_DEALIDTP, ZFS_C_DYNGATEWAYTP, ZFS_C_SLCDTTKDETAILTP, ZFS_C_SLCDTTKFEETP,
ZFS_C_SLCOTTKDETAILTP, ZFS_C_SLCOTTKFEETP, ZFS_C_TRDFLOWTP, ZFS_I_CHCOMM, ZFS_I_DEALID,
ZFS_I_DYNGATEWAY, ZFS_I_SLCBANK, ZFS_I_SLCCFEETYPE, ZFS_I_SLCCOCODE, ZFS_I_SLCDFEETYPE,
ZFS_I_SLCDTTKBANK, ZFS_I_SLCDTTKFEE, ZFS_I_SLCENTITYSTRING, ZFS_I_SLCFEETYPE, ZFS_I_SLCOTTKFEE,
ZFS_I_SLCREFINT, ZFS_I_TRDFLOW

**DEVC (1):** ZFS_SLC_BTP (the package itself)

**ENQU (6):** EZFS_DTTK_BTP, EZFS_OTTK_BTP, EZFS_T_DEALID, EZFS_T_DYNGW, EZFS_T_OTTK_FEE,
EZFS_T_TRDFLOW

**FUGR (2):** ZFS_FG_DYNGW_LOG, ZFS_FG_DYNGW_SUBMIT

**G4BA (5):** ZFS_SB_DEALID_O4_API, ZFS_SB_DYNGATEWAY_O4_API, ZFS_SB_SLCDTTKDETAIL_O4_API,
ZFS_SB_SLCOTTKDETAIL_O4_API, ZFS_SB_TRDFLOW_O4_API

**INTF (2):** ZIF_FS_SLC_GW_HANDLER, ZIF_FS_SLC_GW_RUNTIME

**SRVB (5):** ZFS_SB_DEALID_O4_API, ZFS_SB_DYNGATEWAY_O4_API, ZFS_SB_SLCDTTKDETAIL_O4_API,
ZFS_SB_SLCOTTKDETAIL_O4_API, ZFS_SB_TRDFLOW_O4_API

**SRVD (5):** ZFS_SD_DEALID, ZFS_SD_DYNGATEWAY, ZFS_SD_SLCDTTKDETAIL, ZFS_SD_SLCOTTKDETAIL,
ZFS_SD_TRDFLOW

**STOB (25):** the DDIC/CDS shadow entries mirroring the DDLS list above (ZFS_AE_DYNGWREQUEST,
ZFS_AE_DYNGWRESPONSE, ZFS_CDS_SLC_001/002, ZFS_C_*TP ×6, ZFS_I_* ×15 — same names as the DDLS
group)

**SUSH (7):** 5 generated hash-named entries (auth/switch related, not gateway-specific) plus
`ZFS_RFC_DYNGW_LOG` and `ZFS_RFC_DYNGW_SUBMIT` (RFC-enabled function modules)

**TABL (3):** ZFS_SLC_DTTK_BTP, ZFS_SLC_OTTK_BTP, ZFS_T_SLC_DYNGW

**Note — contradicts a plan assumption:** the brief's "non-exhaustive" object list undersold how
shared this package is. `ZFS_SLC_BTP` holds **four other business objects** (DealID, SlcDttkDetail,
SlcOttkDetail, TrdFlow) alongside the DynGateway objects — roughly two-thirds of the 124 entries
are unrelated to the gateway. Also newly confirmed and **not** in the brief's list: four gateway
worker classes — `ZCL_FS_SLC_GW_DISPATCH`, `ZCL_FS_SLC_GW_FUNC`, `ZCL_FS_SLC_GW_QUERY`,
`ZCL_FS_SLC_GW_TABLE` — plus a second function group `ZFS_FG_DYNGW_LOG` and RFC module
`ZFS_RFC_DYNGW_LOG`. See Step 5 below — these four worker classes are where the actual action
logic now lives, not `LHC_DynGateway`.

## Step 3 — `run_validation` (literal results)

Destination: `DS4_100_NIIF` (from `abap_list_destinations`). `get_object_type_details` called
first for each type per tool contract.

**1. `ZFS_R_DYNGWCALLTP` (DDLS/DF):**
Request: `{"packageName":"ZFS_SLC_BTP","name":"ZFS_R_DYNGWCALLTP","description":"Gateway action-carrier root view (preflight validation)"}`
First attempt used a longer description and got: `Data Definition validation failed: Description is too long. Only 60 characters are allowed`
Retry result: `{"message":"Data Definition validated successfully", "objectContent":"{\"destination\":\"DS4_100_NIIF\",\"packageName\":\"ZFS_SLC_BTP\",\"name\":\"ZFS_R_DYNGWCALLTP\",\"description\":\"Gateway action-carrier root view (preflight validation)\"}"}`

**2. `ZFS_C_DYNGWCALLTP` (DDLS/DF):**
Request: `{"packageName":"ZFS_SLC_BTP","name":"ZFS_C_DYNGWCALLTP","description":"Gateway action-carrier projection (preflight validation)"}`
Result: `{"message":"Data Definition validated successfully", ...}`

**3. Behaviour definition (BDEF/BDO):**
Request: `{"behaviorDefinitionType":"definition","packageName":"ZFS_SLC_BTP","rootEntity":"ZFS_C_DYNGWCALLTP","name":"ZFS_C_DYNGWCALLTP","description":"Gateway action-carrier BDEF (preflight validation)","implementationType":"Projection"}`
Result: `Behavior Definition validation failed: The referenced STOB object ZFS_C_DYNGWCALLTP does not exist`

**Interpretation.** `run_validation` for `BDEF/BDO` only checks wizard-shell fields (name length,
package validity, and — critically — that the referenced root/projection object already exists in
the system as a `STOB`). It never reaches BDEF *source* semantics (actions, `read-only`, save
mode). Since the projection view referenced doesn't exist yet (creating it is exactly what this
task must not do), the tool cannot get past that mechanical gate — it can neither confirm nor deny
whether RAP accepts write actions on a read-only projection. The two `DDLS/DF` validations
succeeded, confirming only that the proposed names/package are clean, not anything about the BDEF
question.

## Step 4 — Decision

**Decision: run the fallback — Task 9 uses the dedicated action-carrier entity over a single-row
source (spec §4), not the designed read-only-projection-with-write-actions BO shape.**

Rationale: `run_validation` cannot answer the real question (it stops at a "referenced object
doesn't exist" mechanical error, not a semantic accept/reject of write actions on a read-only
projection), and answering it for real requires creating the root view, projection view, and BDEF
source — exactly the irreversible step this task exists to avoid (`deleteObject` denied
project-wide). Circumstantial evidence (RAP's well-established "read-only API with custom
actions" pattern, and this same codebase's own `ZFS_I_DYNGATEWAY`/`ZBP_FS_DYNGATEWAYTP` already
mixing CRUD and four actions today) suggests the designed shape would likely work, but "likely" is
not sufficient given the no-delete constraint. The fallback carries no such open question and
should be used unless a human explicitly accepts the residual risk of the designed shape after
reading this report.

## Step 5 — action-implementation ruling (additional required work)

Read `ZBP_FS_DYNGATEWAYTP` via `mcp__mcp-abap-abap-adt-api__getObjectSource` (its
`includes/implementations` — the `source/main` include is an empty shell:
`CLASS zbp_fs_dyngatewaytp DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zfs_i_dyngateway.` /
`ENDCLASS.`, nothing else). No change made — read-only.

**Finding that overturns `progress.md` Ruling C1.** C1 assumed "the four actions' handler code
lives in `LHC_DynGateway`" at roughly 1000 lines needing to move. That is no longer true as of
this system's current state (the include's own header comment documents a 2026-09-10 refactor):
`LHC_DynGateway`'s four action methods are now thin one-call delegates to a global dispatcher
class, `ZCL_FS_SLC_GW_DISPATCH`. The real logic (dynamic `CALL FUNCTION`, dynamic SQL, batch
orchestration, registry checks) lives in **global classes independent of the behavior pool**:
`ZCL_FS_SLC_GW_DISPATCH`, `ZCL_FS_SLC_GW_FUNC`, `ZCL_FS_SLC_GW_TABLE`, `ZCL_FS_SLC_GW_QUERY`,
`ZCL_FS_SLC_GW_SUBMIT`, `ZCL_FS_SLC_GW_REGISTRY`, `ZCL_FS_SLC_GW_BASE`.

Method names and sizes, in `LHC_DynGateway` (local class in `ZBP_FS_DYNGATEWAYTP`
`includes/implementations`):

| Action | Method | Lines (METHOD…ENDMETHOD incl.) | Shape |
|---|---|---|---|
| `RunQuery` | `runquery` | 8 | One-call delegate to `zcl_fs_slc_gw_dispatch=>run_single( iv_kind = c_kind-qury )` |
| `ExecuteTableCrud` | `executetablecrud` | 8 | One-call delegate to `run_single( iv_kind = c_kind-tabl )` |
| `CallFunctionModule` | `callfunctionmodule` | 8 | One-call delegate to `run_single( iv_kind = c_kind-func )` |
| `ExecuteBatch` | `executebatch` | 38 | Delegates to `zcl_fs_slc_gw_dispatch=>run_batch( )`, then handles the RAP-specific abort path (fails the request, appends `reported`/`failed` entries on `lv_abort = abap_true`) |

Also present in the same include (not part of the four actions, still behavior-pool-specific and
would also need to move or be re-anchored): `get_global_authorizations`, `create`, `update`,
`delete`, `lock` (standard CRUD + lock handlers for the registry, ~90 lines combined), and a saver
class `LSC_DYNGATEWAY` (`save` method, ~10 lines, drains `zcl_fs_slc_gw_base=>gt_log` staged rows
into `zfs_t_slc_dyngw`).

**Consequence for Task 9:** moving "the four actions" to a new behaviour pool is now a small,
mechanical task — copy four short delegate methods (8–38 lines each, ~62 lines total) that call
the same unchanged global dispatcher class. It is **not** a ~1000-line extraction. Task 9's plan
text and Ruling C1 should be corrected accordingly before that task is dispatched. What *does* need
care in Task 9: the CRUD/lock/saver methods on `LHC_DynGateway`/`LSC_DYNGATEWAY` stay behind on the
old, now-unexposed `ZFS_I_DYNGATEWAY`/`ZBP_FS_DYNGATEWAYTP` (registry maintenance keeps happening
there — nothing here suggested moving it), while only the four action delegates move to the new
pool.

## Other findings contradicting the plan's assumptions

1. Package `ZFS_SLC_BTP` is shared by five business object families, not dedicated to the
   gateway — see Step 2 note.
2. `progress.md` Ruling C1's "~1000 lines of action implementation" estimate is stale — see Step 5.
3. `mcp__mcp-abap-abap-adt-api__searchObject` and `nodeContents` both failed with HTTP 400 twice
   each in this session; `getObjectSource`/`objectStructure`/`adtDiscovery` also 400'd until the
   server appeared to reconnect mid-session (a `mcp-abap-abap-adt-api` "still connecting"
   notification appeared, then reads succeeded). If this recurs on a later task, retry after a
   short pause rather than assuming the server is permanently down.
4. SE80 is blocked by this project's transaction policy in `sap-gui`; SE16 (Data Browser on
   `TADIR`) and SE24 (Class Builder, display-only) are viable read-only substitutes.

## Object list

No objects created, changed, or activated this activity.

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No objects touched (validation-only task) |

## Delivery checks

- [ ] Pretty Printer — n/a, nothing created
- [ ] Syntax check clean — n/a
- [ ] Activated, nothing left inactive — n/a
- [ ] ATC / Code Inspector — n/a
- [ ] ABAP Unit green — n/a
- [ ] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed in the transport — none used

## Lessons raised

None new this activity — the `mcp-abap-abap-adt-api` 400-then-recovers behavior matches the
already-documented intermittent-400 pattern for `searchObject`; no new `L-nnn` warranted, but
flagged in "Other findings" above for whoever runs Task 2 onward.
