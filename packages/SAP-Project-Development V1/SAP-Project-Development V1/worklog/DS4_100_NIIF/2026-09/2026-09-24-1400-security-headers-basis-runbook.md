# Audit "No Security Headers Present": Basis runbook (read-only capture)

- **Date:** 2026-09-24
- **Started:** 14:00
- **System:** DS4_100_NIIF
- **Package:** n/a (Basis configuration, nothing built)
- **Transport:** none (profile parameters and OS files are not transportable)
- **Requested by:** Niranjan K

## Scope

A Word runbook, with live screenshots of NIIF, telling Basis exactly which values to change to add
HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options/CSP frame-ancestors and
X-XSS-Protection. **Nothing was changed on the system** (the human's instruction). The sap-gui
policy blocks RZ10/RZ11, so neither was opened. All values were read via SM51, SMICM (Goto >
Services / Parameters / Modification Handler) and AL11 (DEFAULT.PFL, instance profile).

## Findings (current values)

- One instance, vhnlqds4ap01_DS4_00; kernel 793 PL417, SLES-15.
- ICM ports: HTTPS 443$$ (44300), SMTP 250$$, HTTP 80$$ (8000).
  `icm/HTTP/redirect_0` already redirects HTTP to HTTPS (live: 307). It appears twice in DEFAULT.PFL, plus `redirect_00`.
- `icm/HTTP/mod_0 = PREFIX=/,FILE=-` (kernel default, not in any profile). It's dynamically modifiable.
- `is/HTTP/show_server_header = FALSE`.
- **`restrict_admin/admin_clients = 000`**, with PFL_PARAM_CHANGE / ICM_CHANGE_PARAMS / ICM_RESTART.
  Basis must implement from client 000.
- None of the audited headers is sent today (a HTTPS 200 and a 404 were checked).

## Recommendation (in the runbook)

A rule file `/usr/sap/DS4/SYS/global/security/data/icm_security_headers.txt` with 6
`SetResponseHeader` lines, and `icm/HTTP/mod_0 = PREFIX=/,FILE=$(DIR_GLOBAL)$(DIR_SEP)security$(DIR_SEP)data$(DIR_SEP)icm_security_headers.txt`.
Activate it dynamically in SMICM (client 000), make it permanent in RZ10 DEFAULT, verify, run regression tests,
then repeat in QA/PRD.

## Revision 2 (the human: "i didnt tell u to urgently complete with half information")

The first version was delivered with gaps. I closed them by continuing the display-only capture and checking SAP sources:
- HSTS now uses SAP's dedicated `icm/HTTP/strict_transport_security = max-age=31536000;includeSubDomains`
  (kernel >= 7.53, SAP KBA 3359291). The rule file now carries the other 5 headers (KBA 3518456 / 3468400).
- ICM HTTP log: **10.40.1.31 polls `/sap/public/icf_info/icr_groups` and `/sap/public/icman/ping` every ~20 s**,
  which looks like a Web Dispatcher or LB health check. It has no PTR record, so Basis must identify it. Added Step 7 (Web Dispatcher).
- UCON_CHW: ClickJacking Framing Protection is already in Active Check (client 100).
- SMICM trace baseline: only WebSocket ping time-outs.
- Documentation conflict: the 7.4 documentation says `icm/HTTP/mod_<xx>` is not dynamic, but SMICM on 7.93 lists it as dynamic.
  The runbook now uses RZ10 plus an ICM restart, with the dynamic route kept only as an optional quick test.
- The sap-gui policy blocks RZ10/RZ11/SA38 by design, so those screens aren't in the document. It lists them as Basis evidence and has a
  "What this document could not capture" section.

The runbook is 13 pages with 12 figures. Screenshots 16–18 were added to evidence.

## Incident during capture

Moving the SMICM parameter table-control scrollbar via SAP GUI Scripting (COM `VerticalScrollbar.Position`,
and later `sap_read_table start_row`) crashed SAP Logon. The first time it took the scripted connection down
(SAP Logon restarted at 14:00), and the human had to log on again. No data was changed. See L-563.

## Evidence

`evidence/2026-09-24-1400-security-headers-basis-runbook/`: 13 screenshots and the runbook .docx
(also in the human's Downloads folder).

## Lessons raised

L-563
