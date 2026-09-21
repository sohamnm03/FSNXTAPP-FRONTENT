# Deal ID console: hard status filter (<= 05) on OTTK and DTTK panels

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — local file only
- **Transport:** n/a
- **Requested by:** human

## Scope

In `web/deal-id-console/index.html`, both main panels ("Open Origination Tickets (OTTK)" and
"Open Distribution Tickets (DTTK)") should only ever show tickets whose status code is `<= 05` —
confirmed a hard filter, not a togglable one. Out of scope: no change to the ottk-console or
dttk-console consoles (separate files, not asked for), no change to the create/update behavior
logic.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Hard filter (never show > 05) or just a default that a dropdown can override? | Hard filter | 2026-09-08 |

## Naming gate

NAMING: N/A -> local JS function `isAssignableStatus`, no SAP object involved.

## Todo

- [x] 1. Confirmed live field names/values via the console's own proxy: `ZottkSt` (OTTK),
      `ZdttkSt` (DTTK) — both 2-char numeric-string codes, and several real rows come back blank
      rather than `01` (see L-286)
- [x] 2. Added `isAssignableStatus(code)` — `true` when the code is blank/non-numeric or `<= 5`
- [x] 3. Applied it inside `loadOttk()`/`loadDttk()`, filtering `ottkRows`/`dttkRows` at fetch
      time so it's a genuine hard filter — search box, advanced-filter dropdowns, and the OTTK
      search-popup/modal all operate only on the already-restricted set, with no way to reveal an
      excluded ticket
- [x] 4. Verified live in a browser (Playwright): OTTK `100042` (status `06`) and DTTK `100039`
      (status `06`) disappeared from their panels; counts dropped from 5→4 (OTTK) and 4→3 (DTTK)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| web/deal-id-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No SAP objects touched.

## Delivery checks

- [x] Functional test in a real browser against the live system
- Pretty Printer / ATC / ABAP Unit / text elements / transport: not applicable, local file only

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-286
