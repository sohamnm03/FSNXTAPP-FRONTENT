# Live test of `ZFS_SB_DYNGATEWAY_O4_API` — mock data, CDS reads, FTR + BP BAPIs

Run against **`DS4` client `100`** (`DS4_100_NIIF`) on **2026-09-10** as user `FS_DEV3`.
Every response below is the real output, pasted verbatim.
Contract reference: [`dynamic-gateway-api.md`](dynamic-gateway-api.md).
Activity record: [`worklog/DS4_100_NIIF/2026-09-10-dyngateway-live-bapi-test.md`](../worklog/DS4_100_NIIF/2026-09-10-dyngateway-live-bapi-test.md).

## What was proved

| # | Step | Action used | Result |
|---|---|---|---|
| 1 | Mock rows into `ZSGSLCTR_FEEDATA` | `ExecuteTableCrud` INSERT | 2 rows |
| 2 | Mock row into `ZSGSLCTR_DEALID` | `ExecuteTableCrud` INSERT | 1 row (`9000000001`) |
| 3 | Read `ZFS_CDS_SLC_001` / `ZFS_CDS_SLC_002` / `ZSGSLCTR_BPEXT` | `RunQuery` and `ExecuteBatch` | 2 / 1 / 20 rows |
| 4 | Term loan in FTR | `ExecuteBatch` → `BAPI_FTR_IRATE_CREATE` | **`1000 / 0000000160436`** |
| 5 | Business partner | `ExecuteBatch` → `BAPI_BUPA_CREATE_FROM_DATA` | **`0100000444`** |

Nothing was created in the ABAP repository. The persistent changes are application-table rows,
one FTR transaction, one business partner, and ten allow-list rows in `ZFS_T_SLC_DYNGW`.

---

## 0 · Client harness

PowerShell 5.1, basic auth, one CSRF token reused for the whole run
(`scripts` were kept in the session scratchpad; the shape is below).

```powershell
$Base = 'https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api' +
        '/srvd_a2x/sap/zfs_sd_dyngateway/0001'
$Ns   = 'com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001'
$Auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("FS_DEV3:<password>"))

# CSRF + cookie, once
$r = Invoke-WebRequest -Uri "$Base/`$metadata?sap-client=100" -Method Get `
       -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = 'Fetch' } `
       -SessionVariable sv -UseBasicParsing
$Token = $r.Headers['x-csrf-token']          # -> 24 chars, HTTP 200

# every action
Invoke-WebRequest -Uri "$Base/DynGateway/$Ns.<Action>?sap-client=100" -Method Post `
  -Body $payload -ContentType 'application/json' `
  -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = $Token } -WebSession $sv -UseBasicParsing
```

Send **all ten** body fields every time; leave the unused ones `""` / `0`.

> **Two client-side traps that cost real time here.**
> 1. **PowerShell 5.1 collapses a one-element array into an object.** `@($row) | ConvertTo-Json`
>    emits `{...}`, not `[{...}]`, and the gateway answers
>    `ExecStatus=E  "Invalid JSON in parameter ImportJson"`. Build arrays by hand:
>    `'[' + (($rows | % { $_ | ConvertTo-Json -Compress }) -join ',') + ']'`.
> 2. **An FM's output-only TABLES parameter must still be sent, as an empty array.** The gateway
>    binds only the parameters you name, so `RETURN` / `DATA` come back missing unless you pass
>    `"TablesJson":"{\"RETURN\":[]}"`. See §3 and L-314.

---

## 1 · Allow-list — nothing runs unless it is registered

Ten rows were added to `ZFS_T_SLC_DYNGW` by plain OData CRUD on the same entity set
(`POST /DynGateway?sap-client=100` + CSRF), all `HTTP 201`:

| Kind | Target | Operation | Read | Write | MaxRows | Why |
|---|---|---|---|---|---|---|
| QURY | `ZFS_CDS_SLC_002` | SELECT | X | | 20 | step 3 |
| QURY | `ZSGSLCTR_BPEXT` | SELECT | X | | 20 | step 3 |
| QURY | `ZSGSLCTR_FEEDATA` | SELECT | X | | 50 | read-back |
| QURY | `ZSGSLCTR_DEALID` | SELECT | X | | 50 | read-back |
| QURY | `VTBFHA` | SELECT | X | | 20 | verify the FTR deal |
| QURY | `VTBFHAPO` | SELECT | X | | 20 | verify the FTR deal |
| TABL | `ZSGSLCTR_FEEDATA` | INSERT | X | X | | step 1 |
| TABL | `ZSGSLCTR_DEALID` | INSERT | X | X | | step 2 |
| FUNC | `BAPI_FTR_IRATE_CREATE` | | X | X | | step 4 |
| FUNC | `BAPI_BUPA_CREATE_FROM_DATA` | | X | X | | step 5 |

`ZFS_CDS_SLC_001` was already registered from the earlier smoke test.

**These rows are still active.** Two of them (`BAPI_FTR_IRATE_CREATE`,
`BAPI_BUPA_CREATE_FROM_DATA`) let any caller of this service create financial transactions and
business partners. Clear `IsActive` with a `PATCH` to switch either off instantly — no transport
needed:

```
PATCH /DynGateway(<GwUuid>)?sap-client=100     CSRF + If-Match: *
{ "IsActive": "" }
```

---

## 2 · Step 1–2 — mock rows via `ExecuteTableCrud`

### 2.1 `ZSGSLCTR_FEEDATA`

`POST /DynGateway/<ns>.ExecuteTableCrud?sap-client=100`

```json
{ "TargetName":"ZSGSLCTR_FEEDATA", "Operation":"INSERT",
  "ImportJson":"[{\"ZTYPE\":\"01\",\"ZFEE_TYPE\":\"F11\",\"ZOTTK_NO\":\"100050\",\"ZDTTK_NO\":\"\",\"ZCAT\":\"01\",\"ZCODE\":\"01\",\"ZB_AMT\":100000,\"ZRATE\":10,\"ZDAY\":\"5\",\"ZAMT\":0,\"ZF_AMT\":138.89,\"ZCREATED_BY\":\"FS_DEV3\",\"ZCREATED_DATE\":\"2026-09-10\",\"ZCREATED_TIME\":\"03:45:00\"},
                {\"ZTYPE\":\"01\",\"ZFEE_TYPE\":\"F12\",\"ZOTTK_NO\":\"100050\",\"ZDTTK_NO\":\"\",\"ZCAT\":\"02\",\"ZCODE\":\"01\",\"ZB_AMT\":100000,\"ZRATE\":0,\"ZDAY\":\"\",\"ZAMT\":1000,\"ZF_AMT\":1000,\"ZCREATED_BY\":\"FS_DEV3\",\"ZCREATED_DATE\":\"2026-09-10\",\"ZCREATED_TIME\":\"03:45:00\"}]",
  "Operation":"INSERT", "MaxRows":0 }
```

```
ExecStatus=S  ResultCount=2  DurationMs=33
Msg : ZSGSLCTR_FEEDATA executed successfully, 2 row(s) affected
Uuid: 5254001f-e7a2-1fd1-ab97-0f7e0faf0000
```

Notes on typing, all confirmed on the wire:

- `DATS` accepts the **ISO** form `"2026-09-10"`, `TIMS` accepts `"03:45:00"`.
- `CURR` / `DEC` are **unquoted numbers** (`100000`, `138.89`) — quoting them fails (L-244).
- Key `ZOTTK_NO` `100050` was chosen because it exists in `ZFS_SLC_OTTK_BTP` and had no fee rows;
  a duplicate key would have come back as a partial write, not a clean failure (L-312).

### 2.2 `ZSGSLCTR_DEALID`

First attempt, with the row serialised by `ConvertTo-Json` on a 1-element array:

```
ExecStatus=E  ResultCount=0  DurationMs=3
Msg : Invalid JSON in parameter ImportJson
```

The payload was `{...}` where the gateway wants `[{...}]`. Rebuilt as a real array:

