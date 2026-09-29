# Dynamic OData Gateway v2 — integration guide

How to call `ZFS_SB_DYNGW_O4_API` for the first time, what has actually been proved to work, and
what you would need to do to prove the rest yourself.

| Document | For |
|---|---|
| **this file** | first-time setup and a proof-graded checklist |
| [`dyngw-v2-how-it-works.md`](dyngw-v2-how-it-works.md) | architecture, design reasoning, the proved/unproven distinction in depth |
| [`dyngw-v2-api.md`](dyngw-v2-api.md) | field-by-field request/response reference |
| `.superpowers/sdd/2026-09-12-dyngw-v2/task-18-report.md` | the underlying live evidence this guide is built from |

**v1 is superseded, not retired.** `ZFS_SB_DYNGATEWAY_O4_API` (`dyngateway-integration-guide.md`)
is a separate, still-running service. This guide is for the v2 rebuild only — do not mix the two
base URLs or action namespaces.

---

## 1 · Before you call it

| # | Requirement | How to check |
|---|---|---|
| 1 | Service is published | `GET <base>/?sap-client=100` → 200, service document listing `CallLog`/`CallStep`/`Registry`/`RegistryHistory` |
| 2 | Messages 017–049 exist in `ZFS_TRM_MSG` | `docs/message-catalog/DS4_100_NIIF.md` — verified live against `T100` as of 2026-09-13 (49 rows, no drift) |
| 3 | The registry has rows for what you want to call | `GET <base>/Registry?sap-client=100` |
| 4 | Your user holds `ZFS_DYNGW` with `ACTVT 16` (execute) for the target kind/name you need | ask an administrator — see §5 |
| 5 | If you plan to register targets yourself, your user also needs `ACTVT 01`/`02` | same |

**The allow-list does not travel with a transport** — it is application data
(`deliveryClass #A`), same as v1. A freshly imported system answers 017 to every call until
targets are registered on it. `RegisterTarget` (single-shot) or a batch of `REGI` steps
(`ExecuteBatch`) does the registration; there is no bulk-import route beyond that.

## 2 · The base URL

```
<host>:<port>/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001
```

`?sap-client=100` on every call, `srvd_a2x` (not `srvd`) as the repository segment — the same
gotchas that cost v1 an L-252/L-253 apply here unchanged; nothing about the URL shape is new in
v2.

## 3 · Get a CSRF token and read the metadata

```
GET <base>/$metadata?sap-client=100
    X-CSRF-Token: Fetch
```

Note the `x-csrf-token` response header and the session cookie; both go on every subsequent
write. Plain `GET`s (reading `/CallLog`, `/Registry`, etc.) need no token.

## 4 · Your first call — read a table

```
POST <base>/CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.RunQuery?sap-client=100
Content-Type: application/json
X-CSRF-Token: <token>

{ "TargetName":"T000", "FieldsJson":"[\"MANDT\",\"MTEXT\"]",
  "FilterJson":"", "OrderByJson":"", "MaxRows":3, "SkipRows":0, "RequestId":"" }
```

This exact call, against `T000`, is **proved live** (Task 18) and returns HTTP 200,
`ExecStatus:"S"`, `ResultCount:3`, and the three client rows in `RowsJson`. Use it as your
liveness check — `T000` is registered on `DS4_100_NIIF` today. If `T000` is not registered on
your target system, register it first (§6) or ask an administrator to.

`abap_boolean` fields elsewhere in the API (`IsActive`, `AllowRead`, `AllowWrite`) are
`Edm.Boolean` — send `true`/`false` unquoted, never `"X"` (L-475: `"X"` is a 400 XML parse error,
not a clean refusal).

## 5 · Registering yourself as a caller

