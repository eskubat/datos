// Convocatorias europeas abiertas y próximas: Funding & Tenders Portal (Comisión Europea), búsqueda pública SEDIA.
// No se publican todas en la app (son cientos y muy técnicas): sirven para cotejar las noticias de ayudas europeas
// y para que la tarea programada añada las que correspondan. Se guardan en cache/europa.json.
import fs from 'node:fs';
import path from 'node:path';

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
          if (tipo === 8) { if (!camposVistos) { camposVistos = true; log(`UE cascada: campos de la API: ${Object.keys(m).join(', ')}`); } ult.texto = textoCascada(m); }
          else if (esDirecta(ult)) ult.texto = textoDe(m);
        }
        if (!d.results || d.results.length < 100) break;
      }
    }
  }
  const vistos = new Set();
  const lista = out.filter((x) => x.id && !vistos.has(x.id + x.convocatoria) && vistos.add(x.id + x.convocatoria));
  if (lista.length) fs.writeFileSync(path.join('cache', 'europa.json'), JSON.stringify(lista));
  log(`UE (Funding & Tenders): ${lista.length} convocatorias abiertas o próximas`);
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
const PAISES_FUERA = /\b(Estonia|Estonian|Latvia|Latvian|Lithuania|Lithuanian|Slovenia|Slovenian|Croatia|Croatian|Poland|Polish|Czech|Slovak|Slovakia|Hungary|Hungarian|Romania|Romanian|Bulgaria|Bulgarian|Greece|Greek|Cyprus|Cypriot|Malta|Maltese|Italy|Italian|Portugal|Portuguese|France|French|Belgium|Belgian|Netherlands|Dutch|Luxembourg|Germany|German|Austria|Austrian|Denmark|Danish|Sweden|Swedish|Finland|Finnish|Ireland|Irish|Ukraine|Ukrainian|Moldova|Moldovan|Western Balkans|Baltic|Nordic|Albania|Serbia|Montenegro|Kosovo|North Macedonia|Bosnia|Georgia|Armenia|Turkey|Türkiye|Africa|African)\b/;
const SOLO = /\b(only|exclusively|must be)\b[^.\n]{0,80}\b(registered|established|located|based|resident|enrolled|legal entities)\b[^.\n]{0,30}\bin\b\s+(?!(the\s+)?(EU\b|European|any\b|an?\s+(EU|eligible|Member)|Member|eligible|one of the|Horizon|Spain))/i;
const CONSORCIO = /\b(consortium|consortia)\b[^.\n]{0,60}\b(required|must|mandatory|composed|of at least)\b|\bat least (two|three|2|3) (partners|entities|organisations|organizations|applicants)\b|\bjoint transnational\b|\btransnational (consortium|project)/i;
const ESTUDIOS = /\b(scholarships?|master'?s?|MSc|internships?|traineeships?|summer school|degree|thesis|PhD|doctoral|students?|semester|course|mobility grants?)\b/i;
const ABIERTA_UE = /\b(EU|European Union) Member States?\b|\bMember States? of the (EU|European Union)\b|\bHorizon Europe (associated|eligible) countries\b|\b(established|located|based|registered) in (the )?(EU|European Union|an? (EU|eligible) (country|Member State)|any (EU|European|eligible) (country|Member State))\b|\bSpain\b|\bSpanish\b|\bBasque\b|\bEurope-wide\b|\bEU-27\b|\bEU27\b/i;
function reglaCascada(c) {
  const t = c.texto || '';
  if (t.length < 200 || c.estado !== 'abierta') return null;
  const cab = `${c.titulo} ${c.convocatoria}`;
  if (PAISES_FUERA.test(cab) || ESTUDIOS.test(cab)) return null;
  if (CONSORCIO.test(t) || SOLO.test(t) || !ABIERTA_UE.test(t)) return null;
  const para = [];
  if (/\b(SMEs?|start-?ups?|scale-?ups?|companies|enterprises|businesses|micro-?enterprises?)\b/i.test(t)) para.push('empresa');
  if (/\b(researchers?|individuals?|natural persons?|freelancers?|artists?|creators?|innovators?)\b/i.test(t)) para.push('particular');
  if (/\b(NGOs?|non-?profits?|civil society organi[sz]ations?|CSOs?|associations?)\b/i.test(t)) para.push('asociacion');
  if (/\b(municipalit(y|ies)|local authorit(y|ies)|cities|public authorit(y|ies))\b/i.test(t)) para.push('ayuntamiento');
  return para.length ? { para } : null;
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
        fuentes: [{ nombre: 'Portal de financiación de la Comisión Europea (convocatoria en cascada)', url: c.url }],
        _texto: [c.convocatoria.trim(), 'Proyecto europeo que la convoca: ' + c.titulo, 'Convocatoria en cascada (fondos europeos repartidos por un proyecto a terceros)', 'Identificador: ' + c.id, c.inicio ? 'Apertura: ' + c.inicio : '', 'Cierre: ' + c.fin, c.texto || ''].filter(Boolean).join('\n'),
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
