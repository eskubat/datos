#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for p in "api-granted-benefits/?api=granted-benefits" "api-administration/?api=administration_events"; do
  f=muestras/$(echo $p | cut -c1-20 | tr '/?=' '___').html
  curl -sSL -m 60 -A "$UB" -o "$f" -w "$p %{http_code} %{size_download}\n" "https://opendata.euskadi.eus/$p"
  grep -oE "(https?:)?//[a-zA-Z0-9.-]*euskadi\.eus/[^\"' <>)]*" "$f" | grep -iE "api|swagger|json|yaml|openapi" | sort -u | head -20
  grep -oE "[\"'][^\"']*(swagger|openapi|api-docs)[^\"']*[\"']" "$f" | sort -u | head -10
done
for u in "https://api.euskadi.eus/granted-benefits/v1.0/granted-benefits?_elements=2" "https://api.euskadi.eus/granted-benefits?_elements=2" "https://api.euskadi.eus/administration/events?_elements=2" "https://api.euskadi.eus/administration/v1.0/events?_elements=2" "https://api.euskadi.eus/swagger-ui/" "https://api.euskadi.eus/"; do
  echo "== $u"; curl -sSL -m 30 -A "$UB" "$u" | head -c 500; echo
done
