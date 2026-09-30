# TRM interest rate instrument — CRUD OData V4 Web API over the FTR BAPIs

- **Date:** 2026-09-25
- **Started:** 13:08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP
- **Transport:** DS4K907209 ("SLC FY:26 demo"; FS_DEV3 task DS4K907260 — confirmed modifiable in `E070`)
- **Requested by:** human

## Scope

An OData V4 Web API for create/read/update/delete of TRM interest rate instruments (FTR deals,
e.g. product type 22A), backed by the released BAPIs (human instruction 2026-09-25, replacing the originally named
`_CREATE`/`_CHANGE`): create = `BAPI_FTR_IRATE_DEALCREATE`, change = `BAPI_FTR_IRATE_DEALCHANGE`,
read = `BAPI_FTR_IRATE_DEALGET`, delete = `BAPI_FTR_IRATE_REVERSE` with reason `04`.
All four are `RODIR.RELEASED = X` (`context/sap-bapis/trm-bapis-signatures.md`).
Out of scope: draft, UI annotations/metadata extension, conditions/flows/scale tables, the other
IRATE BAPIs (rollover, settle, give notice), any console/front end.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | DELETE semantics (a deal cannot be physically deleted) | **Reverse the deal** via `BAPI_FTR_IRATE_REVERSE` | 2026-09-25 |
| 2 | Draft on the RAP BO (L-224) | **No draft** | 2026-09-25 |
| 3 | Read model | **Root custom entity**: list from released `I_FinancialTransaction`, enriched per row by `BAPI_FTR_IRATE_GETDETAIL` (changed to `DEALGET`, Q6) | 2026-09-25 |
| 4 | Field scope | **Core set** (~15 fields, the proven 2026-09-10 payload) | 2026-09-25 |
| 5 | Reversal reason passed on DELETE (`TZST`, transaction-level `SZLSPRART = 2`: 01 processing error, 02 Customizing error, 03 condition adjustment, 04 other reasons) | **04** (Other reasons) | 2026-09-25 |
| 6 | Design approval (brainstorming gate) | **Approved**, with the BAPI set changed to DEALCREATE / DEALCHANGE / DEALGET / REVERSE | 2026-09-25 |

## Design

Approved 2026-09-25. The commit and lock bullets below were changed during the build; see "Design adjustments during build".

- Root custom entity `ZFS_CE_TrmIrateTP` (key CompanyCode + FinancialTransaction) carrying an
  unmanaged, non-draft BDEF; query class `ZCL_FS_TRM_IRATE_QUERY`; behavior pool
  `ZBP_FS_TRMIRATETP` (`LHC_TRMIRATE`/`LSC_TRMIRATE`); `ZFS_SD_TRMIRATE`; `ZFS_SB_TRMIRATE_O4_API`.
- GET: list keys from released `I_FinancialTransaction` (interest rate instruments only), each row
  on the page enriched by `BAPI_FTR_IRATE_DEALGET`.
- POST → `BAPI_FTR_IRATE_DEALCREATE` with the paired `X` structures derived from the supplied
  fields (L-365). PATCH → `BAPI_FTR_IRATE_DEALCHANGE`, `X` only for the fields in `%control`, all
  `*_COMPLETE_INDICATOR` left blank so flows/conditions are untouched. DELETE →
  `BAPI_FTR_IRATE_REVERSE`, `REVERSALREASON = '04'`.
- BAPIs called `DESTINATION 'NONE'` in the handlers (L-227); saver commits with
  `BAPI_TRANSACTION_COMMIT DESTINATION 'NONE'`, cleanup rolls back in the same destination.
- Lock via SAP's deal lock object through `cl_abap_lock_object_factory`; no ETag; global auth handler (L-238).
- BAPI `RETURN` messages passed through; own messages from `ZFS_TRM_MSG`.

## Naming gate

```
NAMING: ZFS_CE_TrmIrateTP -> matches CDS "Custom entity ZFS_CE_<Entity>", <Entity> = TrmIrateTP (transactional, TP once)
NAMING: ZFS_CE_TrmIrateTP (BDEF) -> matches "Behavior definition: same as root view"
NAMING: ZCL_FS_TRM_IRATE_QUERY -> matches ABAP OO "RAP query provider ZCL_FS_<AREA>_<NAME>_QUERY", AREA = TRM
NAMING: ZBP_FS_TRMIRATETP -> matches "Behavior implementation class ZBP_FS_<Entity>" (upper case)
NAMING: LHC_TRMIRATE / LSC_TRMIRATE -> match "Behavior handler LHC_<Entity>" / "Saver LSC_<Entity>" (TP stripped, L-226)
NAMING: ZFS_SD_TRMIRATE -> matches "Service definition ZFS_SD_<Entity>" (TP stripped)
NAMING: ZFS_SB_TRMIRATE_O4_API -> matches "Service binding ZFS_SB_<Entity>_<O4>_<API>" (22 chars, under the 26 cap)
```

