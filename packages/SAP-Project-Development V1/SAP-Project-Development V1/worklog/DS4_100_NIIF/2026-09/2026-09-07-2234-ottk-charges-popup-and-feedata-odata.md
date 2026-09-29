# OTTK "Other Charges" popup — ZSGSLCTR_FEEDATA CRUD entity + FeeType lookup + web console popup

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Two things, both in scope:

1. **Backend (SAP):** expose the pre-existing `ZSGSLCTR_FEEDATA` table (fee/charge line items per
   OTTK/DTTK) as a full CRUD OData V4 entity, and the pre-existing `ZSGSLCTR_FEE` table (fee-type
   master) as a read-only lookup filtered to `ZOTTK = 'X'`, both added to the existing
   `ZFS_SB_SLCOTTKDETAIL_O4_API` service (no new service definition/binding).
2. **Frontend (`web/ottk-dttk-console/index.html`):** in the Create/Edit OTTK popup, "Other Charges"
   becomes a read-only field driven by a Grand Total computed in a new "Charges" sub-popup (modelled
   on a SAP GUI screenshot the human supplied), replacing the old free-typed amount+currency pair.

Revised same day, second round (human screenshots: "Charges amount calc.png"): the Charges grid is
**not** a free add/remove-row grid — it always shows exactly one fixed row per active fee type from
the `FeeType` lookup (today F11–F14), no add-row control. `Fee Category` (`01 %` / `02 Flat Amount`)
and `Code for Collection` (`01 Standard` / `02 Greater of Two` / `03 Least of Two`) are closed
dropdowns, not free text (superseding Open question 2 below, which only ruled on `ZCAT`/`ZCODE`
having no *lookup table* — the human then supplied the fixed value set directly). `Base Amount` is
now non-editable, live-derived from the OTTK's own Trade Value on every row; `Final Amount` is
non-editable, computed client-side from a formula reverse-engineered off the calc screenshot's 4
sample rows (`docs` has no written spec for this — verified by reproducing all 4 sample values
exactly, see Delivery checks).

Out of scope: DTTK's own charges (the same table already carries `ZTYPE='02'`/`ZDTTK_NO` rows from an
existing, unrelated process — not touched here); a true RAP composition child (this follows the
existing codebase's flat-sibling-entity pattern instead, consistent with `Bank`/`EntityString`/
`CoCode`/`RefInt`).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | `ZSGSLCTR_FEEDATA`'s key includes `ZTYPE` (OTTK/DTTK discriminator). Every existing row is DTTK data (`ZTYPE='02'`). What value for new OTTK rows? | `ZTYPE='01'`, populate `ZOTTK_NO`, leave `ZDTTK_NO` blank. DTTK's own future OData use keeps `ZTYPE='02'` + `ZDTTK_NO`. | 2026-09-07 |
| 2 | `ZCAT`/`ZCODE` (Fee Category / Code for Collection) render as dropdowns in the SAP GUI screenshot but have no discoverable check table/domain. | Plain text inputs (2-char free text) — no invented lookup. | 2026-09-07 |
| 3 | Which transport carries the new objects? | `DS4K907263`, reused (same package/BO family as the existing `SlcOttkDetail` build). | 2026-09-07 |

## Naming gate

```
NAMING: ZFS_I_SlcFeeType -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view takes no TP suffix
NAMING: ZFS_I_SlcOttkFee -> matches docs/rap-unmanaged-web-api-pattern.md §1 working shape for Unmanaged (ZFS_R_<Entity>TP does not activate for a plain-unmanaged root; ZFS_I_<Entity> carries root+BDEF instead, per the ZFS_I_TrmLimPt precedent)
NAMING: ZFS_I_SlcOttkFee (BDEF, unmanaged root) -> matches "Behavior definition | same as root view" row
NAMING: EZFS_T_OTTK_FEE -> matches Dictionary "Lock object | EZFS_T_<NAME>" row (15 chars, within 16-char cap — no deviation needed)
NAMING: ZBP_FS_SLCOTTKFEETP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row (Entity = SlcOttkFeeTP)
NAMING: LHC_SlcOttkFeeTP / LSC_SlcOttkFeeTP -> matches "Behavior handler | LHC_<Entity>" / "Saver | LSC_<Entity>" rows
NAMING: ZFS_I_SlcOttkFee (DCL, new object) -> matches "Access control (DCL) | same name as the view it protects" row
NAMING: ZFS_C_SlcOttkFeeTP -> matches "Consumption / projection view | ZFS_C_<Entity>" row
NAMING: ZFS_C_SlcOttkFeeTP (BDEF, projection) -> matches "Behavior definition | same as root view" row (projection BDEF)
NAMING: ZFS_SD_SLCOTTKDETAIL (change, not creation) -> pre-existing service definition, extended with two more `expose` lines; no new name chosen
```

## Todo

