#!/bin/bash
# Sondeo: descarga de las bases de la Fundación «la Caixa» (tarea lacaixa-bases-pdf)
sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1
BOT='Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)'
NAV='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
for U in \
  https://lacaixafoundation.org/documents/d/la-caixa-foundation/postgraduate-fellowships-abroad-2027-rules-participation-pdf \
  https://lacaixafoundation.org/documents/d/la-caixa-foundation/doctoral-inphinit-incoming-2027-rules-participation-pdf \
  https://fundacionlacaixa.org/es/becas-posgrado-extranjero-convocatoria \
  https://lacaixafoundation.org/en/doctoral-inphinit-fellowships-incoming-call ; do
  for UA in "$BOT" "$NAV"; do
    echo "== $U | ${UA:0:30}"
    curl -sS -L --max-time 40 -o /tmp/x.bin -D /tmp/h.txt -w 'code=%{http_code} type=%{content_type} size=%{size_download} final=%{url_effective} redirects=%{num_redirects}\n' -A "$UA" -H 'Accept: text/html,application/pdf,*/*' "$U"
    grep -i '^\(location\|server\|cf-\|set-cookie\)' /tmp/h.txt | cut -c1-160
    head -c 4 /tmp/x.bin; echo
    if [ "$(head -c 4 /tmp/x.bin)" = "%PDF" ]; then pdftotext -l 3 /tmp/x.bin - | head -c 600; echo; else grep -o 'href="[^"]*\(documents\|pdf\)[^"]*"' /tmp/x.bin | sort -u | head -25; fi
  done
done
