<!-- converted from Beacon_XSS_Input_Guard_Test_Report.docx -->

Test Report
Beacon Accounting OData – XSS Input Guard
Security audit observation: "Security Misconfiguration – Accepting Script and HTML Tags"
# 1. Audit observation
# 2. Remediation implemented
A server-side input guard was added to the deep-insert (CREATE_DEEP_ENTITY) of both services that write Beacon journals into ZFS_T_072. Decision taken with the business: reject the whole request rather than silently altering financial text.
- New private method CHECK_NO_MARKUP in ZCL_ZFS_BEACON_ACCO_01_DPC_EXT (V1) and ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT (_LOCL). It inspects every character field (types C and STRING, DDIC includes flattened) of the header and of every NP_ACC line.
- If any field contains "<" or ">", the request is rejected with HTTP 400 before anything is saved and before the posting job ZFS_FI_R044 is started. Without "<" no HTML tag can be formed.
- Each offending field is reported with message ZFS_TRM_MSG 055 "Field &1 in line &2 contains HTML/script tag characters - not allowed" – only the technical field name and the line position are returned; the caller’s input is never echoed back.
- Code changes are additions only (method, one call, change-history banner and SOC/EOC markers). Every original line of both classes is unchanged – verified by diff against the ADT version history.
## Objects
# 3. Test approach
- Live calls against the published OData services with PowerShell (Invoke-WebRequest, Basic authentication, CSRF token, sap-client=100, JSON).
- Each negative case must return HTTP 400 with ZFS_TRM_MSG/055 in the error body – a status code alone is not accepted as a pass. Afterwards ZFS_T_072 is read to prove nothing was saved, and TBTCO to prove no Beacon_Posting job was started.
- Safety design: every test line uses a valid company (1000), currency INR, an existing G/L account (0000205000) and its own ref_no, so that even a failing guard could never lead to an FI posting or to a mass status update in ZFS_T_072.
# 4. Results – negative tests (malicious input)
## 4.1 V1 service – ZFS_BEACON_ACCOUNTING_V1_SRV
## 4.2 _LOCL service – ZFS_BEACON_ACCOUNTING_LOCL_SRV