- [x] 1. `ZFS_I_SlcFeeType` — read-only view over `zsgslctr_fee`, filtered `where zottk = 'X'`,
      exposing `ZfeeType`/`ZfeeDesc`
- [x] 2. `ZFS_I_SlcOttkFee` — unmanaged root view over `zsgslctr_feedata` (`where ztype = '01'`),
      joined to `zfs_slc_ottk_btp` for a read-only `ZottkCurr` (currency-code companion for the
      three amount fields)
- [x] 3. `EZFS_T_OTTK_FEE` — lock object on `ZSGSLCTR_FEEDATA`
- [x] 4. `ZFS_I_SlcOttkFee` (BDEF, unmanaged) — CRUD, `mapping for zsgslctr_feedata`
- [x] 5. `ZBP_FS_SLCOTTKFEETP` — behavior pool: `LHC_SlcOttkFeeTP` (create/update/delete/lock/global
      auth; `update` merges only `%control`-flagged fields — L-251's documented defect fixed here
      from the start, not repeated), `LSC_SlcOttkFeeTP` (no-op saver)
- [x] 6. `ZFS_I_SlcOttkFee` (DCL) — access control (global)
- [x] 7. `ZFS_C_SlcOttkFeeTP` — projection view + projection BDEF (`use create/update/delete`)
- [x] 8. `ZFS_SD_SLCOTTKDETAIL` — changed (not created): added `expose ZFS_I_SlcFeeType as FeeType;`
      and `expose ZFS_C_SlcOttkFeeTP as SlcOttkFee;`
- [x] 9. Activated everything, nothing left inactive (`inactiveObjects` → `[]`)
- [x] 10. ATC clean — same 3 benign priority-3 findings as the sibling `SlcOttkDetail` build (see
      Delivery checks), no priority 1/2
- [x] 11. Publish check — binding already published from the prior `SlcOttkDetail` activity;
      `scripts/sap-gui-publish-service.py --group-id ZFS_SB_SLCOTTKDETAIL_O4_API` (no `--yes`)
      confirmed "not in the unpublished list" and V4 `$metadata`/entity-set GETs already reflect the
      new `FeeType`/`SlcOttkFee` entity sets live, with no separate republish step needed (OData V4
      metadata is generated at runtime from the service definition)
- [x] 12. Functional smoke test — full CRUD on `SlcOttkFee` against a real OTTK (`100032`): `POST`
      201 with `ZottkCurr` correctly join-derived (`USD`), partial `PATCH` (`Zamt`/`ZfAmt` only)
      verified to leave every other field untouched on re-`GET`, `DELETE` 204, re-`GET` 404. `FeeType`
      read confirmed to return exactly F11–F14 (`Commitment Fee - Origination`, `Swift Fee -
      Origination`, `Negotiation Fee - Origination`, `LC Issuance Charges`), matching the human's
      screenshot. No test data left behind.
