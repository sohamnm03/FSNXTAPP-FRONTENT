# `SUBM` — running an executable report through the dynamic gateway

Built and tested against **`DS4` client `100`** on **2026-09-10** as `FS_DEV3`.
Every result below is real output from the live service.
Contract: [`dynamic-gateway-api.md`](dynamic-gateway-api.md) §11.
Activity record: [`worklog/DS4_100_NIIF/2026-09-10-dyngateway-submit-kind.md`](../worklog/DS4_100_NIIF/2026-09-10-dyngateway-submit-kind.md).

## The two questions this answers

**Can the gateway run a report?** Yes. `Kind = 'SUBM'` inside `ExecuteBatch`. No OData contract
change was needed and the binding was never republished — `Kind` lives inside the `StepsJson`
string, and `TARGET_KIND` is a plain `CHAR(4)` with no domain.

**Does the report's output come back?** Yes, but **not by itself.** `SUBMIT` has no `EXPORTING`
parameters; a report is not a function module. The caller names one of three capture mechanisms
and the gateway applies it. All three are session-local, which is why the capture happens inside
the RFC wrapper and not in the behaviour pool.

## Objects

| Object | Type | Role |
|---|---|---|
| `ZFS_FG_DYNGW_SUBMIT` | FUGR/F | function group |
| `ZFS_RFC_DYNGW_SUBMIT` | FUGR/FF, **RFC-enabled** | submits the report and captures its output |
| `ZBP_FS_DYNGATEWAYTP` | CLAS | + `lcl_submit_runner`, two dispatcher branches, a `FUNC` bypass guard |
| `ZFS_TRM_MSG` | MSAG | messages 027–032 |

Transport `DS4K907263` (messages on `DS4K907018`). ATC under the DEFAULT variant: **0 priority-1,
0 priority-2** on both the pool (22 infos) and the function group (12 infos).

> **The RFC flag cannot be set from either MCP server.** `adt-mcp`'s `FUGR/FF` creation offers no
> processing type and its validator silently strips `processingType`/`rfcEnabled`;
> `mcp-abap-abap-adt-api createObject` has the same field set; and the flag is object metadata
> (`fmodule:processingType`), absent from source, so `setObjectSource` cannot reach it. It was set
> by hand in SE37 and verified as `TFDIR-FMODE = 'R'` (L-324).

## Capture modes

| `Operation` | Mechanism | Returns |
|---|---|---|
| `SALV` | `cl_salv_bs_runtime_info=>set( display = off, data = on )` before the submit, `get_data_ref( )` after | `ROWSJSON`, typed rows |
| `LIST` | `EXPORTING LIST TO MEMORY` + `LIST_FROM_MEMORY` / `LIST_TO_ASCI` | `ROWSJSON`, `[{"LINE","TEXT"}]` |
| `MEMO` | `IMPORT gw_json FROM MEMORY ID <id>` | envelope `MEMO` |
| `NONE` | run only | messages only |

**`SALV` is the default and the right choice for any ALV report.** It intercepts
`REUSE_ALV_GRID_DISPLAY` as well as `cl_salv_table` — proven on a Pattern A report — and it is
cheaper, because suppressing display skips the list build entirely.

## Results

### `SALV` on a Pattern B report — `ZFS_LMS_R033` (`cl_salv_table`)

`SO_DATE` is `OBLIGATORY` on this report, so it must be supplied.

```json
"StepsJson": "[{\"Kind\":\"SUBM\",\"TargetName\":\"ZFS_LMS_R033\",\"Operation\":\"SALV\",
  \"FilterJson\":\"[{\\\"Field\\\":\\\"SO_DATE\\\",\\\"Op\\\":\\\"BT\\\",\\\"Low\\\":\\\"20260101\\\",\\\"High\\\":\\\"20260131\\\"}]\",
  \"MaxRows\":10}]"
```

```
overall=S  step status=S  msgno=26  rows=10  ms=26892
export: {"PROGRAM":"ZFS_LMS_R033","MODE":"SALV","VARIANT":"","CAPTURED":10,
         "TRUNCATED":true,"SYSUBRC":0,"MSGID":"","MSGNO":0,"MSGTY":"","MSGTX":"","MEMO":""}
rows:   [{"ZDISBURSE_RFHA":"0000000140001","PAYHEAD":"Interest","INVOICE_DATE":"31-01-2026","AMOUNT_DUE":164087.67},
         {"ZDISBURSE_RFHA":"0000000140004","PAYHEAD":"Interest","INVOICE_DATE":"07-01-2026","AMOUNT_DUE":6298849.32}, …]
```

### `SALV` on a Pattern A report — `ZFS_R_TRM_FWDTXN` (`REUSE_ALV_GRID_DISPLAY`)

The interesting one: this report contains **no `CL_SALV_*` reference at all**, and the interceptor
still gets its internal table.

