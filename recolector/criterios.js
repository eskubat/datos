// Criterios de filtro de cada ayuda (docs/CRITERIOS.md): los datos que la app cruza con las preguntas
// de la bienvenida (hijos, familia numerosa o monoparental, para qué es la vivienda, sector, ingresos).
// La tarea programada los saca de la documentación (cache/fuentes/…) y los deja en cache/criterios_nuevos.json.
// Caché: cache/criterios.json {id: {h, r, fecha}} · pendientes: cache/criterios_pendientes.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VERSION = 'c1';
export const huellaC = (t) => crypto.createHash('sha1').update(VERSION + ':' + String(t || '')).digest('hex').slice(0, 16);
export const USOS_VIVIENDA = ['alquiler', 'comprar', 'reformar', 'arrendar', 'invertir'];
export const SECTORES = ['cultura', 'tecnologia', 'agrario', 'comercio', 'industria', 'educacion', 'salud', 'construccion', 'transporte', 'hosteleria', 'pesca', 'alimentacion', 'otros'];
const NIVEL = ['exige', 'mas', 'no'];
const PARA = ['particular', 'autonomo', 'empresa'];
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

export function comprobarCriterios(r) {
  const e = [];
  const hj = r.hijos || {};
  if (typeof hj.exige !== 'boolean') e.push('hijos.exige: true o false');
  for (const k of ['edad_max', 'minimo']) if (Number.isNaN(num(hj[k]))) e.push(`hijos.${k}: número o null`);
  if (!hj.exige && (num(hj.edad_max) || num(hj.minimo))) e.push('hijos.edad_max y hijos.minimo solo si hijos.exige es true');
  for (const k of ['familia_numerosa', 'monoparental']) if (!NIVEL.includes(r[k])) e.push(`${k}: exige, mas o no`);
  if (!Array.isArray(r.vivienda) || r.vivienda.some((u) => !USOS_VIVIENDA.includes(u))) e.push(`vivienda: lista con ${USOS_VIVIENDA.join(', ')} (vacía si no es de vivienda)`);
  if (!Array.isArray(r.sectores) || r.sectores.some((x) => !SECTORES.includes(x))) e.push(`sectores: lista con ${SECTORES.join(', ')} (vacía si vale para cualquier sector)`);
  const im = num(r.ingresos_max);
  if (Number.isNaN(im) || (im !== null && (im < 3000 || im > 500000))) e.push('ingresos_max: euros al año (número entre 3.000 y 500.000) o null');
  return e;
}

export function validarCriterios(r) {
  const hj = r.hijos || {};
  return {
    hijos: { exige: !!hj.exige, edad_max: hj.exige ? num(hj.edad_max) || null : null, minimo: hj.exige ? num(hj.minimo) || null : null },
    familia_numerosa: NIVEL.includes(r.familia_numerosa) ? r.familia_numerosa : 'no',
    monoparental: NIVEL.includes(r.monoparental) ? r.monoparental : 'no',
    vivienda: (r.vivienda || []).filter((u) => USOS_VIVIENDA.includes(u)),
    sectores: (r.sectores || []).filter((x) => SECTORES.includes(x)),
    ingresos_max: Number.isFinite(num(r.ingresos_max)) ? num(r.ingresos_max) : null,
  };
}

// Pone a.criterios. Si la documentación cambió, se mantienen los últimos criterios hasta que la tarea los revise.
export function aplicarCriterios(ayudas, cache) {
  let n = 0;
  for (const a of ayudas) { const c = cache[a.id]; if (c && c.r) { a.criterios = c.r; n++; } }
  return n;
}

// Lista de pendientes: ayudas para particulares, autónomos o empresas con documentación y sin criterios al día
export function pendientesCriterios(ayudas, fuentes, archivo) {
  const cache = leer(path.join('cache', 'criterios.json'), {});
  const pend = ayudas
    .filter((a) => (a.para || []).some((t) => PARA.includes(t)) && fuentes[a.id])
    .filter((a) => !cache[a.id] || cache[a.id].h !== huellaC(fuentes[a.id]))
    .sort((x, y) => (x.fin ? 0 : 1) - (y.fin ? 0 : 1) || String(x.fin || '').localeCompare(String(y.fin || '')))
    .map((a) => ({ id: a.id, h: huellaC(fuentes[a.id]), titulo: a.titulo, para: a.para, temas: a.temas || [], archivo: archivo(a.id), revisar: !!cache[a.id] }));
  fs.writeFileSync(path.join('cache', 'criterios_pendientes.json'), JSON.stringify(pend, null, 1));
  return { pend, cache };
}
