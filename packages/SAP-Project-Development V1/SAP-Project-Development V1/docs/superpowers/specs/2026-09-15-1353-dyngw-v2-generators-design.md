# Dynamic Gateway v2 — server-side field generators — design

- **Date:** 2026-09-15
- **System:** DS4_100_NIIF (`DS4` / client `100`)
- **Package:** `ZFS_DYN_GW`
- **Transport:** to be confirmed live at implementation (`transportInfo` before the first write)
- **Requested by:** human (karthik.r@fourthsignal.com)
- **Status:** **Implemented**, 2026-09-15, transport `DS4K907263`. 12 of 14 acceptance criteria
  (§12) passed live; criterion 9 failed in the sense recorded in §10's correction below (L-519) —
  the row-rollback half of the guarantee held, the number-survives-rollback half did not, and §10
  is corrected in place rather than left standing as written. Criterion 11 failed on the first
  pass (`RegisterTarget` refused the two new fields, L-517) and passed after a live fix (see
  `.superpowers/sdd/2026-09-15-1410-dyngw-v2-generators/task-8-report.md`). Criterion 14 failed and
  is documented as a real, undecided data-loss trap (L-520), not fixed as part of this change. Open
  question 2 (`ZOTTK_NO` band) is **answered** — see §15.
- **Builds on:** `2026-09-12-1033-dyngw-v2-design.md`. That service is left running; this is an
  additive change to it, with one deliberate breaking change scoped in §7.

---

## 1 · The gap this closes

A caller that wants to write a row into a real application table through the gateway cannot fill
the two fields that matter most: a `sysuuid_x16` key, and a key drawn from a number range object.

The workaround does not exist. `NUMBER_GET_NEXT` *can* be registered as a `FUNC` target with
`CALL_MODE 'L'` — L-496 did exactly that as part of the rollback proof — but **a batch step cannot
consume an earlier step's output**. So `[FUNC get-number, TABL insert]` obtains a number and then
has no way to put it in the row. The missing piece is data flow, not number generation.

Today a client must therefore invent both values itself, which means:

- **UUID:** guessing how a raw 16-byte field crosses JSON. `/ui2/cl_json` emits raw fields
  **base64** on the way out; what `ExecuteTableCrud` accepts on the way *in* has never been tested.
- **Number:** a `SELECT MAX(...) + 1` read-modify-write from the client, which races, ignores the
  real number range object, and silently diverges from what the owning BO would have assigned.

For the motivating case — `ZFS_SLC_OTTK_BTP`, whose `ZOTTK_NO` is generated from number range
object `ZFS_OTTK_D` (message catalog, `015`) — a client-side number is simply the wrong number.

A second, adjacent gap is closed in the same change: **L-497** — `ZCL_FS_DYN_DISPATCH=>TY_RESULT`
computes `committed` and `rolled_back` on every path, but neither is exposed on
`ZFS_AE_DynGwResult`, so an OData caller cannot read the transaction outcome at all.

## 2 · Decisions taken

| # | Decision | Chosen | By |
|---|---|---|---|
| 1 | Where generator permission lives | **Hybrid** — the registry row permits, the call names the field | human, 2026-09-15 |
| 2 | Generators provided | UUID · number range · system/audit fields · plus expose `Committed`/`RolledBack` | human, 2026-09-15 |
| 3 | Generality | **Targeted field generators now**; general step-output binding designed and deferred (§14) | human, 2026-09-15 |
| 4 | Build order | **Framework first**, console second | human, 2026-09-15 |
| 5 | Number range allow-list shape | **One `nrobj` column**, not a delimited list (§4) | this design |
| 6 | NR generation under `CommitMode 'NEVER'` | **Refused** (message 054), not silently executed (§10) | this design |
| 7 | `ExecuteTableCrud` signature break | **Accepted now**, while v2 has no production consumers (§7) | **human, 2026-09-15** |
| 8 | Console folder | `web/dyngw-v2-console/`, port 8773 | human, 2026-09-15 |

## 3 · Scope

**In scope.** Server-side generation of field values for `TABL` writes (single-shot
`ExecuteTableCrud` and `TABL` steps inside `ExecuteBatch`); the registry columns that permit it;
returning generated values to the caller; exposing the transaction outcome.

