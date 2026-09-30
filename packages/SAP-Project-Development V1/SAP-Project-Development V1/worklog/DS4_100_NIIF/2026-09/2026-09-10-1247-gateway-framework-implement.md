# Dynamic gateway — implement the remaining framework (waves 1–4)

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (`DS4` / client `100`, user `FS_DEV3` — confirmed live)
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 (continuing the transport the extract used)
- **Requested by:** human — "implement this plan"

## Scope

Implement what the framework design still calls for **after** the structural extraction, which is
already complete (`2026-09-10-1246-gateway-framework-extract.md`: 7 global classes live, pool at 313
lines, ATC clean, regression green).

Design: `docs/superpowers/specs/2026-09-10-1520-gateway-framework-design.md` (rev 3).

**Discovered at the start of this activity:** the design doc's closing section still read "Not
started — no object created, no source written", which was three phases out of date. Corrected in
the same turn. The doc's object list also omits `ZCL_FS_SLC_GW_BASE`, which exists, and assumes
handlers are being created from nothing when in fact rev 3 **rewrites seven live classes**.

## Waves

| Wave | Content | Risk | Status |
|---|---|---|---|
| 1 | `ZCX_FS_GW_ERROR`, `ZIF_FS_SLC_GW_RUNTIME` + `ZCL_FS_SLC_GW_RUNTIME`, `ZCL_FS_SLC_GW_LOG` + `ZFS_RFC_DYNGW_LOG` | none — new objects, unreferenced | in progress |
| 2 | handlers → instances on the interface with injected runtime; factory; dispatcher DI; drop `ty_plan`; `runs_in_caller_luw( )` | invasive — rewrites the 7 | not started |
| 3 | `REGI` + `REGPOL`; conformance test; unit tests | additive | not started |
| 4 | `IdempotencyKey` + `ApiVersion` + log-exposure fork — one republish | contract change | **blocked** |

**Wave 4 is blocked on an untaken decision.** `IdempotencyKey` and `ApiVersion` are both request
fields in `ZFS_AE_DynGwRequest`, so both are contract changes needing a republish, which decision 3
forbids. Rev 3 caught this for versioning and missed it for idempotency.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Rev 3 rewrites the 7 classes activated this morning. Proceed, or keep wave 2 additive? | Proceeding wave-by-wave, lowest risk first; wave 2 flagged before it starts | 2026-09-10 |
| 2 | Log-exposure fork (option A/B) + `ApiVersion` + `IdempotencyKey` — one republish or none? | **Open — blocks wave 4** | — |
| 3 | Which auth object backs `REGPOL` `AUTH` mode? | **Open** — only needed before leaving `OPEN` | — |
| 4 | `CL_OSQL_TEST_ENVIRONMENT` available on this release? | **Open** — Phase A gate, verify in wave 3 | — |

## Naming gate

Recorded **before** each create call (`docs/naming-conventions.md`):

```
NAMING: ZCX_FS_GW_ERROR -> matches pattern row "Exception class | ZCX_FS_<NAME>" (line 114)
```

Remaining wave-1 names to be gated immediately before their own create calls:
`ZIF_FS_SLC_GW_RUNTIME`, `ZCL_FS_SLC_GW_RUNTIME`, `ZCL_FS_SLC_GW_LOG`, `ZFS_RFC_DYNGW_LOG`.

## Messages

Next free number in `docs/message-catalog/DS4_100_NIIF.md` is **033**. Wave 3 (`REGI`) needs three:
033 unauthorised registration · 034 invalid registration payload · 035 target already registered.
None created yet.

## Todo