## Design adjustments during build

- **Commit location.** The approved design committed in the saver. A synchronous RFC (which is
  what `BAPI_TRANSACTION_COMMIT DESTINATION 'NONE'` is) implicitly commits the caller's DB LUW
  (L-350), and that is not allowed in RAP's late save phase; the interaction-phase `DESTINATION
  'NONE'` call is what L-227 proved live. So each handler calls the BAPI and then
  `BAPI_TRANSACTION_COMMIT` (`WAIT = 'X'`) in the same `'NONE'` session on success, or
  `BAPI_TRANSACTION_ROLLBACK` there on error. Consequence: **each operation commits on its own** —
  several operations in one `$batch` changeset are not atomic. The saver is the required no-op.
- **Lock.** The approved design enqueued `E_VTBFHA` in the RAP `FOR LOCK` handler. The BAPIs run in
  the separate `DESTINATION 'NONE'` session, which is a *different lock owner*, and enqueue the
  same deal themselves — a RAP-side lock would make every `DEALCHANGE`/`REVERSE` fail against our
  own foreign lock. The `FOR LOCK` handler is therefore a deliberate no-op; the BAPIs' own
  enqueue is the concurrency control.
- **Messages.** BAPI `RETURN` messages are passed through with their own `ID`/`NUMBER`; an RFC-layer
  failure reuses `ZFS_TRM_MSG` **020** "Dynamic call of &1 failed: &2". No new message needed.
- **Facts read:** interest rate instruments are `VTBFHA-SANLF = 550` (22A: 675 deals); the deal lock
  object is `E_VTBFHA`.


## Todo

- [x] 1. Design approved by human (with BAPI set changed)
- [x] 2. Read DEALCREATE/DEALCHANGE/DEALGET structures, `I_FinancialTransaction` fields, VTBFHA lock object (`E_VTBFHA`)
- [x] 3. Probe: `adt-mcp run_validation` for a BDEF `Unmanaged` on the **root custom entity** passed (build risk 1 cleared)
- [x] 4. Created custom entity `ZFS_CE_TrmIrateTP` (`mcp-abap-abap-adt-api createObject` + transport, L-546); `transportInfo` DS4K907209 / DS4K907260; activated, only warning = query class not yet created
- [x] 5. Created query class `ZCL_FS_TRM_IRATE_QUERY` (`mcp-abap-abap-adt-api createObject` + transport, L-546).
      Two failed activations: `CX_RAP_QUERY_PROVIDER` and `CX_RAP_QUERY_PROV_NOT_IMPL` are both
      **abstract** (L-567); raised the concrete framework subclass `CX_RAP_QUERY_COND` instead. Activated clean
- [x] 6. BDEF `ZFS_CE_TRMIRATETP` created via `adt-mcp create_object` with top-level `transportRequestNumber`
      (`transportInfo` DS4K907209 / DS4K907260 — L-564 holds for BDEF too); behavior pool `ZBP_FS_TRMIRATETP`
      via `mcp-abap-abap-adt-api createObject` + transport, main include `FOR BEHAVIOR OF zfs_ce_trmiratetp`
      (L-226), implementations include written after the server reconnect. BDEF + pool activated together
      in one `activateObjects` call, no messages; `inactiveObjects` lists none of this activity's objects (L-543)
- [x] 7. Messages: none needed (020 reused, BAPI messages passed through)
- [x] 8. SRVD `ZFS_SD_TRMIRATE` (`mcp-abap-abap-adt-api createObject` + transport; exposes the entity as
      `InterestRateInstrument`) and SRVB `ZFS_SB_TRMIRATE_O4_API` (`adt-mcp create_object`, OData V4 - Web API,
      top-level transport, L-564). Both `transportInfo` DS4K907209 / DS4K907260, both activated clean.
      Published via `scripts/sap-gui-publish-service.py --group-id ZFS_SB_TRMIRATE_O4_API --yes`:
      `"New service group(s) successfully published"`, `ok: true`, `still_in_unpublished_list: false`
- [x] 9. ATC (`adt-mcp abap_atc_run`, default variant): 0 findings on `ZBP_FS_TRMIRATETP`,
      `ZCL_FS_TRM_IRATE_QUERY`, BDEF `ZFS_CE_TRMIRATETP` (DDLS/SRVD not listed in the result)
- [x] 10. Live smoke test (sandboxed PowerShell, `sap-client=100`):
      - **Run 1 dumped.** `RAISE_SHORTDUMP` / `CX_SADL_DUMP_APPL_MODEL_ERROR` on the list GET and on the
        POST. Dump chain: `BAPI_FTR_IRATE_DEALGET` -> `CX_SY_DYN_CALL_ILLEGAL_TYPE` in
        `PERFORM ADD_SUCCESS_MESSAGE`, parameter 1: `tt_return` was `WITH EMPTY KEY` (L-568).
        **The POST's deal was created and committed anyway** (`1000/0000000160531`), because the dump
        was in the framework's post-create re-read, after the `'NONE'` commit (L-568).
      - Fix: `tt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY`; query class and pool
        re-activated together, clean.
      - **Run 2 passed:** `$metadata` 200 · list `$top=3&$count=true&$filter=ProductType eq '22A'&$orderby=FinancialTransaction desc`
        200, `@odata.count` 677, rows filled by DEALGET · POST 201 -> **`1000/160532`**, message `FTR0 162`
        · GET 200 · PATCH `{"InterestRate":11.5,"EndTerm":"2027-12-31"}` 200, echoed back · DELETE 204
        (reversal, `FTR0 162`). `VTBFHA` confirms `DELFZ = 20271231` and `SAKTIV = 3` for 160532.
      - **Open finding:** a GET in the **same cookie session right after a PATCH or DELETE** returned
        **501** `/IWCOR/CX_OD_NOT_IMPLEMENTED`; the same GET in a fresh session returns 200 (steps 8, 11).
        Not diagnosed (L-569).
      - Orphan `160531` from run 1 reversed through the API (DELETE 204, `ActiveStatus` 3 afterwards).
      - Evidence: `evidence/2026-09-25-1308-trm-irate-crud-odata-api/`: `metadata.xml`,
        `run1-dump-smoke-log.txt`, `smoke-log.txt`, `followup-log.txt`

## Blocker (resolved)

`mcp-abap-abap-adt-api` died mid-build (~13:30): `runQuery` 500s on every query, then HTTP 400 on every
call. **Cause, from the dump feed:** `GENERATE_SUBPOOL_DIR_FULL` in `CL_ADT_DP_OPEN_SQL_HANDLER` at
13:21:59. The ADT data preview generates a temporary subroutine pool per ad-hoc query, and the session
allows **36**. The human reconnected the server with `/mcp`, and everything worked afterwards (L-569).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_CE_TrmIrateTP` | DDLS/DF (root custom entity) | ZFS_SLC_APP | DS4K907209 | active |
| `ZCL_FS_TRM_IRATE_QUERY` | CLAS/OC (query provider) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_CE_TRMIRATETP` | BDEF/BDO (unmanaged, strict(2), no draft) | ZFS_SLC_APP | DS4K907209 | active |
| `ZBP_FS_TRMIRATETP` | CLAS/OC (behavior pool, `LHC_TRMIRATE`/`LSC_TRMIRATE`) | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_SD_TRMIRATE` | SRVD/SRV | ZFS_SLC_APP | DS4K907209 | active |
| `ZFS_SB_TRMIRATE_O4_API` | SRVB/SVB (OData V4 - Web API) | ZFS_SLC_APP | DS4K907209 | active, **published** |

