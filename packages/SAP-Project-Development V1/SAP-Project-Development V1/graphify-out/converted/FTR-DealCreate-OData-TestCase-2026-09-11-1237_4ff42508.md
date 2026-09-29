<!-- converted from FTR-DealCreate-OData-TestCase-2026-09-11-1237.docx -->

Creating an FTR Term Loan through the Dynamic OData Gateway
Test case, evidence pack, and a field-by-field guide to ZFS_T_SLC_DYNGW

# 1 · The test case
Create a term loan transaction through BAPI_FTR_IRATE_DEALCREATE with the following business parameters, driven entirely over OData — not by running the t-code:

Outcome at a glance:

# 2 · The endpoint — every URL you need
One endpoint, four actions. The action name is the last path segment; what you are calling (function module, table, CDS view, report) goes in the JSON body, never in the URL.
Base:
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
The four actions — all POST, all take the same ten-field body:
POST  https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
POST  https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteTableCrud?sap-client=100
POST  https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
POST  https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
Inside /IWFND/GW_CLIENT you are already in the system, so you paste only the path (no host). This is what goes in the Request URI field:
/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100

/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100

/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
Reading the allow-list and the call log is plain OData CRUD on the same entity set — EntryType separates the two kinds of row:
GET  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway?sap-client=100&$filter=EntryType eq 'R'
GET  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway?sap-client=100&$filter=EntryType eq 'L'
GET  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway(<GwUuid>)?sap-client=100
Four ways to get the URL wrong — each fails as something other than what it is:

The entity set, the action names and the namespace are all case-sensitive. Note the 4 in zfs_sb_dyngateway_o4_api — dropping it gives a 404 that reads like an unpublished binding.
# 3 · Setting up /IWFND/GW_CLIENT
Do this once each time you open the transaction. The Gateway Client fetches and attaches its own CSRF token, so there is no token step and no cookie jar.

The content-type header is not optional. The body pane defaults to XML, and a JSON payload without that header is parsed as XML and refused with 400 CX_SXML_PARSE_ERROR.
# 4 · The request body — the same ten fields every time
Send all ten, leaving the ones you are not using as "" or 0.
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"",
  "FieldsJson":"", "FilterJson":"", "OrderByJson":"", "MaxRows":0,
  "StepsJson":"", "CommitMode":"" }

## 4.1 · The response
{ "GwUuid":"…", "ExecStatus":"S", "MessageText":"…",
  "ExportJson":"…", "TablesJson":"…", "RowsJson":"…",
  "ResultCount":0, "DurationMs":0 }

ExecStatus reports the DISPATCH, not the business outcome. A BAPI that failed still comes back S with its errors inside RETURN. A refusal is HTTP 200 with ExecStatus='E' — not an HTTP error. Check the field, not the status code.
# 5 · ZFS_T_SLC_DYNGW — the one table behind everything
One transparent table holds two completely different kinds of row, told apart by ENTRY_TYPE. This is why the same OData entity set both manages the allow-list and exposes the audit trail — it is the same table, filtered.

Delivery class A (application data): these rows are DATA, not repository content, so they do NOT travel with a transport. A freshly imported system answers 017 to everything until targets are registered on it.
## 5.1 · Every field, and what it is for
All 38 fields of the table, in DDIC order. The "Used by" column says which kind of row the field is meaningful on — several are only ever filled on one of the two.

The four fields marked "not exposed over OData" — LOG_LEVEL, PARENT_UUID, STEP_INDEX and PHASE — exist on the table but are deliberately left out of the OData projection (ZFS_I_DynGateway). Per-step detail is kept for SE16 and for future reporting without changing the published API contract. Query the table directly if you need them.
## 5.2 · How a registry row is checked, on every single call
ZCL_FS_SLC_GW_REGISTRY=>resolve runs before anything else happens:

Resolution is buffered per request, not per call: a batch naming the same target five times triggers one SELECT, not five.
# 6 · The test cases, step by step
Every request below is the exact text pasted into the body pane of /IWFND/GW_CLIENT. They are shown as a single line because that is what goes in the field; a readable expansion of the nested JSON follows each one.
## TC-00 · Baseline — the registry is empty
The requester deleted every row of ZFS_T_SLC_DYNGW before this run, so the gateway starts with no permissions at all. SE16 confirms it.


00-baseline-table-empty.png — ZFS_T_SLC_DYNGW is empty. The selection screen also lists every field of the table.
## TC-01 · Calling the BAPI before it is registered
Purpose: prove that nothing runs unless an administrator allow-listed it — and that a refusal is a normal HTTP 200 response, not an HTTP error.
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
Request body (paste this):
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"","ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODUCT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-01-01\",\"VALUATION_CLASS\":\"0001\"},\"GENERALCONTRACTDATAX\":{\"COMPANY_CODE\":\"X\",\"PRODUCT_TYPE\":\"X\",\"TRANSACTION_TYPE\":\"X\",\"PARTNER\":\"X\",\"CONTRACT_DATE\":\"X\",\"VALUATION_CLASS\":\"X\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE_STRUCTURE\":\"1\",\"INTEREST_CONDITION_TYPE\":\"1200\",\"INTEREST_RATE\":10,\"INTEREST_CALC_METH\":\"3\",\"FREQUENCY_CATEGORY\":\"3\",\"FREQUENCY\":1,\"FREQUENCY_UNIT\":\"2\",\"INTEREST_CALENDAR_ID\":\"01\",\"EFFECTIVE_FROM\":\"2026-01-01\",\"REPAY_STRUCTURE\":\"1\",\"REPAY_CONDITION_TYPE\":\"1120\"},\"INTERESTRATEINSTRUMENTX\":{\"CURRENCY\":\"X\",\"START_TERM\":\"X\",\"END_TERM\":\"X\",\"NOMINAL_AMOUNT\":\"X\",\"INTEREST_RATE_STRUCTURE\":\"X\",\"INTEREST_CONDITION_TYPE\":\"X\",\"INTEREST_RATE\":\"X\",\"INTEREST_CALC_METH\":\"X\",\"FREQUENCY_CATEGORY\":\"X\",\"FREQUENCY\":\"X\",\"FREQUENCY_UNIT\":\"X\",\"INTEREST_CALENDAR_ID\":\"X\",\"EFFECTIVE_FROM\":\"X\",\"REPAY_STRUCTURE\":\"X\",\"REPAY_CONDITION_TYPE\":\"X\"},\"TESTRUN\":\"X\"}","TablesJson":"{\"CONDITION\":[],\"CONDITIONX\":[],\"FORMULAVARIABLE\":[],\"SINGLEDATE\":[],\"PAYMENTDETAIL\":[],\"PAYMENTDETAILX\":[],\"ADDFLOW\":[],\"ADDFLOWX\":[],\"MAINFLOW\":[],\"MAINFLOWX\":[],\"RETURN\":[]}","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"","CommitMode":""}


01-TC01-refusal-request.png — TC-01 request — method, URI, content-type header and body

