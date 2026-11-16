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
          if (esDirecta(ult)) ult.texto = textoDe(m);
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
// para un país o una universidad y su enlace es el del proyecto, no el de la convocatoria.
const DIRECTAS = [
  { re: /^HORIZON ERC (Proof of Concept )?Grants$/, para: ['particular'] },
  { re: /MSCA Postdoctoral Fellowships/, para: ['particular'] },
  { re: /Recognition Prize$/, para: ['particular', 'empresa', 'asociacion'] },
  { re: /^HORIZON EIC Accelerator( Blended Finance)?$/, para: ['empresa'] },
];
const MEDIA_UNA = /^CREA-MEDIA-\d{4}-(DEVSLATE|DEVMINISLATE|DEVVGIM|TVONLINE|FILMDIST|FESTIVALS?|CINNET|CINEMANET)/;
function reglaDirecta(c) {
  if (!c || c.cascada) return null;
  if (MEDIA_UNA.test(c.id || '')) return { para: ['empresa'] };
  return DIRECTAS.find((d) => d.re.test(c.programa || '')) || null;
}
export const esDirecta = (c) => !!reglaDirecta(c);
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
  log(`UE (Funding & Tenders): ${out.length} convocatorias que se piden sin consorcio`);
  return out;
}
