# Test case — Dynamic Gateway v2 server-side field generators, live acceptance

**What this document is.** The live acceptance run for the server-side field generators added to
`ZFS_SB_DYNGW_O4_API` (v2) on 2026-09-15: UUID generation, number-range generation, and
audit/system-field generation for `TABL` writes. Fourteen criteria, defined in the design spec
(`docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md` §12), each run as a live
call and recorded with its payload and response.

**This document reports 12 of 14 criteria passing, not 14.** Criterion 9 failed against the
design's own prediction (the implementation's rollback behaviour was correct; the spec's claim
about number ranges was wrong). Criterion 11 failed on the first pass and was fixed live, then
passed on retest. Criterion 14 failed and remains an open, undecided data-loss trap. None of the
three is rounded up.

| | |
|---|---|
| **System** | `DS4`, client `100` (`DS4_100_NIIF`) |
| **Executed by** | `FS_DEV3` |
| **Date** | 2026-09-15 |
| **Service** | `ZFS_SB_DYNGW_O4_API` (v2) |
| **Design spec** | `docs/superpowers/specs/2026-09-15-1353-dyngw-v2-generators-design.md` |
| **Task reports** | `.superpowers/sdd/2026-09-15-1410-dyngw-v2-generators/task-8-report.md` (acceptance), `task-9-report.md` (docs/cleanup) |
| **Worklog** | `worklog/DS4_100_NIIF/2026-09/2026-09-15-1410-dyngw-v2-generators.md` |
| **Evidence** | `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/` — 20 payload/response files, one per criterion (plus registration and cleanup calls) |
| **Transport** | `DS4K907263` (the one new object, `ZCL_FS_DYN_GENERATE`, plus all changed objects) |
| **Messages** | `ZFS_TRM_MSG` 050–054, created on transport `DS4K907018` |

## Result — 12 of 14 pass: 11 outright, 1 after a live fix; 2 failed

| # | Check | Result |
|---|---|---|
| 1 | `ZFS_OTTK_D` interval vs existing `ZOTTK_NO` | **PASS** |
| 2 | Old-shape `ExecuteTableCrud`, no `GenerateJson` | **PASS** |
| 3 | `INSERT` on `ZFS_SLC_OTTK_BTP` with all three generators | **PASS** |
| 4 | Independent re-read via `runQuery` | **PASS** |
| 5 | `GenerateJson` naming a non-existent field | **PASS** |
| 6 | `NumberRange.Object` ≠ registry `GenNrObject` | **PASS** |
| 7 | Generation against `AllowGen=false` target | **PASS** |
| 8 | `NumberRange` under `CommitMode 'NEVER'` | **PASS** |
| 9 | `IsCommitted`/`IsRolledBack` on commit vs abort | **FAIL (partial)** — status fields and row-rollback correct; the design's number-survives-rollback claim is wrong (L-519) |
| 10 | `TABL` step with `GenerateJson` inside `ExecuteBatch` | **PASS** |
| 11 | `REGI` sets `AllowGen`/`GenNrObject` | **FAIL, then FIXED** — refused 034 on first pass (L-517); fixed live, passed on retest |
| 12 | `RegisterTarget` on `ZFS_T_DYN_REG` with `AllowGen:true` | **PASS** |
| 13 | Generator on `MODIFY`/`DELETE` | **PASS** |
| 14 | `MODIFY` with `SysFields` only | **FAIL** — full-row replace wipes create-audit and business fields (L-520) |

**Original run: 11 of 14 PASS, 3 FAIL/FAIL-partial (9, 11, 14). After fix round 1 (same day):
12 of 14 PASS, 2 of 14 still failing (9, 14).** Criterion 9 and criterion 14 are **not fixed** —
both are open decisions left for the human, by design of the coordinator's fix-round scope.

---

## 1 · Endpoint

Same service as the FTR lifecycle test case, `ZFS_SB_DYNGW_O4_API` v2:

```
https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001
```

The two action endpoints exercised:

```
POST .../CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.RegisterTarget?sap-client=100
POST .../CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.ExecuteTableCrud?sap-client=100
POST .../CallLog/com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001.ExecuteBatch?sap-client=100
GET  .../Registry?sap-client=100
GET  .../RegistryHistory?sap-client=100
```

`$metadata` was fetched first (`step2-metadata.xml`) and confirmed the new `GenerateJson`,
`IsCommitted`, `IsRolledBack` fields were already live on the published service — no republish was
needed for this run.

**What's new on the wire, over the FTR lifecycle test case:** `ExecuteTableCrud` and the batch
step shape both gained a `GenerateJson` string parameter (§5.1 of the design spec), and
`ZFS_AE_DynGwResult` gained `IsCommitted`/`IsRolledBack`. `GenerateJson`'s three keys:

```json
{"Uuid": ["UUID"], "NumberRange": [{"Field": "ZOTTK_NO", "Object": "ZFS_OTTK_D"}], "SysFields": "AUDIT"}
```

## 2 · Registration — provisioning three targets for this run

The registry was emptied before this run started, per the brief. Three targets were registered:

| Target | Kind | Route | Result |
|---|---|---|---|
| `ZFS_SLC_OTTK_BTP` | TABL | `RegisterTarget` INSERT, plain (`IsActive`/`AllowRead`/`AllowWrite` only) | `ExecStatus 'S'` |
| `ZFS_T_TRM_PROBE` | TABL | `RegisterTarget` INSERT, `AllowWrite` true, no `AllowGen` | `ExecStatus 'S'` — deliberately left as the negative control for criterion 7 |
| `NUMBER_GET_NEXT` | FUNC | `RegisterTarget` INSERT, `AllowWrite` true, `CallMode:"L"` | `ExecStatus 'S'` |

**The first attempt at registering `ZFS_SLC_OTTK_BTP` failed, and that failure is itself
criterion 11's finding (L-517).** The natural one-step registration —

```json
{"TargetKind":"TABL","IsActive":true,"AllowRead":true,"AllowWrite":true,
 "AllowGen":true,"GenNrObject":"ZFS_OTTK_D"}
```

— was refused: `ExecStatus 'E'`, message 45 header wrapping *"Invalid registration payload for
target ZFS_SLC_OT…"* (`step4-register-ottk-btp.json`). The registry row had to be created plain
first (`step4-register-ottk-btp-plain.json`, `ExecStatus 'S'`) and `AllowGen`/`GenNrObject` set
afterward — the two-step workaround that criterion 11 below reports on, then fixes.

## 3 · Criteria 1–8 — the generators working, and refusing correctly

### Criterion 1 — number range interval vs live data (PASS)

`NRIV` for `ZFS_OTTK_D`: interval `01`, `100001`–`999999`, `NRLEVEL 100050`. Live
`ZFS_SLC_OTTK_BTP`: `MAX(ZOTTK_NO) = 100050`, `MIN = 100049`, 2 rows. The level is exactly caught
up with the data — the next draw (100051) cannot collide with anything real.

### Criterion 2 — old-shape `ExecuteTableCrud` (PASS)

An `ExecuteTableCrud` call with no `GenerateJson` field at all returns HTTP 400:

```json
{"error":{"code":"/IWCOR/CX_OD_EP_PARAM_ERROR/…","message":"No value for mandatory parameter 'GenerateJson' specified","@SAP__common.ExceptionCategory":"Client_Error", …}}
```

Confirms §7's deliberate breaking change: `GenerateJson` is non-nullable, so every pre-existing
caller of `ExecuteTableCrud` now fails until it sends the field (empty string is fine — it just
must be present).

### Criterion 3 — `INSERT` with all three generators (PASS)

Request (`criterion03-insert-generators.json`):

```json
{"TargetName":"ZFS_SLC_OTTK_BTP","Operation":"INSERT",
 "ImportJson":"[{\"ZSTR\":\"DSX\",\"ZENT_ID\":\"E024\",\"ZTYPE\":\"01\",\"ZOTTK_CURR\":\"USD\",\"ZOTTK_VALUE\":1000000.00,\"ZBUKRS\":\"SG03\"}]",
 "GenerateJson":"{\"Uuid\":[\"UUID\"],\"NumberRange\":[{\"Field\":\"ZOTTK_NO\",\"Object\":\"ZFS_OTTK_D\"}],\"SysFields\":\"AUDIT\"}",
 "RequestId":""}
```