- [x] 1. Verify actual system state before writing anything — found the extraction already done
- [x] 2. Correct the stale "Not started" section in the design doc
- [x] 3. Probe `abap_list_destinations` (L-333) — returns `[DS4_100_NIIF]`
- [x] 4. Naming gate for `ZCX_FS_GW_ERROR`
- [x] 5. Create + write + activate `ZCX_FS_GW_ERROR` — **done, ATC 0 findings**
- [~] 6. `ZIF_FS_SLC_GW_RUNTIME` + `ZCL_FS_SLC_GW_RUNTIME` — **moved to wave 2.** The port is inert until handlers are injected, and its signatures must be derived from the handlers' real dynamic-call code, which wave 2 reads anyway. Designing it first would be inventing signatures
- [~] 7. `ZCL_FS_SLC_GW_LOG` + `ZFS_RFC_DYNGW_LOG` + DDIC log fields — **design complete, blocked on host outage before any create**
- [ ] 8. ATC on every new object; nothing left inactive
- [ ] 9. Wave 2 — flag the rewrite to the human before starting
- [ ] 10. Pretty Printer pass outstanding from the extract (its own open checkbox)

## Findings from reading the live code

**The log defect is deliberate and commented, not accidental.** `ZCL_FS_SLC_GW_DISPATCH~run_batch`
ends with:

```abap
IF ev_abort = abap_true.
  " The staged log row must not survive a request the caller is about to
  " fail - the RAP rollback would not remove it, because the saver has not
  " written it yet. Dropping it here keeps the log honest.
  CLEAR zcl_fs_slc_gw_base=>gt_log.
ENDIF.
```

The reasoning is sound in isolation — a row describing rolled-back work would mislead. The cost is
L-313: the aborted batch erases its own evidence. Rev 2's out-of-band emit gives both properties,
writing the row in its own LUW marked as aborted-and-rolled-back. **The fix is a replacement for
this `CLEAR`, not an addition elsewhere.**

**Row shape confirmed** (`finish( )`, DISPATCH ~line 186): `client`, `uuid`, `entry_type`,
`target_kind`, `target_name`, `operation`, `registry_uuid`, `exec_status`, `message_id`,
`message_no`, `message_text`, `row_count`, `duration_ms`, `executed_by`, `executed_at`,
`request_json`, `response_json`. Note `row_count` (not `result_count`), and
`response_json = export_json && tables_json && rows_json` — the unbounded field rev 2 caps.

**Per-step data already exists in memory.** `ty_step_result` carries step index, kind, target,
status, message, counts and `durationms`, and is serialised into the response. Rev 2's per-step
rows are about *persisting* what is already computed — cheaper than the design assumed.

**DDIC fields still required** before `ZCL_FS_SLC_GW_LOG` can compile: `parent_uuid`,
`step_index`, `phase`, `log_level`. This is a change to a live table and will be flagged before it
is made.

## Host outage during wave 1 (resolved — see status below)

Implementation was interrupted mid-wave-1 by a host outage. Not a tooling fault:

| Probe | Result |
|---|---|
| `getObjectSource` (change server, port 44300) | `connect ETIMEDOUT 10.40.1.33:44300` |
| `abap_transport-get` (adt-mcp, dispatcher port 3300) | `partner '10.40.1.33:3300' not reached` |
| `abap_list_destinations` | `[DS4_100_NIIF]` — **misleading**, answers from local config (L-347) |

Nothing was left half-written: `ZCX_FS_GW_ERROR` is complete, activated and ATC-clean, and no
other object had been created when the host went away. No locks were held — the only lock taken
was released before activation.


## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCX_FS_GW_ERROR` | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | **created, written, activated, ATC 0/0/0** |

15 textid constants (017–025, 027–032; 026 excluded as the success message), `MV_V1`/`MV_V2`
substitution attributes, `msgno( )` for the dispatcher boundary conversion. Inherits
`CX_STATIC_CHECK`, implements `IF_T100_MESSAGE`.

**Self-inflicted finding, fixed before moving on.** The first version declared `attr2 = 'MV_V2'`
on every textid. Eight of the messages (017, 019, 021, 022, 024, 027, 028, 031) have a single
`&1` placeholder, so ATC returned eight SLIN 0601 priority-3 findings. Corrected to blank `attr2`
for those eight; re-ATC came back with **zero findings at any priority**. Worth fixing rather than
accepting: the mismatch would also have implied a second substitution that never appears.

