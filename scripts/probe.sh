#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sSL -m 60 -A "$UB" -o muestras/s.js "https://opendata.euskadi.eus/VA/link/505EBDD6/scripts/webopd00-505EBDD6-scripts.js"
python3 -c "
import re
s=open('muestras/s.js','rb').read().decode('latin-1')
i=s.find('renderApi'); print(s[i-200:i+2500])
print(sorted(set(re.findall(r'https?://[^\"\x27 ]+', s)))[:40])
"