Response: `ExecStatus 'S'`, `IsCommitted 'X'`. `RowsJson` carries the written row with
`UUID:"UlQAH+eiH9GsnDLusY0gAA=="` (base64), `ZOTTK_NO:"100051"`, and the five RAP audit columns
filled: `LOCAL_CREATED_BY:"FS_DEV3"`, `LOCAL_CREATED_AT:20260915104358.0856100`,
`LOCAL_LAST_CHANGED_BY`/`_AT` and `LAST_CHANGED_AT` identical (a fresh INSERT). All caller-supplied
business fields (`ZSTR`, `ZENT_ID`, `ZTYPE`, `ZOTTK_CURR`, `ZOTTK_VALUE`, `ZBUKRS`) round-trip
unchanged; every field the caller didn't send sits at its DDIC initial value.

### Criterion 4 — independent re-read (PASS)

`mcp-abap-abap-adt-api runQuery` against `ZFS_SLC_OTTK_BTP` (a channel independent of the gateway
under test) confirmed `ZOTTK_NO = "100051"` matches exactly — no leading-digit truncation, the
L-282 trap this generator's own width-conversion logic exists to avoid. `LOCAL_CREATED_BY =
"FS_DEV3"` and all three timestamps populated, matching `RowsJson` field for field.

### Criterion 5 — bad generator field (PASS)

`GenerateJson: {"Uuid":["ZNOT_A_FIELD"]}` against `ZFS_SLC_OTTK_BTP`. Response:

```json
{"ExecStatus":"E","ErrorCategory":"CLIENT","MessageId":"ZFS_TRM_MSG","MessageNo":"45",
 "MessageText":"Batch aborted at step 1: Generator field ZNOT_A_FIELD does not exist on tar"}
```

The step-level detail (truncated in the header per the 045 wrapper) is message **050**, exactly
as designed: *"Generator field &1 does not exist on target &2."*

### Criterion 6 — wrong number-range object (PASS)

`GenerateJson: {"NumberRange":[{"Field":"ZOTTK_NO","Object":"SOMETHING_ELSE"}]}`. Response:
`ExecStatus 'E'`, `ErrorCategory 'TARGET'`, header naming message **051** *"Number range object
SOMETHING_ is not permitted fo…"* — the registry row's `GenNrObject` (`ZFS_OTTK_D`) is the only
object this target may draw from, and a mismatch is refused before any draw happens.

### Criterion 7 — generation against `AllowGen=false` (PASS)

`ZFS_T_TRM_PROBE` was registered without `AllowGen`. A call with `GenerateJson:
{"SysFields":"AUDIT"}` against it: `ExecStatus 'E'`, `ErrorCategory 'CLIENT'`, message **052**
*"Generation is not permitted for target ZFS_T_TRM_P…"*. Confirms the registry row is the sole
gate — `ZFS_T_TRM_PROBE` stayed the negative control it was registered as.

### Criterion 8 — `NumberRange` under `CommitMode 'NEVER'` (PASS)

A dry-run batch (`CommitMode:"NEVER"`) with a `TABL INSERT` step naming `NumberRange`. Refused:
`ExecStatus 'E'`, step detail `msgno:54, msgtext:"Number range generation is not allowed with
commit mode NEVER"`. Verified nothing was drawn: `NRIV.NRLEVEL` read **100051 before and after**
this call — unchanged. The step's own `isOutsideRollback:false` flag is also visible in the
response, confirming this step never reached the point of touching the number range at all.

## 4 · Criterion 9 — the finding that must not be rounded up

**Design's claim (spec §10, original):** *"A number range is burned permanently and is never
rolled back (standard SAP: buffered, non-transactional). … A batch that aborts after generating
leaves a gap in the sequence. The row is rolled back; the number is spent."*

