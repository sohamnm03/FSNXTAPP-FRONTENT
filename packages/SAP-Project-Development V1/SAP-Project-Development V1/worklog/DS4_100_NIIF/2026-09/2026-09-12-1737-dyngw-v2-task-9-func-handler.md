# Task 9 — `ZCL_FS_DYN_HDL_FUNC` (dynamic FM / BAPI handler)

- **Date:** 2026-09-12
- **System:** DS4_100_NIIF
- **Package:** ZFS_DYN_GW
- **Transport:** DS4K907263 (task DS4K907264 — see note under Object list)
- **Requested by:** human (vinit.s@fourthsignal.com)

## Scope

Build `ZCL_FS_DYN_HDL_FUNC`, the dynamic gateway v2 handler for `FUNC` (dynamic function
module / BAPI call), implementing `ZIF_FS_DYN_HANDLER` and injected with `ZIF_FS_DYN_RUNTIME`.
Spec `docs/superpowers/specs/2026-09-12-1033-dyngw-v2-design.md` §3.1 is the acceptance contract.
Out of scope: any other handler, the dispatcher, the RFC wrapper FMs.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | The brief says `ZIF_FS_DYN_RUNTIME` has no FM-signature primitive — how does `prepare()` stay testable for a fictitious FM name like `ZFS_FAKE_WITH_CHANGING`? | **The brief's premise was wrong.** The interface already has `signature_of( func_name )` returning `exists`/`fmode`/`params`, added by task 8's L-394 follow-on, with a doc comment saying it exists so handlers can be tested against a synthetic signature. The first attempt built a `TEST-SEAM` around direct `TFDIR`/`FUPARAREF` reads; that was deleted once the activation warning "Implementation missing for `ZIF_FS_DYN_RUNTIME~SIGNATURE_OF`" surfaced the real primitive. No SQL in the handler at all now. (L-397) | self, during build |
| 2 | Brief test `tables_param_not_named_is_not_bound` only calls `prepare()` but asserts on `ms_last_plan-has_tables_binding`, which is only set when the runtime is actually called | Brief omission (same class as the 30-char method names) — added an explicit `mo_cut->execute( )` before the assertion | self, during build |
| 3 | Brief test `bapiret2_error_sets_business_category` calls `execute( )` with no prior `prepare()` | Same class of omission — added a `prepare()` for a fake FM with a bound `RETURN`/`BAPIRET2` TABLES parameter | self, during build |

## Naming gate

```
NAMING: ZCL_FS_DYN_HDL_FUNC -> matches ZCL_FS_<AREA>_<NAME> (AREA=DYN), design.md row 178 — no exception needed
```

## Brief deviations (all disclosed)

1. **Three test methods renamed** — the brief's names exceed ABAP's 30-character limit:
   `tables_param_not_named_is_not_bound` (35) → `unnamed_tables_not_bound` (24);
   `changing_in_rfc_mode_is_refused` (31) → `changing_in_rfc_refused` (23);
   `bapiret2_error_sets_business_category` (37) → `bapiret2_error_is_business` (26).
   `generic_param_sent_is_refused` (29) kept verbatim.
2. **Two tests given a missing call** (open questions 2 and 3) — an `execute( )` and a `prepare( )`
   respectively; without them the assertions could not be reached.
3. **No `TEST-SEAM`** — superseded by `signature_of` (open question 1).

## Todo

- [x] 1. Read `ZIF_FS_DYN_HANDLER`, `ZIF_FS_DYN_RUNTIME`, `ZCL_FS_DYN_RUNTIME`, `ZCL_FS_DYN_HDL_QUERY` and v1's `ZCL_FS_SLC_GW_FUNC` for the binding algorithm to carry over.
- [x] 2. Write the four tests (three renamed; two given the missing call).
- [x] 3. Implement the handler.
- [x] 4. Activate — clean, no warnings.
- [x] 5. ABAP Unit — 4/4 green.
- [x] 6. ATC — priority 1/2 clean.
- [x] 7. Worklog + ledger (L-397), commit.

## Design notes

- **Binding rules** (§3.1): IMPORTING bound only if named in `ImportJson`; EXPORTING always bound;
  TABLES bound only if named in `TablesJson` (L-314 — an output-only TABLES parameter has to be
  sent as `[]` or its content never comes back); CHANGING bound only if named **and** `call_mode`
  resolves to `L`, else refused with `020` naming the parameter.
