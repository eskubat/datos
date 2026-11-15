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
export const RUIDO = /nominativ|se resuelven?\b|resoluci[oó]n de (la )?concesi|desiert|subvenciones directas|funcionamiento y actividades de la |izendun|a favor d|convenio|hitzarmen|concesi[oó]n directa|subvenci[oó]n (foral )?directa|subv\.? ?directa|foral directa|se concede|de concesi[oó]n de|aprobar (un|el) gasto|aportaci[oó]n (econ[oó]mica )?(a|al|para) |transferencia|adenda|addenda|excepcional|en especie|reintegro|justificaci[oó]n/i;

// "Decreto Foral 73/2026, de 23 de julio, ..., por el que se aprueban las bases reguladoras y la convocatoria de subvenciones para X" -> "Subvenciones para X"
export function limpiaTitulo(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(?:decreto foral|orden foral|orden|resoluci[oó]n|acuerdo|extracto)\b.{0,220}?\b(?:por (?:el|la) que |que )(?:se )?(?:aprueban?|convocan?|regulan?|establecen?)(?: las bases reguladoras)?(?: y (?:se )?(?:convocan?|(?:la |las )?convocatorias?))?(?: (?:del|para el) (?:a[nñ]o|ejercicio) \d{4})?(?: de| del| para)?\s+(.{8,})$/i);
  if (m) s = m[1];
  s = s.replace(/^(?:la |las |el |los )/i, '').replace(/[.;]\s*$/, '');
  return frase(s.charAt(0).toUpperCase() + s.slice(1));
}

// ---------- Extracto publicado en el boletín (viene dentro del detalle de la BDNS) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', ordm: 'º', ordf: 'ª', euro: '€' };
function htmlATexto(h) {
  return String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m)
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
const SECCIONES = [
  ['objeto', /^(?:\w+[.:-]\s*)?(objeto|finalidad|descripci[oó]n del objeto)\b.{0,40}$/i],
  ['beneficiarios', /^(?:\w+[.:-]\s*)?(beneficiari|personas beneficiarias|destinatari|qui[eé]n puede)\S*.{0,60}$/i],
  ['requisitos', /^(?:\w+[.:-]\s*)?requisitos\b.{0,60}$/i],
  ['cuantia', /^(?:\w+[.:-]\s*)?(cuant[ií]a|importe|dotaci[oó]n|cr[eé]dito|financiaci[oó]n)\b.{0,60}$/i],
  ['plazo', /^(?:\w+[.:-]\s*)?(plazo|lugar y plazo|presentaci[oó]n de solicitudes)\b.{0,80}$/i],
  ['otros', /^(?:\w+[.:-]\s*)?(bases reguladoras|otros datos|criterios|documentaci[oó]n|forma de pago|r[eé]gimen|procedimiento|resoluci[oó]n|justificaci[oó]n|compatibilidad|descripci[oó]n)\b.{0,60}$/i],
];
export function partesExtracto(texto) {
  const out = { objeto: [], beneficiarios: [], requisitos: [], cuantia: [], plazo: [], otros: [] };
  let actual = 'otros';
  for (const l of texto.split('\n')) {
    const sec = l.length < 90 ? SECCIONES.find(([, re]) => re.test(l)) : null;
    if (sec) { actual = sec[0]; continue; }
    out[actual].push(l);
  }
  return out;
}