**Out of scope, deliberately.** Generators for `FUNC` import parameters or `SUBM` selections —
no demand, and each would need its own permission surface. General step-to-step data flow (§14).
Any change to `QURY`, `SUBM`, `REGI` or `FUNC` dispatch. Any change to v1
(`ZFS_SB_DYNGATEWAY_O4_API`), which stays untouched.

**Not built, per working agreement rule 6.** No helper, runner, test or scratch objects. The one
new object is `ZCL_FS_DYN_GENERATE`.

## 4 · The registry change

`ZFS_T_DYN_REG` gains two columns:

```abap
allow_gen     : abap_boolean   " this target may use framework generators at all
gen_nr_object : nrobj          " the ONE permitted number range object; blank = none permitted
```

**Why one column and not a list.** A delimited allow-list in a `char120` reproduces the failure
shape of the `ZDYNTGT` interval trap (L-441): it reads as maintained while granting more than
intended, and it fails silently. One number range object per registry row is fully auditable at a
glance. It covers the motivating case exactly — `ZFS_SLC_OTTK_BTP` needs precisely one,
`ZFS_OTTK_D`. A target needing two number-ranged fields is a **documented limit** (§11), not a
silent one; the extension point is a child table, and it is not built now.

**Why this makes the hybrid safe.** Both columns are settable only through a registry write, which
writes a `ZFS_T_DYN_REGH` row carrying `BEFORE_JSON`/`AFTER_JSON` — so a widening of generator
rights is as visible as any other change to the security boundary. And 039 self-protection still
refuses to register anything matching `ZFS_T_DYN_*`, so no caller can register the registry itself
and widen its own generator rights. That is the v1 escalation hole staying closed.

Both columns are exposed on `ZFS_R_DYNGWREGTP` / `ZFS_C_DYNGWREGTP`, their behavior definitions
and `ZBP_FS_DYNGWREGTP`, so they are readable and maintainable over `/Registry` and settable via a
`REGI` step's `ImportJson` — which needs no signature change, because that field is already a
free-form JSON blob.

## 5 · The wire contract

### 5.1 New parameter

`ZFS_AE_DynGwTable` (the `ExecuteTableCrud` action parameter) and `ZFS_AE_DynGwStep` (the batch
step shape) each gain one field:

```abap
GenerateJson : abap.string(0);
```

### 5.2 Shape

```json
{
  "Uuid": ["UUID"],
  "NumberRange": [{"Field": "ZOTTK_NO", "Object": "ZFS_OTTK_D"}],
  "SysFields": "AUDIT"
}
```

| Key | Meaning |
|---|---|
| `Uuid` | Array of field names. Each named field receives a fresh `sysuuid_x16`, generated server-side. The client never sends a UUID, so the hex-vs-base64 question never arises. |
| `NumberRange` | Array of `{Field, Object}`. `Object` is **optional**: omitted, it defaults to the registry row's `gen_nr_object`; supplied, it must equal it, or the step is refused with **051**. |
| `SysFields` | Either the string `"AUDIT"` or an explicit array (below). |

**`SysFields: "AUDIT"`** fills, by exact name and only where the field exists on the target, the
five RAP audit fields: `local_created_by`, `local_last_changed_by` ← `sy-uname`;
`local_created_at`, `local_last_changed_at`, `last_changed_at` ← current `timestampl`.

**`SysFields` explicit form** handles legacy audit blocks — `ZFS_SLC_OTTK_BTP` carries
`zcreated_by` / `zcreated_date` / `zcreated_time` / `zchanged_by` / `zchanged_date` /
`zchanged_time` alongside the RAP five:

```json
"SysFields": [
  {"Field": "ZCREATED_BY",   "Value": "USER"},
  {"Field": "ZCREATED_DATE", "Value": "DATE"},
  {"Field": "ZCREATED_TIME", "Value": "TIME"}
]
```

`Value` ∈ `USER` | `DATE` | `TIME` | `TIMESTAMP` | `TIMESTAMPL`. Explicit because guessing a
legacy block's field names from a convention is exactly how a generator writes into the wrong
column on the next table.

Generation runs **per row** of `ImportJson`, before the write: each row gets its own UUID and its
own number. `GenerateJson` is empty on every call that wants none, per the
structurally-mandatory/semantically-optional rule that already governs every other field.

### 5.2a Two rules that would otherwise be ambiguous

**A generated field overwrites whatever the row carried for it.** Naming a field in
`GenerateJson` is an explicit, per-field opt-in, so the generator wins and any value the caller
also put in the row object for that field is discarded. The alternative — refusing the call —
would add a sixth message for a conflict the caller created deliberately.

