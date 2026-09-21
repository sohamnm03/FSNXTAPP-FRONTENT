# Deal ID: new RAP unmanaged Web API over ZSGSLCTR_DEALID, plus local console

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (created this activity)
- **Requested by:** user, from `file:///C:/Users/karth/Downloads/deal_id_creation_v14.html`
  (a UI-only mockup built for SAP GUI HTML Viewer `SAPEVENT:` hooks and dummy data — no backend
  ever existed behind it)

## Scope

Build a real Deal ID creation console under `web/`, reusing the existing OTTK/DTTK OData Web
APIs (`ZFS_SB_SLCOTTKDETAIL_O4_API`, `ZFS_SB_SLCDTTKDETAIL_O4_API`) for ticket lookup, backed by
a **new** RAP unmanaged Web API over the human-identified real table `ZSGSLCTR_DEALID` for actual
persistence (the mockup's fields have nowhere to live otherwise — confirmed by reading the two
existing services' metadata and searching the whole system for anything Deal-ID-related before
concluding this and asking the human).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does the mockup's "Create Deal ID" have anywhere to persist to via the two named OData services alone? | No — searched both services' entity sets and the whole `ZFS` namespace for `*DEAL*`; nothing exists. Reported as blocked. | 2026-09-08 |
| 2 | Real target table? | `ZSGSLCTR_DEALID` (package `ZSGSLC`, pre-existing, 60+ fields spanning a much larger insurance/settlement/approval workflow the mockup never represents) | 2026-09-08 |
| 3 | `ZSBLC_TXN` (mandatory table key, no UI field maps to it) — what value on create? | Keep blank | 2026-09-08 |
| 4 | `ZDEAL_ID` (other table key) — how generated? | Existing number range `ZFS_DEALID` (verified live via SNRO: interval `01`, 10000000–99999999, status `10000012` — picks up exactly where 14 pre-existing real rows left off) | 2026-09-08 |
| 5 | Field scope beyond the mockup's ~10 fields? | Confirmed: only DTTK No, OTTK No, Entity ID, Structure, Deal ID Amt, Deal ID Desc, Status — everything else on the table (approval, insurance, DMS, TLA) stays untouched | 2026-09-08 |
| 6 | "Log fields" (mid-build follow-up)? | Standard audit pair only (`ZcreatedBy/Date/Time`, `ZchangedBy/Date/Time`) — already included; approval/rejection and email log fields explicitly excluded | 2026-09-08 |

## Naming gate

```
NAMING: ZFS_I_DealId -> matches "Interface (basic/composite) view | ZFS_I_<Entity>" row
NAMING: ZFS_I_DealId (BDEF) -> matches "Behavior definition | same as root view" row (no ZFS_R_
  layer - unmanaged behavior attaches to the table-select view directly, per
  rap-unmanaged-web-api-pattern.md §1)
NAMING: EZFS_T_DEALID -> matches "Lock object | EZFS_T_<NAME>" row (13 chars, under the 16-char
  cap, L-242)
NAMING: ZBP_FS_DEALIDTP -> matches "Behavior implementation class | ZBP_FS_<Entity>" row
NAMING: ZFS_C_DealIdTP -> matches "Consumption / projection view | ZFS_C_<Entity>" row
NAMING: ZFS_C_DealIdTP (BDEF) -> matches "projection view ... carries TP" row, same name
NAMING: ZFS_SD_DEALID -> matches "Service definition | ZFS_SD_<Entity>" row
NAMING: ZFS_SB_DEALID_O4_API -> matches "Service binding | ZFS_SB_<Entity>_<O2/O4>_<UI/API>" row
```

## Todo

