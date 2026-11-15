#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sSL -m 60 -A "$UB" -o muestras/d.html "https://opendata.euskadi.eus/api-granted-benefits/?api=granted-benefits"
python3 -c "
import re
s=open('muestras/d.html','rb').read().decode('latin-1')
i=s.find('swagger div'); print(re.sub(r'\s+',' ',s[i-300:i+2500]))
print('STRINGS', sorted(set(re.findall(r'[\"\x27]([^\"\x27]{3,200}\.(?:json|yaml|yml))[\"\x27]', s)))[:30])
"
