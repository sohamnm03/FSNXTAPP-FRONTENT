# Complete approved gateway framework

- **Date:** 2026-09-11
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** human: implement the remaining approved plan

## Scope

Continue the framework implementation from the live state. Earlier implementation history is in
2026-09-10-1247-gateway-framework-implement.md. Preserve existing response semantics through migration.

Waves 2 and 3 of `docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md` (rev 3). Wave 4
(`IdempotencyKey`, `ApiVersion`, log exposure) stays blocked — all three are contract changes
needing a republish, which decision 3 forbids until the human decides.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Existing-object implementation authorization | User explicitly requested remaining implementation repeatedly; proceed | 2026-09-11 |
| 2 | Wave 4 republish and log exposure | Still unresolved; not part of the no-republish migration | |
| 3 | AUTH mode authorization object | Unresolved; OPEN development mode was approved. `AUTH` is built **fail-closed** — it refuses everything until the object is named, rather than inventing one (rule 6) | |
| 4 | **An aborted batch no longer rolls its writes back (L-350).** Accept, or re-engineer the durable emit? | **Open — needs the human.** Four options in L-350; picking one silently is the only wrong move | |

## Naming gate

Recorded before each create call, against `docs/naming-conventions.md`:

```
NAMING: ZCL_FS_SLC_GW_REGPOL      -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
NAMING: ZCL_FS_SLC_GW_REGI        -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 112), AREA=SLC
NAMING: ZCL_FS_GW_HANDLER_FACTORY -> matches "Factory / injector | ZCL_FS_<NAME>_FACTORY" (line 117)
```

## Messages created

Three, on `ZFS_TRM_MSG`, transport `DS4K907263`, verified in `T100` after the write and added to
`docs/message-catalog/DS4_100_NIIF.md` in the same turn. Next free number is now **036**.

| No | Type | Text |
|---|---|---|
| 033 | E | You are not authorized to register gateway target &1 |
| 034 | E | Invalid registration payload for target &1: &2 |
| 035 | E | Target &1 is already registered |

## Todo

- [x] 1. Verify SAP source reads and official destination.
- [x] 2. Verify regression client metadata and CSRF access using existing configured credentials.
- [x] 3. Capture regression baseline before live changes.
- [x] 4. Implement instance handlers, factory, dispatcher and RAP lifecycle wiring.
- [x] 5. Implement REGI and policy with pending-registration overlay.
- [x] 6. ATC, live regression, REGI acceptance and the rollback durability test.
- [ ] 7. ABAP Unit test includes + the handler conformance base class — **not built.** See below.
- [ ] 8. Decide question 4 (L-350) before anything else is built on this abort path.

## Object list

| Object | Type | Change | Status |
|---|---|---|---|
| `ZCL_FS_SLC_GW_FUNC` | CLAS/OC | converted to `ZIF_FS_SLC_GW_HANDLER` + runtime port; static wrappers kept | activated |
| `ZCL_FS_SLC_GW_TABLE` | CLAS/OC | same conversion | activated |
| `ZCL_FS_SLC_GW_SUBMIT` | CLAS/OC | same conversion | activated |
| `ZCL_FS_SLC_GW_BASE` | CLAS/OC | `c_kind-regi`, `c_op-update`/`-upsert`, `ty_regi_plan` | activated |
| `ZCL_FS_SLC_GW_REGISTRY` | CLAS/OC | `declare_pending`, `exists`, `committed_row` — the L-344 overlay | activated |
| `ZCL_FS_SLC_GW_DISPATCH` | CLAS/OC | factory-built handlers, REGI branch, `runs_in_caller_luw( )` dirty rule | activated |
| `ZCX_FS_GW_ERROR` | CLAS/OC | textids 033–035 | activated |
| `ZCL_FS_SLC_GW_REGPOL` | CLAS/OC | **new** — OPEN / AUTH / OFF policy | created, activated |
| `ZCL_FS_SLC_GW_REGI` | CLAS/OC | **new** — the fifth step kind | created, activated |
| `ZCL_FS_GW_HANDLER_FACTORY` | CLAS/OC | **new** — kind → handler | created, activated |
| `ZFS_TRM_MSG` | MSAG/N | messages 033–035 | written, verified in `T100` |

All 12 classes are recorded on task `DS4K907264` (child of `DS4K907263`), confirmed in `E071`.
Nothing left inactive, no locks held.

**Transport caveat — L-355.** `ZFS_TRM_MSG` is **not** on this transport, despite the write
passing `DS4K907263` and returning success. `E071` puts it on `DS4K907019` / `DS4K907194`, older
tasks from earlier sessions that are still modifiable: an object already locked to an open task
stays there. So messages 033-035 travel on a different request than the classes that raise them.
Release them together, or reassign the message class in `SE09` first - not done here, because
moving an object off a human's open task is their call.

## Verification

**ATC**, DEFAULT variant, 12 objects in one run: **0 errors, 0 warnings, 23 priority-3 infos.**
Priority 1 and 2 are clean, which is the standard. The infos are the same accepted categories as
the pre-existing baseline (dynamic calls, `ROLLBACK WORK` in the log FM, untranslated internal
strings).

