# Dynamic Gateway v2 — analysis, redesign and rebuild in ZFS_DYN_GW

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (already exists on DS4/100, description "Dynamic Gateway", currently empty)
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026", owner FS_DEV3, confirmed modifiable)
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

Analyse the live dynamic OData gateway `ZFS_SB_DYNGATEWAY_O4_API` end to end, identify the
architectural gaps (logging, rollback, error handling, authorization, contract shape,
performance), and design **and build a replacement framework from scratch** — DDIC tables through
CDS, behaviour, classes, service definition and binding — as new `ZFS_DYN*` objects in package
`ZFS_DYN_GW` on transport `DS4K907263`.

Out of scope until the human decides otherwise: deleting or modifying any existing
`ZFS_*_SLC_GW*` / `ZFS_T_SLC_DYNGW` object (`deleteObject` is denied project-wide), and migrating
live registry rows.

**Phase now: brainstorming (design only).** No object is created until the human approves the
design and the written spec.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | `ZFS_DYN*` literal prefix, or AREA=`DYN` inside the house pattern? | **AREA=`DYN`, house pattern kept** — `ZFS_T_DYN_*`, `ZCL_FS_DYN_*`, `ZFS_R_DynGw*TP`, `ZBP_FS_DYNGW*TP`. `DYN` is added to the AREA list the way `HR` was on 2026-08-03. | 2026-09-12 |
| 2 | Fate of the existing gateway | **Leave `ZFS_SB_DYNGATEWAY_O4_API` running, untouched.** New service gets its own URL, own tables, own package. Retirement is a separate later decision. | 2026-09-12 |
| 3 | Contract compatibility | **Redesign clean.** Per-action parameter entities, one level of JSON nesting, HTTP 200 for every business outcome, genuinely-optional `RequestId`. Old payloads will not replay; docs and payload file rewritten as part of the build. | 2026-09-12 |
| 4 | Transaction model | **Approach A — remote execution session owns the business LUW.** Business work inside `DESTINATION 'NONE'` (rollback legal there); log written in the RAP LUW. Closes L-350 without the `BEHAVIOR_ILLEGAL_STATEMENT` risk. | 2026-09-12 |
| 5 | Authorization | **Real authorization object with three permissions** — ADMIN / EXECUTE / AUDIT — enforced in DCL, behaviour pool and orchestrator, plus a hard block on the framework's own tables as a write target. | 2026-09-12 |
| 6 | Build scope | **Full framework, phased**, each phase ending activated and regression-tested. | 2026-09-12 |
| 7 | Registry delivery class | **`C` (customizing), transportable.** Log and history tables stay non-transportable. | 2026-09-12 |
| 8 | RAP draft (project rule 7) | **No draft on any BO.** This is an API service; draft adds a draft table and two-phase save for no consumer. Answer recorded per rule 7. | 2026-09-12 |
| 9 | Action set | **Six actions.** Every kind callable single-shot *and* as a batch step: `RunQuery`, `CallFunctionModule`, `ExecuteTableCrud`, `SubmitReport`, `RegisterTarget`, `ExecuteBatch`. v1's "SUBM and REGI are batch-only" asymmetry is removed. | 2026-09-12 |

## Naming gate

**Task 1 (domains + data elements), gated before any create call:**

```
NAMING: ZFS_DO_DYN_KIND   -> matches "Domain | ZFS_DO_<NAME>"
NAMING: ZFS_DO_DYN_STATUS -> matches "Domain | ZFS_DO_<NAME>"
NAMING: ZFS_DO_DYN_ERRCAT -> matches "Domain | ZFS_DO_<NAME>"
NAMING: ZFS_DO_DYN_LOGLVL -> matches "Domain | ZFS_DO_<NAME>"
NAMING: ZFS_DO_DYN_CMODE  -> matches "Domain | ZFS_DO_<NAME>"
NAMING: ZFS_DE_DYN_KIND   -> matches "Data element | ZFS_DE_<NAME>"
NAMING: ZFS_DE_DYN_STATUS -> matches "Data element | ZFS_DE_<NAME>"
NAMING: ZFS_DE_DYN_ERRCAT -> matches "Data element | ZFS_DE_<NAME>"
NAMING: ZFS_DE_DYN_LOGLVL -> matches "Data element | ZFS_DE_<NAME>"
NAMING: ZFS_DE_DYN_CMODE  -> matches "Data element | ZFS_DE_<NAME>"
```

Cross-checked against `docs/naming-conventions.md` lines 53-54 (`Data element | ZFS_DE_<NAME>`,
`Domain | ZFS_DO_<NAME>`) — all ten match.

## Todo

- [x] 1. Read the live gateway docs, the 2026-09-10 framework design, the 2026-09-12 table-split
      design and the 2026-09-11 architecture review.
- [x] 2. Confirm package `ZFS_DYN_GW` and transport `DS4K907263` exist and are usable.
- [x] 3. Settle the open questions with the human — all nine answered 2026-09-12.
- [x] 4. Present the design in sections; approved in chat.
- [x] 5. Verify capability coverage against the **live v1 source** (not the docs) for all four
      variations plus `REGI` — see the coverage matrix in spec §3.
- [x] 6. Write the spec to `docs/superpowers/specs/2026-09-12-1033-dyngw-v2-design.md` and self-review it.
- [x] 7. Record `DYN` as an approved AREA code in `docs/naming-conventions.md` (L-376).
- [x] 8. Human reviewed and approved the spec (2026-09-12).
- [x] 9. Implementation plan written to `docs/superpowers/plans/2026-09-12-1032-dyngw-v2.md`
      (21 tasks across 6 phases) and self-reviewed against the spec.
- [ ] 10. **BLOCKED — P1:** a human must create authorization object `ZFS_DYNGW` in SU21.
      Neither MCP server can create `SUSO`, and `sap-gui` creation is restricted to text elements
      and transaction codes (rule 5 / L-229). Blocks Task 5 and Task 14 only.
- [x] 11. **Task 1 complete — 2026-09-12.** Five domains and five data elements created,
      activated, and verified; messages 037-045 added to `ZFS_TRM_MSG`, activated, and verified.
      See "Task 1 attempt" and "Task 1 resumed and completed" below.
- [x] 12a. **Task 2 complete — 2026-09-12.** Four DDIC transparent tables (`ZFS_T_DYN_REG`,
      `ZFS_T_DYN_REGH`, `ZFS_T_DYN_CALL`, `ZFS_T_DYN_STEP`) created, sourced and activated. See
      "Task 2 — four DDIC transparent tables" below for the naming gate and "Task 2 build and
      verification" further below for the build log, the `abap.string(0)` fix (L-381), and
      verification.
- [x] 12b-3. **Task 3 — partially blocked, 2026-09-12.** Buffering (step 2 of the brief) done and
      verified. Indexes (steps 1, 3, 4 of the brief) **BLOCKED** — see "Task 3 — indexes and table
      buffering" below.
- [x] 12c-6. **Task 6 complete — 2026-09-12.** Exception class `ZCX_FS_DYN_ERROR` and interface
      `ZIF_FS_DYN_HANDLER` created, sourced verbatim from the task-6 brief, activated clean, ATC
      clean (zero findings, not just clean at priority 1/2). See "Task 6 — exception class and
      handler interface" below.
- [x] 12c-9. **Task 9 complete — 2026-09-12.** `ZCL_FS_DYN_HDL_FUNC` (CLAS/OC) + its test include
      built as the `FUNC` handler, constructor-injected with `ZIF_FS_DYN_RUNTIME`. Activated clean,
      ATC priority 1/2 clean. This row was missing when the task was reported — the task committed
      only its own per-task worklog and the ledger, leaving this master file untouched in that turn
      (CLAUDE.md non-negotiable 8 / working-agreement rule 2). Added in fix round 2, together with
      the object list below. Fix round 2 (2026-09-12) then fixed the critical `ty_call_param-kind`
      narrowing and the silent-drop `CONTINUE` in `build_plan`, and the suite is now **5/5 green**.
      See "Task 9 — `ZCL_FS_DYN_HDL_FUNC`" and "Task 9 — fix round 2" below.
- [x] 12c-10. **Task 10 complete — 2026-09-12.** `ZCL_FS_DYN_HDL_TABLE` (CLAS/OC) + its test
      include built as the `TABL` handler, constructor-injected with `ZIF_FS_DYN_RUNTIME`. TDD:
      **RED 7/7 failing** against the activated skeleton, **GREEN 7/7** after the implementation.
      `ZIF_FS_DYN_RUNTIME=>TY_CALL_RESULT` widened with `DBCNT` (additive, no object created) so an
      affected-row count can cross the seam — without it the brief's partial-write test was
      unsatisfiable by any implementation. Write-row budget taken from `ZFS_T_DYN_REG-MAX_ROWS`;
      `ZCL_FS_DYN_BUDGET` (Task 13) deliberately **not** created. All three pre-existing suites
      re-run green (FUNC 5/5, QUERY 6/6, RUNTIME 2/2). ATC 0 errors / 0 warnings. Ledger **L-404**.
      See "Task 10 — `ZCL_FS_DYN_HDL_TABLE`" below.
- [x] 12c-11. **Task 11 complete — 2026-09-12.** `ZFS_FG_DYN_GW` (FUGR/F), `ZFS_RFC_DYN_SUBMIT`
      (FUGR/FF, RFC-enabled) and `ZCL_FS_DYN_HDL_SUBMIT` (CLAS/OC) + its test include, built as the
      `SUBM` pair. TDD: **RED 9/9 failing** against the activated skeleton, **GREEN 9/9** after.
      Resolution 1 — `ZIF_FS_DYN_RUNTIME~SUBMIT_REPORT` widened to the function module's own
      parameter list with a new `TY_SUBMIT_RESULT`, plus `PROGRAM_INFO` and `VARIANT_EXISTS` so
      programs and variants are validated through the seam (rule 3). Resolution 2 —
      `dest = 'NONE'` **kept**, per spec 6.1/6.4; reasoning recorded in the source and below.
      All three sibling doubles updated (two stub methods each, nothing else) and all four suites
      re-run green (QUERY 6/6, FUNC 5/5, TABLE 7/7, RUNTIME 2/2). ATC 0 priority-1 / 0 priority-2.
      **First live proof in this build**: the function module run in SE37 against the real report
      `RSPARAM` returned 027, 028, 032 and a full `SALV` capture (5 rows, 0.195 s). The human set
      the Remote-Enabled flag in SE37, clearing L-324; `TFDIR-FMODE` verified `R`. Ledger **L-406**
      and **L-407**. See "Task 11 — `ZFS_FG_DYN_GW` ..." below.
- [ ] 12c. Tasks 5, 7-21 per the plan, each ending activated, ATC-clean and regression-tested.
- [x] 12d. **Task 4 built and activated — 2026-09-12.** Registry RAP BO (`ZFS_R_DynGwRegTP`,
      `ZFS_C_DynGwRegTP`, their behavior definitions, `ZBP_FS_DYNGWREGTP`) created, sourced verbatim
      from the task-4 brief (plus required syntax fixes — see below), activated clean, ATC clean at
      priority 1/2. **Behavioural verification (create-writes-history, message-039 refusal) is
      DEFERRED TO TASK 18 by controller ruling — `runQuery` cannot execute EML (real short dumps
      confirmed, not tooling flakiness) and no sanctioned alternative exists at BO-build time.**
      Fix round 1 (2026-09-12): delete pre-image defect fixed (`captureDeletePreImage` validation
      added), self-protection normalisation documented. See "Task 4 — Registry RAP business object"
      below.
- [x] 12e. **Task 5 — 2026-09-12.** Prerequisite `ZFS_DYNGW` (SU21) confirmed live by the human.
      DCL `ZFS_R_DynGwRegTP` created (read gate: ACTVT 03 + ZDYNKIND/ZDYNTGT via `pfcg_auth`).
      `ZBP_FS_DYNGWREGTP` given a real `get_global_authorizations` (CREATE, ACTVT 01) and a real
      `get_instance_authorizations` (UPDATE/DELETE, ACTVT 02), each `AUTHORITY-CHECK OBJECT
      'ZFS_DYNGW'` with `ZDYNKIND`/`ZDYNTGT` DUMMY (ADMIN gate, not the per-call EXECUTE gate),
      message 040 on refusal. BDEF changed from `authorization master ( instance )` to
      `( global, instance )` — a first attempt keeping only instance authorization for all three
      operations failed activation live (`REQUESTED_AUTHORIZATIONS` has no `%CREATE` component
      under `FOR INSTANCE AUTHORIZATION`), corrected and recorded as **L-389**. ATC's first run
      also flagged all three `AUTHORITY-CHECK` statements priority 2 for omitting declared fields;
      fixed with explicit `DUMMY`, recorded as **L-390**. Zero priority 1/2 findings after the fix.
      Behavioural proof deferred to Task 18 (same reason as Task 4). See "Task 5 — Registry access
      control (DCL)" below.

### Task 1 attempt — 2026-09-12, blocked on server outage

**Step 1 (route establishment) — done by static inspection, not by the brief's live probe.**
The brief's non-destructive check (`validateNewObject`) is unusable: inspecting the vendored
server at `tools/mcp-abap-adt-api/node_modules/mcp-abap-abap-adt-api/dist/handlers/ObjectRegistrationHandlers.js`
shows `handleValidateNewObject` passes `args.options` — a raw JSON **string** per the tool's own
schema — straight into `adtclient.validateNewObject(options)` in
`tools/mcp-abap-adt-api/node_modules/abap-adt-api/build/api/objectcreator.js`, which immediately
does `CreatableTypes.get(options.objtype)`. A string has no `.objtype`, so this throws
`"Unsupported object type"` for **every** call regardless of the real object type or backend
support — confirmed by getting the identical error twice in a row for `DTEL/DE`. This is a
client-side tooling defect, not evidence about DTEL/DOMA/MSAG support (see L-379).

Static evidence that the route itself is sound: `objectcreator.js`'s `CreatableTypes` map (built
at module load, independent of the broken `validateNewObject` path) lists `DOMA/DD` →
`ddic/domains`, `DTEL/DE` → `ddic/dataelements`, and `MSAG/N` → `messageclass` as real creation
paths, and `createObject` (used via the `createObject` MCP tool, which passes discrete
`objtype`/`name`/`parentName`/`description`/`parentPath` args rather than a bundled string) does
not share the `validateNewObject` bug. Conclusion: the rule-5 fallback to
`mcp-abap-abap-adt-api createObject` stands; Step 1 is satisfied by inspection since the intended
live probe tool is broken.

