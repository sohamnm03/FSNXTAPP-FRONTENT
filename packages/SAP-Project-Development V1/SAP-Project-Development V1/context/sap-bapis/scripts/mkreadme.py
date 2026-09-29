import json, collections, os

OUT = r'D:\SAP Tool\SAP-Project-Development V1\context\sap-bapis'
b = json.load(open('built.json', encoding='utf-8'))
trm, fi = b['trm'], b['fi']
structs = json.load(open(os.path.join(OUT, 'json', 'structures.json'), encoding='utf-8'))

g = collections.defaultdict(list)
for x in trm:
    g[x['functionGroup']].append(x)
rows = []
for k in sorted(g):
    cre = [x for x in g[k] if x['name'].endswith('_CREATE')]
    if not cre:
        continue
    label = cre[0]['text'].replace('Create ', '').replace('create ', '').strip()
    verbs = sorted({x['name'].split('_')[-1] for x in g[k]})
    rows.append((k, label, len(g[k]), ', '.join(verbs[:9]) + ('...' if len(verbs) > 9 else '')))
imap = '\n'.join('| `%s` | %s | %d | %s |' % r for r in rows)

KEY = ('ACC_DOCUMENT', 'ACC_GL_POSTING', 'GETOPENITEMS', 'GETBALANCE', 'GETBALANCEDITEMS')
fikey = [x for x in sorted(fi, key=lambda y: y['name']) if any(t in x['name'] for t in KEY)]
fitab = '\n'.join('| `%s` | `%s` | %s | %s |' % (x['name'], x['component'],
                  'yes' if x['remoteEnabled'] else '-', x['text']) for x in fikey)

tw = collections.Counter()
for x in trm + fi:
    for p in x['parameters']:
        tw[p['kind']] += 1

n_trm, n_fi = len(trm), len(fi)
rf_trm = sum(1 for x in trm if x['remoteEnabled'])
rf_fi = sum(1 for x in fi if x['remoteEnabled'])
n_par = sum(len(x['parameters']) for x in trm + fi)
rel_trm = sum(1 for x in trm if x['released'])
rel_fi = sum(1 for x in fi if x['released'])
obs_trm = sum(1 for x in trm if x['obsolete'])
obs_fi = sum(1 for x in fi if x['obsolete'])
nr_trm = sum(1 for x in trm if not x['inReleasedObjectsDirectory'])
nr_fi = sum(1 for x in fi if not x['inReleasedObjectsDirectory'])
n_sf = sum(len(s['fields']) for s in structs.values())
IN_FTR = 283