Post-condition checks (both services): 0 rows saved in ZFS_T_072 for any test request; no Beacon_Posting job started by any negative test; ZFS_T_072 status counts unchanged by any negative test (blank 14 / F 70 / S 38 before; the only change during the whole run is +1 F from the positive control P1, giving 14 / 71 / 38).
## 4.3 Sample rejected request and response (V1-N6)
Request body:
{"RequestId":"XV2N6","NP_ACC":[{"RequestId":"XV2N6","LineNo":"1","Company":"1000","NaturalAc":"0000205000","Currency":"INR","DebitCreditFlag":"S","RefNo":"XSS-XV2-N6A","LineDescription":"<b>one</b>"},{"RequestId":"XV2N6","LineNo":"2","Company":"1000","NaturalAc":"0000205000","Currency":"INR","DebitCreditFlag":"S","RefNo":"XSS-XV2-N6B","BatchId":"<i>two</i>"}]}
Response (HTTP 400, application/json):
{
"error": {
"code": "ZFS_TRM_MSG/055",
"message": {
"lang": "en",
"value": "Field BATCH_ID in line 2 contains HTML/script tag characters - not allowed"
},
"innererror": {
"errordetails": [
{
"code": "ZFS_TRM_MSG/055",
"message": "Field LINE_DESCRIPTION in line 1 contains HTML/script tag characters - not allowed",
"severity": "error"
},
{
"code": "ZFS_TRM_MSG/055",
"message": "Field BATCH_ID in line 2 contains HTML/script tag characters - not allowed",
"severity": "error"
}
]
}
}
}
# 5. Results – positive control and regression
# 6. Supporting checks
# 7. Output encoding and open points
- Output encoding: the services return JSON (Content-Type application/json;charset=utf-8), which the gateway escapes by JSON rules. SAP renders no HTML here. Any UI that displays this data must render it as text (e.g. UI5 data binding or textContent, never innerHTML).
- Response header: X-Content-Type-Options: nosniff is not sent by the gateway. Recommended as a Basis/ICF setting; no code change made.
- Transport order: DS4K907018 (carries message 055) must be imported before or with DS4K907342, otherwise the rejection text is blank in the target system (the rejection itself still works).
- Test data: positive-control row XSSPOS01 / XSS-POS-01 (status F) remains in ZFS_T_072 on DS4 for traceability; removal is a business decision.
- Out of scope (left unchanged by instruction): service ZFS_FI_ODATA_BEACON_ACCOUNTING_SRV (writes nothing), and the other findings of the logic review of 24.09.2026 (e.g. _LOCL still submits the obsolete P_STAMP parameter, flagged by ATC).
# 8. Evidence
Stored in the project repository: worklog/DS4_100_NIIF/2026-09/evidence/2026-09-24-1213-beacon-xss-input-guard/
# 9. Sign-off
| Item | Value |
| --- | --- |
| System / client | DS4 / 100 (DS4_100_NIIF – NIIF Development) |
| Services under test | ZFS_BEACON_ACCOUNTING_V1_SRV and ZFS_BEACON_ACCOUNTING_LOCL_SRV (OData V2) |
| Test date | 24.09.2026 |
| Executed by | FS_DEV3 |
| Transports | DS4K907342 (task DS4K907343) – both DPC_EXT classes
DS4K907194 (task of DS4K907018) – message ZFS_TRM_MSG 055 |
| Overall result | PASS – 15 of 15 API test cases passed; all supporting checks passed |
| Observation | Security impact | Recommendation |
| --- | --- | --- |
| Security Misconfiguration – Accepting Script and HTML Tags | The API accepts HTML and script tags without sanitization. If the data is rendered in a user interface this can lead to Cross-Site Scripting (XSS), session hijacking, phishing or manipulation of client-side behaviour. | Implement strict input validation to reject or sanitize malicious HTML/script content. Apply proper output encoding based on the context. |
| Object | Type | Transport | Change |
| --- | --- | --- | --- |
| ZCL_ZFS_BEACON_ACCO_01_DPC_EXT | CLAS | DS4K907342 | CHECK_NO_MARKUP added; called in CREATE_DEEP_ENTITY |
| ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT | CLAS | DS4K907342 | Same change (_LOCL service) |
| ZFS_TRM_MSG, message 055 | MSAG | DS4K907194 | New error message (class locked in DS4K907018) |
| ID | Scenario | Input sent | Request ID | Result | Messages returned (ZFS_TRM_MSG 055) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| V1-N1 | script tag in LineDescription | LineDescription = <script>alert(1)</script> | XV2N1 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed | PASS |
| V1-N2 | img onerror in Remark1 | Remark1 = <img src=x onerror=alert(1)> | XV2N2 | HTTP 400 | Field REMARK1 in line 1 …not allowed | PASS |
| V1-N3 | lone > in RefNo | RefNo = XSS-…-N3>1 (a lone ">") | XV2N3 | HTTP 400 | Field REF_NO in line 1 …not allowed | PASS |
| V1-N4 | tag in header RequestId | Header RequestId = <b>…</b> | <b>XV2</b> | HTTP 400 | Field REQUEST_ID in line 0 …not allowed; Field REQUEST_ID in line 1 …not allowed | PASS |
| V1-N5 | JSON unicode-escaped script tag | LineDescription = \u003cscript\u003e… (JSON unicode escapes) | XV2N5 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed | PASS |
| V1-N6 | two bad fields on two lines | Line 1 LineDescription = <b>one</b>, line 2 BatchId = <i>two</i> | XV2N6 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed; Field BATCH_ID in line 2 …not allowed | PASS |
| ID | Scenario | Input sent | Request ID | Result | Messages returned (ZFS_TRM_MSG 055) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| LC-N1 | script tag in LineDescription | LineDescription = <script>alert(1)</script> | XLCN1 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed | PASS |
| LC-N2 | img onerror in Remark1 | Remark1 = <img src=x onerror=alert(1)> | XLCN2 | HTTP 400 | Field REMARK1 in line 1 …not allowed | PASS |
| LC-N3 | lone > in RefNo | RefNo = XSS-…-N3>1 (a lone ">") | XLCN3 | HTTP 400 | Field REF_NO in line 1 …not allowed | PASS |
| LC-N4 | tag in header RequestId | Header RequestId = <b>…</b> | <b>XLC</b> | HTTP 400 | Field REQUEST_ID in line 0 …not allowed; Field REQUEST_ID in line 1 …not allowed | PASS |
| LC-N5 | JSON unicode-escaped script tag | LineDescription = \u003cscript\u003e… (JSON unicode escapes) | XLCN5 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed | PASS |
| LC-N6 | two bad fields on two lines | Line 1 LineDescription = <b>one</b>, line 2 BatchId = <i>two</i> | XLCN6 | HTTP 400 | Field LINE_DESCRIPTION in line 1 …not allowed; Field BATCH_ID in line 2 …not allowed | PASS |
| ID | Scenario | Expected | Result | Status |
| --- | --- | --- | --- | --- |
| P1 | Clean line with ordinary punctuation: Clean text: A&B 'x' "y" 50% (ok) | Accepted (HTTP 201); text stored unchanged | HTTP 201 | PASS |
| P1a | Background job for the positive control | Job Beacon_Posting_20260924123430 runs; single line marked F; no FI document | Finished; row F | PASS |
| R1 | GET zfs_s_018_hdSet('100000000001')?$expand=NP_ACC | Existing request still readable | HTTP 200 | PASS |
| R2 | GET zfs_t_091_itSet?$filter=RequestId eq '100000000001' | Posting log still readable | HTTP 200 | PASS |
| Check | Result | Status |
| --- | --- | --- |
| Syntax check | No errors in either class | PASS |
| Activation | Both classes active; nothing left inactive | PASS |
| ATC (system default variant) | 0 errors. 1 warning + 38 infos – all in pre-existing code (untranslated literals, SUBMIT, READ … INDEX 1); none in the new method | PASS |
| Change isolation | Diff vs. previous version: 0 original lines removed or modified, in both classes | PASS |
| Message 055 | Present in T100; messages 001–054 unchanged | PASS |
| Transport contents | DS4K907343: CPRI + 2 METH per class; DS4K907194: R3TR MSAG ZFS_TRM_MSG | PASS |
| Existing data scan | ZFS_T_072 (122 rows × 35 text columns) and ZFS_T_091 (53 rows × 8) – no "<" or ">" stored; no clean-up needed | PASS |
| File | Content |
| --- | --- |
| beacon-xss-negative.ps1 | Negative test script (both services) |
| v1-negative-results-final.json / locl-negative-results.json | Full requests and responses of the negative tests |
| beacon-v1-positive-and-regression.ps1 + results JSON | Positive control and read regression |
| v1-change.diff / locl-change.diff | Source change vs. previous version |
| existing-data-scan.md | Stored-data scan summary |
| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Technical consultant | FS_DEV3 | 24.09.2026 |  |
| Functional reviewer |  |  |  |
| Security / audit |  |  |  |