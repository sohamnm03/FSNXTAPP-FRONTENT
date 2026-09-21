# Build the DTTK workbench console on its own proxy and wire it to the live OData V4 services

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** N/A — no repository object created or changed
- **Transport:** N/A
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — page + proxy built, full CRUD live-tested, no test data left behind. One
  ABAP defect reported and left for the human to authorise (see *Open questions* #5).

## Scope

The human's hand-built `~/Downloads/DTTK_actual_screen_v43.html` — a 8.7k-line *Distribution Ticket
(DTTK) Workbench* screen designed for the SAP GUI HTML control (server-injected `DTTK_PAYLOAD_JSON`,
`SAPEVENT:` form posts, demo `DUMMY_*` arrays) — had to become a working console driven by the two
published OData V4 Web APIs, the same way the OTTK console was wired on 2026-09-07:

- `ZFS_SB_SLCDTTKDETAIL_O4_API` → `SlcDttkDetail` (full CRUD) + its own `Bank` list
- `ZFS_SB_SLCOTTKDETAIL_O4_API` → `SlcOttkDetail` (the open-OTTK list the screen references) plus the
  `Bank`, `EntityString`, `CoCode` and `RefInt` value help the DTTK service does not expose

Out of scope, and deliberately not done: **no ABAP object was created or changed** (rule 6 — the task
was achievable entirely client-side); no new entity sets or value-help views; no transport; and
nothing under `web/ottk-dttk-console/` was left modified (see *Open questions* #1).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | The existing `proxy.py` already serves any file beside it and already routes both services — extend it with the new page and one `/api/whoami` route, or stand up a second server? | Human instruction mid-task: **a separate proxy**, "keep the existing proxy for ottk … dont disturb the exsting tested ottk". The DTTK console is now `web/dttk-console/` with its own `proxy.py`, `sap_config.json` and port **8766**; the OTTK console is byte-for-byte back to what it was on port 8765. Recorded as L-267. | 2026-09-07 |
| 2 | The screen's demo layer (`DUMMY_BANKS/TRADERS/ENTITIES/REF_RATES/OTK_REF_LIST/DTTK_REF_LIST`, `SAPEVENT:` forms, `DTTK_PAYLOAD_JSON`) is invented business data. Delete it, or leave it as a fallback? | Neither as-is: the arrays are emptied (`= []`) rather than deleted, because the later patch blocks in the file (`v35`, `v40`) still reference them — so no fabricated bank/entity/ticket can ever render, and nothing throws. `emitSapEvent` is a no-op stub; the SAPEVENT forms and `SAP_EVENT_FORM_MAP` are removed. | 2026-09-07 |
| 3 | The screen has two Trader dropdowns and a Region field. Neither service exposes a trader master or a region, and `Bank` on the DTTK service returns only `Zbp`/`BpName`. Invent code lists? | No. Trader options are built from the trader values that actually occur on the live OTTK/DTTK rows (`Ztrader`, `ZdTrader`, `ZcTrader`) — honest, and it grows with the data. Region stays a free-text field. **Follow-up if real value help is wanted: that needs service-side exposure, i.e. an ABAP change, which was not requested.** | 2026-09-07 |
| 4 | The Charges popup is a 10-row grid feeding *Confirmation Fee* and *Other Charges*. The DTTK service exposes no fee entity set (only `Bank` + `SlcDttkDetail`), unlike OTTK's `SlcOttkFee`. | The grid stays client-side and its grand total is persisted into the header fields it feeds — `Zcfee` (confirmation) and `Zofee` (other charges). **Charge *lines* are not persisted**; they live only for the session. Storing them would need a DTTK fee entity set — an ABAP change, not requested. The fee-type suggestion lists stay as the human authored them (the OTTK `FeeType` list is origination-specific and would be wrong here). | 2026-09-07 |
| 5 | A one-field `PATCH` on `SlcDttkDetail` blanks every field it did not send — L-266 predicted exactly this and left `LHC_SlcDttkDetail.update` unfixed until DTTK editing was exposed. This activity exposes it. | Mitigated client-side (full field set + 15 pass-through properties on every edit, verified). The **root fix in `LHC_SlcDttkDetail.update` was not applied** — a change to a live BO is a shared-system action outside this request, so it is reported for the human to authorise. Recorded as L-268. | 2026-09-07 |

## Naming gate

Not applicable — no repository object created, no ABAP name chosen. The only new names are local
files (`web/dttk-console/{index.html,proxy.py,sap_config.json}`), which `docs/naming-conventions.md`
does not govern.

## Todo

- [x] 1. Read the live shapes rather than guessing: service documents for both APIs, a sample
      `SlcDttkDetail` row (77 properties), `SlcOttkDetail`, and every lookup set
- [x] 2. Map the screen's `form` object ↔ `SlcDttkDetail` (46 writable properties), and the screen's
      `otkRefList`/`dttkRefList`/`masterData` shapes ↔ the live rows, so the existing rendering,
      sorting, filtering and layout code is untouched
- [x] 3. Neutralise the demo layer: `DUMMY_*` → `[]`, `sapPayload` → `{"meta":{"sapMode":false}}`,
      `emitSapEvent` → no-op, SAPEVENT forms removed
- [x] 4. `web/dttk-console/proxy.py` — copy of the tested proxy, adapted: DTTK-first service map,
      `/api/whoami`, port 8766
- [x] 5. `web/dttk-console/sap_config.json` — non-secret config; password still resolved from the env
      var / gitignored `settings.local.json`, never stored
- [x] 6. Live layer appended to the page: lookups, both ticket lists, KPIs, create/edit/delete
- [x] 7. Company Code — the one property the service requires at create — is taken from the selected
      OTTK (the field is locked while the ticket is derived from one) and from the `CoCode` mapping
      when an entity is picked, so a save cannot fail on a field the user cannot reach
- [x] 8. Delete: a `Delete DTTK` button beside Save, enabled only for a loaded ticket, `confirm()` first
- [x] 9. Copy: loads a ticket then drops the key, so the next Save is a create
- [x] 10. Pass-through of the 15 writable properties the screen has no field for (L-268)
- [x] 11. Error surfacing: OData `error.message` / `SAP__Messages` in the screen's own toast; a dead
      proxy reports "Cannot reach the local proxy" and the header badge flips to OFFLINE
- [x] 12. Ledger entries L-267, L-268, L-269 written in the same turn
- [x] 13. Live functional test — full CRUD through the new proxy (below)

## Object list

No repository objects created or changed. Workspace files added:

| File | Role |
|---|---|
| `web/dttk-console/index.html` | The DTTK console, in the OTTK console's page format (see *Rebuild* below) |
| `web/dttk-console/workbench-v43.html` | The wired `DTTK_actual_screen_v43.html` workbench, kept and still served at `/workbench-v43.html` |
| `web/dttk-console/proxy.py` | Its own static server + OData proxy (Basic Auth, CSRF, `sap-client`, `/api/whoami`) |
| `web/dttk-console/sap_config.json` | Non-secret config, port 8766; names the password env var, never the password |

## Rebuild — same page format as the OTTK console (2026-09-08)

On the human's instruction ("how exactly the OTTK html file format is there same way do it in DTTK
like top DTTK and bottom OTTK and keep the buttons modals same like ottk html file"), `index.html`
was rebuilt from a copy of `web/ottk-dttk-console/index.html`, so the CSS is byte-identical and the
two consoles are the same application with a different primary object. Recorded as L-270.

- **Topbar:** `Create DTTK` · connection dot · Release & Print · Refresh · `Copy DTTK`
- **Panels:** *Open Distribution Tickets* on top (DTTK No opens its editor), *Open Origination
  Tickets* below (OTTK No copies that ticket down into a new DTTK; the OTTK is never edited here).
  Both keep the search box, the advanced-filter bar and the CSV export of the OTTK console.
- **Modals:** the same create/edit modal (five sections — Transaction Details, Trade Details,
  Confirmation Bank, Discounting Loan Details, Additional Information), the same Charges popup, the
  same success modal. `Delete` sits in the edit modal's footer and is hidden in create mode.
- **Charges:** rows come from the live `FeeType` lookup on the OTTK service — the only fee master
  either service exposes — and only the grand total is persisted (`Zofee`). The DTTK service has no
  fee entity set, so charge lines are not stored; the modal says so. A DTTK-flagged fee list would
  need service-side exposure.
- The workbench version is untouched and still reachable at `http://localhost:8766/workbench-v43.html`.
- Re-verified live after the rebuild with the payload `buildDttkPayload()` actually produces:
  `POST` → 201 (`100034`, all derived texts correct), full-form `PATCH` → 200 (only the two edited
  fields changed — pass-through intact), `DELETE` → 204, no test data left behind.

Unchanged, verified byte-identical to before this activity: `web/ottk-dttk-console/*`.

**Run it:** `python web/dttk-console/proxy.py`, then open `http://localhost:8766/`.
Both consoles can run at the same time (8765 OTTK, 8766 DTTK).

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source touched
- [x] Syntax check clean — n/a for ABAP; all 12 inline script blocks pass `node --check`, and every
      `getElementById` target in the live layer was cross-checked against the markup's `id` attributes
- [x] Activated, nothing left inactive — n/a, no repository object
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit — n/a; no ABAP written (L-216: no unrequested objects created)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — n/a, no transport
- [x] Live functional test, all through `http://localhost:8766`:
      - `/api/whoami` → `DS4_100_NIIF · 100 · FS_DEV3`; page served 200; `SlcDttkDetail`,
        `SlcOttkDetail`, both `Bank` sets, `EntityString`, `CoCode`, `RefInt` → 200
      - **create**: `POST` → 201, `ZdttkNo` `100029` generated; every server-computed text echoed
        correctly for the codes sent (`Ztype1Text` "Discounting & Confirmation", `ZintCatText`
        "Fixed", `ZaccTypeText` "Upfront", `ZstrText`, `ZentDesc`, `Butxt`, `ZdisDesc`) — which is
        what proves the field mapping, not just the HTTP status
      - **field coverage**: a create carrying all 46 form-mapped properties round-tripped with zero
        differences; the 15 unmapped writable properties were separately confirmed writable
      - **edit**: full-form `PATCH` → 200; re-read differs in exactly the three edited fields
        (`ZdttkValue`, `Ztenor`, `ZintRate`) and nothing else
      - **partial-PATCH defect** reproduced and recorded (L-268)
      - **validation path**: `POST` with today's `Zdate` → `SABP_BEHV/100` "Date (Zdate) must be later
        than today's date" (L-269) — the message the page's toast renders
      - **delete**: `DELETE` → 204, re-`GET` → 404
      - **no test data left behind** — every record created here (`100029`–`100033`) was deleted
        through the API; the two pre-existing mock rows `100025`/`100026` are untouched
- [ ] Browser click-through — **not performed by me**: no browser-automation tool is available in
      this session. The UI was verified structurally (all script blocks parse, all ids resolve,
      served markup correct) and functionally at the API layer only. The human should open
      `http://localhost:8766/` and confirm the interactions feel right — in particular the
      Browse/Editor mode switch, the OTTK→DTTK copy-down, and the Charges popup totals.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-267, L-268, L-269, L-270.
