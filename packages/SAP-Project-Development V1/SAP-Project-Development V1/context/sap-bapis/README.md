# SAP TRM & FI BAPI context - DS4 / client 100

Reference context for calling **Treasury and Risk Management (TRM)** and **Financial Accounting (FI)**
BAPIs, captured from the live system so a future session does not have to re-discover them. Built to
feed **dynamic gateway v2** (`ZFS_SB_DYNGW_O4_API`) `FUNC` steps - see [Using this with dyngw v2](#using-this-with-dyngw-v2).

> **Scope note.** This folder documents **BAPIs only**. Standard DDIC tables were deliberately left
> out. The DDIC **structures** that appear in the BAPI interfaces *are* included, because they are the
> payload contract - you cannot build a `ParamsJson` without them.

## Provenance

| | |
|---|---|
| System | `DS4` client `100` - registry id `DS4_100_NIIF` |
| Extracted | 2026-09-14 |
| Method | ADT data preview (`POST /sap/bc/adt/datapreview/freestyle`), read-only |
| Source tables | `ENLFDIR`, `TFDIR`, `TFTIT`, `FUPARAREF`, `TADIR`, `TDEVC`, `DF14L`, `DF14T`, `DD03L`, `DD02T`, `DD04T` |
| Writes to SAP | none - read-only extraction |

## What is here

| File | Contents |
|---|---|
| [`trm-bapis-catalog.md`](trm-bapis-catalog.md) | 380 TRM BAPIs, one line each, grouped by function group |
| [`trm-bapis-signatures.md`](trm-bapis-signatures.md) | Every parameter of every TRM BAPI |
| [`fi-bapis-catalog.md`](fi-bapis-catalog.md) | 150 FI BAPIs, grouped by application component |
| [`fi-bapis-signatures.md`](fi-bapis-signatures.md) | Every parameter of every FI BAPI |
| [`released-apis.md`](released-apis.md) | **Release gate** - which BAPIs are released for customer use, which are not, which are obsolete, the two SAP release models, the `API_*` OData services installed on DS4, and the official SAP references |
| [`json/trm-bapis.json`](json/trm-bapis.json) | TRM BAPIs, machine-readable, parameters nested |
| [`json/fi-bapis.json`](json/fi-bapis.json) | FI BAPIs, same shape |
| [`json/structures.json`](json/structures.json) | 834 DDIC structures referenced by those interfaces, with full field lists (name, key flag, data element, type, length, decimals, text, currency/quantity reference) |
| [`json/_meta.json`](json/_meta.json) | Extraction parameters and known gaps |
| `scripts/` | The extractor that produced all of the above - `adt-sql.ps1` (one SQL statement -> one JSON file over the ADT data-preview endpoint; reads the password from `$env:SAP_DS4_100_NIIF_PASSWORD`, holds no secret) and the four Python generators. Re-run them to refresh against a changed system; the generators expect the raw dumps in the working directory. |

Totals: **530 BAPIs** (511 remote-enabled), **5195 parameters**
(2419 IMPORTING, 882 EXPORTING, 1891 TABLES, 2 CHANGING, 1 EXCEPTION),
**834 structures** covering 14683 fields.

## How scope was derived

Function modules named `BAPI*`, resolved to their function group (`ENLFDIR`), then to the group's
package (`TADIR`) and that package's application component (`TDEVC` -> `DF14L`). Component, not name
pattern, decides membership:

- **TRM** - every component under `FIN-FSCM-TRM` (380 BAPIs).
- **FI** - components `FI`, `AC-INT` (the accounting interface, where `BAPI_ACC_DOCUMENT_*` actually
  lives), plus the `FI-GL*`, `FI-AP*`, `FI-AR*`, `FI-AA*`, `FI-BL*` subtrees (150 BAPIs).
  Deliberately excluded: `FI-CA` (contract accounting), `FI-TV` (travel), `FI-LOC` (country
  localisations), `FI-FM`, `FI-RA` - large, and not core FI posting/reporting.

### On transaction `FTR_BAPI`

`FTR_BAPI` exists here as a transaction, a program **and** a function group, all in package `FTTR`.
Its `FTR_BAPI*` function groups hold **283** of the 380 TRM BAPIs. The remaining 97 are real TRM
BAPIs that `FTR_BAPI` does *not* group - hedge management (`THA_BAPI_*`), exposure management
(`TEM_BAPI_*`, `BAPI_TEX_*`), market data and limits (`JBD_MD*`, `JBD_LM_BAPI`), swaptions
(`TTM_OPTION_*`) and `FTR_BUS2042`. **Do not treat the `FTR_BAPI` list as the complete TRM BAPI
inventory** - the catalogue here is the wider set.

## TRM instrument map

| Function group | Instrument | BAPIs | Lifecycle verbs |
|---|---|--:|---|
| `1062` | External Securities Account Statement | 1 | CREATE |
| `1064` | BAPI: Redemption Factor Header + Factors | 3 | CHANGE, CREATE, DETAIL |
| `1074` | Redemption Schedule Sets | 6 | CREATE, DETAIL, FACTOR, LIST, SCHEDULE |
| `FTBAS_IB_BAPI` | Redemption Schedule Version | 5 | CREATE, DELETE, GETALLVERSIONS, GETDETAIL, GETVERSNUMBER |
| `FTR_BAPI_ADDFLOW` | Ôther Flow | 5 | CHANGE, CREATE, DELETE, GETLIST, STRUC |
| `FTR_BAPI_BG` | Bank Guarantee | 15 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, ORDERCHANGE, ORDERCREATE, ORDEREXECUTE... |
| `FTR_BAPI_CAI` | Current Acct-Style Instrument | 11 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, GIVENOTICE, REVERSE, ROLLOVER... |
| `FTR_BAPI_CAPFLOOR` | OTC Interest Rate Derivative Cap/Floor | 7 | CHANGE, CREATE, GETDETAIL, GIVENOTICE, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_CFT` | Cash Flow-Dependent Transaction | 11 | CHANGE, CREATE, DELETE, GETDETAIL, GETLIST, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_COMS` | a Commodity Swap | 13 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, GIVENOTICE, REVERSE, SETTLE... |
| `FTR_BAPI_CONDITION` | RFC for Method Condition Creation | 5 | CHANGE, CREATE, DELETE, GETLIST, STRUC |
| `FTR_BAPI_CP` | Commercial Paper | 7 | CHANGE, CREATE, GETDETAIL, MAPPING, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_CTY_OTC` | Commodity Forward | 9 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_DAN` | Deposit at Notice | 8 | CHANGE, CREATE, GETDETAIL, GIVENOTICE, REVERSE, ROLLOVER, SETTLE, STRUC |
| `FTR_BAPI_FAC` | Facility | 8 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, REVERSE, SETTLE |
| `FTR_BAPI_FLP` | a Forward Loan | 9 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_FORWARDS` | Forward Security | 12 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, DELIVERY, GETDETAIL, MATURITY, REVERSE... |
| `FTR_BAPI_FRA` | an OTC Interest Rate Derivative FRA | 7 | CHANGE, CREATE, GETDETAIL, GIVENOTICE, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_FTD` | Fixed-Term Deposit | 10 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, REVERSE, ROLLOVER, SETTLE... |
| `FTR_BAPI_FUTURE` | a Future | 6 | CHANGE, CREATE, GETDETAIL, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_FXT` | a Foreign Exchange Transaction | 18 | CHANGE, CREATE, CREATESWAP, DEALCHANGE, DEALCREATE, DEALGET, FIXING, FXOPTIONS, GETDETAIL... |
| `FTR_BAPI_HEDGE_MGMT` | BAPI to Hedge Management Data for a Transaction | 1 | CREATE |
| `FTR_BAPI_IRATE` | Interest Rate Instrument | 11 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, GIVENOTICE, REVERSE, ROLLOVER... |
| `FTR_BAPI_LC` | Letter of Credit | 16 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, ORDERCHANGE, ORDERCREATE, ORDEREXECUTE... |
| `FTR_BAPI_MAINFLOW` | Main Flow | 5 | CHANGE, CREATE, DELETE, GETLIST, STRUC |
| `FTR_BAPI_PAYDET` | Payment Details | 5 | CHANGE, CREATE, DELETE, GETLIST, STRUC |
| `FTR_BAPI_REPO` | a Repo | 9 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, REVERSE, SETTLE, STRUC |
| `FTR_BAPI_SECURITY` | a Security Transaction | 10 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, PRICE, REVERSE, SETTLE... |
| `FTR_BAPI_SL` | a Security Lending Transaction | 8 | CHANGE, CREATE, GETDETAIL, GIVENOTICE, REVERSE, ROLLOVER, SETTLE, STRUC |
| `FTR_BAPI_SWAP` | an OTC Interest Rate Derivative Swap | 10 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, GETDETAIL, GIVENOTICE, REVERSE, SETTLE... |
| `FTR_BAPI_TRES` | a Total Return Swap | 11 | CHANGE, CREATE, DEALCHANGE, DEALCREATE, DEALGET, EXERCISE, GETDETAIL, MATURITY, REVERSE... |
| `FTR_TEX_EXPOSURE_BAPI` | Raw Exposure | 5 | CHANGE, CREATE, DELETE, GETDETAIL, STARTRELEASE |
| `TEM_BAPI_EXPOSURE` | Exposures | 6 | CHANGE, CREATE, DELETE, GETDETAIL, GETLIST, RELEASE |
| `THA_BAPI_HEDGE_PLAN` | Hedge Plan | 4 | CHANGE, CREATE, DELETE, GETDETAIL |
| `THA_BAPI_TRANS_CO` | Individual Commodity Transaction | 4 | CHANGE, CREATE, DELETE, GETDETAIL |
| `THA_BAPI_TRANS_FX` | Individual FX Transaction | 4 | CHANGE, CREATE, DELETE, GETDETAIL |
| `THA_BAPI_TRANS_IR` | Individual IR Transaction | 4 | CHANGE, CREATE, DELETE, GETDETAIL |

## Key FI BAPIs

| BAPI | Component | RFC | Description |
|---|---|:--:|---|
| `BAPI_ACC_DOCUMENTS_RECORD` | `AC-INT` | yes | Follow-On Document Numbers in Accounting for Multiple Source Documents |
| `BAPI_ACC_DOCUMENT_CHECK` | `AC-INT` | yes | Accounting: Check |
| `BAPI_ACC_DOCUMENT_DISPLAY` | `FI` | yes | Accounting: Display Method for Follow-On Document Display |
| `BAPI_ACC_DOCUMENT_POST` | `AC-INT` | yes | Accounting: Posting |
| `BAPI_ACC_DOCUMENT_RECORD` | `FI` | yes | Accounting: Follow-on Document Numbers for Source Document |
| `BAPI_ACC_DOCUMENT_REV_CHECK` | `AC-INT` | yes | Accounting: Check Reversal |
| `BAPI_ACC_DOCUMENT_REV_POST` | `AC-INT` | yes | Accounting: Post Reversal |
| `BAPI_ACC_GL_POSTING_CHECK` | `AC-INT` | yes | Accounting: General G/L Account Posting |
| `BAPI_ACC_GL_POSTING_POST` | `AC-INT` | yes | Accounting: General G/L Account Posting |
| `BAPI_ACC_GL_POSTING_REV_CHECK` | `AC-INT` | yes | Accounting: Check Reversal of General G/L Account Posting |
| `BAPI_ACC_GL_POSTING_REV_POST` | `AC-INT` | yes | Accounting: Post General G/L Posting Reversal |
| `BAPI_AP_ACC_GETBALANCEDITEMS` | `FI-AP-AP` | yes | Vendor Account Clearing Transactions in a given Period |
| `BAPI_AP_ACC_GETOPENITEMS` | `FI-AP-AP` | yes | Vendor Account Open Items at a Key Date |
| `BAPI_AR_ACC_GETBALANCEDITEMS` | `FI-AR-AR` | yes | Customer account clearing transactions in a given time period |
| `BAPI_AR_ACC_GETOPENITEMS` | `FI-AR-AR` | yes | Customer account open items at a key date |
| `BAPI_CR_ACC_GETOPENITEMSSTRUCT` | `FI-AR-AR` | yes | BAPI/BUS1010: Determine OI Structure |
| `BAPI_GL_ACC_GETBALANCE` | `FI-GL-GL-N` | yes | Closing balance of G/L account for chosen year |

## API release state

Full detail, including the two SAP release models, the 72 BAPIs with no release guarantee, the
`API_*` OData services on this system and the official SAP references: **[`released-apis.md`](released-apis.md)**.

Captured from **`RODIR`** (*Released Objects Directory*) - SAP's "released for customer use" flag,
the classic BAPI/RFC release contract. Every BAPI in the JSON carries `released`, `obsolete`,
`reworked` and `inReleasedObjectsDirectory`; the catalogues show it in a `Rel` column.

| | TRM | FI |
|---|--:|--:|
| BAPIs catalogued | 380 | 150 |
| Released (`RODIR.RELEASED = X`) | 339 | 119 |
| **Not** in `RODIR` - SAP-internal, no release guarantee | 41 | 31 |
| Flagged obsolete | 1 | 0 |

**This is what project rule 9 (*released APIs only*) needs for a classic BAPI call.** A BAPI absent
from `RODIR` is not a released API - it may well work, but SAP gives no compatibility guarantee and
can change it without notice. Filter before building:

```bash
python -c "import json;d=json.load(open('json/trm-bapis.json'));print([x['name'] for x in d if not x['released']])"
```

One TRM BAPI is **released *and* obsolete** - `BAPI_TEX_EXPOSURE_DELETE`. Released does not mean
current; check `obsolete` too.

**What this does not answer.** `RODIR` is the classic release directory, *not* the ABAP Cloud **C1
release contract** that decides whether an object is callable from a clean-core / ABAP-for-Cloud
language version. The `ARS_*` tables holding C1 data (`ARS_SHIP_API`, `ARS_SHIP_REL_DAT`,
`ARS_CONTRACT_REG`) exist on DS4 but are **empty** - SAP-internal shipment data, not customer
content - so C1 state cannot be read from the DDIC here.

## Using this with dyngw v2

Every BAPI here is a candidate `FUNC` target. Before calling one, the traps that already cost time
(full context in `lessons/lessons-ledger.md`):

- **`CALL_MODE` defaults to remote, which puts the step outside the batch LUW (L-492).** A blank
  `CALL_MODE` falls back to `TFDIR-FMODE`, and **377 of 380 TRM BAPIs and 134 of 150 FI BAPIs are
  remote-enabled (`FMODE = R`)** - the `remoteEnabled` flag is carried per BAPI in the JSON. A batch
  mixing such a step with an in-LUW write step is refused in phase 1. Set the registry row's
  `CALL_MODE` to `L` to bring the step inside the batch transaction.
- **Register every `FUNC` target with `AllowWrite: true`, even a read-only getter (L-491).** Known
  limit, fails closed.
- **An output-only `TABLES` parameter must be sent as `[]` or its content never comes back (L-314).**
  1891 TABLES parameters are catalogued here; `RETURN` (`BAPIRET2`) is the usual one.
- **A creating BAPI needs `ExecuteBatch` + `CommitMode` (L-317).** `CallFunctionModule` never commits,
  and `ExecStatus = 'S'` only means the dispatch worked - **parse `RETURN`** for the real outcome.
- **Nothing runs unless registered** in the v2 registry; an unregistered target is refused with
  HTTP 200 and `ExecStatus = 'E'`, not an HTTP error.
- **Self-protection:** targets matching `ZFS_T_DYN_*` / `ZFS_RFC_DYN_*` are refused with message 039.

Most TRM instruments share a shape - `..._CREATE`, `..._CHANGE`, `..._GETDETAIL`, `..._REVERSE`,
`..._SETTLE`, plus `..._STRUC`, which returns the interface structure and is useful for probing a
payload shape before committing to one. `TESTRUN` is a common optional IMPORTING parameter - use it
to validate before a real post.

## Known gaps

- **ABAP Cloud C1 release contracts remain undeterminable here.** See
  [API release state](#api-release-state): the classic `RODIR` flag *was* captured, but the `ARS_*`
  tables holding C1 contract data are empty on this system. For a clean-core / ABAP-for-Cloud target
  a per-object ADT or `/abap-cloud-rap:clean-core-check` pass is still required.
- **One parameter type is unresolved:** `IF_FAA_POSTING_CORE_TYPES=>TY_T_ACCOUNTING_DOC` is a
  class-based type, not a DDIC structure, so it has no entry in `structures.json`.
- Structure field lists are the **flat, activated** DDIC lists. Where a structure embeds a
  `.INCLUDE`, the marker row is dropped and the expanded fields kept.
- Texts are English (`TFTIT-SPRAS = 'E'`). **12 FI BAPIs have no English short text on this system**
  (the `BAPI_ACC_ASS*` asset-posting family); for those the German text is carried instead and
  suffixed **`[de]`**. Nothing was translated - the marker means the text is as SAP ships it.
- BAPIs were **not executed**. Nothing here is evidence that a given BAPI works - only that it exists
  with this interface on DS4/100 as of the extraction date.
