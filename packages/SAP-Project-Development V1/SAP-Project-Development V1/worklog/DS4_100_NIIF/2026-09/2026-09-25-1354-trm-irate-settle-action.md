# TRM interest rate instrument API — Settle action

- **Date:** 2026-09-25
- **Started:** 13:54
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP
- **Transport:** DS4K907209 (FS_DEV3 task DS4K907260)
- **Requested by:** human ("Add for the settle also")
- **Follows:** `2026-09-25-1308-trm-irate-crud-odata-api.md`

## Scope

Add a bound instance action `Settle` to the existing `ZFS_CE_TrmIrateTP` BO, backed by the released
`BAPI_FTR_IRATE_SETTLE` (`RODIR.RELEASED = X`; importing only `COMPANYCODE`, `FINANCIALTRANSACTION`,
`TESTRUN`). No parameters, so no abstract entity or other new object. Changed objects only: BDEF
`ZFS_CE_TRMIRATETP` and behavior pool `ZBP_FS_TRMIRATETP`; SRVD/SRVB re-activated if needed.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Design approval: `action Settle result [1] $self`, `DESTINATION 'NONE'` + commit, BAPI messages passed through, no own precondition checks; live test creates → settles → settles again (expect refusal) → reverses a new test deal | **Approved** ("yes go ahead") | 2026-09-25 |

## Naming gate

```
NAMING: action Settle -> no DDIC/repository object is created; action names follow the CDS CamelCase rule
```

## Todo

- [x] 1. BDEF: added `action Settle result [1] $self;` (`mcp-abap-abap-adt-api` lock/setObjectSource/unLock, DS4K907209)
- [x] 2. Pool: `settle` handler (`BAPI_FTR_IRATE_SETTLE DESTINATION 'NONE'`, commit/rollback via `end_luw`,
      BAPI messages to `reported`, result = re-read via `read_deal`) + `%action-Settle` in global auth
- [x] 3. BDEF + pool activated together in one `activateObjects` call, no messages; `inactiveObjects`
      lists none of this activity's objects
- [x] 4. `$metadata` shows `<Action Name="Settle">` without re-publishing. Namespace
      `com.sap.gateway.srvd_a2x.zfs_sd_trmirate.v0001`
- [x] 5. ATC: 0 findings on `ZBP_FS_TRMIRATETP` and BDEF `ZFS_CE_TRMIRATETP`
- [x] 6. Live test (fresh cookie session per call, sandboxed PowerShell):
      create 201 -> **`1000/160533`** · `Settle` **200** (`FTR0 162`) · GET 200 · `Settle` again **400**
      `T4 018` "Settlement already carried out" + `FTR0 161` (confirms the first call settled) ·
      DELETE 204 · GET 200, `ActiveStatus` **still 0**
      - **Finding (L-571):** `VTBFHAZU` showed activity 1 = contract (`SFGZUSTT 10`, active) and
        activity 2 = settlement (`SFGZUSTT 20`, `SAKTIV 3`, `SSTOGRD 04`). `BAPI_FTR_IRATE_REVERSE`
        reverses the **latest activity**, so on a settled deal the first DELETE undoes the settlement only.
      - A second DELETE (204) reversed the contract: GET shows `ActiveStatus` 3.
      - `ActiveStatus` (`VTBFHA-SAKTIV`) does not change on settlement; it stays 0. Settlement is
        visible only as a new activity in `VTBFHAZU`.
      - Evidence: `evidence/2026-09-25-1354-trm-irate-settle-action/`: `settle-log.txt`, `metadata-with-settle.xml`

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_CE_TRMIRATETP` | BDEF/BDO | ZFS_SLC_APP | DS4K907209 | changed: `action Settle`, active |
| `ZBP_FS_TRMIRATETP` | CLAS/OC | ZFS_SLC_APP | DS4K907209 | changed: `settle` handler + auth, active |

Test data: deal `1000/0000000160533`, settled, then settlement and contract both reversed.

## Service

`POST …/InterestRateInstrument(CompanyCode='1000',FinancialTransaction='<no>')/com.sap.gateway.srvd_a2x.zfs_sd_trmirate.v0001.Settle?sap-client=100`
with body `{}` and an `x-csrf-token`. Returns the deal.

## Delivery checks

- [x] Activated, nothing left inactive
- [x] ATC: 0 findings
- [x] ABAP Unit: none (rule 3; verified live)
- [x] Live test: settle, refusal on the second settle, cleanup
- [x] Objects on DS4K907209 (unchanged transport assignment)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-570, L-571
