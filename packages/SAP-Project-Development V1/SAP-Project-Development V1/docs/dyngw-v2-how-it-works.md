# Dynamic OData Gateway v2 — how it works

- **Service:** `ZFS_SB_DYNGW_O4_API` (service definition `ZFS_SD_DYNGW`, OData v4) — **published**
- **System:** `DS4_100_NIIF` (`DS4` / client `100`)
- **Package:** `ZFS_DYN_GW`
- **Entity sets:** `CallLog`, `CallStep`, `Registry`, `RegistryHistory`
- **Actions:** `RunQuery`, `CallFunctionModule`, `ExecuteTableCrud`, `SubmitReport`,
  `RegisterTarget`, `ExecuteBatch`

This document is the conceptual guide — what v2 is, why it is shaped this way, and what is
proved versus assumed. For the field-by-field wire contract see
[`dyngw-v2-api.md`](dyngw-v2-api.md); for a step-by-step client walkthrough see
[`dyngw-v2-integration-guide.md`](dyngw-v2-integration-guide.md). The v1 set
(`dyngateway-how-it-works.md`, `dynamic-gateway-api.md`, `dyngateway-integration-guide.md`) is
**superseded but still running** on `ZFS_SB_DYNGATEWAY_O4_API` — do not point new consumers at it,
but do not decommission it either without a separate decision.

**A note on how to read this document.** Three registers are used throughout and are never mixed
silently: **proved** (a live call was made against `DS4_100_NIIF` and its result read back —
Task 18's evidence), **built but not proved** (the ABAP exists, activates, and the design reasons
it should behave a certain way, but no live call has exercised that specific path), and **known
limit** (a deliberate design boundary, not a bug). Where the distinction matters the text says so
in those words.

---

## 1 · Why this rebuild exists

v1 (`ZFS_SB_DYNGATEWAY_O4_API`) is real, running, and not being retired by this document. v2 is a
from-scratch rebuild of the same idea — a generic, allow-listed remote-control panel for reading a
table/CDS view, writing a table, calling a function module, running an executable report, and
managing the allow-list itself — closing three defects v1 could not close without a redesign:

1. **v1's own allow-list table (`ZFS_T_SLC_DYNGW`) was itself a registrable `TABL` target.**
   Execute rights on the gateway were enough to self-register any FM or report, a privilege
   escalation. v2 refuses this by construction: any target matching `ZFS_T_DYN_*`, `ZFS_RFC_DYN_*`
   or the authorization object name is refused by both `RegisterTarget`/`REGI` and `POST
   /Registry`, with message **039**. **Proved live** (Task 18 §2, assertion 2): `POST /Registry`
   naming `ZFS_T_DYN_REG` → HTTP 400/039, nothing written to either table.
2. **v1 could not guarantee that a failed multi-step call rolled back cleanly (L-350).** A
   synchronous RFC on the abort path implicitly commits the caller's LUW, so writes from earlier
   steps in the same call could survive an abort that looked total. v2's dispatcher
   (`ZCL_FS_DYN_DISPATCH`, Task 15) is the redesign aimed at this, and **this is now proved live**:
   **L-496 (2026-09-13)** reproduced a real phase-2 abort — a `TABL INSERT` that genuinely wrote,
   followed by a failing `FUNC` step in the same batch, in the same LUW — with a positive control
   (the identical write run alone, uncommitted, confirmed present) so the empty table after the
   abort is proved to mean "rolled back," not "never wrote." See §7 below for the full account.
3. **v1's access control was coarse** — one unrestricted grant, no distinction between executing
   a target and administering the allow-list. v2 adds a dedicated authorization object
   (`ZFS_DYNGW`), DCL-level row filtering by target, and a separate `ZCL_FS_DYN_AUTH` policy class
   consulted per step. Whether the filtering actually restricts a real restricted user is
   **not yet proved live** — no such user exists yet (§6).

**This is still not "clean core."** Dynamic `CALL FUNCTION`, dynamic Open SQL and `SUBMIT` are all
things ABAP Cloud forbids, and v2 does all three deliberately, behind an allow-list, an audit
trail and authorization checks. If this system ever moves to ABAP Cloud, neither v1 nor v2 comes
with it as written.

