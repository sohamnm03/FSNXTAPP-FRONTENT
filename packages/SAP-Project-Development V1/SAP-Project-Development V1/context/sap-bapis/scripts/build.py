import json,glob,os,collections,datetime

SP='.'
OUT=r'D:\SAP Tool\SAP-Project-Development V1\context\sap-bapis'
def L(f): return json.load(open(f,encoding='utf-8-sig'))
def LM(pat):
    out=[]
    for f in sorted(glob.glob(pat)): out.extend(L(f))
    return out

texts={r['FUNCNAME']:r['STEXT'] for r in L('bapi-texts.json')}
de={r['FUNCNAME']:r['STEXT'] for r in L('bapi-texts-de.json')}
for k,v in de.items():
    if not texts.get(k,'').strip() and v.strip(): texts[k]=v.strip()+' [de]'
detx={r['ROLLNAME']:r for r in LM('de-texts-*.json')}
sttx={r['TABNAME']:r['DDTEXT'] for r in LM('struct-texts-*.json')}

# structures
sf=collections.defaultdict(list)
for r in LM('struct-fields-*.json'):
    sf[r['TABNAME']].append(r)
structures={}
for name,rows in sf.items():
    rows.sort(key=lambda r:r['POSITION'])
    flds=[]
    for r in rows:
        if r['FIELDNAME'].startswith('.'): continue
        de=detx.get(r['ROLLNAME'],{})
        f={'name':r['FIELDNAME'],'key':r['KEYFLAG']=='X','dataElement':r['ROLLNAME'],
           'type':r['DATATYPE'],'length':int(r['LENG'] or 0),'decimals':int(r['DECIMALS'] or 0),
           'text':de.get('DDTEXT','') or de.get('SCRTEXT_M','')}
        if r.get('REFTABLE'): f['refField']=f"{r['REFTABLE']}-{r['REFFIELD']}"
        flds.append(f)
    structures[name]={'name':name,'text':sttx.get(name,''),'fields':flds}

rodir={r['OBJECT']:r for r in L('rodir-bapi.json')}

PT={'I':'IMPORTING','E':'EXPORTING','T':'TABLES','C':'CHANGING','X':'EXCEPTION'}
params=collections.defaultdict(list)
for r in LM('trm-bapi-params.json')+LM('fi-bapi-params.json'):
    params[r['FUNCNAME']].append(r)

def build(hdrfile,area):
    out=[]
    for h in L(hdrfile):
        fn=h['FUNCNAME']
        ps=sorted(params.get(fn,[]),key=lambda r:(r['PARAMTYPE'],r['PPOSITION']))
        pl=[]
        for p in ps:
            st=(p['STRUCTURE'] or '').strip()
            pl.append({'kind':PT.get(p['PARAMTYPE'],p['PARAMTYPE']),
                       'name':p['PARAMETER'],'typeRef':st,
                       'structure':st.split('-')[0] if st else '',
                       'field':st.split('-')[1] if '-' in st else '',
                       'optional':p['OPTIONAL']=='X','default':p['DEFAULTVAL'],
                       'refClass':p['REF_CLASS']})
        rd=rodir.get(fn)
        out.append({'name':fn,'text':texts.get(fn,''),'functionGroup':h['AREA'],
                    'released':bool(rd) and rd['RELEASED']=='X',
                    'obsolete':bool(rd) and rd['OBSOLETE']=='X',
                    'reworked':bool(rd) and rd['REWORKED']=='X',
                    'inReleasedObjectsDirectory':bool(rd),
                    'package':h['DEVCLASS'],'component':h['PS_POSID'],
                    'remoteEnabled':h['FMODE']=='R','fmode':h['FMODE'],
                    'area':area,'parameters':pl})
    out.sort(key=lambda x:x['name'])
    return out

trm=build('trm-bapi-hdr.json','TRM'); fi=build('fi-bapi-hdr.json','FI')
allb=trm+fi
used={p['structure'] for b in allb for p in b['parameters'] if p['structure']}
structures={k:v for k,v in structures.items() if k in used}

os.makedirs(OUT+r'\json',exist_ok=True)
def W(p,o): json.dump(o,open(os.path.join(OUT,p),'w',encoding='utf-8'),indent=1,ensure_ascii=False)
W(r'json\trm-bapis.json',trm); W(r'json\fi-bapis.json',fi)
W(r'json\structures.json',structures)
W(r'json\_meta.json',{'system':'DS4_100_NIIF','client':'100',
  'extractedOn':'2026-09-14','source':'ADT data preview (/sap/bc/adt/datapreview/freestyle)',
  'sourceTables':['ENLFDIR','TFDIR','TFTIT','FUPARAREF','TADIR','TDEVC','DF14L','DF14T','DD03L','DD02T','DD04T'],
  'trmComponents':'PS_POSID LIKE FIN-FSCM-TRM%','fiComponents':"PS_POSID = FI, AC-INT, or LIKE FI-GL%/FI-AP%/FI-AR%/FI-AA%/FI-BL%",
  'counts':{'trmBapis':len(trm),'fiBapis':len(fi),'structures':len(structures),
            'released':sum(1 for x in allb if x['released']),
            'obsolete':sum(1 for x in allb if x['obsolete']),
            'notInReleasedObjectsDirectory':sum(1 for x in allb if not x['inReleasedObjectsDirectory'])},
  'releaseSource':'RODIR (Released Objects Directory) - the classic BAPI/RFC customer-release flag. '
                  'ARS_* (ABAP Cloud C1 release contracts) are empty on this system, so the C1 '
                  'language-version state is still not determinable here.',
  'knownGaps':['IF_FAA_POSTING_CORE_TYPES=>TY_T_ACCOUNTING_DOC skipped: class-based type, not a DDIC structure']})
print("TRM",len(trm),"FI",len(fi),"structs",len(structures))
print("TRM remote-enabled:",sum(1 for b in trm if b['remoteEnabled']))
print("FI remote-enabled:",sum(1 for b in fi if b['remoteEnabled']))
json.dump({'trm':trm,'fi':fi},open('built.json','w',encoding='utf-8'))