Test data left on the system: deals `1000/0000000160531` and `1000/0000000160532` (22A, partner
0700000453, INR 100,000), both **reversed** (`SAKTIV = 3`).

## Service

`/sap/opu/odata4/sap/zfs_sb_trmirate_o4_api/srvd_a2x/sap/zfs_sd_trmirate/0001/InterestRateInstrument?sap-client=100`
Key: `(CompanyCode='1000',FinancialTransaction='160532')`. POST/PATCH/DELETE need `x-csrf-token`.
DELETE = reversal with reason 04. `$filter`/`$orderby` work on the header fields only; on
NominalAmount, InterestRate, InterestCalcMethod, Frequency or ContractDate they return an error. Always
send `$top`: every row on a page costs one DEALGET call.

## Delivery checks

- [x] Syntax check clean (activation: no errors; only the expected pre-class warning on the CE's first activation)
- [x] Activated, nothing left inactive (`inactiveObjects` checked)
- [x] ATC: 0 findings
- [x] ABAP Unit: none written. Rule 3 forbids unrequested test objects, and the logic is a thin BAPI
      wrapper verified by the live test
- [x] Text symbols: none applicable
- [x] Published; live smoke test create → read → change → reverse (run 2)
- [x] Object list confirmed in the transport (`transportInfo` per object: DS4K907209 / task DS4K907260)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-565, L-566, L-567, L-568, L-569
