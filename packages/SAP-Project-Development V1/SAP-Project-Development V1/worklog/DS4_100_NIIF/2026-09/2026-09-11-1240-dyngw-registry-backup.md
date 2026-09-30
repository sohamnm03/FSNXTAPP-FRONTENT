# `ZFS_T_SLC_DYNGW` allow-list backup — DS4/100, 2026-09-11

Captured immediately before a manual-testing wipe. **25 registry rows** (`ENTRY_TYPE = 'R'`).

These rows are `deliveryClass #A` and **do not travel with the transport** (L-335). Nothing in
`DS4K907263` brings them back — this file and the restore payload beside it are the only copy.

## Restore — one call

`worklog/DS4_100_NIIF/registry-restore-2026-09-11-1237.json` is a complete `ExecuteBatch` body with
**25 `REGI` steps**, ready to POST:

```
POST <base>/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
     + CSRF, body = registry-restore-2026-09-11-1237.json
```

This is the L-335 provisioning case `REGI` was built for, and restoring from it is itself a
test of the feature. `UUID` is deliberately not restored — it is generated on create.

Every step uses `Operation: INSERT`, so a restore onto a non-empty allow-list fails with **035**
rather than silently widening whatever is already there.

## The 25 rows

| Kind | Target | Operation | Active | R | W | Mode | MaxRows | Descr |
|---|---|---|---|---|---|---|---|---|
| FUNC | BAPI_BUPA_CREATE_FROM_DATA |  | X | X | X |  | 0 | live test: business partner create |
| FUNC | BAPI_FTR_IRATE_CREATE |  | X | X | X |  | 0 | live test: FTR interest rate instrument create |
| FUNC | CONVERSION_EXIT_ALPHA_INPUT |  | X | X | X | L | 0 | gap: non-RFC FM, local call_mode |
| FUNC | DATE_GET_WEEK |  | X | X | X | L | 0 | gap: non-RFC FM, concrete types |
| FUNC | MONTH_NAMES_GET |  | X | X | X | L | 0 | gap: TABLES param in local mode |
| FUNC | RFC_READ_TABLE |  | X | X | X |  | 0 | gap: FM with TABLES params |
| FUNC | RFC_SYSTEM_INFO |  | X | X | X |  | 0 | smoke: system info FM |
| FUNC | RPY_PROGRAM_READ |  | **(off)** | X | X |  | 0 | TEMP L-319 workaround: read ABAP source |
| QURY | FUPARAREF | SELECT | **(off)** | X |  |  | 100 | TEMP L-319 workaround: FM interface read |
| QURY | T000 | SELECT | X | X |  |  | 20 | Client table read - acceptance suite P3 |
| QURY | VTBFHA | SELECT | X | X |  |  | 20 | live test: FTR deal verification |
| QURY | VTBFHAPO | SELECT | X | X |  |  | 20 | live test: FTR deal verification |
| QURY | ZFS_CDS_SLC_001 | SELECT | X | X |  |  | 20 | gap: CDS view entity read |
| QURY | ZFS_CDS_SLC_002 | SELECT | X | X |  |  | 20 | live test: DTTK CDS view read |
| QURY | ZFS_SLC_OTTK_BTP | SELECT | X | X |  |  | 50 | smoke: OTTK read-only query |
| QURY | ZSGSLCTR_BPEXT | SELECT | X | X |  |  | 20 | live test: SLC bank master read |
| QURY | ZSGSLCTR_DEALID | SELECT | X | X |  |  | 50 | live test: deal id read-back |
| QURY | ZSGSLCTR_FEEDATA | SELECT | X | X |  |  | 50 | live test: fee data read-back |
| SUBM | ZFS_FI_R047 |  | X | X | X |  | 20 | SUBM test: SALV report (FI) |
| SUBM | ZFS_LMS_R033 |  | X | X | X |  | 20 | SUBM test: SALV report (LMS) |
| SUBM | ZFS_R_TRM_FWDTXN |  | X | X | X |  | 25 | SUBM test: REUSE_ALV, no GUI, s_bukrs optional |
| SUBM | ZFS_SLC_DEM003 |  | **(off)** | X | X |  | 30 | RETIRED - CL_GUI_HTML_VIEWER program, dumps under SUBMIT |
| TABL | ZFS_T_SLC_DYNGW |  | X | X | X |  | 0 | smoke: own table CRUD |
| TABL | ZSGSLCTR_DEALID | INSERT | X | X | X |  | 0 | live test: deal id mock insert |
| TABL | ZSGSLCTR_FEEDATA | INSERT | X | X | X |  | 0 | live test: fee data mock insert |
