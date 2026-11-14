#!/usr/bin/env bash
set -u
mkdir -p muestras
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
B="https://www.euskadi.eus/gobierno-vasco/tramites-servicios/"
try() { code=$(curl -sSL -m 40 -A "$UA" -o "muestras/$1" -w "%{http_code}" "$2"); n=$(grep -o 'class="r01srItem ' "muestras/$1" | wc -l); echo "$1 $code items=$n"; }
try v1.html "${B}?r01kQry=tT:ayuda_subvencion;cO:r01epd0122e4ed314423e0db04c97a47b5baa317f,r01epd0122e4edf39923e0db0b11fff216b637726;mA:documentLanguage.EQ.es,procedureCollection.EQ.0,procedureStatus.EQ.16;pp:r01PageSize.20;p:Inter,Inter_portal&r01SearchEngine=meta"
try v2.html "${B}?r01kQry=tT:ayuda_subvencion;mA:documentLanguage.EQ.es,procedureStatus.EQ.16;pp:r01PageSize.20;p:Inter,Inter_portal&r01SearchEngine=meta"
try v3.html "${B}?r01kQry=tT:ayuda_subvencion;cO:r01epd0122e4ed314423e0db04c97a47b5baa317f,r01epd0122e4edf39923e0db0b11fff216b637726;mA:documentLanguage.EQ.es,procedureCollection.EQ.0,procedureStatus.EQ.16;pp:r01PageSize.20;p:Inter,Inter_portal&r01SearchEngine=meta&r01kPageContents=/web01-tramite/es/&r01kSrchSrcId=contenidos.inter&r01kTgtPg=2&r01kLang=es"
try v4.html "${B}?r01kQry=tT:ayuda_subvencion;cO:r01epd0122e4ed314423e0db04c97a47b5baa317f,r01epd0122e4edf39923e0db0b11fff216b637726;mA:documentLanguage.EQ.es,procedureCollection.EQ.0,procedureStatus.EQ.16;pp:r01PageSize.100;p:Inter,Inter_portal&r01SearchEngine=meta"
try v5.html "${B}?r01SearchEngine=meta&r01kQry=tT%3Aayuda_subvencion%3BmA%3AdocumentLanguage.EQ.es%2CprocedureStatus.EQ.16%3Bpp%3Ar01PageSize.20%3Bp%3AInter%2CInter_portal"
try v6.html "${B}?r01SearchEngine=meta&r01kPageContents=/web01-tramite/es/&r01kSrchSrcId=contenidos.inter&r01kTgtPg=2&r01kLang=es&r01kQry=tT%3Aayuda_subvencion%2Canuncio_contratacion%2Cpremio_concurso%2Cautorizacion%2Cregistro%2Cinspeccion%2Ccarnet%2Carbitraje_denuncia_reclamacion"
try v7.html "${B}"
