# ZFS_I_SlcRefInt read-only entity + variable-interest fields, entity-mapping bug fix, modal spacing

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026") — human said "use the same saved TR", no new question asked
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — view created and active, service extended and live, console wired and tested

Follows on from the three prior 2026-09-07 activities on this same console/service.

## Scope

Four items requested together:

1. **Create OTTK modal spacing** — the human found it too congested; make it more spacious.
2. **Interest Category-driven fields** — "Fixed" (`01`) keeps the plain Interest Rate field; every
   other category (`02` Variable, `03` Fixed with Benchmark, `04` Bank COF) hides Interest Rate and
   shows **Ref Int Rate** + **Spread Rate** instead (`ZrefInt`/`Zsrate`, both already on
   `SlcOttkDetail` but never surfaced in the modal until now).
3. **Ref Int Rate becomes a dropdown**, sourced from a new read-only entity over
   `ZSGSLCTR_REF_INT`, mirroring `Bank`/`EntityString`/`CoCode`.
4. **Correction to the Entity-String auto-fill**: LC Applicant ← `Zent2`, LC Beneficiary ← `Zent1`
   (literal field names, given directly by the human this time) — replacing the prior activity's
   wrong mapping.

Out of scope: DTTK (still untouched, console remains OTTK-only); the OTTK BO/BDEF/behavior
pool/DCL (untouched — one more plain read-only view, no behavior needed).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Transport for `ZFS_I_SlcRefInt` and the service-definition change? | Not asked this time — the human pre-empted it mid-turn with "use the same saved TR", so `DS4K907263` was used directly, consistent with every other object in this build. | 2026-09-07 |
| 2 | Item 4's instruction ("LC applicant from ... zent2 ... beneficiary from zent1") **contradicted** the mapping this console already shipped with (built in the immediately-prior activity, off `ZentDesc`/`Zent1`) — which is correct? | Investigated before touching anything: two `runQuery` calls against `ZSGTSFTR_ENT_STR` with the same filter returned **contradictory data** for the same table. A fresh call selecting every column with an explicit `ORDER BY` (run twice, identical) gave `ZentId` as a clean code ("E021"), `ZentDesc` as the full compound description, `Zent1`/`Zent2` as independent tokens — and this matched the **live OData `EntityString` response exactly**. The earlier `runQuery` result the prior activity was built on was simply corrupted output from that tool. Recorded as L-258 (supersedes L-256's data-shape claim); the human's new instruction was correct and is what got implemented. | 2026-09-07 |
| 3 | Categories `03`/`04` aren't literally covered by "for fixed ... correct, for variable ... hide/show" — what should they do? | Grouped them with Variable (hide Interest Rate, show Ref Int + Spread) rather than leaving them in an undefined third state — flagged to the human as a judgment call, not asked, since it was a low-risk default with an obvious fallback. | 2026-09-07 |
| 4 | `ZSGSLCTR_REF_INT` has a `ZICL` flag column — is it a "valid/active" filter like `ZSLC`/`ZOTBANK`/`ZDTBANK` elsewhere in this build? | Checked live data: only 1 of 19 rows has `ZICL = 'X'`, and the rest are blank — not a usable inclusion filter here (it means something else, not investigated further since out of scope). The new view has no `where` on it beyond `zref_int <> ''`. | 2026-09-07 |

## Naming gate

Recorded **before** the create call:

```
NAMING: ZFS_I_SlcRefInt -> matches docs/naming-conventions.md "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view, no TP suffix, mirroring ZFS_I_SlcBank / ZFS_I_SlcEntityString / ZFS_I_SlcCoCode
```

`ZFS_SD_SLCOTTKDETAIL` was **changed**, not created — pre-existing conformant name, out of the gate.

## Todo

- [x] 1. Read `ZSGSLCTR_REF_INT` structure (`DD03L`) and live data (full column list, `ORDER BY`) —
      key `ZREF_INT`, description `ZREF_DESC`, `ZICL` checked and found not usable as a filter
- [x] 2. Naming gate recorded, then `ZFS_I_SlcRefInt` created via **`adt-mcp`** (`DDLS/DF`, package
      `ZFS_SLC_BTP`, transport `DS4K907263`)
- [x] 3. Source written via **`mcp-abap-abap-adt-api`** (`lock` → `setObjectSource` → `unLock`) —
      `select distinct`, `key zref_int as ZrefInt`, `zref_desc as ZrefDesc`, `where zref_int <> ''`.
      First activation raised a real (non-benign) warning — the `@EndUserText.label` annotation value
      exceeded the 40-char limit (44 chars); shortened the label and re-activated clean.
- [x] 4. `ZFS_SD_SLCOTTKDETAIL` **changed** to add `expose ZFS_I_SlcRefInt as RefInt;`, activated
      clean, verified live in `$metadata` and via `GET RefInt` — no republish needed (L-255)
- [x] 5. **Investigated the entity-mapping contradiction before changing any code** — two `runQuery`
      calls gave different data for the same table/filter; resolved by cross-checking the live,
      already-deployed `EntityString` OData response (unambiguous, no tool in the loop). Confirmed
      the human's new instruction (`Zent2`→Applicant, `Zent1`→Beneficiary) was correct. Recorded as
      L-258.
- [x] 6. Console: `applyEntitySelection()` corrected — no more `ZentId.split('-')`; reads
      `rec.ZentDesc`/`rec.Zent1`/`rec.Zent2` directly (they are already separate stored fields)
- [x] 7. Console: added `refIntRateField`/`spreadRateField` (hidden by default) alongside the
      existing `interestRateField`; `applyIntCategoryVisibility()` toggles them on the Interest
      Category `onchange`, clearing whichever side is hidden so a stale value from a prior category
      is never sent; wired into `clearOttkFields`, `populateOttkModal` (edit/copy loads the right
      state), and `buildOttkPayload` (`ZrefInt`, `Zsrate`)
