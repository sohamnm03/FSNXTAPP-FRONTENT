# SLC TSF partner bank details — CDS view entity + OData V4 Web API

- **Date:** 2026-09-24
- **Started:** 16:20
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_APP
- **Transport:** DS4K907209 ("SLC FY:26 demo"; FS_DEV3 task DS4K907260)
- **Requested by:** human (pasted Open SQL snippet, S 4000029751 / 4000014578)

## Scope

Rebuild the pasted Open SQL (`VTBSTC1` ⟕ `BUT0BK` ⟕ `BNKA`, filtered on partner, company code and
`zahlvid = c_tsf_slc`) as a read-only CDS view entity. Expose it through a service definition and an
OData V4 Web API binding, then activate and publish it. Out of scope: any behaviour definition or
write capability, UI annotations and metadata extensions, DCL, and changing the calling program.

Design:
- `BUT0BK` + `BNKA` are replaced by the released `I_BusinessPartnerBank`, which already carries
  `BankName` from `BNKA` via `_Bank` on the same `bankl`+`banks` join (CLAUDE.md #9).
- `VTBSTC1` has no released CDS equivalent, so the view selects from the table directly.
- `lv_partner` / `gv_bukrs` are runtime inputs, so they become OData `$filter` on the key fields,
  not a view-level `where`. The constant `c_tsf_slc` becomes a view-level `where zahlvid = 'TSF-SLC'`.
- `select distinct` is used because `VTBSTC1` is keyed by currency as well, so the join repeats
  across currencies exactly as the original `INTO TABLE` did. The key is Partner + CompanyCode + BankIdentification.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Service style: RAP V4 binding, V2 binding, or legacy `@OData.publish: true`? | RAP V4 binding (recommended option) | 2026-09-24 |
| 2 | Value of `c_tsf_slc`? | Not supplied. Inferred as `'TSF-SLC'`: `VTBSTC1` holds the zahlvid values `1`, `AUD1`, `IN`, `INR`, `MAIN`, `OUT` and `TSF-SLC` (3 rows), and only `TSF-SLC` fits the constant name. **Human to confirm.** | — |
| 3 | The original query aliases `BUT0BK-BKVID AS bvtyp` and ignores `VTBSTC1-BVTYP`, so it returns **every** bank detail of the partner, not just the one the standing instruction names. Mirrored faithfully. Should the join also be restricted on `VTBSTC1-BVTYP = BUT0BK-BKVID`? | open | — |

## Naming gate

```
NAMING: ZFS_I_SlcTsfBpBank -> matches CDS "Interface (basic/composite) view ZFS_I_<Entity>" (read-only, no TP)
NAMING: ZFS_SD_SLCTSFBPBANK -> matches "Service definition ZFS_SD_<Entity>"
NAMING: ZFS_SB_SLCTSFBPBANK_O4_API -> matches "Service binding ZFS_SB_<Entity>_<O4>_<API>" (26 chars, at the 26-char cap)
```

## Todo

- [x] 1. Create DDLS `ZFS_I_SlcTsfBpBank` on DS4K907209 (`mcp-abap-abap-adt-api createObject` +
      transport, per L-546); `transportInfo` shows DS4K907209 / task DS4K907260
- [x] 2. Wrote the source and activated it. The first activation warned that the label was 41 chars (max 40);
      shortened and re-activated. Remaining warnings: search help not inherited for
      `CompanyCode`/`BankCountryKey`, benign. `runQuery` on the view returns the 3 TSF-SLC rows
- [x] 3. Created, wrote and activated SRVD `ZFS_SD_SLCTSFBPBANK` (exposes the view as `SlcTsfBpBank`); on DS4K907209
- [x] 4. Created SRVB `ZFS_SB_SLCTSFBPBANK_O4_API` (OData V4 - Web API) via `adt-mcp create_object`.
      `mcp-abap-abap-adt-api createObject` has no binding-type/service-definition parameters, so it
      cannot create a binding (rule-5 routing, which is the default here). `transportInfo` shows DS4K907209 (L-564). Activated
- [x] 5. Published via `scripts/sap-gui-publish-service.py --group-id ZFS_SB_SLCTSFBPBANK_O4_API --yes`:
      `"New service group(s) successfully published"`, `ok: true`, `still_in_unpublished_list: false`
- [x] 6. Live GET smoke test (sandboxed PowerShell, sap-client=100): `$metadata` 200, entity set 200,
      `$filter=BusinessPartner eq '0400000006' and CompanyCode eq 'SG03'` 200 with 1 row

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_I_SlcTsfBpBank | DDLS/DF | ZFS_SLC_APP | DS4K907209 (task DS4K907260) | active |
| ZFS_SD_SLCTSFBPBANK | SRVD/SRV | ZFS_SLC_APP | DS4K907209 (task DS4K907260) | active |
| ZFS_SB_SLCTSFBPBANK_O4_API | SRVB/SVB | ZFS_SLC_APP | DS4K907209 (task DS4K907260) | active, **published** |

## Delivery checks

- [x] Syntax check clean (activation: warnings only, no errors)
- [x] Activated, nothing left inactive (`inactive: []` on all three)
- [x] Published, `$metadata` + entity set GET return 200
- [x] ABAP Unit: none applicable (a read-only CDS view with no behaviour)
- [x] Text symbols: none applicable
- [x] Object list confirmed in the transport (`transportInfo` per object)
- [ ] ATC: not run

## Service

`/sap/opu/odata4/sap/zfs_sb_slctsfbpbank_o4_api/srvd_a2x/sap/zfs_sd_slctsfbpbank/0001/SlcTsfBpBank?sap-client=100`

Replacement for the Open SQL: `...SlcTsfBpBank?$filter=BusinessPartner eq '<lv_partner>' and CompanyCode eq '<gv_bukrs>'`.

Findings from the test:
- The 3 current TSF-SLC rows (BP 0400000005/AE13, 0400000006/AE13, 0400000006/SG03) come back with
  empty bank fields. `BUT0BK` has **no rows** for either partner, so the original Open SQL would return
  the same thing. This is not a view defect.
- `BusinessPartner` is serialised as `400000006` because the ALPHA exit strips the leading zero. A `$filter` with the padded
  `'0400000006'` still matches.

## Evidence

`evidence/2026-09-24-1620-slc-tsf-bp-bank-cds-odata/`: `metadata.xml`, `all.json`, `filtered.json`.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-564
