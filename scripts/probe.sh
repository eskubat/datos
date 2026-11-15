#!/bin/bash
NAV='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
show(){ echo "=== $1"; curl -s -L -m 30 -A "$NAV" "$1" -o /tmp/p.html; python3 - <<'PY'
import re,html
s=open('/tmp/p.html',encoding='utf8',errors='ignore').read()
links=re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',s,re.S)
n=0
for h,t in links:
  t=html.unescape(re.sub('<[^>]+>',' ',t)).strip()
  t=re.sub(r'\s+',' ',t)
  if re.search(r'subvenc|ayuda|convoca|bases|dirulaguntz|laguntz|sumario|pdf|bolet',t+h,re.I) and len(t)>3:
    print('  ',t[:110],'|',h[:120]); n+=1
  if n>25: break
print('  enlaces totales',len(links))
PY
}
show 'https://www.bizkaia.eus/es/bob'
show 'https://www.araba.eus/botha/inicio/SGBO5001.aspx'
show 'https://egoitza.gipuzkoa.eus/es/bog'
show 'https://www.donostia.eus/es/euskera/subvenciones'
show 'https://www.vitoria-gasteiz.org/'