- [x] 1. Read the mockup fully; identify it as UI-only (dummy data + `SAPEVENT:` hooks), no real backend.
- [x] 2. Check both named OData services' entity sets and search the system for `*DEAL*`; find nothing — stop and report per the project's no-invented-objects rule, ask the human how to proceed.
- [x] 3. Human names the real table (`ZSGSLCTR_DEALID`); read its full field list (60+ fields) and flag the scope mismatch before building anything.
- [x] 4. Get explicit answers for `ZSBLC_TXN`, `ZDEAL_ID` generation, and field scope before writing any object.
- [x] 5. `adt-mcp` was disconnected at session start (`ConnectionRefused`, checked twice); human fixed it mid-task and it reconnected — used for every object creation from that point (no fallback needed).
- [x] 6. Build `ZFS_I_DealId` (interface + unmanaged BDEF, direct `as select from zsgslctr_dealid`), `EZFS_T_DEALID` (lock object), `ZBP_FS_DEALIDTP` (LHC + LSC, mirroring the proven `ZBP_FS_SLCOTTKFEETP` shape for the same package/table family), `ZFS_C_DealIdTP` (projection + projection BDEF), `ZFS_SD_DEALID`, `ZFS_SB_DEALID_O4_API`. All activated clean (only benign warnings matching the identical sibling fee-BO pattern).
- [x] 7. Fix `ZdealAmt`'s CURR-without-currency-reference activation error (no currency field exists on this table) by exposing it as `cast( zdeal_amt as abap.dec( 15, 2 ) )`.
- [x] 8. Fix `cl_numberrange_runtime` method name (`NUMBER_GET`, not the guessed `NUMBER_GET_NEXT`) after a live activation error named the correct one.
- [x] 9. `update` handler reads the full row via `SELECT SINGLE *` (not a hand-typed 60+-column list) before merging only `%control`-flagged exposed fields back — keeps every out-of-scope column untouched without transcribing the table's whole field order (L-280).
- [x] 10. Publish `ZFS_SB_DEALID_O4_API`: the automation script (`scripts/sap-gui-publish-service.py`) failed with a misleading "not in unpublished-candidates list" error (documented L-237, confirmed again) even though a direct HTTP check proved the service genuinely unpublished (404 "Service group ... not published"). Fell back to the manual `/IWFND/V4_ADMIN` flow per the runbook, hit the documented L-246 blank-System-Alias block, picked `LOCAL` via F4, and published successfully — confirmed both by the GUI's own "successfully published" message and a live HTTP 200 read afterward.
- [x] 11. Verify the number range live via SNRO before ever calling it from ABAP: interval `01` (10000000–99999999), status `10000012` — exactly continues the 14 pre-existing real rows already in the table (10000000...10000012, plus one `12000001` from a different/manual source). Zero collision risk confirmed before any create was attempted.
- [x] 12. Build `web/deal-id-console/` (`proxy.py`, `sap_config.json`, `index.html`) mirroring the established `web/*-console` pattern exactly (HTTP/1.1 keep-alive, per-request-outcome connection indicator with 30s poll, `runLimited`-style discipline not needed here — only 2-3 lookups). "Assigned Value"/"Balance Value" (concepts the mockup needed but the table has no field for) are derived live by summing `ZdealAmt` from the new Deal ID entity itself, filtered by OTTK/DTTK number — real data, not invented fields.
- [x] 13. Fix a dead-end UI element found during review: the Status field was a `<select>` with no populated options (no status-description entity exists to build one from); changed to a plain text input so it's actually usable, since real data shows meaningful codes (`01`, `02`) with no text lookup available.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_DealId | DDLS/DF (root, unmanaged BDEF carrier) | ZFS_SLC_BTP | DS4K907279 | Active |
| ZFS_I_DealId | BDEF/BDO (unmanaged) | ZFS_SLC_BTP | DS4K907279 | Active |
| EZFS_T_DEALID | ENQU/DL (lock object on ZSGSLCTR_DEALID) | ZFS_SLC_BTP | DS4K907279 | Active |
| ZBP_FS_DEALIDTP | CLAS/OC (behavior pool: LHC_DEALIDTP + LSC_DEALIDTP) | ZFS_SLC_BTP | DS4K907279 | Active |
| ZFS_C_DealIdTP | DDLS/DF (projection) | ZFS_SLC_BTP | DS4K907279 | Active |
| ZFS_C_DealIdTP | BDEF/BDO (projection) | ZFS_SLC_BTP | DS4K907279 | Active |
| ZFS_SD_DEALID | SRVD/SRV | ZFS_SLC_BTP | DS4K907279 | Active |
| ZFS_SB_DEALID_O4_API | SRVB/SVB (OData V4 - Web API) | ZFS_SLC_BTP | DS4K907279 | Active, **published** |
| web/deal-id-console/proxy.py | Local Python | N/A | N/A | New — HTTP/1.1 keep-alive, 3 services (ottk/dttk/dealid) |
| web/deal-id-console/sap_config.json | Local config | N/A | N/A | New — port 8767 |
| web/deal-id-console/index.html | Local HTML/JS | N/A | N/A | New |