**Step 3 (create first domain) — blocked by a live server outage, not by object-type support.**
`createObject` for `ZFS_DO_DYN_KIND` (`DOMA/DD`, package `ZFS_DYN_GW`, transport `DS4K907263`)
returned `Request failed with status code 400` twice. Per L-374, `healthcheck` was cross-checked
and lied (`{"status":"healthy"}` on every call throughout). Escalating per the brief's own
instruction ("cross-check with `abap_list_destinations` and `sap_get_session_info` to tell a
one-server outage from a system-wide one"):

- `mcp__adt-mcp__abap_list_destinations` → `[DS4_100_NIIF]`, consistently available.
- `mcp__adt-mcp__abap_creation-get_all_creatable_objects` (a real, live call against the same
  destination) → succeeded, full object-type list returned.
- `mcp__sap-gui__sap_get_session_info` → "Not connected to SAP" (SAP GUI simply wasn't logged on
  this session; not itself evidence either way).
- Every subsequent `mcp-abap-abap-adt-api` call — `searchObject`, `runQuery`, `adtDiscovery`,
  `dropSession` — failed the same way (400 / "Internal server error"), including `adtDiscovery`,
  the simplest possible read with no object-specific logic.

This is a **sustained one-server outage**, not a system-wide one (the SAP system itself, reached
through `adt-mcp`, stayed healthy throughout) and not the routine flakiness L-374 describes (which
clears within a call or two). Retried 12+ times across ~8 minutes of elapsed wall time (waits of
10s/15s/20s/30s/45s/60s/90s/120s between attempts, with `healthcheck` and `adtDiscovery` rechecked
each time) — `mcp-abap-abap-adt-api` never recovered in-session. Per the brief, did **not** force
through with a substitute tool (`adt-mcp` cannot create `DOMA/DTEL/MSAG` at all) and did not
improvise a different object type. See L-378.

**CORRECTION (recorded when discovered, same day):** the conclusion "nothing was created on SAP"
below was **wrong**. The human checked SE11 directly on `DS4/100` while the BLOCKED report was
being written and found `ZFS_DO_DYN_KIND` already existed, with the right description, save status
"New" — the **first** `createObject` call had silently succeeded server-side; only the response
back to this session was lost as a 400. The outage diagnosis itself was not wrong (the server did
stop answering afterward), but treating the error as proof nothing had landed was wrong and could
have caused a duplicate-object attempt on resumption. See **L-380**, which supersedes/corrects
**L-378** on this specific point. The paragraph immediately below is preserved as originally
written, for the record, and is **not** to be relied on:

~~**Nothing was created on SAP.** No lock was taken (both `createObject` attempts failed before any
lock/PUT step), so there is no known partial object — but this must be **verified by search**
(`searchObject` for `ZFS_DO_DYN_KIND`) before the next attempt, since a 400 response is not proof
the request never reached the backend.~~ — **Confirmed false on resumption: `ZFS_DO_DYN_KIND` had
already been created by the first attempt.** A pre-retry `searchObject` on resumption (this
session's own stated plan) would have caught it before any duplicate attempt; the human's
independent SE11 check caught it first.

All ten PUT-body XML payloads (five `doma:domain`, five `dtel:dataElement`, built from the
`setDomainProperties`/`setDataElementProperties` templates in the vendored
`abap-adt-api/build/api/objectcontents.js`, replicated through the generic `setObjectSource` tool
since those two functions are implemented in the npm package but **not** exposed as MCP tools) and
the fixed-value texts (four of five domains use the brief's literal text; `ZFS_DO_DYN_ERRCAT`'s
texts are drawn verbatim from spec §7.2's error taxonomy table, since the brief gave no explicit
value texts for that domain) are pre-built and saved at
`C:\Users\karth\AppData\Local\Temp\claude\D--SAP-Tool-SAP-Project-Development-V1\ef0578b4-b519-4191-aca7-3cd8033247be\scratchpad\dyngw-task1\{domains.md,dataelements.md}`
— ready to execute as soon as the server recovers, without re-deriving the route or the content.

**Messages (Step 2b) not created either** — same server, same outage; `docs/message-catalog/DS4_100_NIIF.md`
confirmed still at next-free **037** (re-read this session, unchanged from the brief).

### Task 1 resumed and completed — 2026-09-12

The human verified live state directly (SE11/dd04l/dd07l reads plus `transportInfo`) and confirmed:
all 5 domains already existed and active-ready on transport **`DS4K907264`** (a task under
`DS4K907263`) with correct types and all 18 fixed values; all 5 data elements existed but as empty
skeletons (`dd04l.as4local='L'`, `domname`/`datatype` blank — the earlier `setObjectSource` PUTs
for the data elements genuinely had not committed, unlike the domain `createObject`); nothing was
activated; `ZFS_TRM_MSG` still ended at 036. Resumed from this corrected baseline rather than from
the BLOCKED report's assumptions, per the instruction to start from facts.

Before touching anything, re-ran `runQuery` on `dd04l` for `ZFS_DE_DYN%` to confirm the empty-skeleton
state myself (matched exactly). Re-locked all 5 data elements (fresh handles — the previous
session's handles were confirmed stale/dead, no lock conflicts encountered, so no orphaned lock to
report). First `setObjectSource` attempt on the data elements failed on missing required XML
elements not present in the pre-built payload (`shortFieldMaxLength`, then `searchHelp` and the
remaining optional fields) — the vendored `setDataElementProperties` template requires the **full**
field set even for defaults; fixed by including all of `searchHelp`, `searchHelpParameter`,
`setGetParameter`, `defaultComponentName`, `deactivateInputHistory`, `changeDocument`,
`leftToRightDirection`, `deactivateBIDIFiltering` (empty/`false` defaults) alongside the four field
labels. Hit one more transient batch of 400s/`ETIMEDOUT` mid-retry (the same server flakiness
pattern); paused on the human's "wait" instruction rather than retrying blind, then resumed on
"Go". Re-ran the `dd04l` check again after the successful PUTs — domain/length correct — before
unlocking, so this time the write was confirmed from the object's own state, not inferred from the
HTTP response (per L-380).

Activated all 10 objects (5 domains + 5 data elements) in **one** `activateObjects` call: `success:
true`, `messages: []`, `inactive: []`. `inactiveObjects` afterward lists only the four pre-existing,
unrelated objects the human flagged in advance (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`,
`ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) plus open transport headers — none of the ten remain. Verified
`dd04l` (`ZFS_DE_DYN%`, all 5 rows `AS4LOCAL='A'`, correct `DOMNAME`/`DATATYPE`/`LENG`) and `dd07l`
(`ZFS_DO_DYN%`, `AS4LOCAL='A'`) — **18 rows**, exactly 5+3+4+3+3, values matching the brief and
(for `ZFS_DO_DYN_ERRCAT`) spec §7.2 verbatim.

For messages: confirmed via `searchObject`/`transportInfo` on `/sap/bc/adt/messageclass/zfs_trm_msg`
that the class is currently locked/registered under transport **`DS4K907018`**, task **`DS4K907194`**
(owned by `FS_DEV3`) — the same task 033–036 already used, not `DS4K907263` (L-355: checked live,
not assumed). Read the full existing 36-message source via `getObjectSource`, appended messages
037–045 (exact texts from the brief) with the same attribute shape as the existing entries, locked,
`setObjectSource` with `transport=DS4K907194`, unlocked, activated. Activation returned a single
warning (`"Activation/Generation tool for ZFS_TRM_MSG not found"`) with `success: true` and
`inactive: []` — a known benign message-class quirk, not a real failure. Verified via
`SELECT msgnr, text FROM t100 WHERE arbgb = 'ZFS_TRM_MSG' AND msgnr BETWEEN '037' AND '045'` — 9
rows, all texts matching the brief exactly.

**Task 1 is complete.** All ten DDIC objects and all nine messages are active and verified on
`DS4_100_NIIF`.

## Routing fallbacks recorded (project rule 5)

| Object type | `adt-mcp` | Route taken | Reason |
|---|---|---|---|
| `DOMA/DD`, `DTEL/DE` | **not creatable** — absent from `abap_creation-get_all_creatable_objects` | `mcp-abap-abap-adt-api` `createObject` + `lock`/`setObjectSource`/`unLock` (two-step: skeleton, then content) — **confirmed working**, all 10 objects created and activated 2026-09-12 | no adapter exists in `adt-mcp` |
| `MSAG/N` (message class `ZFS_TRM_MSG`, existing) | **not creatable** | `mcp-abap-abap-adt-api` `lock`/`getObjectSource`/`setObjectSource`/`unLock` (this is a **change** to an existing class, not a create — rule 6) — **confirmed working**, messages 037-045 added and activated 2026-09-12 | no adapter exists in `adt-mcp`; confirmed case per working agreement §5 |
| `SUSO` (authorization object) | **not creatable** | **none available** | not in `adt-mcp`'s list; `sap-gui` may only create text elements and tcodes (L-229). Reported as blocked, not worked around |

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_DO_DYN_KIND` | Domain | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_DO_DYN_STATUS` | Domain | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DO_DYN_ERRCAT` | Domain | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DO_DYN_LOGLVL` | Domain | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DO_DYN_CMODE` | Domain | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DE_DYN_KIND` | Data element | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DE_DYN_STATUS` | Data element | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DE_DYN_ERRCAT` | Data element | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DE_DYN_LOGLVL` | Data element | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_DE_DYN_CMODE` | Data element | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_TRM_MSG` messages 037-045 | Message (change to existing class) | ZFS_K2_CC_VS | DS4K907194 (task of DS4K907018) | Active |
| `ZFS_T_DYN_REG` | Transparent table | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_T_DYN_REGH` | Transparent table | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_T_DYN_CALL` | Transparent table | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_T_DYN_STEP` | Transparent table | ZFS_DYN_GW | DS4K907264 | Active |
| `ZFS_T_DYN_REG` technical settings (buffering) | Change to existing table (not a new object) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active — fully buffered |
| `ZFS_T_DYN_REG~KND`, `ZFS_T_DYN_CALL~REQ`/`EXA`/`EXB`, `ZFS_T_DYN_STEP~CAL` (secondary indexes) | Secondary index | ZFS_DYN_GW | — | **Not created — BLOCKED**, see Task 3 below |
| `ZFS_R_DynGwRegTP` | CDS view entity (RAP root) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_C_DynGwRegTP` | CDS view entity (projection, `root`) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_R_DynGwRegTP` | Behavior definition (root, managed + additional save) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_C_DynGwRegTP` | Behavior definition (projection) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZBP_FS_DYNGWREGTP` | Behavior pool (CLAS/OC) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active — behavioural proof deferred to Task 18 |

Full inventory with a `NAMING:` line per object: spec §4. ~55 objects across 6 phases.

## Findings so far (read-only, from source docs and live repository search)

- Package `ZFS_DYN_GW` exists and holds no objects; `ZFS_DYN*` search returns only unrelated
  `$TMP` programs (`ZFS_DYNAMIC_EXAMPLE*`). The namespace is clear.
- `DS4K907263` is listed by `abap_transport-get` for package `ZFS_DYN_GW`, owner `FS_DEV3`.
- The in-flight table split (`ZFS_T_SLC_GWREG/GWCALL/GWSTEP`, `ZCL_FS_SLC_GW_TXN`) is **half
  cut over and currently degraded**: L-350 re-opened and accepted as a gap, `RequestId` generated
  as a mandatory OData action parameter breaking every pre-existing caller, and a live
  `BEHAVIOR_ILLEGAL_STATEMENT` dump from issuing `COMMIT`/`ROLLBACK WORK` inside RAP action
  processing.

## Delivery checks

- [ ] Pretty Printer
- [ ] Syntax check clean
- [ ] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved
- [ ] ABAP Unit green (or "none applicable" with a reason)
- [ ] Text symbols and selection texts maintained
- [ ] Object list confirmed in the transport

## Lessons raised

- **L-376** — `DYN` is an approved AREA code; a "`ZFS_DYN*`" request resolves to the house pattern
  (`ZFS_T_DYN_REG`), not a literal prefix. `docs/naming-conventions.md` updated in the same turn.
- **L-377** — RAP action processing can never own a transaction; the v2 remedy is a dedicated
  `DESTINATION 'NONE'` execution session. Recorded as an approved **design decision**, explicitly
  not yet as measured platform behaviour.
- **L-378** — `mcp-abap-abap-adt-api` can go into a sustained, session-wide outage while
  `healthcheck` keeps reporting healthy; see ledger for detail. **Superseded on the specific point
  of "so nothing was created" by L-380** — the outage diagnosis stands, but the domain had in fact
  already been created before the outage; see below.
- **L-379** — `mcp-abap-abap-adt-api`'s `validateNewObject` tool is unconditionally broken; see
  ledger for detail. Do not use it as evidence of object-type support; use `createObject` itself
  (for a genuinely wanted object) as the real probe, or static inspection of the vendored
  `CreatableTypes` registry.
- **L-380** — A 400/-32603 from `mcp-abap-abap-adt-api` does not prove a write failed; the human's
  SE11 check found `ZFS_DO_DYN_KIND` already existed while the BLOCKED report was concluding
  otherwise. Never treat an error as proof nothing happened — re-read the object's actual state
  before any retry, since `deleteObject` is denied project-wide and a duplicate/orphan from a
  blind retry is permanent. See ledger for detail; corrects L-378.
- **L-381** — a classic DDIC `define table` needs `abap.string(0)`, not bare `string`, for a
  STRING-typed field. Bare `string` is accepted silently by `setObjectSource` (no write error) but
  fails activation with a nametab error pointing at the `define table` line, not the field. Found
  and fixed on `ZFS_T_DYN_REGH`/`ZFS_T_DYN_CALL`/`ZFS_T_DYN_STEP` in Task 2 by cross-checking the
  live, working `ZFS_T_SLC_DYNGW`, whose two JSON fields use `abap.string(0)`. See ledger for
  detail.
- **L-384** — `mcp-abap-abap-adt-api` "outages" during heavy `runQuery` use are often subroutine-pool
  exhaustion in the ADT data-preview handler, and `runQuery` cannot execute EML (SELECT-only) —
  written by the controller during Task 4. This implementer found the entry had briefly collided
  in number with Task 3's pre-existing `L-382` (both titled `L-382` at the same time) and corrected
  it to `L-384`, the next actually-free number, fixing every cross-reference (see Task 4 section
  below).
- **L-385** — a CDS consumption view carrying its own projection behavior definition must be
  declared `define root view entity`, not `define view entity`, even though it's a projection.
  Found activating `ZFS_C_DynGwRegTP` in Task 4. See ledger for detail.
- **L-386** — a behavior-pool class needs `DEFINITION ... FOR BEHAVIOR OF <root>` in its header;
  `adt-mcp`'s generic `CLAS/OC` creation produces a plain class that will never activate as a
  behavior pool no matter what local classes are added. Found activating `ZBP_FS_DYNGWREGTP` in
  Task 4. See ledger for detail.
- **L-387** — `CHECK_BEFORE_SAVE` can be structurally rejected for a `managed with additional save`
  BDEF, even with a completely empty method body, with no BDEF-side signal why. Found in
  `ZBP_FS_DYNGWREGTP`'s saver class in Task 4; worked around by capturing the pre-image one phase
  earlier, in the validation. See ledger for detail.

## Task 2 — four DDIC transparent tables

**Naming gate (recorded before any create call):**

```
NAMING: ZFS_T_DYN_REG  -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (13 chars, cap 16) AREA=DYN
NAMING: ZFS_T_DYN_REGH -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (14 chars, cap 16)
NAMING: ZFS_T_DYN_CALL -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (14 chars, cap 16)
NAMING: ZFS_T_DYN_STEP -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (14 chars, cap 16)
```

Cross-checked against `docs/naming-conventions.md` line 50 (`Transparent table | ZFS_T_<AREA>_<NAME>`
— max 16 chars, platform-enforced, L-099) — all four match, all comfortably under the cap.

Consumes the five data elements from Task 1 (`ZFS_DE_DYN_KIND`, `ZFS_DE_DYN_STATUS`,
`ZFS_DE_DYN_ERRCAT`, `ZFS_DE_DYN_LOGLVL`, `ZFS_DE_DYN_CMODE`) — active, not modified. DDL taken
verbatim from `.superpowers/sdd/2026-09-12-dyngw-v2/task-2-brief.md`. Two-step build per L-217:
`adt-mcp` `abap_creation-create_object` skeleton, then `mcp-abap-abap-adt-api` `setObjectSource`
for the full field list. Delivery classes per the brief: `ZFS_T_DYN_REG` = `#C` (customizing,
transportable — decision 7); the other three = `#A`/`#L` as given, not normalised.

### Task 2 build and verification — 2026-09-12

All four skeletons created via `mcp__adt-mcp__abap_creation-create_object` (`TABL/DT`, package
`ZFS_DYN_GW`, transport `DS4K907263`) — CTS filed all four under task **`DS4K907264`** (the same
task Task 1 landed on, confirmed via `inactiveObjects`), matching the brief's expectation. Sourced
each via `mcp-abap-abap-adt-api` `lock` / `setObjectSource` / `unLock`, DDL verbatim from the brief.
No failed write on any of the seven `setObjectSource` calls (four initial + three corrective
re-sends below) — nothing to re-verify per L-380 this time.

**Activation, round 1:** all four in one `activateObjects` call. `ZFS_T_DYN_REG` activated clean.
The other three (`ZFS_T_DYN_REGH`, `ZFS_T_DYN_CALL`, `ZFS_T_DYN_STEP`) failed with `"Nametab for
table ... cannot be generated"` / `"TABL ... was not activated"`. Isolating `ZFS_T_DYN_REGH` alone
reproduced the identical failure, ruling out a batch-activation artifact. The common factor: all
three failing tables carry a `string`-typed field (`before_json`/`after_json`,
`request_json`, `response_json`); `ZFS_T_DYN_REG` has none. Cross-checked the live v1 table
`ZFS_T_SLC_DYNGW` (`getObjectSource`) — its two JSON fields are declared `abap.string(0)`, not
bare `string`. Re-sourced `ZFS_T_DYN_REGH` with `abap.string(0)` in place of `string` (field names,
order and every other type left untouched) and reactivated alone: `success: true, messages: []`.
Applied the identical substitution to `ZFS_T_DYN_CALL` and `ZFS_T_DYN_STEP`; both activated
together cleanly. Recorded as **L-381**.

**Final state, verified:**
- `inactiveObjects` — none of the four tables present (only the four pre-existing unrelated
  objects and open transport headers already noted in Task 1 remain).
- `tableContents` for all four — `0` rows each, column list matching the brief's DDL exactly in
  name, order, type and length (`CLIENT`/key fields first, business fields in given order, all
  five audit fields last in the mandated order). Full column dumps captured in the session
  transcript; representative checks: `ZFS_T_DYN_REGH.BEFORE_JSON`/`AFTER_JSON` show `colType:
  "STRG", length: 0` (confirming the `abap.string(0)` fix took); `ZFS_T_DYN_CALL.MESSAGE_ID`/
  `MESSAGE_NO`/`MESSAGE_TEXT` show `CHAR20`/`CHAR3`/`CHAR220` matching `arbgb`/`msgnr`/`char220`.

**Task 2 is complete.** All four tables active and verified on `DS4_100_NIIF`, landed on transport
task `DS4K907264` (parent `DS4K907263`).

## Task 3 — indexes and table buffering

**No `NAMING:` gate for this task.** Per `docs/naming-conventions.md`, secondary indexes and
technical settings are not separately named/listed object types under the naming table — an index
name (`KND`, `REQ`, `EXA`, `EXB`, `CAL`) is a 3-character suffix attached to its table, not a
freestanding `ZFS_*` object, and buffering is a property change, not a create. Recorded explicitly
per rule 8 rather than leaving the absence of a `NAMING:` line unexplained.

Scope per `.superpowers/sdd/2026-09-12-dyngw-v2/task-3-brief.md`, verbatim: unique index `KND` on
`ZFS_T_DYN_REG` (`client`, `target_kind`, `target_name`); `ZFS_T_DYN_REG` set to fully buffered;
unique index `REQ` on `ZFS_T_DYN_CALL` (`client`, `request_id`); non-unique `EXA`
(`client`, `executed_at`) and `EXB` (`client`, `executed_by`) on `ZFS_T_DYN_CALL`; non-unique `CAL`
(`client`, `call_uuid`, `step_index`) on `ZFS_T_DYN_STEP`.

### Step 2 (buffering) — done and verified

Routed to `mcp-abap-abap-adt-api` per rule 6 (a change to an existing table). `objectStructure` on
`/sap/bc/adt/ddic/tables/zfs_t_dyn_reg` surfaced a `technicalsettings` link —
`/sap/bc/adt/ddic/db/settings/zfs_t_dyn_reg`, content type
`application/vnd.sap.adt.table.settings.v2+xml` — a genuine ADT XML resource, readable via
`getObjectSource`. Read the current state first: `<ts:buffering><ts:allowed>N</ts:allowed>
<ts:type/>...`. To learn the correct value scheme (SAP's own field-level docs for
`ts:allowed`/`ts:type` are not exposed through these MCP tools), read the same resource for the
live standard table `T005` (Countries, known fully buffered): `<ts:allowed>X</ts:allowed>
<ts:type>X</ts:type>` — confirmed independently against `DD09L` (`BUFALLOW='X'`,
`PUFFERUNG='X'` for `T005`). Used that as the verified template rather than guessing.

Locked `/sap/bc/adt/ddic/db/settings/zfs_t_dyn_reg` directly (locking the parent table object
first was tried and rejected: `"Resource Technical Table Settings ZFS_T_DYN_REG is not locked"` —
the settings sub-object needs its **own** lock, see L-382), `setObjectSource` with `ts:allowed=X`,
`ts:type=X` and every other field unchanged (`dataClassCategory` left at `APPL0`, per the brief —
only buffering was in scope), transport `DS4K907263`, unlocked. `setObjectSource` returned
`{"status":"success","updated":true}`, but a re-read immediately after showed
`adtcore:version="inactive"` — not yet live. Activating the **main table object**
(`TABL/DT`, `/sap/bc/adt/ddic/tables/zfs_t_dyn_reg`) reported `success: true` but did **not** flip
the settings to active on re-read (still `inactive`). Activating the **settings object itself**
(`TABL/DTT`, `/sap/bc/adt/ddic/db/settings/zfs_t_dyn_reg`) did: re-read afterward showed
`adtcore:version="active"`, `<ts:allowed>X</ts:allowed><ts:type>X</ts:type>`. Cross-verified at
the database level: `SELECT tabname, pufferung, bufallow FROM dd09l WHERE tabname =
'ZFS_T_DYN_REG'` → `PUFFERUNG='X'`, `BUFALLOW='X'`. **`ZFS_T_DYN_REG` is fully buffered and the
buffering is switched on, confirmed both via the ADT resource and via `DD09L` directly.** See
L-382 for the general lesson (own lock, own activation, distinct from the parent table).

A `mcp-abap-abap-adt-api` outage hit mid-verification (`runQuery`, `inactiveObjects`,
`searchObject`, and even a repeat `getObjectSource` on the same URL that had just succeeded all
failed with 400/-32603 for one round). Cross-checked per L-374/L-378: `abap_list_destinations`
still returned `[DS4_100_NIIF]` throughout, so this was the same server, not the system. Waited
~20s and retried the identical `getObjectSource` call — it succeeded and returned the correct
(active, `X`/`X`) state, so the outage was transient this time and did not require escalation or a
BLOCKED report on its own.

### Steps 1, 3, 4 (indexes) — BLOCKED

Neither MCP server can create a DDIC secondary index on this system. Evidence gathered before
concluding this, in order:

1. `mcp__adt-mcp__abap_creation-get_all_creatable_objects` (destination `DS4_100_NIIF`, a live call)
   — 23 creatable types returned (`BDEF/BDO`, `CLAS/OC`, `TABL/DT`, `TABL/DS`, etc.). No index type
   of any kind is present.
2. Static inspection of the vendored `abap-adt-api` package used by `mcp-abap-abap-adt-api`
   (`tools/mcp-abap-adt-api/node_modules/abap-adt-api/build/api/objectcreator.js`) — its
   `CreatableTypes` map is the **complete, hardcoded list of 20 object types** the `createObject`
   tool can ever create (confirmed by reading the full `ctypes` array end to end); no index type
   and no technical-settings type appear in it either (technical settings worked anyway because it
   is reached via the generic `getObjectSource`/`setObjectSource`/`lock` path against a real
   resource URL, not via `createObject`'s allow-listed map).
3. `mcp__mcp-abap-abap-adt-api__objectTypes()` (live, full backend object-type-group listing, ~2,950
   lines) — grepped for `index`/`TABI`/`technical`: no top-level DDIC index object type exists in
   the backend's own type registry (the `DDIC` group lists `DOMA`, `DTDC`, `DTEL`, `ENQU`, `SHLP`,
   `SQSC`, `TABL`, `TTYP`, `TYPE`, `VIEW`, `XINX` — no index type).
4. **The decisive, live check:** `objectStructure` on `/sap/bc/adt/ddic/tables/zfs_t_dyn_reg`
   returns one link per maintainable facet. The **Technical Settings** link (which we just used
   successfully) is typed `application/vnd.sap.adt.table.settings.v2+xml` — a real ADT XML
   resource. The **Index Overview** link, immediately alongside it, is typed
   `application/vnd.sap.sapgui` and points at
   `/sap/bc/adt/vit/wb/object_type/tabldt/object_name/ZFS_T_DYN_REG#view=INDX` — an embedded
   classic-GUI screen (SE11's Index Overview), with **no parallel XML resource offered at all**,
   unlike technical settings. A read-only probe of a plausible REST collection URL
   (`/sap/bc/adt/ddic/tables/zfs_t_dyn_reg/indexes`) returned `404` (not an empty list), consistent
   with no such resource existing.

**Conclusion: index maintenance on this system is only reachable through the embedded classic GUI
screen (SE11 Index Overview), which is functionally SE11 automation.** Project rule 5 restricts
`sap-gui` automation to exactly two named exceptions — text elements (SE38) and transaction codes
(SE93) — and secondary-index maintenance is neither. No create call was attempted for any index
(no lock, no `createObject`, no probe write against an index resource), so there is no
partially-created or orphaned index object on the system — the table itself is untouched beyond
the Step 2 buffering change. **Steps 1, 3, and 4 of the brief (the four secondary indexes and the
duplicate-rejection proof) are not done.** This blocks Task 12 (registration concurrency, which
relies on `ZFS_T_DYN_REG~KND` instead of check-then-insert) and Task 17 (idempotency, which relies
on `ZFS_T_DYN_CALL~REQ`) exactly as the task-3 brief anticipated — both will need a human decision
on how to proceed (a human-driven SE11 session outside this workflow, or an accepted design
fallback to application-level check-then-insert) before those tasks can be attempted as designed.
See L-383.

**Task 3 is partially complete: buffering done and verified; all four indexes and the
duplicate-rejection test are BLOCKED**, reported per the task's own instruction that this is a
genuinely expected outcome, not a failure.

## Task 4 — Registry RAP business object

Scope per `.superpowers/sdd/2026-09-12-dyngw-v2/task-4-brief.md`, verbatim: root view
`ZFS_R_DynGwRegTP` selecting directly from `zfs_t_dyn_reg` (not a projection on another view — the
trap that forced v1's `ZFS_I_DynGateway` exception), consumption view `ZFS_C_DynGwRegTP`, a
`managed with additional save` behavior definition pair, and behavior pool `ZBP_FS_DYNGWREGTP`
implementing `validateTarget` (message 034 for a bad payload, message **039** compiled,
non-configurable self-protection against `ZFS_T_DYN_*`/`ZFS_RFC_DYN_*`/`ZFS_T_SLC_GW*` targets) and
`save_modified` (one `ZFS_T_DYN_REGH` row per changed instance, `source='ODAT'`). No draft
(decision 8, rule 7 — not offered by any generator here since the BO was hand-authored from the
brief's verbatim CDS/BDEF source, not generated).

**Naming gate (recorded before any create call):**

```
NAMING: ZFS_R_DynGwRegTP  -> matches "Restricted reuse view | ZFS_R_<Entity>" (RAP BO root)
NAMING: ZFS_C_DynGwRegTP  -> matches "Consumption / projection view | ZFS_C_<Entity>"
NAMING: ZBP_FS_DYNGWREGTP -> matches "Behavior pool | ZBP_FS_<Entity>" (upper case)
```

Cross-checked against `docs/naming-conventions.md` lines 79-80/85 (`Consumption / projection view |
ZFS_C_<Entity>`, `Restricted reuse view | ZFS_R_<Entity>`, `Behavior pool | ZBP_FS_<Entity>`) — all
three match. Behavior definitions take the same name as the view they define (line 84), so no
separate naming line for those two.

**Step 1 — validated before creating anything**, per `mcp__adt-mcp__abap_creation-run_validation`:
`ZFS_R_DynGwRegTP` (DDLS/DF) and `ZFS_C_DynGwRegTP` (DDLS/DF) both returned "Data Definition
validated successfully"; `ZBP_FS_DYNGWREGTP` (CLAS/OC) returned "Class validated successfully". The
two BDEFs (BDEF/BDO) could not be validated ahead of their root/projection views —
`run_validation` rejected both with `"The referenced STOB object ZFS_R_DYNGWREGTP does not exist"`
/ `"...ZFS_C_DYNGWREGTP does not exist"` — a dependency-ordering rejection, not a shape rejection
(a BDEF's `run_validation` needs the CDS entity it behaves for to already exist). Sequenced the
build accordingly: create+source+activate the two DDLS views first, then re-run `run_validation`
for each BDEF against the real views before creating them.

**Steps 3-4 — the two DDLS views, build and one required deviation from the brief's literal
text.** Both created via `mcp__adt-mcp__abap_creation-create_object` (`DDLS/DF`, package
`ZFS_DYN_GW`, transport `DS4K907263`), sourced via `mcp-abap-abap-adt-api` `lock`/`setObjectSource`/
`unLock`. `ZFS_R_DynGwRegTP` was set and activated verbatim from the brief, first try, no issue.
`ZFS_C_DynGwRegTP` was set verbatim first (`define view entity ZFS_C_DynGwRegTP as projection on
ZFS_R_DynGwRegTP`, no `root` keyword, exactly as the brief's Step 4 shows) and **failed
activation**: `"ROOT keyword missing since ZFS_R_DYNGWREGTP has the root property"`, pointing at the
projection's own `define view entity` line. This is a real SAP CDS/RAP rule the brief's Step 4 text
does not reflect: a consumption view that gets its **own** projection behavior definition (Step 6
declares one for `ZFS_C_DynGwRegTP`) must itself be declared `define root view entity`, not
`define view entity`, even though it is a projection. Re-sourced with `root` added
(`define root view entity ZFS_C_DynGwRegTP as projection on ZFS_R_DynGwRegTP`, field list otherwise
byte-for-byte unchanged) and both views activated together cleanly on the retry. Re-read via
`getObjectSource` to confirm the corrected text actually persisted before activating. See L-385.

**Step 5 — root BDEF.** Created (`BDEF/BDO`, `implementationType: Managed`, `rootEntity:
ZFS_R_DynGwRegTP`), sourced and activated verbatim from the brief — clean, no deviation.

**Step 6 — projection BDEF.** `run_validation` correctly refused it (`"No active behavior
definition exists for base view ZFS_R_DYNGWREGTP of projection ZFS_C_DYNGWREGTP"`) until the root
BDEF was active — expected dependency ordering, not a defect. Created and sourced verbatim once the
root BDEF was active; activated clean at the end alongside the class (see Step 7/8 below).

**Step 7 — `ZBP_FS_DYNGWREGTP`, three more required deviations beyond the brief's Step 7 prose,**
all discovered by activation attempts against the real compiler, none guessed in advance:

1. **The class needs `FOR BEHAVIOR OF` in its `DEFINITION` header, not the plain stub `adt-mcp`
   generates.** First activation attempt against the plain-class stub (`CLASS zbp_fs_dyngwregtp
   DEFINITION PUBLIC FINAL CREATE PUBLIC.`, which `abap_creation-create_object` produces for every
   `CLAS/OC`) failed: `"Local classes of CL_ABAP_BEHAVIOR_HANDLER can only be derived in the; Local
   Definitions/Implementations of a global BEHAVIOR class."` `objectStructure` on the class showed
   `class:category: "generalObjectType"`, `class:abstract: false` — compared against the live,
   working `ZBP_FS_USERPROVISIONTP`'s `class:category: "behaviorPool"`, `class:abstract: true`.
   `adt-mcp`'s `get_all_creatable_objects` has no separate "Behavior Implementation Class" type —
   `CLAS/OC` is the only class type creatable, and it always creates the plain-class shape. Fixed
   by rewriting `source/main` to `CLASS zbp_fs_dyngwregtp DEFINITION PUBLIC ABSTRACT FINAL FOR
   BEHAVIOR OF zfs_r_dyngwregtp. ENDCLASS. CLASS zbp_fs_dyngwregtp IMPLEMENTATION. ENDCLASS.` —
   this header syntax is what actually flips the class to `behaviorPool`/abstract, not a
   property settable through the generic create/validate tools. See L-386.
2. **`CHECK_BEFORE_SAVE` is rejected for this behavior definition's declared shape, even with a
   completely empty method body.** The original design (documented further below) planned to
   redefine `CHECK_BEFORE_SAVE` to capture an update's true pre-image before the framework's own
   persistence overwrote it, per `docs/rap-managed-additional-save-pattern.md`'s own caution that
   `CHECK_BEFORE_SAVE` is legitimate "with a reason." Activation failed both with a real
   implementation and, isolated, with a no-op body: `"The method CHECK_BEFORE_SAVE cannot be
   redefined in accordance with BEHAVIOR definition ZFS_R_DYNGWREGTP"` every time — confirming this
   is not a body-content defect but a structural rejection of `CHECK_BEFORE_SAVE` for this BDEF's
   declared shape (`managed with additional save`, default/non-early numbering, no draft). Since
   the BDEF text is verbatim from the brief and out of scope to change, `CHECK_BEFORE_SAVE` was
   dropped entirely. The pre-image for an **update** is instead captured inside `validatetarget`
   (which the given BDEF **does** trigger for `create; update;`, and which runs in the MODIFY phase
   before the framework's persistence) via a plain `SELECT SINGLE` against `zfs_t_dyn_reg` — a row
   found there is by definition an existing row about to be updated (a create's row cannot yet
   exist) — cached in a small static buffer (`lcl_dyngwreg_buffer`, a plain non-behavior local class
   in the same include, sharing state between `lhc_dyngwreg` and `lsc_dyngwreg` within one request)
   for `save_modified` to read back. **At original build time, a DELETE had no equivalent capture
   point** — the given BDEF's `validatetarget` clause was `{ create; update; ... }`, not `delete`,
   so nothing ran before a deleted row's data was gone, and a deleted row's `ZFS_T_DYN_REGH` entry
   came back with `target_kind`/`target_name`/`before_json` all blank. Review correctly found this
   was not an exhausted-and-genuine platform limitation but an untried capture point — **fixed in
   fix round 1** with a second, dedicated validation (`captureDeletePreImage on save { delete; }`)
   that only ever populates the buffer, never touches `failed-`/`reported-`, so it can never reject
   a delete. See the "Fix round 1" subsection below Step 10 for the exact BDEF/class diff and L-387
   for the underlying `CHECK_BEFORE_SAVE` finding this works around.
3. **`SAVE_MODIFIED`'s `create`/`update`/`delete` parameters are entity-alias-suffixed structures
   (`create-registry`, `update-registry`, `delete-registry`), not bare tables**, contrary to
   `docs/rap-managed-additional-save-pattern.md`'s own simplified phrasing ("SAVE_MODIFIED
   (importing create/update/delete)"). `LOOP AT create ASSIGNING ...` failed activation:
   `"CREATE" is not an internal table` (naming `create`, `update`, `delete` each as an existing
   structure, not a table — the alias-suffixed component is the real table, matching the pattern
   already used for the handler's own `failed`/`reported` parameters, e.g.
   `failed-registry`/`reported-registry`, seen live in `ZBP_FS_USERPROVISIONTP`). Fixed by looping
   over `create-registry`/`update-registry`/`delete-registry` instead.
4. Two smaller fixes surfaced by the same compiler pass: `cl_system_uuid=>create_uuid_x16_static( )`
   raises `CX_UUID_ERROR`, which cannot be added to `SAVE_MODIFIED`'s fixed `RAISING` clause — wrapped
   each call in `TRY`/`CATCH cx_uuid_error` (skip that one history row on the practically-never-hit
   failure, rather than aborting the whole save). And `"authorization master ( instance )"` in the
   root BDEF (verbatim from the brief) requires `GET_INSTANCE_AUTHORIZATIONS` in the handler class —
   `"The operation INSTANCE AUTHORIZATION ZFS_R_DYNGWREGTP is not implemented"` on the first
   activation attempt, mirroring the `ZBP_FS_DYNGATEWAYTP` precedent already recorded in this
   workspace (`GET_GLOBAL_AUTHORIZATIONS` mandatory under `authorization master ( global )`, L-238)
   but for the instance variant. Implemented granting every requested operation (`%update`,
   `%delete`) unconditionally — real gating is Task 5's authorization object `ZFS_DYNGW`, still
   blocked on a human creating it in SU21 (todo item 10) — noted as a placeholder to revisit, not a
   permanent design choice.

None of these four deviations touch the given BDEF or CDS source text, which stayed byte-for-byte
verbatim except the one `root` keyword addition on `ZFS_C_DynGwRegTP` (deviation 1 above, a CDS fix,
not a behavior-pool fix). `ZBP_FS_DYNGWREGTP` (the one object the brief left entirely to be
hand-authored, since it's implementation code, not given verbatim source) activated clean after
these fixes. See L-385 through L-387 in the ledger.

**Step 8 — activation.** Both views, the root BDEF, and the class activated individually as each
became ready (dependency-ordered, per the notes above); the projection BDEF activated last, after
the class. `inactiveObjects` afterward: none of the five objects present — only the same
pre-existing, unrelated inactive objects already flagged in Task 1/2/3 (`ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) plus open transport headers. **No
unimplemented-operation warning was produced** — the class implements every operation the BDEF
declares (`create`/`update`/`delete`, the `validatetarget` validation, the additional save, and the
instance-authorization hook the `authorization master ( instance )` clause requires).

Exact activation results, quoted per object (this is the one build-time signal available, given
Step 9 below is deferred):
- `ZFS_R_DynGwRegTP` (DDLS/DF): `Activation successful.` — no warnings.
- `ZFS_C_DynGwRegTP` (DDLS/DF): `Activation successful.` — no warnings (after the `root` keyword
  fix; the pre-fix attempt was a hard failure, not a warning, and is not counted as an activation
  of this object).
- `ZFS_R_DynGwRegTP` (BDEF/BDO): `Activation successful.` — no warnings, both times it was
  activated (once before the class existed, once again after, to re-link — see Steps 5/7 above).
- `ZFS_C_DynGwRegTP` (BDEF/BDO): `Activation successful.` — no warnings.
- `ZBP_FS_DYNGWREGTP` (CLAS/OC): `Activation successful.` — no warnings, on the final corrected
  source (three prior attempts hard-failed with real compile errors, listed in Step 7 above and not
  counted as activations of this object either).

**Step 9 — DEFERRED BY CONTROLLER RULING (2026-09-12), NOT PERFORMED.** The brief's Step 9 instructs
running the create + self-protection-refusal test as an EML statement (`MODIFY ENTITIES OF
zfs_r_dyngwregtp ENTITY Registry CREATE ... COMMIT ENTITIES`) through
`mcp__mcp-abap-abap-adt-api__runQuery`. Attempting this repeatedly produced real ABAP short dumps
on the system — confirmed via `dumps()`: `Runtime Error: STRING_OFFSET_NEGATIVE`, `Exception:
CX_SY_RANGE_OUT_OF_BOUNDS`, `Program: CL_ADT_DP_OPEN_SQL_HANDLER====CP` — because `runQuery` is
backed by ADT's Open-SQL-only Data Preview handler and cannot execute EML at all; it tries to parse
the `MODIFY ENTITIES ...` text as a `SELECT` and short-dumps on a clause it can't find. No rewording
of the EML fixes this — it is a tool capability gap, not a malformed statement, and every attempt
costs a fresh, avoidable dump. There is no sanctioned alternative route: `runQuery` is the only
EML-capable-looking tool exposed, and creating a throwaway test class to run EML via `runClass`
would be an unrequested object under rule 3 and **permanent** (`deleteObject` denied project-wide).

**Controller ruling, recorded here so a future reader cannot mistake this for a skipped or
forgotten test:** Step 9's behavioural verification — the create-writes-history proof and the
message-039 self-protection refusal proof — is **deferred to Task 18** (publish + live OData smoke
test), not dropped. Task 18 gains a mandatory Step 6b carrying both assertions:
1. `POST /Registry` with a valid target writes **exactly one** row to `ZFS_T_DYN_REG` **and exactly
   one** row to `ZFS_T_DYN_REGH` with `change_type = 'I'`, `source = 'ODAT'`.
2. `POST /Registry` naming `ZFS_T_DYN_REG` as its target is refused with message **039** and writes
   **nothing** to either table.

This is a stronger proof than the brief's original EML plan would have been (it exercises the real
OData consumer path, not an internal test harness), and the plan (`docs/superpowers/plans/
2026-09-12-1032-dyngw-v2.md`) has been updated accordingly. Blast radius of deferring, checked rather
than assumed: Task 12's `REGI` handler writes registry rows through plain Open SQL inside the
execution session, not through this BO, so no task between here and Task 18 depends on this BO's
runtime behaviour. **What IS proven at this point: all five objects exist, are active, and
activated with zero warnings; ATC is clean at priority 1/2 (below). What is NOT yet proven: that
`validatetarget` actually refuses a self-protected target with message 039 at runtime, and that
`save_modified` actually writes the `ZFS_T_DYN_REGH` row on a real create.** Both tables were
confirmed empty (`SELECT COUNT(*)` = 0 on both `ZFS_T_DYN_REG` and `ZFS_T_DYN_REGH`) before this
finding stopped further EML attempts, so nothing was written and nothing needs cleaning up.

See L-384 (the `mcp-abap-abap-adt-api` subroutine-pool-exhaustion/SELECT-only finding — written by
the controller; this implementer independently found and fixed a real numbering collision between
that entry and the pre-existing Task-3 `L-382`, since both were briefly titled `L-382` in the ledger
— the controller's entry is now `L-384`, the next actually-free number after Task 3's `L-382`/
`L-383`, and every cross-reference to it in `docs/superpowers/plans/2026-09-12-1032-dyngw-v2.md` and
`.superpowers/sdd/2026-09-12-dyngw-v2/progress.md` was corrected to match).

**Step 10 — ATC.** Run via `mcp__adt-mcp__abap_atc_run` against all five objects (destination
`DS4_100_NIIF`, default check variant). Result: **zero priority 1 or 2 findings.** Two priority-3
findings only: `ZBP_FS_DYNGWREGTP` — two SLIN "strings without text elements are not translated"
warnings on the two literal validation-reason strings (`'target kind must be FUNC, TABL, QURY or
SUBM'`, `'target name is required'`) passed as `v2` to `new_message`; `ZFS_C_DYNGWREGTP` (BDEF) —
one SLIN warning recommending the `transactional_query` provider contract for the projection
entity. Neither is priority 1/2; neither blocks this task per its own acceptance bar. Not fixed
in this pass (both are cosmetic/advisory), left as a note for a later polish pass if the human wants
it.

### Fix round 1 — 2026-09-12: delete pre-image was a real defect, not a documented limitation

Review found two things. First, a real defect: `save_modified`'s delete loop always called
`lcl_dyngwreg_buffer=>get_before( )`, but nothing ever populated that buffer for a delete —
`validatetarget`'s BDEF trigger was `{ create; update; }` only — so a deleted row's
`ZFS_T_DYN_REGH` entry came back with `target_kind`/`target_name`/`before_json` all blank, not just
`before_json`. Spec §5.2 denormalises `target_kind`/`target_name` onto the history table for exactly
one reason — "so a deleted row is still identifiable" — which this build did not deliver. Framing it
as a "documented limitation" in the original report understated it: the capture point had not
actually been tried, only assumed unavailable by analogy with `CHECK_BEFORE_SAVE` (a different,
already-confirmed-rejected method). Second, purely a documentation gap (no code defect): the
self-protection rule's normalisation was implemented correctly but undocumented — see below.

**Fix — a second, dedicated validation, not a widened trigger on `validatetarget` itself.** The
review's own suggestion was to add `delete` to `validatetarget`'s existing trigger clause and guard
its kind/name/self-protection checks so they never run for a delete. That was considered and
rejected in favour of a safer alternative: a **second** validation, so the two concerns (checking
create/update, capturing any pre-image) can never share a call and therefore can never interact.
The reason: RAP does not expose an explicit "which operation produced this key" flag on a
validation's `keys` import parameter, and relying on an inferred signal (e.g. whether a requested
field looks blank) to skip the checks for a merged batch of create+update+delete keys would have
been exactly the kind of unverified platform-behaviour assumption L-380's discipline warns against.
A validation that is unconditionally a no-op with respect to `failed-`/`reported-` cannot reject
anything, by construction — no inference needed, no risk of the exact "reject a delete because its
stale kind looks wrong" bug the review called out.

BDEF change (`ZFS_R_DynGwRegTP`, `mcp-abap-abap-adt-api`, existing object, routing rule 6) — one new
line, nothing else touched:

```abap
validation validateTarget on save { create; update; field TargetKind, TargetName, Operation; }
validation captureDeletePreImage on save { delete; }
```

This activated clean on the first attempt — the compiler did **not** reject `delete` in a
validation trigger clause (so no new ledger entry: nothing platform-level was found to be wrong,
only something this build hadn't tried).

Class change (`ZBP_FS_DYNGWREGTP`, `includes/implementations`, local class `lhc_dyngwreg`) — one
new method, declared and implemented, nothing else touched (Task 5's `get_global_authorizations`,
`get_instance_authorizations` and `validatetarget` are all untouched, byte-for-byte, from what Task
5 left):

```abap
METHODS capturedeletepreimage FOR VALIDATE ON SAVE
  IMPORTING keys FOR Registry~capturedeletepreimage.
```

```abap
METHOD capturedeletepreimage.

  " Pre-image capture ONLY - deliberately never touches failed-registry or
  " reported-registry, so this validation can never reject a delete.

  LOOP AT keys INTO DATA(ls_key).

    SELECT SINGLE * FROM zfs_t_dyn_reg
      WHERE reg_uuid = @ls_key-RegUuid
      INTO @DATA(ls_existing).
    IF sy-subrc = 0.
      lcl_dyngwreg_buffer=>set_before(
        iv_reg_uuid    = ls_key-RegUuid
        iv_target_kind = ls_existing-target_kind
        iv_target_name = ls_existing-target_name
        iv_before_json = /ui2/cl_json=>serialize( data = ls_existing ) ).
    ENDIF.

  ENDLOOP.

ENDMETHOD.
```

`save_modified`'s delete loop (unchanged from the original build) already called
`lcl_dyngwreg_buffer=>get_before( )` for `target_kind`/`target_name`/`before_json` — it needed no
edit; it was only ever missing a populated buffer to read from. With `captureDeletePreImage` now
populating that buffer before persistence, a deleted row's `ZFS_T_DYN_REGH` entry carries the real
pre-delete `target_kind`, `target_name` and `before_json`, matching spec §5.2.

**Activation and ATC after the fix.** BDEF activated first (`Activation successful.`, no warnings),
then the class (`Activation successful.`, no warnings). `inactiveObjects` re-checked afterward:
none of the five Task 4 objects present, only the same pre-existing unrelated entries already noted
above. Re-ran ATC on all five objects: **zero priority 1/2 findings**, same two priority-3 findings
as before (untranslated literals, `transactional_query` recommendation) — unchanged, both still
explicitly deferred, not touched.

**Still deferred to Task 18, unchanged:** the fix is believed correct (built against the compiler's
own feedback, same discipline as the original build) but, like the rest of this BO, has never been
exercised — `runQuery` still cannot execute EML (L-384) and no other sanctioned route exists at
BO-build time. The controller is adding a third Task 18 assertion covering the delete history row
specifically.

### Self-protection rule — documented (no code change; Finding 2 of fix round 1)

`validateTarget`'s self-protection check (message **039**) is a **compiled, non-configurable rule**
— there is no flag, table entry, or customizing switch that turns it off; the only way to change
which names it protects is to edit and reactivate the class. It runs on every create and update,
after the `TargetKind`/`TargetName` checks, and before a row can ever be persisted:

```abap
DATA(lv_target_norm) = shift_left( val = to_upper( ls_registry-TargetName ) ).

IF     lv_target_norm CP 'ZFS_T_DYN_*'
    OR lv_target_norm CP 'ZFS_RFC_DYN_*'
    OR lv_target_norm CP 'ZFS_T_SLC_GW*'.
```

`TargetName` is **upper-cased then left-shifted** (strips leading blanks) before the comparison, so
the rule cannot be bypassed by case (`zfs_t_dyn_reg` is caught the same as `ZFS_T_DYN_REG`) or by
leading whitespace (`  ZFS_T_DYN_REG` is caught too). It matches three patterns, each a `CP`
wildcard against the normalised name:
- `ZFS_T_DYN_*` — the dynamic gateway's own registry/history/call/step tables.
- `ZFS_RFC_DYN_*` — reserved for any future RFC-facing object in the `DYN` area.
- `ZFS_T_SLC_GW*` — the v1 gateway's own table (`ZFS_T_SLC_DYNGW`), the exact privilege-escalation
  hole this rule closes (v1 lets its own table be registered as a writable target, so execute
  rights alone are enough to self-register any FM or report).

A match on any of the three refuses the row with message 039 (`ZFS_TRM_MSG`: "Target &1 belongs to
the gateway framework and cannot be registered") and nothing is written. This was already correctly
implemented in the original build; only the write-up was missing. No source change was made for
this finding.

## Task 4 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_R_DynGwRegTP` | CDS view entity (RAP root) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_C_DynGwRegTP` | CDS view entity (projection, `root`) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_R_DynGwRegTP` | Behavior definition (root, managed + additional save) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_C_DynGwRegTP` | Behavior definition (projection) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZBP_FS_DYNGWREGTP` | Behavior pool (CLAS/OC) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |

**Task 4 is complete for what could be built and activated, including fix round 1 (delete
pre-image fixed, self-protection rule documented); the behavioural (runtime) proof is deferred to
Task 18 by controller ruling, not performed here.**

## Task 5 — Registry access control (DCL)

**Prerequisite confirmed live before starting:** `ZFS_DYNGW` (SU21) — object class `ZFS`, fields
`ZDYNKIND` (DE `ZFS_DE_DYN_KIND`), `ZDYNTGT` (CHAR30), `ACTVT` (`ACTIV_AUTH`); permitted activities
`01`, `02`, `03`, `16`.

**NAMING:** `ZFS_R_DynGwRegTP` (DCLS/DL) -> the DCL name is fixed to the name of the CDS view
entity it protects (L-122) — not an independent naming-convention pattern. No naming-gate mismatch
possible for this object type; recorded here in place of a pattern-row match.

**Step 1 — create the DCL shell.** `abap_creation-get_object_type_details` (DCLS/DL) confirmed the
required fields (`packageName`, `name`, `description`, `protectedEntity`).
`abap_transport-get` (package `ZFS_DYN_GW`, DCLS/DL, isCreation true) listed `DS4K907263` among the
open transports for this package/owner — used as instructed, no new transport created.
`abap_creation-run_validation` passed, then `abap_creation-create_object` created
`ZFS_R_DynGwRegTP` empty in package `ZFS_DYN_GW`, transport `DS4K907263` — CTS filed it, like every
other object in this build, under task `DS4K907264` (confirmed via `transportInfo`, not assumed).

**Step 2 — set the DCL source** (routing: `mcp-abap-abap-adt-api`, since this is now an existing
object). Source set verbatim from the task-5 brief:

```abap
@EndUserText.label: 'Dynamic Gateway - Allow List access'
@MappingRole: true
define role ZFS_R_DynGwRegTP {
  grant select on ZFS_R_DynGwRegTP
    where ( TargetKind, TargetName ) = aspect pfcg_auth ( ZFS_DYNGW, ZDYNKIND, ZDYNTGT, ACTVT = '03' );
}
```

This replaces v1's unrestricted `grant select on ZFS_I_DynGateway;` — reading the allow-list now
requires display authority (`ACTVT = '03'`) scoped by `ZDYNKIND`/`ZDYNTGT`. Activated and read back
verbatim, byte-for-byte, against what was sent.

**Step 3 — first attempt at `get_instance_authorizations`, wrong, corrected live (L-389).** The
initial plan (matching the "if the BDEF shape requires it" discretion in the task instructions) was
that `get_global_authorizations` would **not** be needed: the live BDEF declared only
`authorization master ( instance )`, no `late numbering` clause appears anywhere in the BO, and
`RegUuid` is `field ( numbering : managed, readonly )` — read as early/managed numbering, i.e. the
UUID assigned before the authorization check runs, so the reasoning was that a single
`get_instance_authorizations` referencing `requested_authorizations-%create`/`%update`/`%delete`
would cover all three operations. Activating that version failed three times over, always the same
error, at every line touching `%create`:

```
The data object "REQUESTED_AUTHORIZATIONS" does not have a component called "%CREATE".
No component exists with the name "%CREATE".
```

This disproves the numbering-based reasoning: regardless of numbering strategy, `FOR INSTANCE
AUTHORIZATION`'s generated `requested_authorizations` type simply carries no `%create` component.
CREATE authorization on a managed RAP BO is **always** routed through `get_global_authorizations`,
which in turn requires the BDEF to declare `authorization master ( global, instance )`, not
`( instance )` alone. Written up as **L-389** in the ledger (this session's own finding, confirmed
live, not taken from documentation — the sources checked for this were thin/inconsistent on the
exact point). The brief's step 2 anticipated needing `get_global_authorizations`; the fix here
follows the brief after this session's own contrary hypothesis was disproved by the compiler.

**Step 4 — corrected BDEF and class.** BDEF `authorization master ( instance )` changed to
`authorization master ( global, instance )` (`mcp-abap-abap-adt-api`, existing object, routing
rule 6). Class `ZBP_FS_DYNGWREGTP` (`includes/implementations`, local class `lhc_dyngwreg`):
added `get_global_authorizations FOR GLOBAL AUTHORIZATION` for CREATE, narrowed
`get_instance_authorizations` to UPDATE/DELETE only. Final bodies, as activated:

```abap
METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
  IMPORTING REQUEST requested_authorizations FOR Registry RESULT result.

METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
  IMPORTING keys REQUEST requested_authorizations FOR Registry RESULT result.
```

```abap
METHOD get_global_authorizations.

  IF requested_authorizations-%create = if_abap_behv=>mk-on.

    AUTHORITY-CHECK OBJECT 'ZFS_DYNGW'
      ID 'ZDYNKIND' DUMMY
      ID 'ZDYNTGT'  DUMMY
      ID 'ACTVT'    FIELD '01'.

    IF sy-subrc = 0.
      result-%create = if_abap_behv=>auth-allowed.
    ELSE.
      result-%create = if_abap_behv=>auth-unauthorized.
      APPEND VALUE #( %msg    = new_message( id       = 'ZFS_TRM_MSG'
                                              number   = '040'
                                              severity = if_abap_behv_message=>severity-error
                                              v1       = 'register' )
                       %create = if_abap_behv=>mk-on )
        TO reported-registry.
    ENDIF.

  ENDIF.

ENDMETHOD.

METHOD get_instance_authorizations.

  DATA lv_update_auth TYPE abap_bool VALUE abap_false.
  DATA lv_delete_auth TYPE abap_bool VALUE abap_false.

  IF requested_authorizations-%update = if_abap_behv=>mk-on.
    AUTHORITY-CHECK OBJECT 'ZFS_DYNGW'
      ID 'ZDYNKIND' DUMMY
      ID 'ZDYNTGT'  DUMMY
      ID 'ACTVT'    FIELD '02'.
    lv_update_auth = xsdbool( sy-subrc = 0 ).
  ENDIF.

  IF requested_authorizations-%delete = if_abap_behv=>mk-on.
    AUTHORITY-CHECK OBJECT 'ZFS_DYNGW'
      ID 'ZDYNKIND' DUMMY
      ID 'ZDYNTGT'  DUMMY
      ID 'ACTVT'    FIELD '02'.
    lv_delete_auth = xsdbool( sy-subrc = 0 ).
  ENDIF.

  LOOP AT keys INTO DATA(ls_key).

    APPEND VALUE #( %tky    = ls_key-%tky
                     %update = COND #( WHEN requested_authorizations-%update = if_abap_behv=>mk-on
                                        THEN COND #( WHEN lv_update_auth = abap_true
                                                      THEN if_abap_behv=>auth-allowed
                                                      ELSE if_abap_behv=>auth-unauthorized ) )
                     %delete = COND #( WHEN requested_authorizations-%delete = if_abap_behv=>mk-on
                                        THEN COND #( WHEN lv_delete_auth = abap_true
                                                      THEN if_abap_behv=>auth-allowed
                                                      ELSE if_abap_behv=>auth-unauthorized ) ) )
      TO result.

    IF requested_authorizations-%update = if_abap_behv=>mk-on AND lv_update_auth = abap_false.
      APPEND VALUE #( %tky    = ls_key-%tky
                       %msg    = new_message( id       = 'ZFS_TRM_MSG'
                                               number   = '040'
                                               severity = if_abap_behv_message=>severity-error
                                               v1       = 'update' )
                       %update = if_abap_behv=>mk-on )
        TO reported-registry.
    ENDIF.

    IF requested_authorizations-%delete = if_abap_behv=>mk-on AND lv_delete_auth = abap_false.
      APPEND VALUE #( %tky    = ls_key-%tky
                       %msg    = new_message( id       = 'ZFS_TRM_MSG'
                                               number   = '040'
                                               severity = if_abap_behv_message=>severity-error
                                               v1       = 'delete' )
                       %delete = if_abap_behv=>mk-on )
        TO reported-registry.
    ENDIF.

  ENDLOOP.

ENDMETHOD.
```

`reported-registry` is the implicit changing parameter of both `FOR GLOBAL AUTHORIZATION` and
`FOR INSTANCE AUTHORIZATION` methods bound to alias `Registry` — same pattern already in use in
this class pool's `validatetarget` (`FOR VALIDATE ON SAVE`), which references
`failed-registry`/`reported-registry` without declaring them in its own `METHODS` statement.

`ZDYNKIND`/`ZDYNTGT` are deliberately `DUMMY` in all three `AUTHORITY-CHECK` statements — this is
the ADMIN gate (maintain the allow-list by any route), scoped only by `ACTVT`; the per-call
`ZDYNKIND`/`ZDYNTGT` scoping is task 14's EXECUTE gate on the same authorization object, checked
from `ZCL_FS_DYN_AUTH` inside the execution session, not here.

Message 040 text: "You are not authorized to &1 gateway targets" — `&1` = `'register'` / `'update'`
/ `'delete'` depending on which operation was refused.

**Step 5 — ATC, round 1: priority-2 findings, fixed (L-390).** First `abap_atc_run` (before the
`DUMMY` fix above was in place) returned three priority-2 SLIN findings, one per
`AUTHORITY-CHECK`: `"The authorization object ZFS_DYNGW requires 3 authorization fields."` — the
object has three fields (`ZDYNKIND`, `ZDYNTGT`, `ACTVT`) and each check supplied only `ACTVT`.
Added the explicit `ID 'ZDYNKIND' DUMMY ID 'ZDYNTGT' DUMMY` shown above (documents "not evaluated
here", does not touch the `ACTVT` check itself), re-activated, re-ran ATC: **zero priority 1 or 2
findings.** Written up as **L-390**.

**Step 6 — final ATC result.** Two priority-3 findings only, both pre-existing from Task 4's
`validatetarget` (untranslated literal strings passed as `v2` to `new_message`) — not part of this
task's diff, already noted as cosmetic/advisory in the Task 4 section above.

**What is proven vs deferred.** Proven: the DCL and both BDEF/class changes activate cleanly, the
DCL source reads back byte-for-byte as sent, ATC is clean at priority 1/2, and `inactiveObjects`
shows nothing of this task's left inactive. **Not proven, and explicitly deferred to Task 18 by the
same controller ruling as Task 4:** that an unauthorized caller is actually refused end to end. No
sanctioned route exists yet to drive an EML call or an OData request against this BO — the service
binding does not exist until Task 18, `runQuery` is `SELECT`-only and short-dumps on EML (L-384),
and building a throwaway test class to prove it would itself be an unrequested object under rule 3.

**Failed write, L-380 check.** The first `activateObjects` call for the DCL+class pair returned
`{"success":true,"messages":[],"inactive":[]}` yet a follow-up `objectStructure` read showed both
objects still `"version":"inactive"` — a silent no-op, not a reported failure, most likely because
the first call's `adtcore:parentUri` values were self-referencing rather than the package URI.
Per L-380 ("a write error is not proof the write failed") the inverse also held here: a reported
success is not proof the write succeeded — re-read before trusting it. Re-running
`activateObjects` with `adtcore:parentUri` set to `/sap/bc/adt/packages/zfs_dyn_gw` produced the
real (this time genuinely failing, with concrete compiler errors) attempt that led to the L-389
finding above. Nothing was written to either table by either attempt — activation failures and
no-ops do not touch table data, and this was confirmed by the subsequent successful activation
being the only source-changing event.

**Object touched outside Task 5's declared set — controller sign-off, 2026-09-12.** Task 5's
declared object set (per its brief) was the DCL `ZFS_R_DynGwRegTP` plus the class
`ZBP_FS_DYNGWREGTP`'s authorization methods. In the course of Step 3/4 above, the root BDEF
`ZFS_R_DynGwRegTP` — a Task 4 object, not listed as a Task 5 object — was also changed, from
`authorization master ( instance )` to `authorization master ( global, instance )`. This was not
paused and reported before being made. The controller reviewed it and **signed it off retroactively
rather than requiring a revert**: RAP routes `%create` exclusively through
`get_global_authorizations`, which in turn requires `global` in the BDEF's `authorization master`
clause — confirmed live by the compiler (`"The data object REQUESTED_AUTHORIZATIONS does not have a
component called %CREATE"` against the `( instance )`-only shape, L-389). Leaving the BDEF at
`( instance )` alone would have left the allow-list's create path completely ungated, which is
exactly the hole Task 5 exists to close — so the change was mechanically necessary, not
discretionary scope creep, even though it should have been paused and reported before being made.

## Task 5 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_R_DynGwRegTP` | Access control (DCLS/DL) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZFS_R_DynGwRegTP` | Behavior definition (change: `authorization master` clause) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZBP_FS_DYNGWREGTP` | Behavior pool (CLAS/OC, change: `get_global_authorizations` added, `get_instance_authorizations` narrowed) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |

**Task 5 is complete for what could be built and activated; the behavioural (runtime) proof is
deferred to Task 18 by controller ruling, not performed here.**

## Task 6 — exception class and handler interface

Scope per `.superpowers/sdd/2026-09-12-dyngw-v2/task-6-brief.md`, verbatim: exception class
`ZCX_FS_DYN_ERROR` (inherits `CX_STATIC_CHECK`, implements `if_t100_message`, carries `errcat`/
`msgno` as data so the error taxonomy is a log column, not re-derived from message text) and
interface `ZIF_FS_DYN_HANDLER` (the contract every handler in Tasks 8-12 implements — `kind`,
`needs_write`, `prepare( step, reg ) RETURNING outcome`, `execute( ) RETURNING outcome`, no
arguments on `execute` by design so the same instance serves both phases). No draft question
applies (neither object is a RAP BO).

**NAMING (recorded before any create call):**

```
NAMING: ZCX_FS_DYN_ERROR   -> matches "Exception class | ZCX_FS_<NAME>" (docs/naming-conventions.md line 118)
NAMING: ZIF_FS_DYN_HANDLER -> matches "Interface | ZIF_FS_<AREA>_<NAME>" AREA=DYN (docs/naming-conventions.md line 117)
```

Cross-checked against `docs/naming-conventions.md` lines 117-118 — both match.

**Build.** Routed per rule 6: `adt-mcp` `abap_creation-create_object` for both shells, then
`mcp-abap-abap-adt-api` `lock`/`setObjectSource`/`unLock` for source. First `create_object` attempt
for both objects failed with opaque errors (`"wrong input data for processing"` for the class,
`"Check of condition failed"` for the interface) using a guessed `objectContent` shape
(`name`/`description`/`package`). Called `abap_creation-get_object_type_details` for each
`objectType` as the tool itself instructs — real field is `packageName`, not `package`, plus
optional `superclass`/`interfaces` for `CLAS/OC`. Retried with the corrected shape
(`{"packageName":"ZFS_DYN_GW","name":...,"description":...,"superclass":"CX_STATIC_CHECK"}` for the
class; no `superclass` field for the interface) — both created successfully on the first corrected
attempt. Recorded as **L-388**.

**Source.** `ZIF_FS_DYN_HANDLER` sourced byte-for-byte from the brief (Step 3), including the named
`TYPES` aliases (`ty_kind`, `ty_operation`, `ty_json`) per L-373/L-375 — no inline `TYPE c LENGTH n`
in any method signature; `TYPE c LENGTH 30` and `TYPE c LENGTH 1` appear only inside the `ty_step`/
`ty_outcome` structure definitions, which the hazard note confirms is fine.

`ZCX_FS_DYN_ERROR`'s brief (Step 2) gives only the `CLASS ... DEFINITION ... ENDCLASS.` block — no
`IMPLEMENTATION` section — since a constructor cannot activate without one, an implementation was
authored here, not given verbatim (there was nothing to transcribe for it). Public section kept
exactly as specified (no rename, no reorder, no added/removed public field): `errcat`/`msgno` DATA
and the `constructor` signature are unchanged. To make `msgv1`-`msgv4` actually reach
`if_t100_message` text substitution (T100KEY-ATTR1..4 must name an *instance attribute* holding the
value, and the brief declares no public DATA for the four message variables), added four **private**
attributes (`mv_msgv1`..`mv_msgv4`, all `TYPE ty_msgv`) purely as implementation storage — this does
not touch the public contract the brief specifies. Constructor body: calls `super->constructor(
previous = previous )`, stores `errcat` and the four `mv_msgv*`, defaults `textid` to
`if_t100_message=>default_textid` when not supplied, sets `msgno` from the resolved `t100key`, and
points `t100key-attr1..4` at the four private attributes by name. This is the standard SAP
Class-Builder pattern for a message-class exception with dynamic message variables.

**Activation** — one `activateObjects` call for both objects: `{"messages":[],"success":true,
"inactive":[]}`. Zero messages on either object.

**`inactiveObjects` re-read afterward** — neither `ZCX_FS_DYN_ERROR` nor `ZIF_FS_DYN_HANDLER`
present; only the same pre-existing, unrelated items already flagged in Tasks 1-4 (open transport
headers, `ZBP_FS_DYNGWREGTP`'s stale includes/implementations entry, `ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`).

**Read-back check.** `getObjectSource` on both objects after activation: `ZIF_FS_DYN_HANDLER`'s
source matches the brief's Step 3 text exactly, field for field, type for type, including the three
named `TYPES` aliases. `ZCX_FS_DYN_ERROR`'s public section (`INTERFACES if_t100_message`, the two
`TYPES` aliases, `errcat`/`msgno` DATA, and the full `constructor` `IMPORTING` list with names,
order and types unchanged) matches the brief's Step 2 text exactly; the only additions are the
private storage attributes and the constructor `IMPLEMENTATION`, both disclosed above as authored
content since the brief provided none.

**ATC** — `mcp__adt-mcp__abap_atc_run` against both objects, default check variant: **zero findings
of any priority** (`"findings":[]` for both `ZCX_FS_DYN_ERROR` and `ZIF_FS_DYN_HANDLER`), not just
clean at priority 1/2.

**What IS proven:** both objects exist, are active, activated with zero messages, read back exactly
as specified for every brief-given element, and are ATC-clean at every priority. **What is NOT
verified at this stage (by design, per the task instruction):** no behavioural/runtime test exists
yet — `ZCX_FS_DYN_ERROR` is not raised anywhere and `ZIF_FS_DYN_HANDLER` has no implementing class
until Tasks 8-12. No EML/runtime check was attempted and none was planned.

**No failed write occurred on this task** — nothing to re-verify per L-380.

**Self-review commands actually run (see report file for full output):**
- `grep -n "L-388" lessons/lessons-ledger.md` (before writing, to find the true next-free number
  rather than trusting the brief's stated "L-388" — brief was correct, confirmed independently).
- `grep -n -i "Exception class\|Interface |" docs/naming-conventions.md` (confirmed both naming
  patterns before creating).
- Re-read of both `getObjectSource` results, diffed by eye against the brief's Step 2/Step 3 blocks
  field-by-field for name, order and type — no discrepancy found in any brief-specified element.

## Task 6 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCX_FS_DYN_ERROR` | Exception class (CLAS/OC) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |
| `ZIF_FS_DYN_HANDLER` | Interface (INTF/OI) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active |

**Task 6 is complete.** Both objects active and verified on `DS4_100_NIIF`; ATC clean at every
priority; no behavioural verification exists at this stage (none is possible or expected yet).

## Task 19 — retention report `ZFS_R_DYN_PURGE` (run out of plan order)

Scope per `.superpowers/sdd/2026-09-12-dyngw-v2/task-19-brief.md`. **Run deliberately out of plan
order**: Tasks 5, 6 and 7 (the engine) were mid-flight/blocked on each other at the time, and Task
19 (the retention/purge report) is the only task in the 21-task plan with no dependency on the
engine — chosen to fill the gap rather than sit idle.

Scope: report `ZFS_R_DYN_PURGE` (+ `_TOP`/`_F01` includes) over `ZFS_T_DYN_CALL`/`ZFS_T_DYN_STEP`
— the *only* sanctioned deletion route for the call log (spec S8.4: `/CallLog`, `/CallStep`,
`/RegistryHistory` expose no update/delete over OData at all). Selection: `p_days` (age, default
90) and `p_test` (default `X`). Hard floor: refuses outright to delete anything younger than the
**30-day idempotency window** (`request_id`'s replay protection stops working once its call row is
deleted, per spec S5.3/S8.1) — never clamps silently.

### Message 046 — created mid-task after a stop-and-ask

Checked all 45 confirmed messages in `docs/message-catalog/DS4_100_NIIF.md` against the
below-the-floor refusal this report needs. None fit: **037** ("Request exceeds the &1 budget: &2")
is scoped to `ZCL_FS_DYN_BUDGET`'s cost/rate-limit budget, not a day-count floor — reusing it would
make the catalog lie about what that number means; **029** ("Value &1 for selection field &2 is
invalid or exceeds its length") is a format/length failure, not a business-rule floor. The task
brief's own instruction ("if none fits, stop and tell me — do not invent one and do not use a
literal") reads as an override of the project's standing CLAUDE.md S3 procedure ("if nothing fits,
create the message... in the same turn"), so this was raised to the human rather than resolved
alone. Human confirmed: creating 046 *is* the standing procedure, not an exception to it, now that
the catalog has been checked properly — proceed.

Re-read the catalog's own "Next free number" line myself before writing (a numbering collision had
already happened once in this run from someone trusting a stated number instead of looking it up):
confirmed **046** free, highest existing row was 045, matching what the catalog itself said.

Added message **046** (`E`, `Retention age &1 days is below the minimum &2 days`) to `ZFS_TRM_MSG`
via `mcp-abap-abap-adt-api` (`lock` -> `getObjectSource` -> `setObjectSource` -> re-read to confirm
-> `activateObjects` -> `unLock`), on transport **`DS4K907194`** (task of `DS4K907018`) — confirmed
live via `transportInfo` before writing, not assumed to be `DS4K907263` (L-355: the message class
was already locked there from Task 1). Saved the pre-change 45-message XML to the scratchpad as a
restore reference before writing. Re-read after the write: all 46 messages present, 001-045
unchanged, 046 text exactly as agreed. Activation returned the same benign
`"Activation/Generation tool for ZFS_TRM_MSG not found"` warning seen on the Task 1 build, with
`success: true` and `inactive: []` — a known message-class quirk, not a real failure. (One
transient activation call before this returned `"Object type MSAD is not defined"`; an identical
retry succeeded — consistent with the session-recycle event described below, not a new issue.)
Catalog updated in the same turn: row for 046 added, "All 45" -> "All 46", "Next free number: 046"
-> "047" (grepped the file afterward for stray "45"/old "next free" text — none found).

### Objects created

**NAMING (recorded before the create calls):**

```
NAMING: ZFS_R_DYN_PURGE     -> matches "Program/report: ZFS_R_<AREA>_<NAME>" (AREA=DYN, NAME=PURGE)
NAMING: ZFS_R_DYN_PURGE_TOP -> matches the "_TOP" include suffix (declarations + selection screen)
NAMING: ZFS_R_DYN_PURGE_F01 -> matches the "_F01" include suffix (processing)
```

Created via `adt-mcp` `abap_creation-create_object` (routing rule 6: creates), package
`ZFS_DYN_GW`, transport `DS4K907263` (confirmed available via `abap_transport-get` before use, per
rule 8). Sourced via `mcp-abap-abap-adt-api` `lock`/`setObjectSource`/`unLock` (changes).

Structure: `REPORT` statement lives in `ZFS_R_DYN_PURGE_TOP` per house style
(`docs/alv-report-standards.md`), not in the main program. No ALV grid — this is a
retention/deletion utility report, not a data-display report, so Pattern A/B does not apply; the
TOP/F01 split and header-comment convention are followed regardless.

### An org spend-limit kill mid-task, and what it cost

The session was killed by the org's spend limit partway through the first activation attempt; the
coordinator resumed it after the limit reset and the ADT server reconnected. Consequence: the
`unLock` calls issued just before the kill all returned HTTP 400 (dead lock handles from the
recycled session, not a real unlock failure), and the very next `activateObjects` call also
returned a bare 400 with no findings — indistinguishable, in the moment, from another transport
problem. The coordinator had independently verified via the system that all three objects existed
with content already landed (matching what the pre-kill re-reads had shown) and were all inactive,
and gave the resume instruction: re-lock (fresh handles), do not force past a conflict, activate
all three in one call. Re-locking both includes succeeded cleanly (no orphaned lock), unlocking
then also succeeded cleanly, confirming the session was healthy again post-reconnect.

### First real activation — four genuine compiler errors, fixed as one defect class

With the session healthy, the first real `activateObjects` call (program + both includes, one
call, per L-209) returned four real errors, all in `ZFS_R_DYN_PURGE_F01`:

- Three instances of `"The client field \"CLIENT\" cannot be specified in the WHERE condition.
  Client handling is performed by the compiler."` — every `SELECT`/`DELETE` had an explicit
  `client = @sy-mandt` condition.
- One `"\"FOR\" is invalid here (due to grammar)."` on a `DELETE FROM zfs_t_dyn_step FOR ALL
  ENTRIES IN @gt_call_uuid ...` — `FOR ALL ENTRIES` is a `SELECT`-only Open SQL addition, not valid
  on `DELETE`.

Fixed the whole defect class, not just the four flagged lines: removed every `client = @sy-mandt`
condition from all four data-access forms (`select_eligible_calls`, `count_eligible_steps`,
`delete_steps_before_headers`, `delete_headers`), and replaced the buffer-table +
`FOR ALL ENTRIES` delete with a `WHERE call_uuid IN ( SELECT call_uuid FROM zfs_t_dyn_call WHERE
executed_at < @gv_cutoff )` subquery, which Open SQL does support on `DELETE`. This also removed
the now-unneeded `gt_call_uuid`/`ty_call_key` declarations from the TOP include. Recorded as
**L-391**. Re-locked both includes (fresh handles again — the previous pair had been consumed by
the write), rewrote both sources, re-read both back and confirmed the rewrite matched exactly
before unlocking.

**Activation, second attempt: one `activateObjects` call for the program and both includes —
`{"messages":[],"success":true,"inactive":[]}`.** Zero messages, nothing left inactive.
`inactiveObjects` re-read afterward: none of the three objects present; only the same
pre-existing, unrelated stragglers already flagged in Tasks 1/5/6 (`ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`, plus open transport headers) and one not
previously flagged — `ZCL_FS_DYN_RUNTIME` (CLAS/OC, on `DS4K907264`) — evidently mid-flight from
another task in this run; not touched here.

### Verification

**Empty-table check (1 `runQuery` call):** `SELECT 'CALL', COUNT(*) FROM zfs_t_dyn_call UNION ALL
SELECT 'STEP', COUNT(*) FROM zfs_t_dyn_step` -> `CALL=0, STEP=0`. Both tables are genuinely empty,
as the task brief said to expect.

**Live execution — could NOT be performed.** Attempted to run the report via `sap-gui` (`SA38`,
then `SE38`) to observe the `p_test = 'X'` counts-only path and the `p_days = 5` below-floor
refusal live; both transaction codes are **blocked by security policy** in this automation session
("Transaction SA38 is blocked by security policy" / same for `SE38`). No other route to execute an
ABAP report exists in this workspace's toolset (the dynamic gateway's own `SUBM` step kind would be
the obvious alternative, but the engine that would run it is Tasks 5-7, still mid-flight, and using
the very framework this report exists to police felt like the wrong workaround even if it had been
available). Before attempting this, confirmed the shared `sap-gui` session was on a **display-only**
SU21 screen (no unsaved edit state) so navigating away risked nothing; both transaction attempts
were rejected before any navigation occurred, so the session was left exactly as found, still on
`SU21`.

**What this leaves unproven:** the actual runtime behaviour of the `p_days < 30` refusal (that
`MESSAGE e046` at `AT SELECTION-SCREEN` genuinely returns the user to the selection screen with
zero deletions) and of the `p_test = 'X'` counts-only path, were not observed executing. What
stands in their place: (1) the program activated with zero compiler errors on the exact source
that contains this logic; (2) ATC found zero priority-1/2 findings; (3) a line-by-line reading of
`VALIDATE_SELECTION` shows `MESSAGE e...` is an unconditionally list-terminating statement at
`AT SELECTION-SCREEN` in standard ABAP (returns to the selection screen, `START-OF-SELECTION` never
runs) - this is bedrock ABAP behaviour, not something specific to this report that needed a live
run to confirm; (4) both tables being empty means a live delete run, even if it could have been
executed, would have proven nothing further than the test run already shows structurally (0 rows
either way).

**ATC:** `abap_atc_run` against `ZFS_R_DYN_PURGE` (which pulls in both includes) — 3 findings,
**all priority 3**, all "text symbol not defined" (`I01`, `001`, `I02` — the three text elements
deliberately left unmaintained, see below). **Zero priority-1 or priority-2 findings.**

### Text elements — for the human to maintain (not created here)

Per project rule 4 / L-229: never created or touched via ADT, `setObjectSource`, `INSERT
TEXTPOOL`, or `sap-gui` in this task (the `sap-gui` session is shared and was flagged as
off-limits for this even before the display-screen check above). Source references them normally
(`TEXT-001`, `TEXT-i01`, `TEXT-i02`, selection texts for `P_DAYS`/`P_TEST`) so they render as
placeholders until maintained.

| Program | Text ID / key | Proposed wording | Max length |
|---|---|---|---|
| `ZFS_R_DYN_PURGE` | Selection text `P_DAYS` | `Delete entries older than (days)` | 40 chars |
| `ZFS_R_DYN_PURGE` | Selection text `P_TEST` | `Test run, delete nothing` | 40 chars |
| `ZFS_R_DYN_PURGE` | Text symbol `001` (selection-screen block title) | `Retention Window` | ~70 chars (title bar) |
| `ZFS_R_DYN_PURGE` | Text symbol `I01` (info line, test run) | `TEST RUN - nothing deleted. Rows that would be purged:` | 132 chars |
| `ZFS_R_DYN_PURGE` | Text symbol `I02` (info line, live run) | `Retention purge complete:` | 132 chars |

### Self-review commands actually run

- `grep -n "Next free number" docs/message-catalog/DS4_100_NIIF.md` and
  `grep -n "^| 04[0-9]" docs/message-catalog/DS4_100_NIIF.md` — before writing message 046, to
  confirm the free number from the file itself rather than trusting a stated number (the run
  already had one numbering collision from that mistake).
- `grep -n "^## L-3[0-9][0-9]" lessons/lessons-ledger.md | tail -10` — confirmed the ledger's real
  last entry (L-390) before writing L-391, since the coordinator flagged that the stated "ends at
  L-387" in the original brief was already stale.
- `grep -n "All 4[0-9]\|Next free number" docs/message-catalog/DS4_100_NIIF.md` after editing the
  catalog — confirmed exactly one "All 46" and one "Next free number: 047" line, no stray old text
  left behind.
- Wrote both include sources to local scratch files and grepped them for the defect classes just
  fixed: `grep -n -i "client"` (0 hits — confirms every explicit client condition was removed, not
  just the three ATC-flagged ones), `grep -n "FOR ALL ENTRIES"` (0 hits), `grep -n "30\|
  gc_idempotency_floor_days"` (2 hits, declaration + the one use, values agree), `grep -n "044\|
  046"` (2 hits, one each, no stray third number), `grep -n "TEXT-"` (3 hits: `001`, `i01`, `i02`,
  matching the text-element table above exactly), `grep -n "gt_call_uuid\|ty_call_key"` (0 hits —
  confirms the now-unneeded declarations were fully removed, not left dangling).

### Task 19 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_R_DYN_PURGE` | Program (PROG/P) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active, 0 activation messages |
| `ZFS_R_DYN_PURGE_TOP` | Include (PROG/I) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active, 0 activation messages |
| `ZFS_R_DYN_PURGE_F01` | Include (PROG/I) | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active, 0 activation messages |
| `ZFS_TRM_MSG` message 046 | Message (change to existing class) | ZFS_K2_CC_VS | DS4K907194 (task of DS4K907018) | Active |

### Delivery checks

- [x] Pretty Printer — not run; source authored directly in the modern style, no reformat needed
- [x] Syntax check clean — activation returned zero messages on the second attempt
- [x] Activated, nothing left inactive (program + both includes, one `activateObjects` call)
- [x] ATC — 3 findings, all priority 3 (undefined text symbols, expected), zero priority 1/2
- [ ] ABAP Unit — n/a, no testable class-based logic (classic FORM-based utility report)
- [x] Text symbols and selection texts — listed above for the human; none created here
- [x] Message added to `docs/message-catalog/DS4_100_NIIF.md` in the same turn
- [x] Object list confirmed active (this table)
- [ ] Live execution (test-run and below-floor-refusal behaviour) — **not verified**, `SA38`/`SE38`
      blocked by security policy in this session; see Verification above for what stands in its
      place

**Task 19 is complete for what could be built, activated and statically verified.** No
authorization object, variant, or test data was created (rule 3/9) — exactly the three objects
asked for, plus the one message. Live behavioural verification of the two selection-screen paths
was not possible in this session; the next person with `SA38`/`SE38` access (or once a tcode for
this report is registered, itself a Task-19-adjacent follow-up not done here since it was not
asked for) should run `p_test = 'X'` and `p_days = 5` once to close that gap.

### Task 19 — review fix round 1: authorization gate added (Approved, one Important finding)

Review verdict: **Approved**, one Important finding. Three of the reviewer's open questions were
resolved by the coordinator directly (not defects): the transport citation was imprecise wording
(all three objects are correctly on task `DS4K907264` under `DS4K907263`); the `AT SELECTION-
SCREEN` wiring to `validate_selection` was confirmed present and correctly placed from a fresh
source pull (the original report should have quoted the event block alongside the FORM body); and
the two Open SQL fixes plus L-391 were checked and found genuinely correct, not merely plausible.

**The one finding:** the report had no authorization check at all. Spec S8.4 requires this report
to carry its own authorization — the plan's Task 19 section had omitted that requirement entirely
(the coordinator's defect, not this task's), so this is a plan-completeness fix, not a missed brief
item. Since this is the only sanctioned deletion route for the audit log, an ungated report means
anyone who can start the program can purge the trail.

**Fix.** Added to the top of `START-OF-SELECTION`, before `determine_cutoff` (not in
`AT SELECTION-SCREEN` — that event fires on every screen round-trip including F4 help, where a
refusal would be noisy and easy to mistake for a validation error):

```abap
START-OF-SELECTION.
  " ZFS_DYNGW has three fields (ZDYNKIND, ZDYNTGT, ACTVT); this ADMIN
  " gate scopes only by ACTVT, so ZDYNKIND/ZDYNTGT are named DUMMY
  " rather than omitted (L-390 - omitting a declared field is a
  " priority-2 ATC finding, not a harmless simplification).
  AUTHORITY-CHECK OBJECT 'ZFS_DYNGW' ID 'ACTVT'    FIELD '02'
                                     ID 'ZDYNKIND' DUMMY
                                     ID 'ZDYNTGT'  DUMMY.
  IF sy-subrc <> 0.
    MESSAGE e040(zfs_trm_msg) WITH 'purge'.
    RETURN.
  ENDIF.

  PERFORM determine_cutoff.
  PERFORM select_eligible_calls.
  PERFORM count_eligible_steps.
  PERFORM purge_and_report.
```

`ACTVT = '02'` (change) per the coordinator's explicit instruction, not `'06'` (delete): `TACTZ`
declares only `01`/`02`/`03`/`16` for `ZFS_DYNGW`, and naming an activity the object does not
declare would fail the check at runtime; `'02'` is the same ADMIN permission that already governs
the framework's own data. Message **040** ("You are not authorized to &1 gateway targets") reused
as-is — already in `ZFS_TRM_MSG`, no new message needed.

**First re-activation** (program alone content-changed; all three re-activated in one
`activateObjects` call per L-209) came back clean (`success: true`, zero messages, `inactive: []`),
but the follow-up ATC run surfaced a new **priority-2** finding: `"The authorization object
ZFS_DYNGW requires 3 authorization fields."` — the literal code the coordinator supplied named only
`ACTVT`, and this workspace already has **L-390** on file for exactly this shape (an
`AUTHORITY-CHECK` that omits a declared field is a priority-2 ATC finding, not a harmless
simplification) from Task 5's `ZBP_FS_DYNGWREGTP`. Applied the same fix L-390 documents: added
`ID 'ZDYNKIND' DUMMY ID 'ZDYNTGT' DUMMY` alongside the tested `ACTVT` field (shown in the code
block above). Re-read the object's source back after the write to confirm it landed exactly as
intended before unlocking (L-380), then re-activated (one call, program + both includes) —
`success: true`, zero messages, `inactive: []` — and re-ran ATC: back to exactly the same 3
priority-3 "text symbol not defined" findings as before the fix, zero priority 1/2.
`inactiveObjects` re-read after the final activation: none of the three `ZFS_R_DYN_PURGE*` objects
present (the earlier `ZCL_FS_DYN_RUNTIME` straggler is also gone now, presumably activated by
whichever concurrent task owns it — not touched here).

No new ledger entry was needed for the second (DUMMY-field) fix — it is L-390 applied correctly,
not a new finding; the ledger's real last entry was confirmed as **L-391** (mine, from the initial
build) before this fix round, so no numbering risk either way.

**What remains unproven, unchanged from the initial build:** live execution of the two
selection-screen paths (`p_test='X'` counts-only, `p_days=5` floor refusal) still could not be
observed running — `SA38`/`SE38` remain blocked by security policy in this session, and this
review-fix round did not attempt them again (told explicitly not to, and the constraint has not
changed). The authorization gate itself is likewise a source-level fix, not a demonstrated one: the
`AUTHORITY-CHECK` is correctly placed and correctly scoped per `TACTZ`, but no live run has proven
that a user without `ZFS_DYNGW` ACTVT=02 is actually refused.

**Not in scope for this fix round, deferred by the coordinator:** the "list heading" text-symbol
mapping (this task mapped it to the selection-screen block title `TEXT-001`; a list heading is
idiomatically the report output header instead — the coordinator will resolve this with the human
alongside the rest of the text-element list) and the report's files-changed section crediting the
message-catalog edit to this task when it in fact landed in the earlier interrupted commit
(`c669321`) — both left as-is here per instruction, not fixed.

#### Task 19 fix-round-1 delivery checks

- [x] Fix applied at the correct point (`START-OF-SELECTION`, before `determine_cutoff`)
- [x] Re-activated, program + both includes, one `activateObjects` call, zero messages
- [x] `inactiveObjects` re-read — none of the three objects present
- [x] ATC re-run — back to exactly the 3 expected priority-3 findings, zero priority 1/2
- [x] L-390 applied (DUMMY fields) after ATC caught the omission on the first re-activation
- [ ] Live authorization-refusal behaviour — still unprovable, `SA38`/`SE38` blocked (unchanged)

## Task 7 — `ZCL_FS_DYN_RUNTIME` runtime primitives (with `.INCLUDE` flattening)

Scope per `.superpowers/sdd/2026-09-12-dyngw-v2/task-7-brief.md`: one class holding every dynamic
statement in the framework (`select_rows`, `call_function`, `modify_table`, `submit_report`,
`components_of`, `commit_luw`, `rollback_luw`) so nothing outside it may contain a dynamic
`CALL FUNCTION`, dynamic Open SQL or `SUBMIT` — the clean-core boundary Tasks 8-12 inject by
constructor. Read `ZCX_FS_DYN_ERROR` (Task 6) and `ZIF_FS_DYN_HANDLER` (Task 6) source before
building, per the brief's own instruction, rather than guessing their signatures.

**NAMING (recorded before any create call):**

```
NAMING: ZCL_FS_DYN_RUNTIME -> matches "Class | ZCL_FS_<AREA>_<NAME>" AREA=DYN (docs/naming-conventions.md line 116)
```

**Mid-task interruption.** This build was killed mid-flight by the org spend limit right after the
class shell + empty test include were created (package `ZFS_DYN_GW`, task `DS4K907264`). On
resume, re-read (not assumed) both includes' live source before writing anything further — main
source was the bare `PUBLIC SECTION. / PROTECTED SECTION. / PRIVATE SECTION.` / empty
`IMPLEMENTATION` stub from `create_object`, and the test include held only the placeholder comment
`*"* use this source file for your ABAP unit test classes`. No prior real progress existed beyond
the two empty shells, confirmed by direct read rather than inferred from the earlier error
messages (L-380) — one `lock` call on the class succeeded cleanly (not refused), so no orphaned
lock from the earlier session was left behind either.

**Design decisions taken (not fully dictated by the brief):**
- `components_of` returns `ty_components TYPE abap_component_tab` directly (name + type ref) —
  this *is* the "named `TYPES` alias" for the RTTI component list, and gives `select_rows`
  real type refs to build a row type from later, not just names.
- `.INCLUDE` flattening implemented via `cl_abap_typedescr=>describe_by_name` (classic
  `EXCEPTIONS type_not_found = 1` form, not the functional-call form, since classic exceptions
  cannot be caught in an expression position) plus a private recursive `flatten_components`
  helper that descends into any component whose type is itself `TYPEKIND_STRUCT1`/`STRUCT2`
  (a genuine named substructure/AS-include). A plain unnamed DDIC `.INCLUDE` is already flattened
  by RTTI itself — never surfaces as a `.INCLUDE` pseudo-component the way raw `DD03L` reads it —
  so the recursion is defense for the named/AS-include case rather than the mechanism that fixes
  the common case; either way, no `.INCLUDE` pseudo-entry can reach the caller (L-316 fix).
- `submit_report` does **not** literally embed `CALL FUNCTION 'ZFS_RFC_DYN_SUBMIT' DESTINATION
  'NONE'` (that FM does not exist yet — it is Task 11's deliverable, confirmed via `searchObject`
  returning no hits and via `docs/superpowers/plans/2026-09-12-1032-dyngw-v2.md` naming it as Task 11's
  object). Instead `submit_report` builds its parameter list and delegates to this class's own
  `call_function( func_name = 'ZFS_RFC_DYN_SUBMIT' dest = 'NONE' ... )` — the function name is a
  **variable** value passed to `call_function`, so the dynamic `CALL FUNCTION` inside
  `call_function` resolves it at runtime rather than requiring the FM to exist at this class's
  activation time. This keeps the one dynamic-call statement inside `call_function` (per the
  brief's "one class, one place" intent) and lets `ZCL_FS_DYN_RUNTIME` activate today even though
  its Task-11 dependency does not exist yet.
- `call_function`'s exception table is assembled inside the class itself (`OTHERS = 9` always;
  `SYSTEM_FAILURE = 1` / `COMMUNICATION_FAILURE = 2` added only when `dest` is supplied), and its
  parameter table is built by `INSERT ... INTO TABLE` (hashed table, L-308) from a flat
  `ty_call_params` list the caller supplies — callers never touch `abap_func_parmbind_tab`
  directly.
- Message numbers reused from the existing `ZFS_TRM_MSG` catalog rather than adding new ones,
  since the catalog already covers every failure shape this class raises: **021** (table/view does
  not exist — errcat `TARGET`) for both `components_of`'s RTTI miss and `select_rows`'s
  `CREATE DATA`/struct-creation failure; **020** (dynamic call/SQL failed — errcat `TARGET`) for
  `select_rows`'s and `modify_table`'s dynamic-SQL exceptions and `call_function`'s
  `cx_sy_dyn_call_error`; **018** (operation not permitted — errcat `BUSINESS`) for
  `modify_table`'s unknown operation. No message was created; nothing added to the catalog file.
- `commit_luw` / `rollback_luw` are exactly `COMMIT WORK.` / `ROLLBACK WORK.` — not `AND WAIT`, not
  wrapped, not moved — per the brief's explicit instruction that ATC flagging them here is expected
  and correct.

**Hazard hit — brief's own test code was not directly usable.** The brief's literal method name
`components_unknown_source_raises` is 33 characters; ABAP method names cap at 30. Activation
rejected it (`"COMPONENTS_UNKNOWN_SOURCE_RAISES" is longer than the allowed 30 characters`).
Renamed to `components_unknown_src_raises` (29 chars) — same test body, same assertions, same
intent — and used the shortened name throughout. Also swapped the brief's placeholder
`components_of( 'ZFS_T_DYN_REG' )` (a table with no `.INCLUDE`, contradicting the test's own
comment) for `components_of( 'DD12L' )`, confirmed via
`SELECT tabname, fieldname, position FROM dd03l WHERE fieldname = '.INCLUDE'` to carry a genuine
`.INCLUDE` at position 19 — the brief itself suggested `DD12L` as "a convenient example" in this
exact situation.

**Build.** Routed per rule 6: `adt-mcp` `abap_creation-create_object` for the class shell (already
existed from the pre-interruption run, confirmed via `searchObject`), then
`mcp-abap-abap-adt-api` `lock` / `createTestInclude` / `setObjectSource` / `unLock` for both the
test include and the main source. Package `ZFS_DYN_GW`, transport `DS4K907263`
(`abap_transport-get` confirmed it open and usable before the create).

**TDD evidence.**

RED — command `mcp__mcp-abap-abap-adt-api__unitTestRun` on
`/sap/bc/adt/oo/classes/zcl_fs_dyn_runtime`, run against a class whose `components_of` was a
deliberate stub (`result = VALUE #( ).`, never raises) with every other method's real
implementation already in place and activating clean:

```
COMPONENTS_FLATTENS_INCLUDE:      Critical Assertion Error — "Non-Initial value expected"
                                   (assert_not_initial failed on the empty stub result)
COMPONENTS_UNKNOWN_SRC_RAISES:    Critical Assertion Error — "expected ZCX_FS_DYN_ERROR"
                                   (fail() reached because the stub never raises)
```

Both failures are for the right reason — the method genuinely does nothing yet, not a compile
error or a wrong-type assertion.

GREEN — same command, same class, after replacing the stub with the real
`cl_abap_typedescr=>describe_by_name` + `flatten_components` implementation and re-activating
clean:

```
COMPONENTS_FLATTENS_INCLUDE:      alerts: []  (pass)
COMPONENTS_UNKNOWN_SRC_RAISES:    alerts: []  (pass)
```

2 of 2 green, zero alerts.

**Activation.** Iterative — four real compile errors surfaced and were fixed in order, each
confirmed by re-running `activateObjects`:
1. `Type "ABAP_FUNC_PARMKIND" is unknown` — that global type name does not exist; changed
   `ty_call_param-kind` to a plain `TYPE c LENGTH 1` (fine inside a `TYPES: BEGIN OF` structure per
   L-373/L-375) and used literal `'E'` instead of a guessed named constant.
2. `The data object "COMP" does not have a component called "TYPE"` (twice, in
   `flatten_components`) — `LOOP AT struct->components` does not yield `abap_componentdescr` rows
   as expected; switched to `struct->get_components( )`, which does.
3. `"FUNC_NAME" is not type-compatible with formal parameter "MSGV1"` and four further "not
   type-compatible" errors (`OPERATION`, `TARGET_TABLE` x2, `SOURCE` x2) — `NEW zcx_fs_dyn_error(
   ... msgv1 = <elementary var> ...)` refuses an implicit conversion between differently-named
   `CHAR` types that a classic `MOVE`/`CALL METHOD` would allow silently; every `msgv1`/`msgv2`
   actual parameter across all four raise sites was wrapped in `CONV #( ... )` (the defect class,
   not just the one instance — grepped for every remaining bare `msgv1 =`/`msgv2 =` afterward, see
   self-review below).
4. `Result type of ... GET_TEXT cannot be converted into ... MSGV2` — same root cause as (3);
   `CONV #( ... )` around every `->get_text( )` call closed it.

Final `activateObjects` call: `{"messages":[],"success":true,"inactive":[]}` — zero messages.
`inactiveObjects` re-read afterward: `ZCL_FS_DYN_RUNTIME` **not present**; only the four
pre-existing, unrelated items already flagged in earlier tasks (`ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) plus open transport headers.

**ATC** — `mcp__adt-mcp__abap_atc_run` against `ZCL_FS_DYN_RUNTIME`, default check variant: four
findings, **all priority 3, zero priority 1/2**:
- SLIN 1700/1713 (x3) — untranslated string literals (`'Duplicate key'`, the `|...failed, subrc
  ...|` and `|Dynamic call of ...|` string templates). Not fixed — priority 3, cosmetic, and text
  elements are the one thing this project routes only through `sap-gui` SE38 (rule 5/L-229), not
  through inline string-literal rewriting.
- Critical Statements 0007 — **"Use of ROLLBACK WORK"**. Reported, not fixed, per the brief:
  `commit_luw`/`rollback_luw` are `COMMIT WORK`/`ROLLBACK WORK` by design, callable only from the
  execution session (Task 15), and this class is the one place in the framework built to run
  outside RAP where that statement belongs. No corresponding `COMMIT WORK` finding was raised in
  this same ATC run (only `ROLLBACK WORK` was flagged by this particular check), but both
  statements stay as written for the same reason.

**No failed write occurred on the real work in this pass** — every `setObjectSource` call in this
resumed session returned `{"status":"success","updated":true}` and was later confirmed by
`getObjectSource`/`activateObjects` read-back; nothing to re-verify per L-380 beyond the
pre-session state check described above (which *was* a re-read-before-acting, not a retry after a
failure).

### Self-review commands actually run

- `grep -n "^## L-3" lessons/lessons-ledger.md | tail -10` — before writing this section, confirmed
  the ledger's real last entry is **L-391** (not a stated/assumed number), so this task adds
  **L-392** without renumbering or overwriting anything.
- Re-read the live tail of this worklog file (`tail -60`) immediately before appending, per the
  brief's warning that other agents are editing it concurrently — found Task 19's content already
  appended past where Task 7 was expected to sit; appended this section after it rather than
  inserting out of order or clobbering it.
- Read the final `zcl_fs_dyn_runtime_red.abap` scratch file in full after all four rounds of fixes,
  specifically grepping by eye for every remaining bare `msgv1  = <ident>` / `msgv2  = <ident>` not
  wrapped in `CONV #( ... )` or already a string literal — none found; all four raise sites use
  `CONV #( ... )` consistently (the defect-class instruction: fix every occurrence, not just the
  one the compiler pointed at first).
- `mcp__mcp-abap-abap-adt-api__inactiveObjects` re-read after the final activation — confirmed
  `ZCL_FS_DYN_RUNTIME` is not among the inactive objects listed.

### Task 7 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC) | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_RUNTIME` test include (`LTC_RUNTIME`) | Test class include | ZFS_DYN_GW | DS4K907264 (task of DS4K907263) | Active, 2/2 tests passing |

### Delivery checks

- [x] TDD — RED captured (both tests failing for the right reason) before GREEN (both passing)
- [x] Activated, nothing left inactive
- [x] ATC — 4 findings, all priority 3; zero priority 1/2; the one `ROLLBACK WORK` finding reported
      per the brief, not fixed
- [x] Unit tests — 2/2 passing, zero alerts
- [x] No message created (existing catalog entries 018/020/021 cover every raise site)
- [x] No text elements touched (none of this class's strings are screen furniture)
- [x] Object list confirmed active (this table)
- [ ] Live behavioural verification of `select_rows`/`call_function`/`modify_table`/
      `submit_report` — **not attempted**, by design; these are integration-verified once Tasks
      8-12's handlers exist to exercise them, per the brief's own scope note that only the two pure
      methods are unit-testable here.

**Task 7 is complete.** `ZCL_FS_DYN_RUNTIME` is active, holds every dynamic statement in the
framework in one file, and its two pure methods are TDD-proven (real RED, then real GREEN). The
five genuinely dynamic methods compile and activate clean but have no runtime proof yet — that is
explicitly deferred to the handlers that inject this class in Tasks 8-12.

## Task 8 — `ZCL_FS_DYN_HDL_QUERY` (dynamic SELECT handler)

**Scope:** `ZCL_FS_DYN_HDL_QUERY` (CLAS/OC), implementing `ZIF_FS_DYN_HANDLER` as the `QURY`
handler, constructor-injected with `ZCL_FS_DYN_RUNTIME` (Task 7) exactly as the plan specifies.

```
NAMING: ZCL_FS_DYN_HDL_QUERY -> matches "Class | ZCL_FS_<AREA>_<NAME>" AREA=DYN
        (docs/naming-conventions.md:116), gated before the create call.
```

**Real interface read before writing anything** (per the brief's own instruction, not the brief's
summary): `prepare( step TYPE ty_step, reg TYPE zfs_t_dyn_reg ) RETURNING ty_outcome` — no
`RAISING`; `prepare` never raises, it converts every validation failure into a `ty_outcome` with
`status = 'E'`. `execute( ) RETURNING ty_outcome`, no importing parameters at all — the plan's own
step/reg must already be stored on the instance by `prepare`, which is exactly the point of the
asymmetric signature.

**A real architectural constraint the brief could not have flagged:** `ZCL_FS_DYN_RUNTIME` (Task 7)
is `PUBLIC FINAL CREATE PUBLIC` with no interface. `CL_ABAP_TESTDOUBLE` cannot fake a `FINAL` class,
so a mock/stub built by subclassing or by the ABAP test-double framework is not available for this
dependency, and — per rule 3 — modifying Task 7's already-built class to add an interface it was
never asked to have was not done. Resolved with ABAP's native **TEST-SEAM / TEST-INJECTION**
mechanism instead: the one call to `mo_runtime->components_of( )` (used to validate fields/operators/
literals) sits inside `TEST-SEAM components_lookup. ... END-TEST-SEAM.` in a private
`resolve_components( )` method, and `mo_runtime->select_rows( )` (used only by `execute`, unexercised
by this task's five tests but wired for Tasks 9-12 to see the pattern) sits inside
`TEST-SEAM select_rows_call. ... END-TEST-SEAM.` in `execute`. No new SAP object, no change to
`ZCL_FS_DYN_RUNTIME`. **This is the pattern the next four handler tasks should copy** for the same
FINAL-class constraint, rather than each re-discovering it. Recorded as **L-393** (see ledger).

**Primary-key detection for the paging guard (msg 042)** does not go through the injected/fakeable
runtime at all — `components_of` returns only `name`/`type`, no key flag, so `check_paging_order`
calls `cl_abap_typedescr=>describe_by_name` + `CAST cl_abap_structdescr` +
`get_ddic_field_list( )` directly against the real DDIC (`KEYFLAG = 'X'`), the same class of call
Task 7's own `components_of` already makes, and the same class of call Task 7's own unit test made
directly against `DD12L` with no double. This is why every one of the five tests uses the real,
always-present table `T000` (confirmed live via `runQuery` against `DD03L`: `MANDT` CLNT length 3,
`KEYFLAG='X'`; `MTEXT` CHAR length 25, not key; `CCCATEGORY` CHAR length 1, not key) — it is DDIC
metadata, never a `SELECT` against business rows, so "the tests must not hit the database" is
satisfied for `select_rows` while `T000`'s own real key metadata drives `skip_without_key_order_fails`
deterministically.

### TDD evidence

**RED** — `mcp__mcp-abap-abap-adt-api__unitTestRun` against a version of the class where `prepare`
was a deliberate stub returning a fixed, deliberately-wrong outcome (`status='E' errcat='TARGET'
msgno='000'`) regardless of input, so every one of the five tests — including the happy-path one —
would fail for a real reason rather than the happy path accidentally passing against a
do-nothing stub:

```json
{"testmethods":[
 {"adtcore:name":"BAD_OPERATOR_IS_CLIENT_ERROR","alerts":[{"details":["Different values\n\tExpected [024] Actual [000]"]}]},
 {"adtcore:name":"OVER_CEILING_IS_CLIENT_ERROR","alerts":[{"details":["Different values\n\tExpected [025] Actual [000]"]}]},
 {"adtcore:name":"SKIP_WITHOUT_KEY_ORDER_FAILS","alerts":[{"details":["Different values\n\tExpected [042] Actual [000]"]}]},
 {"adtcore:name":"UNKNOWN_FIELD_IS_CLIENT_ERROR","alerts":[{"details":["Different values\n\tExpected [023] Actual [000]"]}]},
 {"adtcore:name":"VALID_REQUEST_PREPARES_OK","alerts":[{"details":["Different values\n\tExpected [S] Actual [E]"]}]}
]}
```

All five fail on an `ASSERT_EQUALS` value mismatch — never a dump, never a compile error — each
missing exactly the piece of validation logic not yet written. Genuine RED.

**GREEN** — same command, same class, after implementing the real `prepare( )` (component
resolution, field/operator/literal validation, `MaxRows` ceiling arithmetic, the paging-order
guard) and wiring `TEST-INJECTION components_lookup. result = VALUE #( ( name = 'MANDT' type =
cl_abap_elemdescr=>get_c( 3 ) ) ( name = 'MTEXT' type = cl_abap_elemdescr=>get_c( 25 ) )
( name = 'CCCATEGORY' type = cl_abap_elemdescr=>get_c( 1 ) ) ). END-TEST-INJECTION.` in the test
class:

```json
{"testmethods":[
 {"adtcore:name":"BAD_OPERATOR_IS_CLIENT_ERROR","alerts":[]},
 {"adtcore:name":"OVER_CEILING_IS_CLIENT_ERROR","alerts":[]},
 {"adtcore:name":"SKIP_WITHOUT_KEY_ORDER_FAILS","alerts":[]},
 {"adtcore:name":"UNKNOWN_FIELD_IS_CLIENT_ERROR","alerts":[]},
 {"adtcore:name":"VALID_REQUEST_PREPARES_OK","alerts":[]}
]}
```

5/5 passing, zero alerts.

**A real discovery mid-build, written up as L-393:** the first `TEST-INJECTION` attempt built the
fake component table in a local variable (`lt_fake`) inside the calling helper method
(`inject_fake_components`) and assigned `result = lt_fake` inside the injection block. Activation
failed with a real compiler error: `"Field \"LT_FAKE\" is unknown."` at the injection's own line —
proof that a `TEST-INJECTION` block compiles in the **seam's own method scope**
(`resolve_components`'s `RETURNING result`), not the scope of whatever test-class method physically
contains the `TEST-INJECTION` text. Fixed by building the fake `VALUE #( ... )` **inline** inside
the injection block itself, referencing only `result` and class-static calls
(`cl_abap_elemdescr=>get_c`) — nothing from the surrounding test method's local variables.

### The five rejections, as implemented

| Brief's requirement | Message | Where checked |
|---|---|---|
| Field absent from `components_of` | 023 | `resolve_fields`, `resolve_filter`, `resolve_order_by` — every field name from `FieldsJson`/`FilterJson`/`OrderByJson` is checked against the (faked-in-test, real-in-production) component list |
| Operator outside `EQ NE GT GE LT LE BT LIKE IN` | 024 | `resolve_filter` — explicit whitelist, the injection gate; not widened to make anything pass |
| Literal longer than, or wrong-typed for, its column | 020 | `validate_literal` — `output_length` bound from the component's real `CL_ABAP_ELEMDESCR`, plus a numeric-kind digits-only check. **Not exercised by a dedicated test** (the brief's five named tests don't include one); implemented because the brief's own must-reject list requires it — flagged under Concerns below |
| `MaxRows` above the registry ceiling (ceiling non-zero) | 025 | `resolve_max_rows` — ceiling wins, caller may only lower it, `0` ceiling = uncapped |
| `SkipRows > 0` whose `OrderByJson` doesn't end with the full primary key | 042 | `check_paging_order` — real DDIC key lookup (see above), tail-set comparison against the parsed `OrderByJson`'s last *k* entries |

`FieldsJson` omitted -> every component except `MANDT`/`CLIENT`, per the brief, implemented in
`resolve_fields`.

### The plan carried from `prepare` to `execute`

`prepare` stores the resolved plan on the instance: `mv_source` (target name), `mt_components`
(from `components_of`, reused so `execute` never re-resolves them), `mv_columns` (comma-joined
effective field list), `mv_where` (fully-built, quote-escaped dynamic `WHERE` string — `BETWEEN`
for `BT`, `IN (...)` for `IN` with the comma-split `Low`, `LIKE` for `LIKE`, `=`/`<>`/`>`/`>=`/`<`/
`<=` for the rest), `mv_order_by` (comma-joined, `DESCENDING` appended per field), `mv_max`,
`mv_skip`. `execute` calls `mo_runtime->select_rows` with exactly this stored plan and nothing else,
then serializes the returned dynamic table via `/ui2/cl_json=>serialize` into `RowsJson`. Neither
method takes the other's inputs directly — the asymmetric interface signature is honoured for
real, not just in the constructor.

### Activation

Two rounds. First round (main class body, no test include yet): `{"messages":[],"success":true,
"inactive":[]}` — clean on the first attempt; every RTTI call guessed from the brief's real-source
reading (`cl_abap_elemdescr=>get_c`, `CL_ABAP_STRUCTDESCR->get_ddic_field_list`,
`cl_abap_typedescr=>typekind_num`, `TEST-SEAM`/`END-TEST-SEAM` syntax) compiled correctly first try.
Second round (test include, after the `LT_FAKE` scope fix above): `{"messages":[],"success":true,
"inactive":[]}` — clean. `inactiveObjects` re-read after the final activation: `ZCL_FS_DYN_HDL_QUERY`
**not present** — only the same four pre-existing, unrelated items already flagged in Tasks 6/7
(`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE` on transport `DS4K907264`,
`EZFS_T_DEALID` lock object on `DS4K907280`) plus two bare open transport-request headers
(`DS4K907263`, `DS4K907279`) with no object attached — none of it ours.

### ATC

`mcp__adt-mcp__abap_atc_run` against `ZCL_FS_DYN_HDL_QUERY`, default check variant: **two findings,
both priority 3, zero priority 1/2** — SLIN 1700/1713, untranslated string literals in two `msgv2`
detail strings (`'value is not numeric'`, `|value exceeds length |`). Not fixed, same precedent as
Task 4's message 034 and Task 7's `'Duplicate key'`/dynamic-call strings: the message text itself is
correctly `ZFS_TRM_MSG` 020 (rule 4 satisfied), only the free-text *detail* substituted into `msgv2`
is an inline literal, and text elements route only through the `sap-gui` SE38 script (rule 5/L-229),
not through rewriting inline string literals.

### Failed writes

One `createTestInclude` call returned `"Resource CLASS_INCLUDE ZCL_FS_DYN_HDL_QUERY/TESTCLASSES
could not be successfully created."` Per L-380, re-read before assuming failure:
`getObjectSource` on the test-include URL immediately afterward returned the normal placeholder
skeleton (`*"* use this source file for your ABAP unit test classes`), proving the include had in
fact been created despite the error response — the subsequent `setObjectSource` against that same
URL succeeded normally and no orphan or duplicate was created.

### Self-review commands actually run

```
grep -n "^### L-39" lessons/lessons-ledger.md
```
-> confirmed the real last entry before writing was **L-392**; this task's new entry is **L-393**,
not renumbering or overwriting anything.

```
tail -80 "worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md"
```
-> re-read the live tail of this file immediately before appending, confirming Task 7's section was
the last one present and this section is appended after it, not inserted out of order.

```
grep -n "msgv1  *=\|msgv2  *=" (green-phase source, read back via getObjectSource)
```
-> every `msgv1`/`msgv2` actual parameter across all ten `NEW zcx_fs_dyn_error( ... )` raise sites
(confirmed by `grep -c "NEW zcx_fs_dyn_error(" <source>` = 10, then `grep -n "msgv1  *=\|msgv2  *="
<source>` = 15 hits) is wrapped in `CONV #( ... )`; none bare — the L-392 defect class, checked for
every occurrence, not just one.

```
mcp__mcp-abap-abap-adt-api__inactiveObjects
```
-> re-read after the final activation; `ZCL_FS_DYN_HDL_QUERY` absent, only pre-existing unrelated
items remain.

### Task 8 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_HDL_QUERY` | Class (CLAS/OC) | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_HDL_QUERY` test include (`LTC_QUERY`) | Test class include | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 5/5 tests passing |

### Delivery checks

- [x] TDD — RED captured (all five failing for the right reason, including the happy-path test)
      before GREEN (all five passing)
- [x] Activated, nothing left inactive
- [x] ATC — 2 findings, both priority 3; zero priority 1/2
- [x] Unit tests — 5/5 passing, zero alerts
- [x] No message created (020/023/024/025/042 all already exist in the catalog)
- [x] No text elements touched
- [x] Object list confirmed active (this table)
- [ ] Literal length/type validation (msg 020) is implemented per the brief's must-reject list but
      has **no dedicated unit test** — the brief's five named tests don't include one. Concern
      carried below rather than silently left uncovered.

**Task 8 is complete.** `ZCL_FS_DYN_HDL_QUERY` is active, implements `ZIF_FS_DYN_HANDLER` as the
`QURY` handler, is TDD-proven for all five required rejections/acceptance (real RED, then real
GREEN), and establishes the `TEST-SEAM`/`TEST-INJECTION` pattern Tasks 9-12 need for the same
FINAL-class runtime dependency.

## Task 8 follow-on — extract `ZIF_FS_DYN_RUNTIME` (human decision)

The human reviewed the `TEST-SEAM`/`TEST-INJECTION` finding above (L-393) and decided the project
should extract an interface for `ZCL_FS_DYN_RUNTIME` rather than have every one of Tasks 8-12 carry
seam scaffolding in production code. This is follow-on work on the same Task 8 report, not a new
numbered task.

```
NAMING: ZIF_FS_DYN_RUNTIME -> matches "Interface | ZIF_FS_<AREA>_<NAME>" AREA=DYN
        (docs/naming-conventions.md:117), gated before the create call.
```

### Build

1. `ZIF_FS_DYN_RUNTIME` (INTF/OI) created via `adt-mcp` (rule 6: creates), sourced via
   `mcp-abap-abap-adt-api` `lock`/`setObjectSource`/`unLock`. Every method signature and every named
   `TYPES` (`ty_components`, `ty_where`, `ty_orderby`, `ty_columns`, `ty_operation`, `ty_variant`,
   `ty_call_result`, `ty_call_param`, `ty_call_params`) copied from a fresh `getObjectSource` read of
   the live `ZCL_FS_DYN_RUNTIME` taken at the start of this follow-on, not from the plan or from
   memory of the earlier read — confirmed identical to the copy already quoted in the Task 7 section
   above.
2. `ZCL_FS_DYN_RUNTIME` changed via `mcp-abap-abap-adt-api` (rule 6: changes route here): added
   `INTERFACES zif_fs_dyn_runtime.`, `ALIASES` for all nine types and all seven methods, renamed
   every `METHOD <name>.` header to `METHOD zif_fs_dyn_runtime~<name>.`, removed the now-redundant
   `TYPES`/`METHODS` declarations that moved to the interface. Method **bodies** are byte-for-byte
   unchanged — only the header line and the public-section declarations changed. Class stays
   `FINAL`.
3. `ZCL_FS_DYN_HDL_QUERY` reworked: constructor `IMPORTING runtime TYPE REF TO zif_fs_dyn_runtime`
   (was `zcl_fs_dyn_runtime`); `mo_runtime` and all four `zcl_fs_dyn_runtime=>ty_*` type references
   in the private section repointed at `zif_fs_dyn_runtime=>ty_*`. Both `TEST-SEAM`/`END-TEST-SEAM`
   blocks (`components_lookup` in `resolve_components`, `select_rows_call` in `execute`) deleted —
   `resolve_components` is now a single plain statement, `execute`'s `select_rows` call is a plain
   call inside its existing `TRY`. **No seam remains in production code** — confirmed by the grep
   below.
4. Test include reworked: the `TEST-INJECTION`-wiring `inject_fake_components` helper is gone. A
   local class `ltd_fake_runtime DEFINITION FINAL` implementing `zif_fs_dyn_runtime` directly now
   supplies `components_of` (same fixed `MANDT`/`MTEXT`/`CCCATEGORY` list, same real lengths 3/25/1
   via `cl_abap_elemdescr=>get_c`) and `select_rows` (two fixed string rows, unexercised by these
   five tests but complete for a future `execute` test); `call_function`/`modify_table`/
   `submit_report`/`commit_luw`/`rollback_luw` are trivial stubs, never called by this handler.
   `setup` now does `mo_cut = NEW zcl_fs_dyn_hdl_query( NEW ltd_fake_runtime( ) )` — plain
   constructor injection, no seam mechanics. **This is a refactor of tests that already went through
   real RED/GREEN in the base Task 8 build, not new TDD — not re-staged, per the coordinator's
   instruction.** All five test bodies (assertions) are otherwise unchanged from the base build.

### Activation

One `activateObjects` call for all three objects (`ZIF_FS_DYN_RUNTIME`, `ZCL_FS_DYN_RUNTIME`,
`ZCL_FS_DYN_HDL_QUERY`): `{"messages":[],"success":true,"inactive":[]}` — zero messages, first
attempt. `inactiveObjects` re-read afterward: none of the three present — only the same four
pre-existing unrelated items already flagged in Tasks 6-8 (`ZFS_C_SLCDTTKFEETP`,
`ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) plus the same two bare transport headers.

### Regression proof — existing callers kept working unchanged

`mcp__mcp-abap-abap-adt-api__unitTestRun` against **both** classes after the rework:
- `ZCL_FS_DYN_HDL_QUERY` (`LTC_QUERY`): 5/5 passing, zero alerts — same five tests, now injecting
  `ltd_fake_runtime` through the interface-typed constructor instead of a `TEST-SEAM`.
- `ZCL_FS_DYN_RUNTIME` (`LTC_RUNTIME`, Task 7's own test, **not touched by this follow-on**): 2/2
  passing, zero alerts — proof that `cut->components_of(...)` and the class's internal
  `describe_by_name`/`get_components`/dynamic-`SELECT` bodies all still resolve correctly through
  the new `ALIASES`, with a variable still typed `REF TO zcl_fs_dyn_runtime`, exactly as the
  coordinator's "existing callers keep working unchanged" requirement demanded.

### ATC

`mcp__adt-mcp__abap_atc_run` against all three objects, default check variant:

| Object | Priority 1/2 | Priority 3 |
|---|---|---|
| `ZIF_FS_DYN_RUNTIME` | 0 | 0 |
| `ZCL_FS_DYN_RUNTIME` | 0 | 4 (same SLIN untranslated-literal x3 + `ROLLBACK WORK` findings already accepted in Task 7 — unchanged, since the method bodies did not change) |
| `ZCL_FS_DYN_HDL_QUERY` | 0 | 2 (same two SLIN untranslated-literal findings already accepted in Task 8) |

Zero priority 1/2 across all three objects.

### Self-review commands actually run

```
grep -n "^### L-39" lessons/lessons-ledger.md
```
-> confirmed the real last entry before writing was `L-393` (line 4790); this follow-on's new entry
is `L-394`, not renumbering or overwriting anything, and L-393 itself was left untouched (its
finding stands as a true platform fact independent of this project's decision).

```
grep -n "TEST-SEAM\|TEST-INJECTION" (zcl_fs_dyn_hdl_query, both includes, read back via getObjectSource)
```
-> zero hits in the main source; the test include's only remaining occurrence is the word
"TEST-INJECTION" inside a code *comment* explaining why the old approach was replaced — no actual
`TEST-SEAM`/`TEST-INJECTION` statement survives anywhere. Confirms the coordinator's "if any seam
survives, the change has not achieved anything" requirement.

```
tail -10 "worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md"
```
-> re-read the live tail immediately before appending this follow-on section; no concurrent edit
landed between the base Task 8 section and this one.

```
mcp__mcp-abap-abap-adt-api__inactiveObjects
```
-> re-read after the joint activation of all three objects; none of the three present, only the
same pre-existing unrelated items.

### Task 8 follow-on object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZIF_FS_DYN_RUNTIME` | Interface (INTF/OI) | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages, ATC clean |
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC), changed | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, implements `ZIF_FS_DYN_RUNTIME`, stays `FINAL`, 2/2 existing tests still pass unchanged |
| `ZCL_FS_DYN_HDL_QUERY` | Class (CLAS/OC), changed | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, injects `ZIF_FS_DYN_RUNTIME`, no `TEST-SEAM` remains, 5/5 tests pass via a local fake |

### Delivery checks (follow-on)

- [x] Interface extracted with real, read-back-verified signatures — not redesigned, not retyped
      from memory
- [x] `ZCL_FS_DYN_RUNTIME` implements it, stays `FINAL`, existing callers (Task 7's own test)
      verified unchanged
- [x] `ZCL_FS_DYN_HDL_QUERY` injects the interface; both `TEST-SEAM` blocks removed and confirmed
      gone by grep
- [x] Five tests reworked to a local fake, all five still pass, still no database access — a
      refactor of already-RED/GREEN tests, not new TDD, and reported as such
- [x] `L-394` added; `L-393` left untouched and un-superseded
- [x] Activated together, nothing left inactive
- [x] ATC — zero priority 1/2 across all three objects

**Task 8 follow-on is complete.** `ZIF_FS_DYN_RUNTIME` exists and is implemented by
`ZCL_FS_DYN_RUNTIME` (still `FINAL`, every existing caller unchanged), `ZCL_FS_DYN_HDL_QUERY` now
depends on the interface with zero test-only scaffolding in production code, and Tasks 9-12 inherit
a plain constructor-injection contract with no seam mechanics to repeat.

## Task 9 — `ZCL_FS_DYN_HDL_FUNC` (dynamic FM / BAPI handler)

**Scope:** `ZCL_FS_DYN_HDL_FUNC` (CLAS/OC) + its test include, implementing `ZIF_FS_DYN_HANDLER` as
the `FUNC` handler, constructor-injected with `ZIF_FS_DYN_RUNTIME` exactly as the Task 8 follow-on
established. Acceptance list is spec §3.1.

```
NAMING: ZCL_FS_DYN_HDL_FUNC -> matches "Class | ZCL_FS_<AREA>_<NAME>"
        (docs/naming-conventions.md:116), AREA=DYN. Gated before the create call.
        Also pre-declared in the spec's own naming block (design §4, line 178) as
        `ZCL_FS_DYN_HDL_FUNC -> Class | ZCL_FS_<AREA>_<NAME>` — same row, no exception needed.
```

**System confirmed before any write:** `mcp__adt-mcp__abap_list_destinations` → `[DS4_100_NIIF]`
(the only destination); `mcp-abap-abap-adt-api` `healthcheck` → `healthy`. Package `ZFS_DYN_GW`,
transport `DS4K907263` (task `DS4K907264`). No `$TMP`.

**Messages confirmed against `docs/message-catalog/DS4_100_NIIF.md` before use** — none created:

| No | Text | Used for |
|---|---|---|
| 019 | Function module &1 does not exist | `TFDIR` miss |
| 020 | Dynamic call of &1 failed: &2 | generic param sent, `CHANGING` in RFC mode, non-zero `sy-subrc` |
| 041 | &1 returned a business error: &2 | `BAPIRET2` `RETURN` scan → `BUSINESS` |

### Task 9 — an orphan from the previous session, adopted not recreated

The controller re-dispatched Task 9 having verified "previous session's dispatch produced NOTHING"
two ways: `git log` (no task-9 commit) and `searchObject ZCL_FS_DYN_HDL_FUNC*` (only
`ZCL_FS_DYN_HDL_QUERY` came back). Both checks were honest; both were wrong about the system. The
very first `adt-mcp` `abap_creation-create_object` call answered
`Resource CLASS ZCL_FS_DYN_HDL_FUNC does already exist.`

`getObjectSource` then returned a **complete 467-line implementation** and a 193-line test include,
and `inactiveObjects` listed the class, all four includes, every method and the three
`CLAS/OSI|OSO|OSU` parts, all on task `DS4K907264`, all owned by `FS_DEV3`. The previous session
had built the whole handler and died before activating it. **`searchObject` reads the activation-fed
search index, so it cannot see a created-but-never-activated object** — recorded as **L-395**;
`inactiveObjects` is the only valid "is the slate clean?" check.

`deleteObject` is denied project-wide, so the orphan could not be removed. It was **adopted**: same
name, same package, same transport — exactly what Task 9 wanted — and its source overwritten via
`setObjectSource`, which is a *change* and therefore the correct server by rule 6 anyway. Creating
under a second name to dodge the collision would have left a permanent non-conformant object.

The orphan's own design was **not** kept. It routed FUPARAREF/TFDIR lookup through a
`TEST-SEAM signature_lookup` (the L-393 pattern) and argued in its own comments that L-394 did not
apply to a metadata SELECT. That contradicts the controller's binding ruling for this task
(signature lookup must route through `ZIF_FS_DYN_RUNTIME` so a double can supply a synthetic
signature) and re-introduces into production code exactly the scaffolding L-394 decided to remove.
It also could not have activated as written: its `execute` called `mo_runtime->call_function`, which
raises `zcx_fs_dyn_error`, with no `TRY`/`CATCH`, while `ZIF_FS_DYN_HANDLER~execute` has no
`RAISING`. Rewritten from scratch against the ruling.

### Task 9 — `ZIF_FS_DYN_RUNTIME` extended with `SIGNATURE_OF`

Per the controller's ruling (b). Added, additively, alongside the existing types:

```abap
TYPES ty_fm_name TYPE rs38l_fnam.  TYPES ty_fm_kind     TYPE rs38l_kind.
TYPES ty_fm_mode TYPE tfdir-fmode. TYPES ty_fm_typename TYPE rs38l_typ.
TYPES: BEGIN OF ty_fm_param, name TYPE rs38l_par_, paramtype TYPE ty_fm_kind,
         structure TYPE ty_fm_typename, table_of TYPE abap_bool, END OF ty_fm_param.
TYPES ty_fm_params TYPE STANDARD TABLE OF ty_fm_param WITH EMPTY KEY.
TYPES: BEGIN OF ty_fm_signature, exists TYPE abap_bool, fmode TYPE ty_fm_mode,
         params TYPE ty_fm_params, END OF ty_fm_signature.
METHODS signature_of IMPORTING func_name TYPE ty_fm_name
                     RETURNING VALUE(result) TYPE ty_fm_signature.
```

Field types taken from a live `DD03L` read of `FUPARAREF` rather than guessed —
`PARAMETER` is `RS38L_PAR_` CHAR 30, `PARAMTYPE` is `RS38L_KIND` CHAR 1, **`STRUCTURE` is
`RS38L_TYP` CHAR 132** (not 30, which is the obvious wrong guess), `TABLE_OF` is `RS38L_TABO` CHAR 1.
One method rather than three (`exists` + `fmode` + `params` in one structure) so the handler needs a
single lookup and `resolve_mode` never issues a second `SELECT` against `TFDIR`.

`ZCL_FS_DYN_RUNTIME` implements it with the two metadata reads v1 used verbatim: `TFDIR` for
existence and `FMODE`, then `FUPARAREF` with `r3state = 'A' ORDER BY pposition`. No exception is
raised on a miss — `exists = abap_false` lets the caller decide, which is what makes 019 the
handler's decision rather than the runtime's.

---

## Task 6 + Task 8 — fix round 1 (2026-09-12), COMPLETE

Batched fix for three review findings on Tasks 6 and 8, plus a fourth folded in mid-run by the
controller after Task 9's review returned. System `DS4_100_NIIF` (`DS4`/`100`, confirmed:
`.mcp.json` points at `vhnlqds4ap01.sap.niififl.in:44300` client `100`, and `sap_get_session_info`
answered `DS4` / `100` / `FS_DEV3`). Package `ZFS_DYN_GW`, transport `DS4K907263` (task
`DS4K907264`); the message class is on `DS4K907194` as it has been since 037.

### Status: all five objects active. One pre-existing FUNC test still red, root-caused, escalated.

> **Note on what follows.** The next paragraph and the delivery checks were written while this
> task was hard-blocked on an ADT lock. The human released the lock manually from SM12 and the work
> completed; the blocked-state text is left in place as the record of what happened, and the
> **Resolution** section at the end of this entry is the current truth.

### Original block (resolved)

`ZCL_FS_DYN_HDL_FUNC` cannot be locked: `lock` answers
`User FS_DEV3 is currently editing ZCL_FS_DYN_HDL_FUNC` on every attempt, across a session
restart. That is an orphaned ADT edit lock left by a session that died mid-edit (see L-399 —
`transportInfo` shows only the CTS lock, `inactiveObjects` does not list the class, and SM12 is
refused by the auto-mode classifier). Because the interface change adds two methods that
`ZCL_FS_DYN_HDL_FUNC`'s test double must implement, activating anything now would leave that class
unactivatable. Deliberately left inactive as a set so the change can land atomically once the lock
is released.

### Findings and what was done

1. **`ZCX_FS_DYN_ERROR` defaulted to `SY`/`530`** (Task 6, Important). The constructor fell back to
   `if_t100_message=>default_textid`, so any raise without a `textid` emitted a message from class
   `SY` and reported `msgno = 530` — a direct breach of L-210. Fixed by giving the class the
   standard Class-Builder `CONSTANTS BEGIN OF zcx_fs_dyn_error ... END OF` block
   (`ZFS_TRM_MSG`/`047`, `attr1..4` = `MV_MSGV1..4`) and defaulting to it. `textid` stays
   `OPTIONAL` — the brief's verbatim signature is unchanged, and so is the supplied-`textid` path,
   which still assigns `attr1..4` after the `IF`/`ELSE` exactly as before. Ledger: **L-400**.

2. **`validate_literal` only type-checked NUMC** (Task 8, Important). `typekind_num` is NUMC alone,
   so INT1/2/4/8, packed (DEC/CURR/QUAN), FLTP, DATS and TIMS got nothing but the `output_length`
   bound; a non-numeric literal against an INT4 column passed `prepare( )`, was embedded in the
   dynamic `WHERE`, and only failed at `execute( )` inside `ZCL_FS_DYN_RUNTIME`'s SQL `CATCH` as
   `errcat = 'TARGET'` — wrong stage, wrong category. Replaced the single `IF` with a `CASE` on
   `type_kind` covering int/packed/float/date/time, each raising the same `020`/`CLIENT` with a
   `msgv2` detail in the existing style. The NUMC branch and its `'value is not numeric'` detail
   are byte-unchanged, and the length-bound branch above it is untouched. Three private helpers
   added (`unsigned_part`, `is_integer_literal`, `is_decimal_literal`); a sign is accepted leading
   (`+`/`-`) or trailing (`-`, ABAP's own external form).

3. **The `ZIF_FS_DYN_RUNTIME` seam leaked** (Task 8, Important). `get_primary_key` called
   `describe_by_name` + `CAST cl_abap_structdescr` + `get_ddic_field_list` directly, so the paging
   guard read live DDIC for `T000` instead of a double. Added `primary_key_of` to the interface
   with a doc comment in `signature_of`'s style, moved the body verbatim into
   `ZCL_FS_DYN_RUNTIME` (all three failure paths still `RETURN` an empty table — the fail-closed
   contract that makes `check_paging_order` reject with `042`), deleted `get_primary_key` from the
   handler, and pointed `check_paging_order` at `mo_runtime->primary_key_of( )`.

4. **`ZCL_FS_DYN_HDL_FUNC~descr_for` leaked the same way** (Task 9 review, ruled into this batch by
   the controller rather than opening a second round, since it is the same interface and the same
   two doubles). Added `describe_type` to `ZIF_FS_DYN_RUNTIME` and moved the body into
   `ZCL_FS_DYN_RUNTIME` verbatim — **both** the `SY-*` to `SYST-*` rewrite and the `CREATE DATA`
   probe preserved, because the probe is the only reason the handler's 020-on-generic-sent rule
   works (a generic type describes fine and fails only on instantiation, L-311). **Not yet applied
   to `ZCL_FS_DYN_HDL_FUNC` itself — that is the blocked half.**

### Test doubles

`ZCL_FS_DYN_HDL_QUERY`'s `ltd_fake_runtime` gained `primary_key_of` (synthetic key — `MANDT` for
`T000`, so `skip_without_key_order_fails` stops reading live DDIC), `describe_type` and
`signature_of` (both `CLEAR result` — never called by the QURY handler; `signature_of` was already
missing and would have failed re-activation regardless, since Task 9's follow-on added it to the
interface after this include was last activated), a `mv_select_called` flag, and a synthetic
two-column source (`KEYFLD` CHAR10 + `INTFLD` INT4) returned for any name other than `T000`,
because `T000` has no non-character column to test finding 2 against.

New sixth test `wrong_typed_literal_rejected` closes the 020 gap Task 8 disclosed: `'ABC'` filtered
`EQ` against `INTFLD`, asserting `status = 'E'`, `msgno = '020'`, `errcat = 'CLIENT'` **and**
`mv_select_called = abap_false` — i.e. rejected without touching data, which is the part of the
requirement a message assertion alone does not prove.

`ZCL_FS_DYN_HDL_FUNC`'s double still needs `primary_key_of` (trivial stub) and `describe_type`
(delegating to the real `cl_abap_typedescr` logic so `generic_param_sent_is_refused` keeps
exercising the real probe rather than a canned answer). **Blocked by the lock.**

### Message created

`ZFS_TRM_MSG` **047**, type **E**, `Dynamic gateway error: &1 &2 &3 &4`. Confirmed 047 was the next
free number in `docs/message-catalog/DS4_100_NIIF.md` (046 highest) and live on SAP (the read-back
XML ended at 046). Written via `mcp-abap-abap-adt-api` `lock`/`setObjectSource`(transport
`DS4K907194`)/`unLock` — the confirmed `MSAG` route, `adt-mcp` has no adapter. Catalog row and
provenance note added in the same turn.

Platform notes from this write, both new: `activateObjects` on a message class fails with
*"Object type MSAD is not defined"*, and it does not matter — the PUT writes `T100` directly.
Verified with `SELECT COUNT(*) FROM t100 WHERE arbgb = 'ZFS_TRM_MSG' AND sprsl = 'E'` giving **47**
(was 46) and a row read of 044-047; `ZFS_TRM_MSG` is absent from `inactiveObjects`. The PUT also
round-trips safely without the server-generated `atom:link` children and the
`lastchangedby`/`lastmodified` attributes — all 46 pre-existing messages survived unchanged.

### Discovered while working, not caused by this task

`ZCL_FS_DYN_HDL_FUNC` was already inactive on arrival, carrying a **debug probe** version of its
test include: 137 lines, one test method asserting a formatted string against the literal
`'PROBE'`, plus an `mv_wrote_ret` attribute the active double does not have. `unitTestRun` runs
that inactive version, so the FUNC suite reports **red** for reasons that have nothing to do with
this fix, while `getObjectSource` (active, 258 lines, four tests) shows the version Task 9
reported and the controller verified. The main class body is identical between the two versions
(485 lines both). Written up as **L-398**. The intended repair — write the active include content
back plus the two forced interface methods, and activate — is exactly what the lock prevents.

### Objects touched (all inactive, nothing activated)

| Object | Type | Change | State |
|---|---|---|---|
| `ZFS_TRM_MSG` 047 | MSAG (change) | message added | **Active / live in `T100`** |
| `ZCX_FS_DYN_ERROR` | CLAS/OC | T100 default constants | Inactive, source written |
| `ZIF_FS_DYN_RUNTIME` | INTF/OI | `primary_key_of` + `describe_type` | Inactive, source written |
| `ZCL_FS_DYN_RUNTIME` | CLAS/OC | both implementations + aliases | Inactive, source written |
| `ZCL_FS_DYN_HDL_QUERY` | CLAS/OC + test include | findings 2 and 3, sixth test | Inactive, source written |
| `ZCL_FS_DYN_HDL_FUNC` | CLAS/OC + test include | finding 4 + forced double methods | **BLOCKED — cannot lock** |

### Delivery checks

- [x] Naming gate — no new object named; `primary_key_of`/`describe_type` are methods, and 047 is a
      message number, neither of which the naming conventions govern.
- [x] Message 047 created, verified in `T100`, catalogued in the same turn.
- [x] Ledger L-398, L-399, L-400 written in the same turn.
- [ ] **Activation — blocked.** Nothing activated; the set is deliberately held together.
- [ ] **`ZCL_FS_DYN_HDL_QUERY` suite re-run — blocked** (cannot activate).
- [ ] **`ZCL_FS_DYN_HDL_FUNC` suite re-run — blocked** (cannot lock, and it was already red on an
      inactive probe version before this task started).
- [ ] **ATC — blocked** (ATC needs syntactically complete, activatable objects).

### What the human must do to unblock

Release the ADT editing lock on `ZCL_FS_DYN_HDL_FUNC` (SM12, user `FS_DEV3`, object `CLAS`
`ZCL_FS_DYN_HDL_FUNC` — or close it in Eclipse/VS Code ADT if it is genuinely open there). After
that the remaining work is: write the FUNC test double and `descr_for` removal, one
`activateObjects` across all five objects, both suites, ATC.

### Resolution (current truth)

The human released all locks manually from SM12. Work resumed and completed.

**Activation** — one `activateObjects` call across all five objects:

```
ZCX_FS_DYN_ERROR, ZIF_FS_DYN_RUNTIME, ZCL_FS_DYN_RUNTIME,
ZCL_FS_DYN_HDL_QUERY, ZCL_FS_DYN_HDL_FUNC
  -> {"messages":[],"success":true,"inactive":[]}
```

Zero messages, first attempt. One note for the next session: `activateObjects` refuses while **you**
hold the lock (`User FS_DEV3 is currently editing ...` — your own handle), so `unLock` comes before
`activateObjects`, not after. `inactiveObjects` afterwards lists none of the five; only the four
pre-existing unrelated items (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`,
`EZFS_T_DEALID`) and two bare transport headers remain.

A welcome side effect: `ZCL_FS_DYN_HDL_FUNC` is now **active** for the first time since Task 9, and
the abandoned `'PROBE'` debug version of its test include is gone.

**`ZCL_FS_DYN_HDL_QUERY` — 6/6 green**, including the new 020 test:

```
BAD_OPERATOR_IS_CLIENT_ERROR   alerts: []
OVER_CEILING_IS_CLIENT_ERROR   alerts: []
SKIP_WITHOUT_KEY_ORDER_FAILS   alerts: []
UNKNOWN_FIELD_IS_CLIENT_ERROR  alerts: []
VALID_REQUEST_PREPARES_OK      alerts: []
WRONG_TYPED_LITERAL_REJECTED   alerts: []
```

`SKIP_WITHOUT_KEY_ORDER_FAILS` now passes against the double's synthetic key rather than live DDIC,
which was the point of finding 3.

**`ZCL_FS_DYN_HDL_FUNC` — 3/4**, unchanged from the state I inherited:

```
CHANGING_IN_RFC_MODE_REFUSED   alerts: []
GENERIC_PARAM_SENT_IS_REFUSED  alerts: []
TABLES_PARAM_NOT_NAMED_UNBOUND alerts: []
BAPIRET2_ERROR_SETS_BUSINESS   failedAssertion: Expected [BUSINESS] Actual []
```

`GENERIC_PARAM_SENT_IS_REFUSED` passing is the proof that finding 4 was done without loss: that test
only passes if `describe_type` still performs the `SY-*` -> `SYST-*` rewrite and still probes with
`CREATE DATA`, because `CONVERSION_EXIT_ALPHA_INPUT`'s parameters are `CLIKE` and describe cleanly.

**ATC** — `abap_atc_run` over all five objects, destination `DS4_100_NIIF`, default variant,
worklist `5254001FE7A21FD1ABD2DE73029C2000`:

```
13 findings were found in 5 objects:
Errors: 0
Warnings: 0
Infos: 13
```

Priority 1/2 clean. The 13 infos are the same accepted SLIN "strings without text elements are not
translated" class already on record for Tasks 7, 8 and 9 (9 pre-existing, 4 new from the
`msgv2` detail strings this fix added to `validate_literal`). Unfixable inside the project's own
rules: the message itself is correctly `ZFS_TRM_MSG` 020 per rule 4, and SLIN's only accepted fix is
a text element, which rule 5 forbids creating by this route.

### Finding 5, discovered in flight and NOT fixed — needs a ruling

`BAPIRET2_ERROR_SETS_BUSINESS` has been red since Task 9. It is not caused by this fix, and I
root-caused it rather than leave it as folklore.

`ZIF_FS_DYN_RUNTIME=>ty_call_param-kind` is declared **`TYPE c LENGTH 1`**. The FUNC handler binds
parameters with `abap_func_exporting` / `abap_func_importing` / `abap_func_tables` /
`abap_func_changing`, and `abap_func_tables` does not fit in one character: it arrives in
`ty_call_param-kind` as **`'*'`**, ABAP's numeric-overflow-into-char result.

Consequences, in order of severity:

1. **Production.** `ZCL_FS_DYN_RUNTIME~call_function` inserts `param-kind` straight into the real
   `abap_func_parmbind_tab`. A `'*'` kind is not a valid parameter kind, so a real dynamic
   `CALL FUNCTION` with a TABLES parameter cannot bind correctly. Nothing calls this yet — the
   factory is Task 13 — so no live caller is affected today.
2. **The test.** The double's `LOOP AT io_params WHERE name = 'RETURN' AND kind = 'T'` matches
   nothing, `mt_return` is never written into the bound table, `scan_bapiret2` finds an empty table
   and leaves `errcat` blank. Hence `Expected [BUSINESS] Actual []`.

Evidence, obtained by changing the double's filter to `kind = abap_func_tables` and re-running:

```
Runtime Error   CONVT_NO_NUMBER
Short Text      "*" cannot be interpreted as a number
Program         ZCL_FS_DYN_HDL_FUNC===========CP
Terminated in   ZIF_FS_DYN_RUNTIME~CALL_FUNCTION, line 130 of include ...CCAU
                (the WHERE ... kind = abap_func_tables comparison)
```

So the "obvious" fix to the double converts a silent mismatch into a dump — strictly worse. **I
reverted the double to exactly the inherited `kind = 'T'`** and recorded the defect in a block
comment at the top of that include so the next person does not repeat the experiment.

The real fix is to widen `ty_call_param-kind` to `abap_func_parmbind-kind`. I did **not** take it,
for three reasons: it changes a production interface contract that is outside this round's scope;
it would also break `ZCL_FS_DYN_RUNTIME~submit_report`, which builds its params with the literal
`kind = 'E'`; and `submit_report` is already ruled to be Task 11's to widen (see the Task 7/11
conflict ruling in `progress.md`). This belongs in the same change as that one. Ledger **L-401**.

### Delivery checks (final)

- [x] Naming gate — no new object named.
- [x] Message 047 created, verified in `T100`, catalogued in the same turn.
- [x] Ledger L-398, L-399, L-400, L-401 written in the same turn.
- [x] Activation — all five objects, one call, zero messages.
- [x] `ZCL_FS_DYN_HDL_QUERY` suite — **6/6 green**.
- [~] `ZCL_FS_DYN_HDL_FUNC` suite — **3/4**, the one failure pre-existing, root-caused, escalated as
      finding 5. No regression from this fix; the suite is in exactly the state it was handed over
      in, minus the abandoned probe.
- [x] ATC on all five changed objects — 0 errors, 0 warnings, 13 infos (accepted class).

---

## Task 9 — fix round 2 (2026-09-12), COMPLETE

**Scope:** one Critical defect escalated out of fix round 1 as L-401 (finding A), two Task 9 review
findings (B: silent drop in `build_plan`; C: this master worklog not updated in the same turn), and
the red `BAPIRET2_ERROR_SETS_BUSINESS` test (finding D). **No object created** — this round changes
four existing objects and creates nothing.

**System confirmed before any write:** `.mcp.json` -> `https://vhnlqds4ap01.sap.niififl.in:44300`,
`SAP_CLIENT` `100`, user `FS_DEV3`; `adt-mcp` `abap_list_destinations` -> `[DS4_100_NIIF]`, the only
destination. Package `ZFS_DYN_GW`, transport `DS4K907263` (task `DS4K907264`). No `$TMP`. Fresh
locks taken on every object (the previous round's were force-released in SM12).

**Messages:** none created. Finding B reuses `ZFS_TRM_MSG` **020** (*Dynamic call of &1 failed: &2*),
already catalogued and already the message this exact branch's sibling raises. 047 remains the
highest.

### Finding A — what `ABAP_FUNC_PARMBIND-KIND` actually is

Established **first**, by reading the live type pool rather than trusting either the escalation or
the review note: `getObjectSource /sap/bc/adt/ddic/typegroups/abap/source/main` (359 lines,
definitions at 231-252) on `DS4`/`100`:

```abap
begin of abap_func_parmbind,
  value     type ref to data,
  tables_wa type ref to data,
  kind      type i,
  name      type abap_parmname,
end of abap_func_parmbind,
abap_func_parmbind_tab type sorted table of abap_func_parmbind
                       with unique key kind name,
constants:
  abap_func_exporting type abap_func_parmbind-kind value 10,
  abap_func_importing type abap_func_parmbind-kind value 20,
  abap_func_tables    type abap_func_parmbind-kind value 30,
  abap_func_changing  type abap_func_parmbind-kind value 40.
```

`TYPE i`, values **10/20/30/40**. The review's premise holds and the escalation under-stated it:
every one of the four values overflows `c LENGTH 1` to `'*'`, so `call_function` could not bind a
parameter of **any** kind, not only TABLES. Two extras the read settled: the parmbind table is
**SORTED** with unique key `KIND NAME` (a `bind_group` comment said hashed — corrected), and
`submit_report`'s `'E'` is not `ABAP_FUNC_EXPORTING` either. Ledger **L-402**.

Changes:

| Object | Change |
|---|---|
| `ZIF_FS_DYN_RUNTIME` | `ty_call_param-kind` widened `c LENGTH 1` -> `abap_func_parmbind-kind`, with a doc comment stating the four numeric values so it is not re-narrowed |
| `ZCL_FS_DYN_RUNTIME` | `submit_report`'s three `kind = 'E'` literals -> `abap_func_exporting`. Method bodies otherwise byte-unchanged (351 -> 355 lines, exactly the 4 added comment lines) |
| `ZCL_FS_DYN_HDL_FUNC` | `bind_group`'s hashed/sorted comment corrected; it already bound with the real constants, so no literal there |
| `ZCL_FS_DYN_HDL_FUNC` test include | double's `LOOP ... WHERE ... kind = 'T'` -> `kind = abap_func_tables`; `line_exists( mt_last_params[ kind = 'T' ] )` -> `kind = abap_func_tables`; the "KNOWN DEFECT" block comment replaced with a do-not-re-narrow note |

No other character-literal `kind` exists anywhere: the QURY handler's double never populates one,
and `ZFS_DYN_GW` holds no other consumer of `ty_call_param` (package `nodeContents` checked).

### Finding B — `build_plan` no longer drops a sent parameter

The `CATCH cx_sy_table_creation` arm's unconditional `CONTINUE` is now gated exactly like the
generic-type branch three lines above it:

```abap
CATCH cx_sy_table_creation INTO DATA(lx_tabcreate).
  IF lv_sent = abap_true OR ls_p-paramtype = 'E'.
    RAISE EXCEPTION NEW zcx_fs_dyn_error(
      errcat   = 'TARGET'
      msgv1    = CONV #( mv_fm )
      msgv2    = CONV #( |parameter { lv_name } cannot be typed as a table| )
      previous = lx_tabcreate
      textid   = VALUE #( msgid = c_msgid msgno = '020' ) ).
  ENDIF.
  CONTINUE.
```

**On the EXPORTING question the finding asked me to rule on: a silent skip is not right there, so it
raises.** The `CONTINUE` fires before the `CASE ls_p-paramtype` dispatch, so an unconditional one
also drops EXPORTING parameters — and the contract in that same `CASE` promises *"Always bound, so
every export comes back without the caller naming it."* An export is never `lv_sent`, so gating on
`lv_sent` alone would have left that half of the defect in place. A silent skip now survives only
for a parameter that is neither sent nor an export, which is the one case where dropping it changes
nothing the caller can observe.

### Finding C — this file

The Task 9 todo row (`12c-9`) and the Task 9 object list were both missing: commit `8474561` touched
only `lessons/lessons-ledger.md` and a new `worklog/.../2026-09-12-1737-dyngw-v2-task-9-func-handler.md`.
Both added in this turn. Note for the record: the named deliverable was *not* still an uncommitted
working-tree modification by the time this round ran — the following commit `fc77135` (fix round 1)
swept the file in, including a "## Task 9" narrative section. So the same-turn rule was genuinely
broken, but the artifact was not lost; what was actually absent was the todo row and the object list.

### Finding D — was the red test caused by Finding A?

**Yes, entirely.** No change was made to `BAPIRET2_ERROR_SETS_BUSINESS` — not one assertion, not the
setup. It went green on the widened type alone, because the double's `LOOP ... WHERE name = 'RETURN'
AND kind = abap_func_tables` now matches the row the handler actually bound, `mt_return` reaches the
caller's bound table, and `scan_bapiret2` finds the `E` row it was always supposed to find. The test
was correct all along; the type underneath it was not.

### Why four tests stayed green over a defect this size (L-403)

`TABLES_PARAM_NOT_NAMED_UNBOUND` asserted `line_exists( mt_last_params[ kind = abap_func_exporting ] )`
and passed while every row carried `'*'`: a table-expression key **converts** the operand to the
component's type, so `10` overflowed to `'*'` and matched vacuously. The double's `LOOP AT ... WHERE`
on the same field **compares**, converting the stored `'*'` to a number and dumping. One narrow type,
two opposite behaviours, in one include. Recorded as **L-403**.

### The new test

`TABLES_PARAM_NAMED_IS_BOUND` — the other half of `TABLES_PARAM_NOT_NAMED_UNBOUND`, covering the
sent-parameter path through the branch finding B fixed: `MONTH_NAMES_GET` with
`tablesjson = '{"MONTH_NAMES":[]}'` must arrive at the runtime with a row
`name = 'MONTH_NAMES' kind = abap_func_tables`, and `RETURN_CODE` must still be bound as
`abap_func_importing` on the same call (the EXPORTING half of the same defect). Honest limit, stated
rather than glossed: it exercises the branch and both of its contracts, but it does **not** force
`cx_sy_table_creation` itself — `lo_line` has already been probed as instantiable by `describe_type`,
and no input reachable through the double provokes that exception without inventing an object
(rule 3). The `CATCH` arm stays defensive and uncovered; the gate around it is now correct by
inspection and the surrounding contract is covered by test.

### Task 9 object list (backfilled) and fix round 2 object list

| Object | Type | Package | Transport | State |
|---|---|---|---|---|
| `ZCL_FS_DYN_HDL_FUNC` | CLAS/OC | `ZFS_DYN_GW` | `DS4K907263` | active, changed in this round |
| `ZCL_FS_DYN_HDL_FUNC` test include (`LTC_FUNC`, `LTD_FAKE_RUNTIME`) | CLAS/OC include | `ZFS_DYN_GW` | `DS4K907263` | active, changed in this round |
| `ZIF_FS_DYN_RUNTIME` | INTF/OI | `ZFS_DYN_GW` | `DS4K907263` | active, changed in this round |
| `ZCL_FS_DYN_RUNTIME` | CLAS/OC | `ZFS_DYN_GW` | `DS4K907263` | active, changed in this round |
| `ZCL_FS_DYN_HDL_QUERY` | CLAS/OC | `ZFS_DYN_GW` | `DS4K907263` | unchanged; re-activated and re-tested as a dependent of the widened interface |

### Verification — actual output, all post-activation (L-398)

`activateObjects`, one call, four objects (`ZIF_FS_DYN_RUNTIME`, `ZCL_FS_DYN_RUNTIME`,
`ZCL_FS_DYN_HDL_FUNC`, `ZCL_FS_DYN_HDL_QUERY`):

```
{"messages":[],"success":true,"inactive":[]}
```

`unitTestRun /sap/bc/adt/oo/classes/zcl_fs_dyn_hdl_func` — **5/5, zero alerts**:

```
BAPIRET2_ERROR_SETS_BUSINESS   alerts: []      <- was red, now green, test unchanged
CHANGING_IN_RFC_MODE_REFUSED   alerts: []
GENERIC_PARAM_SENT_IS_REFUSED  alerts: []
TABLES_PARAM_NAMED_IS_BOUND    alerts: []      <- new, finding B
TABLES_PARAM_NOT_NAMED_UNBOUND alerts: []
```

`unitTestRun /sap/bc/adt/oo/classes/zcl_fs_dyn_hdl_query` — **6/6, zero alerts**. `unitTestRun
/sap/bc/adt/oo/classes/zcl_fs_dyn_runtime` (`LTC_RUNTIME`, not touched by this round) — **2/2, zero
alerts**: proof the widened interface did not disturb the aliased callers.

ATC, `abap_atc_run` over all four changed objects, destination `DS4_100_NIIF`, default variant,
worklist `5254001FE7A21FD1ABD594ABF01C2000`:

```
14 findings were found in 4 objects:
Errors: 0
Warnings: 0
Infos: 14
```

Every finding is priority 3, verified individually via `atcWorklists`: `ZIF_FS_DYN_RUNTIME` 0,
`ZCL_FS_DYN_RUNTIME` 4 (3 untranslated literals + `ROLLBACK WORK`, all pre-existing),
`ZCL_FS_DYN_HDL_QUERY` 6 (all pre-existing), `ZCL_FS_DYN_HDL_FUNC` 4 — 3 pre-existing plus exactly
one new, SLIN 1713 on `| cannot be typed as a table|`, the finding B detail string. Same accepted
class as every other `msgv2` detail in this build: the message itself is correctly `ZFS_TRM_MSG` 020
per rule 4, and SLIN's only fix is a text element, which rule 5 forbids by this route.

`inactiveObjects` after the final activation — none of the four present; only the same pre-existing
unrelated items as at baseline (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`, `ZFS_I_SLCDFEETYPE`,
`EZFS_T_DEALID`) plus the two bare transport headers `DS4K907263` / `DS4K907279`.

### Delivery checks

- [x] Naming gate — no object created, nothing to gate.
- [x] No object created: no helper, no fake function module, no scratch object (rules 3 and 6).
- [x] Messages — none created; finding B reuses catalogued `ZFS_TRM_MSG` 020. 047 still highest.
- [x] Activation — four objects, **one** `activateObjects` call, zero messages.
- [x] `ZCL_FS_DYN_HDL_FUNC` suite — **5/5 green**, measured after activation.
- [x] `ZCL_FS_DYN_HDL_QUERY` suite — **6/6 green**, measured after activation.
- [x] `ZCL_FS_DYN_RUNTIME` suite — **2/2 green**, regression proof for the widened interface.
- [x] ATC on all four — 0 errors, 0 warnings, 14 priority-3 infos (accepted class, +1 from this fix).
- [x] `inactiveObjects` — nothing of ours left inactive.
- [x] Ledger **L-402**, **L-403** written in the same turn; **L-401** given its `Superseded by L-402`
      line rather than being edited or renumbered.
- [x] Worklog updated in the same turn as the work, including the Task 9 backfill finding C asked for.
- [ ] Live `CALL FUNCTION` through `call_function` with a real bound TABLES parameter — **still not
      proven**, and cannot be at this point in the build: the factory that wires a handler to the
      runtime is Task 13. Every test above runs against the double. What this round proves is that
      the *type* can now carry the kinds; what it does not prove is a real dispatch.

## Task 10 — `ZCL_FS_DYN_HDL_TABLE` (dynamic table CRUD handler)

**Scope:** `ZCL_FS_DYN_HDL_TABLE` (CLAS/OC) + its test include, implementing `ZIF_FS_DYN_HANDLER`
as the `TABL` handler. Package `ZFS_DYN_GW`, transport `DS4K907263` (task `DS4K907264`),
destination `DS4_100_NIIF` (`DS4` / client `100`).

### Naming gate (written before the create call)

```
NAMING: ZCL_FS_DYN_HDL_TABLE -> matches "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md
        line 116), AREA=DYN, NAME=HDL_TABLE — identical shape to the two sibling handlers already
        on the system, ZCL_FS_DYN_HDL_QUERY and ZCL_FS_DYN_HDL_FUNC. 20 chars, under the 30-char
        class-name cap.
```

The test include is not separately gated: `docs/naming-conventions.md` has no row for a class's
local test include, and its name is fixed by ADT (`.....TESTCLASSES` of the owning class).

### The write-row budget — how message 037 is enforced without `ZCL_FS_DYN_BUDGET`

The brief says "more rows than the write-row budget -> **037**". `ZCL_FS_DYN_BUDGET` is **Task 13
and does not exist on the system yet**. It was not created, and no placeholder for it was created
either — an unrequested object is exactly what project rule 3 forbids, and a stub would have to be
deleted later by a route (`deleteObject`) that is denied project-wide.

`ZFS_T_DYN_REG` was read before deciding
(`getObjectSource /sap/bc/adt/ddic/tables/zfs_t_dyn_reg/source/main`) rather than guessing a field
name. Its full column list is `client`, `reg_uuid`, `target_kind`, `target_name`, `operation`,
`is_active`, `allow_read`, `allow_write`, `call_mode`, **`max_rows : int4`**, `log_level`, `descr`
and the five audit fields. **`MAX_ROWS` is the only row-count field the registry carries**, so it
is the field used: `reg-max_rows > 0 AND lines( rows ) > reg-max_rows` raises 037. A `MAX_ROWS` of
0 means no ceiling was registered and nothing is enforced here.

This is the same field `ZCL_FS_DYN_HDL_QUERY` already uses as its **read** ceiling (message 025), so
one registry row now expresses one row ceiling that means "read at most this many" for a `QURY`
target and "write at most this many" for a `TABL` target. That is a deliberate reading of an
existing field, not a new one: no DDIC change was made. **Open for Task 13:** when
`ZCL_FS_DYN_BUDGET` lands it must either take this check over or be reconciled with it — a target
registered with `MAX_ROWS = 0` is currently unlimited on the write side.

### Widening `ZIF_FS_DYN_RUNTIME=>TY_CALL_RESULT` with `DBCNT` (a plan gap, resolved)

The brief's third test primes the double with `mo_fake_runtime->set_dbcnt( 1 )` — "1 of 2 rows
actually inserted" — and asserts `ResultCount = 1`. `TY_CALL_RESULT` carried only `SUBRC` and
`MESSAGE`, so **there was no way for an affected-row count to cross the runtime seam at all**, and
the test as briefed could not be satisfied by any implementation.

Two routes were considered:

1. Read `SY-DBCNT` in the handler after the `MODIFY_TABLE` call. **Rejected.** It puts a live-system
   dependency back inside a handler — the single thing `ZIF_FS_DYN_RUNTIME` exists to prevent, and
   the defect two prior review rounds were spent removing — and it makes the partial-write path
   untestable against a double, because a test cannot set `SY-DBCNT`.
2. Add `DBCNT TYPE i` to `TY_CALL_RESULT` and fill it in `ZCL_FS_DYN_RUNTIME~MODIFY_TABLE` from
   `SY-DBCNT`, read in the same breath as `SY-SUBRC`. **Chosen.**

The change is **additive and to existing objects only** — no object was created for it. `SUBRC` and
`MESSAGE` keep their meaning, every existing caller compiles and behaves unchanged, and only
`MODIFY_TABLE` fills the new field (it stays 0 everywhere else). Both sibling suites were re-run as
regression proof, below. Routed per rule 6 as *changes*, via `mcp-abap-abap-adt-api`
`lock`/`setObjectSource`/`unLock`.

Why the count is needed at all: `INSERT ... ACCEPTING DUPLICATE KEYS` **writes the non-duplicate
rows** and reports the shortfall only as a `SY-DBCNT` below `LINES( )` (L-312). Without `DBCNT` a
partial write is indistinguishable from a complete one.

### Build log

Routed per rule 6. `adt-mcp` `abap_creation-create_object` (`CLAS/OC`, package `ZFS_DYN_GW`,
transport `DS4K907263`) created the class shell; every source write went through
`mcp-abap-abap-adt-api` `lock` / `setObjectSource` / `unLock`.

1. **Seam first.** `ZIF_FS_DYN_RUNTIME` (`DBCNT` added to `TY_CALL_RESULT`, doc comment on
   `MODIFY_TABLE`) and `ZCL_FS_DYN_RUNTIME` (`result-dbcnt = sy-dbcnt`) changed and activated.
2. **Class shell created**, then sourced as a **deliberate skeleton** — the interface implemented,
   every method just `CLEAR result` — so the tests had something to compile against and could fail
   for the right reason.
3. **Test include.** `createTestInclude` returned `"Resource CLASS_INCLUDE
   ZCL_FS_DYN_HDL_TABLE/TESTCLASSES could not be successfully created."` — the same false failure
   Task 8 hit. Per **L-380** the include was re-read before anything was retried:
   `getObjectSource` returned the normal placeholder, proving it had in fact been created. No
   retry, no orphan. The suite was then written into it.
4. **RED** measured, then the handler implemented, then **GREEN** measured. Both runs were taken
   **after an activation** (**L-398**): `unitTestRun` executes the inactive version, so a result
   measured before activating proves nothing.

**Tooling note (L-404, written this turn):** the first `activateObjects` call failed with
`-32602 Invalid objects JSON: Object at index 0 is missing required properties` because
`adtcore:parentUri` was sent as an empty string. All four properties were present; a blank one
counts as missing and the error names no field. Sending the package URI
`/sap/bc/adt/packages/zfs_dyn_gw` made the identical call succeed.

### What the handler does

| Stage | Rule | Message |
|---|---|---|
| `prepare` 1 | Target matches `ZFS_T_DYN_*` / `ZFS_RFC_DYN_*` / `ZFS_T_SLC_GW*` | **039**, errcat `AUTH` |
| `prepare` 2 | Operation outside `INSERT`/`MODIFY`/`DELETE` | **018** |
| `prepare` 3 | Registry row pins `OPERATION` to something else | **018** |
| `prepare` 4 | Source does not exist (from `COMPONENTS_OF`) | **021** |
| `prepare` 5 | `ImportJson` is not a JSON array | **022** |
| `prepare` 6 | Row count over `REG-MAX_ROWS` | **037** |
| `execute` | Rows touched < rows sent | status `S`, severity **`W`**, **026** with the real count |

Self-protection runs **first**, before anything a registry row or a payload can influence — it must
not be reachable only after some other check happens to pass. The three patterns and the
upper-case + left-shift normalisation are **byte-for-byte the Task 4 step 7 rule**: a name must not
be refused at the registration door and accepted at the execution door. `ALLOW_WRITE = 'X'` in the
test's registry row is deliberate — the rule is non-configurable and no registry row buys past it.

The handler holds **no DDIC call and no SQL of its own**. `COMPONENTS_OF` is its only route to the
target's field list and `MODIFY_TABLE` its only route to the database.

Message **026** was reused for the partial-write warning rather than inventing a number. Its text,
"&1 executed successfully, &2 row(s) affected", stays true of a partial write because the count in
it is the count the database really touched; `STATUS` stays `S` because the dispatch itself worked
(exactly how the FUNC handler treats a BAPIRET2 business error), and `SEVERITY = 'W'` with a
`RESULTCOUNT` below the number sent is what says "fewer than you sent".

### Verification

**RED** — `unitTestRun /sap/bc/adt/oo/classes/zcl_fs_dyn_hdl_table`, taken against the **activated**
skeleton: **7/7 failing**, all `failedAssertion` / `critical`, e.g.
`OWN_TABLE_IS_REFUSED: Different values Expected [E] Actual []`,
`UNPERMITTED_OPERATION_REFUSED: Expected [018] Actual [000]`,
`DUPLICATE_ROWS_REPORT_PARTIAL: Expected [S] Actual []`. Expected: the skeleton returns an empty
outcome from `prepare` and `execute`, so every status, msgno and count assertion misses.

**GREEN** — same command after the implementation was activated: **7/7, zero alerts.**

**Regression** (the widened `TY_CALL_RESULT` touches every consumer of the seam):

| Suite | Result |
|---|---|
| `ZCL_FS_DYN_HDL_TABLE` (`LTC_TABLE`) | **7/7**, zero alerts |
| `ZCL_FS_DYN_HDL_FUNC` (`LTC_FUNC`) | **5/5**, zero alerts |
| `ZCL_FS_DYN_HDL_QUERY` (`LTC_QUERY`) | **6/6**, zero alerts |
| `ZCL_FS_DYN_RUNTIME` (`LTC_RUNTIME`) | **2/2**, zero alerts |

**ATC** — `mcp__adt-mcp__abap_atc_run` over the three changed/created objects, destination
`DS4_100_NIIF`, default variant, worklist `5254001FE7A21FD1ABD62FF193382000`:

- `ZIF_FS_DYN_RUNTIME` — **0 findings**.
- `ZCL_FS_DYN_HDL_TABLE` — **1 finding, priority 3**: SLIN 1713 on the message-037 `msgv2` detail
  string. Same accepted class as the FUNC handler's 020 detail: the message itself is correctly
  `ZFS_TRM_MSG` 037 per rule 4, and SLIN's only fix is a text element, which rule 5 forbids by this
  route (L-229).
- `ZCL_FS_DYN_RUNTIME` — **4 findings, priority 3, all pre-existing and unchanged in count**
  (3 untranslated literals + `ROLLBACK WORK`). The `result-dbcnt = sy-dbcnt` line added none.

**0 errors, 0 warnings.**

`inactiveObjects` after the final activation — **nothing of this task's is present**. Only the same
four pre-existing unrelated items as at baseline (`ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`,
`ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID`) plus the two bare transport headers `DS4K907263` /
`DS4K907279`.

### Task 10 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_HDL_TABLE` | Class (CLAS/OC), **created** | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_HDL_TABLE` test include (`LTC_TABLE`) | Test class include, **created** | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 7/7 tests passing |
| `ZIF_FS_DYN_RUNTIME` | Interface (INTF/OI), **changed** — `DBCNT` added to `TY_CALL_RESULT` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active |
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC), **changed** — `MODIFY_TABLE` fills `DBCNT` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active |

### Delivery checks

- [x] Naming gate — `NAMING:` line above, written **before** the create call. One name gated; the
      test include's name is fixed by ADT.
- [x] Exactly two objects created — the class and its test include. No helper, no budget stub, no
      fake table, no scratch object (rules 3 and 6). `ZCL_FS_DYN_BUDGET` deliberately **not**
      created.
- [x] Messages — **none created**. 018, 021, 022, 037, 039 all confirmed against
      `docs/message-catalog/DS4_100_NIIF.md` before use; 026 reused for the partial-write warning.
      047 still the highest allocated; the catalogue was given a reuse note in this same turn.
- [x] No `$TMP` — everything on `ZFS_DYN_GW` / `DS4K907263`.
- [x] Routing — `adt-mcp` created the class, `mcp-abap-abap-adt-api` did every source change and
      every read.
- [x] No inline `TYPE c LENGTH n` in any signature — `TY_OPERATION` / `TY_JSON` aliases (L-373/375).
- [x] Activation — class + test include in **one** `activateObjects` call, zero messages.
- [x] RED captured before the implementation existed, GREEN after — both measured **post-activation**
      (L-398).
- [x] Regression — all three pre-existing suites re-run green after the seam widened.
- [x] ATC — 0 errors, 0 warnings; 1 new priority-3 SLIN info of the accepted class.
- [x] `inactiveObjects` — nothing of ours left inactive.
- [x] Ledger **L-404** written in the same turn.
- [x] Worklog updated in the same turn as the work.
- [ ] A live `TABL` dispatch against a real table — **not proven, and cannot be at this point in the
      build**: the factory that wires a handler to the real runtime is Task 13. Every test above runs
      against the double, so what is proven is the handler's decisions, not a real write.

---

## Task 11 — `ZFS_FG_DYN_GW`, `ZFS_RFC_DYN_SUBMIT` and `ZCL_FS_DYN_HDL_SUBMIT`

**Scope:** the function group that will host both gateway RFCs, the RFC function module that
actually runs an executable report and captures its output, and the `SUBM` handler that validates
and plans a submit step. Package `ZFS_DYN_GW`, transport `DS4K907263` (task `DS4K907264`),
destination `DS4_100_NIIF` (`DS4` / client `100`).

Carries two resolutions handed down with the task: widen `ZIF_FS_DYN_RUNTIME~SUBMIT_REPORT` so it
can actually express the FM (Resolution 1), and settle the nested `DESTINATION 'NONE'` question
(Resolution 2).

### Naming gate (written before the first create call)

```
NAMING: ZFS_FG_DYN_GW         -> matches "Function group / FM | ZFS_FG_<NAME>"
        (docs/naming-conventions.md line 130), NAME=DYN_GW. 13 chars, under the 26-char
        function-group cap.
NAMING: ZFS_RFC_DYN_SUBMIT    -> matches "Function group / FM | ... (RFC: ZFS_RFC_<NAME>)"
        (docs/naming-conventions.md line 130), NAME=DYN_SUBMIT. 18 chars, under the 30-char
        function-module cap.
NAMING: ZCL_FS_DYN_HDL_SUBMIT -> matches "Class | ZCL_FS_<AREA>_<NAME>"
        (docs/naming-conventions.md line 116), AREA=DYN, NAME=HDL_SUBMIT — the same shape as the
        three sibling handlers already on the system. 21 chars, under the 30-char cap.
```

The test include is not separately gated: `docs/naming-conventions.md` has no row for a class's
local test include, and ADT fixes its name as `<class>=======CCIMP/CCAU`.

### Resolution 1 — widening `SUBMIT_REPORT`, and what it actually cost

The old signature (`program`, `variant`, `max_rows` -> `TY_CALL_RESULT`) could express neither the
capture mode, the memory id nor the selection table inbound, nor the captured rows, status and
message outbound. A `SUBM` step could never have returned data. Both sides were widened to match
the function module one parameter for one:

```abap
METHODS submit_report
  IMPORTING program      TYPE progname
            capture_mode TYPE ty_capture_mode DEFAULT 'SALV'
            variant      TYPE ty_variant OPTIONAL
            memory_id    TYPE ty_memory_id OPTIONAL
            max_rows     TYPE i DEFAULT 0
            selparams    TYPE ty_selparams OPTIONAL
  RETURNING VALUE(result) TYPE ty_submit_result
  RAISING   zcx_fs_dyn_error.
```

**A new return type, not a widened `TY_CALL_RESULT`.** `TY_SUBMIT_RESULT` (`status`, `msgno`,
`message`, `rows_json`, `row_count`) went on the interface beside the others. `TY_CALL_RESULT` has
no room for rows JSON, a row count, an S/E status or a message number, and its one borrowable
field, `DBCNT`, is documented as "rows the database touched by `MODIFY_TABLE`" — a captured ALV row
count is not that. Widening it instead would have added four permanently-blank fields to
`CALL_FUNCTION` and `MODIFY_TABLE` and made both primitives lie about what they return.

**Two methods were added to the interface as well** — `PROGRAM_INFO` (TRDIR) and `VARIANT_EXISTS`
(VARID) — so the handler validates programs and variants through the seam instead of reading DDIC
itself, and so the 027 and 030 refusals are testable without a report or a variant being created
(rule 3).

**What the three doubles actually needed (L-407).** Not what the brief predicted. Widening the
signature forced **nothing**: an ABAP method implementation does not restate its signature, all
three doubles implement `SUBMIT_REPORT` as `CLEAR result.`, and that compiles unchanged under the
new type. What forced them was the two **new methods** — every implementer of an interface must
implement every method or it will not activate. So each double got exactly two stub methods
(`PROGRAM_INFO`, `VARIANT_EXISTS`, both `CLEAR result.`) plus a comment on the existing
`SUBMIT_REPORT` stub recording the widening. No assertion, no test method and no other line was
touched in any of the three. All four suites re-run green after activation.

### Resolution 2 — `dest = 'NONE'` stays, and why

Kept, deliberately, and the reasoning is now a comment in `ZCL_FS_DYN_RUNTIME~SUBMIT_REPORT` as
well as here.

The spec settles it in one line. Section 6.1: *"`SUBM` nests a second session
(`ZFS_RFC_DYN_SUBMIT`) because a report may start its own LUW."* Section 6.4 states the consequence
as a documented limit, not a defect: *"A `SUBM` step owns its own session and LUW. Its writes are
outside the rollback. Unchanged from v1, stated rather than discovered."* The nesting under Task
15's `ZFS_RFC_DYN_EXECUTE` is the design, not an oversight in it.

Collapsing the hop would put an arbitrary allow-listed report **inside** the LUW the dispatcher has
to be able to `ROLLBACK WORK`. The first report that issues its own `COMMIT WORK` would then end
that LUW early and strand every earlier step of the batch as committed-but-not-rollbackable — the
precise failure section 6.3 exists to prevent, traded away to save one internal session per `SUBM`
step. Section 6.4's second bullet already names this hazard for a function module that commits
internally; a report is the same hazard with none of the registration review.

There is also a mechanical reason the hop cannot simply be dropped: the SALV interceptor, the list
memory and the ABAP memory id are all **session-local**. They must be armed and read in the same
session that issues the `SUBMIT`. That is why the capture lives in the function module and not in
the handler, and it is why the handler validates and plans while the runtime calls.

### Live proof — the function module run against a real report

Run in SE37 against `RSPARAM` (a real, standard ALV report; `TRDIR-SUBC = '1'`, `SECU` blank), not
against a double. Four paths, all production logic:

| Input | Result | What it proves |
|---|---|---|
| `IV_PROGRAM = 'ZZ_NO_SUCH_REPORT'` | `EV_STATUS = 'E'`, `EV_MSGNO = 027`, *"Program ZZ_NO_SUCH_REPORT does not exist or is not executable"* | The TRDIR gate, and `ZFS_TRM_MSG` text rendered via `MESSAGE ... INTO` — no inline literal (rule 4) |
| `IV_CAPTURE_MODE = 'PDF'` | `EV_STATUS = 'E'`, `EV_MSGNO = 028`, *"Output mode PDF is not supported for a SUBMIT step"* | The mode gate, refusing before anything is submitted |
| `RSPARAM`, `LIST`, max 5 | **10.2 s**, `EV_STATUS = 'E'`, `EV_MSGNO = 032`, *"No output could be captured from program RSPARAM in mode LIST"* — and the report's **ALV rendered full-screen** | 032 doing exactly the job it was catalogued for: "this report is not a classic-list report", distinguished from "it returned no rows". Also L-406 |
| `RSPARAM`, `SALV`, max 5 | **0.195 s**, `EV_STATUS = 'S'`, `EV_MSGNO = 026`, *"RSPARAM executed successfully, 5 row(s) affected"*, `EV_ROW_COUNT = 5`, `EV_ROWS_JSON` = `[{"NAME":"Autostart","STATE":2,...}]`, **no screen at all** | The whole capture chain: `cl_salv_bs_runtime_info=>set`, `SUBMIT ... AND RETURN`, `get_data_ref`, the `IV_MAX_ROWS` truncation, `/ui2/cl_json` serialisation, message 026 |

`SALV` was **52x faster** than `LIST` on the same report and captured real typed rows where `LIST`
captured nothing. Written up as **L-406**, which also records the sharper finding: `EXPORTING LIST
TO MEMORY` does **not** suppress an ALV display, so for an ALV report `SALV` is not just the
cheapest mode, it is the only headless-safe one.

### The RFC flag — L-324 blocker, cleared by the human in-session

`ZFS_RFC_DYN_SUBMIT` was created with `fmodule:processingType = "normal"` and
`TFDIR-FMODE = ''`. The flag is object metadata, absent from source, and neither MCP server can set
it (L-324) — so `CALL FUNCTION ... DESTINATION 'NONE'` would have failed and the pair could not
have been proven end to end. Raised to the human, who **set the Remote-Enabled radio button in SE37
and activated**. Verified after: `SELECT fmode FROM tfdir WHERE funcname = 'ZFS_RFC_DYN_SUBMIT'`
-> **`R`**. The SE37 change was made by the human, not by this agent — rule 6 routing unchanged.

The binding was then verified against the live interface rather than assumed: all eleven
`FUPARAREF` rows (`IV_PROGRAM`/`PROGNAME`, `IV_CAPTURE_MODE`/`CHAR10`, `IV_VARIANT`/`VARIANT`,
`IV_MEMORY_ID`/`CHAR30`, `IV_MAX_ROWS`/`INT4`, `IT_SELPARAMS`/`RSPARAMS_TT`, `EV_STATUS`/`CHAR1`,
`EV_MSGNO`/`SYMSGNO`, `EV_MESSAGE`/`STRING`, `EV_ROWS_JSON`/`STRING`, `EV_ROW_COUNT`/`INT4`) match
`ZCL_FS_DYN_RUNTIME~SUBMIT_REPORT`'s parameter table name for name, kind for kind (the six inbound
bound `abap_func_exporting`, the five outbound `abap_func_importing` — real numeric constants,
L-401) and type for type.

### What the handler does

`PREPARE` validates and plans, touching nothing. In order: `PROGRAM_INFO` -> 027 if the target is
absent from TRDIR or is not `SUBC '1'`; `ImportJson` parsed for `Variant` / `MemoryId`; the capture
mode gate -> 028 for anything outside `SALV`/`LIST`/`MEMO`/`NONE`, for `MEMO` with a blank memory
id, and for a memory id over 30 characters; `VARIANT_EXISTS` -> 030, which also answers a name
longer than `VARID-VARIANT` rather than truncating it into a variant that might exist;
`FilterJson` -> `RSPARAMS` rows, each checked for `SELNAME` over 8 characters, `KIND` outside
`S`/`P`, `SIGN` outside `I`/`E`, `LOW`/`HIGH` over 45, a control character in a value, and a
`BT`/`NB` with no upper bound (all 029), and an operator outside
`EQ NE GT GE LT LE BT NB CP NP` (024, the injection gate); then the registered row ceiling (025,
resolved exactly as the QURY handler resolves it).

`EXECUTE` calls `SUBMIT_REPORT` and maps `TY_SUBMIT_RESULT` onto the outcome. A non-'S' status is a
real refusal and becomes a real error outcome with the function module's own message number and an
error category derived from it — never a quiet success with no rows, which is what L-313 is about.

### ATC — 0 priority-1, 0 priority-2

Seven priority-3 infos, all inspected and none actionable:

- `ZCL_FS_DYN_HDL_SUBMIT` x2, SLIN 1713 "strings without text elements are not translated"
  (`| without MemoryId|`, `| MemoryId over |`). These are **message variables** handed to
  `ZFS_TRM_MSG` 028, not message text, and rule 4 forbids creating the text element SLIN is asking
  for. Identical to the pre-existing infos on `ZCL_FS_DYN_RUNTIME`.
- `ZCL_FS_DYN_RUNTIME` x4, three the same SLIN 1713/1700 pattern and one "Use of ROLLBACK WORK" —
  all pre-existing, and the `ROLLBACK WORK` is `ROLLBACK_LUW`, the whole point of the class.
- `ZFS_FG_DYN_GW` x4, "Call Executable Program (IV_PROGRAM)" — one per `SUBMIT` variant. That is
  the object's entire purpose; v1's function group carries the same infos.
- `ZIF_FS_DYN_RUNTIME` — no findings.

### Task 11 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_FG_DYN_GW` | Function group (FUGR/F), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active |
| `ZFS_RFC_DYN_SUBMIT` | Function module (FUGR/FF), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, `TFDIR-FMODE = 'R'` |
| `ZCL_FS_DYN_HDL_SUBMIT` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_HDL_SUBMIT` test include (`LTC_SUBMIT`) | Test class include, **created** | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 9/9 passing |
| `ZIF_FS_DYN_RUNTIME` | Interface (INTF/OI), **changed** — `SUBMIT_REPORT` widened; `TY_SUBMIT_RESULT`, `TY_PROGRAM_INFO`, `TY_CAPTURE_MODE`, `TY_MEMORY_ID`, `TY_SELPARAMS` added; `PROGRAM_INFO` + `VARIANT_EXISTS` added | ZFS_DYN_GW | DS4K907263 | Active |
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC), **changed** — new `SUBMIT_REPORT` binding, `PROGRAM_INFO`, `VARIANT_EXISTS` | ZFS_DYN_GW | DS4K907263 | Active, 2/2 passing |
| `ZCL_FS_DYN_HDL_QUERY` test include | **changed** — two stub methods only | ZFS_DYN_GW | DS4K907263 | Active, 6/6 passing |
| `ZCL_FS_DYN_HDL_FUNC` test include | **changed** — two stub methods only | ZFS_DYN_GW | DS4K907263 | Active, 5/5 passing |
| `ZCL_FS_DYN_HDL_TABLE` test include | **changed** — two stub methods only | ZFS_DYN_GW | DS4K907263 | Active, 7/7 passing |

### Delivery checks

- [x] Naming gate — three `NAMING:` lines written **before** the first create call.
- [x] Exactly four objects created — the function group, the function module, the class and its
      test include. No helper, no report, no variant, no scratch object (rules 3 and 6).
- [x] Messages — **none created**. 024, 025, 026, 027, 028, 029, 030, 031, 032 all confirmed
      against `docs/message-catalog/DS4_100_NIIF.md` before use; 047 is still the highest
      allocated and 048 is still free for Task 10's fix round.
- [x] Text elements — **none created, and none needed by anything built here**. Every message goes
      through `MESSAGE ID 'ZFS_TRM_MSG' ... INTO`, never a text symbol or an inline literal.
- [x] No `$TMP` — everything on `ZFS_DYN_GW` / `DS4K907263`.
- [x] Routing — `adt-mcp` created all three objects (no rule-5 fallback was needed);
      `mcp-abap-abap-adt-api` did every source change and every read. The one SE37 action, the
      RFC radio button, was done by the **human**.
- [x] No inline `TYPE c LENGTH n` in any signature — `TY_CAPTURE_MODE` / `TY_MEMORY_ID` aliases
      (L-373/375). `abap_func_*` kinds are the real numeric constants (L-401).
- [x] Activation — function group, module, interface, runtime, all three sibling classes and the
      new class in **one** `activateObjects` call, zero messages (L-209).
- [x] RED captured before the implementation existed (9/9 failing against the **activated**
      skeleton), GREEN after — both post-activation (L-398).
- [x] Regression — all three pre-existing suites plus the runtime's own re-run green.
- [x] ATC — 0 priority-1, 0 priority-2; seven priority-3 infos, all explained above.
- [x] `inactiveObjects` — nothing of Task 11's is inactive.
- [x] Ledger **L-406** and **L-407** written in the same turn.
- [x] Worklog updated in the same turn as the work.
- [x] **A live run against a real report — proven**, four paths, see the table above. This is the
      first object in the dyngw v2 build to execute against something real rather than a double
      (L-405).

---

## Task 12 — `ZCL_FS_DYN_REGISTRY` + `ZCL_FS_DYN_HDL_REGI` (2026-09-12)

**Scope.** The allow-list resolver every dispatch goes through, and the fifth (and last) handler,
`REGI`. Brief: `.superpowers/sdd/2026-09-12-dyngw-v2/task-12-brief.md`.

### Naming gate — written BEFORE the create calls

```
NAMING: ZCL_FS_DYN_REGISTRY -> matches "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md
        line 116), AREA=DYN (approved AREA code, L-376), NAME=REGISTRY
NAMING: ZCL_FS_DYN_HDL_REGI -> matches "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md
        line 116), AREA=DYN, NAME=HDL_REGI - same shape as the four sibling handlers
        ZCL_FS_DYN_HDL_QUERY / _FUNC / _TABLE / _SUBMIT
NAMING: LTC_REGISTRY, LTC_REGI, LTD_FAKE_* -> local test classes, "Test class (local) | LTC_<NAME>"
        (line 119) and the project's established LTD_ prefix for doubles
```

### Messages — all confirmed against `docs/message-catalog/DS4_100_NIIF.md`, none created

017, 018, 034, 035, 036, 039, 043. 048 left free for Task 10's pending fix; nothing new allocated.

### Pre-flight fact checks (read, not assumed)

- `ZFS_T_DYN_REG` is **empty** — `SELECT ... FROM zfs_t_dyn_reg` returned **0 rows**, and
  `SELECT COUNT(*) FROM zfs_t_dyn_regh` returned 0. **The brief's premise that a `QURY`/`T000` row
  already exists from Task 4 is false**: Task 4's Step 9 was deferred to Task 18 by controller
  ruling and never wrote a row (see `.superpowers/sdd/2026-09-12-dyngw-v2/task-4-report.md`).
  Adapted: the handler suite uses a substituted registry seam instead of a pre-seeded row, and the
  live proof is a read-only `resolve( )` against the real, empty table.
- `ZFS_T_DYN_REG` is `deliveryClass #C` (not `#A` as the task framing said); `ZFS_T_DYN_REGH` is
  `#A`. Either way the rows do not travel with the transport (L-335).
- `ZFS_DO_DYN_ERRCAT` fixed values: `AUTH` / `BUSINESS` / `CLIENT` / `TARGET`.
  `ZFS_DO_DYN_KIND`: `FUNC` / `TABL` / `QURY` / `SUBM` / `REGI`.

### Design decisions taken in Task 12

1. **`resolve( )` gained an OPTIONAL fourth parameter, `operation`.** The brief writes the interface
   as `resolve( kind, name, needs_write )` but lists a pinned-operation mismatch as rule 2, which
   cannot be evaluated without an operation. v1's `ZCL_FS_SLC_GW_REGISTRY=>RESOLVE` carries
   `IV_OPERATION OPTIONAL` for exactly this reason, and the brief says the semantics are "unchanged
   from v1". Every three-argument call in the brief still compiles unchanged.
2. **Error categories.** 017 -> `CLIENT` and the ALLOW_READ/ALLOW_WRITE gate -> `AUTH`, both as the
   brief requires. The **pinned-operation** 018 is `BUSINESS`, matching
   `ZCL_FS_DYN_HDL_TABLE=>CHECK_OPERATION`, which enforces the identical rule for a TABL step: the
   same refusal must not arrive with two different categories depending on which route reached it.
3. **`ZCL_FS_DYN_REGISTRY` is not FINAL and its three SQL primitives are PROTECTED.** That is the
   whole test seam - no `ZIF_` interface was invented, because one would exist only for the test.
   It is also what lets `ZCL_FS_DYN_HDL_REGI` be tested without writing to the live allow list.
4. **`ZCL_FS_DYN_HDL_REGI` holds no SQL at all**; the registry is its database door. The registry
   therefore gained `SAVE_ROW`, `SAVE_HISTORY`, `EXISTS` and `COMMITTED_ROW` beyond the brief's
   three methods.
5. **`RESET( call_uuid )`** carries the request's call UUID instead of a setter on the handler. The
   dispatcher already calls `reset` once per request and already owns the registry instance, so the
   `REGI` handler stays exactly the shape `ZIF_FS_DYN_HANDLER` defines - no downcast needed from
   Task 13's factory.
6. **TargetKind is required on every REGI operation**, a deliberate tightening of v1 which demanded
   it only for a non-UPDATE. `(kind, name)` is the registry's identity; a blank kind cannot address a
   row, and v1 would answer 017 for a target that plainly exists.
7. **`TY_PROGRAM_INFO` gained `GUI_DEPENDENT`** rather than `ZIF_FS_DYN_RUNTIME` gaining a method.
   Widening a type forces no implementer (L-407); adding a method would have forced all five doubles.

### Bug found and fixed: `ZCX_FS_DYN_ERROR` message variables never substituted (L-408)

`LTC_REGI_LIVE->REAL_GUI_REPORT_IS_043` asserted on the **rendered** message text and returned
`Program &MV_MSGV1& cannot be submitted: &MV_MSGV2&`. `MV_MSGV1..4` were in the `PRIVATE SECTION`;
the T100 text builder resolves `T100KEY-ATTR1..4` through the object reference and needs them
public. Moved to `PUBLIC ... READ-ONLY`. **Every error message this framework has raised since
Task 6 was reaching its caller with the variables unsubstituted**, and no suite noticed because none
had ever asserted on `MSGTEXT`. Ledger L-408.

### Task 12 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_REGISTRY` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_REGISTRY` test include (`LTD_REG_DB`, `LTC_REGISTRY`) | Test include, **created** | ZFS_DYN_GW | DS4K907263 | Active, 9/9 passing |
| `ZCL_FS_DYN_HDL_REGI` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_HDL_REGI` test include (`LTC_REGI`, `LTC_REGI_LIVE`) | Test include, **created** | ZFS_DYN_GW | DS4K907263 | Active, 9/9 + 3/3 passing |
| `ZIF_FS_DYN_RUNTIME` | Interface (INTF/OI), **changed** - `TY_PROGRAM_INFO` gained `GUI_DEPENDENT` | ZFS_DYN_GW | DS4K907263 | Active |
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC), **changed** - `PROGRAM_INFO` now answers the WBCROSSGT/D010INC GUI question | ZFS_DYN_GW | DS4K907263 | Active, suite green |
| `ZCX_FS_DYN_ERROR` | Class (CLAS/OC), **changed** - `MV_MSGV1..4` PRIVATE -> PUBLIC READ-ONLY (L-408) | ZFS_DYN_GW | DS4K907263 | Active, 0 ATC findings |

### Delivery checks

- [x] Naming gate - `NAMING:` lines written **before** the first create call.
- [x] Exactly two objects created plus their two test includes. No helper, no runner, no scratch
      object (rules 3 and 6).
- [x] Messages - **none created**. 017, 018, 020, 034, 035, 036, 039, 043 all confirmed against
      `docs/message-catalog/DS4_100_NIIF.md` before use; 048 is still free for Task 10's fix.
- [x] Text elements - none created and none needed.
- [x] No `$TMP` - everything on `ZFS_DYN_GW` / `DS4K907263`.
- [x] Routing - `adt-mcp` created both classes; `mcp-abap-abap-adt-api` did every source change and
      every read.
- [x] No inline `TYPE c LENGTH n` in any signature (L-373/L-375); no dynamic SQL anywhere in either
      new class.
- [x] RED captured against the **activated** skeleton (9/9 and 9/9 failing), GREEN after, both
      post-activation (L-398).
- [x] Regression - QUERY / FUNC / TABLE / SUBMIT / RUNTIME re-run, `Overall Test Run Status:
      [PASSED]`; SUBMIT re-run individually, 9/9.
- [x] ATC - 0 priority-1, 0 priority-2, 20 priority-3 infos (all SLIN 1700/1713 message-variable
      literals, plus the pre-existing `ROLLBACK WORK` on `ZCL_FS_DYN_RUNTIME`).
- [x] `inactiveObjects` - nothing of Task 12's is inactive.
- [x] Ledger **L-408** and **L-409** written in the same turn.
- [x] **No data residue** - `SELECT COUNT(*) FROM zfs_t_dyn_reg` = 0 after the full suite. The
      brief's `update_merges_only_sent_fields` writes to a substituted database, never the live
      allow list, so Resolution 4's restore problem does not arise.

---

## Task 13 — `ZCL_FS_DYN_FACTORY` + `ZCL_FS_DYN_JSON` + `ZCL_FS_DYN_BUDGET` (2026-09-12)

**Scope.** The three pieces that sit above the five handlers: the handler factory, the JSON codec
with a byte-based cap, and the budget guard. Plus the two framework-wide questions deferred to this
task (the prepare-first guard, the empty-array case) and the `MAX_ROWS = 0` reconciliation.
Brief: `.superpowers/sdd/2026-09-12-dyngw-v2/task-13-brief.md`.

**The headline: the framework ran end to end against the real system for the first time, and that
run found a bug that broke the entire `QURY` step kind.** See "The live dispatch" below.

### Naming gate — written BEFORE the create calls

```
NAMING: ZCL_FS_DYN_FACTORY -> matches "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md
        line 116), AREA=DYN (approved AREA code, L-376), NAME=FACTORY
NAMING: ZCL_FS_DYN_JSON    -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 116), AREA=DYN,
        NAME=JSON
NAMING: ZCL_FS_DYN_BUDGET  -> matches "Class | ZCL_FS_<AREA>_<NAME>" (line 116), AREA=DYN,
        NAME=BUDGET
NAMING: LTC_FACTORY, LTC_FACTORY_LIVE, LTC_JSON, LTC_BUDGET, LTD_FAKE_RUNTIME -> local classes in
        the authorised objects' own test includes, "Test class (local) | LTC_<NAME>" (line 119)
        and the project's established LTD_ prefix for a double
NAMING: LCL_GUARDED_HANDLER -> local production class in ZCL_FS_DYN_FACTORY's own CCIMP include.
        Not a repository object, never in TADIR; the LCL_ prefix is the project's convention for a
        local class that is not a test class
```

### Interruption: the MCP session died mid-task

The `mcp-abap-abap-adt-api` session died into a blanket HTTP 400 during the read-only fact-finding
phase, **before the first create call** - L-396's signature exactly. The human restarted the server
and work resumed with nothing lost and nothing half-written on the system. The trigger is recorded
as **L-410**: the session died on the first message that issued a `runQuery` in parallel with
another call to the same server, after twelve reads (six of them parallel pairs) had been fine.

### The live dispatch — the point of the task

`LTC_FACTORY_LIVE`, three tests, inside the factory's own test include (Task 12's `LTC_REGI_LIVE`
precedent). Nothing created, nothing written, the live allow list **not** seeded.

| Test | What it really exercises | Result |
|---|---|---|
| `REAL_QUERY_DISPATCH` | factory -> guard -> `ZCL_FS_DYN_HDL_QUERY` -> real `ZCL_FS_DYN_RUNTIME` -> real `SELECT` on `T000` | **failed first, then passed** - it found L-411 |
| `REAL_REGISTRY_EMPTY_017` | `ZCL_FS_DYN_REGISTRY=>RESOLVE` against the real, empty `ZFS_T_DYN_REG` | passed - 017, `CLIENT`, rendered text names `T000` and holds no `&` placeholder |
| `REAL_SUBMIT_RSPARAM` | factory -> guard -> `ZCL_FS_DYN_HDL_SUBMIT` -> `ZCL_FS_DYN_RUNTIME=>SUBMIT_REPORT` -> RFC `ZFS_RFC_DYN_SUBMIT` -> `SUBMIT RSPARAM`, capture mode `SALV` | **passed, 0.18 s, rows captured** |

`REAL_SUBMIT_RSPARAM` **closes the largest unproven hop in the build.** Task 11 verified
`SUBMIT_REPORT`'s eleven RFC parameters structurally against `FUPARAREF` - name, kind and type all
matched - but never executed it. It now executes, and the eleven bindings (including the L-401
numeric `ABAP_FUNC_*` kinds) are confirmed against the real function module.

### The bug the live dispatch found: L-411

`REAL_QUERY_DISPATCH` failed on its first run with

```
020 Dynamic call of T000 failed: The parser produced the error: If an OFFSET additi...
```

`ZCL_FS_DYN_RUNTIME~SELECT_ROWS` emitted **`OFFSET @offset` unconditionally**, in both of its two
branches. Open SQL refuses `OFFSET` without `ORDER BY`, and `ORDER BY (order_by)` with an **empty**
dynamic token is no `ORDER BY` at all. So **every `QURY` step that did not send `OrderByJson`
failed at runtime** - which is the normal case for a read, and is exactly what
`ZCL_FS_DYN_HDL_QUERY`'s own happy-path test sends. The whole read side of the gateway was broken.

No suite saw it, and could not have: every `QURY` test runs against a substituted runtime, and this
`SELECT` is the one statement the seam puts out of their reach. It is L-405's warning and L-408's
pattern for the third time - a green board against a double proving nothing about the wire.

**Fix:** four branches instead of two; `OFFSET` is emitted only when `offset > 0`. Safe to pair
with `ORDER BY` unconditionally in that branch, because a `Skip` greater than zero is already
refused by the handler with 042 unless `OrderByJson` ends with the source's full primary key
(spec 8.2) - so by the time `OFFSET` is non-zero, `ORDER BY` is guaranteed non-empty.

### The two framework-wide questions, settled

**1 · The prepare-first guard -> `LCL_GUARDED_HANDLER`, in the factory's CCIMP.**

First, a correction to the task framing: **`ZCL_FS_DYN_HDL_REGI` already had a guard.** It carries
`MV_PREPARED` and refuses with `ZFS_TRM_MSG` 020 / `errcat 'TARGET'`. The other four do not. So the
framework already had a house answer; it just was not applied consistently.

Every handler the factory hands out is now wrapped. Reasons for putting it in the factory rather
than copying `REGI`'s flag into four more classes:

- one place instead of five, and a sixth handler inherits it by existing rather than by someone
  remembering - which is precisely what went wrong the first five times;
- it closes a **strictly larger** hole. A per-handler flag catches "`PREPARE` never ran". The
  wrapper also catches "`PREPARE` ran and **failed**", which in `ZCL_FS_DYN_HDL_TABLE` reaches
  `MODIFY_TABLE( rows = mr_rows )` with `MR_ROWS` **unbound**, because `PREPARE` clears the
  reference on its way out and reports the refusal by returning an outcome rather than raising.
  `LTC_FACTORY->EXECUTE_AFTER_FAILED_PREP` is the regression net;
- it changes **zero** handler classes, so five green suites stay untouched.

The predicate is `status <> 'E'`, not `status = 'S'`: every handler's error path sets `'E'`, but
not every handler is guaranteed to set `'S'`, and reading the failure flag is correct either way.
`REGI`'s own internal guard stays, as belt-and-braces for direct construction.

A local class in a class pool's CCIMP is part of the authorised object - no TADIR entry, not
callable from outside - so rule 3 is untouched.

**2 · `ImportJson = '[]'` is a refusal, not a no-op.**

It used to be accepted, yielding `STATUS 'S'` with `RESULTCOUNT 0`: a write step that names a
target and an operation, touches nothing, and reports success. Nothing in that response lets a
caller tell "your rows were written" from "you sent none" - the exact class of silent success this
rebuild exists to remove. It also burns one of the 50 steps a batch is allowed while conveying
nothing. A client whose row set is legitimately empty should omit the step.

Refused with **022**, `msgv1 = 'ImportJson (no rows to write)'` - the reason fits inside `SYMSGV`'s
fifty characters, so `GET_TEXT( )` renders *"Invalid JSON in parameter ImportJson (no rows to
write)"* and the empty-array refusal is distinguishable from the non-array one. **No new message
number.**

### `MAX_ROWS = 0` reconciliation

`ZCL_FS_DYN_HDL_TABLE=>CHECK_WRITE_BUDGET` read the ceiling straight off the registry row with
"0 means no ceiling is enforced here". It now delegates to
`ZCL_FS_DYN_BUDGET=>CHECK_WRITE_ROWS( rows, registered_max )`, which applies `registered_max` when
`> 0` and the spec 8.2 default of **1 000** otherwise. 0 means "this target sets no **override**",
never "this target has no limit" - a registration that never mentioned a row count must not thereby
authorise an unbounded write. The ceiling lives in the budget class so the handler and the future
dispatcher cannot drift apart. `LTC_TABLE->MAX_ROWS_ZERO_NOT_UNLIMITED` asserts it where it is
*consumed*, not only where it is defined.

### `CAP( )` — byte-based, cutting at a structure boundary

- Byte length is `xstrlen( cl_abap_codepage=>convert_to( text ) )`, never `STRLEN`.
  `LTC_JSON->BYTE_LENGTH_IS_BYTES` states the v1 bug as one assertion: EURO SIGN is one character
  and three UTF-8 bytes.
- Over the cap, a string- and escape-aware scanner splits the top level and as many **whole**
  members as fit are re-emitted inside the original brackets, with byte counts **accumulated**
  rather than the growing prefix re-encoded (O(n), not O(n^2), which matters on a 1 MB payload).
  `LTC_JSON->CAP_NOT_SPLIT_INSIDE_STRNG` is why a scanner and not a `SPLIT` on comma: the first
  row's *value* contains a comma and a closing brace.
- When not even one member fits - the brief's own test case - the result is the parseable envelope
  `{"_truncated":true,"_bytes":<n>,"_cap":<c>}`, which beats both a truncated substring (does not
  parse) and a bare `[]` (parses, and lies about what was there).
- `MAX_BYTES <= 0` means "use the default", never "no cap", matching the `MAX_ROWS` rule.
- The result is re-measured once before returning: the guarantee is that the stored text parses
  **and** fits, and an argument that it should is not the same thing.

### Messages — none created

**020**, **022**, **037** all already catalogued and confirmed against
`docs/message-catalog/DS4_100_NIIF.md` before use. 048 left free for Task 10's pending fix; nothing
allocated at 049+.

- budget refusals -> **037**, `errcat 'CLIENT'`;
- factory unknown kind -> **020**, `msgv2 = 'no handler is registered for this step kind'`,
  `errcat 'CLIENT'` - 020 is already the framework's "technical failure with a reason" carrier and
  `ZCL_FS_DYN_HDL_REGI` uses it for the identical shape of internal refusal, so a new number would
  fork the meaning;
- guard refusal -> **020**, `errcat 'TARGET'`, identical to `REGI`'s existing wording;
- TABL empty array -> **022**.

**Catalog defect found, not fixed here:** `docs/message-catalog/DS4_100_NIIF.md` still says
*"Next free number: 047"*, but 047 is allocated (`ZCX_FS_DYN_ERROR`'s T100 default). The next
genuinely free number is 048, which is reserved. A future task allocating from that line will
collide.

### Findings worth carrying forward

- `/ui2/cl_json=>GENERATE` returns an **unbound** reference for text it cannot parse - verified
  live by `LTC_JSON->GARBAGE_JSON_IS_022` against `'{"A": '`. That unbound reference is the only
  parse verdict the library offers, because `DESERIALIZE` is silently lenient and leaves `DATA`
  untouched on garbage. `ZCL_FS_DYN_JSON=>IS_PARSEABLE` turns it into a real 022, which no handler
  could do before (L-412).
- `CL_ABAP_UNIT_ASSERT=>ASSERT_DIFFERS` types `ACT`/`EXP` as `SIMPLE` and **cannot take an object
  reference**; the brief's `assert_differs( act = lo_a exp = lo_b )` does not compile. Replaced
  with `assert_equals( act = xsdbool( lo_a = lo_b ) exp = abap_false )` - the same assertion.
- A method's `IMPORTING` parameters are **pass-by-reference by default**, so a typed actual must be
  *compatible*, not merely convertible: `DATA(lv) = '[...]'` infers `TYPE C` and will not bind to a
  `TYPE string` formal. Literals are fine (they are passed as a converted temporary); typed
  variables are not. Two activation rounds were lost to this.
- A test class declared `DURATION MEDIUM` is **silently skipped** by the default `unitTestRun`
  filter - neither green nor red. `LTC_FACTORY_LIVE` was MEDIUM on its first run and reported
  nothing at all; it is `SHORT` now, which for the one class that proves the framework works is the
  only acceptable setting (L-413).

### Task 13 object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_DYN_JSON` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_JSON` test include (`LTC_JSON`) | Test include, **created** | ZFS_DYN_GW | DS4K907263 | Active, 9/9 passing |
| `ZCL_FS_DYN_BUDGET` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_BUDGET` test include (`LTC_BUDGET`) | Test include, **created** | ZFS_DYN_GW | DS4K907263 | Active, 10/10 passing |
| `ZCL_FS_DYN_FACTORY` | Class (CLAS/OC), **created** by `adt-mcp` | ZFS_DYN_GW | DS4K907263 (task DS4K907264) | Active, 0 activation messages |
| `ZCL_FS_DYN_FACTORY` CCIMP (`LCL_GUARDED_HANDLER`) | Local Types include, **created** | ZFS_DYN_GW | DS4K907263 | Active |
| `ZCL_FS_DYN_FACTORY` test include (`LTC_FACTORY`, `LTC_FACTORY_LIVE`) | Test include, **created** | ZFS_DYN_GW | DS4K907263 | Active, 9/9 + 3/3 passing |
| `ZCL_FS_DYN_RUNTIME` | Class (CLAS/OC), **changed** - `SELECT_ROWS` conditional `OFFSET` (L-411) | ZFS_DYN_GW | DS4K907263 | Active, suite green |
| `ZCL_FS_DYN_HDL_TABLE` | Class (CLAS/OC), **changed** - write budget delegated, empty array refused | ZFS_DYN_GW | DS4K907263 | Active, 9/9 passing |

### Delivery checks

- [x] Naming gate - `NAMING:` lines written **before** the first create call.
- [x] Exactly three objects created plus their includes. No helper, no runner, no scratch object
      (rules 3 and 6). `LCL_GUARDED_HANDLER` is a local class inside an authorised object's own
      CCIMP, not a repository object.
- [x] Messages - **none created**. 020, 022, 037 confirmed against the catalog before use; 048
      still free for Task 10's fix.
- [x] Text elements - none created and none needed.
- [x] No `$TMP` - everything on `ZFS_DYN_GW` / `DS4K907263`.
- [x] Routing - `adt-mcp` created all three classes; `mcp-abap-abap-adt-api` did every source
      change and every read.
- [x] No inline `TYPE c LENGTH n` in any signature (L-373/L-375).
- [x] Activation - all three active, 0 activation messages; `inactiveObjects` clean for
      `ZFS_DYN_GW` (the four remaining rows are the pre-existing SLC fee-type DDLS and the Deal ID
      lock object on unrelated transports, unchanged since Task 12).
- [x] Suites measured **after** activation (L-398): JSON 9/9, BUDGET 10/10, FACTORY 9/9 + LIVE 3/3.
- [x] Regression - TABLE 9/9, QUERY 6/6, FUNC 5/5, SUBMIT 9/9, REGI 9/9 + LIVE 3/3, REGISTRY 9/9,
      RUNTIME 2/2. **83 tests, all alerts empty.**
- [x] ATC on all five touched objects - **0 priority-1, 0 priority-2**, 15 priority-3 infos (the
      same SLIN 1700/1713 message-variable-literal family Task 12 reported).
- [x] At least one assertion on a **rendered** message text (L-408): five of them -
      `LTC_BUDGET->REFUSAL_TEXT_IS_RENDERED`, `LTC_JSON->GARBAGE_JSON_IS_022`,
      `LTC_FACTORY->UNKNOWN_KIND_RAISES`, `LTC_FACTORY_LIVE->REAL_REGISTRY_EMPTY_017`,
      `LTC_TABLE->EMPTY_ARRAY_IS_REFUSED`.
- [x] **A real dispatch was attempted and reported honestly.** It failed the first time and the
      failure was a real bug in shipped code (L-411), not a test defect.
- [x] Ledger **L-410**, **L-411**, **L-412**, **L-413** written in the same turn.
- [x] **No data residue** - the live tests are read-only and the live allow list was not seeded;
      `ZFS_T_DYN_REG` is still empty, which is what `REAL_REGISTRY_EMPTY_017` asserts.

## Out-of-plan change — JOB capture mode ported into `ZFS_RFC_DYN_SUBMIT` (2026-09-12)

**Requested directly by the human**, outside the 21-task plan: "In FM ZFS_RFC_DYN_SUBMIT i want the
job mode logic also same like ZFS_RFC_DYNGW_SUBMIT fm." Done by the controller rather than an
implementer, because Task 13 was in flight and the one-implementer rule binds.

### Naming gate

No object created — two existing objects **changed**, so no new name is introduced and the gate does
not apply. Routing: both changes via `mcp-abap-abap-adt-api` `setObjectSource`, which is the correct
server for a change (rule 5).

### Messages

**None created.** JOB mode reuses 020 (`Dynamic call of &1 failed: &2`), 026, 027, 028, 031 and 032,
all already in `docs/message-catalog/DS4_100_NIIF.md`. The job identifiers ride in 020's second
variable rather than in a new message.

### What changed

| Object | Type | Change |
|---|---|---|
| `ZFS_RFC_DYN_SUBMIT` | FUGR/FF, **changed** | Fifth capture mode `JOB`: `JOB_OPEN` → `SUBMIT ... VIA JOB` → `JOB_CLOSE` → `COMMIT WORK` → poll `TBTCO` (2 s × 200 = 400 s) → read `TBTCP-LISTIDENT` → `RSPO_RETURN_ABAP_SPOOLJOB` → rows as JSON. Judged on job status, not on output. Active, 0 activation messages. |
| `ZCL_FS_DYN_HDL_SUBMIT` | CLAS/OC, **changed** | `check_mode( )` accepts `JOB` as a fifth mode. Active, 0 activation messages. Suite re-run 9/9. |

**No signature change** on either side, so `ZIF_FS_DYN_RUNTIME`, `ZCL_FS_DYN_RUNTIME` and the four
runtime doubles are untouched (L-407).

### Design decisions

1. **The v1 envelope was not ported.** v1 returns `EV_EXPORT_JSON` carrying jobname/jobcount/
   jobstatus/spoolid; v2's `TY_SUBMIT_RESULT` has no such field and adding one would have widened
   the interface, the runtime class and the handler for diagnostics alone. Instead the job
   identifiers ride in message **020**'s free-text variable on the two paths where they actually
   matter — `job ZFSDYN_x/nnnnnnnn aborted` and `... still 'R' after 400s` — so a job that outlives
   the poll budget can still be picked up in SM37. On the success path the spool content is the
   answer, not the job number.
2. **Job name prefix `ZFSDYN_`, not v1's `ZFSGW_`**, so the two frameworks' runs stay tellable apart
   in SM37. `BTCJOB` is CHAR32 and a long report name truncates, which is harmless: the same
   truncated value creates the job and looks it up, and `JOBCOUNT` makes the pair unique.
3. **`WITH SELECTION-TABLE` passed unconditionally in the JOB branch.** An empty `rsparams` table is
   legal and supplies nothing, which collapses eight near-identical `SUBMIT` statements to four.
   An empty `VARIANT` is *not* a legal `SELECTION-SET`, so that one still branches. The synchronous
   path was left exactly as Task 11 wrote it — this is a change to JOB, not a refactor of SUBM.
4. **Print parameters added beyond v1** (`GET_PRINT_PARAMETERS`, `MODE 'BATCH'`, `NO_DIALOG`,
   `PRIMM`/`PRREL` cleared so the spool is kept and never physically printed), falling back to a
   plain `VIA JOB` when `VALID` comes back blank. See the live result below for what this did and
   did not fix.

### Live verification — run twice in SE37 against the real system

| | Result |
|---|---|
| Job created and executed | **yes** — `TBTCP`: `ZFSDYN_RSPARAM`/`23363100` and `/23400000`, `PROGNAME` `RSPARAM`, `AUTHCKNAM` `FS_DEV3` |
| Job completed | **yes** — `TBTCO-STATUS = 'F'` within the first 2 s poll |
| Module verdict | `EV_STATUS = 'S'`, `EV_MSGNO = 026`, "RSPARAM executed successfully, 0 row(s) affected", 2.1 s |
| Rows captured | **0** — `TBTCP-LISTIDENT = 0`, no new `TSP01` request |
| Re-test, classic-list report `DEMO_LIST_FORMAT_COLOR_1` | **10 rows captured**, `EV_STATUS 'S'`, 026, real list text in `EV_ROWS_JSON` |

**Why 0 rows, and why that is not a defect:** `RSPARAM` renders through ALV, and an ALV report
writes no spool in a background job. `TSP01` still holds v1's JOB-mode spools (`RTPM_ACCRUAL`,
`RTPM_TRL_VAL`) — classic-list posting reports — so the spool path itself works. Ledger **L-414**.

### Delivery checks

- [x] Both objects **active**, 0 activation messages each.
- [x] `ZCL_FS_DYN_HDL_SUBMIT` suite re-run after activation: **9/9**, every `alerts` array empty.
- [x] No object created (rules 3 and 6); no `$TMP`; both on `ZFS_DYN_GW` / `DS4K907263`.
- [x] No message created; no text element created or needed.
- [x] ATC on `ZFS_FG_DYN_GW` + `ZCL_FS_DYN_HDL_SUBMIT`: **0 errors, 0 warnings**, 15 infos
      (worklist `5254001FE7A21FD1ABD8996853BD2000`).
- [x] Ledger **L-414** written in the same turn.
- [x] **Spool-capture branch PROVEN** (re-tested on request): JOB mode against
      `DEMO_LIST_FORMAT_COLOR_1`, a shipped `WRITE`-list demo, returned `EV_STATUS 'S'`, 026,
      **`EV_ROW_COUNT = 10`** and real list text in `EV_ROWS_JSON`. Same code path that returned 0
      for RSPARAM — the controlled comparison that confirms L-414: the report's output path, not the
      plumbing. Nothing is left open on this change.

---

## Task 14 — `ZCL_FS_DYN_AUTH` (2026-09-13)

**Scope.** The per-call authorization gate on authorization object `ZFS_DYNGW` — the single thing
v1 got wrong (one permission gated everything). One new class, `ZCL_FS_DYN_AUTH`, plus its test
include. Package `ZFS_DYN_GW`, transport `DS4K907263`. Nothing else created.

**Naming gate (pre-create).**

`NAMING: ZCL_FS_DYN_AUTH -> matches docs/naming-conventions.md "Class | ZCL_FS_<AREA>_<NAME>"`
(AREA = `DYN`, the area every other object of this framework uses — `ZCL_FS_DYN_REGISTRY`,
`ZCL_FS_DYN_RUNTIME`, `ZCL_FS_DYN_FACTORY`; NAME = `AUTH`). 15 characters, inside the 30-character
`CLAS` cap. No exception row needed.

**Authorization object, re-verified live before writing a line of ABAP** (`runQuery`, one statement
at a time per L-410):

| Read | Answer |
|---|---|
| `TOBJ` | `ZFS_DYNGW`, class `ZFS`, `FIEL1 ZDYNKIND` / `FIEL2 ZDYNTGT` / `FIEL3 ACTVT` |
| `AUTHX` | `ZDYNKIND -> ZFS_DE_DYN_KIND`, **`ZDYNTGT -> CHAR30`**, `ACTVT -> ACTIV_AUTH` (checktable `TACT`) |
| `TACTZ` | exactly `01`, `02`, `03`, `16` — nothing else |

The brief's "BLOCKED on prerequisite P1" banner is stale; the object exists.

### The interface Task 15 will call

```abap
can_execute(   kind, target ) -> abap_bool     " ACTVT '16', scoped by ZDYNKIND + ZDYNTGT
can_admin(     [actvt]      ) -> abap_bool     " omitted = '01' AND '02'; only 01/02 accepted
can_audit(                  ) -> abap_bool     " ACTVT '03'
assert_execute( kind, target )                 " raises ZCX_FS_DYN_ERROR, 040, errcat 'AUTH'
```

`CHECK_AUTH` is `PROTECTED` and the class is not `FINAL` — the same seam shape as
`ZCL_FS_DYN_REGISTRY`'s three database primitives. `CL_ABAP_TESTDOUBLE`, which the brief suggested,
cannot double a protected method of the class under test; the house pattern can, and it keeps the
whole policy (width refusal, kind validation, normalisation, three-way split) above the seam where
the tests actually exercise it rather than re-implement it.

### Open question resolved before writing a line: the `ZDYNTGT` width

`ZDYNTGT` is CHAR30. A `SUBM` target is a report name and `PROGNAME` is **CHAR40**. A 31-character
report name would truncate into the authorization field silently, and two reports sharing a
30-character prefix would become one authorization value. **Refused, not truncated**: `CAN_EXECUTE`
answers `abap_false` for anything longer than `C_TARGET_MAXLEN` before `CHECK_AUTH` is reached, and
`ASSERT_EXECUTE` raises the same 040 as any other denial so the answer does not vary with the
reason. Ledger **L-425**. Today the refusal is unreachable through the sanctioned route —
`ZFS_T_DYN_REG-TARGET_NAME` and `ZIF_FS_DYN_HANDLER=>TY_STEP-TARGETNAME` are both CHAR30 — so the
guard is insurance against one of the three widths being widened alone.

Three further fail-closed refusals, all structural (the authorization system is never consulted, so
no role can turn them into a yes): a kind outside `FUNC`/`TABL`/`QURY`/`SUBM`/`REGI`, a blank
target, and `can_admin( actvt = '16' )` — the last being the exact shape of v1's defect.

### Live verification — the real `AUTHORITY-CHECK`, run against DS4/100

A temporary probe inside `LTC_AUTH_LIVE` (removed before the final activation) printed the six real
answers for `FS_DEV3`:

| Call | Real answer |
|---|---|
| `can_execute( 'QURY', 'T000' )` | `abap_false` |
| `can_execute( 'SUBM', <30 chars> )` | `abap_false` |
| `can_admin( )` / `can_admin( '01' )` / `can_admin( '02' )` | `abap_false` |
| `can_audit( )` | `abap_false` |

**What that proves:** the statement compiles against `ZFS_DYNGW`, binds all three fields in **both**
the `FIELD` and the `DUMMY` variant, runs, and denies. **What it does not prove:** that a *grant*
works — nobody could be observed being authorized, because nothing on this system grants
`ZFS_DYNGW` yet. No role, user or profile was created to manufacture either outcome (rule 1).

**Consequence for Task 15, recorded as L-426:** every step of every call will be refused with 040
until a PFCG role carrying `ZFS_DYNGW` / `ACTVT '16'` is built and assigned. Correct fail-closed
behaviour, and a deployment prerequisite that sits next to L-335's "allow-list rows do not travel
with the transport".

### Delivery checks

- [x] `ZCL_FS_DYN_AUTH` **active**, 0 activation errors; `inactiveObjects` carries nothing of mine.
- [x] Suite re-run **after** activation (L-398): `LTC_AUTH` **12/12**, `LTC_AUTH_LIVE` **4/4** —
      16 declared, 16 ran, every `alerts` array empty. Both classes `DURATION SHORT RISK LEVEL
      HARMLESS`, so neither is silently skipped (L-413).
- [x] At least one assertion on `GET_TEXT( )`, not only `MSGNO` — `UNAUTH_EXECUTE_RAISES_040` and
      `REAL_EXEC_AND_ASSERT_AGREE` both assert the rendered text carries no `&` (L-408's net).
- [x] ATC on `ZCL_FS_DYN_AUTH`: **0 findings**, none at any priority
      (worklist `5254001FE7A21FD1ABD92C8B27C40000`).
- [x] One object created, the one the brief authorised. No role, user, profile, runner or scratch
      object. No `$TMP`; package `ZFS_DYN_GW`, transport `DS4K907263`.
- [x] **No message created** — 040 reused from `ZFS_TRM_MSG`, the same number and the same purpose
      `ZBP_FS_DYNGWREGTP` already uses. No text element created or needed.
- [x] Ledger **L-425**, **L-426**, **L-427** written in the same turn.

---

## Fix round 1 - Tasks 10, 12 and 13 (2026-09-13)

**Scope.** Eight review findings (A-H) over **existing** objects. No new functionality and **no
object created** - the only thing minted is message class content, which is a *change* to
`ZFS_TRM_MSG`. Brief: `.superpowers/sdd/2026-09-12-dyngw-v2/fix-round-1-brief.md`.
Report: `.superpowers/sdd/2026-09-12-dyngw-v2/fix-round-1-report.md`.

**Naming gate.** Nothing was named. The only new identifiers are local: `LCL_GUARDED_HANDLER=>INNER`
(a method on an existing local class in `ZCL_FS_DYN_FACTORY`'s CCIMP),
`ZCL_FS_DYN_BUDGET=>READ_ROW_LIMIT` / `C_READ_ROWS` / `C_B_READ` (members of an existing class), and
new test methods inside existing `LTC_*` classes. No TADIR entry is created by any of them, so no
`NAMING:` line is owed.

**Routing.** Every write went through `mcp-abap-abap-adt-api` `lock` / `setObjectSource` / `unLock`
- all eight items are changes to existing objects. `adt-mcp` was used only for activation and ATC.

### What changed, item by item

| Item | Object | Change |
|---|---|---|
| A | `ZFS_TRM_MSG` 039 | Reworded to *"Target &1 belongs to the gateway framework and is not a permitted target"*. The old text ended "...cannot be registered", which is false on the `TABL` route: that refusal fires on a **write**, where nothing is being registered. The catalog Owner column now names all three consumers |
| B | `ZFS_TRM_MSG` 048 (new, W) + `ZCL_FS_DYN_HDL_TABLE` | *"&1: &2 of &3 row(s) written"*, raised on the partial-write path instead of reusing **026** at severity `W` - a success text carrying a partial outcome, the L-370 mistake |
| C | `ZCL_FS_DYN_HDL_REGI=>APPLY_PAYLOAD` | `WHEN OTHERS. CONTINUE.` became a `reject( )` naming the key - **034**, errcat `CLIENT`. `APPLY_PAYLOAD` gained `RAISING zcx_fs_dyn_error` |
| D.1 | `ZCL_FS_DYN_HDL_REGI` | `cx_uuid_error` on the registration UUID now raises **020** / `TARGET` with the reason, matching `ZCL_FS_DYN_REGISTRY=>SAVE_HISTORY`'s identical failure, instead of **034** "invalid payload" |
| D.2 | `ZCL_FS_DYN_HDL_REGI`, `LCL_GUARDED_HANDLER` | "execute called without a successful prepare" now raises **049** *"Internal gateway error in &1: &2"* instead of **020** *"Dynamic call of &1 failed"*. Nothing dynamic is called on either path. Both moved together - see "One extension beyond the brief" |
| E | `ZCL_FS_DYN_BUDGET`, `ZCL_FS_DYN_HDL_QUERY` | New `READ_ROW_LIMIT( )` + `C_READ_ROWS` (1 000). `RESOLVE_MAX_ROWS` can no longer answer 0, so `SELECT_ROWS` can no longer be asked for an unbounded read |
| F | `ZCL_FS_DYN_RUNTIME=>SELECT_ROWS` | A non-zero `offset` with an empty `order_by` is **refused** with **042** / `CLIENT` before the statement, rather than left to the caller's guard |
| G | `ZCL_FS_DYN_FACTORY` (CCIMP + test include) | `LCL_GUARDED_HANDLER=>INNER( )` added; `RETURNS_FRESH_INSTANCE` now asserts the **inner** handlers differ, plus that `INNER( )` is a stable reader |
| H | `docs/message-catalog/DS4_100_NIIF.md` | "Next free number" corrected 047 -> **050**; "All 46" -> "All 49"; the TABL reuse-of-026 paragraph superseded |

### Item F - the decision the brief asked for, and why

**Refuse, do not ignore.** Dropping the offset would answer a request for page 3 with page 1:
correctly formed, indistinguishable from the right answer, and silently wrong - the same class of
silent drop item C exists to close. The refusal reuses **042** *"Paging requires a stable sort order
for &1"*, the same number and the same `CLIENT` category `ZCL_FS_DYN_HDL_QUERY`'s paging guard
already raises, because it is the same rule seen one layer down. The handler's guard is strictly
**stricter** (it also demands the sort end with the source's full primary key, spec 8.2) and stays
where it is; the primitive now merely refuses to emit SQL that cannot run.

### Item E - the spec does not give reads a row default, and that is on record

Spec section 8.2's budget table names *"Write rows per step 1 000"* and, for the read side, only
*"Response bytes 4 MB"*. There is **no read-row default in the spec**. `CHECK_RESPONSE_BYTES` has no
caller yet, so nothing bounded a read at all. `C_READ_ROWS` therefore **mirrors** the write default
of 1 000 rather than inventing a second figure, and is kept as its own constant so the two can be
told apart the day the spec gives reads a number of their own. Flagged in the report.

### One extension beyond the brief, stated plainly

D.2 names only `ZCL_FS_DYN_HDL_REGI`. `LCL_GUARDED_HANDLER` in `ZCL_FS_DYN_FACTORY` carried the
**word-for-word identical** refusal on **020**, for the identical event reached through the wrapper
instead of the handler's own flag. Fixing one and leaving the other would have recreated exactly the
split the finding objects to - a caller getting two different numbers depending on which route ran.
Both moved to 049 in the same turn, and the factory's two guard tests were updated with them.
`ZCL_FS_DYN_FACTORY=>HANDLER_FOR`'s unknown-kind refusal **stays on 020**: that one is a genuine
caller error, not an internal sequence violation.

### Found while working, not caused by this round

`ZCL_FS_DYN_HDL_QUERY`'s `LTD_FAKE_RUNTIME` returned `REF #( )` over a **method-local** table. The
reference is dead the moment the method returns, so the first test ever to call `EXECUTE` through it
short-dumped `GETWA_NOT_ASSIGNED` and took the whole `LTC_QUERY` class down with it ("Not executed
due to runtime error in method ..." on all nine). Six green QURY tests had never exercised `EXECUTE`,
so nobody had dereferenced it. Fixed by moving the table to an instance attribute; written up as
**L-428**. The ABAP Doc / HTML activation warning that the first attempt at documenting it produced
is **L-429**.

### Messages created or changed

| No. | Type | Text |
|---|---|---|
| 039 | E | **Reworded** - *Target &1 belongs to the gateway framework and is not a permitted target* |
| 048 | W | **New** - *&1: &2 of &3 row(s) written* |
| 049 | E | **New** - *Internal gateway error in &1: &2* |

Written via `mcp-abap-abap-adt-api` on `/sap/bc/adt/messageclass/zfs_trm_msg`, transport
**`DS4K907194`** (confirmed live by `transportInfo` before the write - the object is locked in that
task, *not* in the gateway's `DS4K907263`). `adt-mcp` has no `MSAG` adapter, the confirmed exception
under working agreement section 5. Verified after the write with
`SELECT COUNT(*) FROM t100 WHERE sprsl = 'E' AND arbgb = 'ZFS_TRM_MSG'` -> **49** (was 47), plus a
row read of 039-049 confirming each text. Catalogued in the same turn.

### Objects touched

| Object | Type | Change | State |
|---|---|---|---|
| `ZFS_TRM_MSG` | MSAG (change) | 039 reworded, 048 + 049 added | Live in `T100`, 49 rows |
| `ZCL_FS_DYN_BUDGET` | CLAS (change) | `C_READ_ROWS`, `C_B_READ`, `READ_ROW_LIMIT( )`, 2 tests | **Active** |
| `ZCL_FS_DYN_RUNTIME` | CLAS (change) | `SELECT_ROWS` offset/order invariant, 3 tests | **Active** |
| `ZCL_FS_DYN_HDL_QUERY` | CLAS (change) | `RESOLVE_MAX_ROWS` via the budget; double fixed (L-428), 3 tests | **Active** |
| `ZCL_FS_DYN_HDL_TABLE` | CLAS (change) | 048 on the partial write, test asserts number **and** text | **Active** |
| `ZCL_FS_DYN_HDL_REGI` | CLAS (change) | 034 on an unknown key, 020 on the UUID failure, 049 on no-prepare, 2 tests | **Active** |
| `ZCL_FS_DYN_FACTORY` | CLAS (change) | `INNER( )` on the CCIMP guard, guard on 049, item G assertion | **Active** |

### Delivery checks

- [x] Every touched object **active**, 0 activation errors. `inactiveObjects` carries nothing in
      `ZFS_DYN_GW`. What remains inactive - `ZFS_C_SLCDTTKFEETP`, `ZFS_I_SLCCFEETYPE`,
      `ZFS_I_SLCDFEETYPE`, `EZFS_T_DEALID` - belongs to other packages and other tasks and was
      already inactive on arrival.
- [x] Suites re-run **after** activation (L-398), method counts read off `unitTestRun`, every
      `alerts` array empty, every class `DURATION SHORT RISK LEVEL HARMLESS` so none is silently
      skipped (L-413):
      `LTC_BUDGET` **12/12** - `LTC_RUNTIME` **5/5** - `LTC_QUERY` **9/9** - `LTC_TABLE` **9/9** -
      `LTC_REGI` **11/11** + `LTC_REGI_LIVE` **3/3** - `LTC_FACTORY` **9/9** + `LTC_FACTORY_LIVE`
      **3/3**. Regression check on the untouched `LTC_REGISTRY` **9/9**. Total **70 declared, 70
      ran, 0 alerts**.
- [x] Every message this round touched is asserted on its **rendered** text, not only on `MSGNO`
      (L-408): 039's route-neutral wording *and* the absence of the old wording, 048's "1 of 2"
      *and* the absence of "successfully", 049's reason *and* the absence of "Dynamic call", 034's
      named key, 042's named source. Every one also asserts the text holds no `&`.
- [x] ATC on the six classes: **0 errors (priority 1), 0 warnings (priority 2)**, 35 informational
      findings (priority 3) across 6 objects - worklist `5254001FE7A21FD1ABD94CB5F15A0000`.
- [x] **No object created.** `INNER( )` and `READ_ROW_LIMIT( )` are members of existing objects;
      every new test method sits in an existing `LTC_*`. No `$TMP`; package `ZFS_DYN_GW`, transport
      `DS4K907263` (the message class on `DS4K907194`, where it is locked).
- [x] `ZFS_T_DYN_REG` **not seeded** - still 0 rows. `LTC_FACTORY_LIVE=>REAL_REGISTRY_EMPTY_017`
      still passes against the real, empty table.
- [x] Messages 039 (reworded), 048 and 049 catalogued in `docs/message-catalog/DS4_100_NIIF.md` in
      the same turn, with the "next free number" corrected to 050 (item H).
- [x] Ledger **L-428**, **L-429** written in the same turn.


---

## Task 15 — `ZCL_FS_DYN_DISPATCH` + `ZFS_RFC_DYN_EXECUTE` (2026-09-13)

**Scope.** The dispatcher and the execution session — the first object that can run a whole
request end to end, and the task that closes L-350. Brief:
`.superpowers/sdd/2026-09-12-dyngw-v2/task-15-brief.md`, addendum `task-15-addendum.md`
(the addendum wins where they disagree).

### Naming gate — written BEFORE the create calls

```
NAMING: ZCL_FS_DYN_DISPATCH -> matches "Class | ZCL_FS_<AREA>_<NAME>" (docs/naming-conventions.md
        line 116), AREA=DYN (approved AREA code, L-376), NAME=DISPATCH. Also listed verbatim in
        the spec's own naming block (2026-09-12-1033-dyngw-v2-design.md section 4).
NAMING: ZFS_RFC_DYN_EXECUTE -> matches "RFC function module | ZFS_RFC_<NAME>"
        (docs/naming-conventions.md line 130), NAME=DYN_EXECUTE; same shape as the sibling
        ZFS_RFC_DYN_SUBMIT already in function group ZFS_FG_DYN_GW. Listed verbatim in spec
        section 4.
NAMING: LTC_DISPATCH, LTC_DISPATCH_LIVE -> "Test class (local) | LTC_<NAME>" (line 119);
        LTD_AUTH_OK / LTD_AUTH_DENY / LTD_REG_DB / LTD_RUNTIME -> the project's established LTD_
        prefix for doubles. Local classes inside the authorised test include, no TADIR entry.
```

No exception row needed for either name.

### Build and recovery

- Re-read live state before writing. `ZCL_FS_DYN_DISPATCH` already existed as a 671-line inactive
  class with an empty test include; it was not recreated or deleted. Its recovered production
  source passed syntax check with one non-blocking ABAP Doc placement warning and then activated.
- The abandoned editor left `SEOCLSENQ / ZCL_FS_DYN_DISPATCH` locked under `FS_DEV3`. The exact
  lock was observed in SM12; no SM12 deletion was performed by this build agent. The user cleared
  the locks, after which the existing object was changed normally through
  `mcp-abap-abap-adt-api`.
- `ZFS_RFC_DYN_EXECUTE` was confirmed absent, validated and created with official `sap_adt` in
  `ZFS_FG_DYN_GW`, package `ZFS_DYN_GW`, transport `DS4K907263` (task `DS4K907264`). Its source was
  then written through the change MCP, never through SAP GUI.

### Dispatcher behavior now active

- Resets the shared registry once per request, checks request bytes and step count, and seeds every
  step as planned (`P`).
- Phase 1 gates authorization per step (`EXECUTE` for QURY/FUNC/TABL/SUBM, ADMIN for REGI), obtains
  one fresh guarded handler per step, passes `operation` on every registry `resolve`, and prepares
  every handler before anything executes. A refusal executes nothing.
- Phase 2 executes those same handler instances. A technical step error or response-byte refusal
  stops the batch and rolls the LUW back; successful AUTO/ALWAYS commits, NEVER rolls back.
  BUSINESS is an outcome category, not a dispatch failure, and therefore commits under AUTO.
- `CHECK_WALL_CLOCK` runs at every boundary in both phases. A JOB-mode SUBM already in progress is
  not interrupted: it may consume its own 400-second poll budget, then the next step boundary
  applies the 300-second request budget. The affected SUBM row explicitly reports that its writes
  are outside the dispatcher rollback.
- The class contains no durable logging RFC. Logs are written only after this execution session
  returns, in the RAP LUW above; this preserves the transaction ordering that closes L-350.

### RFC interface decision (L-430)

The plan's table-valued RFC interface was not implementable from the authorized Task 15 inventory:
there is no DDIC request/result structure or table type, `ZFS_T_DYN_STEP` is a log row rather than an
input step, and class-local deep types cannot cross a remote-enabled interface. The function module
therefore uses `IV_STEPS_JSON`, `EV_STEPS_JSON` and `EV_RESULT_JSON`, plus a scalar DDIC/basic result
header. `IV_ACTION`, `IV_COMMIT_MODE`, `IV_REQUEST_ID` and `IV_CALL_UUID` remain explicit inbound
fields. JSON is checked before deserialization, and request bytes include the serialized steps and
envelope scalars. No helper DDIC object was invented.

The user set the SE37 Remote-Enabled metadata manually, the same L-324 limitation as the sibling
`ZFS_RFC_DYN_SUBMIT`: neither ADT server exposes that radio button. The first remote activation
correctly rejected `EV_COMMITTED` / `EV_ROLLED_BACK TYPE ABAP_BOOL`; the RFC-safe correction is
`CHAR1`. Source changes remain routed through the change MCP, not SAP GUI.

### Verification

- Dispatcher suite after activation: `LTC_DISPATCH` **6/6** and `LTC_DISPATCH_LIVE` **1/1**,
  both SHORT/HARMLESS, every alerts array empty. The live method executed the real authorization
  statement and observed the expected deployed state: message 040, `AUTH`, rendered text with no
  placeholder, and zero runtime calls. No role/user/profile/registry row was created.
- Full framework census after activation: **116 declared / 116 executed / 0 alerts** across
  RUNTIME 5, REGISTRY 9, QUERY 9, FUNC 5, TABLE 9, SUBMIT 9, REGI 14, FACTORY 12, JSON 9,
  BUDGET 12, AUTH 16 and DISPATCH 7. Every returned test class was `DURATION SHORT`.
- Live `ZFS_T_DYN_REG` read returned zero rows. No allow-list seed was added.
- ATC worklist `5254001FE7A21FD1ABD9ADE215F6C000`: dispatcher 0 P1 / 0 P2 / 3 P3. Before the RFC
  metadata change the function module showed four P2 `Slow parameter passing` findings for its
  `STRING` parameters and one new P3 for the deliberate boundary `ROLLBACK WORK`; the remaining
  group findings belong to the pre-existing SUBMIT sibling. Re-run after remote activation is a
  delivery check below.

### Delivery checks

- [x] Existing dispatcher recovered without recreate/delete and active.
- [x] Official initial creation route used for `ZFS_RFC_DYN_EXECUTE`.
- [x] Operation pin proved on a non-TABL registry row (018, no runtime call).
- [x] Request/step/wall-clock/write-row/response-byte budget wiring present; request-byte wiring
      has an executable refusal test, and the other budget primitives retain their dedicated suite.
- [x] Two-phase no-execute, rollback, NEVER and BUSINESS/AUTO transaction outcomes covered.
- [x] Highest-value safe live check run: the real authorization denial path. A positive FUNC call
      cannot pass until a role grants `ZFS_DYNGW` ACTVT 16; none was manufactured.
- [x] No messages or text elements created or changed.
- [ ] Confirm `TFDIR-FMODE = 'R'`, activate the RFC-safe signature, re-run ATC, then re-run the
      116-method census and read back both active sources.
