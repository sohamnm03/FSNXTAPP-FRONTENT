# Beacon accounting OData: reject HTML/script tags in input (audit finding)

- **Date:** 2026-09-24
- **Started:** 12:13
- **System:** DS4_100_NIIF
- **Package:** ZFS_FI
- **Transport:** DS4K907342 (classes) · DS4K907018 / task DS4K907194 (message 055, the class is locked there)
- **Requested by:** Niranjan K

## Scope

Audit finding: "Security Misconfiguration – Accepting Script and HTML Tags". Add a server-side input
guard to CREATE_DEEP_ENTITY of both write-capable Beacon services. It rejects the whole
request (HTTP 400) when any character field contains `<` or `>`. Plan:
`C:\Users\karth\.claude\plans\federated-marinating-plum.md`. Out of scope, left as they are
by instruction: every other finding in `2026-09-24-1202-beacon-accounting-v1-odata-review.md`,
and the service `ZFS_FI_ODATA_BEACON_ACCOUNTING_SRV`.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Reject or sanitize? | Reject the whole request | 2026-09-24 |
| 2 | What about `_LOCL` and `ZFS_FI_ODATA_BEACON_ACCOUNTING_SRV`? | Apply the same fix to `_LOCL`; don't touch FI_ODATA | 2026-09-24 |
| 3 | Where does the check live? | A private method in each DPC_EXT, no new class (so the code is duplicated in V1 and `_LOCL`) | 2026-09-24 |
| 4 | Transport | DS4K907342 for the classes. Message 055 on DS4K907018 (lock); **DS4K907018 must be imported before DS4K907342** | 2026-09-24 |

## Naming gate

No new repository objects. New private method `CHECK_NO_MARKUP` in two existing classes; new
message number 055 in the existing `ZFS_TRM_MSG` (listed exception).

## Todo

- [x] 1. Created message 055 (`Field &1 in line &2 contains HTML/script tag characters - not allowed`; reworded from the plan so the text never echoes caller input or contains `<` `>`). Catalog updated; next free number is 056. T100 re-read: 55 rows, 001–054 unchanged
- [x] 2. V1 class: method and call added, syntax check clean, activated
- [x] 3. `_LOCL` class: same
- [x] 4. Existing data scanned: ZFS_T_072 (122 rows × 35 columns) and ZFS_T_091 (53 × 8) contain no `<` or `>`. See `evidence/.../existing-data-scan.md`
- [x] 5. Live tests all pass. V1 negatives 6/6 and `_LOCL` negatives 6/6 (the human approved running `_LOCL` live): each 400 + 055, nothing saved, no job. V1 positive control P1: 201, job `Beacon_Posting_20260924123430` finished, row 'F', no FI document. Regression R1/R2: 200. The responses carry no `X-Content-Type-Options: nosniff` (a Basis item)
- [x] 6. At the human's request: added a change-history banner, SOC/EOC markers and ABAP Doc. The class store refuses comment lines outside method bodies ("unknown comments which can't be stored"), so the markers sit inside the methods and the definition carries ABAP Doc only
- [x] 7. Word test report `Beacon_XSS_Input_Guard_Test_Report.docx` saved to the human's Downloads folder, with a copy in evidence

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| ZFS_TRM_MSG / 055 | MSAG | ZFS_K2_CC_VS | DS4K907018 (task DS4K907194) | Live in T100 |
| ZCL_ZFS_BEACON_ACCO_01_DPC_EXT | CLAS | ZFS_FI | DS4K907342 (task DS4K907343) | Active, tested |
| ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT | CLAS | ZFS_FI | DS4K907342 (task DS4K907343) | Active, tested |

## Delivery checks

- [ ] Pretty Printer: not run. The existing code's formatting is left exactly as it was, by instruction
- [x] Syntax check clean (both classes)
- [x] Activated, nothing of ours left inactive
- [x] ATC: 0 errors, 1 warning, 38 infos, **all in pre-existing code**. The one P2 is `_LOCL`'s obsolete `WITH p_stamp`, left as it is by instruction. None in `CHECK_NO_MARKUP`
- [ ] ABAP Unit: none applicable (generated SEGW DPC_EXT, no test class; the live OData tests are the verification)
- [x] Text symbols: none needed
- [x] Object list confirmed in E071: DS4K907343 has CPRI + METH CREATE_DEEP_ENTITY + METH CHECK_NO_MARKUP for each class; DS4K907194 has R3TR MSAG ZFS_TRM_MSG

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-24-1213-beacon-xss-input-guard/`: test scripts,
result JSON (V1 run 1, V1 final, `_LOCL`, positive/regression), before/after source and the diff for each class,
data-scan summary, Word report.

## Open points for the human

- Import **DS4K907018 before or with DS4K907342**, or the 055 text is blank in the target system.
- `X-Content-Type-Options: nosniff` is not sent. Raise it with Basis (ICF/gateway setting).
- Test row `XSSPOS01` / `XSS-POS-01` (status F) remains in ZFS_T_072. Removing it is your call.
- `ZFS_FI_ODATA_BEACON_ACCOUNTING_SRV` is untouched (it writes nothing; unfiltered 10-row read, BREAK-POINTs).

## Lessons raised

L-560 (PS 5.1 error body is in `ErrorDetails`) · L-561 (ADT data preview dumps on a long select list) · L-562 (no class comments outside method bodies)
