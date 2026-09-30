# `ZFS_T_SLC_DYNGW` allow-list backup — DS4/100, 2026-09-10

Captured immediately before a test-data wipe. **25 registry rows** (`ENTRY_TYPE = 'R'`).

These rows are `deliveryClass #A` application data and **do not travel with the transport**
(L-335). If they are deleted they must be recreated on this system by hand — nothing in
`DS4K907263` will bring them back.

## Restore

One `POST <base>/DynGateway?sap-client=100` per row, body as below (plus CSRF). Once `REGI` exists
(wave 3) the whole set becomes a single `ExecuteBatch` with 25 `REGI` steps — which is exactly the
L-335 provisioning case that justified it.

`UUID` is deliberately **not** restored: it is generated on create, and the only thing that
referenced the old values was `REGISTRY_UUID` on log rows that are being deleted anyway.

## The 25 rows

| Kind | Target | Operation | Active | R | W | Mode | MaxRows | Descr |
|---|---|---|---|---|---|---|---|---|
| FUNC | BAPI_BUPA_CREATE_FROM_DATA | | X | X | X | | 0 | live test: business partner create |
| FUNC | BAPI_FTR_IRATE_CREATE | | X | X | X | | 0 | live test: FTR interest rate instrument create |
| FUNC | CONVERSION_EXIT_ALPHA_INPUT | | X | X | X | L | 0 | gap: non-RFC FM, local call_mode |
| FUNC | DATE_GET_WEEK | | X | X | X | L | 0 | gap: non-RFC FM, concrete types |
| FUNC | MONTH_NAMES_GET | | X | X | X | L | 0 | gap: TABLES param in local mode |
| FUNC | RFC_READ_TABLE | | X | X | X | | 0 | gap: FM with TABLES params |
| FUNC | RFC_SYSTEM_INFO | | X | X | X | | 0 | smoke: system info FM |
| FUNC | RPY_PROGRAM_READ | | **(off)** | X | X | | 0 | TEMP L-319 workaround: read ABAP source |
| QURY | FUPARAREF | SELECT | **(off)** | X | | | 100 | TEMP L-319 workaround: FM interface read |
| QURY | T000 | SELECT | X | X | | | 20 | Client table read - acceptance suite P3 |
| QURY | VTBFHA | SELECT | X | X | | | 20 | live test: FTR deal verification |
| QURY | VTBFHAPO | SELECT | X | X | | | 20 | live test: FTR deal verification |
| QURY | ZFS_CDS_SLC_001 | SELECT | X | X | | | 20 | gap: CDS view entity read |
| QURY | ZFS_CDS_SLC_002 | SELECT | X | X | | | 20 | live test: DTTK CDS view read |
| QURY | ZFS_SLC_OTTK_BTP | SELECT | X | X | | | 50 | smoke: OTTK read-only query |
| QURY | ZSGSLCTR_BPEXT | SELECT | X | X | | | 20 | live test: SLC bank master read |
| QURY | ZSGSLCTR_DEALID | SELECT | X | X | | | 50 | live test: deal id read-back |
| QURY | ZSGSLCTR_FEEDATA | SELECT | X | X | | | 50 | live test: fee data read-back |
| SUBM | ZFS_FI_R047 | | X | X | X | | 20 | SUBM test: SALV report (FI) |
| SUBM | ZFS_LMS_R033 | | X | X | X | | 20 | SUBM test: SALV report (LMS) |
| SUBM | ZFS_R_TRM_FWDTXN | | X | X | X | | 25 | SUBM test: REUSE_ALV, no GUI, s_bukrs optional |
| SUBM | ZFS_SLC_DEM003 | | **(off)** | X | X | | 30 | RETIRED - CL_GUI_HTML_VIEWER program, dumps under SUBMIT |
| TABL | ZFS_T_SLC_DYNGW | | X | X | X | | 0 | smoke: own table CRUD |
| TABL | ZSGSLCTR_DEALID | INSERT | X | X | X | | 0 | live test: deal id mock insert |
| TABL | ZSGSLCTR_FEEDATA | INSERT | X | X | X | | 0 | live test: fee data mock insert |

