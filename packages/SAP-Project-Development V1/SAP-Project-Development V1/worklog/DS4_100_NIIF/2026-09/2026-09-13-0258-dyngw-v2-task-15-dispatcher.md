# Dynamic Gateway v2 — Task 15: dispatcher and execution-session RFC (closeout)

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (task DS4K907264)
- **Requested by:** Aster T. (via the v2 build controller)

## Scope

Closeout of Task 15 of the Dynamic Gateway v2 build. A prior session created both objects but ended
before it could verify, document and commit them. The activity began as verification only and grew
twice while it was running:

1. **The authorization state changed under the task.** The human created `ZFS_DYN_GW_ROLE` and
   assigned it to `FS_DEV3` mid-session. One dispatcher live test, which asserted refusal, went red
   — correctly, because the caller is now authorized. That test was rewritten.
2. **The Task 14 review landed** with one Important and four Minor findings, batched into this
   closeout because the enforcement point for the Important one is this dispatcher's call site.

In scope: read-back and verification of both Task 15 objects; the whole-framework ABAP Unit census;
ATC over the package; the live-test rewrite; the five Task 14 review findings; worklog, ledger and
report.

Out of scope and deliberately not done: seeding `ZFS_T_DYN_REG` (Task 18 owes it — seeding the live
allow list to make a test pass would move the security boundary for the convenience of a test); the
durable call/step log (Task 16+); the RAP service layer (Task 18). No role, user or profile was
created. The four unrelated inactive objects on the system (`ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) belong to other people's work and were
left untouched.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Should the priority-3 `0007 Use of ROLLBACK WORK` on `ZFS_RFC_DYN_EXECUTE` be raised as a formal ATC exemption with the spec §12 risk-3 justification? The brief anticipated a flag; it landed as **priority 3 (info)**, not an error, so nothing is blocked, and raising an exemption creates approval workflow state on the system. | open — needs the human | — |
| 2 | `ZFS_T_DYN_REG` is empty, so a *fully* end-to-end dispatch — including the real allow-list read — is still not provable. `LTC_DISPATCH_LIVE~REAL_QUERY_DISPATCH_RUNS` proves every other hop for real. Confirm Task 18 seeds the allow list rather than Task 15. | open — Task 18 | — |
| 3 | `ZCL_FS_DYN_HDL_FUNC`'s dynamic `CALL FUNCTION` still has **no live coverage** — all five of its tests run against `LTD_FAKE_RUNTIME`, and the one live FUNC-shaped dispatch here targets a synthetic FM through the substituted runtime. The addendum named it the highest-value live probe. Worth a follow-up now that the role exists. | open | — |
| 4 | ~~When will a PFCG role granting `ZFS_DYNGW` be assigned?~~ | **Answered: `ZFS_DYN_GW_ROLE` created and assigned to `FS_DEV3`. L-426 superseded by L-434.** | 2026-09-13 |

## Naming gate

Both objects already existed; the gates are restated from the prior session and re-validated against
`docs/naming-conventions.md` on read-back. Neither name was inherited from a generator. No object was
created in this activity, so no new gate was required.

```
NAMING: ZCL_FS_DYN_DISPATCH -> matches pattern row "Class | ZCL_FS_<AREA>_<NAME>"
        (AREA = DYN, NAME = DISPATCH)
NAMING: ZFS_RFC_DYN_EXECUTE -> matches pattern row "Function group / FM ... (RFC: ZFS_RFC_<NAME>)"
        (NAME = DYN_EXECUTE), in the existing function group ZFS_FG_DYN_GW
```

## Todo

- [x] 1. Read both objects' source; confirm active, and confirm `EV_COMMITTED`/`EV_ROLLED_BACK` are `CHAR1`.
- [x] 2. Confirm nothing from `ZFS_DYN_GW` is inactive.
- [x] 3. Whole-framework ABAP Unit census, declared vs. ran (L-398, L-413).
- [x] 4. ATC over the package.
- [x] 5. Confirm `ZFS_T_DYN_REG` still empty and not seeded.
- [x] 6. Rewrite `REAL_AUTH_DENIAL_RUNS_NONE` so it holds under either grant state.
- [x] 7. Demonstrate a positive end-to-end dispatch now that the role exists.
- [x] 8. Task 14 review Important 1 — pass the RAW target to `ASSERT_EXECUTE`.
- [x] 9. Task 14 review Minors 1–4.
- [x] 10. Re-activate, re-census, re-ATC.
- [x] 11. Worklog, ledger (L-431…L-434), report, commit.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_DISPATCH` | CLAS/OC | ZFS_DYN_GW | DS4K907263 | **Changed** — raw-target gate, un-chained `TY_STEP_RESULT`; active |
| `ZCL_FS_DYN_DISPATCH` (testclasses) | CLAS/OC include | ZFS_DYN_GW | DS4K907263 | **Changed** — live suite rewritten, 6 + 4 = 10 methods; active |
| `ZFS_RFC_DYN_EXECUTE` | FUGR/FF in `ZFS_FG_DYN_GW` | ZFS_DYN_GW | DS4K907263 | **Changed** — raw targets extracted and passed; active, Remote-Enabled |
| `ZCL_FS_DYN_AUTH` | CLAS/OC | ZFS_DYN_GW | DS4K907263 | **Changed** — Minor 2, `msgv2` carries the target; active |
| `ZCL_FS_DYN_AUTH` (testclasses) | CLAS/OC include | ZFS_DYN_GW | DS4K907263 | **Changed** — Minors 1/3/4, 14 + 4 = 18 methods; active |

**No object was created or deleted.** No message was created — the highest allocated number in
`docs/message-catalog/DS4_100_NIIF.md` is still **049**, and message `040` was reused unchanged. No
text element was created or modified by any route.

## What was changed, and why

### Important 1 — the width guard was unreachable (L-433)

`ZCL_FS_DYN_AUTH=>CAN_EXECUTE` refuses a target longer than 30 rather than letting ABAP truncate it
into `ZDYNTGT` — L-425's bypass. The refusal was dead code: `TY_STEP-TARGETNAME` is CHAR30, so the
JSON parse had already shortened a 40-character `SUBM` report name before the gate ever saw it.

Fixed inside Task 15's own two objects, with no change to `ZIF_FS_DYN_HANDLER` or any handler:

- `ZCL_FS_DYN_DISPATCH=>RUN( )` gained **`RAW_TARGETS TYPE string_table OPTIONAL`** — the request's
  target strings, parallel to `STEPS` by index, un-shortened. `GATE_AUTHORIZATION` now takes the
  step index and calls `ASSERT_EXECUTE` with `RAW_TARGET_OF( )`, falling back to `STEP-TARGETNAME`
  when no raw target was supplied. Optional, so no existing caller had to change.
- `ZFS_RFC_DYN_EXECUTE` deserializes the same JSON a **second** time into a `STRING`-typed target
  structure and passes the result. The second pass is not redundant — it is the only copy of the
  target that has not already been truncated.

Pinned by `LTC_DISPATCH_LIVE~OVER_LONG_TARGET_REFUSED`, which is falsifiable: `ZDYNTGT '*'` means
the 30-character control **passes** the gate, so the 40-character refusal can only be the width.
Remove `RAW_TARGETS` and the test goes red on its first assertion.

### Minor 1 — an L-408 assertion had switched itself off

`LTC_AUTH_LIVE~REAL_EXEC_AND_ASSERT_AGREE` kept its rendered-text assertions inside a `CATCH`. Once
the role was assigned nothing raised, the `CATCH` stopped running, and three assertions stopped
executing while the test stayed green. Moved to `REAL_OVER_LONG_DENIED`, whose refusal is
unconditional — no profile can make a 31-character target fit a CHAR30 field.

### Minor 2 — the exception now names the refused target

`ASSERT_EXECUTE` passes `msgv2 = CONV #( target )`. Message 040's pattern has only `&1`, so the
rendered text a caller sees is unchanged to the character and nothing leaks; `MV_MSGV2` is PUBLIC
READ-ONLY, so Task 16's log can name which of a fifty-step batch was refused.

### Minors 3 and 4 — two invariants pinned, no production change

- `WIDTHS_STAY_EQUAL` asserts `C_TARGET_MAXLEN`, `ZFS_T_DYN_REG-TARGET_NAME` and
  `TY_STEP-TARGETNAME` are all 30, via `CL_ABAP_ELEMDESCR=>OUTPUT_LENGTH`.
- `VALID_KINDS_MATCH_FACTORY` asserts the kinds `IS_VALID_KIND` accepts are exactly the kinds
  `ZCL_FS_DYN_FACTORY=>SUPPORTS( )` accepts. **The test, not delegation** — per the review, so the
  gate cannot be widened by editing the factory. `IS_VALID_KIND` stays private; the comparison runs
  through `CAN_EXECUTE` with a wildcard grant.

### The live-test rewrite (L-434)

`REAL_AUTH_DENIAL_RUNS_NONE` hard-coded `exec_status = 'E'` — the system's configuration, not the
dispatcher's behaviour — and inverted the day the configuration was fixed. Replaced by four tests
that hold under either grant state and all reach the real `ZFS_DYNGW` check:

| Test | Shape | Can it fail? |
|---|---|---|
| `UNKNOWN_KIND_RUNS_NONE` | grant-independent: `ZCL_FS_DYN_AUTH` refuses an undefined kind before the `AUTHORITY-CHECK` | **Yes** — delete the dispatcher's `ASSERT_EXECUTE` and the factory refuses with a different message, so `040` + `AUTH` goes red |
| `REAL_GATE_AGREES_WITH_AUTH` | symmetric: ask the real gate, then require the dispatcher to agree; the granted branch asserts the step *executed*, not merely "wasn't refused" | Yes, on either branch |
| `OVER_LONG_TARGET_REFUSED` | grant-independent width refusal, with the 30-character control | **Yes** — re-truncate the target and it goes red |
| `REAL_QUERY_DISPATCH_RUNS` | the positive end-to-end dispatch | Yes |

## Verification evidence

### Source read-back

- `ZCL_FS_DYN_DISPATCH` — was 671 lines and active as reported; now carries the raw-target gate.
- `ZFS_RFC_DYN_EXECUTE` — `EV_COMMITTED` and `EV_ROLLED_BACK` are both `TYPE char1`. **The
  `ABAP_BOOL` → `CHAR1` correction was already applied on the system**; it was verified, not redone.

### Inactive objects

`inactiveObjects` returns nothing from `ZFS_DYN_GW`, before and after all edits. Every change was
activated before its tests were run (L-398).

### ABAP Unit census — whole framework

One run over `/sap/bc/adt/packages/zfs_dyn_gw`. "Declared" counted from each test include's source;
"ran" from the run result. **121 declared / 121 ran / 0 alerts** (was 116 before this activity: +2
in `ZCL_FS_DYN_AUTH`, +3 in `ZCL_FS_DYN_DISPATCH`).

| Class | Test classes | Declared | Ran | Alerts | Duration / risk |
|---|---|---|---|---|---|
| `ZCL_FS_DYN_AUTH` | `LTC_AUTH` (14), `LTC_AUTH_LIVE` (4) | 18 | 18 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_BUDGET` | `LTC_BUDGET` | 12 | 12 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_DISPATCH` | `LTC_DISPATCH` (6), `LTC_DISPATCH_LIVE` (4) | 10 | 10 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_FACTORY` | `LTC_FACTORY` (9), `LTC_FACTORY_LIVE` (3) | 12 | 12 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_HDL_FUNC` | `LTC_FUNC` | 5 | 5 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_HDL_QUERY` | `LTC_QUERY` | 9 | 9 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_HDL_REGI` | `LTC_REGI` (11), `LTC_REGI_LIVE` (3) | 14 | 14 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_HDL_SUBMIT` | `LTC_SUBMIT` | 9 | 9 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_HDL_TABLE` | `LTC_TABLE` | 9 | 9 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_JSON` | `LTC_JSON` | 9 | 9 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_REGISTRY` | `LTC_REGISTRY` | 9 | 9 | 0 | SHORT / HARMLESS |
| `ZCL_FS_DYN_RUNTIME` | `LTC_RUNTIME` | 5 | 5 | 0 | SHORT / HARMLESS |
| `ZCX_FS_DYN_ERROR` | — | 0 | 0 | 0 | test include is the empty stub |
| `ZBP_FS_DYNGWREGTP` | — | 0 | 0 | 0 | test include is the empty stub |
| **Total** | **16 test classes** | **121** | **121** | **0** | all SHORT / HARMLESS |

The prior agent's **116/116/0 was confirmed** at the start of this activity before any edit. Every
test class is `DURATION SHORT RISK LEVEL HARMLESS`, so none was silently skipped by the default
run's duration filter (L-413); the two classes contributing 0 hold only the empty test-include stub
and were read to confirm it, not inferred from absence (L-432).

### ATC — package `ZFS_DYN_GW`

Final worklist `5254001FE7A21FD1ABDBE7B781638000`, 16 objects, **69 findings** (was 70 before the
edits — the dispatcher's `W199` ABAP Doc finding is gone, L-431).

| Priority | Count | Assessment |
|---|---|---|
| 1 (error) | **0** | — |
| 2 (warning) | **3** | All three are `0070` HANA column-store notes on `ZFS_T_DYN_CALL` (indexes `EXA`, `EXB`) and `ZFS_T_DYN_STEP` (index `CAL`) — **Task 4/5 log-table objects, pre-existing, and a deliberate index design. None is on a Task 15 object.** |
| 3 (info) | 66 | Mostly `1700`/`1713` "strings without text elements" on developer-facing diagnostic literals inside exception detail text — not UI text, not text-element candidates (rule 4). Also 8 × `0005 Call Executable Program` on `ZFS_RFC_DYN_SUBMIT`, 3 × `1701` undefined text symbols on `ZFS_R_DYN_PURGE` (Task 5, already on the human's list), 1 × `W320`, 1 × `AMB_SINGLE`. |

Across all five objects touched in this activity there are now exactly **three** priority-3 findings
and nothing higher:

- `ZFS_RFC_DYN_EXECUTE` line 138 — `0007 Use of ROLLBACK WORK`. **Expected and correct**: this is
  the execution-session boundary, outside RAP, and is precisely where the statement must live (spec
  §6.1, §12 risk 3; L-350). It is an *info*, so nothing is blocked; see open question 1.
- `ZCL_FS_DYN_DISPATCH` testclasses lines 115, 145 — two `1700` literals inside test doubles.
- `ZCL_FS_DYN_AUTH` — **zero findings**, main and test include.

### Allow list

`ZFS_T_DYN_REG` read with `tableContents`: **0 rows**, before and after. Nothing was seeded.

### What is now proven live

`ZFS_DYN_GW_ROLE` grants `FS_DEV3` `ZFS_DYNGW` with `ZDYNTGT '*'`, all five `ZDYNKIND` values and
`ACTVT 01/02/03/16`. The grant took effect in the running session's authorization buffer with **no
re-logon**, which is how the old test was caught going red.

`LTC_DISPATCH_LIVE~REAL_QUERY_DISPATCH_RUNS` is therefore **the first positive end-to-end dispatch
in this build**. It runs a `QURY` step through the real `ZFS_DYNGW` `AUTHORITY-CHECK`, the real
`ZCL_FS_DYN_FACTORY`, the real `ZCL_FS_DYN_HDL_QUERY` and the real `ZCL_FS_DYN_RUNTIME` issuing a
real `SELECT` on `T000`, asserts `exec_status = 'S'`, a non-zero `resultcount` and a non-empty
`rowsjson`, and ends on `ROLLBACK WORK` under CommitMode `NEVER` so it writes nothing.

**One hop is still not proven: the allow-list read.** `ZFS_T_DYN_REG` is empty, so the registry row
comes from the substituted `READ_DB`. That is stated in the test's own comment rather than glossed.
`LTC_REGISTRY~LIVE_UNREGISTERED_IS_017` covers the allow-list hop separately against the real, empty
table. Seeding it is Task 18's, and was not done here.

### JOB-mode wall-clock interaction

Recorded rather than left unexamined (addendum §3). A `SUBM` step in capture mode `JOB` can block for
its own 400 s poll ceiling, exceeding the 300 s request wall-clock budget. The dispatcher checks the
clock **between** steps in both phases and never interrupts a running step, so such a step runs to
completion and the batch is refused at the next step boundary. A half-executed step killed mid-flight
is a worse outcome than a slow one, and a `JOB` step's writes are outside the rollback anyway
(spec §6.4).

## Delivery checks

- [x] Pretty Printer — house style throughout; all edits hand-formatted to match the surrounding source.
- [x] Syntax check clean — all five objects activated, which entails a clean syntax check.
- [x] Activated, nothing left inactive — `inactiveObjects` shows nothing from `ZFS_DYN_GW`.
- [x] ATC — **priority 1: 0. Priority 2: 3, none on an object touched by this activity.**
- [x] ABAP Unit green — 121 declared / 121 ran / 0 alerts across 16 test classes.
- [x] Text symbols and selection texts — **none created or modified**. The 3 × `1701` findings on
      `ZFS_R_DYN_PURGE` (text symbols `001`, `I01`, `I02`) remain on the human's maintenance list
      from Task 5, to be done via SE38 Text Elements through `docs/sap-gui-object-automation.md`.
- [x] Object list confirmed in the transport — all five on DS4K907263.
- [x] Routing — every change via `mcp-abap-abap-adt-api` `setObjectSource`; **no object created**, so
      `adt-mcp` was used only for ATC.

## Fix round 1 — Task 15 review (same day)

The Task 15 review returned **spec &#10060;, not approved**: 1 Critical, 1 Important, 3 Minor. All
addressed in the same activity; detail in the task report.

| Finding | Outcome |
|---|---|
| **Critical 1** — a `SUBM` step's `DESTINATION 'NONE'` RFC implicitly commits the caller's LUW, so earlier writes survive a rollback reported as successful (L-350's mechanism, second door) | **Fixed.** New `CHECK_LUW_COHERENCE` refuses, in phase 1 before anything executes, a batch containing both a step whose effects leave the LUW and a step that writes inside it. Keyed on `ZCL_FS_DYN_FACTORY=>RUNS_IN_CALLER_LUW( )`, not on `kind = 'SUBM'`. **L-450** |
| **Important 1** — `RAW_TARGETS` optional made the width guard opt-in | **Fixed.** Now mandatory on `RUN( )`. `TY_STEP-TARGETNAME` not widened. Ten call sites updated. |
| **Minor 1** (ruled in) — phase-1 failure issued no rollback | **Fixed.** Unconditional `rollback_luw( )`, pinned by `PHASE_ONE_FAILURE_ROLLS_BACK`. |
| **Minor 2** — `IV_ACTION` unused | **Kept and documented** — it feeds `ZFS_T_DYN_CALL-ACTION` and Task 17's logger; enforcing action-to-kind is Task 18's. |
| **Minor 3** — boundary `CATCH` loses per-step detail | **Deferred** by the controller to the final review. |
| **Nit** — auth comment named a non-existent test method | Fixed. |

**A bug in my own fix, caught by its own control test (L-451).** The first version tested
`needs_write` alone. A `SUBM` handler's `NEEDS_WRITE( )` is `abap_true` (L-351), so a *lone* `SUBM`
step satisfied both halves of the condition and **refused itself**; the headline test could not see it
because its batch also held a real write. `SUBM_WITH_READ_IS_ALLOWED` went red and found it. The
condition now also requires the write step to be `in_caller_luw = abap_true` — the scope actually
being protected.

**One instruction could not be followed literally.** The ruling said to use `runs_in_caller_luw( )`,
which L-351 describes — but it had never been implemented on `ZIF_FS_DYN_HANDLER` or any handler. I
did not hard-code `'SUBM'` and did not add an interface method (L-407: that forces every implementing
class to change, and a concurrent implementer was live in this package). It went on
`ZCL_FS_DYN_FACTORY` beside `SUPPORTS( )`, already pinned as the single source of truth for kinds.
Flagged to the controller for a ruling.

### Post-fix verification

- **ABAP Unit:** 124 declared / 124 ran / 0 alerts, 16 test classes, all SHORT/HARMLESS (was 121).
- **ATC** over the four changed objects (worklist `5254001FE7A21FD1ABE0E8D78A36E000`): **0 errors,
  0 warnings, 19 infos.** `ZCL_FS_DYN_AUTH` zero findings. Scoped to four objects rather than the
  package because the concurrent Task 16 work is live in `ZFS_DYN_GW`.
- **Inactive:** nothing of mine. `ZFS_R_DYNGWCALLTP` is Task 16's and was not touched.

### Objects changed in the fix round

| Object | Change |
|---|---|
| `ZCL_FS_DYN_DISPATCH` + testclasses | LUW coherence refusal, mandatory `RAW_TARGETS`, phase-1 rollback, 3 new tests |
| `ZCL_FS_DYN_FACTORY` | new `RUNS_IN_CALLER_LUW( )` |
| `ZFS_RFC_DYN_EXECUTE` | `IV_ACTION` documented; passes `RAW_TARGETS` as a mandatory argument |
| `ZCL_FS_DYN_AUTH` | comment nit |

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-431**, **L-432**, **L-433**,
**L-434**, and from fix round 1 **L-450**, **L-451**. **L-426 marked superseded by L-434.**
(L-435-L-439 belong to the concurrent Task 16 implementer; L-450+ is this task's partition.)
