# DTTK display-popup click bug, proxy socket starvation, Type 1-conditional Confirmation Bank, and the connection indicator

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** N/A (local `web/` tooling only; no SAP objects touched)
- **Transport:** N/A
- **Requested by:** user

## Scope

Three related pieces of work in the local OTTK/DTTK web consoles, no SAP object changes:

1. Diagnose and fix the DTTK-number hotspot in `web/ottk-dttk-console/index.html` opening a
   popup that stayed on "Loading Distribution Ticket…" forever.
2. Along the way, fix a proxy-level socket-starvation bug my own intermediate fix introduced.
3. Hide the Confirmation Bank section in `web/dttk-console/index.html`'s DTTK modal when
   `DTTK Type 1 = "02 Discounting Only"` — that type carries no confirmation leg, so the section
   (and its required-field checks) should not show for it. Shown for `01`, `03`, and blank.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Was the stuck popup a caching/extension/timing issue? | No — ruled out serially (cache, `display:none`-iframe-never-loads, browser extension) with live reproduction each time before finding the real cause. | 2026-09-08 |

## Naming gate

NAMING: N/A -> no SAP artifacts created or renamed.

## Todo

- [x] 1. Reproduce the stuck "Loading Distribution Ticket…" popup with a real browser (Playwright), not a scripted call.
- [x] 2. Find the actual cause: the loading overlay was toggled with the `hidden` attribute while also carrying an inline `display` — an inline style beats `[hidden]{display:none}`, so it was never actually hidden and sat over the whole page swallowing every click.
- [x] 3. Fix the overlay to toggle `style.display` instead; verify with a real pointer click that the popup opens and populates.
- [x] 4. Separately, fix a socket-starvation bug from an earlier session's lookup-parallelization change: firing all 5–7 lookups at once could exhaust the browser's ~6-connections-per-origin limit against the HTTP/1.0 proxy, starving the popup's own page request when SAP was slow. Capped concurrency to 3 and moved both `proxy.py` files to HTTP/1.1 keep-alive.
- [x] 5. Remove temporary on-screen diagnostics (Cancel button, step log, build stamp) added while chasing the bug.
- [x] 6. Add `applyType1Visibility()` to `web/dttk-console/index.html`, hiding `.sec-confirmation` for Type 1 = `02`, wired into `onchange`, `clearDttkFields()`, and `populateDttkModal()` (covers create, edit, and the read-only display popup, which reuses the same function).
- [x] 7. Verify all four Type 1 states (`01`, `02`, `03`, blank) and confirm on a real existing `02` ticket (DTTK #100039) opened via a real click.
- [x] 8. Follow-up: when Type 1 = `02`, widen Additional Information to the full row (via a `no-confirmation` class on the grid, scoped to `#dttkModal` to avoid the OTTK view modal's identically-classed grid) instead of leaving Confirmation Bank's empty grid cell blank next to it.
- [x] 9. Verify the DTTK popup opened from the OTTK console (not just the standalone DTTK console) inherits the Type 1 = `02` layout fix — it does, since it reuses the same `dttk-console/index.html` document; no separate fix needed.
- [x] 10. Fix the connection indicator (`#connIndicator`, next to Create OTTK/Create DTTK) always showing green regardless of actual SAP reachability. Centralized state reporting into `apiRequest()` so every request updates it (not just the 3 load functions, and not just one arbitrarily-chosen call inside each), distinguishing proxy.py's 502 (its own "couldn't reach SAP" signal) from any other status (which proves SAP answered, even if that specific request failed). Added a 30s poll so the dot self-corrects on a mid-session drop instead of only updating on the next click/reload.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| web/ottk-dttk-console/index.html | Local HTML/JS | N/A | N/A | Loading overlay now toggles `style.display`; lookups capped at 3 concurrent; diagnostics removed |
| web/dttk-console/index.html | Local HTML/JS | N/A | N/A | Lookups capped at 3 concurrent; `applyType1Visibility()` added |
| web/ottk-dttk-console/proxy.py | Local Python | N/A | N/A | `protocol_version = "HTTP/1.1"`, `timeout = 30` |
| web/dttk-console/proxy.py | Local Python | N/A | N/A | `protocol_version = "HTTP/1.1"`, `timeout = 30` |

## Delivery checks

- [x] JavaScript syntax check on both `index.html` files (Node `new Function` on extracted `<script>` blocks) — clean.
- [x] Python syntax check on both `proxy.py` files (`py_compile`) — clean.
- [x] Both proxies restarted after the `protocol_version`/`timeout` change and confirmed listening (8765, 8766).
- [x] Keep-alive verified live: two sequential `curl` requests to the same origin report connection reuse.
- [x] Popup click bug reproduced live (request never issued, `document.elementFromPoint()` returned the overlay) and fix verified with a real Playwright pointer click — popup opens, populates a real record, background dimmed correctly.
- [x] Socket-starvation fix verified under the original failing condition (7 concurrent lookups in flight): popup's page request now issued in ~20ms versus never before.
- [x] Type 1 visibility verified for all four states (`01`, `02`, `03`, blank) via real `<select>` interaction, and confirmed against a real `02` record (DTTK #100039) opened for edit through a real click — Confirmation Bank section correctly absent.
- [x] Full-width Additional Information for Type 1 = `02` verified: 1167px (full row) vs 575px (half row) for `01`/`03`, confirmed visually via screenshot and by measured `getBoundingClientRect()`.
- [x] OTTK console's DTTK popup for a real `02` record (DTTK #100039, opened via a real click) confirmed to show the same full-width layout as the standalone console, without any change to `ottk-dttk-console/index.html`.
- [x] Connection indicator verified live in both consoles by monkeypatching `window.fetch` inside the running page (not by editing source): a simulated 502 → red (`Cannot reach the SAP proxy`); a simulated 400 → stays green (proves SAP answered); a simulated 200 → green again. Also verified the exact reported scenario directly — page loads fine (green), SAP is then simulated as down with **no further user action**, and the dot self-corrects to red within the 30s poll window. Confirmed the display-only popup (topbar hidden via `body.display-ticket`) correctly skips setting up its own poll.
- SAP Pretty Printer, syntax, activation, ATC, ABAP Unit, text elements, transport checks: N/A — no ABAP changes.

## Lessons raised

L-278 (superseded in part by L-279): initial diagnosis of the socket-starvation cause.
L-279: the actual root cause — an inline `display` makes the `hidden` attribute a no-op; a
scripted/direct-call test cannot catch a UI element that blocks real pointer clicks. Both in
`lessons/lessons-ledger.md`.