02-TC01-refusal-response-017.png — TC-01 response — status 200, ExecStatus E, message 017. Note the Gateway Client added the X-CSRF-Token itself.
## TC-02 · Registering the BAPI with a REGI step
Purpose: register a target without leaving the gateway. REGI is a step kind inside ExecuteBatch — not a registrable target kind — and it exists because allow-list rows do not travel with a transport, so a fresh system otherwise needs one POST per target.
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
Request body (paste this):
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"FUNC\\\",\\\"Operation\\\":\\\"\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"X\\\",\\\"CallMode\\\":\\\"\\\",\\\"MaxRows\\\":0,\\\"Descr\\\":\\\"FTR term loan create - test case 2026-09-11\\\"}\"}]","CommitMode":"AUTO"}
What the nesting means — StepsJson is a string containing steps, and the step's own ImportJson is again a string, so this payload is three levels deep. Expanded:
StepsJson (level 2) =
[
  {
    "Kind": "REGI",
    "TargetName": "BAPI_FTR_IRATE_DEALCREATE",
    "Operation": "INSERT",
    "ImportJson": "{\"TargetKind\":\"FUNC\",\"Operation\":\"\",\"IsActive\":\"X\",\"AllowRead\":\"X\",\"AllowWrite\":\"X\",\"CallMode\":\"\",\"MaxRows\":0,\"Descr\":\"FTR term loan create - test case 2026-09-11\"}"
  }
]

  step.ImportJson (level 3) =
{
  "TargetKind": "FUNC",
  "Operation": "",
  "IsActive": "X",
  "AllowRead": "X",
  "AllowWrite": "X",
  "CallMode": "",
  "MaxRows": 0,
  "Descr": "FTR term loan create - test case 2026-09-11"
}
Two different Operation fields, deliberately: the STEP's Operation (INSERT here) says what to do to the registry row itself; the Operation INSIDE ImportJson would pin the registered target to one operation. INSERT is the default and fails with 035 if the target already exists — widening an existing registration must be typed out as UPDATE, on purpose.


03-TC02-REGI-request.png — TC-02 request — the three-level REGI payload

04-TC02-REGI-response.png — TC-02 response — the target is now registered
## TC-03 · Dry run with TESTRUN = 'X'
Purpose: validate the whole payload against the BAPI's own checks without creating anything. A successful dry run returns the placeholder \INTERN\ instead of a number.
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
Request body (paste this):
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"","ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODUCT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-01-01\",\"VALUATION_CLASS\":\"0001\"},\"GENERALCONTRACTDATAX\":{\"COMPANY_CODE\":\"X\",\"PRODUCT_TYPE\":\"X\",\"TRANSACTION_TYPE\":\"X\",\"PARTNER\":\"X\",\"CONTRACT_DATE\":\"X\",\"VALUATION_CLASS\":\"X\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE_STRUCTURE\":\"1\",\"INTEREST_CONDITION_TYPE\":\"1200\",\"INTEREST_RATE\":10,\"INTEREST_CALC_METH\":\"3\",\"FREQUENCY_CATEGORY\":\"3\",\"FREQUENCY\":1,\"FREQUENCY_UNIT\":\"2\",\"INTEREST_CALENDAR_ID\":\"01\",\"EFFECTIVE_FROM\":\"2026-01-01\",\"REPAY_STRUCTURE\":\"1\",\"REPAY_CONDITION_TYPE\":\"1120\"},\"INTERESTRATEINSTRUMENTX\":{\"CURRENCY\":\"X\",\"START_TERM\":\"X\",\"END_TERM\":\"X\",\"NOMINAL_AMOUNT\":\"X\",\"INTEREST_RATE_STRUCTURE\":\"X\",\"INTEREST_CONDITION_TYPE\":\"X\",\"INTEREST_RATE\":\"X\",\"INTEREST_CALC_METH\":\"X\",\"FREQUENCY_CATEGORY\":\"X\",\"FREQUENCY\":\"X\",\"FREQUENCY_UNIT\":\"X\",\"INTEREST_CALENDAR_ID\":\"X\",\"EFFECTIVE_FROM\":\"X\",\"REPAY_STRUCTURE\":\"X\",\"REPAY_CONDITION_TYPE\":\"X\"},\"TESTRUN\":\"X\"}","TablesJson":"{\"CONDITION\":[],\"CONDITIONX\":[],\"FORMULAVARIABLE\":[],\"SINGLEDATE\":[],\"PAYMENTDETAIL\":[],\"PAYMENTDETAILX\":[],\"ADDFLOW\":[],\"ADDFLOWX\":[],\"MAINFLOW\":[],\"MAINFLOWX\":[],\"RETURN\":[]}","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"","CommitMode":""}
ImportJson expanded:
{
  "GENERALCONTRACTDATA": {
    "COMPANY_CODE": "1000",
    "PRODUCT_TYPE": "22A",
    "TRANSACTION_TYPE": "100",
    "PARTNER": "0700000453",
    "CONTRACT_DATE": "2026-01-01",
    "VALUATION_CLASS": "0001"
  },
  "GENERALCONTRACTDATAX": {
    "COMPANY_CODE": "X",
    "PRODUCT_TYPE": "X",
    "TRANSACTION_TYPE": "X",
    "PARTNER": "X",
    "CONTRACT_DATE": "X",
    "VALUATION_CLASS": "X"
  },
  "INTERESTRATEINSTRUMENT": {
    "CURRENCY": "INR",
    "START_TERM": "2026-01-01",
    "END_TERM": "2026-12-31",
    "NOMINAL_AMOUNT": 100000,
    "INTEREST_RATE_STRUCTURE": "1",
    "INTEREST_CONDITION_TYPE": "1200",
    "INTEREST_RATE": 10,
    "INTEREST_CALC_METH": "3",
    "FREQUENCY_CATEGORY": "3",
    "FREQUENCY": 1,
    "FREQUENCY_UNIT": "2",
    "INTEREST_CALENDAR_ID": "01",
    "EFFECTIVE_FROM": "2026-01-01",
    "REPAY_STRUCTURE": "1",
    "REPAY_CONDITION_TYPE": "1120"
  },
  "INTERESTRATEINSTRUMENTX": {
    "CURRENCY": "X",
    "START_TERM": "X",
    "END_TERM": "X",
    "NOMINAL_AMOUNT": "X",
    "INTEREST_RATE_STRUCTURE": "X",
    "INTEREST_CONDITION_TYPE": "X",
    "INTEREST_RATE": "X",
    "INTEREST_CALC_METH": "X",
    "FREQUENCY_CATEGORY": "X",
    "FREQUENCY": "X",
    "FREQUENCY_UNIT": "X",
    "INTEREST_CALENDAR_ID": "X",
    "EFFECTIVE_FROM": "X",
    "REPAY_STRUCTURE": "X",
    "REPAY_CONDITION_TYPE": "X"
  },
  "TESTRUN": "X"
}
Note GENERALCONTRACTDATAX and INTERESTRATEINSTRUMENTX. BAPI_FTR_IRATE_DEALCREATE is the "complete create" BAPI: every value is ignored unless its matching X flag is set. Omitting them is why the first attempt in this run failed — see §9.
TablesJson sends every mandatory TABLES parameter as an empty array, plus RETURN. An output-only TABLES parameter that you do not name is never bound, so its content never comes back — this is the single most common cause of "the FM returned nothing".


