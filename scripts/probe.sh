#!/usr/bin/env bash
set -u
mkdir -p muestras
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
Q='tC:euskadi;tF:procedimientos_administrativos;tT:ayuda_subvencion;m:documentLanguage.EQ.es;mO:procedureEndDate.GT.TODAY,procedureStartDate.LAST.90;p:Inter_portal,Inter;pp:r01NavBarBlockSize.10,r01PageSize.100'
t() { code=$(curl -sSL -m 60 -A "$U" -o "muestras/$1" -w "%{http_code} %{size_download} %{content_type}" "$2"); echo "$1 $code"; head -c 600 "muestras/$1" | tr '\n' ' '; echo; echo; }
t p1.xml "https://opendata.euskadi.eus/r01htSearchResultWAR/r01hPresentationXML.jsp?r01kQry=$Q"
t p2.xml "https://www.euskadi.eus/r01hSearchResultWar/r01hPresentationRSS.jsp?r01kLang=es&r01kQry=$Q"
t p3.html "https://opendata.euskadi.eus/w79-resbus/es?r01kQry=$Q"
t p4.json "https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones/ultimas_ayudas_subvencion_bec/opendata/ayudas.json"
t p5.json "https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones/ayudas_subvencion_becas_2025/opendata/ayudas.json"
t p6.html "https://opendata.euskadi.eus/api-administration/?api=administration_events"
grep -oE 'https?://[a-z.]*api[a-z.]*euskadi[^"'"'"' <]*' muestras/p6.html | sort -u | head -30
