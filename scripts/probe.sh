#!/usr/bin/env bash
set -u
mkdir -p muestras
U="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 EskubatBot/0.1 (+https://github.com/eskubat/datos)"
O="https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones"
for f in ultimas_ayudas_subvencion_bec ayudas_subvencion_becas_2026 ayudas_subvencion_becas_2025; do
  curl -sSL -m 60 -A "$U" -o "muestras/$f.json" -w "$f %{http_code} %{size_download}\n" "$O/$f/opendata/ayudas.json"
done
curl -sSL -m 60 -A "$U" -o muestras/s.html -w "busqueda %{http_code} %{size_download}\n" "https://www.euskadi.eus/gobierno-vasco/tramites-servicios/?r01kQry=tT:ayuda_subvencion;mA:documentLanguage.EQ.es,procedureStatus.EQ.16;pp:r01PageSize.50;p:Inter,Inter_portal&r01SearchEngine=meta"
python3 - <<'PY'
import json
for f in ['ultimas_ayudas_subvencion_bec','ayudas_subvencion_becas_2026']:
    try:
        raw=open(f'muestras/{f}.json','rb').read()
        txt=raw.decode('utf-8','replace').strip()
        if txt.startswith('jsonCallback('): txt=txt[13:-2]
        d=json.loads(txt)
        arr=d if isinstance(d,list) else next(v for v in d.values() if isinstance(v,list))
        print(f, type(d).__name__, len(arr))
        print(json.dumps(arr[0],ensure_ascii=False)[:2500])
        print('KEYS', sorted(arr[0].keys()))
    except Exception as e:
        print(f, 'ERR', e, raw[:300])
PY
