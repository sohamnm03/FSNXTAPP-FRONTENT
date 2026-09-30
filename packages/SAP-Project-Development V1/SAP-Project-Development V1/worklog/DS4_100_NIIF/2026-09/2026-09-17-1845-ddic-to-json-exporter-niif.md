# DDIC table metadata → JSON exporter, ported to NIIF (ZFS_DYN_GW, DS4K907263)

- **Date:** 2026-09-17
- **Started:** 18:45
- **System:** DS4_100_NIIF
- **Package:** `ZFS_DYN_GW`
- **Transport:** `DS4K907263` ("SLC: BTP K2 on 04.09.2026"), task `DS4K907264` — **3 of 4 objects. See the open issue below.**
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Port the DDIC→JSON exporter already built and proved on `DS4_100_TFSIN`
(`worklog/DS4_100_TFSIN/2026-09/2026-09-17-1354-ddic-to-json-mysql-exporter.md`) onto NIIF, into a
real package on a real transport. The human chose the **class + report + 2 includes** object set
(offered against three alternatives), i.e. the same architecture approved there as option (a).

Out of scope: the single self-contained variant `ZFS_R_XA_DDIC2JSON`, which stays on TFSIN only.

## Naming gate

Validated against `docs/naming-conventions.md` **before** each create call:

```
NAMING: ZCL_FS_XA_TBL2JSON     -> matches ABAP OO row "Class: ZCL_FS_<AREA>_<NAME>", AREA=XA (cross-app)
NAMING: ZFS_R_XA_TBL2JSON      -> matches Classic & Misc row "Program/report: ZFS_R_<AREA>_<NAME>", AREA=XA
NAMING: ZFS_R_XA_TBL2JSON_TOP  -> matches Classic & Misc row "Includes are the report name plus a suffix (_TOP)"
NAMING: ZFS_R_XA_TBL2JSON_F01  -> matches Classic & Misc row "Includes are the report name plus a suffix (_F01)"
```

`abap_creation-run_validation` answered "Class validated successfully" for the class against
`ZFS_DYN_GW`. Collision check first: `ZCL_FS_XA_*` was empty on NIIF and `ZFS_R_XA_*` held only the
unrelated `ZFS_R_XA_USRREC` family, so no name was taken.

**On `AREA=XA` inside package `ZFS_DYN_GW`.** The area code describes what the object *is*, not
where it is filed. `DYN` was added to the convention for the dynamic-dispatch framework
(L-376); this exporter is a general DDIC utility that the human chose to file in that package, so
`XA` (cross-app) remains the correct area. Package placement is not an area code.

## Open issue — the class is on the WRONG transport

| Object | Type | Transport | Task |
|---|---|---|---|
| `ZFS_R_XA_TBL2JSON` | `PROG/P` | **`DS4K907263`** ✔ | `DS4K907264` |
| `ZFS_R_XA_TBL2JSON_TOP` | `PROG/I` | **`DS4K907263`** ✔ | `DS4K907264` |
| `ZFS_R_XA_TBL2JSON_F01` | `PROG/I` | **`DS4K907263`** ✔ | `DS4K907264` |
| `ZCL_FS_XA_TBL2JSON` | `CLAS/OC` | **`DS4K907306`** ✘ auto-generated | `DS4K907307` |

Cause and the full trap are in **L-546**. In short: `adt-mcp`'s `create_object` has no transport
field, so the class was recorded on a system-generated request ("Generated Request for Change
Recording"), and the tool then threw `An exception has occurred that was not caught` **after having
already created the object**. Once recorded there, SAP refuses to move it by writing source with a
different transport: `Object LIMU CLSD ZCL_FS_XA_TBL2JSON is already locked in request DS4K907306`.

Attempted fix — `transportDelete` on `DS4K907307` — was **refused by the harness classifier**
(`Irreversible Deletion`). Not worked around; handed to the human.

**What the human must do:** move `ZCL_FS_XA_TBL2JSON` from `DS4K907306` into `DS4K907263` in SE09
(*Request/Task → Object List → move objects to another request*), or authorise the deletion of
`DS4K907306`. **Until then, releasing `DS4K907263` alone would ship a report whose class is
missing** — the import into PS4 would fail to activate.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_XA_TBL2JSON` | `CLAS/OC` | `ZFS_DYN_GW` | `DS4K907306` (wrong) | **active**, source complete |
| `ZFS_R_XA_TBL2JSON` | `PROG/P` | `ZFS_DYN_GW` | `DS4K907263` | **active** |
| `ZFS_R_XA_TBL2JSON_TOP` | `PROG/I` | `ZFS_DYN_GW` | `DS4K907263` | **active** |
| `ZFS_R_XA_TBL2JSON_F01` | `PROG/I` | `ZFS_DYN_GW` | `DS4K907263` | **active** |

Four objects, the set the human chose. No message class (the report contains no `MESSAGE`
statement), no test class, no helper.

## Routing note — a rule-5 fallback, with its reason

Working agreement §5 says `adt-mcp` creates. It could not here: its create schema exposes only
`packageName`/`name`/`description` and **cannot accept a transport**, which a transportable package
requires. The remaining three objects were therefore created with
`mcp-abap-abap-adt-api createObject`, which takes `transport` explicitly — and they landed on
`DS4K907263` correctly. This is the "adt-mcp genuinely cannot do it" carve-out, recorded here as
§5 requires.

## Delivery checks

- [x] Syntax check clean — activation reported no errors
- [x] Activated, nothing left inactive — `inactiveObjects` on NIIF lists only pre-existing
      `ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID` from other
      work; **none of these four**
- [x] ATC — **0 errors, 0 warnings**, 21 priority-3 infos, identical profile to the TFSIN build
- [x] Ran live on NIIF: `T000` 17 fields / `Clients`, `MARA` 307 fields / `General Material Data`,
      `NO_SUCH_TABLE` reported as an in-document error. JSON machine-validated, 159,207 chars
- [ ] Text symbols and selection texts — **handed to the human**, same six as on TFSIN
      (`TEXT-b01`, `TEXT-b02`, `S_TAB`, `P_SHOW`, `P_DOWN`, `P_FILE`). Cosmetic
- [ ] ABAP Unit — none applicable; no test class was requested (rule 3)
- [ ] **Object list confirmed in the transport — NO.** 3 of 4. See the open issue above

## Heads-up not caused by this activity

`DS4K907264` — the same task these objects are on — already carries **inactive** objects from
earlier work: `ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`. A release of
`DS4K907263` will carry them too, in whatever state they are in. Worth checking before release;
untouched by this activity.

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-17-1845-ddic-to-json-exporter-niif/`

## Lessons raised

L-546.
