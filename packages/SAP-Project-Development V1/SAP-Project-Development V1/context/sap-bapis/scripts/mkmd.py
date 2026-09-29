import json,collections,os
OUT=r'D:\SAP Tool\SAP-Project-Development V1\context\sap-bapis'
b=json.load(open('built.json',encoding='utf-8'))
structs=json.load(open(os.path.join(OUT,'json','structures.json'),encoding='utf-8'))
ORDER=['IMPORTING','EXPORTING','CHANGING','TABLES','EXCEPTION']

def catalog(bapis,area,groupkey,title,fname,gtitle):
    g=collections.defaultdict(list)
    for x in bapis: g[x[groupkey]].append(x)
    L=[f'# {title}','',
       f'Extracted from **DS4 / client 100 (DS4_100_NIIF)** on 2026-09-14. '
       f'{len(bapis)} BAPIs, {sum(1 for x in bapis if x["remoteEnabled"])} remote-enabled (`TFDIR-FMODE = R`), '
       f'{sum(1 for x in bapis if x["released"])} released for customer use (`RODIR`), '
       f'{sum(1 for x in bapis if x["obsolete"])} flagged obsolete.','',
       '`Rel` column: ✓ = released in `RODIR`, — = **not** in the released-objects directory '
       '(SAP-internal, no compatibility guarantee), **OBSOLETE** = released but marked obsolete.','',
       f'Full signatures: [{fname.replace("-catalog","-signatures")}]({fname.replace("-catalog","-signatures")}) · '
       f'machine-readable: [`json/{area.lower()}-bapis.json`](json/{area.lower()}-bapis.json)','',
       f'| {gtitle} | BAPI | RFC | Rel | Description |','|---|---|:--:|:--:|---|']
    for k in sorted(g):
        for x in sorted(g[k],key=lambda y:y['name']):
            rel = '**OBSOLETE**' if x['obsolete'] else ('✓' if x['released'] else '—')
            L.append(f'| `{k}` | `{x["name"]}` | {"✓" if x["remoteEnabled"] else "—"} | {rel} | {x["text"]} |')
    return '\n'.join(L)+'\n'

def sigs(bapis,area,title,fname):
    L=[f'# {title}','',
       f'Every parameter of every BAPI in scope, from `FUPARAREF` (active version) on DS4/100, 2026-09-14.',
       f'`Type` is the DDIC reference exactly as the interface declares it — `STRUCTURE` for a whole',
       f'structure, `STRUCTURE-FIELD` when the parameter is typed from a single field.',
       f'Field lists for every structure named here are in [`json/structures.json`](json/structures.json).','']
    for x in sorted(bapis,key=lambda y:y['name']):
        L.append(f'## `{x["name"]}`','')if False else L.append(f'## `{x["name"]}`')
        L.append('')
        L.append(f'{x["text"]}' if x['text'] else '_(no short text)_')
        L.append('')
        L.append(f'- Function group `{x["functionGroup"]}` · package `{x["package"]}` · component `{x["component"]}`')
        L.append(f'- Remote-enabled: {"yes (`FMODE = R`)" if x["remoteEnabled"] else "no — local only"}')
        if x['obsolete']:
            L.append('- Release: **OBSOLETE** in `RODIR` — do not build against this')
        elif x['released']:
            L.append('- Release: released for customer use (`RODIR.RELEASED = X`)')
        else:
            L.append('- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee')
        L.append('')
        if not x['parameters']:
            L.append('_No parameters._'); L.append(''); continue
        L.append('| Kind | Parameter | Type | Opt | Default |')
        L.append('|---|---|---|:--:|---|')
        for p in sorted(x['parameters'],key=lambda q:(ORDER.index(q['kind']) if q['kind'] in ORDER else 9,q['name'])):
            t=f'`{p["typeRef"]}`' if p['typeRef'] else (f'`{p["refClass"]}`' if p['refClass'] else '—')
            L.append(f'| {p["kind"]} | `{p["name"]}` | {t} | {"✓" if p["optional"] else ""} | {p["default"] or ""} |')
        L.append('')
    return '\n'.join(L)+'\n'

open(os.path.join(OUT,'trm-bapis-catalog.md'),'w',encoding='utf-8').write(
    catalog(b['trm'],'TRM','functionGroup','TRM BAPI catalogue (Treasury and Risk Management)','trm-bapis-catalog.md','Function group'))
open(os.path.join(OUT,'fi-bapis-catalog.md'),'w',encoding='utf-8').write(
    catalog(b['fi'],'FI','component','FI BAPI catalogue (Financial Accounting)','fi-bapis-catalog.md','Component'))
open(os.path.join(OUT,'trm-bapis-signatures.md'),'w',encoding='utf-8').write(
    sigs(b['trm'],'TRM','TRM BAPI signatures','trm-bapis-signatures.md'))
open(os.path.join(OUT,'fi-bapis-signatures.md'),'w',encoding='utf-8').write(
    sigs(b['fi'],'FI','FI BAPI signatures','fi-bapis-signatures.md'))
for f in ['trm-bapis-catalog.md','fi-bapis-catalog.md','trm-bapis-signatures.md','fi-bapis-signatures.md']:
    p=os.path.join(OUT,f); print(f, f"{os.path.getsize(p)/1024:.0f} KB", sum(1 for _ in open(p,encoding='utf-8')), "lines")