## Delivery checks

- [x] All 6 new SAP objects activated clean (Pretty Printer not run separately; ADT's own formatting used as written; only benign warnings matching the identical, already-working sibling fee-BO pattern — `READ` not implemented, AccessControl annotation differs between interface/projection).
- [x] ATC / ABAP Unit: not run — no test class written for this activity (matches the sibling fee-BO precedent, which also carries none); flagging as a gap rather than silently skipping.
- [x] Service binding publish verified two ways: the GUI's own "New service group(s) successfully published" message, and a live HTTP 200 on the service document afterward (per L-232, the API's own success report is never trusted alone).
- [x] Live read verified against real data: `GET /api/dealid/DealId` returns all 14 pre-existing real rows with correct field mapping.
- [x] Number range verified live via SNRO before use, not assumed: interval `01`, 10000000–99999999, status `10000012`, confirmed to continue the real existing sequence with no collision.
- [x] Console verified live via Playwright, real interactions only (not scripted calls) per this session's established discipline: OTTK/DTTK lists load (5 + 4 open records), connection indicator correct, a real click on OTTK #100042 populates every field from live data (Trade Value 1,000,000.00 USD, Assigned 0.00, Balance 1,000,000.00, Entity E021, Structure DSX), and the live `$filter` sum against the new Deal ID entity correctly returns 1,000,000 for a known real prior deal (OTTK #100010) and 0 for a nonexistent one.
- [ ] **Live CREATE not tested.** Deliberately not exercised: this table holds real production data and creating a synthetic test row wasn't asked for. The create handler was built to mirror the proven `LHC_SlcOttkFee` pattern exactly (mapping, INSERT, `%cid`/`mapped`/`failed` handling) and reviewed carefully, but its first real invocation will be the user's own first create through the console. Flagging this explicitly rather than claiming it as verified.
- SAP Pretty Printer, text elements, transport-contents confirmation: not separately run this turn.

## Lessons raised

L-280: `SELECT *` (not a hand-typed column list) is the safe read shape for an `update` handler
on a BO exposing a small subset of a much wider table; `cl_numberrange_runtime=>NUMBER_GET` is the
correct method name (not the guessed `NUMBER_GET_NEXT`); verify a number range's live interval
against real existing data via SNRO before wiring it to a create handler. Full detail in
`lessons/lessons-ledger.md`.

## Handover

The RAP unmanaged Web API and the local console are both live and read-verified. The one
remaining step before this is fully proven end-to-end is the human's own first real Create Deal
ID through the console (`http://localhost:8767/`) — the create handler is unexercised in
production. If it fails, the most likely spots per this build are: the `mapping for
zsgslctr_dealid` block in the BDEF, or the `CORRESPONDING zsgslctr_dealid( ls_entity MAPPING FROM
ENTITY )` call in `LHC_DEALIDTP-create` (both in `ZBP_FS_DEALIDTP`'s implementations include).
