# DYNGW v2 admin console — registry entry screen, linkage report, and the web/ split

- **Date:** 2026-09-15
- **Started:** 18:45  <!-- 24h local, matches the HHmm in this file's name -->
- **System:** DS4_100_NIIF
- **Package:** — (no ABAP object created or changed)
- **Transport:** — (none; this is a `web/`-only build against the already-live v2 service)
- **Requested by:** Karthik

## Scope

Two new pages for the dynamic gateway v2, in a new console of their own:

1. **Registry entry screen + dashboard** — read the allow-list, and create, edit, activate,
   deactivate and delete registry rows through `/Registry`.
2. **Linkage report** — a live schema map of the four gateway tables with their real join keys,
   plus a registry-centric drill-down showing, for one target, its change history, every step it
   authorised, and the calls those steps belonged to.

Plus a restructure requested mid-plan: `web/` split into `web/dynamic-gw/` and `web/individual/`,
with the existing nine consoles migrated into the right one.

**Out of scope, explicitly:** no ABAP object created, changed or activated; no transport; no
registry row created, edited or deleted on the live system (the write path is built and reviewed
but **not proved live** — see Open questions #1); no tile added to the SLC menu console; no ETag
added to the registry BO.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Should the write path (create / edit / deactivate / delete a registry row) be proved live? | **Open.** Doing so writes a real row plus a `ZFS_T_DYN_REGH` audit entry on DS4. Not done unasked — the project rule is that being able to build a thing is not authorisation to run it. Reads are proved live; writes are reviewed against `$metadata` only. | open |
| 2 | Should `web/individual/slc-menu-console` gain a tile for the admin console? | **Open.** Not added — not requested, and the SLC menu is the Front Office hub, not a developer-tools launcher. | open |
| 3 | Should `/Registry` get an ETag so two admins cannot silently overwrite each other? | **Open**, ABAP-side change, not made. See L-529. | open |

## Naming gate

Not applicable — no SAP object created. Folder and file names under `web/` follow the existing
kebab-case console convention (`dyngw-admin-console`, `dynamic-gw`, `individual`).

## Todo

- [x] 1. Stop all nine running proxies — each holds its console folder as its CWD, and Windows refuses to rename a directory in that state.
- [x] 2. `git mv` the nine consoles into `web/dynamic-gw/` and `web/individual/`; confirm git tracked them as renames, not delete+add.
- [x] 3. Fix the `REPO_ROOT = HERE.parents[1]` depth assumption the move broke in all nine proxies (L-528).
- [x] 4. Create `web/dynamic-gw/dyngw-admin-console/` — `proxy.py` and `sap_config.json` (port 8774).
- [x] 5. Build `index.html` — registry dashboard, counter strip, filters, entry modal, write path.
- [x] 6. Build `report.html` — schema map, registry drill-down, coverage panel, JSON viewer.
- [x] 7. Lift the house theme verbatim from `dyngw-v2-console/index.html` into both pages.
- [x] 8. Restart all ten proxies from the new paths; confirm every port answers.
- [x] 9. Verify live against DS4: entity shapes from `$metadata`, real rows through the new proxy.
- [x] 10. Look at both pages rendered; fix what the render showed.
- [x] 11. Update `docs/dyngw-v2-integration-guide.md` paths; add a dated note to the testcase doc.
- [x] 12. Ledger entries L-528, L-529; this worklog.
- [x] 13. Fix the drill-down tables clipping to one row, caught by the human on review (L-530).
- [ ] 14. Human decision on Open questions #1–#3.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP object created or changed |

### Files

| File | What |
|---|---|
| `web/dynamic-gw/dyngw-admin-console/proxy.py` | New — copy of the v2 console's proxy, port 8774, two pages |
| `web/dynamic-gw/dyngw-admin-console/sap_config.json` | New — same five services, port 8774 |
| `web/dynamic-gw/dyngw-admin-console/index.html` | New — registry entry screen + dashboard |
| `web/dynamic-gw/dyngw-admin-console/report.html` | New — linkage report |
| `web/dynamic-gw/dyngw-v2-console/` | Moved from `web/dyngw-v2-console/` |
| `web/individual/*-console/` | Eight consoles moved from `web/*-console/` |
| `*/proxy.py` (9 files) | `REPO_ROOT` depth assumption fixed |
| `docs/dyngw-v2-integration-guide.md` | 5 path references updated |
| `docs/dyngw-v2-console-testcase.md` | Dated note about the move |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP. Both pages load with **zero browser console errors**.
- [x] Activated, nothing left inactive — n/a
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit — n/a
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — n/a, no transport
- [x] All ten ports answer HTTP 200 after the move (8765–8774)

## What was proved live, and what was not

**Proved live against DS4_100_NIIF, through the new proxy on 8774:**

- All four entity shapes read from `$metadata` — `RegistryType`, `RegistryHistoryType`,
  `CallLogType`, `CallStepType`, field by field.
- `GET /Registry` — 8 rows, rendered with every column.
- `$count` on all four sets — Registry 8, CallLog 103, CallStep 113, RegistryHistory 11.
- The drill-down: `ZFS_CDS_SLC_001` → 22 steps → their parent calls, with working JSON viewers.
- The coverage panel's real findings: **1 registry row registered but never used**
  (`ZSGSLCTR_BPEXT`), and **42 steps carrying an all-zero RegUuid** — rows predating the L-482 fix.

**Built but NOT proved live:** every write. `POST`/`PATCH`/`DELETE` on `/Registry`, the kill-switch
toggle, and the audit read-back are implemented and reviewed against `$metadata`, but no write was
made — a write creates a real allow-list row and a real audit entry on DS4, and that was not asked
for. Open question #1.

**Found while building, and worth knowing:** `RegistryType` declares no ETag (L-529), and
`LogLevel` and `Descr` are blank on every one of the 8 live registry rows — the page renders blank
`LogLevel` as a muted "blank" rather than an empty cell, so it reads as data rather than a fault.

## Evidence

`evidence/2026-09-15-1845-dyngw-admin-console-and-web-split/`

| File | What it shows |
|---|---|
| `registry-page.png` | The registry dashboard on live data — counters, all 8 rows, permission chips |
| `report-page.png` | The linkage report as first built, with the schema map clipped |
| `report-drill.png` | The drill-down on `ZFS_CDS_SLC_001` — 22 steps, parent calls, view links |
| `report-fixed.png` | The schema map after the grid fix — all four boxes and all four labelled edges |
| `drill-fixed.png` | First fix attempt — steps table no longer collapsed, but the pane still scrolled its own headers out of view |
| `drill-final.png` | Full page after the pane was allowed to grow — all three sub-panels with their headers |
| `drill-verified.png` | The delivered state: 1 history row, 22 steps, 22 calls, empty messages rendered as a dash |
| `modal-step.png` | The step entity modal — full field set, both outbound links, live ResponseJson |
| `modal-call.png` | Drilled from that step into its parent call — breadcrumb "QURY step › RunQuery", Back active |
| `form-new.png` | The registration form after the chooser rework |
| `form-final.png` | The same form with the corrected per-kind operation default (SELECT for QURY) |
| `docs-top.png` | The documentation page — contents rail, base-URL switcher, the URL section |
| `docs-steps.png` | The result-field reference and the RunQuery card, URLs switched to the direct SAP host |
| `docs-batch.png` | The ExecuteBatch card with the three-level escaping callout |
| `docs-gotchas.png` | The symptom → cause table after the truncation fix |
| `hub.png` | The dynamic-gw hub as first copied, before the heading was corrected |
| `hub-final.png` | The delivered hub — six tiles in three groups, SLC theme intact |
| `slc-hub-split.png` | The SLC hub after the split — no gateway tile, subtitle and path switch added |
| `gw-hub-split.png` | The gateway hub reached via that switch |
| `cmp-individual.png` | The individual OTTK screen (8765) — the reference |
| `cmp-dyngw.png` | The gateway OTTK screen before the fix — five empty columns, bare codes |
| `cmp-dyngw-fixed.png` | After the fix — cell for cell identical to the reference |
| `cmp-copy.png` | Copy OTTK working: "copy of 100050", full row read into the form |
| `cmp-create-modal.png` | Create mode after the hidden fix — no Delete button |
| `parity-final.png` | The gateway OTTK screen with the two scaffolding panels removed — same two-panel layout as the individual |
| `dttk-view.png` | The DTTK modal's first render, before the missing CSS was applied — right data, broken layout |
| `dttk-view-final.png` | The delivered DTTK display modal, all five sections on live data |
| `edit-no-delete.png` | The OTTK edit modal after delete was removed — Clear / Cancel / Save Changes |
| `dttk-individual.png` | The individual DTTK console (8766) — the reference |
| `dttk-gw.png` | The gateway DTTK console's first render — right data, leading zeros and unordered OTTK panel |
| `dttk-gw-final.png` | After the ALPHA and key-order fixes — identical to the reference |
| `dttk-gw-create.png` | Its create form, lookups populated from the twelve registered views |
| `ottk-lookups-final.png` | The OTTK create form during the SAP outage — empty lists, not a regression |

## Review round — drill-down tables clipped (2026-09-15, after first delivery)

The human's review found the three tables in the drill-down showing a single row each against live
data of 1, 22 and 22 rows. Cause: the house `.table-wrap{flex:1;overflow:auto}` reused inside a
flex column, where each panel's default `flex-shrink:1` squeezed it and `overflow:auto` then clipped
the content — a failure that produces a plausible-looking short table rather than a visibly broken
one. The same shape had already clipped the SVG schema map one level up, via a `grid-template-rows:
auto` row. Fixed by giving the panels `flex:none`, capping each table at `max-height:330px` with its
own scrollbar (the house `th` is already sticky), letting the page scroll instead of the pane, and
using `min-content` grid rows. Recorded as **L-530**. A step message of `000` with no text now
renders as a dash rather than a literal "000:".

**Worth noting about the verification that missed it:** the first render was checked on a page where
the drill-down had not been opened, and then on one target — the bug needs a *many-row* case to be
visible at all. A one-row check cannot distinguish this layout bug from correct behaviour.

## Second review round — three changes requested (2026-09-15)

1. **Guided entry.** The registration form is now choosers rather than free text wherever the value
   is knowable. `Operation` is a `<select>` whose options follow the chosen kind (so INSERT can
   never be offered on a QURY row), defaulting to what the live rows actually carry — `SELECT` for
   QURY, blank for TABL/FUNC, matching all 8 rows on DS4. `Max rows` is a picker (0 / 100 / 500 /
   1000 / 5000 / Custom…) with `0` labelled "no override". `Target name` gets a suggestion list
   built from names the system has genuinely seen — targets appearing on a logged `CallStep` or in
   `RegistryHistory` that have no live registry row for that kind — with the kind the log saw shown
   against each. Suggestions are deliberately **not** narrowed to the chosen kind: registering an
   existing name under a second kind is a real case (`ZFS_SLC_OTTK_BTP` is live as both TABL and
   QURY), and filtering by kind would hide exactly the case worth suggesting. Self-protected names
   are excluded from the suggestions entirely.
2. **Date format DD-MM-YYYY** on both pages, everywhere a timestamp is rendered.
3. **Every key is a door.** The report's JSON-only popup is replaced by a navigable entity viewer:
   any call, step, registry row or history entry opens its own detail, and every related key inside
   that detail is itself a link — a step shows its parent call and the registry row that authorised
   it, a call lists its steps, a history entry links to the registry row and to the call that made
   the change. A back stack with a breadcrumb walks the chain out again. Entities are **fetched by
   key when opened**, not taken from the page's cached lists, so a call older than the 1000 most
   recent still opens.

**Two defects found and fixed during this round:** a `hidden` Back button still rendered, because
the house `.btn{display:inline-flex}` outranks the user-agent `[hidden]{display:none}` — fixed with
an explicit `[hidden]{display:none!important}`; and `MessageNo 000` with no text rendered as a
literal "000:" in the modal as it had in the table, now blank in both.

## Third round — in-console documentation (2026-09-15)

A **Documentation** button now sits in the topbar of both pages, opening a third page,
`docs.html`, in the same console and the same house theme. It answers the question the API docs in
`docs/` answer for a reader who already knows where to look, but for someone sitting in front of
the console: *what URL do I actually call, and in what order?*

Contents: the URL shape and its three traps; a four-step first call (CSRF token → `RunQuery` against
`T000` → read the answer → read what it logged), with the same call given in PowerShell; a card per
action — all six, each with the exact `POST` URL, the full parameter list, a worked body and the
refusals to expect; the step-kind table with the AllowWrite and rollback columns; the four entity
sets with their join keys; idempotency; and a symptom → cause table.

**Every URL, action name and parameter list was taken from the live `$metadata` on DS4**, not from
memory: the six action signatures and the `ZFS_AE_DynGwResult` field list were extracted from the
service document, and the worked examples come from `docs/dyngw-v2-integration-guide.md` where they
are already marked proved-live. A **base-URL switcher** rewrites every snippet in place between
this console's proxy (`localhost:8774/api/dyngw`) and SAP directly
(`vhnlqds4ap01…/srvd_a2x/sap/zfs_sd_dyngw/0001`), so nobody has to substitute a host mentally across
thirty examples; the choice persists in `localStorage`. Every code block has a Copy button that
copies whichever base is currently shown.

**One defect found and fixed while checking it:** the reference tables were being truncated by the
house `td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` rule — correct for a data grid,
wrong for prose in a reference table, and the same family as L-530. Fixed with an explicit
`white-space:normal` on `table.ref td`.

## Fourth round — a hub for web/dynamic-gw (2026-09-15)

`web/dynamic-gw/dyngw-menu-console/` on **port 8775**, copied from
`web/individual/slc-menu-console/` rather than rebuilt: the same Inter/blue tile theme, the same
`GROUPS` data shape, the same render and launch logic, the same Fourth Signal mark. Only the menu
data, the brand text, the page title and the hub heading changed — so the two hubs stay visibly the
same product, and a fix to one is a fix worth copying to the other.

Tiles: **Applications** — OTTK via Dynamic Gateway (8773). **Administration** — Registry and Linkage
Report (8774). **Reference** — How to Call It (the docs page), plus two raw tiles that open the
service's own `$metadata` and the `Registry` entity set through the proxy, for when you want to see
exactly what SAP returns rather than a rendered view.

Two things deliberately corrected rather than carried over: the source's navigation comment named
the SLC ports (8765–8770), which would be actively misleading here, so it names 8773/8774 instead;
and the copied `renderHome` had `SLC` hard-coded as the page heading. The copied `proxy.py` already
carried the L-528 repo-root fix, since that was applied to every console before this copy was made.

## Fifth round — one menu path per access style (2026-09-15)

Clarified goal: **a menu path for individual-service applications and one for dynamic-gateway
applications, separately.** The two hubs now match the `web/` split exactly:

| Hub | Port | Lists |
|---|---|---|
| `individual/slc-menu-console` | 8771 | applications on their **own dedicated OData service** |
| `dynamic-gw/dyngw-menu-console` | 8775 | applications reaching SAP through **ZFS_SB_DYNGW_O4_API** |

To get there, the SLC hub's **"OTTK via Dynamic Gateway" tile was removed** — it had been added to
Front Office when that console was the ninth in a flat `web/`, and it is a gateway application, so
it now appears only on the gateway hub. Each hub gained a one-line subtitle naming which kind of
application it lists, and a header switch to the other path, so the paths are separate without
being isolated. Recorded as **L-532**, which also states where a future console's tile goes.

**Not done, not asked:** nothing else on the SLC hub changed — its groups, folders and unwired
tiles are untouched.

## Sixth round — OTTK screen parity, individual vs gateway (2026-09-15)

Reported: the gateway console's OTTK screen is not the same as the individual one and "something
is not working." Debugged against the running consoles rather than by reading code alone.

**Root cause (L-533):** the gateway console's `RunQuery` asked for 13 columns and its renderer
hard-coded `<td></td>` for five more, on the strength of three comments in its own source claiming
`ZFS_CDS_SLC_001`/`002` lacked those columns. A live all-columns read disproved all three — the
views return 77 and 84 columns, every needed one included.

**Fixed, cell for cell against `web/individual/ottk-dttk-console`:**

| Was | Now |
|---|---|
| `01`, `DSX` | `01 New`, `DSX Deposit Set Off - Cross Border` (code + text) |
| Entity String empty | `ZENT_DESC` |
| Tenor / LC Applicant / LC Beneficiary empty | `ZTENOR` / `ZLC_APP` / `ZLC_BEN` |
| Deposit Amt / Interest empty | `ZDEP_AMT`, `ZINT_CAT_TEXT + ZINT_RATE%` |
| CoCode showed the company *name* | company code alone |
| `0660000680` | `660000680` — ALPHA output conversion, display only |
| ordered descending | ascending, as the individual console |
| applicant/beneficiary filters static | populated from the data |
| toolbar had Create only | Create · Release & Print · Refresh · Copy OTTK |
| any row click opened the editor | row click selects; the OTTK number opens the editor |
| create mode showed a Delete button | hidden (L-531 recurrence — see below) |

**A second defect found while testing the first:** `#deleteOttk` carried `hidden` and rendered
anyway, because this console's only `[hidden]` rule was scoped to modal fields while `.btn` sets
`display:inline-flex` — exactly L-531, in a console built before that lesson existed. Create mode
was offering a Delete action the screen it mirrors does not even have. Fixed with a global
`[hidden]{display:none!important}`, which also restored the "Created By" header's create-mode
hiding.

**Two gaps that remain, stated rather than papered over:**

1. **Copy OTTK copies header fields only.** The individual console's Copy also stages the source
   ticket's charge *lines* (`loadChargesForCopy`); this console has no charges popup at all, only
   the single "Other Charges" total — which is copied. The toast says so explicitly rather than
   implying a full copy.
2. **A DTTK number does not open a display modal here.** The individual console opens a read-only
   DTTK view (`openDttkView`); the gateway console has no such modal, and building one is a
   separate piece of work, not a parity fix.

## Seventh round — DTTK display modal, and the panels that should not have been there (2026-09-15)

**Two things in one round.**

**1 · The extra panels (L-534).** Reported: "why unnecessarily Gateway Trace is showing in the
application. u didn't check and compare the application properly." Correct — the previous round
compared the two tables cell by cell and never asked whether the *page* carried panels the
reference screen does not. It carried two: **Provisioning** (a "Provision targets" button and two
diagnostic probes) and **Gateway Trace** (counters plus the call log). The individual console has
neither; both were build scaffolding left mounted on a working screen. Removed, `.main` reduced to
the same two rows, and the JS **guarded rather than deleted** so `loadRegistry()`/`targetGate()`
still serve the ticket loads and the panels can be re-mounted by restoring markup alone. Nothing is
lost: the admin console's Linkage Report reads those same four tables far more thoroughly.

**2 · The DTTK display modal.** The individual console opens its DTTK view by **iframing the DTTK
console** (`/dttk-view.html` → `web/individual/dttk-console/index.html?displayDttk=<key>`), and that
page reads `/api/dttk/SlcDttkDetail(...)` — the **dedicated** service. Mirroring that literally
would have made this console bypass the gateway it exists to exercise, so the choice was put to the
human, who chose the gateway-native build.

Built: a read-only modal whose five sections and every label mirror the DTTK console's own popup
(Transaction Details · Trade Details · Discounting Loan Details · Confirmation Bank · Additional
Information), fed by one `RunQuery` on `ZFS_CDS_SLC_002` filtered to the ticket. Values render as
text on a ruled baseline rather than disabled inputs — a disabled `<input>` reads as a control
someone forgot to enable. The DTTK number is now a hotspot exactly as in the individual console:
the row click selects, the number opens the display.

**Three defects found and fixed while building it:** a patch script that crashed mid-run had
written nothing, so the modal's CSS was silently absent on the first render (labels and values ran
together — the data was right, the layout was not); a leftover `#callLogTable` binding threw once
the trace panel's markup was gone; and `ZSTAT_DESC` already leads with its own code, so pairing it
with `ZDTTK_ST` produced "05 05 - Partially Assigned to Deal ID" — the code+text helper now drops
the duplicate.

