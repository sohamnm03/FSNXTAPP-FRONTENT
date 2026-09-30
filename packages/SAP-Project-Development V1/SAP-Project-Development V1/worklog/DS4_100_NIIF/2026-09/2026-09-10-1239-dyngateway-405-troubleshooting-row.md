# Dyngateway integration guide — 405 troubleshooting row

- **Date:** 2026-09-10
- **System:** DS4_100_NIIF
- **Package:** — (documentation only, no SAP object touched)
- **Transport:** — (none)
- **Requested by:** vinit.s@fourthsignal.com

## Scope

The human hit HTTP 405 `/IWCOR/CX_OD_METHD_NOT_ALLOWED` calling the `RunQuery` action URL from
`docs/dyngateway-integration-guide.md` §2.2. Cause: the URL was called with `GET`; all four
gateway actions are collection-bound OData V4 actions and are `POST`-only. The URL itself was
correct. Diagnosis given, then the missing 405 row added to the guide's §13 troubleshooting table
and the finding recorded as L-338.

Out of scope: no SAP object was created, changed or activated; no live call was made this turn.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Add the 405 row to §13? | Yes — human confirmed | 2026-09-10 |

## Naming gate

Not applicable — no object created.

## Todo

- [x] 1. Diagnose the 405 against §2.2 / §3 of the integration guide
- [x] 2. Give the working `POST` + CSRF + cookie PowerShell sequence
- [x] 3. Add the 405 row to `docs/dyngateway-integration-guide.md` §13
- [x] 4. Record L-338 in `lessons/lessons-ledger.md`
- [x] 5. Open this worklog

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

Entries added to `lessons/lessons-ledger.md` during this activity: L-338.