**Transient infrastructure note:** the corrective `setObjectSource` failed once with
`connect ETIMEDOUT 10.40.1.33:44300`. A follow-up read proved the write had *not* landed (017
still carried `MV_V2`), and the resend succeeded. Distinct from L-319 session death — the
destination probe stayed healthy throughout. Verify before resending, never assume a timeout means
no write.

## Delivery checks

- [ ] Syntax clean; everything activated, nothing inactive
- [ ] ATC — priority 1 and 2 resolved on every new object
- [ ] ABAP Unit green (wave 3)
- [ ] Regression suites re-run after wave 2
- [ ] No contract change in waves 1–3; no republish
- [ ] Object list confirmed in the transport

## Lessons raised

**L-346** — the plan said "not started" while three phases were done; verify system state before
implementing from a design document.

## Wave 1 progress — 2026-09-10

| Object | Type | Status | ATC (p1/p2/p3) |
|---|---|---|---|
| `ZCX_FS_GW_ERROR` | CLAS/OC | created, written, activated | **0/0/0** |
| `ZFS_T_SLC_DYNGW` | TABL/DT | 4 fields added, activated, data intact (203 rows) | n/a |
| `ZCL_FS_SLC_GW_LOG` | CLAS/OC | created, written, activated | 0/0/1 |
| `ZFS_FG_DYNGW_LOG` | FUGR/F | created, activated | 0/0/1 |
| `ZFS_RFC_DYNGW_LOG` | FUGR/FF | created, written, activated | — |

All on `DS4K907263`. Nothing left inactive, no locks held.

**DDIC change made to a live table** (flagged before it was made): `log_level`, `parent_uuid`,
`step_index`, `phase` added to `ZFS_T_SLC_DYNGW`. Additive only, no existing field touched, CDS
projection untouched, therefore no contract change and no republish. Verified after conversion:
203 rows intact, all four fields readable and initial.

**Accepted priority-3 findings, both deliberate:**

1. `ZCL_FS_SLC_GW_LOG` — *"Strings without text elements are not translated"* on
   `c_note_aborted`. It is an internal diagnostic stamped on a log row, never shown to a user, and
   rule 4 forbids creating a text element for it. Left as a literal by choice.
2. `ZFS_FG_DYNGW_LOG` — *"Use of ROLLBACK WORK"*. That is the whole purpose of the FM: it owns its
   own LUW so the audit row survives the caller's rollback. Flagging it is correct; changing it
   would remove the feature.

**Runtime port moved to wave 2.** It is inert until handlers are injected, and its signatures must
be derived from the handlers' real dynamic-call code — which wave 2 reads anyway. Designing it
first would mean inventing signatures.

## RESOLVED — RFC flag set by the human, 2026-09-10

`ZFS_RFC_DYNGW_LOG` is **not remote-enabled**: `TFDIR-FMODE` is blank where
`ZFS_RFC_DYNGW_SUBMIT` shows `'R'`. `EMIT_DURABLE` calls it over `DESTINATION 'NONE'`, which
requires the flag. This is L-324 recurring exactly — no ADT or MCP route sets it, and it was
resolved for the submit FM on 2026-09-10 by the human setting it by hand in SE37.

**Resolved the same way as the submit FM:** the human set Processing Type to *Remote-Enabled
Module* in SE37. Verified from this session:

```
ZFS_RFC_DYNGW_SUBMIT   FMODE = 'R'   PNAME = SAPLZFS_FG_DYNGW_SUBMIT
ZFS_RFC_DYNGW_LOG      FMODE = 'R'   PNAME = SAPLZFS_FG_DYNGW_LOG
```

The durable path is now callable. It is still not *reached*, because `ZCL_FS_SLC_GW_DISPATCH`
has not yet been wired to call `emit_durable( )` — that is the next step.

## Next

