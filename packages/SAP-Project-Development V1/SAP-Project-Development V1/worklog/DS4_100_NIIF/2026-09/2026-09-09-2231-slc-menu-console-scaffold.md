# SLC Menu console — the SLC hub: calls the other consoles, Mid Office tree, shared logo

- **Date:** 2026-09-09
- **System:** DS4_100_NIIF
- **Package:** n/a — no ABAP object created or changed by this activity
- **Transport:** n/a
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Stood up `web/slc-menu-console/` as a seventh local console alongside `ottk-dttk-console` (8765),
`dttk-console` (8766), `deal-id-console` (8767), `tf-upload-console` (8768), `inv-console` (8769)
and `tf-manage-console` (8770), seeded from the human-supplied mockup
`C:\Users\karth\Downloads\SLC Menu.html` (`<title>TF Hub -- Fourth Signal</title>`, 325 lines),
copied in **verbatim** as `index.html`.

The page is a launch menu, not a data screen: a `GROUPS` array drives six group headers
(Sanction Creation, LC Process, BG Process, Accounting, Dashboard Reporting, Reporting) rendering
either program tiles directly or folder tiles that drill into one sub-process and back. Each program
tile fires a **fixed** `sapevent:<ACTION>` string — no tcode is ever passed from the browser; ABAP's
`on_sapevent` is expected to map action → tcode in a `CASE`. Same scaffold as every sibling:
`proxy.py` + `sap_config.json` next to the HTML, own port, password never in the repo.

**Explicitly out of scope:** (a) the ABAP side — no program, no HTML viewer container, no
`on_sapevent` handler was created or asked for; the 30 `OPEN_*` actions and the tcodes/report names
they reference (`ZFS_TL_DEM57`…`ZFS_TL_DEM86`, `ZFSTFR001/002/005/006`) are the mockup's own
assumptions, not verified against DS4. (b) OData wiring — a menu has no data of its own and calls
none of the four services. (c) Restyling to the OTTK design system (L-298) — the mockup was copied
verbatim so the human's layout is the baseline.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Folder name and port for the new console | `web/slc-menu-console/`, port 8771 (next free after 8770) | 2026-09-09 |
| 2 | The file is named `SLC Menu.html` but its title, header and every tile are Trade Finance (LC/BG/facility) — is the console name `slc-menu-console` intended, or should the page content be re-scoped to SLC? | **Re-scope to SLC.** All "Trade Finance" wording replaced with "SLC" (doc title, header brand, home title, Back button) | 2026-09-09 |
| 3 | Align the page to the OTTK design system per L-298, or keep the mockup's own blue palette / Inter / 300px tile grid? | Open — left verbatim, no overlay written | — |
| 4 | Should the tiles launch the sibling local consoles in the browser, or fire `sapevent:` into an ABAP HTML viewer? | **Neither/URL.** "Plan is to not to use the sap event ideally this will main html application which will call other applications from here" — `sapevent:` removed outright, tiles navigate by URL. See L-300 | 2026-09-09 |
| 5 | Do the 30 `OPEN_*` actions and their tcodes exist on DS4? | Moot for navigation (no longer used to launch anything); the names stay in `GROUPS` as a record of intent | 2026-09-09 |
| 6 | Under Front Office, should `Facility Workbench` / `Facility Confirmation` stay, or did the 3 console tiles replace them? | **Removed** — "remove facility workbench and facility confirmation boxes". Front Office is the 3 console tiles only | 2026-09-09 |
| 7 | Same-tab navigation, or open each console in a new tab so the hub stays put? | Open — same tab (`window.location.href`), matching "navigate directly from the main html"; browser Back returns to the hub | — |

## Naming gate

No ABAP object created, so no `docs/naming-conventions.md` gate applies. Local filesystem naming
follows the established `web/<slug>-console/` convention, lower-cased to match the family:

```
NAMING: web/slc-menu-console -> matches existing web/<slug>-console pattern (ottk-dttk-, dttk-, deal-id-, tf-upload-, inv-, tf-manage-)
```

## Todo