05-TC03-testrun-request.png — TC-03 request — TESTRUN='X'

06-TC03-testrun-response-INTERN.png — TC-03 response — \INTERN\ placeholder, the signature of a clean dry run
## TC-04 · The real create — ExecuteBatch with CommitMode
Purpose: actually create the deal. This step must be a batch. CallFunctionModule runs the function module and then throws the work away — nothing issues BAPI_TRANSACTION_COMMIT. ExecuteBatch shares one DESTINATION 'NONE' session across its FUNC steps and commits them together according to CommitMode.
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
Request body (paste this) — identical to TC-03 except TESTRUN is now empty and the call is wrapped as a batch step with CommitMode=AUTO:
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",\"ImportJson\":\"{\\\"GENERALCONTRACTDATA\\\":{\\\"COMPANY_CODE\\\":\\\"1000\\\",\\\"PRODUCT_TYPE\\\":\\\"22A\\\",\\\"TRANSACTION_TYPE\\\":\\\"100\\\",\\\"PARTNER\\\":\\\"0700000453\\\",\\\"CONTRACT_DATE\\\":\\\"2026-01-01\\\",\\\"VALUATION_CLASS\\\":\\\"0001\\\"},\\\"GENERALCONTRACTDATAX\\\":{\\\"COMPANY_CODE\\\":\\\"X\\\",\\\"PRODUCT_TYPE\\\":\\\"X\\\",\\\"TRANSACTION_TYPE\\\":\\\"X\\\",\\\"PARTNER\\\":\\\"X\\\",\\\"CONTRACT_DATE\\\":\\\"X\\\",\\\"VALUATION_CLASS\\\":\\\"X\\\"},\\\"INTERESTRATEINSTRUMENT\\\":{\\\"CURRENCY\\\":\\\"INR\\\",\\\"START_TERM\\\":\\\"2026-01-01\\\",\\\"END_TERM\\\":\\\"2026-12-31\\\",\\\"NOMINAL_AMOUNT\\\":100000,\\\"INTEREST_RATE_STRUCTURE\\\":\\\"1\\\",\\\"INTEREST_CONDITION_TYPE\\\":\\\"1200\\\",\\\"INTEREST_RATE\\\":10,\\\"INTEREST_CALC_METH\\\":\\\"3\\\",\\\"FREQUENCY_CATEGORY\\\":\\\"3\\\",\\\"FREQUENCY\\\":1,\\\"FREQUENCY_UNIT\\\":\\\"2\\\",\\\"INTEREST_CALENDAR_ID\\\":\\\"01\\\",\\\"EFFECTIVE_FROM\\\":\\\"2026-01-01\\\",\\\"REPAY_STRUCTURE\\\":\\\"1\\\",\\\"REPAY_CONDITION_TYPE\\\":\\\"1120\\\"},\\\"INTERESTRATEINSTRUMENTX\\\":{\\\"CURRENCY\\\":\\\"X\\\",\\\"START_TERM\\\":\\\"X\\\",\\\"END_TERM\\\":\\\"X\\\",\\\"NOMINAL_AMOUNT\\\":\\\"X\\\",\\\"INTEREST_RATE_STRUCTURE\\\":\\\"X\\\",\\\"INTEREST_CONDITION_TYPE\\\":\\\"X\\\",\\\"INTEREST_RATE\\\":\\\"X\\\",\\\"INTEREST_CALC_METH\\\":\\\"X\\\",\\\"FREQUENCY_CATEGORY\\\":\\\"X\\\",\\\"FREQUENCY\\\":\\\"X\\\",\\\"FREQUENCY_UNIT\\\":\\\"X\\\",\\\"INTEREST_CALENDAR_ID\\\":\\\"X\\\",\\\"EFFECTIVE_FROM\\\":\\\"X\\\",\\\"REPAY_STRUCTURE\\\":\\\"X\\\",\\\"REPAY_CONDITION_TYPE\\\":\\\"X\\\"},\\\"TESTRUN\\\":\\\"\\\"}\",\"TablesJson\":\"{\\\"CONDITION\\\":[],\\\"CONDITIONX\\\":[],\\\"FORMULAVARIABLE\\\":[],\\\"SINGLEDATE\\\":[],\\\"PAYMENTDETAIL\\\":[],\\\"PAYMENTDETAILX\\\":[],\\\"ADDFLOW\\\":[],\\\"ADDFLOWX\\\":[],\\\"MAINFLOW\\\":[],\\\"MAINFLOWX\\\":[],\\\"RETURN\\\":[]}\"}]","CommitMode":"AUTO"}


07-TC04-create-request.png — TC-04 request — the committing call

08-TC04-create-response.png — TC-04 response — ExecStatus S, one step, one row affected
## TC-05 · Register a target and use it in the SAME call
Purpose: the feature that makes REGI worth having. VTBFHA is not in the allow-list when this request is sent, yet step 2 reads it successfully. ExecuteBatch validates every step before any step executes, and REGI publishes its intent into the same per-request buffer the registry uses — so step 2 resolves against "committed rows plus what earlier REGI steps in this batch declared".
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
Request body (paste this):
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"VTBFHA\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"\\\",\\\"MaxRows\\\":20,\\\"Descr\\\":\\\"FTR transaction header - verification read\\\"}\"},{\"Kind\":\"QURY\",\"TargetName\":\"VTBFHA\",\"FieldsJson\":\"[\\\"BUKRS\\\", \\\"RFHA\\\", \\\"SGSART\\\", \\\"SFHAART\\\", \\\"KONTRH\\\", \\\"WGSCHFT\\\", \\\"RCOMVALCL\\\", \\\"DBLFZ\\\", \\\"DELFZ\\\", \\\"DCRDAT\\\"]\",\"OrderByJson\":\"[{\\\"Field\\\": \\\"RFHA\\\", \\\"Descending\\\": true}]\",\"MaxRows\":5}]","CommitMode":"NEVER"}


09-TC05-verify-request.png — TC-05 request — REGI then QURY on the same target

10-TC05-verify-response.png — TC-05 response — both steps S, 2 rows affected
## TC-06 · Reading the new deal back through the gateway
Purpose: confirm the created deal over the same OData service that created it.
Action:
POST /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
Request body (paste this):
{"TargetName":"VTBFHA","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"BUKRS\", \"RFHA\", \"SGSART\", \"SFHAART\", \"KONTRH\", \"WGSCHFT\", \"RCOMVALCL\", \"DBLFZ\", \"DELFZ\", \"DCRDAT\"]","FilterJson":"[{\"Field\": \"BUKRS\", \"Op\": \"EQ\", \"Low\": \"1000\", \"High\": \"\"}, {\"Field\": \"RFHA\", \"Op\": \"EQ\", \"Low\": \"0000000160445\", \"High\": \"\"}]","OrderByJson":"","MaxRows":5,"StepsJson":"","CommitMode":""}
Always send FieldsJson against an SAP-standard table: field validation does not flatten DDIC .INCLUDEs, so the all-columns default breaks on such tables.


11-TC06-readback-deal-160445.png — TC-06 response — the deal read back over OData
# 7 · Business verification — is it really the deal that was asked for?
The gateway said it created a deal. This section checks the deal itself, independently, against the database.
## 7.1 · Header — VTBFHA

