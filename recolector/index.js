// Recolector de Eskubat: lee todas las fuentes, une duplicados y publica publico/ayudas.json
import fs from 'node:fs';
import path from 'node:path';
import { norm, pedir, enParalelo, paraDeTexto, temasDe } from './comun.js';
import * as euskadi from './euskadi.js';
import * as bdns from './bdns.js';
import * as forales from './forales.js';
import { claveLinea } from './historico.js';

const SALIDA = path.resolve('publico');
const FUENTES = [
  { clave: 'euskadi', nombre: 'Gobierno Vasco (Open Data Euskadi y euskadi.eus)', mod: euskadi },
  { clave: 'gipuzkoa', nombre: 'Diputación Foral de Gipuzkoa (sede electrónica)', mod: { recoger: forales.gipuzkoa } },
  { clave: 'araba', nombre: 'Diputación Foral de Álava (ayudas en vigor)', mod: { recoger: forales.araba } },
  { clave: 'bdns', nombre: 'Base de Datos Nacional de Subvenciones (incluye Diputación de Bizkaia y ayuntamientos)', mod: bdns },
];

// Completa con la ficha de euskadi.eus las ayudas que enlazan a ella (las fichas sí son accesibles)
async function enriquecer(ayudas) {
  const objetivo = ayudas.filter((a) => /euskadi\.eus\/(?:.*web01-tramite|servicios\/)/.test(a.url || ''));
  let ok = 0;
  await enParalelo(objetivo, 3, async (a) => {
    const f = euskadi.parseFicha(await pedir(a.url));
    if (!f.objeto && !f.dirigido) return;
    ok++;
    a.resumen = f.objeto || a.resumen;
    a.cuantia = f.cuantia || a.cuantia;
    a.dirigido = f.dirigido || a.dirigido;
    a.organismo = f.organismo || a.organismo;
    a.presupuesto = a.presupuesto || f.presupuesto;
    const todo = [a.titulo, f.objeto, f.dirigido].join(' ');
    a.para = [...new Set([...(a.para || []), ...paraDeTexto(todo)])];
    a.temas = [...new Set([...(a.temas || []), ...temasDe(todo)])];
    a.fuentes.push({ nombre: 'euskadi.eus', url: a.url });
  });
  log(`Fichas de euskadi.eus: ${ok} de ${objetivo.length} completadas`);
}

const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const hoy = new Date().toISOString().slice(0, 10);

function leerPrevio() {
  try { return JSON.parse(fs.readFileSync(path.join(SALIDA, 'ayudas.json'), 'utf8')); } catch { return null; }
}

const VACIAS = new Set('de del la las el los y e o u a en para por con al sus su que se convocatoria convocatorias ayuda ayudas subvencion subvenciones ejercicio ano programa bases reguladoras aprueban aprueba resolucion orden extracto'.split(' '));
function claves(t) {
  return new Set(norm(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !VACIAS.has(w) && !/^20\d\d$/.test(w)));
}
function parecido(a, b) {
  let comun = 0;
  for (const w of a) if (b.has(w)) comun++;
  return comun / Math.max(1, Math.min(a.size, b.size));
}

function unir(eus, bd) {
  const usados = new Set();
  const kE = eus.map((x) => claves(x.titulo));
  for (const b of bd) {
    if (b.ambito.nivel !== 'euskadi') continue;
    const kb = claves(b.titulo);
    let mejor = -1, score = 0;
    kE.forEach((k, i) => { const s = parecido(kb, k); if (s > score) { score = s; mejor = i; } });
    if (mejor >= 0 && score >= 0.7 && kb.size >= 3) {
      const e = eus[mejor];
      e.bdns = e.bdns || b.bdns;
      e.bases = e.bases || b.bases;
      e.inicio = e.inicio || b.inicio;
      e.fin = e.fin || b.fin;
      e.presupuesto = e.presupuesto || b.presupuesto;
      e.para = [...new Set([...(e.para || []), ...(b.para || [])])];
      e.fuentes.push(...b.fuentes);
      usados.add(b.id);
    }
  }
  return [...eus, ...bd.filter((b) => !usados.has(b.id))];
}

function estado(a) {
  if (a.inicio && a.inicio > hoy) return 'proxima';
  if (a.fin && a.fin < hoy) return 'cerrada';
  if (a.fin || a.permanente) return 'abierta';
  if (a.abiertoSegunFuente || /abierto/i.test(a.estadoFuente || '')) return 'abierta';
  return 'sinfecha';
}

