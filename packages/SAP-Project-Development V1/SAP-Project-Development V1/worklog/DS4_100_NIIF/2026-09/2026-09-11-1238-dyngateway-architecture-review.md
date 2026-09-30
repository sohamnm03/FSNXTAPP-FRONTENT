# Dynamic gateway architecture and performance review

- Date: 2026-09-11
- System: DS4_100_NIIF (S/4HANA on-premise, DS4/100)
- Package: ZFS_SLC_BTP
- Transport: none; read-only SAP review
- Requested by: human; review ZFS_SB_DYNGATEWAY_O4_API, including faster execution and latest standards

## Scope

Inspect live gateway implementation and assess correctness, security, performance, scalability and current SAP guidance. No SAP source, configuration, registry or business-data changes authorized by this review. Review uses live source plus explicitly identified prior test evidence. It is not a penetration test or load benchmark.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Required throughput, payload distribution and latency SLO | Not supplied; no numerical speedup or capacity claim | |
| 2 | Atomicity versus durable failure logging | Existing unresolved L-350 decision; recommendation below | |
| 3 | Production authorization object and roles | AUTH currently fail-closed, OPEN explicitly approved for development | |
| 4 | Contract changes | Paging, async jobs and idempotency need separate version/republish decision | |

## Naming gate

NAMING: N/A -> read-only review; no SAP artifact creation or rename.

## Todo

- [x] 1. Read handover and applicable lessons.
- [x] 2. Retrieve live handler, runtime, policy, RAP behavior, CDS and DCL source.
- [x] 3. Separate confirmed source findings from prior test results and untested risks.
- [x] 4. Check SAP primary guidance for current architectural and performance recommendations.
- [x] 5. Record prioritized findings and verification plan.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_SB_DYNGATEWAY_O4_API | SRVB | Existing | None | Review target |
| ZFS_I_DynGateway | DDLS, DCLS, BDEF | Existing | None | Source inspected |
| ZBP_FS_DYNGATEWAYTP | CLAS implementation include | Existing | None | Source inspected |
| ZCL_FS_SLC_GW_DISPATCH / LOG / REGISTRY | CLAS | Existing | None | Source inspected |
| ZCL_FS_SLC_GW_TABLE / RUNTIME / REGI / REGPOL | CLAS | Existing | None | Source inspected |
| ZCL_FS_GW_HANDLER_FACTORY | CLAS | Existing | None | Source inspected |

## Executive assessment

Keep the useful handler/runtime separation, allow-list, two-phase validation and existing regression investment. Do not replace the framework wholesale. Production readiness is presently constrained more by transaction and authorization boundaries than by class-level coding style. OData V4 and `strict (2)` do not by themselves establish clean-core compliance, transaction safety or scalability.

Sources changed during the review, and the implementation handover was also updated by another session. Findings describe retrieved versions, not a frozen release. No new ATC or load run is claimed here.

## Priority findings

### P0: Restore a trustworthy transaction boundary

Evidence: DISPATCH abort handling invokes LOG~emit_durable, which calls an RFC destination before the behavior pool fails the action. L-350 and the completion worklog record a live duplicate-insert batch where the first data row survived the abort. This is prior measured evidence, not a newly executed destructive test.

Recommendation: never promise all-or-nothing across RAP, RFC business calls and report execution. Stage transactional changes and persist within the RAP save sequence. Keep failure telemetry outside the transaction through a reviewed mechanism that cannot commit the caller. A transactional outbox is appropriate for successful-commit events; it does NOT preserve failure events when the transaction rolls back. Likewise, a queued/background unit registered in the doomed LUW is not automatically durable after rollback. Validate failure logging and business rollback separately before selecting a mechanism.

Additional source risk: TABLE raises an error after INSERT ACCEPTING DUPLICATE KEYS, while DISPATCH~run_single converts the error to a normal response and the single-action behavior method does not populate failed. A multi-row insert can therefore report failure after writing a subset. Reproduce in an explicitly authorized isolated acceptance test, then make atomic versus partial-success behavior explicit.

### P0: Apply one authorization policy to every administration route

Evidence: REGPOL has `c_active_mode = 'OPEN'` by approved development decision; AUTH rejects all requests until implemented. The behavior pool grants requested create/update/delete unconditionally. DCL contains `grant select on ZFS_I_DynGateway;` without a restriction. The CDS uses #NOT_REQUIRED; this annotation is not itself a security filter, and the existing DCL is unrestricted.

