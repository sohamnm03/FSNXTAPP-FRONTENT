# RAP unmanaged scenario for ZFS_SLC_T_OTTK (Outward SLC tracking)

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_DEMO
- **Transport:** DS4K907209 ("SLC FY:26 demo")
- **Requested by:** saumya.s@fourthsignal.com

## Scope

Build a full hand-coded RAP **unmanaged** business object with all CRUD (Create, Read, Update,
Delete) over the existing transparent table `ZFS_SLC_T_OTTK` ("OTTK Data" — outward SLC/LC
tracking), exposed as an OData V4 Web API service binding. Table already exists on the system
(confirmed via `getObjectSource`); it is **not** created here and its own name is out of the
naming gate (pre-existing object). Follows `docs/rap-unmanaged-web-api-pattern.md` (the
`ZFS_T_TRM_LIMPT` → `TrmLimPtTP` precedent) since no generator supports `implementationType:
Unmanaged`.

Table key: `client` (mandt) + `uuid` (sysuuid_x16) + `zottk_no` (zsgslcdt_otno). No single
last-changed timestamp field exists on the table (only separate date/time pairs for created/changed)
— **no `etag master` clause** is used; `lock master` is still implemented via
`cl_abap_lock_object_factory`. Out of scope: draft (not requested, unmanaged has no draft here),
any change to the table itself, any object not listed below.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Table has no single last-changed timestamp (only split date/time fields) — proceeding without an `etag master` clause (no optimistic concurrency token). Flagging for awareness, not blocking. | Proceeding without etag (mechanical/technical call, not a draft-type decision) | 2026-09-04 |
| 2 | How should `ZottkNo` (OTTK tracking number) be generated on create? | Human instructed mid-build: use existing number range object `ZFS_OTTK_D` (interval `01`, 100001–999999, package `ZFS_SLC_DEMO`, pre-existing — not created here) via `CL_NUMBERRANGE_RUNTIME=>NUMBER_GET`. `ZottkNo` changed from client-mandatory-on-create to fully system-generated/readonly. | 2026-09-04 |

## Naming gate

Record one line per object **before** the create call (`docs/naming-conventions.md`, L-027).
Entity base name: `SlcOttk` (AREA `SLC` embedded in the CamelCase entity, following the
`ZFS_T_TRM_LIMPT` → `TrmLimPt` precedent in `docs/rap-unmanaged-web-api-pattern.md`).

```
NAMING: ZFS_I_SlcOttk -> matches CDS "Interface (basic/composite) view" row (ZFS_I_<Entity>); unmanaged interface strips TP per the TrmLimPt worked example, and carries the BDEF (rap-unmanaged-web-api-pattern.md §1)
NAMING: ZFS_I_SlcOttk (BDEF, unmanaged) -> matches "Behavior definition | same as root view" row
NAMING: ZFS_C_SlcOttkTP -> matches "Consumption / projection view | ZFS_C_<Entity>" row; TP kept as it carries behavior
NAMING: ZFS_C_SlcOttkTP (BDEF, projection) -> matches "Behavior definition | same as root view" row (projection BDEF)
NAMING: ZBP_FS_SLCOTTKTP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row
NAMING: LHC_SlcOttk -> matches "Behavior handler | LHC_<Entity>" row; TP stripped per L-226 (live-sibling precedent overrides the unmanaged doc's own worked example)
NAMING: LSC_SlcOttk -> matches "Saver | LSC_<Entity>" row; TP stripped per L-226
NAMING: EZFS_SLC_T_OTTK -> matches Dictionary "Lock object | EZFS_T_<NAME>" row, mirroring the table's own ZFS_SLC_T_OTTK suffix (table name itself is pre-existing/out of gate)
NAMING: ZFS_I_SLCOTTK (DCL) -> matches "Access control (DCL) | same name as the view it protects" row (protects ZFS_I_SlcOttk)
NAMING: ZFS_SD_SLCOTTK -> matches "Service definition | ZFS_SD_<Entity>" row (TP stripped)
NAMING: ZFS_SB_SLCOTTK_O4_API -> matches "Service binding | ZFS_SB_<Entity>_<O2/O4>_<UI/API>" row (Web API -> _O4_API, per TrmLimPt precedent)
NAMING: ZFS_TRM_MSG (message 014, new) -> matches Classic & Misc "Message class" listed-exception row; no new class created
```

`ZFS_OTTK_D` (number range object, `NROB/NRO`) is **pre-existing** (confirmed via `searchObject` +
`NRIV` read: package `ZFS_SLC_DEMO`, interval `01`, 100001-999999) — used, not created; no naming
gate entry needed since nothing was created.

## Todo

