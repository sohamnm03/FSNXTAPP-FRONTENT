# ZVIM_SRV — read-only analysis of the VIM OData service

- **Date:** 2026-09-25
- **Started:** 18:35
- **System:** DS4_100_NIIF
- **Package:** n/a (read-only; objects are not ours — no `ZFS` package touched)
- **Transport:** none
- **Requested by:** human ("can u understand the ZVIM_SRV service ?")

## Scope

Understand what the SEGW OData V2 service `ZVIM_SRV` does. Read-only: `$metadata`, the DPC_EXT
class and the program `ZFS_VIM_ODATA` it calls into. No object created or changed; no write request
sent to the service.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | What does the human want next — only an explanation, or a review/fix/rebuild? | | |

## Naming gate

No objects created.

## Todo

- [x] 1. Fetch `$metadata` (GET, `sap-client=100`)
- [x] 2. Read `ZCL_ZVIM_DPC_EXT`, `ZCL_ZVIM_DPC`, `ZCL_ZVIM_MPC_EXT`
- [x] 3. Read `ZFS_VIM_ODATA` + includes `_TOP`, `_F01` (FORMs called by the DPC)
- [x] 4. Summarise to the human

## Findings

**Model.** One entity type `Extract` (key `FileId` C30; `Getdata` C2500, `FileName` C100,
`Bukrs` C4, `Message` C220), one entity set `ExtractSet`. Every property is flagged
non-creatable/updatable, but the only redefined DPC method is `EXTRACTSET_CREATE_ENTITY` — the
service is used as an RPC endpoint: `POST /ExtractSet`, action name in `Message`, a
`key=value&key=value` payload in `Getdata`.

**Actions (`Message`, upper-cased):**

| Action | Where | What it does |
|---|---|---|
| `PARK_SIMPLE` | inline in DPC_EXT | `BAPI_ACC_DOCUMENT_POST`, `BUS_ACT=RFBV`, `DOC_STATUS=2`, doc type KR — parks a 2-line vendor invoice (vendor credit, G/L debit). Keys: `bukrs vendor gl_account amount currency` mandatory; `doc_type doc_date pstng_date reference header_txt costcenter item_text` optional. Errors raise `/IWBEP/CX_MGW_BUSI_EXCEPTION` (HTTP 400). Returns doc no in `FileId`. |
| `PARK_DOCUMENT` | `PERFORM park_document_from_getdata IN PROGRAM zfs_vim_odata` → `handle_park_document` | Parks with GL + vendor + optional TDS (`accountwt`), GST added into the amount, then updates `ZFS_PS_T004` row (`SNRO = upl_id`) to status `02` Parked. Keys `hd_*`, `gl1_*`, `ap2_*`, `wt3_*`, `s_amt`/`s_gst_amt`, `upl_id` required. |
| anything else | `upload_dms_from_getdata` → `dms_new` | Despite the name, **no DMS document is created** (`BAPI_DOCUMENT_CREATE2` is commented out). Draws a number from `ZPS_NR01`/01 and inserts an OCR staging row in `ZFS_PS_T004` with status `01` Uploaded from the `ocr_*` keys. |

**Defects / risks spotted (not fixed — not requested):**

1. `PARK_DOCUMENT` always reports success: the FORM sets `cv_message = 'Park document triggered…'`
   whether the BAPI succeeded or failed. On failure the error lands in global `gv_park_error` and
   `lcl_html_display=>display_html( '' )` is called — a GUI HTML control inside an OData request.
2. `PARK_DOCUMENT` success test is `READ TABLE gt_return WITH KEY type = 'S'` — any S message counts,
   even alongside E messages. The parked document number is never returned to the caller.
3. `PARK_DOCUMENT` hardcodes doc type `KR` and fiscal year variant `V3`; `hd_doc_type`/`hd_doc_status`
   are parsed but ignored.
4. `dms_new` hardcodes `D:\VIM folder\` and does `OPEN DATASET` on it (application-server path;
   result unused). `ZFS_PS_T004-STD_DMS` is always blank. `NUMBER_GET_NEXT` failure is not checked.
5. `MODIFY … COMMIT WORK` inside the gateway request — the gateway's own LUW is committed early.
6. "FORM not found" detection is `lv_message IS INITIAL`, not `sy-subrc` — works only because both
   FORMs always set a message.
7. `PARK_SIMPLE` puts `comp_code` on the item lines and passes a plain amount string without decimal
   validation; a non-numeric `amount` dumps (`CX_SY_CONVERSION_NO_NUMBER`, uncaught — outside the TRY).
8. Messages are inline literals (house rule: `ZFS_TRM_MSG` only) — pre-existing, not our object.

## Object list

Read only: `ZVIM_SRV` (service), `ZCL_ZVIM_MPC`, `ZCL_ZVIM_MPC_EXT`, `ZCL_ZVIM_DPC`,
`ZCL_ZVIM_DPC_EXT`, `ZFS_VIM_ODATA` (+ `_TOP`, `_F01`), table `ZFS_PS_T004`, number range `ZPS_NR01`.

## Delivery checks

Not applicable — nothing built.

## Evidence

`evidence/2026-09-25-1835-zvim-srv-analysis/` — `zvim_metadata.xml`, `zcl_zvim_dpc_ext.abap`,
`zfs_vim_odata_top.abap`, `zfs_vim_odata_f01.abap`.

## Lessons raised

L-588
