// Histórico: convocatorias de años anteriores para detectar ayudas que se repiten cada año.
// Se ejecuta una vez por semana (es un barrido grande) y guarda publico/historico.json.
// El recolector diario lo lee para anotar las ayudas actuales y anunciar las previstas.
import fs from 'node:fs';
import path from 'node:path';
import { pedir, norm, iso, enParalelo, frase } from './comun.js';
import { clasifica, RUIDO, limpiaTitulo } from './bdns.js';

const API = 'https://www.infosubvenciones.es/bdnstrans/api';
const OD = 'https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones';
const AÑOS_ATRAS = 3;
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

// Clave estable de una línea de ayuda: título sin años, ediciones ni números
const VACIAS = new Set('de del la las el los y e o u a en para por con al sus su que se ano anos ejercicio convocatoria convocatorias curso edicion bases reguladoras extracto'.split(' '));
const ROMANOS = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
export function claveLinea(titulo, organismo) {
  const pal = norm(titulo).replace(/[^a-z0-9 ]+/g, ' ').split(' ')
    .filter((w) => w.length > 2 && !VACIAS.has(w) && !/\d/.test(w) && !ROMANOS.test(w) && !/^(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)$/.test(w));
  return norm(organismo).replace(/[^a-z0-9]+/g, '-') + '|' + [...new Set(pal)].sort().join(' ');
}

function ddmmyyyy(d) { return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); }

async function bdnsHistorico() {
  const hoy = new Date();
  const meses = [];
  for (let k = 1; k <= AÑOS_ATRAS * 12 + 1; k++) {
    const ini = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - k, 1));
    const fin = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 0));
    meses.push([ini, fin]);
  }
  const out = [];
  let revisadas = 0;
  await enParalelo(meses, 2, async ([ini, fin]) => {
    for (let p = 0; p < 200; p++) {
      const r = await pedir(`${API}/convocatorias/busqueda?vpd=GE&page=${p}&pageSize=200&fechaDesde=${encodeURIComponent(ddmmyyyy(ini))}&fechaHasta=${encodeURIComponent(ddmmyyyy(fin))}&order=fechaRecepcion&direccion=desc`, { json: true });
      const c = r.content || [];
      revisadas += c.length;
      for (const it of c) {
        const amb = clasifica(it.nivel1, it.nivel2, it.nivel3);
        if (!amb || amb.nivel === 'estado' || RUIDO.test(it.descripcion || '')) continue;
        out.push({ titulo: limpiaTitulo(it.descripcion), organismo: frase(it.nivel3 || it.nivel2 || ''), ambito: amb, fecha: iso(it.fechaRecepcion), bdns: String(it.numeroConvocatoria) });
      }
      if (!c.length || r.last === true || c.length < 200) break;
    }
  });
  log(`BDNS histórico: ${revisadas} convocatorias revisadas, ${out.length} de Euskadi`);
  return out;
}

async function openDataHistorico() {
  const año = new Date().getFullYear();
  const out = [];
  for (let y = año - AÑOS_ATRAS; y <= año; y++) {
    try {
      const d = await pedir(`${OD}/ayudas_subvencion_becas_${y}/opendata/ayudas.json`, { json: true, navegador: true, timeout: 90000 });
      const arr = Array.isArray(d) ? d : Object.values(d).find(Array.isArray) || [];
      for (const x of arr) {
        const t = x.documentName || x.procedureDenomination;
        if (!t || RUIDO.test(t)) continue;
        out.push({ titulo: frase(t), organismo: x.manager || x.department || 'Gobierno Vasco', ambito: { nivel: 'euskadi', nombre: 'Toda Euskadi' }, fecha: iso(x.procedureStartDate), fin: iso(x.procedureEndDate), url: x.friendlyUrl || x.physicalUrl || '' });
      }
      log(`Open Data Euskadi ${y}: ${arr.length}`);
    } catch (e) { log(`Open Data Euskadi ${y}: ${e.message}`); }
  }
  return out;
}

// Agrupa por línea de ayuda y se queda con las que aparecen en 2 o más años distintos
export function agrupar(registros) {
  const g = new Map();
  for (const r of registros) {
    if (!r.fecha) continue;
    const k = claveLinea(r.titulo, r.organismo);
    if (k.split('|')[1].split(' ').length < 2) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  }
  const lineas = [];
  for (const [clave, rs] of g) {
    rs.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const años = [...new Set(rs.map((r) => +r.fecha.slice(0, 4)))];
    if (años.length < 2) continue;
    // Mes habitual: el más repetido entre las ediciones (una por año: la primera de cada año)
    const primeras = años.map((y) => rs.find((r) => +r.fecha.slice(0, 4) === y));
    const cuenta = {};
    primeras.forEach((r) => { const m = +r.fecha.slice(5, 7); cuenta[m] = (cuenta[m] || 0) + 1; });
    const mes = +Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const ultima = rs[rs.length - 1];
    const duraciones = rs.filter((r) => r.fin && r.fecha).map((r) => Math.round((new Date(r.fin) - new Date(r.fecha)) / 864e5)).filter((d) => d > 0 && d < 400);
    lineas.push({
      clave,
      titulo: ultima.titulo,
      organismo: ultima.organismo,
      ambito: ultima.ambito,
      años,
      mes,
      fechas: primeras.map((r) => r.fecha),
      duracionDias: duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null,
      ultimaFecha: ultima.fecha,
      url: ultima.url || (ultima.bdns ? `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${ultima.bdns}` : ''),
    });
  }
  return lineas;
}

async function main() {
  const regs = [...(await openDataHistorico()), ...(await bdnsHistorico())];
  const lineas = agrupar(regs);
  const porAmbito = lineas.reduce((m, l) => { m[l.ambito.nivel] = (m[l.ambito.nivel] || 0) + 1; return m; }, {});
  fs.mkdirSync('publico', { recursive: true });
  fs.writeFileSync(path.join('publico', 'historico.json'), JSON.stringify({ generado: new Date().toISOString(), registros: regs.length, lineas }));
  log(`Líneas que se repiten: ${lineas.length} · ${JSON.stringify(porAmbito)}`);
}

if (process.argv[1] && process.argv[1].endsWith('historico.js')) main().catch((e) => { console.error(e); process.exit(1); });
