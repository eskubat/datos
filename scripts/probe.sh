#!/bin/bash
B='https://www.infosubvenciones.es/bdnstrans/api'
D=$(date -d '-120 days' +%d/%m/%Y)
python3 - "$B" "$D" <<'PY'
import sys,json,urllib.request,urllib.parse,collections
B,D=sys.argv[1],sys.argv[2]
def get(u):
  return json.load(urllib.request.urlopen(urllib.request.Request(B+u,headers={'User-Agent':'EskubatBot/0.1'}),timeout=60))
c=collections.Counter(); est=[]
for p in range(0,40):
  r=get(f"/convocatorias/busqueda?vpd=GE&page={p}&pageSize=200&fechaDesde={urllib.parse.quote(D)}&order=fechaRecepcion&direccion=desc")
  for it in r.get('content',[]):
    c[it.get('nivel1')]+=1
    if (it.get('nivel1') or '').upper().startswith('ESTADO'): est.append(it)
  if r.get('last') or not r.get('content'): break
print(c.most_common()); print('estado',len(est))
reg=collections.Counter(); ab=0
for it in est[:60]:
  d=get(f"/convocatorias?vpd=GE&numConv={it['numeroConvocatoria']}")
  if isinstance(d,list): d=d[0]
  rs=[x.get('descripcion') for x in (d.get('regiones') or [])]
  reg[' ; '.join(rs)[:80]]+=1
  if d.get('abierto'): ab+=1
  if it is est[0]: print(json.dumps({k:d.get(k) for k in ['descripcion','regiones','tiposBeneficiarios','abierto','fechaFinSolicitud','sedeElectronica','organo','instrumentos']},ensure_ascii=False)[:1500])
print('abiertas en 60:',ab); print(reg.most_common(15))
for it in est[:15]: print('-',it.get('nivel2'),'|',(it.get('descripcion') or '')[:110])
PY
