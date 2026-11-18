// Documentos oficiales que la tarea de fichas no pudo abrir (tarea botha-documentos-bloqueados, 18/11/2026).
// araba.eus / egoitza.araba.eus bloquean el acceso desde la tarea, pero el recolector (GitHub Actions) sí los
// descarga. En vez de dejar la ayuda en «Para ti», la tarea apunta lo que buscaba en cache/docs_pedidos.json:
//   {"<id de la ayuda>": {"titulo": "…", "botha": ["2026_058_01458" | "2026/058"], "urls": ["https://…"]}}
// y el recolector prueba, por orden: las URL dadas, el anuncio del BOTHA con su nombre habitual (…_C.pdf y la
// variante …_c.pdf), y las convocatorias de los sumarios del BOTHA del año (cache/botha_sumarios.json) del número
// pedido o, si no hay número o el anuncio es de otra ayuda, cuyo título comparte palabras con el de la ayuda.
// Un documento vale si es PDF con texto y su comienzo comparte al menos 2 palabras del título (así no se cuela el
// anuncio de otra convocatoria del mismo boletín). Si vale, se añade a cache/docs_extra.json: el recolector lo
// descarga en esta misma pasada, cambia la huella de la ficha y la tarea la rehace sola. Si no, se guardan las URL
// probadas y el motivo (estado «fallo») para que la cuestión diga qué se intentó; se reintenta en cada pasada
// hasta 5 veces. También se leen las referencias de anuncio (AAAA_NNN_NNNNN) que haya en los motivos de
// revisión manual de las fichas (cache/resumenes.json) de ayudas sin documento del BOTHA.
import fs from 'node:fs';
import path from 'node:path';
import { norm, pedir } from './comun.js';
import { bajarPdfBotha } from './boletines.js';

const ARCHIVO = path.join('cache', 'docs_pedidos.json');
const MAX_INTENTOS = 5;
const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const palabras = (t) => [...new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 5 && !/^(ayudas?|subvenc\w*|convocatoria|alaves\w*|entidades|territorio|historico|diputacion|consejo|gobierno|aprobar|acuerdo)$/.test(w)))];
const urlBotha = (año, n3, r5, c = 'C') => `https://www.araba.eus/botha/Boletines/${año}/${n3}/${año}_${n3}_${r5}_${c}.pdf`;

// Referencias de anuncio en un texto: ["2026_058_01458", …]
export const refsBotha = (t) => [...new Set([...String(t || '').matchAll(/\b(20\d\d)_(\d{3})_(\d{5})\b/g)].map((m) => m[0]))];

// Comprueba que el texto es de la ayuda: al menos la mitad de las palabras del título (mínimo 2) en el comienzo
export function esDeLaAyuda(txt, titulo) {
  const p = palabras(titulo);
  if (!p.length) return true;
  const ini = norm(String(txt || '').slice(0, 4000));
  return p.filter((w) => ini.includes(w)).length >= Math.min(p.length, Math.max(2, Math.ceil(p.length * 0.5)));
}

async function probar(url) {
  if (/araba\.eus\/botha\//i.test(url) || /\.pdf(\?|$)/i.test(url)) return bajarPdfBotha(url);
  try { const r = await pedir(url); return r && String(r).trim() ? { txt: String(r) } : { txt: null, motivo: 'vacío' }; } catch (e) { return { txt: null, motivo: e.message }; }
}

export async function resolverPedidos({ log = console.log, resumenes = null } = {}) {
  const pedidos = leer(ARCHIVO, {});
  const docsExtra = leer(path.join('cache', 'docs_extra.json'), {});
  const sumarios = leer(path.join('cache', 'botha_sumarios.json'), {});
  const entradas = Object.entries(sumarios.numeros || {}).flatMap(([k, v]) => (v || []).map((e) => ({ ...e, k })));
  // Referencias en los motivos de revisión manual de las fichas
  const res = resumenes || leer(path.join('cache', 'resumenes.json'), {});
  for (const [id, x] of Object.entries(res)) {
    const motivo = x?.r?.revision_manual?.necesaria ? x.r.revision_manual.motivo : '';
    const refs = refsBotha(motivo);
    if (!refs.length || pedidos[id] || (docsExtra[id] || []).some((u) => /botha\/Boletines/i.test(u))) continue;
    pedidos[id] = { titulo: x.r.titulo || '', botha: refs, origen: 'revision_manual' };
  }
  const hoy = new Date().toISOString().slice(0, 10);
  let ok = 0, fallo = 0;
  for (const [id, p] of Object.entries(pedidos)) {
    if (p.estado === 'ok' || (p.estado === 'fallo' && ((p.intentos || 0) >= MAX_INTENTOS || p.fecha === hoy))) continue;
    const candidatas = [...(p.urls || [])];
    const numeros = new Set();
    for (const ref of [].concat(p.botha || [])) {
      const m = String(ref).match(/(20\d\d)[_/](\d{3})(?:[_/](\d{5}))?/);
      if (!m) continue;
      numeros.add(`${m[1]}-${m[2]}`);
      if (m[3]) candidatas.push(urlBotha(m[1], m[2], m[3]), urlBotha(m[1], m[2], m[3], 'c'));
    }
    // Convocatorias de los sumarios: primero las del número pedido, luego las del año cuyo título encaja
    const pT = palabras(p.titulo || '');
    const encaja = (e) => pT.length >= 2 && pT.filter((w) => norm(e.titulo).includes(w)).length >= Math.max(2, Math.ceil(pT.length * 0.6));
    for (const e of entradas.filter((e) => numeros.has(e.k) && (!pT.length || encaja(e)))) candidatas.push(e.url);
    for (const e of entradas.filter(encaja).sort((a, b) => String(b.publicacion).localeCompare(String(a.publicacion))).slice(0, 3)) candidatas.push(e.url);
    const probadas = [];
    let hallada = null;
    for (const u of [...new Set(candidatas)].slice(0, 8)) {
      const r = await probar(u);
      if (!r.txt) { probadas.push({ url: u, motivo: r.motivo }); continue; }
      if (p.titulo && !esDeLaAyuda(r.txt, p.titulo)) { probadas.push({ url: u, motivo: 'es de otra convocatoria' }); continue; }
      hallada = u; break;
    }
    if (hallada) {
      docsExtra[id] = [...new Set([...(docsExtra[id] || []), hallada])];
      pedidos[id] = { ...p, estado: 'ok', url: hallada, fecha: hoy, probadas };
      ok++;
    } else {
      pedidos[id] = { ...p, estado: 'fallo', fecha: hoy, intentos: (p.intentos || 0) + 1, probadas };
      fallo++;
    }
  }
  if (ok || fallo) {
    fs.writeFileSync(ARCHIVO, JSON.stringify(pedidos, null, 1));
    if (ok) fs.writeFileSync(path.join('cache', 'docs_extra.json'), JSON.stringify(docsExtra, null, 1));
  }
  log(`Documentos pedidos por la tarea: ${Object.keys(pedidos).length}; conseguidos ahora: ${ok}; sin conseguir: ${fallo}`);
  return { ok, fallo };
}
