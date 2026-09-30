# Dyngw v2 Task 16 — CallLog / CallStep BOs and the registry history view

- **Date:** 2026-09-13
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (objects land on task DS4K907264)
- **Requested by:** aster.t@fourthsignal.com

## Scope

Build the durable call/step log half of the Dynamic Gateway v2 framework: a managed RAP BO whose
root `ZFS_R_DynGwCallTP` (over `ZFS_T_DYN_CALL`) owns a `[0..*]` composition `_Steps` to
`ZFS_R_DynGwStepTP` (over `ZFS_T_DYN_STEP`), the matching projection pair
`ZFS_C_DynGwCallTP` / `ZFS_C_DynGwStepTP`, a plain read-only view `ZFS_I_DynGwRegHist` over
`ZFS_T_DYN_REGH`, the behaviour pool `ZBP_FS_DYNGWCALLTP`, and three DCL roles restricting
`/CallLog`, `/CallStep` and `/RegistryHistory` to `ZFS_DYNGW` `ACTVT = '03'` (AUDIT).

The design asymmetry is deliberate: the **base** BDEF declares `create` so Task 17/18 can stage log
rows through `MODIFY ENTITIES … CREATE` in privileged mode and let RAP persist them in its own save
sequence (never a direct `INSERT`); the **projection** BDEF declares no `use create`/`update`/
`delete`, so over OData the log is read-only.

Why this BO exists at all: `ZCL_FS_DYN_DISPATCH` (Task 15) deliberately writes no log, because
writing one from inside the execution session would implicitly commit the caller's LUW and leave
the rollback nothing to undo — that is L-350, and it is what took v1 down. The log is written in
the RAP LUW *above* the dispatcher, after the execution session returns.

**Out of scope:** the six static actions, the abstract entities, the service definition and the
service binding (all Task 18); `ZCL_FS_DYN_LOG` (Task 17). No draft is specified by the plan and
none was added.

> ## ⛔ Task 18: read the [**TASK 18 HANDOVER GATE**](#-task-18-handover-gate--read-this-before-publishing-the-service-binding) at the end of this file before publishing
>
> Six items, **G1–G6**. Three are hard gates (verify the DCLs are active; run the discriminating
> negative read; close the instance-authorization hook before any non-privileged update). Three are
> properties to design around. **Every failure mode in them is silent** — nothing throws, nothing
> logs, and the worst of them is full exposure of every `request_json` the gateway has received.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Is P1 (`ZFS_DYNGW` authorization object) still outstanding, so the DCLs should be deferred? | No — `ZFS_DYNGW` exists and `ZFS_DYN_GW_ROLE` was granted to `FS_DEV3` (L-434 supersedes L-426). Controller ruling: create all three DCLs now with the `ACTVT = '03'` AUDIT grant. An unrestricted grant is not acceptable. | 2026-09-13 |
| 2 | Does a RAP generator's draft suggestion get accepted? | N/A — no generator used, everything hand-authored; no draft anywhere. | 2026-09-13 |
| 3 | Step 6's EML verification | Cannot be executed — no EML-capable context in this workspace, and a runner program / test class to execute it is a forbidden unrequested object. Controller ruling: verify structurally, record the create-with-composition hop as explicitly unproven, Task 18 proves it via a live OData route. | 2026-09-13 |
| 4 | **`/CallLog`'s DCL cannot express the specified grant.** DCL requires `( elements ) = aspect pfcg_auth( ... )`; the element-less activity-only form does not exist on this release (L-435). `ZFS_T_DYN_CALL` carries no element mappable to `ZDYNKIND` or `ZDYNTGT` — a call header legitimately spans many kinds/targets (a batch), so there is no honest value to map. Options: (a) add a genuine element to the header, (b) a different authorization object, (c) `ExecutedBy = aspect user` scoping, (d) an unrestricted grant. **Which?** | **Option (a): constant element + AUDIT.** Add a constant element to `ZFS_R_DynGwCallTP` and map it through `PFCG_AUTH` at full target scope: reading a call header requires `ZFS_DYNGW` `ZDYNTGT = '*'` with `ACTVT = '03'`. The header genuinely is not target-scoped, so only a full-scope auditor should see it; a user restricted to particular targets should not. Stricter than the brief's activity-only grant and honest about what the header is. **Built and active** — see Step 5b. | 2026-09-13 |

