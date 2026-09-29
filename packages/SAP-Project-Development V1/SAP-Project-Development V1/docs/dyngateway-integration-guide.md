# Dynamic OData Gateway — integration guide

How to call `ZFS_SB_DYNGATEWAY_O4_API` from any client, on any system, with a runnable acceptance
suite to prove it works before you depend on it.

**One endpoint, four actions, five step kinds (`FUNC` · `TABL` · `QURY` · `SUBM` · `REGI`).** It lets an external caller read a table or CDS
view, write a table, call a function module, or run an executable report — but only against targets
an administrator has explicitly allow-listed.

| Document | For |
|---|---|
| **this file** | consumers and whoever installs it on a new system |
| [`dynamic-gateway-api.md`](dynamic-gateway-api.md) | the field-by-field contract reference |
| [`dyngateway-live-test-2026-09-10-1520.md`](dyngateway-live-test-2026-09-10-1520.md) | worked FTR + BP examples with real output |
| [`dyngateway-submit-2026-09-10-1520.md`](dyngateway-submit-2026-09-10-1520.md) | worked report-submit examples |

---

## 1 · Before it will work on a system

Run through this once per system. Steps 1–3 travel in a transport; **step 4 does not.**

| # | Requirement | How to check |
|---|---|---|
| 1 | The gateway objects are imported — `ZFS_T_SLC_DYNGW`, `ZFS_I_DynGateway`, `ZFS_C_DynGatewayTP`, both BDEFs, the two abstract entities, `ZFS_SD_DYNGATEWAY`, `ZFS_SB_DYNGATEWAY_O4_API`, `ZBP_FS_DYNGATEWAYTP`, the seven `ZCL_FS_SLC_GW_*` classes, `ZFS_FG_DYNGW_SUBMIT` + `ZFS_RFC_DYNGW_SUBMIT` | `GET /$metadata` returns 200 |
| 2 | Messages **017–032** exist in `ZFS_TRM_MSG` | `SE91`, or `SELECT FROM t100 WHERE arbgb = 'ZFS_TRM_MSG'` |
| 3 | `ZFS_RFC_DYNGW_SUBMIT` is **remote-enabled** — only needed if you use `SUBM` | `SELECT fmode FROM tfdir WHERE funcname = 'ZFS_RFC_DYNGW_SUBMIT'` must return `R` |
| 4 | **The allow-list has rows** | `GET /DynGateway?$filter=EntryType eq 'R'` returns more than zero |
| 5 | The service binding is **published** | see §10 |
| 6 | The service user has the authorisations you expect callers to get | see §11 |

> ### The allow-list does not travel with the transport
>
> `ZFS_T_SLC_DYNGW` is `deliveryClass #A` — an application table. Its rows are **data, not
> repository content**, so importing the transport gives you an empty allow-list and *every* call
> will answer `017 "Target … is not registered"` until you register targets on that system.
>
> This is deliberate: what a QA box may reach is not what a production box may reach. Plan on
> registering per system, and treat the row set as configuration you maintain, not something you
> inherit.

---

## 2 · The URL

### The base

```
https://<host>:<port>/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001
```

| Segment | Value | Changes per system? |
|---|---|---|
| `<host>:<port>` | e.g. `vhnlqds4ap01.sap.niififl.in:44300` | **yes** |
| `sap/opu/odata4/sap` | fixed | no |
| `zfs_sb_dyngateway_o4_api` | the service binding | no |
| **`srvd_a2x`** | repository segment | no |
| `zfs_sd_dyngateway` | the service definition | no |
| `0001` | service version | no |
| `?sap-client=<nnn>` | **required on every single call** | **yes** |

Everything below is relative to that base, written `<base>`. `<ns>` is the action namespace
`com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001`. Every row was exercised live on `DS4/100`; the
HTTP codes are what the system actually returned, including the failures. These results were
captured in the 2026-09-10 Claude session; the resumed review checked that evidence without
rerunning SAP requests. Error codes describe those tested requests and deployment settings.

### 2.1 · Discovery — use these to prove the service is reachable

| Method | URL | Returns |
|---|---|---|
| `GET` | `<base>/?sap-client=<nnn>` | **200** — the service document, listing `DynGateway`. The cheapest liveness check; the trailing slash is optional |
| `GET` | `<base>/$metadata?sap-client=<nnn>` | **200** — the EDMX. Also where you fetch the CSRF token (§3) |

### 2.2 · The four actions — all the real work

Only the last segment differs. All four are `POST`, all four take the same ten-field body (§4).

```
POST  <base>/DynGateway/<ns>.RunQuery?sap-client=<nnn>
POST  <base>/DynGateway/<ns>.ExecuteTableCrud?sap-client=<nnn>
POST  <base>/DynGateway/<ns>.CallFunctionModule?sap-client=<nnn>
POST  <base>/DynGateway/<ns>.ExecuteBatch?sap-client=<nnn>
```

For the current **DS4_100_NIIF, client 100** deployment, the fully expanded action URLs are:

```text
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteTableCrud?sap-client=100
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.CallFunctionModule?sap-client=100
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.ExecuteBatch?sap-client=100
```

Use the host, port and client for your destination when moving to another system. `SUBM` uses
`ExecuteBatch` with a `Kind: "SUBM"` step; it has no separate action URL. FM names, table names,
CDS names and report names go in the JSON body, not in the URL.

> **The actions are bound to the collection, not to an instance.** `$metadata` declares all four as
> `IsBound="true"` against `Collection(…DynGatewayType)`. So the URL has **no key** between the
> entity set and the action name. Appending a key —
> `POST <base>/DynGateway(<GwUuid>)/<ns>.RunQuery` — returns a bare **404**, which looks like a
> missing service rather than a wrong URL shape.

### 2.3 · Reading the allow-list and the call log

