# Create transparent table ZFS_T_TRM_LOAN

- **Date:** 2026-08-16
- **System:** DS4_100_NIIF
- **Package:** ZFS_K2_CC_VS
- **Transport:** DS4K907018 ("FY-26 : TRM Demo", owner FS_DEV)
- **Requested by:** human

## Scope

Create one transparent table holding loan and interest amounts per company code and
Treasury financial transaction: `BUKRS`, `RFHA` (`TB_RFHA`), `LOANAMT` and `INTAMT`
(`TB_LIMIT_AMOUNT`), `CURR` (`WAERS`). Out of scope: table maintenance generation
(SM30), lock object, CDS view, any report or maintenance program — none were requested
(L-216).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Table name — none was given in the request | `ZFS_T_TRM_LOAN` (human choice from three offered names) | 2026-08-16 |
| 2 | Primary key | `MANDT` + `BUKRS` + `RFHA` (human choice) | 2026-08-16 |

## Naming gate

```
NAMING: ZFS_T_TRM_LOAN -> matches Dictionary (DDIC) row "Transparent table"
        ZFS_T_<AREA>_<NAME>, AREA=TRM, NAME=LOAN, 14 chars <= 16 (L-099)
```

## Todo

- [x] 1. Read `AGENTS.md`, `docs/naming-conventions.md`, `lessons/lessons-ledger.md`
- [x] 2. Confirm table name and key with the human (naming gate, L-027)
- [x] 3. Confirm transport `DS4K907018` exists and is open (`abap_transport-get`)
- [x] 4. Create `ZFS_T_TRM_LOAN` via `adt-mcp` (`abap_creation-create_object`) — L-212
- [x] 5. Write the field list via `mcp-abap-abap-adt-api` `setObjectSource` (change path) — L-212
- [x] 6. Activate
- [x] 7. Read back and verify the active definition
- [x] 8. Completion report — texts the human must maintain (L-211)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_TRM_LOAN` | `TABL/DT` transparent table | ZFS_K2_CC_VS | DS4K907018 | Active |

## Field list

| Field | Key | Data element | Notes |
|---|---|---|---|
| `MANDT` | yes | `MANDT` | client — generator emitted `client : abap.clnt`, rewritten to match the package (L-217) |
| `BUKRS` | yes | `BUKRS` | company code |
| `RFHA` | yes | `TB_RFHA` | financial transaction |
| `LOANAMT` | no | `TB_LIMIT_AMOUNT` | currency field, ref. `ZFS_T_TRM_LOAN-CURR` |
| `INTAMT` | no | `TB_LIMIT_AMOUNT` | currency field, ref. `ZFS_T_TRM_LOAN-CURR` |
| `CURR` | no | `WAERS` | currency key |
| `LOCAL_CREATED_BY` | no | `ABP_CREATION_USER` | audit block — added 2026-08-16, see below |
| `LOCAL_CREATED_AT` | no | `ABP_CREATION_TSTMPL` | audit block |
| `LOCAL_LAST_CHANGED_BY` | no | `ABP_LOCINST_LASTCHANGE_USER` | audit block |
| `LOCAL_LAST_CHANGED_AT` | no | `ABP_LOCINST_LASTCHANGE_TSTMPL` | audit block — BO ETag |
| `LAST_CHANGED_AT` | no | `ABP_LASTCHANGE_TSTMPL` | audit block — BO total-etag lock |

**Correction, 2026-08-16:** the five audit fields mandated by `docs/ddic-table-template.md`
were missing from the first version of this table. They were added and the table reactivated
at the start of the RAP build (`worklog/DS4_100_NIIF/2026-08-16-rap-managed-trmloan.md`), see L-218.

Technical settings: table category `#TRANSPARENT`, delivery class `#A`,
data maintenance `#RESTRICTED`, enhancement category `#NOT_EXTENSIBLE` — all matching
sibling `ZFS_NY_TRMT006` in the same package (L-217).

## Delivery checks

- [x] Pretty Printer — n/a for a DDIC table source
- [x] Syntax check clean (activation would have failed otherwise)
- [x] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved (not requested; not run)
- [x] ABAP Unit — none applicable (DDIC object, no code)
- [x] Text symbols and selection texts — none (no program object)
- [x] Object list confirmed in the transport

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-217.