```
ExecStatus=S  ResultCount=1  DurationMs=37
Msg : ZSGSLCTR_DEALID executed successfully, 1 row(s) affected
Uuid: 5254001f-e7a2-1fd1-ab97-1371e9830000
```

Read back with `RunQuery`:

```json
[{"ZDEAL_ID":"9000000001","ZOTTK_NO":"100050","ZENT_ID":"E024","ZDEAL_AMT":100000.00,
  "ZCURR":"INR","ZDEAL_STAT":"01","ZSTR":"DSX","ZSBLC_BUKRS":"1000","ZACC_TYPE":"01",
  "ZDEAL_ID_DESC":"Gateway API live test 2026-09-10","ZCDATE":"2026-09-10","ZCREATED_BY":"FS_DEV3"}]
```

---

## 3 · Step 3 — reading the three sources

### 3.1 `ZFS_CDS_SLC_001` (OTTK details) — `RunQuery`, 269 ms, 2 rows

```json
[{"ZOTTK_NO":"100050","ZSTR":"DSX","ZENT_ID":"E024","ZTYPE":"01","ZOTTK_BANK":"0660000680",
  "BP_NAME":"STANDARD CHARTERED BANK SINGAPORE","ZOTTK_VALUE":1000000.00,"ZOTTK_CURR":"USD",
  "ZBUKRS":"SG03","BUTXT":"SG03 - OLAM GlobalAgri Pte. Ltd","ZDATE":"2026-09-08",
  "ZOTTK_ST":"01","ZSTAT_DESC":"01 - Create New"},
 {"ZOTTK_NO":"100049","ZSTR":"DSX","ZENT_ID":"E024","ZTYPE":"01","ZOTTK_BANK":"0660000680",
  "BP_NAME":"STANDARD CHARTERED BANK SINGAPORE","ZOTTK_VALUE":2000000.00,"ZOTTK_CURR":"USD",
  "ZBUKRS":"SG03","BUTXT":"SG03 - OLAM GlobalAgri Pte. Ltd","ZDATE":"2026-09-08",
  "ZOTTK_ST":"05","ZSTAT_DESC":"05 - Partially Assigned to Deal ID"}]
```

### 3.2 `ZFS_CDS_SLC_002` (DTTK details) — `RunQuery`, 805 ms, 1 row

```json
[{"ZDTTK_NO":"100043","ZSTR":"DSX","ZENT_ID":"E024","ZTYPE1":"02","ZTYPE2":"02",
  "ZOTTK_NO":"100049","ZOTTK_BANK":"0660000680","ZDTTK_VALUE":2000000.00,"ZDTTK_CURR":"USD",
  "ZBUKRS":"SG03","ZDATE":"2026-09-08","ZDTTK_ST":"05",
  "ZSTAT_DESC":"05 - Partially Assigned to Deal ID"}]
```

### 3.3 `ZSGSLCTR_BPEXT` (SLC bank master) — `RunQuery`, 29 ms, 20 rows (`MaxRows` ceiling)

First rows:

```json
[{"ZBP":"0000000003","ZOTTKTRADER":"T28","ZDTTKTRADER":"T28","ZBP_NAME":"BARCLAYS BANK PLC",
  "ZSHORT_NAME":"BARCLAYS BANK PLC","ZBANKCOUNTRY":"SEA","ZBA_CODE":"0615","ZOTBANK":"X","ZDTBANK":"X"},
 {"ZBP":"0660000680","ZOTTKTRADER":"C14","ZDTTKTRADER":"C14",
  "ZBP_NAME":"STANDARD CHARTERED BANK SINGAPORE","ZSHORT_NAME":"STANDARD CHARTERED BANK",
  "ZBANKCOUNTRY":"Singapore","ZBA_CODE":"0803","ZOTBANK":"X","ZDTBANK":"X"}]
```

### 3.4 All three in one `ExecuteBatch` — 983 ms

```json
"StepsJson": "[{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"FieldsJson\":\"[...]\",\"MaxRows\":5},
               {\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_002\",\"FieldsJson\":\"[...]\",\"MaxRows\":5},
               {\"Kind\":\"QURY\",\"TargetName\":\"ZSGSLCTR_BPEXT\",\"FieldsJson\":\"[...]\",\"MaxRows\":5}]"
"CommitMode": "NEVER"
```

