# Artifact Naming Conventions — ZFS Namespace

All custom objects begin with **ZFS**. Pattern: `ZFS_<TYPE>_<AREA>_<NAME>` where AREA is a
2–4 char module code (SD, MM, FI, PP, EWM, HR, TRM, XA=cross-app). Max lengths per SAP object type apply.
`HR` added 2026-08-03 on human decision at the `ZFS_T_HR_EMPLOYEE` intake — employee/personnel
objects had no conformant home, and `XA` (cross-app) was the only alternative.
`DYN` added 2026-09-12 on human decision at the dynamic-gateway v2 intake (package `ZFS_DYN_GW`),
covering the generic dynamic-dispatch framework — see `lessons-ledger.md` L-376. A human who
supplies a prefix such as "`ZFS_DYN*`" is naming the **area**, not asking for a literal prefix:
the tier marker still comes first, so the conformant table is `ZFS_T_DYN_REG`, not `ZFS_DYN_REG`.

**A derived name never inherits non-conformance.** When an object is a copy, variant or successor
of an existing object, its name is validated against the pattern table below **independently of
the source's name** — a non-conformant source (e.g. a pre-framework `ZFS_P_*` table) does not
license a non-conformant copy. This binds every actor that proposes a name: the **orchestrator**
when it offers name options to the human, `plan-agent` when it freezes the object list, and the
**reviewer**, for whom a new object created non-conformant is a **Major**, not a Minor — "the plan
named it" is not a defence, because the plan's name was supposed to be validated here first
(`lessons-ledger.md` L-013).

**Pre-create gate — validation happens BEFORE the object exists, not at review** (L-027, human
correction 2026-08-02 after `ZFS_T_RAP_ACC` was built non-conformant and caught only post-build).
The build agent re-validates the frozen name against the pattern table and the exceptions list
**immediately before** `validateNewObject`/`createObject` and records a one-line
`NAMING: <name> → matches <pattern row | exception row>` statement in its report *before* the
create call. On a mismatch it **stops and escalates without creating** — a human-chosen name is
an input to validate, not an exemption; the human may not have been told it deviates. A build
report whose create step carries no `NAMING:` line is incomplete (same standing as a missing
reuse line, `agent-framework.md` §8.3).

**Documented exceptions** — human-approved deviations. An exception is recorded here with date and
scope; it covers exactly the named object, never a pattern. A reviewer finding against a listed
object is closed as *human-overridden*, not as wrong.

