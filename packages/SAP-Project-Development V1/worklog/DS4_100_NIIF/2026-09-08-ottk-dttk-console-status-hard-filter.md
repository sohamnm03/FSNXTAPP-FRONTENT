# OTTK/DTTK consoles: hard status filter (<= 05), same rule as deal-id-console

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — local files only
- **Transport:** n/a
- **Requested by:** human ("OTTK and DTTK section in both ottk console and dttk console the
  details should show only where the status <= 05")

## Scope

Extend the same hard status filter already built into `web/deal-id-console/index.html`
(2026-09-08, `worklog/DS4_100_NIIF/2026-09-08-deal-id-ottk-dttk-status-hard-filter.md`) to the
other two consoles that list OTTK/DTTK tickets: `web/ottk-dttk-console/index.html` ("the OTTK
console") and `web/dttk-console/index.html` ("the DTTK console"). Both their OTTK and DTTK
sections should only ever show tickets with status `<= 05`. Confirmed same semantics as before: a
hard filter, blank status counts as eligible (L-286).

## Naming gate

N/A — local JS function `isAssignableStatus`, no SAP object involved. Same name/logic as
`deal-id-console`'s, ported verbatim rather than reinvented.

## Todo

- [x] 1. Located `loadOttk()`/`loadDttk()` in both files (each console has its own copy — no
      shared JS module between the three consoles)
- [x] 2. Ported `isAssignableStatus()` and applied it as a `.filter()` on the fetched rows before
      they enter `ottkRows`/`dttkRows`, exactly as done in `deal-id-console`
- [x] 3. Verified live in a browser (Playwright): `ottk-dttk-console` — OTTK dropped from 5 to 4
      records (100042, status 06, excluded), DTTK stayed at 2 (100039/100040 already excluded by
      the DTTK CDS view's inner join from the prior activity); `dttk-console` — same counts,
      confirmed from its own page

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| web/ottk-dttk-console/index.html | local file (changed) | n/a | n/a | Verified in browser |
| web/dttk-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No SAP objects touched.

## Delivery checks

- [x] Functional test in a real browser against the live system, both consoles

## Lessons raised

None new — applies L-286's blank-status handling verbatim, no new finding this activity.
