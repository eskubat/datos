// Detección de ayudas repetidas o muy parecidas (docs/RESUMIR.md, «Ayudas muy parecidas»).
// El recolector no decide: escribe las parejas sospechosas en cache/parecidas.json y la tarea de fichas
// las pasa a cache/excluidas.json y a «Para ti». Se saltan las parejas ya tratadas: alguna de las dos está
// en cache/excluidas.json, unida u oculta en cache/ajustes_ayudas.json, o el responsable decidió que son
// distintas (cache/parecidas_distintas.json = [["id1", "id2", "motivo"], …]).
import fs from 'node:fs';
import path from 'node:path';
import { norm } from './comun.js';

const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join('cache', f), 'utf8')); } catch { return def; } };
const VACIAS = new Set('de del la las el los y e o u a en para por con al sus su que se convocatoria convocatorias ayuda ayudas subvencion subvenciones ejercicio ano programa bases reguladoras aprueban aprueba resolucion orden extracto linea lineas'.split(' '));
const claves = (t) => new Set(norm(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !VACIAS.has(w) && !/^20\d\d$/.test(w)));
const parecido = (a, b) => { let c = 0; for (const w of a) if (b.has(w)) c++; return c / Math.max(1, Math.max(a.size, b.size)); };
// Página oficial concreta (no la portada, el visor de la BDNS ni un catálogo genérico)
const pagina = (u) => {
  const s = String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/(?:es|eu)\/?$/, '').replace(/\.html?$/, '').replace(/\/+$/, '');
  // Fuera las sedes y catálogos genéricos (portada de la sede municipal, buscador de trámites) y los boletines enteros
  if (s.split('/').length < 3 || /infosubvenciones\.es|pap\.hacienda\.gob\.es|bao_bob|\/(?:catalogo|tramites|ayudas|servicios)$|\.(?:do|aspx)$|\/doevent$/.test(s)) return '';
  return s;
};
const organismo = (a) => norm(a.organismoId || a.organismo || '') + '|' + (a.ambito?.nombre || '');

export function detectarParecidas(ayudas, log = () => {}) {
  const exc = leer('excluidas.json', {}), aj = leer('ajustes_ayudas.json', {});
  const distintas = new Set(leer('parecidas_distintas.json', []).map((p) => [p[0], p[1]].sort().join('|')));
  const tratada = (id) => exc[id] || aj[id]?.unidaA || aj[id]?.ocultar;
  const lista = ayudas.filter((a) => !tratada(a.id));
  const parejas = new Map();
  const anota = (x, y, motivo) => {
    if (x.id === y.id) return;
    const k = [x.id, y.id].sort().join('|');
    if (distintas.has(k) || parejas.has(k)) return;
    parejas.set(k, { ayudas: [x.id, y.id].sort(), titulos: [x.titulo, y.titulo], organismos: [x.organismo, y.organismo], fines: [x.fin || '', y.fin || ''], urls: [x.url || '', y.url || ''], motivo });
  };
  // 1) Mismo número de la BDNS  2) misma página oficial  (se agrupan y se anota cada pareja del grupo)
  for (const [tipo, llave] of [['el mismo número de la BDNS', (a) => a.bdns ? String(a.bdns) : ''], ['la misma página oficial', (a) => pagina(a.url)]]) {
    const grupos = new Map();
    for (const a of lista) { const k = llave(a); if (k) grupos.set(k, [...(grupos.get(k) || []), a]); }
    // Con la misma página solo si el título también se parece (una sede puede tener una sola URL para todo)
    for (const [k, g] of grupos) if (g.length > 1 && g.length <= 4) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      if (tipo.includes('página') && parecido(claves(g[i].titulo), claves(g[j].titulo)) < 0.4) continue;
      anota(g[i], g[j], `Tienen ${tipo} (${k}).`);
    }
  }
  // 3) Título casi igual del mismo organismo (y mismo ámbito)
  //    (en el título corto y en el oficial: dos líneas de un programa con el mismo título oficial y distinto
  //    título corto se distinguen bien en la app)
  const ks = lista.map((a) => [claves(a.titulo), claves(a.tituloOficial || a.titulo)]);
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
    if (ks[i][0].size < 3 || ks[j][0].size < 3 || organismo(lista[i]) !== organismo(lista[j])) continue;
    const s = Math.min(parecido(ks[i][0], ks[j][0]), parecido(ks[i][1], ks[j][1]));
    if (s >= 0.85) anota(lista[i], lista[j], `Mismo organismo y título casi igual (${Math.round(s * 100)} % de palabras en común).`);
  }
  const res = [...parejas.values()];
  fs.writeFileSync(path.join('cache', 'parecidas.json'), JSON.stringify(res, null, 1));
  log(`Parecidas: ${res.length} parejas de posibles repetidas por revisar (cache/parecidas.json)`);
  return res;
}