Plain OData CRUD on the same entity set. `EntryType` separates the two kinds of row:
`'R'` = a registered target, `'L'` = a call-log entry.

| Method | URL | Notes |
|---|---|---|
| `GET` | `<base>/DynGateway?sap-client=<nnn>&$filter=EntryType eq 'R'` | the allow-list |
| `GET` | `<base>/DynGateway?sap-client=<nnn>&$filter=EntryType eq 'R' and IsActive eq 'X'` | only what is callable right now |
| `GET` | `<base>/DynGateway?sap-client=<nnn>&$filter=TargetKind eq 'SUBM'` | one kind |
| `GET` | `<base>/DynGateway?sap-client=<nnn>&$filter=EntryType eq 'L'&$orderby=CreatedAt desc` | recent calls |
| `GET` | `<base>/DynGateway(<GwUuid>)?sap-client=<nnn>` | one row — read a past call back |
| `POST` | `<base>/DynGateway?sap-client=<nnn>` | register a target (§10) — **+ CSRF** |
| `PATCH` | `<base>/DynGateway(<GwUuid>)?sap-client=<nnn>` | e.g. the `IsActive` kill switch — **+ CSRF + `If-Match: *`** |
| `DELETE` | `<base>/DynGateway(<GwUuid>)?sap-client=<nnn>` | **+ CSRF + `If-Match: *`** |

Both OData key forms work: `DynGateway(5254001f-…)` and the explicit
`DynGateway(GwUuid=5254001f-…)`. Neither needs quotes around the UUID.

Replace `<GwUuid>` with a complete UUID returned by the service; the ellipsis above is abbreviated
for readability. The query examples show readable spaces: encode query parameter values when
building a request (for example, `EntryType%20eq%20%27R%27`). Keep `?` before the first parameter
and `&` before each subsequent parameter. In PowerShell double-quoted strings, escape the literal
`$` in OData options with a backtick, as the `$metadata` example in §8 does.

### 2.4 · Query options that work on `GET`

Standard OData V4, all confirmed **200** against this service:

| Option | Example | Note |
|---|---|---|
| `$select` | `&$select=GwUuid,TargetName,TargetKind,IsActive` | worth using — the entity is wide |
| `$filter` | `&$filter=EntryType eq 'R'` | `and`/`or`, `eq`/`ne`, string literals in single quotes |
| `$orderby` | `&$orderby=TargetName`, `… desc` | |
| `$top` / `$skip` | `&$top=20&$skip=40` | paging |
| `$count=true` | `&$count=true` | adds `@odata.count` alongside the rows |
| `/$count` | `<base>/DynGateway/$count?sap-client=<nnn>` | returns a bare integer, e.g. `197` |
| property | `<base>/DynGateway(<GwUuid>)/TargetName?sap-client=<nnn>` | a single property as JSON |

**Not** available: `/$value` on a property returns **501 Not Implemented** — read the property as
JSON instead. There are no navigation properties to `$expand`, and no `$search`.

### 2.5 · `$batch` is not the gateway's batch

The names collide, and they are unrelated:

| | What it is | Use it? |
|---|---|---|
| `POST <base>/$batch?sap-client=<nnn>` | the standard OData V4 transport for bundling HTTP requests | The tested JSON batch returned **415**, and the tested multipart/mixed request returned **400**. A working standard batch request was not established; those failures alone do not prove all multipart batches are unsupported |
| `POST <base>/DynGateway/<ns>.ExecuteBatch?sap-client=<nnn>` | the gateway's own multi-step action | **Use this** for the documented multi-step workflow and for `SUBM` (§9) |

### 2.6 · Four ways to get the URL wrong

Each fails as something other than what it is — which is why they are worth memorising:

| Mistake | You get | Looks like |
|---|---|---|
| `srvd` instead of `srvd_a2x` | **403** | an authorisation problem |
| `sap-client` omitted | **401** | a wrong password |
| a key before the action name | **404** | the service is not there |
| `dyngateway` for `DynGateway` | **404** | the service is not there |

The entity set, the action names and the namespace are all **case-sensitive**. `sap-client` is
required on `$metadata` and the CSRF fetch too — every URL, no exceptions.

---

## 3 · Auth and CSRF

Basic auth. Every `POST`/`PATCH`/`DELETE` needs a CSRF token **and** the session cookie from the
same conversation — the token alone is not enough. Fetch once, reuse for the whole session.

```
GET <base>/$metadata?sap-client=<nnn>
    Authorization: Basic <base64 user:password>
    X-CSRF-Token: Fetch
→  200, response header  x-csrf-token: <token>   + Set-Cookie
```

Plain `GET`s need no token. Never hard-code credentials in a script that gets committed.

---

## 4 · The request body

**Every action takes the same ten fields. Send all of them**, leaving unused ones `""` or `0`.

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"",
  "FieldsJson":"", "FilterJson":"", "OrderByJson":"", "MaxRows":0,
  "StepsJson":"", "CommitMode":"" }
