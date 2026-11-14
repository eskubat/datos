#!/usr/bin/env bash
set -u
mkdir -p muestras
U2="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
curl -sSL -m 40 -A "$U2" "https://www.euskadi.eus/robots.txt" | head -60
echo ----
curl -sSL -m 40 -A "$U2" -o muestras/odata.json -w "odata %{http_code}\n" "https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones/ayudas_subvencion_becas_2026/opendata/ayudas.json"
head -c 1500 muestras/odata.json; echo