## Naming gate

Recorded **before** the first create call (`docs/naming-conventions.md`, L-027):

```
NAMING: ZFS_R_DynGwCallTP  -> matches "Restricted reuse view | ZFS_R_<Entity>" (RAP BO root)
NAMING: ZFS_R_DynGwStepTP  -> matches "Restricted reuse view | ZFS_R_<Entity>" (composition child)
NAMING: ZFS_C_DynGwCallTP  -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZFS_C_DynGwStepTP  -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZFS_I_DynGwRegHist -> matches "Interface view | ZFS_I_<Entity>"
NAMING: ZBP_FS_DYNGWCALLTP -> matches "Behavior pool | ZBP_FS_<Entity>" (upper case)
```

The three DCL roles reuse the protected entity's own name, as `ZFS_R_DynGwRegTP`'s DCL already
does on this system — same pattern row, no new name coined:

```
NAMING: ZFS_R_DynGwCallTP  (DCLS/DL) -> matches the existing DCL-mirrors-entity-name pattern (ZFS_R_DynGwRegTP DCLS/DL)
NAMING: ZFS_R_DynGwStepTP  (DCLS/DL) -> matches the existing DCL-mirrors-entity-name pattern
NAMING: ZFS_I_DynGwRegHist (DCLS/DL) -> matches the existing DCL-mirrors-entity-name pattern
```

No generator was used anywhere in this task, so no generator-suggested name was inherited.

## Todo

- [x] 1. Step 1 — validate the root DDLS and the BDEF shape before creating anything
- [x] 2. Step 2 — record the naming gate (above)
- [x] 3. Step 3 — create the five CDS views
- [x] 4. Step 4 — create both behaviour definitions + the behaviour pool
- [x] 5. Step 5 — create the three DCLs (**all three active**; `/CallLog` needed the constant-element route ruled in Q4 — see Step 5b)
- [x] 6. Step 6 — activate, then verify structurally (EML not runnable — see below)
- [x] 7. Step 7 — ATC clean at priority 1/2, commit

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_R_DynGwCallTP | DDLS/DF | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_R_DynGwStepTP | DDLS/DF | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_C_DynGwCallTP | DDLS/DF | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_C_DynGwStepTP | DDLS/DF | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_I_DynGwRegHist | DDLS/DF | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_R_DynGwCallTP | BDEF/BDO | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_C_DynGwCallTP | BDEF/BDO | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZBP_FS_DYNGWCALLTP | CLAS/OC | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** (behaviorPool, abstract) |
| ZFS_R_DynGwStepTP | DCLS/DL | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_I_DynGwRegHist | DCLS/DL | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** |
| ZFS_R_DynGwCallTP | DCLS/DL | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | **active** (constant-element route, Q4 / Step 5b) |

## Delivery checks

- [x] Pretty Printer — CDS/DCL/BDEF hand-formatted; the behaviour pool is a two-statement stub
- [x] Syntax check clean — via activation, the only verdict that can actually fail (L-436)
- [x] Activated, nothing left inactive — `inactiveObjects` shows **none** of this task's objects; the four inactive objects on the system belong to other people's work
- [x] ATC / Code Inspector — **zero priority 1 and 2 findings**; two priority-3 (see below)
- [x] ABAP Unit green — **none applicable**: this task creates CDS views, behaviour definitions, DCLs and an empty behaviour pool. There is no ABAP logic to unit-test; the behaviour pool has no method bodies. Task 17 (`ZCL_FS_DYN_LOG`) is where testable logic starts.
- [x] Text symbols and selection texts maintained — **none created or modified** (no report, no class texts)
- [x] Object list confirmed in the transport — all eleven on task `DS4K907264` of `DS4K907263`