```

| Field | Used by | Meaning |
|---|---|---|
| `TargetName` | all single-shot | FM / table / view / program name |
| `Operation` | `ExecuteTableCrud` | `INSERT` \| `MODIFY` \| `DELETE` |
| | `SUBM` step | capture mode `SALV` \| `LIST` \| `MEMO` \| `NONE` |
| `ImportJson` | `CallFunctionModule` | `{"PARAM":value,…}` — the FM's IMPORTING/CHANGING |
| | `ExecuteTableCrud` | `[{row},{row}]` — the rows to write |
| | `SUBM` step | `{"Variant":"…","MemoryId":"…"}` |
| `TablesJson` | `CallFunctionModule` | `{"TAB":[{row},…]}` — TABLES parameters |
| `FieldsJson` | `RunQuery` | `["COL_A","COL_B"]` |
| `FilterJson` | `RunQuery` | `[{"Field":"…","Op":"…","Low":"…","High":"…"}]` |
| | `SUBM` step | the selection table (adds `Kind`, `Sign`) |
| `OrderByJson` | `RunQuery` | `[{"Field":"…","Descending":true}]` |
| `MaxRows` | `RunQuery`, `SUBM` | row cap, ceilinged by the registry. **Registry `MaxRows=0` = no ceiling** (L-356) |
| `StepsJson` | `ExecuteBatch` | ordered array of steps |
| `CommitMode` | `ExecuteBatch` | `AUTO` (default) \| `ALWAYS` \| `NEVER` |

## 5 · The response

```json
{ "GwUuid":"…", "ExecStatus":"S", "MessageText":"…",
  "ExportJson":"…", "TablesJson":"…", "RowsJson":"…",
  "ResultCount":0, "DurationMs":0 }
```

| Field | Meaning |
|---|---|
| `ExecStatus` | `S` dispatched · `E` refused or failed |
| `MessageText` | the reason, from `ZFS_TRM_MSG`, max 220 chars |
| `RowsJson` | `RunQuery` → rows · `ExecuteBatch` → the per-step array |
| `ExportJson` | `CallFunctionModule` → EXPORTING params · `SUBM` → the run envelope |
| `TablesJson` | `CallFunctionModule` → TABLES after the call |
| `ResultCount` | rows returned / rows affected / steps run |
| `DurationMs` | server-side time |
| `GwUuid` | key of the call-log row — `GET /DynGateway(<GwUuid>)` reads the full request and response back later |

> **`ExecStatus` reports the dispatch, not the business outcome.** A BAPI that failed still comes
> back `S` with its errors in `RETURN`. A refusal is **HTTP 200** with `ExecStatus='E'` — not an
> HTTP error. Check the field, not the status code.

Per-step keys inside a batch's `RowsJson` are **upper case**: `STEP`, `KIND`, `TARGETNAME`,
`OPERATION`, `EXECSTATUS`, `MESSAGENO`, `MESSAGETEXT`, `EXPORTJSON`, `TABLESJSON`, `ROWSJSON`,
`RESULTCOUNT`, `DURATIONMS`. `EXECSTATUS = 'P'` means *planned but never executed* — the batch was
rejected in validation.

---

## 6 · The JSON you pass — nesting and escaping

This is the part that costs people the most time, so it is worth being precise about.

**The `*Json` fields are declared as ABAP `string`.** The action payload is JSON, and those fields
carry *more JSON inside a string value*. So a plain read is **two levels** deep, and a batch step is
**three**, because `StepsJson` is a string containing steps whose own `ImportJson` is again a string.

Count the levels and the escaping follows mechanically:

| Level | What it is | Quotes look like |
|---|---|---|
| 1 | the action payload | `"…"` |
| 2 | inside `ImportJson` / `FilterJson` / `StepsJson` | `\"…\"` |
| 3 | inside a batch step's own `ImportJson` | `\\\"…\\\"` |

**Level 2 — a single-shot call.** The inner object's quotes get one backslash:

```json
{ "TargetName":"ZSGSLCTR_FEEDATA", "Operation":"INSERT",
  "ImportJson":"[{\"ZOTTK_NO\":\"100050\",\"ZB_AMT\":100000}]" }
```

The value of `ImportJson` is the 44-character *text* `[{"ZOTTK_NO":"100050","ZB_AMT":100000}]`.

**Level 3 — a batch step.** `StepsJson` is a string (level 2) holding a step whose `ImportJson` is
itself a string (level 3):

```json
{ "CommitMode":"AUTO",
  "StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_BUPA_CREATE_FROM_DATA\",\"ImportJson\":\"{\\\"PARTNERCATEGORY\\\":\\\"2\\\"}\",\"TablesJson\":\"{\\\"RETURN\\\":[]}\"}]" }
```

> **Do not hand-type level 3.** Build the innermost object, serialise it to a string, put that
> string into the step object, serialise *that*, and assign the result to `StepsJson`. Let the
> serialiser add the backslashes — three levels of hand-escaping is where the mistakes live, and the
> gateway can only answer `022 "Invalid JSON in parameter …"`, which does not tell you which level
> broke.

```powershell
# Level 3 built correctly - nothing hand-escaped
$inner = @{ PARTNERCATEGORY = '2'; PARTNERGROUP = '0001' } | ConvertTo-Json -Compress
$step  = [ordered]@{ Kind = 'FUNC'; TargetName = 'BAPI_BUPA_CREATE_FROM_DATA'
                     ImportJson = $inner; TablesJson = '{"RETURN":[]}' }
$body  = @{ StepsJson = ConvertTo-JsonArray @($step); CommitMode = 'AUTO' }
Invoke-Gw -Action ExecuteBatch -Body $body
```

```python
import json
inner = json.dumps({"PARTNERCATEGORY": "2", "PARTNERGROUP": "0001"})
step  = {"Kind": "FUNC", "TargetName": "BAPI_BUPA_CREATE_FROM_DATA",
         "ImportJson": inner, "TablesJson": json.dumps({"RETURN": []})}
body  = {**BLANK, "StepsJson": json.dumps([step]), "CommitMode": "AUTO"}
```

**Reading a response is the same in reverse** — `RowsJson`, `ExportJson` and `TablesJson` come back
as strings and need a second parse:

```powershell
$r    = Invoke-Gw -Action RunQuery -Body @{ TargetName = 'T000'; MaxRows = 3 }
$rows = $r.RowsJson | ConvertFrom-Json      # second parse
```

### How ABAP types appear in JSON

Serialisation is `/ui2/cl_json`, so field names are the DDIC names in **upper case** and values map
like this:

| ABAP type | JSON | Example |
|---|---|---|
| `CHAR`, `STRING`, `NUMC`, `LANG` | string | `"SG03"`, `"0001"` |
| `DATS` | string, ISO | `"2026-09-10"` — **not** `"20260910"` |
| `TIMS` | string, ISO | `"03:45:00"` |
| `CURR`, `DEC`, `QUAN`, `FLTP` | **number, unquoted** | `100000`, `10.5` |
| `INT1/2/4/8` | number | `42` |
| `abap_bool` (`CHAR1`) | string | `"X"` or `""` — never `true` |
| `TIMESTAMP`, `TIMESTAMPL` | number | `20260910034500` |
| `RAW`, `RAWSTRING` | hex string | `"4A4B"` |
| nested structure | object | `"CENTRALDATA":{"NAME1":"Acme"}` |
| internal table | array | `"RETURN":[]` |

A `NUMC` sent as a number loses its leading zeros; a `CURR` sent as a string is refused. Those two
are the common type mistakes.

## 7 · Formats — the seven things clients get wrong

1. **The `*Json` fields are strings containing JSON.** Their inner quotes are escaped. Build them
   with your language's serialiser; do not hand-assemble them.
2. **Numbers are unquoted.** `CURR`, `DEC`, `INT` and `MaxRows` must be JSON numbers —
   `"MaxRows":10` and `"ZB_AMT":100000`, never `"10"` or `"100000"`.
3. **Row payloads are arrays**, even for one row: `[{…}]`. In PowerShell 5.1
   `ConvertTo-Json` collapses a one-element array into an object and the gateway answers
   `Invalid JSON in parameter ImportJson` — build arrays by hand (§8).
4. **Dates and times are ISO.** `DATS` → `"2026-09-10"`, `TIMS` → `"03:45:00"`.
5. **An FM's output-only `TABLES` parameter must still be sent, as an empty array.** Only
   parameters you name are bound, so `RETURN` or `DATA` come back missing unless you pass
   `"TablesJson":"{\"RETURN\":[]}"`. This is the single most common cause of "the FM returned
   nothing".
6. **Always send `FieldsJson` for an SAP-standard table.** Field validation does not flatten DDIC
   `.INCLUDE`s, so a column that lives in an include is refused with `023` even though Open SQL
   would accept it; and the all-columns default fails outright on such tables.
7. **A creating BAPI needs `ExecuteBatch` with a `CommitMode`.** `CallFunctionModule` never
   commits — it runs the FM and the work is discarded.

Filter operators: `EQ NE GT GE LT LE BT LIKE IN`. `BT` uses `Low`+`High`; `IN` takes a
comma-separated list in `Low`; `LIKE` takes SQL wildcards. Anything else → `024`.

---

## 8 · A reusable client

### PowerShell (Windows PowerShell 5.1)

```powershell
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Host_  = 'https://<host>:<port>'
$Client = '<nnn>'
$Base   = "$Host_/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001"
$Ns     = 'com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001'
$Auth   = 'Basic ' + [Convert]::ToBase64String(
            [Text.Encoding]::ASCII.GetBytes("$env:GW_USER`:$env:GW_PASS"))

# CSRF + cookie, once per session
$r = Invoke-WebRequest -Uri "$Base/`$metadata?sap-client=$Client" -Method Get `
       -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = 'Fetch' } `
       -SessionVariable sv -UseBasicParsing
$Token = $r.Headers['x-csrf-token']

function New-GwBody { param([hashtable]$Over = @{})
  $b = [ordered]@{ TargetName=''; Operation=''; ImportJson=''; TablesJson='';
                   FieldsJson=''; FilterJson=''; OrderByJson=''; MaxRows=0;
                   StepsJson=''; CommitMode='' }
  foreach ($k in $Over.Keys) { $b[$k] = $Over[$k] }
  $b
}

