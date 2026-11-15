#!/usr/bin/env bash
set -u
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
B="https://www.infosubvenciones.es/bdnstrans/api"
echo "== concesiones"; curl -sSL -m 60 -A "$U" "$B/concesiones/busqueda?vpd=GE&page=0&pageSize=2&fechaDesde=01/01/2025&fechaHasta=31/01/2025" | head -c 1500; echo
echo "== convocatorias 2024 Irun"; curl -sSL -m 60 -A "$U" "$B/convocatorias/busqueda?vpd=GE&page=0&pageSize=3&descripcion=Irun&fechaDesde=01/01/2024&fechaHasta=31/12/2024" | head -c 1500; echo
echo "== planes estrategicos"; curl -sSL -m 60 -A "$U" "$B/planesestrategicos/busqueda?vpd=GE&page=0&pageSize=2" | head -c 800; echo
