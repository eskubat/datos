#!/usr/bin/env bash
set -u
mkdir -p muestras
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
g() { curl -sSL -m 60 -A "$U" -o "muestras/$1" -w "$1 %{http_code} %{size_download}\n" "$2"; }
g gl.html 'https://egoitza.gipuzkoa.eus/es/subvenciones?p_p_id=Subvenciones_WAR_LEEsubvencionesportlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_Subvenciones_WAR_LEEsubvencionesportlet_myaction=lista&_Subvenciones_WAR_LEEsubvencionesportlet_idMateria=CULT&_Subvenciones_WAR_LEEsubvencionesportlet_d-7690214-p=1&_Subvenciones_WAR_LEEsubvencionesportlet_ejercicio=2026'
g gd.html 'https://egoitza.gipuzkoa.eus/es/subvenciones?p_p_id=Subvenciones_WAR_LEEsubvencionesportlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_Subvenciones_WAR_LEEsubvencionesportlet_cserv=EKTX02&_Subvenciones_WAR_LEEsubvencionesportlet_myaction=detalle&_Subvenciones_WAR_LEEsubvencionesportlet_depto=10&_Subvenciones_WAR_LEEsubvencionesportlet_ejercicio=2026'
g av.html 'https://web.araba.eus/es/ayudas-en-vigor'
python3 - <<'PY'
import re,html
def txt(f,a,b=6000):
    s=open('muestras/'+f,'rb').read().decode('utf-8','replace')
    s=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>','',s)
    t=re.sub(r'<(tr|li|p|div|h\d|td|br)[^>]*>','\n',s); t=html.unescape(re.sub(r'<[^>]+>','',t)); t=re.sub(r'[ \t]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
    i=t.find(a); print('=====',f,i); print(t[max(0,i):i+b])
txt('gl.html','Cultura',3500)
s=open('muestras/gl.html','rb').read().decode('utf-8','replace')
i=s.find('myaction=detalle'); print('RAW', re.sub(r'\s+',' ',s[i-1500:i+1500]))
txt('gd.html','TXEKINBERRI',4000)
txt('av.html','Ayudas en vigor',3000)
PY
