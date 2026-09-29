<!-- converted from Dyngateway-All-Variations-Test-Report.docx -->

Dynamic OData Gateway - ZFS_SB_DYNGATEWAY_O4_API
All Step-Kind Variations - Test Case Report (QURY / TABL / FUNC / SUBM / REGI)

System: DS4, Client 100 (DS4_100_NIIF)
Tested by: FS_DEV3, driven via SAP GUI (/IWFND/GW_CLIENT) using the sap-gui MCP server
Date: 2026-09-11
Precondition: ZFS_T_SLC_DYNGW cleared to zero rows by the requester before this run
Service base URL: https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001

# Summary


# TC-01 - REGI - Register 4 targets and use one in the same batch
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":
"","MaxRows":0,"StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"Operation\":\"INSERT\",\"
ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\
\"AllowRead\\\":\\\"X\\\",\\\"MaxRows\\\":20,\\\"Descr\\\":\\\"Gateway variation test - QURY\\\"}\"},{\"Kind\"
:\"REGI\",\"TargetName\":\"ZSGSLCTR_FEEDATA\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\
\"TABL\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"X\\\",\\\"MaxRows\\\"
:0,\\\"Descr\\\":\\\"Gateway variation test - TABL\\\"}\"},{\"Kind\":\"REGI\",\"TargetName\":\"RFC_SYSTEM_INFO
\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"FUNC\\\",\\\"IsActive\\\":\\\"X\\\",\\\"A
llowWrite\\\":\\\"X\\\",\\\"MaxRows\\\":0,\\\"Descr\\\":\\\"Gateway variation test - FUNC\\\"}\"},{\"Kind\":\"
REGI\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"S
UBM\\\",\\\"Operation\\\":\\\"SALV\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"X\\\",\\\"MaxRows\\\"
:20,\\\"Descr\\\":\\\"Gateway variation test - SUBM\\\"}\"},{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_00
1\",\"FieldsJson\":\"[\\\"ZOTTK_NO\\\",\\\"ZBUKRS\\\",\\\"ZSTR\\\"]\",\"MaxRows\":5}]","CommitMode":"NEVER"}
## Response
ExecStatus=S  DurationMs=188  ResultCount=5  GwUuid=5254001f-e7a2-1fd1-abb2-d66775366000  MessageText="Execute
Batch executed successfully"
## Expected
All 5 steps (4x REGI + 1x QURY) report S. The QURY step reads the target the REGI step immediately before it just registered.
## Actual / Result
PASS - overall ExecStatus S, ResultCount 5. ZFS_T_SLC_DYNGW grew from 0 to 10 rows: 4 EntryType=R (the new registrations) + 1 BTCH parent log + 4 REGI step logs + 1 QURY step log.
## Verdict: PASS
## Evidence Screenshots
00-table-empty-baseline.png

01-REGI-batch-request.png

01-REGI-batch-response.png

01-REGI-table-after.png


# TC-02 - QURY - standalone RunQuery
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/RunQuery?sap-client=100

{"TargetName":"ZFS_CDS_SLC_001","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"ZOTTK_NO\",\"Z
BUKRS\",\"ZSTR\"]","FilterJson":"","OrderByJson":"","MaxRows":5,"StepsJson":"","CommitMode":""}
## Response
ExecStatus=S  DurationMs=37  ResultCount=2  GwUuid=5254001f-e7a2-1fd1-abb2-ec17889f2000  MessageText="ZFS_CDS_
SLC_001 executed successfully"
## Expected
Reads ZFS_CDS_SLC_001 using the target registered in TC-01, returns rows within MaxRows.
## Actual / Result
PASS - ExecStatus S, ResultCount 2 rows. ZFS_T_SLC_DYNGW grew from 10 to 11 rows (one new L/QURY log row).
## Verdict: PASS
## Evidence Screenshots
02-QURY-runquery-request.png

02-QURY-runquery-response.png

02-QURY-table-after.png


# TC-03 - TABL - standalone ExecuteTableCrud (INSERT)
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteTableCrud?sap-client=100

