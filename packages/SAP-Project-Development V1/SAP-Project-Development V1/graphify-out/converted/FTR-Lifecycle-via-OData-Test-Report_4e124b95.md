<!-- converted from FTR-Lifecycle-via-OData-Test-Report.docx -->

SAP Treasury Term Loan Lifecycle - Executed Through OData
ZFS_SB_DYNGATEWAY_O4_API on DS4 / client 100

System: DS4, client 100 (DS4_100_NIIF)
Executed by: FS_DEV3, driven from SAP GUI transaction /IWFND/GW_CLIENT
Date: 11.09.2026
Service base URL: https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001

# Scope
The complete lifecycle of an SAP Treasury term loan was executed end to end through the dynamic OData gateway rather than by driving the transaction codes: create the deal, settle it, post its flows (TBB1), run month-end accrual/deferral (TPM44) and valuation (TPM1), and write a fee row to a custom table.

# Result Summary

# Gateway Enhancements Required
Two changes to the gateway were needed before the standard SAP reports could be driven through OData. Both were activated with zero messages on transport DS4K907263.

## 1. Namespace guard removed - ZCL_FS_SLC_GW_SUBMIT
prepare_plan refused any program outside the Z*/Y* namespace, which blocked RFTBBB00, RTPM_ACCRUAL_DEFERRAL and RTPM_TRL_VALUATION outright. It was removed with the requester's explicit approval.
Diagnostic trap worth recording: that guard and the TRDIR-SUBC check raised the SAME message 027, 'Program &1 does not exist or is not executable'. Probing with RSPARAM - which plainly exists and is executable - therefore produced a misleading error.
Security position after the change: the allow-list remains the real control. Nothing runs unless an administrator registered it with ALLOW_WRITE and IS_ACTIVE, S_PROGRAM is still checked against the program's authorisation group, and SUBC='1' still rejects non-executable programs. The trade-off is a wider blast radius: any registered standard report is now runnable.

14-SUBM-namespace-guard-confirmed-RSPARAM-refused.png - the guard rejecting a standard program before the change

## 2. New JOB capture mode - ZFS_RFC_DYNGW_SUBMIT
The existing modes (SALV/LIST/MEMO/NONE) all SUBMIT synchronously into the DESTINATION 'NONE' RFC session, where there is no GUI and sy-batch is not set. A report that can render its own output takes its dialog path and terminates the work process - RFTBBB00 did exactly this after 31 seconds.
JOB mode runs the report as a genuine background job, where sy-batch = 'X': JOB_OPEN, SUBMIT VIA JOB, JOB_CLOSE, COMMIT WORK, poll TBTCO, then read the step's spool via TBTCP-LISTIDENT and RSPO_RETURN_ABAP_SPOOLJOB. The spool comes back to the caller as ROWSJSON, one JSON object per line, and the envelope carries JOBNAME, JOBCOUNT, JOBSTATUS and SPOOLID.
Poll budget is 400 seconds. A job exceeding it is not lost - it keeps running and the envelope returns its job name for follow-up.

# TC-01 - Create term loan - BAPI_FTR_IRATE_DEALCREATE
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/CallFunctionModule?sap-client=100

## Request (JSON)
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODU
CT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-01-01\",\"VALUAT
ION_CLASS\":\"0001\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\
"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE_STRUCTURE\":\"1\",\"INTEREST_CONDITION_TYPE\":\"1200\",\"IN
TEREST_RATE\":10,\"INTEREST_CALC_METH\":\"3\",\"FREQUENCY_CATEGORY\":\"3\",\"FREQUENCY\":1,\"FREQUENCY_UNIT\":\"2\"
,\"INTEREST_CALENDAR_ID\":\"01\",\"EFFECTIVE_FROM\":\"2026-01-01\",\"REPAY_STRUCTURE\":\"1\",\"REPAY_CONDITION_TYPE
\":\"1120\"},\"TESTRUN\":\"\"}","TablesJson":"{\"CONDITION\":[],...,\"RETURN\":[]}"}
## Response
TESTRUN=X  -> ExecStatus=S, ExportJson {"COMPANYCODE":"1000","FINANCIALTRANSACTION":"\\INTERN\\"}  (placeholder = c
lean dry run)
REAL (ExecuteBatch, CommitMode=AUTO) -> ExecStatus=S, ResultCount=1
## Expected
A 22A/100 term loan for CoCd 1000, partner 0700000453, INR 100,000 at 10% fixed with MONTHLY interest and bullet repayment at 31.12.2026.
## Actual
PASS - deal 0000000160440 created (VTBFHA). Condition table confirms: interest condition type 1200 at 10.0000000 with FREQUENCY=1 / FREQUENCY_UNIT=0 (Months), and repayment condition type 1120 at 100% due 31.12.2026.