## 7.2 · Conditions — VTBFINKO — this is the monthly-interest proof
The nominal amount and the 10 % rate are easy to see. "Monthly" is the part worth checking properly, and it shows up two ways: in the rhythm fields, and in the first due date.

SRHYTHM = 3 with AMMRHY = 001 is monthly, and the derived first interest due date of 01.02.2026 — exactly one month after the 01.01.2026 start of term — confirms it independently. The repayment condition is a single 100 % flow on 31.12.2026, i.e. bullet.
Note the CONDITION, MAINFLOW and PAYMENTDETAIL tables were all sent EMPTY. The system derived both conditions from the wizard-style fields in INTERESTRATEINSTRUMENT (INTEREST_RATE_STRUCTURE, FREQUENCY_CATEGORY, FREQUENCY, FREQUENCY_UNIT, REPAY_STRUCTURE).

12-VTBFINKO-conditions-monthly.png — VTBFINKO — interest condition 1200 at 10 % monthly, repayment condition 1120 at 100 % on 31.12.2026
# 8 · What the table looked like after every step
The registry started empty and finished with 13 rows — 2 registry rows and 11 call-log rows. This is the whole run, in order.

Counting calls: filter STEP_INDEX = 0 for one row per call, or PHASE = 'X' for one row per batch step. Counting ENTRY_TYPE='L' alone double-counts every batch.

13-final-table-13-rows.png — ZFS_T_SLC_DYNGW after the run — 13 rows
## 8.1 · What each row shape actually stores
REQUEST_JSON and RESPONSE_JSON are filled asymmetrically. This matters if you rely on the table for audit.

For a batch nothing is lost — parent carries the request, child carries the response. But the rows returned by a single-shot RunQuery are not retained anywhere, so "what did this query hand out?" cannot be answered afterwards even though ROW_COUNT is set. If a read matters for audit, run it as a one-step ExecuteBatch instead.
# 9 · Pitfalls — what actually goes wrong
Every item here was hit for real, either in this run or an earlier one on the same service.

# 10 · What was left on the system
Registry rows (ENTRY_TYPE='R'), both active:

Business data: FTR transaction 0000000160445 in company code 1000, with its two conditions in VTBFINKO. It has not been settled and nothing has been posted.
OPEN RISK: the BAPI_FTR_IRATE_DEALCREATE row carries ALLOW_WRITE='X' and IS_ACTIVE='X', so any caller who can reach this service can create FTR deals on DS4/100. Clearing IS_ACTIVE is an instant kill switch — no transport, no restart — and is the right action once this testing is finished.
## 10.1 · Turning it off
PATCH /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway(<GwUuid>)?sap-client=100
      If-Match: *
      { "IsActive": "" }

DELETE /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway(<GwUuid>)?sap-client=100
      If-Match: *