md = """# SAP TRM & FI BAPI context - DS4 / client 100

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
| [`trm-bapis-catalog.md`](trm-bapis-catalog.md) | {n_trm} TRM BAPIs, one line each, grouped by function group |
| [`trm-bapis-signatures.md`](trm-bapis-signatures.md) | Every parameter of every TRM BAPI |
| [`fi-bapis-catalog.md`](fi-bapis-catalog.md) | {n_fi} FI BAPIs, grouped by application component |
| [`fi-bapis-signatures.md`](fi-bapis-signatures.md) | Every parameter of every FI BAPI |
| [`released-apis.md`](released-apis.md) | **Release gate** - which BAPIs are released for customer use, which are not, which are obsolete, the two SAP release models, the `API_*` OData services installed on DS4, and the official SAP references |
| [`json/trm-bapis.json`](json/trm-bapis.json) | TRM BAPIs, machine-readable, parameters nested |
| [`json/fi-bapis.json`](json/fi-bapis.json) | FI BAPIs, same shape |
| [`json/structures.json`](json/structures.json) | {n_st} DDIC structures referenced by those interfaces, with full field lists (name, key flag, data element, type, length, decimals, text, currency/quantity reference) |
| [`json/_meta.json`](json/_meta.json) | Extraction parameters and known gaps |
| `scripts/` | The extractor that produced all of the above - `adt-sql.ps1` (one SQL statement -> one JSON file over the ADT data-preview endpoint; reads the password from `$env:SAP_DS4_100_NIIF_PASSWORD`, holds no secret) and the four Python generators. Re-run them to refresh against a changed system; the generators expect the raw dumps in the working directory. |

Totals: **{n_all} BAPIs** ({rf_all} remote-enabled), **{n_par} parameters**
({p_i} IMPORTING, {p_e} EXPORTING, {p_t} TABLES, {p_c} CHANGING, {p_x} EXCEPTION),
**{n_st} structures** covering {n_sf} fields.

## How scope was derived

Function modules named `BAPI*`, resolved to their function group (`ENLFDIR`), then to the group's
package (`TADIR`) and that package's application component (`TDEVC` -> `DF14L`). Component, not name
pattern, decides membership:

- **TRM** - every component under `FIN-FSCM-TRM` ({n_trm} BAPIs).
- **FI** - components `FI`, `AC-INT` (the accounting interface, where `BAPI_ACC_DOCUMENT_*` actually
  lives), plus the `FI-GL*`, `FI-AP*`, `FI-AR*`, `FI-AA*`, `FI-BL*` subtrees ({n_fi} BAPIs).
  Deliberately excluded: `FI-CA` (contract accounting), `FI-TV` (travel), `FI-LOC` (country
  localisations), `FI-FM`, `FI-RA` - large, and not core FI posting/reporting.

### On transaction `FTR_BAPI`

`FTR_BAPI` exists here as a transaction, a program **and** a function group, all in package `FTTR`.
Its `FTR_BAPI*` function groups hold **{in_ftr}** of the {n_trm} TRM BAPIs. The remaining {rest} are real TRM
BAPIs that `FTR_BAPI` does *not* group - hedge management (`THA_BAPI_*`), exposure management
(`TEM_BAPI_*`, `BAPI_TEX_*`), market data and limits (`JBD_MD*`, `JBD_LM_BAPI`), swaptions
(`TTM_OPTION_*`) and `FTR_BUS2042`. **Do not treat the `FTR_BAPI` list as the complete TRM BAPI
inventory** - the catalogue here is the wider set.

## TRM instrument map

| Function group | Instrument | BAPIs | Lifecycle verbs |
|---|---|--:|---|
{imap}

## Key FI BAPIs

| BAPI | Component | RFC | Description |
|---|---|:--:|---|
{fitab}

## API release state

Full detail, including the two SAP release models, the 72 BAPIs with no release guarantee, the
`API_*` OData services on this system and the official SAP references: **[`released-apis.md`](released-apis.md)**.

Captured from **`RODIR`** (*Released Objects Directory*) - SAP's "released for customer use" flag,
the classic BAPI/RFC release contract. Every BAPI in the JSON carries `released`, `obsolete`,
`reworked` and `inReleasedObjectsDirectory`; the catalogues show it in a `Rel` column.

| | TRM | FI |
|---|--:|--:|
| BAPIs catalogued | {n_trm} | {n_fi} |
| Released (`RODIR.RELEASED = X`) | {rel_trm} | {rel_fi} |
| **Not** in `RODIR` - SAP-internal, no release guarantee | {nr_trm} | {nr_fi} |
| Flagged obsolete | {obs_trm} | {obs_fi} |

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
  `CALL_MODE` falls back to `TFDIR-FMODE`, and **{rf_trm} of {n_trm} TRM BAPIs and {rf_fi} of {n_fi} FI BAPIs are
  remote-enabled (`FMODE = R`)** - the `remoteEnabled` flag is carried per BAPI in the JSON. A batch
  mixing such a step with an in-LUW write step is refused in phase 1. Set the registry row's
  `CALL_MODE` to `L` to bring the step inside the batch transaction.
- **Register every `FUNC` target with `AllowWrite: true`, even a read-only getter (L-491).** Known
  limit, fails closed.
- **An output-only `TABLES` parameter must be sent as `[]` or its content never comes back (L-314).**
  {p_t} TABLES parameters are catalogued here; `RETURN` (`BAPIRET2`) is the usual one.
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
""".format(n_trm=n_trm, n_fi=n_fi, n_st=len(structs), n_all=n_trm + n_fi,
           rf_all=rf_trm + rf_fi, rf_trm=rf_trm, rf_fi=rf_fi, n_par=n_par, n_sf=n_sf,
           p_i=tw['IMPORTING'], p_e=tw['EXPORTING'], p_t=tw['TABLES'],
           p_c=tw['CHANGING'], p_x=tw['EXCEPTION'],
           in_ftr=IN_FTR, rest=n_trm - IN_FTR, imap=imap, fitab=fitab,
           rel_trm=rel_trm, rel_fi=rel_fi, obs_trm=obs_trm, obs_fi=obs_fi,
           nr_trm=nr_trm, nr_fi=nr_fi)

open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8').write(md)
print('README.md written,', len(md), 'chars')
