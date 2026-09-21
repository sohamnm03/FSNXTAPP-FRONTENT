# Create table ZFS_T_XA_DUMMY (srno, partner) in package ZFS_DUMMY

- **Date:** 2026-09-17
- **System:** DS4_100_NIIF
- **Package:** ZFS_DUMMY (pre-existing, "package for testing")
- **Transport:** not yet created — blocked before the transport step
- **Requested by:** adil.a@fourthsignal.com

## Scope

Human asked for a custom table `zfs_dummy_details` with two columns `srno` and `partner` under the
`zfs_dummy` package. Requested name did not conform to `docs/naming-conventions.md`
(`ZFS_T_<AREA>_<NAME>`, max 16 chars) — no `_T_` tier marker, no AREA code. Human chose the
conformant alternative `ZFS_T_XA_DUMMY` (AREA=XA, cross-app) when asked. Out of scope: any RAP
layer, CDS views, or generators — table only.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Requested name `ZFS_DUMMY_DETAILS` doesn't match `ZFS_T_<AREA>_<NAME>` — how to proceed? | Use `ZFS_T_XA_DUMMY` | 2026-09-17 |

## Naming gate

```
NAMING: ZFS_T_XA_DUMMY -> matches pattern row "Transparent table | ZFS_T_<AREA>_<NAME>" (AREA=XA, cross-app), docs/naming-conventions.md §Dictionary
```

## Todo

- [x] 1. Validate package (ZFS_DUMMY exists, confirmed via searchObject)
- [x] 2. Naming gate — ask human on mismatch, record answer
- [ ] 3. Create table skeleton via `adt-mcp` (BLOCKED — see below)
- [ ] 4. Set full field source via `mcp-abap-abap-adt-api setObjectSource` (business fields srno,
      partner + 5 mandatory audit fields per `docs/ddic-table-template.md`)
- [ ] 5. Activate

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_T_XA_DUMMY | TABL/DT | ZFS_DUMMY | — | **Blocked, not created** |

## Delivery checks

- [ ] Pretty Printer
- [ ] Syntax check clean
- [ ] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved
- [ ] ABAP Unit green (or "none applicable" with a reason)
- [ ] Text symbols and selection texts maintained
- [ ] Object list confirmed in the transport

## Blocker

`adt-mcp` had lost its VS Code ADT project/destination context (per `lessons/lessons-ledger.md`
L-333). `abap_list_destinations` returned `[]`; `abap_creation-get_all_creatable_objects` failed
identically for both `DS4_100_NIIF` and the pinned `abap-adt-ds4-100-tfsin` with
`Cannot invoke IProject.getSessionProperty(...) because "project" is null`. `TABL/DT` is not a
confirmed rule-5 fallback case (only `MSAG/N` and `TRAN/T` are), so `mcp-abap-abap-adt-api` cannot
legitimately be used to create it instead. No object was created. Recovery requires the VS Code ADT
project to be reopened/refreshed, or the `adt-mcp` server restarted — not fixable from inside this
session. Reported to the human; **no workaround or substitute object was created** (L-216).

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-338