- [x] 1. Confirm the pattern to copy (`proxy.py` + `sap_config.json` + `index.html`) and the next free port.
- [x] 2. Create `web/slc-menu-console/` and copy the mockup in as `index.html`, verbatim.
- [x] 3. Write `sap_config.json` — DS4_100_NIIF / FS_DEV3 / port 8771 / the standard identical `services` block.
- [x] 4. Write `proxy.py` from `tf-manage-console/proxy.py` — new docstring, port 8771; `services` kept
      full so the L-294 import-time `CONFIG["services"]` dereference cannot bite.
- [x] 5. Verify: `json.load` clean, `py_compile` clean, `GET /` → 200, `/api/whoami` → correct identity.
- [x] 6. Verify in a real browser (Playwright): all six groups render, folder drill-down and Back work,
      program tiles fire `sapevent:`.
- [x] 7. **Revision 2** — SLC wording, Front Office group with 3 linked console tiles, `sapevent:` removed
      in favour of URL navigation (see the revision-2 section below).
- [ ] 8. **Human:** decide open questions 3, 6 and 7 (design-system overlay; keep the facility tiles?;
      same-tab vs new-tab).
- [x] 9. **Revision 3** — facility tiles removed; `Trade Flows` group added above Front Office with
      the two TF consoles wired (see the revision-3 section below).
- [x] 10. **Revision 4** — the hub's Fourth Signal logo rolled out to all six sibling consoles;
      `LC Process` became `Mid Office` with the 11 folders from `Downloads/Mid Office.png`, which
      needed the renderer generalised to folders-inside-folders (see the revision-4 section).
- [x] 11. **Revision 5** — `Deal ID Creation` moved from Front Office into
      Mid Office → Manage Deal ID & Trade Ticket.
- [x] 12. **Revision 6** — `inv-console` (8769) wired into Mid Office → Manage Trade Invoices.
      All six sibling consoles are now reachable from the hub.
- [ ] 13. **Human:** 27 of the 33 program tiles still have no application behind them — each says
      "<title> is not wired up yet." until a `url` is added to its entry in `GROUPS`. The six that
      are wired are the six sibling consoles; everything else is an ABAP screen that does not exist
      yet.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/slc-menu-console/index.html` | local file (mockup, re-scoped to SLC — revisions 2–4) | — | — | Created, then changed |
| `web/slc-menu-console/proxy.py` | local file (static server + 4-service OData passthrough, unused) | — | — | Created |
| `web/slc-menu-console/sap_config.json` | local file (port 8771) | — | — | Created |
| `web/ottk-dttk-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |
| `web/dttk-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |
| `web/deal-id-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |
| `web/tf-upload-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |
| `web/tf-manage-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |
| `web/inv-console/index.html` | local file — topbar logo only (revision 4) | — | — | Changed |

## Delivery checks

Nothing was built on SAP, so the ABAP checks below are not applicable to this activity:

- [ ] ~~Pretty Printer~~ — n/a, no ABAP
- [ ] ~~Syntax check clean~~ — n/a, no ABAP; `python -m py_compile web/slc-menu-console/proxy.py` clean instead
- [ ] ~~Activated, nothing left inactive~~ — n/a, no ABAP
- [ ] ~~ATC / Code Inspector~~ — n/a, no ABAP
- [ ] ~~ABAP Unit~~ — n/a, no ABAP
- [ ] ~~Text symbols and selection texts~~ — n/a, no ABAP; all page text is in the mockup HTML
- [ ] ~~Object list confirmed in the transport~~ — n/a, no transport
- [x] `python -c "json.load(...)"` on `sap_config.json` clean — port 8771, all four service keys present.
- [x] `python -m py_compile web/slc-menu-console/proxy.py` clean.
- [x] `GET http://localhost:8771/` → 200, `<title>TF Hub -- Fourth Signal</title>`.
- [x] `GET /api/whoami` → `{"systemId":"DS4_100_NIIF","client":"100","user":"FS_DEV3"}`.
- [x] Browser-verified (Playwright, Chromium): home page renders all six group headers, 5 program
      tiles + 7 folder tiles with correct screen counts (4/4/2/2 LC, 4/2/2 BG); the external Inter
      font and the GitHub-hosted FS logo both load; clicking `LC Issuance Process` and
      `LC Termination Process` renders the sub-process detail view with its Back button; Back
      returns home.
