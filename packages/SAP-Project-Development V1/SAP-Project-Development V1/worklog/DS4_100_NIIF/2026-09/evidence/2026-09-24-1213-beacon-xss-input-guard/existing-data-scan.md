# Existing-data scan for `<` / `>` (2026-09-24, DS4_100_NIIF)

Read-only. Exported via `context/sap-bapis/scripts/adt-sql.ps1` in batches of <= 8 columns (a
longer select list makes the ADT data-preview service dump: "Invalid access to a string using
negative offset"). Scanned locally, then the raw exports were **deleted**, not committed, because they
hold loan account numbers.

| Table | Rows | Text columns scanned | Rows containing `<` or `>` |
|---|---|---|---|
| ZFS_T_072 | 122 | 35 (every CHAR column except MANDT and the audit include; TIMESTAMP is numeric) | **0** |
| ZFS_T_091 | 53 | 8 | **0** |

Result: no stored markup, so no clean-up is needed.