```
overall=S  steps=3  ms=983
step 1  QURY  ZFS_CDS_SLC_001  status=S  rows=2
step 2  QURY  ZFS_CDS_SLC_002  status=S  rows=1
step 3  QURY  ZSGSLCTR_BPEXT   status=S  rows=5
```

---

## 4 · Step 4 — term loan via `BAPI_FTR_IRATE_CREATE`

### 4.1 Customizing checked first

Read through the gateway itself, with `RFC_READ_TABLE`:

| Check | Result |
|---|---|
| `T001` company code `1000` | `Template`, country `IN`, currency `INR` — exists |
| `TZPAT` product type `22A` | `TL - Disbursements` — exists |
| `BUT000` partner `0700000453` | `TATA FIN PVT.LTD`, category `2`, group `7000` — exists |
| `TZPAB` `22A` | **no company-code assignment anywhere**; `1000` has only `22B` and `26D` |
| `VTBFHA` | **empty** — no financial transaction had ever been created on this system |

The last two looked fatal but were not: `TZPAB` holds company-code *overrides*, not the
permission, and `22A/100` was accepted for company code `1000` by the BAPI itself.

### 4.2 First attempt — exactly the requested payload, `TESTRUN = 'X'`

```json
{ "TargetName":"BAPI_FTR_IRATE_CREATE",
  "ImportJson":"{\"GENERALCONTRACTDATA\":{\"COMPANY_CODE\":\"1000\",\"PRODUCT_TYPE\":\"22A\",\"TRANSACTION_TYPE\":\"100\",\"PARTNER\":\"0700000453\",\"CONTRACT_DATE\":\"2026-09-10\"},\"INTERESTRATEINSTRUMENT\":{\"CURRENCY\":\"INR\",\"START_TERM\":\"2026-01-01\",\"END_TERM\":\"2026-12-31\",\"NOMINAL_AMOUNT\":100000,\"INTEREST_RATE\":10},\"TESTRUN\":\"X\"}",
  "TablesJson":"{\"RETURN\":[]}" }
```

`ExecStatus=S` (the *call* succeeded) but `RETURN` carried the BAPI's own errors:

```
E FTR0-161     BAPI processing was terminated
E T4-161       Contract date is after start of term          (10.09.2026 vs 01.01.2026)
E T4-161       Contract date is after start of term
E FTR_GUI-141  Fill the following required field: VTBFHA-RCOMVALCL
E FTR_TRD-31   Transaction 1000 \INTERN\4998 not assigned to any 'Gen. valuation class'
```

Two genuine gaps in the requested payload:

1. `CONTRACT_DATE` defaulted to today (10.09.2026), which is **after** the 01.01.2026 start of
   term. FTR refuses that.
2. `VALUATION_CLASS` (`VTBFHA-RCOMVALCL`) is **mandatory** on this system and the request did not
   carry one. Valid values come from `TRGC_COM_VALCL`: `0001`–`0006`, `0011`, `0090`, `0091`.

### 4.3 Second attempt — both gaps closed, still `TESTRUN = 'X'`

`CONTRACT_DATE = 2026-01-01`, `VALUATION_CLASS = 0001`:

```
ExecStatus=S  Export={"FINANCIALTRANSACTION":"\\INTERN\\","COMPANYCODE":"1000"}
W FTR_GUI-220  Partner 700000453 cannot be used, as per contract 01.01.2026
I FTR0-162     BAPI was executed successfully
```

`0011` behaves identically. The remaining `FTR_GUI-220` is a **warning** — the partner's role
validity starts later than the contract date — and does not block the create.

### 4.4 The real create — `ExecuteBatch`, `CommitMode = AUTO`

A single-shot `CallFunctionModule` would have run the BAPI and then **thrown the work away**:
nothing issues `BAPI_TRANSACTION_COMMIT`. Use a batch, which shares one `DESTINATION 'NONE'`
session and commits when every `FUNC` step succeeded.

