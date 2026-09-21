# RAP unmanaged Web API over ZFS_CDS_SLC_001 (+ read-only Bank endpoint)

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ **Closed** — all todos and delivery checks complete, service published and
  live-tested (PowerShell, per this workspace's standing test-tool preference), no open items

## Scope

Built a full hand-coded RAP **unmanaged** BO with all CRUD (Create, Read, Update, Delete) directly
on the pre-existing CDS view entity `ZFS_CDS_SLC_001` ("OTTK Details" — fixed to activate earlier
this session), writing through to its underlying table `zfs_slc_ottk_btp`. Exposed as an OData V4
Web API service binding. Follows `docs/rap-unmanaged-web-api-pattern.md` (the `ZFS_T_TRM_LIMPT` →
`TrmLimPtTP` precedent) since no generator supports `implementationType: Unmanaged`.

Additionally exposed one more **read-only** endpoint, "Bank", in the **same service**, sourced from
table `zsgslctr_bpext` ("SLC Business Partners (Banks)"), returning only `Zbp`/`BpName` for rows
where `zotbank = 'X'` (human explicitly narrowed the field list mid-build). No create/update/delete
on this endpoint — a plain CDS view exposed via the service definition, no behavior definition
needed for a pure-read entity.

`ZottkNo` on the main entity is system-generated via the existing number range object `ZFS_OTTK_D`
(interval `01`) — same number range the sibling `ZFS_I_SlcOttk`/`ZFS_SLC_T_OTTK` BO uses (human
instruction mid-build; confirmed sharing it live: new records got `100028` following that BO's prior
`100026`/`100027`).

Out of scope: the underlying tables themselves (not modified beyond the `root` keyword already added
to `ZFS_CDS_SLC_001` in the prior activity), draft (not requested, unmanaged has no draft here).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | The root view's key is `ZottkNo` alone (the view's own pre-existing key choice — not `uuid`, which the view never exposes). The table's real primary key is `client + uuid + zottk_no`. CRUD is implemented keyed by `ZottkNo` only (`SELECT SINGLE`/`UPDATE`/`DELETE ... WHERE zottk_no = @key`), generating `uuid` internally on create and never exposing it. | Proceeded as the view's own pre-existing design dictates — not a choice made here | 2026-09-04 |
| 2 | How should `ZottkNo` be generated on create? | Human instructed mid-build: reuse the existing number range object `ZFS_OTTK_D` (same one the sibling `SlcOttk` BO uses), via `CL_NUMBERRANGE_RUNTIME=>NUMBER_GET`. `ZottkNo` is fully system-generated/readonly; the originally-planned duplicate-check message (015) became unreachable as a result — left on the system, unused, documented in the message catalog | 2026-09-04 |
| 3 | `ZFS_CDS_SLC_001`'s own name predates this activity and does not match `ZFS_I_<Entity>`. RAP mechanically requires the BDEF and the DCL to share the *exact* name of the root view they attach to. | Proceeded — flagged, not asked, since the human named this exact view as the build target | 2026-09-04 |
| 4 | Human asked for "basic authorization and validations" | Implemented: `authorization master (global)` deferring to the DCL via `GET_GLOBAL_AUTHORIZATIONS` (L-238 pattern), mandatory-field check on `Zbukrs` at create (`NEW_MESSAGE_WITH_TEXT`, no message-class number needed per doc §8), not-found handling on update/delete (message 014, reused), lock via `EZFS_OTTK_BTP` | 2026-09-04 |

## Naming gate

```
NAMING: ZFS_CDS_SLC_001 (root keyword added) -> pre-existing object, out of gate; no new name chosen
NAMING: ZFS_CDS_SLC_001 (BDEF, unmanaged, new object) -> matches "Behavior definition | same as root view" row; inherits the pre-existing root view's non-conformant name — mechanical platform requirement, not a discretionary choice (Open question 3)
NAMING: ZFS_C_SlcOttkDetailTP -> matches "Consumption / projection view | ZFS_C_<Entity>" row; TP kept as it carries behavior
NAMING: ZFS_C_SlcOttkDetailTP (BDEF, projection) -> matches "Behavior definition | same as root view" row (projection BDEF)
NAMING: ZBP_FS_SLCOTTKDETAILTP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row
NAMING: LHC_SlcOttkDetail -> matches "Behavior handler | LHC_<Entity>" row; TP stripped per L-226
NAMING: LSC_SlcOttkDetail -> matches "Saver | LSC_<Entity>" row; TP stripped per L-226
NAMING: EZFS_OTTK_BTP -> matches Dictionary "Lock object | EZFS_T_<NAME>" row; shortened from the originally-planned EZFS_SLC_OTTK_BTP (17 chars) to fit the platform's 16-char ENQU/DL limit (L-242) — table name itself is pre-existing/out of gate
NAMING: ZFS_CDS_SLC_001 (DCL, new object) -> matches "Access control (DCL) | same name as the view it protects" row; inherits the pre-existing root view's name (Open question 3)
NAMING: ZFS_SD_SLCOTTKDETAIL -> matches "Service definition | ZFS_SD_<Entity>" row (TP stripped)
NAMING: ZFS_SB_SLCOTTKDETAIL_O4_API -> matches "Service binding | ZFS_SB_<Entity>_<O2/O4>_<UI/API>" row (Web API -> _O4_API)
NAMING: ZFS_I_SlcBank -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view takes no TP suffix
NAMING: ZFS_TRM_MSG (message 015, new) -> matches Classic & Misc "Message class" listed-exception row; no new class created (ended up unused — see Open question 2)
```

