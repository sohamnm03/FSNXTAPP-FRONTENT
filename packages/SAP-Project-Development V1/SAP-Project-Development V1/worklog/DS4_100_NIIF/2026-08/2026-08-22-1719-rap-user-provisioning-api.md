# RAP OData V4 Web API — Third-Party SAP User Creation/Provisioning

- **Date:** 2026-08-22
- **System:** DS4_100_NIIF
- **Package:** ZFS_K2_CC_VS
- **Transport:** DS4K907018
- **Requested by:** Saumya S (saumya.s@fourthsignal.com)

## Scope

Build a hand-coded unmanaged RAP Business Object exposed as an OData V4 Web API so a third-party
application can create, update and delete SAP users (dialog/communication/system/service) by
calling an inbound endpoint. The BO's create/update/delete handlers call `BAPI_USER_CREATE1`,
`BAPI_USER_CHANGE` and `BAPI_USER_DELETE` — the only released mechanism to touch SU01-style user
data. Two tables: a live record (`ZFS_T_XA_USRREC`, mutated by update/deleted by delete) and a
separate append-only history log (`ZFS_T_XA_USRLOG`, one row per attempt, never updated/deleted).
Explicitly out of scope: role/authorization-profile assignment at creation time (a separate
downstream process); draft (not enabled); ABAP Unit test classes (not requested).

Full design: `C:\Users\karth\.claude\plans\requirment-sap-user-tender-lighthouse.md` (plan file,
approved 2026-08-22).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | User type(s) to support | Depends on payload — DIALOG/COMMUNICATION/SYSTEM/SERVICE | 2026-08-22 |
| 2 | Extra scope at creation | Initial password + force-change-at-logon, user group + address data | 2026-08-22 |
| 3 | Package | ZFS_K2_CC_VS (existing) | 2026-08-22 |
| 4 | Draft (L-224) | Not enabled — synchronous create/update/delete only | 2026-08-22 |
| 5 | AREA code | XA (cross-application fallback) | 2026-08-22 |
| 6 | Password intake mechanism | Plain entity field, masked/cleared before persistence | 2026-08-22 |
| 7 | BO shape | Full create + update + delete (needs a lock object) | 2026-08-22 |
| 8 | Handling if BAPI_USER_CREATE1/_CHANGE/_DELETE are flagged non-cloud-released by ATC | Proceed as a documented, object-scoped deviation (L-203 precedent), not a blocker | 2026-08-22 |
| 9 | Audit history durability | Separate append-only log table so history survives record update/delete | 2026-08-22 |
| 10 | Transport | No open TR found via `abap_transport-get` for ZFS_K2_CC_VS; human confirmed reuse of existing `DS4K907018` | 2026-08-22 |
| 11 | Is `UserGroup` mandatory for every user type? | Open — default optional until told otherwise | — |
| 12 | Exact inbound JSON field names, if a third-party spec exists | Open — using placeholder field names below until a spec is supplied | — |
| 13 | Is `BAPI_TRANSACTION_COMMIT` genuinely required after the BAPIs? | Open — verify via `abapDocumentation` during handler build | — |
| 14 | Do new users default to locked (needs `BAPI_USER_LOCACT`)? | Open — verify via live test, don't build speculatively | — |
| 15 | Expose `ZFS_T_XA_USRLOG` via OData now? | Open — default: no, internal-only for this build | — |
| 16 | Retry/idempotency semantics for a resent `RequestId`? | Open — documented as a v2 gap for now | — |

## Naming gate

Record one line per object **before** the create call (`docs/naming-conventions.md`, L-027):