Key modelling note: the simple BAPI_FTR_IRATE_CREATE cannot express monthly interest. DEALCREATE exposes the wizard-style fields INTEREST_RATE_STRUCTURE=1 (Fixed), FREQUENCY_CATEGORY=3 (Monthly), FREQUENCY=1, FREQUENCY_UNIT=2 (Months, domain T_ARHYTM_UNIT) and REPAY_STRUCTURE=1 (Final Repayment). The CONDITION/MAINFLOW/PAYMENTDETAIL tables were sent EMPTY - the system derives them.
## Verdict: PASS
## Evidence
07-REGI-FTR-BAPIs-ready.png

08-DEALCREATE-testrun-ready.png

09-DEALCREATE-real-commit-ready.png

10-DEALCREATE-VTBFHA-new-deal-160440.png

11-DEALCREATE-condition-table-monthly-confirmed.png


# TC-02 - Settle the transaction - BAPI_FTR_IRATE_SETTLE
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

## Request (JSON)
{"StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_SETTLE\",\"ImportJson\":\"{\\\"COMPANYCODE\\\":\\
\"1000\\\",\\\"FINANCIALTRANSACTION\\\":\\\"0000000160440\\\",\\\"TESTRUN\\\":\\\"\\\"}\",\"TablesJson\":\"{\\\"RET
URN\\\":[]}\"}]","CommitMode":"AUTO"}
## Response
TESTRUN=X -> ExecStatus=S, RETURN carried only TYPE="W" (FTR_GUI 220, partner validity) - a warning, not an error.
REAL -> ExecStatus=S, ResultCount=1
## Expected
Deal 0000000160440 moves from created to settled.
## Actual
PASS - VTBFHAZU shows a second activity row: activity 00002, activity category 20 (settled), created 14:48:21, alongside the original activity 00001 / category 10 (created).
## Verdict: PASS
## Evidence
12-SETTLE-testrun-ready.png

12b-SETTLE-testrun-response.png

13-SETTLE-VTBFHAZU-activity-confirmed.png


# TC-03 - TBB1 posting - RFTBBB00 via SUBM / JOB mode
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

## Request (JSON)
{"StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"RFTBBB00\",\"Operation\":\"JOB\",\"FilterJson\":\"[{\\\"Field\\\
":\\\"S_BUKRS\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"1000\\\"},{\\\"Field\\\":\\\"S_RFHA\\\",\\\"Op\\\":\\\"EQ\\
\",\\\"Low\\\":\\\"0000000160440\\\"},{\\\"Field\\\":\\\"P_DZTERM\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"2026010
1\\\"},{\\\"Field\\\":\\\"P_BUDAT\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"20260101\\\"},{\\\"Field\\\":\\\"P_TEST
\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"X\\\"}]\",\"MaxRows\":200}]","CommitMode":"NEVER"}
## Response
TEST RUN  -> S, 10 spool lines, 2.4 s. Envelope: JOBNAME ZFSGW_RFTBBB00, JOBCOUNT 16151600, JOBSTATUS F, SPOOLID 22
781
   |Records passed |        1|
   |    |1000|160440|Test run was successful|22A |TL - Disbursements|100 |Disbursement-Term Loan Plan|

REAL RUN (P_TEST="") -> S, 10 lines, JOBCOUNT 16182800, SPOOLID 22783
   |    |1000|160440|Transactions were updated successfully|22A |TL - Disbursements|100 |Disbursement-Term Loan Pla
n|
## Expected
Treasury flows for deal 0000000160440 posted with due date and posting date both 01.01.2026.
## Actual
PASS - FI document 0600000270 created (BKPF: CoCd 1000, doc type T1, AWTYP TR-TM, posting date 01.01.2026, entered 11.09.2026 by FS_DEV3).

