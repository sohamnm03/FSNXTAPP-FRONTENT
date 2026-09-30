import json, collections
def num(s):
    s=(s or '').strip()
    if not s: return 0.0
    neg=s.endswith('-'); v=float(s.rstrip('-').replace(',','')); return -v if neg else v
g=json.load(open('r014.json',encoding='utf-8')); api=json.load(open('../run-1/sap-trm-accrual.json',encoding='utf-8-sig'))
det=[r for r in g['rows'] if r['BUKRS']]
B=['B%02d'%i for i in range(1,10)]
print('GUI rows',g['row_count'],'detail',len(det),'API',len(api))
print('GUI sums',[f'{sum(num(r[b]) for r in det):,.2f}' for b in B+['TOT']])
print('API sums',[f'{sum(r["Bucket%02d"%i] for r in api):,.2f}' for i in range(1,11)],f'{sum(r["Total"] for r in api):,.2f}')
gk={}
for r in det: gk.setdefault((r['RFHA'],r['RANL']),[]).append(r)
ak={}
for r in api: ak.setdefault((r['DealNumber'],r['SecurityId']),[]).append(r)
print('dup gui',[k for k,v in gk.items() if len(v)>1],'dup api',[k for k,v in ak.items() if len(v)>1])
def d2(s): return s[6:10]+'-'+s[3:5]+'-'+s[0:2] if s else ''
m=0
for k in sorted(set(gk)|set(ak)):
    gv=[num(gk[k][0][b]) for b in B]+[0.0] if k in gk else None
    av=[ak[k][0]['Bucket%02d'%i] for i in range(1,11)] if k in ak else None
    gd=d2(gk[k][0]['DATE']) if k in gk else None; ad=ak[k][0]['InterestPayoutDate'] if k in ak else None
    if gv and av and all(abs(a-b)<0.01 for a,b in zip(gv,av)) and gd==ad: m+=1; continue
    pt=(gk.get(k) or [{}])[0].get('LTX') or ak[k][0]['ProductType']
    print(k,pt,'GUI',gd,[x for x in (gv or []) if x] , sum(gv) if gv else None,'| API',ad,[x for x in (av or []) if x], ak[k][0]['Total'] if av else None)
print('matching',m)
