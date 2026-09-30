# Deal ID console: match OTTK/DTTK status pill style to the OTTK console

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — local file only
- **Transport:** n/a
- **Requested by:** human ("why the OTTK and DTTK status text showing different in Deal id
  console, i want the same like OTTK console")

## Scope

`web/deal-id-console/index.html`'s OTTK and DTTK panel status pills should look like
`web/ottk-dttk-console/index.html`'s ("the OTTK console"). Out of scope: no change to the
underlying data/text content (already fixed in the prior two activities), no change to
`web/dttk-console`.

## Investigation

The `statusPill()` JS function and the `.status-pill.open`/`.status-pill.pending` CSS rules were
identical across `deal-id-console` and `ottk-dttk-console` — so OTTK's and DTTK's status text was
never actually different *from each other* inside the Deal ID console. The real divergence was the
Deal ID console's own base `.status-pill{...}` rule versus the OTTK console's: uppercase text,
9px font, 20px border-radius vs. the OTTK console's mixed-case, 11px, 12px border-radius. This
made every status pill in the Deal ID console (both OTTK's and DTTK's, equally) render in a
visibly different style than the OTTK console — read as "different" by the human because the
Deal ID console's pills didn't match what they were used to seeing (L-290).

## Todo

- [x] 1. Diffed `statusPill()` and `.status-pill` rules across `deal-id-console` and
      `ottk-dttk-console` line by line — found the divergence in the base rule only
- [x] 2. Replaced `deal-id-console`'s base `.status-pill{...}` rule with `ottk-dttk-console`'s
      exact rule (mixed case, 11px, 12px radius, no letter-spacing)
- [x] 3. Verified live in a browser (Playwright): both OTTK and DTTK panels now render
      "01 - Create New" in mixed case, matching the OTTK console

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| web/deal-id-console/index.html | local file (changed) | n/a | n/a | Verified in browser |

No SAP objects touched.

## Delivery checks

- [x] Functional test in a real browser against the live system

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-290