- [ ] Wire `ZCL_FS_SLC_GW_LOG` into `ZCL_FS_SLC_GW_DISPATCH`: replace the `CLEAR gt_log` on the
      abort path with `emit_durable( )`, stage per-step rows, apply caps. **Touches a live class —
      will be flagged before it is done.**
- [ ] Wave 3: `REGI` + `REGPOL` in the current static style, messages 033-035, unit tests.
- [ ] Wave 2 (deferred by the human): runtime port, DI, interface, factory, conformance test.
- [ ] Wave 4 (blocked): `IdempotencyKey` + `ApiVersion` + log exposure, one republish.

## Wiring + de-hardcoding pass — 2026-09-10

Human asked, before any testing, that the logic be made dynamic and hardcoding removed. That
review caught a **rule violation in my own new code**, not just style:

| Finding | Action |
|---|---|
| `c_note_aborted` was an **inline message literal** stamped into `message_text` | **Violates non-negotiable 4** (messages only from `ZFS_TRM_MSG`, never an inline literal, L-210). Removed from both `ZCL_FS_SLC_GW_LOG` and `ZFS_RFC_DYNGW_LOG` rather than catalogued — the rows already carry the catalogued failure that caused the abort. An explicit "rolled back" marker would need a real message number (033 is next free) and that is the human's call, not mine to invent (rule 6) |
| `level_allows( )` was **dead code** — built and never called, so the new `LOG_LEVEL` field did nothing | Wired into `finish( )`. A blank level means ALL, so every existing registry row behaves exactly as before with nothing migrated |
| `c_max_payload` fixed at 5000 with no override | Now a defaulted `iv_max` parameter on `cap( )`, `apply_caps( )` and `step_rows( )` |

### Wiring into ZCL_FS_SLC_GW_DISPATCH

Three changes, no contract change and no republish:

1. `finish( )` calls `apply_caps( )` before staging. The response is built from `is_out` and is
   deliberately untouched — only what is *stored* is capped.
2. `finish( )` consults `level_allows( is_reg-log_level, is_out-status )` before appending.
   `GWUUID` is still returned either way: it identifies the call, and switching logging off for a
   target should not also cost the caller its correlation id.
3. `run_batch( )` appends per-step child rows parented to the call row, then — on the abort path —
   calls `emit_durable( )` **before** the `CLEAR`. The durable write therefore carries the call row
   *and* its step rows.

**Known limitation, stated rather than hidden:** step rows follow the batch call row's logging
decision, not each target's own `LOG_LEVEL`. The per-step registry row is not carried in
`ty_step_result`, and adding it there would change the serialised response and therefore the
contract.

### Verification

| Object | ATC p1/p2/p3 | Note |
|---|---|---|
| `ZCX_FS_GW_ERROR` | 0/0/0 | |
| `ZCL_FS_SLC_GW_LOG` | **0/0/0** | literal removal cleared its only finding |
| `ZFS_FG_DYNGW_LOG` | 0/0/1 | `ROLLBACK WORK`, deliberate — it owns its LUW |
| `ZCL_FS_SLC_GW_DISPATCH` | 0/0/3 | all pre-existing; **the extract baseline was also 0/0/3**, so no new findings introduced |

