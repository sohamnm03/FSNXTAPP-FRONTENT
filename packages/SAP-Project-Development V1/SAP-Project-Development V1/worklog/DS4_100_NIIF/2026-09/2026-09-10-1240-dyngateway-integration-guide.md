# Dynamic gateway — consumer integration guide

- **System:** `DS4` client `100` (`DS4_100_NIIF`)
- **Date:** 2026-09-10
- **Transport:** none — documentation only, no SAP object created or changed
- **Status:** complete

## Scope

Requested: *"prepare the md file for how to use this odata api documentation (URLS, template,
formats, JSON format to pass) with the test cases so that we can use it in the actual systems."*

Deliverable is a single self-contained consumer document, `docs/dyngateway-integration-guide.md`,
written for someone who has the transport and needs to call the service from outside — including
the install preconditions and an acceptance suite they can run to prove the API works on a new
system before depending on it.

## Why a second document rather than extending `dynamic-gateway-api.md`

`docs/dynamic-gateway-api.md` is the **contract reference** — field by field, exhaustive,
organised by the object model. It answers "what does `CallMode` do?".

A consumer landing on a new system has a different question: "what URL, what body, what do I send
for a `CURR` field, and how do I know it works here?" That is a task-ordered document, and folding
it into the reference would have made both worse. The guide cross-links the reference for depth and
the two run books for worked output; nothing is duplicated as a source of truth — the guide restates
only what a caller must know at the point of calling.

## Contents

| § | Covers |
|---|---|
| 1 | install preconditions, incl. **the allow-list does not travel with the transport** |
| 2 | the URL, its per-system parts, the four action URLs, registry CRUD URLs |
| 3 | basic auth + CSRF/cookie flow |
| 4–5 | the 10-field request template and 8-field response, per-action field meanings |
| 6 | **JSON nesting and escaping** — the three levels, and the ABAP-type → JSON mapping |
| 7 | the seven format mistakes clients actually make |
| 8 | reusable PowerShell and curl clients |
| 9 | copy-paste templates for all four kinds and a mixed batch |
| 10 | registering a target, incl. qualifying a report before registering it as `SUBM` |
| 11 | security model |
| 12 | **acceptance suite** — 11 positive + 15 negative, each with its expected result |
| 13 | troubleshooting table, symptom → cause → fix |
| 14 | known limits |

## Content provenance — nothing invented

Every claim is drawn from something already verified live on `DS4/100` earlier today, not from
inference:

| Claim | Source |
|---|---|
| endpoint, `srvd_a2x`, action namespace | `docs/dynamic-gateway-api.md`, exercised in both run books |
| all 10 fields must be sent; response shape | ibid. |
| `sap-client` on every URL or a misleading 401 | L-253 / L-325 |
| 1-element array collapses in PowerShell 5.1 | L-315 |
| output-only `TABLES` param must be sent as `[]` | L-314 |
| `FieldsJson` mandatory, `.INCLUDE` columns refused | L-316 |
| creating BAPI needs `ExecuteBatch` + `CommitMode`; `ExecStatus` ≠ outcome | L-317 |
| aborted batch → HTTP 400, empty body | L-313 |
| `SALV` covers `REUSE_ALV` and is cheaper | L-330 |
| `CL_GUI_*` is a hard `SUBM` disqualifier | L-321 / L-331 |
| publish via `scripts/sap-gui-publish-service.py`, not `publishServiceBinding` | L-220 / L-232 |
| every negative test's message number | the 10-negative regression in `docs/dyngateway-submit-2026-09-10-1520.md` |
| duplicate-key path, `020` wording | L-312, re-confirmed in today's regression |
| `TargetName` `CHAR(30)`, zero headroom | plan step 1 spike, verified live |

The acceptance suite's expected results are the outputs the regression actually produced, restated
as assertions against a fresh system. `MEMO` is listed as implemented-but-unproven rather than as a
test, because no cooperating report exists and rule 3 forbids creating one.

## The one judgement call worth recording

`ZFS_T_SLC_DYNGW` is `deliveryClass #A`, so the allow-list rows are application data and do **not**
move with the transport. On a newly imported system *every* call answers `017`, which reads as a
broken install rather than as missing configuration. This is a correct design — what QA may reach
is not what production may reach — but it is the first thing a new consumer will hit, so it is
called out three times: precondition 4, a block quote in §1, and the troubleshooting table.

## Objects

None. No SAP object was created, changed or read-locked for this activity.

## Files

| File | Change |
|---|---|
| `docs/dyngateway-integration-guide.md` | **new**, 14 sections |
| `CLAUDE.md` | gateway index row now points at the guide first |
| `lessons/lessons-ledger.md` | L-335 |
| this worklog | new |

## Delivery checks

- [x] Every URL, template and message number traced to an already-verified source (table above)
- [x] No SAP object created or changed — nothing to activate, no ATC, no transport
- [x] Section cross-references renumbered and verified after inserting §6
- [x] Corrected my own error in the summary line: "five step kinds" → four
- [x] Credentials appear only as `$env:GW_USER` / `$env:GW_PASS`; no host, user or password from
      `config/sap-systems.json` or `settings.local.json` is hard-coded — the live host appears once,
      as an example of the part that changes per system
- [x] Ledger entry and worklog in the same turn as the work (agreement 1 and 2)

## Open items

Follow-up URL review completed after Claude's limit interruption: see
`2026-09-10-1248-resume-claude-gateway-urls.md`. Section 2 now includes expanded DS4 action URLs,
discovery, registry CRUD, key forms, query options, URL encoding and observed failure cases.
Standard `$batch` failures are scoped to the tested requests; no universal lack of support is claimed.

- `MEMO` capture remains unproven against a cooperating report.
- Pretty Printer pass over the seven new `ZCL_FS_SLC_GW_*` classes (cosmetic, from the extraction).
- Repo has substantial uncommitted work; committing is the human's call.
