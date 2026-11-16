// Próximas: ayudas que se convocaron en años anteriores y que probablemente se abrirán pronto.
// La tarea programada escribe una ficha PRUDENTE a partir de la última convocatoria (docs/PROXIMAS.md):
// nada se presenta como seguro; importes y requisitos son «de la última convocatoria».
// Caché: cache/proximas.json {id: {h, r}}; pendientes: cache/proximas_pendientes.json; textos: cache/fuentes_prox/<id>.txt
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VERSION = 'p1';
const TIPOS = ['particular', 'autonomo', 'empresa', 'asociacion', 'ayuntamiento'];
const DIR = path.join('cache', 'fuentes_prox');
export const huellaP = (t) => crypto.createHash('sha1').update(VERSION + ':' + String(t || '')).digest('hex').slice(0, 16);
export const archivoP = (id) => path.join(DIR, String(id).replace(/[^\w.-]/g, '_').slice(0, 60) + '-' + huellaP(id).slice(0, 8) + '.txt');
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const numeros = (t) => [...String(t || '').matchAll(/\d[\d.]*(?:,\d+)?/g)].map((m) => m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/\.$/, ''));
const limpia = (x) => String(x || '').replace(/\s+/g, ' ').trim();
const lineas = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(limpia).filter(Boolean);
// Promesas que no se pueden hacer de una ayuda que aún no está convocada
const PROMESA = /\b(se abrir[aá]|abrir[aá] el|estar[aá] abierta|podr[aá]s pedirla (el|desde|a partir)|el plazo ser[aá]|se convocar[aá] (el|en)|recibir[aá]s)\b/i;

export function comprobarProxima(r, fuente = '') {
  const e = [];
  const nums = new Set(numeros(fuente));
  const todo = [r.que_suele, ...lineas(r.cuanto_ultima), ...lineas(r.quien_suele), ...lineas(r.requisitos_ultimos)].join(' ');
  if (!r.que_suele) e.push('falta que_suele');
  if (lineas(r.que_suele).length > 1) e.push('que_suele debe ser un solo párrafo narrativo');
  if (r.que_suele && String(r.que_suele).split(/(?<=[.!])\s+/).filter(Boolean).length < 2) e.push('que_suele debe tener al menos dos frases completas');
  if (PROMESA.test(todo)) e.push('no prometas fechas ni resultados: la ayuda aún no está convocada (usa «en la última convocatoria…», «suele…»)');
  if (/[¿?]/.test(todo)) e.push('sin preguntas');
  if (lineas(r.cuanto_ultima).some((l) => /\d/.test(l) && !/\b(19|20)\d\d\b|[uú]ltima convocatoria/i.test(l))) e.push('cada importe de cuanto_ultima debe decir de qué convocatoria es («en 2025: …» o «en la última convocatoria: …»)');
  const malas = numeros(todo).filter((n) => n.replace(/\D/g, '').length >= 2 && !nums.has(n));
  if (fuente && malas.length) e.push(`cifras que no aparecen en la documentación: ${[...new Set(malas)].slice(0, 6).join(', ')}`);
  if (!Array.isArray(r.tipos) || !r.tipos.length || r.tipos.some((t) => !TIPOS.includes(t))) e.push('tipos: uno o varios de particular, autonomo, empresa, asociacion, ayuntamiento');
  if (!['probable', 'dudosa', 'no'].includes(r.continuidad)) e.push('continuidad: probable, dudosa o no');
  if (!r.que_suele_eu) e.push('falta que_suele_eu');
  return e;
}