**Verified live:** DTTK 100043 opens with real values throughout — Discounting Bank
`660000645 — DBS BANK LTD`, loan amount 2,000,000.00 USD, interest rate 10.00, negotiation fee
8,000.00, other charges 1,944.44 — with the footer showing its related OTTK. No console errors on
the page.

## Eighth round — delete removed, DTTK gateway console, service replication (2026-09-15 → 09-16)

**1 · Delete removed from the OTTK console.** The Delete button, its confirmation modal and the
whole `ExecuteTableCrud DELETE` block are gone, along with every reference to them. The edit footer
is now Clear / Cancel / Save Changes — matching the individual console, which has no delete at all.

**2 · A DTTK console on the gateway** — `web/dynamic-gw/dyngw-dttk-console/`, **port 8776**. It is
`web/individual/dttk-console` unchanged — same markup, same form logic, same validation — with a
**transport shim** in front of its `apiRequest`: every call the page makes to a dedicated service is
recognised by a router and re-expressed as a gateway call. Nothing else in the 1300-line page was
touched.

**3 · Replicating the two services properly (L-535).** Asked to compare the individual services'
OData and replicate it, the service *definitions* were read from SAP — they name the CDS view behind
each entity set — and all **twelve** views were registered in one `ExecuteBatch` as read-only
`QURY` targets (committed, message 036 each, every one verified returning rows). That is what makes
the DTTK console's lookups work: 19 origination banks, 15 entity strings, 18 discounting banks,
17 confirmation banks, all live through the gateway.