```
overall=S  rows=15  ms=42
rows: [{"ZBUKRS":"9990","ZRFHA":"0000040000001","ZPROD_TYPE":"40A","ZTXN_TYPE":"400",
        "ZSTATUS":"05","ZCONFIRM_FLAG":"","ZDEAL_REF":"","ZCONFIRMATION":""}, …]
```

### `LIST` on the same report — 177 ms

```
rows: [{"LINE":1,"TEXT":"Forwards Transactions"},
       {"LINE":4,"TEXT":"Date    10.09.2026"},
       {"LINE":5,"TEXT":"Records 403"},
       {"LINE":7,"TEXT":"|CoCd|Trans.  |PTyp|TTyp|Status| |Text         |Text|"},
       {"LINE":11,"TEXT":"|9990|40000001|40A |400 |05    | |             |    |"}, …]
```

Same data, one quarter the fidelity and four times the cost. Use `SALV` unless the report really
does `WRITE` its own output.

### Composition — `SUBM` then `QURY` in one call

```
overall=S  ms=25402
step 1  SUBM  ZFS_LMS_R033     status=S  rows=3   (SALV rows)
step 2  QURY  ZFS_CDS_SLC_001  status=S  rows=2   (CDS rows)
```

### `NONE`, and `MEMO`

`NONE` runs the report and returns `S` with 0 rows. `MEMO` against an id nothing exports returns
`E` / **032**, correctly. **`MEMO` is unproven against a cooperating report** — that needs a report
exporting a single `GW_JSON` string, and none exists.

### Negative tests — all HTTP 200 with a real message

| Case | Message |
|---|---|
| `RSUSR003`, unregistered | 017 — nothing runs. The security assertion |
| unknown `Z` program, unregistered | 017 |
| capture mode `SPOOL` | 028 |
| selection field `ZZZNOPE` | 023 *"is not a component of ZFS_LMS_R033"* |
| 50-character selection value | 029 — the L-310 analogue, refused before SQL |
| operator `XX` | 024 |
| `MaxRows` 9999 against a ceiling of 20 | 025 |
| variant `ZNOPE` | 030 |
| `ZFS_RFC_DYNGW_SUBMIT` as a plain `FUNC` target | 018 — the bypass guard |
| `[valid QURY, invalid SUBM]` | nothing runs; QURY reported `EXECSTATUS='P'` |

## Two things that cost real time

### A failed `SUBM` step used to return an empty body

Prepare-phase rejections were always clean. Execute-phase failures were not: `ExecuteBatch` aborts
the RAP request on a failed step, and a failed RAP request answers with `Content-Length: 0`
(L-313). Messages 020, 031 and 032 were unreachable — a `MEMO` miss, a `LIST` failure and a
timeout all looked identical and said nothing.

The abort is load-bearing for `FUNC` and `TABL`: it *is* the rollback, and L-227 forbids an
explicit `ROLLBACK WORK` in a behaviour class. **For `SUBM` it buys nothing** — the report ran
behind `DESTINATION 'NONE'` in its own LUW and has already committed or not. So a failed `SUBM`
step is now reported as a per-step error with HTTP 200 — but only while no `TABL` or `FUNC` step
has already executed in the same call, tracked by an `lv_dirty` flag. After that the abort still
wins, because atomicity outranks diagnosability (L-328).

### Qualify the report before you register it

Three cheap reads, all before the registry row exists:

1. **`WBCROSSGT`** for the report's includes — any `CL_GUI_*` reference is a hard disqualifier.
   `ZFS_SLC_DEM003` was registered without this check; it is a `CL_GUI_HTML_VIEWER` program and
   killed the RFC work process, surfacing as `020 "connection closed (no data)"` (L-331).
2. **The `_TOP` include** for `OBLIGATORY` select-options, which must be supplied or the submit
   stalls on the selection screen.
3. **A timed trial run.** `ZFS_LMS_R033` takes ~27 s for one month; a 99-year range exceeded the
   work-process limit. `MaxRows` caps rows *returned*, never the work the report does, so runtime
   is the real limit and nothing in the gateway can bound it. Record the safe width in `Descr`
   (L-329).

## Left on the system

| Row | State |
|---|---|
| `SUBM ZFS_R_TRM_FWDTXN` (25) | active — the reference target, both modes verified |
| `SUBM ZFS_LMS_R033` (20) | active — Pattern B, needs `SO_DATE`, slow |
| `SUBM ZFS_FI_R047` (20) | active — registered, not yet exercised |
| `SUBM ZFS_SLC_DEM003` | **inactive** — GUI program, dumps under SUBMIT |
| `FUNC RPY_PROGRAM_READ`, `QURY FUPARAREF` | **inactive** — added to read source during the L-319 outage, retired the same session (L-322) |

Clear `IsActive` on any row to switch it off instantly, with no transport.
