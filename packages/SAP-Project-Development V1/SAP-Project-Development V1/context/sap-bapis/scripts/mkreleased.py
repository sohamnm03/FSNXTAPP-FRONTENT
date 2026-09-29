import json, collections, os

OUT = r'D:\SAP Tool\SAP-Project-Development V1\context\sap-bapis'


def L(f):
    return json.load(open(f, encoding='utf-8-sig'))


b = json.load(open('built.json', encoding='utf-8'))
trm, fi = b['trm'], b['fi']
svc = {'trm': L('trm-services.json'), 'fi': L('fi-services.json')}

rel_trm = sum(1 for x in trm if x['released'])
rel_fi = sum(1 for x in fi if x['released'])
nr_trm = [x for x in trm if not x['inReleasedObjectsDirectory']]
nr_fi = [x for x in fi if not x['inReleasedObjectsDirectory']]
obs = [x for x in trm + fi if x['obsolete']]


def svc_table(rows):
    # one row per service name, collapsing SRVD/SRVB pairs
    by = collections.defaultdict(set)
    comp = {}
    for r in rows:
        by[r['OBJ_NAME'].strip()].add(r['OBJECT'])
        comp[r['OBJ_NAME'].strip()] = r['PS_POSID']
    out = []
    for n in sorted(by):
        kinds = '/'.join(sorted(by[n]))
        out.append('| `%s` | %s | `%s` |' % (n, kinds, comp[n]))
    return '\n'.join(out), len(by)


trm_api = [r for r in svc['trm'] if r['OBJ_NAME'].strip().startswith('API_')]
fi_api = [r for r in svc['fi'] if r['OBJ_NAME'].strip().startswith('API_')]
trm_tbl, trm_n = svc_table(trm_api)
fi_tbl, fi_n = svc_table(fi_api)

trm_other = sorted({r['OBJ_NAME'].strip() for r in svc['trm'] if not r['OBJ_NAME'].strip().startswith('API_')})
fi_other_n = len({r['OBJ_NAME'].strip() for r in svc['fi'] if not r['OBJ_NAME'].strip().startswith('API_')})

nr_trm_s = '\n'.join('| `%s` | `%s` | %s |' % (x['name'], x['functionGroup'], x['text']) for x in sorted(nr_trm, key=lambda y: y['name']))
nr_fi_s = '\n'.join('| `%s` | `%s` | %s |' % (x['name'], x['component'], x['text']) for x in sorted(nr_fi, key=lambda y: y['name']))

