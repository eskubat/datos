#!/bin/bash
# Sondeo: números 046 y 047 de 2026 del BOTHA, cuyo sumario da HTTP 404 (tarea botha-sumarios-046-047-motivo)
sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1
BOT='Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)'
B=https://www.araba.eus/botha/Boletines/2026
for N in 046 047; do
  for F in 2026_${N}_S_C.pdf 2026_${N}_s_c.pdf 2026_${N}_S_E.pdf 2026_${N}_S.pdf 2026_${N}.pdf; do
    curl -sS -o /dev/null --max-time 20 -A "$BOT" -w "$N $F code=%{http_code} size=%{size_download}\n" "$B/$N/$F"
  done
done
echo "== portada"
curl -sS --max-time 30 -A "$BOT" https://www.araba.eus/botha/inicio/SGBO5001.aspx | grep -o 'href="[^"]*"' | grep -i 'bolet\|sumar\|aspx' | sort -u | head -40
echo "== anuncios 01077-01157 en 046/047"
for R in $(seq 1077 1157); do
  R5=$(printf '%05d' $R)
  for N in 046 047; do
    C=$(curl -sS -o /tmp/a.pdf --max-time 20 -A "$BOT" -w '%{http_code}' "$B/$N/2026_${N}_${R5}_C.pdf")
    if [ "$C" = "200" ] && [ "$(head -c 4 /tmp/a.pdf)" = "%PDF" ]; then
      echo "## $N $R5: $(pdftotext -l 1 /tmp/a.pdf - 2>/dev/null | tr '\n' ' ' | tr -s ' ' | cut -c1-500)"
      break
    fi
  done
  sleep 0.3
done