Recommendation: separate administrator, executor and auditor permissions. Apply administration checks to REGI AND ordinary entity CRUD. Switching REGI to AUTH/OFF alone does not close CRUD. Scope execution to the caller and permitted target/action. Prevent generic TABL/FUNC routes from modifying the registry, policy or audit store, including calls to internal wrapper FMs. Confirm service-level roles as an additional layer; source evidence does not establish anonymous accessibility.

Evidence: create only defaults an empty entry_type; update can change it; delete filters only UUID. Readonly log fields do not prevent deleting a log row or converting its type. Separate registry and audit projections and enforce the type on the server. Verify actual projection exposure before claiming every interface field is externally visible.

### P1: Bound memory and execution cost while retaining bulk retrieval

Evidence: RUNTIME~select_rows explicitly omits UP TO when max=0 and fills an internal table. This is an intentional, human-requested feature (L-356), not an accidental bug. TABLE deserializes the entire ImportJson into an internal table. DISPATCH parses the full StepsJson before running steps.

Recommendation: preserve all-rows use cases through an authorized bulk-export path; introduce explicit synchronous budgets for payload bytes, batch steps, write rows, response bytes and execution time. Page interactive reads with stable, unique ordering and continuation state. Enforce limits before expensive deserialization where possible and recheck decoded sizes. MaxRows bounds returned rows, not necessarily database scan cost or report runtime.

Do not silently impose a new cap on current consumers. Paging/async contracts need the outstanding versioning decision. For very long jobs use an approved background-job API available on this installed release, returning a job/correlation identifier with status and result retrieval. No new job objects are proposed for creation in this review.

### P1: Reduce avoidable serialization and logging work

Evidence: DISPATCH~finish serializes the full request and concatenates result JSON before checking level_allows. LOG~apply_caps can then discard a successful query response. LOG~step_rows separately concatenates and caps query results without applying that same suppression or per-target log level.

Recommendation: decide logging policy before constructing payload copies; serialize once; retain counts, timings and correlation identifiers by default; redact sensitive values; use the same policy for call and step rows. Preserve required registration audit independently of optional diagnostic logging. Cap a valid structured envelope, not an arbitrary substring of JSON. Current cap uses strlen (characters), labels the result bytes, and appends a marker beyond the nominal cap.

Separate the small registry from high-growth logs as a planned schema migration. Define retention, archival and access controls. Inspect SQL traces and existing indexes before adding indexes; no missing-index or full-scan claim has been proven here.

### P1: Make registration concurrency safe

Evidence: REGI checks existence in prepare, allocates UUID, then INSERTs in execute. UPDATE reads committed_row and later writes the full prepared row. The inspected handler contains no logical target lock. The pool lock is UUID-based. A uniqueness guarantee on kind/name was not established in this review.

Recommendation: verify DDIC indexes; enforce one registration per client/kind/name with an appropriate uniqueness design and locking/version checks. Test concurrent inserts and conflicting updates. Define ordered overlay semantics: UPDATE after an earlier pending INSERT currently reads committed state, not that pending row; two partial updates can also prepare from the same committed snapshot. These are source-derived risks, not concurrency test results.

### P2: Finish the interface migration, not another framework rewrite

Evidence: factory creates a handler, but DISPATCH still uses static prepare/execute for FUNC/TABL/QURY/SUBM. Those wrappers each allocate another handler and default runtime. REGI alone uses the factory-created instance directly. Both plan and run still CASE on kind, so the comment that a new kind needs only a factory row is not yet true.

Recommendation: prepare and execute the same interface instance; provide one request-scoped runtime/context with fresh stateful handlers per step. Keep authorization in an explicit policy boundary. Remove wrappers only after equivalence and injection tests. This reduces allocations and branching but is expected to be a smaller latency improvement than SQL, RFC or payload work; measure it.

## Rule-based review appendix

