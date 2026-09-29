# Align tf-upload, tf-manage and inv consoles to the OTTK console's design system

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** — (local web consoles only, no ABAP object touched)
- **Transport:** — (no transport)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Take `web/ottk-dttk-console/index.html` as the reference and bring
`web/tf-upload-console/`, `web/tf-manage-console/` and `web/inv-console/` onto the same fonts, text
scale, colour tokens and chrome, so the six consoles under `web/` read as one product rather than
three separately-grown mockups. Human chose **full chrome match**: OTTK topbar (gradient mark,
title + code, actions, connection dot), OTTK panels, tables, buttons, pills and toasts — delivered
as one appended `<style id="ottk-design-system">` block per console plus small header markup
additions. No behaviour, no ids, no handlers, no list-rendering code changed.

**Out of scope:** re-laying-out any page into OTTK's panel grid (that was the third option and was
not chosen); `web/deal-id-console/` and `web/dttk-console/`, which were not named; and
`web/dttk-console/workbench-v43.html`, which is not served.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | How far should the alignment go — tokens/typography only, full chrome match, or full match plus a layout restructure? | **Full chrome match** — tokens, font, topbar, panels, tables, buttons; CSS overlay plus small header markup additions, no restructure | 2026-09-08 |

## Naming gate

No SAP object created. New CSS/DOM names only, all prefixed `ds-` so they cannot collide with a
console's own classes:

```
NAMING: <style id="ottk-design-system"> -> local style block id, no SAP naming gate
NAMING: .ds-mark / .ds-code / .ds-conn  -> shared topbar classes, no SAP naming gate
NAMING: .ds-panel / .ds-head-wrap / .ds-header-left / .ds-header-right -> layout helpers
NAMING: --ds-* (inv-console only)       -> CSS custom properties, no SAP naming gate
```

## The OTTK reference, extracted

Read off `web/ottk-dttk-console/index.html:8` and the modal layers below it:

| Token | Value |
|---|---|
| Font | `"72","Segoe UI",Arial,sans-serif` — "72" is SAP's UI font |
| Base size | 13px |
| Page / surface / surface-2 | `#f5f7f9` / `#ffffff` / `#f2f4f5` |
| Border / border-strong | `#d5dadd` / `#8996a1` |
| Text / sub / muted | `#1d2d3e` / `#475e75` / `#687b8d` |
| Blue / hover / soft | `#0a6ed1` / `#085caf` / `#eaf3fc` |
| Green (+ pill bg) | `#107e3e` (`#e4f5e9`) |
| Shadow / radius / header | `0 1px 3px rgba(34,53,72,.13)` / `8px` / `52px` |
| Topbar | 30px gradient mark `145deg,#0a6ed1,#35a5dc`, 17px/700 title, 12px muted code, 8px green dot with `0 0 0 3px #d9f3e2` |
| Button | 32px, `1px solid #8996a1`, radius 4, 13px/600, primary = solid blue |
| Panel | white, radius 8, shadow; head 39px bold 13px; foot 33px 11px muted |
| Table | `th` 11px/700 on `#f2f4f5` in `#475e75`; `td` 12px; row hover `#f7fbff` |
| Pill | radius 12, 11px/600 |
| Toast | `#243b53` slab, radius 6 |

## Todo

- [x] 1. Read the OTTK console's CSS and write down the tokens above.
- [x] 2. Screenshot all three consoles before touching them.
- [x] 3. Confirm the depth of the alignment with the human (full chrome match).
- [x] 4. tf-upload — overlay + topbar markup; verify.
- [x] 5. tf-manage — overlay + topbar markup + list panel wrapper; verify.
- [x] 6. inv — overlay + topbar markup; verify.
- [x] 7. Confirm zero console errors on all three.

## What changed, per console

### `web/tf-upload-console/index.html`
- Overlay remaps this console's **own** token names (`--page`, `--line`, `--text-secondary`, …) to
  OTTK's hex values, so its existing rules pick the palette up without being rewritten one by one.
- Font `Inter` → `"72","Segoe UI"`; base 12px → 13px.
- Header markup: added `.ds-mark`, the `TF UPLOAD` code and the connection dot; **moved** the
  existing `#downloadTemplateBtn` out of the in-page heading into the topbar as a `.btn` (a global
  action, and it left the screen heading with nothing to compete with). Its id and handler are
  untouched — the listener binds by id.
