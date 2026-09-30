# FTR term loan through the dynamic gateway, from an empty registry — test case + evidence pack

- **Date:** 2026-09-11
- **System:** DS4_100_NIIF (`DS4` / client `100`, user `FS_DEV3`)
- **Package:** — (no repository objects created or changed)
- **Transport:** — (none required)
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

The human emptied `ZFS_T_SLC_DYNGW` a second time and asked for the whole thing driven again
**from scratch**, through `/IWFND/GW_CLIENT` in SAP GUI on NIIF:

1. Run the term-loan test case through `ZFS_SB_DYNGATEWAY_O4_API` — `BAPI_FTR_IRATE_DEALCREATE`,
   company code 1000, product type 22A, transaction type 100, partner 700000453,
   01.01.2026–31.12.2026, INR 100,000, 10 % fixed, **monthly** interest.
2. Produce a Word report carrying the evidence: URLs, request/response JSON, screenshots, steps.
3. Explain `ZFS_T_SLC_DYNGW` **field by field**, and what it does at each step.

Supersedes the partial run recorded in `2026-09-11-1239-dyngw-ftr-dealcreate-from-scratch.md`
(its todos 6–7 were never finished). Out of scope: the settle / TBB1 / TPM44 / TPM1 lifecycle
steps — create only.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Leave the two write-capable registry rows active after the test? | **Open** — flagged as a risk below | — |

## Naming gate

Not applicable — no new repository objects. The only names written are **registry rows**
(application data in `ZFS_T_SLC_DYNGW`), not repository objects.

## Todo

- [x] 1. Confirm `ZFS_T_SLC_DYNGW` empty (baseline screenshot)
- [x] 2. Prove the refusal path on the unregistered BAPI → `017`, and that it is still logged
- [x] 3. Register `BAPI_FTR_IRATE_DEALCREATE` with a `REGI` batch step
- [x] 4. Dry run (`TESTRUN='X'`) via `CallFunctionModule`
- [x] 5. Real create via `ExecuteBatch` + `CommitMode=AUTO`
- [x] 6. Verify the deal — through the gateway *and* against the database
- [x] 7. Walk the final table state, row by row
- [x] 8. Word report with evidence

## Outcome

**All eight steps complete. Deal `0000000160445` created**, 22A/100, company code 1000, partner
`0700000453`, INR 100,000, 10 % fixed, monthly interest, bullet repayment 31.12.2026.

| TC | Call | Result |
|---|---|---|
| TC-01 | `CallFunctionModule`, BAPI not yet registered | ✅ HTTP **200**, `ExecStatus=E`, msg **017** — refusal, not an HTTP error |
| TC-02 | `ExecuteBatch` with one `REGI` step | ✅ `S`, registry row created, 3 table rows written |
| TC-03 | `CallFunctionModule`, `TESTRUN='X'` | ✅ `S`, `FINANCIALTRANSACTION="\INTERN\"`, `I FTR0 162` |
| TC-04 | `ExecuteBatch` + `CommitMode=AUTO`, `TESTRUN=''` | ✅ `S`, **deal `0000000160445`** |
| TC-05 | `ExecuteBatch` `[REGI VTBFHA, QURY VTBFHA]` | ✅ both `S` — a step using a target the step in front of it had just declared |
| TC-06 | `RunQuery` on `VTBFHA`, filtered to the new deal | ✅ `S`, `ResultCount=1`, the deal read back through the gateway |

**Business verification** (`VTBFHA` + `VTBFINKO`, SE16):

- `VTBFHA`: BUKRS 1000 · RFHA 0000000160445 · SGSART 22A · SFHAART 100 · KONTRH 0700000453 ·
  WGSCHFT INR · RCOMVALCL 1 · DBLFZ 01.01.2026 · DELFZ 31.12.2026 · DCRDAT 11.09.2026
- `VTBFINKO` condition `1000`: `SKOART` **1200** (interest), `PKOND` **10.0000000**,
  `SRHYTHM` **3** = monthly, `AMMRHY` **001**, first due `DFAELL` **01.02.2026** — exactly one
  month after the start of term, which is the monthly interest proof
- `VTBFINKO` condition `2000`: `SKOART` **1120** (final repayment), `PKOND` **100.0000000**,
  `DFAELL` **31.12.2026** — bullet

## Key findings