All activated. `inactiveObjects` clean for this package's gateway objects — the four inactive
entries returned (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`,
`EZFS_T_DEALID`) belong to other workstreams and were left alone.

**Process slip worth noting:** `ZCL_FS_SLC_GW_LOG` was left locked after a write and only
discovered when activation reported "User FS_DEV3 is currently editing". Unlock before activating,
every time.

## Still to do

- [ ] **Live regression + durability test** — not yet run. Needs gateway credentials for the
      PowerShell client (L-318: run sandboxed; `sap-client=100` on every URL).
- [ ] The decisive new case: force a batch to abort after a write and confirm the log rows are
      still in `ZFS_T_SLC_DYNGW` once the LUW is gone. That is the whole point of rev 2 and no
      unit test can prove it.
- [ ] Wave 3: `REGI` + `REGPOL`, messages 033-035.
- [ ] Wave 2 (deferred): runtime port, DI, interface, factory, conformance test.

## Completion push — orchestrated design pass, 2026-09-10

Human asked to complete everything, with multi-agent orchestration (ultracode).

**Why the fan-out covers design and not implementation.** There is one live SAP system and one set
of objects. Parallel agents calling `setObjectSource` would collide on locks, race activation, and
violate the dependency order (`BASE` -> handlers -> `DISPATCH`). ABAP objects cannot be
worktree-isolated the way files can. So every agent in the workflow is constrained **read-only**
and told explicitly never to call a write tool; all writes are applied serially by the main session
with activation and ATC per step.

Workflow `dyngw-framework-completion`, 14 agents, four phases:

| Phase | Agents | Output |
|---|---|---|
| Survey | 7 (one per live class) | exact public API, static state, and **every ABAP-Cloud-forbidden call site** — the inventory the runtime port must cover |
| Design | 3 + 1 synthesis | three angles (minimal-churn, clean-architecture, REGI-first), judged and merged |
| Plan | 1 | ordered change plan: dependency order, activation groups, rollback, point of no return |
| Critique | 3 | adversarial lenses: ABAP correctness, regression risk to the live wire contract, workspace-rule compliance |

The design phase is told the hard constraints explicitly: response byte-identical (so
`ty_step_result` may not gain a field — it is serialised into `RowsJson`), messages only from
`ZFS_TRM_MSG` starting at 033, no invented objects, no `COMMIT`/`ROLLBACK WORK` in a behaviour
class, and no exception escaping to RAP.

**L-344 is given to the designers as a named problem to solve**, not left for them to rediscover:
phase-1 validation runs before any phase-2 execution, so `[REGI T000, QURY T000]` resolves `T000`
before it exists and rejects the batch. The pending-registration overlay must preserve fail-fast.

## Codex continuation — 2026-09-11

Recovered the handoff from this worklog after the Claude session reached its limit. Both MCP
connections are healthy and the live object inventory still matches the recorded state. Resume in
dependency order with the additive runtime port before any existing handler is rewritten.

```
NAMING: ZIF_FS_SLC_GW_RUNTIME -> matches pattern row "Interface | ZIF_FS_<AREA>_<NAME>"
NAMING: ZCL_FS_SLC_GW_RUNTIME -> matches pattern row "Class | ZCL_FS_<AREA>_<NAME>"
NAMING: ZIF_FS_SLC_GW_HANDLER -> matches pattern row "Interface | ZIF_FS_<AREA>_<NAME>"
```

- [x] Create, source, activate and ATC `ZIF_FS_SLC_GW_RUNTIME` — 0/0/0.
- [x] Create, source, activate and ATC `ZCL_FS_SLC_GW_RUNTIME` — 0/0/0.
- [x] Create, source, activate and ATC `ZIF_FS_SLC_GW_HANDLER` — 0/0/0.
- [ ] Before each existing-class rewrite, show an object-specific diff and obtain the Clean ABAP
      refactor write-back confirmation for that object.

Both objects were created through `adt-mcp`, sourced through the change server, activated, and
recorded on `DS4K907263`. The adapter is additive and not referenced by the live gateway yet.
Its first activation failed on three declaration syntax errors; the generated skeleton was restored
and activated before a corrected clean write was applied. The corrected source is active.

ATC initially returned two priority-3 findings in the adapter: an untranslated fallback string and
an unconsumed rollback RFC return code. The fallback now formats `ZFS_TRM_MSG` 020 and the rollback
path explicitly consumes `sy-subrc`; the repeat ATC run is 0/0/0 for both objects.

`ZIF_FS_SLC_GW_HANDLER` is also active and ATC-clean. Its contract is `kind`, `needs_write`,
`runs_in_caller_luw`, stateful `prepare`, and `execute`; both work methods raise
`ZCX_FS_GW_ERROR`. No existing handler implements it yet, so the live service remains unchanged.