{"TargetName":"ZSGSLCTR_FEEDATA","Operation":"INSERT","ImportJson":"[{\"ZTYPE\":\"01\",\"ZFEE_TYPE\":\"F13\",\
"ZOTTK_NO\":\"100050\",\"ZDTTK_NO\":\"\",\"ZCAT\":\"01\",\"ZCODE\":\"01\",\"ZB_AMT\":100000,\"ZRATE\":10,\"ZDA
Y\":\"5\",\"ZAMT\":0,\"ZF_AMT\":138.89,\"ZCREATED_BY\":\"FS_DEV3\",\"ZCREATED_DATE\":\"2026-09-11\",\"ZCREATED
_TIME\":\"12:00:00\"}]","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJso
n":"","CommitMode":""}
## Response
ExecStatus=S  DurationMs=35  ResultCount=1  GwUuid=5254001f-e7a2-1fd1-abb3-103d2425c000  MessageText="ZSGSLCTR
_FEEDATA executed successfully"
## Expected
One new fee row (ZOTTK_NO 100050 / ZFEE_TYPE F13) is written to ZSGSLCTR_FEEDATA.
## Actual / Result
PASS - ExecStatus S, ResultCount 1. ZFS_T_SLC_DYNGW grew from 11 to 12 rows. SE16 on ZSGSLCTR_FEEDATA confirms exactly 1 row for ZFEE_TYPE=F13.
## Verdict: PASS
## Evidence Screenshots
03-TABL-crud-request.png

03-TABL-crud-response.png

03-TABL-table-after.png

03-TABL-target-row-written.png


# TC-04 - FUNC - standalone CallFunctionModule
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/CallFunctionModule?sap-client=100

{"TargetName":"RFC_SYSTEM_INFO","Operation":"","ImportJson":"","TablesJson":"{}","FieldsJson":"","FilterJson":
"","OrderByJson":"","MaxRows":0,"StepsJson":"","CommitMode":""}
## Response
ExecStatus=S  DurationMs=17  GwUuid=5254001f-e7a2-1fd1-abb3-1eae18d86000  MessageText="RFC_SYSTEM_INFO execute
d successfully"  ExportJson contains RFCSI_EXPORT
## Expected
RFC_SYSTEM_INFO runs and returns RFCSI_EXPORT in ExportJson.
## Actual / Result
PASS - ExecStatus S, ExportJson carries RFCSI_EXPORT with system details. ZFS_T_SLC_DYNGW grew from 12 to 13 rows.
## Verdict: PASS
## Evidence Screenshots
04-FUNC-callfm-request.png

04-FUNC-callfm-response.png

04-FUNC-table-after.png


# TC-05 - SUBM - run an executable report via ExecuteBatch
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":
"","MaxRows":0,"StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"SALV\",\"M
axRows\":5}]","CommitMode":"NEVER"}
## Response
ExecStatus=S  DurationMs=51  ResultCount=1  GwUuid=5254001f-e7a2-1fd1-abb3-56d23af56000  MessageText="ExecuteB
atch executed successfully"  RowsJson step KIND=SUBM
## Expected
Report ZFS_R_TRM_FWDTXN runs in SALV capture mode (matches the registry pin from TC-01) and returns rows.
## Actual / Result
PASS - ExecStatus S, ResultCount 1. ZFS_T_SLC_DYNGW grew from 13 to 15 rows (BTCH parent + SUBM step log).
## Verdict: PASS
## Evidence Screenshots
05-SUBM-batch-request.png

05-SUBM-batch-response.png

05-SUBM-table-after.png