The same registrations exposed a gap in the **OTTK** console: it had no lookup loading at all, so
its bank / entity / ref-int dropdowns had always been empty. A loader was added over the same views.

**Three fidelity gaps between reading a view through OData and through RunQuery**, all fixed in the
shim: the SQL element name differs from the declared property name (`ZOTTKNO` vs `ZottkNo`) and no
naming rule recovers it, so a 128-entry map was extracted from both services' `$metadata`; the ALPHA
output conversion is applied by OData but not the view (`0660000645` vs `660000645`); and OData
returns rows in key order while `RunQuery` does not.

**Verified live before the outage below:** the DTTK gateway console rendering identically to the
individual one — same rows, same texts, same bank formatting, same order — and its create form with
every lookup populated.

## Interruption: SAP unreachable (2026-09-16, ~00:20)

Mid-verification of the OTTK lookups, every proxy began returning 502 after ~42 s. This is **not a
regression from the work above**: port 8765, which reads the *dedicated* OTTK service and shares no
code with any change made here, fails identically, and a plain TCP `connect()` to
`vhnlqds4ap01.sap.niififl.in:44300` — no HTTP, no credentials — times out after 42 s with
`WinError 10060`. The host is unreachable at the network level; either it is down or the route to it
dropped.

**What this leaves unverified:** the OTTK console's newly added lookups have not yet been seen
populating on screen. The wiring is written and its data source is proved (all four views returned
rows through the gateway minutes earlier), but the first live render is outstanding — re-check when
the host is back.

