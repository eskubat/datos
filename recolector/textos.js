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