- [x] Program tiles confirmed firing `sapevent:` — clicks on the Sanction Creation tiles produced
      `Failed to launch 'sapevent:OPEN_FAC_WORKBENCH'` / `'sapevent:OPEN_FAC_CONFIRM'` in the
      Chromium console. **These are the only two console errors and they are expected outside SAP
      GUI** — see L-299: `isSapGui()` tests `window.external`, which Chromium also defines, so the
      page takes the `sapevent:` branch in a browser instead of its `console.log` fallback.
- [x] Port 8771 confirmed clear of the six existing consoles (`netstat` showed nothing on 8770-8779).

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-299.


---

## Revision 2 — SLC wording, Front Office console tiles, no `sapevent:` (2026-09-09)

Same activity, same day, second pass on `index.html` after the human set the architecture:

> "slc-menu-console html. Plan is to not to use the sap event ideally this will main html
> application which will call other applications from here
> 1. instead of Trade Finance wording change to SLC
> 2. instead of sanction creation change Front Office same like Facility workbench create 3 boxes
> for OTTK , DTTK , Deal ID consoles linked to the boxes so it will navigate directly from the
> main html"

### What changed

**1 · SLC wording** — four sites, no "Trade Finance" left in the file (`grep` → 0):

| Site | Before | After |
|---|---|---|
| `<title>` | `TF Hub -- Fourth Signal` | `SLC Hub -- Fourth Signal` |
| header brand `<h1>` | `Trade Finance` | `SLC` |
| `renderHome()` `.hub-title` | `Trade Finance ` (trailing space) | `SLC` |
| `.back-btn` in `renderSubgroupDetail()` | `← Back to Trade Finance Menu Path` | `← Back to SLC Menu Path` |

**2 · Front Office** — group 1 renamed from `Sanction Creation`, and three tiles added **ahead of**
the facility pair, modelled on the Facility Workbench tile (same `.tile` markup, new `tag:"Console"`,
distinct Material icons: grid / list / label):

| Tile | `url` | Target console | Port |
|---|---|---|---|
| Origination Ticket (OTTK) | `http://localhost:8765/` | `ottk-dttk-console` | 8765 |
| Distribution Ticket (DTTK) | `http://localhost:8766/` | `dttk-console` | 8766 |
| Deal ID Creation | `http://localhost:8767/` | `deal-id-console` | 8767 |

Ports read out of each console's own `sap_config.json`, and each target confirmed by its `<title>`
(`Origination Ticket (OTTK)`, `Distribution Ticket (DTTK)`, `Deal ID Creation`) — not assumed from
the folder names. `Facility Workbench` and `Facility Confirmation` were **kept** (open question 6).

**3 · `sapevent:` removed** (L-300). Deleted `isSapGui()` and `fireSapevent()` outright; `launch()`
now takes an index into a new flat `TILES` registry instead of an action string, and either
navigates to `it.url` or toasts "`<title>` is not wired up yet." The registry exists because a tile's
`url` and `title` should not have to survive a trip through an HTML `onclick` attribute — it is
cleared by `renderAll()` before every re-render, so indices are always current for the view on
screen. `proxy.py`'s docstring and `sap_config.json`'s `_comment` were updated to match.

### Verification (revision 2)

All by Playwright/Chromium against the running proxy, plus the three target proxies started for the
navigation tests:

- [x] `python -m py_compile web/slc-menu-console/proxy.py` clean; `json.load` on `sap_config.json` clean.
- [x] `GET /` → 200, `<title>SLC Hub -- Fourth Signal</title>`; header brand and home title both read `SLC`.
- [x] Group order: `Front Office, LC Process, BG Process, Accounting, Dashboard Reporting, Reporting`.
- [x] Front Office renders 5 tiles in order — OTTK `Console`, DTTK `Console`, Deal ID `Console`,
      Facility Workbench `Create`, Facility Confirmation `Confirm` — with `onclick="launch(0..4)"`.
