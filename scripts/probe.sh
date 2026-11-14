#!/usr/bin/env bash
set -u
mkdir -p muestras
B="https://www.euskadi.eus/gobierno-vasco/tramites-servicios/?r01kQry=tT:ayuda_subvencion;mA:documentLanguage.EQ.es,procedureStatus.EQ.16;pp:r01PageSize.50;p:Inter,Inter_portal&r01SearchEngine=meta"
U1="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
U2="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
t() { code=$(curl -sSL -m 40 -A "$2" -o "muestras/$1" -w "%{http_code}" "$3"); n=$(grep -o 'class="r01srItem ' "muestras/$1" | wc -l); echo "$1 $code items=$n"; }
t a1.html "$U1" "$B"
t a2.html "$U2" "$B"
t a3.html "$U1" "$B&r01kTgtPg=1"
t a4.html "$U1" "$B&r01kTgtPg=2"
t a5.html "$U1" "$B&r01kPageContents=/web01-tramite/es/&r01kSrchSrcId=contenidos.inter&r01kTgtPg=2&r01kLang=es"
md5sum muestras/a*.html
