# ALV Report — ZFS_R_XA_USRREC over ZFS_T_XA_USRREC

- **Date:** 2026-08-22
- **System:** DS4_100_NIIF
- **Package:** ZFS_K2_CC_VS
- **Transport:** DS4K907018
- **Requested by:** Saumya S (saumya.s@fourthsignal.com)

## Scope

Build a new read-only ALV report over the existing transparent table `ZFS_T_XA_USRREC` (user
provisioning live record, built earlier today under `worklog/DS4_100_NIIF/2026-08/2026-08-22-1719-rap-user-provisioning-api.md`).
Selection on request id, user type, requested user id, user group, call status and created-by user
id, plus the mandatory layout-variant parameter. `INITIAL_PASSWORD` is excluded from every layer
(type, SELECT, display) — a display report must never render stored credential material. Out of
scope: drill-down to any transaction (none requested), totals/aggregation, ABAP Unit tests (not
requested).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | ALV pattern (alv-report-standards.md §1 — always ask) | Pattern B — `CL_SALV_TABLE`, matching siblings `ZFS_R_TRM_REPAY`/`ZFS_R_TRM_FSTAT` | 2026-08-22 |
| 2 | Authorization basis — table has no company-code/org field | `S_USER_GRP`, `ID 'CLASS'` on `USER_GROUP`, `ACTVT 03` (resolve-then-filter, same shape as siblings' `F_BKPF_BUK`) | 2026-08-22 |
| 3 | `INITIAL_PASSWORD` column treatment | Exclude entirely — never fetched or rendered | 2026-08-22 |

## Naming gate

```
NAMING: ZFS_R_XA_USRREC -> matches Classic & Misc row "Program/report" ZFS_R_<AREA>_<NAME>, AREA=XA (same AREA as source table ZFS_T_XA_USRREC)
NAMING: ZFS_R_XA_USRREC_TOP -> matches Classic & Misc row "Includes are the report name plus a suffix" (_TOP)
NAMING: ZFS_R_XA_USRREC_F01 -> matches Classic & Misc row "Includes are the report name plus a suffix" (_F01)
```

## Todo

- [x] 1. Confirm `ZFS_T_XA_USRREC` exists and read its field list (`mcp-abap-abap-adt-api`)
- [x] 2. Ask ALV pattern, authorization basis, password-column treatment (human decisions above)
- [x] 3. Verify `S_USER_GRP` field names against the live system (`TOBJ` table read) — `CLASS`/`ACTVT`, not assumed
- [x] 4. Create `ZFS_R_XA_USRREC` + `_TOP` + `_F01` skeletons (`adt-mcp`)
- [x] 5. Write source for all three (`mcp-abap-abap-adt-api` `setObjectSource`)
- [x] 6. Activate all three in one `activateObjects` call (L-209)
- [x] 7. Syntax check / ATC
- [x] 8. Human authorized `sap-gui` automation for text elements + tcode creation as a policy
      exception (L-229) — `lessons-ledger.md`, `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`
      updated same turn; runbook written to `docs/sap-gui-object-automation.md`
- [x] 9. Create tcode `ZFS_XA_USRREC` via SE93 (sap-gui) — succeeded, verified live
- [ ] 10. Create text elements via SE38/SE63 (sap-gui) — **blocked**, SE38 refused by sap-gui's own
       security policy and the SE63 fallback screen is unnavigable with the available tools (L-230).
       Falls back to the human-maintains-it list below (L-211).
- [x] 11. Report text elements the human must maintain (L-211) + close out worklog

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_R_XA_USRREC` | PROG/P | ZFS_K2_CC_VS | DS4K907018 | Done |
| `ZFS_R_XA_USRREC_TOP` | PROG/I | ZFS_K2_CC_VS | DS4K907018 | Done |
| `ZFS_R_XA_USRREC_F01` | PROG/I | ZFS_K2_CC_VS | DS4K907018 | Done |
| `ZFS_XA_USRREC` | TRAN/T | ZFS_K2_CC_VS | DS4K907018 | Done — created via `sap-gui` (SE93), L-229 exception; verified live, launches `ZFS_R_XA_USRREC`; all 3 GUI-availability checkboxes (HTML/Java/Windows) checked |
| `ZFS_XA_USRREC1` | TRAN/T | ZFS_K2_CC_VS | DS4K907018 | Done — second tcode for the same program/package, human-requested; built via `docs/sap-gui-object-automation.md` Script 1, verified live |
| `ZFS_XA_USRREC2` | TRAN/T | ZFS_K2_CC_VS | DS4K907018 | Done — third tcode for the same program/package, human-requested; built via `docs/sap-gui-object-automation.md` Script 1, verified live |
| `ZFS_XA_USRREC3` | TRAN/T | ZFS_K2_CC_VS | DS4K907018 | Done — fourth tcode for the same program/package, human-requested; built via the trimmed Script 1 (no popup pre-reads), verified live |
| `ZFS_XA_USRREC4` | TRAN/T | ZFS_K2_CC_VS | DS4K907018 | Done — fifth tcode, same program/package; first live run of `scripts/sap-gui-create-tcode.py` (direct `SAPGUIController` import, no MCP protocol layer per field) — one process call, verified live, `"ok": true` |

## Delivery checks

- [x] Pretty Printer
- [x] Syntax check clean
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — priority 1 and 2 resolved (0/0); 4 remaining priority-3 SLIN 1701 findings are the expected "text symbol B01/B02/H01 not defined" gap, see below (L-211). A stale SLIN 0033 "contains inactive parts" cleared on the second `activateByName` per L-209.
- [x] ABAP Unit green (or "none applicable" with a reason) — none applicable, not requested (L-216)
- [ ] Text symbols and selection texts maintained — **human action required, see below (L-211)**
- [x] Object list confirmed in the transport

## Text elements the human must maintain (never created by the agent, L-211)

| Program | Text ID | Key | Proposed wording | Max length |
|---|---|---|---|---|
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_REQID` | Request ID | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_UTYPE` | User Type | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_RUID` | Requested User ID | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_UGRP` | User Group | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_CSTAT` | Call Status | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `S_CRUID` | Created By | 30 |
| `ZFS_R_XA_USRREC_TOP` | Selection text | `P_LAYOUT` | Layout | 30 |
| `ZFS_R_XA_USRREC_TOP` | Text symbol | `TEXT-b01` | Selection | 40 |
| `ZFS_R_XA_USRREC_TOP` | Text symbol | `TEXT-b02` | Display Options | 40 |
| `ZFS_R_XA_USRREC_F01` | Text symbol | `TEXT-h01` | User Provisioning Records | 40 |

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity:
- L-229 — `sap-gui` automation authorized (human instruction) as a named exception for text-element
  maintenance and transaction-code creation, superseding L-211 for text elements specifically
- L-230 — SE38 fully blocked by `sap-gui`'s security policy; SE63's ABAP-objects text route is
  unnavigable with the current tool surface — the L-229 text-element exception is policy-authorized
  but not currently executable

Also reused existing messages 001/004 from `ZFS_TRM_MSG`, confirmed `S_USER_GRP` fields via `TOBJ`
read rather than assuming.
