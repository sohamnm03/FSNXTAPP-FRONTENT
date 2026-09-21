# ZFS_I_SlcCoCode read-only entity + Bank business-area fields, wired to auto-fill in the OTTK console

- **Date:** 2026-09-07
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026") — chosen by the human from the three offered
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed — views created/changed and active, service extended and live, console wired
  and tested

Follows on from `2026-09-07-ottk-dttk-web-console-odata-integration.md` and
`2026-09-07-slc-entity-string-lookup-and-ottk-only-console.md` (same console, same service).

## Scope

Two lookups added to the OTTK service and wired into the Create OTTK form:

1. **Business Area, from the selected LC Issuing Bank.** `ZFS_I_SlcBank` (existing, over
   `zsgslctr_bpext`) extended with `zba_code`/`zba_desc`, named `Zrbusa`/`ZbaText` to match the
   property names `SlcOttkDetail` already uses for these fields. Picking a bank now fills Business
   Area code + description; both fields became fully read-only since nothing else drives them.
2. **Company Code, from the selected/typed LC Applicant.** New read-only entity `ZFS_I_SlcCoCode`
   over `zsgtsftr_comp`, exposed as `CoCode` in `ZFS_SD_SLCOTTKDETAIL`. Typing or auto-deriving an LC
   Applicant now looks up a matching company mapping and fills Company Code + Company Name. Company
   Code itself stays editable — it is the one mandatory field (`Zbukrs`), so a failed/no-match lookup
   must not block a manual entry.

Out of scope: DTTK (console is OTTK-only per the prior activity); the OTTK BO/BDEF/behavior
pool/DCL (untouched — both changes are plain read-only views, no behavior needed).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which transport? | Asked again (the tool mandates never auto-selecting). Human chose `DS4K907263`, as for the two prior SLC console activities. | 2026-09-07 |
| 2 | `ZSGTSFTR_COMP`'s declared key is `ZBUKRS` alone. "Lookup by LC Applicant" needs a different field — which one, and is it safe to key a CDS view on it? | Read the live table first: `ZCOM_ID` is not a DB key but is unique across all 11 rows, and its values (`OGA`, `DMCC`, `PAN`, `SEDA`, `AMBER`, `OSIPL`, `OSL`, `OTL`, `OAL`, `OVL`, `OGAT`) are exactly the tokens already used as `ZlcApp`/`ZlcBen` and as entity-string segments. Asked the human to confirm keying the new view on `ZCOM_ID` before creating it (same "logical key, not the physical one" pattern already used for `ZFS_I_SlcBank`/`ZFS_I_SlcEntityString`) — confirmed. Recorded as L-257. | 2026-09-07 |
| 3 | Should the auto-filled fields become read-only, or stay editable for manual override? | Business Area: made **read-only** on both code and description — the pair has no independent meaning here, it is purely a projection of the chosen bank. Company Code: left **editable** — it is the mandatory `Zbukrs` field, so a lookup miss (applicant not in `ZSGTSFTR_COMP`) must not block manual entry. Flagged, not asked, as a low-risk, directly-implied interpretation. | 2026-09-07 |

## Naming gate

Recorded **before** the create call:

```
NAMING: ZFS_I_SlcCoCode -> matches docs/naming-conventions.md "Interface (basic/composite) view | ZFS_I_<Entity>" row; read-only view, no TP suffix, mirroring ZFS_I_SlcBank / ZFS_I_SlcEntityString
```

`ZFS_I_SlcBank` and `ZFS_SD_SLCOTTKDETAIL` were **changed**, not created — pre-existing conformant
names, out of the gate.

## Todo

- [x] 1. Read `ZSGTSFTR_COMP` structure (`DD03L`) and live data before designing — this is what
      surfaced the `ZCOM_ID` vs `ZBUKRS` key mismatch (L-257) and confirmed `ZBUTXT` is the company
      name field
- [x] 2. Read `ZSGSLCTR_BPEXT`'s structure and confirmed `ZBA_CODE`/`ZBA_DESC` already exist per bank
      row (including on the two rows with duplicate `Zbp` from the trader-code key columns — verified
      those duplicates carry identical business-area values, so `select distinct` stays duplicate-free
      after adding the two columns)
