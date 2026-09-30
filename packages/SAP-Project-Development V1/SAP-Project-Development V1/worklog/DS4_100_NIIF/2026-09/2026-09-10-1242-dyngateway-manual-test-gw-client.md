# Dyngateway — manual test path via /IWFND/GW_CLIENT

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF (confirmed live: DS4 / client 100 / user FS_DEV3)
- **Package:** — (documentation only, no SAP object touched)
- **Transport:** — (none)
- **Requested by:** vinit.s@fourthsignal.com

## Scope

Follow-on from the L-338 405 diagnosis: the human asked how to test the gateway actions manually
in SAP GUI. I first answered that no in-GUI client could POST to a V4 A2X service. That was wrong
and unverified. Verified live instead: `/IWFND/GW_CLIENT` drives the V4 action, offers POST, and
attaches the CSRF token itself. Documented as guide §12a and recorded as L-339.

Out of scope: no SAP object created, changed or activated. The only live action was one read-only
`RunQuery` POST with an empty body, which the action rejected (400) before executing anything.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Can `/IWFND/GW_CLIENT` POST to a V4 A2X action? | Yes — verified, incl. automatic CSRF | 2026-09-10 |
| 2 | Can `sap-gui` automation fill the request body? | No — `SAPGUI.AbapEditor.1` refuses `set_textedit` | 2026-09-10 |
| 3 | Does the body pane need an explicit `Content-Type: application/json`? | **Yes, mandatory** — without it the JSON is parsed as XML (`CX_SXML_PARSE_ERROR`) | 2026-09-10 |

## Naming gate

Not applicable — no object created.

## Todo

- [x] 1. Reconnect `sap-gui` and confirm DS4/100 (L-213: user read from session info)
- [x] 2. Open `/IWFND/GW_CLIENT`, select POST, set the corrected V4 action URI
- [x] 3. Execute and capture the result as evidence
- [x] 4. Write guide §12a with the verified step table and the two limits
- [x] 5. Record L-339, including the process lesson about unverified capability claims
- [x] 6. Open this worklog
- [x] 7. Confirm whether the JSON body needs an explicit `Content-Type` header — yes, mandatory (L-340)
- [x] 8. Read the live allow-list; found `T000` unregistered, so §12 P3 cannot pass here (L-340)

## Evidence

- Empty-body POST → `~status_code 400`, `/IWBEP/CM_V4H_RUN/006` *"Non nullable action parameter …"*,
  `content-type: application/json;odata.metadata=minimal` — the action was reached.
- `X-CSRF-Token: EpIVDN8sbXLAoH3I9-Dyig==` present in the HTTP Request header grid, unprompted.
- Pre-existing URI in the field read `zfs_sb_dyngateway_o_api` (missing the `4`) — corrected.
- Human-typed JSON body → `400 CX_SXML_PARSE_ERROR` / `/IWCOR/CX_OD_BAD_REQUEST`: sent as XML.
- `Edit → Default Input V4` loaded SAP's V4 demo request over the form and reset the method to GET.
- `SE16` on `ZFS_T_SLC_DYNGW`: 198 rows, `ENTRY_TYPE` `R` = allow-list, `L` = call log (live
  `RFC_READ_TABLE` entries present). `SE16N` blocked by the `sap-gui` security policy.
- Registered active `QURY` targets: `VTBFHA`, `VTBFHAPO`, `ZFS_CDS_SLC_001`, `ZFS_CDS_SLC_002`,
  `ZFS_SLC_OTTK_BTP`, `ZSGSLCTR_BPEXT`, `ZSGSLCTR_DEALID`, `ZSGSLCTR_FEEDATA`. `T000` absent.

## Registry change made

| Action | Row | Detail |
|---|---|---|
| `POST /DynGateway` | `T000` | `ENTRY_TYPE R`, `QURY`, `Operation SELECT`, `IsActive X`, `AllowRead X`, `MaxRows 20`, `Descr` "Client table read - acceptance suite P3". UUID `5254001FE7A21FD1ABA3410FF70D4000` |

Read-only target, chosen by the human over activating `RPY_PROGRAM_READ` (see L-342). It makes
guide §12's acceptance row P3 runnable on this system for the first time. To reverse:
`PATCH /DynGateway(5254001f-e7a2-1fd1-aba3-410ff70d4000)` with `IsActive` blank, `If-Match: *`.

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| — | — | — | — | no SAP object touched |

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP
- [x] Activated, nothing left inactive — n/a, no ABAP
- [x] ATC / Code Inspector — n/a, no ABAP
- [x] ABAP Unit green — none applicable, documentation change only
- [x] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed in the transport — n/a, nothing transportable

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-339, L-340, L-341, L-342.