**Regression** — `scripts/gateway-regression.ps1`, all six cases, every result matching the
documented pre-refactor behaviour:

| Case | Result |
|---|---|
| unknown target | `E` 017 |
| query `ZFS_CDS_SLC_001` | `S`, 2 rows |
| unknown field | `E` 023 |
| row limit | `E` 025 |
| empty batch | `E` 022 |
| phase-1 reject | `E`, step 1 `P`, step 2 `E` 017, nothing executed |

Last session's blocker was the PowerShell execution policy. No override was needed in the end:
`powershell -NoProfile -ExecutionPolicy Bypass -File ...` is the form `CLAUDE.md` already
prescribes for this workspace's own scripts.

**REGI acceptance**, five cases, all as designed:

| Case | Result |
|---|---|
| `[REGI T001, QURY T001]` in one call | **both `S`** — step 2 resolved against step 1's pending declaration and returned 2 rows |
| duplicate `INSERT` | `E` **035** |
| `TargetKind: "NOPE"` | `E` **034** "TargetKind NOPE is not registrable" |
| empty `ImportJson` | `E` **034** "ImportJson is empty" |
| `UPDATE` on unregistered target | `E` **017** |

The first row is the one that matters: single-call register-and-use works, which is L-344's
pending-registration overlay proven live, and `REGI` cost one new class plus one factory row with
no edit to any existing handler — decision 1 cashed in.

**Rollback durability** — the case the design named as unprovable by unit test. Batch
`[TABL insert, TABL insert same key]`, step 1 writes, step 2 fails at execute, dispatcher aborts.

| Property | Result |
|---|---|
| Aborted batch answers with a reason | **fixed** — HTTP 400 **with** message 020 naming the failing step, not the empty body of L-313 |
| Log survives the rollback | **works** — call row + both step rows, phase `X`, step 1 `S/026`, step 2 `E/020`, all present after the LUW was gone |
| Writes roll back | **FAILS — see L-350** |

**Test artifacts cleaned up.** The `T001` registration and the orphaned probe row were both
deleted through the service's own OData `DELETE` and verified absent (`COUNT(*) = 0`). The log
rows the tests produced were left: they are genuine audit records of genuine calls.

## The defect the durability test found — L-350

`EMIT_DURABLE` writes through `CALL FUNCTION ... DESTINATION 'NONE'`. A synchronous RFC triggers
an **implicit database commit in the caller**, and the emit runs on the abort path *before* the
pool fails the request — so it commits the very writes the abort exists to undo. Step 1's row was
still on the database afterwards and had to be deleted by hand.

The log durability rev 2 was built for is real and now proven. It was bought with the atomicity of
the work, and nobody noticed because the design reasoned about the log row's LUW and never about
what the RFC does to the caller's.

This invalidates, in writing, the design's claim that `REGI` provisioning is all-or-nothing: it is
not, whenever the batch aborts — which is the only case where the claim matters.

**Not fixed here on purpose.** The four options are in L-350 and they are genuine trade-offs
(accept and document · emit through a background unit / qRFC that forces no commit · drop the
durable emit and go back to L-313 · stage and emit outside the RAP LUW). This is question 4 above.

## Not built, and why

**ABAP Unit test includes and `ZCL_FS_SLC_GW_HANDLER_TEST`.** The conformance base class as
specified asserts `needs_write( ) → runs_in_caller_luw( )`, and L-351 records that `SUBM`
falsifies that invariant correctly — so writing the test as designed would fail the one handler
that is right. The invariant needs restating before the test is worth having, and restating it is
a design decision. Everything else the tests would cover was exercised live instead: every
validation path in the regression and REGI suites, and the two things unit tests cannot reach
(durability, register-and-use) directly.

**Wave 4** — unchanged, still blocked on the republish decision.

## Follow-up pass — same day, human-requested

Three requests after the initial completion report.

**1. Full acceptance suite run, not just the six-case regression.** Built and ran all of
`docs/dyngateway-integration-guide.md` §12 (P1-P11, N1-N15) plus the REGI suite (R1-R8) and the
abort case (D1) — 35 cases total, **33 pass**. Two apparent failures were both informative rather
than real:
- **N6** — my expected-string assertion was wrong, not the code. T100 substitution truncates each
  `&n` at 50 characters, so the guard fired correctly but the message text is shorter than I
  asserted.
- **P10** — a genuine, pre-existing defect (see item 2 below), not introduced by this build.
All test-created rows (`T005`, `T006`, the duplicate-insert probe) were deleted and verified
absent via `COUNT(*) = 0` after each pass.