- [x] **Real click on each console tile navigates**: OTTK → `http://localhost:8765/`
      "Origination Ticket (OTTK)"; DTTK → `8766/` "Distribution Ticket (DTTK)"; Deal ID → `8767/`
      "Deal ID Creation". Landed pages confirmed by URL **and** `<title>`.
- [x] An un-wired tile does **not** navigate: clicking Facility Workbench leaves the URL at `8771/`
      and toasts `Facility Workbench is not wired up yet.`
- [x] `typeof window.fireSapevent` / `typeof window.isSapGui` → `undefined/undefined`; the only
      remaining occurrences of "sapevent" in the file are three comment references.
- [x] **Zero console errors/warnings** on load and through the click sequence — L-299's expected
      `Failed to launch 'sapevent:…'` errors are gone with the mechanism, so this page is back on the
      normal zero-error bar.
- [x] Folder drill-down survives the registry change: `openSubgroup(1,0)` renders
      `LC Issuance Process` with 4 tiles re-indexed `launch(0..3)`, `TILES` rebuilt to just those 4,
      and clicking the first resolves to **its own** item (`LC Request Creation is not wired up yet.`)
      — no stale-index bleed from the home view. `goHome()` rebuilds the home registry (12 program
      tiles; the 7 folder tiles call `openSubgroup` and are correctly not registered).
- [x] No navigation path other than a click: dispatching `mouseover/mousemove/mouseenter/mousedown/`
      `mouseup/focus/keydown/keypress` and an `Enter` `keydown` on a console tile leaves the URL
      unchanged; `onclick` is the tile's only handler and the page has 0 `<a>` elements.

### Known limitation

A console tile only lands while that console's own `proxy.py` is running. With it stopped the
browser shows a refused connection — the console being down, not a fault in this page. The hub has
no way to detect it in advance: a liveness probe to `http://localhost:8765/api/whoami` is
cross-origin and would need CORS on every sibling proxy, which was not in scope.

### Lessons raised (revision 2)

L-300.


---

## Revision 3 — facility tiles out, `Trade Flows` group in (2026-09-09)

Third pass on `index.html`, same activity:

> "1.remove facility workbench and facility confirmation boxes
> 2. Above Front Office create 1 more session same like Front office as Trade flows inside create
> Trade Flow Upload and Manage Trade Flows from the console"

### What changed

**1 · Facility tiles removed.** `Facility Workbench` (`OPEN_FAC_WORKBENCH` / `ZFS_TL_DEM70`) and
`Facility Confirmation` (`OPEN_FAC_CONFIRM` / `ZFS_TL_DEM71`) deleted from the Front Office group,
which is now the three console tiles only. Deal ID Creation became the last entry, so its trailing
comma went with them. `Facility Register` under **Reporting** was deliberately left alone — it was
not in scope and is a different tile.

**2 · `Trade Flows` group**, inserted as the **first** entry in `GROUPS` so it renders above Front
Office, same plain-header + tile-grid shape as every other group:

| Tile | `url` | Target console | Port |
|---|---|---|---|
| Trade Flow Upload | `http://localhost:8768/` | `tf-upload-console` | 8768 |
| Manage Trade Flows | `http://localhost:8770/` | `tf-manage-console` | 8770 |

Ports read out of each console's `sap_config.json` and each target confirmed by its `<title>`
(`Trade Flow Excel Upload`, `TF: Manage Trade Flows`). Tile titles follow the human's wording rather
than the target pages' own titles. Icons: `file_upload` and `tune`, both unused elsewhere on the page.

### Verification (revision 3)

- [x] Group order is `Trade Flows, Front Office, LC Process, BG Process, Accounting,
      Dashboard Reporting, Reporting` — Trade Flows first, Front Office second.
- [x] Trade Flows renders 2 `Console` tiles; Front Office renders exactly 3 `Console` tiles
      (OTTK, DTTK, Deal ID). `Facility Workbench` / `Facility Confirmation` appear nowhere in the
      rendered page or in the file (`grep` → 0 each).
