# Beacon Accounting V1 OData service: logic review

- **Date:** 2026-09-24
- **Started:** 12:02
- **System:** DS4_100_NIIF
- **Package:** ZFS_FI
- **Transport:** none (read-only)
- **Requested by:** Niranjan K

## Scope

Read-only walkthrough of SEGW project `ZFS_BEACON_ACCOUNTING_V1` (service
`ZFS_BEACON_ACCOUNTING_V1_SRV`) and the background posting report it triggers. Nothing was
created or changed on the system.

## Objects read

| Object | Type | Role |
|---|---|---|
| ZFS_BEACON_ACCOUNTING_V1 | IWPR | SEGW project |
| ZCL_ZFS_BEACON_ACCO_01_MPC / _MPC_EXT | CLAS | Model (namespace `ZFS_BEACON_ACCOUNTING_V1_SRV`); `_EXT` empty |
| ZCL_ZFS_BEACON_ACCO_01_DPC_EXT | CLAS | CREATE_DEEP_ENTITY, GET_EXPANDED_ENTITY, ZFS_T_091_ITSET_GET_ENTITYSET |
| ZFS_FI_R044 (+ _TOP, _F01) | PROG | Background posting via BAPI_ACC_DOCUMENT_POST |
| ZFS_T_072 | TABL | Inbound staging (key incl. request_id, ref_no, line_no …) |
| ZFS_T_091 | TABL | Posting result log (key request_id, bukrs, gjahr, belnr, ref_no) |

## Findings (not acted on)

1. V1 DPC_EXT types its deep structure from `ZCL_ZFS_BEACON_ACCOUNT_MPC` (the `_LOCL`
   project's MPC), not its own `_ACCO_01_MPC`. Types are identical today, so it works; it's a
   hidden cross-project dependency.
2. `doc_type` is decided from `gw_data-sub_code` before the item loop, so it reads the last
   row of the *previous* ref_no (or blank on the first one), not the current one.
3. Debit/credit mapping is inverted against SAP convention: `H` rows are negated, `S`
   rows positive. The balance check compares raw sums, so it holds only when both sides are
   entered as positive amounts.
4. `lvcount TYPE c` (length 1): with 10+ lines per ref_no the counter wraps.
5. `FORM validate` runs `UPDATE zfs_t_072 … WHERE ref_no = ref_no`, comparing the column to
   itself. That's always true, so **every row in ZFS_T_072 gets posting_status 'F'**, not just
   the failed ref_no.
6. On a failed validation, `gt_data_2` keeps growing and is re-MODIFYed each time. Failure
   rows have blank bukrs/gjahr/belnr, so two failures for the same request_id and ref_no
   overwrite each other in ZFS_T_091.
7. Balance-mismatch and single-line failures go into `gt_data_2` but aren't written to
   ZFS_T_091 on their own (that MODIFY is commented out). They reach the table only if a later
   ref_no's MODIFY happens to write the whole buffer.
8. On a posted document, BELNR comes from `message_v2(10)` of the first `S` row in RETURN,
   not from `obj_key`.
9. Many COMMIT WORKs per ref_no; there's no atomicity between the ZFS_T_091 and ZFS_T_072
   updates.
10. CREATE_DEEP_ENTITY: the error branch overwrites `ls_header-name` with `~status_code`
    and puts a JSON-ish string in as the value. The `Response_Message` header is never sent,
    and the status code gets an invalid value. `WRITE` statements inside the OData handler
    do nothing. An empty payload with a new request_id returns remark 'Request Id already
    exists'.
11. The job is submitted with `p_test = ''`, a real post. The OData layer checks only for a
    duplicate request_id. A ref_no that was already posted is caught later, in R044's
    validation, against ZFS_T_091 status 'S'.
12. `posting_status` (ZFS_DT_716) is CHAR 1, so the literals 'Success'/'Failed' are stored as
    'S'/'F'. The duplicate-ref_no guard works, but the OData `Status` property returns 'S'/'F',
    not the words. The synthetic rows GET_ENTITYSET builds also truncate to 'F'.

## Decision

2026-09-24: the human said not to fix anything and to leave the service and report exactly as they are.
The findings above are for reference only.

## Audit observation: HTML/script tags accepted (XSS)

2026-09-24: I gave the human a remediation plan (input validation in CREATE_DEEP_ENTITY, context-aware
output encoding in the consuming UI, covering every entry point that writes ZFS_T_072). Not
implemented; waiting for a go-ahead and decisions on the open questions.

## Lessons raised

None. Nothing was built; the findings above are candidate fixes that need the human's decision.
