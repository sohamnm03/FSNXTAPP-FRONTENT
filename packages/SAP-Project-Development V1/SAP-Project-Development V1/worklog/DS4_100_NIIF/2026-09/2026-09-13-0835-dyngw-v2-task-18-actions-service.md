# Task 18 — six actions, abstract entities, service definition, binding, live proofs

| | |
|---|---|
| System | `DS4_100_NIIF` (DS4 / client 100) |
| Package | `ZFS_DYN_GW` |
| Transport | `DS4K907263` (task `DS4K907264`) |
| Date | 2026-09-13 |
| Brief | `.superpowers/sdd/2026-09-12-dyngw-v2/task-18-brief.md` |

## Scope

Eight abstract entities, six static actions on `ZFS_R_DynGwCallTP`, their implementation in
`ZBP_FS_DYNGWCALLTP`, service definition `ZFS_SD_DYNGW`, binding `ZFS_SB_DYNGW_O4_API`, publish,
and the live proofs deferred into this task by Tasks 3, 4 and 16.

## Naming gate

Recorded **before** the first create call (`docs/naming-conventions.md`):

```
NAMING: ZFS_AE_DynGwQuery      -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwFunc       -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwTable      -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwSubmit     -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwRegister   -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwBatch      -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwStep       -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_AE_DynGwResult     -> matches "Abstract entity | ZFS_AE_<Entity>" (row 83)
NAMING: ZFS_SD_DYNGW           -> matches "Service definition | ZFS_SD_<Entity>" (row 88)
NAMING: ZFS_SB_DYNGW_O4_API    -> matches "Service binding | ZFS_SB_<Entity>_<O2/O4>_<UI/API>" (rows 89 / 152)
```

Precedent on this system: `ZFS_AE_DYNGWREQUEST` / `ZFS_AE_DYNGWRESPONSE` (v1) are the same row.
No generator was used, so no generator-suggested name is inherited.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Draft on any BO? | Not applicable — no generator used, no draft added anywhere. | 2026-09-13 |

## Todo

- [x] 1. Step 1 — validate the deep action parameter (composition on an abstract entity)
- [x] 2. Step 2 — create the eight abstract entities
- [x] 3. Step 3 — six static actions on the base BDEF + `use action` on the projection
- [x] 4. G3 — close `authorization master ( instance )` before any non-privileged write path
- [x] 5. Step 4 — implement the six in `ZBP_FS_DYNGWCALLTP`
- [x] 6. Step 5 — service definition + binding
- [x] 7. G1 — verify all three DCLs active, then Step 6 publish via the sap-gui script
- [x] 8. Step 6b — Task 4's three registry assertions (incl. the T000 seed)
- [x] 9. Task 3's duplicate-KND assertion; Task 16's composition / 44 mappings / LastChangedAt
- [x] 10. Step 7 — smoke test (success + refusal)
- [x] 11. Ledger, report, commit

## Work log


### Step 1 — the deep action parameter: **fallback taken**

`composition [0..*] of ZFS_AE_DynGwStep` on an abstract entity **activates** (once the child
declares `association to parent` with no `on` clause — **L-470**), and `ddicElement` confirms
`_Steps` as a `STOB/DOA`. But the RAP derived type carries no `_Steps` component:
`ls_key-%param-_steps` is *"does not have a component called _STEPS"*, with no similar-name hint.
Deep action parameters are not supported on this release. **The brief's documented fallback was
taken** — `ZFS_AE_DynGwBatch.StepsJson : abap.string(0)` — and recorded as **L-472**.
`ZFS_AE_DynGwStep` is kept as the typed contract that string is parsed against.

### Step 3 / G3 — actions and the instance-authorization hook

Six `static action`s on `ZFS_R_DynGwCallTP`, `use action` for each on the projection.
`get_instance_authorizations` implemented in `ZBP_FS_DYNGWCALLTP`: **refuse** — every legitimate
write to the call log is privileged (`IN LOCAL MODE`), so anything reaching the handler is not the
framework. **ATC's SLIN W333 on this class is gone**, which is the objective evidence G3 is closed.
`%assoc-_Steps` is not a component of the instance-authorization result on this BDEF shape and was
removed; `%update` is.

### Step 5–6 — service and publish

`ZFS_SD_DYNGW` (4 entity sets) and `ZFS_SB_DYNGW_O4_API` (OData V4, Web API) created and activated.
**G1 verified before publishing, not assumed:** `objectStructure` on all four DCLs —
`ZFS_R_DynGwCallTP`, `ZFS_R_DynGwStepTP`, `ZFS_I_DynGwRegHist` and (bonus) `ZFS_R_DynGwRegTP` —
each `adtcore:version: "active"`.

Publish: `scripts/sap-gui-publish-service.py --group-id ZFS_SB_DYNGW_O4_API --yes` →
`"publish_message": "New service group(s) successfully published", "ok": true`.
It first reported the group as *not in the unpublished list* — a **false negative on a publish
gate**, because the script never set the System Alias (L-246 documented, not implemented). Fixed in
the script (`--system-alias`, default `LOCAL`) and recorded as **L-473**.

Base URL: `<host>/sap/opu/odata4/sap/zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001`
Action namespace: `com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001`

### Steps 6b / 7 — the live proofs