- [x] **Real click on each new tile navigates**: Trade Flow Upload → `http://localhost:8768/`
      "Trade Flow Excel Upload"; Manage Trade Flows → `http://localhost:8770/`
      "TF: Manage Trade Flows". Landed pages confirmed by URL **and** `<title>`.
- [x] **Re-checked the whole registry after the index shift** — inserting a group ahead of Front
      Office moved OTTK/DTTK/Deal ID from `launch(0..2)` to `launch(2..4)`, exactly the class of bug
      L-300 warns about. Asserted every one of the 12 home program tiles: its rendered
      `launch(<i>)` index resolves back to the tile whose title is displayed, all 12 matching, with
      the 5 wired tiles carrying the right port each. 7 folder tiles correctly not registered.
- [x] Zero console errors/warnings on load and through the click sequence.
- [x] Counts: 32 program tiles in total, 5 wired, 27 un-wired.

### Lessons raised (revision 3)

None — this was requested content, not a correction or a new platform behaviour. L-300's tile count
was corrected in place (it said "27 of the 30"; the true figure was 29 of 32 when written, and is
27 of 32 now).


---

## Revision 4 — shared Fourth Signal logo, and `LC Process` → `Mid Office` (2026-09-09)

> "1. whatever the logo is there in the SLC menu path html, do that same logo for the other consoles
> 2. Instead of LC process change to Mid Office, under the downloads there is a png file for the
> mid office folders"

### 1 · The hub's logo, in all six sibling consoles

The hub's mark is an `<img>` on the asset
`https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a8…/fs-short-logo.png`. Each console
had a blue gradient square instead — `<div class="mark">` (ottk-dttk, dttk, deal-id) or
`<div class="ds-mark">` (tf-upload, tf-manage, inv, the three restyled under L-298) wrapping an
inline document `<svg>`. In each file the div was replaced by an `<img>` on the **same URL**, plus
one appended `<style>` before `</head>`:

```css
img.mark, img.ds-mark {
  width: 32px; height: 32px; flex: none;
  background: none; box-shadow: none; border-radius: 0;
  object-fit: contain;
}
```

`img.mark` outranks the bare `.mark` rule that paints the gradient, so the gradient, shadow and
radius are switched **off here** rather than deleted from the rule they came from — the original
`.mark` block is left intact for anything else that uses it. **inv-console needed no `!important`**
this time, unlike the general expectation L-298 sets for that file (see L-301). All seven pages now
reference exactly one copy of the same asset.

### 2 · `Mid Office`, from `Downloads/Mid Office.png`

The PNG is an SAP menu tree rooted at **Mid-Office / Execution** with 11 folders. Group 3 was
renamed from `LC Process` and its subgroups replaced by those 11, in the PNG's own order:

| # | Folder | Contents |
|---|---|---|
| 1 | Manage Deal ID & Trade Ticket | *empty* |
| 2 | Manage Trade Invoices | *empty* |
| 3 | Manage ICLs | *empty* |
| 4 | Manage Deposits | *empty* |
| 5 | **Manage LCs** | the 4 existing LC sub-processes, moved here intact |
| 6 | Manage Discounting Loans | *empty* |
| 7 | Manage IRS | *empty* |
| 8 | Manage Prepayments | *empty* |
| 9 | Manage SBLCs | *empty* |
| 10 | Special Cases | *empty* |
| 11 | Manage Limits | *empty* |

**The 12 LC program tiles were not thrown away.** `LC Issuance Process`,
`LC Acceptance & Presentation`, `LC Amendment Process` and `LC Termination Process` were re-nested
under `Manage LCs` verbatim — lifted as text and re-indented, not retyped. That puts a folder inside
a folder, which the old renderer could not express (it was hardwired group → subgroup → items), so
navigation became path-based: see **L-302**. `BG Process` was left as its own group — the PNG's
`Manage SBLCs` is the plausible home for it, but that was not asked for.