function Invoke-Gw { param([string]$Action, [hashtable]$Body)
  $payload = New-GwBody $Body | ConvertTo-Json -Depth 6 -Compress
  try {
    $resp = Invoke-WebRequest -Uri "$Base/DynGateway/$Ns.$Action`?sap-client=$Client" `
              -Method Post -Body $payload -ContentType 'application/json' `
              -Headers @{ Authorization = $Auth; 'X-CSRF-Token' = $Token } `
              -WebSession $sv -UseBasicParsing
    $resp.Content | ConvertFrom-Json
  } catch {
    $e = $_.Exception.Response
    if ($e) {
      $body = (New-Object IO.StreamReader($e.GetResponseStream())).ReadToEnd()
      Write-Host "HTTP $([int]$e.StatusCode)  bodyLen=$($body.Length)"
      if ($body) { Write-Host $body }
    }
    $null
  }
}

# ALWAYS build row/step arrays like this - see format rule 3
function ConvertTo-JsonArray { param([object[]]$Rows)
  '[' + (($Rows | ForEach-Object { $_ | ConvertTo-Json -Depth 4 -Compress }) -join ',') + ']'
}
```

### curl

```bash
BASE='https://<host>:<port>/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001'
NS='com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001'
CLIENT='<nnn>'

# Keep the cookie jar OUT of the working directory: it holds a live
# SAP_SESSIONID_<SID>_<client> that authenticates as $GW_USER until it expires (L-506).
JAR="$(mktemp -t sapjar.XXXXXX)"
trap 'rm -f "$JAR"' EXIT

# CSRF + cookie jar
TOKEN=$(curl -s -c "$JAR" -D - -o /dev/null \
  -u "$GW_USER:$GW_PASS" -H 'X-CSRF-Token: Fetch' \
  "$BASE/\$metadata?sap-client=$CLIENT" | tr -d '\r' | awk -F': ' '/^x-csrf-token/{print $2}')

curl -s -b "$JAR" -u "$GW_USER:$GW_PASS" \
  -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
  -X POST "$BASE/DynGateway/$NS.RunQuery?sap-client=$CLIENT" \
  -d @body.json
```

> The jar and any `-D` header dump are **credentials**, not scratch files. If you need to
> keep a response for the record, write it into
> `worklog/<system-id>/<YYYY-MM>/evidence/<worklog stem>/` by an explicit name — never let
> `curl` default it into the repo root, which is how a live session ID reached git on
> 2026-08-22 (L-506).

---

## 9 · Templates

### Read a table or CDS view

```json
{ "TargetName":"ZFS_CDS_SLC_001", "Operation":"", "ImportJson":"", "TablesJson":"",
  "FieldsJson":"[\"ZOTTK_NO\",\"ZBUKRS\",\"ZSTR\"]",
  "FilterJson":"[{\"Field\":\"ZBUKRS\",\"Op\":\"EQ\",\"Low\":\"SG03\",\"High\":\"\"}]",
  "OrderByJson":"[{\"Field\":\"ZOTTK_NO\",\"Descending\":true}]",
  "MaxRows":10, "StepsJson":"", "CommitMode":"" }
```

### Write rows

```json
{ "TargetName":"ZSGSLCTR_FEEDATA", "Operation":"INSERT",
  "ImportJson":"[{\"ZTYPE\":\"01\",\"ZFEE_TYPE\":\"F11\",\"ZOTTK_NO\":\"100050\",\"ZB_AMT\":100000,\"ZRATE\":10,\"ZCREATED_DATE\":\"2026-09-10\"}]",
  "TablesJson":"", "FieldsJson":"", "FilterJson":"", "OrderByJson":"",
  "MaxRows":0, "StepsJson":"", "CommitMode":"" }
```

### Call a function module

Note `RETURN` sent as an empty array so the messages come back.

```json
{ "TargetName":"RFC_READ_TABLE", "Operation":"",
  "ImportJson":"{\"QUERY_TABLE\":\"T001\",\"DELIMITER\":\"|\",\"ROWCOUNT\":3}",
  "TablesJson":"{\"FIELDS\":[{\"FIELDNAME\":\"BUKRS\"},{\"FIELDNAME\":\"BUTXT\"}],\"DATA\":[]}",
  "FieldsJson":"", "FilterJson":"", "OrderByJson":"",
  "MaxRows":0, "StepsJson":"", "CommitMode":"" }
```

### Create something with a BAPI — must be a batch

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"", "FieldsJson":"",
  "FilterJson":"", "OrderByJson":"", "MaxRows":0, "CommitMode":"AUTO",
  "StepsJson":"[{\"Kind\":\"FUNC\",\"TargetName\":\"BAPI_BUPA_CREATE_FROM_DATA\",\"ImportJson\":\"{\\\"PARTNERCATEGORY\\\":\\\"2\\\",\\\"PARTNERGROUP\\\":\\\"0001\\\",\\\"CENTRALDATAORGANIZATION\\\":{\\\"NAME1\\\":\\\"Acme Ltd\\\"}}\",\"TablesJson\":\"{\\\"RETURN\\\":[]}\"}]" }
```

### Run an executable report

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"", "FieldsJson":"",
  "FilterJson":"", "OrderByJson":"", "MaxRows":0, "CommitMode":"NEVER",
  "StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"SALV\",\"MaxRows\":15}]" }
```

With selections:

```json
"StepsJson":"[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_LMS_R033\",\"Operation\":\"SALV\",\"MaxRows\":10,\"FilterJson\":\"[{\\\"Field\\\":\\\"SO_DATE\\\",\\\"Op\\\":\\\"BT\\\",\\\"Low\\\":\\\"20260101\\\",\\\"High\\\":\\\"20260131\\\"}]\"}]"
```

### Mix kinds in one round trip

```json
"StepsJson":"[{\"Kind\":\"QURY\",\"TargetName\":\"ZFS_CDS_SLC_001\",\"MaxRows\":5},
              {\"Kind\":\"FUNC\",\"TargetName\":\"RFC_SYSTEM_INFO\",\"TablesJson\":\"{}\"},
              {\"Kind\":\"TABL\",\"TargetName\":\"ZTAB\",\"Operation\":\"MODIFY\",\"ImportJson\":\"[{...}]\"},
              {\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_R_TRM_FWDTXN\",\"Operation\":\"NONE\"}]"
```

**Atomicity.** `FUNC` steps share one `DESTINATION 'NONE'` session and commit together per
`CommitMode`. `TABL` steps commit in the RAP LUW. A `SUBM` step owns its own session and LUW
entirely. Three groups, each atomic in itself, **none atomic with the others.**

---

## 10 · Registering a target

Nothing runs unless it is registered. Registration is plain CRUD on the same entity set.

```json
POST <base>/DynGateway?sap-client=<nnn>          + CSRF
{ "EntryType":"R", "TargetKind":"QURY", "TargetName":"ZFS_CDS_SLC_001",
  "Operation":"SELECT", "IsActive":"X", "AllowRead":"X", "AllowWrite":"",
  "CallMode":"", "MaxRows":20, "Descr":"CDS view read" }
```

| Field | Meaning |
|---|---|
| `TargetKind` | `FUNC` \| `TABL` \| `QURY` \| `SUBM` (`REGI` is a step kind, not a registrable target) |
| `IsActive` | `X` = callable. Clearing it is an **instant kill switch, no transport** |
| `AllowRead` / `AllowWrite` | `QURY` needs read; `TABL`, **all `FUNC`** and **all `SUBM`** need write |
| `Operation` | pin a `TABL` row to one operation, or a `SUBM` row to one capture mode; blank = any |
| `CallMode` | `R` = `DESTINATION 'NONE'`, `L` = local, blank = auto from `TFDIR-FMODE` |
| `MaxRows` | ceiling the caller cannot exceed. **`0` = no ceiling** — register a target that way only when the full result set is expected and safe (L-356) |

> **A pinned `Operation` silently rejects any other value at call time — with a generic error, not
> a numbered message (L-358).** Verified 2026-09-11: a `SUBM` row registered with
> `"Operation":"SALV"` answered a later call using `"Operation":"NONE"` with `ExecStatus=E`,
> `MessageText="Dynamic call of batch step N failed…"` — not one of the documented numbered
> refusals (023/024/025/028/029/030). The identical call with `"Operation":"SALV"` succeeded. If a
> `SUBM`/`TABL` call fails this way with no message number, check the registry row's `Operation`
> column before debugging the report or payload — leave it blank to accept any operation at call
> time, or document the pin in `Descr` so the next caller isn't guessing.

### Registering many targets in one call — the `REGI` step

The `POST` above is one target per round trip, and allow-list rows do **not** travel with the
transport (L-335), so provisioning a fresh system that way is one call per target. The `REGI` step
kind does it in a single `ExecuteBatch`, and a later step in the same batch may use a target an
earlier `REGI` declared:

```json
{ "TargetName":"", "Operation":"", "ImportJson":"", "TablesJson":"", "FieldsJson":"",
  "FilterJson":"", "OrderByJson":"", "MaxRows":0, "CommitMode":"NEVER",
  "StepsJson":"[{\"Kind\":\"REGI\",\"TargetName\":\"T001\",\"Operation\":\"INSERT\",\"ImportJson\":\"{\\\"TargetKind\\\":\\\"QURY\\\",\\\"Operation\\\":\\\"SELECT\\\",\\\"IsActive\\\":\\\"X\\\",\\\"AllowRead\\\":\\\"X\\\",\\\"MaxRows\\\":5}\"},{\"Kind\":\"QURY\",\"TargetName\":\"T001\",\"FieldsJson\":\"[\\\"BUKRS\\\"]\",\"MaxRows\":2}]" }
```

Verified live on 2026-09-11: both steps come back `S`, the `QURY` reading the target the `REGI`
step in front of it had just declared.

Three things to keep straight, all covered in `docs/dynamic-gateway-api.md` §12:

- the **step's** `Operation` is `INSERT`/`UPDATE`/`UPSERT`; the one inside `ImportJson` is the
  registration's own `Operation` column;
- `INSERT` is the default and answers **035** on an existing target — widening a registration must
  be typed out as `UPDATE`, which merges only the fields you send;
- registration authority is a policy (`OPEN` today, for the testing phase). `REGI` is **not** a
  registrable `TargetKind` — it is a step kind.

Note the payload is nested **three** levels here — batch step, then the registration inside
`ImportJson`. Build it innermost-first and let the serialiser escape (L-335); `022` will not tell
you which level broke.

### Qualify a report before registering it as `SUBM`

Three cheap checks. Skipping them is how you get a failure that explains nothing.

1. **`WBCROSSGT`** for the report's includes — **any `CL_GUI_*` reference disqualifies it.** There
   is no GUI in this session; the report will kill the RFC work process and surface as
   `020 "connection closed (no data)"`.
2. **The `_TOP` include** — an `OBLIGATORY` select-option must be supplied in `FilterJson`, or the
   submit stalls on the selection screen.
3. **A timed trial run.** Runtime is the real limit and `MaxRows` does not bound it — it caps rows
   returned, never the work the report does. Record the safe selection width in `Descr`.

Use `SALV` for any ALV report: it intercepts `REUSE_ALV_GRID_DISPLAY` as well as `cl_salv_table`,
and it is cheaper because display is suppressed. `LIST` is for reports that `WRITE` their own output.

### Publishing the binding

`publishServiceBinding` over ADT reports success without publishing. Use:

```
python scripts/sap-gui-publish-service.py --group-id zfs_sb_dyngateway_o4_api --yes
```

Its `"ok"` is the verification. "Get Service Groups" may first demand a non-blank System Alias —
`F4` and pick `LOCAL`.

---

## 11 · Security model

The allow-list is the only real control, so treat it as privileged configuration.

- **Exact names only.** No wildcards, no namespace-level rows.
- **`SUBM` is arbitrary code execution by proxy.** The guards that do hold: `Z*`/`Y*` namespace
  only, `TRDIR-SUBC = '1'`, an explicit `AUTHORITY-CHECK OBJECT 'S_PROGRAM'` in the wrapper before
  the submit, `AllowWrite` required, `MaxRows`, and `IsActive` as a kill switch.
- **Write access to registry rows is privileged.** Anyone who can `POST /DynGateway` can decide
  what the service may reach — including registering a `SUBM` target. Restrict who holds that.
- **The service user's authorisations are the effective ceiling.** Do not run this under a wide
  technical user, and do not assume a caller is limited to less than that user can do.
- **Every call is logged.** An `EntryType='L'` row records the resolved target, the request and
  response payloads, `EXECUTED_BY` and timings. `GET /DynGateway(<GwUuid>)` reads it back.

---

## 12 · Acceptance suite

Run this on a new system, in order. It proves the endpoint, auth, all four actions, the allow-list,
and the refusal paths. Every test states its expected result, so a mismatch is unambiguous.

**Register the four smoke targets first** (§10): `QURY T000` (MaxRows 5, read),
`FUNC RFC_SYSTEM_INFO` (write), `TABL ZFS_T_SLC_DYNGW` (write — optional, only if you want the
write path covered), and one qualified `SUBM` report if you use that kind.

### Positive

| # | Call | Expect |
|---|---|---|
| P1 | `GET /$metadata?sap-client=<nnn>` | **200**, and a non-empty `x-csrf-token` header |
| P2 | `GET /DynGateway?$filter=EntryType eq 'R'` | 200, your registered rows listed |
| P3 | `RunQuery` on `T000`, `FieldsJson ["MANDT","MTEXT"]`, `MaxRows 3` | `S`, `ResultCount` 1–3, rows in `RowsJson` |
| P4 | P3 again with `FilterJson` on `MANDT` `EQ` your client | `S`, exactly 1 row |
| P5 | `CallFunctionModule` `RFC_SYSTEM_INFO`, `TablesJson "{}"` | `S`, `ExportJson` carries `RFCSI_EXPORT` with the system id |
| P6 | `ExecuteBatch`, two `QURY` steps, `CommitMode NEVER` | overall `S`, `ResultCount` 2, both steps `EXECSTATUS='S'` |
| P7 | `RunQuery` with `MaxRows` **below** the true row count | exactly `MaxRows` rows |
| P8 | `GET /DynGateway(<GwUuid>)` using a `GwUuid` from any call above | 200, the call-log row with `RequestJson` / `ResponseJson` filled |

If you use `SUBM`:

| # | Call | Expect |
|---|---|---|
| P9 | `SUBM` on a qualified SALV report, `Operation SALV` | `S`, typed rows in `ROWSJSON`, `EXPORTJSON.MODE = "SALV"` |
| P10 | same report, `Operation NONE` | `S`, `RESULTCOUNT` 0 |
| P11 | `[{SUBM},{QURY}]` in one batch | overall `S`, both row sets present |

### Negative — every one must be **HTTP 200 with `ExecStatus='E'`**

An HTTP error here, or an empty body, means something is wrong with the install.

| # | Call | Expect |
|---|---|---|
| N1 | `RunQuery` on a table you did **not** register | `E`, msg **017** |
| N2 | `PATCH` a registered row to `IsActive:""`, repeat P3 | `E`, msg **017** — the kill switch works |
| N3 | `RunQuery` with `FilterJson` naming a column that does not exist | `E`, msg **023** |
| N4 | `RunQuery` with `"Op":"XX"` | `E`, msg **024** |
| N5 | `RunQuery` with `MaxRows` above the registry ceiling | `E`, msg **025** |
| N6 | `RunQuery` with `FilterJson` a 60-character `Low` against a short column | `E`, msg **020** *"value exceeds the length of the field"* — **not** a dump |
| N7 | `ExecuteTableCrud` with `Operation:"TRUNCATE"` | `E`, msg **018** |
| N8 | `ExecuteBatch` with malformed `StepsJson` | `E`, msg **022** |
| N9 | `ExecuteBatch` `[valid QURY, invalid QURY]` | `E`, **nothing executed**, step 1 reports `EXECSTATUS='P'` |
| N10 | `CallFunctionModule` on an FM with a generic (`CLIKE`/`ANY`) parameter you supply | `E`, msg **020** naming the generic parameter |

If you use `SUBM`:

| # | Call | Expect |
|---|---|---|
| N11 | `SUBM` on an **unregistered** powerful SAP program, e.g. `RSUSR003` | `E`, msg **017**, nothing runs — **this is the security assertion, do not skip it** |
| N12 | `SUBM` with `Operation:"SPOOL"` | `E`, msg **028** |
| N13 | `SUBM` with a selection field not on the program | `E`, msg **023** |
| N14 | `SUBM` with a `Low` longer than 45 characters | `E`, msg **029** |
| N15 | `SUBM` with `ImportJson:{"Variant":"ZNOPE"}` | `E`, msg **030** |

**Clean up:** delete the `EntryType='L'` rows the suite created, and either delete or deactivate any
target you registered only for testing.

---

## 12a · Manual test from SAP GUI (`/IWFND/GW_CLIENT`) — VERIFIED WORKING 2026-09-10

`/IWFND/GW_CLIENT` drives this V4 A2X service despite being the classic Gateway Client: it offers
`POST`/`PATCH`/`DELETE`, and it **fetches and attaches the CSRF token itself** — no token fetch, no
cookie jar. It is the cheapest way to test an action by hand, and the only one that needs no client
tooling at all.

| # | Step | Detail |
|---|---|---|
| 1 | `/IWFND/GW_CLIENT` | |
| 2 | HTTP Method → **POST** | radio row at the top; the actions never answer `GET` (§13) |
| 3 | Protocol → `HTTP` or `HTTPS` | HTTPS mirrors the real caller |
| 4 | Request URI | the path **without** host, e.g. `/sap/opu/odata4/sap/zfs_sb_dyngateway_o4_api/srvd_a2x/sap/zfs_sd_dyngateway/0001/DynGateway/com.sap.gateway.srvd_a2x.zfs_sd_dyngateway.v0001.RunQuery?sap-client=100` |
| 5 | Type the JSON body into the bottom-left editor | e.g. `{"TargetName":"T000","FieldsJson":"[\"MANDT\",\"MTEXT\"]","MaxRows":3}` |
| 6 | **Execute** (F8) | |
| 7 | Read `~status_code`, then the response body | `ExecStatus` first; `RowsJson` is a string needing a second parse |

**`Content-Type: application/json` is mandatory, not optional.** The body pane defaults to XML, and
a JSON payload typed into it without that header is parsed as XML and returns
`400 CX_SXML_PARSE_ERROR "Error while parsing an XML stream"` wrapped in `/IWCOR/CX_OD_BAD_REQUEST`.
Add the row by hand to the **HTTP Request** header grid before executing.

**Use a target that is actually registered on this system.** §12's P3 uses `T000`, which is *not*
in the DS4/100 allow-list — it would answer `017` however well-formed the call is (L-335). Read the
live list first (`SE16` on `ZFS_T_SLC_DYNGW`, `ENTRY_TYPE = 'R'`) and pick a `QURY` row, e.g.
`{"TargetName":"ZFS_CDS_SLC_001","MaxRows":3}`.

Notes from the verified run:

- An **empty** body returns `400` `/IWBEP/CM_V4H_RUN/006` *"Non nullable action parameter …"*. That
  is the action rejecting a missing parameter, so it is also the proof that the `POST` reached
  `RunQuery` — a useful one-click liveness check for the action layer.
- The body pane's format indicator reads `XML`. If the call is refused on media type, add a
  `Content-Type: application/json` row to the **HTTP Request** header grid.
- Watch the service name: `zfs_sb_dyngateway_o**4**_api`. Dropping the `4` gives a `404` that reads
  like an unpublished binding.
- The pane is a `SAPGUI.AbapEditor.1` control, so `sap-gui` automation **cannot** fill the body —
  confirmed two independent ways on 2026-09-11 (L-357): `sap_set_textedit` returns
  `"Could not set text editor"` (same for reading it back), and OS-level keystroke injection
  (bringing the SAP GUI window to the foreground via its `MainWindowHandle` and sending
  `SendKeys`, after `sap_set_focus` on the control) also never lands any text in the pane. **The
  HTTP Request header grid, however, IS scriptable** — `sap_modify_cell` on the `NAME`/`VALUE`
  grid successfully sets rows such as `content-type: application/json` (this corrects the
  original 2026-09-10 finding above that it "refuses a scripted `modify_cell` too"). So steps
  1–4 and the header grid all script fine; only the body pane needs a human paste. A workable
  semi-scripted procedure: drive the URI, method, protocol and header grid, and F8/response
  reading via `sap-gui`, and have a human type or paste the JSON body for just that one field —
  still a real call against the real system, not a fallback to a different transport. Fully
  scripted end-to-end testing stays with the PowerShell client (§8).
- **Do not use `Edit → Default Input V4`** hoping it switches the payload format. It loads SAP's V4
  demo request (`/sap/opu/odata4/sap/iwbep/tea/…/Teams`) over the top of your form, resetting the
  method to `GET` and discarding the URI.

## 13 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **405** `/IWCOR/CX_OD_METHD_NOT_ALLOWED` on an action URL | the action was called with `GET` (e.g. the URL pasted into a browser) — all four actions are `POST`-only, bound to the collection | `POST` it, with a CSRF token and the session cookie (§3); the whole request lives in the JSON body |
| **401**, looks like a bad password | `sap-client` missing from the URL | add `?sap-client=<nnn>` to **every** call, `$metadata` included |
| **403** on any call | `srvd` instead of `srvd_a2x` in the path | use `srvd_a2x` |
| **403** on a `POST` | missing or stale CSRF token, or the cookie was not sent | re-fetch the token *and* reuse the session cookie |
| **404** | binding not published on this system | §10 |
| Every call → **017** | the allow-list is empty — rows do not travel with the transport | register targets (§1, §10) |
| `Invalid JSON in parameter ImportJson` | a one-element array was serialised as an object | build arrays by hand (format rule 3) |
| An FM "returns nothing" | its output-only `TABLES` parameter was not sent | send it as `[]` (format rule 5) |
| `023` on a column you can see in `DD03L` | the column lives in a DDIC `.INCLUDE` | name only the table's own fields; always send `FieldsJson` |
| `Table or view … does not exist` on all-columns read | the default projection breaks on tables with includes | send an explicit `FieldsJson` |
| A creating BAPI reports `S` but nothing was created | `CallFunctionModule` does not commit | use `ExecuteBatch` with `CommitMode` |
| BAPI reports `S` but the data is wrong | `ExecStatus` is the dispatch, not the outcome | parse `RETURN`; treat any `E`/`A` row as failure |
| **HTTP 400 with an empty body** | a batch step failed at runtime and the request was failed to roll the LUW back | the reason cannot reach you — validate client-side; check `ST22` for a dump |
| `020 "connection closed (no data)"` on a `SUBM` | the report needs a GUI and killed the work process | disqualify it (§10) |
| `SUBM` times out or returns an empty body on a wide selection | runtime exceeded the work-process limit; `MaxRows` does not bound runtime | narrow the selection; record the safe width in `Descr` |
| `032 "no output could be captured"` | the report produced nothing in that mode | try `LIST`; confirm the report really outputs something |
| `"Dynamic call of batch step N failed…"` (generic, no message number) on a `SUBM`/`TABL` step | the registry row's `Operation` is pinned to a different value than the call used (L-358) | check `ZFS_T_SLC_DYNGW`'s `Operation` column for that target; use the pinned value, or leave it blank at registration to accept any |

---

## 14 · Limits

- An FM with a **generic** parameter type (`CLIKE`, `ANY`, untyped) cannot be called dynamically.
  This rules out conversion exits and most `STRING_*` utilities.
- `CHANGING` parameters need `CallMode = L`; RFC has no CHANGING.
- `RunQuery` cannot reach a column inside a DDIC `.INCLUDE`, and its all-columns default fails on
  tables that have one.
- A batch step that fails at runtime answers **HTTP 400 with the reason in the body** (the empty
  body of L-313 is fixed), and the call log survives the abort — look the call up by its `GwUuid`.
- **An aborted batch is not reliably atomic.** Writes made by earlier steps in the same call can
  survive the abort, because the durable log write is a synchronous RFC and that implicitly
  commits the caller's LUW (**L-350**, measured 2026-09-11). Make your steps idempotent, or verify
  the outcome, rather than trusting all-or-nothing. Under review.
- `SUBM` is bounded by runtime, not rows, and nothing in the gateway can cap a runaway report.
- `MEMO` capture requires the report to export a single `GW_JSON` string; it is implemented but
  has no proven consumer yet.
- `TargetName` is `CHAR(30)`. Every existing `Z` report name fits, with no headroom — SAP allows 40.
