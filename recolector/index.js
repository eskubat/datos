// Recolector de Eskubat: lee todas las fuentes, une duplicados y publica publico/ayudas.json
import fs from 'node:fs';
import path from 'node:path';
import { norm, pedir, enParalelo, paraDeTexto, temasDe, tituloCorto, organismoCorto, ortografia } from './comun.js';
import * as euskadi from './euskadi.js';
import * as bdns from './bdns.js';
import * as forales from './forales.js';
import { claveLinea } from './historico.js';
import { aplicar, huella } from './resumen.js';
import { textosPdf } from './pdf.js';

const SALIDA = path.resolve('publico');
const FUENTES = [
  { clave: 'euskadi', nombre: 'Gobierno Vasco (Open Data Euskadi y euskadi.eus)', mod: euskadi },
  { clave: 'gipuzkoa', nombre: 'Diputación Foral de Gipuzkoa (sede electrónica)', mod: { recoger: forales.gipuzkoa } },
  { clave: 'araba', nombre: 'Diputación Foral de Álava (ayudas en vigor)', mod: { recoger: forales.araba } },
  { clave: 'bdns', nombre: 'Base de Datos Nacional de Subvenciones (incluye Diputación de Bizkaia y ayuntamientos)', mod: bdns },
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

function estado(a) {
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
  const ORG_POR_AMBITO = (a) => a.ambito.nivel === 'municipio' ? `Ayto. de ${a.ambito.nombre.split(' / ')[0]}` : a.ambito.nivel === 'territorio' ? `Diputación Foral de ${a.ambito.nombre === 'Araba/Álava' ? 'Álava' : a.ambito.nombre}` : 'Gobierno Vasco';
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
  const normalizaOrganismo = (a) => {
    const orig = organismoCorto(String(a.organismo || '').trim());
    const ent = ENTIDADES.find(([re]) => re.test(orig));
    const base = a.ambito.nivel === 'municipio' ? `Ayto. de ${a.ambito.nombre.split(' / ')[0]}` : a.ambito.nivel === 'territorio' ? `Diputación Foral de ${a.ambito.nombre === 'Araba/Álava' ? 'Álava' : a.ambito.nombre}` : 'Gobierno Vasco';
    let detalle = '';
    if (ent) a.organismo = ent[1];
    else {
      a.organismo = base;
      const resto = orig.replace(/^(diputaci[oó]n foral de \S+|gobierno vasco|ayuntamiento de .+)$/i, '').split(' · ').pop().trim();
      // Solo departamentos/áreas; nada de nombres de personas
      if (resto && !/^[A-ZÁÉÍÓÚ][a-záéíóúñ]+ [A-ZÁÉÍÓÚ][a-záéíóúñ]+( [A-ZÁÉÍÓÚ][\wáéíóúñ]+)*$/.test(resto) && resto.toLowerCase() !== base.toLowerCase() && false) detalle = a.ambito.nivel === 'euskadi' ? tituloDepto(resto) : ortografia(resto.charAt(0).toUpperCase() + resto.slice(1));
    }
    // Solo el nombre de la entidad (Gobierno Vasco, Diputación Foral de X, Ayto. de X): sin departamentos ni servicios
    a.organismoDetalle = '';
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
    a.titulo = ortografia(a.titulo);
    a.resumen = ortografia(a.resumen); a.cuantia = limpiaLista(ortografia(a.cuantia)); a.dirigido = limpiaLista(ortografia(a.dirigido));
    if (a.requisitos) a.requisitos = limpiaLista(a.requisitos.map(ortografia).join('\n')).split('\n').filter(Boolean);
    a.resumen = limpiaTexto(a.resumen); a.cuantia = limpiaTexto(a.cuantia); a.dirigido = limpiaTexto(a.dirigido);
    if (a.requisitos) a.requisitos = a.requisitos.map(limpiaTexto).filter(Boolean);
    a.estado = estado(a); delete a.errorFicha; delete a.abiertoSegunFuente;
    const corto = tituloCorto(a.titulo, a.organismo, a.ambito);
    if (corto !== a.titulo) { a.tituloOficial = a.titulo; a.titulo = corto; }
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
    previstas.forEach(normalizaOrganismo);
    previstas.sort((a, b) => (a.añoPrevisto - b.añoPrevisto) || (a.mesPrevisto - b.mesPrevisto));
    log(`Histórico: ${ayudas.filter((a) => a.recurrente).length} ayudas actuales se repiten cada año · ${previstas.length} previstas en los próximos meses`);
  } catch (e) { log(`Histórico no disponible: ${e.message}`); }

  // Enlaces rotos: se comprueban y se sustituyen por la ficha de la fuente (o se quitan)
  {
    const urls = [...new Set(ayudas.flatMap((a) => [a.url, a.bases, a.boletin]).filter((u) => /^https?:\/\//.test(u || '')))];
    const roto = {};
    await enParalelo(urls, 8, async (u) => {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)' } });
        clearTimeout(t);
        if (r.status === 404 || r.status === 410) roto[u] = true;
        try { r.body && r.body.cancel(); } catch {}
      } catch { /* sin respuesta: no lo damos por roto */ }
    });
    let n = 0;
    for (const a of ayudas) {
      if (roto[a.url]) { const alt = (a.fuentes || []).map((f) => f.url).find((u) => u && !roto[u] && u !== a.url); a.url = alt || ''; n++; }
      if (roto[a.bases]) { a.bases = ''; n++; }
      if (roto[a.boletin]) { a.boletin = ''; n++; }
    }
    log(`Enlaces comprobados: ${urls.length}, rotos sustituidos o quitados: ${n}`);
  }

  // Texto de cada ayuda para los resúmenes (no se publica en la app) y resúmenes ya hechos
  // PDF de la convocatoria (BDNS) y de las bases: se añaden al texto que se resume
  const docUrl = (id) => `https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento=${id}`;
  let pdfs = {};
  try { pdfs = await textosPdf(ayudas.flatMap((a) => [...(a._docs || []).map(docUrl), /\.pdf($|\?)/i.test(a.bases || '') ? a.bases : null]).filter(Boolean), log); } catch (e) { log(`PDF: ${e.message}`); }
  const fuentes = {};
  for (const a of ayudas) {
    const extra = [...(a._docs || []).map((id) => pdfs[docUrl(id)]), pdfs[a.bases]].filter(Boolean).map((t) => 'Documento oficial (extracto):\n' + t);
    const t = [a._texto || '', ...extra].join('\n\n').trim();
    if (t) fuentes[a.id] = t.slice(0, 20000);
    delete a._texto; delete a._docs;
  }
  fs.mkdirSync('cache', { recursive: true });
  fs.writeFileSync(path.join('cache', 'fuentes.json'), JSON.stringify(fuentes));
  let cacheRes = {};
  try { cacheRes = JSON.parse(fs.readFileSync(path.join('cache', 'resumenes.json'), 'utf8')); } catch {}
  log(`Resúmenes aplicados: ${aplicar(ayudas, fuentes, cacheRes)}`);
  // Lista de pendientes para la tarea de resumen (abiertas primero, por fecha de cierre)
  const pendientes = ayudas.filter((a) => fuentes[a.id] && (!cacheRes[a.id] || cacheRes[a.id].h !== huella(fuentes[a.id])))
    .sort((x, y) => (x.fin || '9999').localeCompare(y.fin || '9999'))
    .map((a) => ({ id: a.id, h: huella(fuentes[a.id]), titulo: a.titulo, texto: fuentes[a.id] }));
  fs.writeFileSync(path.join('cache', 'pendientes.json'), JSON.stringify(pendientes));
  log(`Pendientes de resumen: ${pendientes.length}`);

  const porAmbito = ayudas.reduce((m, a) => { m[a.ambito.nivel] = (m[a.ambito.nivel] || 0) + 1; return m; }, {});
  const porEstado = ayudas.reduce((m, a) => { m[a.estado] = (m[a.estado] || 0) + 1; return m; }, {});
  const meta = { version: 1, generado: new Date().toISOString(), total: ayudas.length, porAmbito, porEstado, previstas: previstas.length, fuentes: estadoFuentes };

  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'ayudas.json'), JSON.stringify({ ...meta, ayudas, previstas }));
  fs.writeFileSync(path.join(SALIDA, 'estado.json'), JSON.stringify(meta, null, 2));
  log(`Publicadas ${ayudas.length} ayudas · ${JSON.stringify(porAmbito)} · ${JSON.stringify(porEstado)}`);
  if (Object.values(estadoFuentes).every((s) => !s.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
