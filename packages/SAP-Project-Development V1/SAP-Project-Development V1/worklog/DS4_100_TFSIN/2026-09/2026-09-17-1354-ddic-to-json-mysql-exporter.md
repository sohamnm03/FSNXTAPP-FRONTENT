# DDIC table metadata → JSON exporter (for external MySQL DDL generation)

- **Date:** 2026-09-17
- **Started:** 13:54
- **System:** DS4_100_TFSIN
- **Package:** `$TMP` — **human override of CLAUDE.md non-negotiable 2 / L-215**, recorded as L-541
- **Transport:** none (`$TMP` local object, by the same override)
- **Requested by:** karthik.r@fourthsignal.com

## Scope

Build an ABAP program on DS4_100_TFSIN that reads the DDIC definition of one or more tables and
emits JSON describing every field with its **real** type facts — SAP data type, length, decimals,
key flag, NOT NULL — so that a converter **outside** SAP can turn that JSON into a MySQL
`CREATE TABLE`. Human also asked the JSON to carry a **suggested MySQL type** alongside the raw SAP
facts (answered Q4 below), so the external tool can either trust the suggestion or re-map from the
raw facts.

**Out of scope:** table *contents*. This is metadata/DDL only (human answered Q3). No MySQL
connection from SAP, no data extract, no INSERT generation.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Target system — TFSIN had no working connection in this workspace | **Fix the TFSIN connection first, then build there** | 2026-09-17 |
| 2 | `$TMP` "local object" conflicts with non-negotiable 2 (no `$TMP`, real `ZFS*` package on a transport) | **`$TMP` — human explicitly overrides the rule.** Recorded as L-541. Consequence accepted: the object can never be transported to QA/PRD | 2026-09-17 |
| 3 | JSON content — metadata only, or metadata + data rows? | **Metadata only** | 2026-09-17 |
| 4 | Should the ABAP emit a suggested MySQL type, or stay dumb and emit raw SAP facts only? | **Emit both** — raw SAP facts *and* a suggested MySQL type | 2026-09-17 |
| 5 | Object decomposition — single report with local classes, vs. global engine class + thin report | **(a) engine class + thin report.** The class is executable headlessly through `if_oo_adt_classrun`, so the JSON can be *proved* from the ADT console — TFSIN has no `sap-gui` binding, so a report-only build could be activated but never run | 2026-09-17 |
| 6 | Selection texts / text symbols cannot be maintained by me on TFSIN (`sap-gui` is bound to DS4_100_NIIF and TFSIN's `sapGui` block is `enabled: false`), so L-229's sanctioned SE38 route is unavailable here | **Listed for manual maintenance** in the completion report (working agreement §4). Five texts, all cosmetic — the report runs correctly without them | 2026-09-17 |
| 7 | Messages — `ZFS_TRM_MSG` has no catalog for this system (`docs/message-catalog/` holds only `DS4_100_NIIF.md`), so it probably does not exist on TFSIN. Creating it would be an object the human never asked for (rule 3) | **Designed around it: the report contains no `MESSAGE` statement at all.** `S_TAB` is `OBLIGATORY`, so the empty-input case cannot arise; download outcomes are reported as list lines. No message class needed, none created | 2026-09-17 |

## Connection work (prerequisite, done this turn)

TFSIN was `enabled: false` in `config/sap-systems.json` with an ADT URL its own `$comment` flagged
as an unverified placeholder, and no entry in the generated `.mcp.json`.

Probed and **verified** (evidence: this file's `evidence/` folder):

| Fact | Value |
|---|---|
| ADT endpoint | `https://vhtfqds4ap01.sap.tfsin.co.in:44300` → `10.110.0.33` |
| `/sap/bc/adt/discovery` | HTTP 200 with `FS_DEV` |
| `/sap/bc/adt/core/http/systeminformation` | `systemID=DS4, client=100, user=FS_DEV ("FS Executive")` |
| Port 8000 | HTTP 307 → redirects to HTTPS, so 44300 is the endpoint |
| Certificate | DigiCert / RapidSSL, `CN=*.sap.tfsin.co.in`, valid 2026-07-27 → 2027-02-10 |
| Distinct from NIIF? | yes — its own ZFS package set (`ZFS_TOOLKIT`, `ZFS_TCL`, `ZFS_BASIS`, `ZFS_FI_TFSIN`, …), nothing like NIIF's |

**Why it looked broken and what actually fixes it** — see L-540. `vhtfqds4ap01.sap.tfsin.co.in`
does not resolve in DNS from this workstation, and `10.40.1.33 vhnlqds4ap01.sap.niififl.in` is
already in the Windows `hosts` file: that hosts line **is** how NIIF connects. TFSIN simply never
got its line. With `curl --resolve` supplying the missing mapping, **strict TLS passes** (HTTP 200,
no `-k`), so no TLS weakening is warranted — the certificate is genuinely valid and trusted.

**Blocked:** appending the line needs elevation; `hosts` is not writable from this session.
Handed to the human.

## Naming gate

To be recorded here, one line per object, **before** each create call. No object created yet.

Candidate names validated against `docs/naming-conventions.md` "Classic & Misc" row
(`Program/report: ZFS_R_<AREA>_<NAME>`; includes are the report name plus `_TOP` / `_F01`;
`AREA` = `XA` cross-app, which is a listed area code):

```
NAMING: ZCL_FS_XA_TBL2JSON     -> matches ABAP OO row "Class: ZCL_FS_<AREA>_<NAME>", AREA=XA (cross-app)
NAMING: ZFS_R_XA_TBL2JSON      -> matches Classic & Misc row "Program/report: ZFS_R_<AREA>_<NAME>", AREA=XA (cross-app)
NAMING: ZFS_R_XA_TBL2JSON_TOP  -> matches Classic & Misc row "Includes are the report name plus a suffix (_TOP)"
NAMING: ZFS_R_XA_TBL2JSON_F01  -> matches Classic & Misc row "Includes are the report name plus a suffix (_F01)"
NAMING: ZFS_R_XA_DDIC2JSON     -> matches Classic & Misc row "Program/report: ZFS_R_<AREA>_<NAME>", AREA=XA (cross-app)
```

**Second build, human request 2026-09-17:** rebuild the whole thing as a **single new program with
local classes** instead of report + global class. `ZFS_R_XA_DDIC2JSON` validated against `$TMP` on
`DS4_100_TFSIN` before the create call — "Program validated successfully". A new name rather than a
rewrite of `ZFS_R_XA_TBL2JSON`, because the human asked for a *new* program; the first four objects
are left untouched and still active.

`AREA = XA` is the cross-app code listed in the convention's opening paragraph; this is a
developer utility that belongs to no functional module. Note the include naming warning in the
same row — never `ZFS_I_<NAME>`, which is the CDS interface-view prefix.

**Gate status:** both global names ran through `abap_creation-run_validation` against `$TMP` on
`DS4_100_TFSIN` *before* any create call — "Class validated successfully" / "Program validated
successfully". Nothing has been created yet: `deleteObject` is denied project-wide, so a shell
created early and then found wrong would be orphaned on the system permanently.

## Todo

- [x] 1. Answer the human's question: is TFSIN reached the same way as NIIF? (yes — same ADT/basic-auth path; only the hostname resolution differs)
- [x] 2. Verify the TFSIN ADT endpoint, credentials, system identity and certificate
- [x] 3. Open this worklog + raise L-540/L-541 in the same turn
- [x] 4. Human approved the design and chose option (a) — engine class + thin report
- [x] 5. Enable TFSIN in `config/sap-systems.json`, store `SAP_DS4_100_TFSIN_PASSWORD`, run `scripts/sync-sap-systems.ps1` → `abap-adt-ds4-100-tfsin` generated, registry validates, all secrets configured
- [x] 6. Write the full source for all four objects (staged in the session scratchpad)
- [x] 7. Naming gate: all four names validated pre-create
- [x] 8. Created all four shells via `adt-mcp` (destination `DS4_100_TFSIN`, package `$TMP`, owner `FS_DEV`)
- [x] 9. Human added the `hosts` line and restarted; `abap-adt-ds4-100-tfsin` connects
- [x] 10. Filled all four sources via `setObjectSource`
- [x] 11. Activated: program + both includes in one `activateObjects` call (L-209), then the program again on its own (L-543)
- [x] 12. ATC clean at priority 1/2; class run end to end, JSON captured as evidence
- [ ] 9. Syntax check, activate, ATC, pretty-print
- [ ] 10. Run against a real TFSIN table and capture the JSON as evidence
- [ ] 11. Completion report: objects, messages created (if any), selection texts for manual maintenance

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `ZCL_FS_XA_TBL2JSON` | `CLAS/OC` | `$TMP` | none (L-541) | **active** |
| `ZFS_R_XA_TBL2JSON` | `PROG/P` | `$TMP` | none (L-541) | **active** |
| `ZFS_R_XA_TBL2JSON_TOP` | `PROG/I` | `$TMP` | none (L-541) | **active** |
| `ZFS_R_XA_TBL2JSON_F01` | `PROG/I` | `$TMP` | none (L-541) | **active** |
| `ZFS_R_XA_DDIC2JSON` | `PROG/P` | `$TMP` | none (L-541) | **active** — second build, single self-contained program |

Four objects, which is the whole list — no helper, runner, test or scratch object, and no message
class (Q7). The engine class earns its place as the unit that can actually be *proved* headlessly;
the report is a thin shell over it.

## Routing

Per working agreement §5, and confirmed for this system:

- **`adt-mcp` creates.** Its `abap_list_destinations` returns exactly `[DS4_100_TFSIN]`, so the
  usual NIIF/TFSIN ambiguity (identical SID *and* client) does not arise in this session — but the
  `destination: DS4_100_TFSIN` argument is passed explicitly on every call regardless.
- **`abap-adt-ds4-100-tfsin` changes and reads** — the pinned per-system server, which is what
  `setObjectSource` must go through to fill each object's source. It needs the hosts line and a
  restart; `adt-mcp` does not, because it reaches the system over RFC.
- **`mcp-abap-abap-adt-api` cannot be substituted for it.** The human asked whether that server
  could serve TFSIN too; tested rather than assumed, and it cannot — it is hardcoded to the
  *default* system, so every call dials NIIF:
  `Failed to search objects: connect ETIMEDOUT 10.40.1.33:44300`. The target host is fixed in the
  env the server process started with, not selectable per call. (NIIF being unreachable is
  incidental; even reachable, it would be the wrong system — and writing there would be worse than
  failing.) This is the practical reason the per-system server exists.

## Delivery checks

- [x] Pretty Printer — source written pre-formatted in house style; no reformatting needed
- [x] Syntax check clean — activation is the authoritative gate and reported no errors
- [x] Activated, nothing left inactive — verified by filtering `inactiveObjects` for these four
      names: **0 occurrences**. The first `activateObjects` claimed `success: true` and
      `inactive: []` while the main program was still inactive; see **L-543**
- [x] ATC / Code Inspector — priority 1 and 2 resolved: **0 errors, 0 warnings**, 21 priority-3
      infos. 17 are SLIN "strings without text elements are not translated" over JSON structural
      fragments (`, "decimals": `) and technical caveats — translating them would corrupt the
      output, so they stay. 2 are the empty-primary-key note on `SORT`/`DELETE ADJACENT DUPLICATES`
      over a plain value list, which is the correct idiom. 2 are the undefined text symbols B01/B02
      (Q6)
- [ ] ABAP Unit — **none applicable.** No test class exists: the human asked for a program, and a
      test class is an object that was not requested (rule 3). Verification was done instead by
      running the class end to end against live tables and machine-validating the JSON
- [ ] Text symbols and selection texts maintained — **handed to the human (Q6).** Cosmetic only;
      the report runs correctly without them
- [x] Object list confirmed in the transport — **n/a, `$TMP` by human override (L-541)**

## Second build — single self-contained program (human request, 2026-09-17)

The human asked for the whole thing rebuilt as **one new program with local classes** instead of
report + global class. `ZFS_R_XA_DDIC2JSON` (523 lines) holds the selection screen, `LCL_EXPORTER`
(the engine) and `LCL_APP` (plumbing) in a single source — no includes, no global class, so it can
be pasted into SE38 on any system and run. The human confirmed the global class could be used as
the reference for the local class, which is what was done.

The first four objects are **left untouched and still active**; the human asked for a *new* program,
not a rewrite. Nothing was deleted.

**How this build was verified.** A report cannot be executed headlessly here — `sap-gui` is bound to
DS4_100_NIIF and TFSIN's `sapGui` block is `enabled: false` — so the live end-to-end run that
validated the first build could not be repeated against this one. Instead of asserting it works,
the engine was diffed method by method against the version that *was* proved live:

```
export IDENTICAL · append_table IDENTICAL · append_field IDENTICAL · map_sap_to_mysql IDENTICAL
mysql_note IDENTICAL · ddic_field_list IDENTICAL · table_description IDENTICAL
escape IDENTICAL · iso_timestamp IDENTICAL          -> 9/9 method bodies byte-identical
```

Only the report plumbing (`run`, `collect_tables`, `display`, `download`, `pick_file`) is outside
that diff, and it is unchanged from the `_F01` include of the first build. **Stated plainly: the
JSON-building logic is proved; this program's end-to-end execution is not, and needs one SE38 run
by the human to close.**

ATC on `ZFS_R_XA_DDIC2JSON`: **0 errors, 0 warnings**, 20 priority-3 infos of the same kind as the
first build. Activation verified against `inactiveObjects` per L-543 — 0 occurrences.

## Verification actually performed

Run through the ADT `classrun` REST endpoint (the `runClass` tool is broken here — **L-542**),
HTTP 200, output in `evidence/.../classrun-output.txt`:

| Case | Result |
|---|---|
| `T000` | 17 fields, `description` = `Clients`, `primaryKey` = `["MANDT"]` |
| `MARA` | 307 fields, `description` = `General Material Data`, `primaryKey` = `["MANDT","MATNR"]` |
| `NO_SUCH_TABLE` | reported as `"error": "No DDIC type found for NO_SUCH_TABLE"` **inside** the document, with the other two tables still usable |
| JSON validity | parsed by Python `json.loads` — 159,193 characters, valid |
| Type map | all 22 probe cases correct, incl. `CHAR len=9000 -> TEXT`, `NUMC -> VARCHAR`, `CURR/QUAN -> DECIMAL(p,s)` |
| Currency/unit refs | `MARA-BRGEW` `QUAN(13,3)` -> `DECIMAL(13,3)` carrying `referenceField = {MARA, GEWEI}` |
| MARA type coverage | CHAR 208, DEC 25, QUAN 23, UNIT 18, NUMC 17, DATS 8, TIMS 2, RAW 2, CLNT/INT1/INT2/INT8 1 each |

## Evidence

`worklog/DS4_100_TFSIN/2026-09/evidence/2026-09-17-1354-ddic-to-json-mysql-exporter/`

## Lessons raised

L-540 (TFSIN connection diagnosis), L-541 (`$TMP` override), L-542 (`runClass` false negative),
L-543 (`activateObjects` reporting success while the program stayed inactive), L-544 (XCO empty
short description).
