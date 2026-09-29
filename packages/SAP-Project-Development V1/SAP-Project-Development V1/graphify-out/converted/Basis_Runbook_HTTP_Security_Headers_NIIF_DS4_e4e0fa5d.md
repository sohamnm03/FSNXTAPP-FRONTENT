<!-- converted from Basis_Runbook_HTTP_Security_Headers_NIIF_DS4.docx -->

Basis Runbook
HTTP Security Headers – NIIF DS4
Audit observation: "Security Misconfiguration – No Security Headers Present"
# 1. Summary
HTTP responses from DS4 carry none of the audited browser security headers. The fix is a Basis configuration of the ICM (Internet Communication Manager), not an ABAP change, so it covers every response the ICM sends – successful calls, error pages, logon failures and CSRF responses alike.
- HSTS: one profile parameter, icm/HTTP/strict_transport_security (SAP's dedicated HSTS parameter since kernel 7.53; DS4 runs 7.93).
- The other five headers: one rule file on the OS with five SetResponseHeader rules, activated by profile parameter icm/HTTP/mod_0 (the modification handler exists today but has no file).
- No port or redirect change: plain HTTP 8000 already answers 307 → HTTPS 44300 (verified live).
- Web Dispatcher check required: the ICM HTTP log shows a host (10.40.1.31) polling this system the way an SAP Web Dispatcher does. If users or Beacon reach DS4 through it, the same headers must be set there too (§4 Step 7).
- No transport. Repeat per system (QA, PRD) with its own host names and change request.
# 2. Current state (captured from NIIF DS4)
## 2.1 Response headers today
Raw "before" evidence (session IDs masked):
# Captured 24.09.2026 from this workstation – HTTPS 44300, Beacon V1 $metadata (HTTP 200)
cache-control: max-age=0
content-length: 14995
content-type: application/xml
dataserviceversion: 2.0
last-modified: Thu, 21 May 2026 15:44:47 GMT
sap-perf-fesrec: 119679.000000
sap-processing-info: ODataBEP=,crp=,RAL=,st=,MedCacheHub=Table,codeployed=X,softstate=
sap-server: true
Set-Cookie: sap-usercontext=...; secure / SAP_SESSIONID_DS4_100=...; secure; HttpOnly
# Error request (HTTP 404) – same picture: no security headers
# Plain HTTP (port 8000, redirects not followed):
HTTP 307   Location: https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata/sap/ZFS_BEACON_ACCOUNTING_V1_SRV/?sap-client=100
## 2.2 Relevant configuration today
## 2.3 Who calls DS4 over HTTP (Web Dispatcher check)
The ICM HTTP log (AL11 > DIR_LOGGING > http-DS4-vhnlqds4ap01-202609_4, first and last page read on 24.09.2026) shows:
- 10.40.1.31 – ~95% of requests, every ~20 s: /sap/public/icf_info/icr_groups and /sap/public/icman/ping. This is the pattern of an SAP Web Dispatcher (or load balancer health check) reading the URL/logon groups of this system. No reverse-DNS name exists for this address.
- 10.212.134.x – workstations calling OData directly on vhnlqds4ap01.sap.niififl.in:44300.
- Host header on all sampled requests: vhnlqds4ap01.sap.niififl.in:44300.
## 2.4 Screenshots

Figure 1 – SM51 – one application server instance, vhnlqds4ap01_DS4_00.

Figure 2 – SM51 > Release Notes – kernel 793, patch 417, Linux SLES-15 (≥ 7.53, so icm/HTTP/strict_transport_security is available).

Figure 3 – SMICM > Goto > Services – HTTPS 44300, SMTP 25000, HTTP 8000 active.

Figure 4 – SMICM > Goto > Parameters (first page) – "icm/HTTP/mod [0] = PREFIX=/,FILE=-" and the HTTP→HTTPS redirect, listed under "Modifiable (Dyn.)".

Figure 5 – SMICM > Goto > HTTP Plug-In > Modification Handler – handler 0 active with file "-" (no rules).

Figure 6 – AL11 > DIR_PROFILE – DEFAULT.PFL, instance profile and existing backup copies.

Figure 7 – AL11 – DEFAULT.PFL: ICM server ports and HTTP→HTTPS redirect.

Figure 8 – AL11 – DEFAULT.PFL: restrict_admin (client 000), is/HTTP/show_server_header = FALSE; no HSTS parameter.

Figure 9 – AL11 – instance profile DS4_D00_vhnlqds4ap01: no ICM/HTTP parameters.

Figure 10 – AL11 – ICM HTTP log (latest page): 10.40.1.31 polling /sap/public/icf_info/icr_groups and /sap/public/icman/ping.

Figure 11 – UCON_CHW – ClickJacking Framing Protection already in "Active Check".

Figure 12 – SMICM > Goto > Trace File > Display End – baseline: only WebSocket ping time-outs, no modification-handler messages.
# 3. Target state and values to pass
## 3.1 Headers
## 3.2 Parameter and file values
## 3.3 Constraints found on DS4


# 4. Step-by-step procedure (DS4 DEV)
## Step 0 – Prerequisites
- Approved change request number (DEV now; QA and PRD later).
- Basis user in DS4 client 000 with S_RZL_ADM (activity 01) and S_ADMI_FCD (NADM, PADM); OS access as ds4adm.
- Maintenance window of about 5 minutes for the ICM restart (HTTP connections drop for a few seconds); inform Beacon interface owner.
- Before-evidence (Step 1) saved.
## Step 1 – Capture the baseline (no change)
$u = 'https://vhnlqds4ap01.sap.niififl.in:44300/sap/public/ping?sap-client=100'
(Invoke-WebRequest -Uri $u -UseBasicParsing).Headers | Out-File before-headers.txt
# Expected today: none of the six audited headers (see §2.1)
## Step 2 – Back up DEFAULT.PFL (OS, as ds4adm)
cd /usr/sap/DS4/SYS/profile
cp -p DEFAULT.PFL DEFAULT.PFL_bkp_$(date +%d%b%Y)
ls -l DEFAULT.PFL*
## Step 3 – Create the rule file (OS, as ds4adm)
Create /usr/sap/DS4/SYS/global/security/data/icm_security_headers.txt (same directory as the existing icmauth.txt of the ICM admin handler) with exactly this content:
# ICM modification rules - HTTP security response headers
# System DS4 (NIIF DEV) - audit "No Security Headers Present"
# Owner: Basis   Created: <date>   Change request: <CR number>
# HSTS is set by profile parameter icm/HTTP/strict_transport_security, not here.
SetResponseHeader X-Content-Type-Options nosniff
SetResponseHeader Referrer-Policy strict-origin-when-cross-origin
SetResponseHeader X-Frame-Options SAMEORIGIN
SetResponseHeader Content-Security-Policy "frame-ancestors 'self'"
SetResponseHeader X-XSS-Protection "1; mode=block"
chown ds4adm:sapsys /usr/sap/DS4/SYS/global/security/data/icm_security_headers.txt
chmod 640 /usr/sap/DS4/SYS/global/security/data/icm_security_headers.txt
cat /usr/sap/DS4/SYS/global/security/data/icm_security_headers.txt
Without OS access: CG3Z (upload file to application server) to the same path; the file must be owned by ds4adm.
## Step 4 – Maintain the two profile parameters (RZ10, client 000)
- Transaction RZ10 (client 000). Utilities > Import Profiles > Of Active Servers → Yes (syncs the DB copy with the file on disk).
- Profile DEFAULT → radio button Extended Maintenance → Change.
- Create parameter (F5): name icm/HTTP/strict_transport_security, value max-age=31536000;includeSubDomains → Copy → Back.
- Create parameter (F5): name icm/HTTP/mod_0, value (one line):
PREFIX=/,FILE=$(DIR_GLOBAL)$(DIR_SEP)security$(DIR_SEP)data$(DIR_SEP)icm_security_headers.txt
- Copy → Back → Save → "Activate profile?" Yes. Leave icm/server_port_*, icm/HTTP/redirect_0 and icm/HTTP/redirect_00 untouched.
- Screenshot the DEFAULT profile parameter list showing both new lines (audit evidence #3).
## Step 5 – Activate and verify
- Restart the ICM (client 000): SMICM > Administration > ICM > Exit Soft > Global. The dispatcher restarts the ICM within seconds; wait until SMICM shows it running again.
- SMICM > Goto > Trace File > Display End: no errors about the modification handler, the rule file or strict_transport_security (compare the baseline in Fig. 12).
- SMICM > Goto > HTTP Plug-In > Modification Handler: index 0 shows the new file with a green tick in "Actv." (compare Fig. 5).
- Re-run the header checks (success, error and HTTP redirect):
$h = 'https://vhnlqds4ap01.sap.niififl.in:44300'
(Invoke-WebRequest "$h/sap/public/ping?sap-client=100" -UseBasicParsing).Headers | Out-File after-headers.txt
try { Invoke-WebRequest "$h/sap/opu/odata/sap/NOSUCHSERVICE/?sap-client=100" -UseBasicParsing }
catch { $_.Exception.Response.Headers.ToString() }     # the 404 must carry the headers too
Invoke-WebRequest 'http://vhnlqds4ap01.sap.niififl.in:8000/sap/public/ping' -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue   # still 307
Expected on every HTTPS response:
Strict-Transport-Security: max-age=31536000;includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self'
X-XSS-Protection: 1; mode=block
## Step 6 – Regression test
## Step 7 – Web Dispatcher (if 10.40.1.31 is one)
- Identify the Web Dispatcher host/SID for 10.40.1.31 and its profile (sapwebdisp.pfl).
- Copy the same rule file to the Web Dispatcher host (e.g. its sec/ or profile directory) and add to its profile: icm/HTTP/mod_0 = PREFIX=/,FILE=<path to rule file> and icm/HTTP/strict_transport_security = max-age=31536000;includeSubDomains (SAP KBA 3363036).
- Restart the Web Dispatcher (or reload via its admin UI /sap/wdisp/admin) and repeat the Step 5 header checks against the Web Dispatcher URL.
- SetResponseHeader replaces a header of the same name, so setting the headers on both layers does not produce duplicates.
## Step 8 – Roll-out to QA and PRD
- Repeat Steps 1–7 per system (own host names, /usr/sap/<SID>/ paths, change request). Nothing is transported.
## Rollback
- RZ10 (client 000): delete icm/HTTP/strict_transport_security and icm/HTTP/mod_0 from DEFAULT (or restore DEFAULT.PFL_bkp_<date> and re-import), save, activate.
- Restart the ICM (SMICM > Administration > ICM > Exit Soft > Global).
- Rename the rule file (keep it for the audit trail).
# 5. Observations (no change proposed now)
- Duplicate redirect lines: DEFAULT.PFL contains icm/HTTP/redirect_0 twice (PORT=443$$ and PORT=44300) and icm/HTTP/redirect_00. Same effect; housekeeping for Basis.
- Why not in ABAP: headers set in individual OData classes would miss gateway-generated errors (401, 403 CSRF, 404, 500) and every other service; the ICM covers all.
- Relation to the XSS finding: the Beacon input guard (DS4K907342) fixes the injection; these headers are the browser-side defence in depth.
# 6. What this document could not capture
# 7. Audit closure evidence checklist

# 8. Sources
- SAP Help Portal – icm/HTTP/strict_transport_security: https://help.sap.com/docs/ABAP_PLATFORM_NEW/683d6a1797a34730a6e005d1e8de6f22/b6ca39dfb9884479a7a05e920a51f781.html
- SAP Help Portal – icm/HTTP/mod_<xx> (syntax PREFIX, FILE; action file format): https://help.sap.com/doc/saphelp_nw74/7.4.16/en-US/6a/d519e582334d94a3372e9992680e33/content.htm
- SAP example ICM script using setResponseHeader with icm/HTTP/mod_0 (kernel ≥ 7.49 PL315, restart to activate): https://assets.sapanalytics.cloud/production/help/help-release/en/39d0e79aa6a0480a904170ce12e05276.html
- SAP KBA 3359291 – Configuring HSTS with Web Dispatcher or ICM; KBA 3363036 – HSTS with Web Dispatcher; KBA 3518456 – Setting X-Content-Type-Options with modification rules; KBA 3468400 – Missing X-Frame-Options header (SAP for Me, S-user required).
| Item | Value |
| --- | --- |
| System | DS4 – NIIF Development (SAP Logon entry "NIIF - Development") |
| Application server | vhnlqds4ap01_DS4_00 (single instance) – host vhnlqds4ap01.sap.niififl.in |
| Kernel | 793, patch level 417, Linux SLES-15 x86_64 |
| Data captured | 24.09.2026, display only – SM51, SMICM, AL11 (profiles, ICM HTTP log), UCON_CHW, SMICM trace; live HTTP header checks; user FS_DEV3, client 100 |
| Changes made while preparing this document | None. No profile, parameter, file or service was changed. |
| Executed by (implementation) | Basis team – must work in client 000 (see §3.3) |
| Header | Current value | Required by audit |
| --- | --- | --- |
| Strict-Transport-Security (HSTS) | not sent | Enforce HTTPS, prevent SSL stripping |
| X-Content-Type-Options | not sent | nosniff – stop MIME sniffing |
| Referrer-Policy | not sent | Avoid leaking URLs/tokens via Referer |
| X-Frame-Options / CSP frame-ancestors | not sent | Prevent clickjacking |
| X-XSS-Protection | not sent | Legacy-browser XSS filter |
| Parameter / object | Current value (DS4) | Source |
| --- | --- | --- |
| icm/HTTP/strict_transport_security | not set in DEFAULT.PFL or instance profile; no HSTS header on live responses | AL11 (Fig. 7–9); live check |
| icm/HTTP/mod_0 | PREFIX=/,FILE=-  (kernel default – handler active, no rule file; not in any profile) | SMICM (Fig. 4, 5) |
| icm/server_port_0 / _1 / _2 | HTTPS 443$$ (44300) / SMTP 250$$ / HTTP 80$$ (8000) | DEFAULT.PFL (Fig. 7); SMICM (Fig. 3) |
| icm/HTTP/redirect_0 | PREFIX=/, FROM=*, FROMPROT=http, PROT=https, HOST=$(SAPLOCALHOSTFULL), PORT=44300 – live: 307 | DEFAULT.PFL (Fig. 8) |
| is/HTTP/show_server_header | FALSE (already hardened) | DEFAULT.PFL (Fig. 8) |
| restrict_admin/admin_clients | 000 | DEFAULT.PFL (Fig. 8) |
| restrict_admin/actions | PFL_PARAM_CHANGE, ICM_RESTART, ICM_MAINT_MODE, ICM_CHANGE_SERVICE, ICM_CHANGE_PARAMS, SERVER_STATE_CHANGE | DEFAULT.PFL (Fig. 8) |
| Clickjacking framing protection (UCON) | Active Check, 0 URLs recorded (client 100) | UCON_CHW (Fig. 11) |
| Profile directory | /usr/sap/DS4/SYS/profile – all ICM settings are in DEFAULT.PFL; instance profile DS4_D00_vhnlqds4ap01 has none | AL11 (Fig. 6, 9) |
| Action for Basis: identify 10.40.1.31 (network team / Web Dispatcher inventory). If it is a Web Dispatcher through which users, Fiori or Beacon reach DS4, apply Step 7 there as well – the auditor's scanner sees whichever URL it is given. |
| --- |
| Header | Value | Set by / why |
| --- | --- | --- |
| Strict-Transport-Security | max-age=31536000;includeSubDomains | Parameter icm/HTTP/strict_transport_security (SAP KBA 3359291). 1 year is what scanners expect. includeSubDomains covers only sub-domains of vhnlqds4ap01.sap.niififl.in. No "preload". |
| X-Content-Type-Options | nosniff | Rule file (SAP KBA 3518456). |
| Referrer-Policy | strict-origin-when-cross-origin | Rule file. No path/query sent to other sites; safe for Fiori/WebGUI. |
| X-Frame-Options | SAMEORIGIN | Rule file (SAP KBA 3468400). Same-host framing (Fiori launchpad) keeps working; complements the active UCON clickjacking protection. |
| Content-Security-Policy | frame-ancestors 'self' | Rule file. Limited to frame-ancestors on purpose – a full CSP would break SAP UI technologies. |
| X-XSS-Protection | 1; mode=block | Rule file. The audit asks for it; modern browsers ignore it; harmless. |
| Object | Current value | New value |
| --- | --- | --- |
| icm/HTTP/strict_transport_security (DEFAULT.PFL) | not set | max-age=31536000;includeSubDomains |
| icm/HTTP/mod_0 (DEFAULT.PFL) | PREFIX=/,FILE=-  (default, not in profile) | PREFIX=/,FILE=$(DIR_GLOBAL)$(DIR_SEP)security
$(DIR_SEP)data$(DIR_SEP)icm_security_headers.txt
(enter as ONE line, no spaces – shown wrapped here) |
| Rule file (new, OS level) | does not exist | /usr/sap/DS4/SYS/global/security/data/
icm_security_headers.txt
owner ds4adm:sapsys, mode 640 – content §4 Step 3 |
| icm/HTTP/redirect_0 | HTTP → HTTPS 44300 (307) | No change |
| icm/server_port_2 (HTTP 8000) | active, redirects to HTTPS | No change (optional later: close once no internal caller uses HTTP) |
| is/HTTP/show_server_header | FALSE | No change |
| Client 000 required. restrict_admin/admin_clients = 000 with PFL_PARAM_CHANGE, ICM_CHANGE_PARAMS and ICM_RESTART in restrict_admin/actions: RZ10 changes, SMICM parameter changes and ICM restarts only work in client 000 with a Basis user. |
| --- |
| Restart planned. SAP documentation for icm/HTTP/mod_<xx> (NetWeaver 7.4) states "dynamically changeable: No", while SMICM on this 7.93 system lists icm/HTTP/mod under "Modifiable (Dyn.)" (Fig. 4). The runbook therefore makes the changes permanent in RZ10 and activates them with an ICM restart; the dynamic SMICM route is given only as an optional quick test. |
| --- |
| Syntax. SetResponseHeader <name> <value> is the documented ICM/Web Dispatcher modification action (SAP Help "Modification of HTTP Requests"; SAP example scripts use it on kernel ≥ 7.49 PL315). Values that contain spaces are enclosed in double quotes, as in SAP community examples; if the ICM rejects a line it reports it in the ICM trace at start-up (Step 5.1). |
| --- |
| Optional quick test before the restart: SMICM (client 000) > Goto > Parameters > Change → row icm/HTTP/mod [0] → New Value = the value above → Save Changes Locally. If SMICM refuses the dynamic change, rely on the restart above. |
| --- |
| Area | Check |
| --- | --- |
| SAP GUI for HTML / WebGUI | /sap/bc/gui/sap/its/webgui?sap-client=100 – logon and one transaction. |
| Fiori launchpad (if used) | Launchpad and one tile open; embedded apps still load (same host). |
| OData / Beacon interface | Beacon test call (XSS test report cases) – unchanged behaviour. |
| ADT / Eclipse, SAP GUI | ADT connection to DS4; SAP GUI HTML controls display. |
| Framing from other hosts | If a portal on another host frames DS4, SAMEORIGIN blocks it – add that origin to frame-ancestors and to UCON_CHW. |
| Item | Reason and how it is covered |
| --- | --- |
| RZ10 / RZ11 / SA38 screens | The screen-automation tool used for this document blocks system-administration transactions by design, so the change screens are described step by step instead of shown. Basis captures them during execution (evidence #3). |
| SMICM parameter list beyond page 1 | Paging that table through SAP GUI Scripting crashed SAP Logon; the authoritative values were read from DEFAULT.PFL and the instance profile in AL11 instead (Fig. 7–9). |
| Identity of 10.40.1.31 | No reverse-DNS entry; network/Basis inventory needed (§2.3). |
| Dynamic changeability on 7.93 | Documentation and SMICM differ (§3.3); the procedure uses an ICM restart so it works either way. |
| # | Evidence | Owner |
| --- | --- | --- |
| 1 | before-headers.txt (Step 1) and after-headers.txt + 404 + HTTP-redirect output (Step 5) | Basis |
| 2 | Screenshot SMICM > Modification Handler with the rule file active | Basis |
| 3 | Screenshot RZ10 DEFAULT profile with icm/HTTP/strict_transport_security and icm/HTTP/mod_0 | Basis |
| 4 | Rule file content (cat) with owner and permissions | Basis |
| 5 | SMICM trace after restart without errors | Basis |
| 6 | Regression sign-off (Step 6); Web Dispatcher evidence if Step 7 applies | Functional / Basis |
| 7 | Same evidence for QA and PRD | Basis |
| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Prepared by | FS_DEV3 | 24.09.2026 |  |
| Basis implementer |  |  |  |
| Security / audit |  |  |  |