---

## 2 · Architecture

```
HTTP/OData v4 request
        |
        v
ZBP_FS_DYNGWCALLTP          (behaviour pool — six static actions, pure delegation)
        |
        v
CALL FUNCTION 'ZFS_RFC_DYN_EXECUTE' DESTINATION 'NONE'     <- the LUW boundary (Task 15)
        |
        v
ZCL_FS_DYN_DISPATCH          <- phase 1: validate every step, phase 2: execute every step
        |
        +--> ZCL_FS_DYN_AUTH        assert_execute( kind, target ) — ZFS_DYNGW check, per step
        |
        +--> ZCL_FS_DYN_REGISTRY    the allow-list lookup (ZFS_T_DYN_REG), buffered per request
        |
        +--> ZCL_FS_DYN_FACTORY -> a fresh handler instance per step:
        |        ZCL_FS_DYN_HDL_QUERY    dynamic SELECT
        |        ZCL_FS_DYN_HDL_FUNC     dynamic CALL FUNCTION
        |        ZCL_FS_DYN_HDL_TABLE    dynamic INSERT/MODIFY/DELETE
        |        ZCL_FS_DYN_HDL_SUBMIT   SUBMIT a report, own RFC session
        |        ZCL_FS_DYN_HDL_REGI     register/update an allow-list row
        |
        +--> ZCL_FS_DYN_RUNTIME     the one class that does the forbidden things
        |
        +--> ZCL_FS_DYN_BUDGET      request-size / step-count / row-count / duration limits
        |
        +--> ZCL_FS_DYN_LOG         builds the call/step rows (blank RequestId -> own CallUuid)
        |
        v
COMMIT WORK / ROLLBACK WORK   (in ZFS_RFC_DYN_EXECUTE / ZCL_FS_DYN_DISPATCH only — never in RAP)
        |
        v
MODIFY ENTITIES OF zfs_r_dyngwcalltp ... CREATE ... IN LOCAL MODE   (RAP writes the log, back in
        the behaviour pool, after the execution session has already returned)
```

**The key architectural move, and why it exists:** the execution session (`ZFS_RFC_DYN_EXECUTE`,
called `DESTINATION 'NONE'`) is a **separate LUW** from the RAP session that logs the call. RAP
forbids `COMMIT WORK`/`ROLLBACK WORK` inside a behaviour implementation
(`BEHAVIOR_ILLEGAL_STATEMENT` — the dump that took v1 down when this was tried directly in the
BOPF/RAP layer). So the actual dynamic work — and its commit or rollback — happens in a plain
function module outside RAP, and only *after* it returns does the behaviour pool write the log row
via `MODIFY ENTITIES`. This is also why the log write can never be rolled back by a failure in the
execution session: by the time it happens, the execution session's LUW is already closed one way
or the other.

Every handler implements one contract, `ZIF_FS_DYN_HANDLER`: `resolve`, `prepare` (validate,
touch nothing), `execute` (do the thing). That split is what makes every action — including the
five single-shot ones — a one-step batch under the hood: **phase 1 validates every step before
phase 2 executes any of them.**

---

## 3 · The data model

| Table | Role | Written by |
|---|---|---|
| `ZFS_T_DYN_REG` | the allow-list (one row per registered target) | `POST`/`PATCH`/`DELETE /Registry`, or a `REGI` step |
| `ZFS_T_DYN_REGH` | change history for the allow-list — `change_type` `I`/`U`/`D`, `source` (`ODAT` for an OData write), before/after JSON | the registry BO's additional save, on every registry write |
| `ZFS_T_DYN_CALL` | one row per top-level call (`RunQuery`, `ExecuteBatch`, …) | `ZBP_FS_DYNGWCALLTP`, after the execution session returns |
| `ZFS_T_DYN_STEP` | one row per step inside a call (a single-shot action is a one-step call) | same, via the `_Steps` composition |

