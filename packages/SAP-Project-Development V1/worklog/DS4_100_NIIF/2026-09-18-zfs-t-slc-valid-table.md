# Create table ZFS_T_SLC_VALID (co_code, txn_no, start_date, end_date) in package ZFS_SLC_BTP

- **Date:** 2026-09-18
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** adil.a@fourthsignal.com

## Scope

Human asked for a custom table with fields company code, txn no (domain `TB_RFHA`), start date and
end date, in package `ZFS_SLC_BTP`, on transport `DS4K907263`. No table name was given, so per the
naming gate (`docs/naming-conventions.md`) the name was cleared with the human before any create
call, along with key structure and date domains — following the closest precedent in
`docs/ddic-table-template.md` (the "Facility for RAP" reference: `co_code BUKRS`, `txn_no TB_RFHA`
as keys, `start_date DBLFZ`, `end_date DELFZ`), minus that reference's `bp`/`bp_name`/`limit_amt`/
`currency` fields, which were not requested. Out of scope: any RAP layer, CDS views, generators —
table only, per L-216 (no unrequested objects).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Table name (`<NAME>` in `ZFS_T_SLC_<NAME>`)? | `ZFS_T_SLC_VALID` | 2026-09-18 |
| 2 | Should co_code/txn_no be key fields? | Yes, matching the reference template | 2026-09-18 |
| 3 | Domains for start_date/end_date — DBLFZ/DELFZ or DATS? | DBLFZ / DELFZ (matches TB_RFHA's TRM area) | 2026-09-18 |

## Naming gate

```
NAMING: ZFS_T_SLC_VALID -> matches pattern row "Transparent table | ZFS_T_<AREA>_<NAME>" (AREA=SLC,
precedented by the already-conformant ZFS_T_SLC_DYNGW in the same package), max 16 chars
(ZFS_T_SLC_VALID = 15), docs/naming-conventions.md §Dictionary
```

## Open questions (2)

| # | Question | Answer | Answered on |
|---|---|---|---|
| 4 | `adt-mcp` unreachable (L-333/L-338 symptom) and `TABL/DT` is not a confirmed rule-5 fallback case — proceed how? | Human broadened the standing routing rule (L-339): `mcp-abap-abap-adt-api` may create any object type when `adt-mcp` is confirmed unreachable. `CLAUDE.md`, `AGENTS.md` §"Choosing between MCP servers" and the ledger (L-333/L-338 marked superseded by L-339) updated in the same turn. | 2026-09-18 |

## Todo

- [x] 1. Naming gate — clear name/keys/domains with human, record answers
- [x] 2. `adt-mcp` create attempt — confirmed unreachable (L-333 probe), human broadened routing
      rule (L-339), standing docs updated
- [x] 3. Create table skeleton via `mcp-abap-abap-adt-api` `createObject` (fallback per L-339) —
      `validateNewObject` falsely reported "Unsupported object type" first (MCP wrapper bug, see
      L-340); `createObject` with discrete fields worked correctly
- [x] 4. Set full field source via `mcp-abap-abap-adt-api setObjectSource` (key mandt : mandt,
      key co_code : bukrs, key txn_no : tb_rfha, start_date : dblfz, end_date : delfz, + 5
      mandatory audit fields per `docs/ddic-table-template.md`, `key mandt : mandt` per L-217)
- [x] 5. Activate — clean, no inactive objects
- [x] 6. Read back and verify active definition

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_SLC_VALID | TABL/DT | ZFS_SLC_BTP | DS4K907263 | **Active** |

## Field list

| Field | Key | Data element | Notes |
|---|---|---|---|
| `MANDT` | yes | `MANDT` | client — written as `key mandt : mandt` per L-217, not the generator's `abap.clnt` default |
| `CO_CODE` | yes | `BUKRS` | company code |
| `TXN_NO` | yes | `TB_RFHA` | transaction number, as requested |
| `START_DATE` | no | `DBLFZ` | TRM validity-period domain, human-confirmed |
| `END_DATE` | no | `DELFZ` | TRM validity-period domain, human-confirmed |
| `LOCAL_CREATED_BY` | no | `ABP_CREATION_USER` | mandatory audit block, `docs/ddic-table-template.md` |
| `LOCAL_CREATED_AT` | no | `ABP_CREATION_TSTMPL` | audit block |
| `LOCAL_LAST_CHANGED_BY` | no | `ABP_LOCINST_LASTCHANGE_USER` | audit block |
| `LOCAL_LAST_CHANGED_AT` | no | `ABP_LOCINST_LASTCHANGE_TSTMPL` | audit block — BO ETag |
| `LAST_CHANGED_AT` | no | `ABP_LASTCHANGE_TSTMPL` | audit block — BO total-etag lock |

Technical settings: `#TRANSPARENT`, delivery class `#A`, data maintenance `#RESTRICTED`
(generator default, unchanged), enhancement category `#NOT_EXTENSIBLE`.

## Delivery checks

- [x] Pretty Printer — n/a for a DDIC table source
- [x] Syntax check clean (activation would have failed otherwise)
- [x] Activated, nothing left inactive (`activateObjects` returned `inactive: []`)
- [ ] ATC / Code Inspector — priority 1 and 2 resolved (not requested; not run)
- [x] ABAP Unit — none applicable (DDIC object, no code)
- [x] Text symbols and selection texts — none (no program object)
- [x] Object list confirmed in the transport

## Blocker (resolved via routing-rule change, not via `adt-mcp` recovery)

`adt-mcp` had lost its VS Code ADT project/destination context — same root cause as
`lessons/lessons-ledger.md` L-333, recurring exactly as L-338 already documented for `TABL/DT`
(see `worklog/DS4_100_NIIF/2026-09-17-zfs-t-xa-dummy-table.md`, still unresolved a day later).
Confirmed today: `abap_list_destinations` returned `[]`; `abap_creation-get_all_creatable_objects`
for `DS4_100_NIIF` and `DS4` both failed with `Cannot invoke IProject.getSessionProperty(...)
because "project" is null"`; `abap_generators-list_generators` failed with `Error: no project found
for DS4_100_NIIF`. Per the then-current rule (L-338), `TABL/DT` was not a confirmed fallback case
and the block was reported to the human rather than worked around. The human then explicitly
instructed the routing rule be broadened project-wide (L-339): `mcp-abap-abap-adt-api` may create
any object type when `adt-mcp` is confirmed unreachable. `CLAUDE.md`/`AGENTS.md` were updated in
the same turn before the create call was retried. `adt-mcp` itself was **not** restored this
session — the fallback path is what unblocked the build.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity:
- **L-339** — human broadened the rule-5 fallback to cover any object type when `adt-mcp` is
  confirmed unreachable. L-333's "closes a rule-5 gap" finding and L-338 marked superseded by
  L-339. `CLAUDE.md` and `AGENTS.md` §"Choosing between MCP servers" updated in the same turn per
  L-221.
- **L-340** — `mcp-abap-abap-adt-api`'s `validateNewObject` MCP tool always answers "Unsupported
  object type", for every object type including ones `createObject` handles correctly (`TABL/DT`
  confirmed here): the wrapper forwards the raw `options` string straight to the underlying API's
  `options.objtype` lookup without parsing it as JSON first, so the type lookup always misses.
  Skip `validateNewObject` on this server and go straight to `createObject` with discrete fields.