## Todo

- [x] 1. Add `root` keyword to `ZFS_CDS_SLC_001` (done in the prior activity this session; confirmed still clean here)
- [x] 2. `ZFS_CDS_SLC_001` — unmanaged BDEF on the root view (CRUD, `mapping for zfs_slc_ottk_btp`)
- [x] 3. `ZFS_C_SlcOttkDetailTP` — projection view + projection BDEF (`use create/update/delete`)
- [x] 4. `EZFS_OTTK_BTP` — lock object on `zfs_slc_ottk_btp`
- [x] 5. `ZBP_FS_SLCOTTKDETAILTP` — behavior pool: `LHC_SlcOttkDetail` (create/update/delete/lock/global auth), `LSC_SlcOttkDetail` (no-op saver)
- [x] 6. `ZFS_CDS_SLC_001` (DCL) — access control (global, `authorization master(global)`)
- [x] 7. New message 015 in `ZFS_TRM_MSG`; catalog updated same turn (ended up unused, see Open question 2); message 014 reused for not-found
- [x] 8. `ZFS_I_SlcBank` — read-only view over `zsgslctr_bpext` filtered `where zotbank = 'X'`, exposing only `Zbp`/`BpName`, no BDEF
- [x] 9. `ZFS_SD_SLCOTTKDETAIL` — service definition exposing `ZFS_C_SlcOttkDetailTP` (CRUD) and `ZFS_I_SlcBank as Bank` (read-only) together
- [x] 10. `ZFS_SB_SLCOTTKDETAIL_O4_API` — OData V4 Web API service binding
- [x] 11. Activated everything in dependency order (see L-243 for one bug found/fixed along the way); ATC check clean (3 benign priority-3 findings, see Delivery checks)
- [x] 12. Published via manual `/IWFND/V4_ADMIN` `sap-gui` flow — the frozen script's row-match bug (L-237) reproduced again, plus a new System Alias precondition found (L-246); `fetch_services` confirms `isPublished: true`
- [x] 13. Functional smoke test — full CRUD on `SlcOttkDetail` (`POST` 201 with `ZottkNo` generated `100028` from the shared `ZFS_OTTK_D` range, `GET` 200, `PATCH` 200 verified on re-read, `DELETE` 204, re-`GET` 404), not-found path verified on `PATCH` of a bogus key (404, `ZFS_TRM_MSG/014` with correct interpolated text), `Bank` read confirmed filtered/shaped correctly and write-blocked (`POST` → 405). No test data left behind (the one created record was deleted via the API itself).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CDS_SLC_001 | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | pre-existing, changed (root keyword) |
| ZFS_CDS_SLC_001 (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcOttkDetailTP | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcOttkDetailTP (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| EZFS_OTTK_BTP | ENQU/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZBP_FS_SLCOTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_CDS_SLC_001 (DCL) | DCLS/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_I_SlcBank | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_SD_SLCOTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_SB_SLCOTTKDETAIL_O4_API | SRVB/SVB | ZFS_SLC_BTP | DS4K907263 | active, published |

## Delivery checks

- [x] Pretty Printer — source hand-written with consistent indentation; no separate pass run
- [x] Syntax check clean — all objects activated with no errors
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — no priority 1/2 findings. Three benign priority-3 findings, all
      accepted/explained: (1) `AMB_SINGLE` "SELECT SINGLE is possibly not unique" on the `update`
      method's `WHERE zottk_no = ...` — inherent to the view's own `ZottkNo`-only key design (Open
      question 1), not fixed; (2) SLIN 1700 "Strings without text elements are not translated" on
      the inline `NEW_MESSAGE_WITH_TEXT` validation literal — required by this project's message
      policy (text symbols banned for messages, L-211; doc §8 recommends this exact pattern);
      (3) SLIN W333 "READ ZFS_CDS_SLC_001 not implemented" — expected/benign, matches the
      `GLOBAL AUTHORIZATION` precedent in `docs/rap-unmanaged-web-api-pattern.md` §3
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — every `create_object`/`activate`/`setObjectSource`
      call echoed `DS4K907263`

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-241, L-242, L-243, L-244,
L-245, L-246.