## Work log

### Step 1 — pre-create validation (the gate)

- `abap_creation-run_validation` `DDLS/DF` `ZFS_R_DYNGWCALLTP` → `Data Definition validated
  successfully`.
- `abap_creation-run_validation` `BDEF/BDO` `ZFS_R_DYNGWCALLTP` (definition / Managed / rootEntity
  `ZFS_R_DYNGWCALLTP`) → first run: `The referenced STOB object ZFS_R_DYNGWCALLTP does not exist`.
  This is the ordering dependency Task 4 already recorded, not a shape refusal. Re-run after the
  root view activated → `Behavior Definition validated successfully`.

**The gate's real question — does RAP accept a managed BO whose projection exposes no write
operations but which will later carry static actions? — is answered YES.** The projection BDEF
`ZFS_C_DynGwCallTP` (`projection; strict ( 2 );`, no `use create`/`use update`/`use delete`,
only `use association`) activated successfully. The brief's documented fallback (a dedicated
single-row action-carrier entity) is **not** needed and was not taken.

### Step 3 — the five CDS views

Root `ZFS_R_DynGwCallTP` selects from `zfs_t_dyn_call` and declares
`composition [0..*] of ZFS_R_DynGwStepTP as _Steps`. Child `ZFS_R_DynGwStepTP` declares
`association to parent ZFS_R_DynGwCallTP as _Call on $projection.CallUuid = _Call.CallUuid`. These
two are mutually dependent, so they were activated in one call. `ZFS_I_DynGwRegHist` is a plain
`define view entity` over `zfs_t_dyn_regh` — no BO, no `TP` suffix, as specified.

Per L-385, **both** projection views needed care: `ZFS_C_DynGwCallTP` is declared
`define root view entity` because it carries its own projection behaviour definition;
`ZFS_C_DynGwStepTP` is a plain `define view entity` because it is the composition child.

No `where` clause was needed on any of the five, so L-241 did not bite. `ignorePropagatedAnnotations`
was **not** used, so L-239 did not apply; the five RAP admin fields carry their `@Semantics`
annotations restated explicitly per field on each base view.

### Interruptions and recoveries (all re-verified, none left a stranded object)

1. **Dead ADT session at start.** Every `mcp-abap-abap-adt-api` call returned HTTP 400 while
   `healthcheck` said healthy and `adt-mcp` worked. `login` (which always returns a serialization
   error) revived it. Written up as **L-438**.
2. **`setObjectSource` timed out** (`connect ETIMEDOUT`) writing `ZFS_I_DynGwRegHist`. Per **L-380**
   the state was re-read before retrying — the write had genuinely **not** landed (the shell was
   still there) — and the retry succeeded. No orphan.
3. **Orphaned enqueues.** The timed-out request left a server-side enqueue; a subsequent *failed*
   `activateObjects` added two more on the objects it had locked before failing. `dropSession` did
   not clear them. `adt-mcp`'s `abap_activate_objects` (a separate session, and the routing rule's
   activation server anyway) activated straight through. Written up as **L-437**. The human also
   cleared locks mid-task; by then the activation had already succeeded.
4. **Killed by an org spend limit (HTTP 429)** between Step 5's writes and their activation.
   Resumed against re-read state, recreated nothing.

### Step 5 — the three DCLs (2 of 3)

`ZFS_R_DynGwStepTP` and `ZFS_I_DynGwRegHist` both carry a kind element and a name element, so both
got the proven mapped form already live on this system in `ZFS_R_DynGwRegTP`'s DCL:

```
grant select on ZFS_R_DynGwStepTP
  where ( StepKind, TargetName ) = aspect pfcg_auth ( ZFS_DYNGW, ZDYNKIND, ZDYNTGT, ACTVT = '03' );
```

