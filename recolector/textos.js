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