**Generators are restricted by `Operation`:**

| Operation | `Uuid` | `NumberRange` | `SysFields` |
|---|---|---|---|
| `INSERT` | yes | yes | yes |
| `MODIFY` | **no** | **no** | yes |
| `DELETE` | no | no | no — `GenerateJson` must be empty |

Generating a key on `MODIFY` would silently address a different row than the caller means, and a
number burned on an update is a number spent for nothing. `SysFields` on `MODIFY` is the useful
case — that is what `local_last_changed_by/at` and a legacy `zchanged_*` block are for. A generator
used outside this table is refused with **052**.

### 5.3 Result changes

`ZFS_AE_DynGwResult` gains:

```abap
IsCommitted  : abap.char(1);   " 'X' when this call's LUW committed
IsRolledBack : abap.char(1);   " 'X' when it was rolled back
```

closing L-497 — the dispatcher already computes both.

**Named `IsCommitted`/`IsRolledBack`, not `Committed`/`RolledBack`.** This design originally
specified the shorter names; `COMMITTED` turned out to be a **CDS reserved word** and the abstract
entity refuses to activate under it (found live at implementation, L-515). The `Is*` spelling is
forced by the platform, not a preference, and it is what the wire actually carries.

And, load-bearing for this feature: **`ExecuteTableCrud` now populates `RowsJson` with the rows as
written**, including generated values. Without it a caller cannot learn which `ZOTTK_NO` it was
assigned, and the feature is useless to any consumer. `RowsJson` on a `TABL` step was previously
unused, so this fills a field rather than changing one.

## 6 · The generator engine

**`ZCL_FS_DYN_GENERATE`** — one new class.
`NAMING: ZCL_FS_DYN_GENERATE -> matches pattern row "Class | ZCL_FS_<AREA>_<NAME>"`
(`docs/naming-conventions.md` line 116), AREA = `DYN`, consistent with the live family
`ZCL_FS_DYN_AUTH` / `_BUDGET` / `_JSON` / `_REGISTRY` / `_RUNTIME`. Created via `adt-mcp` per
routing rule 5.

Contract: given the target's DDIC field list, the registry row, the parsed `GenerateJson` and one
row, return the row with generated fields filled — or raise `ZCX_FS_DYN_ERROR` with the right
message number. It performs no database write and knows nothing about batches or transactions;
`ZCL_FS_DYN_HDL_TABLE` calls it per row immediately before `MODIFY_TABLE`.

**Number generation** uses `CL_NUMBERRANGE_RUNTIME=>NUMBER_GET` — the released route. Not the
`NUMBER_GET_NEXT` function module (L-280); `NUMBER_GET` is the method name, `NUMBER_GET_NEXT` is
the `CALL FUNCTION` one layer down and a natural wrong guess. Catch `CX_NUMBER_RANGES` only, never
also its subclass `CX_NR_OBJECT_NOT_FOUND` — catching both in one `TRY` is a hard syntax error
(L-280).

**Width conversion is not optional.** `NUMBER_GET`'s `NUMBER` is typed `NR_NUMBER` (`NUMC20`)
regardless of the interval's own width. Assigning it straight into a shorter target truncates the
**leading** digits, not the trailing ones (L-282) — `00000000000000100051` into a `CHAR10`
yields `0000000000`, a silently wrong key rather than an error. The generator right-aligns into
the target field's real DDIC width and refuses with **053** if the value does not fit.

**Interval check before wiring.** L-280 also says to check a number range's live interval against
real data before relying on it. `ZFS_OTTK_D`'s interval has never been checked against existing
`ZOTTK_NO` values in `ZFS_SLC_OTTK_BTP`. That check is an acceptance step (§12), not an assumption.

## 7 · Compatibility — one deliberate break

v2 generates **every action parameter `Nullable="false"`**, and no CDS annotation changes that
(`2026-09-12-1033-dyngw-v2-design.md` §479). A caller omitting any field gets HTTP 400
`/IWBEP/CM_V4H_RUN/006 "Non nullable action parameter …"` (L-341). This is precisely what broke
every v1 caller when `RequestId` was added — point 4 of the v2 rebuild's own rationale.

**So adding `GenerateJson` to `ZFS_AE_DynGwTable` breaks every existing `ExecuteTableCrud`
caller.** That is unavoidable while parameters are non-nullable.

