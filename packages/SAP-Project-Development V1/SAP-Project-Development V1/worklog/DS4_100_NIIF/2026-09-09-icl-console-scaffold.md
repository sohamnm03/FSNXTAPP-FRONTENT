# ICL console — 4 human-supplied ICL mockups as one console, SAP event logic removed

- **Date:** 2026-09-09
- **System:** DS4_100_NIIF
- **Package:** n/a — no ABAP object created or changed by this activity
- **Transport:** n/a
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Stood up `web/icl-console/` as an eighth local console alongside `ottk-dttk-console` (8765),
`dttk-console` (8766), `deal-id-console` (8767), `tf-upload-console` (8768), `inv-console` (8769),
`tf-manage-console` (8770) and `slc-menu-console` (8771), seeded from four human-supplied mockups:

| Source (`C:\Users\karth\Downloads\`) | Copied in as | Title |
|---|---|---|
| `Create ICL Request.html` | `create-request.html` | Create ICL Request |
| `ICL Deposit Create.html` | `deposit-create.html` | Create Deposit |
| `ICL Req Alloc Bank.html` | `alloc-bank.html` | View Pending ICL Requests & Allocate Bank |
| `ICL Request App_Rej.html` | `approve-reject.html` | View & Approve ICL Request |

Each file was copied in **verbatim** (byte-for-byte via `Copy-Item`, not retyped), then two changes
were applied on top: (1) a small blue nav strip inserted right after `<body>` on all four pages,
linking back to a new `index.html` hub and across the other three screens — none of the mockups had
any way to reach each other; (2) on `approve-reject.html` only, the SAP event logic (see below).

**Explicitly out of scope, per the human's own instruction** ("adding the odata layer later"): no
OData wiring was added. All four screens still run entirely on their own in-page sample data
(`DEFAULT_PAYLOAD`/`DATA`/`DUMMY_ICL_REQUESTS`, per screen), the same
`HAS_EXTERNAL_PAYLOAD ? EXTERNAL_VAR : DEFAULT_DATA` convention every other console in `web/` uses.
`sap_config.json`'s `services` block carries the four existing shared services (ottk/dttk/dealid/tf)
for parity with the family, per L-294/L-298 — no ICL-specific service was invented.

## SAP event logic removed (`approve-reject.html`) — L-306

Of the four mockups, only `ICL Request App_Rej.html` carried a `cl_gui_html_viewer`/SAPEVENT
round-trip: 5 hidden `<form action="SAPEVENT:...">` elements (`REFRESH_ICL`, `APPROVE_ICL_REQUEST`,
`REJECT_ICL_REQUEST`, `UPLOAD_DMS_DOC`, `DOWNLOAD_DMS_DOC`), a
`<script id="sapPayload" type="application/json">__SAP_PAYLOAD__</script>` placeholder meant to be
string-replaced by an ABAP report before display, an `appData.meta.sapMode` flag, and an
`emitSapEvent()` helper that filled and submitted the matching hidden form only when `sapMode` was
true. Removed outright, per instruction, along with the now-dead `normalizeIdForSap()`,
`parsePayload()` and `applyServerPayload()` helpers that existed only to serve that mechanism.
`init()` now matches the sibling convention exactly:
`typeof ICL_APPROVE_REQUESTS_PAYLOAD !== "undefined" ? ICL_APPROVE_REQUESTS_PAYLOAD :
cloneEmptyPayload()` — so the page runs standalone on `DUMMY_ICL_REQUESTS` today (`meta.sapMode`
also dropped from `EMPTY_PAYLOAD`), and a future OData layer gets the same seam every sibling
console already uses, rather than a new one invented for this page. See L-306 for the full
before/after and the reasoning.

The other three mockups never had this mechanism — they already used the plain sample-data
convention, so they needed only the nav-strip change.

## Naming gate

No ABAP object created, so no `docs/naming-conventions.md` gate applies. Local filesystem naming
follows the established `web/<slug>-console/` convention:

```
NAMING: web/icl-console -> matches existing web/<slug>-console pattern (ottk-dttk-, dttk-, deal-id-, tf-upload-, inv-, tf-manage-, slc-menu-)
```

## Todo

- [x] 1. Confirm the pattern (`proxy.py` + `sap_config.json` + static HTML) and the next free port (8772).
- [x] 2. Create `web/icl-console/` and copy the four mockups in verbatim as `create-request.html`,
      `deposit-create.html`, `alloc-bank.html`, `approve-reject.html`.
- [x] 3. Add a shared nav strip (`.icl-console-nav`) to all four screens plus a new `index.html` hub
      tying them together, matching the `slc-menu-console` tile look at a smaller, single-group scale.
- [x] 4. Remove the SAP event logic from `approve-reject.html` (forms, `__SAP_PAYLOAD__` tag,
      `sapMode`, `emitSapEvent()` and its now-dead helpers) — see L-306.
- [x] 5. Write `sap_config.json` — DS4_100_NIIF / FS_DEV3 / port 8772 / the standard identical
      `services` block (no ICL service — not built yet).
- [x] 6. Write `proxy.py` from the `slc-menu-console`/`ottk-dttk-console` pattern — new docstring
      documenting the SAPEVENT removal, port 8772.
- [x] 7. Verify: `json.load` clean, `py_compile` clean, `GET /` → 200.
- [x] 8. Verify in a real browser (Playwright): hub renders all 4 tiles; each of the 4 screens loads
      with zero console errors; `approve-reject.html` loads sample rows on entering an Upto Request
      Date and a Reject action completes with no SAPEVENT navigation and no console errors.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/icl-console/index.html` | local file (new hub, tile menu for the 4 screens) | — | — | Created |
| `web/icl-console/create-request.html` | local file (mockup copied verbatim + nav strip) | — | — | Created |
| `web/icl-console/deposit-create.html` | local file (mockup copied verbatim + nav strip) | — | — | Created |
| `web/icl-console/alloc-bank.html` | local file (mockup copied verbatim + nav strip) | — | — | Created |
| `web/icl-console/approve-reject.html` | local file (mockup + nav strip + SAP event logic removed, L-306) | — | — | Created |
| `web/icl-console/proxy.py` | local file (static server + 4-service OData passthrough, unused) | — | — | Created |
| `web/icl-console/sap_config.json` | local file (port 8772) | — | — | Created |

## Delivery checks

Nothing was built on SAP, so the ABAP checks below are not applicable to this activity:

- [ ] ~~Pretty Printer~~ — n/a, no ABAP
- [ ] ~~Syntax check clean~~ — n/a, no ABAP; `python -m py_compile web/icl-console/proxy.py` clean instead
- [ ] ~~Activated, nothing left inactive~~ — n/a, no ABAP
- [ ] ~~ATC / Code Inspector~~ — n/a, no ABAP
- [ ] ~~ABAP Unit~~ — n/a, no ABAP
- [ ] ~~Text symbols and selection texts~~ — n/a, no ABAP; all page text is in the mockup HTML
- [ ] ~~Object list confirmed in the transport~~ — n/a, no transport
- [x] `python -c "json.load(...)"` on `sap_config.json` clean — port 8772, all four service keys present.
- [x] `python -m py_compile web/icl-console/proxy.py` clean.
- [x] `GET http://localhost:8772/` → 200, `<title>ICL Console -- Fourth Signal</title>`.
- [x] Browser-verified (Playwright, Chromium): hub renders 4 tiles linking to the 4 screens; each of
      `create-request.html`, `deposit-create.html`, `alloc-bank.html`, `approve-reject.html` loads
      with **zero console errors/warnings**, nav strip present and pointing at the other 3 screens
      plus the hub.
- [x] `approve-reject.html`: entering `31-12-2026` in Upto Request Date renders the 12-row
      `DUMMY_ICL_REQUESTS` table (paginated, 10/page) — confirms `init()`'s new
      `ICL_APPROVE_REQUESTS_PAYLOAD`-or-dummy fallback works now that `sapMode` gating is gone.
      Selecting a row and clicking Reject updates its status with **no navigation away from
      `approve-reject.html`** (i.e. no `SAPEVENT:` form submit fired) and zero console errors.
- [x] `grep` for `SAPEVENT|sapMode|sapPayload|emitSapEvent|normalizeIdForSap|parsePayload|applyServerPayload|__SAP_PAYLOAD__`
      in `approve-reject.html` → 0 matches.
- [x] Port 8772 confirmed clear of the seven existing consoles.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-306.


---

## Revision 2 — repo-wide sweep for SAP event logic in other consoles (2026-09-09)

> "check other consoles and remove the sap events logics in any other consoles under web"

### What was found

`grep -r "SAPEVENT|sapevent|sapPayload|emitSapEvent|sapMode|fireSap" web/` turned up four more hits
beyond the icl-console file already fixed in revision 1:

| File | Mechanism | Action |
|---|---|---|
| `web/tf-manage-console/index.html` | Same `cl_gui_html_viewer` shape as L-306 (6 forms, `__SAP_PAYLOAD__`, `sapMode`, `emitSapEvent()`) | Cleaned |
| `web/inv-console/index.html` | Different, simpler: bare `fireSapEvent()` → `window.location.href="sapevent:..."`, gated by `HAS_SAP_DATA` (the same seam as `HAS_EXTERNAL_PAYLOAD` elsewhere) | Cleaned |
| `web/dttk-console/workbench-v43.html` | Same shape as L-306, but the file turned out to be 11 concatenated historical script versions, not one working page (see below) | **Left alone**, human's call |
| `web/slc-menu-console/{index.html,proxy.py}` | Comment references only, documenting the L-299/L-300 decision already made | No change needed |

### `tf-manage-console/index.html`

Removed the 6 SAPEVENT forms, the `sapPayload`/`__SAP_PAYLOAD__` script tag, `appData.meta.sapMode`,
`emitSapEvent()`, the now-dead `parsePayload()`, and every `emitSapEvent(...)` call site. `init()`
now follows the same convention as icl-console: `typeof TF_MANAGE_PAYLOAD !== "undefined" ?
TF_MANAGE_PAYLOAD : cloneEmptyPayload()`.

One difference from L-306: `normalizeIdForSap()` was *also* used to build a real `blId` field value
in `handleCreateBl()`, independent of any `emitSapEvent()` call — so the helper itself was kept;
only the `emitSapEvent(...)` call sites came out. `handleAssignConfirm()`'s `assignPayload` object
(~10 lines reading form fields) existed only to feed `emitSapEvent("ASSIGN_DEAL_ID", pending.payload)`
— once that call was gone it had no remaining reader, so it was deleted too rather than left as an
unread field on `state.pendingDealAssignment`. See L-307.

### `inv-console/index.html`

Removed the dead `<a id="sapEventLink" href="sapevent:DUMMY">` anchor (never referenced by JS) and
`fireSapEvent()` plus its 13 call sites. `HAS_SAP_DATA` (`typeof FTI_DEALS !== "undefined"`) was
**kept** — it's the file's real vs. demo data seam, used in 12 other places unrelated to the SAP
event mechanism, not part of what was being removed. Two call sites had no other content once
`fireSapEvent(...)` came out (`refreshBtn`'s handler, `selectDeal`'s `HAS_SAP_DATA && triggerSap`
gate) and were deleted entirely; everywhere else the surrounding `if (HAS_SAP_DATA) { ...; return;
}` shape was kept, including a few now-bare `{ return; }` blocks, as an honest "nothing wired up
here yet" marker rather than inventing live behavior or collapsing to demo-always. Two more layers
of now-unreachable code were removed once traced: `collectSaveData()` (built the
`SAVE_DATA`/`YES_PROCEED` params, called from nowhere else) and the `triggerSap` parameter of
`selectDeal()` (read only inside the deleted branch — both call sites' second argument dropped too).

### `dttk-console/workbench-v43.html` — left alone

Before touching a 9,172-line file "the same way," checked what it actually was: **11 separate
`<script>` blocks** (`dttk-v23-workbench-js` through `v41`, then `dttk-live-odata-js`), each with its
own `document.addEventListener('DOMContentLoaded', init)` bound to whichever `init()` was in scope
at that point in the file — not necessarily the final one. Loaded as-is, up to ten different
versions' `init()` would fire and render on top of each other; it is flattened iteration history
concatenated into one file, not a working page, and was already superseded by the live
`web/dttk-console/index.html` (2026-09-09 vs. this file's 2026-09-07; its own embedded comment
already admits `emitSapEvent()` here was stubbed to a no-op). Reported this back before editing;
human's answer changed from "clean it the same way" (asked without this detail) to "leave it alone"
(asked with it). No edit was made.

### Verification (revision 2)

- [x] `grep -r "SAPEVENT|sapevent|sapPayload|emitSapEvent|sapMode|fireSap|isSapGui" web/` → only the
      expected comment-only hits in `slc-menu-console` and the untouched `workbench-v43.html` remain.
- [x] Started both proxies (`tf-manage-console` 8770, `inv-console` 8769) and browser-verified
      (Playwright, Chromium):
  - `tf-manage-console`: entered a Key Date, opened a trade flow's workspace, clicked **Update**
    (`handleWsUpdate`, had an `emitSapEvent` call removed) and **Create BL** (`handleCreateBl`, same)
    — both completed with no new console errors (2 pre-existing, unrelated: the external logo image
    failing DNS resolution, and a missing `favicon.ico` — neither is JS and neither is new).
  - `inv-console`: a deal auto-loaded via `selectDeal(initialDeal)` (confirms the `triggerSap`
    parameter removal didn't break the call), clicked **Save Data** (`saveBtn`, had `fireSapEvent`
    removed) and **Amendment** (`amendBtn`, had the whole `if (HAS_SAP_DATA)` `fireSapEvent` call
    removed, leaving `{ return; }`) — both completed with **zero console errors**.
- [x] `python -m py_compile` not applicable (no `.py` changed); no JS syntax errors surfaced by
      Chromium loading and running either file (a parse error would have shown as a console error,
      not a network-resource error).

### Lessons raised (revision 2)

L-307.
