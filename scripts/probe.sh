#!/usr/bin/env bash
set -u
mkdir -p muestras
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sSL -m 60 -A "$U" -o muestras/p6.html "https://opendata.euskadi.eus/api-administration/?api=administration_events"
python3 - <<'PY'
import re
s=open('muestras/p6.html','rb').read().decode('latin-1')
for m in sorted(set(re.findall(r'(?:https?:)?//[^"\' <>]*(?:api|swagger|openapi)[^"\' <>]*', s)))[:60]: print('URL', m)
i=s.find('administration'); 
t=re.sub(r'<[^>]+>',' ',s); t=re.sub(r'\s+',' ',t)
j=t.find('API'); print(t[j:j+3000])
PY
for u in "https://api.euskadi.eus/administration/events?_elements=2" "https://api.euskadi.eus/administration/events/v1.0/events?_elements=2" "https://api.euskadi.eus/administration-events/v1.0/events?_elements=2"; do echo "== $u"; curl -sSL -m 30 -A "$U" "$u" | head -c 800; echo; done
echo "== odata browser UA"; curl -sSL -m 30 -A "$UB" -o /dev/null -w "%{http_code} %{size_download}\n" "https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones/ayudas_subvencion_becas_2025/opendata/ayudas.json"