**The break is narrower than it first appears:**

| Surface | Breaking? | Why |
|---|---|---|
| `ExecuteTableCrud` | **Yes** | `GenerateJson` becomes a mandatory field on the wire |
| `ExecuteBatch` | No | Its signature (`CommitMode`/`RequestId`/`StepsJson`) is untouched. `ZFS_AE_DynGwStep`'s own source says it is "**NOT** reachable as a composition from `ZFS_AE_DynGwBatch`" (L-470/L-472) and is the typed contract `StepsJson` is parsed against, case-insensitively — so it is not an OData parameter at all, and a step object omitting `GenerateJson` stays valid |
| `RunQuery`, `CallFunctionModule`, `SubmitReport`, `RegisterTarget` | No | Untouched |
| `ZFS_AE_DynGwResult` | No | A response; adding fields cannot break a reader |
| `/Registry` entity CRUD | No | Plain entity CRUD is not subject to the non-nullable action rule (L-341) |

**Recommendation: take the break now.** v2 was built 2026-09-12/13 and has no production
consumer — its only callers are the test scripts behind `docs/dyngw-v2-*` and the console this
spec's Phase 2 builds. The cost of this change rises monotonically with every consumer added. It
is cheapest today, and today is the last cheap day.

This is **decision 7 and needs explicit human sign-off**, because "we knowingly broke an action
signature" must be a recorded choice rather than a discovered consequence.

**Verification, not assumption.** Immediately after activation, an old-shape `ExecuteTableCrud`
payload with no `GenerateJson` is replayed and the result recorded either way. If it unexpectedly
succeeds, the non-nullable claim is wrong for this release and the finding goes to the ledger.

## 8 · Messages

`ZFS_TRM_MSG` `049` is the current last (catalog verified against `T100` 2026-09-13, 49 rows), so
`050` is next free. Five new, all `E`:

| No | Text | Raised when |
|---|---|---|
| 050 | Generator field &1 does not exist on target &2 | `GenerateJson` names a field the target has not got |
| 051 | Number range object &1 is not permitted for target &2 | `Object` supplied but ≠ the registry row's `gen_nr_object`, or that column is blank |
| 052 | Generation is not permitted for target &1 | `GenerateJson` is non-empty but `allow_gen` is false |
| 053 | Number range &1 could not supply a number for &2 | `CX_NUMBER_RANGES`, interval exhausted, or the value does not fit the target field |
| 054 | Number range generation is not allowed with commit mode NEVER | `NumberRange` requested under `CommitMode 'NEVER'` (§10) |

Created on the system and written into `docs/message-catalog/DS4_100_NIIF.md` **in the same turn**,
per working agreement rule 3. Routed to `mcp-abap-abap-adt-api` — `MSAG/N` is the confirmed case
where `adt-mcp` has no adapter (rule 5).

## 9 · Security analysis

The one genuinely new privilege is **burning a shared number range sequence**, which is
irreversible and visible system-wide.

| Control | Effect |
|---|---|
| `allow_gen` false by default | A target registered before this change generates nothing; existing rows are unaffected |
| `gen_nr_object` single-valued | A caller can burn exactly the one object an administrator attached to that target — never an arbitrary one |
| Registry write → `ZFS_T_DYN_REGH` | Any widening is recorded with before/after images and `CHANGED_BY` |
| 039 self-protection unchanged | `ZFS_T_DYN_*` cannot be registered, so generator rights cannot be self-granted |
| `ZFS_DYNGW` `ACTVT 16` + `ZDYNTGT` | Unchanged; generation rides on the existing execute check for the target |

**Not proved, and stated plainly:** as with everything else in v2, no genuinely restricted user has
exercised any of this. The controls above are built and reasoned about; they are not demonstrated
against a caller who is actually denied. That remains the standing gap from
`dyngw-v2-integration-guide.md` §5 and this change does not close it.

## 10 · Transaction semantics

**CORRECTED 2026-09-15, after live acceptance criterion 9 — see L-519.** The paragraph below is
kept, struck through, as the original design claim; it does not hold as implemented/configured on
`DS4_100_NIIF` for `ZFS_OTTK_D`, and the corrected account follows it.

