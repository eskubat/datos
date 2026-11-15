#!/usr/bin/env bash
set -u
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
for n in 936919 928993; do
curl -sS -m 60 -A "$U" "https://www.infosubvenciones.es/bdnstrans/api/convocatorias?vpd=GE&numConv=$n" | python3 -c "
import json,sys,re,html; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d
for a in d.get('anuncios',[]):
  print({k:(str(v)[:80]) for k,v in a.items() if k!='texto'})
  t=re.sub(r'<[^>]+>','\n',a.get('texto','')); t=html.unescape(re.sub(r'\n\s*\n+','\n',t)); print(t[:2500])
print('DOCS', d.get('documentos'))"
done
curl -sS -m 60 -A "$U" -o /tmp/d.pdf -w "doc %{http_code} %{content_type} %{size_download}\n" "https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento=1541619"
pdftotext -l 3 /tmp/d.pdf - 2>/dev/null | head -c 1500
