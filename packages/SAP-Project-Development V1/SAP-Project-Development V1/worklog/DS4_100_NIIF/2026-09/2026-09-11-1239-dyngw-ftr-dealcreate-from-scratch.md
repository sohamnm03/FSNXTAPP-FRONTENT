# Dynamic gateway from an empty registry: register + create an FTR term loan via OData

- **Date:** 2026-09-11
- **System:** DS4_100_NIIF (`DS4` / client `100`, user `FS_DEV3`)
- **Package:** — (no repository objects created or changed)
- **Transport:** — (none required)
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

The human emptied `ZFS_T_SLC_DYNGW` so the gateway could be exercised **from a genuinely empty
registry**, and asked for three things:

1. Run the term-loan test case through `ZFS_SB_DYNGATEWAY_O4_API` — `BAPI_FTR_IRATE_DEALCREATE`,
   CoCd 1000, product type 22A, transaction type 100, partner 700000453, 01.01.2026–31.12.2026,
   INR 100,000, 10 % fixed, monthly interest — driven from `/IWFND/GW_CLIENT` in SAP GUI.
2. Produce a Word report carrying the evidence: URLs, request/response JSON, screenshots, steps.
3. Explain `ZFS_T_SLC_DYNGW` **field by field**, and what happens to it at each step.

Out of scope: no ABAP object was created or changed; the settle/post/month-end steps of the
2026-09-11 lifecycle activity were not repeated.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Should the write-capable registry rows be left active after the test? | Open — flagged as a risk below | — |

## Naming gate

Not applicable — no new repository objects. The only names written are **registry rows**
(application data in `ZFS_T_SLC_DYNGW`), not repository objects.

## Todo

- [x] 1. Confirm `ZFS_T_SLC_DYNGW` empty (baseline screenshot)
- [x] 2. Prove the refusal path on an unregistered target → 017, and that it is still logged
- [x] 3. Register `BAPI_FTR_IRATE_DEALCREATE` with a `REGI` batch step
- [x] 4. Test run (`TESTRUN='X'`) via `CallFunctionModule`
- [x] 5. Real create via `ExecuteBatch` + `CommitMode`
- [ ] 6. Verify the deal, walk the final table state
- [ ] 7. Word report with evidence

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | no repository objects touched |

**Registry rows written (`EntryType='R'`, application data, no transport):**

| Target | Kind | IsActive | AllowRead | AllowWrite | MaxRows |
|---|---|---|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | FUNC | X | X | X | 0 |
| `VTBFHA` | QURY | X | X | — | 20 |

## Key findings

- **The body pane of `/IWFND/GW_CLIENT` *can* be filled by automation** — not via
  `sap_set_textedit` and not via SendKeys typing (both confirmed dead in L-357), but via
  **clipboard + a real mouse click into the pane + Ctrl+A/Ctrl+V**. This makes the whole gateway
  test scriptable end to end. Partially supersedes L-357.
- **A refused call still writes a call-log row.** The very first call (`RunQuery` on an
  unregistered `T001`) left exactly one `EntryType='L'` row carrying `017`. The table is an audit
  log of attempts, not of successes.
- **One batch writes three rows:** a parent `EntryType='L'` row with `TARGET_KIND='BTCH'` and a
  blank `TARGET_NAME`, plus one child row per step carrying `STEP_INDEX` and `PHASE='X'`.
  `BTCH` is not one of the four documented target kinds — it only ever appears on the parent row.
- **The gateway applies no ALPHA conversion.** `PARTNER:"700000453"` was refused with
  `R1 201 "Business partner 700000453 does not exist"`; the partner is stored as `0700000453`.
  Callers must send the **internal** (zero-padded) form for any field with a conversion exit.
- **`BAPI_FTR_IRATE_DEALCREATE` needs `VALUATION_CLASS` on this system.** Without it the BAPI
  answers `FTR_GUI 141 "Fill the following required field: VTBFHA-RCOMVALCL"` and
  `FTR_TRD 031 "Transaction 1000 ... not assigned to any 'Gen. valuation class'"`. The value used
  by the existing deal `0000000160440` is `1`, sent as the quoted NUMC `"0001"`.
- **Fail-fast in a batch is real.** A batch whose step 2 named `PARTNR` (a field that lives in a
  DDIC `.INCLUDE` on `VTBFHA`) was rejected in validation; step 1 came back `EXECSTATUS:"P"` and
  the `REGI` it carried was **not** applied.
- The ADT MCP server's SQL console (`runQuery`, `tableContents`) failed session-wide mid-activity
  (`-32603` on every statement, including `SELECT MANDT FROM T000`); `healthcheck` stayed
  `healthy` and `dropSession` returned 400. Reads were completed through SE16 and through the
  gateway itself instead.

## Delivery checks

- [ ] Pretty Printer — n/a, no source changed
- [ ] Syntax check clean — n/a
- [ ] Activated, nothing left inactive — n/a
- [ ] ATC — n/a
- [ ] ABAP Unit — n/a
- [ ] Text symbols and selection texts — n/a
- [ ] Object list confirmed in the transport — n/a, nothing transportable

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-11-1239-dyngw-ftr-dealcreate-from-scratch/`

## Lessons raised

L-362 (clipboard paste into the GW client body pane), L-363 (no ALPHA conversion on gateway
payloads), L-364 (`BTCH` parent + per-step child log rows).