This step is what forced the JOB capture mode. Run synchronously (SALV/LIST), RFTBBB00 terminated the RFC work process after 31 s with 020 "connection closed (no data)".
## Verdict: PASS

# TC-04 - TPM44 accrual/deferral - RTPM_ACCRUAL_DEFERRAL
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

## Request (JSON)
{"StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"RTPM_ACCRUAL_DEFERRAL\",\"Operation\":\"JOB\",\"FilterJson\":\"[
{\\\"Field\\\":\\\"SO_BUKRS\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"1000\\\"},{\\\"Field\\\":\\\"SO_OTCNR\\\",\\\
"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"0000000160440\\\"},{\\\"Field\\\":\\\"P_KEYDAT\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low
\\\":\\\"20260131\\\"},{\\\"Field\\\":\\\"P_TEST\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"X\\\"}]\",\"MaxRows\":20
0}]","CommitMode":"NEVER"}
## Response
TEST RUN -> S, 25 spool lines, 2.3 s. SPOOLID 22788
   |Records passed Header  |        2|
   |Records passed Position|        4|
   |  160440  1000 001 Accrual/deferral        31.01.2026  IndAS
   |40 106070  Int Receivable - TL    Loan: Accruals: Revenue          849.32  INR
   |50 301170  Interest Income - TL   Loan: Accruals: Revenue          849.32- INR
   |  160440  1000 001 Accrual/deferral reset  01.02.2026  IndAS
   |40 301170  Interest Income - TL   Loan: Reset Accruals: Revenue    849.32  INR
   |50 106070  Int Receivable - TL    Loan: Reset Accruals: Revenue    849.32- INR

REAL RUN (P_TEST="") -> S, 25 lines, 2.2 s
## Expected
One month of interest accrued at the first month-end from the start date (31.01.2026), with reset at 01.02.2026, for deal 0000000160440 only.
## Actual
PASS - FI documents 0600000271 (posting date 31.01.2026) and 0600000272 (01.02.2026) created.

Amount verified independently: 100,000 x 10% x 31/365 = 849.32 INR - exactly 31 days of January on act/365.

IMPORTANT - a wrong filter was caught here before the real run. The first attempt used SO_DEALN, which the report silently ignored: it processed 2,055 positions across the whole company code (warnings for unrelated deals 110001..., product type 20A) and ran 301 s. The correct field for an OTC transaction is SO_OTCNR. With it, the run was scoped to 1 deal and took 2.3 s. The bad run was a TEST run, so nothing was posted.
## Verdict: PASS (after filter correction)

# TC-05 - TPM1 valuation - RTPM_TRL_VALUATION
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteBatch?sap-client=100