| Object | Deviation | Approved | Scope note |
|---|---|---|---|
| `ZFS_T_RAP_COPY` | `<AREA>` = `RAP` (technical pattern, not a module code); `<NAME>` = `COPY` (provenance) | human, 2026-08-02 | copy of the pre-framework `ZFS_P_RAP`; the human's requirement was the `ZFS_T_` prefix, accepted to avoid orphaning a third table |
| `ZFS_T_RAP_ACC` | `<AREA>` = `RAP` (technical pattern, not a module code) | human, 2026-08-02 | structural copy of `ZFAC_RAP`; name proposed by the orchestrator and chosen by the human before the pattern check ran (L-013 recurrence, see L-026); approved post-review to keep the already-active, otherwise-clean object |
| `ZR_FS_ODEMO_T012` | `<AREA>` = `ODEMO` (demo-domain tag on the base table itself, not a module code); no `ZFS_` prefix (RAP CDS naming row, not the DDIC row) | human, 2026-08-14 | RAP managed root view over `ZFS_ODEMO_T012` (Counterparty-Interest-Details); matches the naming already live for sibling `ZR_FS_ODEMO_T002/T003/T006/T009/T013` from the same 2026-08-13 generator batch — human chose family consistency over `AREA=TRM` compliance at `ZFS_ODEMO_T012_MGD` intake |
| `ZC_FS_ODEMO_T012` | same as above | human, 2026-08-14 | projection view, same work item and scope note as `ZR_FS_ODEMO_T012` |
| `ZBP_FS_ODEMO_T012` | same as above | human, 2026-08-14 | behavior pool class, same work item and scope note as `ZR_FS_ODEMO_T012` |
| `ZAPI_FS_ODEMO_T012_O4` | same as above | human, 2026-08-14 | service definition + binding (Web API, `_O4` = OData V4), same work item and scope note as `ZR_FS_ODEMO_T012` |
| `ZFS_SLC_DTTK_BTP` | `<NAME>` segment omits the `_T_` transparent-table tier marker (pattern calls for `ZFS_T_<AREA>_<NAME>`) | human, 2026-09-04 | copy of `ZSGSLCTR_DTTK` (package `ZSGSLC`) into `ZFS_SLC_BTP`, plus the 5 standard audit fields; mirrors the identical deviation already live on sibling `ZFS_SLC_OTTK_BTP` in the same package — a fully compliant `ZFS_T_SLC_DTTK_BTP` would be 18 characters, over the platform's 16-char cap (L-099); human directed the exact name |
| `ZFS_I_SlcDttkFee` | RAP BO **root** view named `ZFS_I_` where the CDS/RAP row calls for `ZFS_R_<Entity>TP` ("never `ZFS_I_<Entity>`") | human, 2026-09-08 | root view of the DTTK fee BO over `ZSGSLCTR_FEEDATA`; mirrors the identical deviation already live on its twin `ZFS_I_SlcOttkFee`, so the two fee BOs stay readable as one pattern. Human chose family consistency over the root-view row when the gate raised the mismatch. The projection (`ZFS_C_SlcDttkFeeTP`) and behavior pool (`ZBP_FS_SLCDTTKFEETP`) are fully conformant |
| `ZFS_I_DynGateway` | RAP BO **root** view named `ZFS_I_` where the CDS/RAP row calls for `ZFS_R_<Entity>TP` ("never `ZFS_I_<Entity>`") | human, 2026-09-09 | root view of the dynamic OData gateway BO over `ZFS_T_SLC_DYNGW`. Unlike the two fee-BO rows above, this one is **platform-forced, not stylistic**: `abap_creation-run_validation` rejects `implementationType: Unmanaged` on a root entity that is `as projection on` another view (`docs/rap-unmanaged-web-api-pattern.md` §1), so the BDEF must sit on a view selecting directly from the table. Human chose this over probing `ZFS_R_DynGatewayTP` first, because a shell created before the rejection cannot be removed (`deleteObject` is denied project-wide) and would be orphaned in `ZFS_SLC_BTP` permanently. The projection (`ZFS_C_DynGatewayTP`), behavior pool (`ZBP_FS_DYNGATEWAYTP`), table (`ZFS_T_SLC_DYNGW`), lock object (`EZFS_T_DYNGW`), service definition and binding are all fully conformant |

## Dictionary (DDIC)
| Object | Pattern | Example |
|---|---|---|
| Transparent table | `ZFS_T_<AREA>_<NAME>` — **max 16 chars, platform-enforced** (L-099) | `ZFS_T_SD_ORDLOG` |
| Structure | `ZFS_S_<AREA>_<NAME>` (30) | `ZFS_S_SD_ORDER_ITEM` |
| Table type | `ZFS_TT_<AREA>_<NAME>` | `ZFS_TT_SD_ORDER_ITEM` |
| Data element | `ZFS_DE_<NAME>` | `ZFS_DE_APPROVAL_STATUS` |
| Domain | `ZFS_DO_<NAME>` | `ZFS_DO_APPROVAL_STATUS` |
| Lock object | `EZFS_T_<NAME>` | `EZFS_T_SD_ORDLOG` |
| Search help | `ZFS_SH_<NAME>` | `ZFS_SH_CARRIER` |
| Number range | `ZFS_NR_<NAME>` | `ZFS_NR_TICKETID` |

## CDS / RAP (VDM-style layering)

**What `<Entity>` is.** One CamelCase business-object name, reused verbatim across the whole stack.
For a **transactional** BO the `TP` ("transactional processing") suffix is **part of `<Entity>`**, so
it appears exactly once and only on the layers that carry behavior:

| Layer | Carries `TP`? | Example (`<Entity>` = `SalesOrderTP`) |
|---|---|---|
| Interface view `ZFS_I_` | no — strip it; interface views are not transactional | `ZFS_I_SalesOrder` |
| Root view `ZFS_R_` · projection `ZFS_C_` · metadata extension · both BDEFs | **yes** | `ZFS_R_SalesOrderTP`, `ZFS_C_SalesOrderTP` |
| Behavior pool `ZBP_FS_` | yes (upper case) | `ZBP_FS_SALESORDERTP` |
| Service definition `ZFS_SD_` · service binding `ZFS_SB_` | no — strip it | `ZFS_SD_SALESORDER`, `ZFS_SB_SALESORDER_O4_UI` |
| Local classes `LHC_`/`LSC_`/`LTC_` | no — strip it | `LHC_SALESORDER` |

Never append `TP` to a pattern that already ends in `<Entity>` — that is how `ZFS_C_<Entity>TP`
yields `ZFS_C_SalesOrderTPTP`. A purely analytical or read-only view takes no `TP` at all.

| Object | Pattern | Example |
|---|---|---|
| Interface (basic/composite) view | `ZFS_I_<Entity>` | `ZFS_I_SalesOrder` |
| Consumption / projection view | `ZFS_C_<Entity>` | `ZFS_C_SalesOrderTP` |
| Restricted reuse view | `ZFS_R_<Entity>` | `ZFS_R_SalesOrderTP` (RAP BO root) |
| Analytical cube / query | `ZFS_A_<Entity>` / `ZFS_AQ_<Entity>` | `ZFS_A_SalesKPI` |
| Custom entity | `ZFS_CE_<Entity>` | `ZFS_CE_PriceSimulation` |
| Abstract entity | `ZFS_AE_<Entity>` | `ZFS_AE_ActionParams` |
| Behavior definition | same as root view | `ZFS_R_SalesOrderTP` |
| Behavior implementation class | `ZBP_FS_<Entity>` | `ZBP_FS_SALESORDERTP` |
| Metadata extension | `ZFS_C_<Entity>` (matching view) | `ZFS_C_SalesOrderTP` |
| **Access control (DCL, `DCLS/DL`)** | **same name as the view it protects** — the platform pairs them by name, so there is no independent pattern to satisfy (L-122) | `ZFS_R_SalesOrderTP` protecting `ZFS_R_SalesOrderTP` |
| Service definition | `ZFS_SD_<Entity>` | `ZFS_SD_SALESORDER` |
| Service binding | `ZFS_SB_<Entity>_<O2/O4>_<UI/API>` | `ZFS_SB_SALESORDER_O4_UI` |
| Event binding | `ZFS_EB_<Entity>_<Event>` | `ZFS_EB_SALESORDER_RELEASED` |

**Local classes inside a behavior pool** (`ZBP_FS_<Entity>`):

| Object | Pattern | Example |
|---|---|---|
| Behavior handler | `LHC_<Entity>` | `LHC_SALESORDER` |
| Saver | `LSC_<Entity>` | `LSC_SALESORDER` |
| Event handler | `LEV_<Entity>` | `LEV_SALESORDER` |
| Test class | `LTC_<Entity>_<Aspect>` | `LTC_SALESORDER_CREATE` |

One handler instance exists **per entity**, one saver **per business object** — so a BO has exactly
one `LSC_`, however many entities it has. Handler and saver `CLASS … DEFINITION` **and**
`IMPLEMENTATION` blocks both live in the pool's `implementations` include; the `definitions`
include stays the auto-generated template comment (`rap-managed-standards.md` §6, L-198).

**CDS field and alias names are CamelCase** (`TravelId`, `CreatedAt`) — not underscored, and no
Hungarian notation. The conventional RAP signature names are the exception and keep their SAP
spelling: `keys`, `entities`, `result`, `mapped`, `failed`, `reported`.

The BO root view is `ZFS_R_<Entity>` — **never** `ZFS_I_<Entity>`, and never a bare `Z`/`ZI_`/`ZC_`
prefix. This is the single most common naming defect in RAP work here.