Empty folders are honest rather than dead ends: the tile reads "Not set up yet." and clicking it
toasts "*&lt;label&gt;* has nothing in it yet." instead of opening an empty screen — the same
treatment un-wired program tiles already get.

### Verification (revision 4)

**Logo** — visited each console and read the **computed** style and the **loaded pixels** back out
of the running page, per L-298's "reading the diff proves nothing":

| Console | Port | `<img>` loaded | Box | Gradient/shadow gone | Old mark div left |
|---|---|---|---|---|---|
| ottk-dttk | 8765 | yes (216×342 natural) | 32×32 | yes | 0 |
| dttk | 8766 | yes | 32×32 | yes | 0 |
| deal-id | 8767 | yes | 32×32 | yes | 0 |
| tf-upload | 8768 | yes | 32×32 | yes | 0 |
| inv | 8769 | yes | 32×32 | yes | 0 |
| tf-manage | 8770 | yes | 32×32 | yes | 0 |

- [x] `object-fit: contain` on all six; `curl` confirms each console serves exactly 1 reference to
      `fs-short-logo.png`, and so does the hub — 7 pages, 1 asset.
- [x] Topbar screenshotted on tf-manage-console: the FS mark sits where the blue square was, at the
      same height, with the title and Refresh button unmoved.

**Mid Office** — all by real clicks on the hub, not by driving `VIEW` directly:

- [x] Group order `Trade Flows, Front Office, Mid Office, BG Process, Accounting,
      Dashboard Reporting, Reporting`; `"LC Process"` appears nowhere in the file.
- [x] Mid Office renders all 11 folders in PNG order; `Manage LCs` reads "4 folders in this area."
      and the other 10 read "Not set up yet."
- [x] Clicking the empty `Manage Deposits` stays on home and toasts
      "Manage Deposits has nothing in it yet." — no dead-end screen.
- [x] Two-level drill by clicks: `Manage LCs` → heading "Manage LCs", crumb "Mid Office.",
      back "← Back to SLC Menu Path", 4 folder tiles → `LC Issuance Process` → heading
      "LC Issuance Process", crumb "Mid Office › Manage LCs.", back "← Back to Manage LCs",
      the original 4 program tiles with their original descriptions.
- [x] Back goes **up one level, not home**: first back → "Manage LCs"; second back → home ("SLC",
      no back button, 26 tiles).
- [x] An un-wired program tile two folders deep resolves to itself:
      "LC Bank Allocation is not wired up yet.", URL unchanged.
- [x] The console tiles still navigate after the renderer rewrite — real click on
      `Origination Ticket (OTTK)` → `http://localhost:8765/`.
- [x] Zero console errors/warnings on the hub.

### Observed, unrelated to this change

