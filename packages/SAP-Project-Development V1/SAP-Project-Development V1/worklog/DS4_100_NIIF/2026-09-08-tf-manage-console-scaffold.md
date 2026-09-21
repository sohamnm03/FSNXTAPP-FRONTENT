# TF: Manage Trade Flows console — scaffold from the v10 mockup

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** n/a — no ABAP object created or changed by this activity
- **Transport:** n/a
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Stood up `web/tf-manage-console/` as the sixth local console, seeded from the human-supplied mockup
`C:\Users\karth\Downloads\TF_MANAGE_TRADE_FLOWS_v10 (23).html` (title "TF: Manage Trade Flows",
2686 lines, self-contained — no external CSS/JS/image references, no `fetch` calls). The page runs
on its own baked-in data: `DUMMY_TRADEFLOWS` plus hardcoded value-help lists (commodities,
Incoterms, the 01–40 deal-status list) and a `sapMode` flag that currently stays `false`.

Unlike `web/inv-console/` (scaffolded earlier the same day with no backend at all — L-294), this
console **does** get a live `/api/tf/*` passthrough, wired to the same `ZFS_SB_TRDFLOW_O4_API`
that `web/tf-upload-console` uses, on the reasoning that both screens sit on Trade Flows
(`ZSGTSFTR_TRDFLOW` / `ZFS_I_TrdFlow`). The passthrough is ready but unused — the page does not
call it yet.

**Explicitly out of scope:** OData wiring inside the HTML (the human is doing that separately), any
restyling of the mockup (copied in verbatim so v10 (23) is the baseline), and any ABAP change.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Folder name — human typed "TF-manage-conole" | `web/tf-manage-console/` — lowercased to match the five existing `web/<slug>-console/` folders, typo corrected; flagged to the human when reporting | 2026-09-08 |
| 2 | Port | 8770 (next free after 8769) | 2026-09-08 |
| 3 | Pre-wire the TrdFlow service, or static-only like inv-console? | Pre-wired to `ZFS_SB_TRDFLOW_O4_API`; flagged to the human as reversible if they'd rather it stay static | 2026-09-08 |
| 4 | Is `ZFS_SB_TRDFLOW_O4_API` actually the right service for *this* screen (vs. the upload screen)? | Assumed, not verified — same domain, but the entity set this screen needs was not checked against the service | — |

## Naming gate

No ABAP object created, so no `docs/naming-conventions.md` gate applies. Local filesystem naming
follows the established convention:

```
NAMING: web/tf-manage-console -> matches existing web/<slug>-console pattern (ottk-dttk-, dttk-, deal-id-, tf-upload-, inv-)
```

## Todo

- [x] 1. Locate the source file — `%20` in the given path is an encoded space; five `TF_MANAGE_TRADE_FLOWS_v10 (*)` variants exist in Downloads, `(23)` is the one named and the most recent (22:34).
- [x] 2. Confirm the mockup is self-contained: 0 external refs, 0 `fetch`/`XMLHttpRequest` calls.
- [x] 3. Create `web/tf-manage-console/` and copy the mockup in as `index.html`, verbatim.
- [x] 4. Write `sap_config.json` — DS4_100_NIIF / FS_DEV3 / port 8770 / `tf` → `ZFS_SB_TRDFLOW_O4_API`.
- [x] 5. Copy `web/tf-upload-console/proxy.py` verbatim; change only the docstring and the default port.
- [x] 6. Verify the copy: `py_compile` clean, and `diff` against the source proxy shows the default port as the only body difference.
- [x] 7. Verify serving: `GET /` → 200, `/api/whoami` → `{"systemId":"DS4_100_NIIF","client":"100","user":"FS_DEV3"}`.
- [x] 8. Verify in a real browser: page renders; Key Date `04-07-2024` filters `DUMMY_TRADEFLOWS` and renders TF `3000008486`; 0 console errors.
- [ ] 9. **Blocked, not done:** live `/api/tf/*` round-trip — the SAP host is unreachable from this machine right now (see L-295). Re-test when the VPN is back.
- [ ] 10. **Human:** wire the OData calls into `index.html` (flip `sapMode`), and confirm open question 4.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/tf-manage-console/index.html` | local file (copied mockup, 2686 lines) | — | — | Created |
| `web/tf-manage-console/proxy.py` | local file (copy of tf-upload-console proxy, port 8770) | — | — | Created |
| `web/tf-manage-console/sap_config.json` | local file (port 8770, `tf` service wired) | — | — | Created |

## Delivery checks

Nothing was built on SAP, so the ABAP checks are not applicable to this activity:

- [ ] ~~Pretty Printer / Syntax check / Activation / ATC / ABAP Unit / Text symbols / Transport~~ — n/a, no ABAP.
  `python -m py_compile web/tf-manage-console/proxy.py` clean instead.
- [x] Proxy logic verified identical to the already-tested `tf-upload-console` proxy (`diff` → default port only).
- [x] Browser-verified: header, Key Date filter, 45-column trade-flow grid, empty state, and the
      filtered mock row all render; 0 console errors/warnings.
- [x] `curl /api/whoami` → correct non-secret identity.
- [x] Port 8770 confirmed clear of the five existing consoles (8765–8769).
- [ ] **Not verified:** live OData through `/api/tf/*`. Returns 502 `WinError 10060` because the SAP
      host is unreachable from this machine (L-295), not because of a proxy defect.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-295.