// ---------- Plazo calculado ("5 días hábiles desde el día siguiente a la publicación") ----------
const FESTIVOS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];
const habil = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !FESTIVOS.includes(d.toISOString().slice(5, 10));
export function calculaFin(textoPlazo, publicacion) {
  if (!publicacion) return null;
  const t = norm(textoPlazo);
  const ini = new Date(publicacion + 'T00:00:00Z');
  ini.setUTCDate(ini.getUTCDate() + 1); // día siguiente a la publicación
  let m = t.match(/(\d+|un|una|dos|tres|quince|diez|veinte|treinta)\s+(dias?|mes(?:es)?|semanas?)\s*(habiles|naturales)?/);
  if (!m || !/public/.test(t)) return null;
  const NUM = { un: 1, una: 1, dos: 2, tres: 3, diez: 10, quince: 15, veinte: 20, treinta: 30 };
  const n = Number(m[1]) || NUM[m[1]];
  if (!n || n > 120) return null;
  const d = new Date(ini);
  if (/^mes/.test(m[2])) { d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(d.getUTCDate() - 1); }
  else if (/^semana/.test(m[2])) d.setUTCDate(d.getUTCDate() + 7 * n - 1);
  else if (m[3] === 'habiles' || !m[3]) { let k = habil(d) ? 1 : 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (habil(d)) k++; } }
  else d.setUTCDate(d.getUTCDate() + n - 1);
  // Si el último día es inhábil, pasa al siguiente hábil
  while (!habil(d)) d.setUTCDate(d.getUTCDate() + 1);
  return { inicio: ini.toISOString().slice(0, 10), fin: d.toISOString().slice(0, 10) };
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
    // Extracto del boletín: objeto, beneficiarios, cuantía y plazo; y fecha de publicación para calcular el cierre
    const anuncio = (d.anuncios || [])[0] || {};
    const extracto = htmlATexto(anuncio.texto || '');
    const partes = extracto ? partesExtracto(extracto) : null;
    const pubClave = Object.keys(anuncio).find((k) => /public/i.test(k) && /\d{4}-\d{2}-\d{2}/.test(String(anuncio[k])));
    const publicacion = (pubClave && String(anuncio[pubClave]).slice(0, 10)) || ((String(anuncio.url || '').match(/(20\d\d)\/(\d{2})\/(\d{2})/) || []).slice(1).join('-') || null);
    let inicioCalc = null, finCalc = null;
    if (!d.fechaFinSolicitud) {
      const c = calculaFin([d.textFin, partes ? partes.plazo.join(' ') : ''].join(' '), publicacion);
      if (c) { inicioCalc = d.fechaInicioSolicitud ? null : c.inicio; finCalc = c.fin; }
    }
    const lineasReq = partes ? [...partes.beneficiarios, ...partes.requisitos].filter((l) => /^[-•·]|^[a-z]\)|^\d+[.)]\s/.test(l)).map((l) => l.replace(/^(?:[-•·]|[a-z]\)|\d+[.)])\s*/, '')) : [];
    const benefTxt = partes ? partes.beneficiarios.filter((l) => !/^[-•·]|^[a-z]\)|^\d+[.)]\s/.test(l)) : [];
    const cuantiaTxt = partes ? partes.cuantia.filter((l) => !/dotaci[oó]n presupuestaria|aplicaci[oó]n presupuestaria|partida|cr[eé]dito (total|presupuestario)/i.test(l)) : [];
    return {
      id: 'bdns-' + num,
      bdns: num,
      titulo,
      tituloEu: it.descripcionLeng ? frase(it.descripcionLeng) : '',
      organismo,
      ambito: amb,
      inicio: iso(d.fechaInicioSolicitud) || inicioCalc,
      fin: iso(d.fechaFinSolicitud) || finCalc,
      finCalculado: !!finCalc,
      publicacion,
      boletin: anuncio.url || '',
      textoPlazo: [d.textInicio, d.textFin].filter(Boolean).join(' · '),
      abiertoSegunFuente: d.abierto === true || d.abierto === 'true' || d.abierto === 'S',
      registrada: iso(it.fechaRecepcion),
      presupuesto: d.presupuestoTotal != null ? Number(d.presupuestoTotal) || null : null,
      cuantia: cuantiaTxt.join('\n'),
      resumen: partes && partes.objeto.length ? partes.objeto.slice(0, 4).join('\n') : (finalidad ? `Finalidad: ${finalidad}` : ''),
      dirigido: [...benef, ...benefTxt.filter((l) => l.length < 200)].join('\n'),
      requisitos: lineasReq.slice(0, 10),
      para: [...new Set([...paraBDNS(benef), ...paraDeTexto(titulo)])],
      temas: temasDe(titulo + ' ' + finalidad),
      url: d.sedeElectronica || url,
      bases: String(d.urlBasesReguladoras || '').replace(/\s+/g, ''),
      fuentes: [{ nombre: 'BDNS', url }],
      _docs: (d.documentos || []).filter((x) => /espa[nñ]ol|castellano/i.test(x.descripcion || '') || (d.documentos || []).length === 1).map((x) => x.id).slice(0, 2),
      _texto: [
        extracto ? 'Extracto publicado en el boletín:\n' + extracto : '',
        'Título: ' + (it.descripcion || ''),
        it.descripcionLeng ? 'Título en euskera: ' + it.descripcionLeng : '',
        'Organismo: ' + [it.nivel2, it.nivel3].filter(Boolean).join(' · '),
        finalidad ? 'Finalidad: ' + finalidad : '',
        benef.length ? 'Beneficiarios: ' + benef.join('; ') : '',
        d.textInicio ? 'Inicio del plazo: ' + d.textInicio : '',
        d.textFin ? 'Fin del plazo: ' + d.textFin : '',
        d.presupuestoTotal ? 'Presupuesto total de la convocatoria: ' + d.presupuestoTotal + ' euros' : '',
        lista(d.sectores).length ? 'Sectores: ' + lista(d.sectores).join('; ') : '',
        lista(d.instrumentos).length ? 'Instrumento: ' + lista(d.instrumentos).join('; ') : '',
      ].filter(Boolean).join('\n'),
      errorFicha: det[k] && det[k].error ? det[k].error : undefined,
    };
  });
}
