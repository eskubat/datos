// Recolector de Eskubat: lee todas las fuentes, une duplicados y publica publico/ayudas.json
import fs from 'node:fs';
import path from 'node:path';
import { norm, pedir, enParalelo, paraDeTexto, temasDe, tituloCorto, organismoCorto, ortografia, NO_ES_REQUISITO, ajustaListas } from './comun.js';
import * as euskadi from './euskadi.js';
import * as bdns from './bdns.js';
import * as forales from './forales.js';
import * as boletines from './boletines.js';
import * as prestaciones from './prestaciones.js';
import { claveLinea } from './historico.js';
import { aplicar, huella } from './resumen.js';
import { documentacion } from './enlaces.js';
import { resolver, POR_ID, CATALOGO } from './organismos.js';
import { aplicarTitulos } from './titulos.js';
import { convocatoriasUE, ayudasDirectasUE } from './europa.js';
import { esPosibleNoticia, cotejar, extras, separar } from './noticias.js';
import { prepararProximas, aplicarProximas } from './proximas.js';

const SALIDA = path.resolve('publico');
const FUENTES = [
  { clave: 'euskadi', nombre: 'Gobierno Vasco (Open Data Euskadi y euskadi.eus)', mod: euskadi },
  { clave: 'gipuzkoa', nombre: 'Diputación Foral de Gipuzkoa (sede electrónica)', mod: { recoger: forales.gipuzkoa } },
  { clave: 'araba', nombre: 'Diputación Foral de Álava (ayudas en vigor)', mod: { recoger: forales.araba } },
  { clave: 'bdns', nombre: 'Base de Datos Nacional de Subvenciones (incluye Diputación de Bizkaia y ayuntamientos)', mod: bdns },
  { clave: 'boletines', nombre: 'Boletines oficiales (BOPV, BOB, BOG, BOTHA)', mod: boletines },
  { clave: 'prestaciones', nombre: 'Prestaciones permanentes (lista de páginas oficiales)', mod: prestaciones },
];

// Completa con la ficha de euskadi.eus las ayudas que enlazan a ella (las fichas sí son accesibles)
async function enriquecer(ayudas) {
  const objetivo = ayudas.filter((a) => /euskadi\.eus\/(?:.*web01-tramite|servicios\/)/.test(a.url || ''));
  let ok = 0;
  await enParalelo(objetivo, 3, async (a) => {
    const f = euskadi.parseFicha(await pedir(a.url));
    if (!f.objeto && !f.dirigido) return;
    ok++;
    a.resumen = f.objeto || a.resumen;
    a.cuantia = f.cuantia || a.cuantia;
    a.dirigido = f.dirigido || a.dirigido;
    if (f.requisitos && f.requisitos.length) a.requisitos = f.requisitos;
    a.organismo = f.organismo || a.organismo;
    a.presupuesto = a.presupuesto || f.presupuesto;
    const todo = [a.titulo, f.objeto, f.dirigido].join(' ');
    a.para = [...new Set([...(a.para || []), ...paraDeTexto(todo)])];
    a.temas = [...new Set([...(a.temas || []), ...temasDe([a.titulo, (f.objeto || '').slice(0, 300)].join(' '))])];
    a.fuentes.push({ nombre: 'euskadi.eus', url: a.url });
    if (f.texto) a._texto = [a._texto || '', f.texto].join('\n');
  });
  log(`Fichas de euskadi.eus: ${ok} de ${objetivo.length} completadas`);
}

const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const hoy = new Date().toISOString().slice(0, 10);

function leerPrevio() {
  try { return JSON.parse(fs.readFileSync(path.join(SALIDA, 'ayudas.json'), 'utf8')); } catch { return null; }
}

const VACIAS = new Set('de del la las el los y e o u a en para por con al sus su que se convocatoria convocatorias ayuda ayudas subvencion subvenciones ejercicio ano programa bases reguladoras aprueban aprueba resolucion orden extracto'.split(' '));
function claves(t) {
  return new Set(norm(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !VACIAS.has(w) && !/^20\d\d$/.test(w)));
}
function parecido(a, b) {
  let comun = 0;
  for (const w of a) if (b.has(w)) comun++;
  return comun / Math.max(1, Math.min(a.size, b.size));
}

function unir(eus, bd) {
  const usados = new Set();
  const kE = eus.map((x) => claves(x.titulo));
  for (const b of bd) {
    if (b.ambito.nivel !== 'euskadi') continue;
    const kb = claves(b.titulo);
    let mejor = -1, score = 0;
    kE.forEach((k, i) => { const s = parecido(kb, k); if (s > score) { score = s; mejor = i; } });
    if (mejor >= 0 && score >= 0.7 && kb.size >= 3) {
      const e = eus[mejor];
      e.bdns = e.bdns || b.bdns;
      e.bases = e.bases || b.bases;
      e.inicio = e.inicio || b.inicio;
      e.fin = e.fin || b.fin;
      e.presupuesto = e.presupuesto || b.presupuesto;
      e.para = [...new Set([...(e.para || []), ...(b.para || [])])];
      e.fuentes.push(...b.fuentes);
      usados.add(b.id);
    }
  }
  return [...eus, ...bd.filter((b) => !usados.has(b.id))];
}

