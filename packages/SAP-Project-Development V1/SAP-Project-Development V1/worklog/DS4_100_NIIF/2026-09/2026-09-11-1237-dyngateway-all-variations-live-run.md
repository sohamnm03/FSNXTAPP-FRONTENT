# Live run of all five ZFS_SB_DYNGATEWAY_O4_API step kinds, from an empty allow-list, via SAP GUI

- **Date:** 2026-09-11
- **System:** DS4_100_NIIF
- **Package:** n/a — no ABAP repository objects touched or created
- **Transport:** n/a
- **Requested by:** human (Karthik / vinit.s@fourthsignal.com)

## Scope

Human cleared all rows from `ZFS_T_SLC_DYNGW` (confirmed empty via SE16 before starting) and asked
for every step kind of the dynamic gateway (`QURY`, `TABL`, `FUNC`, `SUBM`, `REGI`) to be exercised
live, driven through SAP GUI (`/IWFND/GW_CLIENT`) via the `sap-gui` MCP server, with a screenshot
captured after every request/response and after every resulting check of `ZFS_T_SLC_DYNGW`. No new
ABAP objects were requested or created — this is a test/verification activity against the existing
gateway (`docs/dyngateway-integration-guide.md`), the existing allow-list table, and pre-existing
test-safe targets already used in the 2026-09-10 live test
(`docs/dyngateway-live-test-2026-09-10-1520.md`, `docs/dyngateway-submit-2026-09-10-1520.md`).

Out of scope: creating financial transactions (`BAPI_FTR_IRATE_CREATE`) or business partners
(`BAPI_BUPA_CREATE_FROM_DATA`) again — those were proved once already on 2026-09-10 and are not
reversible; this run stuck to read-only and reversible writes.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Can the GW_CLIENT body pane be filled by `sap-gui` automation? | No — confirmed by two independent methods (`sap_set_textedit`, OS-level `SendKeys`). Human pasted each body manually; everything else (URI, method, protocol, headers, header grid, Execute, screenshots, SE16 checks) was driven by `sap-gui`. See L-357. | 2026-09-11 |
| 2 | Is the HTTP header grid scriptable (docs said no)? | Yes — `sap_modify_cell` worked. Stale part of `docs/dyngateway-integration-guide.md` §12a. See L-357. | 2026-09-11 |

## Naming gate

Not applicable — no new objects created. All targets used (`ZFS_CDS_SLC_001`, `ZSGSLCTR_FEEDATA`,
`RFC_SYSTEM_INFO`, `ZFS_R_TRM_FWDTXN`) are pre-existing, already-named objects; only allow-list rows
(application data, not repository objects) and one test data row were written.

## Todo

- [x] 1. Confirm `ZFS_T_SLC_DYNGW` empty (SE16)
- [x] 2. Variation 1 — `REGI`: register 4 targets (QURY/TABL/FUNC/SUBM) + use one in the same batch
- [x] 3. Variation 2 — standalone `QURY` (`RunQuery`)
- [x] 4. Variation 3 — standalone `TABL` (`ExecuteTableCrud` INSERT)
- [x] 5. Variation 4 — standalone `FUNC` (`CallFunctionModule`)
- [x] 6. Variation 5 — `SUBM` via `ExecuteBatch`
- [x] 7. Variation 6 — mixed batch (`QURY`+`FUNC`+`SUBM`+`TABL DELETE`) — first attempt failed
      (`Operation` mismatch against a pinned registry row), captured as a genuine negative case
- [x] 8. Variation 6b — same mixed batch corrected (`Operation:"SALV"`) — succeeded, and cleaned up
      the test row via the `TABL DELETE` step in the same call
- [x] 9. Screenshot evidence for every request, response, and post-action `ZFS_T_SLC_DYNGW` state
- [x] 10. Record lessons (L-357, L-358) and this worklog

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| *(none created)* | | | | Registry rows and one test data row only — see below |

**`ZFS_T_SLC_DYNGW` rows left on the system** (24 total, all `CLIENT 100`):
- 4 `EntryType='R'` (registered targets): `QURY ZFS_CDS_SLC_001`, `TABL ZSGSLCTR_FEEDATA`,
  `FUNC RFC_SYSTEM_INFO`, `SUBM ZFS_R_TRM_FWDTXN` (registry `Operation` pinned to `SALV`)
- 20 `EntryType='L'` call-log rows (1 per action/step across all variations, including the failed
  mixed-batch attempt)

**`ZSGSLCTR_FEEDATA`:** net zero — the `F13`/`100050` test row from Variation 3 was inserted, then
deleted by the `TABL DELETE` step in Variation 6b. Confirmed absent afterward via SE16.

## GwUuid trail (for `GET /DynGateway(<GwUuid>)` lookups later)

| Variation | Action | GwUuid | Result |
|---|---|---|---|
| 1 — REGI | ExecuteBatch | `5254001f-e7a2-1fd1-abb2-d66775366000` | S, ResultCount 5 |
| 2 — QURY | RunQuery | `5254001f-e7a2-1fd1-abb2-ec17889f2000` | S, ResultCount 2 |
| 3 — TABL | ExecuteTableCrud | `5254001f-e7a2-1fd1-abb3-103d2425c000` | S, ResultCount 1 |
| 4 — FUNC | CallFunctionModule | `5254001f-e7a2-1fd1-abb3-1eae18d86000` | S |
| 5 — SUBM | ExecuteBatch | `5254001f-e7a2-1fd1-abb3-56d23af56000` | S, ResultCount 1 |
| 6 — mixed (failed) | ExecuteBatch | `5254001f-e7a2-1fd1-abb3-7d23ebd52000` | **E** — step 3 `SUBM Operation:"NONE"` rejected (registry pinned to `SALV`); step 4 never ran |
| 6b — mixed (retry, succeeded) | ExecuteBatch | `5254001f-e7a2-1fd1-abb3-c01f88f92000` | S, ResultCount 4 — all steps ran, `TABL DELETE` cleaned up the test row |

## Evidence

All screenshots in `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-11-1244-dyngateway-variations/`, named
`<seq>-<variation>-<step>.png`:

```
00-table-empty-baseline.png / 00-table-empty-se16.png
01-REGI-batch-request.png / 01-REGI-batch-response.png / 01-REGI-table-after.png
02-QURY-runquery-request.png / 02-QURY-runquery-response.png / 02-QURY-table-after.png
03-TABL-crud-request.png / 03-TABL-crud-response.png / 03-TABL-table-after.png / 03-TABL-target-row-written.png
04-FUNC-callfm-request.png / 04-FUNC-callfm-response.png / 04-FUNC-table-after.png
05-SUBM-batch-request.png / 05-SUBM-batch-response.png / 05-SUBM-table-after.png
06-MIXED-batch-request.png / 06-MIXED-batch-response-FAILED.png /
  06-MIXED-table-after-FAILED.png / 06-MIXED-table-after-FAILED-full19rows.png /
  06-MIXED-F13-row-survived-abort.png
06b-MIXED-batch-retry-request.png / 06b-MIXED-batch-retry-response-SUCCESS.png /
  06b-MIXED-table-after-SUCCESS.png / 06b-MIXED-F13-row-deleted-confirmed.png
```

## Delivery checks

- [ ] Pretty Printer — n/a, no ABAP source changed
- [ ] Syntax check clean — n/a
- [ ] Activated, nothing left inactive — n/a
- [ ] ATC / Code Inspector — n/a
- [ ] ABAP Unit green — n/a
- [ ] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed — no repository objects created; allow-list/log rows and net-zero test
      data row confirmed above

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-357, L-358**.