- [x] 1. `ZFS_I_SlcOttk` — root view entity + unmanaged BDEF, all 64 table fields exposed CamelCase
- [x] 2. `ZFS_C_SlcOttkTP` — projection view + projection BDEF (`use create/update/delete`)
- [x] 3. `EZFS_SLC_T_OTTK` — lock object on `ZFS_SLC_T_OTTK`
- [x] 4. `ZBP_FS_SLCOTTKTP` — behavior pool: `LHC_SlcOttk` (create/update/delete/lock), `LSC_SlcOttk` (no-op saver)
- [x] 5. `ZFS_I_SLCOTTK` — DCL access control (global, `authorization master(global)`)
- [x] 6. New message 014 in `ZFS_TRM_MSG`; catalog file updated same turn
- [x] 7. `ZFS_SD_SLCOTTK` — service definition exposing `ZFS_C_SlcOttkTP`
- [x] 8. `ZFS_SB_SLCOTTK_O4_API` — OData V4 Web API service binding
- [x] 9. Activate everything in dependency order; ATC check (priority-2 SELECT * finding fixed, see L-236)
- [x] 10. Publish — script's row-match failed on an exact-looking `GROUP_ID` (see L-237); published
      manually via `sap-gui` MCP tools instead (`/IWFND/V4_ADMIN` → filter → select → `PUBLISH` →
      confirm). `fetch_services` confirms `isPublished: true`.
- [x] 11. Functional smoke test — run live against
      `https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_slcottk_o4_api/srvd_a2x/sap/zfs_sd_slcottk/0001/SlcOttk`
      (Basic auth, CSRF token fetch, TLS cert bypass for the internal self-signed cert). Full CRUD
      confirmed: `POST` (201, `ZottkNo` generated as `100026`/`100027` from `ZFS_OTTK_D`), `GET`
      single (200), `PATCH` (200, field change verified on re-read), `DELETE` (204, confirmed gone
      on re-GET → 404). Not-found path verified: `PATCH`/`DELETE` on a bogus key returns 404 with
      `ZFS_TRM_MSG/014` and the correct text. **First attempt failed with a short dump** —
      `GET_GLOBAL_AUTHORIZATIONS` was missing (see L-238; `docs/rap-unmanaged-web-api-pattern.md` §3
      corrected same turn) — fixed and retested clean. Two throwaway records created during testing
      were deleted via the API itself; nothing left behind on the table. A reusable Postman
      collection ("SLC Outward Tracking (ZFS_SB_SLCOTTK_O4_API)", id
      `20674888-c5d8b535-d5bb-4b03-90d8-a9a7c2506b58`, personal "My Workspace") was created with the
      6-step CSRF/CRUD flow — the `sapPassword` collection variable is deliberately left blank; fill
      it in locally before use, never commit/share it.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcOttk | DDLS/DF | ZFS_SLC_DEMO | DS4K907209 | active |
| ZFS_I_SlcOttk (BDEF) | BDEF/BDO | ZFS_SLC_DEMO | DS4K907260 (task under DS4K907209) | active |
| ZFS_C_SlcOttkTP | DDLS/DF | ZFS_SLC_DEMO | DS4K907209 | active |
| ZFS_C_SlcOttkTP (BDEF) | BDEF/BDO | ZFS_SLC_DEMO | DS4K907209 | active |
| EZFS_SLC_T_OTTK | ENQU/DL | ZFS_SLC_DEMO | DS4K907260 (task under DS4K907209) | active |
| ZBP_FS_SLCOTTKTP | CLAS/OC | ZFS_SLC_DEMO | DS4K907209 | active |
| ZFS_I_SLCOTTK | DCLS/DL | ZFS_SLC_DEMO | DS4K907209 | active |
| ZFS_SD_SLCOTTK | SRVD/SRV | ZFS_SLC_DEMO | DS4K907209 | active |
| ZFS_SB_SLCOTTK_O4_API | SRVB/SVB | ZFS_SLC_DEMO | DS4K907209 | active, not yet published |

`ZFS_OTTK_D` (number range object) — pre-existing, used only, not created; not listed as a build
object.

## Delivery checks

- [x] Pretty Printer — source hand-written with consistent indentation; no separate pass run
- [x] Syntax check clean — all objects activated with no errors (see L-236 for the fixes needed to get there)
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — priority 1 and 2 resolved (P2 SELECT* finding fixed, see L-236); two
      benign P3 warnings remain (`GLOBAL AUTHORIZATION`/`READ` not implemented — expected for
      `authorization master(global)` with no custom read logic, matches `TrmLimPt` precedent)
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts maintained — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — each `create_object`/`activate` call echoed
      `DS4K907209` (or task `DS4K907260` under it)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-236, L-237, L-238 (L-238 also
corrected `docs/rap-unmanaged-web-api-pattern.md` §3, which had claimed `GET_GLOBAL_AUTHORIZATIONS`
was optional — proven wrong by the live smoke test).