```
NAMING: ZFS_T_XA_USRREC -> matches Dictionary row "Transparent table" ZFS_T_<AREA>_<NAME>, AREA=XA, 15<=16 chars
NAMING: ZFS_T_XA_USRLOG -> matches Dictionary row "Transparent table" ZFS_T_<AREA>_<NAME>, AREA=XA, 15<=16 chars
NAMING: ZFS_I_UserProvision -> matches CDS/RAP row "Interface view", unmanaged-root exception per docs/rap-unmanaged-web-api-pattern.md §1 (skips ZFS_R_...TP)
NAMING: ZFS_C_UserProvisionTP -> matches CDS/RAP row "Consumption/projection view" ZFS_C_<Entity>TP
NAMING: ZBP_FS_USERPROVISIONTP -> matches CDS/RAP row "Behavior implementation class" ZBP_FS_<Entity>
NAMING: LHC_USERPROVISION / LSC_USERPROVISION -> matches CDS/RAP row "Local classes inside a behavior pool" LHC_/LSC_<Entity> (TP stripped) — deviates from docs/rap-unmanaged-web-api-pattern.md's worked-example naming (...TP kept); live sibling ZBP_FS_TRMLOANTP's LHC_TRMLOAN confirms TP-stripped is the actual house style (L-226)
NAMING: EZFS_T_XA_USRREC -> matches Dictionary row "Lock object" EZFS_T_<NAME>
NAMING: ZFS_I_UserProvision (DCL) -> matches CDS/RAP row "Access control", same name as the view it protects (L-122)
NAMING: ZFS_SD_USERPROVISION -> matches CDS/RAP row "Service definition" ZFS_SD_<Entity>
NAMING: ZFS_SB_USERPROVISION_O4_API -> matches CDS/RAP row "Service binding" ZFS_SB_<Entity>_O4_API
```

## Todo

- [x] 1. Add messages 005–013 to `ZFS_TRM_MSG` (`mcp-abap-abap-adt-api`) + `docs/message-catalog.md`
- [x] 2. `ZFS_T_XA_USRREC` — skeleton (`adt-mcp`) + fields (`setObjectSource`) + activate
- [x] 3. `ZFS_T_XA_USRLOG` — skeleton (`adt-mcp`) + fields (`setObjectSource`) + activate
- [x] 4. `ZFS_I_UserProvision` — root view entity + unmanaged BDEF
- [x] 5. `ZFS_C_UserProvisionTP` — projection view + BDEF
- [x] 6. `ZFS_I_UserProvision` DCL
- [x] 7. `EZFS_T_XA_USRREC` lock object
- [x] 8. `ZBP_FS_USERPROVISIONTP` behavior pool — `LHC_UserProvision` + `LSC_UserProvision`
- [x] 9. Activate the whole CDS/BDEF/class/DCL set in one batch (activated incrementally; `inactiveObjects` confirms clean)
- [x] 10. `ZFS_SD_USERPROVISION` service definition
- [x] 11. `ZFS_SB_USERPROVISION_O4_API` service binding + publish + verify (GUI fallback needed, per L-220 — `publishServiceBinding` again returned false success; `/IWFND/V4_ADMIN` publish confirmed `isPublished: true`)
- [x] 12. Live verification (human-confirmed test calls) — create/update/delete + rejection paths. Tested via direct HTTP (curl with CSRF token) against the published OData V4 endpoint, since SAP GUI's `/IWFND/GW_CLIENT` body editor (`AbapEditor` ActiveX control) could not be set via the sap-gui MCP tool — see Object list note. Results:
  - CREATE (`COMMUNICATION` user `ZFSAPITEST1`) → HTTP 201, real SU01 user created, `ZFS_T_XA_USRREC` + `ZFS_T_XA_USRLOG` rows written
  - Duplicate CREATE (same `RequestedUserId`) → HTTP 400, message 005 text exactly, no record/user created, logged as failed attempt
  - UPDATE (`PATCH`, changed `LastName`/`Telephone`) → HTTP 200, `BAPI_USER_CHANGE` succeeded via `DESTINATION 'NONE'`
  - DELETE → HTTP 204, real SU01 user removed, `ZFS_T_XA_USRREC` row removed, `ZFS_T_XA_USRLOG` retained all 3 rows (CREATE/UPDATE/DELETE) — confirms the two-table design's purpose
  - Two real platform blockers found and fixed live (see Lessons raised): `BAPI_TRANSACTION_COMMIT` is forbidden in a behavior class (removed); `BAPI_USER_CREATE1`/`BAPI_USER_CHANGE`/`BAPI_USER_DELETE` must be called via `DESTINATION 'NONE'` because their internal Business Address Services calls (`CALL FUNCTION ... IN UPDATE TASK`) are otherwise illegal inside an active RAP BO's transactional context
  - No test artifacts left behind — `ZFSAPITEST1` was deleted as part of the test sequence; `systemUsers` confirms it no longer exists
