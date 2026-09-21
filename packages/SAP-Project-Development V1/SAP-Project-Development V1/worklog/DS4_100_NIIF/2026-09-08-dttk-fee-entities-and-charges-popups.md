# DTTK fee entities (confirmation + discounting) and the two Charges popups

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 (task DS4K907264)
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — all five asks delivered: 7 objects created + 1 changed, activated, ATC
  clean of priority 1/2, live-tested end to end, no test data left behind.

## Scope

Five asks in one instruction:

1. Modal popup alignment — **done**, see *Console changes* below.
2. Remove the delete functionality from `web/dttk-console/index.html` — **done**.
3. Confirmation Fee gets its own Charges button, fed by a new fee-type entity on the DTTK service
   filtered `zcfee_flag = 'X'`.
4. Discounting's Other Charges button fed by a new fee-type entity filtered `zdttk = 'X'`.
5. Charge lines persisted to `ZSGSLCTR_FEEDATA` the way OTTK does it — `ztype = '02'` with the DTTK
   number — through a new fee BO on the DTTK service.

Out of scope: any change to the OTTK service or its fee objects; the fee master table
`ZSGSLCTR_FEE` itself (read-only here); the DTTK header BO (already fixed under L-272).

## What the system already provides (read, not assumed)

- `ZSGSLCTR_FEEDATA` key is `client, ztype, zfee_type, zottk_no, zdttk_no`. **DTTK rows already
  exist** on the system with `ztype = '02'`, `zottk_no = ''` and `zdttk_no` filled (e.g. `100019`,
  `100020`, `100021`) — so the target shape is confirmed by live data, not inferred.
- `ZSGSLCTR_FEE` carries the flags `zottk`, `zdttk`, `zcfee_flag`, `zvncp`. Live counts:
  `zdttk = 'X'` → 13 fee types (F01-F10, F15, F16, F17); `zcfee_flag = 'X'` → F04
  "Confirmation Fees" (which also carries `zdttk = 'X'`).
- OTTK's equivalents, to be mirrored: `ZFS_I_SlcFeeType` (`where zottk = 'X'`), `ZFS_I_SlcOttkFee`
  (root, `where a.ztype = '01'`, currency joined from the header table), `ZFS_C_SlcOttkFeeTP`
  (projection), both BDEFs, and `ZBP_FS_SLCOTTKFEETP` whose `create` sets `ztype = '01'` and
  `zdttk_no = space` and whose `update` already uses the per-field `%control` merge (L-266 pattern).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | **Naming gate mismatch.** `docs/naming-conventions.md` says a RAP BO root view is `ZFS_R_<Entity>TP` — "never `ZFS_I_<Entity>`". But the OTTK fee BO this is to mirror uses `ZFS_I_SlcOttkFee` as its root. Inherit the family's shape (`ZFS_I_SlcDttkFee`) or follow the convention (`ZFS_R_SlcDttkFeeTP`)? Rule 1 says stop and ask rather than inherit a non-conformant name. | Human chose **`ZFS_I_SlcDttkFee`** — family consistency with the OTTK twin over the root-view row. Logged as a named exception in `docs/naming-conventions.md` (human, 2026-09-08), scoped to that one object; the projection and behavior pool are fully conformant. | 2026-09-08 |
| 2 | F04 carries **both** `zcfee_flag` and `zdttk`, so it would appear in both popups — and both write the same `(ZdttkNo, ZfeeType)` row, so the two totals would fight over it. Make the Other Charges list `zdttk = 'X' AND zcfee_flag = ''` so the lists are disjoint? | Yes — human chose the disjoint lists. Confirmation Fee offers F04 only; Other Charges offers the other 12 DTTK-flagged types. Every stored line belongs to exactly one total. Recorded as L-275. | 2026-09-08 |

## Naming gate

Recorded before the first create call, after the human answered open question #1:

