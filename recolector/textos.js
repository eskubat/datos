// Documentos oficiales que la tarea de Claude ha leído por su cuenta (BOPV, BOTHA, BOB, BOG, BOE, anexos…)
// cuando el texto del recolector está incompleto. Se guardan en cache/textos_claude/<id>.txt, cada uno con su
// cabecera «### Documento oficial (copiado por la tarea): <url>». Cuentan como fuente para las comprobaciones,
// pero no entran en la huella de la ayuda.
import fs from 'node:fs';
import path from 'node:path';

export const DIR_TEXTOS = path.join('cache', 'textos_claude');
export const archivoTextos = (id) => path.join(DIR_TEXTOS, String(id).replace(/[^\w.-]/g, '_').slice(0, 120) + '.txt');
export function textosClaude(id) {
  try { return '\n\n' + fs.readFileSync(archivoTextos(id), 'utf8'); } catch { return ''; }
}

// Secciones «### …: url» del texto del recolector que vienen de cache/docs_extra.json y cuyo documento ya
// está copiado en cache/textos_claude/<id>.txt (la tarea de fichas lo copia y añade la URL a docs_extra a la vez).
// Al descargarlas el recolector en la pasada siguiente no cambia lo que la ficha ya leyó, así que se quitan
// para calcular la huella y la ficha no vuelve a la cola.
let DOCS_EXTRA = null;
function docsExtra() {
  if (!DOCS_EXTRA) { try { DOCS_EXTRA = JSON.parse(fs.readFileSync(path.join('cache', 'docs_extra.json'), 'utf8')); } catch { DOCS_EXTRA = {}; } }
  return DOCS_EXTRA;
}
export function docsCopiados(id, extra = docsExtra()) {
  const urls = extra[id] || [];
  if (!urls.length) return [];
  const copiados = textosClaude(id);
  return copiados ? urls.filter((u) => copiados.includes(u)) : [];
}
export function sinDocsCopiados(id, t) {
  t = String(t || '');
  const ya = new Set(docsCopiados(id));
  if (!ya.size) return t;
  return t.split(/\n\n(?=### )/).filter((p) => {
    const m = p.match(/^### [^\n]*: (\S+)\n/);
    return !(m && ya.has(m[1]));
  }).join('\n\n');
}
// Sin las líneas de cabecera «### Ficha oficial: url»: que cambie solo la URL de un documento (p. ej. la ficha
// de euskadi.eus de web01-tramite a web01-s2hhome) no cambia su contenido.
export const sinCabeceras = (t) => String(t || '').replace(/^### [^\n]*$\n?/gm, '');

// Documentos de la BDNS que se añaden a una convocatoria ya resumida sin cambiar lo que dice (tarea
// bdns-docs-otro-idioma): la traducción al euskera de un documento que ya estaba en castellano y los formularios
// de solicitud. No se quitan del texto que lee la tarea de fichas; solo se prueban versiones del texto sin ellos
// para ver si la ficha guardada se hizo con el texto de antes de que llegaran (así la ficha no vuelve a la cola).
const SECCION_BDNS = /^### [^\n]*: https:\/\/www\.infosubvenciones\.es\/bdnstrans\/api\/convocatorias\/documentos\?[^\n]*idDocumento=\d+\n/;
const palabras = (t, re) => (String(t).slice(0, 6000).match(re) || []).length;
const enEuskera = (t) => palabras(t, /\b(eta|edo|da|du|dute|dira|dela|duen|bat|ere|egin|behar|izango|hau|honen|horren|zein|baita|dituzten|egiteko)\b/gi)
  > palabras(t, /\b(de|la|el|que|los|las|del|por|para|con|una|se)\b/gi);
const esFormulario = (t) => t.length < 20000
  && /\b(formulario|solicitud|instancia|impreso|eskaera|eskabide|inprimaki|declaraci[oó]n responsable|erantzukizunpeko adierazpena|titular y cuenta|datos bancarios|alta de terceros|gastos derivados|ingresos obtenidos)\b|^[A-Z]{2}\d{4}_D\d{3}\b/im.test(t.split('\n').slice(1, 16).join('\n'));
export function variantesSinDocsSecundarios(t) {
  const partes = String(t || '').split(/\n\n(?=### )/);
  const bdns = partes.map((p, i) => (SECCION_BDNS.test(p) ? i : -1)).filter((i) => i >= 0);
  if (bdns.length < 2) return [];
  const hayCastellano = bdns.some((i) => !enEuskera(partes[i]));
  const sec = bdns.filter((i) => (hayCastellano && enEuskera(partes[i])) || esFormulario(partes[i]));
  // Nunca se quitan todos los documentos de la BDNS
  if (!sec.length || sec.length >= bdns.length) return [];
  const sub = sec.length <= 4 ? sec : sec.slice(0, 4);
  const out = [];
  for (let m = 1; m < 1 << sub.length; m++) {
    const fuera = new Set(sub.filter((_, k) => m & (1 << k)));
    out.push(partes.filter((_, i) => !fuera.has(i)).join('\n\n'));
  }
  if (sec.length > 4) out.push(partes.filter((_, i) => !sec.includes(i)).join('\n\n'));
  return out;
}