- [x] 13. Frontend: Charges popup in `web/ottk-dttk-console/index.html` — "Other Charges" is now
      read-only, its static "USD" suffix replaced with a small button opening the new Charges
      sub-popup. **Revised, second round:** the grid always renders exactly one fixed row per
      `FeeType` lookup entry (no add/remove-row control); `Fee Category`/`Code for Collection` are
      closed dropdowns (`01 %`/`02 Flat Amount` and `01 Standard`/`02 Greater of Two`/`03 Least of
      Two`); `Base Amount` (live-derived from the OTTK's own Trade Value) and `Final Amount` are
      non-editable, `Final Amount` computed client-side as Base×Rate%×Period/360, except `02 Flat
      Amount` (→ the manual `Amount` field verbatim) and `Code` `02`/`03` (→ max/min of the percentage
      figure and `Amount`) — reverse-engineered from the human's calc screenshot and verified to
      reproduce all 4 of its sample rows exactly (1,388.89 / 10,000.00 / 1,666.67 / 0.00). A fee-type
      row the human never touches (every editable field left blank) is not persisted. Apply writes
      the Grand Total into Other Charges and closes without touching the API; the actual row sync
      (`syncOttkFeeRows`: read existing rows for the OTTK, delete them, re-POST the current touched
      rows) runs once after the main OTTK create/update succeeds and a real `ZottkNo` is known — so a
      brand-new OTTK's charges are staged client-side until the OTTK itself has a number. Verified:
      JS extracted and `node --check`ed clean, no duplicate element ids, balanced `div`/`section`/
      `table` tags, the exact `$filter=ZottkNo eq '...'` query confirmed live against the running
      proxy (create → filtered GET found it → delete, no residue), and the calc formula unit-tested
      in isolation against all 4 screenshot rows. Could not click-test in an actual browser (no
      browser-automation tool in this session) — ask the human to exercise Create/Edit → Charges →
      Apply → Save once live.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcFeeType | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_I_SlcOttkFee | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_I_SlcOttkFee (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| EZFS_T_OTTK_FEE | ENQU/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZBP_FS_SLCOTTKFEETP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_I_SlcOttkFee (DCL) | DCLS/DL | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcOttkFeeTP | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_C_SlcOttkFeeTP (BDEF) | BDEF/BDO | ZFS_SLC_BTP | DS4K907263 | active |
| ZFS_SD_SLCOTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | pre-existing, changed (2 new `expose` lines) |

## Delivery checks

- [x] Pretty Printer — source hand-written with consistent indentation; no separate pass run
- [x] Syntax check clean — all objects activated with no errors
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — no priority 1/2 findings. Three benign priority-3 findings, all
      matching the accepted precedent from the `SlcOttkDetail` build: (1) `AMB_SINGLE` on the
      `update` method's `SELECT SINGLE` (inherent to the exposed-key-subset design); (2) SLIN 1700
      untranslated free-text validation literal (required by this project's message policy);
      (3) SLIN W333 `READ ZFS_I_SLCOTTKFEE not implemented` (expected — `GLOBAL AUTHORIZATION`
      precedent, `docs/rap-unmanaged-web-api-pattern.md` §3)
- [x] ABAP Unit — none applicable; no test class requested, none created (L-216)
- [x] Text symbols and selection texts — n/a (no program, no text pool)
- [x] Object list confirmed in the transport — every `create_object`/`setObjectSource` call echoed
      `DS4K907263`

## Bug report round (same day, after first frontend delivery)

Human reported: (1) the success popup showed no OTTK number after create; (2) nothing landed in
`ZSGSLCTR_FEEDATA` despite filling in the Charges popup.

Diagnosed **server-side-clean**: a live `POST SlcOttkDetail` through the same proxy returned `201`
with `"ZottkNo":"100043"`, and a live `POST SlcOttkFee` with the exact payload shape the frontend
builds returned `201` — replayed for both the `01 %` and `02 Flat Amount` row shapes. The human's own
OTTK `100042` carried `ZothFee = 11388.89` (so Apply/Grand-Total had worked) with zero `SlcOttkFee`
rows, i.e. the charge POSTs never fired. Root cause: `proxy.py` served `index.html` with no cache
headers, so the browser tab kept running an older build (L-264); the frontend's silent `if(newNo)`
guard then turned one missing value into two invisible failures (L-265).

Fixed:

- `proxy.py` `_serve_static` now sends `Cache-Control: no-store, must-revalidate`; proxy restarted
  and the header verified on the wire. **A tab cached before this existed still needs one hard reload
  (Ctrl+F5).**
- New `createOttk()` resolves the generated key from the response body → `OData-EntityId`/`Location`
  header → `$orderby=ZottkNo desc&$top=1` re-read, and sends `Prefer: return=representation`.
  Verified live: the body carries `ZottkNo`, this service sends **no** `Location`/`OData-EntityId`
  header on create, and the `$orderby` fallback URL (exactly as the code builds it) returns the
  highest number.
- `apiFetch` split into `apiRequest` (returns `{data,res}`) + `apiFetch` wrapper, so response headers
  are reachable without changing every existing call site.
- `syncOttkFeeRows` now returns `{saved, failed[]}`; the success modal reports "N charge lines saved"
  and lists any failures in the dialog body instead of a 2.4 s toast that the modal covered. An
  unresolvable OTTK number is now reported in that same dialog rather than silently skipping charges.
- All diagnostic data removed: test OTTKs `100043`/`100044` deleted, all test fee rows deleted; final
  state is the human's own `100032`/`100033`/`100040`/`100042` and an empty `SlcOttkFee`.

## Copy OTTK now carries charges (human request, same day)

Originally scoped out ("charges not copied" — charge lines are not header fields, so `Copy OTTK`
left them empty). Human asked for them to come across. `Copy OTTK` now kicks off
`loadChargesForCopy(sourceKey)` right after `openOttkModal('create',data)` (which clears charge state
synchronously, so the order matters), staging the source ticket's lines against the new, not-yet-
numbered ticket and re-deriving the Other Charges total from them rather than inheriting the source's
stored `ZothFee`. Both `ensureChargesLoaded` and `syncOttkFeeRows` await that in-flight fetch, so
opening the popup immediately — or saving without opening it at all — still gets the copied lines.
Also added a one-shot `FeeType` re-fetch in `ensureChargesLoaded`: a lookup failure at page load was
swallowed into an empty options array, which would otherwise leave the grid permanently empty.

Verified by running the page's own `buildChargeRowsTemplate`/`recalcAllRows`/`recalcRow` against a
realistic `SlcOttkFee` response: F11/F12 came across populated (1,388.89 and 10,000.00), untouched
F13/F14 stayed blank, Base Amount re-derived from the new modal's Trade Value, grand total 11,388.89.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-261, L-262, L-263, L-264, L-265.
