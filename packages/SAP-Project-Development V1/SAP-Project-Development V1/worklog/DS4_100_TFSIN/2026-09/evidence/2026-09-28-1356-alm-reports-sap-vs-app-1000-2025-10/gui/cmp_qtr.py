import json, sys
def num(s):
    s=(s or '').strip().replace('�','')
    if not s: return 0.0
    neg=s.endswith('-'); v=float(s.rstrip('-').replace(',','')); return -v if neg else v
gf, af, nb, pref = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]  # pref e.g. CB (gui bucket col prefix)
g=json.load(open(gf,encoding='utf-8')); api=json.load(open(af,encoding='utf-8-sig'))
gcols=[c for c in g['columns'] if c.startswith(pref) and c[len(pref):].isdigit()]
totc=[c for c in g['columns'] if c.endswith('TOT')][0]
idc=g['columns'][0]
grows={r[idc]:r for r in g['rows']}
arows={r['GroupId']:r for r in api}
anb=max(int(k[6:]) for k in api[0] if k.startswith('Bucket') and k[6:].isdigit())
print('GUI rows',len(g['rows']),'bucket cols',gcols,'| API rows',len(api),'API buckets',anb)
print('only GUI',[k for k in grows if k not in arows]); print('only API',[k for k in arows if k not in grows])
m=0; diffs=[]
for k,a in arows.items():
    if k not in grows: continue
    r=grows[k]
    gv=[num(r[c]) for c in gcols]; av=[a['Bucket%d'%i] for i in range(1,anb+1)]
    gt=num(r[totc]); at=a['Total']
    ok = all(abs(x-y)<0.01 for x,y in zip(gv,av)) and abs(gt-at)<0.01
    if ok: m+=1; continue
    tail=[round(x,2) for x in av[len(gv):] if abs(x)>0.001]
    diffs.append((k,r.get('ZSRC') or r.get(g['columns'][2]),a['Source'],a['RowStyle'],[(i+1,round(x,2),round(y,2)) for i,(x,y) in enumerate(zip(gv,av)) if abs(x-y)>=0.01],('tot',round(gt,2),round(at,2)),'api extra buckets',tail))
print('matching',m,'differing',len(diffs))
for d in diffs: print(d)
