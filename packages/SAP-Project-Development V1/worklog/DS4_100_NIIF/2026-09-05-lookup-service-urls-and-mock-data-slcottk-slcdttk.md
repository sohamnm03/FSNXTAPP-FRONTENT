# Look up SlcOttkDetail/SlcDttkDetail service URLs, create mock entries via both APIs

- **Date:** 2026-09-05
- **System:** DS4_100_NIIF
- **Package:** N/A — no repository object created or changed
- **Transport:** N/A
- **Requested by:** karthik.r@fourthsignal.com

## Scope

1. Determine the live runtime OData V4 service URL for `ZFS_SB_SLCOTTKDETAIL_O4_API` and
   `ZFS_SB_SLCDTTKDETAIL_O4_API` (both published earlier, per `2026-09-04-rap-unmanaged-slcottkdetail.md`
   / `2026-09-04-rap-unmanaged-slcdttkdetail.md`).
2. Create a small set of mock/test data rows in both services via their published OData V4 APIs, on
   request. No ABAP object created or changed — data-only activity.

Out of scope: any behavior-class or CDS change (none needed — both services already carry the
`Zbukrs`-mandatory + `Zdate`/value-positive validations from the 2026-09-04 work).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Neither `adt-mcp` (down this session) nor `mcp-abap-abap-adt-api`'s `bindingDetails`/`objectStructure` tools return the runtime service URL for a service binding. How to get it? | Constructed the standard OData V4 custom-service path and verified live with a `$metadata` GET. First guess (`.../srvd/sap/<service def>/0001/`) failed with a 403 (`/IWBEP/CM_V4_COS/136`); swapping the repository segment to `srvd_a2x` returned 200. Recorded as L-252. | 2026-09-05 |
| 2 | What data to put in the mock rows, given only `Zbukrs` is a hard-required field (service `InsertRestrictions`) plus the `Zdate`-future / value-greater-than-zero validations from the 2026-09-04 build? | Kept it minimal and safe: `Zbukrs` "1000" (verified real company code via `tableContents` on `T001`), a future `Zdate`, a positive value + currency, a `ZottkBank` from the real `Bank` read-only entity set, and a `Zremark` flagging the rows as mock/test data. Left every other (optional, mostly `Computed`) field unset rather than guessing at coded-domain values (`Zstr`, `Ztype`, etc.) that aren't validated by these BOs today but could have hidden checks. | 2026-09-05 |

## Naming gate

Not applicable — no new object created, no existing object changed. Only business data rows were
inserted via the already-published APIs.

## Todo

- [x] 1. Resolve `ZFS_SB_SLCOTTKDETAIL_O4_API` service URL — verified live:
      `https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_slcottkdetail_o4_api/srvd_a2x/sap/zfs_sd_slcottkdetail/0001/`
- [x] 2. Resolve `ZFS_SB_SLCDTTKDETAIL_O4_API` service URL — verified live:
      `https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/zfs_sb_slcdttkdetail_o4_api/srvd_a2x/sap/zfs_sd_slcdttkdetail/0001/`
- [x] 3. `lessons/lessons-ledger.md` L-252 recorded same turn (the `srvd` → `srvd_a2x` gotcha)
- [x] 4. Create 2 mock `SlcOttkDetail` rows via `POST` (CSRF token fetched, `dangerouslyDisableSandbox`
      per L-245, unquoted numeric CURR/DEC fields per L-244) — both succeeded (201), `ZottkNo`
      `100032` and `100033`
- [x] 5. Create 2 mock `SlcDttkDetail` rows the same way — both succeeded (201), `ZdttkNo` `100025`
      and `100026`

## Object list

No repository objects created or changed. Data rows created (test/mock data, left in the system on
request — not cleaned up, unlike the validation-testing rows in the 2026-09-04 worklogs):

| Entity | Key | Zbukrs | Value | Currency | Zdate | Zremark |
|---|---|---|---|---|---|---|
| SlcOttkDetail | ZottkNo 100032 | 1000 | 100000 | USD | 2026-12-31 | Mock test entry 1 - created via API |
| SlcOttkDetail | ZottkNo 100033 | 1000 | 250000 | INR | 2027-01-15 | Mock test entry 2 - created via API |
| SlcDttkDetail | ZdttkNo 100025 | 1000 | 100000 | USD | 2026-12-31 | Mock test entry 1 - created via API |
| SlcDttkDetail | ZdttkNo 100026 | 1000 | 250000 | INR | 2027-01-15 | Mock test entry 2 - created via API |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP source touched
- [x] Syntax check clean — n/a
- [x] Activated, nothing left inactive — n/a
- [x] ATC / Code Inspector — n/a
- [x] ABAP Unit — n/a
- [x] Text symbols and selection texts — n/a
- [x] Object list confirmed in the transport — n/a, no transport involved
- [x] Live functional test — the mock-data creation itself was the live test; all 4 `POST`s returned
      201 with the expected field values echoed back

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-252.
