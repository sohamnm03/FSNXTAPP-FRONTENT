# RAP unmanaged Web API over ZFS_CDS_SLC_002 (+ read-only Bank endpoint, zdtbank)

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed

## Scope

Mirror the `SlcOttkDetail` RAP unmanaged BO built earlier this session, but for the DTTK sibling:
full CRUD directly on `ZFS_CDS_SLC_002` ("DTTK Details"), writing through to `zfs_slc_dttk_btp`,
exposed as an OData V4 Web API. Plus a second read-only "Bank" endpoint in the same service, sourced
from `zsgslctr_bpext` — this time filtered on **`zdtbank = 'X'`** (human's explicit instruction),
not `zotbank`, exposing only `Zbp`/`BpName` as before.

`ZdttkNo` is system-generated via number range `ZFS_DTTK_D` (interval `01`, `100001`–`999999`,
package `ZFS_SLC_DEMO`, pre-existing — confirmed via `NRIV` read as the exact structural counterpart
of `ZFS_OTTK_D`; the sibling `ZFS_DTTK_N` uses an unrelated 10-digit range and was not used).

Out of scope: `ZFS_CDS_SLC_002`/`zfs_slc_dttk_btp` themselves beyond what's needed (view not
modified further by this activity — see Open question 1 — table not modified), draft (not requested).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | `ZFS_CDS_SLC_002` originally did not expose `local_created_at`/`local_last_changed_at`/`last_changed_at` — no field available for `etag master`. | Human added the 5 audit fields to the view directly and activated it before the build started. Confirmed present via a fresh `getObjectSource` read. Used `etag master last_changed_at`, matching `ZFS_CDS_SLC_001` exactly. | 2026-09-04 |
| 2 | Which DTTK number range mirrors `ZFS_OTTK_D`? Two candidates existed (`ZFS_DTTK_D`, `ZFS_DTTK_N`). | Checked `NRIV`: `ZFS_DTTK_D` (`01`, `100001`–`999999`) matches `ZFS_OTTK_D`'s exact shape; `ZFS_DTTK_N` is unrelated (10-digit range). Used `ZFS_DTTK_D`. Confirmed live: new record got `ZdttkNo` `100023`. | 2026-09-04 |
| 3 | The table's own key is `client + zdttk_no` only (no `uuid`, unlike `zfs_slc_ottk_btp`'s `client + uuid + zottk_no`), and the view's key (`zdttk_no`) already equals the table's full non-client key. | No technical `uuid` generation needed at all this time — simpler than the OTTK case; CRUD keyed by `ZdttkNo` directly, which is also the table's genuinely unique key (not a design compromise like the OTTK sibling's `ZottkNo`-only key choice). Confirmed live: no `AMB_SINGLE` ATC finding this time (unlike the OTTK build), exactly because the key is now genuinely unique. | 2026-09-04 |

## Naming gate

Entity base name: `SlcDttkDetail`. Bank endpoint entity base name: `SlcDttkBank` (distinct from the
existing `SlcBank`, which filters `zotbank` for the OTTK service).

```
NAMING: ZFS_CDS_SLC_002 (BDEF, unmanaged, new object) -> matches "Behavior definition | same as root view" row; inherits the pre-existing root view's non-conformant name — same mechanical requirement as ZFS_CDS_SLC_001's BDEF
NAMING: ZFS_C_SlcDttkDetailTP -> matches "Consumption / projection view | ZFS_C_<Entity>" row; TP kept as it carries behavior
NAMING: ZFS_C_SlcDttkDetailTP (BDEF, projection) -> matches "Behavior definition | same as root view" row (projection BDEF)
NAMING: ZBP_FS_SLCDTTKDETAILTP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row
NAMING: LHC_SlcDttkDetail -> matches "Behavior handler | LHC_<Entity>" row; TP stripped per L-226
NAMING: LSC_SlcDttkDetail -> matches "Saver | LSC_<Entity>" row; TP stripped per L-226
NAMING: EZFS_DTTK_BTP -> matches Dictionary "Lock object | EZFS_T_<NAME>" row; shortened from EZFS_SLC_DTTK_BTP (17 chars) to fit the 16-char ENQU/DL cap (L-242), mirroring EZFS_OTTK_BTP's identical treatment
NAMING: ZFS_CDS_SLC_002 (DCL, new object) -> matches "Access control (DCL) | same name as the view it protects" row; inherits the pre-existing root view's name
NAMING: ZFS_SD_SLCDTTKDETAIL -> matches "Service definition | ZFS_SD_<Entity>" row (TP stripped)
NAMING: ZFS_SB_SLCDTTKDETAIL_O4_API -> matches "Service binding | ZFS_SB_<Entity>_<O2/O4>_<UI/API>" row (Web API -> _O4_API)
NAMING: ZFS_I_SlcDttkBank -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view takes no TP suffix
NAMING: ZFS_TRM_MSG (message 016, new) -> matches Classic & Misc "Message class" listed-exception row; no new class created
```

