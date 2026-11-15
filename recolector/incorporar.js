// Incorpora los resúmenes escritos por la tarea de Claude (cache/nuevos.json):
// los valida contra el texto de la fuente, los guarda en cache/resumenes.json y los aplica a publico/ayudas.json.
import fs from 'node:fs';
import { validar, aplicar, huella } from './resumen.js';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pendientes = leer('cache/pendientes.json', []);
const porId = new Map(pendientes.map((p) => [p.id, p]));
const nuevos = leer('cache/nuevos.json', []);
const cache = leer('cache/resumenes.json', {});
let ok = 0, rechazados = 0, campos = 0;
for (const r of nuevos) {
  const p = porId.get(r.id);
  if (!p) { rechazados++; continue; }
  let fuente = '';
  try { fuente = fs.readFileSync(p.archivo, 'utf8'); } catch { rechazados++; continue; }
  const v = validar(r, fuente);
  const cuenta = (x) => (Array.isArray(x) ? x : []).reduce((n, g) => n + (g && typeof g === 'object' ? (g.items || []).length : 1), 0);
  const total = ['titulo', 'queEs'].filter((k) => r[k]).length + ['cuantia', 'quien', 'requisitos'].reduce((n, k) => n + cuenta(r[k]), 0);
  const quedan = ['titulo', 'queEs'].filter((k) => v[k]).length + ['cuantia', 'quien', 'requisitos'].reduce((n, k) => n + cuenta(v[k]), 0);
  campos += total - quedan;
  cache[r.id] = { h: p.h, r: v, modelo: 'claude', fecha: new Date().toISOString().slice(0, 10) };
  ok++;
}
fs.writeFileSync('cache/resumenes.json', JSON.stringify(cache));
fs.writeFileSync('cache/pendientes.json', JSON.stringify(pendientes.filter((p) => !cache[p.id] || cache[p.id].h !== p.h)));
fs.rmSync('cache/nuevos.json', { force: true });

// Aplicar a lo publicado (fuentes = texto de pendientes + huellas ya guardadas)
const pub = leer('publico/ayudas.json', null);
if (pub) {
  const fuentes = {};
  for (const p of pendientes) { try { fuentes[p.id] = fs.readFileSync(p.archivo, 'utf8'); } catch {} }
  // Las ya resumidas que no están en pendientes: su texto sigue en cache/fuentes/
  for (const a of pub.ayudas) { if (!fuentes[a.id]) { try { fuentes[a.id] = fs.readFileSync('cache/fuentes/' + String(a.id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huella(a.id).slice(0, 8) + '.txt', 'utf8'); } catch {} } }
  const n = aplicar(pub.ayudas, fuentes, cache);
  pub.resumidas = n;
  fs.writeFileSync('publico/ayudas.json', JSON.stringify(pub));
  console.log(`Incorporados ${ok} resúmenes (${rechazados} sin ayuda correspondiente, ${campos} frases descartadas por cifras no verificables). Ayudas con resumen: ${n}/${pub.ayudas.length}. Pendientes: ${leer('cache/pendientes.json', []).length}`);
}

// Títulos en euskera (cache/titulos_nuevos.json: {"título en castellano": "título en euskera"})
const titNuevos = leer('cache/titulos_nuevos.json', null);
if (titNuevos) {
  const titEu = leer('cache/titulos_eu.json', {});
  const nums = (t) => (String(t).match(/\d+/g) || []).join(',');
  let n = 0;
  for (const [es, eu] of Object.entries(titNuevos)) {
    const e = String(eu || '').replace(/\s+/g, ' ').trim();
    if (!e || e.length > 160 || nums(e) !== nums(es) || e === e.toUpperCase()) continue;
    titEu[es] = e.charAt(0).toUpperCase() + e.slice(1); n++;
  }
  fs.writeFileSync('cache/titulos_eu.json', JSON.stringify(titEu, null, 1));
  fs.writeFileSync('cache/titulos_pendientes.json', JSON.stringify(leer('cache/titulos_pendientes.json', []).filter((t) => !titEu[t]), null, 1));
  fs.rmSync('cache/titulos_nuevos.json', { force: true });
  const pub2 = leer('publico/ayudas.json', null);
  if (pub2) {
    for (const a of [...pub2.ayudas, ...(pub2.previstas || [])]) if (titEu[a.titulo]) a.tituloEu = titEu[a.titulo];
    fs.writeFileSync('publico/ayudas.json', JSON.stringify(pub2));
  }
  console.log(`Títulos en euskera incorporados: ${n}. Pendientes: ${leer('cache/titulos_pendientes.json', []).length}`);
}