Both activated. This is **stricter** than the brief's activity-only grant, not looser.

**Known property, not a surprise:** because these two grants are *mapped*, a row whose `StepKind` or
`TargetName` is blank — a step refused before its target was resolved, say — matches no granted
value and is therefore **invisible to everyone**, auditors included. That is the right fail-closed
default for an audit log, but whoever first sees a shorter list than they expected should know it is
this, not data loss. The rows are in `ZFS_T_DYN_STEP` either way.

`ZFS_R_DynGwCallTP` initially **could not be done** — see **L-435**. Four syntactic variants were
tried as real activations and all four were rejected; the element-less `ASPECT PFCG_AUTH` form does
not exist on this release, and the header has no naturally mappable element. Escalated rather than
improvised; the unrestricted `grant select on ZFS_R_DynGwCallTP;` (what v1's `ZFS_I_DynGateway`
does) was **not** written, and `action` (CHAR20) was **not** mapped onto `ZDYNKIND` (CHAR4), which
would have been L-425's truncation trap a fourth time.

### Step 5b — `/CallLog` resolved: constant element + AUDIT at full target scope

Human ruling (Q4): add a constant element to the root view and map *that*. Built and active:

`ZFS_R_DynGwCallTP` (DDLS) gained one non-persisted element —

```
      // Constant, not persisted. Exists solely so the DCL has an element to map
      // through PFCG_AUTH: a call header is not target-scoped (a batch spans many
      // targets), so reading it requires ZFS_DYNGW ZDYNTGT at FULL scope ('*') with
      // ACTVT '03'. See the Task 16 worklog and L-435.
      cast( '*' as char30 ) as AuthTarget,
```

`char30` is the data element behind `ZFS_DYNGW`'s `ZDYNTGT` field, per L-425's live `AUTHX` read
(a direct `AUTHX` query was refused by ADT's data-preview handler this session, so the ledger's
earlier live read is the source). And the DCL —

```
grant select on ZFS_R_DynGwCallTP
  where ( AuthTarget ) = aspect pfcg_auth ( ZFS_DYNGW, ZDYNTGT, ACTVT = '03' );
```

**All activated first try**, in order: root DDLS → root BDEF → DCL. Two things worth recording
because neither was certain going in:
- the constant-mapping form **is** accepted by DCL on this release — the missing piece in L-435 was
  never `PFCG_AUTH` itself, only the absence of a left-hand element;
- `strict ( 2 )`'s `mapping for zfs_t_dyn_call` **tolerates** the new element without an entry,
  because `AuthTarget` is calculated rather than persisted. The BDEF needed no change at all.

**Semantics:** read access to a call header now requires the AUDIT permission at *full* target scope
(`ZDYNTGT = '*'`). A user whose `ZDYNTGT` is restricted to particular targets sees no headers — which
is correct, because the header is not target-scoped and would otherwise leak the existence and
payload of calls against targets they cannot see.

> **Two corrections to that paragraph, both from the 2026-09-13 review — read them with it:**
> - It is *not* true that this "cannot accidentally grant more". `PFCG_AUTH` matches **ranges**, and
>   an interval on `ZDYNTGT` brackets the literal `*`. See **G5** — it is a role-maintenance rule,
>   not a code change.
> - "A restricted user sees no headers" is correct but has a consequence not stated here: such a
>   user can still see *steps*, so a graded audit role is effectively unusable. See **G4**.

### Step 6 — EML **not** executed; structural verification instead