There is no self-service enrollment. An administrator (someone with `ZFS_DYNGW` `ACTVT`
`01`/`02`) assigns you a PFCG role carrying `ZFS_DYNGW` scoped to the kinds/targets you need at
`ACTVT 16` (execute), and `ACTVT 03` (audit) if you also need to read `/CallLog`/`/CallStep`/
`/RegistryHistory`. **Tell your administrator, explicitly, to maintain `ZDYNTGT` as single target
values** — never as a range. A role built as an interval (e.g. blank-to-`ZZZZZZ` "to cover
everything for now") silently grants full `*` scope, because `PFCG_AUTH` evaluates the field as
an interval and that interval brackets the literal `*` character (L-441). This is the single most
consequential thing to get right when a role is first built, and it fails silently if got wrong.

**What has not been proved, and why it matters to you:** every read and write made during this
service's build was made by one user (`FS_DEV3`) holding full-scope access to every activity. No
one has yet exercised this service as a genuinely restricted caller. If you are the first
consumer with a target-scoped or `EXECUTE`-only role, you are also, in effect, the first live test
of whether the authorization design actually restricts you — treat an unexpected refusal (or an
unexpected success) as worth reporting, not just working around.

## 6 · Registering a target

Single-shot:

```json
POST <base>/CallLog/<ns>.RegisterTarget?sap-client=100
{ "TargetName":"T001", "Operation":"INSERT",
  "ImportJson":"{\"TargetKind\":\"QURY\",\"Operation\":\"SELECT\",\"IsActive\":true,\"AllowRead\":true,\"MaxRows\":20}",
  "RequestId":"" }
```

Or as a batch (`REGI` steps), one call per target, `ExecuteBatch`. `INSERT` (the default) fails
with message 035 if the target already exists — widening an existing registration must be typed
out as `UPDATE`; that asymmetry is deliberate, so a registration is never accidentally widened.

**Self-protection, proved live:** registering `ZFS_T_DYN_REG` itself (or anything matching
`ZFS_T_DYN_*`/`ZFS_RFC_DYN_*`) is refused with message 039 and writes nothing to either the
registry table or its history table — this is the fix for the privilege-escalation hole v1 had.

**Duplicate registration in one batch, proved live:** two `REGI` steps for the same new target in
one `ExecuteBatch` call fail cleanly in phase 1 (message 035), before either step touches the
registry table — the second step's own pending declaration is checked against, not just committed
rows.

### 6a · Registering a generation-enabled target

Two more registry columns, `AllowGen` (boolean) and `GenNrObject` (the one number range object
this target may draw from, or blank), gate `ExecuteTableCrud`/`GenerateJson` (see
`dyngw-v2-api.md` §3.3). Set them through the same `RegisterTarget` route as every other column —
**proved live** (2026-09-15, this dyngw v2 generators build), after a real gap was found and
fixed:

```json
POST <base>/CallLog/<ns>.RegisterTarget?sap-client=100
{ "TargetName":"ZFS_SLC_OTTK_BTP", "Operation":"UPDATE",
  "ImportJson":"{\"TargetKind\":\"TABL\",\"AllowGen\":true,\"GenNrObject\":\"ZFS_OTTK_D\"}",
  "RequestId":"" }
```

**What was originally broken, and how it was fixed (L-517).** The first live attempt at this call
was refused with message **034** ("unknown field ALLOWGEN") — `ZCL_FS_DYN_HDL_REGI`'s payload
handler had never been extended to accept the two new columns, even though the registry table,
CDS views and behavior definition all supported them. Fixed by adding `AllowGen`/`GenNrObject` to
`ZCL_FS_DYN_HDL_REGI`'s accepted-key list, the same pattern as the four columns already settable
this way (`AllowRead`/`AllowWrite`/`CallMode`/`MaxRows`/`LogLevel`). After the fix, the call above
answers `ExecStatus 'S'`, and `/RegistryHistory` shows a `ChangeType 'U'` row with
`"ALLOW_GEN":"X","GEN_NR_OBJECT":"ZFS_OTTK_D"` in `AfterJson` — confirmed live, not assumed.

Clearing generation rights uses the identical route with the opposite values —
`{"AllowGen":false,"GenNrObject":""}` — also proved live (used to reset a probe target after
testing; same mechanics, same `RegisterTarget UPDATE` call, booleans unquoted per L-475).

**Self-protection is unaffected.** Attempting `AllowGen:true` on `ZFS_T_DYN_REG` itself is still
refused with message 039, nothing written — the escalation-closing guard from §5 (L-441/039)
applies identically to the new columns; there is no separate path around it.

## 7 · Batching, and what its rollback guarantee does and does not cover

`ExecuteBatch` validates every step before executing any (phase 1), then executes and, on a
runtime failure, rolls back and reports which step failed (phase 2). **Both halves are now proved
live.** Phase 1: two `REGI` steps registering the same target in one batch fail cleanly before
either touches the registry table (message 035). Phase 2: **L-496 (2026-09-13)** reproduced a real
abort — a `TABL INSERT` that genuinely wrote, followed by a failing `FUNC` step in the same batch —
with a positive control (the identical write run alone, uncommitted, confirmed present) proving the
empty table afterward means "rolled back," not "never wrote." Note the plan's own original literal
test case (two `TABL INSERT` steps racing a primary key) still does **not** produce a phase-2
failure by itself — a primary-key collision is absorbed as a partial-write success (message 048),
not an abort; the working reproduction used a genuinely failing step instead. See
`dyngw-v2-how-it-works.md` §7 for the full account. **Practical guidance either way: check
`RowsJson`/`StepsJson` per step, or re-read what you wrote, rather than assuming all-or-nothing from
`ExecStatus` alone** — this is good practice regardless of how well-proved the rollback guarantee
is.

A batch may not mix a step whose work **leaves** the execution session's LUW with a step that
writes **inside** it (`TABL`/`REGI`/a local `FUNC`) — refused in phase 1, message 020 on the
offending step and 045 at call level. Two kinds of step leave the LUW: every `SUBM` step, and **a
`FUNC` step in call mode `'R'`, which is the default for any remote-enabled function module** — a
blank `CALL_MODE` on the registry row falls back to `TFDIR-FMODE`, so most BAPIs resolve to `'R'`
unless you say otherwise. Either split the work into two calls, or register the `FUNC` target with
`CALL_MODE` `'L'` so the call stays inside the batch's transaction. `CommitMode` `AUTO` and
`ALWAYS` behave identically today; there is no live case that distinguishes them.

## 8 · Idempotency

Send a stable, unique `RequestId` on every call you might need to retry safely. A repeat with the
same `RequestId` is answered from the stored row (`Replayed:"X"`, same `GwUuid`, nothing
re-executed) — proved live. If you omit `RequestId`, the framework substitutes the call's own
generated UUID internally so the underlying unique index is never violated, but this means **a
blank `RequestId` never matches a prior blank-`RequestId` call** — omitting it is equivalent to
opting out of replay protection, not a shortcut to it.

## 9 · A proof-graded checklist for going live against a new system

Before depending on this service for anything real, confirm each of the following for **your own
system and your own caller**, not just for `DS4_100_NIIF`/`FS_DEV3`:

- [ ] `RunQuery` against a registered target returns rows (§4)
- [ ] `RunQuery` against an unregistered target returns HTTP 200/`ExecStatus:"E"`/message 017 on
      the step, not an HTTP error
- [ ] Self-registration of `ZFS_T_DYN_*` is refused (message 039) — confirms the escalation fix
      travelled with your import
- [ ] A restricted `ZFS_DYNGW` role actually restricts what your caller sees on `/CallLog` and
      `/CallStep` (§5) — **this is not proved anywhere yet; you would be establishing it**
- [ ] Your role's `ZDYNTGT` is maintained as single values, confirmed by having an administrator
      display the role's authorization values, not just trusting the maintenance screen's summary
- [ ] `ExecuteBatch` rollback: both phase-1 and phase-2 are proved on `DS4_100_NIIF` (§7,
      L-496) — if you depend on it on a different system, confirm the same positive-control
      reproduction there rather than assuming it travels with the code
- [ ] If you plan to use `SUBM`, register and smoke-test the specific report first — no report is
      registered or proved against v2 as of this writing
- [ ] If you plan to use `GenerateJson` (§6a), confirm on your own system: `Uuid` fills a fresh
      `sysuuid_x16`; `NumberRange` draws from your registered `GenNrObject` and refuses a mismatch
      (message 051); `SysFields:"AUDIT"` fills the five RAP audit fields; generation against an
      `AllowGen:false` target is refused (message 052) — all **proved live on `DS4_100_NIIF`**, but
      re-confirm on a system you have not yet exercised this on
- [ ] **Before relying on `NumberRange` for anything where "burned or not" matters, prove it live
      on your own number range object** — `ZFS_OTTK_D` on this system was found to survive a batch
      abort (the drawn number was reused, not burned), contradicting the original design assumption
      that a number range is always permanently burned (L-519). This is a per-object,
      per-system fact, not a platform constant — do not assume either answer without testing it
- [ ] **Never send a partial row on `ExecuteTableCrud MODIFY` and expect the rest to survive** —
      it is a full-row replace, not a merge (L-520); a real test row on `DS4_100_NIIF` had its
      create-audit columns and every unlisted business field wiped by exactly this mistake

## 10 · Known limits, summarized

See `dyngw-v2-how-it-works.md` §5/§8 and `dyngw-v2-api.md` §8 for the full list with reasoning:
`SUBM` — **and a `FUNC` step in call mode `'R'`, the default for a remote-enabled FM** — cannot
share a batch with an in-LUW write step and is outside any rollback; every `FUNC` target must be
registered `AllowWrite: true` even when read-only (L-491, deferred, fails closed); `CommitMode` `ALWAYS`
== `AUTO` today; a `TABLES` parameter you don't name is never bound; `MaxRows: 0` means "no
override", not "unlimited"; deep action parameters (a real nested array) don't work on this
release, hence the `StepsJson` string; `ZDYNTGT` must stay single-valued; and `/CallLog` needs
full target scope while `/CallStep` can be genuinely restricted. **Generators (§6a):** one number
range object per registry row; `TABL` writes only, never `FUNC`/`SUBM`; `Uuid`/`NumberRange`
refused on `MODIFY`, everything refused on `DELETE`; a generated number range value is not
reliably outside rollback (L-519, per-object/per-system, prove it yourself); `MODIFY` is a
full-row replace regardless of `GenerateJson` (L-520) — resend the whole row, always.

## 11 · Building a browser console over this service

A first console was built end to end against this API — `web/dynamic-gw/dyngw-v2-console/` (port 8773) — and
every read and write in it goes through the gateway, not a dedicated OData service. It created,
edited and deleted a real `ZFS_SLC_OTTK_BTP` row (`ZOTTK_NO 100055`) through the real UI, with the
gateway generating the UUID, the number and the audit block. Getting there cost a series of live
discoveries that the metadata alone does not tell you. This section exists so the next console does
not pay for them again — **treat `web/dynamic-gw/dyngw-v2-console/` as the reference implementation and point
at it; do not copy its code wholesale into this guide.**

### 11a · `dynCall()` — the wrapper, and why it cannot be skipped

Every console needs one thin function that every action call goes through — `dynCall()` in
`web/dynamic-gw/dyngw-v2-console/index.html`. It exists because a plain `fetch` gets four things wrong, each
found live:

- **A refusal is HTTP 200, not an HTTP error.** `ExecStatus:"E"` on a 200 response is the failure
  signal. A raw `fetch` that only checks `response.ok` renders every refusal as a happy path.
- **The call header's own message is not the real one.** Every action is internally a batch, so a
  failed call carries a truncated, generic **045** ("Batch aborted at step 1: …") at the top level.
  The real message — 017 (not registered), 022 (bad JSON nesting), 039 (self-protection), 050–054
  (generator refusals) — is on the **step**, not the header. Surface the step's message, not 045.
- **There is no inline step detail to read it from.** A single-shot response's own `StepsJson`
  comes back `""` — never populated, refusal or not (L-523). The only way to get the real message
  is a follow-up `GET /CallLog(<GwUuid>)?$expand=_Steps`. `dynCall()`'s `stepDetail()` helper does
  this fetch on every non-`'S'` result (and see `MessageNo`/`MessageText` shape on the header vs.
  `msgno`/`msgtext` on the expanded step — the two payloads name the same fields differently).
- **`Severity 'W'` is neither success nor failure.** Message **048** (a partial write) comes back
  as `ExecStatus:"S"` — treating `'S'` alone as clean success hides it. `dynCall()` still resolves
  (does not throw) on `Severity:'W'`, but attaches a `dynWarning` string built the same way as the
  error path, so the caller can render both the success count and the partial-write warning instead
  of picking one.

The reference implementation (`web/dynamic-gw/dyngw-v2-console/index.html`, function `dynCall`, roughly lines
332–355) is short enough to port verbatim: POST the action, check `ExecStatus`, expand `_Steps` on
anything other than a clean `'S'`, and surface the step's message over the header's. Every other
panel in the console — list, create, edit, delete, trace — calls `dynCall()` and never touches
`fetch` on `/api/dyngw/...` directly.

### 11b · The proxy pattern, and two bugs found in consoles copied before this one

The console does not talk to SAP from the browser — a small local Python proxy
(`web/dynamic-gw/dyngw-v2-console/proxy.py`) holds the Basic Auth header and the CSRF token/cookie jar, so
credentials never reach client-side JS and the page is same-origin by construction (no CORS setup
on the gateway side). `proxy_request()` fetches a CSRF token on first write and re-fetches once on
a 403 (token expiry) before giving up. Two bugs were found and fixed in this build that were
**already present, uncaught, in the older consoles this one was copied from**:

- **Forcing `Accept: application/json` on every request breaks `$metadata`.** `$metadata` is
  XML-only in OData v4; forcing JSON on it gets a 406. Fix: `proxy.py` special-cases any path
  ending in `$metadata` and leaves the server's default (XML) `Accept` header alone (see
  `proxy_request()`'s `attempt()` closure).
- **Appending `sap-client` unconditionally is a 400, not a no-op.** If the caller's query string
  already carries `sap-client=...` and the proxy appends its own on top, SAP answers a URI syntax
  error (400) rather than tolerating the duplicate. Fix: `_service_url()` only appends
  `sap-client=<client>` when `sap-client=` is not already present in the incoming query string.

Both are a few lines; both are easy to miss if a proxy is copy-pasted without re-reading it against
this service specifically, because older, non-dyngw consoles never happened to exercise `$metadata`
or a client-qualified query from the browser.

### 11c · Provisioning and registry-driven UI gating

A freshly pointed console has nothing registered (§1, §6) — this is normal, not an error state. The
pattern proved live:

- One `ExecuteBatch` of `REGI` steps registers every target the console needs in a single call
  (`provisionTargets()` in the reference, building on §6/§7's three-level JSON nesting).
- On load — and on demand — the console reads `GET /Registry` and gates every action against it
  (`targetGate()` / `renderRegistry()` in the reference): an action whose target is missing or
  `IsActive:false` is disabled **with a visible reason** ("not registered" / "inactive") rather than
  left clickable to fail with a raw 017 the user has to interpret.
- **Re-running provisioning against already-registered targets correctly refuses, with message
  035** — `RegisterTarget`'s default `Operation` is `INSERT`, not `UPSERT`, by design (§6). A
  provisioning button is safe to leave clickable after first use; it will refuse cleanly, not
  silently re-widen anything.

### 11d · The Gateway Trace panel

Every console needs a way to show what actually happened, not just what the UI claims happened.
The reference's trace panel is four fixed entity-set `GET`s — `/CallLog?$expand=_Steps`,
`/Registry`, `/RegistryHistory` — identical for every console built on this service, because they
are the same four backing tables regardless of what business object the console is about. Two
non-obvious points:

- **`ZFS_T_DYN_*`/`ZFS_RFC_DYN_*` can never be a registered target** (039 self-protection, §6) —
  those tables *are* `CallLog`/`CallStep`/`Registry`/`RegistryHistory`. Read them directly as
  entity sets; do not try to register or `RunQuery` them.
- **Reading the trace through `RunQuery` would write its own row into the log it exists to
  display.** The reference panel reads the four entity sets directly instead, and only re-queries
  them on first load and on explicit demand (a refresh action) — never on a timer or after every
  unrelated action — specifically to avoid this self-pollution.

### 11e · The read/write traps, in one place

Everything below was already documented elsewhere in this guide or in the ledger; gathered here
because a console exercises all of it in one afternoon and each trap costs a live discovery if hit
cold:

- Always send `FieldsJson` explicitly — the all-columns default breaks on a table with a DDIC
  `.INCLUDE` (L-316, §4).
- Always send an explicit `OrderByJson`, or expect message **042**.
- `MaxRows` is capped by the target's **registered** `MaxRows` in `/Registry`, not by whatever the
  request asks for — exceeding it is a hard refusal, message **025** (L-524), not a silent clamp.
- Booleans unquoted (`true`/`false`, not `"X"` — L-475, §4) and amount/currency fields unquoted as
  JSON numbers, never strings (L-244, same rule as the OData smoke-test guidance elsewhere in this
  repo).
- `*Json` fields nest three levels deep inside a batch step (L-335, §7) — build innermost-first.
- **`ExecuteTableCrud MODIFY` is a full-row replace, not a merge** (L-520, §9's checklist) — a
  partial payload silently blanks every column it omits, `LOCAL_CREATED_BY` included. Always resend
  the whole row, including fields the UI didn't let the user touch.
- **`ExecuteTableCrud DELETE` keys on the table's real primary key** (`CLIENT`+`UUID` for
  `ZFS_SLC_OTTK_BTP`), never on a business/display field like `ZOTTK_NO` (L-522). A key mismatch is
  a **silent no-op** — `ExecStatus:"S"`, `ResultCount:0` — not a refusal, so a delete action must
  check `ResultCount` before telling the user it worked.
- **Registration kind must match dispatch kind.** A `TABL` registration does not authorize a `QURY`
  read of the same table — `RunQuery` dispatches as step kind `QURY`, and a target registered only
  `TABL` is refused with message **017** even though it is genuinely registered (L-526). A table the
  console both writes (via `ExecuteTableCrud`) and reads (via `RunQuery`) needs **two separate
  registrations**, one per kind.

### 11f · Honest limits — carried over, not re-proved, by this build

A guide that omits these sets the next console up to build something that cannot work as expected:

- **`IsCommitted`/`IsRolledBack` are not persisted.** They come back on the action's own response
  type (`ZFS_AE_DynGwResult`) but are **not** written to `ZFS_T_DYN_CALL` (L-525, confirmed by
  reading the table's DDIC source, not just inferred from a failed query). A trace panel reading
  `/CallLog` after the fact **cannot** show whether a call actually committed or rolled back — that
  information exists only in the synchronous response at the moment of the call. L-497 ("proved
  end to end") is narrowed by this, not closed: the rollback mechanism itself is proved (§7,
  L-496), but its outcome is not auditable after the fact from `/CallLog` alone.
- **A generated number range value is not reliably outside rollback on this system** (L-519, §9) —
  if a console's UI implies "the number you see is permanently yours," that implication is not
  proved and should not be made without testing it on the target system first.
- **The reference console's pager is not wired to `SkipRows`.** Its list panels are capped at
  whatever `MaxRows` the target is registered for (§11e) and do not page past that. Anyone who
  needs to browse a full table through this console pattern still has to wire `SkipRows` — it was
  not needed for this build's OTTK/DTTK list panels and was not built.

Following the rule that governed the rest of this build: mark each of the above proved or not
proved by what actually happened, not by what the design intended. Where this build exercised
something live — `dynCall()`'s four behaviors, the two proxy bugs, provisioning idempotency, all of
§11e's traps — say so as proved. Where something is carried over untested from the design or from
an earlier console — 048 partial-write *rendering* specifically (the mechanism is proved, but this
console's own display of it was not exercised against a real 048 during the build), filter UI,
CSV export — say that instead, explicitly, rather than implying uniform confidence.