# TC-06 - Mixed batch (QURY+FUNC+SUBM+TABL DELETE) - Operation mismatch - NEGATIVE CASE
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":
"","MaxRows":0,"StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"FieldsJson\":\"[\\\"ZOTTK
_NO\\\",\\\"ZBUKRS\\\",\\\"ZSTR\\\"]\",\"MaxRows\":5},{\"Kind\":\"FUNC\",\"TargetName\":\"RFC_SYSTEM_INFO\",\"
TablesJson\":\"{}\"},{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"NONE\"},{\"Kind\":
\"TABL\",\"TargetName\":\"ZSGSLCTR_FEEDATA\",\"Operation\":\"DELETE\",\"ImportJson\":\"[{\\\"ZTYPE\\\":\\\"01\
\\",\\\"ZFEE_TYPE\\\":\\\"F13\\\",\\\"ZOTTK_NO\\\":\\\"100050\\\",\\\"ZDTTK_NO\\\":\\\"\\\"}]\"}]","CommitMode
":"AUTO"}
## Response
ExecStatus=E  DurationMs=25  ResultCount=3  GwUuid=5254001f-e7a2-1fd1-abb3-7d23ebd52000  MessageText="Dynamic 
call of batch step 3 failed..."
## Expected
Exploratory / negative case: SUBM step uses Operation=NONE against a target whose registry row is pinned to Operation=SALV (see TC-01).
## Actual / Result
Step 1 (QURY) and step 2 (FUNC) succeeded and were logged; step 3 (SUBM, Operation NONE) failed with a generic error, not a numbered ZFS_TRM_MSG message; step 4 (TABL DELETE) never ran and got no log row at all. The ZSGSLCTR_FEEDATA F13 test row from TC-03 was confirmed still present afterward (DELETE did not execute). Root cause confirmed by the successful retry in TC-06b. Recorded as lesson L-358.
## Verdict: FAIL (expected/diagnostic) - genuine finding, not a script error
## Evidence Screenshots
06-MIXED-batch-request.png

06-MIXED-batch-response-FAILED.png

06-MIXED-table-after-FAILED.png

06-MIXED-table-after-FAILED-full19rows.png

06-MIXED-F13-row-survived-abort.png


# TC-06b - Mixed batch retry (QURY+FUNC+SUBM+TABL DELETE) - Operation corrected
## Request
URL:  POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":
"","MaxRows":0,"StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"FieldsJson\":\"[\\\"ZOTTK
_NO\\\",\\\"ZBUKRS\\\",\\\"ZSTR\\\"]\",\"MaxRows\":5},{\"Kind\":\"FUNC\",\"TargetName\":\"RFC_SYSTEM_INFO\",\"
TablesJson\":\"{}\"},{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"SALV\",\"MaxRows\"
:5},{\"Kind\":\"TABL\",\"TargetName\":\"ZSGSLCTR_FEEDATA\",\"Operation\":\"DELETE\",\"ImportJson\":\"[{\\\"ZTY
PE\\\":\\\"01\\\",\\\"ZFEE_TYPE\\\":\\\"F13\\\",\\\"ZOTTK_NO\\\":\\\"100050\\\",\\\"ZDTTK_NO\\\":\\\"\\\"}]\"}
]","CommitMode":"AUTO"}
## Response
ExecStatus=S  DurationMs=101  ResultCount=4  GwUuid=5254001f-e7a2-1fd1-abb3-c01f88f92000  MessageText="Execute
Batch executed successfully"
## Expected
Same 4-step batch as TC-06 but with Operation=SALV (matching the registry pin) should let every step run, including the TABL DELETE cleanup.
## Actual / Result
PASS - all 4 steps report S, ResultCount 4. ZFS_T_SLC_DYNGW grew from 19 to 24 rows (BTCH parent + 4 step logs). SE16 on ZSGSLCTR_FEEDATA confirms the F13 row is gone - the DELETE step executed this time. Confirms the Operation mismatch, not any other factor, caused TC-06's failure.
## Verdict: PASS
## Evidence Screenshots
06b-MIXED-batch-retry-request.png

06b-MIXED-batch-retry-response-SUCCESS.png

06b-MIXED-table-after-SUCCESS.png

06b-MIXED-F13-row-deleted-confirmed.png



| Test Case | Variation | Action | Verdict |
| --- | --- | --- | --- |
| TC-01 | REGI - Register 4 targets and use one in the same batch | ExecuteBatch | PASS |
| TC-02 | QURY - standalone RunQuery | RunQuery | PASS |
| TC-03 | TABL - standalone ExecuteTableCrud (INSERT) | ExecuteTableCrud | PASS |
| TC-04 | FUNC - standalone CallFunctionModule | CallFunctionModule | PASS |
| TC-05 | SUBM - run an executable report via ExecuteBatch | ExecuteBatch | PASS |
| TC-06 | Mixed batch (QURY+FUNC+SUBM+TABL DELETE) - Operation mismatch - NEGATIVE CASE | ExecuteBatch | FAIL (expected/diagnostic) - genuine finding, not a script error |
| TC-06b | Mixed batch retry (QURY+FUNC+SUBM+TABL DELETE) - Operation corrected | ExecuteBatch | PASS |