- [x] 8. Console: `[hidden]` needed an explicit CSS override (`.modal-content-grid .field[hidden]`)
      — the existing `.field{display:flex}` rule has higher specificity than the browser's default
      `[hidden]{display:none}` and would otherwise have silently kept the "hidden" fields visible
- [x] 9. Console: modal CSS spacing pass — bigger modal (1280px/860px vs 1180px/760px), 4→3 columns
      in the two dense sections, taller inputs (34px vs 23px), bigger fonts/gaps/padding throughout,
      `overflow-y:auto` added on the content grid as a safety net now that it holds two more fields;
      both responsive breakpoints (`max-height:820px`, `max-width:800px`) adjusted to scale with it
      rather than left at the old cramped values
- [x] 10. `lessons/lessons-ledger.md` — L-258 recorded, with a "Superseded by" line added to L-256

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcRefInt | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **created**, active |
| ZFS_SD_SLCOTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | pre-existing, **changed** (1 `expose` added), active |

Workspace files changed: `web/ottk-dttk-console/index.html` only.

## Delivery checks

- [x] Pretty Printer — n/a, CDS source hand-written with consistent indentation
- [x] Syntax check clean — both activations returned `success: true` (the label-length issue on the
      first `ZFS_I_SlcRefInt` activation was a warning, not a syntax error, and was fixed anyway)
- [x] Activated, nothing left inactive — `inactiveObjects` → `[]`
- [ ] ATC / Code Inspector — **not run**, same reasoning as the three prior read-only-view activities
- [x] ABAP Unit — none applicable; no behavior, no class (L-216)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — both calls echoed `DS4K907263`
- [x] Live functional test, all through the proxy on `http://localhost:8765`:
      - `GET RefInt` → 200, 19 rows (`SOFR_1D` → "Secured Overnight Financing Rate (SOFR)", etc.)
      - `GET EntityString` re-verified: `E021` → `ZentDesc "OGA-DMCC-PAN"`, `Zent1 "OGA"`,
        `Zent2 "DMCC"`
      - `POST SlcOttkDetail` with `ZentId "E021"`, `ZlcBen "OGA"` (= `Zent1`), `ZlcApp "DMCC"`
        (= `Zent2`), `ZintCat "02"`, `ZrefInt "SOFR_1D"`, `Zsrate 1.25` → 201 as `100038`, echoed
        `ZintCatText "Variable"` and both new fields back unchanged; record deleted again (204)
      - page JS passes `node --check`; every `getElementById` target resolves; brace count balanced
      - **no test data left behind**
- [ ] Browser click-through — **not performed by me** (no browser-automation tool in this session).
      The Interest Category show/hide toggle and the new spacing are verified by code review plus
      the equivalent API-level create, not by looking at the rendered modal.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-258 (plus a "Superseded by"
annotation added to L-256).

## Addendum 2 — 2026-09-07, same day: Interest Frequency remapped, new Reset Frequency field added

The human asked for the modal's "Interest Frequency" dropdown to carry
`01 Upfront / 02 Monthly / 03 Quarterly / 04 Half-yearly / 05 Rear-end`, and a new "Reset Frequency"
field before it with `01 Monthly / 02 Quarterly / 03 Half Yearly`. Neither list was handed to me
pre-mapped to a backend property, so before touching any markup I re-read
`ZFS_CDS_SLC_001`'s source directly (not from memory, per L-258) and found:

- `a.acc_type` has exactly the 5-value `CASE` the human gave for "Interest Frequency"
  (`ZACC_TYPE_TEXT` computed from it) — metadata label is actually "OTTK Classification", but the
  value list is an exact match, so this UI field now writes `AccType`, not its SAP-assigned label.
- `a.zres_frq` is a plain passthrough with **no** `CASE`/domain in the view (confirms L-254 — this
  field's codes were never derivable from the CDS view). Its metadata label, though, is literally
  "Reset Frequency" — an exact name match to what the human asked for — so the new field writes
  `ZresFrq`, using the 3 codes the human gave directly (no other source exists for them).

Previously "Interest Frequency" wrote `ZresFrq` as a free-text code (per L-254's "no derivable list,
leave as text" default from the 2026-09-07 entity-string activity) — that mapping is now corrected/
replaced by this more precise pair. No ABAP change (both fields already existed on `SlcOttkDetail`).

Console changes: `interestFrequency` converted from a free-text input to a `<select>`
(`AccType`, 5 options); new `<select id="resetFrequency">` added immediately before it (`ZresFrq`,
3 options); `populateOttkModal`/`buildOttkPayload` updated accordingly.

Verified live: `POST` with `ZresFrq:"02"`, `AccType:"04"` → 201, echoed `ZaccTypeText:"Half-yearly"`
confirming the mapping; record deleted again (204). JS re-checked (syntax, ids, brace balance).

## Addendum — 2026-09-07, same day: spacing dialed back

The item-1 spacing pass above overshot — human feedback: "too much spaces looking really bad".
Dialed back partway between the original cramped layout and the first pass: modal `1220×800`
(was `1280×860`, originally `1180×760`), dense sections back to 4 columns (was 3, originally 4),
inputs `28px` (was `34px`, originally `23px`), proportionally smaller gaps/padding/fonts throughout;
both responsive breakpoints scaled down to match. No ABAP change, no new lesson (a visual-density
judgment call, not a platform/tooling gotcha) — recorded here rather than as a new worklog file
since it's a same-day refinement of this activity's own item 1. Verified: JS still parses, every
`getElementById` target resolves, brace count balanced, page still served 200 through the proxy.
