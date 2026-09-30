import json, collections
def num(s):
    s=(s or '').strip()
    if not s: return 0.0
    neg = s.endswith('-'); s=s.rstrip('-').replace(',','')
    v=float(s); return -v if neg else v
g=json.load(open('r003.json',encoding='utf-8'))
api=json.load(open('../run-1/sap-trmrepay.json',encoding='utf-8-sig'))
det=[r for r in g['rows'] if r['BUKRS']]
print('GUI rows',g['row_count'],'detail',len(det),'API rows',len(api))
B=['B01','B02','B03','B04','B05']
gt=[sum(num(r[b]) for r in det) for b in B+['TOT']]
print('GUI detail sums',[f'{x:,.2f}' for x in gt])
print('GUI grand total row',[g['rows'][-1][b] for b in B+['TOT']])
at=[sum(r[f'Bucket{i}'] for r in api) for i in range(1,8)]+[sum(r['Total'] for r in api)]
print('API sums b1..b7,total',[f'{x:,.2f}' for x in at])
# key GUI
gk=collections.defaultdict(list)
for r in det:
    k=(r['RFHA'] if not r['RANL'] else '', r['RANL'], 'I' if r['STYPE'] in ('10','12') else 'P')
    gk[k].append(r)
dups={k:len(v) for k,v in gk.items() if len(v)>1}
print('GUI duplicate keys',len(dups), list(dups.items())[:10])
ak=collections.defaultdict(list)
for r in api:
    k=(r['DealNumber'],r['SecurityId'],'I' if r['SourceType'] in ('10','12') else 'P')
    ak[k].append(r)
print('API keys',len(ak),'multi-type keys',[k for k,v in ak.items() if len(v)>1][:10])
# expected GUI from API: interest row = API interest b1..5; principal row = API principal b1..5 + interest b1..5 (D1)
exp={}
for k,v in ak.items():
    exp[k]=[sum(r[f'Bucket{i}'] for r in v) for i in range(1,6)]
for k in list(exp):
    if k[2]=='P':
        ik=(k[0],k[1],'I')
        if ik in exp: exp[k]=[a+b for a,b in zip(exp[k],exp[ik])]
# D1 also: deal with interest but no principal row in API still gets GUI principal row? only if principal pass has flows. handle: skip
match=0; diff=[]; onlyg=[]; onlya=[]
for k,v in gk.items():
    gv=[num(v[0][b]) for b in B]
    if k not in exp: onlyg.append((k,gv,v[0]['STYPE'])); continue
    if all(abs(a-b)<0.01 for a,b in zip(gv,exp[k])): match+=1
    else: diff.append((k,gv,exp[k]))
for k,e in exp.items():
    if k not in gk:
        full=[sum(r[f'Bucket{i}'] for r in ak[k]) for i in range(1,8)]
        onlya.append((k,e,full))
print('matched keys',match,'differ',len(diff),'only GUI',len(onlyg),'only API',len(onlya))
for d in diff[:40]: print('DIFF',d)
for d in onlyg[:40]: print('ONLYGUI',d)
b15=[d for d in onlya if any(abs(x)>0.001 for x in d[1])]
print('only-API with nonzero b1-5:',len(b15))
for d in b15[:40]: print('ONLYAPI',d)
print('only-API with b1-5 zero (b6/7 only):',len(onlya)-len(b15))
print('---- refine only-GUI')
ok=0; bad=[]
for k,gv,st in onlyg:
    ik=(k[0],k[1],'I')
    ie=exp.get(ik)
    if k[2]=='P' and ie and all(abs(a-b)<0.01 for a,b in zip(gv,ie)): ok+=1
    else: bad.append((k,gv,st,ie, [ (r['SourceType'],[r[f'Bucket{i}'] for i in range(1,8)]) for kk in [ (k[0],k[1],'P'),ik] for r in ak.get(kk,[])]))
print('only-GUI principal rows == API interest b1-5 (D1 carry-over, principal pass had no b1-5 flow):',ok)
for b in bad: print('BAD',b)
print('dup 100014', gk[('100014','','I')])
print('api 100014', [ (r['SourceType'],[r[f'Bucket{i}'] for i in range(1,8)]) for r in api if r['DealNumber']=='100014'])
# how many only-API rows are principal keys whose GUI row absent: split by kind
print('only-API by kind', collections.Counter(k[2] for k,e,f in onlya))
mm=[(k,v[0]['STYPE'],[r['SourceType'] for r in ak[k]]) for k,v in gk.items() if k in ak and v[0]['STYPE'] not in [r['SourceType'] for r in ak[k]]]
print('source type label mismatches',len(mm),mm[:5])
# reconcile GUI totals from API
rec=[0]*5
for k,v in gk.items():
    e = exp.get(k) or exp.get((k[0],k[1],'I'))
    for i in range(5): rec[i]+=e[i]*len(v)
print('GUI sums rebuilt from API (+D1 +dup)',[f'{x:,.2f}' for x in rec])
