// Fichas categorizadas por la tarea programada de Claude según docs/CATEGORIZACION.md,
// comprobadas con las reglas de la sección 11 y contra la documentación oficial.
// - Fechas, plazo, ámbito y enlaces NO se tocan: salen de los datos estructurados.
// - Toda cifra escrita tiene que aparecer en la documentación.
// - Caché por huella del texto: solo se vuelve a categorizar si la documentación cambia.
import crypto from 'node:crypto';
import { POR_ID } from './organismos.js';

const VERSION = 'v3';
const TIPOS = ['particular', 'autonomo', 'empresa', 'asociacion', 'ayuntamiento'];
export const huella = (t) => crypto.createHash('sha1').update(VERSION + ':' + String(t || '')).digest('hex').slice(0, 16);

// ---------- Patrones de la sección 11 ----------
export const RE = {
  cifrasEconomicas: /\d[\d.,]*\s*(€|euros?)|\d+([.,]\d+)?\s*%|\bhasta\s+\d|cuant[ií]a|importe/i,
  condiciones: /requisit|empadronad|menores de|mayores de|años de edad|ingresos|\brenta\b|dirigid[ao]s? a|podr[aá]n solicitar|beneficiari/i,
  presupuestoTotal: /presupuesto|dotaci[oó]n|cr[eé]dito disponible|\bfondos?\b|importe total de la convocatoria/i,
  tipoAyuda: /^(subvenci[oó]n|subvenciones|pr[eé]stamos?|becas?|bonificaci[oó]n|bonificaciones|deducci[oó]n|deducciones|ayudas?|servicios?|premios?|asesoramiento|programa|bonos?|incentivos?|prestaci[oó]n|prestaciones|financiaci[oó]n|aval(es)?|reembolsos?|devoluci[oó]n|exenci[oó]n|descuentos?)\b/i,
  cuantiaValida: /\d[\d.,]*\s*(€|%)|^(importe variable|ayuda no econ[oó]mica|no especificado)/i,
  noRequisito: /documentaci[oó]n|aportar|presentar la solicitud|sede electr[oó]nica|plazo|justificar|mantener (la|el|los|las)|publicidad/i,
  infinitivo: /^(no\s|[a-záéíóúñ]+(ar|er|ir)(se|lo|la|los|las)?\b)/i,
  mayusculas: /\b[A-ZÁÉÍÓÚÑ]{5,}\b/g,
  cifraMal: /\b\d{4,}\s*€|\d€|\d%/,
};
const SIGLAS = new Set(['IKERTALENT', 'ONEKIN', 'HEZIBI', 'GAUZATU', 'MOVES', 'PERTE', 'FEDER', 'FEADER', 'FEMPA', 'LEADER', 'COVID', 'TXEKINBERRI', 'BOTHA', 'LGTBI', 'BERCS', 'IKERBASQUE']);

// Números de un texto, normalizados ("1.500" -> "1500", "25,5" -> "25.5")
function numeros(t) {
  return [...String(t || '').matchAll(/\d[\d.]*(?:,\d+)?/g)]
    .map((m) => m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/\.$/, ''))
    .filter((n) => n.replace(/\D/g, '').length >= 1);
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

// Comprueba una ficha (sección 11). Devuelve la lista de errores (vacía = correcta).
export function comprobar(r, fuente = '') {
  const e = [];
  const nums = new Set(numeros(fuente));
  const consiste = String(r.en_que_consiste || '');
  if (!consiste) e.push('en_que_consiste vacío');
  if (RE.cifrasEconomicas.test(consiste)) e.push('has incluido cifras económicas en en_que_consiste');
  if (RE.condiciones.test(consiste)) e.push('has incluido colectivos o condiciones en en_que_consiste');
  if (consiste && !RE.tipoAyuda.test(consiste)) e.push('en_que_consiste debe empezar por el tipo de ayuda');
  if (consiste.length > 400) e.push('en_que_consiste supera 400 caracteres');
  if (/\n/.test(consiste.trim())) e.push('en_que_consiste debe ser un solo párrafo narrativo, sin saltos de línea ni listas');
  const frases = consiste.split(/(?<=[.!])\s+/).filter((f) => f.trim());
  if (consiste && (frases.length < 2 || consiste.length < 120)) e.push('en_que_consiste debe explicar la ayuda en 2-4 frases completas y bien hiladas (estilo narrativo)');
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
    }
  }
  if (quien.length === 1 && req.some((g) => g.grupo)) e.push('con un solo tipo de solicitante, requisitos lleva un único grupo sin nombre');
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
  const id = r.quien_convoca && r.quien_convoca.organismo_id;
  if (!id) e.push('falta quien_convoca.organismo_id');
  else if (!POR_ID[id]) e.push(`organismo_id «${id}» no existe en la tabla maestra (cache/organismos.json)`);
  return [...new Set(e)];
}

