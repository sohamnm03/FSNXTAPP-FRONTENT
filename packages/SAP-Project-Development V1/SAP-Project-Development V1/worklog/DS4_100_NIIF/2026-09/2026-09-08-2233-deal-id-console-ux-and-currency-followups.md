# Deal ID console: entity/structure descriptions, DTTK-console-parity filters/columns, display popups, currency, balance validation

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907279 (existing, from the same-day Deal ID BO build; item 4's edits landed on it once `mcp-abap-abap-adt-api` recovered mid-activity)
- **Requested by:** user, 8-point follow-up list on `web/deal-id-console/`

## Scope

Eight follow-up requests against the Deal ID console built earlier the same day:
1. Entity ID / Structure fields show description text, not just the bare code
2. Same advanced filters as `web/dttk-console/index.html`, on both OTTK and DTTK panels
3. A non-editable currency field next to Deal ID Amt, defaulted from the selected OTTK's currency
4. Add that currency to the real `ZSGSLCTR_DEALID` table and expose it via the OData service
5. OTTK and DTTK hotspots open the same read-only display popup DTTK console itself uses
6. Never allow a create where Deal ID Amt exceeds either ticket's balance
7. Balance must reflect Deal IDs already created against that OTTK/DTTK
8. Same OTTK/DTTK column set in both grids as `web/dttk-console/index.html`

Items 6 and 7 were already implemented in the original build (verified again live here); items
1, 2, 3, 5, 8 were built this activity. Item 4 was initially blocked by an `mcp-abap-abap-adt-api`
outage, then completed once the server recovered mid-activity — the human independently added the
real `ZCURR` field to `ZSGSLCTR_DEALID` (with proper `@Semantics.amount.currencyCode` annotations
already pointing at it on several amount fields) while the server was down; the rest of item 4
(exposing it through the BO stack) was done here once tooling access returned.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Item 5's popup reuses `web/dttk-console/index.html` (adding a new `?displayOttk=` entry point there, alongside the existing `?displayDttk=`) - is touching that shared file acceptable, or should the popup be duplicated locally into deal-id-console instead? | Keep reusing DTTK console's page (two small, additive, backward-compatible hooks) | 2026-09-08 |
| 2 | Which "log fields" for item 4-adjacent scope (asked mid-build on the earlier BO)? | N/A - answered on the prior activity, not this one; noted here only because it shaped what the DealId entity already exposes | 2026-09-08 |
| 3 | Currency field name/domain for `ZSGSLCTR_DEALID`? | Human added it directly: `zcurr : waers`, plus `@Semantics.amount.currencyCode : 'zsgslctr_dealid.zcurr'` annotations on `zdeal_amt` and several other amount fields on the same table | 2026-09-08 |

## Naming gate

NAMING: N/A -> item 4's changes are all to already-created, already-validated objects (no new
object names to gate); the human-added table field `ZCURR` is DDIC-internal, not a named
CDS/service-layer object subject to this project's naming pattern.

## Todo