**Three rows are deliberately inactive and must stay that way on restore:**
`RPY_PROGRAM_READ` and `FUPARAREF` (temporary L-319 workarounds, switched off — see L-342),
and `ZFS_SLC_DEM003` (retired: a `CL_GUI_HTML_VIEWER` program that dumps under `SUBMIT`, L-321).

## Restore payloads

```json
[
{"EntryType":"R","TargetKind":"FUNC","TargetName":"BAPI_BUPA_CREATE_FROM_DATA","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"live test: business partner create"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"BAPI_FTR_IRATE_CREATE","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"live test: FTR interest rate instrument create"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"CONVERSION_EXIT_ALPHA_INPUT","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"L","MaxRows":0,"Descr":"gap: non-RFC FM, local call_mode"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"DATE_GET_WEEK","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"L","MaxRows":0,"Descr":"gap: non-RFC FM, concrete types"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"MONTH_NAMES_GET","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"L","MaxRows":0,"Descr":"gap: TABLES param in local mode"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"RFC_READ_TABLE","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"gap: FM with TABLES params"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"RFC_SYSTEM_INFO","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"smoke: system info FM"},
{"EntryType":"R","TargetKind":"FUNC","TargetName":"RPY_PROGRAM_READ","Operation":"","IsActive":"","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"TEMP L-319 workaround: read ABAP source"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"FUPARAREF","Operation":"SELECT","IsActive":"","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":100,"Descr":"TEMP L-319 workaround: FM interface read"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"T000","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"Client table read - acceptance suite P3"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"VTBFHA","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"live test: FTR deal verification"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"VTBFHAPO","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"live test: FTR deal verification"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZFS_CDS_SLC_001","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"gap: CDS view entity read"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZFS_CDS_SLC_002","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"live test: DTTK CDS view read"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZFS_SLC_OTTK_BTP","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":50,"Descr":"smoke: OTTK read-only query"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZSGSLCTR_BPEXT","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":20,"Descr":"live test: SLC bank master read"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZSGSLCTR_DEALID","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":50,"Descr":"live test: deal id read-back"},
{"EntryType":"R","TargetKind":"QURY","TargetName":"ZSGSLCTR_FEEDATA","Operation":"SELECT","IsActive":"X","AllowRead":"X","AllowWrite":"","CallMode":"","MaxRows":50,"Descr":"live test: fee data read-back"},
{"EntryType":"R","TargetKind":"SUBM","TargetName":"ZFS_FI_R047","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":20,"Descr":"SUBM test: SALV report (FI)"},
{"EntryType":"R","TargetKind":"SUBM","TargetName":"ZFS_LMS_R033","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":20,"Descr":"SUBM test: SALV report (LMS)"},
{"EntryType":"R","TargetKind":"SUBM","TargetName":"ZFS_R_TRM_FWDTXN","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":25,"Descr":"SUBM test: REUSE_ALV, no GUI, s_bukrs optional"},
{"EntryType":"R","TargetKind":"SUBM","TargetName":"ZFS_SLC_DEM003","Operation":"","IsActive":"","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":30,"Descr":"RETIRED - CL_GUI_HTML_VIEWER program, dumps under SUBMIT"},
{"EntryType":"R","TargetKind":"TABL","TargetName":"ZFS_T_SLC_DYNGW","Operation":"","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"smoke: own table CRUD"},
{"EntryType":"R","TargetKind":"TABL","TargetName":"ZSGSLCTR_DEALID","Operation":"INSERT","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"live test: deal id mock insert"},
{"EntryType":"R","TargetKind":"TABL","TargetName":"ZSGSLCTR_FEEDATA","Operation":"INSERT","IsActive":"X","AllowRead":"X","AllowWrite":"X","CallMode":"","MaxRows":0,"Descr":"live test: fee data mock insert"}
]
```

## Recommended instead of a full wipe

```sql
DELETE FROM zfs_t_slc_dyngw WHERE entry_type = 'L'
```

Clears every call-log row and leaves the allow-list untouched — a clean log to test against with
nothing to rebuild. `LOG_LEVEL`, `PARENT_UUID`, `STEP_INDEX` and `PHASE` are blank on all existing
rows, so a fresh log will be the first data those columns ever carry.
