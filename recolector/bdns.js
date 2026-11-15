// Fuente: Base de Datos Nacional de Subvenciones (InfoSubvenciones).
// Recoge convocatorias del Gobierno Vasco, las diputaciones forales y los ayuntamientos de Euskadi.
import { pedir, norm, frase, iso, enParalelo, temasDe, paraDeTexto, TERRS, MUNI_IDX } from './comun.js';

const BASES = ['https://www.infosubvenciones.es/bdnstrans/api', 'https://www.pap.hacienda.gob.es/bdnstrans/api'];
const DIAS_ATRAS = 120;
const PAGE_SIZE = 200;
const MAX_PAGINAS = 120;

async function api(path) {
  let last;
  for (const base of BASES) {
    try { return await pedir(base + path, { json: true }); } catch (e) { last = e; }
  }
  throw last;
}

function limpiaOrgano(s) {
  return norm(s).replace(/^(ayuntamiento|udala|concejo|junta administrativa) (de |del |de la )?/, '').replace(/ udala$/, '').trim();
}

export function clasifica(n1, n2, n3) {
  const a = norm(n1), b = norm(n2), c = norm(n3);
  if (/auton/.test(a)) {
    if (/pais vasco|euskadi|euskal autonomia/.test(b) || /pais vasco|euskadi/.test(c)) return { nivel: 'euskadi', nombre: 'Toda Euskadi' };
    return null;
  }
  if (/local|otros/.test(a) || !a) {
    for (const k in TERRS) {
      const parts = k.split('/');
      const esProv = parts.some((p) => b === p || b === 'diputacion foral de ' + p || b === p + 'ko foru aldundia');
      const esDip = /foral|foru|diputaci/.test(b + ' ' + c) && parts.some((p) => (b + ' ' + c).indexOf(p) >= 0);
      if (esProv || esDip) return { nivel: 'territorio', nombre: TERRS[k], terr: TERRS[k] };
    }
    for (const x of [b, limpiaOrgano(b), limpiaOrgano(c)]) {
      if (MUNI_IDX[x]) return { nivel: 'municipio', nombre: MUNI_IDX[x].nombre, terr: MUNI_IDX[x].terr };
    }
  }
  return null;
}

// Subvenciones que no se pueden solicitar: nominativas, directas, convenios con una entidad concreta...
export const RUIDO = /nominativ|subvenciones directas|funcionamiento y actividades de la |izendun|a favor d|convenio|hitzarmen|concesi[oó]n directa|subvenci[oó]n (foral )?directa|subv\.? ?directa|foral directa|se concede|de concesi[oó]n de|aprobar (un|el) gasto|aportaci[oó]n (econ[oó]mica )?(a|al|para) |transferencia|adenda|addenda|excepcional|en especie|reintegro|justificaci[oó]n/i;

// "Decreto Foral 73/2026, de 23 de julio, ..., por el que se aprueban las bases reguladoras y la convocatoria de subvenciones para X" -> "Subvenciones para X"
export function limpiaTitulo(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(?:decreto foral|orden foral|orden|resoluci[oó]n|acuerdo|extracto)\b.{0,220}?\b(?:por (?:el|la) que |que )(?:se )?(?:aprueban?|convocan?|regulan?|establecen?)(?: las bases reguladoras)?(?: y (?:se )?(?:convocan?|(?:la |las )?convocatorias?))?(?: (?:del|para el) (?:a[nñ]o|ejercicio) \d{4})?(?: de| del| para)?\s+(.{8,})$/i);
  if (m) s = m[1];
  s = s.replace(/^(?:la |las |el |los )/i, '').replace(/[.;]\s*$/, '');
  return frase(s.charAt(0).toUpperCase() + s.slice(1));
}

function ddmmyyyy(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : v.descripcion || v.description || v.nombre || '');
const lista = (v) => (Array.isArray(v) ? v.map(txt).filter(Boolean) : v ? [txt(v)].filter(Boolean) : []);