// Cierre leído del texto de la convocatoria (cache/fuentes/<id>.txt de la pasada anterior) para las de la BDNS
// y los boletines que llegan sin fecha de fin: «hasta el 30 de septiembre» o «un (1) mes / 25 días naturales /
// 10 días hábiles desde el día siguiente a la publicación». Así no quedan como abiertas ni en la cola de fichas
// convocatorias que ya cerraron. Si no se puede leer el plazo, se deja como estaba.
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const nombreFuente = (id) => String(id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huella(id).slice(0, 8) + '.txt';
function finDelTexto(a) {
  if (a.fin || a.permanente) return;
  if (!(a.origen === 'bdns' || a.origen === 'boletines' || String(a.id).startsWith('bdns-'))) return;
  let texto = '';
  try { texto = fs.readFileSync(path.join('cache', 'fuentes', nombreFuente(a.id)), 'utf8'); } catch {}
  texto = texto.replace(/\s+/g, ' ');
  // Trozos que hablan del plazo de solicitud (no del de justificación)
  const trozos = [String(a.textoPlazo || '')];
  for (const m of texto.matchAll(/plazo (?:de presentaci[oó]n de (?:las )?solicitudes|para (?:presentar|solicitar)|de solicitud)[^]{0,350}/gi)) trozos.push(m[0]);
  const desde = a.publicacion || a.registrada || '';
  const vale = (f) => f && f >= desde && f.slice(0, 4) - desde.slice(0, 4) <= 1;
  const MES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
  const fecha = (t, pre) => {
    let m = t.match(new RegExp(pre + '(\\d{1,2}) de ' + MES + ' de(?:l)? (20\\d\\d)'));
    if (m) return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(new RegExp(pre + '(\\d{1,2})/(\\d{1,2})/(20\\d\\d)'));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  };
  // Fin según la BDNS: «31 de diciembre de 2026» o «15/10/2026» en el texto de fin de plazo
  const finBdns = fecha(norm(String(a.textoPlazo || '').split(' · ').pop()), '');
  if (vale(finBdns)) { a.fin = finBdns; a.finCalculado = true; return; }
  for (const t0 of trozos) {
    const t = norm(t0).replace(/\(\s*\d+\s*\)/g, ' ');
    if (/justificaci|alegaci|obras/.test(t.slice(0, 40))) continue;
    // Fecha expresa con año: «hasta el 30 de septiembre de 2026»
    const f = fecha(t, 'hasta el (?:dia )?');
    if (vale(f)) { a.fin = f; a.finCalculado = true; return; }
    // Plazo relativo a la publicación (solo si se conoce la fecha de publicación)
    const c = bdns.calculaFin(t, a.publicacion);
    if (c && vale(c.fin)) { a.fin = c.fin; a.inicio = a.inicio || c.inicio; a.finCalculado = true; return; }
  }
}

function estado(a) {
  // Procedimiento de euskadi.eus marcado «Histórico»: convocatoria pasada, aunque traiga fechas nuevas
  if (/^\s*hist[oó]rico\s*$/i.test(a.estadoFuente || '')) return 'cerrada';
  if (a.inicio && a.inicio > hoy) return 'proxima';
  if (a.fin && a.fin < hoy) return 'cerrada';
  if (a.fin || a.permanente) return 'abierta';
  if (a.abiertoSegunFuente || /abierto/i.test(a.estadoFuente || '')) return 'abierta';
  return 'sinfecha';
}

// "Convocatoria general de subvenciones 2026. Anexo nº 26: Euskaraz Baietz! ... 2026" -> "Euskaraz Baietz! ..."
function tituloSinEdicion(t) {
  let s = String(t || '')
    .replace(/^convocatoria general de subvenciones\s*(?:\d{4})?\s*[.,-]?\s*anexo\s*n?[º°o.]*\s*\d+\s*[:.\-]\s*/i, '')
    .replace(/\b(?:para|en|de|del)\s+(?:el\s+)?(?:a[nñ]o|ejercicio|curso)\s+(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?,?\s*/gi, '')
    .replace(/\(?\b(?:a[nñ]o|ejercicio|curso|convocatoria)?\s*(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?\b\)?/gi, '')
    .replace(/\s+(?:en|de|del|para|el|la|los|las)\s*$/i, '')
    .replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[\s,.;:-]+$/, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : t;
}

async function main() {
  const previo = leerPrevio();
  const resultados = {};
  const estadoFuentes = {};
  for (const f of FUENTES) {
    const t0 = Date.now();
    try {
      const items = await f.mod.recoger(log);
      resultados[f.clave] = items;
      estadoFuentes[f.clave] = { nombre: f.nombre, ok: true, registros: items.length, segundos: Math.round((Date.now() - t0) / 1000), erroresFicha: items.filter((x) => x.errorFicha).length };
      log(`${f.nombre}: ${items.length} registros`);
    } catch (e) {
      // Si una fuente falla, conservamos lo que había de ella en la publicación anterior
      const anteriores = previo ? previo.ayudas.filter((a) => a.origen === f.clave) : [];
      resultados[f.clave] = anteriores;
      estadoFuentes[f.clave] = { nombre: f.nombre, ok: false, error: String(e.message || e), registros: anteriores.length, conservados: true };
      log(`ERROR en ${f.nombre}: ${e.message || e}`);
    }
  }

  for (const k in resultados) for (const a of resultados[k]) a.origen = a.origen || k;
  let ayudas = unir([...(resultados.euskadi || []), ...(resultados.gipuzkoa || []), ...(resultados.araba || [])], resultados.bdns || []);
  // Boletines: solo lo que no tenemos ya (mismo código BDNS o mismo título en el mismo ámbito)
  {
    const ids = new Set(ayudas.map((a) => a.id));
    const kAy = ayudas.map((a) => ({ k: claves(a.titulo), amb: a.ambito.nombre }));
    let dup = 0;
    for (const b of resultados.boletines || []) {
      if (b.bdnsRef && ids.has('bdns-' + b.bdnsRef)) { dup++; continue; }
      const kb = claves(b.titulo);
      if (kAy.some((x) => x.amb === b.ambito.nombre && parecido(kb, x.k) >= 0.6)) { dup++; continue; }
      ayudas.push(b);
    }
    log(`Boletines: ${(resultados.boletines || []).length - dup} ayudas nuevas (${dup} ya estaban por otras fuentes)`);
  }
  // Prestaciones permanentes: solo las que no llegan ya por otra fuente (misma página o mismo título en el mismo ámbito)
  {
    const urls = new Set(ayudas.map((a) => a.url));
    const kAy = ayudas.map((a) => ({ k: claves(a.titulo), amb: a.ambito.nombre }));
    const nuevas = (resultados.prestaciones || []).filter((p) => !urls.has(p.url) && !kAy.some((x) => x.amb === p.ambito.nombre && parecido(claves(p.titulo), x.k) >= 0.8));
    ayudas.push(...nuevas);
    log(`Prestaciones permanentes: ${nuevas.length} nuevas`);
  }
  // Ayudas añadidas por la tarea a partir de noticias, y marca de posibles noticias (se cotejan antes de publicar)
  try { ayudas.push(...extras(log)); } catch (e) { log(`Extras: ${e.message}`); }
  for (const a of ayudas) if (esPosibleNoticia(a)) a.posibleNoticia = true;
  let europa = [];
  try { europa = await convocatoriasUE(log); } catch (e) { log(`UE: ${e.message}`); }
  if (!europa.length) { try { europa = JSON.parse(fs.readFileSync(path.join('cache', 'europa.json'), 'utf8')); } catch {} }
  // Convocatorias europeas que se piden sin consorcio: solo las que no están ya (por noticias o en cache/ayudas_extra.json)
  try {
    const urls = ayudas.map((a) => a.url || '');
    const nuevas = ayudasDirectasUE(europa, log).filter((u) => { const top = u._texto.match(/Identificador: (\S+)/)[1].toLowerCase(); return !urls.some((x) => x === u.url || x.toLowerCase().includes('/' + top)); });
    for (const u of nuevas) if (esPosibleNoticia(u)) u.posibleNoticia = true;
    ayudas.push(...nuevas);
    log(`UE: ${nuevas.length} convocatorias directas nuevas en la lista`);
    estadoFuentes.europa = { nombre: 'Funding & Tenders Portal (Comisión Europea), convocatorias sin consorcio', ok: europa.length > 0, registros: nuevas.length, erroresFicha: 0 };
  } catch (e) { log(`UE directas: ${e.message}`); estadoFuentes.europa = { nombre: 'Funding & Tenders Portal (Comisión Europea), convocatorias sin consorcio', ok: false, error: String(e.message || e), registros: 0 }; }
  { // Duplicados exactos (misma ayuda registrada dos veces)
    const vistos = new Set();
    ayudas = ayudas.filter((a) => { const k = norm(a.titulo) + '|' + a.ambito.nombre + '|' + (a.fin || ''); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }
  try { await enriquecer(ayudas.filter((a) => a.origen !== 'euskadi')); } catch (e) { log(`Aviso: no se pudieron completar fichas: ${e.message}`); }
  // Fuera las que no puede solicitar cualquiera (nominativas, directas, a una entidad concreta)
  const antes = ayudas.length;
  ayudas = ayudas.filter((a) => !bdns.RUIDO.test(a.titulo) && !/a efectos de mera noticia|se incluye en secci[oó]n de convocatorias para una mayor visibilidad/i.test(a.resumen || '') && !/no es una convocatoria (de subvenciones )?abierta|s[oó]lo pueden (formalizar|presentar)[^.]{0,60}(presupuestos|nominativ)/i.test(a.resumen || '') && !/^(?:[Ss]ubvenci[oó]n|[Aa]yuda|[Aa]portaci[oó]n) (?:a|al|para) (?:la |el )?[A-ZÑ]{2,}\b/.test(a.titulo));
  log(`Descartadas ${antes - ayudas.length} no solicitables`);
  // Líneas que no informan al solicitante: avisos en mayúsculas, códigos internos, enlaces a otras secciones
  const lineaUtil = (l) => {
    const t = l.trim();
    if (!t) return false;
    const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
    if (letras.length > 25 && letras === letras.toUpperCase()) return false;
    if (/^(información de contacto|código|organismos?|normativa|tramitación|ver más|más información)$/i.test(t)) return false;
    if (!/\s/.test(t) && t.length > 12) return false;
    if (/^revie\b|red vasca de información europea|acceso a otros contenidos/i.test(t)) return false;
    return true;
  };
  const limpiaTexto = (t) => String(t || '').split('\n').filter(lineaUtil).join('\n')
    .replace(/\s*N\.?\s*º\s*\d+\s+\w+\s+\d{1,2} de \w+ de \d{4}\s+BOLET[IÍ]N OFICIAL DEL PA[IÍ]S VASCO\s+\d{4}\/\d+\s*\(\d+\/\d+\)\s*/gi, ' ')
    .replace(/\s*BOLET[IÍ]N OFICIAL (?:DEL PA[IÍ]S VASCO|DE BIZKAIA|DE GIPUZKOA|DEL TERRITORIO HIST[OÓ]RICO DE [AÁ]LAVA)[^\n]{0,60}/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ').trim();
  // Requisitos genéricos que piden todas las ayudas públicas: no aportan y confunden (se resumen en una nota en la app)
  const GENERICO = /condenad|sancionad|para[ií]so fiscal|reintegro|obligaciones tributarias|seguridad social|poder de representaci|legalmente constituid|identidad de|prohibici|lgtbi|plan de igualdad|sobrefinanciaci|cuota.*reserva|actividades econ[oó]micas|resoluci[oó]n firme|orden de recuperaci|deslocalizaci|ley org[aá]nica 1\/2002|declaraci[oó]n responsable|discriminaci|al corriente|procedimiento de reintegro|ayudas? ilegal|empresas? en crisis|inhabilit|minimis|cumplimiento de las obligaciones/i;
  // Destinatarios de la BDNS en lenguaje claro
  const QUIEN_BDNS = [
    [/f[ií]sicas que no desarrollan/i, 'Particulares (personas que no tienen actividad económica)'],
    [/pyme y personas f[ií]sicas que desarrollan|f[ií]sicas que desarrollan/i, 'Autónomos y pymes'],
    [/gran empresa/i, 'Grandes empresas'],
    [/jur[ií]dicas que no desarrollan/i, 'Asociaciones, fundaciones y otras entidades sin actividad económica'],
    [/sin personalidad jur[ií]dica/i, 'Comunidades de propietarios y otras agrupaciones sin personalidad jurídica'],
    [/entidades locales|administraci/i, 'Ayuntamientos y otras administraciones'],
  ];
  const ORG_POR_AMBITO = (a) => a.ambito.nivel === 'municipio' ? `Ayuntamiento de ${a.ambito.nombre.split(' / ')[0]}` : a.ambito.nivel === 'territorio' ? `Diputación Foral de ${a.ambito.nombre === 'Araba/Álava' ? 'Álava' : a.ambito.nombre}` : a.ambito.nivel === 'estado' ? 'Gobierno de España' : a.ambito.nivel === 'ue' ? 'Unión Europea' : 'Gobierno Vasco';
  // Tipo de solicitante a partir de "a quién va dirigido" (o del título si la fuente no lo dice)
  const TIPO = {
    particular: /personas f[ií]sicas que no desarrollan|^personas f[ií]sicas$|^personas$|particular|unidad(es)? de convivencia|familias|j[oó]venes|estudiantes|alumnado|personas (desemplead|mayores|con discapacidad|trabajadoras|residentes|empadronad|propietari|inquilin|arrendatari|v[ií]ctimas)|pensionistas|ciudadan[ií]a|comunidades de (personas )?propietari|deportistas|personal investigador|investigador(es|as)|menor(es)? a (su )?cargo|mujeres/i,
    autonomo: /aut[oó]nom|personas f[ií]sicas que desarrollan|pyme y personas f[ií]sicas|profesionales/i,
    empresa: /empresa|pyme|sociedad(es)? (mercantil|limitada|an[oó]nima|laboral)|cooperativa|personas jur[ií]dicas privadas|comercios?\b|establecimientos|explotaciones/i,
    asociacion: /asociaci|fundaci|sin [aá]nimo de lucro|personas jur[ií]dicas que no desarrollan|personas jur[ií]dicas privadas|tercer sector|clubs?\b|clubes|federaci|ongd?\b|cofrad[ií]as|centros vascos|euskal etxeak|entidades (privadas|colaboradoras|sociales)/i,
    ayuntamiento: /ayuntamiento|entidades locales|mancomunidad|cuadrilla|concejo|agencias de desarrollo|administraci[oó]n|universidades|centros tecnol[oó]gicos|centros de investigaci/i,
  };
  const tiposDe = (texto) => Object.keys(TIPO).filter((k) => TIPO[k].test(texto));
  // Nombres de organismos coherentes: entidad corta y reconocible + detalle (departamento) aparte
  const ENTIDADES = [
    [/lanbide/i, 'Lanbide'], [/osakidetza/i, 'Osakidetza'], [/\bspri\b|agencia vasca de desarrollo empresarial/i, 'SPRI'],
    [/\beve\b|ente vasco de la energ/i, 'EVE'], [/emakunde/i, 'Emakunde'], [/osalan/i, 'Osalan'], [/elankidetza/i, 'eLankidetza'],
    [/etxepare/i, 'Instituto Vasco Etxepare'], [/\bhabe\b/i, 'HABE'], [/\bhazi\b/i, 'HAZI'], [/ihobe/i, 'Ihobe'], [/basquetour/i, 'Basquetour'],
    [/gogora/i, 'Gogora'], [/bioef/i, 'BIOEF'], [/kontsumobide/i, 'Kontsumobide'], [/\bivap\b/i, 'IVAP'], [/etxebide/i, 'Etxebide'],
    [/ikerbasque/i, 'Ikerbasque'], [/uni[oó]n europea/i, 'Unión Europea'], [/bilbao ekintza/i, 'Bilbao Ekintza'], [/bilbao kirolak/i, 'Bilbao Kirolak'],
    [/surbisa/i, 'Surbisa'], [/donostia sustapena|fomento de san sebasti/i, 'Fomento de San Sebastián'], [/donostia kultura/i, 'Donostia Kultura'],
    [/inguralde/i, 'Inguralde'], [/behargintza/i, 'Behargintza'],
  ];
  const PEQ = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a', 'en', 'para', 'con', 'por']);
  const tituloDepto = (t) => {
    let x = ortografia(String(t || '').replace(/\s+/g, ' ').trim()).replace(/ling[uü]istica/gi, 'Lingüística');
    if (!x) return '';
    if (!/^(departamento|viceconsejer|direcci|delegaci|secretar|servicio|lehendakaritza|instituto|agencia)/i.test(x)) x = 'Departamento de ' + x;
    return x.split(' ').map((w, i) => (i > 0 && PEQ.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  };
  // Listas limpias: sin guiones/letras de numeración y sin encabezados que repiten el nombre de la sección
  const REDUNDANTE = /^((sujetos|personas|entidades)\s+)?(beneficiari|destinatari|solicitantes)[\w/]*(\s+(del programa|de (la|las|esta|estas|los) (ayudas?|subvenci\w*|programa|convocatoria))[^.]*)?\s*:?$|^podr[aá]n (ser beneficiari|solicitar|acogerse|optar)[^.]*:$|^requisitos( que deben cumplir[^.]*)?:?$|^(a qui[eé]n va dirigid[oa]|qui[eé]n puede (pedir|solicitar)la)\s*:?$/i;
  const limpiaLista = (txt) => String(txt || '').split('\n')
    .map((l) => l.replace(/^\s*(?:[-–—•·*]|(?:[a-zA-Z]|[ivxIVX]{1,4}|\d{1,2})[.)])\s*/, '').trim())
    .filter((l) => l && !REDUNDANTE.test(l)).join('\n');
  // Organismo: siempre un registro de la tabla maestra (recolector/organismos.js), nunca el texto de la web
  // Sin preguntas en los textos: la pregunta es el título de la sección. El texto que sigue a una pregunta
  // va a la sección que corresponde («¿Qué requisitos…?» → Requisitos; «¿Quién puede…?» → Quién puede pedirla;
  // «¿Cuánto…?» → Cuánto puedes recibir). Fuera también los textos de enlaces («Folleto (PDF, 629 KB)»).
  const ENLACE_TXT = /\((pdf|docx?|xlsx?|odt|ods|zip|rtf|pptx?)\b[^)]*\)|\b\d+([.,]\d+)?\s*(kb|mb)\b/i;
  const destinoDe = (q) => (/requisit|condicion|deben cumplir/i.test(q) ? 'requisitos' : /qui[eé]n|beneficiari|dirigid|destinatari|personas|entidades/i.test(q) ? 'dirigido' : /cu[aá]nt|importe|cuant[ií]a|euros/i.test(q) ? 'cuantia' : 'resumen');
  const REQ_INF = /^(no\s+(tener|estar|ser|haber|disponer|poseer|percibir|recibir|figurar|hallarse|encontrarse|incurrir|superar|ser\s)|tener|estar|ser|haber|disponer|poseer|acreditar|contar con|cumplir|residir|hallarse|encontrarse|figurar|estar empadronad|ostentar|ser titular|carecer)\b/i;
  const PERFIL_RE = /\baños\b|edad|empadronad|residir|residencia|ingresos|renta\b|unidad (familiar|de convivencia)|discapacidad|desemplead|demandante de empleo/i;
  const repartePreguntas = (a) => {
    const destino = { resumen: [], requisitos: [], dirigido: [], cuantia: [] };
    for (const campo of ['resumen', 'cuantia', 'dirigido']) {
      let actual = campo;
      for (const l of String(a[campo] || '').split('\n').map((x) => x.trim()).filter(Boolean)) {
        if (ENLACE_TXT.test(l)) continue;
        if (/^¿[^?]{3,}\?$/.test(l)) { const d = destinoDe(l); actual = d === 'resumen' ? campo : d; continue; }
        // Frases que empiezan en infinitivo de condición («Tener…», «Estar…», «No haber…») son requisitos;
        // si describen el perfil de la persona (edad, residencia, ingresos), van a «Quién puede pedirla»
        const sinMarca = l.replace(/^\s*(?:[-–—•·*]|(?:[a-zA-Z]|\d{1,2})[.)])\s*/, '');
        if (actual !== 'requisitos' && REQ_INF.test(sinMarca)) { destino[PERFIL_RE.test(sinMarca) && actual !== 'dirigido' ? 'dirigido' : PERFIL_RE.test(sinMarca) ? 'dirigido' : 'requisitos'].push(sinMarca); continue; }
        destino[actual].push(l);
      }
    }
    a.resumen = destino.resumen.join('\n');
    a.cuantia = destino.cuantia.join('\n');
    a.dirigido = destino.dirigido.join('\n');
    const req = (a.requisitos || []).filter((l) => !ENLACE_TXT.test(l) && !/^¿[^?]*\?$/.test(l.trim()));
    a.requisitos = [...req, ...destino.requisitos.filter((l) => !req.includes(l))];
  };
  const normalizaOrganismo = (a) => {
    const fuente = organismoCorto(String(a.organismo || '').trim());
    // Administración del Estado: «Gobierno de España - Ministerio de …» (el ministerio sale del nivel 2 de la BDNS)
    if (a.ambito && a.ambito.nivel === 'estado') {
      const min = String(a.ministerio || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E|Para|El|En|Con|A|Al)\b/g, (w) => w.toLowerCase());
      Object.assign(a, { organismoFuente: fuente, organismoId: 'estado', organismo: 'Gobierno de España', organismoCompleto: min ? `Gobierno de España - ${min}` : 'Gobierno de España', organismoEu: 'Espainiako Gobernua', organismoCompletoEu: min ? `Espainiako Gobernua - ${min}` : 'Espainiako Gobernua' });
      delete a.revisarOrganismo; delete a.organismoDetalle; delete a.ministerio;
      return;
    }
    const { id, revisar } = resolver(fuente, a.ambito);
    const o = POR_ID[id] || POR_ID.gv;
    a.organismoFuente = fuente;
    a.organismoId = o.id;
    a.organismo = o.corto;
    a.organismoCompleto = o.completo;
    a.organismoEu = o.eu;
    a.organismoCompletoEu = o.completoEu || o.eu;
    if (o.privada) a.privada = true; else delete a.privada;
    delete a.organismoDetalle;
    if (revisar || !POR_ID[id]) a.revisarOrganismo = true; else delete a.revisarOrganismo;
  };
  ayudas.forEach(normalizaOrganismo);
  for (const a of ayudas) {
    {
      const lineas = String(a.dirigido || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^(requisitos|obligaciones|los requisitos)/i.test(l));
      let tipos = [...new Set(lineas.flatMap(tiposDe))];
      if (!tipos.length) tipos = tiposDe(a.titulo);
      a.para = tipos;
    }
    if (a.origen === 'bdns' && a.dirigido) {
      const lineas = a.dirigido.split('\n').filter((l) => !/:\s*$/.test(l)).map((l) => { const m = QUIEN_BDNS.find(([re]) => re.test(l)); return m ? m[1] : l; });
      a.dirigido = [...new Set(lineas)].join('\n');
    }
    if (a.origen === 'bdns' && /^Finalidad: /.test(a.resumen || '')) {
      a.area = a.resumen.replace(/^Finalidad: /, '');
      a.resumen = '';
    }
    // Lo que dice cuánto dinero se puede recibir va a la cuantía, esté donde esté en la fuente
    {
      const DINERO = /(\d[\d.]*(?:,\d+)?\s*(?:€|euros?)|\d+\s*(?:%|por ciento))/i;
      const ES_IMPORTE = /m[aá]xim[oa] (de )?\d|hasta (un m[aá]ximo de )?\d|importe|cuant[ií]a|subvenci[oó]n (de|ser[aá])|ayuda (de|ser[aá]|directa)|ascender[aá]|por (persona|vivienda|solicitud|hij|contrat|alumn|plaza|beneficiari)|fondo perdido|\d+\s*(%|por ciento)\s*(del? (gasto|coste|presupuesto subvencionable|inversi[oó]n|importe))|para optar a (pr[eé]stamos|subvenci)/i;
      const NO_ES = /presupuesto total|dotaci[oó]n|partida|consignaci|recursos econ[oó]micos|superficie|cr[eé]dito (total|de pago|de compromiso)/i;
      const quita = (l) => l.replace(/^(?:[a-z]|[ivx]+)[.)]\s+/i, '').trim();
      const mover = [];
      if (a.requisitos) a.requisitos = a.requisitos.filter((r) => { if (DINERO.test(r) && ES_IMPORTE.test(r) && !NO_ES.test(r)) { mover.push(quita(r)); return false; } return true; });
      const lineasResumen = String(a.resumen || '').split('\n');
      const restoResumen = lineasResumen.filter((l) => { if (DINERO.test(l) && ES_IMPORTE.test(l) && !NO_ES.test(l)) { mover.push(quita(l)); return false; } return true; });
      if (restoResumen.join(' ').trim()) a.resumen = restoResumen.join('\n');
      const actuales = String(a.cuantia || '').split('\n').filter(Boolean).filter((l) => !NO_ES.test(l));
      a.cuantia = [...new Set([...actuales, ...mover])].join('\n');
      // Importe máximo orientativo para la tarjeta ("Hasta 39.000 €")
      const cifras = [...a.cuantia.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(?:€|euros?)/gi)].map((m) => Number(m[1].replace(/\./g, ''))).filter((n) => n >= 50 && n < 5e6);
      a.importeMax = cifras.length ? Math.max(...cifras) : null;
      delete a.presupuesto;
    }
    if (a.requisitos) {
      const espec = a.requisitos.filter((r) => !GENERICO.test(r));
      a.requisitosGenerales = espec.length < a.requisitos.length;
      a.requisitos = espec;
    }
    a.organismoGeneral = a.ambito.nivel === 'euskadi' ? 'Gobierno Vasco' : ORG_POR_AMBITO(a);
    repartePreguntas(a);
    a.titulo = ortografia(a.titulo);
    a.resumen = ortografia(a.resumen); a.cuantia = limpiaLista(ortografia(a.cuantia)); a.dirigido = limpiaLista(ortografia(a.dirigido));
    if (a.requisitos) a.requisitos = limpiaLista(a.requisitos.map(ortografia).join('\n')).split('\n').filter(Boolean);
    a.resumen = limpiaTexto(a.resumen); a.cuantia = limpiaTexto(a.cuantia); a.dirigido = limpiaTexto(a.dirigido);
    if (a.requisitos) a.requisitos = a.requisitos.map(limpiaTexto).filter(Boolean);
    // Fuera el cómputo de ingresos y la compatibilidad con otras ayudas (no son requisitos), y las listas que han perdido su introducción
    if (a.requisitos) a.requisitos = ajustaListas(a.requisitos.filter((r) => !NO_ES_REQUISITO.test(r)));
    finDelTexto(a);
    a.estado = estado(a); delete a.errorFicha; delete a.abiertoSegunFuente;
    const corto = tituloCorto(a.titulo, a.organismo, a.ambito);
    if (corto !== a.titulo) { a.tituloOficial = a.titulo; a.titulo = corto; }
  }
  // Ajustes decididos a mano por el responsable: cache/ajustes_ayudas.json =
  // {id: {ocultar: true, unidaA: "<id de la ayuda que ya la recoge>"} | {estado: "proxima", inicio: null, fin: null}
  //      | {ocultarHastaFicha: true, huellaFicha: "<h de la ficha que no vale>"}}
  // Las ocultas no se publican ni pasan a pendientes de resumen; en las demás se sustituyen los campos indicados.
  // ocultarHastaFicha: no se publica, pero sigue pasando a pendientes; se publica sola cuando la tarea incorpora
  // una ficha con la huella del texto actual (y distinta de huellaFicha, la de la ficha que se quiso rehacer).
  {
    let ajustes = {};
    try { ajustes = JSON.parse(fs.readFileSync(path.join('cache', 'ajustes_ayudas.json'), 'utf8')); } catch {}
    let ocultadas = 0, cambiadas = 0, hastaFicha = 0;
    ayudas = ayudas.filter((a) => {
      const aj = ajustes[a.id];
      if (!aj || typeof aj !== 'object') return true;
      if (aj.ocultar) { ocultadas++; return false; }
      if (aj.ocultarHastaFicha) { a._hastaFicha = { huellaFicha: aj.huellaFicha || '' }; hastaFicha++; return true; }
      for (const [k, v] of Object.entries(aj)) if (k !== 'unidaA' && k !== 'motivo') a[k] = v;
      cambiadas++;
      return true;
    });
    if (ocultadas || cambiadas || hastaFicha) log(`Ajustes a mano: ${ocultadas} ocultas, ${hastaFicha} ocultas hasta tener ficha nueva, ${cambiadas} cambiadas`);
  }
  // Fuera: cerradas y las que no tienen fechas y llevan más de 90 días registradas
  const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  ayudas = ayudas.filter((a) => a.estado !== 'cerrada' && !(a.estado === 'sinfecha' && a.registrada && a.registrada < limite));
  ayudas.sort((x, y) => (x.fin || '9999').localeCompare(y.fin || '9999'));

  // Histórico: ayudas que se repiten cada año (lo genera historico.js cada semana)
  let previstas = [];
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(SALIDA, 'historico.json'), 'utf8'));
    const porClave = new Map(hist.lineas.map((l) => [l.clave, l]));
    const actuales = new Set();
    for (const a of ayudas) {
      const k = claveLinea(a.titulo, a.organismo);
      actuales.add(k);
      const l = porClave.get(k);
      if (l) a.recurrente = { años: l.años, mes: l.mes };
    }
    const ahora = new Date();
    for (const l of hist.lineas) {
      if (actuales.has(l.clave)) continue;
      let y = ahora.getUTCFullYear();
      if (l.mes < ahora.getUTCMonth() + 1) y++;
      const prevista = new Date(Date.UTC(y, l.mes - 1, 1));
      const dias = (prevista - ahora) / 864e5;
      const yaConvocada = l.ultimaFecha >= new Date(prevista.getTime() - 200 * 864e5).toISOString().slice(0, 10);
      const viva = l.ultimaFecha >= new Date(ahora.getTime() - 800 * 864e5).toISOString().slice(0, 10);
      if (dias > -20 && dias <= 120 && !yaConvocada && viva) {
        previstas.push({ id: 'prev-' + l.clave.replace(/[^a-z0-9]+/g, '-').slice(0, 80), titulo: ortografia(tituloCorto(l.titulo, l.organismo, l.ambito)), tituloOficial: l.titulo, organismo: ortografia(organismoCorto(l.organismo)), ambito: l.ambito, mesPrevisto: l.mes, añoPrevisto: y, años: l.años, duracionDias: l.duracionDias, url: l.url, estado: 'prevista' });
      }
    }
    // Previstas descartadas a mano (p. ej. una línea que ya se convocó y cerró): cache/previstas_ocultas.json = [id, …]
    let ocultas = [];
    try { ocultas = JSON.parse(fs.readFileSync(path.join('cache', 'previstas_ocultas.json'), 'utf8')); } catch {}
    previstas = previstas.filter((p) => !ocultas.includes(p.id));
    previstas.forEach(normalizaOrganismo);
    // Tipo y temas aproximados por el título hasta que la tarea escriba la ficha (docs/PROXIMAS.md)
    for (const p of previstas) { const tx = [p.titulo, p.tituloOficial].join(' '); if (!(p.para || []).length) p.para = paraDeTexto(tx); if (!(p.temas || []).length) p.temas = temasDe(tx); }
    previstas.sort((a, b) => (a.añoPrevisto - b.añoPrevisto) || (a.mesPrevisto - b.mesPrevisto));
    log(`Histórico: ${ayudas.filter((a) => a.recurrente).length} ayudas actuales se repiten cada año · ${previstas.length} previstas en los próximos meses`);
  } catch (e) { log(`Histórico no disponible: ${e.message}`); }

  let enlacesInfo = null;
  // Enlaces: se normalizan, se comprueban y, si no llevan a la ayuda, se sustituyen por otro de la propia ayuda.
  // No llevan a la ayuda: dominio suelto o página de inicio, error HTTP (≥ 400, salvo 401/403/429, que suelen ser
  // bloqueos a robots), redirección a la portada o página de error con código 200 («página no encontrada»…).
  {
    const norm = (u) => { u = String(u || '').trim(); if (!u) return ''; if (/^www\.|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u) && !/^https?:\/\//i.test(u)) u = 'https://' + u; return /^https?:\/\//i.test(u) ? u : ''; };
    const esPortada = (u) => { try { const x = new URL(u); return (x.pathname === '/' || x.pathname === '') && !x.search; } catch { return true; } };
    const ERROR_TXT = /p[aá]gina no (encontrada|existe|disponible)|no se ha encontrado la p[aá]gina|error 404|404 not found|page not found|orria ez da aurkitu|ez da aurkitu|el recurso solicitado no|la p[aá]gina que buscas|no existe la p[aá]gina/i;
    for (const a of ayudas) { a.url = norm(a.url); a.bases = norm(a.bases); a.boletin = norm(a.boletin); }
    const urls = [...new Set(ayudas.flatMap((a) => [a.url, a.bases, a.boletin]).filter((u) => u && !esPortada(u)))];
    const roto = {};
    await enParalelo(urls, 8, async (u) => {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)' } });
        clearTimeout(t);
        if (r.status >= 400 && ![401, 403, 429].includes(r.status)) roto[u] = 'HTTP ' + r.status;
        else if (r.url && r.url !== u && esPortada(r.url)) roto[u] = 'redirige a la portada';
        else if (/html/i.test(r.headers.get('content-type') || '') && r.body) {
          // Solo los primeros 40 KB: título y cabecera bastan para reconocer una página de error
          const rd = r.body.getReader(); let html = ''; const dec = new TextDecoder();
          while (html.length < 40000) { const { done, value } = await rd.read(); if (done) break; html += dec.decode(value, { stream: true }); }
          try { await rd.cancel(); } catch {}
          const tit = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
          const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
          if (ERROR_TXT.test(tit + ' ' + h1.replace(/<[^>]+>/g, ' ')) || /^\s*(error|404)\b/i.test(tit)) roto[u] = 'página de error';
        } else { try { r.body && r.body.cancel(); } catch {} }
      } catch { /* sin respuesta: no lo damos por roto */ }
    });
    const util = (u) => u && !roto[u] && !esPortada(u);
    let sust = 0, quit = 0; const muestras = [];
    for (const a of ayudas) {
      if (a.url && !util(a.url)) {
        const alt = [...(a.fuentes || []).map((f) => norm(f.url)), a.bases, a.boletin].find((u) => util(u) && u !== a.url);
        muestras.push(`${a.id}: ${a.url} (${roto[a.url] || 'portada'}) → ${alt || 'sin enlace'}`);
        if (alt) { a.url = alt; sust++; } else if (roto[a.url]) { a.url = ''; quit++; }
      }
      if (a.bases && roto[a.bases]) { a.bases = ''; quit++; }
      if (a.boletin && roto[a.boletin]) { a.boletin = ''; quit++; }
    }
    enlacesInfo = { comprobados: urls.length, rotos: Object.keys(roto).length, sustituidos: sust, quitados: quit };
    log(`Enlaces comprobados: ${urls.length}, rotos: ${Object.keys(roto).length}, sustituidos: ${sust}, quitados: ${quit}`);
    muestras.slice(0, 15).forEach((m) => log('  ' + m));
  }

  // Documentación completa de cada ayuda (ficha + todos sus enlaces de información) para los resúmenes.
  // No se publica en la app: se guarda en cache/fuentes/<id>.txt y la lee la tarea de resumen.
  const docUrl = (id) => `https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento=${id}`;
  let docs = {};
  // Documentos oficiales añadidos a mano o por la tarea de resumen (BOPV, BOTHA, BOB, BOG…): cache/docs_extra.json = {id: [url, …]}
  let docsExtra = {};
  try { docsExtra = JSON.parse(fs.readFileSync(path.join('cache', 'docs_extra.json'), 'utf8')); } catch {}
  try { docs = await documentacion(ayudas, { log, extra: (a) => [...(docsExtra[a.id] || []), ...(a._urls || []), ...(a._docs || []).map(docUrl)] }); } catch (e) { log(`Documentación: ${e.message}`); }
  // Nominativas y convenios que solo lo dicen en el documento subido a la BDNS (no en el título)
  {
    const fuera = [];
    ayudas = ayudas.filter((a) => {
      const m = String(a.id).startsWith('bdns-') ? bdns.documentoNoSolicitable(docs[a.id]) : '';
      if (m) fuera.push(`${a.id} («${m}»)`);
      return !m;
    });
    log(`Descartadas por el documento de la convocatoria (convenio o nominativa): ${fuera.length}${fuera.length ? ' · ' + fuera.slice(0, 40).join(', ') : ''}`);
  }
  const fuentes = {};
  const DIR_F = path.join('cache', 'fuentes');
  fs.mkdirSync(DIR_F, { recursive: true });
  const nombreF = (id) => String(id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huella(id).slice(0, 8) + '.txt';
  for (const a of ayudas) {
    const t = [docs[a.id] || '', a._texto && !docs[a.id] ? '### Extracto de la fuente\n' + a._texto : ''].join('\n\n').trim();
    if (t) { fuentes[a.id] = t; fs.writeFileSync(path.join(DIR_F, nombreF(a.id)), t); }
    delete a._texto; delete a._docs; delete a._ficha; delete a._urls;
  }
  // Fuera los textos de ayudas que ya no existen
  const vivos = new Set(Object.keys(fuentes).map(nombreF));
  for (const f of fs.readdirSync(DIR_F)) if (!vivos.has(f)) fs.rmSync(path.join(DIR_F, f));
  for (const viejo of ['fuentes.json', 'pdfs.json']) fs.rmSync(path.join('cache', viejo), { force: true });
  let cacheRes = {};
  try { cacheRes = JSON.parse(fs.readFileSync(path.join('cache', 'resumenes.json'), 'utf8')); } catch {}
  log(`Resúmenes aplicados: ${aplicar(ayudas, fuentes, cacheRes)}`);
  // Fuera las que la ficha (escrita a partir de todos los documentos) dice que no se pueden pedir:
  // nominativas, convenios y ayudas reservadas a una entidad o persona concreta. Solo BDNS y boletines;
  // las prestaciones permanentes y las de euskadi.eus no pasan por aquí.
  {
    const NO_SOLICITABLE = /no es una convocatoria (?:de subvenciones |de ayudas |p[uú]blica )?abierta|(?:^|[.:]\s+)subvenci[oó]n nominativa\b|nadie m[aá]s puede (?:pedirla|solicitarla)/i;
    const fuera = [];
    ayudas = ayudas.filter((a) => {
      const no = a.resumenIA && (String(a.id).startsWith('bdns-') || a.origen === 'boletines') && NO_SOLICITABLE.test(a.resumen || '');
      if (no) fuera.push(a.id);
      return !no;
    });
    log(`Descartadas porque su ficha dice que no se pueden pedir (nominativas o reservadas): ${fuera.length}${fuera.length ? ' · ' + fuera.slice(0, 40).join(', ') : ''}`);
  }
  // Lista de pendientes para la tarea de resumen (abiertas primero, por fecha de cierre)
  const pendientes = ayudas.filter((a) => !a.posibleNoticia && fuentes[a.id] && (!cacheRes[a.id] || cacheRes[a.id].h !== huella(fuentes[a.id])))
    .sort((x, y) => (x.fin || '9999').localeCompare(y.fin || '9999'))
    .map((a) => ({ id: a.id, h: huella(fuentes[a.id]), titulo: a.titulo, organismoSugerido: a.organismoId, organismoFuente: a.organismoFuente || '', archivo: path.join(DIR_F, nombreF(a.id)), caracteres: fuentes[a.id].length }));
  // Tabla maestra de organismos para la tarea de categorización
  fs.writeFileSync(path.join('cache', 'organismos.json'), JSON.stringify(CATALOGO.map(({ id, completo, alias }) => ({ id, nombre: completo, alias })), null, 1));
  fs.writeFileSync(path.join('cache', 'pendientes.json'), JSON.stringify(pendientes, null, 1));
  log(`Pendientes de resumen: ${pendientes.length}`);
  // Ocultas hasta tener ficha nueva: ya están en pendientes; se publican solo si su ficha es la del texto actual
  {
    const lista = ayudas.filter((a) => a._hastaFicha);
    const esperan = lista.filter((a) => {
      const c = cacheRes[a.id];
      const tieneFicha = !!(fuentes[a.id] && c && c.h === huella(fuentes[a.id]) && c.h !== a._hastaFicha.huellaFicha);
      delete a._hastaFicha;
      return !tieneFicha;
    });
    const fuera = new Set(esperan.map((a) => a.id));
    ayudas = ayudas.filter((a) => !fuera.has(a.id));
    if (lista.length) log(`Ocultas hasta tener ficha nueva: ${lista.length - fuera.size} ya publicadas, ${fuera.size} esperando ficha${fuera.size ? ' (' + [...fuera].join(', ') + ')' : ''}`);
  }

  // Próximas: ficha prudente de la última convocatoria (docs/PROXIMAS.md). Primero las más cercanas.
  try {
    const hoyM = new Date().getFullYear() * 12 + new Date().getMonth();
    const cerca = previstas.filter((p) => p.añoPrevisto * 12 + p.mesPrevisto - 1 - hoyM <= 3);
    const { fuentes: fP, cache: cP } = await prepararProximas(cerca, { documentacion, log });
    const antes = previstas.length;
    previstas = aplicarProximas(previstas, fP, cP);
    log(`Próximas con ficha: ${previstas.filter((p) => p.fichaIA).length} · descartadas por no continuar: ${antes - previstas.length}`);
  } catch (e) { log(`Próximas: ${e.message}`); }

  // Títulos en euskera: traducciones de la tarea de resumen (cache/titulos_eu.json, clave = título en castellano)
  // Títulos estandarizados (docs/TITULOS.md) en castellano y euskera, escritos por la tarea programada
  let titEu = {}, titulos = {};
  try { titEu = JSON.parse(fs.readFileSync(path.join('cache', 'titulos_eu.json'), 'utf8')); } catch {}
  try { titulos = JSON.parse(fs.readFileSync(path.join('cache', 'titulos.json'), 'utf8')); } catch {}
  const titPend = aplicarTitulos([...ayudas, ...previstas], titulos, titEu);
  fs.writeFileSync(path.join('cache', 'titulos_pendientes.json'), JSON.stringify(titPend, null, 1));
  log(`Títulos pendientes de estandarizar: ${titPend.length}`);

  // Posibles noticias: cotejo con el portal europeo y con las ayudas propias; fuera de la lista hasta que la tarea decida
  {
    const decisiones = (() => { try { return JSON.parse(fs.readFileSync(path.join('cache', 'noticias_decisiones.json'), 'utf8')); } catch { return {}; } })();
    const sinDecidir = ayudas.filter((a) => a.posibleNoticia && !decisiones[a.id]);
    const propias = ayudas.filter((a) => !a.posibleNoticia);
    const cot = cotejar(sinDecidir, propias, europa).map((c) => ({ ...c, archivo: fuentes[c.id] ? path.join('cache', 'fuentes', nombreF(c.id)) : null }));
    fs.writeFileSync(path.join('cache', 'noticias.json'), JSON.stringify(cot, null, 1));
    const { publicar, revision } = separar(ayudas, log);
    ayudas = publicar;
    fs.mkdirSync(SALIDA, { recursive: true });
    fs.writeFileSync(path.join(SALIDA, 'revision.json'), JSON.stringify({ generado: new Date().toISOString(), noticias: revision }, null, 1));
  }
  const porAmbito = ayudas.reduce((m, a) => { m[a.ambito.nivel] = (m[a.ambito.nivel] || 0) + 1; return m; }, {});
  const porEstado = ayudas.reduce((m, a) => { m[a.estado] = (m[a.estado] || 0) + 1; return m; }, {});
  const meta = { version: 1, generado: new Date().toISOString(), total: ayudas.length, porAmbito, porEstado, previstas: previstas.length, fuentes: estadoFuentes, enlaces: enlacesInfo };

  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'ayudas.json'), JSON.stringify({ ...meta, ayudas, previstas }));
  fs.writeFileSync(path.join(SALIDA, 'estado.json'), JSON.stringify(meta, null, 2));
  log(`Publicadas ${ayudas.length} ayudas · ${JSON.stringify(porAmbito)} · ${JSON.stringify(porEstado)}`);
  if (Object.values(estadoFuentes).every((s) => !s.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