> ~~A number range is burned permanently and is never rolled back (L-284, standard SAP: buffered,
> non-transactional). Two consequences, both stated in the API doc rather than discovered: (1) A
> batch that aborts after generating leaves a gap in the sequence. Generated numbers sit outside
> the phase-2 rollback that L-496 proved. The row is rolled back; the number is spent. (2)
> `CommitMode 'NEVER'` refuses `NumberRange` generation (message 054). A dry run whose whole
> purpose is to change nothing must not consume a shared production sequence.~~

**What criterion 9 actually found (L-519):** before an abort batch, `NRIV-NRLEVEL` for
`ZFS_OTTK_D` read 100052. The batch drew and used `ZOTTK_NO 100053`, then aborted — the row was
confirmed gone (`IsRolledBack 'X'`), exactly as designed. But `NRLEVEL` read **100052 again**
immediately afterward, unchanged, and a later, unrelated, fully-successful insert **drew 100053 a
second time**. The number was rolled back with the row, contradicting the guarantee above.
`CL_NUMBERRANGE_RUNTIME=>NUMBER_GET`, as wired here for `ZFS_OTTK_D`, does not honor "never rolled
back" the way the classic, unbuffered `NUMBER_GET_NEXT` FM is documented to. Root cause not
identified this session — candidates are `ZFS_OTTK_D`'s own SNRO buffering configuration, or a
genuine behavioral difference in the newer class-based entry point.

**Corrected guidance, replacing the two numbered consequences above:**

1. **Whether a batch abort leaves a gap in the sequence is not guaranteed either way.** It may
   (standard buffered behavior) or may not (as observed here) survive a rollback, depending on the
   target number range object's own configuration. Do not assert "the number is spent" or "the
   number is recoverable" for a new object or call path without proving it live, the way this
   finding and L-496 both did (before/after/reuse, not a citation of "standard SAP").
2. **`CommitMode 'NEVER'` still refuses `NumberRange` generation** (message 054) — this guard is
   unchanged and is **kept**, but its justification is corrected: not "a dry run must not spend an
   unconditionally-permanent number," but "a number range's buffering is a per-object,
   per-system configuration this framework does not introspect, so whether a draw would survive a
   rollback is unknowable from the call alone, and refusing remains the only safe default
   regardless of which way that configuration happens to go." `Uuid` and `SysFields` are
   unaffected either way — neither has a side effect outside the row.

`Committed` / `RolledBack` on the result (§5.3) let a caller see which of these happened, which is
the L-497 fix earning its place in this change rather than a later one.

## 11 · Known limits

- One number range object per registry row; a target needing two number-ranged fields is not
  supported (§4).
- Generators apply to `TABL` writes only — not `FUNC` imports or `SUBM` selections (§3).
- Generated values are outside rollback (§10).
- `SysFields: "AUDIT"` matches the five RAP field names exactly; any other audit block must be
  named explicitly (§5.2).
- A step cannot consume another step's output; that is §14, deferred.

## 12 · Acceptance criteria

Each is a live call against `DS4_100_NIIF`, recorded with its payload and response.

| # | Check | Expected |
|---|---|---|
| 1 | `ZFS_OTTK_D` live interval vs existing `ZOTTK_NO` values | Interval covers/continues real data; recorded before wiring (L-280) |
| 2 | Old-shape `ExecuteTableCrud`, no `GenerateJson` | HTTP 400 non-nullable — or a recorded surprise (§7) |
| 3 | `ExecuteTableCrud INSERT` on `ZFS_SLC_OTTK_BTP` with all three generators | `ExecStatus 'S'`; `RowsJson` carries the assigned `UUID` and `ZOTTK_NO` |
| 4 | Re-read the written row via `RunQuery` | `ZOTTK_NO` matches `RowsJson`; audit fields populated; leading digits intact (L-282) |
| 5 | `GenerateJson` naming a field not on the target | `ExecStatus 'E'`, step message **050** |
| 6 | `Object` ≠ registry `gen_nr_object` | step message **051** |
| 7 | Generation against a target with `allow_gen` false | step message **052** |
| 8 | `NumberRange` under `CommitMode 'NEVER'` | step message **054**, nothing written, **no number consumed** |
| 9 | `IsCommitted` / `IsRolledBack` on a committed call and on an aborted batch | Populated and opposite |
| 10 | `TABL` step with `GenerateJson` inside `ExecuteBatch` | Works; confirms the string-parsed step path is not subject to §7's break |
| 11 | Registering a target with `allow_gen`/`gen_nr_object` via `REGI` | `/RegistryHistory` row shows both in `AFTER_JSON` |
| 12 | Registering `ZFS_T_DYN_REG` with `allow_gen` true | Refused, message **039**; escalation stays closed |
| 13 | `Uuid` or `NumberRange` on a `MODIFY`, and any `GenerateJson` on a `DELETE` | Refused, message **052**, per §5.2a |
| 14 | `MODIFY` with `SysFields` only | Succeeds; `local_last_changed_*` updated, key untouched |

