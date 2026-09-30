# dyngw v2 — new step kind for calling released SAP APIs (design)

- **Date:** 2026-09-14
- **Started:** 15:25
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW (proposed — nothing created yet)
- **Transport:** — (none yet; no objects created)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Add a sixth step kind to dynamic gateway v2 so a caller can invoke a **released SAP API** — the
`A_*` CDS entities behind the `API_*` services — and have it work **inside `ExecuteBatch`**.

**Status: design only.** Per the brainstorming gate, **no object has been created or changed on
DS4**. A feasibility spike was run using `syntaxCheckCode` against source that was never saved.
Implementation starts only after the human approves the design below.

Classified **architectural**, not bounded: it extends the `StepsJson` `Kind` contract, the
`ZFS_DO_DYN_KIND` domain, the `ZDYNKIND` authorization field, the dispatch path, phase-1 validation
and the batch LUW/commit semantics of a security-sensitive component.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | HTTP transport or in-process EML? | **EML, in-LUW** — HTTP cannot join the batch LUW | 2026-09-14 |
| 2 | Is dynamic EML available on this release? | **Yes** — 7.58; `READ/MODIFY ENTITIES OPERATIONS` compile clean | 2026-09-14 |
| 3 | Step-kind code — `ENTY` or `ODAT`? | Proposed `ENTY`; `ODAT` would be misleading (nothing HTTP happens) | pending |
| 4 | Support draft-enabled BOs? | Proposed **no** — fail closed; draft needs human confirmation (rule 7) | pending |
| 5 | Which target proves the write path? | Proposed `A_PaymentAdvice_2` (transactional); TRM's API is read-only | pending |

## Spike findings (2026-09-14, no objects created)

1. **TRM's flagship API is read-only.** `A_FinTransIntrstRateInstr` is
   `provider contract transactional_query` — no write operations exist to call. `QURY` on that
   entity already covers reads and is proved.
2. **FI has genuinely transactional APIs** — `A_PaymentAdvice_2` carries
   `usage.type: [#TRANSACTIONAL_PROCESSING_SERVICE]`; `API_MANUALACCRUALS`, `API_PAYMENTADVICE`,
   `API_FIXEDASSETUSAGEOBJECT` and others are the real write candidates.
3. **HTTP is structurally incompatible with the batch requirement** — a separate session, its own
   LUW, always out-of-LUW, never rollback-able by the framework.
4. **Dynamic EML works on 7.58.** `READ ENTITIES OPERATIONS` / `MODIFY ENTITIES OPERATIONS` over
   `ABP_BEHV_RETRIEVALS_TAB` / `ABP_BEHV_CHANGES_TAB` syntax-check clean.
5. **`ENTITY_NAME` is `CHAR30`, identical to `TARGET_NAME`** — so the registry table needs **no DDIC
   change**, and the target is a name rather than a URL, which removes the SSRF surface entirely.

Recorded as **L-511**.

## Naming gate

To be recorded per object **before** any create call. Proposed, validated against
`docs/naming-conventions.md`:

```
NAMING: ZCL_FS_DYN_ENTITY   -> matches Class `ZCL_FS_<AREA>_<NAME>` (area DYN)
NAMING: ZFS_DO_DYN_KIND     -> existing domain, value added, no new name
NAMING: ZFS_TRM_MSG 050+    -> existing message class (listed naming exception)
```

## Todo

- [x] 1. Classify the request and announce the path (architectural)
- [x] 2. Explore how step kinds work today (registry, domain, dispatch, LUW rules)
- [x] 3. Spike: is dynamic EML possible on this release? — **yes**, via `syntaxCheckCode`, no object saved
- [x] 4. Establish whether the target APIs are writable at all — TRM no, FI yes
- [x] 5. Ledger entry L-511
- [ ] 6. **Human approves the design** ← gate; nothing is created before this
- [ ] 7. Write the spec to `docs/superpowers/specs/`
- [ ] 8. Implementation plan (writing-plans skill)
- [ ] 9. Build: messages, domain value, `ZCL_FS_DYN_ENTITY`, dispatch + validation changes
- [ ] 10. Prove: read step, write step, and a mixed `ExecuteBatch` with rollback

## Object list

**Nothing created yet.** Proposed, pending approval:

| Object | Type | Route | Package | Status |
|---|---|---|---|---|
| `ZFS_TRM_MSG` 050+ | MSAG | `mcp-abap-abap-adt-api` (change; confirmed `adt-mcp` gap) | — | proposed |
| `ZFS_DO_DYN_KIND` + `ENTY` | DOMA | `mcp-abap-abap-adt-api` (change) | ZFS_DYN_GW | proposed |
| `ZCL_FS_DYN_ENTITY` | CLAS | `adt-mcp` (create) | ZFS_DYN_GW | proposed |
| `ZCL_FS_DYN_DISPATCH` | CLAS | `mcp-abap-abap-adt-api` (change) | ZFS_DYN_GW | proposed |

## Delivery checks

Not applicable yet — design stage, nothing built.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-511**.
