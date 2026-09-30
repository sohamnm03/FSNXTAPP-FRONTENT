# TRM + FI BAPI context extract for dyngw v2

- **Date:** 2026-09-14
- **Started:** 14:20
- **System:** DS4_100_NIIF
- **Package:** — (no ABAP objects created; documentation only)
- **Transport:** — (none required)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Extract the Treasury and Risk Management (TRM) and Financial Accounting (FI) **BAPI** inventory from
DS4/100 and land it in the repo as reusable context for future **dynamic gateway v2**
(`ZFS_SB_DYNGW_O4_API`) `FUNC` work, so a later session does not re-discover it. Delivered to the new
folder `context/sap-bapis/`.

Read-only throughout — nothing was created, changed or activated on SAP.

**In scope:** BAPI name, short text, function group, package, application component, RFC flag
(`TFDIR-FMODE`), the complete parameter interface (`FUPARAREF`, active version), and the full DDIC
field list of every structure those interfaces reference.

**Out of scope, by the human's instruction mid-task:** standard DDIC **tables**. An initial table
extraction (TRM 2 805 / FI core 2 953 transparent tables with field lists) was run and then
**discarded** on that instruction. BAPI *structures* were kept — they are the payload contract, not
"tables". Also out of scope: executing any BAPI, and the `FI-CA` / `FI-TV` / `FI-LOC` / `FI-FM` /
`FI-RA` subtrees.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Depth per object — names only, or full signatures? | Full signature + full field lists | 2026-09-14 |
| 2 | Breadth — whole component trees, or core? | TRM core + FI core | 2026-09-14 |
| 3 | Output format? | JSON + Markdown index | 2026-09-14 |
| 4 | Are tables wanted? | **No** — "leave the standard tables … focus on the BAPIS" | 2026-09-14 |
| 5 | Is `FTR_BAPI` the full TRM BAPI list? | No — it covers 283 of 380; delta reported (L-509) | 2026-09-14 |
| 6 | Were released APIs checked? | Not at first — corrected: `RODIR` captured, 458/530 released (L-510) | 2026-09-14 |
| 7 | Cross-check official SAP docs? | Done; SPA pages could not be machine-read, cited as browser references only | 2026-09-14 |

## Naming gate

No SAP object was created, so no `NAMING:` line applies. The one new repo path is
`context/sap-bapis/`, a documentation folder outside the `ZFS*` object namespace.

## Todo

- [x] 1. Confirm read connectivity (`healthcheck` green; `adt-mcp` was down at session start, later up — not needed, reads only)
- [x] 2. Agree scope with the human (depth / breadth / format)
- [x] 3. Build a disk-writing ADT data-preview extractor so catalogue-scale rows never pass through context
- [x] 4. Resolve the application-component tree (`TDEVC` → `DF14L`) to define TRM and FI scope by component, not name pattern
- [x] 5. Extract BAPI headers, RFC flags and short texts
- [x] 6. Extract the full parameter interface for all in-scope BAPIs
- [x] 7. Extract the DDIC field lists of every referenced structure, plus data-element texts
- [x] 8. ~~Extract table field lists~~ — **dropped on the human's instruction**, extracted data deleted
- [x] 9. Generate `README.md`, catalogues, signature references and JSON
- [x] 10. Spot-verify a generated entry against a direct system query
- [x] 11. Ledger entries L-508, L-509 + this worklog
- [x] 12. **Release state** — captured from `RODIR`, merged into JSON + catalogues, written up in
      `context/sap-bapis/released-apis.md`; L-509's "not readable" claim corrected by **L-510**
- [x] 13. Cross-reference official SAP documentation (Business Accelerator Hub, SAP Help TRM APIs,
      ADT released-APIs guide) and record what could and could not be machine-read

## Object list

No SAP objects. Repo artifacts delivered:

| Artifact | Type | Contents |
|---|---|---|
| `context/sap-bapis/README.md` | Doc | Provenance, scope derivation, TRM instrument map, key FI BAPIs, dyngw v2 usage notes, known gaps |
| `context/sap-bapis/trm-bapis-catalog.md` | Doc | 380 TRM BAPIs by function group |
| `context/sap-bapis/trm-bapis-signatures.md` | Doc | Full parameter tables, all TRM BAPIs |
| `context/sap-bapis/fi-bapis-catalog.md` | Doc | 150 FI BAPIs by component |
| `context/sap-bapis/fi-bapis-signatures.md` | Doc | Full parameter tables, all FI BAPIs |
| `context/sap-bapis/json/trm-bapis.json` | Data | 380 BAPIs, parameters nested |
| `context/sap-bapis/json/fi-bapis.json` | Data | 150 BAPIs, parameters nested |
| `context/sap-bapis/json/structures.json` | Data | 834 structures, 14 683 fields |
| `context/sap-bapis/json/_meta.json` | Data | Extraction parameters, counts, known gaps |
| `context/sap-bapis/released-apis.md` | Doc | Release gate: the two SAP release models, `RODIR` results, the 72 BAPIs with no guarantee, `API_*` services on DS4, official SAP references |
| `context/sap-bapis/scripts/` | Script | `adt-sql.ps1` (one SQL statement → one JSON file over the ADT data-preview endpoint) plus the four Python generators, committed so the extract is reproducible. Password comes from `$env:SAP_DS4_100_NIIF_PASSWORD`; no secret in the files (grep-verified). |

Totals: **530 BAPIs** (511 remote-enabled), **5 195 parameters**, **834 structures**, 4.8 MB.

## Findings worth carrying forward

- **`FTR_BAPI` covers 283 of 380 TRM BAPIs.** The other 97 (hedge management `THA_BAPI_*`, exposure
  `TEM_BAPI_*` / `BAPI_TEX_*`, market data and limits `JBD_*`, swaptions `TTM_OPTION_*`,
  `FTR_BUS2042`) are real TRM BAPIs that transaction does not list. L-509.
- **377/380 TRM and 134/150 FI BAPIs are remote-enabled.** With a blank `CALL_MODE` falling back to
  `TFDIR-FMODE` (L-492), the default for nearly every BAPI here is **out-of-LUW** — registering one
  for use inside a batch transaction means setting `CALL_MODE = 'L'` on purpose.
- **`BAPI_ACC_DOCUMENT_*` lives under component `AC-INT`, not `FI`** — an `FI*` component filter
  alone silently misses the central FI posting BAPIs.
- **API release state WAS captured, from `RODIR`** (*Released Objects Directory*) — after an initial
  wrong conclusion that it was unreadable (L-510 corrects L-509). **TRM 339/380 and FI 119/150 are
  released for customer use; 72 catalogued BAPIs carry no release guarantee**, and
  `BAPI_TEX_EXPOSURE_DELETE` is released *and* obsolete. `released` / `obsolete` /
  `inReleasedObjectsDirectory` are now per-BAPI fields in the JSON and a `Rel` column in both
  catalogues. The ABAP Cloud **C1** contract state remains unreadable here (`ARS_*` tables empty) —
  a genuinely narrower gap than first recorded.
- **Official SAP documentation checked at the human's request.** `help.sap.com` / `api.sap.com` are
  JavaScript applications and return an empty shell to a scripted fetch, so they were **not** used as
  a source for any figure; they are cited in `released-apis.md` as browser-verification entry points,
  with the SAP Help TRM API page flagged as **S/4HANA Cloud** documentation against an on-premise
  system. The on-system equivalent was extracted instead: `API_*` OData services installed for these
  components (TRM 2, FI 48).
- **12 FI BAPIs have no English short text** on this system (the `BAPI_ACC_ASS*` asset-posting
  family). The German text is carried instead, suffixed `[de]` — nothing was translated.
- Four extraction traps on the ADT data-preview endpoint (credential source, two `Accept` headers,
  ~255-char SQL line wrap reported as a literals error, `TDEVC-COMPONENT` being an opaque
  `DF14L-FCTR_ID`) — L-508.

## Delivery checks

- [x] Pretty Printer — n/a, no ABAP
- [x] Syntax check clean — n/a, no ABAP
- [x] Activated, nothing left inactive — n/a, nothing created on SAP
- [x] ATC / Code Inspector — n/a, no ABAP
- [x] ABAP Unit green — none applicable, no ABAP objects
- [x] Text symbols and selection texts maintained — n/a
- [x] Object list confirmed in the transport — n/a, no transport
- [x] JSON files parse; counts reconcile across README, catalogues and JSON
- [x] `BAPI_FTR_FXT_CREATE` spot-verified: generated entry matches a direct `FUPARAREF` query
      (7 parameters, same kinds, same type refs, `TESTRUN` optional with default `SPACE`)

## Evidence

No screenshots or payload dumps — the delivered artifacts in `context/sap-bapis/` *are* the
extraction output, committed in full. Intermediate query dumps stayed in the session scratchpad and
were not retained (L-505: raw tool output is not evidence).

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: **L-508**, **L-509**, **L-510**.
L-510 supersedes the release-state bullet of L-509; that bullet is marked in place, not deleted.
