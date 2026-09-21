# OTTK console — LCP structures relabel Deposit Value / Amount to Prepayment Value / Amount

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** — (local web console only, no ABAP object touched)
- **Transport:** — (no transport)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

In `web/ottk-dttk-console/index.html`, the **Deposit / Prepayment** block's first two field labels
must follow the selected Structure: an LC-prepayment structure shows *Prepayment Value* /
*Prepayment Amount*, a deposit structure keeps *Deposit Value* / *Deposit Amount*. Labels only —
the field ids (`depositValue`, `depositAmount`), the OData payload keys (`ZdepVal`, `ZdepAmt`,
`ZdepCurr`) and every read/write path are untouched.

**Out of scope:** `web/dttk-console/index.html` lines 347–348 carry the same two labels on the
read-only DTTK overview and were **not** changed — no OTTK Structure value is in scope there and
the human asked only about the OTTK console. Also out of scope: the `Deposit Amt` column header in
the *Open Origination Tickets* list, which is per-row and mixes both structure families.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Does `CC LCP — Cross Currency LCP` relabel too, or only the bare `LCP`? | **Both** — `LCP` and `CC LCP` relabel; `DSX` and `CC DSX` keep the deposit wording | 2026-09-08 |

## Naming gate

No SAP object created. Two new DOM ids added to existing `<label>` elements, following the
console's own `<field>Field` / `<field>Label` convention (`interestRateField`, `refIntRateField`):

```
NAMING: depositValueLabel  -> local DOM id, mirrors existing depositValue  (no SAP naming gate)
NAMING: depositAmountLabel -> local DOM id, mirrors existing depositAmount (no SAP naming gate)
NAMING: applyStructureLabels() -> mirrors applyIntCategoryVisibility() / applyEntitySelection()
```

## Todo

- [x] 1. Locate the two labels and the Structure select in `web/ottk-dttk-console/index.html`.
- [x] 2. Confirm with the human whether `CC LCP` is in scope (it is).
- [x] 3. Give both labels stable ids.
- [x] 4. Add `applyStructureLabels()` next to `applyIntCategoryVisibility()`, wired to
       `structure.onchange`.
- [x] 5. Call it from `clearOttkFields()` so a fresh Create modal resets to the deposit wording.
- [x] 6. Call it from `populateOttkModal()` so opening/copying an existing LCP ticket shows the
       prepayment wording without the user touching the dropdown.
- [x] 7. Verify live in the browser against the running proxy (port 8765).

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/ottk-dttk-console/index.html` | Local HTML console | — | — | Changed |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP; page loads with no console error
- [x] Activated, nothing left inactive — n/a, no ABAP
- [x] ATC / Code Inspector — n/a, no ABAP
- [x] ABAP Unit green — none applicable, no ABAP object touched
- [x] Text symbols and selection texts maintained — n/a, browser UI labels, not an ABAP text pool
- [x] Object list confirmed in the transport — n/a, nothing transportable

### Live verification (Playwright, http://localhost:8765/)

Driving `structure.onchange` through every value, both directions:

```
(blank) -> "Deposit Value"    / "Deposit Amount"
DSX     -> "Deposit Value"    / "Deposit Amount"
LCP     -> "Prepayment Value" / "Prepayment Amount"
CC DSX  -> "Deposit Value"    / "Deposit Amount"
CC LCP  -> "Prepayment Value" / "Prepayment Amount"
DSX     -> "Deposit Value"    / "Deposit Amount"   (switches back, not one-way)
```

Modal open paths:

```
openOttkModal('edit', {Zstr:'LCP'}) -> "Prepayment Value / Prepayment Amount"
openOttkModal('create', {})         -> "Deposit Value / Deposit Amount"
```

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-296.
