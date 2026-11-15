#!/usr/bin/env bash
node -e "
(async()=>{for (const id of [1541619,1520330]){const r=await fetch('https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento='+id,{headers:{'User-Agent':'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)'}});const b=Buffer.from(await r.arrayBuffer());console.log(id,r.status,r.headers.get('content-type'),b.length,JSON.stringify(b.slice(0,8).toString('latin1')));}})()"