**The test.** A two-step `AUTO`-commit batch: step 1 `TABL INSERT` on `ZFS_SLC_OTTK_BTP` with all
three generators; step 2 `FUNC NUMBER_GET_NEXT` — a function module that does not exist, chosen
deliberately to force an abort *after* step 1's generation and write had already happened.

**What happened, in order:**

1. Before the batch: `NRIV.NRLEVEL` for `ZFS_OTTK_D` = **100052**.
2. Step 1 ran and drew `ZOTTK_NO 100053` (visible in step 1's own `rowsjson`,
   `criterion09-abort-rollback.json`): `"UUID":"UlQAH+eiH9GsnD84R9qgAA==","ZOTTK_NO":"100053"`,
   `status:"S"`.
3. Step 2 failed: `"msgno":19,"msgtext":"Function module NUMBER_GET_NEXT does not exist"`.
4. The whole call reported: `ExecStatus 'E'`, `MessageText:"Batch aborted at step 2: Function
   module NUMBER_GET_NEXT does not exist"`, **`IsRolledBack:"X"`, `IsCommitted:""`** (blank) —
   exactly as the status-field half of the design predicts.
5. The row itself was confirmed gone by re-read — the row-rollback half of L-496/L-350's proof
   holds here too.
6. **`NRIV.NRLEVEL` was read again immediately after the abort: 100052 — unchanged, not advanced
   to 100053.**
7. A follow-up, entirely unrelated, fully-successful `INSERT` (`criterion09-followup-number-
   probe.json`) was then run with the same generators. It drew **`ZOTTK_NO:"100053"` — the exact
   same number a second time** — and committed (`ExecStatus 'S'`, `IsCommitted:"X"`).

**Verdict: the row-rollback half of the guarantee is proved; the number-survives-rollback half is
false, as implemented/configured on this system, for `ZFS_OTTK_D`.** `CL_NUMBERRANGE_RUNTIME=>
NUMBER_GET`, wired here, rolled the drawn number back with the LUW instead of leaving it burned.
This is **criterion 9, reported as FAIL**, not as a pass with a footnote. Root cause was not
identified this session — candidates are `ZFS_OTTK_D`'s own SNRO buffering configuration, or a
genuine behavioural difference between the newer class-based `NUMBER_GET` and the classic
`NUMBER_GET_NEXT` FM's documented no-buffering behaviour. This is **L-519**, and design spec §10
has been corrected in place (struck through, not silently rewritten) as a direct result.

## 5 · Criterion 10 — generation inside a batch (PASS)

A single-step `AUTO` batch, `TABL INSERT` with the same three generators. `ExecStatus 'S'`, step
`rowsjson` carries `"ZOTTK_NO":"100052"` and the same audit-field shape as criterion 3. Confirms
the string-parsed batch-step path is not subject to §7's non-nullable-parameter break — a step
object inside `StepsJson` is not an OData action parameter and can omit `GenerateJson` freely.

## 6 · Criterion 11 — failed, fixed live, passed on retest

**First pass — FAIL.** `RegisterTarget` `INSERT` on `ZFS_SLC_OTTK_BTP` with `AllowGen`/
`GenNrObject` in `ImportJson` (see §2 above) was refused. The precise failure mode, isolated with
a smaller payload: `ExecStatus 'E'`, message **034** *"unknown field ALLOWGEN"*. Root cause
(**L-517**): `ZCL_FS_DYN_HDL_REGI`'s `ty_payload` structure and `apply_payload`'s field allow-list
(`TARGETKIND`/`OPERATION`/`ISACTIVE`/`ALLOWREAD`/`ALLOWWRITE`/`CALLMODE`/`MAXROWS`/`LOGLEVEL`/
`DESCR`) were never extended for the two new registry columns, even though the DDIC table, CDS
views, and behavior definition all were. The design's own §4 claimed this needed no signature
change ("that field is already a free-form JSON blob") — true of the wire, false of the handler's
hardcoded key check.

