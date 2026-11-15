#!/usr/bin/env bash
set -u
mkdir -p muestras
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sSL -m 60 -A "$UB" -o muestras/d.html "https://opendata.euskadi.eus/api-granted-benefits/?api=granted-benefits"
for js in $(grep -oE 'src="[^"]+\.js"' muestras/d.html | sed 's/src="//;s/"$//' | sort -u); do
  case $js in http*) u=$js;; *) u="https://opendata.euskadi.eus$js";; esac
  curl -sSL -m 60 -A "$UB" -o muestras/x.js "$u"
  if grep -q "renderApi\|granted-benefits\|swagger.json\|openapi" muestras/x.js; then
    echo "== $u"
    grep -oE ".{0,200}(renderApi|granted-benefits|swagger\.json|openapi|api\.euskadi).{0,300}" muestras/x.js | head -8
  fi
done
