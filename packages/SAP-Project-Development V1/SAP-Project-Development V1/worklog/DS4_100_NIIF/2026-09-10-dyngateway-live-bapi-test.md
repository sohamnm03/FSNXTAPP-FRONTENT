# Dynamic gateway live test — mock data, CDS reads, FTR + BP BAPIs

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`), user `FS_DEV3`
- **Package:** ZFS_SLC_BTP (no repository object touched)
- **Transport:** none — data and allow-list rows only
- **Requested by:** human

## Scope

End-to-end live test of the published OData V4 service `ZFS_SB_DYNGATEWAY_O4_API` against real
`DS4/100` data, in four parts:

1. INSERT mock rows into `ZSGSLCTR_FEEDATA` and `ZSGSLCTR_DEALID`.
2. Read `ZFS_CDS_SLC_001`, `ZFS_CDS_SLC_002` and `ZSGSLCTR_BPEXT`.
3. Create a term loan with `BAPI_FTR_IRATE_CREATE` (company code 1000, product type 22A,
   transaction type 100, partner 700000453, 01.01.2026–31.12.2026, INR 100,000, 10 %) and a
   business partner with `BAPI_BUPA_CREATE_FROM_DATA`.
4. A step-by-step run book with the real output.

**Out of scope:** any change to `ZBP_FS_DYNGATEWAYTP` or to any repository object. No object was
created. The persistent changes are application-table rows, one FTR transaction, one business
partner and ten allow-list rows.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Is product type `22A` assigned to company code `1000`? | `TZPAB` has **no** row for `22A` at all (`1000` carries only `22B` and `26D`) and `VTBFHA` was empty — but this did **not** block the create. `TZPAB` holds company-code overrides, not the permission. | 2026-09-10 |
| 2 | The requested payload was missing two mandatory FTR inputs — proceed? | Ran the exact payload first and captured the rejection, then added `VALUATION_CLASS = '0001'` and pulled `CONTRACT_DATE` back to `2026-01-01`, which is the minimum change that makes the requested deal creatable. Both deviations are called out in the run book. | 2026-09-10 |
| 3 | Should the allow-list rows added for this test stay active? | **Open — human to decide.** They are still active, including two write-capable BAPIs. `PATCH … {"IsActive":""}` switches either off with no transport. | — |

## Naming gate

Not applicable — **no repository object was created or renamed.** The only writes are
application-table rows and `ZFS_T_SLC_DYNGW` allow-list rows, both of which are data.

## Todo

- [x] 1. Read `docs/dynamic-gateway-api.md`, the ledger and the two prior gateway worklogs.
- [x] 2. Verify the endpoint, CSRF flow and the current allow-list.
- [x] 3. Verify the FTR / BP customizing the requested payload depends on.
- [x] 4. Register the missing targets in `ZFS_T_SLC_DYNGW` (10 rows, all HTTP 201).
- [x] 5. Insert the mock rows into `ZSGSLCTR_FEEDATA` (2) and `ZSGSLCTR_DEALID` (1).
- [x] 6. Read `ZFS_CDS_SLC_001` (2 rows), `ZFS_CDS_SLC_002` (1), `ZSGSLCTR_BPEXT` (20).
- [x] 7. Call `BAPI_FTR_IRATE_CREATE` — `1000 / 0000000160436`.
- [x] 8. Call `BAPI_BUPA_CREATE_FROM_DATA` — BP `0100000444`.
- [x] 9. Write the run book `docs/dyngateway-live-test-2026-09-10.md`.
- [x] 10. Record L-314 … L-319.

## Object list

No repository object created or changed.

| Data written | Where | Key |
|---|---|---|
| 10 allow-list rows | `ZFS_T_SLC_DYNGW` | 4 QURY (`ZFS_CDS_SLC_002`, `ZSGSLCTR_BPEXT`, `ZSGSLCTR_FEEDATA`, `ZSGSLCTR_DEALID`) + 2 QURY (`VTBFHA`, `VTBFHAPO`) + 2 TABL INSERT + 2 FUNC |
| 2 mock fee rows | `ZSGSLCTR_FEEDATA` | `01/F11/100050`, `01/F12/100050` |
| 1 mock deal row | `ZSGSLCTR_DEALID` | `9000000001` |
| 1 FTR transaction | `VTBFHA` | `1000 / 0000000160436` |
| 1 business partner | `BUT000` | `0100000444` |

## Results

| Step | Action | Outcome |
|---|---|---|
| CSRF + `$metadata` | GET | HTTP 200, 24-char token |
| Registry listing | GET `$filter=EntryType eq 'R'` | 8 rows before, 18 after |
| `ZSGSLCTR_FEEDATA` insert | `ExecuteTableCrud` | `S`, 2 rows, 33 ms |
| `ZSGSLCTR_DEALID` insert | `ExecuteTableCrud` | `E` first (PowerShell arity, L-315), then `S`, 1 row, 37 ms |
| `ZFS_CDS_SLC_001` | `RunQuery` | `S`, 2 rows, 269 ms |
| `ZFS_CDS_SLC_002` | `RunQuery` | `S`, 1 row, 805 ms |
| `ZSGSLCTR_BPEXT` | `RunQuery` | `S`, 20 rows (MaxRows ceiling), 29 ms |
| all three batched | `ExecuteBatch` | `S`, 3 steps, 983 ms |
| FTR, exact payload, TESTRUN | `CallFunctionModule` | `S` dispatch, 5 `E` messages in `RETURN` |
| FTR, corrected, TESTRUN | `CallFunctionModule` | `S`, `FTR0-162 BAPI was executed successfully` |
| FTR, real | `ExecuteBatch` `AUTO` | `S`, `FINANCIALTRANSACTION 0000000160436`, 1423 ms |
| BP | `ExecuteBatch` `AUTO` | `S`, `BUSINESSPARTNER 0100000444`, 538 ms |
| final read-back, 4 targets | `ExecuteBatch` `NEVER` | `S`, 4 steps, 85 ms |

Two deviations from the requested FTR payload, both forced by the system and both evidenced:

1. `CONTRACT_DATE` moved from the default (today, 10.09.2026) to `2026-01-01` — FTR refuses a
   contract date after the start of term (`T4-161`).
2. `VALUATION_CLASS = '0001'` added — `VTBFHA-RCOMVALCL` is mandatory here (`FTR_GUI-141`,
   `FTR_TRD-31`); valid values come from `TRGC_COM_VALCL`.

One warning left standing on each create, neither blocking: `FTR_GUI-220` (partner role validity
starts after the contract date) and `R11-336` (`PARTNERLANGUAGE` is a person-only field).

## Delivery checks

- [x] No repository object created or changed
- [x] Every gateway call's real response captured verbatim in the run book
- [x] Mock rows, FTR transaction and BP all read back from the database after the write
- [x] Lessons recorded in the same turn
- [ ] Human decision on whether the two write-capable `FUNC` allow-list rows stay active

## Lessons raised

`lessons/lessons-ledger.md`: **L-314** (output-only `TABLES` must be sent as `[]`),
**L-315** (PowerShell 1-element array collapse), **L-316** (`RunQuery` does not flatten DDIC
`.INCLUDE`s; all-columns projection breaks on those tables), **L-317** (creating BAPIs need
`ExecuteBatch` + `CommitMode`; `ExecStatus=S` ≠ BAPI success), **L-318** (sandbox now passes POST;
supersedes the `dangerouslyDisableSandbox` half of L-245), **L-319** (`mcp-abap-abap-adt-api`
degraded mid-session while `healthcheck` still said healthy).