**Fix, live, same day (fix round 1).** `ZCL_FS_DYN_HDL_REGI` gained `allowgen TYPE
zfs_t_dyn_reg-allow_gen` / `gennrobject TYPE zfs_t_dyn_reg-gen_nr_object` on `ty_payload`, and two
new `CASE lv_key` branches in `apply_payload` — same pattern as the four already-settable columns,
no parallel mechanism. Routed `mcp-abap-abap-adt-api` (change to an existing object), transport
`DS4K907263`. Activated clean (`"success":true,"inactive":[]`). Whole-package `unitTestRun`: 18
test classes, 148 test methods, **0 non-empty alerts** — every existing test stayed green.

**Retest — PASS.** `RegisterTarget` `UPDATE` on `ZFS_T_TRM_PROBE`:

```json
{"TargetName":"ZFS_T_TRM_PROBE","Operation":"UPDATE",
 "ImportJson":"{\"TargetKind\":\"TABL\",\"AllowGen\":true,\"GenNrObject\":\"ZFS_OTTK_D\"}"}
```

Response: `ExecStatus 'S'`, `IsCommitted 'X'` (`fixround1-criterion11-registertarget-allowgen.json`).
`/RegistryHistory` (`fixround1-criterion11-registryhistory.json`) shows the new `ChangeType 'U'`
row: `BeforeJson` carries `"ALLOW_GEN":"","GEN_NR_OBJECT":""`, `AfterJson` carries
`"ALLOW_GEN":"X","GEN_NR_OBJECT":"ZFS_OTTK_D"` — the criterion as originally written, through the
sanctioned `RegisterTarget` action, no `/Registry` PATCH workaround needed.

## 7 · Criterion 12 — self-protection (PASS, checked twice)

`RegisterTarget` `INSERT` on `ZFS_T_DYN_REG` itself with `AllowGen:true`:

```json
{"TargetName":"ZFS_T_DYN_REG","Operation":"INSERT",
 "ImportJson":"{\"TargetKind\":\"TABL\",\"IsActive\":true,\"AllowRead\":true,\"AllowWrite\":true,\"AllowGen\":true}"}
```

Refused both before and after the fix round: `ExecStatus 'E'`, `ErrorCategory 'AUTH'`, message
**039** *"Target ZFS_T_DYN_REG belongs to the gateway framew…"*. No `RegistryHistory` row was
written either time (checked, not assumed) — the 039 self-protection guard that closes v1's
privilege-escalation hole is unaffected by widening `RegisterTarget`'s field allow-list.

