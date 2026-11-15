// Comprueba cache/nuevos.json con las reglas de docs/CATEGORIZACION.md (sección 11) antes de incorporarlo.
// Uso: node recolector/comprobar.js  → lista los errores de cada ficha. Corrige y repite hasta que no haya errores
// (o marca revision_manual si un dato de la fuente no permite cumplir una regla).
import fs from 'node:fs';
import { comprobar } from './resumen.js';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pend = new Map(leer('cache/pendientes.json', []).map((p) => [p.id, p]));
let mal = 0;
for (const r of leer('cache/nuevos.json', [])) {
  const p = pend.get(r.id);
  let fuente = '';
  try { fuente = fs.readFileSync(p.archivo, 'utf8'); } catch {}
  const e = p ? comprobar(r, fuente) : ['id no está en cache/pendientes.json'];
  if (e.length) { mal++; console.log(`\n✗ ${r.id}\n  - ${e.join('\n  - ')}`); }
}
console.log(mal ? `\n${mal} fichas con errores` : 'Todas las fichas cumplen las reglas');