md = """# API release state - TRM & FI on DS4/100

Answers one question: **which of these APIs may we actually build against?**
Project rule 9 says *released APIs only*, so this is the gate, not a footnote.

Everything in the tables below was read from **DS4 client 100 on 2026-09-14**. The official SAP
references are listed at the end and are *not* the source of the numbers here - they are where to
verify a specific API before committing to it.

## The two release models, and which one applies

SAP has two unrelated notions of "released", and a BAPI can be one and not the other.

| | Classic release | ABAP Cloud C1 release contract |
|---|---|---|
| Question it answers | "Is this released for customer use, with a compatibility guarantee?" | "May this be called from a clean-core / ABAP-for-Cloud language version?" |
| Where it lives | table **`RODIR`** (*Released Objects Directory*) | the `ARS_*` tables / ADT object properties |
| On DS4 | **populated - captured below** | **`ARS_SHIP_API`, `ARS_SHIP_REL_DAT`, `ARS_CONTRACT_REG` are all empty** |
| Applies to dyngw v2 `FUNC` calls | **yes - this is the relevant one** | only if the caller is a cloud language version; dyngw v2 is classic ABAP |

Because dyngw v2 dispatches classic RFC-enabled function modules from standard ABAP, **`RODIR` is the
gate that matters here**. The C1 contract state cannot be read from the DDIC on this system at all -
those tables carry SAP-internal shipment data and are empty on a customer install - so a clean-core
claim about any object below still needs a per-object ADT check.

## What the system says

| | TRM | FI | Total |
|---|--:|--:|--:|
| BAPIs catalogued | {n_trm} | {n_fi} | {n_all} |
| **Released** (`RODIR.RELEASED = X`) | {rel_trm} | {rel_fi} | {rel_all} |
| **Not in `RODIR`** - SAP-internal, no guarantee | {nr_trm_n} | {nr_fi_n} | {nr_all} |
| Flagged **obsolete** | {obs_trm} | {obs_fi} | {obs_all} |

Per-BAPI flags are in the JSON (`released`, `obsolete`, `reworked`, `inReleasedObjectsDirectory`) and
in the `Rel` column of both catalogues.

### Released *and* obsolete

{obs_list}

`RELEASED = X` with `OBSOLETE = X` means SAP released it once and has since superseded it. Released
is not the same as current - **check both flags**, not just `released`.

### TRM BAPIs not in `RODIR` ({nr_trm_n})

These are real, callable function modules, but SAP publishes no release guarantee for them. Using one
is a deliberate exception to rule 9, not a default.

| BAPI | Function group | Description |
|---|---|---|
{nr_trm_s}

### FI BAPIs not in `RODIR` ({nr_fi_n})

| BAPI | Component | Description |
|---|---|---|
{nr_fi_s}

## Modern released APIs present on this system

Separate from the BAPIs: the OData services SAP ships for these components, as installed on DS4.
These are the `API_*` services that the SAP Business Accelerator Hub documents, so their presence
here is the on-system counterpart of the Hub listing.

### TRM - {trm_n} `API_*` services

| Service | Object type | Component |
|---|---|---|
{trm_tbl}

TRM also carries {trm_other_n} non-`API_*` services (largely `IWSV` Fiori back-end services):
{trm_other_s}

### FI - {fi_n} `API_*` services

| Service | Object type | Component |
|---|---|---|
{fi_tbl}

Plus {fi_other_n} non-`API_*` services in the same components.

`SRVD`/`SRVB` are RAP service definitions and bindings (OData V4-era); `IWSV` entries are classic
OData V2 gateway services. Both are published APIs; the object type tells you which stack.

## Official SAP references

**These pages were not machine-read.** `help.sap.com` and `api.sap.com` are JavaScript applications
that return an empty shell to a scripted fetch, so the numbers in this document come from the system,
not from them. Open these in a browser to verify a specific API:

| Reference | What it is good for |
|---|---|
| [SAP Business Accelerator Hub](https://api.sap.com/) | The authoritative catalogue of published SAP APIs - OData/SOAP metadata, EDMX, sandbox. Search a service name from the tables above. |
| [APIs for Treasury and Risk Management (SAP Help)](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f9fdf9f460a340d2b96c9aef284251d9/325f953a5fb54319921538882b015b5a.html) | Filterable table of every TRM API. **Note: written for S/4HANA Cloud** - DS4 is on-premise, so treat it as a superset and confirm against the on-system list above. |
| [APIs on SAP Business Accelerator Hub - on-premise](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/8308e6d301d54584a33cd04a9861bc52/1e60f14bdc224c2c975c8fa8bcfd7f3f.html) | The on-premise equivalent, which is the edition DS4 runs. |
| [Finding Released APIs and Deprecated Objects (ADT guide)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/finding-released-apis-and-deprecated-objects) | SAP's own procedure for checking the **C1 release contract** per object in ADT - the gap this document cannot close from the DDIC. |
| Transaction `BAPI` (BAPI Explorer) on DS4 | SAP's in-system BAPI catalogue, organised by business object; shows the release status the `RODIR` flag reflects. |

For a BAPI, the in-system checks are cheaper and more current than any web page: `RODIR` (captured
here), the object's ADT properties, and transaction `BAPI`.
""".format(
    n_trm=len(trm), n_fi=len(fi), n_all=len(trm) + len(fi),
    rel_trm=rel_trm, rel_fi=rel_fi, rel_all=rel_trm + rel_fi,
    nr_trm_n=len(nr_trm), nr_fi_n=len(nr_fi), nr_all=len(nr_trm) + len(nr_fi),
    obs_trm=sum(1 for x in trm if x['obsolete']), obs_fi=sum(1 for x in fi if x['obsolete']),
    obs_all=len(obs),
    obs_list='\n'.join('- **`%s`** (`%s`, %s) - %s' % (x['name'], x['functionGroup'], x['component'], x['text']) for x in obs) or '_None._',
    nr_trm_s=nr_trm_s, nr_fi_s=nr_fi_s,
    trm_tbl=trm_tbl, trm_n=trm_n, fi_tbl=fi_tbl, fi_n=fi_n,
    trm_other_n=len(trm_other), fi_other_n=fi_other_n,
    trm_other_s=', '.join('`%s`' % n for n in trm_other[:40]) + ('...' if len(trm_other) > 40 else ''),
)

open(os.path.join(OUT, 'released-apis.md'), 'w', encoding='utf-8').write(md)
print('released-apis.md written,', len(md), 'chars')
print('TRM released', rel_trm, '| FI released', rel_fi, '| not in RODIR', len(nr_trm) + len(nr_fi), '| obsolete', len(obs))