The brief's Step 6 EML (`MODIFY ENTITIES OF zfs_r_dyngwcalltp ENTITY CallLog CREATE … CREATE BY
\_Steps … COMMIT ENTITIES`) **was not run and cannot be run here.** `runQuery` is SELECT-only and
short-dumps in ADT's Open-SQL-only data-preview handler on EML (L-384 / Task 4's finding), and the
obvious workaround — a small runner program or test class — is a **forbidden unrequested object**.

**Therefore the create-with-composition hop is EXPLICITLY UNPROVEN.**

> ### ⚠ HANDOVER TO TASK 18 — do not treat this BO's write path as verified
>
> Nothing has ever been written through `ZFS_R_DynGwCallTP` — not once, not in any form. The BO
> activated clean and its mappings read back correctly, but **"activated clean" is not "persists
> correctly"**, and this exact gap is what Task 4's report also carries. Specifically **unproven**:
>
> 1. that `MODIFY ENTITIES … CREATE BY \_Steps` persists a `ZFS_T_DYN_STEP` row at all;
> 2. that the child row's `call_uuid` comes back matching the `CallUuid` RAP generated for the
>    header (the whole point of the composition);
> 3. that managed numbering actually fills `CallUuid` and `StepUuid`;
> 4. that each `mapping for` clause moves values to the columns it names — 44 field mappings across
>    the two entities. *(Review 2026-09-13 verified all 44 column-by-column and found them
>    **statically** correct — so what remains unproven is only that RAP moves them at runtime.)*
> 5. **that `LastChangedAt` is actually populated on create.** The `@Semantics` annotations and the
>    `abp_lastchange_tstmpl` data element behind `etag master` are right, but no row has ever been
>    written, so nothing has demonstrated the timestamp is filled. A `/CallLog` GET returning a
>    blank `LastChangedAt` would break conditional requests **with no error surfacing anywhere** —
>    it fails quietly, which is why it belongs on this list rather than in a nice-to-have.
>
> Task 18 **owns closing all five** through its live OData route, and must not assume any of them
> green. `ZFS_T_DYN_CALL` and `ZFS_T_DYN_STEP` were both confirmed empty at the end of this task,
> so Task 18 starts from a clean slate and any row that appears is its own.

What **was** verified, structurally:

| Evidence | Result |
|---|---|
| `inactiveObjects` | Exactly one object of this task inactive — the blocked `/CallLog` DCL. The other four inactive objects belong to other people's work and were left alone. |
| Active-source readback of the root BDEF | Confirms both `define behavior` blocks, `association _Steps { create; }` on the root, `association _Call` + `lock dependent by _Call` + `authorization dependent by _Call` on the child, and the full field mapping of all 22 / 22 columns. |
| Generated `STOB/DO` per DDLS | Present for each of the four BO views (confirmed by `searchObject`). |
| `objectStructure` on `ZBP_FS_DYNGWCALLTP` | `class:category: "behaviorPool"`, `class:abstract: true`, `adtcore:version: "active"` — the `FOR BEHAVIOR OF` header took (L-386). |
| Projection BDEF activation | Succeeded with no write operations declared — Step 1's gate, answered on the real system rather than by validation alone. |
| `SELECT COUNT(*) FROM zfs_t_dyn_call` | `0` |
| `SELECT COUNT(*) FROM zfs_t_dyn_step` | `0` |

Both tables empty confirms no EML ran, nothing was written, and the brief's "delete both
afterwards" has nothing to delete.

### Step 7 — ATC

`abap_atc_run` over all ten active objects, destination `DS4_100_NIIF`, default variant.
**Zero priority 1 findings. Zero priority 2 findings.** Two priority-3:

1. `ZBP_FS_DYNGWCALLTP` — SLIN **W333**: *"The operation INSTANCE AUTHORIZATION
   ZFS_R_DYNGWCALLTP is not implemented."* **This one is not cosmetic** and is called out as a
   concern: the BDEF declares `authorization master ( instance )` (verbatim from the brief) but the
   behaviour pool implements no `get_instance_authorizations`. It activated anyway — unlike Task 4's
   sibling BO, where the same omission was a hard error — because this root declares only `create`,
   which routes through *global* authorization (L-389), leaving no instance-relevant operation.
   Harmless only while nothing invokes it, which is a property of the callers, not of the BO.
   No authorization policy was invented here: the brief specifies none for this BO, and Task 18 owns
   the authorization wiring. Written up as **L-439**.
2. `ZFS_C_DYNGWCALLTP` (BDEF) — SLIN W320, recommending the `transactional_query` provider contract.
   The identical advisory was raised and deliberately left on Task 4's projection BDEF; left here
   too for consistency.

Neither is a priority 1/2, so the acceptance bar is met; both are disclosed rather than swept up.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-435, L-436, L-437, L-438,
L-439, L-440, L-441**.

The ledger is append-only, so corrections were made by adding entries rather than editing:
- **L-440** records the resolution of L-435's open instance (the constant-element mapping), since
  L-435's own text still describes `/CallLog` as unresolved.
- **L-441** corrects one sentence of L-440 — the claim that the constant-element design "cannot
  accidentally grant more" — with the review's finding that `PFCG_AUTH` matches **ranges**, so an
  interval on `ZDYNTGT` brackets the literal `*`. L-440's design conclusion stands; only that
  sentence was wrong. See **G5**.

---

# ⛔ TASK 18 HANDOVER GATE — read this before publishing the service binding

Six items. Items **G1–G3** are gates: do not publish, or do not enable a write path, until each is
satisfied. Items **G4–G6** are properties to record and design around. None of this is optional
tidy-up, and none of it announces itself at runtime — every failure mode below is silent.

### G1 · PRE-PUBLISH GATE — verify all three DCLs are `active`, do not assume

`@AccessControl.authorizationCheck: #CHECK` **fails open**: with no active role, CDS does not fall
back to denying — it performs **no authorization check whatsoever**, silently. So an inactive DCL on
a `#CHECK` entity is full exposure of every dynamic call the system has executed, `request_json`
payloads included, with nothing in any log or UI to signal it.