function paraBDNS(benef) {
  const out = new Set();
  for (const d of benef) {
    const n = norm(d);
    if (/fisicas que no desarrollan/.test(n)) out.add('particular');
    if (/fisicas que desarrollan|pyme y personas fisicas/.test(n)) { out.add('autonomo'); out.add('empresa'); }
    if (/pyme|gran empresa/.test(n)) out.add('empresa');
    if (/juridicas que no desarrollan|sin animo|asociaci/.test(n)) out.add('asociacion');
  }
  return [...out];
}

export async function recoger(log) {
  const desde = new Date(Date.now() - DIAS_ATRAS * 864e5);
  const indice = [];
  const diag = {};
  let descartadas = 0;
  let vistos = 0;
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await api(`/convocatorias/busqueda?vpd=GE&page=${p}&pageSize=${PAGE_SIZE}&fechaDesde=${encodeURIComponent(ddmmyyyy(desde))}&order=fechaRecepcion&direccion=desc`);
    const content = r.content || [];
    vistos += content.length;
    for (const it of content) {
      const amb = clasifica(it.nivel1, it.nivel2, it.nivel3);
      if (amb && !RUIDO.test(it.descripcion || '')) indice.push({ it, amb });
      else if (amb) descartadas++;
      const txt2 = norm(`${it.nivel2} ${it.nivel3}`);
      if (/vasco|euskadi|eusko|gipuzk|guipuz|bizkai|vizcay|araba|alava|foral|foru/.test(txt2)) {
        const k = `${it.nivel1} | ${it.nivel2} | ${amb ? amb.nivel : 'NO CLASIFICADA'}`;
        diag[k] = (diag[k] || 0) + 1;
      }
    }
    if (!content.length || r.last === true || content.length < PAGE_SIZE) break;
  }
  log(`BDNS: ${vistos} convocatorias revisadas, ${indice.length} de Euskadi (${descartadas} descartadas por no ser solicitables)`);
  for (const [k, n] of Object.entries(diag).sort((a, b) => b[1] - a[1]).slice(0, 40)) log(`  diag ${n} · ${k}`);

  const det = await enParalelo(indice, 3, ({ it }) => api(`/convocatorias?vpd=GE&numConv=${it.numeroConvocatoria}`));
  return indice.map(({ it, amb }, k) => {
    let d = det[k] || {};
    if (Array.isArray(d)) d = d[0] || {};
    if (d.content && Array.isArray(d.content)) d = d.content[0] || {};
    const num = String(it.numeroConvocatoria);
    const titulo = limpiaTitulo(it.descripcion || d.descripcion || '');
    const benef = lista(d.tiposBeneficiarios);
    const finalidad = txt(d.descripcionFinalidad);
    const url = `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${num}`;
    const organismo = frase(it.nivel3 || it.nivel2 || '');
    return {
      id: 'bdns-' + num,
      bdns: num,
      titulo,
      tituloEu: it.descripcionLeng ? frase(it.descripcionLeng) : '',
      organismo,
      ambito: amb,
      inicio: iso(d.fechaInicioSolicitud),
      fin: iso(d.fechaFinSolicitud),
      textoPlazo: [d.textInicio, d.textFin].filter(Boolean).join(' · '),
      abiertoSegunFuente: d.abierto === true || d.abierto === 'true' || d.abierto === 'S',
      registrada: iso(it.fechaRecepcion),
      presupuesto: d.presupuestoTotal != null ? Number(d.presupuestoTotal) || null : null,
      cuantia: '',
      resumen: finalidad ? `Finalidad: ${finalidad}` : '',
      dirigido: benef.join('\n'),
      para: [...new Set([...paraBDNS(benef), ...paraDeTexto(titulo)])],
      temas: temasDe(titulo + ' ' + finalidad),
      url: d.sedeElectronica || url,
      bases: d.urlBasesReguladoras || '',
      fuentes: [{ nombre: 'BDNS', url }],
      errorFicha: det[k] && det[k].error ? det[k].error : undefined,
    };
  });
}