Find the GwUuid with:
GET /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway?sap-client=100&$filter=EntryType eq 'R'&$select=GwUuid,TargetName,TargetKind,IsActive
# 11 · Reference — the paste-ready payloads
All six request bodies in one place, exactly as they go into the body pane of /IWFND/GW_CLIENT. Each is one line.
TC-01 — refusal (BAPI not yet registered)
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"","ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODUCT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-01-01\",\"VALUATION_CLASS\":\"0001\"},\"GENERALCONTRACTDATAX\":{\"COMPANY_CODE\":\"X\",\"PRODUCT_TYPE\":\"X\",\"TRANSACTION_TYPE\":\"X\",\"PARTNER\":\"X\",\"CONTRACT_DATE\":\"X\",\"VALUATION_CLASS\":\"X\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE_STRUCTURE\":\"1\",\"INTEREST_CONDITION_TYPE\":\"1200\",\"INTEREST_RATE\":10,\"INTEREST_CALC_METH\":\"3\",\"FREQUENCY_CATEGORY\":\"3\",\"FREQUENCY\":1,\"FREQUENCY_UNIT\":\"2\",\"INTEREST_CALENDAR_ID\":\"01\",\"EFFECTIVE_FROM\":\"2026-01-01\",\"REPAY_STRUCTURE\":\"1\",\"REPAY_CONDITION_TYPE\":\"1120\"},\"INTERESTRATEINSTRUMENTX\":{\"CURRENCY\":\"X\",\"START_TERM\":\"X\",\"END_TERM\":\"X\",\"NOMINAL_AMOUNT\":\"X\",\"INTEREST_RATE_STRUCTURE\":\"X\",\"INTEREST_CONDITION_TYPE\":\"X\",\"INTEREST_RATE\":\"X\",\"INTEREST_CALC_METH\":\"X\",\"FREQUENCY_CATEGORY\":\"X\",\"FREQUENCY\":\"X\",\"FREQUENCY_UNIT\":\"X\",\"INTEREST_CALENDAR_ID\":\"X\",\"EFFECTIVE_FROM\":\"X\",\"REPAY_STRUCTURE\":\"X\",\"REPAY_CONDITION_TYPE\":\"X\"},\"TESTRUN\":\"X\"}","TablesJson":"{\"CONDITION\":[],\"CONDITIONX\":[],\"FORMULAVARIABLE\":[],\"SINGLEDATE\":[],\"PAYMENTDETAIL\":[],\"PAYMENTDETAILX\":[],\"ADDFLOW\":[],\"ADDFLOWX\":[],\"MAINFLOW\":[],\"MAINFLOWX\":[],\"RETURN\":[]}","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"","CommitMode":""}
TC-02 — register the BAPI
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"FUNC\\\",\\\"Operation\\\":\\\"\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"X\\\",\\\"CallMode\\\":\\\"\\\",\\\"MaxRows\\\":0,\\\"Descr\\\":\\\"FTR term loan create - test case 2026-09-11\\\"}\"}]","CommitMode":"AUTO"}
TC-03 — dry run, TESTRUN='X'
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
{"TargetName":"BAPI_FTR_IRATE_DEALCREATE","Operation":"","ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODUCT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-01-01\",\"VALUATION_CLASS\":\"0001\"},\"GENERALCONTRACTDATAX\":{\"COMPANY_CODE\":\"X\",\"PRODUCT_TYPE\":\"X\",\"TRANSACTION_TYPE\":\"X\",\"PARTNER\":\"X\",\"CONTRACT_DATE\":\"X\",\"VALUATION_CLASS\":\"X\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE_STRUCTURE\":\"1\",\"INTEREST_CONDITION_TYPE\":\"1200\",\"INTEREST_RATE\":10,\"INTEREST_CALC_METH\":\"3\",\"FREQUENCY_CATEGORY\":\"3\",\"FREQUENCY\":1,\"FREQUENCY_UNIT\":\"2\",\"INTEREST_CALENDAR_ID\":\"01\",\"EFFECTIVE_FROM\":\"2026-01-01\",\"REPAY_STRUCTURE\":\"1\",\"REPAY_CONDITION_TYPE\":\"1120\"},\"INTERESTRATEINSTRUMENTX\":{\"CURRENCY\":\"X\",\"START_TERM\":\"X\",\"END_TERM\":\"X\",\"NOMINAL_AMOUNT\":\"X\",\"INTEREST_RATE_STRUCTURE\":\"X\",\"INTEREST_CONDITION_TYPE\":\"X\",\"INTEREST_RATE\":\"X\",\"INTEREST_CALC_METH\":\"X\",\"FREQUENCY_CATEGORY\":\"X\",\"FREQUENCY\":\"X\",\"FREQUENCY_UNIT\":\"X\",\"INTEREST_CALENDAR_ID\":\"X\",\"EFFECTIVE_FROM\":\"X\",\"REPAY_STRUCTURE\":\"X\",\"REPAY_CONDITION_TYPE\":\"X\"},\"TESTRUN\":\"X\"}","TablesJson":"{\"CONDITION\":[],\"CONDITIONX\":[],\"FORMULAVARIABLE\":[],\"SINGLEDATE\":[],\"PAYMENTDETAIL\":[],\"PAYMENTDETAILX\":[],\"ADDFLOW\":[],\"ADDFLOWX\":[],\"MAINFLOW\":[],\"MAINFLOWX\":[],\"RETURN\":[]}","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"","CommitMode":""}
TC-04 — the real create
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_DEALCREATE\",\"ImportJson\":\"{\\\"GENERALCONTRACTDATA\\\":{\\\"COMPANY_CODE\\\":\\\"1000\\\",\\\"PRODUCT_TYPE\\\":\\\"22A\\\",\\\"TRANSACTION_TYPE\\\":\\\"100\\\",\\\"PARTNER\\\":\\\"0700000453\\\",\\\"CONTRACT_DATE\\\":\\\"2026-01-01\\\",\\\"VALUATION_CLASS\\\":\\\"0001\\\"},\\\"GENERALCONTRACTDATAX\\\":{\\\"COMPANY_CODE\\\":\\\"X\\\",\\\"PRODUCT_TYPE\\\":\\\"X\\\",\\\"TRANSACTION_TYPE\\\":\\\"X\\\",\\\"PARTNER\\\":\\\"X\\\",\\\"CONTRACT_DATE\\\":\\\"X\\\",\\\"VALUATION_CLASS\\\":\\\"X\\\"},\\\"INTERESTRATEINSTRUMENT\\\":{\\\"CURRENCY\\\":\\\"INR\\\",\\\"START_TERM\\\":\\\"2026-01-01\\\",\\\"END_TERM\\\":\\\"2026-12-31\\\",\\\"NOMINAL_AMOUNT\\\":100000,\\\"INTEREST_RATE_STRUCTURE\\\":\\\"1\\\",\\\"INTEREST_CONDITION_TYPE\\\":\\\"1200\\\",\\\"INTEREST_RATE\\\":10,\\\"INTEREST_CALC_METH\\\":\\\"3\\\",\\\"FREQUENCY_CATEGORY\\\":\\\"3\\\",\\\"FREQUENCY\\\":1,\\\"FREQUENCY_UNIT\\\":\\\"2\\\",\\\"INTEREST_CALENDAR_ID\\\":\\\"01\\\",\\\"EFFECTIVE_FROM\\\":\\\"2026-01-01\\\",\\\"REPAY_STRUCTURE\\\":\\\"1\\\",\\\"REPAY_CONDITION_TYPE\\\":\\\"1120\\\"},\\\"INTERESTRATEINSTRUMENTX\\\":{\\\"CURRENCY\\\":\\\"X\\\",\\\"START_TERM\\\":\\\"X\\\",\\\"END_TERM\\\":\\\"X\\\",\\\"NOMINAL_AMOUNT\\\":\\\"X\\\",\\\"INTEREST_RATE_STRUCTURE\\\":\\\"X\\\",\\\"INTEREST_CONDITION_TYPE\\\":\\\"X\\\",\\\"INTEREST_RATE\\\":\\\"X\\\",\\\"INTEREST_CALC_METH\\\":\\\"X\\\",\\\"FREQUENCY_CATEGORY\\\":\\\"X\\\",\\\"FREQUENCY\\\":\\\"X\\\",\\\"FREQUENCY_UNIT\\\":\\\"X\\\",\\\"INTEREST_CALENDAR_ID\\\":\\\"X\\\",\\\"EFFECTIVE_FROM\\\":\\\"X\\\",\\\"REPAY_STRUCTURE\\\":\\\"X\\\",\\\"REPAY_CONDITION_TYPE\\\":\\\"X\\\"},\\\"TESTRUN\\\":\\\"\\\"}\",\"TablesJson\":\"{\\\"CONDITION\\\":[],\\\"CONDITIONX\\\":[],\\\"FORMULAVARIABLE\\\":[],\\\"SINGLEDATE\\\":[],\\\"PAYMENTDETAIL\\\":[],\\\"PAYMENTDETAILX\\\":[],\\\"ADDFLOW\\\":[],\\\"ADDFLOWX\\\":[],\\\"MAINFLOW\\\":[],\\\"MAINFLOWX\\\":[],\\\"RETURN\\\":[]}\"}]","CommitMode":"AUTO"}
TC-05 — register VTBFHA and read it
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
{"TargetName":"","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"","FilterJson":"","OrderByJson":"","MaxRows":0,"StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"VTBFHA\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"AllowWrite\\\":\\\"\\\",\\\"MaxRows\\\":20,\\\"Descr\\\":\\\"FTR transaction header - verification read\\\"}\"},{\"Kind\":\"QURY\",\"TargetName\":\"VTBFHA\",\"FieldsJson\":\"[\\\"BUKRS\\\", \\\"RFHA\\\", \\\"SGSART\\\", \\\"SFHAART\\\", \\\"KONTRH\\\", \\\"WGSCHFT\\\", \\\"RCOMVALCL\\\", \\\"DBLFZ\\\", \\\"DELFZ\\\", \\\"DCRDAT\\\"]\",\"OrderByJson\":\"[{\\\"Field\\\": \\\"RFHA\\\", \\\"Descending\\\": true}]\",\"MaxRows\":5}]","CommitMode":"NEVER"}
TC-06 — read the deal back
URI:  /sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
{"TargetName":"VTBFHA","Operation":"","ImportJson":"","TablesJson":"","FieldsJson":"[\"BUKRS\", \"RFHA\", \"SGSART\", \"SFHAART\", \"KONTRH\", \"WGSCHFT\", \"RCOMVALCL\", \"DBLFZ\", \"DELFZ\", \"DCRDAT\"]","FilterJson":"[{\"Field\": \"BUKRS\", \"Op\": \"EQ\", \"Low\": \"1000\", \"High\": \"\"}, {\"Field\": \"RFHA\", \"Op\": \"EQ\", \"Low\": \"0000000160445\", \"High\": \"\"}]","OrderByJson":"","MaxRows":5,"StepsJson":"","CommitMode":""}
| Item | Value |
| --- | --- |
| Service | ZFS_SB_DYNGATEWAY_O4_API (OData V4, A2X) |
| System | DS4 / client 100 — DS4_100_NIIF (NIIF Development) |
| Host | vhnlqds4ap01.sap.niififl.in:44300 |
| Driven from | /IWFND/GW_CLIENT (SAP GUI), via the sap-gui MCP server |
| User | FS_DEV3 |
| Date | 11 September 2026 |
| Starting state | ZFS_T_SLC_DYNGW emptied by the requester — 0 rows |
| Result | PASS — FTR transaction 0000000160445 created |
| Parameter | Requested value | Sent to the BAPI as |
| --- | --- | --- |
| Company code | 1000 | "COMPANY_CODE": "1000" |
| Product type | 22A (TL – Disbursements) | "PRODUCT_TYPE": "22A" |
| Transaction type | 100 | "TRANSACTION_TYPE": "100" |
| Partner | 700000453 | "PARTNER": "0700000453"  ← zero-padded, see §9 |
| Start date | 01.01.2026 | "START_TERM": "2026-01-01" |
| End date | 31.12.2026 | "END_TERM": "2026-12-31" |
| Amount | 100,000 INR | "NOMINAL_AMOUNT": 100000  (unquoted) |
| Interest | 10 % fixed | "INTEREST_RATE": 10, "INTEREST_RATE_STRUCTURE": "1" |
| Interest frequency | monthly | "FREQUENCY_CATEGORY": "3", "FREQUENCY": 1, "FREQUENCY_UNIT": "2" |
| Valuation class | (not requested — mandatory here) | "VALUATION_CLASS": "0001" |
| # | Test case | Expected | Verdict |
| --- | --- | --- | --- |
| TC-01 | Call the BAPI before registering it | Refused with message 017, HTTP 200 | PASS |
| TC-02 | Register it with a REGI batch step | Registry row created | PASS |
| TC-03 | Dry run, TESTRUN = 'X' | Placeholder \INTERN\, no deal created | PASS |
| TC-04 | Real create, ExecuteBatch + CommitMode | A real transaction number | PASS |
| TC-05 | REGI VTBFHA + read it in the same batch | Both steps succeed | PASS |
| TC-06 | Read the new deal back through the gateway | Exactly 1 row, our deal | PASS |
| Mistake | You get | Looks like |
| --- | --- | --- |
| srvd instead of srvd_a2x | 403 | an authorisation problem |
| sap-client omitted | 401 | a wrong password |
| a key before the action name | 404 | the service is not there |
| dyngateway instead of DynGateway | 404 | the service is not there |
| GET instead of POST on an action | 405 | the action does not exist |
| # | Field | Set to |
| --- | --- | --- |
| 1 | Transaction | /IWFND/GW_CLIENT |
| 2 | HTTP Method | POST  — the four actions never answer GET |
| 3 | Protocol | HTTP (inside the system) or HTTPS |
| 4 | HTTP Request header grid | content-type = application/json  — MANDATORY |
| 5 | Request URI | the path from §2, host omitted |
| 6 | Request body (bottom-left pane) | the JSON from §6, exactly, outer { } included |
| 7 | Execute | F8 |
| 8 | Read | ~status_code, then ExecStatus, then the *Json strings |
| Field | Used by | Meaning |
| --- | --- | --- |
| TargetName | single-shot calls | FM / table / CDS view / report name |
| Operation | ExecuteTableCrud | INSERT | MODIFY | DELETE |
|  | SUBM step | capture mode SALV | LIST | MEMO | NONE |
| ImportJson | CallFunctionModule | {"PARAM":value,…} — the FM's IMPORTING |
|  | ExecuteTableCrud | [{row},{row}] — rows to write |
| TablesJson | CallFunctionModule | {"TAB":[…]} — TABLES parameters |
| FieldsJson | RunQuery | ["COL_A","COL_B"] |
| FilterJson | RunQuery | [{"Field":…,"Op":…,"Low":…,"High":…}] |
| OrderByJson | RunQuery | [{"Field":…,"Descending":true}] |
| MaxRows | RunQuery, SUBM | row cap, ceilinged by the registry |
| StepsJson | ExecuteBatch | ordered array of steps |
| CommitMode | ExecuteBatch | AUTO (default) | ALWAYS | NEVER |
| Field | Meaning |
| --- | --- |
| ExecStatus | S = dispatched · E = refused or failed |
| MessageText | the reason, from message class ZFS_TRM_MSG |
| ExportJson | CallFunctionModule → the FM's EXPORTING parameters |
| TablesJson | CallFunctionModule → TABLES after the call (this is where RETURN is) |
| RowsJson | RunQuery → the rows · ExecuteBatch → the per-step array |
| ResultCount | rows returned / affected / steps run |
| DurationMs | server-side time |
| GwUuid | key of the call-log row — read the whole call back later |
| ENTRY_TYPE | What the row is | Who writes it |
| --- | --- | --- |
| R | a registry row — one allow-listed target | you, via POST/PATCH/DELETE or a REGI step |
| L | a call-log row — one dispatch that was attempted | the gateway itself, never you |
| Field | Type | Row | Purpose |
| --- | --- | --- | --- |
| CLIENT | MANDT | key | Client. Standard key field. |
| UUID | SYSUUID_X16 | key | The row's primary key, generated on create. For a log row this is exactly the GwUuid the response handed back, which is how you read a past call back later. |
| ENTRY_TYPE | CHAR(1) | both | R = registry row, L = call-log row. The discriminator for the whole table. |
| TARGET_KIND | CHAR(4) | both | FUNC | TABL | QURY | SUBM on a registry row. On a log row it also takes REGI (a registration step) and BTCH (the parent row of an ExecuteBatch) — neither of which is registrable. |
| TARGET_NAME | CHAR(30) | both | Function module / table / CDS entity / report name. Exact names only — no wildcards. Blank on a BTCH parent row. |
| OPERATION | CHAR(10) | both | On a registry row: pins the target to one operation (a TABL operation, or a SUBM capture mode); blank = any. On a REGI log row: INSERT/UPDATE/UPSERT, i.e. what was done to the registry itself. |
| IS_ACTIVE | CHAR(1) | R | X = callable. Clearing it is an instant kill switch — no transport, no restart, no cache to clear. The very next call answers 017. |
| ALLOW_READ | CHAR(1) | R | Permission to read. QURY needs it. |
| ALLOW_WRITE | CHAR(1) | R | Permission to write. TABL write operations need it, and ALL FUNC and ALL SUBM targets need it unconditionally — a function module or a report can do anything its caller may do, so neither can be proved read-only in advance. |
| CALL_MODE | CHAR(1) | R | FUNC only. R = force DESTINATION 'NONE', L = force local, blank = decide automatically from TFDIR-FMODE. |
| MAX_ROWS | INT4 | R | Row ceiling the caller cannot exceed; asking for more is refused with 025. 0 means NO ceiling — set it deliberately. |
| DESCR | CHAR(60) | R | Free text. The place to record why a target is registered and any safe-usage note (e.g. a pinned Operation, or a safe selection width for a SUBM report). |
| LOG_LEVEL | CHAR(1) | R | A = log all (default), E = errors only, N = none. Stored on the table but deliberately NOT exposed over OData. |
| REGISTRY_UUID | SYSUUID_X16 | L | On a log row: which allow-list row authorised this call. The join back from the audit trail to the permission that permitted it. |
| REQUEST_JSON | STRING | L | The request as received. Filled on single-shot rows and on a BTCH parent; EMPTY on a batch child row (see §8.1). |
| RESPONSE_JSON | STRING | L | The response as sent. Filled on FUNC rows, batch parents and batch children; EMPTY on a single-shot QURY row (see §8.1). |
| EXEC_STATUS | CHAR(1) | L | S = dispatched, E = refused or failed. Note a refused call IS logged — the table records attempts, not just successes. |
| MESSAGE_ID | ARBGB | L | Message class — always ZFS_TRM_MSG for gateway messages. |
| MESSAGE_NO | MSGNR | L | The message number: 017 not registered, 026 executed successfully, 022 invalid JSON, 023 unknown field, 024 bad operator, 025 over the row ceiling, 035 already registered. |
| MESSAGE_TEXT | CHAR(220) | L | The resolved message text, capped at 220 characters. |
| ROW_COUNT | INT4 | L | Rows returned or affected, or steps run for a batch. 0 on a FUNC row even for a successful creating BAPI — BAPIs report no row count, so the created key lives in RESPONSE_JSON. |
| DURATION_MS | INT4 | L | Server-side time for this row's work. On a BTCH parent this is the whole batch; on a child it is that step alone. |
| EXECUTED_BY | SYUNAME | L | The user the call ran as — the effective authorisation ceiling for what it could do. |
| EXECUTED_AT | TIMESTAMPL | L | When, to the microsecond. |
| PARENT_UUID | SYSUUID_X16 | L | On a batch child row: the UUID of its BTCH parent. Not exposed over OData. |
| STEP_INDEX | INT4 | L | 0 on a single-shot call and on a batch parent; 1..n on batch children. Filter STEP_INDEX = 0 to count calls without double-counting batches. Not exposed over OData. |
| PHASE | CHAR(1) | L | X marks a batch child row. Not exposed over OData. |
| ZCREATED_BY | TB_CRUSER | both | Audit: who created the row. |
| ZCREATED_DATE | TB_DCRDAT | both | Audit: creation date. |
| ZCREATED_TIME | TB_TCRTIM | both | Audit: creation time. |
| ZCHANGED_BY | TB_UPUSER | both | Audit: who last changed the row. |
| ZCHANGED_DATE | TB_DUPDAT | both | Audit: last change date. |
| ZCHANGED_TIME | TB_TUPTIM | both | Audit: last change time. |
| LOCAL_CREATED_BY | ABP_CREATION_USER | both | RAP administrative field — managed by the framework. |
| LOCAL_CREATED_AT | ABP_CREATION_TSTMPL | both | RAP administrative field. |
| LOCAL_LAST_CHANGED_BY | ABP_LOCINST_LASTCHANGE_USER | both | RAP administrative field. |
| LOCAL_LAST_CHANGED_AT | ABP_LOCINST_LASTCHANGE_TSTMPL | both | RAP administrative field — the local ETag. |
| LAST_CHANGED_AT | ABP_LASTCHANGE_TSTMPL | both | RAP administrative field — the total ETag. |
| # | Check | If it fails |
| --- | --- | --- |
| 1 | A row exists for (ENTRY_TYPE='R', TARGET_KIND, TARGET_NAME) with IS_ACTIVE='X' | refused, message 017 |
| 2 | If the row pins an OPERATION, the call's operation matches it | refused, message 018 |
| 3 | The call's read/write need is covered by ALLOW_READ / ALLOW_WRITE | refused, message 018 |
| 4 | Otherwise permitted — MAX_ROWS and LOG_LEVEL travel on into the handler | — |
|  |  |
| --- | --- |
| Expected | 0 rows |
| Actual | SE16: "No table entries found for specified key" |
| Verdict | PASS |
|  |  |
| --- | --- |
| Expected | HTTP 200, ExecStatus='E', message 017 |
| Actual | HTTP 200 OK · ExecStatus=E · ResultCount=0 · DurationMs=722
MessageText: "Target BAPI_FTR_IRATE_DEALCREATE is not registered for the dynamic gateway"
GwUuid: 5254001f-e7a2-1fd1-abbc-5a2998cc6000 |
| Table effect | 0 rows → 1 row: one ENTRY_TYPE='L' row, TARGET_KIND='FUNC', EXEC_STATUS='E', MESSAGE_NO='017'. A refused call is still logged — the table is an audit of attempts, not of successes. |
| Verdict | PASS |
|  |  |
| --- | --- |
| Expected | ExecStatus='S', one registry row created |
| Actual | HTTP 200 · ExecStatus=S · ResultCount=1 · DurationMs=208
MessageText: "ExecuteBatch executed successfully, 1 row(s) affected"
RowsJson step 1: KIND=REGI, TARGETNAME=BAPI_FTR_IRATE_DEALCREATE, EXECSTATUS=S |
| Table effect | 1 row → 4 rows. One ExecuteBatch writes THREE rows:
  • the registry row itself — ENTRY_TYPE='R', TARGET_KIND='FUNC', IS_ACTIVE='X', ALLOW_WRITE='X'
  • a batch PARENT log row — ENTRY_TYPE='L', TARGET_KIND='BTCH', blank TARGET_NAME, STEP_INDEX=0
  • a batch CHILD log row — TARGET_KIND='REGI', STEP_INDEX=1, PHASE='X' |