This applies **precisely to the three base views**, each of which carries its own conditions:

| Base view | Its DCL | State at end of Task 16 |
|---|---|---|
| `ZFS_R_DynGwCallTP` | `ZFS_R_DynGwCallTP` | active |
| `ZFS_R_DynGwStepTP` | `ZFS_R_DynGwStepTP` | active |
| `ZFS_I_DynGwRegHist` | `ZFS_I_DynGwRegHist` | active |

**Re-verify at publish time.** All three were active when Task 16 closed; that is a fact about
2026-09-13, not a guarantee about the day Task 18 publishes.

**Do not confuse this with the projections.** `ZFS_C_DynGwCallTP` and `ZFS_C_DynGwStepTP` also carry
a bare `#CHECK` and have **no DCL of their own — and that is correct, by design.** They contribute
no conditions; the base view's conditions apply when it is read as their data source. That is the
standard RAP shape and why the brief specified three base-view DCLs (Task 4's `ZFS_C_DynGwRegTP` has
no DCL either). **The fail-open hazard above is not about them.** Nobody should "fix" the
projections by adding roles and conclude the hazard is closed — it is closed by G1's three base
views being active, and by nothing else.

### G2 · THE ONE TEST THAT ACTUALLY DISCRIMINATES — run it on the first live read

Base-view inheritance is the standard behaviour and is believed correct, but it has **not** been
proven on this system, and static inspection cannot distinguish "inherited and enforced" from
"inherited and silently dropped".

Run the first live OData read as a user holding `ZFS_DYNGW` with `ACTVT = '03'` **and a `ZDYNTGT`
restricted to one real target name** (not a user with no authorization at all):

| Endpoint | Expected |
|---|---|
| `/CallStep` | returns **that target's step rows** |
| `/CallLog` | returns **empty** |

That single run separates three things at once: (a) the DCL is inherited by the projection at all,
(b) the constant-`*` mapping really demands full scope rather than being a no-op that matches any
authorization, and (c) the per-target step grant works. **A bare unauthorised read distinguishes
none of them** — a user with no `ZFS_DYNGW` is filtered even by a broken-but-present condition. And
a green read by a full-scope user proves nothing at all: it passes either way.

### G3 · WRITE-PATH GATE — the instance-authorization hook does not exist

