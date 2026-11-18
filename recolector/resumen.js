// Fichas categorizadas por la tarea programada de Claude según docs/CATEGORIZACION.md,
// comprobadas con las reglas de la sección 11 y contra la documentación oficial.
// - Fechas, plazo, ámbito y enlaces NO se tocan: salen de los datos estructurados.
// - Toda cifra escrita tiene que aparecer en la documentación.
// - Caché por huella del texto: solo se vuelve a categorizar si la documentación cambia.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { POR_ID } from './organismos.js';
import { NO_ES_REQUISITO } from './comun.js';
import { sinDocsCopiados, sinCabeceras, variantesSinDocsSecundarios } from './textos.js';

const VERSION = 'v4';
const TIPOS = ['particular', 'autonomo', 'empresa', 'asociacion', 'ayuntamiento'];
export const huella = (t) => crypto.createHash('sha1').update(VERSION + ':' + String(t || '')).digest('hex').slice(0, 16);
// Huella estable (se guarda como «he» junto a «h»): sin los documentos de docs_extra ya copiados en
// textos_claude y sin las líneas «### …: url». Solo cambia si cambia el contenido que leyó la ficha.
export const huellaEstable = (id, t) => huella('estable:' + sinCabeceras(sinDocsCopiados(id, t)));
// ¿La ficha guardada sigue valiendo para el texto actual? Vale si coincide la huella del texto, la del texto sin
// los documentos de docs_extra ya copiados (fichas hechas antes de que el recolector los descargara) o la
// estable. «invalida» es la huella de una ficha que el responsable mandó rehacer (ajustes_ayudas.huellaFicha).
export function fichaVigente(c, id, t, invalida = '') {
  if (!c || !t) return false;
  if (invalida && c.h === invalida) return false;
  if (c.h === huella(t) || c.h === huella(sinDocsCopiados(id, t)) || (!!c.he && c.he === huellaEstable(id, t))) return true;
  // BDNS: la ficha sigue valiendo si el texto solo ha ganado la traducción de un documento o un formulario
  if (!String(id).startsWith('bdns-')) return false;
  return variantesSinDocsSecundarios(t).some((v) => c.h === huella(v) || (!!c.he && c.he === huellaEstable(id, v)));
}

