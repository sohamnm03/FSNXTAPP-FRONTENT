# Deal ID console: OTTK search popup Balance column fix

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — local file only
- **Transport:** n/a
- **Requested by:** human ("In the select OTTK popup balance is coming blank")

## Scope

`web/deal-id-console/index.html`'s "Search OTTK" popup (opened via the magnifier icon next to
OTTK No) showed a hardcoded em-dash in its Balance column instead of a real figure.

## Investigation

The main OTTK/DTTK panels compute Balance asynchronously via `fillBalances(kind)`, filling a
`data-balance-for` cell after render. `renderOttkModalRows()` (the popup's own render function)
copied the row markup but never gave its Balance `<td>` a `data-balance-for` attribute — it
hardcoded `—` instead — and `fillBalances` was never called for the modal at all (L-291).

## Fix

- Generalized `fillBalances(kind, bodyId)` to accept an optional target tbody id (defaulting to
  `` `${kind}Body` ``), so the same balance computation can target a different table.
- Gave the modal's Balance cell a `data-balance-for="${esc(r.ZottkNo)}"` placeholder.
- Called `fillBalances('ottk','ottkModalBody')` after rendering the modal's rows.

## Todo

- [x] 1. Found the hardcoded `—` placeholder and confirmed no fill call existed for the modal
- [x] 2. Generalized `fillBalances` with a `bodyId` parameter
- [x] 3. Wired the modal's Balance cell + fill call
- [x] 4. Verified live in a browser (Playwright): opened Search OTTK, both rows showed real
      balances (1,000,000.00 each) instead of the dash

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| web/deal-id-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No SAP objects touched.

## Delivery checks

- [x] Functional test in a real browser against the live system

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-291