Registry columns (`ZFS_T_DYN_REG`, exposed as `/Registry`): `RegUuid` (key), `TargetKind`
(`FUNC`/`TABL`/`QURY`/`SUBM`), `TargetName`, `Operation`, `IsActive`, `AllowRead`, `AllowWrite`,
`CallMode`, `MaxRows` (**`0` = the target sets no override**, never "unlimited" — see §8), `LogLevel`
(`A`/`E`/`N`), `Descr`. Clearing `IsActive` is an instant kill switch, no transport.

`/CallLog` (`ZFS_T_DYN_CALL`) carries the call header: `CallUuid` (key), `Action`, `RequestId`,
`ExecStatus`, `StepCount`, `ResultCount`, `RequestJson`, `ExecutedBy`, `ExecutedAt`,
`LastChangedAt`. **`LastChangedAt` is populated on create** — proved live (Task 18 §4).

`/CallStep` (`ZFS_T_DYN_STEP`) carries one row per step, composed under `_Steps`: `StepUuid`
(key), `CallUuid` (matches the header — proved live), `StepIndex`, `StepKind`, `TargetName`,
`RegUuid` (the allow-list row that authorised the step — see the L-482 note below),
`ExecStatus`, `Severity`, `ResultCount`, `ResponseJson`, `LastChangedAt`.

`/RegistryHistory` (`ZFS_T_DYN_REGH`) is a plain read-only view, no BO: `HistUuid`, `RegUuid`,
`ChangeType`, `TargetKind`, `TargetName`, `Source`, `BeforeJson`, `AfterJson`, `ChangedBy`,
`ChangedAt`.

**`RegUuid` on a step row was found always zero, then fixed (L-482).** The runtime function
module serializes step results in `camelCase`, and the dispatcher's deserialize was missing the
matching `pretty_name` mode, so exactly the fields with an underscore in their ABAP name
(`REG_UUID`, `IS_OUTSIDE_ROLLBACK`) silently failed to bind while every other field bound fine.
Fixed and proved live (Task 18 fix round 1, §F4): a step's `RegUuid` now matches the registry row
that authorised it.

---

## 4 · The allow-list and access control

Every step goes through `ZCL_FS_DYN_AUTH=>assert_execute( kind, target )` before
`ZCL_FS_DYN_REGISTRY=>resolve` is even consulted — authorization is checked first, the business
allow-list second. Both gates must pass.

**Authorization object `ZFS_DYNGW`**, fields `ACTVT`, `ZDYNKIND`, `ZDYNTGT`:

| `ACTVT` | Means |
|---|---|
| `01`/`02` | administer the allow-list — create/update a registry row |
| `03` | audit — read `/Registry`, `/CallLog`, `/CallStep`, `/RegistryHistory` |
| `16` | execute — actually run a `RunQuery`/`CallFunctionModule`/etc. against a target |

`ZDYNTGT` is `CHAR30` and scopes which target names an activity applies to. **Known limit,
stated as a role-governance rule, not a bug:** `ZDYNTGT` must be maintained on every `ZFS_DYNGW`
role as **single values only, never a range/interval spanning `*`**. `PFCG_AUTH` evaluates
authorization values as intervals, and the interval `' '`–`'ZZZZZZ'` brackets the literal
character `*` (0x2A) — so a role built as "a range covering everything" silently grants full
`ZDYNTGT` scope, defeating any intended restriction, with nothing in the role's own display
flagging it as wider than intended (L-441).

**Known limit — the `/CallLog` header grant needs full scope, `/CallStep` does not.**
`ZFS_T_DYN_CALL` (the call header) carries no field that maps to a single target name — a batch
call can touch several targets — so its DCL is built as a **constant-element grant at full
`ZDYNTGT` scope**: `where ( AuthTarget ) = aspect pfcg_auth ( ZFS_DYNGW, ZDYNTGT, ACTVT = '03' )`,
where `AuthTarget` is a constant `'*'` cast onto the view. `ZFS_T_DYN_STEP` (the per-step row) *does*
carry `TargetName`, so its DCL restricts genuinely: `where ( StepKind, TargetName ) = aspect
pfcg_auth ( ZFS_DYNGW, ZDYNKIND, ZDYNTGT, ACTVT = '03' )`. The consequence: **a target-scoped
auditor (e.g. `ZDYNTGT = 'BAPI_*'`) sees `/CallStep` rows for their targets but `/CallLog` comes
back empty**, because their scope does not cover the header's required `'*'`. This can only ever
*narrow* what a full-scope user sees — it is not a data-loss bug, but it will look like one to
someone who reads `/CallStep` returning rows and `/CallLog` returning none and assumes the log is
empty. Recorded and to be resolved (or at minimum documented in a runbook) before a
target-scoped auditor role is actually assigned to anyone.

