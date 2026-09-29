# Message Catalog — `ZFS_TRM_MSG` on `DS4_100_TFSIN`

Local mirror of message class **`ZFS_TRM_MSG`** on `DS4_100_TFSIN`. Same rules as
[`DS4_100_NIIF.md`](DS4_100_NIIF.md): pick from here, don't query `T100` routinely, the system wins on
a contradiction. Numbers are **per system** (L-234): nothing here means the same as NIIF's numbers.

## Verification status

| | |
|---|---|
| Class | `ZFS_TRM_MSG` — "TRM Project Message Class", package `ZFS_ALM_API`, transport `DS4K907106` |
| Created | 2026-09-26 (the class did not exist before, L-590) |
| Messages on the system | 001–028 (023–028 added 2026-09-28 for the ALM 3 Quarterly Report, verified in `T100`; 017–022 added 2026-09-28 for the ALM 2 Quarterly Report, verified in `T100`; 011–016 added 2026-09-27 for the ALM 1 Quarterly Report, verified in `T100`; 008–010 added 2026-09-27 for ALM 1 Manual Data, verified in `T100`; `E071`: MSAG on tasks `DS4K907107` and `DS4K907108`), 006–007 added 15:5x for Report Formats, 001–005 created 2026-09-26 after the human released the edit lock (L-591). Verified by a `T100` read the same day |

## Messages

| No. | Intended type | Text | Status | Used by |
|---|---|---|---|---|
| 001 | E | `&1 &2 already exists` | on system | ALM Data Sources BOs (create) |
| 002 | E | `&1 &2 does not exist` | on system | ALM Data Sources BOs (update/delete, reference checks) |
| 003 | E | `&1 is required` | on system | ALM Data Sources BOs (mandatory fields) |
| 004 | E | `&1 &2 is locked by user &3` | on system | ALM Data Sources BOs (lock) |
| 005 | E | `Lock for &1 &2 could not be set` | on system | ALM Data Sources BOs (lock, technical failure) |
| 006 | E | `&1 must be &2` | on system | ALM Report Formats BOs (GroupId must equal the value derived from the parts) |
| 007 | E | `&1 must not contain &2` | on system | ALM Report Formats BOs (`:` in a group part) |
| 008 | E | `Period &1/&2 of company code &3 is locked` | on system | ALM 1 Manual Data BO (`/FS00/ALMTR012` period lock; &1 month, &2 year) |
| 009 | E | `Group &1 has source &2; only source 92 is keyed in manually` | on system | ALM 1 Manual Data BO (source-92 rule of `/FS00/ALMR029`) |
| 010 | E | `Month &1 is not valid; enter 01 to 12` | on system | ALM 1 Manual Data BO (FiscalPeriod range) |
| 011 | E | `ALM 1 data of &1/&2 for company code &3 is already saved` | on system | ALM 1 Quarterly Report, action Save (`/FS00/ALMTR014` has the period) |
| 012 | E | `ALM 1 data of &1/&2 for company code &3 is not saved` | on system | ALM 1 Quarterly Report, actions Lock / DeleteSnapshot |
| 013 | E | `No authorization to save ALM 1 data` | on system | ALM 1 Quarterly Report, Save (`ZFS_ALM_S1` 01, when the object exists) |
| 014 | E | `No authorization to lock ALM 1 data` | on system | ALM 1 Quarterly Report, Lock (`ZFS_ALM_L1` 05, when the object exists) |
| 015 | E | `No authorization to delete ALM 1 data` | on system | ALM 1 Quarterly Report, DeleteSnapshot (`ZFS_ALM_D1` 06, when the object exists) |
| 016 | E | `ALM 1 report of &1/&2 for company code &3 has no amounts to save` | on system | ALM 1 Quarterly Report, Save with no amounts |
| 017 | E | `ALM 2 data of &1/&2 for company code &3 is already saved` | on system | ALM 2 Quarterly Report, action Save (`/FS00/ALMTR015` has the period) |
| 018 | E | `ALM 2 data of &1/&2 for company code &3 is not saved` | on system | ALM 2 Quarterly Report, actions Lock / DeleteSnapshot |
| 019 | E | `No authorization to save ALM 2 data` | on system | ALM 2 Quarterly Report, Save (`ZFS_ALM_S1` 01, when the object exists) |
| 020 | E | `No authorization to lock ALM 2 data` | on system | ALM 2 Quarterly Report, Lock (`ZFS_ALM_L1` 05, when the object exists) |
| 021 | E | `No authorization to delete ALM 2 data` | on system | ALM 2 Quarterly Report, DeleteSnapshot (`ZFS_ALM_D1` 06, when the object exists) |
| 022 | E | `ALM 2 report of &1/&2 for company code &3 has no amounts to save` | on system | ALM 2 Quarterly Report, Save with no amounts |
| 023 | E | `ALM 3 data of &1/&2 for company code &3 is already saved` | on system | ALM 3 Quarterly Report, action Save (`/FS00/ALMTR016` has the period) |
| 024 | E | `ALM 3 data of &1/&2 for company code &3 is not saved` | on system | ALM 3 Quarterly Report, actions Lock / DeleteSnapshot |
| 025 | E | `No authorization to save ALM 3 data` | on system | ALM 3 Quarterly Report, Save (`ZFS_ALM_S1` 01, when the object exists) |
| 026 | E | `No authorization to lock ALM 3 data` | on system | ALM 3 Quarterly Report, Lock (`ZFS_ALM_L1` 05, when the object exists) |
| 027 | E | `No authorization to delete ALM 3 data` | on system | ALM 3 Quarterly Report, DeleteSnapshot (`ZFS_ALM_D1` 06, when the object exists) |
| 028 | E | `ALM 3 report of &1/&2 for company code &3 has no amounts to save` | on system | ALM 3 Quarterly Report, Save with no amounts |

`&1` is always a technical entity-set or property name (`DataSource`, `SourceGroup`…), `&2` the key
value(s), composite keys joined with `/`.

**Next free number: 029**
