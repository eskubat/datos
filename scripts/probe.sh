#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for a in granted-benefits administration_events; do
  curl -sSL -m 60 -A "$UB" -o muestras/$a.json "https://opendata.euskadi.eus/contenidos/recurso_tecnico/data_apirest/es_def/adjuntos/$a.json"
  python3 - "$a" <<'PY'
import json,sys
a=sys.argv[1]; d=json.load(open(f'muestras/{a}.json',encoding='utf-8',errors='replace'))
print('=====',a, d.get('servers') or (d.get('host'),d.get('basePath')))
for p,ops in d.get('paths',{}).items():
    for m,op in ops.items():
        if not isinstance(op,dict): continue
        ps=[x.get('name') for x in op.get('parameters',[]) if isinstance(x,dict)]
        print(m.upper(),p,'|',op.get('summary','')[:80],'|',ps)
PY
done