**One correction to my own diagnosis:** the first 502s were read as socket exhaustion (proxy.py
speaks HTTP/1.0 without keep-alive, and the individual console documents that trap), and the boot
sequence was serialised in response. The outage evidence says that was not the cause. The
serialisation is still right on its own merits — the trap is real and documented — but it fixed
nothing here and should not be recorded as having done so.

## Ninth round — four parity items, and a rebuild that answers three of them (2026-09-16)

Reported: (1) create-OTTK auto-populate not working like the individual, (2) the DTTK hotspot popup
not the same, (3) the DTTK screen missing from the menu, (4) "check each and every button … the
individual screens are tested screens."

**The root cause behind 1, 2 and 4 is one thing (L-536):** `dyngw-v2-console` was **hand-written**
against the gateway while `dyngw-dttk-console` was **copied** from its individual counterpart with a
transport shim. Every parity defect across four rounds belonged to the hand-written one; the copied
one was reported wrong once, for two transport-level gaps. So the OTTK console was rebuilt the same
way: `web/individual/ottk-dttk-console` copied verbatim, with the shim in front of `apiRequest`.

That brings with it, for free and already tested: the auto-populate behaviour (item 1), the charges
popup, the row and filter behaviour, and every button.

**Item 2 — the DTTK popup** is now the individual's own mechanism rather than a bespoke modal: a
`/dttk-view.html` route in the OTTK console's `proxy.py` feeding an iframe in display mode. The
individual points that route at its sibling DTTK console; this one points at **the gateway DTTK
console**, so the popup reads through the gateway like the rest of the screen. Route verified
serving (HTTP 200); the gateway DTTK console already honours `?displayDttk=` as part of the copy.

