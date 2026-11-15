#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
g() { curl -sSL -m 60 -A "$2" -o "muestras/$1" -w "$1 %{http_code} %{size_download} %{url_effective}\n" "$3"; }
O="https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones"
g od_ultimas.json "$UB" "$O/ultimas_ayudas_subvencion_bec/opendata/ayudas.json"
g od_2026.json "$UB" "$O/ayudas_subvencion_becas_2026/opendata/ayudas.json"
g araba_vigor.html "$U" "https://web.araba.eus/es/ayudas-en-vigor"
g araba_tram.html "$U" "https://egoitza.araba.eus/es/inicio/tramites?izapideMota=90"
g gipu_sub.html "$U" "https://egoitza.gipuzkoa.eus/es/subvenciones"
g donostia.html "$U" "https://www.donostia.eus/info/ciudadano/ayudas.nsf"
g vitoria.html "$U" "https://www.vitoria-gasteiz.org/sedeelectronica/ayudas"
g bilbao.html "$U" "https://www.bilbao.eus/opendata/es/catalogo"
python3 - <<'PY'
import re,html,json
def links(f,pat=r'ayud|subven|diru|laguntz|convoca|fitxa|tramite|beca'):
    try: s=open('muestras/'+f,'rb').read().decode('utf-8','replace')
    except: return
    out=set()
    for h,t in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',s,flags=re.S):
        t=re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',t)).strip()
        if re.search(pat,h+' '+t,re.I) and len(t)>3: out.add((t[:90],html.unescape(h)[:170]))
    print('=====',f,len(s),len(out))
    for x in sorted(out)[:45]: print('  ',x)
for f in ['araba_vigor.html','araba_tram.html','gipu_sub.html','donostia.html','vitoria.html','bilbao.html']: links(f)
for f in ['od_ultimas.json','od_2026.json']:
    try:
        t=open('muestras/'+f,'rb').read().decode('utf-8','replace').strip()
        if not t.startswith(('[','{')): t=t[t.find('('):].strip('();\n ') if '(' in t[:40] else t
        d=json.loads(t); arr=d if isinstance(d,list) else next(v for v in d.values() if isinstance(v,list))
        print('=====',f,len(arr)); print(json.dumps(arr[0],ensure_ascii=False)[:3000])
    except Exception as e: print(f,'ERR',e,t[:200] if 't' in dir() else '')
PY
