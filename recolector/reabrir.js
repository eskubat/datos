// Vuelve a poner en cache/pendientes.json ayudas ya categorizadas, para rehacer su ficha
// (p. ej. al aplicar una cuestión de la página «Eskubat — Cuestiones abiertas").
// Uso: node recolector/reabrir.js <id> [<id> …]
import fs from 'node:fs';
import path from 'node:path';
import { huella } from './resumen.js';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const nombreF = (id) => String(id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huella(id).slice(0, 8) + '.txt';
const ids = process.argv.slice(2);
if (!ids.length) { console.log('Uso: node recolector/reabrir.js <id> [<id> …]'); process.exit(1); }
const pend = leer('cache/pendientes.json', []);
const pub = leer('publico/ayudas.json', { ayudas: [] });
const porId = new Map(pub.ayudas.map((a) => [a.id, a]));
const nuevos = [];
for (const id of ids) {
  if (pend.some((p) => p.id === id)) { console.log(`${id}: ya estaba en pendientes`); continue; }
  const archivo = path.join('cache', 'fuentes', nombreF(id));
  let texto;
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch { console.log(`✗ ${id}: no existe ${archivo}`); continue; }
  const a = porId.get(id) || {};
  nuevos.push({ id, h: huella(texto), titulo: a.tituloOficial || a.titulo || id, organismoSugerido: a.organismoId || '', organismoFuente: a.organismoFuente || '', archivo, caracteres: texto.length });
  console.log(`✓ ${id} → pendientes (${archivo})`);
}
fs.writeFileSync('cache/pendientes.json', JSON.stringify([...nuevos, ...pend], null, 1));
