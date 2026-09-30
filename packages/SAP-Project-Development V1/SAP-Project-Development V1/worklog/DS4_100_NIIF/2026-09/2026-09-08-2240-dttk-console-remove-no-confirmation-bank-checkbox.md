# DTTK console — remove the "No Confirmation Bank" checkbox from the Create DTTK modal

- **Date:** 2026-09-08
- **System:** DS4_100_NIIF
- **Package:** — (local web console only, no ABAP object touched)
- **Transport:** — (no transport)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Remove the **No Confirmation Bank** checkbox from the Create/Edit DTTK modal in
`web/dttk-console/index.html`, together with the CSS rule that existed only for it and both
payload touchpoints that read/wrote it. The `ZnoCbank` property itself stays on
`SlcDttkDetail` — nothing on SAP is changed — but the console no longer supplies a value for it.

**Out of scope:** `web/dttk-console/workbench-v43.html`, the older wired workbench kept beside the
console, still carries its own `fldNoConfirmationBank` checkbox and the
`onNoConfirmationBankChange()` machinery around it. It is not served by `proxy.py` and was left
untouched, consistent with `worklog/DS4_100_NIIF/2026-09/2026-09-08-2243-dttk-status-join-and-display.md`.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | With the checkbox gone, should the payload derive `ZnoCbank` (from Confirmation Bank, or from Type 1 = 02), or stop sending it? | **Stop sending it** — omit the key; the stored value on the record stands, and on create the backend default applies | 2026-09-08 |

## Naming gate

No SAP object created or renamed. One existing constant extended:

```
NAMING: PASSTHROUGH_FIELDS += 'ZnoCbank' -> existing console constant, no SAP naming gate
```

## Todo

- [x] 1. Locate the checkbox and every reference to it (`noCbank` / `ZnoCbank`).
- [x] 2. Confirm with the human what the payload should do with `ZnoCbank` (stop sending it).
- [x] 3. Remove the `<div class="field">` carrying the checkbox from the Confirmation Bank section.
- [x] 4. Remove the now-dead `.dttk-grid .field .check` CSS rule — `noCbank` was the only checkbox
       in the file, so the rule had no other user.
- [x] 5. Remove the read in `populateDttkModal()` (`…getElementById('noCbank').checked = …`).
- [x] 6. Remove `ZnoCbank` from `buildDttkPayload()` and leave a comment saying why the key is
       absent.
- [x] 7. Add `ZnoCbank` to `PASSTHROUGH_FIELDS` so an update carries the stored value back rather
       than relying on the BO's omitted-field behaviour (see below).
- [x] 8. Verify live in the browser against the running proxy (port 8766).

## Design note — why `PASSTHROUGH_FIELDS` and not a bare omission

The human's answer was "stop sending `ZnoCbank`". A bare omission would already be correct *on a
system where transport DS4K907263 is imported*, since `LHC_SlcDttkDetail.update` preserves omitted
fields there (L-272). The console already keeps `PASSTHROUGH_FIELDS` for exactly this shape —
writable properties the screen has no field for — as a guard against a system without that fix,
where an omitted property would be blanked. `ZnoCbank` is now precisely such a property, so it
belongs in that list. Net effect matches the human's answer either way: the update round-trips the
stored value instead of the console inventing one. Copy/Create send no `ZnoCbank` at all
(`withUntouchedFields` has no stored key to read), which is the intended "backend default applies".

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `web/dttk-console/index.html` | Local HTML console | — | — | Changed |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP; page loads with zero runtime errors
- [x] Activated, nothing left inactive — n/a, no ABAP
- [x] ATC / Code Inspector — n/a, no ABAP
- [x] ABAP Unit green — none applicable, no ABAP object touched
- [x] Text symbols and selection texts maintained — n/a, browser UI, not an ABAP text pool
- [x] Object list confirmed in the transport — n/a, nothing transportable

### Live verification (Playwright, http://localhost:8766/)

```
checkboxGone               : true      (getElementById('noCbank') === null)
anyCheckboxInModal         : 0         (it was the only checkbox in the file)
renderedElements w/ label  : []        (text survives only in a source comment)
confSectionFields          : Confirmation Bank, Conf. Fee From, Conf. Fee Till,
                             Confirmation Trader, Confirmation Fee, Confirmation Remark
passthroughHasFlag         : true      (PASSTHROUGH_FIELDS includes 'ZnoCbank')
openDttkModal('create',{}) : ok        (no throw on the removed element)
openDttkModal('edit', {ZnoCbank:'X'}) : ok
buildDttkPayload()         : ok, and hasOwnProperty('ZnoCbank') === false
runtimeErrors              : []
```

Screenshot of the Confirmation Bank section with Type 1 = 01 confirmed the grid reflows cleanly —
`Confirmation Bank` keeps its `wide2` span and no empty cell is left where the checkbox was.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-297.