See `.superpowers/sdd/2026-09-12-dyngw-v2/task-18-report.md` for request/response evidence per
assertion. Summary: **all mandatory proofs landed**, one of them only after fixing a defect the
proof itself exposed (`ZBP_FS_DYNGWREGTP`'s create history — **L-474**), and two more defects were
found and fixed in this task's own code (**L-477**).

### Deviations and disclosures

- **Transport:** every object landed on the request `DS4K907263`, not task `DS4K907264` — the same
  deviation Task 17 recorded; `setObjectSource` refuses the task number outright (**L-471**).
- **`ZBP_FS_DYNGWREGTP` (Task 4's object) was modified** to fix the missing insert-history row.
  Disclosed prominently in the report; the controller may reverse it.
- **Live data left on the system:** `ZFS_T_DYN_REG` holds two rows — `QURY/T000` (the seed Step 7
  needs, and assertion 1's own act) and `QURY/T005`. `ZFS_T_DYN_CALL` / `ZFS_T_DYN_STEP` /
  `ZFS_T_DYN_REGH` hold this task's proof rows, which **are** the evidence.
- **Human prerequisite, not done:** G2's discriminating DCL test needs a user with `ACTVT '03'` and
  a **restricted** `ZDYNTGT`. No such user exists and creating one is forbidden (rule 1). Reported.

---

## Fix round 1 (2026-09-13)

Review: spec ✅, quality approved, no Critical; four Important findings.

- **Fix 1 — T000 residue cleared.** The pre-fix T000 row had no history row; deleted and re-POSTed.
  Registry now holds exactly two rows (T000, T005), history four (`I`/`D` for each). Last live
  write of the task, so Task 20 starts clean.
- **Fix 2 (I2) — `save_modified` UPDATE branch.** Was writing `after_json`/kind/name from the
  **pre**-image and gating on `sy-subrc`: an audit row where before == after. Now builds the
  after-image as pre-image overlaid per `%control`, and never skips the row. Delete branch checked
  and confirmed correct (buffer-based). **L-481.**
- **Fix 3 (Q3) — duplicate-key 500.** 035 pre-check added to `validateTarget` with
  `reg_uuid <> current`, matching `ZCL_FS_DYN_HDL_REGI` at the other door. Proved: HTTP 400 +
  `ZFS_TRM_MSG/035`, was HTTP 500 `RAISE_SHORTDUMP`.
- **`RegUuid` always zero — fixed, not explained away.** `/ui2/cl_json` deserialize was missing the
  `pretty_name = camel_case` the serializer used, so the only two underscore-bearing fields
  (`REG_UUID`, `IS_OUTSIDE_ROLLBACK`) silently did not bind. Proved populated. **L-482.**
- **Fix 4 (I4) — `LogLevel`: BLOCKED, awaiting a ruling.** `ZFS_T_DYN_CALL` did **not** have a
  `log_level` column; I added one, and the controller then read the post-change table and
  instructed me not to touch it. `revisions` shows a single version authored today at 03:42:22Z —
  my own activation. Column left in place, view/BDEF wiring reverted and re-activated, nothing
  inactive. Ruling needed: complete the wiring, or back the column out. **L-483.**
- Deferred to the final review as instructed: `rv_found` ignored; `CATCH cx_uuid_error → CONTINUE`;
  the 045/017 header-vs-step pairing.

ATC after the round: zero priority 1/2 on both changed classes. No service objects changed, so no
re-publish.

### Fix round 1, addendum

- **Fix 4 — NOT executed, and the ruling's premise does not hold.** The plan's `log_level` /
  `LogLevel` occurrences (lines 262, 522, 555, 599) are all inside **Registry** blocks
  (`zfs_t_dyn_reg`, `ZFS_R_DynGwRegTP`, `ZFS_C_DynGwRegTP`, the registry BDEF). The plan's
  `zfs_t_dyn_call` (line 314) has no `log_level` at all. So the column is **not** plan-specified on
  the call log, my adding it was an unspecified DDIC change, and wiring it through + re-publishing
  would have baked that in. Stopped; column left active and unwired; views/BDEF at pre-round
  content; no re-publish. Two options put to the controller: extend the plan and wire it, or back
  the column out. **L-484.**
- **Fix 2 (I2) — proved live** by a `PATCH` round-trip on T005 (`MaxRows` 50 → 60 → 50):
  the `'U'` history row shows `BeforeJson MAX_ROWS 50` / `AfterJson MAX_ROWS 60`. Also shows the
  035 pre-check does not false-positive on an update.
- **`'E' → 'N'` degrade — not proved, and cannot be until Fix 4 is wired.** Stated plainly rather
  than claimed.
- **Final state** (last live writes of this task): `ZFS_T_DYN_REG` 2 rows — T000 (`MaxRows` 100)
  and T005 (`MaxRows` 50), both `IsActive`/`AllowRead` true, `AllowWrite` false, `LogLevel` A;
  `ZFS_T_DYN_REGH` 6 rows, every live row with a create record. Nothing inactive, no locks held.

### Fix round 1, addendum 2 — Fix 4 closed as a removal

Human ruling: back the column out. Done.

- `log_level` dropped from `ZFS_T_DYN_CALL`; table now matches the plan's line-314 block exactly
  (`duration_ms` → `request_truncated`, nothing between). 32 lines, was 33.
- **DB conversion completed cleanly**: `activateObjects` zero messages, nothing left inactive, table
  fully readable afterwards. **Rows survived** — 30 before, 31 after; the extra row is a
  `CallFunctionModule` call this task never issued, i.e. **another agent is writing to
  `ZFS_T_DYN_CALL` concurrently** (Task 20's acceptance phase). Anyone asserting on row counts here
  should treat the call log as shared.
- No view, BDEF or `CREATE FIELDS` list referenced the field (reverted earlier, which is why the
  conversion activated clean). **No re-publish needed or done** — service metadata byte-identical.
- `ZFS_T_DYN_REG.log_level` untouched: that one is specified (plan 262) and wired end to end.
- **Review finding I4 is invalidated** — it was written against a table state created mid-round by
  the very change it prompted. Spec §524 defines `log_level` as a per-target property applying
  identically to call and step rows, so there is no call-log gap to close. **L-487.**
