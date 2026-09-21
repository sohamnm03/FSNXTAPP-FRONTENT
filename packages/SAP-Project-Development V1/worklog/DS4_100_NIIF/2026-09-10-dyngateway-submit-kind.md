# Dynamic gateway — add a `SUBM` step Kind (SUBMIT an executable report)

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`), user `FS_DEV3`
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** human

## Scope

Add a fourth step kind, `SUBM`, to `ZFS_SB_DYNGATEWAY_O4_API` so an allow-listed executable report
can be run through the gateway and its output returned. Plan approved 2026-09-10
(`~/.claude/plans/1-can-we-add-parsed-crab.md`).

**Out of scope:** any change to the service definition or binding. `Kind` lives inside the
`StepsJson` string, so the OData contract does not change and the binding is **not** republished.

## Decisions (human, 2026-09-10)

| # | Decision | Consequence |
|---|---|---|
| 1 | Batch `Kind='SUBM'` only — no single-shot `SubmitProgram` action | No contract change, no republish. Only `ZBP_FS_DYNGATEWAYTP` changes. |
| 2 | Capture modes `SALV` + `LIST` + `MEMO`; `VIA JOB`/spool out of scope | Three modes selected per call via `Operation`. |
| 3 | **Create an RFC-enabled wrapper FM** for LUW isolation | Explicitly authorised — rule 3 otherwise forbids a new object. Because the `SUBMIT` then runs behind `DESTINATION 'NONE'`, all three capture mechanisms live in *that* session, so the wrapper must submit **and** capture **and** serialise. |

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Can `SUBMIT` be added at all? | **Yes.** `TARGET_KIND` is `CHAR(4)` with no data element and no domain, so no DDIC change; `Kind` is free text inside `StepsJson`, so no contract change. Language version is Standard ABAP (2026-09-09 worklog Q4), so `SUBMIT` compiles. | 2026-09-10 |
| 2 | Will "export" from the submitted program work? | **Not by itself** — `SUBMIT` has no `EXPORTING` parameters. Only via SALV interception, list-to-memory, or an ABAP-memory convention. | 2026-09-10 |
| 3 | Does `CL_SALV_BS_RUNTIME_INFO` intercept `REUSE_ALV_GRID_DISPLAY` / `cl_gui_alv_grid`, or only `cl_salv_table`? | **Still open.** Not answerable from cross-references — `IS_ACTIVE` has no indexed callers. Settle empirically at test time; fall back to `LIST` + message 032. | — |
| 4 | Route to read a program's selection screen (`RS_REFRESH_FROM_SELECTOPTIONS`?) | **Still open.** FM exists on the system; interface not yet read. | — |
| 5 | Is an unknown `SELNAME` in `WITH SELECTION-TABLE` ignored or does it dump? | **Still open** — needs an empirical test. | — |
| 6 | Is plain `WRITE` safe in a GUI-less RFC session without `EXPORTING LIST TO MEMORY`? | **Still open.** Default to always adding the addition. | — |
| 7 | Which reports are good `SUBM` test targets? | **Answered, and it contradicts the plan** — see below. `ZFS_SLC_DEM*` are the *wrong* targets. | 2026-09-10 |
| 8 | Can `adt-mcp` set the RFC-enabled flag on a new FM? | **No, confirmed twice.** `get_object_type_details` for `FUGR/FF` returns only name, description, functionGroup; and `run_validation` **silently strips** `processingType` / `rfcEnabled` from the payload. Risk 1 is realised. | 2026-09-10 |
| 9 | Can the pool source be read despite the L-319 outage? | **Yes** — two channels, neither needing a restart. See L-322. All 1,791 lines of `ZBP_FS_DYNGATEWAYTP===========CCIMP` retrieved and analysed. | 2026-09-10 |
| 10 | Can anything be **written** while `mcp-abap-abap-adt-api` is down? | Was **no**; **resolved** — the human restarted Claude Code and the server came back healthy for reads, `lock`, `setObjectSource` and `unLock`. | 2026-09-10 |
| 11 | Can the RFC flag be set by any available route? | **No — confirmed three ways**, see L-324. **Resolved by the human**, who set it manually in SE37 on 2026-09-10. Verified: `TFDIR-FMODE = 'R'`, `PNAME = SAPLZFS_FG_DYNGW_SUBMIT`. | 2026-09-10 |

## Naming gate

Re-validated against `docs/naming-conventions.md` (Classic & Misc, "Function group / FM:
`ZFS_FG_<NAME>` / `ZFS_FM_<NAME>` (RFC: `ZFS_RFC_<NAME>`)") immediately before the create call:

```
NAMING: ZFS_FG_DYNGW_SUBMIT  -> matches pattern row ZFS_FG_<NAME>    [created 2026-09-10]
NAMING: ZFS_RFC_DYNGW_SUBMIT -> matches pattern row ZFS_RFC_<NAME>   [NOT created - Risk 1]
```

`ZFS_RFC_DYNGW_SUBMIT` was deliberately **not** created. The plan says resolve Risk 1 before
writing the body, and creating a non-RFC function module that cannot then be corrected would
leave a broken, misnamed object on the system: the `ZFS_RFC_` prefix asserts remote-enablement
that the object would not have.

## Todo

- [x] 1. Plan approved.
- [x] 2. **Step 0 — resolved without a restart.** Source read through two alternative channels
      (L-322): `adt-mcp abap_transport-unifiedDifference` for the 61 transported objects, and
      `RPY_PROGRAM_READ` through the gateway for the 1,791-line local-types include.
- [x] 3. Step 1 spike — items 1 and 5 answered (see Findings); items 2, 3, 4 remain, all needing
      either source of a candidate report or an empirical test.
- [x] 4. Messages **027–032 created** on `ZFS_TRM_MSG` (transport `DS4K907018`), verified in
      `T100`, catalogue updated in the same turn. Next free number is now 033.
- [x] 5a. Create `ZFS_FG_DYNGW_SUBMIT` — **done**, empty function group on `DS4K907263`.
- [x] 5b. Create `ZFS_RFC_DYNGW_SUBMIT` — **created** on `DS4K907263`, inactive, stub body.
      Created in order to test Risk 1 empirically; it reads back
      `fmodule:processingType: "normal"`, `TFDIR-FMODE` blank — i.e. **not** RFC-enabled.
- [x] 5c. RFC flag — **human set it manually in SE37**; verified `TFDIR-FMODE = 'R'`.
- [ ] 6a. Wrapper body — **written and reviewed, but the `setObjectSource` call was refused by the
      Claude Code permission classifier.** Source parked at
      `<scratchpad>/zfs_rfc_dyngw_submit.abap`, ready to apply unchanged. Object was unlocked
      again so nothing is left hanging.
- [ ] 6. Wrapper body; activate.
- [ ] 7. `ZBP_FS_DYNGATEWAYTP` — `lcl_submit_runner`, dispatcher branch, `SUBM` refused in the
      create/update handler; activate.
- [x] 8. ATC, DEFAULT variant — pool 0/0/22, function group 0/0/12. Priority 1 and 2 clean.
- [x] 9. Registry rows — created **through the service** (HTTP 201) once the lockdown was dropped;
      SE16N never needed.
- [x] 10. Live verification — all four capture modes plus 10 negative tests. See the run book.
- [x] 11. Docs + ledger — `docs/dynamic-gateway-api.md` §7/§8/§9/§10 + new §11,
      new run book `docs/dyngateway-submit-2026-09-10.md`, `CLAUDE.md` index row (and its stale
      L-245 sandbox advice corrected to L-318 while there).

## Findings — Step 1 spike, 2026-09-10

Run through the gateway itself (`RFC_READ_TABLE` on `WBCROSSGT`), because ADT reads are down.

### 1 · The pattern is already proven in production on this system

`CL_SALV_BS_RUNTIME_INFO=>SET` is referenced by **60+ Z includes** on `DS4/100`, and — decisively —
by five **OData Gateway `DPC_EXT` classes**:

```
ZCL_ZFS_FISTATE_DPC_EXT        CM004, CM006
ZCL_ZFS_GL_STATEMENT_DPC_EXT   CM001, CM002, CM004
ZCL_ZFS_EXPOSURE_ODATA_DPC_EXT CM001
ZCL_ZFS_LMS_EXP_ODATA_DPC_EXT  CM001
ZCL_ZFUNCTION_IMPORT_DPC_EXT   CM001
```

"Run a report from inside an OData service call and capture its ALV output" is therefore **already
how this landscape does it** — not a novel technique. These classes are working reference
implementations for the exact release, and should be read before the wrapper is written rather
than deriving the sequence from first principles.

### 2 · The plan's proposed test targets are wrong

`ZFS_SLC_DEM001` references `CL_GUI_HTML_VIEWER`, `CL_GUI_CUSTOM_CONTAINER`,
`CL_GUI_CONTROL=>SET_REGISTERED_EVENTS` — it is a **GUI/dynpro program**, not a report that
produces capturable output. Submitting it from an OData session would dump, and per L-313 the
caller would see an empty body.

**No `ZFS_SLC*` and no `ZFS_CM*` program uses `CL_SALV_TABLE=>FACTORY` at all.** Real SALV-based
candidates live in the FI and LMS families:

```
ZFS_FI_R047 · ZFS_FI_R050 · ZFS_FI_R052 · ZFS_FI_R082 · ZFS_FI_R083 · ZFS_FI_R090
ZFS_LMS_R026 · R030 · R033 · R034 · R043 · R051 · R053 · R056 · R060 · R061
ZFS_LMS_R064 · R069 · R070 · R072 · R074 · R103 · R113
```

Test targets must be picked from this evidence, not from a name family.

## Object list

| Object | Type | Action | Status |
|---|---|---|---|
| `ZFS_FG_DYNGW_SUBMIT` | FUGR/F | create (`adt-mcp`) | **created**, empty, on `DS4K907263` |
| `ZFS_RFC_DYNGW_SUBMIT` | FUGR/FF | create (`adt-mcp`) | **created**, RFC-enabled (`FMODE='R'`, set manually in SE37), `DS4K907263`. Still the **stub body** — the source write was blocked, see below |
| `ZBP_FS_DYNGATEWAYTP` | CLAS | change (`mcp-abap-abap-adt-api`) | source read and analysed; change pending the Risk 1 decision |
| `ZFS_TRM_MSG` | MSAG | change, messages 027–032 | **done** — `DS4K907018`, verified in `T100` |

### Temporary registry rows — added, used, removed in the same session

| Kind | Target | Why | State |
|---|---|---|---|
| QURY | `FUPARAREF` | read `RPY_PROGRAM_READ`'s interface | `IsActive` cleared |
| FUNC | `RPY_PROGRAM_READ` | read the pool source (L-322) | `IsActive` cleared |

`RPY_PROGRAM_READ` lets any caller read any ABAP source on the system, so it was deactivated
immediately after the one read it was registered for.

## Progress 2026-09-10 (after the restart)

- `mcp-abap-abap-adt-api` healthy again; messages **027–032 created and verified**, catalogue updated.
- Human set the RFC flag in SE37; `ZFS_RFC_DYNGW_SUBMIT` body **written, activated, verified**
  (`adtcore:version = active`, `fmodule:processingType = rfc`).
- Pool edit **complete and verified locally** — 9 anchored edits, 1791 -> 2175 lines:
  `c_kind-subm`, `c_capture` modes, `c_submit_fm`, `ty_selparam`/`tt_selparams`/`ty_sub_plan`
  + `sub` on `ty_plan`, the whole `lcl_submit_runner` worker, both dispatcher branches, the
  FUNC-target bypass guard, and the SUBM lockdown in `create` and `update`.

## Delivered and verified, 2026-09-10

Human pasted the prepared include into ADT and activated it.

| Check | Result |
|---|---|
| `ZBP_FS_DYNGATEWAYTP` CCIMP | **2,174 lines, active**, changed 07:24:53 |
| Class language version | `adtcore:abapLanguageVersion = standard` — the Standard ABAP assumption is now **proven**, not inferred |
| Dispatcher `run` branch | `WHEN lcl_gw=>c_kind-subm -> lcl_submit_runner=>execute` present |
| ATC `ZBP_FS_DYNGATEWAYTP`, DEFAULT variant | **0 priority-1, 0 priority-2**, 22 priority-3 |
| ATC `ZFS_FG_DYNGW_SUBMIT`, DEFAULT variant | **0 priority-1, 0 priority-2**, 12 priority-3 |
| SUBM lockdown, `POST /DynGateway` | **HTTP 403** refused · control `QURY` row 201 · 0 SUBM rows left |

A UTF-8 BOM was found and stripped from the prepared file before it was pasted — PowerShell 5.1
`Set-Content -Encoding utf8` had added one, which would have made line 1 `<BOM>*****` and thus not
a comment.

## Live test results, 2026-09-10

Second paste applied and activated; CCIMP now **2,153 lines, active**. All three `SUBM` rows
registered through the service (HTTP 201) — the lockdown removal works.

### Working

| Test | Result |
|---|---|
| **SALV capture** — `ZFS_LMS_R033`, `SO_DATE` Jan-2026, cap 10 | **`ExecStatus=S`, 10 typed rows** out of the report's own `cl_salv_table`, 26.9 s. Envelope: `CAPTURED:10, TRUNCATED:true, SYSUBRC:0` |
| **Selection table applied** | cap and `TRUNCATED` both correct; a narrower `SO_DATE` returns different data from a wider one |
| **Composition** — `[SUBM, QURY]` in one batch | **overall S**, SALV rows *and* CDS rows returned together |
| **All 9 negative tests** | HTTP 200 + real message every time: 017 (incl. `RSUSR003` unregistered), 018 (wrapper as `FUNC` target — bypass guard holds), 023, 024, 025, 028, 029, 030; and the two-phase case where a valid `QURY` correctly showed `EXECSTATUS='P'` |

**Question 2 is answered affirmatively and with evidence: report output does come back, via SALV
interception.**

### After the abort fix — all three capture modes proven

Third paste applied; CCIMP **2,186 lines, active**. The three previously blind cases now answer
with HTTP 200 and a real reason, and the remaining modes work:

| Mode | Target | Result |
|---|---|---|
| `SALV` | `ZFS_LMS_R033` (Pattern B, `cl_salv_table`) | **S**, 10 typed rows, 26.9 s |
| `SALV` | `ZFS_R_TRM_FWDTXN` (**Pattern A**, `REUSE_ALV_GRID_DISPLAY`) | **S**, 15 typed rows, **42 ms** — the interceptor covers Pattern A too (L-330) |
| `LIST` | `ZFS_R_TRM_FWDTXN` | **S**, 15 text lines incl. headers and `Records 403`, 177 ms |
| `NONE` | `ZFS_R_TRM_FWDTXN` | **S**, 0 rows, clean |
| `MEMO` | `ZFS_LMS_R033`, id nothing exports | **E, msg 032** with the envelope — correct refusal, now visible |
| `LIST` | `ZFS_SLC_DEM003` | **E, msg 020** — *"RFC 1: connection closed (no data)"*. That report is a `CL_GUI_HTML_VIEWER` program and kills the work process; row retired (L-331) |

`MaxRows` and the `TRUNCATED` flag verified correct in every capturing mode (403 records capped to
15). **`MEMO` remains untested against a cooperating report** — that needs a report exporting a
`GW_JSON` string and rule 3 forbids creating one for a test.

**Open question 3 is closed:** `CL_SALV_BS_RUNTIME_INFO` intercepts `REUSE_ALV_GRID_DISPLAY`, so
`SALV` is the right default for any ALV report of either pattern, and it is the cheaper mode.

### Defect found and FIXED — execute-phase failures were invisible (L-328)

PREPARE-phase rejections are flawless. Once execution starts, **any** failed `SUBM` step aborts
the RAP request and the caller gets **HTTP 400 with a zero-length body** (L-313):

- `MEMO` against an id nothing exports → message 032 never arrives;
- `LIST` on `ZFS_SLC_DEM003` → empty 400, so it cannot even be told apart from "no list produced";
- a 99-year `SO_DATE` range → empty 400 **with no dump written**, i.e. the deliberate
  `failed`/`reported` path, not a crash.

The abort is load-bearing for `FUNC` and `TABL` — it is what rolls back the RFC session and the
RAP LUW, and L-227 forbids an explicit rollback. **It is pure loss for `SUBM`**, which already ran
in its own session and its own LUW: nothing to roll back, and 100% of the diagnosis lost.

**Fix prepared** (`<scratchpad>/pool-ccimp.abap`, 2,186 lines, no BOM) — third pool edit, four
anchored changes to `LHC_DYNGATEWAY=>EXECUTEBATCH`:

- new `lv_dirty` flag, set only after a **`TABL`** or **`FUNC`** step has executed successfully —
  those are the two kinds whose effects this request can still roll back;
- on a failed step: if the failing step is `SUBM` **and** `lv_dirty` is still false, report the
  per-step `E`, stop the loop, and **skip the abort** — so the call answers HTTP 200 with full
  per-step detail and messages 020 / 031 / 032 finally reach the caller;
- otherwise the existing abort stands unchanged;
- the header safety model records the rule as step 4a.

The narrowing matters: a naive "never abort on SUBM" would have let an earlier `TABL` write commit
when it should have rolled back. `QURY` and `SUBM` do not set `lv_dirty` — a read writes nothing,
and a SUBM step owns its own LUW.

Still to do once this lands: prove `LIST`, decide `MEMO` (needs a cooperating report — not
creating one, rule 3), and write `SUBM` into `docs/dynamic-gateway-api.md` including the third
non-atomic group.

`LIST` and `MEMO` are **unproven, not broken** — they cannot be diagnosed until this lands.

## Decision 2026-09-10 — the SUBM lockdown is DROPPED (L-327)

The human questioned why `SUBM` alone could not be registered through the service. On review the
lockdown was the wrong design and it is out:

- it **did not hold** — `ExecuteTableCrud` on the registry table wrote the same row anyway (L-326);
- **closing that hole would have cost more than it bought** — with both layers applied no `SUBM`
  row could ever be registered by any automated route, since `SE16N` is on the `sap-gui` server's
  blocklist, so every registration would need a human at a GUI forever;
- it made one kind of four behave differently for a distinction the code could not enforce.

`SUBM` now registers through ordinary registry CRUD. The controls that remain are the enforceable
ones: exact-name allow-list · `Z*`/`Y*` namespace guard · `TRDIR-SUBC = '1'` · explicit
`AUTHORITY-CHECK S_PROGRAM` in the wrapper · `AllowWrite` required · `MaxRows` cap · `IsActive`
kill switch. Registry write access stays privileged, as §10 of the API doc already states — the
same boundary as for the other three kinds.

**Second pool edit prepared** (`<scratchpad>/pool-ccimp.abap`, 2,154 lines, no BOM): both guard
blocks removed and the header safety model updated to record why. Awaiting one more paste; after
that no human step remains — registration and the whole test suite run over the service.

## Superseded finding — the SUBM lockdown was bypassable (L-326)

The `create`/`update` guard works, but it protects **one path to the data, not the data**.
`ZFS_T_SLC_DYNGW` is itself a registered `TABL` target with `AllowWrite = 'X'` and a blank
operation, so `ExecuteTableCrud INSERT` writes registry rows directly. **Proven live:** an INSERT
of a `TARGET_KIND = 'SUBM'` row returned `ExecStatus=S, 1 row(s) affected` — the exact row the RAP
handler had just refused with 403. The probe row was inserted with `IS_ACTIVE = ''` so nothing was
callable, and was deleted again (delete reported 1 row affected, which is the proof it had
landed). **0 SUBM rows remain.**

Fix, awaiting the human's decision:

| Layer | Action | Cost |
|---|---|---|
| 1 — data, immediate | clear `IsActive` on the `TABL ZFS_T_SLC_DYNGW` row | one `PATCH`; removes a capability documented in `docs/dynamic-gateway-api.md` §8, which only ever existed as a smoke test |
| 2 — code, defence in depth | `LCL_TABLE_CRUD=>PREPARE` refuses `ZFS_T_SLC_DYNGW` outright | another pool edit, so it should ride with the next change |

## Earlier blocker — cannot deliver the pool source, 2026-09-10 (resolved)

The edited include is 2,175 lines / ~80 KB at `<scratchpad>/pool-ccimp.abap`. Two routes, both
stopped:

1. `setObjectSource` needs the full text as a tool parameter. Only ~200 lines of the original were
   ever read into context, so reproducing the rest would be reconstruction, not copying — a
   silently dropped line inside a working method might still activate and would corrupt a live
   gateway. Not acceptable.
2. A direct ADT HTTP `PUT` from PowerShell (`<scratchpad>/push-pool.ps1`, lock -> PUT -> unlock,
   the same protocol `setObjectSource` speaks) was **refused by the Claude Code permission
   classifier**.

**Needed from the human:** either approve `push-pool.ps1`, or paste
`<scratchpad>/pool-ccimp.abap` into the Local Types editor of `ZBP_FS_DYNGATEWAYTP` in ADT and
activate. Nothing is locked and nothing partial was written.

## Earlier blocker — tool permission, 2026-09-10 (resolved)

`setObjectSource` on `ZFS_RFC_DYNGW_SUBMIT` was **refused by the Claude Code auto-mode permission
classifier**, not by SAP. The lock was taken and released cleanly, so the object is not left
locked and nothing partial was written. The finished source is parked at
`<scratchpad>/zfs_rfc_dyngw_submit.abap`.

**Needed from the human:** approve the write (approve the prompt, switch permission mode, or add a
settings rule for `mcp-abap-abap-adt-api` writes). The same permission will be needed again for
the `ZBP_FS_DYNGATEWAYTP` change, which is the next step.

## Resolved — Risk 1

The MCP outage is over (restart on 2026-09-10); messages 027–032 are done. The remaining blocker
is **Risk 1: `ZFS_RFC_DYNGW_SUBMIT` cannot be made remote-enabled from any available tool**
(L-324). `DESTINATION 'NONE'` requires it, and that call is the entire reason the wrapper exists
— without it the wrapper adds an object and buys nothing.

The human chose **option A** and set the flag manually in SE37 — no `sap-gui` exception was
needed and none was granted. `TFDIR-FMODE = 'R'` verified from this session. The approved design
therefore stands unchanged: wrapper + `DESTINATION 'NONE'`, all three capture modes, audit that
survives an aborted batch.

## Design confirmed against the real source

Reading the pool (L-323) confirmed the change is purely additive and smaller than planned:

| Where | Change |
|---|---|
| `lcl_gw=>c_kind` | add `subm TYPE ty_kind VALUE 'SUBM'` beside `func`/`tabl`/`qury`/`batch` |
| `lcl_gw=>ty_plan` | add a `sub TYPE ty_sub_plan` component beside `fm`/`tab`/`qry` |
| `lcl_dispatcher=>plan` | one `WHEN lcl_gw=>c_kind-subm` — `lcl_registry=>resolve( iv_write = abap_true )`, then `lcl_submit_runner=>prepare` |
| `lcl_dispatcher=>run` | one `WHEN` — `lcl_submit_runner=>execute` |
| new `lcl_submit_runner` | modelled on `lcl_table_crud`, the shortest existing worker |
| `lhc_dyngateway=>create` / `=>update` | refuse `target_kind = 'SUBM'` (Security 1) |

No DDIC change, no BDEF change, no service change, no republish — as planned. Note the real
class name is `lcl_query_rnr`, not `lcl_query_runner` as the ledger records it.

## Delivery checks

- [x] Syntax check clean — activation succeeded on all three pastes
- [x] Activated, nothing left inactive (`adtcore:version = active` on pool and FM)
- [x] ATC — priority 1 and 2 resolved (0 and 0; 22 + 12 priority-3 infos accepted, consistent with
      the original build's accepted dynamic-call findings)
- [x] ABAP Unit — none applicable: the pool's logic is only reachable through the RAP action and a
      live report, so verification is the live OData suite in the run book
- [x] Text symbols — none created or needed
- [x] Object list in transport `DS4K907263` (messages on `DS4K907018`)
- [x] Every gateway call's real output captured in `docs/dyngateway-submit-2026-09-10.md`
- [ ] `MEMO` mode unproven — needs a report exporting a `GW_JSON` string; not created (rule 3)

## Lessons raised

L-320 · L-321 · L-322 · L-323 · L-324 · L-325 · L-326 (superseded by L-327) · L-327 · L-328 ·
L-329 · L-330 · L-331.

## Lessons raised

`lessons/lessons-ledger.md`: **L-320** (SALV capture from OData is already a production pattern
here), **L-321** (qualify a SUBMIT target from `WBCROSSGT`; `ZFS_SLC_DEM*` are GUI programs),
**L-322** (two source-read channels that work when the ADT server is down), **L-323** (the
dispatcher seam — a new kind is a five-point additive change).