**Item 3 — menu:** a "Distribution Ticket (DTTK)" tile added to the Applications group of the
gateway hub (8775), pointing at 8776.

**Item 4 — the check itself, done mechanically rather than by eye.** An element-id diff of both
pairs:

| Pair | ids only in the individual | ids only in the gateway twin |
|---|---|---|
| `ottk-dttk-console` vs `dyngw-v2-console` | **none** | `gwBanner` (the shim's own) |
| `dttk-console` vs `dyngw-dttk-console` | **none** | `gwBanner` |

Every button, field, modal and popup the tested screens carry now exists in their gateway twins.

**Both rebuilt pages load with zero console errors.**

## Second interruption: SAP still unreachable

Everything above is code; none of it has been verified against live data, because
`vhnlqds4ap01.sap.niififl.in:44300` is still unreachable — a plain TCP connect times out at ~40 s,
and every proxy (including 8765 on the dedicated service) answers 502 after 42 s. One TCP probe
connected instantly and then timed out at the TLS stage, so the host is flapping rather than cleanly
down.

**Outstanding when it returns — in this order:**

1. OTTK list, lookups and auto-populate on the rebuilt console (8773).
2. The DTTK popup opening from an OTTK row and reading through the gateway.
3. Create and edit an OTTK through the rebuilt console — the write path is the one thing the rebuild
   re-expressed (`ExecuteTableCrud` INSERT with UUID + number range `ZFS_OTTK_D` + audit; MODIFY as a
   full-row replace with the `ResultCount === 0` guard), and it is the highest-value thing to re-test.
4. The charges popup, which reads `ZFS_C_SlcOttkFeeTP` (registered) but cannot save until the fee
   **table** is registered as a write target — the banner says so on screen.

## Tenth round — verification after the outage, and the Deal ID console (2026-09-16)

SAP came back, so the four items left hanging from the ninth round were verified, and a third
gateway console was built.

**Verified live on the rebuilt OTTK console (8773):**

| Item | Result |
|---|---|
| List and columns | Identical to the individual (8765) — same rows, texts, bank format, key order |
| Auto-populate | **Works.** Entity `E020` → entity string `OGA-OSML-DMCC`; bank `3` → business area `0615 / OLAM INTERNATIONAL DMCC`; company code blank in both |
| DTTK popup | **Now the individual's own mechanism** — `/dttk-view.html` iframe in display mode, pointed at the gateway DTTK console. Opens "Display Distribution Ticket #100043" with every dropdown resolved to text |
| Buttons | Element-id diff: nothing in an individual console missing from its gateway twin |

**A correction to my own earlier reading.** The first auto-populate test showed the business area
not filling, and I nearly recorded that as a defect. It was a bad test: the gateway console's bank
list is not paginated, so its option[1] is a *different bank* from the individual's option[1].
Re-run against the same bank value, both consoles behave identically. The lesson is in L-537 — an
apples-to-apples comparison has to pin the input, not just the action.

**New: `web/dynamic-gw/dyngw-dealid-console`, port 8777.** Same copy + shim pattern. Its call
inventory turned out to need exactly **one** new gateway target — `ZFS_C_DealIdTP` for the `DealId`
entity; the OTTK/DTTK pickers and bank filters were already registered for the other consoles.
Verified live: both ticket grids populated with balances, and the Deal ID list modal returning the
three real deal IDs. Creating a deal ID is gated on `ZSGSLCTR_DEALID` being registered as a write
target, with the banner naming it.

**Hub (8775):** Applications now holds OTTK, DTTK and Deal ID. Two defects fixed there — the DTTK
tile had created a *second* "Applications" group rather than joining the first, and the OTTK tile
still advertised the Gateway Trace panel that L-534 removed.

**Still true and worth watching:** SAP is answering fast but intermittently — individual `RunQuery`
calls still return 502 occasionally, and the pages recover by their own error paths.

## Eleventh round — two write targets registered, and what they turned out not to unlock (2026-09-16)

Requested: register `ZSGSLCTR_DEALID` and `ZFS_SLC_DTTK_BTP` as write targets. **Done** — both are
`TABL` / `AllowRead` / `AllowWrite`, active, and each also needed a **second `QURY` row**: the first
read after registering answered `ExecStatus E`, because `RunQuery` dispatches step kind `QURY` and a
`TABL` row does not answer it (L-526 from the other direction — which is why `ZFS_SLC_OTTK_BTP` has
carried two rows all along). Registry is now 25 rows.

**What the grants do buy:** the DTTK console's **edit** path. Verified in the page: `gwCanWrite()`
returns true against the live registry.

**What they do not buy — create, on either console (L-538).** Inspecting both tables through their
new `QURY` rows:

| | `ZFS_SLC_DTTK_BTP` | `ZSGSLCTR_DEALID` |
|---|---|---|
| Columns | 77 | 64 |
| Key | `CLIENT` + `ZDTTK_NO` | `CLIENT` + `ZDEAL_ID` |
| UUID column | none | none |
| RAP audit fields | yes | no — legacy `ZCREATED_*` only |

Neither individual console sends the key on create; the behaviour assigns it from a number range. A
straight `INSERT` would write a **blank-keyed row** that looks successful. And for Deal ID it is
worse than numbering: per **L-284**, create validates both tickets, draws the number, inserts, **and
updates the linked OTTK and DTTK rows** — a table insert reproduces one step of four.

So both create paths now **refuse with the specific reason** rather than writing broken data:

- **DTTK** — refused until the DTTK number range object is set on the registry row (`AllowGen` +
  `GenNrObject`), exactly as `ZFS_SLC_OTTK_BTP` carries `ZFS_OTTK_D`. I did not guess the object's
  name; it is a fact about the DTTK behaviour and ADT was unreachable at the time.
- **Deal ID** — refused with the multi-step explanation. Doing it properly needs the create logic
  behind a remote-enabled function module registered as a `FUNC` target: an ABAP change.

Both refusals name the missing piece in the on-screen banner.

## Twelfth round — number range objects read from the BOs and registered (2026-09-16)

Requested: find the DTTK and Deal ID number range objects in the BO and register them. Read from
source via ADT rather than guessed (**L-539**):

| | Object | Range | How the number becomes the key |
|---|---|---|---|
| DTTK (`ZBP_FS_SLCDTTKDETAILTP`) | `ZFS_DTTK_D` | `01` | `zdttk_no = lv_number+14(6)` |
| Deal ID (`ZBP_FS_DEALIDTP`) | `ZFS_DEALID` | `01` | `CONVERSION_EXIT_ALPHA_INPUT` into 10 chars |

The DTTK source carries a warning worth keeping: `ZFS_DTTK_D` mirrors `ZFS_OTTK_D` (interval 01,
100001–999999), and **the unrelated 10-digit `ZFS_DTTK_N` is not the range used** — exactly the
near-miss a guess would have made.

**Registered:** both `TABL` rows updated with `AllowGen` + `GenNrObject` (typed as `UPDATE`;
`INSERT` on an existing row is refused with 035 by design). Verified in the page: the DTTK console's
create gate is open with `ZFS_DTTK_D` behind it, and its edit gate is open.

**Reading the BO also settled what create does beyond numbering**, which is where the two cases
part company:

- **DTTK** — create also sets `zdttk_st = '01'` and stamps *both* audit blocks. The status default
  is a constant, so the console now reproduces it. The **legacy** `ZCREATED_*` / `ZCHANGED_*`
  columns are not filled by `SysFields:"AUDIT"` (which covers the RAP five), and inventing them from
  the browser's clock would be worse than leaving them blank — so they stay blank, documented in the
  code. Create is otherwise wired.
- **Deal ID** — create validates both tickets, derives `ZACC_TYPE` from both legs, computes each
  ticket's remaining balance from `SUM(zdeal_amt)`, sets the status, inserts, **and updates
  `zottk_st` / `zdttk_st` on two other tables**. Registering `ZFS_DEALID` removes the numbering
  obstacle and nothing else, so create stays refused with that reason on screen.

**Not done without asking:** no live create was run. Creating a DTTK through the gateway would draw
a real number from `ZFS_DTTK_D` and write a real ticket.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-528**, **L-529**, **L-530**, **L-531**, **L-532**, **L-533**, **L-534**, **L-535**, **L-536**, **L-537**, **L-538**, **L-539**.