// ---------- Patrones de la sección 11 ----------
export const RE = {
  cifrasEconomicas: /\d[\d.,]*\s*(€|euros?)|\d+([.,]\d+)?\s*%|\bhasta\s+\d|cuant[ií]a|importe/i,
  condiciones: /requisit|empadronad|menores de|mayores de|años de edad|ingresos|\brenta\b|dirigid[ao]s? a|podr[aá]n solicitar|beneficiari/i,
  // Presupuesto de la convocatoria (no el del proyecto o la entidad solicitante: «20 % del presupuesto ordinario» es válido)
  presupuestoTotal: /^\s*presupuesto\s*[:(]|(?:^|\b(?:el|un|su)\s+)presupuesto\s+(?:es|asciende|ser[aá]|de\s+\d)|presupuesto\s+(?:total|global|m[aá]ximo|disponible|destinado|asignado|previsto)\b(?!\s+(?:del|de\s+la|de\s+los|de\s+las|de\s+cada|por)\s+(?!convocatoria|l[ií]nea|programa\s+de\s+ayudas))|presupuesto\s+de\s+(?:la|esta)\s+(?:convocatoria|l[ií]nea)|dotaci[oó]n|cr[eé]dito disponible|\bfondos?\b|importe total de la convocatoria/i,
  tipoAyuda: /^(subvenci[oó]n|subvenciones|pr[eé]stamos?|becas?|bonificaci[oó]n|bonificaciones|deducci[oó]n|deducciones|ayudas?|servicios?|premios?|asesoramiento|programa|bonos?|incentivos?|prestaci[oó]n|prestaciones|financiaci[oó]n|aval(es)?|reembolsos?|devoluci[oó]n|exenci[oó]n|descuentos?)\b/i,
  cuantiaValida: /\d[\d.,]*\s*(€|%)|^(importe variable|ayuda no econ[oó]mica|no especificado)/i,
  noRequisito: /documentaci[oó]n|aportar|presentar la solicitud|sede electr[oó]nica|plazo|justificar|mantener (la|el|los|las)|publicidad/i,
  infinitivo: /^(no\s|[a-záéíóúñ]+(ar|er|ir)(se|lo|la|los|las)?\b)/i,
  mayusculas: /\b[A-ZÁÉÍÓÚÑ]{5,}\b/g,
  cifraMal: /\b\d{4,}\s*€|\d€|\d%/,
};
const SIGLAS = new Set(['IKERTALENT', 'ONEKIN', 'HEZIBI', 'GAUZATU', 'MOVES', 'PERTE', 'FEDER', 'FEADER', 'FEMPA', 'LEADER', 'COVID', 'TXEKINBERRI', 'BOTHA', 'LGTBI', 'LGTBIQ', 'BERCS', 'IKERBASQUE', 'IPREM', 'NAFEM', 'AFEHC', 'AFYDAD', 'SEBIME', 'MUFACE', 'MUGEJU', 'ISFAS', 'EKINN', 'IELTS', 'TOEFL']);

// Números de un texto, normalizados ("1.500" -> "1500", "25,5" -> "25.5")
function numeros(t) {
  return [...String(t || '').matchAll(/\d[\d.]*(?:,\d+)?/g)]
    .map((m) => m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/\.$/, ''))
    .filter((n) => n.replace(/\D/g, '').length >= 1);
}
// Números de la documentación oficial: además de los de numeros(), una coma seguida de exactamente 3 dígitos
// (sin más dígitos detrás) cuenta también como separador de miles, como en las fuentes en inglés
// («27,000 EUR», «€ 60,000,», «1,250,000.00»): se añade la lectura sin comas para que «27.000 €» de la ficha cuadre.
function numerosFuente(t) {
  const s = String(t || '');
  const miles = [...s.matchAll(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d|,\d)/g)]
    .map((m) => m[0].replace(/,/g, '').replace(/\.0+$/, '').replace(/\.$/, ''));
  // «€30k», «up to €40K», «30k€», «€1.5M», «2m EUR»: k = × 1.000 y m = × 1.000.000, solo junto al símbolo o la palabra del euro
  const multip = (n, u) => String(Math.round(parseFloat(n.replace(',', '.')) * (/k/i.test(u) ? 1e3 : 1e6)));
  const kM = [
    ...[...s.matchAll(/(?:€|\bEUR|\beuros?)\s?(\d+(?:[.,]\d+)?)\s?([kKmM])\b/g)].map((m) => multip(m[1], m[2])),
    ...[...s.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s?([kKmM])\s?(?:€|EUR\b|euros?\b)/g)].map((m) => multip(m[1], m[2])),
  ];
  return [...numeros(s), ...miles, ...kM];
}
const cifrasOk = (frase, nums) => numeros(frase).every((n) => n.length < 2 || nums.has(n));
const limpia = (x) => String(x || '').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
// Formato de cifras: «3.000 €», «50 %»
export function formato(t) {
  return limpia(t)
    .replace(/(\d)\s*(€|%)/g, '$1 $2')
    .replace(/(\d)\s+euros?\b/gi, '$1 €')
    .replace(/\b(\d{4,})(?=(,\d+)? €)/g, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
}
const conPunto = (t) => (t && !/[.!?…:]$/.test(t) ? t + '.' : t);
const mayus = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// Comprueba UNA versión (la de un tipo de solicitante) con las reglas de la sección 11
function comprobarVersion(r, fuente = '') {
  const e = [];
  const nums = new Set(numerosFuente(fuente));
  const consiste = String(r.en_que_consiste || '');
  if (!consiste) e.push('en_que_consiste vacío');
  if (RE.cifrasEconomicas.test(consiste)) e.push('has incluido cifras económicas en en_que_consiste');
  if (RE.condiciones.test(consiste)) e.push('has incluido colectivos o condiciones en en_que_consiste');
  if (consiste && !RE.tipoAyuda.test(consiste)) e.push('en_que_consiste debe empezar por el tipo de ayuda');
  if (/\n/.test(consiste.trim())) e.push('en_que_consiste debe ser un solo párrafo narrativo, sin saltos de línea ni listas');
  const frases = consiste.split(/(?<=[.!])\s+/).filter((f) => f.trim());
  if (consiste && (frases.length < 2 || consiste.length < 120)) e.push('en_que_consiste debe explicar la ayuda en varias frases completas y bien hiladas (estilo narrativo)');
  if (frases.some((f) => !/[.!]$/.test(f.trim()) || f.trim().split(/\s+/).length < 5)) e.push('en_que_consiste tiene frases sueltas o sin terminar: redáctalo como un párrafo con frases completas');
  const cuanto = String(r.cuanto_puede_recibir || '');
  if (!RE.cuantiaValida.test(cuanto)) e.push('cuanto_puede_recibir debe tener una cifra con € o %, o empezar por «Importe variable», «Ayuda no económica» o «No especificado»');
  if (RE.presupuestoTotal.test(cuanto)) e.push('el presupuesto total no se muestra, solo lo que recibe cada solicitante');
  const quien = Array.isArray(r.quien_puede_pedirla) ? r.quien_puede_pedirla : [];
  if (!quien.length) e.push('quien_puede_pedirla vacío');
  if (quien.length === 1 && String(quien[0].texto || '').length > 250) e.push('quien_puede_pedirla supera 250 caracteres');
  if (quien.length > 1) {
    if (quien.some((q) => String(q.texto || '').length > 200)) e.push('cada tipo de quien_puede_pedirla debe tener ≤ 200 caracteres');
    if (new Set(quien.map((q) => q.tipo)).size !== quien.length) e.push('tipos repetidos en quien_puede_pedirla');
  }
  const tipos = new Set(quien.map((q) => q.tipo));
  const req = Array.isArray(r.requisitos) ? r.requisitos : [];
  const vistos = new Set();
  for (const g of req) {
    if (quien.length > 1 && g.grupo && g.grupo !== 'Todos' && !tipos.has(g.grupo)) e.push(`el grupo de requisitos «${g.grupo}» no coincide con ningún tipo de quien_puede_pedirla`);
    const xs = Array.isArray(g.requisitos) ? g.requisitos : [];
    if (xs.length > 8) e.push(`más de 8 requisitos en el grupo «${g.grupo || '(único)'}»`);
    for (const x of xs) {
      const k = limpia(x).toLowerCase();
      if (vistos.has(k)) e.push(`requisito repetido: «${x}»`);
      vistos.add(k);
      if (!RE.infinitivo.test(limpia(x))) e.push(`el requisito debe empezar por un infinitivo o por «No»: «${x}»`);
      if (RE.noRequisito.test(x)) e.push(`documentación, plazos u obligaciones posteriores en requisitos: «${x}»`);
      if (NO_ES_REQUISITO.test(x)) e.push(`cómputo de ingresos o compatibilidad con otras ayudas en requisitos (descartar): «${x}»`);
      if (/:\s*$/.test(limpia(x))) e.push(`requisito que introduce una lista: redáctalo como una sola condición completa: «${x}»`);
    }
  }
  if (quien.length === 1 && req.some((g) => g.grupo)) e.push('con un solo colectivo, requisitos lleva un único grupo sin nombre');
  // Cifras duplicadas entre campos
  const cifrasDe = (t) => new Set(numeros(t).filter((n) => n.length >= 2));
  const qTxt = quien.map((q) => q.texto).join(' '), rTxt = req.flatMap((g) => g.requisitos || []).join(' ');
  const enReq = cifrasDe(rTxt);
  for (const n of cifrasDe(qTxt)) if (enReq.has(n)) e.push(`dato de perfil repetido en requisitos (cifra ${n})`);
  const euros = (t) => new Set([...String(t).matchAll(/(\d[\d.,]*)\s*€/g)].map((m) => m[1]));
  const vistosE = new Map();
  [consiste, cuanto, qTxt, rTxt].forEach((c, i) => euros(c).forEach((x) => { if (vistosE.has(x) && vistosE.get(x) !== i) e.push(`dato duplicado: ${x} € aparece en dos campos`); vistosE.set(x, i); }));
  // Cifras que no están en la documentación
  for (const [k, t] of [['en_que_consiste', consiste], ['cuanto_puede_recibir', cuanto], ['quien_puede_pedirla', qTxt], ['requisitos', rTxt]]) {
    if (fuente && !cifrasOk(t, nums)) e.push(`${k} tiene cifras que no aparecen en la documentación`);
  }
  // Ortografía básica
  const todo = [r.titulo, consiste, cuanto, qTxt, rTxt].join(' ');
  const may = (todo.match(RE.mayusculas) || []).filter((w) => !SIGLAS.has(w));
  if (may.length) e.push(`palabras en mayúsculas: ${[...new Set(may)].join(', ')}`);
  if (/[¿?]/.test(todo)) e.push('no puede haber preguntas: las preguntas son los títulos de sección, el texto responde');
  if (/\((pdf|docx?|xlsx?)\b|\b\d+\s*(kb|mb)\b|descargar|m[aá]s informaci[oó]n/i.test(todo)) e.push('texto de enlaces o adjuntos (PDF, KB, «Descargar», «Más información») en la ficha');
  if (/\busted\b/i.test(todo)) e.push('no uses «usted»: tono neutro y cercano');
  if (RE.cifraMal.test(todo)) e.push('cifras con formato incorrecto (debe ser «3.000 €» y «50 %»)');
  return [...new Set(e)];
}

// Comprueba una ficha completa: organismo + una versión por tipo de solicitante. Devuelve la lista de errores.
export function comprobar(r, fuente = '') {
  const e = [];
  const id = r.quien_convoca && r.quien_convoca.organismo_id;
  if (!id) e.push('falta quien_convoca.organismo_id');
  else if (!POR_ID[id]) e.push(`organismo_id «${id}» no existe en la tabla maestra (cache/organismos.json)`);
  const vs = r.versiones && typeof r.versiones === 'object' ? r.versiones : {};
  const ks = Object.keys(vs);
  if (!ks.length) e.push('falta «versiones»: una versión completa por cada tipo de solicitante que puede pedir la ayuda');
  for (const k of ks) {
    if (!TIPOS.includes(k)) { e.push(`versión «${k}» no válida: usa particular, autonomo, empresa, asociacion o ayuntamiento`); continue; }
    for (const x of comprobarVersion({ ...vs[k], titulo: r.titulo }, fuente)) e.push(`[${k}] ${x}`);
  }
  const eu = r.versiones_eu && typeof r.versiones_eu === 'object' ? Object.keys(r.versiones_eu) : [];
  const faltan = ks.filter((k) => !eu.includes(k));
  if (faltan.length) e.push(`faltan versiones en euskera: ${faltan.join(', ')}`);
  return [...new Set(e)];
}

// Normaliza y valida una ficha: lo que no cumple se descarta campo a campo
export function validar(r, fuente) {
  const nums = new Set(numerosFuente(fuente));
  const ok = (t) => cifrasOk(t, nums);
  const out = { errores: comprobar(r, fuente) };
  const tit = (x) => { const t = limpia(x); return t && t.length <= 140 && ok(t) && t !== t.toUpperCase() ? mayus(t) : ''; };
  const consiste = (x) => { const t = formato(x); return t && ok(t) && !RE.cifrasEconomicas.test(t) && !RE.condiciones.test(t) && t.length <= 1500 ? conPunto(mayus(t)) : ''; };
  const cuanto = (x) => String(x || '').split(/\n+/).map(formato).filter((l) => l && ok(l) && !RE.presupuestoTotal.test(l)).map((l) => conPunto(mayus(l)));
  const quien = (v) => (Array.isArray(v) ? v : []).map((q) => ({ tipo: limpia(q && q.tipo).replace(/[:.]$/, ''), texto: conPunto(mayus(formato(q && q.texto))) })).filter((q) => q.texto && ok(q.texto) && q.texto.length <= 300).slice(0, 8);
  const reqs = (v, eu) => (Array.isArray(v) ? v : []).map((g) => ({
    grupo: limpia(g && g.grupo).replace(/[:.]$/, ''),
    requisitos: (Array.isArray(g && g.requisitos) ? g.requisitos : []).map(formato).filter((x) => x && ok(x) && !/:\s*$/.test(x) && (eu || (!RE.noRequisito.test(x) && !NO_ES_REQUISITO.test(x)))).map((x) => conPunto(mayus(x))).slice(0, 8),
  })).filter((g) => g.requisitos.length);
  const version = (v, eu) => {
    const ce = formato(v && v.en_que_consiste);
    return {
      en_que_consiste: eu ? (ce && ok(ce) ? conPunto(mayus(ce)) : '') : consiste(v && v.en_que_consiste),
      cuanto_puede_recibir: cuanto(v && v.cuanto_puede_recibir),
      quien_puede_pedirla: quien(v && v.quien_puede_pedirla),
      requisitos: reqs(v && v.requisitos, eu),
    };
  };
  const versiones = (vs, eu) => Object.fromEntries(Object.entries(vs && typeof vs === 'object' ? vs : {}).filter(([k]) => TIPOS.includes(k)).map(([k, v]) => [k, version(v, eu)]));
  out.titulo = tit(r.titulo);
  out.titulo_eu = tit(r.titulo_eu);
  out.versiones = versiones(r.versiones, false);
  out.versiones_eu = versiones(r.versiones_eu, true);
  const id = r.quien_convoca && r.quien_convoca.organismo_id;
  out.organismo_id = id && POR_ID[id] ? id : '';
  out.tipos = Object.keys(out.versiones);
  out.datos = Array.isArray(r.datos) ? r.datos.slice(0, 200) : [];
  const motivos = [];
  if (r.revision_manual && r.revision_manual.necesaria) motivos.push(String(r.revision_manual.motivo || 'sin motivo'));
  if (id && !out.organismo_id) motivos.push('organismo no está en la tabla maestra: ' + ((r.quien_convoca && r.quien_convoca.texto_fuente) || id));
  if (out.errores.length) motivos.push('comprobaciones: ' + out.errores.join(' | '));
  out.revision = motivos.join('; ');
  return out;
}

// Grupos y tipos -> líneas para la app. Los subtítulos de grupo van con "## "
const lineasQuien = (qs) => (qs.length === 1 ? [qs[0].texto] : qs.map((q) => (q.tipo ? `${q.tipo}: ${q.texto.charAt(0).toLowerCase()}${q.texto.slice(1)}` : q.texto)));
const lineasReq = (gs) => (gs.length === 1 && !gs[0].grupo ? gs[0].requisitos : gs.flatMap((g) => [...(g.grupo ? ['## ' + g.grupo] : []), ...g.requisitos]));

// Versión validada -> campos que usa la app
const aCampos = (v, todos) => ({
  resumen: v.en_que_consiste || '',
  cuantia: v.cuanto_puede_recibir.join('\n'),
  dirigido: lineasQuien(v.quien_puede_pedirla).join('\n'),
  requisitos: lineasReq(v.requisitos.map((g) => ({ ...g, grupo: g.grupo === 'Todos' ? todos : g.grupo }))),
});

// Aplica las fichas válidas a las ayudas publicadas.
// a.versiones = { particular: {resumen, cuantia, dirigido, requisitos}, empresa: {…} }: la app muestra la del perfil.
// Ayudas muy parecidas a otra: no se publican hasta que el responsable decida (cache/excluidas.json)
function excluidas() { try { return JSON.parse(fs.readFileSync('cache/excluidas.json', 'utf8')); } catch { return {}; } }

export function aplicar(ayudas, fuentes, cache) {
  let n = 0;
  const EXC = excluidas();
  for (const a of ayudas) {
    if (EXC[a.id]) { a.excluida = { parecidaA: EXC[a.id].parecidaA || '', motivo: EXC[a.id].motivo || '' }; delete a.versiones; continue; }
    delete a.excluida;
    const c = cache[a.id];
    if (!fichaVigente(c, a.id, fuentes[a.id])) continue;
    const r = c.r;
    const ks = Object.keys(r.versiones || {}).filter((k) => r.versiones[k].en_que_consiste || r.versiones[k].quien_puede_pedirla.length);
    if (!ks.length) continue;
    if (r.titulo) { if (!a.tituloOficial) a.tituloOficial = a.titulo; a.titulo = r.titulo; }
    a.versiones = Object.fromEntries(ks.map((k) => [k, aCampos(r.versiones[k], 'Todos')]));
    // Sin perfil (y para búsquedas y tarjetas): la primera versión
    Object.assign(a, a.versiones[ks[0]]);
    a.requisitosGenerales = true;
    a.para = ks;
    if (r.organismo_id && POR_ID[r.organismo_id]) {
      const o = POR_ID[r.organismo_id];
      Object.assign(a, { organismoId: o.id, organismo: o.corto, organismoCompleto: o.completo, organismoEu: o.eu });
      if (o.privada) a.privada = true; else delete a.privada;
      delete a.revisarOrganismo;
    }
    if (r.revision) a.revisar = r.revision; else delete a.revisar;
    const todo = ks.map((k) => a.versiones[k].cuantia).join('\n');
    const cifras = [...todo.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*€/g)].map((m) => Number(m[1].replace(/\./g, ''))).filter((x) => x >= 50 && x < 5e6);
    a.importeMax = cifras.length ? Math.max(...cifras) : null;
    const keu = Object.keys(r.versiones_eu || {}).filter((k) => ks.includes(k) && r.versiones_eu[k].en_que_consiste);
    if (r.titulo_eu || keu.length) {
      const veu = Object.fromEntries(keu.map((k) => [k, aCampos(r.versiones_eu[k], 'Guztiak')]));
      a.eu = { titulo: r.titulo_eu || '', versiones: veu, ...(keu.length ? veu[keu[0]] : {}) };
    }
    a.resumenIA = true;
    n++;
  }
  return n;
}
