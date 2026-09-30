import json, collections
def num(s):
    s=(s or '').strip()
    if not s: return 0.0
    neg=s.endswith('-'); v=float(s.rstrip('-').replace(',','')); return -v if neg else v
g=json.load(open('r015.json',encoding='utf-8')); api=json.load(open('../run-1/sap-trm-principal.json',encoding='utf-8-sig'))
det=[r for r in g['rows'] if r['BUKRS']]
B=['B%02d'%i for i in range(1,11)]
print('GUI rows',g['row_count'],'detail',len(det),'API',len(api))
print('GUI sums',[f'{sum(num(r[b]) for r in det):,.2f}' for b in B+['TOT','AMT']])
print('API sums',[f'{sum(r["Bucket%02d"%i] for r in api):,.2f}' for i in range(1,11)],f'{sum(r["Total"] for r in api):,.2f}',f'{sum(r["OutstandingAmount"] for r in api):,.2f}')
print('GUI by product',{p:f'{v:,.2f}' for p,v in collections.Counter({}).items()})
gp=collections.defaultdict(float); ap=collections.defaultdict(float); gc=collections.Counter(); ac=collections.Counter()
for r in det: p=r['LTX'][:3]; gp[p]+=num(r['TOT']); gc[p]+=1
for r in api: ap[r['ProductType']]+=r['Total']; ac[r['ProductType']]+=1
for p in sorted(set(gp)|set(ap)): print(' ',p,'GUI',gc[p],f'{gp[p]:,.2f}','API',ac[p],f'{ap[p]:,.2f}','diff',f'{gp[p]-ap[p]:,.2f}')
gk=collections.defaultdict(list)
for r in det: gk[(r['RFHA'],r['RANL'])].append(r)
ak=collections.defaultdict(list)
for r in api: ak[(r['DealNumber'],r['SecurityId'])].append(r)
print('dup gui',[(k,len(v)) for k,v in gk.items() if len(v)>1][:20]); print('dup api',[(k,len(v)) for k,v in ak.items() if len(v)>1][:20])
def d2(s): return s[6:10]+'-'+s[3:5]+'-'+s[0:2] if s else ''
m=0; out=[]
for k in sorted(set(gk)|set(ak)):
    gv=[sum(num(r[b]) for r in gk[k]) for b in B] if k in gk else None
    av=[sum(r['Bucket%02d'%i] for r in ak[k]) for i in range(1,11)] if k in ak else None
    if gv and av and all(abs(a-b)<0.01 for a,b in zip(gv,av)): m+=1; continue
    pt=(gk[k][0]['LTX'][:3] if k in gk else ak[k][0]['ProductType'])
    out.append((pt,k,'GUI',[(i+1,x) for i,x in enumerate(gv or []) if x],d2(gk[k][0]['DATE']) if k in gk else None,'API',[(i+1,x) for i,x in enumerate(av or []) if x], ak[k][0]['RepaymentDate'] if k in ak else None, ak[k][0].get('Currency') if k in ak else None))
print('matching keys',m,'differing',len(out))
for o in out: print(o)
am=0; dd=collections.Counter(); ex=[]
for k in gk:
    g0=gk[k][0]; a0=ak[k][0]
    if abs(num(g0['AMT'])-a0['OutstandingAmount'])>0.01: am+=1
    gd=d2(g0['DATE']); ad=a0['RepaymentDate'] or ''
    if ad in ('0000-00-00',None): ad=''
    if gd!=ad: dd[(g0['LTX'][:3], 'gui blank' if not gd else 'gui set', 'api blank' if not ad else 'api set')]+=1; ex.append((k,gd,ad))
print('O/S amount diffs',am,'repayment date diffs',sum(dd.values()),dict(dd)); print(ex[:8])
print('Tpm12CaptureFailed', sum(1 for r in api if r['Tpm12CaptureFailed']))