## Request (JSON)
{"StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"RTPM_TRL_VALUATION\",\"Operation\":\"JOB\",\"FilterJson\":\"[{\\
\"Field\\\":\\\"SO_BUKRS\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"1000\\\"},{\\\"Field\\\":\\\"SO_OTCNR\\\",\\\"Op
\\\":\\\"EQ\\\",\\\"Low\\\":\\\"0000000160440\\\"},{\\\"Field\\\":\\\"KEYDATE\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\"
:\\\"20260131\\\"},{\\\"Field\\\":\\\"RKEYDATE\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"20260201\\\"},{\\\"Field\\
\":\\\"VALCAT\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"2\\\"},{\\\"Field\\\":\\\"P_FIDAT\\\",\\\"Op\\\":\\\"EQ\\\"
,\\\"Low\\\":\\\"20260131\\\"},{\\\"Field\\\":\\\"P_RFIDAT\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"20260201\\\"},
{\\\"Field\\\":\\\"X_SIMULA\\\",\\\"Op\\\":\\\"EQ\\\",\\\"Low\\\":\\\"X\\\"}]\",\"MaxRows\":200}]","CommitMode":"NE
VER"}
## Response
TEST RUN -> S, 10 spool lines, 2.2 s. SPOOLID 22792
   |Records passed |        1|
   |    |1000|001|      1|22A |160440  |The valuation of the position resulted in no write-ups or write-downs

REAL RUN (X_SIMULA="") -> S, 10 lines, 2.2 s - same result, no documents
## Expected
Month-end valuation at 31.01.2026 with reset at 01.02.2026 for deal 0000000160440.
## Actual
PASS - the report is correctly scoped to the single deal and reports no write-ups or write-downs, so it posts nothing.

This is the functionally correct answer, not a failure: a plain fixed-rate term loan carried at amortised cost has no market-value movement to revalue. Its economics surface as interest accrual, which TC-04 posted.

TPM1 has no P_TEST parameter - its test flag is X_SIMULA, and its valuation category VALCAT must be set (2 = Mid-Year Valuation with Reset was used, mirroring the TPM44 accrual+reset pattern).
## Verdict: PASS

# TC-06 - New row in ZSGSLCTR_FEEDATA
Action: POST https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001/ExecuteTableCrud?sap-client=100

## Request (JSON)
{"TargetName":"ZSGSLCTR_FEEDATA","Operation":"INSERT","ImportJson":"[{\"ZTYPE\":\"01\",\"ZFEE_TYPE\":\"F12\",\"ZOTT
K_NO\":\"999999\",\"ZDTTK_NO\":\"\",\"ZSGSART\":\"\",\"ZCAT\":\"02\",\"ZCODE\":\"01\",\"ZB_AMT\":100000.00,\"ZRATE\
":0,\"ZDAY\":\"\",\"ZAMT\":1000.00,\"ZF_AMT\":1000.00,\"ZCREATED_BY\":\"FS_DEV3\",\"ZCREATED_DATE\":\"2026-09-11\",
\"ZCREATED_TIME\":\"17:00:00\"}]"}
## Response
ExecStatus=S, ResultCount=1
## Expected
One row inserted with the values supplied by the requester.
## Actual
PASS - verified by SELECT: ZTYPE 01, ZFEE_TYPE F12, ZOTTK_NO 999999, ZCAT 02, ZCODE 01, ZB_AMT 100000, ZRATE 0, ZAMT 1000, ZF_AMT 1000, ZCREATED_BY FS_DEV3.

The three ZCREATED_* audit fields were populated in addition to the requested field list, matching the table convention.
## Verdict: PASS
## Evidence
20-FEEDATA-row-inserted-response.png


# Objects and Data Left on the System
Business data created: deal 0000000160440 and its settlement; FI documents 0600000270 (TBB1), 0600000271 and 0600000272 (TPM44); one row in ZSGSLCTR_FEEDATA (ZOTTK_NO 999999).
Gateway allow-list rows now active and WRITE-capable: BAPI_FTR_IRATE_DEALCREATE, BAPI_FTR_IRATE_SETTLE, RFTBBB00, RTPM_ACCRUAL_DEFERRAL, RTPM_TRL_VALUATION, plus RSPARAM (probe only) and RS_REFRESH_FROM_SELECTOPTIONS (read-only helper).
RECOMMENDED FOLLOW-UP: with the namespace guard removed, these registrations mean any gateway caller can create and settle treasury deals and post treasury flows. Clear IS_ACTIVE on the write-capable rows once testing is complete, and delete the RSPARAM probe row.

Lessons recorded in lessons/lessons-ledger.md: L-359 (namespace guard and its misleading shared message) and L-360 (dialog-capable reports cannot run in the SUBM RFC session; JOB mode is the fix).

| Test Case | Step | Business Result | Verdict |
| --- | --- | --- | --- |
| TC-01 | Create term loan - BAPI_FTR_IRATE_DEALCREATE | Deal 0000000160440 | PASS |
| TC-02 | Settle the transaction - BAPI_FTR_IRATE_SETTLE | Settled (activity 00002) | PASS |
| TC-03 | TBB1 posting - RFTBBB00 via SUBM / JOB mode | FI document 0600000270 | PASS |
| TC-04 | TPM44 accrual/deferral - RTPM_ACCRUAL_DEFERRAL | FI documents 0600000271 + 0600000272 (849.32 INR) | PASS (after filter correction) |
| TC-05 | TPM1 valuation - RTPM_TRL_VALUATION | No write-ups/downs - nothing to post | PASS |
| TC-06 | New row in ZSGSLCTR_FEEDATA | 1 row inserted | PASS |