export function validarProxima(r, fuente) {
  const nums = new Set(numeros(fuente));
  const ok = (t) => numeros(t).every((n) => n.replace(/\D/g, '').length < 2 || nums.has(n));
  const L = (v) => lineas(v).filter((l) => ok(l) && !PROMESA.test(l) && !/[¿?]/.test(l));
  return {
    errores: comprobarProxima(r, fuente),
    titulo: limpia(r.titulo), titulo_eu: limpia(r.titulo_eu),
    que_suele: ok(r.que_suele) && !PROMESA.test(r.que_suele) ? limpia(r.que_suele) : '',
    cuanto_ultima: L(r.cuanto_ultima), quien_suele: L(r.quien_suele), requisitos_ultimos: L(r.requisitos_ultimos).slice(0, 10),
    que_suele_eu: limpia(r.que_suele_eu), cuanto_ultima_eu: lineas(r.cuanto_ultima_eu), quien_suele_eu: lineas(r.quien_suele_eu), requisitos_ultimos_eu: lineas(r.requisitos_ultimos_eu).slice(0, 10),
    tipos: (r.tipos || []).filter((t) => TIPOS.includes(t)),
    continuidad: ['probable', 'dudosa', 'no'].includes(r.continuidad) ? r.continuidad : 'dudosa',
    nota: limpia(r.nota),
    ultima: Number(r.ultima_convocatoria) || null,
  };
}

// Aplica las fichas a las previstas. Las que la tarea marcó como discontinuadas («no») no se publican.
export function aplicarProximas(previstas, fuentes, cache) {
  return previstas.filter((p) => {
    const c = cache[p.id];
    if (!c || !fuentes[p.id] || c.h !== huellaP(fuentes[p.id])) return true;
    const r = c.r;
    if (r.continuidad === 'no') return false;
    if (r.titulo) { if (!p.tituloOficial) p.tituloOficial = p.titulo; p.titulo = r.titulo; }
    if (r.titulo_eu) p.tituloEu = r.titulo_eu;
    Object.assign(p, {
      resumen: r.que_suele, cuantia: r.cuanto_ultima.join('\n'), dirigido: r.quien_suele.join('\n'), requisitos: r.requisitos_ultimos,
      para: r.tipos, continuidad: r.continuidad, ultimaConvocatoria: r.ultima || (p.años || []).slice(-1)[0] || null, fichaIA: true,
      eu: { titulo: r.titulo_eu || '', resumen: r.que_suele_eu, cuantia: r.cuanto_ultima_eu.join('\n'), dirigido: r.quien_suele_eu.join('\n'), requisitos: r.requisitos_ultimos_eu },
    });
    return true;
  });
}

// Documentación de la última convocatoria de cada prevista + lista de pendientes para la tarea
export async function prepararProximas(previstas, { documentacion, log = console.log, max = 200 } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const cerca = previstas.slice(0, max).filter((p) => p.url);
  let docs = {};
  try { docs = await documentacion(cerca, { log: (m) => log('Próximas · ' + m), max: 40000 }); } catch (e) { log(`Próximas: ${e.message}`); }
  const fuentes = {};
  for (const p of cerca) {
    const t = [`### Previsión: se convocó en ${(p.años || []).join(', ')}; suele abrir en el mes ${p.mesPrevisto}`, docs[p.id] || ''].join('\n\n').trim();
    if (docs[p.id]) { fuentes[p.id] = t; fs.writeFileSync(archivoP(p.id), t); }
  }
  const vivos = new Set(Object.keys(fuentes).map((id) => path.basename(archivoP(id))));
  for (const f of fs.readdirSync(DIR)) if (!vivos.has(f)) fs.rmSync(path.join(DIR, f));
  const cache = leer(path.join('cache', 'proximas.json'), {});
  const pend = cerca.filter((p) => fuentes[p.id] && (!cache[p.id] || cache[p.id].h !== huellaP(fuentes[p.id])))
    .map((p) => ({ id: p.id, h: huellaP(fuentes[p.id]), titulo: p.titulo, mes: p.mesPrevisto, años: p.años, organismo: p.organismo, archivo: archivoP(p.id) }));
  fs.writeFileSync(path.join('cache', 'proximas_pendientes.json'), JSON.stringify(pend, null, 1));
  log(`Próximas: ${Object.keys(fuentes).length} con documentación, ${pend.length} pendientes de ficha`);
  return { fuentes, cache };
}