// Normaliza y valida una ficha: lo que no cumple se descarta campo a campo
export function validar(r, fuente) {
  const nums = new Set(numeros(fuente));
  const ok = (t) => cifrasOk(t, nums);
  const out = { errores: comprobar(r, fuente) };
  const tit = (x) => { const t = limpia(x); return t && t.length <= 140 && ok(t) && t !== t.toUpperCase() ? mayus(t) : ''; };
  const consiste = (x) => { const t = formato(x); return t && ok(t) && !RE.cifrasEconomicas.test(t) && !RE.condiciones.test(t) && t.length <= 450 ? conPunto(mayus(t)) : ''; };
  const cuanto = (x) => String(x || '').split(/\n+/).map(formato).filter((l) => l && ok(l) && !RE.presupuestoTotal.test(l)).map((l) => conPunto(mayus(l)));
  const quien = (v) => (Array.isArray(v) ? v : []).map((q) => ({ tipo: limpia(q && q.tipo).replace(/[:.]$/, ''), texto: conPunto(mayus(formato(q && q.texto))) })).filter((q) => q.texto && ok(q.texto) && q.texto.length <= 300).slice(0, 8);
  const reqs = (v, eu) => (Array.isArray(v) ? v : []).map((g) => ({
    grupo: limpia(g && g.grupo).replace(/[:.]$/, ''),
    requisitos: (Array.isArray(g && g.requisitos) ? g.requisitos : []).map(formato).filter((x) => x && ok(x) && (eu || !RE.noRequisito.test(x))).map((x) => conPunto(mayus(x))).slice(0, 8),
  })).filter((g) => g.requisitos.length);
  for (const sfx of ['', '_eu']) {
    out['titulo' + sfx] = tit(r['titulo' + sfx]);
    out['cuanto_puede_recibir' + sfx] = cuanto(r['cuanto_puede_recibir' + sfx]);
    out['quien_puede_pedirla' + sfx] = quien(r['quien_puede_pedirla' + sfx]);
    out['requisitos' + sfx] = reqs(r['requisitos' + sfx], !!sfx);
  }
  out.en_que_consiste = consiste(r.en_que_consiste);
  const ce = formato(r.en_que_consiste_eu);
  out.en_que_consiste_eu = ce && ok(ce) ? conPunto(mayus(ce)) : '';
  const id = r.quien_convoca && r.quien_convoca.organismo_id;
  out.organismo_id = id && POR_ID[id] ? id : '';
  out.tipos = (Array.isArray(r.tipos) ? r.tipos : []).filter((x) => TIPOS.includes(x));
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

// Aplica las fichas válidas a las ayudas publicadas
export function aplicar(ayudas, fuentes, cache) {
  let n = 0;
  for (const a of ayudas) {
    const c = cache[a.id];
    if (!c || !fuentes[a.id] || c.h !== huella(fuentes[a.id])) continue;
    const r = c.r;
    if (!r.quien_puede_pedirla) continue; // fichas de versiones anteriores
    if (r.titulo) { if (!a.tituloOficial) a.tituloOficial = a.titulo; a.titulo = r.titulo; }
    if (r.en_que_consiste) a.resumen = r.en_que_consiste;
    if (r.cuanto_puede_recibir.length) a.cuantia = r.cuanto_puede_recibir.join('\n');
    if (r.quien_puede_pedirla.length) a.dirigido = lineasQuien(r.quien_puede_pedirla).join('\n');
    a.requisitos = lineasReq(r.requisitos);
    a.requisitosGenerales = true;
    if (r.tipos.length) a.para = r.tipos;
    if (r.organismo_id && POR_ID[r.organismo_id]) {
      const o = POR_ID[r.organismo_id];
      Object.assign(a, { organismoId: o.id, organismo: o.corto, organismoCompleto: o.completo, organismoEu: o.eu });
      delete a.revisarOrganismo;
    }
    if (r.revision) a.revisar = r.revision; else delete a.revisar;
    const cifras = [...(a.cuantia || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*€/g)].map((m) => Number(m[1].replace(/\./g, ''))).filter((x) => x >= 50 && x < 5e6);
    a.importeMax = cifras.length ? Math.max(...cifras) : null;
    if (r.titulo_eu || r.en_que_consiste_eu) {
      a.eu = { titulo: r.titulo_eu || '', resumen: r.en_que_consiste_eu || '', cuantia: r.cuanto_puede_recibir_eu.join('\n'), dirigido: lineasQuien(r.quien_puede_pedirla_eu).join('\n'), requisitos: lineasReq(r.requisitos_eu.map((g) => ({ ...g, grupo: g.grupo === 'Todos' ? 'Guztiak' : g.grupo }))) };
    }
    a.resumenIA = true;
    n++;
  }
  return n;
}