- **Generic parameters** are refused with `020` when the caller actually sent one, and skipped
  silently when they did not — dropping a parameter the caller sent would change the callee's
  behaviour behind their back (L-311's instantiability probe decides which is which).
- **Read-back** uses one synthetic structure per parameter group; each `ty_call_param-value`
  references a component *inside* that structure, so the call writes results straight back into it
  and read-back is a single `/ui2/cl_json=>serialize`.
- **`ExportJson` shape:** flat when there is no CHANGING side, `{"EXPORTING":{…},"CHANGING":{…}}`
  when there is — a pure-EXPORTING call keeps returning exactly what it always did.
- **BAPIRET2 (new in v2):** a bound TABLES parameter named `RETURN` typed `BAPIRET2` is scanned
  after a technically successful call; the first `E`/`A` row sets `severity='E'`,
  `errcat='BUSINESS'`, `msgno='041'` while `status` stays `'S'` — the call worked, the target
  refused on business grounds.
- **`call_mode`:** registry wins; blank falls back to the FM's own `fmode`, which `signature_of`
  already carries. `R` maps to `dest = 'NONE'` (§6.1's execution session), `L` to blank.

## Untested paths (implemented, not covered by the four required tests)

- `019` (FM not found) — `signature_of` returning `exists = abap_false`.
- Blank `call_mode` falling back to `fmode`; all four tests set an explicit mode.
- The `SY-*` → `SYST-*` translation in `descr_for`.
- `020` from `cl_abap_structdescr=>create` failing, and from `call_function` raising or
  returning `subrc <> 0`.
- `022` (invalid JSON) is **not** raised here by design — per §7.2 it belongs to the dispatcher
  (`LHC_DynGateway`), and `ZCL_FS_DYN_HDL_QUERY` sets the same precedent by not catching around
  its own `/ui2/cl_json` calls.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZCL_FS_DYN_HDL_FUNC | CLAS/OC | ZFS_DYN_GW | DS4K907263 | active |
| ZCL_FS_DYN_HDL_FUNC (test include) | CLAS/OCT | ZFS_DYN_GW | DS4K907263 | active |

Note: creation was requested against task **DS4K907264**, but every `setObjectSource` against that
task was refused with *"already locked in request DS4K907263"*; passing the parent request
**DS4K907263** succeeded. The objects sit under DS4K907263.

Two creation calls (`abap_creation-create_object`, then `createTestInclude`) both reported errors
while actually succeeding on the backend — L-380 again. Verified by re-reading, not by retrying
blind; no orphans were produced.

## Delivery checks

- [x] Syntax check clean (activation returned no messages at all)
- [x] Activated, nothing left inactive (`"inactive":[]`)
- [x] ATC / Code Inspector — priority 1 and 2 resolved (0 findings); three priority-3 SLIN
      "strings without text elements are not translated" remain, on the `msgv2` detail strings.
      Not fixable within the project rules: the message itself is `ZFS_TRM_MSG/020` as rule 4
      requires, and the only fix SLIN accepts is a text element, which rule 5 forbids creating by
      this route.
- [x] ABAP Unit green — 4/4, no alerts
- [x] Text symbols and selection texts maintained — n/a, no screen elements
- [x] Object list confirmed in the transport

## Verification evidence

`unitTestRun` on `/sap/bc/adt/oo/classes/zcl_fs_dyn_hdl_func` → class `LTC_FUNC`, four test
methods, `"alerts":[]` on each and on the class:
`BAPIRET2_ERROR_IS_BUSINESS`, `CHANGING_IN_RFC_REFUSED`, `GENERIC_PARAM_SENT_IS_REFUSED`,
`UNNAMED_TABLES_NOT_BOUND`.

**TDD honesty note:** the four tests were written before the implementation, but a clean RED run
was never captured — the first activation failed on the `TEST-INJECTION` placement (L-397), so the
first successful run was already GREEN. The suite is not vacuous: `unnamed_tables_not_bound`
asserts `has_tables_binding = abap_false` and `bapiret2_error_is_business` drives the *same* fake,
the *same* loop and the *same* flag to `abap_true` (it must, or the `RETURN` rows could not reach
the scan that produces `errcat='BUSINESS'`), so the two tests prove each other discriminating.

## Session note

`mcp-abap-abap-adt-api` went into a blanket HTTP 400 mid-task — `lock`, `getObjectSource`,
`searchObject`, `runQuery`, `adtCoreDiscovery` and `dropSession` all failed while `healthcheck`
answered `healthy` and `adt-mcp` kept working (L-396's pattern exactly). It recovered on its own
after roughly a minute and the build continued; no writes were lost.

## Lessons raised

`L-397` — `TEST-INJECTION` must sit inside a method body, not bare at the test include's top
level; and re-read the interface before designing around a primitive a brief says is missing.

---

## Fix round 2 — 2026-09-12

The Critical `ty_call_param-kind` defect escalated as L-401, the silent-drop `CONTINUE` in
`build_plan`, the missing master-worklog row and the red `BAPIRET2_ERROR_SETS_BUSINESS` test were
all taken in fix round 2. `ABAP_FUNC_PARMBIND-KIND` was read out of type pool `ABAP` and is
`TYPE i` carrying 10/20/30/40, so **every** kind — not only TABLES — was overflowing to `'*'`;
the type is now `abap_func_parmbind-kind` and every character literal on the path is gone. Suite is
**5/5 green** post-activation, ATC priority 1/2 clean, nothing left inactive. Full write-up:
"Task 9 — fix round 2" in `worklog/DS4_100_NIIF/2026-09/2026-09-12-1034-dyngw-v2-framework-design.md`;
ledger L-402 and L-403; report `.superpowers/sdd/2026-09-12-dyngw-v2/task-9-report.md`.