```
NAMING: ZFS_I_SlcCFeeType   -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row
NAMING: ZFS_I_SlcDFeeType   -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row
NAMING: ZFS_I_SlcDttkFee    -> matches exception row "ZFS_I_SlcDttkFee" (human, 2026-09-08),
                               mirroring the live ZFS_I_SlcOttkFee deviation
NAMING: ZFS_C_SlcDttkFeeTP  -> matches "Consumption / projection view | ZFS_C_<Entity>TP" row
NAMING: ZBP_FS_SLCDTTKFEETP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row
NAMING: LHC_SlcDttkFee      -> matches "Behavior handler | LHC_<Entity>" row
```

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZFS_I_SlcCFeeType` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active — fee types `where zcfee_flag = 'X'` (F04) |
| `ZFS_I_SlcDFeeType` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active — `where zdttk = 'X' and zcfee_flag = ''` (12 types) |
| `ZFS_I_SlcDttkFee` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active — root over `zsgslctr_feedata where ztype = '02'`, key `(ZdttkNo, ZfeeType)`, currency joined from `zfs_slc_dttk_btp` |
| `ZFS_C_SlcDttkFeeTP` | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active — projection, `provider contract transactional_query` |
| `ZFS_I_SlcDttkFee` | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active — unmanaged, `mapping for zsgslctr_feedata` |
| `ZFS_C_SlcDttkFeeTP` | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active — projection (`use create/update/delete`) |
| `ZBP_FS_SLCDTTKFEETP` | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active — `create` sets `ztype = '02'`, `zottk_no = space`; `update` uses the per-field `%control` merge from the start (never the blind `CORRESPONDING` — L-251/L-266/L-272) |
| `ZFS_SD_SLCDTTKDETAIL` | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | active, **changed** — now exposes `CFeeType`, `DFeeType`, `SlcDttkFee` |

**No lock object and no message were created.** `EZFS_T_OTTK_FEE` already locks `ZSGSLCTR_FEEDATA`
on its full key (`CLIENT, ZTYPE, ZFEE_TYPE, ZOTTK_NO, ZDTTK_NO`), so it covers the `'02'` rows too;
and `ZFS_TRM_MSG` 016 already fits the fee BO's not-found case, so it was reused and its catalog
entry extended rather than adding a 17th message. Both recorded in L-275.

**No republish was needed** — the binding picked up the three new entity sets on activation of the
service definition alone (L-274), which also avoided driving the human's only SAP GUI session away
from the screen they were working in.

## Console changes (done this turn)

- **Modal layout.** The shared stylesheet places the five modal sections by `:nth-child` into areas
  sized for the OTTK form; the DTTK form has a different shape (14-field Discounting block, 7-field
  Confirmation block), so it inherited a cramped, misaligned grid. Replaced with a DTTK-specific
  layout keyed on `.dttk-grid` and per-section `.sec-*` classes — higher specificity than the shared
  rules, so the inherited media queries can no longer reshuffle the areas. Basic | Trade on row one,
  Confirmation | Discounting on row two, Additional full width, collapsing to one column under
  1080px. Every section now uses one field rhythm (`auto-fit` columns, `align-items:end`), so labels,
  inputs, compounds, suffix selects and the checkbox all sit on the same baseline.
- **Delete removed** — button, handler, mode-switch wiring and CSS all gone; the console is
  create/read/update only.

## Console changes (fee wiring)

- Confirmation Fee is now a read-only total with its own breakdown button, exactly like Other
  Charges; the two buttons open the same Charges popup in different contexts (title, fee list and
  target field switch).
- Rows come from `CFeeType` / `DFeeType`; the grid keeps the OTTK calculation rules (Category `02`
  Flat Amount takes the typed Amount; otherwise Base x Rate% x Period/360, with Code for Collection
  choosing Standard / Greater of Two / Least of Two).
- Opening the editor stages that ticket's stored lines in the background and splits them across the
  two grids; Copy carries the source ticket's lines into the new ticket.
- Saving replaces the ticket's stored line set wholesale (delete-then-insert, the OTTK approach) and
  reports `{saved, failed[]}` in the success modal rather than a toast the modal would cover.
- `Zsgsart` is deliberately not sent, matching the OTTK console. Legacy DTTK rows on the system carry
  `27B` there (copied from the fee master); rows written by this console leave it blank, exactly as
  the OTTK console's rows do. Flag it if that field matters downstream.

## Delivery checks

- [x] Pretty Printer — new ABAP written in the sibling objects' formatting
- [x] Syntax check clean — all activations carried no errors
- [x] Activated, nothing left inactive — every activation returned `success: true`, `inactive: []`.
      Warnings only: the standing "READ ... is not implemented" on the unmanaged pool, and an
      AccessControl annotation difference between projection (`#CHECK`) and base (`#NOT_REQUIRED`) —
      both identical to what the OTTK fee objects carry
- [x] ATC / Code Inspector — priority 1 and 2: none. Three priority-3 findings on the behavior pool,
      each matching the OTTK twin's own set: "SELECT SINGLE is possibly not unique" (the update's
      WHERE covers `ztype + zdttk_no + zfee_type`; `zottk_no` is always blank on `'02'` rows, so it
      is unique in practice), one untranslated literal, and the READ-not-implemented warning. The
      four CDS views produced no findings at all
- [x] ABAP Unit — none applicable (no unit tests on these behavior pools; verification is the live
      round-trip below)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — all eight objects in DS4K907263
- [x] Live functional test, through the console's own proxy on `http://localhost:8766`:
      - service document now lists `Bank, CFeeType, DFeeType, SlcDttkDetail, SlcDttkFee`
      - `CFeeType` → 1 row (F04); `DFeeType` → 12 rows, F04 correctly absent
      - `SlcDttkFee` reads the 5 pre-existing `ztype='02'` rows (`100019`-`100021`)
      - fee BO round-trip on a real ticket: `POST` → 201 with currency resolved through the join,
        `PATCH` → 200 changing only the sent fields, `$filter` by `ZdttkNo` → 1 row, `DELETE` → 204
      - **L-263 re-confirmed**: `PATCH {"ZfAmt":...}` without `ZdttkCurr` → 400 *"Together with
        property 'ZfAmt' also property 'ZdttkCurr' needs to be provided"*; with it → 200
      - full console flow: header with `Zcfee`/`Zofee` + one confirmation line (F04) and one other
        line (F01) → both stored; re-save (delete-then-insert) left exactly the re-sent line
      - **no test data left behind** — every header (`100036`-`100038`) and line created here was
        deleted; the 5 legacy fee rows and the 2 mock headers are untouched
- [x] JavaScript parses (`node --check`) and every `getElementById` target resolves
- [ ] Browser click-through of the modal and both Charges popups — **the human's own check**; no
      browser automation is available in this session

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-273, L-274, L-275.
