// Incorpora los resúmenes escritos por la tarea de Claude (cache/nuevos.json):
// los valida contra el texto de la fuente, los guarda en cache/resumenes.json y los aplica a publico/ayudas.json.
import fs from 'node:fs';
import { validar, aplicar, huella, huellaEstable } from './resumen.js';
import { comprobarTitulo, aplicarTitulos } from './titulos.js';
import { textosClaude } from './textos.js';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pendientes = leer('cache/pendientes.json', []);
const porId = new Map(pendientes.map((p) => [p.id, p]));
const nuevos = leer('cache/nuevos.json', []);
const cache = leer('cache/resumenes.json', {});
let ok = 0, rechazados = 0, campos = 0;
const hechos = new Set();
for (const r of nuevos) {
  const p = porId.get(r.id);
  if (!p) { rechazados++; continue; }
  let fuente = '';
  try { fuente = fs.readFileSync(p.archivo, 'utf8'); } catch { rechazados++; continue; }
  // Las cifras se validan también contra los documentos oficiales que copió la tarea (cache/textos_claude);
  // la huella es solo la del texto del recolector, para que la ficha no vuelva a pendientes.
  const v = validar(r, fuente + textosClaude(r.id));
  campos += v.errores.length;
  cache[r.id] = { h: huella(fuente), he: huellaEstable(r.id, fuente), r: v, modelo: 'claude', fecha: new Date().toISOString().slice(0, 10) };
  hechos.add(r.id);
  ok++;
}
fs.writeFileSync('cache/resumenes.json', JSON.stringify(cache));
// Solo salen de la cola las ayudas cuya ficha se ha incorporado en esta pasada. Las reabiertas (reabrir.js) y las
// retenidas con ocultarHastaFicha tienen ya una ficha con la misma huella que su entrada en pendientes, así que
// comparar huellas las sacaría de la cola sin haberlas rehecho.
fs.writeFileSync('cache/pendientes.json', JSON.stringify(pendientes.filter((p) => !hechos.has(p.id)), null, 1));
fs.rmSync('cache/nuevos.json', { force: true });
// Las reabiertas que se han rehecho dejan de forzarse en la cola del recolector
{
  const reab = leer('cache/reabiertas.json', null);
  if (reab && [...hechos].some((id) => reab[id])) {
    for (const id of hechos) delete reab[id];
    fs.writeFileSync('cache/reabiertas.json', JSON.stringify(reab, null, 1));
  }
}

// Aplicar a lo publicado (fuentes = texto de pendientes + huellas ya guardadas)
const pub = leer('publico/ayudas.json', null);
if (pub) {
  const fuentes = {};
  for (const p of pendientes) { try { fuentes[p.id] = fs.readFileSync(p.archivo, 'utf8'); } catch {} }
  // Las ya resumidas que no están en pendientes: su texto sigue en cache/fuentes/
  for (const a of pub.ayudas) { if (!fuentes[a.id]) { try { fuentes[a.id] = fs.readFileSync('cache/fuentes/' + String(a.id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huella(a.id).slice(0, 8) + '.txt', 'utf8'); } catch {} } }
  // Fichas anteriores sin huella estable: se le añade si su texto sigue siendo el de la ficha
  let conHe = 0;
  for (const [id, t] of Object.entries(fuentes)) { const c = cache[id]; if (c && !c.he && c.h === huella(t)) { c.he = huellaEstable(id, t); conHe++; } }
  if (conHe) fs.writeFileSync('cache/resumenes.json', JSON.stringify(cache));
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

// Próximas (cache/proximas_nuevas.json) — docs/PROXIMAS.md
import { validarProxima, aplicarProximas, huellaP } from './proximas.js';
const nuevasP = leer('cache/proximas_nuevas.json', null);
if (nuevasP) {
  const pendP = leer('cache/proximas_pendientes.json', []);
  const porIdP = new Map(pendP.map((p) => [p.id, p]));
  const cacheP = leer('cache/proximas.json', {});
  let okP = 0;
  for (const r of nuevasP) {
    const p = porIdP.get(r.id); if (!p) continue;
    let fuente = ''; try { fuente = fs.readFileSync(p.archivo, 'utf8'); } catch { continue; }
    // La huella es solo del texto del recolector; las cifras se validan también contra cache/textos_claude
    cacheP[r.id] = { h: huellaP(fuente), r: validarProxima(r, fuente + textosClaude(r.id)), fecha: new Date().toISOString().slice(0, 10) };
    okP++;
  }
  fs.writeFileSync('cache/proximas.json', JSON.stringify(cacheP));
  fs.writeFileSync('cache/proximas_pendientes.json', JSON.stringify(pendP.filter((p) => !cacheP[p.id] || cacheP[p.id].h !== p.h), null, 1));
  fs.rmSync('cache/proximas_nuevas.json', { force: true });
  const pub2 = leer('publico/ayudas.json', null);
  if (pub2 && pub2.previstas) {
    const fP = {};
    for (const p of pub2.previstas) { try { fP[p.id] = fs.readFileSync('cache/fuentes_prox/' + String(p.id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huellaP(p.id).slice(0, 8) + '.txt', 'utf8'); } catch {} }
    pub2.previstas = aplicarProximas(pub2.previstas, fP, cacheP);
    fs.writeFileSync('publico/ayudas.json', JSON.stringify(pub2));
  }
  console.log(`Próximas incorporadas: ${okP}. Pendientes: ${leer('cache/proximas_pendientes.json', []).length}`);
}
