#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for p in "api-granted-benefits/?api=granted-benefits" "api-administration/?api=administration_events"; do
  curl -sSL -m 60 -A "$UB" -o muestras/d.html "https://opendata.euskadi.eus/$p"
  echo "===== $p"
  python3 -c "
import re
s=open('muestras/d.html','rb').read().decode('latin-1')
for m in re.finditer(r'SwaggerUIBundle|swagger div|\burls?\s*[:=]', s):
    print('...',re.sub(r'\s+',' ',s[m.start()-200:m.start()+700])); print()
" | head -c 4000
done
