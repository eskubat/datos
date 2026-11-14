#!/usr/bin/env bash
# Descarga muestras de cada fuente para estudiar su formato.
set -u
mkdir -p muestras
UA="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
get() { curl -sSL -m 40 -A "$UA" -o "muestras/$1" -w "$1 %{http_code} %{size_download}\n" "$2" || echo "$1 ERROR"; }
get bdns_busqueda.json "https://www.infosubvenciones.es/bdnstrans/api/convocatorias/busqueda?vpd=GE&page=0&pageSize=5&order=fechaRecepcion&direccion=desc"
get euskadi_lista.html "https://www.euskadi.eus/gobierno-vasco/tramites-servicios/"
get euskadi_rss.xml "https://www.euskadi.eus/r01hSearchResultWar/r01hPresentationRSS.jsp?r01kLang=es&r01kQry=tF:procedimientos_administrativos;p:Inter_portal,Inter&r01kPageContents=/gobierno-vasco/&r01kRssTitle=Tramites&r01kRss=1"
get euskadi_ficha.html "https://www.euskadi.eus/servicios/1043411"
get euskadi_ficha2.html "https://www.euskadi.eus/servicios/1037018"
get araba_sede.html "https://egoitza.araba.eus/es/"
get bizkaia_catalogo.html "https://ataria.ebizkaia.eus/es/catalogo-de-tramites-y-servicios"
get gipuzkoa_sede.html "https://egoitza.gipuzkoa.eus/es/"
get opendata_ultimas.json "https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones/ultimas_ayudas_subvencion_bec/opendata/ayudas.json"
ls -la muestras
