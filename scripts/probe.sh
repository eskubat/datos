#!/bin/bash
sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1
DEPURAR=1 node -e "import('./recolector/boletines.js').then(async m=>{const v=new Set();const r=await m.botha(new Date(Date.now()-10*864e5),v,console.log);console.log('ITEMS',r.length);r.slice(0,10).forEach(x=>console.log(' -',x.entidad,'|',x.titulo.slice(0,100)))})" 2>&1 | head -120
