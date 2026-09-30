# Gateway table split — Tasks 2 & 3 (create GWCALL, GWSTEP, GWREG, GWREGH)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263
- **Requested by:** vinit.s@fourthsignal.com (via plan `docs/superpowers/plans/2026-09-12-0059-dyngateway-table-split.md`,
  Tasks 2 and 3, batched into one dispatch per controller instruction)

## Scope

Task 2 creates two transparent tables, `ZFS_T_SLC_GWCALL` (call-log header) and `ZFS_T_SLC_GWSTEP`
(call-log step), splitting them out of the legacy `ZFS_T_SLC_DYNGW` table per the table-split plan.
Task 3 creates two more, `ZFS_T_SLC_GWREG` (allow-list registry) and `ZFS_T_SLC_GWREGH` (allow-list
history), and sets technical buffering settings on all four (only `GWREG` is fully buffered). No
existing objects are read, changed, or deleted this activity. Two-step DDIC build per L-217:
`adt-mcp` skeleton create, then `mcp-abap-abap-adt-api` `setObjectSource` for fields — never the
reverse, and never `sap-gui` for source. `deleteObject` is denied project-wide, so naming is
verified before every create call, with no room for a do-over.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|

## Naming gate

Recorded **before** any create call:

```
NAMING: ZFS_T_SLC_GWCALL -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWSTEP -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWREG  -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (15 chars, cap 16), AREA=SLC
NAMING: ZFS_T_SLC_GWREGH -> matches "Transparent table | ZFS_T_<AREA>_<NAME>" (16 chars, cap 16), AREA=SLC
```

## Todo

- [x] 1. Confirm system/client/user via `sap_get_session_info` (via `sap_connect_existing`)
- [x] 2. Task 2: create `ZFS_T_SLC_GWCALL` skeleton (adt-mcp), set fields (setObjectSource)
- [x] 3. Task 2: create `ZFS_T_SLC_GWSTEP` skeleton (adt-mcp), set fields (setObjectSource)
- [x] 4. Task 2: activate both in one call, verify with `SELECT COUNT(*)`
- [x] 5. Task 2: read back activated source, save to `source/task-2-3/`
- [x] 6. Task 3: create `ZFS_T_SLC_GWREG` skeleton (adt-mcp), set fields (setObjectSource)
- [x] 7. Task 3: create `ZFS_T_SLC_GWREGH` skeleton (adt-mcp), set fields (setObjectSource)
- [x] 8. Task 3: activate both in one call, verify with `SELECT COUNT(*)`
- [x] 9. Task 3: read back activated source, save to `source/task-2-3/`
- [x] 10. Task 3: set technical (buffering) settings via sap-gui SE11, GWREG fully buffered, others not
- [x] 11. Commit

## System confirmation

`mcp__sap-gui__sap_connect_existing()` → `sap_get_session_info()`-equivalent payload:
```
system_name: DS4
client:      100
user:        FS_DEV3
```
Confirmed matches `DS4_100_NIIF` / `FS_DEV3`. `mcp-abap-abap-adt-api healthcheck` returned
`{"status":"healthy"}`.

## Task 2 — GWCALL and GWSTEP

### Create skeletons (`adt-mcp` `abap_creation-create_object`, `TABL/DT`)

- `ZFS_T_SLC_GWCALL`: `{"filePath":"abap:/repotree-v1/DS4_100_NIIF/System%20Library/ZFS_SLC_BTP/Dictionary/Database%20Tables/ZFS_T_SLC_GWCALL/zfs_t_slc_gwcall.tabl.ddic","message":"Database Table created successfully"}`
- `ZFS_T_SLC_GWSTEP`: `{"filePath":"abap:/repotree-v1/DS4_100_NIIF/System%20Library/ZFS_SLC_BTP/Dictionary/Database%20Tables/ZFS_T_SLC_GWSTEP/zfs_t_slc_gwstep.tabl.ddic","message":"Database Table created successfully"}`

### Set fields (`mcp-abap-abap-adt-api`: `lock` → `setObjectSource` → `unLock`)

Both objects: `lock` → `{"status":"success","lockHandle":"..."}`; `setObjectSource` (transport
`DS4K907263`, exact DDL from `task-2-brief.md` Steps 3/4) → `{"status":"success","updated":true}`;
`unLock` → `{"status":"success","message":"Object unlocked successfully"}`.

### Activate (one call)

`mcp__adt-mcp__abap_activate_objects` first attempt with `/sap/bc/adt/ddic/tables/...` URIs failed:
`Error executing tool: Project must not be <null>`. `abap_list_destinations` still returned
`[DS4_100_NIIF]` (context not lost, ruling out L-333) — the real cause was using the forbidden
`/sap/bc/adt/` URI form; the tool's own schema says to use the `abap:` repotree URI instead. Retried
with the `filePath` values returned by `create_object` (URL-encoded) for both objects in one call:
**`Activation successful.`** (0 messages/errors — expected outcome met.)

