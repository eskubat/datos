#!/usr/bin/env bash
set -u
mkdir -p muestras
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
g() { curl -sSL -m 60 -A "$U" -o "muestras/$1" -w "$1 %{http_code} %{size_download}\n" "$2"; }
g gipu.html "https://egoitza.gipuzkoa.eus/es/subvenciones"
g araba_mas.html "https://egoitza.araba.eus/es/inicio/tramites?Clase=1543231"
g araba_fitxa.html "https://egoitza.araba.eus/es/guia-de-tramites/fitxa/01630001"
python3 - <<'PY'
import re,html
def dump(f, keys, n=2500):
    s=open('muestras/'+f,'rb').read().decode('utf-8','replace')
    s2=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>','',s)
    for k in keys:
        i=s2.find(k)
        print(f'===== {f} [{k}] at {i}')
        if i>=0: print(re.sub(r'\s+',' ',s2[max(0,i-1200):i+n]))
dump('gipu.html',['TXEKINBERRI: Plan','Cultura (30)'])
s=open('muestras/gipu.html','rb').read().decode('utf-8','replace')
hs=sorted(set(html.unescape(h) for h in re.findall(r'href="([^"]*Subvenciones_WAR[^"]*)"',s)))
print('HREFS',len(hs)); [print(' ',h) for h in hs[:6]]
dump('araba_mas.html',['fitxa/'],3000)
dump('araba_fitxa.html',['Plazo','plazo'],2000)
PY