```json
{ "StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_FTR_IRATE_CREATE\",\"ImportJson\":\"{...TESTRUN:\\\"\\\"...}\",\"TablesJson\":\"{\\\"RETURN\\\":[]}\"}]",
  "CommitMode":"AUTO" }
```

```
overall=S  steps=1  ms=1423  uuid=5254001f-e7a2-1fd1-ab97-2627f280c000

step 1  FUNC  BAPI_FTR_IRATE_CREATE  status=S
  EXPORT: {"FINANCIALTRANSACTION":"0000000160436","COMPANYCODE":"1000"}
  W FTR_GUI-220  Partner 700000453 cannot be used, as per contract 01.01.2026
  I FTR0-162     BAPI was executed successfully
```

### 4.5 Verified on the database

`RunQuery` on `VTBFHA`:

```json
[{"BUKRS":"1000","RFHA":"0000000160436","SGSART":"22A","SFHAART":"100",
  "KONTRH":"0700000453","WGSCHFT":"INR","RCOMVALCL":1,
  "DCRDAT":"2026-09-10","DBLFZ":"2026-01-01","DELFZ":"2026-12-31"}]
```

Company code 1000 · transaction **0000000160436** · product type 22A · transaction type 100 ·
partner 0700000453 · INR · term 01.01.2026 → 31.12.2026. Exactly the requested deal, plus the
valuation class the system insisted on.

**Final payload that works** (keep this as the template):

```json
{
  "GENERALCONTRACTDATA": {
    "COMPANY_CODE": "1000", "PRODUCT_TYPE": "22A", "TRANSACTION_TYPE": "100",
    "PARTNER": "0700000453", "CONTRACT_DATE": "2026-01-01", "VALUATION_CLASS": "0001"
  },
  "INTERESTRATEINSTRUMENT": {
    "CURRENCY": "INR", "START_TERM": "2026-01-01", "END_TERM": "2026-12-31",
    "NOMINAL_AMOUNT": 100000, "INTEREST_RATE": 10
  },
  "TESTRUN": ""
}
```

---

## 5 · Step 5 — business partner via `BAPI_BUPA_CREATE_FROM_DATA`

Grouping `0001` was chosen because `TB001` marks it `XINST = 'X'` — internal numbering, so no
external number has to be invented.

```json
{ "PARTNERCATEGORY":"2", "PARTNERGROUP":"0001",
  "CENTRALDATA":{"SEARCHTERM1":"GWTEST","PARTNERLANGUAGE":"E"},
  "CENTRALDATAORGANIZATION":{"NAME1":"Gateway API Test Bank",
                             "NAME2":"Created by ZFS_SB_DYNGATEWAY_O4_API"},
  "ADDRESSDATA":{"STREET":"Nariman Point","CITY":"Mumbai","POSTL_COD1":"400021",
                 "COUNTRY":"IN","REGION":"13","LANGU":"E"} }
```

sent as one `ExecuteBatch` `FUNC` step with `CommitMode = AUTO` and `TablesJson`
`{"RETURN":[]}`:

```
overall=S  steps=1  ms=538  uuid=5254001f-e7a2-1fd1-ab97-3c6a9ea20000

step 1  FUNC  BAPI_BUPA_CREATE_FROM_DATA  status=S
  EXPORT: {"BUSINESSPARTNER":"0100000444"}
  W R11-336  This language may be maintained only for persons
```

`R11-336` is a warning caused by `CENTRALDATA-PARTNERLANGUAGE` on an *organisation*; drop that
field for organisations and it goes away.

Verified:

```
BUT000  0100000444 | 2 | 0001 | Gateway API Test Bank | Created by ZFS_SB_DYNGATEWAY_O4_API
        | GWTEST | 20260910 | FS_DEV3
BUT020  0100000444 | address 0000003545
```

---

## 6 · Everything read back in one call

`ExecuteBatch`, 4 steps, `CommitMode = NEVER`, **85 ms**:

```
step 1  QURY  ZSGSLCTR_FEEDATA  status=S  rows=2
  [{"ZTYPE":"01","ZFEE_TYPE":"F12","ZOTTK_NO":"100050","ZB_AMT":100000.00,"ZRATE":0,"ZDAY":"",
    "ZAMT":1000.00,"ZF_AMT":1000.00,"ZCREATED_BY":"FS_DEV3","ZCREATED_DATE":"2026-09-10"},
   {"ZTYPE":"01","ZFEE_TYPE":"F11","ZOTTK_NO":"100050","ZB_AMT":100000.00,"ZRATE":10.0000000,
    "ZDAY":"5","ZAMT":0,"ZF_AMT":138.89,"ZCREATED_BY":"FS_DEV3","ZCREATED_DATE":"2026-09-10"}]

step 2  QURY  ZSGSLCTR_DEALID   status=S  rows=1
  [{"ZDEAL_ID":"9000000001","ZOTTK_NO":"100050","ZENT_ID":"E024","ZDEAL_AMT":100000.00,
    "ZCURR":"INR","ZDEAL_STAT":"01","ZSTR":"DSX",
    "ZDEAL_ID_DESC":"Gateway API live test 2026-09-10","ZCDATE":"2026-09-10"}]

step 3  QURY  VTBFHA            status=S  rows=1
  [{"BUKRS":"1000","RFHA":"0000000160436","SGSART":"22A","SFHAART":"100","KONTRH":"0700000453",
    "WGSCHFT":"INR","RCOMVALCL":1,"DCRDAT":"2026-09-10","DBLFZ":"2026-01-01","DELFZ":"2026-12-31"}]

step 4  FUNC  RFC_READ_TABLE    status=S
  DATA: [{"WA":"0100000444|0001|Gateway API Test Bank                   |20260910"}]
```

---

## 7 · Gateway behaviour worth knowing before the next consumer writes code

| # | Behaviour | Consequence |
|---|---|---|
| 1 | Only the parameters you send are bound — including **output-only** `TABLES` | Send `{"RETURN":[]}` / `{"DATA":[]}` or the messages and rows silently never arrive (L-314) |
| 2 | `RunQuery` field validation does **not** flatten DDIC `.INCLUDE`s | `VTBFHA-DVTRAB`, `VTBFHAPO-WBBETR` etc. are refused as *"Field X is not a component"* although Open SQL accepts them. Only fields declared directly on the table pass (L-316) |
| 3 | The all-columns default projection breaks on those same tables | `VTBFHA` → *"Table or view VTBFHA does not exist"*; `VTBFHAPO` → *"The database column 'TAB' is unknown"*. Always send an explicit `FieldsJson` for SAP-standard tables (L-316) |
| 4 | `RFC_READ_TABLE` refuses `VTBFHA` / `VTBFHAPO` with *"does not contain data"* | Use a registered `QURY` target for those, not the FM |
| 5 | A single-shot `CallFunctionModule` never commits | Any creating BAPI must go through `ExecuteBatch` with `CommitMode` `AUTO` or `ALWAYS` (L-317) |
| 6 | A BAPI that fails in `RETURN` is still `ExecStatus=S` | `ExecStatus` reports the *dispatch*, not the business outcome. Always parse `RETURN` (L-317) |
| 7 | `MaxRows` is capped by the registered ceiling | `ZSGSLCTR_BPEXT` returned exactly 20 of its rows |

## 8 · Left on the system

| Object / row | Value | Reversible by |
|---|---|---|
| Fee rows | `ZSGSLCTR_FEEDATA` `01/F11/100050`, `01/F12/100050` | `ExecuteTableCrud` `DELETE` (needs the registry `Operation` widened) |
| Deal row | `ZSGSLCTR_DEALID` `9000000001` | same |
| FTR transaction | `1000 / 0000000160436` | TM02 / FTR_EDIT reversal — **not** deletable from the gateway |
| Business partner | `0100000444` | BP central block / archiving flag |
| Allow-list | 10 rows in `ZFS_T_SLC_DYNGW` | `PATCH … {"IsActive":""}` or `DELETE /DynGateway(<GwUuid>)` |
