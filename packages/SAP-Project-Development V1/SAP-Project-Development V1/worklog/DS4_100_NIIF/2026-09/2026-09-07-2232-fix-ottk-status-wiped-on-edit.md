# Fix: editing an OTTK blanked ZottkSt (status) — LHC_SlcOttkDetail.update field-loss bug

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Human report: "whenever i edit the existing ottk the status changed to blank in the table for that
ottk." Reproduced live and fixed in `ZBP_FS_SLCOTTKDETAILTP` (`LHC_SlcOttkDetail.update`) — the
existing, already-documented L-251 defect (blind `CORRESPONDING(...MAPPING FROM ENTITY)` blanks any
field a given `PATCH` didn't send) was finally the thing a human actually hit, on `ZottkSt`, because
`web/ottk-dttk-console`'s `buildOttkPayload()` never sends it (server-assigned status, not a form
field). Out of scope: `LHC_SlcDttkDetail.update` has the identical defect (per L-251) but the DTTK
panel in this console is read-only by design, so it is currently unreachable through this UI — left
untouched, per this project's "no invented/unrequested changes" rule.

## Naming gate

Not applicable — no new objects, a change to an existing class only.

## Todo

- [x] 1. Reproduce live: `PATCH SlcOttkDetail('100046')` with the console's own payload shape
      (no `ZottkSt`) — confirmed `ZottkSt`/`ZstatDesc` went from populated to blank
- [x] 2. Fetch current live source of `ZBP_FS_SLCOTTKDETAILTP` (`mcp-abap-abap-adt-api` was
      returning HTTP 400 on every call at this point, including `healthcheck`-adjacent calls
      `adtDiscovery`/`dropSession`/`searchObject` — recovered by calling the documented-buggy
      `login` tool once; its response is malformed JSON per `docs/abap-mcp-setup.md` but the
      login itself succeeds, and every subsequent call worked again)
- [x] 3. Rewrite `update` to merge field-by-field via `ls_entity-%control-<field> = mk-on` instead
      of the blind `CORRESPONDING` — 52 writable business fields, one `IF` each; audit/log fields
      (`zcreated_*`, `zchanged_*`, `local_*`) left as-is (already unconditionally preserved/reset
      right after the old merge, so no `%control` logic needed there)
- [x] 4. Activated — clean except the same pre-existing benign warning
      (`READ ZFS_CDS_SLC_001 not implemented`, W333, expected per L-238)
- [x] 5. ATC re-run — identical finding set to before this change (3 benign priority-3, no
      priority 1/2): `AMB_SINGLE` on the `update` `SELECT SINGLE`, two SLIN 1700 untranslated
      literals, one SLIN W333. No new findings introduced by the rewrite.
- [x] 6. Live re-test on `100047`: `PATCH` with the console's payload shape (no `ZottkSt`) leaves
      `ZottkSt='01'` unchanged; a following `PATCH` that *does* send `ZottkValue`/`Ztenor` updates
      them correctly (2,500,000 / '120') — confirms the fix is selective (only unsent fields are
      preserved), not a regression that stopped all writes.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZBP_FS_SLCOTTKDETAILTP | CLAS/OC | ZFS_SLC_BTP | DS4K907263 | pre-existing, changed (`update` method only) |

## Delivery checks

- [x] Pretty Printer — hand-written, consistent indentation
- [x] Syntax check clean — activated with no errors (one pre-existing benign warning)
- [x] Activated, nothing left inactive
- [x] ATC / Code Inspector — no priority 1/2; same 3 benign priority-3 findings as before this change
- [x] ABAP Unit — none applicable, none requested (L-216)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — `setObjectSource` echoed `DS4K907263`

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-266.
