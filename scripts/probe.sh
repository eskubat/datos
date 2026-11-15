#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
B="https://api.euskadi.eus/granted-benefit/v1.0"
echo "== groups"; curl -sSL -m 60 -A "$UB" "$B/organizationGroups" | head -c 2500; echo
echo "== recent"; curl -sSL -m 60 -A "$UB" "$B/granted-benefits?_elements=3&_page=1&grantedDateFrom=2026-10-01" | head -c 3000; echo
for n in administration-events administration_event administrationEvents administration events; do
  code=$(curl -sSL -m 30 -A "$UB" -o muestras/ae.json -w "%{http_code}" "https://opendata.euskadi.eus/contenidos/recurso_tecnico/data_apirest/es_def/adjuntos/$n.json"); echo "spec $n $code $(head -c 80 muestras/ae.json | tr '\n' ' ')"
done