## ABAP OO
| Object | Pattern | Example |
|---|---|---|
| Class | `ZCL_FS_<AREA>_<NAME>` | `ZCL_FS_SD_ORDER_PROCESSOR` |
| Interface | `ZIF_FS_<AREA>_<NAME>` | `ZIF_FS_SD_ORDER_API` |
| Exception class | `ZCX_FS_<NAME>` | `ZCX_FS_ORDER_NOT_FOUND` |
| Test class (local) | `LTC_<NAME>` | `LTC_ORDER_PROCESSOR` |
| Test double | `LTD_<NAME>` | `LTD_ORDER_DAO` |
| Factory / injector | `ZCL_FS_<NAME>_FACTORY` | `ZCL_FS_ORDER_FACTORY` |
| RAP transactional buffer | `ZCL_FS_<AREA>_<NAME>_BUFFER` | `ZCL_FS_SD_ORDER_BUFFER` |
| RAP query provider (`IF_RAP_QUERY_PROVIDER`) | `ZCL_FS_<AREA>_<NAME>_QUERY` | `ZCL_FS_SD_PRICESIM_QUERY` |

## Classic & Misc
- Program/report: `ZFS_R_<AREA>_<NAME>`. **Includes are the report name plus a suffix** —
  `_TOP` (declarations + selection screen), `_F01` (processing, local classes), `_TST` (optional
  tests). Example: `ZFS_R_SD_ORDERLIST_TOP`. Layout and contents: `alv-report-standards.md` §2–§3.
  Never name an include `ZFS_I_<NAME>` — that prefix belongs to CDS interface views.
- Function group / FM: `ZFS_FG_<NAME>` / `ZFS_FM_<NAME>` (RFC: `ZFS_RFC_<NAME>`)
- Enhancement implementation: `ZFS_EI_<EXITPOINT>` — BAdI impl: `ZFS_BADI_<NAME>`
- **Message class: `ZFS_TRM_MSG` — a single, project-wide class, and a LISTED EXCEPTION to the
  `<AREA>` pattern** (L-210, human instruction 2026-08-16). All new development takes its messages
  from this one class; **no new message class is created, and no per-area class is extended.**
  The name does not match the `ZFS_MSG_<AREA>` pattern below and does not need to — it is named by
  the human. A `NAMING:` line citing **this row** is what validates it; do not "correct" it to
  `ZFS_MSG_<AREA>`.
  - **Pick messages from `docs/message-catalog/<system-id>.md`**, the local mirror of the class
    for that system. Do not query
    `T100` for routine lookups. If no suitable message exists, create it in `ZFS_TRM_MSG`, add it
    to the catalog in the same turn, and list it in the completion report.
  - **Messages are never replaced by text symbols.** A user-facing message that has no catalog
    entry is a reason to create the message, not a reason to fall back to `TEXT-xxx` (L-211).
  - **`ZFS_TEST_VS` is superseded** (it was the mandated class from 2026-08-06 to 2026-08-16 under
    L-154). It stays readable history — cite it when reading existing code, never extend it.
  - `ZFS_MSG_<AREA>` (`ZFS_MSG_FI`, `ZFS_MSG_SD`, …) and the assorted legacy classes
    (`ZFS_M01`, `ZFS_MC_AP`, …) are **read-only history**: cite them when reading existing code,
    never extend them, never create another.
- Transaction: `ZFS_<NAME>`
- Package: `ZFS_<AREA>` under superpackage `ZFS_ROOT`; app packages `ZFS_<AREA>_<APP>`
- Authorization object: `ZFS_<NAME>` (10 chars max)
- IDoc/Proxy/API: `ZFS_API_<NAME>`; OData V4 API bindings end `_O4_API`

## Inside code (Clean ABAP compatible)
Prefer descriptive names without Hungarian noise in new code; where prefixes are mandated:
importing `iv_/is_/it_/io_`, exporting `ev_/es_/et_/eo_`, changing `cv_/cs_/ct_`,
returning `rv_/rs_/rt_/ro_`, local `lv_/ls_/lt_/lo_`, member `mv_/ms_/mt_/mo_`,
constants `c_`, field-symbols `<fs_...>` or `<ls_...>`.