The registry itself (`/Registry`) is also DCL-protected: `grant select … where ( TargetKind,
TargetName ) = aspect pfcg_auth ( ZFS_DYNGW, ZDYNKIND, ZDYNTGT, ACTVT = '03' )`, and
create/update/delete are gated in `ZBP_FS_DYNGWREGTP=>get_global_authorizations` on `ACTVT`
`01`/`02`, refusing with message **040** and writing nothing on failure.

**Built but NOT proved: any of the above actually filtering.** Every read to date has been made
by `FS_DEV3`, who holds full-scope access to every activity. A read by a fully-authorized user
passes whether or not the DCL/authorization-object filtering works, so nothing so far
discriminates between "the control is enforced" and "the control does nothing." Proving it needs
a second SAP user holding `ZFS_DYNGW` with `ACTVT = '03'` and a **restricted** `ZDYNTGT` (one real
target name, not `*`), then confirming `/CallStep` returns only that target's rows and `/CallLog`
returns empty (per the limit above). No such user exists, and this task may not create one (no
roles or users may be created by an agent under this project's rules). This is a **human
prerequisite**, not an open coding task.

Also **built but NOT proved**: a caller holding `EXECUTE` (`ACTVT 16`) but not `ADMIN` (`ACTVT`
`01`/`02`) being refused a `RegisterTarget`/`POST /Registry` call. Same reason, same prerequisite.

---

## 5 · The six actions and `ExecuteBatch`

Every single-shot action (`RunQuery`, `CallFunctionModule`, `ExecuteTableCrud`, `SubmitReport`,
`RegisterTarget`) is, internally, a one-step `ExecuteBatch`. There is no separate code path — the
dispatcher always runs a step list; the five single-shot actions just build a one-element list.

**Phase 1 validates every step before phase 2 executes any of them** — the same guarantee as v1,
now backed by a from-scratch dispatcher (`ZCL_FS_DYN_DISPATCH`). A step that fails validation
(unregistered target, unauthorized, bad JSON, over budget) means **nothing in the call executes**,
`ExecStatus = 'E'`, HTTP 200, every earlier/later step reported `Severity = 'P'` (planned, never
run) except the one that failed.

**Only a runtime failure can abort mid-execution**, and only after some steps have already run.
`ZCL_FS_DYN_DISPATCH` rolls back and reports message **045** ("Batch aborted at step &1: &2")
naming the failing step. This is the mechanism meant to close L-350 — see §7 for what is and is
not proved about it.

`CommitMode`: `AUTO` (default) commits only if every step in the batch succeeded; `ALWAYS` commits
regardless; `NEVER` leaves the commit decision to the caller (a dry-run mode, in effect). **Known
limit:** `AUTO` and `ALWAYS` are currently **synonyms**. The v2 spec defines no behavioural
difference between them yet — do not assume `ALWAYS` does something `AUTO` does not.

A **single-shot** action's refusal is reported on the call header with message **045** ("Batch
aborted at step 1: …"), truncated to the 50-character `MESSAGE … INTO` placeholder limit — the
*real* reason (017, 019, 023, …) is on the step row, not the header. This reads oddly for a
one-step call but is a direct consequence of "every action is a batch" (L-478); treat the header
message as "something in this call failed", and read the step for the actual cause.

### Step kinds

| Kind | Does | Needs `AllowWrite`? | Rolls back on abort? |
|---|---|---|---|
| `QURY` | dynamic `SELECT` | no | n/a — nothing written |
| `FUNC` | dynamic `CALL FUNCTION` | always | **depends on the call mode — see below** |
| `TABL` | dynamic `INSERT`/`MODIFY`/`DELETE` | yes | yes, execution-session LUW |
| `SUBM` | `SUBMIT` an executable report | always | **no** — its own RFC session/LUW |
| `REGI` | register/update an allow-list row | gated by `ZCL_FS_DYN_AUTH`, not the allow-list itself | yes, execution-session LUW |

**`FUNC` rolls back only in call mode `L`, and the default is not `L`.** This table said "yes"
unconditionally until the final review found otherwise (C-1), and the correction matters because
the common case is the one that does *not* roll back:

- `CALL_MODE` `'L'` — `CALL FUNCTION` runs in the execution session. Its work is inside the LUW and
  a rollback undoes it. `IsOutsideRollback` is `false`.
- `CALL_MODE` `'R'` — `CALL FUNCTION ... DESTINATION 'NONE'`: a synchronous RFC into a second
  session, which **implicitly commits the caller's LUW**. Its own work is outside the rollback, and
  `IsOutsideRollback` is `true`.
- `CALL_MODE` **blank — the default — falls back to `TFDIR-FMODE`**, so *any remote-enabled BAPI
  registered without an explicit call mode resolves to `'R'`.* A registration that simply never
  mentioned a call mode therefore behaves like the second bullet, not the first.

The answer is computed per *prepared step*, not per kind: `ZIF_FS_DYN_HANDLER~RUNS_IN_CALLER_LUW( )`
is an instance method valid after `PREPARE`, and `ZCL_FS_DYN_HDL_FUNC` answers
`xsdbool( mv_dest IS INITIAL )`.

**Known limit — a batch mixing an out-of-LUW step with an in-LUW write is refused in phase 1.**
That means a `SUBM` step, *or a `FUNC` step in call mode `'R'`*, alongside any `TABL`/`REGI`/local
`FUNC` write. Such a step runs a synchronous RFC that commits the caller's LUW, so "the whole batch
rolled back" would stop being a meaningful claim — and, worse, `IsRolledBack: 'X'` would be returned
over writes that had already been committed (L-497/L-498 — this is now an OData-visible risk, not
just an internal one; see §10 below for what changed). The refusal is `ZFS_TRM_MSG 020` naming the offending
step, with `045` at call level. Split such work into two requests — **or, for a `FUNC` step, set
the registry row's `CALL_MODE` column to `'L'`.** That column is the caller-side control: `'L'`
forces `CALL FUNCTION` without a destination, which keeps the step inside the batch's transaction
and makes the batch legal. It is only safe where the FM genuinely can run locally (it must not be
remote-only, and a local call runs under the caller's own authorizations), so it is a deliberate
registration decision, not a default to reach for.

**Known limit — an out-of-LUW step's own effects are outside the rollback**, by design: it runs
behind its own `DESTINATION 'NONE'` session, so a report or remote FM that commits internally
cannot corrupt the caller's transaction, and it cannot be undone by anything the dispatcher does.
Every affected step row reports `IsOutsideRollback: true` rather than leaving the caller to infer
it.

### Error taxonomy

`ExecStatus` answers "did the dispatch itself work"; a separate `ErrorCategory` answers "did the
requested thing actually happen":

| `ExecStatus` | `ErrorCategory` | Means |
|---|---|---|
| `S` | *(blank)* | dispatched, target happy |
| `S` | `BUSINESS` | dispatched fine; the target's own `BAPIRET2`/`RETURN` reported an error |
| `E` | `CLIENT` | the request itself was wrong (017, 022, 023, 024, 025) |
| `E` | `AUTH` | not permitted (018, 033, 040) |
| `E` | `TARGET` | the gateway tried and the target failed technically (020) |

A call's `ErrorCategory` is the category of the first step at the highest severity reached,
ranked `A > E > W > S`, so a call with one `BUSINESS` step and one `TARGET` step reports `TARGET`.
**Proved live:** an unknown target refused with HTTP 200, message 017, `ErrorCategory: CLIENT`
(Task 18 §4).

---

## 6 · Idempotency

Every call carries a `RequestId`. `ZCL_FS_DYN_LOG=>find_replay` checks it first, before anything
executes: a hit answers from the stored row (`Replayed = 'X'`, same `CallUuid`/`GwUuid`, nothing
re-executed, nothing written), a miss proceeds normally. **A blank `RequestId` is stored as the
row's own `CallUuid`**, so every row still has a distinct value and the underlying unique index is
never violated by two blank requests — but a caller who sends nothing is never matched against
anyone else's row (a blank input always misses). **Proved live** as part of Task 18's testing:
`ExecuteBatch` with a `RequestId`, repeated, answered `Replayed:"X"`, same `GwUuid`, nothing written
a second time.

---

## 7 · What "closes L-350" actually means here, and what is still open

L-350 is: a synchronous RFC on the abort path implicitly commits the caller's LUW, so a batch that
"fails" can still have partially applied. v2's answer is architectural — the whole dynamic
execution runs in one function module, one LUW, with `COMMIT WORK`/`ROLLBACK WORK` living only
there and in `ZCL_FS_DYN_DISPATCH`, never in the RAP layer that would forbid it — plus phase 1/
phase 2 separation so validation failures never touch data at all.

**Proved live, narrowly:** two `REGI` steps registering the same target in one batch fail cleanly
in phase 1 (message 035, seen via the *pending* declaration of the first step, before either step
executes) — the target gains zero rows either way (Task 20 report §2, L-480). This demonstrates
the phase-1 half of the guarantee on a safe, side-effect-free case.

**The phase-2 half is now proved live too — L-496, 2026-09-13.** The literal test the build plan
originally specified (two `TABL` `INSERT` steps with the same key) genuinely does **not** produce a
phase-2 abort: `ZCL_FS_DYN_RUNTIME`'s `INSERT` uses `ACCEPTING DUPLICATE KEYS`, which suppresses a
**primary-key** collision as a partial-write success (message 048, severity `W`), not a step
failure — found by source review (Task 20, L-479), not assumed. A **working** reproduction instead
used a real write followed by a genuinely failing step: `ZFS_T_TRM_PROBE` (human-authorised probe
table), `[TABL INSERT one row, FUNC NUMBER_GET_NEXT against a non-existent number range object]`
under `CommitMode AUTO`. Step 1 returned `status 'S'`, a real phase-2 write, not a planned one; step
2 failed with message 020 and the call aborted with 045; **the table read empty afterward — the row
is gone.** The proof's load-bearing half is the **positive control**: the identical step 1, run
alone with nothing to abort, was confirmed to leave the row present — so "the table is empty" is
shown to mean "the rollback undid it," not "the insert never worked," which is the exact failure
mode this ledger has caught three times before (L-434, L-479, L-493) and the reason a bare "it's
empty afterward" observation is never sufficient on its own. **Read "the dispatcher was designed to
close L-350" as "L-350 is closed, both halves, as of 2026-09-13"** — not an assumption, a live
reproduction with its own negative control built in.

---

## 8 · Contract facts learned the hard way

- **Action parameters are structurally mandatory but semantically optional.** The abstract-entity
  parameter shapes declare every field, but a field the caller doesn't care about is sent empty/
  zero, not omitted — there is no partial-parameter form.
- **A `TABLES` parameter not named in `TablesJson` is not bound at all** — not even an
  output-only one like `RETURN`. Omitting it means its content, if any, never reaches the caller.
  This is a carry-over fact from v1 (L-314) and applies identically to `CallFunctionModule` here.
- **`MaxRows: 0` on a registry row means "this target sets no override"**, never "unlimited". It
  defers to whatever ceiling the caller or the framework's own budget otherwise applies — it is
  not a request for every row a query could return.
- **Deep action parameters (a composition inside an action's input) are unsupported on this
  release.** `ZFS_AE_DynGwBatch` declaring `composition [0..*] of ZFS_AE_DynGwStep as _Steps`
  activates in CDS, but the generated RAP derived type carries no `_Steps` component the handler
  can read (L-472). The documented fallback — `StepsJson : abap.string(0)`, a JSON string parsed
  against the typed `ZFS_AE_DynGwStep` contract — was taken. Consequence: a batch payload nests
  JSON two levels deep (the HTTP body is JSON containing a string that is itself a JSON array),
  not three as in some of v1's shapes, but not the single flat level a real composition would have
  given.
- **Every `FUNC` target must be registered `AllowWrite: true`, even a read-only function module —
  known limit, deferred by controller ruling on 2026-09-13 (final review I-3, L-491).**
  `ZCL_FS_DYN_HDL_FUNC~NEEDS_WRITE` answers `abap_true` unconditionally, and
  `ZCL_FS_DYN_DISPATCH~PHASE_ONE` passes that answer to `ZCL_FS_DYN_REGISTRY~RESOLVE`, so a `FUNC`
  row registered `AllowRead` only is refused with message 018 whatever the FM actually does. The
  framework cannot tell a reading FM from a writing one — a function module's signature carries no
  such declaration — so the handler fails **closed**: it demands more privilege than the call may
  need, never less. It is therefore a least-privilege wart, not a security hole, and no batch or
  target is blocked by it. Closing it means a design change (an explicit read-only opt-out on the
  registry row, whose correctness rests entirely on whoever ticks it), which was **not** made in
  this build. Do not read `AllowWrite: true` on a `FUNC` row as evidence that the target writes.
- **`ZFS_T_DYN_CALL` and `ZFS_T_DYN_REG` both look like they carry `LogLevel`; only the registry
  genuinely does, wired end to end since Task 4.** A `log_level` column was added to
  `ZFS_T_DYN_CALL` during Task 18's fix round in pursuit of a policy ("the strictest registered
  target governs the request; `'E'` degrades to `'N'` on success") that remains **undecided and
  unwired** — the column is active, on the gateway's own transport, and nothing writes to it
  (L-484). Do not assume `CallLog`/`CallStep` carry an observable log-level policy; they do not,
  yet.

---

## 9 · Also built, also not yet proved live

- **`ZFS_R_DYN_PURGE`** (retention/purge report; deletes `ZFS_T_DYN_CALL`/`ZFS_T_DYN_STEP` rows
  older than a selection-screen age, default 90 days, refusing anything under a 30-day
  idempotency-window floor with message 046) is built and activated, but its selection-screen
  paths — the test-run count-only mode and the below-floor refusal — have not been observed
  running; `SA38`/`SE38` were both blocked by security constraints during that task. Treat its
  behaviour as reasoned from source, not demonstrated.
- Several rows of the design's own capability matrix (spec §3) — TABLES-parameter binding on a
  live FM, `MODIFY`/`DELETE` on a real writable table, the filter operator whitelist actually
  rejecting a bad operator, the write-row budget actually refusing an oversized array, and a few
  others — are authored in the regression suite but **blocked**, each on a human needing to name a
  safe non-framework test object (a table, a function module with the right parameter shape, a
  registered report) before they can be run. None was invented to unblock them (project rule: no
  object gets created that wasn't asked for).

---

## 10 · The field generator engine (built 2026-09-15, proved live the same day)

A caller writing a row through `ExecuteTableCrud`/`TABL` could not fill the two fields that matter
most: a `sysuuid_x16` key, or a key drawn from a number range object. `ZCL_FS_DYN_GENERATE` closes
this for `TABL` writes only. Contract: given the target's DDIC field list, the registry row, the
parsed `GenerateJson` and one row, return the row with generated fields filled, or raise
`ZCX_FS_DYN_ERROR` with the right message number. It performs no database write and knows nothing
about batches or transactions — `ZCL_FS_DYN_HDL_TABLE` calls it per row, immediately before
`MODIFY_TABLE`.

**Why permission is hybrid (registry row permits, the call names the field).** A registry row's
`AllowGen` is the coarse gate — a target not flagged generates nothing, full stop, whatever the
call asks for. Within a generation-enabled target, the *call* still has to name exactly which
fields it wants generated (`Uuid: [...]`, `NumberRange: [...]`, `SysFields: ...`) — there is no
"generate everything this target allows" shortcut. This means widening what a target *can* do
(a registry write, audited via `ZFS_T_DYN_REGH`) is a separate, visible act from a caller choosing
to *use* that capability on one particular call — the same separation of "who may" from "who does"
that the rest of the authorization model already uses.

**Why the number-range allow-list is one column (`GenNrObject`), not a delimited list.** A
delimited allow-list packed into a `char120` reproduces the exact failure shape of the `ZDYNTGT`
interval trap (L-441): it reads as maintained while silently granting more than intended, and it
fails silently rather than loudly. One number range object per registry row is fully auditable at
a glance — the motivating case (`ZFS_SLC_OTTK_BTP` needing exactly one, `ZFS_OTTK_D`) needs no
more than this. A target needing two number-ranged fields is a **documented limit** (this doc and
`dyngw-v2-api.md` §8), not a silent one; the extension point (a child table) is not built.

**Why a dry run refuses to draw, and why the reason for that refusal changed underneath this
build.** The 054 guard (`ZCL_FS_DYN_DISPATCH=>check_dry_run_number_range`) refuses any
`NumberRange` generation under `CommitMode 'NEVER'` — **proved live, criterion 8**, `NRIV-NRLEVEL`
confirmed unchanged before and after the refusal. The guard was designed on the assumption that a
number range draw is *always* burned permanently, so a dry run drawing one would waste a real
production number for nothing. **Criterion 9 (2026-09-15) found that assumption false for
`ZFS_OTTK_D`/`CL_NUMBERRANGE_RUNTIME=>NUMBER_GET` on this system** — a batch that drew a number and
then aborted left the number range level unchanged and the same number was reissued later (L-519).
The guard is **kept as-is**, but its justification is corrected: it no longer rests on "the number
is always gone forever" (false, as stated), but on "a number range's buffering is a per-object,
per-system configuration (SNRO) that this framework does not introspect, so whether a draw
survives a rollback is not knowable from the call alone — refusing under a dry run remains the only
safe default regardless of which way that configuration happens to go." Do not read the 054
refusal as evidence that a drawn number is unconditionally unrecoverable; read it as evidence that
the framework will not gamble on either answer.

**The L-497 flags are now exposed.** §5's "worse, `IsRolledBack` would be returned over writes that
had already been committed" discussion above described a value `ZCL_FS_DYN_DISPATCH=>TY_RESULT`
computed internally but that no OData caller could read (L-497). This build closes that: the result
entity `ZFS_AE_DynGwResult` now carries `IsCommitted`/`IsRolledBack` (renamed from the design's
original `Committed`/`RolledBack` — `COMMITTED` is a CDS reserved word, L-515), populated on every
one of the six actions via one shared edit to `ZBP_FS_DYNGWCALLTP`'s `dispatch` method. **Proved
live** (criterion 3/9/10): `IsCommitted 'X'` on a committed call, `IsRolledBack 'X'` (and
`IsCommitted` blank) on an aborted batch. A caller can now observe an out-of-LUW/in-LUW mismatch
like the one this section's §5 discussion warns about, rather than inferring it.

**`ExecuteTableCrud MODIFY` is a full-row replace — a data-loss trap the generator feature made
more visible, not one it created (L-520).** `MODIFY` builds its row entirely from the caller's
`ImportJson`; any column the caller's payload omits is initial in the resulting `MODIFY`, wiped
regardless of what was there before — `LOCAL_CREATED_BY`/`LOCAL_CREATED_AT` included. This is
pre-existing `ZCL_FS_DYN_HDL_TABLE`/`ZCL_FS_DYN_RUNTIME` behaviour, unrelated to generation as
such, but `GenerateJson`'s `SysFields:"AUDIT"` support on `MODIFY` (§5.2 of the design) advertises
"the audit fields are handled for you" in a way that invites a caller to send a partial row and
trust the rest survives — it does not. Every `MODIFY` caller, human or generated console code,
must resend the full row (or at minimum every column it wants preserved). Whether
`ZCL_FS_DYN_HDL_TABLE` should read-merge before a `MODIFY` instead of full-replacing is an open
decision for the human; this build made no change to `MODIFY`'s semantics, per the coordinator's
explicit instruction not to change behaviour nobody asked for.