**2. `MaxRows` — "pick up all the rows" was not reachable, and one path was actively broken.**
Root-caused and fixed; see **L-356**. `ZCL_FS_SLC_GW_QUERY` and `ZCL_FS_SLC_GW_SUBMIT` both
defaulted an unset registry `MAX_ROWS` to `c_max_rows_default` (100) instead of treating `0` as
"no ceiling" — and `SUBMIT` additionally *compared* an unset request `MaxRows` against that same
assumed 100 before ever consulting the ceiling, refusing any `SUBM` step whose target ceiling was
below 100 (this was the P10 acceptance-suite failure, confirmed pre-existing by diffing against
the source read at the start of this session — the framework migration preserved it faithfully,
it did not introduce it). `ZCL_FS_SLC_GW_RUNTIME=>select_rows` now branches on `is_plan-max > 0`
and omits `UP TO n ROWS` entirely when uncapped, rather than relying on `UP TO 0 ROWS`. Verified
live: `T005` registered with `MaxRows:0` returned all 250 rows of a 250-row table with no
`MaxRows` on the request, and exactly 7 when the request asked for 7; every pre-existing non-zero
ceiling (`T000` = 20, etc.) still refuses an over-ceiling request exactly as before. `SUBM`
against `ZFS_R_TRM_FWDTXN` (ceiling 25) with no request `MaxRows` now succeeds in both `NONE` and
`SALV` mode, where it previously failed 025.

**3. Wrote `docs/dyngateway-how-it-works.md`** — a consolidated conceptual + practical guide:
architecture, the URL, `ZFS_T_SLC_DYNGW` explained (registry vs. log rows, what's stored but not
exposed over OData), exactly how the registry resolve/buffer/kill-switch works, full JSON for
every action and every `ExecuteBatch` step kind, `REGI` in depth (the two `Operation` fields,
INSERT/UPDATE/UPSERT, the pending-overlay mechanism, REGPOL modes), FM EXPORTING/TABLES mapping
with live-verified examples, the new `MaxRows=0` semantics, and the L-350 atomicity caveat stated
plainly so nobody discovers it the hard way. Cross-referenced from the design doc and existing
API docs rather than duplicating their wire-level detail.

**4. Human asked to delete the table's test data and start manual testing.** `ZFS_T_SLC_DYNGW`
held 25 registry rows (the real allow-list — `deliveryClass #A`, does **not** travel with the
transport, L-335) and 284 log rows (disposable). Captured a fresh backup of all 25 registry rows
plus a ready-to-send `REGI`-based `ExecuteBatch` restore payload (`registry-restore-2026-09-11-1237.json`,
`registry-backup-2026-09-11-1237.json`, `2026-09-11-1240-dyngw-registry-backup.md`) before touching
anything — the same "REGI becomes the L-335 restore path" case the 2026-09-10 backup note had
already anticipated. Purged all log rows via the service's own `DELETE`, twice (once before the
MaxRows verification pass, once after, to leave the table genuinely clean for manual testing).
**Final state: 25 registry rows (exactly the backed-up set), 0 log rows.** Demonstrated
single-call register-and-use live on the clean table as direct evidence the approved plan
(register and execute in one call) works end to end.

**Objects touched in this pass**, all re-activated and re-verified:

| Object | Change |
|---|---|
| `ZCL_FS_SLC_GW_RUNTIME` | `select_rows` branches on `max > 0`; omits `UP TO n ROWS` when uncapped |
| `ZCL_FS_SLC_GW_QUERY` | `MAX_ROWS = 0` on the registry row now means no ceiling |
| `ZCL_FS_SLC_GW_SUBMIT` | same rule; also fixes the omitted-`MaxRows` defaulting bug (P10) |

ATC re-run on all three: **0 priority-1, 0 priority-2**, same pre-existing priority-3 categories,
no new findings. Six-case regression re-run and still byte-identical to baseline.

## Delivery checks

- [x] Syntax clean; everything activated, nothing inactive
- [x] ATC — 0 priority-1, 0 priority-2 across all 12 objects
- [ ] ABAP Unit — not built, see above
- [x] Regression green, byte-identical to the documented baseline
- [x] REGI acceptance suite green
- [x] Rollback durability tested — log survives; **writes do not roll back (L-350)**
- [x] No contract change, no republish: no abstract entity, BDEF, service definition or binding touched
- [x] Test data cleaned up and verified absent
- [ ] Transport: messages 033-035 sit on a different request than the classes (L-355) - resolve before release
- [x] No text elements required

## Lessons raised

**L-350** — the durable log's RFC implicitly commits the caller's LUW, so an aborted batch keeps
its writes. Found by the live test; four options, none taken.

**L-351** — `needs_write( )` and `runs_in_caller_luw( )` are different questions; `SUBM` separates
them and the rev-3 conformance invariant is wrong as written.

**L-352** — generalising the SUBM abort exemption would silently change what a failing QURY
returns; the dirty rule was generalised, the exemption deliberately was not.

**L-353** — `/ui2/cl_json` does not round-trip a hex string into a RAW16 key column.

**L-355** — a message class already locked to an older open task keeps taking new messages there,
whatever transport is passed; check `E071` after every `MSAG` write.

**L-354** — the wrapper technique that let three live classes move onto the interface with no
caller change and one kind converted at a time.