### Verify

```
SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWCALL  -> {"CNT":"0 "}
SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWSTEP  -> {"CNT":"0 "}
```
Both `CNT = 0` — table exists and is readable.

### Read-back source

`getObjectSource` on `/sap/bc/adt/ddic/tables/zfs_t_slc_gwcall/source/main` and
`.../zfs_t_slc_gwstep/source/main` — both returned byte-identical to the DDL submitted in
`setObjectSource`. Saved to:
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-2-3/ZFS_T_SLC_GWCALL.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-2-3/ZFS_T_SLC_GWSTEP.abap`

## Task 3 — GWREG and GWREGH

### Create skeletons

- `ZFS_T_SLC_GWREG`: `{"filePath":"abap:/repotree-v1/DS4_100_NIIF/System%20Library/ZFS_SLC_BTP/Dictionary/Database%20Tables/ZFS_T_SLC_GWREG/zfs_t_slc_gwreg.tabl.ddic","message":"Database Table created successfully"}`
- `ZFS_T_SLC_GWREGH`: `{"filePath":"abap:/repotree-v1/DS4_100_NIIF/System%20Library/ZFS_SLC_BTP/Dictionary/Database%20Tables/ZFS_T_SLC_GWREGH/zfs_t_slc_gwregh.tabl.ddic","message":"Database Table created successfully"}`

### Set fields

Same lock → setObjectSource → unLock sequence, both `{"status":"success","updated":true}` /
`{"status":"success","message":"Object unlocked successfully"}`. `GWREG` uses
`@AbapCatalog.deliveryClass : #C` (deliberate deviation from the legacy table's `#A`, per spec
§3.1 open risk 3 — this is configuration, not application data). `GWREGH` uses `#A`.

### Activate (one call)

`mcp__adt-mcp__abap_activate_objects` with both `abap:/repotree-v1/...` URIs → **`Activation
successful.`** (0 messages — expected outcome met.)

### Verify

```
SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWREG   -> {"CNT":"0 "}
SELECT COUNT(*) AS CNT FROM ZFS_T_SLC_GWREGH  -> {"CNT":"0 "}
```
Both `CNT = 0`.

### Read-back source

`getObjectSource` on both tables' `source/main` — byte-identical to submitted DDL. Saved to:
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-2-3/ZFS_T_SLC_GWREG.abap`
- `.superpowers/sdd/2026-09-12-dyngateway-table-split/source/task-2-3/ZFS_T_SLC_GWREGH.abap`

### Technical settings (buffering) — `sap-gui` SE11, per controller ruling P2

Buffering is a technical setting, not ABAP source — SE11 Technical Settings is the correct route
(not the forbidden case). For each table: `SE11` → enter name → Display (or Change for the one
being modified) → app-toolbar button "Technical Settings" (`Ctrl+Shift+F9`, `SE13`).

| Table | Action | Result |
|---|---|---|
| `ZFS_T_SLC_GWCALL` | Display only (default state expected) | Already **Buffering Not Allowed** — no change needed. Confirmed by screenshot. |
| `ZFS_T_SLC_GWSTEP` | Display only | Already **Buffering Not Allowed** — no change needed. Confirmed by screenshot. |
| `ZFS_T_SLC_GWREGH` | Display only | Already **Buffering Not Allowed** — no change needed. Confirmed by screenshot. |
| `ZFS_T_SLC_GWREG` | Change → radio "Buffering Activated" → checkbox "Fully Buffered" → Save | See below |

**GWREG detail.** Radio defaulted to "Buffering Not Allowed" with all Buffering-Type checkboxes
disabled/unchecked (confirmed by screenshot before any change). Selected radio
`ALLOWSTATE-ALLOWED_ON` ("Buffering Activated"); the checkbox set attempted immediately after
this didn't take (checkboxes were still greyed until an explicit `Enter` processed the radio
change server-side — screen status flipped from `Actv./saved` to `revised/not saved` only after
that `Enter`). Re-checked `PUFFERUNG-COMPLETE` ("Fully Buffered") — took, confirmed by screenshot
(checked, radio still "Buffering Activated").

Save (`F11`) produced a persistent warning **"If no change log is required, a rating must be
entered"** even though "Rating" already showed "Not required" (the field was `required:true` /
`highlighted:true` per `sap_read_field` — SAP's own default value hadn't been "confirmed" as user
input). Re-selecting "Not required" explicitly via `sap_select_combobox_entry`, then `Enter`
(not `Save`) surfaced the real blocking condition: a hard error, **"Enter a remark for 'Table
Logging Requirement'."** Filled `Reason (in English)` with: *"Configuration table (deliveryClass
C), fully buffered by design - change logging not required"*. `Save` then succeeded — status bar
message `Saved` (AD 260); a transport prompt followed with `DS4K907263` pre-filled, confirmed with
Enter.

**Activation gap caught by an explicit ADT check (per the human's mid-task instruction to verify
via `mcp-abap-abap-adt-api`).** After saving, SE11 still showed `Status: revised` (screenshot).
`mcp__mcp-abap-abap-adt-api__inactiveObjects` was queried and it listed both
`ZFS_T_SLC_GWREG` (`TABL/DT`) and its technical-settings sub-object
`/sap/bc/adt/ddic/db/settings/zfs_t_slc_gwreg` (`TABL/DTT`) as inactive under transport
`DS4K907264`/`DS4K907263`. Activated with
`mcp__adt-mcp__abap_activate_objects` on the same `abap:/repotree-v1/.../zfs_t_slc_gwreg.tabl.ddic`
URI used earlier → `Activation successful.` Re-queried `inactiveObjects` — `ZFS_T_SLC_GWREG` and
its `TABL/DTT` sub-object no longer appear (the remaining rows in the list are unrelated, pre-existing
inactive objects from earlier sessions, not touched here). Re-opened SE11 → Technical Settings in
Display mode: **`Status: Actv. / saved`**, `Buffering Activated` selected, `Fully Buffered` checked.
Confirmed live.

**Expected for `GWREG`: Buffering switched on, "Fully Buffered".** — **Met, and independently
confirmed active (not just saved) via `mcp-abap-abap-adt-api` `inactiveObjects`.**

**Lesson for the ledger:** a Technical Settings save in SE11 can leave the object `revised`/inactive
exactly like a DDIC source change — don't trust the SE11 "Saved" status-bar message alone; check
`inactiveObjects` (or reopen in Display and read the `Status` field) and activate if needed before
reporting the setting as live.

### Faster confirmation, all four, via `mcp-abap-abap-adt-api` (no `sap-gui` needed for reads)

Per a mid-task correction: `objectStructure` on any `TABL/DT` object returns a
`http://www.sap.com/adt/relations/technicalsettings` link
(`/sap/bc/adt/ddic/db/settings/<table>`), and `getObjectSource` on that URL returns the technical
settings as XML — including `<ts:buffering><ts:allowed>` and `<ts:type>` — without touching
`sap-gui` at all. This is strictly faster than the SE11 navigation loop used above and should be
the **first** choice for reading (not writing) technical settings in future activities; `sap-gui`
SE11 remains the only route for *writing* buffering (ADT has no write API for table technical
settings — `setObjectSource` only ever writes the DDL text, never this settings sub-object).
Confirmed all four with this route:

```
ZFS_T_SLC_GWCALL  -> <ts:buffering><ts:allowed>N</ts:allowed><ts:type/></ts:buffering>
ZFS_T_SLC_GWSTEP  -> <ts:buffering><ts:allowed>N</ts:allowed><ts:type/></ts:buffering>
ZFS_T_SLC_GWREGH  -> <ts:buffering><ts:allowed>N</ts:allowed><ts:type/></ts:buffering>
ZFS_T_SLC_GWREG   -> <ts:buffering><ts:allowed>X</ts:allowed><ts:type>X</ts:type></ts:buffering>
```
`allowed=N` = "Buffering Not Allowed" (GWCALL/GWSTEP/GWREGH, unchanged default — matches
requirement). `allowed=X`/`type=X` = buffering active with type "Full buffering" (GWREG — matches
"Fully Buffered" requirement). This is the authoritative, machine-readable confirmation for all
four tables' buffering state, cross-checking the SE11 screenshots taken earlier in this same step.

## System confirmation for buffering step

Re-confirmed mid-task: `sap-gui` session remained on `DS4`/`100`/`FS_DEV3` throughout (SE11/SE13
screens show `FS_DEV3` in the status bar for every screenshot taken).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_SLC_GWCALL | TABL/DT | ZFS_SLC_BTP | DS4K907263 | Active, buffering not allowed (default) |
| ZFS_T_SLC_GWSTEP | TABL/DT | ZFS_SLC_BTP | DS4K907263 | Active, buffering not allowed (default) |
| ZFS_T_SLC_GWREG | TABL/DT | ZFS_SLC_BTP | DS4K907263 | Active, fully buffered |
| ZFS_T_SLC_GWREGH | TABL/DT | ZFS_SLC_BTP | DS4K907263 | Active, buffering not allowed (default) |

## Delivery checks

- [x] Pretty Printer — n/a, DDL entered directly matches house style already
- [x] Syntax check clean — implied by clean activation (0 messages) for all 4 tables
- [x] Activated, nothing left inactive — verified via `inactiveObjects`, including the GWREG
      technical-settings gap caught and fixed mid-task
- [ ] ATC / Code Inspector — not run this activity (DDIC-only, no executable code)
- [ ] ABAP Unit green — n/a, no classes/methods created
- [ ] Text symbols and selection texts maintained — n/a, no text elements this activity
- [x] Object list confirmed in the transport — all 4 tables + GWREG's technical-settings entry seen
      under `DS4K907263`/`DS4K907264` via `inactiveObjects` transport grouping

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-371, L-372.