## Todo

- [x] 1. `ZFS_CDS_SLC_002` — unmanaged BDEF on the root view (CRUD, `mapping for zfs_slc_dttk_btp`, `etag master last_changed_at` — Open question 1 resolved)
- [x] 2. `ZFS_C_SlcDttkDetailTP` — projection view + projection BDEF (`use create/update/delete`)
- [x] 3. `EZFS_DTTK_BTP` — lock object on `zfs_slc_dttk_btp`
- [x] 4. `ZBP_FS_SLCDTTKDETAILTP` — behavior pool: `LHC_SlcDttkDetail` (create/update/delete/lock/global auth), `LSC_SlcDttkDetail` (no-op saver)
- [x] 5. `ZFS_CDS_SLC_002` (DCL) — access control (global, `authorization master(global)`)
- [x] 6. New message 016 in `ZFS_TRM_MSG` ("DTTK tracking record &1 does not exist"); catalog updated same turn
- [x] 7. `ZFS_I_SlcDttkBank` — read-only view over `zsgslctr_bpext` filtered `where zdtbank = 'X'`, exposing only `Zbp`/`BpName`, no BDEF
- [x] 8. `ZFS_SD_SLCDTTKDETAIL` — service definition exposing `ZFS_C_SlcDttkDetailTP` (CRUD) and `ZFS_I_SlcDttkBank as Bank` (read-only) together
- [x] 9. `ZFS_SB_SLCDTTKDETAIL_O4_API` — OData V4 Web API service binding
- [x] 10. Activate everything in dependency order (one miss caught and fixed — forgot to activate the
      projection BDEF itself after writing its source, caught by `inactiveObjects`); ATC check clean
      (2 benign priority-3 findings, same shape as the OTTK build; no `AMB_SINGLE` this time — see
      Open question 3)
- [x] 11. Published — automated script hit the same known row-match bug (L-237); manual
      `/IWFND/V4_ADMIN` `sap-gui` flow worked (System Alias → `LOCAL` per L-246, then filter → select
      → `PUBLISH` → confirm). `fetch_services` confirms `isPublished: true`.
- [x] 12. Functional smoke test (PowerShell) — `Bank` read confirmed filtered on `zdtbank` (distinct
      result set from the OTTK-side `Bank` entity) and write-blocked (`POST` → 405). Full CRUD on
      `SlcDttkDetail`: `POST` 201 (`ZdttkNo` generated `100023` from `ZFS_DTTK_D`, `ZstrText`
      computed field verified correct), `GET` 200, `PATCH` 200 (verified on re-read), `DELETE` 204,
      re-`GET` 404. Not-found path verified: `PATCH` on a bogus key → 404 with
      `ZFS_TRM_MSG/016` and the correct interpolated text. No test data left behind (record deleted
      via the API itself).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_CDS_SLC_002 (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcDttkDetailTP | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcDttkDetailTP (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| EZFS_DTTK_BTP | ENQU/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZBP_FS_SLCDTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_CDS_SLC_002 (DCL) | DCLS/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_I_SlcDttkBank | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_SD_SLCDTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_SB_SLCDTTKDETAIL_O4_API | SRVB/SVB | ZFS_SLC_BTP | DS4K907263 | active, published |

## Delivery checks

- [x] Pretty Printer — source hand-written with consistent indentation; no separate pass run
- [x] Syntax check clean — all objects activated with no errors
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — no priority 1/2 findings. Two benign priority-3 findings, same as the
      OTTK build and accepted for the same reasons (untranslated inline validation literal required
      by the message-class-only policy; the expected "READ not implemented" warning)
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — every create/activate/`setObjectSource` call echoed
      `DS4K907263`

## Lessons raised

None new — this build reused L-226/L-227/L-236/L-237/L-238/L-242/L-243/L-246 without incident (field
order derived correctly from this table's own definition this time, avoiding a repeat of L-243).