**A related false alarm caught during this run, worth recording as a finding about method rather
than a technical result (L-521, superseding the wrong L-518).** Mid-run, a reviewer read
`ZBP_FS_DYNGWREGTP`'s `source/main` include, found it nearly empty, and concluded the plain OData
entity path (`/Registry` PATCH) bypasses the 039 guard entirely — a real security claim, published
to the ledger as L-518. It was wrong: for a RAP behavior pool, `source/main` is a near-empty
shell — all the logic (`lhc_dyngwreg`'s `validatetarget`, which contains the identical 039 check,
firing on every create *and* update via the base BDEF's `validation validateTarget on save`) lives
in `includes/implementations`, which the reviewer never opened. The clue was inside the finding
itself: L-518 noted the PATCH "even wrote a `ZFS_T_DYN_REGH` row … via some save path this read
did not identify" — that save path was `lsc_dyngwreg->save_modified`, in the very include left
unread. The coordinator caught this before it was acted on and it was corrected in place as L-521,
with L-518 marked wrong rather than deleted (append-only ledger). No system change resulted; the
lesson is procedural — read a RAP behavior pool's `includes/implementations`, not just its shell,
before publishing a security finding.

## 8 · Criterion 13 — generators refused on MODIFY/DELETE (PASS)

Per spec §5.2a, `Uuid`/`NumberRange` must be refused on `MODIFY`, and any `GenerateJson` at all
must be refused on `DELETE`.

**13a — `Uuid` on `MODIFY`:**

```json
{"TargetName":"ZFS_SLC_OTTK_BTP","Operation":"MODIFY",
 "ImportJson":"[{\"UUID\":\"UlQAH+eiH9GsnDLusY0gAA==\",\"ZOTTK_NO\":\"100051\",\"ZREMARK\":\"task8 modify probe\"}]",
 "GenerateJson":"{\"Uuid\":[\"UUID\"]}"}
```

Refused: `ExecStatus 'E'`, message **052** *"Generation is not permitted for target ZFS_SLC_OTT…"*
— the same message §5.2a specifies, reused rather than a new one invented for this case.

**13b — any `GenerateJson` on `DELETE`:**

```json
{"TargetName":"ZFS_SLC_OTTK_BTP","Operation":"DELETE",
 "ImportJson":"[{\"UUID\":\"AAAAAAAAAAAAAAAAAAAAAA==\",\"ZOTTK_NO\":\"999999\"}]",
 "GenerateJson":"{\"SysFields\":\"AUDIT\"}"}
```

Refused: `ExecStatus 'E'`, message **052** again. Both refusals happened before any row was
touched — the dummy key in 13b (`ZOTTK_NO 999999`, a UUID of all zero bytes) was never resolved
against a real row, because the `GenerateJson` check runs first.

## 9 · Criterion 14 — FAIL, a real data-loss casualty, not a hypothetical

**Design's intent (spec §5.2, operation table):** on `MODIFY`, `SysFields` is "the useful case" —
it should update `local_last_changed_by/at` and leave the key and the rest of the row untouched.

**The test.** Row `ZOTTK_NO 100051` (created in criterion 3, with real `ZSTR`/`ZENT_ID`/`ZTYPE`/
`ZOTTK_CURR`/`ZOTTK_VALUE`/`ZBUKRS` and a populated `LOCAL_CREATED_BY`/`LOCAL_CREATED_AT`) was sent
through `MODIFY` with only its key and one changed field:

```json
{"TargetName":"ZFS_SLC_OTTK_BTP","Operation":"MODIFY",
 "ImportJson":"[{\"UUID\":\"UlQAH+eiH9GsnDLusY0gAA==\",\"ZOTTK_NO\":\"100051\",\"ZREMARK\":\"task8 criterion14 modify probe\"}]",
 "GenerateJson":"{\"SysFields\":\"AUDIT\"}"}
```

**Result:** `ExecStatus 'S'`, `IsCommitted 'X'`. `LOCAL_LAST_CHANGED_AT` did advance, exactly as
`SysFields:"AUDIT"` promises. But the returned `RowsJson` — and an independent re-read afterward
(`task9-cleanup-before.json`) — showed the row like this:

| Field | Before this MODIFY | After |
|---|---|---|
| `ZSTR` | `DSX` | *(blank)* |
| `ZENT_ID` | `E024` | *(blank)* |
| `ZTYPE` | `01` | *(blank)* |
| `ZOTTK_CURR` | `USD` | *(blank)* |
| `ZOTTK_VALUE` | `1000000.00` | `0` |
| `ZBUKRS` | `SG03` | *(blank)* |
| `ZREMARK` | *(blank)* | `task8 criterion14 modify probe` (the only field the caller actually meant to change) |
| `LOCAL_CREATED_BY` | `FS_DEV3` | *(blank)* |
| `LOCAL_CREATED_AT` | `20260915104358.0856100` | **`0`** |
| `LOCAL_LAST_CHANGED_AT` | same as created | `20260915104935.7741990` (correctly advanced) |

**`LOCAL_CREATED_AT` reset to 0 and `LOCAL_CREATED_BY` blanked — the creation audit trail
destroyed by an update that never mentioned those fields, on the row this feature's own criterion
3 had just proved correct.** This is `ZOTTK_NO 100051` by name, not a hypothetical risk (per the
brief's requirement): `ExecuteTableCrud MODIFY` builds a complete row structure from whatever
`/ui2/cl_json=>deserialize` populates off the caller's JSON, leaves every unmentioned field at its
ABAP-initial value, then issues one `MODIFY` of the whole row — a full-row replace, not a
field-level merge. `SysFields:"AUDIT"` sets `local_last_changed_by/at` and `last_changed_at`
correctly (per spec §5.2's own table) but does nothing to preserve `local_created_by/at` when the
caller's row omits them, so any partial MODIFY permanently loses them. This is **L-520**, reported
here as **FAIL**, and it is **not fixed** — out of scope for the fix round per the coordinator's
instructions; it is a real, undecided design decision for the human (read-merge before MODIFY, or
document full-replace unambiguously and require every caller to resend the full row).

## 10 · Finding — DELETE keys on the real primary key, not the business field (L-522)

Found during Task 9 cleanup, not one of the 14 numbered criteria, but directly adjacent to
criterion 13/14 and worth carrying in the same document because it is the same class of trap.

**First attempt:** `ExecuteTableCrud DELETE` on `ZFS_SLC_OTTK_BTP` with `ImportJson:
[{"ZOTTK_NO":"100051"}, {"ZOTTK_NO":"100052"}, {"ZOTTK_NO":"100053"}]` — the natural key a human
would use. Response: `ExecStatus 'S'`, `ErrorCategory 'BUSINESS'`, **`ResultCount 0`** — a
plausible "nothing to delete" reading. An independent re-read showed **all three rows still
present, unchanged.**

**Cause:** `ZFS_SLC_OTTK_BTP`'s real primary key is `CLIENT`+`UUID` (the generated
`sysuuid_x16`), not `ZOTTK_NO`. `MODIFY_TABLE`'s dynamic `DELETE` resolves rows by the table's
actual key structure; a partial structure with a blank key field silently matches zero rows.

**Second attempt**, with `UUID` added (converted from the hex string an independent read
returned, e.g. `5254001FE7A21FD1AC9C32EEB18D2000` → base64 `UlQAH+eiH9GsnDLusY0gAA==`), alongside
`ZOTTK_NO`: `ExecStatus 'S'`, `IsCommitted 'X'`, `ResultCount 3` — confirmed by another
independent re-read, all three test rows gone.

**How to apply:** treat `ResultCount` as the fact to check on `DELETE`/`MODIFY`, never
`ExecStatus` alone — `'S'` with `ResultCount 0` is a no-op wearing a success status, the same
shape as the `ACCEPTING DUPLICATE KEYS` trap already documented for `INSERT`.

## 11 · Field-by-field: the two new registry columns

`ZFS_T_DYN_REG` gained two columns for this change, visible in the final registry snapshot
(`task9-registry-final-state.json`):

| Column | Type | What it holds and why |
|---|---|---|
| `ALLOW_GEN` | `abap_boolean` | The kill switch for every generator on this target. `false` by default — a target registered before this change generates nothing until explicitly widened. `ZFS_SLC_OTTK_BTP` shows `true`; `ZFS_T_TRM_PROBE` and `NUMBER_GET_NEXT` show `false` (the probe deliberately, as the negative control; the FUNC target because generators apply to `TABL` writes only, per spec §3). |
| `GEN_NR_OBJECT` | `nrobj` | The **one** number range object this target may draw from — blank means none permitted. `ZFS_SLC_OTTK_BTP` shows `ZFS_OTTK_D`; the other two are blank. A caller naming a different object in `NumberRange.Object` is refused 051 (criterion 6) regardless of what this column holds. |

Both columns are settable only through a registry write, which always produces a
`ZFS_T_DYN_REGH` history row with `BEFORE_JSON`/`AFTER_JSON` — widening generator rights is exactly
as visible as any other change to the security boundary. `RegistryHistory`'s `CALL_UUID` column is
zero on every row in this run (the same F-1 gap the FTR lifecycle test case found — single-shot
`RegisterTarget` still does not seed it).

## 12 · Final state

**`ZFS_SLC_OTTK_BTP`** — back to the two pre-existing real rows, intact:

| ZOTTK_NO | UUID | LOCAL_CREATED_BY | LOCAL_CREATED_AT | ZREMARK |
|---|---|---|---|---|
| 100049 | `5254001FE7A21FD1AAEDAA7726B4E000` | FS_DEV3 | 20260908120907.113 | OT Ticket 1 |
| 100050 | `5254001FE7A21FD1AAEDAD2F510D0000` | FS_DEV3 | 20260908120943.527 | OT Ticket 1 |

Test rows 100051 (L-520's casualty), 100052, and 100053 (L-519's reused number) were created
during the run and deleted in Task 9 cleanup (§10 above). **Their numbers stay burned** — the
sequence in `ZOTTK_NO` has permanent gaps at 100051–100053, which is itself consistent with
L-519's finding: the row disappeared, but nothing in this system's number-range wiring is
guaranteed to leave a gap on abort, and these three particular numbers were spent by rows that
did commit and were then explicitly deleted, not by the aborted step.

**Registry — 3 rows, final state:**

| Target | Kind | AllowRead | AllowWrite | AllowGen | GenNrObject | CallMode |
|---|---|---|---|---|---|---|
| `ZFS_SLC_OTTK_BTP` | TABL | X | X | **X** | `ZFS_OTTK_D` | |
| `ZFS_T_TRM_PROBE` | TABL | X | X | **blank** (reset in Task 9) | | |
| `NUMBER_GET_NEXT` | FUNC | X | X | | | `L` |

`ZFS_T_TRM_PROBE`'s `AllowGen` was widened to `true`/`ZFS_OTTK_D` for the criterion 11 retest and
then reset back to `false`/blank in Task 9, restoring it as criterion 7's negative control.
`NUMBER_GET_NEXT` is a **deliberate leftover**, flagged in the worklog for the human's decision —
not needed by Phase 2, not removed by this run.

**Messages 050–054** live in `ZFS_TRM_MSG` on transport `DS4K907018` (filed there, not
`DS4K907263`, because `ZFS_TRM_MSG` already carried a CTS lock on that request — see the worklog's
open question 3 on whether the two requests must be released together).

## 13 · Evidence

All 20 files are under
`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-15-1410-dyngw-v2-generators/`:

- `criterion02` through `criterion14` — one payload/response pair per numbered criterion (13a/13b
  split for the two MODIFY/DELETE sub-checks), plus `step-detail-c*.json` isolating individual
  step results out of batch responses for criteria 3/5/6/8/9/10/13a/13b.
- `fixround1-criterion11-*` and `fixround1-criterion12-*` — the before/after retest evidence for
  the live fix.
- `step4-register-*` — the registration calls for all three targets, including the failed
  one-step `ZFS_SLC_OTTK_BTP` registration that is criterion 11's original finding.
- `step2-metadata.xml` — the `$metadata` fetch confirming `GenerateJson`/`IsCommitted`/
  `IsRolledBack` were already published.
- `task9-cleanup-*` and `task9-registry-*` — the before/after independent reads around deleting
  the three test rows, including the first DELETE attempt that silently matched nothing (§10).

Every quoted payload and response field above is copied verbatim from these files; none is
paraphrased. Long `RowsJson`/`RegistryHistory` blobs quoted in §§3, 4, 6, 9 are trimmed to the
fields that carry the finding — full rows run to 40+ columns of ABAP-initial values — and every
trim is stated as such rather than silently dropped.

## 14 · Left on the system

- **`ZFS_SLC_OTTK_BTP`:** two real rows (100049, 100050), unchanged. Test rows 100051–100053
  created and deleted; those three numbers stay permanently burned.
- **Registry:** 3 rows as in §12 — `ZFS_SLC_OTTK_BTP` (generation-enabled, live), `ZFS_T_TRM_PROBE`
  (reset to the negative-control state), `NUMBER_GET_NEXT` (left registered, human's call).
- **`ZFS_T_DYN_REGH`:** the accumulated history for every registration and update made this run,
  `CALL_UUID` zero throughout (same gap as the FTR lifecycle run).
- **`ZFS_TRM_MSG`:** five new messages, 050–054, on transport `DS4K907018`.
- **Code:** `ZCL_FS_DYN_GENERATE` (new), `ZCL_FS_DYN_HDL_REGI` and `ZCL_FS_DYN_HDL_TABLE` (changed
  — the second for the fix-round `AllowGen`/`GenNrObject` field allow-list), `ZFS_T_DYN_REG` and
  its CDS/behavior-definition family (changed — the two new columns), transport `DS4K907263`.
- **Open, undecided, by design:** L-519 (number-range rollback unreliability) and L-520 (`MODIFY`
  full-row replace) are both documented but deliberately **not fixed** — both are decisions left
  for the human.
