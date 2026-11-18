// Convocatorias europeas abiertas y próximas: Funding & Tenders Portal (Comisión Europea), búsqueda pública SEDIA.
// No se publican todas en la app (son cientos y muy técnicas): sirven para cotejar las noticias de ayudas europeas
// y para que la tarea programada añada las que correspondan. Se guardan en cache/europa.json.
import fs from 'node:fs';
import path from 'node:path';
import { pedir, texto as htmlATexto, sleep } from './comun.js';

const API = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***';
const ESTADOS = { 31094501: 'proxima', 31094502: 'abierta' };
const uno = (v) => (Array.isArray(v) ? v[0] : v) || '';
const dia = (v) => String(uno(v)).slice(0, 10) || null;

async function pagina(tipo, estado, n) {
  const fd = new FormData();
  fd.append('query', new Blob([JSON.stringify({ bool: { must: [{ terms: { type: [String(tipo)] } }, { terms: { status: [String(estado)] } }] } })], { type: 'application/json' }));
  fd.append('languages', new Blob(['["en"]'], { type: 'application/json' }));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${API}&pageSize=100&pageNumber=${n}`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function convocatoriasUE(log = console.log) {
  const out = [];
  let camposVistos = false;
  // 1 = topics de programas de la UE (Horizon Europe, LIFE, Erasmus+, Europa Creativa, CEF, Digital…)
  // 8 = convocatorias en cascada (terceros que reparten fondos europeos a pymes, startups…)
  for (const tipo of [1, 8]) {
    for (const est of Object.keys(ESTADOS)) {
      for (let n = 1; n <= 15; n++) {
        let d;
        try { d = await pagina(tipo, est, n); } catch (e) { log(`UE: tipo ${tipo} ${ESTADOS[est]} p${n}: ${e.message}`); break; }
        for (const r of d.results || []) {
          const m = r.metadata || {};
          const fines = (m.deadlineDate || []).map((x) => String(x).slice(0, 10)).sort();
          out.push({
            id: uno(m.identifier) || r.reference,
            titulo: uno(m.title) || r.summary || '',
            convocatoria: uno(m.callTitle) || '',
            programa: uno(m.typesOfAction) || '',
            url: r.url,
            inicio: dia(m.startDate),
            fin: fines.find((f) => f >= new Date().toISOString().slice(0, 10)) || fines[fines.length - 1] || null,
            estado: ESTADOS[est],
            cascada: tipo === 8,
          });
          const ult = out[out.length - 1];
          if (tipo === 8) { if (!camposVistos) { camposVistos = true; log(`UE cascada: campos de la API: ${Object.keys(m).join(', ')}`); } ult.texto = textoCascada(m); ult.enlace = enlaceCascada(m); }
          else if (esDirecta(ult)) ult.texto = textoDe(m);
        }
        if (!d.results || d.results.length < 100) break;
      }
    }
  }
  const vistos = new Set();
  const lista = out.filter((x) => x.id && !vistos.has(x.id + x.convocatoria) && vistos.add(x.id + x.convocatoria));
  try { await paginasCascada(lista, log); } catch (e) { log(`UE cascada: páginas propias: ${e.message}`); }
  if (lista.length) fs.writeFileSync(path.join('cache', 'europa.json'), JSON.stringify(lista));
  log(`UE (Funding & Tenders): ${lista.length} convocatorias abiertas o próximas (${lista.filter((x) => x.cascada).length} en cascada, ${lista.filter((x) => x.enlace).length} con enlace propio)`);
  return lista;
}

// Convocatorias que puede pedir directamente una persona, una pyme, una asociación o un ayuntamiento vasco
// sin formar un consorcio internacional (criterio del responsable, 15/11/2026): becas individuales (ERC, MSCA
// postdoctorales), premios, EIC Accelerator y las líneas de MEDIA para una sola productora. Las de investigación
// o cooperación en consorcio quedan fuera. Las convocatorias en cascada (tipo 8) no entran aún: muchas son solo
// para un país o una universidad y su enlace es el del proyecto, no el de la convocatoria; por eso pasan por
// reglaCascada, que solo deja las abiertas a solicitantes de cualquier país de la UE (o de España) sin consorcio.
const DIRECTAS = [
  { re: /^HORIZON ERC (Proof of Concept )?Grants$/, para: ['particular'] },
  { re: /MSCA Postdoctoral Fellowships/, para: ['particular'] },
  { re: /Recognition Prize$/, para: ['particular', 'empresa', 'asociacion'] },
  { re: /^HORIZON EIC Accelerator( Blended Finance)?$/, para: ['empresa'] },
];
const MEDIA_UNA = /^CREA-MEDIA-\d{4}-(DEVSLATE|DEVMINISLATE|DEVVGIM|TVONLINE|FILMDIST|FESTIVALS?|CINNET|CINEMANET)/;
function reglaDirecta(c) {
  if (!c) return null;
  if (c.cascada) return reglaCascada(c);
  if (MEDIA_UNA.test(c.id || '')) return { para: ['empresa'] };
  return DIRECTAS.find((d) => d.re.test(c.programa || '')) || null;
}
export const esDirecta = (c) => !!reglaDirecta(c);
// Convocatorias en cascada (open calls de proyectos europeos que reparten fondos a terceros): se publican solo si
// su texto dice que pueden pedirlas solicitantes de cualquier Estado miembro (o de España) y no exige consorcio ni
// estar matriculado en una universidad o máster concreto, ni ser de otro país o región.
const PAISES_FUERA = /\b(Estonia|Estonian|Latvia|Latvian|Lithuania|Lithuanian|Slovenia|Slovenian|Croatia|Croatian|Poland|Polish|Czech|Slovak|Slovakia|Hungary|Hungarian|Romania|Romanian|Bulgaria|Bulgarian|Greece|Greek|Cyprus|Cypriot|Malta|Maltese|Italy|Italian|Portugal|Portuguese|France|French|Belgium|Belgian|Netherlands|Dutch|Luxembourg|Germany|German|Austria|Austrian|Denmark|Danish|Sweden|Swedish|Finland|Finnish|Ireland|Irish|Ukraine|Ukrainian|Moldova|Moldovan|Western Balkans|Baltic|Nordic|Albania|Serbia|Montenegro|Kosovo|North Macedonia|Bosnia|Georgia|Armenia|Turkey|Türkiye|Africa|African|[Ee]nlargement countries|Widening countries)\b/;
const SOLO = /\b(only|exclusively|must be)\b[^.\n]{0,80}\b(registered|established|located|based|resident|enrolled|legal entities)\b[^.\n]{0,30}\bin\b\s+(?!(the\s+)?(EU\b|European|any\b|an?\s+(EU|eligible|Member)|Member|eligible|one of the|Horizon|Spain))/i;
const CONSORCIO = /\b(consortium|consortia)\b[^.\n]{0,60}\b(required|must|mandatory|composed|of at least)\b|\bat least (two|three|2|3) (partners|entities|organisations|organizations|applicants)\b|\bjoint transnational\b|\btransnational (consortium|project)/i;
// «no consortium required», «consortium is not required», «without a consortium»: no exigen consorcio
const SIN_CONSORCIO = /\b(no|not|without)\s+(a\s+|any\s+)?(consortium|consortia)\b[^.\n]{0,30}|\b(consortium|consortia)\s+(is|are)\s+not\s+(required|needed|necessary|mandatory)\b/gi;
const ESTUDIOS = /\b(fee waivers?|tuition|universit(y|ies)|scholarships?|master'?s?|MSc|internships?|traineeships?|summer school|degree|thesis|PhD|doctoral|students?|semester|course|mobility grants?)\b/i;
const ABIERTA_UE = /\b(EU|European Union) Member States?\b|\bMember States? of the (EU|European Union)\b|\bHorizon Europe (associated|eligible) countries\b|\b(established|located|based|registered) in (the )?(EU|European Union|an? (EU|eligible) (country|Member State)|any (EU|European|eligible) (country|Member State))\b|\bSpain\b|\bSpanish\b|\bBasque\b|\bEurope-wide\b|\bEU-27\b|\bEU27\b|\bEU\s*(\/|or|and|&)\s*(Horizon Europe )?Associated Countries\b|\b(any|all) (EU |of the EU )?Member States?\b/i;
// Frase que limita quién puede pedirla a entidades de otros países («NGO established and operating in the Republic of
// Lithuania», «located in the countries where Living Labs are located (Portugal, Germany…)») sin abrirla a toda la UE ni a España.
const DONDE = /\b(established|located|based|registered|resident|operating)\b[^.\n]{0,25}\bin\b/i;
const PAISES_TXT = new RegExp(PAISES_FUERA.source, 'i');
const soloOtrosPaises = (t) => t.split(/(?<=[.;])\s+|\n/).some((f) => DONDE.test(f) && PAISES_TXT.test(f) && !ABIERTA_UE.test(f));
// Solo para unas regiones concretas («SMEs established in the specified regions of…»), salvo que nombre Euskadi
const REGIONES = /\b(specified|eligible|following|selected|participating|target) regions\b/i;
const EUSKADI = /\b(Basque|País Vasco|Pais Vasco|Euskadi)\b/i;
// Motivo por el que una convocatoria en cascada no se publica ('' si se publica). 'sin-pais': el texto no dice
// qué países pueden pedirla; para esas se lee la página propia de la convocatoria (paginasCascada).
function motivoCascada(c) {
  const t = [c.texto || '', c.textoPagina || ''].join('\n');
  if ((c.texto || '').length < 200 || c.estado !== 'abierta') return 'corta';
  const cab = `${c.titulo} ${c.convocatoria}`;
  if (PAISES_FUERA.test(cab) || ESTUDIOS.test(cab)) return 'cabecera';
  if (CONSORCIO.test(t.replace(SIN_CONSORCIO, ' ')) || SOLO.test(t)) return 'restringida';
  if (!ABIERTA_UE.test(t)) return 'sin-pais';
  if (soloOtrosPaises(t) || (REGIONES.test(t) && !EUSKADI.test(t))) return 'restringida';
  return '';
}
function reglaCascada(c) {
  const t = [c.texto || '', c.textoPagina || ''].join('\n');
  if (motivoCascada(c)) return null;
  const para = [];
  if (/\b(SMEs?|start-?ups?|scale-?ups?|companies|enterprises|businesses|micro-?enterprises?)\b/i.test(t)) para.push('empresa');
  if (/\b(researchers?|individuals?|natural persons?|freelancers?|artists?|creators?|innovators?)\b/i.test(t)) para.push('particular');
  if (/\b(NGOs?|non-?profits?|civil society organi[sz]ations?|CSOs?|associations?)\b/i.test(t)) para.push('asociacion');
  if (/\b(municipalit(y|ies)|local authorit(y|ies)|cities|public authorit(y|ies))\b/i.test(t)) para.push('ayuntamiento');
  return para.length ? { para } : null;
}
// Página propia de las convocatorias en cascada cuyo texto en la API no dice qué países pueden pedirlas: se descarga
// (identificándose como EskubatBot, una a una, como mucho PAGINAS_MAX nuevas por día) y se guardan solo las líneas que
// hablan de quién puede pedirla, en cache/europa_paginas.json (se vuelven a leer a los 7 días). No se leen formularios,
// pantallas de acceso ni PDF. Si una página falla, la convocatoria sigue fuera, como hasta ahora.
const PAGINAS = path.join('cache', 'europa_paginas.json');
const PAGINAS_MAX = 40;
const NO_PAGINA = /\.(pdf|docx?|xlsx?|zip)(\?|#|$)|login|signin|sign-in|SelfRegister|privatelogin|\/forms?\/|forms\.(office|cloud\.microsoft|gle)|docs\.google\.com\/forms|hsforms|jotform|typeform|urldefense|\/apply(\/|$)|\/s_Login|\/auth\//i;
const ELEGIB = /\b(eligib\w*|established|located|based in|registered|countr(y|ies)|Member States?|consorti(um|a)|who can apply|applicants?|legal entit(y|ies)|SMEs?)\b/i;
function lineasElegibilidad(html) {
  const lineas = htmlATexto(html).split('\n').filter((l) => l.length > 15 && l.length < 1500);
  const out = [];
  lineas.forEach((l, i) => { if (ELEGIB.test(l)) { out.push(l); if (/:$/.test(l) && lineas[i + 1]) out.push(lineas[i + 1]); } });
  return [...new Set(out)].join('\n').slice(0, 5000);
}
export async function paginasCascada(lista, log) {
  const hoy = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(PAGINAS, 'utf8')); } catch {}
  const caduca = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const cand = lista.filter((c) => c.cascada && c.convocatoria && c.fin && c.fin >= hoy && c.enlace && !NO_PAGINA.test(c.enlace) && motivoCascada(c) === 'sin-pais');
  let nuevas = 0, fallos = 0;
  for (const c of cand) {
    let e = cache[c.enlace];
    if (!e || e.fecha < caduca) {
      if (nuevas >= PAGINAS_MAX) continue;
      nuevas++;
      try { e = { fecha: hoy, texto: lineasElegibilidad(await pedir(c.enlace, { tries: 1, timeout: 20000 })) }; }
      catch (err) { fallos++; e = { fecha: hoy, texto: '', error: String(err.message || err).slice(0, 120) }; }
      cache[c.enlace] = e;
      await sleep(1000);
    }
    if (e.texto) c.textoPagina = e.texto;
  }
  const usadas = new Set(lista.map((c) => c.enlace).filter(Boolean));
  for (const k of Object.keys(cache)) if (!usadas.has(k)) delete cache[k];
  fs.writeFileSync(PAGINAS, JSON.stringify(cache));
  const pasan = cand.filter((c) => c.textoPagina && !motivoCascada(c) && reglaCascada(c)).length;
  log(`UE cascada: ${cand.length} sin países en la API con página propia (${nuevas} descargadas hoy, ${fallos} fallos); ${pasan} pasan el filtro con su página`);
}

// Enlace propio de una convocatoria en cascada (la web del proyecto o su plataforma de solicitud): el primer enlace
// que trae la API en sus campos (links, furtherInformation, description…) fuera de los dominios de la Comisión.
function enlaceCascada(m) {
  const textos = Object.entries(m).filter(([k]) => !/^(url|esST_URL|es_|esDA_|DATASOURCE|DOCUMENT_)/i.test(k))
    .flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((v) => (typeof v === 'string' ? v : JSON.stringify(v || '')));
  for (const t of textos) {
    for (const u of t.match(/https?:\/\/[^\s"'<>()\\]+/g) || []) {
      const l = u.replace(/[.,;:]+$/, '');
      if (!/^https?:\/\/([a-z0-9-]+\.)*(europa\.eu|w3\.org|schema\.org)(\/|$)/i.test(l)) return l;
    }
  }
  return '';
}
// Texto de una convocatoria en cascada: todos los campos de texto de la API (descripción, condiciones, países…)
const NO_TEXTO = /^(identifier|reference|url|type|status|language|languages|startDate|deadlineDate|deadlineModel|es_|DATASOURCE|DOCUMENT_|cftId|callIdentifier|programmePeriod|frameworkProgramme|sortStatus|keywords|links)$/i;
function textoCascada(m) {
  return Object.entries(m).filter(([k]) => !NO_TEXTO.test(k))
    .map(([k, v]) => [k, limpia((Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string').join(' · '))])
    .filter(([, v]) => v && v.length > 3 && !/^\d+$/.test(v))
    .map(([k, v]) => `${k}: ${v}`).join('\n').slice(0, 12000);
}
const limpia = (h) => String(h || '').replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
function textoDe(m) {
  const partes = [['Descripción', m.descriptionByte || m.description], ['Condiciones', m.topicConditions || m.conditions], ['Presupuesto', m.budgetOverview]]
    .map(([t, v]) => [t, limpia(uno(v))]).filter(([, v]) => v && v.length > 20);
  return partes.map(([t, v]) => `${t}:\n${v}`).join('\n\n').slice(0, 12000);
}

// Las convocatorias directas, con el formato de las demás fuentes (se publican con ámbito UE y se categorizan como el resto)
export function ayudasDirectasUE(lista, log = console.log) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vistos = new Set();
  const out = [];
  for (const c of lista || []) {
    const r = reglaDirecta(c);
    if (!r || !c.url || !c.fin || c.fin < hoy || vistos.has(c.id)) continue;
    if (c.cascada) {
      const clave = c.id + '|' + c.convocatoria;
      if (vistos.has(clave) || !c.convocatoria) continue;
      vistos.add(clave);
      out.push({
        id: 'ue-cs-' + String(c.convocatoria).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80),
        titulo: c.convocatoria.trim(),
        organismo: 'Unión Europea',
        ambito: { nivel: 'ue', nombre: 'Unión Europea', terr: null },
        inicio: c.inicio || null, fin: c.fin, permanente: false,
        resumen: '', dirigido: '', cuantia: '', presupuesto: null,
        para: r.para, temas: [],
        url: c.url, origen: 'europa',
        fuentes: [{ nombre: 'Portal de financiación de la Comisión Europea (convocatoria en cascada)', url: c.url }, ...(c.enlace ? [{ nombre: 'Página de la convocatoria (proyecto ' + c.titulo.trim() + ')', url: c.enlace }] : [])],
        _texto: [c.convocatoria.trim(), 'Proyecto europeo que la convoca: ' + c.titulo, 'Convocatoria en cascada (fondos europeos repartidos por un proyecto a terceros)', 'Identificador: ' + c.id, c.inicio ? 'Apertura: ' + c.inicio : '', 'Cierre: ' + c.fin, c.texto || '', c.textoPagina ? 'Página de la convocatoria (requisitos):\n' + c.textoPagina : ''].filter(Boolean).join('\n'),
      });
      continue;
    }
    vistos.add(c.id);
    const titulo = c.titulo && c.titulo !== c.id && !/^short proposal$/i.test(c.titulo) ? c.titulo : (c.convocatoria || c.titulo);
    const programa = c.programa ? c.programa.replace(/\s+/g, ' ') : 'Unión Europea';
    out.push({
      id: 'ue-' + String(c.id).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      titulo: /^short proposal$/i.test(c.titulo || '') ? `EIC Accelerator (${c.id})` : `${titulo} (${c.id})`,
      organismo: 'Unión Europea',
      ambito: { nivel: 'ue', nombre: 'Unión Europea', terr: null },
      inicio: c.inicio || null, fin: c.fin, permanente: false,
      resumen: '', dirigido: '', cuantia: '', presupuesto: null,
      para: r.para, temas: [],
      url: c.url, origen: 'europa',
      fuentes: [{ nombre: 'Portal de financiación de la Comisión Europea', url: c.url }],
      _texto: [c.titulo, c.convocatoria ? 'Convocatoria: ' + c.convocatoria : '', 'Tipo de acción: ' + programa, 'Identificador: ' + c.id, c.inicio ? 'Apertura: ' + c.inicio : '', 'Cierre: ' + c.fin, c.texto || ''].filter(Boolean).join('\n'),
    });
  }
  log(`UE (Funding & Tenders): ${out.length} convocatorias que se piden sin consorcio (${out.filter((x) => x.id.startsWith('ue-cs-')).length} en cascada)`);
  return out;
}
