# ZFS_I_SlcEntityString read-only entity + OTTK-only console with entity-driven defaults

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026") — chosen by the human from the three offered
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — view created and active, service extended and live, page rewired and tested

Follows on from `2026-09-07-ottk-dttk-web-console-odata-integration.md` (same console).

## Scope

Three changes requested together:

1. **Console is OTTK-only.** Remove the Create DTTK button, the whole DTTK modal, and — per the
   human's explicit choice — the edit/delete row buttons on **both** tables. The Distribution
   Tickets panel stays as a live read-only list.
2. **New read-only entity** in the OTTK service, mirroring the existing `Bank` endpoint, over table
   `ZSGTSFTR_ENT_STR` filtered `ZSLC = abap_true`.
3. **Entity String becomes a dropdown** in the Create OTTK modal, sourced from that entity, which
   auto-populates the description, and derives **LC Applicant from segment 2** and **LC Beneficiary
   from segment 1** of the selected entity id.

Out of scope: the DTTK service and its BO (untouched); the OTTK BO, its BDEF, behavior pool and DCL
(untouched — the new entity is a plain read-only view, so no behavior definition is needed, exactly
like `ZFS_I_SlcBank`).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | "delete the create DTTK button and edit and delete button also" — does that also take the OTTK table's own edit/delete row buttons, or only DTTK's? | Asked. Human chose **remove all edit/delete row buttons** on both tables. OTTK editing is therefore reachable only by clicking the OTTK No link, and there is now **no delete path on this screen at all** for either object. Create and update on OTTK are unaffected. | 2026-09-07 |
| 2 | Which transport? | Asked (the `abap_transport-get` tool mandates never auto-selecting). Human chose `DS4K907263`, the request already carrying every object of this SLC BTP build. | 2026-09-07 |
| 3 | The request said "each desc has 3 values with the separator of '-'", but in `ZSGTSFTR_ENT_STR` it is **`ZENT_ID`** that holds the 3-part value (`OGA-DMCC-PAN`); `ZENT_DESC` is a single token. | Read the live data before building. Confirmed the 3-part value is `ZENT_ID`, and that the segments map to columns **off by one**: segment 1 → `ZENT_DESC`, segment 2 → `ZENT1`, segment 3 → `ZENT2`, with `ZENT3` holding a CHAR8-truncated copy of the id (junk). Recorded as L-256. The UI prefers the stored columns and falls back to splitting `ZentId` on '-'. | 2026-09-07 |
| 4 | Does adding an exposure to an already-published service definition need a republish via `scripts/sap-gui-publish-service.py` (L-232)? | No — checked `$metadata` straight after activating the SRVD and `EntityString` was already listed, `GET /EntityString` returned 200, metadata ETag moved. No publish run needed. Recorded as L-255, which scopes L-220/L-232 to first-time binding publication. | 2026-09-07 |
| 5 | On edit, the "desc" beside the dropdown shows the BO's computed `ZentDesc` (`"OGA-DMCC-PAN - OGA"`), while on create it shows the master `ZentDesc` (`"OGA"`). | Left as is — each is "the description" from its own source, and the create-side value is what the request asked for. Flagged to the human rather than silently normalising one to the other. | 2026-09-07 |

## Naming gate

Recorded **before** the create call:

```
NAMING: ZFS_I_SlcEntityString -> matches docs/naming-conventions.md "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view so no TP suffix (line 68), mirroring the ZFS_I_SlcBank precedent already exposed in this same service
```

No other object was created. `ZFS_SD_SLCOTTKDETAIL` was **changed**, not created, so it is out of the
gate (pre-existing, conformant name).

## Todo

- [x] 1. Read `ZSGTSFTR_ENT_STR` structure (`DD03L`) and its live `ZSLC = 'X'` rows before designing
      the view — this is what caught the off-by-one column mapping (L-256)
- [x] 2. Naming gate recorded, then `ZFS_I_SlcEntityString` created via **`adt-mcp`** (`DDLS/DF`,
      package `ZFS_SLC_BTP`, transport `DS4K907263`) per the routing rule
- [x] 3. Source written via **`mcp-abap-abap-adt-api`** (`lock` → `setObjectSource` → `unLock`) —
      `select distinct`, `key zent_id`, exposing `ZentId`/`ZentDesc`/`Zent1`/`Zent2`, `where zslc = 'X'`;
      `zent3` deliberately omitted (L-256). Activated clean, no messages.
- [x] 4. `ZFS_SD_SLCOTTKDETAIL` changed (`mcp-abap-abap-adt-api`) to add
      `expose ZFS_I_SlcEntityString as EntityString;`, activated clean
- [x] 5. Verified the new entity set live — no republish needed (L-255)
- [x] 6. Console: Create DTTK button, DTTK modal markup (47 lines) and DTTK modal JS (79 lines) all
      removed; both removals guarded by boundary assertions so no OTTK code could be caught in them
- [x] 7. Console: Actions column dropped from both tables (colgroup, header, cells), `bindRowActions`
      replaced by a smaller `bindRows`, dead `.row-actions` CSS and the CSV export's row-actions
      filter removed, DTTK No demoted from link to plain text (nothing to open any more)
- [x] 8. Console: Entity String is now a `<select>` filled from `/api/ottk/EntityString`; on change it
      sets the desc, LC Beneficiary (segment 1) and LC Applicant (segment 2). The OTTK filter panel's
      hardcoded entity list is now filled from the same entity.
- [x] 9. `loadBanks` → `loadLookups` (it now loads two lookups); the DTTK `Bank` fetch was dropped
      with the DTTK modal it served
- [x] 10. `lessons/lessons-ledger.md` — L-255 and L-256 recorded in the same turn

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcEntityString | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **created**, active |
| ZFS_SD_SLCOTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | pre-existing, **changed** (one `expose` added), active |

Workspace files changed: `web/ottk-dttk-console/index.html` only.

## Delivery checks

- [x] Pretty Printer — n/a, CDS/SRVD source hand-written with consistent indentation
- [x] Syntax check clean — both activations returned `success: true` with no messages
- [x] Activated, nothing left inactive — both activations reported `inactive: []`
- [ ] ATC / Code Inspector — **not run**. A four-field read-only projection with a single `where`,
      mirroring `ZFS_I_SlcBank` which passed ATC clean in the 2026-09-04 build. Worth a run if this
      view is ever extended.
- [x] ABAP Unit — none applicable; no behavior, no class (L-216)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — both calls echoed `DS4K907263`
- [x] Live functional test:
      - `GET /EntityString` → 200, exactly the 7 `ZSLC = 'X'` rows, correct segment columns
      - `$metadata` lists `Bank`, `EntityString`, `SlcOttkDetail`
      - `POST SlcOttkDetail` with `ZentId "OGA-DMCC-PAN"`, `ZlcBen "OGA"` (seg 1), `ZlcApp "DMCC"`
        (seg 2) → 201 as `100036`, echoed `ZentDesc "OGA-DMCC-PAN - OGA"`; record deleted again (204)
      - page JS passes `node --check`; every `getElementById` target resolves; colgroup/header/cell
        counts line up on both tables (13/13/13 and 16/16/16)
      - **no test data left behind**
- [ ] Browser click-through — **not performed by me** (no browser-automation tool in this session).
      The dropdown's auto-fill behaviour in particular is verified only by code review plus the
      equivalent API-level create.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-255, L-256.
