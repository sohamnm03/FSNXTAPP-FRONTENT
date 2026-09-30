# Architecture review — dynamic gateway v2 vs dedicated per-application OData services

- **Date:** 2026-09-15
- **Started:** 18:30  <!-- 24h local, matches the HHmm in this file's name -->
- **System:** DS4_100_NIIF
- **Package:** — (no ABAP object created or changed by this activity)
- **Transport:** — (none; analysis and documentation only)
- **Requested by:** Karthik

## Scope

Answer a standing architecture question raised after the dyngw v2 console went live: for a business
screen, is it better to build against **its own dedicated RAP OData service** (the pattern behind
`zfs_sb_dealid_o4_api`, `zfs_sb_trdflow_o4_api`, `zfs_sb_slcottkdetail_o4_api`,
`zfs_sb_slcdttkdetail_o4_api`) or against the **generic dynamic gateway v2**
(`ZFS_SB_DYNGW_O4_API`) — judged on sustainability, reliability, maintainability, developer
friendliness, best practice and long-term fit.

Also in scope: starting all nine `web/*-console` proxies locally, which is what surfaced the
question.

**Out of scope, explicitly:** no ABAP object was created, changed or activated; no service binding
published; no registry row written; no decommissioning of v1 or v2 proposed or performed. No new
console was built. The `icl-console` recommendation below is a recommendation, not work done.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Individual dedicated endpoint vs dyngw v2 endpoint — which is the better long-term application architecture? | Dedicated RAP service wins on all six criteria; dyngw v2 is a tool for ops/admin/bootstrapping/exploration, not an application architecture. Recorded as **L-527**. | 2026-09-15 |
| 2 | Does `icl-console` get a dedicated service or a dyngw wiring? | Recommended: dedicated service — it is a named business process and currently has no OData layer at all (every screen runs on sample data). **Human decision still open.** | open |
| 3 | Should `ExecuteTableCrud MODIFY` read-merge instead of full-replace (L-520)? | Unchanged by this activity; still the open decision L-520 records. Strengthens the case for dedicated services in the meantime. | open |

## Naming gate

Not applicable — no object created. No `NAMING:` line required.

## Todo

- [x] 1. Start all nine console proxies (`web/*-console/proxy.py`) and confirm each answers on its configured port.
- [x] 2. Read `docs/dyngw-v2-how-it-works.md` in full, including the proved / built-but-unproved / known-limit registers.
- [x] 3. Compare the two calling styles from real source, not from memory — `web/deal-id-console/index.html:257` (typed entity POST) against `web/dyngw-v2-console/index.html:1017` (nested `StepsJson`/`ImportJson`).
- [x] 4. Confirm the service wiring actually in use from all nine `sap_config.json` files.
- [x] 5. Deliver the comparison with an explicit recommendation and a decision rule.
- [x] 6. Record the finding as a lessons-ledger entry (**L-527**) in the same turn.
- [x] 7. Open this worklog file.
- [ ] 8. Human ruling on open question 2 (`icl-console`).

## Console ports started

All nine confirmed HTTP 200 on `127.0.0.1` at 18:30.

| Console | Port | Notes |
|---|---|---|
| ottk-dttk-console | 8765 | |
| dttk-console | 8766 | |
| deal-id-console | 8767 | |
| tf-upload-console | 8768 | |
| inv-console | 8769 | |
| tf-manage-console | 8770 | |
| slc-menu-console | 8771 | pure launch menu, calls no service |
| icl-console | 8772 | **no OData layer yet** — all screens on sample data |
| dyngw-v2-console | 8773 | reaches SAP through dyngw v2 only |

Every console's `sap_config.json` `services` block is deliberately identical (all five routes
exposed); a console using only some of them is normal and an unused route opens no session.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | No SAP object created or changed |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP touched
- [x] Syntax check clean — n/a, no ABAP touched
- [x] Activated, nothing left inactive — n/a, nothing created
- [x] ATC / Code Inspector — n/a, no ABAP touched
- [x] ABAP Unit green — n/a, no ABAP touched
- [x] Text symbols and selection texts maintained — n/a, none involved
- [x] Object list confirmed in the transport — n/a, no transport used

## Findings, in brief

The full argument is in **L-527**. The load-bearing points:

1. Through dyngw the type system moves from the server into the caller's JavaScript — `FieldsJson`
   is a string, nested two levels single-shot and three inside a batch step (L-335/L-472).
2. Business semantics (uniqueness, status transitions, ETag, locks) have no home in dyngw and get
   re-implemented per console.
3. The caller-side known-limit list is long: L-520 (`MODIFY` full-row replace), L-491
   (`FUNC` always needs `AllowWrite`), L-492 (blank `CALL_MODE` → `R` → outside the rollback),
   L-441 (`ZDYNTGT` range silently grants `*`), L-478 (header 045 hides the real cause).
4. Neither dyngw v1 nor v2 is clean-core; a dedicated RAP service survives an ABAP Cloud move.
5. Blast radius: a BO change moves one app, a dispatcher change moves every console at once.
6. dyngw genuinely wins for ops/admin tooling, `REGI` bootstrapping (L-344), prototypes, and cases
   where the audit trail is the product.

**Decision rule proposed:** a screen belonging to a named business process that will still exist
next year gets its own RAP service; exploration, admin and ops use dyngw v2. A console that started
on dyngw and grew into a real app is a signal to build the service, not to add a sixth panel.

## Evidence

Proxy start-up logs (the nine consoles' stdout) were written to the session scratchpad, not to the
repo — they contain nothing beyond the "Open http://localhost:<port>/" banner and are not worth
committing. No screenshots or payload dumps were produced; this activity read source and docs only.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-527**.
