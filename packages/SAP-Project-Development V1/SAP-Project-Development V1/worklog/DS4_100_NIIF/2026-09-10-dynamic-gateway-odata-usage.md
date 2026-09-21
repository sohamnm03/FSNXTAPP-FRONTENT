# Dynamic gateway OData parameter usage

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF
- **Package:** ZFS_SLC_BTP
- **Transport:** None — read-only usage guidance
- **Requested by:** human

## Scope

Confirm how a consumer passes action parameters to the published OData V4 service binding
`ZFS_SB_DYNGATEWAY_O4_API`. No SAP objects or repository source are changed.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which published service/version is exposed by the binding? | `ZFS_SD_DYNGATEWAY`, version `0001`, OData V4 | 2026-09-10 |

## Naming gate

Not applicable — no object creation or change.

## Todo

- [x] 1. Read the existing dynamic-gateway worklog and API contract.
- [x] 2. Verify the service binding is published and identify its service version.
- [x] 3. Provide request URL, CSRF flow, and action payload examples.

## Object list

No objects created or changed.

## Delivery checks

- [x] No source or SAP object changes
- [x] Binding publication verified (`isPublished: true`)
- [x] OData version and service version verified

## Outcome

Answered live against `DS4/100`, every example executed and its real output captured:

| Shape | Verified |
|---|---|
| `RunQuery` — one table, 3 fields, EQ filter, DESC sort, cap 3 | `ExecStatus=S`, 2 rows, 55 ms |
| `ExecuteBatch` — table **and** CDS view in one call | `overall=S`, 2 steps, 222 ms, both row sets returned |
| `CallFunctionModule` — `DATE_GET_WEEK` | `ExportJson={"WEEK":202637}` |
| `GET DynGateway` — registry listing, no CSRF | 8 rows |

The full consumer reference now lives in **`docs/dynamic-gateway-api.md`** (endpoint, CSRF flow,
per-action payloads, batch step array, registry CRUD, messages, known limits), with an index row
added to `CLAUDE.md`. This worklog is the record that the guidance was verified rather than
written from memory.

Key points a consumer gets wrong most often, all confirmed here:

1. `srvd_a2x`, not `srvd`, in the URL (L-252).
2. `sap-client=100` on **every** call including `$metadata` and the CSRF fetch (L-253).
3. The `*Json` fields are **strings containing JSON** — build them with a serialiser, not by hand.
4. `MaxRows` is an unquoted number (L-244).
5. A refusal is HTTP **200** with `ExecStatus='E'`; only an aborted batch is a real HTTP error.

## Lessons raised

None new — this activity consumed L-244, L-252, L-253, L-310..L-313 rather than adding to them.
