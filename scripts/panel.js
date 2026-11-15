// Genera la página «Eskubat — Revisión de ayudas» (artefacto de Claude) con los datos actuales del repositorio.
// Uso: node scripts/panel.js  → escribe panel/index.html (la plantilla es panel/plantilla.html) y añade un punto
// a cache/historial_cola.json. La tarea programada lo ejecuta en cada pasada y publica panel/index.html.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const texto = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const unir = (x) => (Array.isArray(x) ? x.join('\n') : x || '');
const corta = (s, n) => { s = String(s || ''); return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…'; };
const idDoc = (id) => String(id).replace(/[^A-Za-z0-9_.~:@+-]/g, '_').slice(0, 180);

const ahora = new Date().toISOString();
const pub = leer('publico/ayudas.json', { ayudas: [] });
const est = leer('publico/estado.json', {});
const res = leer('cache/resumenes.json', {});
const pend = leer('cache/pendientes.json', []);
const titPend = leer('cache/titulos_pendientes.json', []);
const noticias = leer('cache/noticias.json', []);
const decis = leer('cache/noticias_decisiones.json', {});
const cola = { fichas: pend.length, titulos: titPend.length, noticias: noticias.filter((n) => !decis[n.id]).length };
const hechas = { fichas: Object.keys(res).length, titulos: Object.keys(leer('cache/titulos.json', {})).length, noticias: Object.keys(decis).length };

// Historial de la cola: un punto por ejecución (como mucho uno cada 30 minutos)
const hist = leer('cache/historial_cola.json', []);
const ult = hist[hist.length - 1];
const punto = { ...cola, hf: hechas.fichas, ht: hechas.titulos, hn: hechas.noticias };
if (!ult || Date.parse(ahora) - Date.parse(ult.t) > 30 * 60e3) hist.push({ t: ahora, ...punto });
else Object.assign(ult, punto);
fs.writeFileSync('cache/historial_cola.json', JSON.stringify(hist.slice(-2000)));

// Ficha de Claude (formato nuevo con versiones o antiguo plano)
function ficha(id) {
  const c = res[id]; if (!c) return null;
  const r = c.r || {};
  const f = { fecha: c.fecha || '', revision: String(r.revision || '').split('; comprobaciones:')[0], versiones: {} };
  if (r.versiones && Object.keys(r.versiones).length) {
    for (const [t, v] of Object.entries(r.versiones)) {
      f.versiones[t] = {
        consiste: v.en_que_consiste || '',
        cuanto: unir(v.cuanto_puede_recibir),
        quien: (v.quien_puede_pedirla || []).map((q) => `${q.tipo}: ${q.texto}`).join('\n'),
        requisitos: (v.requisitos || []).flatMap((g) => (g.requisitos || []).map((x) => (g.grupo ? g.grupo + ': ' : '') + x)).join('\n'),
      };
    }
  } else {
    f.versiones[(r.tipos && r.tipos[0]) || 'general'] = { consiste: r.queEs || '', cuanto: unir(r.cuantia), quien: unir(r.quien), requisitos: unir(r.requisitos) };
    f.tipos = r.tipos || [];
  }
  return f;
}

const ayudas = pub.ayudas.map((a) => ({
  id: a.id, d: idDoc(a.id), titulo: a.titulo, organismo: a.organismoCompleto || a.organismo || '',
  nivel: (a.ambito && a.ambito.nivel) || '', lugar: a.ambito ? [a.ambito.nombre, a.ambito.terr].filter(Boolean).join(', ') : '',
  inicio: a.inicio || '', fin: a.fin || '', estado: a.estado, para: a.para || [], temas: a.temas || [], url: a.url || '',
  registrada: a.registrada || a.publicacion || '', importeMax: a.importeMax || null,
  resumen: corta(a.resumen, 900), cuantia: corta(unir(a.cuantia), 700), dirigido: corta(unir(a.dirigido), 500),
  requisitos: corta(unir(a.requisitos), 900), fuente: (a.fuentes && a.fuentes[0] && a.fuentes[0].nombre) || a.origen || '',
  ficha: ficha(a.id), pendiente: pend.some((p) => p.id === a.id),
}));

// Fuentes: lo que mide el recolector + descripciones de panel/fuentes.json
const desc = leer('panel/fuentes.json', { consultadas: [], potenciales: [] });
const consultadas = desc.consultadas.map((f) => {
  if (f.clave === 'fundaciones') return { ...f, registros: pub.ayudas.filter((a) => String(a.organismoId || '').startsWith('fund-') || a.privada).length, ok: true };
  const e = f.clave && est.fuentes ? est.fuentes[f.clave] : null;
  return { ...f, registros: e ? e.registros : null, ok: e ? e.ok : true };
});

const instrucciones = {};
for (const [k, f, t] of [['categorizacion', 'CATEGORIZACION.md', 'Categorización'], ['resumir', 'RESUMIR.md', 'Cómo resume Claude'], ['titulos', 'TITULOS.md', 'Títulos']]) {
  instrucciones[k] = { titulo: t, archivo: 'docs/' + f, texto: texto('docs/' + f) };
}

let commit = '';
try { commit = execSync('git log -1 --format=%h', { encoding: 'utf8' }).trim(); } catch {}

const datos = {
  generado: ahora, commit, cola, hechas, historial: hist.slice(-500),
  tarea: { modo: cola.fichas + cola.titulos + cola.noticias === 0 ? 'diaria' : 'cada hora' },
  fuentes: { fecha: (est.generado || '').slice(0, 10), consultadas, potenciales: desc.potenciales },
  instrucciones, ayudas,
};
const json = JSON.stringify(datos).replace(/</g, '\\u003c');
const plantilla = fs.readFileSync('panel/plantilla.html', 'utf8');
fs.writeFileSync('panel/index.html', plantilla.replace('/*DATOS*/null', () => json));
console.log(`panel/index.html: ${ayudas.length} ayudas, ${ayudas.filter((a) => a.ficha).length} con ficha de Claude, cola ${cola.fichas}/${cola.titulos}/${cola.noticias}, ${Math.round(json.length / 1024)} KB de datos`);