The child `CallStep` declares `update;` with `authorization dependent by _Call`, which **delegates
to the root's `authorization master ( instance )` — for which `get_instance_authorizations` is not
implemented.** (ATC surfaces this only as priority-3 SLIN W333 on `ZBP_FS_DYNGWCALLTP`.)

Task 16's own reasoning here was **incomplete**: it argued the root declares only `create`, which
routes through *global* authorization (L-389), so nothing instance-relevant exists. That misses the
child. The concrete failure: a Task 17/18 backfill of a step row —

```abap
MODIFY ENTITIES OF zfs_r_dyngwcalltp ENTITY CallStep
  UPDATE FIELDS ( ResponseJson ExecStatus ) …
```

— in **non-privileged** mode makes RAP evaluate the delegated instance authorization, find no hook,
and **fail at runtime**. It is silent today only because every intended write path is privileged and
nothing has run at all.

**Gate:** before enabling any **non-privileged** `update` on `CallStep`, either implement
`get_instance_authorizations` in `ZBP_FS_DYNGWCALLTP` **or** change the root to
`authorization master ( global )`. This is a precondition, not a tidy-up.

### G4 · KNOWN PROPERTY — header and step grants are scoped incompatibly

The header grant demands `ZDYNTGT` covering `*`; the step grant is per-target. So a **partially
scoped** auditor — say `ACTVT '03'`, `ZDYNKIND 'FUNC'`, `ZDYNTGT 'BAPI_*'`, a deliberately graded
audit role — can read **steps but never a header**, because `*` is not covered by `BAPI_*`.

Consequences: `/CallLog(<uuid>)/_Steps` returns nothing for them, and from a top-level `/CallStep`
set `$expand=_Call` yields null. The graded grant on `/CallStep` and `/RegistryHistory` is therefore
**effectively unusable by anyone who does not also hold `*`** — it can only narrow a full-scope
user's step list, never enable a scoped one.

This **fails closed, so it is safe** — it is not an exposure. But it is a design consequence, and
the first scoped auditor who meets it will report "the log is empty" and someone will hunt for data
loss. **Record it wherever the audit UI is specified.** By controller ruling (2026-09-13) the
decision on whether to change it waits for Task 18, when a published service makes the access model
testable live instead of reasoned about on paper.

### G5 · ROLE-MAINTENANCE RULE — `ZDYNTGT` must never be maintained as an interval

`PFCG_AUTH` evaluates authorization field values as **ranges**, not only single values. The value
being matched by the header grant is the literal string `*` (`0x2A`). So an authorization maintained
as an **interval** — low blank or `!`, high `ZZZZZZ`, the common "give them the lot without typing a
star" shortcut — **brackets `0x2A` and silently grants full header access**, i.e. every
`request_json` the gateway has ever received, to a role no reader would identify as full-scope.

Concrete: `ZFS_DYNGW_AUDIT_FUNC` with `ZDYNTGT` as the range `' '`–`'ZZZZZZ'` and
`ZDYNKIND = 'FUNC'`, intending "all function-module targets". The `/CallStep` DCL still narrows
steps to `FUNC`; the `/CallLog` DCL does not look at `ZDYNKIND` at all and hands that user the
complete call-header log for every kind.

> **Rule: on any `ZFS_DYNGW` role, `ZDYNTGT` must be maintained as single values or the explicit
> `*` — never as an interval spanning `*`.**

This corrects Task 16's own claim that the constant-element design "cannot accidentally grant more":
that is true for single-value maintenance and **not** true for interval maintenance. The fix is role
design, not code — the DCL stays as it is. Today's role was checked and is benign:
`ZFS_DYN_GW_ROLE` holds `LOW = '*'` with a blank `HIGH`, a single value rather than a range
(verified by the controller, 2026-09-13).

### G6 · Five unproven runtime claims

See the Step 6 handover block above — including that **`LastChangedAt` is populated on create**,
which fails silently and would break conditional requests with no error anywhere.
