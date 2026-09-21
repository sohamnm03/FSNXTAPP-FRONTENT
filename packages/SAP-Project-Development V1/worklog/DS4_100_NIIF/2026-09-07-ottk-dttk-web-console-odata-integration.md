# Wire the OTTK/DTTK HTML console to the live OData V4 services (full CRUD)

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** N/A — no repository object created or changed
- **Transport:** N/A
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — proxy + page built, full CRUD live-tested on both services, no test data left behind

## Scope

The human's hand-built single-file HTML console (`Origination Ticket (OTTK)`, previously in
`~/Downloads`, all data hardcoded) had to be driven by the two published OData V4 Web APIs instead of
its mock arrays, with full **C**reate/**R**ead/**U**pdate/**D**elete against both:

- `ZFS_SB_SLCOTTKDETAIL_O4_API` → entity set `SlcOttkDetail` (+ read-only `Bank`)
- `ZFS_SB_SLCDTTKDETAIL_O4_API` → entity set `SlcDttkDetail` (+ read-only `Bank`)

On the human's instruction mid-task, all files live **in this repository**, not in `~/Downloads`:
`web/ottk-dttk-console/`.

Out of scope, and deliberately not done: **no ABAP object was created or changed** (rule 6 — the
task was achievable entirely client-side). No new entity sets, no value-help views, no service
changes, no transport.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | A file:// page cannot call the SAP Gateway directly (CORS, plus Basic Auth + CSRF for writes). Host it how? | Asked the human, who chose the **local proxy** option: a stdlib-only Python server that serves the page *and* proxies `/api/ottk/*` + `/api/dttk/*`, holding Basic Auth and the CSRF token server-side. Same-origin by construction, so no Gateway CORS configuration is needed and no credential reaches the browser. | 2026-09-07 |
| 2 | How far should CRUD go, given the page had a Create/Edit modal for OTTK only, a read-only DTTK table, and no delete anywhere? | Human chose **full CRUD on both**: a new DTTK Create/Edit modal mirroring OTTK's, and per-row edit/delete actions (with a confirm step) on both tables. | 2026-09-07 |
| 3 | Where does the password come from, now that the files live in the repo? A plaintext `sap_config.json` would be a secret in a git repo. | `sap_config.json` holds non-secret config only and names `passwordEnvVar`. `proxy.py` resolves the password from that environment variable, falling back to the repo's already-gitignored `.claude/settings.local.json` `env` block — the same value the MCP servers use. No new secret file, nothing new to add to `.gitignore`. | 2026-09-07 |
| 4 | The coded fields (`Zstr`, `Ztype`, `ZdepVal`, `ZintCat`, `ZpayTerms`, DTTK `Ztype1`/`Ztype2`) have no `ValueList` annotation in `$metadata`, and every existing row on the system has them blank — so neither metadata nor live data reveals the permitted codes. Guess them? | No. Read `ZFS_CDS_SLC_001` / `ZFS_CDS_SLC_002` with `getObjectSource`: the code lists are inline `CASE` literals in the views. Harvested them into real dropdowns and verified live (`Zstr: "DSX"` echoed `ZstrText: "Deposit Set Off - Cross Border"`). Recorded as L-254. | 2026-09-07 |
| 5 | Fields with no derivable list — `Zbltype`, `ZresFrq`, `Zrma`, `ZdisVal`, and the status/entity-ID master data (`zsgslctr_ot_stat`, `zsgtsftr_ent_str`, not exposed by these services) | Left as plain text inputs with the metadata `MaxLength` enforced client-side, rather than inventing a picklist. Status stays display-only. Flagged to the human as the follow-up if value help is wanted — that would need new exposure on the service side, i.e. an ABAP change, which was not requested. | 2026-09-07 |
| 6 | The mock DTTK table had two identical columns (`Company Code` and `CoCode`) and never showed `ZdttkNo`, so a row could not be identified for edit/delete. | Replaced the duplicate column and added `DTTK No` as the leading link column, mirroring the OTTK table's own pattern. Table column sets on both panels now show the key, the coded fields with their server-computed descriptions, and a row-actions column. | 2026-09-07 |

## Naming gate

Not applicable — no repository object created, no ABAP name chosen. The only new names are local
files in this workspace (`web/ottk-dttk-console/{index.html,proxy.py,sap_config.json}`), which
`docs/naming-conventions.md` does not govern.

## Todo

- [x] 1. Read `$metadata` for both services live (per L-252's `srvd_a2x` path, and with
      `sap-client=100` — see L-253) to derive the real property names, types, `MaxLength`s, the
      `Computed` set, and the `InsertRestrictions` (`Zbukrs` is the only required property on both)
- [x] 2. `web/ottk-dttk-console/proxy.py` — stdlib-only static server + OData proxy: Basic Auth
      injection, CSRF fetch/cache/retry-once-on-403, per-service cookie jar, `sap-client` on every
      forwarded call, `tlsVerify:false` for the self-signed cert, path-traversal guard on static serving
- [x] 3. `web/ottk-dttk-console/sap_config.json` — non-secret config (user, service base URLs,
      client, port, `passwordEnvVar`); password resolved at runtime from env → `settings.local.json`
- [x] 4. `web/ottk-dttk-console/index.html` — replaced the hardcoded `distRows` array and the static
      `origTable` rows with live fetch + render; both tables now render from the API response objects
- [x] 5. OTTK modal wired to `POST` (create) / `PATCH` (edit) on `SlcOttkDetail`; ~29 writable
      properties mapped; `Computed` fields (`ZottkNo`, all `*Text`/`*Desc`, all audit fields) never sent
- [x] 6. New DTTK Create/Edit modal (same markup pattern and CSS as OTTK's), ~33 writable properties
      mapped, wired to `SlcDttkDetail`
- [x] 7. Per-row Edit + Delete actions on both tables (`DELETE .../EntitySet('<key>')`, `confirm()` first)
- [x] 8. Bank dropdowns in both modals populated live from each service's own `Bank` entity set —
      the OTTK one filtered `zotbank`, the DTTK one `zdtbank`, so the two lists genuinely differ
- [x] 9. Coded-field dropdowns rebuilt from the CDS `CASE` literals (L-254); tables render
      `code + server-computed text`
- [x] 10. Error surfacing: OData V4 `error.message` and `SAP__Messages` shown in the existing toast;
      a dead proxy reports "Cannot reach the local proxy" rather than failing silently
- [x] 11. `lessons/lessons-ledger.md` — L-253 and L-254 recorded in the same turn
- [x] 12. Live functional test — full CRUD both services through the proxy (below)

## Object list

No repository objects created or changed. Workspace files added:

| File | Role |
|---|---|
| `web/ottk-dttk-console/index.html` | The console page (was `~/Downloads/Origination_Ticket__OTTK_ (1).html`) |
| `web/ottk-dttk-console/proxy.py` | Static server + OData proxy (Basic Auth, CSRF, `sap-client`) |
| `web/ottk-dttk-console/sap_config.json` | Non-secret config; names the password env var, never the password |

**Run it:** `python web/ottk-dttk-console/proxy.py`, then open `http://localhost:8765/`.

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source touched
- [x] Syntax check clean — n/a for ABAP; the page's JavaScript passes `node --check`, and every
      `getElementById` target was cross-checked against the markup's `id` attributes (no misses)
- [x] Activated, nothing left inactive — n/a, no repository object
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit — n/a; no ABAP written (L-216: no unrequested objects created)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — n/a, no transport
- [x] Live functional test, all through the proxy on `http://localhost:8765`:
      - page served 200; `GET SlcOttkDetail`, `GET SlcDttkDetail`, both `Bank` sets → 200
      - **OTTK**: `POST` → 201, `ZottkNo` `100034` generated from `ZFS_OTTK_D`; `PATCH` → 200
        (value 1,500,000 → 2,750,000, tenor 360 → 180, verified on re-`GET`); `DELETE` → 204;
        re-`GET` → 404
      - **DTTK**: `POST` → 201, `ZdttkNo` `100027` generated from `ZFS_DTTK_D`; `PATCH` → 200
        (verified on re-`GET`); `DELETE` → 204
      - error path: `POST` without `Zbukrs` → the expected
        `SADL_ENTITY_RUNTIME/018 "At create the mandatory element 'ZBUKRS' ... was not provided"`,
        which is what the page's toast renders
      - **no test data left behind** — both created records deleted through the API itself. The four
        pre-existing mock rows (`100032`, `100033`, `100025`, `100026`) from the 2026-09-05 activity
        were left untouched.
- [ ] Browser click-through — **not performed by me**: no browser-automation tool is available in
      this session, so the UI was verified structurally (JS parses, ids resolve, served markup
      correct) and functionally at the API layer only. The human should open the page and confirm
      the interactions feel right.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-253, L-254.
