# Fix LHC_SlcDttkDetail.update blanking every field a PATCH omits

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 (task DS4K907264) — the request the class already sits in
- **Requested by:** karthik.r@fourthsignal.com ("fix the LHC_SlcDttkDetail.update defect also")
- **Status:** ✅ Closed — fixed, activated, ATC clean of new findings, verified live. The stale CTS
  lock that blocked the save was cleared by the human in SM12 (open question #3).

## Scope

`LHC_SlcDttkDetail.update` merges the incoming entity with
`ls_db = CORRESPONDING zfs_slc_dttk_btp( BASE ( ls_db ) ls_entity MAPPING FROM ENTITY )`, which
copies **every** mapped field unconditionally — so any property a given `PATCH` does not send is
written back as its ABAP-initial value. Reproduced live on 2026-09-07 while building the DTTK
console (L-268): a `PATCH` carrying `ZdttkValue` alone cleared `Zstr`, `ZentId`, `ZottkNo`,
`ZottkBank`, `ZottkCurr`, `ZdttkCurr`, `Zdate`, `Ztenor`, `ZlcApp`, `ZlcBen`, `Zbukrs`, `Zrbusa`,
`ZintCat`, `ZintRate`, `ZdisBp`, `Zcbank`, `Zremark` and every derived text.

This is the sibling of the defect fixed in `LHC_SlcOttkDetail.update` on 2026-09-07 under L-266,
which explicitly recorded "fix it the same way the moment DTTK editing is ever exposed" — the
console exposed it.

Out of scope: any other method of this BO, the OTTK twin (already fixed), the CDS/BDEF layer.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which fields must the guarded merge cover? | Exactly the BDEF's `mapping for zfs_slc_dttk_btp` list, minus the key (`zdttk_no`) and minus the audit/log block (`zcreated_*`, `zchanged_*`, `local_*`, `last_changed_at`, all `field ( readonly )`): **61 business fields**. Read from the BDEF source, not guessed. Table columns `zdis_value`, `zdis_freq`, `zprint_dcl` are not mapped in the BDEF, so they are not entity fields and were never at risk. | 2026-09-08 |
| 2 | Keep the `lv_created_*` save/restore the method carries around the merge? | No — it exists only because the blind `CORRESPONDING` blanked those fields. With the per-field guards they are never touched: `ls_db` holds the values read from the database, and `zchanged_*`/`local_last_changed_*`/`last_changed_at` are reset immediately after. Same simplification the OTTK fix made. | 2026-09-08 |
| 3 | `setObjectSource` fails with *"Object LIMU CINC ZBP_FS_SLCDTTKDETAILTP========CCIMP is already locked in request DS4K907263 of user FS_DEV3"*. Retry, or escalate? | Escalate. `transportInfo` on the include showed the L-260 stale-lock signature: a `LOCKS` block (`HEADER` `DS4K907263`, `TASKS` `DS4K907264` opened 2026-09-07 20:09) and an **empty** `TRANSPORTS` array. Retried once with `transport = DS4K907264` supplied — same error, as L-260 predicts. Handed to the human, who cleared it in SM12; the next `lock` + `setObjectSource` succeeded first try. Recorded as L-271. | 2026-09-08 |
| 4 | After the SM12 cleanup `transportInfo` still showed the `LOCKS` block and an empty `TRANSPORTS` array — is it still blocked? | No. That block is just the object's normal CTS registration in the open request, not proof of a stale enqueue, so it is **not** a reliable all-clear signal on its own (a refinement of L-260's diagnosis). The write was attempted anyway and succeeded. The one change made this time: the ADT `lock()` was taken on the **include** URL (`.../includes/implementations`) rather than the class URL. | 2026-09-08 |
| 5 | Keep the console's client-side pass-through of the 15 unmapped writable properties now that the BO preserves omitted fields? | Kept, with the comment rewritten to say why: it is now redundant against DS4, but it keeps the console safe if it is ever pointed at a system where transport DS4K907263 has not been imported. | 2026-09-08 |

## Naming gate

Not applicable — no object created, no name chosen. `ZBP_FS_SLCDTTKDETAILTP` already exists and its
name was gated when it was created (2026-09-04 worklog).

## Todo

- [x] 1. Read the current `LHC_SlcDttkDetail` implementations include (292 lines) and the already
      fixed `LHC_SlcOttkDetail` for the exact established pattern
- [x] 2. Read `ZFS_CDS_SLC_002`'s BDEF to take the mapped field list from the source of truth
- [x] 3. Compose the fixed include: 61 `IF ls_entity-%control-<field> = if_abap_behv=>mk-on.`
      guards replacing the blind `CORRESPONDING`, plus removal of the now-redundant
      `lv_created_*` save/restore. Everything else byte-for-byte unchanged.
- [x] 4. `setObjectSource` — succeeded after the human's SM12 cleanup, filed under task DS4K907264
- [x] 5. Activate the class — `success: true`, `inactive: []`
- [x] 6. ATC re-run — 4 findings, all priority 3, identical to the pre-change set
- [x] 7. Live verification: create a full row, `PATCH` one field, confirm every other field survives,
      then delete the test row
- [x] 8. Reviewed the console's client-side mitigation — kept deliberately (open question #5)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_SLCDTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 (task DS4K907264) | active, changed (not created) |

## Delivery checks

- [x] Pretty Printer — source written in the class's existing formatting, unchanged elsewhere
- [x] Syntax check clean — activation carried no errors
- [x] Activated, nothing left inactive — `success: true`, `inactive: []`. One warning, pre-existing
      and unrelated: *"The operation READ ZFS_CDS_SLC_002 is not implemented"* (this unmanaged BO
      implements no read; reads are served by the CDS view)
- [x] ATC / Code Inspector — priority 1 and 2: none. Four priority-3 findings, all pre-existing:
      three "strings without text elements are not translated" on the existing validation message
      literals, plus the same READ-not-implemented warning
- [ ] ABAP Unit — none applicable (no unit tests exist on this behavior pool; the verification is the
      live PATCH round-trip in todo 7)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — the class is already in DS4K907263/task DS4K907264
- [x] Live functional test, through the DTTK console's own proxy on `http://localhost:8766`:
      - `POST` a fully populated row → 201, `ZdttkNo` `100035`
      - `PATCH {"ZdttkValue":825000}` — one field only, the exact call that used to wipe the row →
        200; re-read differs in **exactly** `ZdttkValue`. Before the fix the same call cleared
        `Zstr`, `ZentId`, `ZottkNo`, `ZottkBank`, `ZottkValue`, `ZottkCurr`, `ZdttkCurr`, `Zdate`,
        `Ztenor`, `ZlcApp`, `ZlcBen`, `Zbukrs`, `Zrbusa`, `ZintCat`, `ZintRate`, `ZdisBp`, `Zcbank`,
        `Zremark` and every derived text
      - audit trail correct: `ZcreatedBy`/`ZcreatedDate` preserved, `ZchangedBy` and the timestamps
        refreshed
      - `DELETE` → 204; **no test data left behind** — only the two pre-existing mock rows
        `100025`/`100026` remain

## Still open for the human

The fix lives in **DS4K907263 / task DS4K907264**, not yet released. Until that transport reaches the
downstream systems, their copies of `LHC_SlcDttkDetail.update` still carry the defect — the same is
true of L-266's OTTK fix, which sits in the same request.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-271, L-272 (which
supersedes L-268's "still open" status).