| Verdict | PASS |
|  |  |
| --- | --- |
| Expected | ExecStatus='S', FINANCIALTRANSACTION = \INTERN\, no errors in RETURN |
| Actual | HTTP 200 · ExecStatus=S · DurationMs=637
ExportJson: {"COMPANYCODE":"1000","FINANCIALTRANSACTION":"\\INTERN\\"}
RETURN: W FTR_GUI 220 "Partner 700000453 cannot be used, as per contract 01.01.2026"
        I FTR0 162 "BAPI was executed successfully" |
| Note | FTR_GUI 220 is a WARNING — the partner's role validity starts later than the contract date. It does not block the create. |
| Table effect | One more ENTRY_TYPE='L' row. Nothing was created in FTR: CallFunctionModule never commits. |
| Verdict | PASS |
|  |  |
| --- | --- |
| Expected | ExecStatus='S' and a real transaction number in FINANCIALTRANSACTION |
| Actual | HTTP 200 · ExecStatus=S · ResultCount=1 · DurationMs=1359
step 1 FUNC BAPI_FTR_IRATE_DEALCREATE EXECSTATUS=S (856 ms)
EXPORTJSON: {"COMPANYCODE":"1000","FINANCIALTRANSACTION":"0000000160445"}
RETURN: W FTR_GUI 220 (partner warning) · I FTR0 162 "BAPI was executed successfully"
GwUuid: 5254001f-e7a2-1fd1-abbc-6e0e74294000 |
| Table effect | Two more rows — a BTCH parent (1359 ms) and its FUNC child (STEP_INDEX=1, PHASE='X', 856 ms). The deal number is recorded in the child row's RESPONSE_JSON; ROW_COUNT stays 0 because BAPIs report no row count. |
| Verdict | PASS — deal 0000000160445 |
|  |  |
| --- | --- |
| Expected | Both steps ExecStatus='S' |
| Actual | HTTP 200 · ExecStatus=S · ResultCount=2 · DurationMs=308
step 1 REGI VTBFHA INSERT → S, 1 row affected (2 ms)
step 2 QURY VTBFHA → S, 5 rows (43 ms) |
| Note | The 5 rows are the top of VTBFHA sorted by RFHA descending across all company codes, so they are company code 9990's deals — our deal is read explicitly in TC-06. |
| Table effect | Four more rows: the VTBFHA registry row, a BTCH parent, and two children (STEP_INDEX 1 and 2, both PHASE='X'). |
| Verdict | PASS |
|  |  |
| --- | --- |
| Expected | ExecStatus='S', exactly one row, our deal |
| Actual | HTTP 200 · ExecStatus=S · ResultCount=1 · DurationMs=22
RowsJson: [{"BUKRS":"1000","RFHA":"0000000160445","SGSART":"22A",
  "SFHAART":"100","KONTRH":"0700000453","WGSCHFT":"INR",
  "RCOMVALCL":1,"DBLFZ":"2026-01-01","DELFZ":"2026-12-31",
  "DCRDAT":"2026-09-11"}] |
