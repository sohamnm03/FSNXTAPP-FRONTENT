# RAP managed scenario over ZFS_T_TRM_LOAN (TrmLoan BO)

- **Date:** 2026-08-16
- **System:** DS4_100_NIIF
- **Package:** ZFS_K2_CC_VS
- **Transport:** DS4K907018 ("FY-26 : TRM Demo"), task DS4K907019
- **Requested by:** human

## Scope

Full RAP **managed, draft-enabled** business object over the existing transparent table
`ZFS_T_TRM_LOAN`, exposed as an OData V4 **UI** service, generated with the `uiservice`
RAP generator. Includes the access control (DCL) the `#CHECK` annotation requires and
publishing the service binding. Out of scope: additional save, determinations,
validations, custom actions, a Fiori Elements app project — none were requested (L-216).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | UI service or Web API? Draft or not? | Human replied "try now" — proceeded with `uiservice` (OData V4 UI) and the generator's draft default. Reversible: a Web API binding can be added later without touching the BO. | 2026-08-16 |

## Naming gate

Recorded before the generate call (L-027). The generator's *suggested* names
(`ZR_FS_T_TRM_LOAN`, `ZC_FS_T_TRM_LOAN`, `ZBP_FS_T_TRM_LOAN`, `ZUI_FS_T_TRM_LOAN_O4`) were
**discarded** — they do not match `docs/naming-conventions.md` (runbook §2).

```
NAMING: ZFS_R_TrmLoanTP      -> matches CDS/RAP row "Restricted reuse view" ZFS_R_<Entity>
NAMING: ZFS_C_TrmLoanTP      -> matches CDS/RAP row "Consumption / projection view" ZFS_C_<Entity>
NAMING: ZBP_FS_TRMLOANTP     -> matches CDS/RAP row "Behavior implementation class" ZBP_FS_<Entity>
NAMING: ZFS_SD_TRMLOAN       -> matches CDS/RAP row "Service definition" ZFS_SD_<Entity> (TP stripped)
NAMING: ZFS_SB_TRMLOAN_O4_UI -> matches CDS/RAP row "Service binding" ZFS_SB_<Entity>_O4_UI, 20 <= 26
NAMING: ZFS_T_TRM_LOAN_D     -> matches DDIC row "Transparent table" ZFS_T_<AREA>_<NAME>,
                                AREA=TRM, NAME=LOAN_D, 16 chars = cap (L-099)
NAMING: ZFS_R_TRMLOANTP (DCL)-> matches CDS/RAP row "Access control (DCL)" — same name as the
                                view it protects (L-122)
```

The generator upper-cased the submitted CamelCase CDS names on creation
(`ZFS_R_TrmLoanTP` → `ZFS_R_TRMLOANTP`) — see L-219. Pattern compliance is unaffected.

## Todo

- [x] 1. Read `docs/rap-managed-additional-save-pattern.md` and `docs/ddic-table-template.md`
- [x] 2. Add the 5 mandated audit fields to `ZFS_T_TRM_LOAN` and reactivate (L-218)
- [x] 3. Search for name collisions on the whole `TrmLoan` stack — none found
- [x] 4. `abap_generators-get_schema` (`uiservice`, TABL `ZFS_T_TRM_LOAN`)
- [x] 5. Record the `NAMING:` lines, then `abap_generators-generate_objects`
- [x] 6. Activate all 9 generated objects in one `activateObjects` call
- [x] 7. Create + activate the DCL `ZFS_R_TRMLOANTP` (runbook §5)
- [x] 8. ATC run — 0 findings
- [x] 9. Publish the service binding and **verify** `isPublished` (runbook §6)
- [x] 10. Completion report

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_TRM_LOAN` | `TABL/DT` | ZFS_K2_CC_VS | DS4K907018 | Active — 5 audit fields added this session |
| `ZFS_R_TRMLOANTP` | `DDLS/DF` root view | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_R_TRMLOANTP` | `BDEF/BDO` behavior definition | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZBP_FS_TRMLOANTP` | `CLAS/OC` behavior pool | ZFS_K2_CC_VS | DS4K907018 | Active (empty — fully managed) |
| `ZFS_T_TRM_LOAN_D` | `TABL/DT` draft table | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_C_TRMLOANTP` | `DDLS/DF` projection view | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_C_TRMLOANTP` | `BDEF/BDO` projection behavior | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_C_TRMLOANTP` | `DDLX/EX` metadata extension | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_SD_TRMLOAN` | `SRVD/SRV` service definition | ZFS_K2_CC_VS | DS4K907018 | Active |
| `ZFS_SB_TRMLOAN_O4_UI` | `SRVB/SVB` service binding | ZFS_K2_CC_VS | DS4K907018 | Active + **published** |
| `ZFS_R_TRMLOANTP` | `DCLS/DL` access control | ZFS_K2_CC_VS | DS4K907018 | Active |

## Behavior summary (as generated)

```
managed implementation in class ZBP_FS_TRMLOANTP unique;
strict ( 2 );
with draft;

persistent table zfs_t_trm_loan
draft table       ZFS_T_TRM_LOAN_D
etag master       LocalLastChangedAt
lock master total etag LastChangedAt
authorization master( global )

create; update; delete;
draft actions Edit / Activate optimized / Discard / Resume / Prepare
field ( mandatory : create )  Bukrs, Rfha
field ( readonly : update )   Bukrs, Rfha
```

## Delivery checks

- [x] Pretty Printer — n/a (CDS/DDIC/BDEF; behavior pool is the generated shell)
- [x] Syntax check clean
- [x] Activated, nothing left inactive (`activateObjects` returned `inactive: []`)
- [x] ATC / Code Inspector — 0 findings, so no priority 1 or 2 open
- [x] ABAP Unit — none applicable (no hand-written behavior logic to test)
- [x] Text symbols and selection texts — none (no program object; UI labels come from the
      SAP data elements `BUKRS`, `TB_RFHA`, `TB_LIMIT_AMOUNT`, `WAERS`)
- [x] Object list confirmed in the transport (`transportInfo` on the root view and the
      binding both show TRKORR `DS4K907018`, task `DS4K907019`)
- [x] Service binding published — verified `isPublished: true` via `fetch_services`

## Open items for the human

1. **DCL grants unrestricted select.** `ZFS_R_TRMLOANTP` is the minimal open-access form
   (`grant select on ZFS_R_TRMLOANTP;`). If this data should be gated on an authorization
   object (e.g. company code via `F_BKPF_BUK`), say so and it can be tightened.
2. **`##GENERATED` label.** The root view carries
   `@EndUserText.label: '##GENERATED TRM Loan Amounts'` and the binding description shows the
   same. Cosmetic; can be cleaned up on request.
3. **No `AREA` in the CDS names.** The CDS/RAP pattern is `ZFS_R_<Entity>` with no module
   code, so `TrmLoan` carries the TRM sense in the entity name itself. That is the documented
   pattern, not a deviation.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-218, L-219, L-220.