Evidence into `worklog/DS4_100_NIIF/2026-09/evidence/<worklog stem>/`, committed.

## 13 · Phase 2 — the console (summary only)

Built after Phase 1 passes §12, against the finished API. `web/dyngw-v2-console/`, port 8773,
sibling to the eight existing consoles; `dyngw` joins the `services` block in all nine
`sap_config.json` files; tile added to `slc-menu-console`.

Layout mirrors `ottk-dttk-console` literally — same design tokens, topbar, `.panel`/`.table-wrap`/
`.pager`, modals, toast, and `apiRequest()` with its 502-means-proxy-down rule. Panels 1 and 2 are
the OTTK and DTTK tables fed by `RunQuery` on `ZFS_CDS_SLC_001` / `ZFS_CDS_SLC_002`. The Create
OTTK modal writes via `ExecuteTableCrud` with `GenerateJson` supplying `UUID`, `ZOTTK_NO` from
`ZFS_OTTK_D`, and the audit fields — so the client invents nothing.

Panel 3, **Gateway Trace**, is the reason the console exists: a counts strip
(`CALL / STEP / REG / REGH / PROBE`) with deltas after every action, over `/CallLog?$expand=_Steps`,
`/Registry` and `/RegistryHistory` — which *are* `ZFS_T_DYN_CALL` / `_STEP` / `_REG` / `_REGH`, read
as plain entity sets. They cannot be registered as gateway targets (039), and do not need to be.
`ZFS_T_TRM_PROBE` is registered `QURY` as the negative control and must stay empty.

A `dynCall()` wrapper sits above `apiRequest()`: a refusal is HTTP **200** with `ExecStatus 'E'`,
so it throws unless `'S'`, and it surfaces **the step row's** message, not the header's truncated
045 (the 045/017 split, L-478). `Severity 'W'` + 048 renders as a partial write, not a failure.

The tables were emptied for this run, so `T000` is no longer registered either — the provisioning
batch re-registers it alongside the five real targets, and the integration guide's liveness check
is acceptance step 1 of Phase 2.

Phase 2 gets its own plan once Phase 1 is proved.

## 14 · Phase 3 — step-output binding (designed, deferred, not built)

The general form of what §1 describes: any step references an earlier step's output, e.g.
`"ZOTTK_NO": "$step1.Number"`. It would close the data-flow gap for `FUNC` and `QURY` too, not just
generation — `[FUNC BAPI_x, TABL insert using its result]` becomes expressible.

Deferred because it needs a resolver, a step-result addressing scheme, a cycle/forward-reference
guard, and its own failure messages — and because the targeted generators in this spec solve the
actual case in front of us. Recorded here so the decision is visible and so §5's `GenerateJson`
is understood as the narrow first cut, not the final shape. It gets its own design doc if wanted.

## 15 · Open questions for the human

1. **Decision 7** — is knowingly breaking `ExecuteTableCrud`'s signature acceptable, given v2 has
   no production consumer today and the cost only rises? (§7)
2. **`ZOTTK_NO` band** — **Answered, 2026-09-15 (human).** The live `ZFS_OTTK_D` sequence is
   correct for console-created rows: the generator should draw exactly as the real BO would, which
   is the entire point of the feature. No separate test band. Phase 2's console will therefore
   create rows indistinguishable from BO-created ones. (Note, per L-519 above: a burned number is
   not guaranteed un-recoverable on abort on this system, but it is still not something to spend
   deliberately outside real use.)

## 16 · Correction to `CLAUDE.md`

The index row for RAP/dyngw v2 states that the L-350 rollback rebuild "is **not yet proved end to
end** — phase-1 is proved, phase-2 abort/rollback is not". **L-496 (2026-09-13) proves it live**,
with the positive control that makes it a proof rather than an assertion. The ledger outranks
`docs/`, and `CLAUDE.md` is stale on this point; it is corrected as part of this change, with
`AGENTS.md` updated in step per L-221.