- **`BAPI_FTR_IRATE_DEALCREATE` needs its `X` change-indicator structures** and the payload
  recorded in the afternoon's Word report does not have them. Without
  `GENERALCONTRACTDATAX` / `INTERESTRATEINSTRUMENTX` every field arrives initial and the BAPI
  answers `TI 2 "Product type  not defined"` — naming a field that *was* sent. The blank in the
  message is the only tell (**L-365**). `BAPI_FTR_IRATE_CREATE` has no `X` structures and does
  not need them; the two payloads are not interchangeable.
- **The call log stores request and response asymmetrically** (**L-366**). A single-shot
  `RunQuery` keeps its request but **not its result rows**; a batch child keeps its response but
  not its request. Batches lose nothing (parent + child reconstruct the call); a single-shot read
  is unauditable after the fact.
- `ROW_COUNT` is `0` even on the successful create — BAPIs report no row count. The deal number
  lives in `RESPONSE_JSON`.
- **L-362's clipboard paste works, but only unsandboxed** (**L-367**): the PowerShell sandbox
  hides the SAP GUI desktop session entirely, so `saplogon` is invisible and the failure reads as
  "SAP is not running".
- **An evidence screenshot captured the wrong SAP session** (**L-368**) — three sessions were
  open and `EnumWindows` returns them in Z-order, which the previous screenshot had changed. The
  PNG looked plausible. Fixed by matching the window title and failing on zero-or-many; the one
  affected shot was retaken.
- The ADT MCP SQL console (`runQuery`) again failed **session-wide** mid-activity (`-32603` on
  every statement including `SELECT COUNT(*) FROM ZFS_T_SLC_DYNGW`) after ~25 successful
  statements. Same symptom as the earlier run. Remaining reads were completed through SE16.
- The `/IWFND/GW_CLIENT` URI uses the **dot** form `…v0001.CallFunctionModule`. The afternoon
  Word report renders it with a slash; the dot is correct and is what the integration guide says.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | no repository objects touched |

**Registry rows written (`EntryType='R'`, application data, no transport):**

| Target | Kind | Operation | IsActive | AllowRead | AllowWrite | MaxRows |
|---|---|---|---|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | FUNC | *(any)* | X | X | **X** | 0 (no ceiling) |
| `VTBFHA` | QURY | SELECT | X | X | — | 20 |

## Left on the system

- **Business data:** FTR transaction **`0000000160445`** in company code 1000, with its two
  conditions in `VTBFINKO`. Not settled, not posted.
- **Registry:** the two rows above. `ZFS_T_SLC_DYNGW` holds **13 rows** — 2 registry, 11 call log.

> **Open risk:** the `BAPI_FTR_IRATE_DEALCREATE` row is `ALLOW_WRITE='X'` and `IS_ACTIVE='X'`,
> so any gateway caller can create FTR deals on this system. Clear `IS_ACTIVE` when the testing
> is finished — it is an instant kill switch and needs no transport.

## Delivery checks

- [ ] Pretty Printer — n/a, no source changed
- [ ] Syntax check clean — n/a
- [ ] Activated, nothing left inactive — n/a
- [ ] ATC — n/a
- [ ] ABAP Unit — n/a
- [ ] Text symbols and selection texts — n/a
- [ ] Object list confirmed in the transport — n/a, nothing transportable
- [x] Verified live end-to-end; deal confirmed in `VTBFHA` and its conditions in `VTBFINKO`

## Evidence

- **Word report:** `worklog/DS4_100_NIIF/FTR-DealCreate-OData-TestCase-2026-09-11-1237.docx`
- **Screenshots:** `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-11-1242-ftr-dealcreate-odata-testcase/`
  (`00`–`13`)
- **Payload builder:** the JSON in the report was generated innermost-first, never hand-escaped
  (integration guide §6 / L-335).

## Lessons raised

**L-365** (DEALCREATE `X` structures), **L-366** (asymmetric request/response logging),
**L-367** (sandbox hides the SAP GUI session), **L-368** (match the session window by title).

## Next session

1. **Decide the open question** — deactivate `BAPI_FTR_IRATE_DEALCREATE` or leave it callable
2. Add the `X`-structure rule to `docs/dyngateway-live-test-2026-09-10-1520.md`, whose §4.5 template
   is `BAPI_FTR_IRATE_CREATE` and will mislead anyone reaching for `..._DEALCREATE`
3. Consider whether a single-shot `RunQuery` should persist its rows (L-366) — today it does not
4. The ADT `runQuery` session-wide failure has now happened twice in the same place; worth
   raising against the MCP server rather than working around it again