- [x] 1. Entity ID / Structure now display `codeText(code, description)` (e.g. "E021 OGA-DMCC-PAN") in `lookupOttk()`; the raw code is still what's sent to the server (sourced from `ottkRec.ZentId`/`ottkRec.Zstr` in the create handler, not the enriched display field) - verified live this doesn't leak the description into the payload.
- [x] 2 & 8. Ported `web/dttk-console/index.html`'s OTTK/DTTK table columns and advanced-filter bars into `web/deal-id-console/index.html` verbatim (same filter fields, same `fillFilterSelect`/`looseMatch`/`codeText` helpers), plus this console's own added Balance column. Found and fixed a gap while porting: the Bank filter dropdowns need the Bank *master list* (friendly names), not just codes present in the loaded rows - DTTK console gets this from `loadLookups()`; added an equivalent `loadBankFilterOptions()` here.
- [x] 3. Added `#dealCurr` (readonly) next to Deal ID Amt; set from `rec.ZottkCurr` in `lookupOttk()` and cleared alongside the other OTTK-derived fields.
- [x] 4. **Done.** `mcp-abap-abap-adt-api` returned `400` on every call (even bare `adtDiscovery`) for ~25+ minutes, repeatedly re-checked; not attempted via `adt-mcp` since it has no source-modification tool for existing objects (create-only). Recovered mid-activity. The human had independently added `zcurr : waers` to `ZSGSLCTR_DEALID` while the server was down, plus `@Semantics.amount.currencyCode` annotations on `zdeal_amt` and several other amount fields pointing at it — read via `getObjectSource` to confirm before changing anything. Updated: `ZFS_I_DealId` (added `zcurr as ZdealCurr`; changed `ZdealAmt`'s exposure from the earlier `cast(... as abap.dec(15,2))` workaround to a properly currency-typed field with `@Semantics.amount.currencyCode: 'ZdealCurr'`, now that a real currency field exists to reference), its BDEF (`ZdealCurr = zcurr` mapping, added to the `mandatory : create` list alongside `ZottkNo`/`ZdttkNo`), `ZFS_C_DealIdTP` (projection field added), and `LHC_DEALIDTP-update` (`%control-ZdealCurr` check). All four activated clean (only the same benign warnings seen on the original build — `ZFS_I_DEALID`/`ZFS_C_DEALIDTP` needed activating together in one call since they're now mutually interdependent on the new field, one-at-a-time activation failed with `Reference field ZDEALCURR does not exist locally` until both were sent in the same `activateObjects` call). `ZdealCurr` added back into the create payload, matching the comment already left naming exactly this step.
- [x] 5. Added a `?displayOttk=` entry point to `web/dttk-console/index.html` (mirroring the existing `?displayDttk=` one exactly - same `display-ticket` class, same write-guard, same postMessage-based ready/close handshake), reusing its own already-built read-only `ottkViewModal`. `web/deal-id-console/proxy.py` gained the same `dttk-view.html` → `dttk-console/index.html` shared-page route `web/ottk-dttk-console/proxy.py` already has. The console's own hotspot click handling was split: clicking anywhere on a row selects it into the create form (existing behavior); clicking specifically the underlined ticket number opens the read-only popup instead (`stopPropagation`, matching `web/ottk-dttk-console`'s own hotspot/row-click split).
- [x] 6. Re-verified live (already present from the original build): Deal ID Amt exceeding either balance is rejected before any request is sent, with the actual balance now named in the message.
- [x] 7. Re-verified live (already present): Balance = ticket's trade value minus the live sum of `ZdealAmt` from existing Deal ID rows for that OTTK/DTTK. Rewrote the per-row balance fill from "one unthrottled query per visible row" to `runLimited(..., 3)` — same concurrency-capping discipline as L-278, since a wide filter result could otherwise re-create that exact socket-starvation bug against `proxy.py`.
- [x] **Caught and fixed a self-introduced regression before it shipped**: added `ZdealCurr` to the create payload in anticipation of item 4, then verified live via a deliberately-non-mutating POST that this *broke every create* (`Property 'ZdealCurr' is invalid` - OData V4 rejects the whole request for one unrecognized property, not just that field). Removed it from the payload with a comment naming what unblocks putting it back; re-verified live that create requests reach the handler correctly again. Logged as L-281.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZSGSLCTR_DEALID | TABL/DT | ZSGSLC | N/A (human's own change) | `zcurr : waers` field added by the human directly; read/confirmed here, not created by this session |
| ZFS_I_DealId | DDLS/DF + BDEF/BDO | ZFS_SLC_BTP | DS4K907279 | Changed: `ZdealCurr` field added, `ZdealAmt` now properly currency-typed, BDEF mapping + mandatory-create list updated |
| ZFS_C_DealIdTP | DDLS/DF + BDEF/BDO | ZFS_SLC_BTP | DS4K907279 | Changed: `ZdealCurr` field added to the projection |
| ZBP_FS_DEALIDTP | CLAS/OC | ZFS_SLC_BTP | DS4K907279 | Changed: `LHC_DEALIDTP-update` handles `%control-ZdealCurr` |

Local files:

| Object | Type | Status |
|---|---|---|
| web/deal-id-console/index.html | Local HTML/JS | Entity/Structure descriptions, full DTTK-console-parity columns+filters, Deal Curr field, display-popup hotspots, batched balance fill, `ZdealCurr` now included in the create payload |
| web/deal-id-console/proxy.py | Local Python | Added the `dttk-view.html` shared-page route |
| web/dttk-console/index.html | Local HTML/JS | Added `?displayOttk=` entry point (new, additive) alongside the existing `?displayDttk=` one; `ottkViewModal`'s close handlers now postMessage when embedded, matching `dttkModal`'s existing pattern |

## Delivery checks

- [x] JS syntax check (Node, extracted `<script>` blocks) clean on both `index.html` files; Python syntax check clean on `proxy.py`.
- [x] Columns and filter IDs verified live to match `web/dttk-console/index.html` exactly (17 OTTK columns incl. the new Balance one, 17 DTTK columns; 8 OTTK filter fields, 9 DTTK filter fields).
- [x] OTTK hotspot verified live with a real click: opens the shared read-only popup (`?displayOttk=100042`), full field set populated from live data, closes cleanly via the postMessage handshake, does **not** select the row into the form.
- [x] DTTK hotspot verified live with a real click: opens the shared display-only DTTK modal (`?displayDttk=100039`), same as `web/ottk-dttk-console` already does.
- [x] Row click (not on the number) verified live: selects into the form, `Entity ID` shows "E021 OGA-DMCC-PAN", `Structure` shows "DSX Deposit Set Off - Cross Border", `Deal Curr` auto-fills "USD" from the OTTK.
- [x] Bank filter dropdown verified live: was empty (bug caught while testing filters, not assumed working), fixed with `loadBankFilterOptions()`, now shows friendly names and genuinely narrows the OTTK grid 5→2 records when set to a specific bank.
- [x] Balance-exceeded validation re-verified live with real data: blocked before any network call, message names the actual balance.
- [x] The `ZdealCurr`-breaks-create regression was caught and fixed via a live, deliberately-non-mutating `POST` test (invalid `ZottkNo` so no row could ever be created) — confirmed the exact failure mode, then confirmed the fix by re-running the same test and seeing the request reach the handler's own validation message instead of an OData property-parse error.
- [x] All four item-4 objects activated clean (no errors; the pre-existing `AccessControl annotation differs` warning, unchanged from the original build, and the pre-existing `READ ZFS_I_DEALID not implemented` warning, both matching the sibling fee-BO precedent).
- [x] Item 4 verified live end-to-end: the same non-mutating-POST technique now shows the request reaching the handler correctly (not a property error) with `ZdealCurr` included; `GET .../DealId` confirms the field is readable (correctly blank on the 14 pre-existing rows, which predate it); the console's own `#dealCurr` field and the value that would be sent both confirmed "USD" for a real OTTK via a real click, not a scripted call.
- SAP Pretty Printer, ATC, ABAP Unit, text elements, transport-contents confirmation: not separately run this turn.

## Lessons raised

L-281: an OData V4 `POST` with even one unrecognized property fails the whole request, not just
that field — verified live before and after the fix. Full detail in `lessons/lessons-ledger.md`.

## Handover

All 8 requested items are done and live-verified, including item 4. The 14 pre-existing Deal ID
rows have `ZdealCurr = ""` (correct — they predate the field; not backfilled, since that wasn't
asked for and touching existing production data without a request would be out of scope). No live
Create was exercised end-to-end this activity either (same reasoning as the original build) — the
non-mutating-POST technique proved the request now reaches the handler correctly, but the first
real Create through the console is still the user's own.