- Screen heading dropped 20px → 14px/700; the topbar now carries the app name.
- `.card` → OTTK panel; `.card-head` 39px; table, pager, status pills, toast and drop zone all
  restyled to the table above.
- One forced override: the `trade-flow-v4-polish` layer paints `.template-link` blue with
  `!important`, so the button colour is set back with `!important` now that it is a topbar `.btn`.

### `web/tf-manage-console/index.html`
- Its palette was **already** OTTK's hex values under different token names (`--lineStrong`,
  `--labelInk`, …), so the colour work was small; the real gaps were font, type scale and chrome.
- Font `Inter` → `"72","Segoe UI"`; base 12px → 13px; header 44px → 52px with mark, `TF` code and
  connection dot; title 16/600 → 17/700.
- Markup: wrapped the list title + both toolstrips + the table in a `<section class="ds-panel">`
  so the list gets OTTK's card shell. Nothing inside the wrapper moved.
- Key Date and the filter row are boxed OTTK toolbar inputs now — scoped to `.ds-panel .toolstrip`
  only, because the workspace modal's underline fields **already** match OTTK's modal field style
  and had to stay that way.
- `data-table` header 12px dark → OTTK's 11px/700 `#475e75` on `#f2f4f5`; row hover → `#f7fbff`.

### `web/inv-console/index.html`
- The hard one: no CSS custom properties at all (all colours hardcoded), Arial/Inter set in a dozen
  separate rules, and five stacked `<style>` layers (`fti-v4`…`fti-v7`) written almost entirely in
  `!important`. The overlay therefore declares its own `--ds-*` tokens and answers in `!important`
  — that is cascade arithmetic against those layers, not emphasis.
- Font unified with one `body,body *{font-family:…!important}`; header 40px → OTTK's 52px topbar
  with mark, `INVOICE` code and connection dot (title shortened to fit).
- The eleven-button action bar **stays in the page** — eleven semantic actions do not belong in a
  topbar — but became an OTTK card with 32px OTTK buttons and a solid-blue primary.
- Panels, panel heads (34px), 13px/700 titles, readonly fields, the FTI grid header/cells, the
  modals and the status bar all restyled to the table above.
- **Density deliberately preserved:** the v4–v7 layers shrank this screen's fields to 23px on
  purpose because it is a dense data-entry grid. Colour, type and chrome are aligned; the compact
  field heights are not reset to OTTK's 28px.
- One specificity fix: `.upper-panel .panel-title` in the v5 layer outranks a bare `.panel-title`,
  so both are named in the overlay rather than relying on source order.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/tf-upload-console/index.html` | Local HTML console | — | — | Changed |
| `web/tf-manage-console/index.html` | Local HTML console | — | — | Changed |
| `web/inv-console/index.html` | Local HTML console | — | — | Changed |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP; all three pages load with **zero** console errors
- [x] Activated, nothing left inactive — n/a, no ABAP
- [x] ATC / Code Inspector — n/a, no ABAP
- [x] ABAP Unit green — none applicable, no ABAP object touched
- [x] Text symbols and selection texts maintained — n/a, browser UI, not an ABAP text pool
- [x] Object list confirmed in the transport — n/a, nothing transportable

### Live verification (Playwright)

Computed styles read back off each running console, not inferred from the diff:

| | tf-upload (8768) | tf-manage (8770) | inv (8769) |
|---|---|---|---|
| font-family | `"72","Segoe UI",Arial` | `"72","Segoe UI",Arial` | `"72","Segoe UI",Arial` |
| base size | 13px | 13px | 13px |
| topbar height | 52px | 52px | 52px |
| title | — | — | 17px / 700 |
| `th` background | `rgb(242,244,245)` | `rgb(242,244,245)` | `rgb(242,244,245)` |
| `th` colour | — | `rgb(71,94,117)` | `rgb(71,94,117)` |
| panel radius | — | 8px | 8px |
| panel title | — | — | 13px / 700 (all four) |
| primary button | — | — | `rgb(10,110,209)`, 32px |
| console errors | 0 | 0 | 0 |

Screens inspected with real or injected sample rows: tf-upload's extracted-preview table (headers,
`num` alignment, all three status pills, pager), tf-manage's list with rows + the filter strip and
the full TF Workspace modal (tabs, section boxes, underline fields), inv's four panels, the FTI
grid and the "View List of BL's" modal. Screenshots were taken at each step and deleted afterwards
rather than committed.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-298.