| Verdict | PASS |
| Field | Value | Matches the test case? |
| --- | --- | --- |
| BUKRS | 1000 | yes — company code 1000 |
| RFHA | 0000000160445 | the new transaction |
| SGSART | 22A | yes — product type 22A |
| SFHAART | 100 | yes — transaction type 100 |
| KONTRH | 0700000453 | yes — partner 700000453, stored zero-padded |
| WGSCHFT | INR | yes |
| DBLFZ | 01.01.2026 | yes — start of term |
| DELFZ | 31.12.2026 | yes — end of term |
| RCOMVALCL | 1 | valuation class, mandatory on this system |
| DCRDAT | 11.09.2026 | created today |
| Field | Interest condition | Repayment condition | Meaning |
| --- | --- | --- | --- |
| RKOND | 1000 | 2000 | condition number |
| SKOART | 1200 | 1120 | condition type — interest / final repayment |
| PKOND | 10.0000000 | 100.0000000 | 10 % interest · 100 % of nominal repaid |
| SRHYTHM | 3 | 1 | 3 = MONTHLY · 1 = one-off |
| AMMRHY | 001 | 000 | every 1 period · not recurring |
| DGUEL_KP | 01.01.2026 | 01.01.2026 | effective from |
| DFAELL | 01.02.2026 | 31.12.2026 | first interest due one month after start · bullet at end |
| SZBMETH | 3 | 3 | interest calculation method |
| # | Type | Kind | Target | Step | Phase | St | Msg | ms | Written by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | L | FUNC | BAPI_FTR_IRATE_DEALCREATE | 0 |  | E | 017 | 722 | TC-01 refusal |
| 2 | R | FUNC | BAPI_FTR_IRATE_DEALCREATE | 0 |  |  |  | 0 | TC-02 registry row |
| 3 | L | BTCH | (blank) | 0 |  | S | 026 | 208 | TC-02 batch parent |
| 4 | L | REGI | BAPI_FTR_IRATE_DEALCREATE | 1 | X | S | 026 | 4 | TC-02 batch child |
| 5 | L | FUNC | BAPI_FTR_IRATE_DEALCREATE | 0 |  | S | 026 | 109 | dry run without X structures (failed in RETURN) |
| 6 | L | FUNC | BAPI_FTR_IRATE_DEALCREATE | 0 |  | S | 026 | 637 | TC-03 dry run, corrected |
| 7 | L | BTCH | (blank) | 0 |  | S | 026 | 1359 | TC-04 batch parent |
| 8 | L | FUNC | BAPI_FTR_IRATE_DEALCREATE | 1 | X | S | 026 | 856 | TC-04 — THE CREATE |
| 9 | R | QURY | VTBFHA | 0 |  |  |  | 0 | TC-05 registry row |
| 10 | L | BTCH | (blank) | 0 |  | S | 026 | 308 | TC-05 batch parent |
| 11 | L | REGI | VTBFHA | 1 | X | S | 026 | 2 | TC-05 child step 1 |
| 12 | L | QURY | VTBFHA | 2 | X | S | 026 | 43 | TC-05 child step 2 |
| 13 | L | QURY | VTBFHA | 0 |  | S | 026 | 22 | TC-06 read-back |
| Row shape | REQUEST_JSON | RESPONSE_JSON |
| --- | --- | --- |
| single-shot FUNC (STEP_INDEX=0) | full action payload | ExportJson + TablesJson |
| single-shot QURY (STEP_INDEX=0) | full action payload | EMPTY — the rows are not kept |
| batch parent (BTCH) | full payload incl. StepsJson | the per-step array |
| batch child (STEP_INDEX≥1, PHASE='X') | EMPTY | that step's own result |
| Symptom | Cause | Fix |
| --- | --- | --- |
| BAPI returns "Product type  not defined" for a product type you DID send (note the blank in the message) | BAPI_FTR_IRATE_DEALCREATE is a "complete create" BAPI — a value is ignored unless its X change-indicator flag is set | Send GENERALCONTRACTDATAX and INTERESTRATEINSTRUMENTX, mirroring each supplied field with "X". BAPI_FTR_IRATE_CREATE has no X structures and does not need them — do not copy one BAPI's payload to the other. |
| R1 201 "Business partner 700000453 does not exist" | The gateway applies NO conversion exits — values are bound straight onto DDIC fields | Send the INTERNAL, zero-padded form: "0700000453". Same for customers, vendors, G/L accounts, material numbers — anything with an ALPHA exit. |
| A NUMC field loses its leading zeros | It was sent as a JSON number | Send NUMC as a quoted string: "VALUATION_CLASS": "0001", never 1. |
| A CURR or DEC field is refused | It was sent as a quoted string | Send amounts and rates as unquoted numbers: 100000, not "100000". |
| The FM "returns nothing" | Its output-only TABLES parameter was not named, so it was never bound | Send it as an empty array: "TablesJson":"{\"RETURN\":[]}". |
| A creating BAPI reports S but nothing was created | CallFunctionModule never commits | Use ExecuteBatch with a CommitMode. |
| ExecStatus=S but the data is wrong | ExecStatus is the dispatch, not the business outcome | Parse RETURN; treat any E or A row as a failure. |
| Every call answers 017 on a newly imported system | Allow-list rows are delivery class A — they do not travel with the transport | Register the targets on that system; a single ExecuteBatch of REGI steps does the lot. |
| 022 "Invalid JSON in parameter …" and it will not say which level | Hand-escaping three levels of nested JSON | Build innermost-first and let the serialiser escape. Never hand-type level 3. |
| Contract date is after start of term | CONTRACT_DATE defaults to today, which is after a back-dated START_TERM | Set CONTRACT_DATE explicitly — here 2026-01-01. |
| 400 CX_SXML_PARSE_ERROR from the Gateway Client | The body pane defaults to XML | Add content-type = application/json to the HTTP Request header grid. |
| Target | Kind | Operation | Active | Read | Write | MaxRows | Descr |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BAPI_FTR_IRATE_DEALCREATE | FUNC | (any) | X | X | X | 0 | FTR term loan create - test case 2026-09-11 |
| VTBFHA | QURY | SELECT | X | X | — | 20 | FTR transaction header - verification read |