// "Convocatoria general de subvenciones 2026. Anexo nº 26: Euskaraz Baietz! ... 2026" -> "Euskaraz Baietz! ..."
function tituloSinEdicion(t) {
  let s = String(t || '')
    .replace(/^convocatoria general de subvenciones\s*(?:\d{4})?\s*[.,-]?\s*anexo\s*n?[º°o.]*\s*\d+\s*[:.\-]\s*/i, '')
    .replace(/\b(?:para|en|de|del)\s+(?:el\s+)?(?:a[nñ]o|ejercicio|curso)\s+(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?,?\s*/gi, '')
    .replace(/\(?\b(?:a[nñ]o|ejercicio|curso|convocatoria)?\s*(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?\b\)?/gi, '')
    .replace(/\s+(?:en|de|del|para|el|la|los|las)\s*$/i, '')
    .replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[\s,.;:-]+$/, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : t;
}

async function main() {
  const previo = leerPrevio();
  const resultados = {};
  const estadoFuentes = {};
  for (const f of FUENTES) {
    const t0 = Date.now();
    try {
      const items = await f.mod.recoger(log);
      resultados[f.clave] = items;
      estadoFuentes[f.clave] = { nombre: f.nombre, ok: true, registros: items.length, segundos: Math.round((Date.now() - t0) / 1000), erroresFicha: items.filter((x) => x.errorFicha).length };
      log(`${f.nombre}: ${items.length} registros`);
    } catch (e) {
      // Si una fuente falla, conservamos lo que había de ella en la publicación anterior
      const anteriores = previo ? previo.ayudas.filter((a) => a.origen === f.clave) : [];
      resultados[f.clave] = anteriores;
      estadoFuentes[f.clave] = { nombre: f.nombre, ok: false, error: String(e.message || e), registros: anteriores.length, conservados: true };
      log(`ERROR en ${f.nombre}: ${e.message || e}`);
    }
  }

  for (const k in resultados) for (const a of resultados[k]) a.origen = a.origen || k;
  let ayudas = unir([...(resultados.euskadi || []), ...(resultados.gipuzkoa || []), ...(resultados.araba || [])], resultados.bdns || []);
  { // Duplicados exactos (misma ayuda registrada dos veces)
    const vistos = new Set();
    ayudas = ayudas.filter((a) => { const k = norm(a.titulo) + '|' + a.ambito.nombre + '|' + (a.fin || ''); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }
  try { await enriquecer(ayudas.filter((a) => a.origen !== 'euskadi')); } catch (e) { log(`Aviso: no se pudieron completar fichas: ${e.message}`); }
  // Fuera las que no puede solicitar cualquiera (nominativas, directas, a una entidad concreta)
  const antes = ayudas.length;
  ayudas = ayudas.filter((a) => !bdns.RUIDO.test(a.titulo) && !/no es una convocatoria (de subvenciones )?abierta|s[oó]lo pueden (formalizar|presentar)[^.]{0,60}(presupuestos|nominativ)/i.test(a.resumen || '') && !/^(?:[Ss]ubvenci[oó]n|[Aa]yuda|[Aa]portaci[oó]n) (?:a|al|para) (?:la |el )?[A-ZÑ]{2,}\b/.test(a.titulo));
  log(`Descartadas ${antes - ayudas.length} no solicitables`);
  for (const a of ayudas) { a.estado = estado(a); delete a.errorFicha; delete a.abiertoSegunFuente; }
  // Fuera: cerradas y las que no tienen fechas y llevan más de 90 días registradas
  const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  ayudas = ayudas.filter((a) => a.estado !== 'cerrada' && !(a.estado === 'sinfecha' && a.registrada && a.registrada < limite));
  ayudas.sort((x, y) => (x.fin || '9999').localeCompare(y.fin || '9999'));

  // Histórico: ayudas que se repiten cada año (lo genera historico.js cada semana)
  let previstas = [];
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(SALIDA, 'historico.json'), 'utf8'));
    const porClave = new Map(hist.lineas.map((l) => [l.clave, l]));
    const actuales = new Set();
    for (const a of ayudas) {
      const k = claveLinea(a.titulo, a.organismo);
      actuales.add(k);
      const l = porClave.get(k);
      if (l) a.recurrente = { años: l.años, mes: l.mes };
    }
    const ahora = new Date();
    for (const l of hist.lineas) {
      if (actuales.has(l.clave)) continue;
      let y = ahora.getUTCFullYear();
      if (l.mes < ahora.getUTCMonth() + 1) y++;
      const prevista = new Date(Date.UTC(y, l.mes - 1, 1));
      const dias = (prevista - ahora) / 864e5;
      const yaConvocada = l.ultimaFecha >= new Date(prevista.getTime() - 200 * 864e5).toISOString().slice(0, 10);
      const viva = l.ultimaFecha >= new Date(ahora.getTime() - 800 * 864e5).toISOString().slice(0, 10);
      if (dias > -20 && dias <= 120 && !yaConvocada && viva) {
        previstas.push({ id: 'prev-' + l.clave.replace(/[^a-z0-9]+/g, '-').slice(0, 80), titulo: tituloSinEdicion(l.titulo), organismo: l.organismo, ambito: l.ambito, mesPrevisto: l.mes, añoPrevisto: y, años: l.años, duracionDias: l.duracionDias, url: l.url, estado: 'prevista' });
      }
    }
    previstas.sort((a, b) => (a.añoPrevisto - b.añoPrevisto) || (a.mesPrevisto - b.mesPrevisto));
    log(`Histórico: ${ayudas.filter((a) => a.recurrente).length} ayudas actuales se repiten cada año · ${previstas.length} previstas en los próximos meses`);
  } catch (e) { log(`Histórico no disponible: ${e.message}`); }

  const porAmbito = ayudas.reduce((m, a) => { m[a.ambito.nivel] = (m[a.ambito.nivel] || 0) + 1; return m; }, {});
  const porEstado = ayudas.reduce((m, a) => { m[a.estado] = (m[a.estado] || 0) + 1; return m; }, {});
  const meta = { version: 1, generado: new Date().toISOString(), total: ayudas.length, porAmbito, porEstado, previstas: previstas.length, fuentes: estadoFuentes };

  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'ayudas.json'), JSON.stringify({ ...meta, ayudas, previstas }));
  fs.writeFileSync(path.join(SALIDA, 'estado.json'), JSON.stringify(meta, null, 2));
  log(`Publicadas ${ayudas.length} ayudas · ${JSON.stringify(porAmbito)} · ${JSON.stringify(porEstado)}`);
  if (Object.values(estadoFuentes).every((s) => !s.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
