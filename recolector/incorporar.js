// Incorpora los resúmenes escritos por la tarea de Claude (cache/nuevos.json):
// los valida contra el texto de la fuente, los guarda en cache/resumenes.json y los aplica a publico/ayudas.json.
import fs from 'node:fs';
import { validar, aplicar, huella } from './resumen.js';
import { comprobarTitulo, aplicarTitulos } from './titulos.js';
import { textosClaude } from './textos.js';

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
  // Las cifras se validan también contra los documentos oficiales que copió la tarea (cache/textos_claude);
  // la huella es solo la del texto del recolector, para que la ficha no vuelva a pendientes.
  const v = validar(r, fuente + textosClaude(r.id));
  campos += v.errores.length;
  cache[r.id] = { h: huella(fuente), r: v, modelo: 'claude', fecha: new Date().toISOString().slice(0, 10) };
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
  console.log(`Incorporados ${ok} resúmenes (${rechazados} sin ayuda correspondiente, ${campos} avisos de las comprobaciones). Ayudas con resumen: ${n}/${pub.ayudas.length}. Pendientes: ${leer('cache/pendientes.json', []).length}`);
}

// Títulos estandarizados (cache/titulos_nuevos.json: {"título original": {"es": "…", "eu": "…"}})
const titNuevos = leer('cache/titulos_nuevos.json', null);
if (titNuevos) {
  const titulos = leer('cache/titulos.json', {});
  let n = 0, mal = 0;
  for (const [orig, v] of Object.entries(titNuevos)) {
    const es = String((v && v.es) || '').replace(/\s+/g, ' ').trim();
    const eu = String((v && v.eu) || '').replace(/\s+/g, ' ').trim();
    const e = comprobarTitulo(es, orig);
    if (!eu) e.push('falta el título en euskera');
    if (e.length) { mal++; console.log(`✗ «${orig}» → «${es}»: ${e.join('; ')}`); continue; }
    titulos[orig] = { es: es.charAt(0).toUpperCase() + es.slice(1), eu: eu.charAt(0).toUpperCase() + eu.slice(1) };
    n++;
  }
  fs.writeFileSync('cache/titulos.json', JSON.stringify(titulos, null, 1));
  fs.writeFileSync('cache/titulos_pendientes.json', JSON.stringify(leer('cache/titulos_pendientes.json', []).filter((p) => !titulos[p.original]), null, 1));
  fs.rmSync('cache/titulos_nuevos.json', { force: true });
  const pub2 = leer('publico/ayudas.json', null);
  if (pub2) {
    aplicarTitulos([...pub2.ayudas, ...(pub2.previstas || [])], titulos, leer('cache/titulos_eu.json', {}));
    fs.writeFileSync('publico/ayudas.json', JSON.stringify(pub2));
  }
  console.log(`Títulos incorporados: ${n}. Rechazados: ${mal}. Pendientes: ${leer('cache/titulos_pendientes.json', []).length}`);
}