| Severity | Object / method | Rule | Evidence and concrete correction |
|---|---|---|---|
| Critical | RUNTIME; behavior transaction flow | ABAP Cloud / RAP transaction boundaries | RFC DESTINATION, dynamic FM and BAPI transaction calls are in the approved Standard ABAP compatibility path. Do not label it ABAP Cloud because DEFAULT ATC is clean. Move new business behavior to released APIs/RAP; validate API release state individually. |
| Major | ZFS_I_DynGateway DCL; pool authorization | Authorization checks | Unrestricted grant and unconditional CRUD authorization; implement caller-specific policy and restrictive access rules. |
| Major | DISPATCH~plan/run | Small single-purpose methods and polymorphic design | Repeated kind switches plus static wrappers; delegate prepare/execute to the same handler while retaining centralized policy. |
| Major | TABLE/REGI JSON parsing | Catch specific exceptions | `CATCH cx_root` maps all caught failures to invalid JSON; catch parser-supported exception types, preserve previous cause, distinguish programming faults from client validation errors. |
| Major | Pool~create | Workspace message-class rule | `new_message_with_text( text = 'UUID could not be generated' )`; use an appropriate catalogued ZFS_TRM_MSG message, creating none during this review. |
| Minor | LOG~cap | Clear contract/naming | Character count reported as bytes and appended marker exceeds cap; define byte/character semantics and use a structured truncation flag. |

Scope limitation: this is not a complete C1 API-release audit or full object-by-object ATC remediation. No SAP standard modification was observed in inspected code; this does not establish system-wide absence.

## Out-of-scope observations: current standards and measurement plan

The following architectural improvements extend beyond the Clean ABAP rules and need explicit design/contract decisions before implementation:

1. Prefer typed RAP OData V4 entities/actions backed by released CDS/APIs for high-volume stable business use cases. Keep the generic gateway a controlled compatibility boundary. Embedded JSON action parameters do not become typed OData query properties automatically.
2. Add idempotency for retryable writes: key scoped to caller and operation, payload hash, atomic duplicate reservation and retention. A correlation UUID alone does not prevent a retried posting.
3. Do not parallelize dependent batch writes or shared RFC-session work. Consider bounded independent reads only after isolation and authorization are proven.
4. Use edge quotas/spike protection where infrastructure exists; they supplement, not replace, ABAP resource budgets.
5. Baseline representative QURY/FUNC/TABL/SUBM requests, small/large payloads, cold/warm execution and gradual concurrency in a safe environment. Record p50/p95/p99, errors, DB time/rows, ABAP CPU, RFC time, JSON/log time and memory. Set workload-specific SLOs; no invented percentage improvement.
6. Trace SQL before changing CDS/indexes. Push selective filters, projection and aggregation to the database where supported. Avoid speculative cross-user data caches; cache immutable metadata request-locally first, with authorization checks and invalidation for any longer-lived cache.
7. Verify installed S/4HANA and ABAP Platform versions before choosing a newer API or feature. Cloud documentation is design guidance, not proof that an API is released on NIIF.

SAP primary references checked during review:

- [RAP transaction model](https://help.sap.com/docs/abap-cloud/abap-keyword/rap-transaction)
- [SAP Extension Architecture Guide, 2025](https://help.sap.com/doc/1e322967d9ef4d788c4165c9aed88c78/Cloud/en-US/892cd77faccc4c959ca87aa600e40eac.pdf)
- [RAP unmanaged query implementation](https://help.sap.com/docs/abap-cloud/abap-rap/implementing-unmanaged-query)
- [RAP paging interface](https://help.sap.com/docs/abap-cloud/abap-rap/interface-if-rap-query-paging)
- [SAP performance analysis tools](https://help.sap.com/docs/abap-cloud/abap-data-models/tools-for-performance-analysis)
- [API Management spike arrest](https://help.sap.com/docs/sap-api-management/sap-api-management/spike-arrest)

## Recommended sequence and acceptance gates

1. Transaction/authorization decision and fixes: failed batch leaves no business changes; failure telemetry cannot commit them; unauthorized callers cannot administer via any route.
2. Low-contract-impact optimizations: interface dispatch, logging short-circuit, metadata reuse; existing responses match baseline and fake-runtime unit tests pass.
3. Versioned scale features: paging, async bulk work, idempotency and retention; representative workload meets agreed SLOs under bounded concurrency.

## Delivery checks

- [x] Read-only SAP review; no source, data or transport mutations.
- [x] Confirmed source findings distinguished from prior measurements and hypotheses.
- [x] Current SAP primary guidance linked; installed-release compatibility not presumed.
- [x] Pretty Printer / syntax / activation / text elements / transport: not applicable, no SAP edits.
- [x] ABAP Unit / ATC: no new test execution claimed; prior handover results are not fresh certification.
- [x] No performance benchmark or destructive rollback test run during review.

## Lessons raised

No new platform behavior experimentally established. Existing L-350 and L-356 materially govern these recommendations. User's additional request for faster execution and latest standards is included in scope, not treated as implementation authorization.
