# Copy ZSGSLCTR_DTTK to ZFS_SLC_DTTK_BTP (+ audit fields)

- **Date:** 2026-09-04
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** DS4K907263 ("SLC: BTP K2 on 04.09.2026")
- **Requested by:** karthik.r@fourthsignal.com
- **Status:** ✅ Closed

## Scope

Copy the transparent table `ZSGSLCTR_DTTK` ("DTTK Data", package `ZSGSLC`) into `ZFS_SLC_BTP` as
`ZFS_SLC_DTTK_BTP`, appending the 5 standard RAP audit fields (`local_created_by`,
`local_created_at`, `local_last_changed_by`, `local_last_changed_at`, `last_changed_at`) at the end,
per L-218's mandatory-audit-block rule (needed for a future RAP BO's ETag/lock). This is the DTTK
sibling of the `ZFS_SLC_OTTK_BTP` table this session's earlier CDS/RAP work was built on — same
package, same "<domain>_BTP" naming shape.

Human's original instruction named `ZSGSLCCDS_DTTK` as the source — that object turned out to be a
**CDS view** (`define view`), not a table, selecting from the real table `ZSGSLCTR_DTTK`. Both the
view and the real table live in package `ZSGSLC`, so the package name alone didn't disambiguate.
Given table creation here can't be undone (`deleteObject` is a denied permission project-wide),
asked for confirmation before creating anything — human confirmed the real table
(`ZSGSLCTR_DTTK`) was intended, matching the precedent shape of `ZFS_SLC_OTTK_BTP` ← `ZSGSLCTR_OTTK`.

Out of scope: `ZSGSLCTR_DTTK`/`ZSGSLCCDS_DTTK` themselves (not modified, pre-existing), any RAP
behavior on the new table (not requested).

**Update, same day:** the human asked for the currency-annotation fix (Open question 2) after all,
once the `ZFS_CDS_SLC_002` view fix (built on this table) reconfirmed the same defect pattern. Fixed
— see Open question 2 and the Todo list below.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Source object: the CDS view `ZSGSLCCDS_DTTK` (as literally named) or the real table `ZSGSLCTR_DTTK` it selects from? | Real table `ZSGSLCTR_DTTK` — confirmed via `AskUserQuestion`, matching the `ZFS_SLC_OTTK_BTP` precedent | 2026-09-04 |
| 2 | Every `@Semantics.amount.currencyCode` annotation copied verbatim from `ZSGSLCTR_DTTK` points to `'vtbfhapo.wzbetr'` — an unrelated FI/TRM table, not a field on this table. Should these be corrected? | **Fixed, same day, on request.** First attempt used a bare field name (mirroring the CDS-view-level fix that had just worked for `ZFS_CDS_SLC_002`) — table activation rejected it as "incomplete" (`D0 408`); a plain `define table` requires the **table-qualified** form instead (L-247, new finding). Corrected to `'zfs_slc_dttk_btp.<field>'` for every CURR field: `zottk_value`→`zottk_curr`, `zcc_ottk_value`→`zcc_ottk_curr`, `zdttk_value`→`zdttk_curr`, `zcc_dttk_value`→`zcc_dttk_curr`, `zdis_amt`→`zdis_curr`, and `znfee`/`zofee`/`zcfee`/`zcomm_fee` falling back to `zottk_curr` (no dedicated currency field each, mirroring the OTTK sibling's own pattern). Activated clean. | 2026-09-04 |

## Naming gate

```
NAMING: ZFS_SLC_DTTK_BTP -> does not match "Transparent table | ZFS_T_<AREA>_<NAME>" row (missing the _T_ tier marker; ZFS_T_SLC_DTTK_BTP would be 18 chars, over the 16-char platform cap, L-099) -> recorded as a documented exception in docs/naming-conventions.md, mirroring the identical deviation already live on sibling ZFS_SLC_OTTK_BTP in the same package; human directed the exact name
```

## Todo

- [x] 1. Confirm source object (CDS view vs. real table) — asked, confirmed `ZSGSLCTR_DTTK`
- [x] 2. Record naming-gate exception in `docs/naming-conventions.md`
- [x] 3. Create `ZFS_SLC_DTTK_BTP` skeleton (`adt-mcp`, package/name/description only per L-217)
- [x] 4. Write full field list via `setObjectSource` — all ~68 fields from `ZSGSLCTR_DTTK` verbatim (including the currency-annotation quirk, see Open question 2), plus the 5 audit fields appended at the end
- [x] 5. Activate — clean, no errors or warnings
- [x] 6. Confirm `inactiveObjects` returns `[]`
- [x] 7. Fix the `@Semantics.amount.currencyCode` annotations (table-qualified form, L-247) —
      activated clean after correcting a first attempt that used the bare-field-name form

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_SLC_DTTK_BTP | TABL/DT | ZFS_SLC_BTP | DS4K907263 | active |

## Delivery checks

- [x] Pretty Printer — source hand-written with consistent indentation matching the sibling table's style; no separate pass run
- [x] Syntax check clean — activation returned no errors
- [x] Activated, nothing left inactive — `inactiveObjects` returns `[]`
- [x] ATC / Code Inspector — not run; plain DDIC table, no executable/behavior code
- [x] ABAP Unit — n/a
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — both `create_object` and `setObjectSource` calls
      echoed `DS4K907263`

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-247 (table-level
`@Semantics.amount.currencyCode` requires a table-qualified reference, opposite of the CDS-view-level
rule in L-239). Also confirmed and applied L-217/L-218 (table build pattern, mandatory audit block).