- [x] 3. Naming gate recorded, then `ZFS_I_SlcCoCode` created via **`adt-mcp`** (`DDLS/DF`, package
      `ZFS_SLC_BTP`, transport `DS4K907263`)
- [x] 4. Source written via **`mcp-abap-abap-adt-api`** (`lock` → `setObjectSource` → `unLock`) —
      `select distinct`, `key zcom_id as ZcomId`, `zbukrs as Zbukrs`, `zbutxt as Butxt`,
      `where zcom_id <> ''`. Activated with the expected benign "key differs from table key" warning
      (L-257) — same class as the two prior views' warnings, not an error.
- [x] 5. `ZFS_I_SlcBank` **changed** (`mcp-abap-abap-adt-api`) to add `zba_code as Zrbusa`,
      `zba_desc as ZbaText` to the existing select list. Activated with the same pre-existing key
      warning as before (unrelated to this change).
- [x] 6. `ZFS_SD_SLCOTTKDETAIL` **changed** to add `expose ZFS_I_SlcCoCode as CoCode;`. Activated
      clean. No republish needed (L-255) — verified `$metadata` lists `Bank`, `CoCode`, `EntityString`,
      `SlcOttkDetail` immediately.
- [x] 7. Console: Business Area fields (`businessAreaCode`, `businessAreaName`) made read-only;
      `clearOttkFields` updated to clear `businessAreaCode` too (it was previously covered by the
      `input:not([readonly])` selector, which stopped matching once it became read-only)
- [x] 8. Console: `loadLookups` fetches `CoCode` alongside `Bank`/`EntityString`; `applyBankSelection`
      (bank `onchange` → Business Area) and `applyCoCodeLookup` (LC Applicant `input` → Company Code)
      added; `applyEntitySelection` (Entity String `onchange`, from the prior activity) now also calls
      `applyCoCodeLookup` since it sets LC Applicant itself
- [x] 9. `lessons/lessons-ledger.md` — L-257 recorded in the same turn

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcCoCode | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | **created**, active |
| ZFS_I_SlcBank | DDLS/DF | ZFS_SLC_BTP | DS4K907263 | pre-existing, **changed** (2 fields added), active |
| ZFS_SD_SLCOTTKDETAIL | SRVD/SRV | ZFS_SLC_BTP | DS4K907263 | pre-existing, **changed** (1 `expose` added), active |

Workspace files changed: `web/ottk-dttk-console/index.html` only.

## Delivery checks

- [x] Pretty Printer — n/a, CDS/SRVD source hand-written with consistent indentation
- [x] Syntax check clean — all three activations returned `success: true`
- [x] Activated, nothing left inactive — `inactiveObjects` → `[]`
- [ ] ATC / Code Inspector — **not run**, same reasoning as the entity-string activity: trivial
      read-only projections mirroring an already-clean pattern.
- [x] ABAP Unit — none applicable; no behavior, no class (L-216)
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — all three calls echoed `DS4K907263`
- [x] Live functional test, all through the proxy on `http://localhost:8765`:
      - `GET Bank` → 200, every row now carries `Zrbusa`/`ZbaText` (e.g. `Zbp 3` → `0615` /
        `OLAM INTERNATIONAL DMCC`)
      - `GET CoCode` → 200, 11 rows, e.g. `ZcomId "DMCC"` → `Zbukrs "AE13"`,
        `Butxt "Olam International DMCC"`
      - `POST SlcOttkDetail` with `ZottkBank "3"`, `Zrbusa "0615"` (bank-derived), `ZlcApp "DMCC"`,
        `Zbukrs "AE13"` (applicant-derived) → 201 as `100037`; record deleted again (204)
      - page JS passes `node --check`; every `getElementById` target resolves
      - **no test data left behind**
- [ ] Browser click-through — **not performed by me** (no browser-automation tool in this session).
      The two `onchange`/`input` handlers are verified by code review plus the equivalent API-level
      create; the live UI feel (e.g. whether the read-only Business Area fields look right styled)
      is unverified.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-257.
