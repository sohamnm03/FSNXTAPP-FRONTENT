# Message catalogs — one file per SAP system

Each file here mirrors the `ZFS_TRM_MSG` message class on **one specific system** from
`config/sap-systems.json` (`systems[].id`). Message numbers, texts and the "next free number"
counter are per-system state — never assume a number means the same thing on two systems, even
if both happen to use the same class name.

| System | File |
|---|---|
| `DS4_100_NIIF` (default, enabled) | [`DS4_100_NIIF.md`](DS4_100_NIIF.md) |
| `DS4_100_TFSIN` | [`DS4_100_TFSIN.md`](DS4_100_TFSIN.md) |

When a task targets a system with no file here yet, create `<system-id>.md` following the
existing file's structure before adding the first message row.
