#!/usr/bin/env bash
set -u
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
echo "== detalle BDNS"; curl -sS -m 60 -A "$U" "https://www.infosubvenciones.es/bdnstrans/api/convocatorias?vpd=GE&numConv=936919" | python3 -c "
import json,sys; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d
for k,v in d.items(): print(k,'=',str(v)[:300])"
echo "== anthropic"; curl -sS -m 20 -o /dev/null -w "%{http_code} %{content_type}\n" https://api.anthropic.com/v1/messages
echo "== openai"; curl -sS -m 20 -o /dev/null -w "%{http_code} %{content_type}\n" https://api.openai.com/v1/models
echo "== apt pdftotext"; which pdftotext || (sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1 && which pdftotext) || echo NO
echo "== irun sede"; curl -sSL -m 30 -A "$U" -o /dev/null -w "%{http_code} %{url_effective}\n" "https://www.irun.org/es/sede"
echo "== bases pdf"; curl -sSL -m 60 -A "$U" -o /tmp/b.pdf -w "%{http_code} %{content_type} %{size_download}\n" "https://egoitza.gipuzkoa.eus/gaobog/castell/bog/2017/06/29/c1704626.pdf"; pdftotext -l 2 /tmp/b.pdf - 2>/dev/null | head -c 600
