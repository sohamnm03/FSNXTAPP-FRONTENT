# Inv console — scaffold from the FTI/PNL 12-column mockup

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — no ABAP object created or changed by this activity
- **Transport:** n/a
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Stood up `web/inv-console/` as a fifth local console alongside `ottk-dttk-console` (8765),
`dttk-console` (8766), `deal-id-console` (8767) and `tf-upload-console` (8768), seeded from the
human-supplied mockup `C:\Users\karth\Downloads\ZFS_FTI_HTML_PNL_12_COLUMNS_v7.html`
("Amend Selected BLs and Finalise Trade Invoices", 4247 lines, fully self-contained — no external
CSS/JS/image references). The page runs entirely on the mock data already baked into its JS
(`buildDummyLines`, `buildDummyBlLines`, `buildDummyPnlLines`) with `fireSapEvent()` stubs standing
in for the SAP round-trips — the same starting point OTTK/DTTK had before their OData wiring.

**Explicitly out of scope:** OData wiring. The human will integrate the service into the HTML
separately ("i will create ODATA separetly int in to html later"), so no service was identified,
created or proxied here, and no RAP/CDS object was touched. Also out of scope: any restyling of the
mockup — it was copied in verbatim so the human's v7 layout is the baseline for whatever comes next.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Folder name and port for the new console | `web/inv-console/`, port 8769 (next free after 8768) | 2026-09-08 |
| 2 | Wire OData now or later? | Later, by the human, directly into the HTML | 2026-09-08 |
| 3 | Which OData service will back this screen (BL lines, invoice lines, P&L)? | Open — needed before the `services` block and `/api/*` passthrough can be added | — |

## Naming gate

No ABAP object created, so no `docs/naming-conventions.md` gate applies. Local filesystem naming
follows the established `web/<slug>-console/` convention:

```
NAMING: web/inv-console -> matches existing web/<slug>-console pattern (ottk-dttk-, dttk-, deal-id-, tf-upload-)
```

## Todo

- [x] 1. Confirm the pattern to copy (`proxy.py` + `sap_config.json` + `index.html`) and the next free port.
- [x] 2. Create `web/inv-console/` and copy the mockup in as `index.html`, verbatim.
- [x] 3. Write `sap_config.json` — DS4_100_NIIF / FS_DEV3 / port 8769 / empty `services` block.
- [x] 4. Write `proxy.py` — static serving + `/api/whoami`, no OData passthrough yet (see L-294).
- [x] 5. Verify: `py_compile` clean, `GET /` → 200, `/api/whoami` → correct identity.
- [x] 6. Verify in a real browser (Playwright): page renders, mock deal loads, zero console errors.
- [ ] 7. **Human:** wire the OData service into `index.html`, then add the `services` block to
      `sap_config.json` and restore the `/api/<key>/*` passthrough from `tf-upload-console/proxy.py`.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/inv-console/index.html` | local file (copied mockup, 4247 lines) | — | — | Created |
| `web/inv-console/proxy.py` | local file (static server, no OData) | — | — | Created |
| `web/inv-console/sap_config.json` | local file (port 8769, no services) | — | — | Created |

## Delivery checks

Nothing was built on SAP, so the ABAP checks below are not applicable to this activity:

- [ ] ~~Pretty Printer~~ — n/a, no ABAP
- [ ] ~~Syntax check clean~~ — n/a, no ABAP; `python -m py_compile web/inv-console/proxy.py` clean instead
- [ ] ~~Activated, nothing left inactive~~ — n/a, no ABAP
- [ ] ~~ATC / Code Inspector~~ — n/a, no ABAP
- [ ] ~~ABAP Unit~~ — n/a, no ABAP
- [ ] ~~Text symbols and selection texts~~ — n/a, no ABAP; all page text is in the mockup HTML
- [ ] ~~Object list confirmed in the transport~~ — n/a, no transport
- [x] Browser-verified: `http://localhost:8769/` renders the full screen (toolbar, Basic Selection,
      OTTK/DTTK Pricing Details, Adjusted Price/Qty grid), mock deal `10000010` auto-loads
      ("Deal 10000010 loaded" in the status bar), 0 console errors/warnings.
- [x] `curl /api/whoami` → `{"systemId":"DS4_100_NIIF","user":"FS_DEV3"}`.
- [x] Port 8769 confirmed clear of the four existing consoles.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-294.
