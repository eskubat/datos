#!/bin/bash
BOT='Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)'
NAV='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
for u in \
 'https://www.bizkaia.eus/es/subvenciones' \
 'https://www.bizkaia.eus/es/web/guest/ayudas-y-subvenciones' \
 'https://www.bizkaia.eus/es/bob' \
 'https://www.bizkaia.eus/es/web/bob' \
 'https://apps.bizkaia.eus/BT00/BOB/bobvisual' \
 'https://www.bizkaia.eus/lehendakaritza/Bao_bob/sumario.asp?Idioma=CA' \
 'https://www.araba.eus/botha/inicio/SGBO5001.aspx' \
 'https://www.araba.eus/botha/Busquedas/Resultado.aspx' \
 'https://web.araba.eus/es/ayudas-en-vigor' \
 'https://egoitza.gipuzkoa.eus/es/bog' \
 'https://ssl4.gipuzkoa.net/castell/bog/2026/11/13/' \
 'https://www.bilbao.eus/cs/Satellite?pagename=Bilbaonet/Page/BIO_listadoPlantilla&cid=1272991143233&language=es' \
 'https://www.bilbao.eus/es/subvenciones' \
 'https://www.donostia.eus/info/ciudadano/subvenciones.nsf' \
 'https://www.donostia.eus/es/subvenciones' \
 'https://www.vitoria-gasteiz.org/we001/was/we001Action.do?idioma=es&accion=subvenciones' \
 'https://www.vitoria-gasteiz.org/sedeelectronica/es/subvenciones' \
 'https://sede.vitoria-gasteiz.org/' ; do
  for ua in "$BOT" "$NAV"; do
    r=$(curl -s -L -m 25 -A "$ua" -o /tmp/p.html -w '%{http_code} %{size_download} %{url_effective}' "$u")
    t=$(grep -o '<title>[^<]*' /tmp/p.html | head -1 | cut -c8-80)
    echo "$( [ "$ua" = "$BOT" ] && echo BOT || echo NAV ) $r | $t"
  done
done