The SAP host `vhnlqds4ap01.sap.niififl.in:44300` is **not reachable from this machine right now**:
ottk-dttk-console's own OData calls return 502, and its `proxy.py` log shows
`Request timed out: TimeoutError('timed out')`. The proxy is a plain local Python process, so this is
not the L-245 sandbox no-op — it is the network or the VPN (L-295's second case). Nothing in
revision 4 touches OData; the consoles' data wiring was already in this state when the logo went in.

### Lessons raised (revision 4)

L-301 (logo swap across the family, and verifying an external asset actually loaded), L-302
(path-based nesting for folders inside folders).


---

## Revision 5 — Deal ID Creation moved into Mid Office (2026-09-09)

> "Move deal id creation inside Manage Deal ID & Trade Ticket"

### What changed

The `Deal ID Creation` tile (→ `deal-id-console`, port 8767) moved out of **Front Office** and into
**Mid Office → Manage Deal ID & Trade Ticket**, entry and wiring unchanged — same `url`, `desc`,
`tag` and icon, lifted as text rather than retyped.

Two knock-on details:

- **Front Office is now OTTK + DTTK.** Deal ID was the last entry in that group, so the comma
  preceding it went with it and `Distribution Ticket (DTTK)` became the final item.
- **The folder changed kind.** `Manage Deal ID & Trade Ticket` was an empty container
  (`subgroups: []`); holding a program it now carries `items: [...]`. That is what
  `childrenOf()` and `renderFolderTile()` read to decide how to describe and render it, so the tile
  flipped from "Not set up yet." to "1 screen in this sub-process." and the folder opens a program
  view rather than a folder view — no renderer change needed, the L-302 model already covered it.

`Origination Ticket (OTTK)` and `Distribution Ticket (DTTK)` were **left in Front Office**. The
folder's name mentions "Trade Ticket", so they may belong here too, but only Deal ID was asked for.

### Verification (revision 5)

- [x] Front Office renders exactly 2 tiles: OTTK and DTTK, descriptions unchanged.
- [x] `Manage Deal ID & Trade Ticket` reads "1 screen in this sub-process." (was "Not set up yet.");
      `Manage Trade Invoices` beside it still reads "Not set up yet.", so only the one folder changed.
- [x] Opening the folder gives heading "Manage Deal ID & Trade Ticket", crumb "Mid Office.",
      back "← Back to SLC Menu Path", and one tile — `Deal ID Creation`, whose rendered
      `launch(<i>)` resolves back to itself carrying `http://localhost:8767/`.
- [x] **Real click through the new path lands**: home → `Manage Deal ID & Trade Ticket` →
      `Deal ID Creation` → `http://localhost:8767/`, page title "Deal ID Creation".
- [x] Exactly one reference each to `deal-id-console` and `localhost:8767` left in the file — the
      tile moved, it was not copied.
- [x] Zero console errors/warnings on the hub.

### Lessons raised (revision 5)

None — a tile move within the L-302 model, no correction and no new platform behaviour.


---

## Revision 6 — inv-console wired into Manage Trade Invoices (2026-09-09)

> "create inv console in to Manage Trade Invoices"

### What changed

`Manage Trade Invoices` under Mid Office was an empty container; it now holds one console tile:

| Tile | `url` | Target console | Port |
|---|---|---|---|
| Amend BLs & Finalise Invoices | `http://localhost:8769/` | `inv-console` | 8769 |

Named for what the screen does rather than echoing the folder above it — the console's own title is
"Amend Selected BLs and Finalise Trade Invoices", confirmed by `<title>` on 8769 rather than assumed
from the folder name. `tag:"Console"` like every other cross-console tile, and a receipt icon not
used elsewhere on the page. Same structural change as revision 5: `subgroups: []` → `items: [...]`,
which flips the folder's tile from "Not set up yet." to "1 screen in this sub-process." and makes it
open a program view — no renderer change, the L-302 model already covers it.

**Every one of the six sibling consoles is now reachable from the hub:**

| Path on the hub | Console | Port |
|---|---|---|
| Trade Flows › Trade Flow Upload | `tf-upload-console` | 8768 |
| Trade Flows › Manage Trade Flows | `tf-manage-console` | 8770 |
| Front Office › Origination Ticket (OTTK) | `ottk-dttk-console` | 8765 |
| Front Office › Distribution Ticket (DTTK) | `dttk-console` | 8766 |
| Mid Office › Manage Deal ID & Trade Ticket › Deal ID Creation | `deal-id-console` | 8767 |
| Mid Office › Manage Trade Invoices › Amend BLs & Finalise Invoices | `inv-console` | 8769 |

### Verification (revision 6)

- [x] **Real click through the new path lands**: home → `Manage Trade Invoices` →
      `Amend BLs & Finalise Invoices` → `http://localhost:8769/`, page title
      "Amend Selected BLs and Finalise Trade Invoices".
- [x] Mid Office folder descriptions now read: Manage Deal ID & Trade Ticket "1 screen",
      Manage Trade Invoices "1 screen", Manage LCs "4 folders in this area", the other eight
      "Not set up yet." — only the one folder changed.
- [x] Walked `GROUPS` at every depth and listed each tile carrying a `url`: exactly the six above,
      one per console, each at the right place in the tree. `localhost:8765`…`8770` appear exactly
      once each in the file — no duplicated or stale wiring.
- [x] Zero console errors/warnings on the hub.

### Lessons raised (revision 6)

None — a second application of the revision-5 pattern, no correction and no new platform behaviour.