- [x] 13. Close out worklog + any new lessons-ledger entries

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_T_XA_USRREC` | TABL/DT | ZFS_K2_CC_VS | DS4K907018 | Done — activated, fields verified |
| `ZFS_T_XA_USRLOG` | TABL/DT | ZFS_K2_CC_VS | DS4K907018 | Done — activated, fields verified |
| `ZFS_I_UserProvision` (+BDEF) | DDLS/DF, BDEF/BDO | ZFS_K2_CC_VS | DS4K907018 | Done — activated |
| `ZFS_C_UserProvisionTP` (+BDEF) | DDLS/DF, BDEF/BDO | ZFS_K2_CC_VS | DS4K907018 | Done — activated |
| `ZFS_I_UserProvision` (DCL) | DCLS/DL | ZFS_K2_CC_VS | DS4K907018 | Done — activated |
| `EZFS_T_XA_USRREC` | ENQU/DL | ZFS_K2_CC_VS | DS4K907018 | Done — activated |
| `ZBP_FS_USERPROVISIONTP` (+`LHC_USERPROVISION`/`LSC_USERPROVISION`) | CLAS/OC | ZFS_K2_CC_VS | DS4K907018 | Done — activated, clean syntax check (1 benign "READ not implemented" warning, matches documented pattern) |
| `ZFS_SD_USERPROVISION` | SRVD/SRV | ZFS_K2_CC_VS | DS4K907018 | Done — activated |
| `ZFS_SB_USERPROVISION_O4_API` | SRVB/SVB | ZFS_K2_CC_VS | DS4K907018 | Done — activated, published (GUI fallback), `fetch_services` confirms `isPublished: true` |
| Messages 005–013 | change to `ZFS_TRM_MSG` | ZFS_K2_CC_VS | DS4K907018 | Done — verified via re-read |

## Delivery checks

- [x] Pretty Printer — not run explicitly; source written pre-formatted, syntax check clean
- [x] Syntax check clean — clean except 1 benign "READ ZFS_I_USERPROVISION not implemented" warning (expected, matches documented SAVER-warning precedent)
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — DEFAULT variant, final code (post `DESTINATION 'NONE'` fix): 0 priority 1, 0 priority 2, 25 priority 3 — all P3 are the expected SLIN 1713 "string not translated" findings from `new_message_with_text` free-text messages (documented tradeoff, see `docs/rap-unmanaged-web-api-pattern.md` §8 and `lessons/lessons-ledger.md` L-226) plus the 1 benign READ warning. **No cloud-release-specific ATC finding surfaced on the 3 BAPI calls** — DEFAULT variant apparently doesn't flag them; open question 8's deviation-recording is therefore not yet triggered, revisit if a stricter Cloud check variant is ever run.
- [x] ABAP Unit — none applicable; no test classes built (not requested, L-216)
- [x] Text symbols and selection texts maintained — n/a (no text pool on a CDS/RAP-only build)
- [x] Object list confirmed in the transport — all 10 rows created/changed under `DS4K907018`
- [x] Messages created in `ZFS_TRM_MSG` listed in the completion report (005–013, see §4 of the plan / message-catalog.md)
- [x] MCP routing deviations, if any, recorded with reason — message-class change routed to `mcp-abap-abap-adt-api` (confirmed L-212 exception, `adt-mcp` has no MSAG/N adapter)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity:
- L-225 — MSAG/N message editing via `setObjectSource` needs whole-document XML
- L-226 — local class TP-stripping, `FOR BEHAVIOR OF` header fix, no ROLLBACK in behavior class, no %cid on update entities
- L-227 — no explicit commit ever in a behavior class (confirmed hard syntax error); classic BAPIs with legacy update-task internals (BAPI_USER_CREATE1/_CHANGE) must be called via `DESTINATION 'NONE'`, not directly, or they crash with `BEHAVIOR_ILLEGAL_STATEMENT`
- L-228 — BAPI_USER_CREATE1 needs a password or `GENERATE_PWD='X'` for every user type; real `USTYP` domain is A=Dialog/B=System/C=Communication/S=Service (System/Communication were swapped in the original design)
