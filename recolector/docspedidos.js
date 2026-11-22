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
import { bajarPdfBotha, numeroBobDeFecha } from './boletines.js';
import { api as apiBdns, docsBdns } from './bdns.js';

const ARCHIVO = path.join('cache', 'docs_pedidos.json');
const MAX_INTENTOS = 5;
const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
// Palabras que distinguen la ayuda. Antes solo contaban las de más de 5 letras y bastaban 2 genéricas («reguladoras»,
// «programa») para dar por bueno el anuncio de otra convocatoria: el Decreto Foral 43/2026 de Álava (colonias felinas)
// pasó por las bases del auzo-taxi de Oñati (tarea docs-pedidos-boletin-equivocado-onati, 22/11/2026). Ahora cuentan
// también las de 4-5 letras («taxi», «onati») y se quitan las palabras de trámite que sale en cualquier anuncio.
const GENERICAS = /^(ayudas?|subvenc\w*|convocatorias?|alaves\w*|entidades|territorio|historico|diputacion|consejo|gobierno|aprobar|aprobacion|acuerdo|para|como|sobre|entre|desde|hasta|este|esta|estos|estas|otras?|otros?|cada|todos?|todas?|bases?|reguladoras?|programas?|correccion|correcciones|errores?|precios?|publica\w*|anuncios?|extractos?|municipal\w*|ayuntamiento|udala|boletin|oficial|gipuzkoa|bizkaia|araba|alava|euskadi|decreto|foral|orden|resolucion|modifica\w*|linea|lineas|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)$/;
const palabras = (t) => [...new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !/^\d+$/.test(w) && !GENERICAS.test(w)))];
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

// La portada de un sitio (https://www.balmaseda.eus, …/es) nunca es el documento: se descarta sin pedirla
// (tarea documentos-pedidos-portadas, 19/11/2026).
export const esPortada = (u) => { try { const x = new URL(u); return /^\/?((es|eu)(-es)?\/?)?(index\.\w+)?$/i.test(x.pathname) && !x.search; } catch { return false; } };
// Referencia de un anuncio del BOB en el título («II-5846», «BOB-2026a217-(II-5846)») para quedarse con sus páginas
const refBob = (t) => (String(t || '').match(/\b((?:I{1,3}|IV|V)-\d{3,5})\b/) || [])[1] || '';
// El PDF del BOB es el boletín entero: cada página lleva al pie «cve: BOB-AAAAaNNN-(II-NNNN)»; se guardan solo las
// páginas de ese anuncio, para que la comprobación del título mire su comienzo y no el del boletín.
// Sin referencia en el título (p. ej. «BOB del 9 de septiembre de 2024»), se busca la primera página que no sea del
// sumario y encaje con el título, y se toman las del mismo cve; si ninguna encaja, se devuelve el boletín entero.
// Fechas de BOB citadas en un título («Boletín Oficial de Bizkaia, 9 de septiembre de 2024», «BOB 09/09/2024») →
// ["2024-09-09"] (tarea documentos-bob-por-fecha, 19/11/2026). Solo si el título nombra el BOB.
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const CITA_BOB = /\bBOB\b|Bolet[ií]n Oficial de Bizkaia|Bizkaiko Aldizkari Ofiziala/i;
export function fechasBob(t) {
  const s = String(t || '');
  if (!CITA_BOB.test(s)) return [];
  const iso = (a, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  const out = [];
  for (const m of norm(s).matchAll(/\b(\d{1,2}) de ([a-z]+) de (20\d\d)\b/g)) out.push(iso(m[3], MESES[m[2]], +m[1]));
  for (const m of s.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)\b/g)) out.push(iso(m[3], +m[2], +m[1]));
  return [...new Set(out.filter(Boolean))];
}
// La cita del boletín («Boletín Oficial de Bizkaia, 9 de septiembre de 2024», «BOB 217/2026») no es parte del título
// de la ayuda: se quita para comprobar que el texto encaja (si no, «boletin», «oficial», «septiembre»… cuentan).
export const sinCitaBob = (t) => String(t || '').replace(/Bolet[ií]n Oficial de Bizkaia|Bizkaiko Aldizkari Ofiziala|\bBOB\b[^,;)]*|\b\d{1,2} de [a-záéíóú]+ de 20\d\d\b/gi, ' ');

// BOG citado por su fecha («BOG, 19 de abril de 2023»): se lee el sumario de ese día (bcAAMMDD.htm, el mismo que usa
// boletines.js) y se toman los anuncios cuyo organismo o título encaja con el título pedido. El PDF del boletín entero
// (bo230419.pdf) que a veces se apunta en urls no existe (HTTP 404).
const CITA_BOG = /\bBOG\b|Bolet[ií]n Oficial de Gipuzkoa|Gipuzkoako Aldizkari Ofiziala/i;
export const fechasBog = (t) => (CITA_BOG.test(String(t || '')) ? fechasBob(String(t).replace(CITA_BOG, 'BOB')) : []);
const entidadesHtml = (t) => String(t).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z])(acute|tilde|uml);/gi, (_, l) => l);
export async function anunciosBogDeFecha(fecha, titulo) {
  const [y, m, d] = fecha.split('-');
  const url = `https://egoitza.gipuzkoa.eus/gao-bog/castell/bog/${y}/${m}/${d}/bc${y.slice(2)}${m}${d}.htm`;
  let html = '';
  try { html = String((await pedir(url)) || ''); } catch { return []; }
  const pT = palabras(sinCitaBob(titulo));
  const out = [];
  let entidad = '';
  const re = /(?:<a[^>]*>\s*((?:AYUNTAMIENTO|DEPARTAMENTO|DIPUTACI|MANCOMUNIDAD|CONSORCIO|ADMINISTRACI|UDAL|JUNTAS)[^<]{2,120})<\/a>)|<div class="titulo_anuncio">([\s\S]*?)<\/div>([\s\S]*?)<\/li>/gi;
  for (const mm of html.matchAll(re)) {
    if (mm[1]) { entidad = entidadesHtml(mm[1]); continue; }
    const t = norm(`${entidad} ${entidadesHtml(mm[2].replace(/<[^>]+>/g, ' '))}`);
    const href = (mm[3].match(/href="([^"]+\.(?:htm|pdf))"/i) || [])[1];
    if (href && pT.filter((w) => t.includes(w)).length >= Math.min(2, pT.length)) out.push(new URL(href, url).href);
  }
  return out;
}

// Territorio de la ayuda (publico/ayudas.json): el BOTHA solo se mira para ayudas de Álava o sin territorio conocido.
let TERR = null;
const territorioDe = (id) => {
  if (!TERR) {
    const a = leer(path.join('publico', 'ayudas.json'), []);
    TERR = new Map((Array.isArray(a) ? a : a.ayudas || []).map((x) => [x.id, x.ambito?.terr || (x.ambito?.nivel === 'territorio' ? x.ambito?.nombre : '') || '']));
  }
  return norm(TERR.get(id) || '');
};

export function paginasBob(txt, titulo) {
  const todas = String(txt).split('\f');
  const cve = (p) => (p.match(/cve:\s*BOB-\d{4}a\d{3}-\(([IVX]+-\d+)\)/i) || [])[1] || '';
  let ref = refBob(titulo);
  if (!ref) {
    const i = todas.findIndex((p) => cve(p) && esDeLaAyuda(p, sinCitaBob(titulo)));
    ref = i >= 0 ? cve(todas[i]) : '';
  }
  if (!ref) return txt;
  const pags = todas.filter((p) => p.includes(`(${ref})`));
  return pags.length ? pags.join('\f') : txt;
}

async function probar(url, titulo = '') {
  if (esPortada(url)) return { txt: null, motivo: 'portada del sitio: no es el documento' };
  const r = await probar1(url);
  // bizkaia.eus/…/Bao_bob por http a veces corta la conexión desde Actions («red: fetch failed»): se prueba por https
  if (!r.txt && /^http:\/\//i.test(url) && /^(red:|fetch failed|tiempo agotado)/.test(r.motivo || '')) {
    const r2 = await probar1(url.replace(/^http:/i, 'https:'));
    if (r2.txt) return { txt: /Bao_bob/i.test(url) ? paginasBob(r2.txt, titulo) : r2.txt };
    return { txt: null, motivo: `${r.motivo}; por https: ${r2.motivo}` };
  }
  return r.txt && /Bao_bob/i.test(url) ? { txt: paginasBob(r.txt, titulo) } : r;
}
async function probar1(url) {
  if (/araba\.eus\/botha\//i.test(url) || /\.pdf(\?|$)/i.test(url) || /bdnstrans\/api\/convocatorias\/documentos/i.test(url)) return bajarPdfBotha(url);
  try { const r = await pedir(url); return r && String(r).trim() ? { txt: String(r) } : { txt: null, motivo: 'vacío' }; } catch (e) { return { txt: null, motivo: e.message }; }
}

// La ficha web de la BDNS (…/bdnstrans/GE/es/convocatoria/NNN) es una aplicación que se pinta con JavaScript: bajada
// tal cual solo trae la carcasa y salía «es de otra convocatoria» (tarea documentos-pedidos-revisar, 19/11/2026: 8
// pedidos de Bizkaia y Gipuzkoa). Se cambia por lo que de verdad lleva: las bases reguladoras que enlaza
// (urlBasesReguladoras, a menudo el BOB/BOG) y los documentos subidos a la BDNS (API documentos?idDocumento=…).
const NUM_BDNS = /(?:infosubvenciones\.es|pap\.hacienda\.gob\.es)\/bdnstrans\/(?!api\/)[^?#]*?\/convocatorias?\/(\d{5,7})\b/i;
const urlDocBdns = (id) => `https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento=${id}`;
async function expandirBdns(url, probadas) {
  const m = String(url).match(NUM_BDNS);
  if (!m) return [url];
  try {
    const d = await apiBdns(`/convocatorias?vpd=GE&numConv=${m[1]}`);
    const bases = String(d?.urlBasesReguladoras || '').replace(/\s+/g, '');
    const urls = [...(/^https?:\/\//i.test(bases) ? [bases] : []), ...docsBdns(d?.documentos).map(urlDocBdns)];
    if (!urls.length) probadas.push({ url, motivo: 'la BDNS no trae bases ni documentos' });
    return urls;
  } catch (e) { probadas.push({ url, motivo: `BDNS: ${e.message}` }); return []; }
}

// Texto de cada documento conseguido, en el repositorio, para que la tarea de fichas (que no llega a araba.eus) lo lea
// en su siguiente pasada sin esperar al recolector: cache/pedidos/<id>.txt
const DIR_TEXTOS = path.join('cache', 'pedidos');

export async function resolverPedidos({ log = console.log, resumenes = null, reintentar = false } = {}) {
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
    if (p.estado === 'ok' || (p.estado === 'fallo' && ((p.intentos || 0) >= MAX_INTENTOS || (p.fecha === hoy && !reintentar)))) continue;
    const candidatas = [...(p.urls || [])];
    const numeros = new Set();
    for (const ref of [].concat(p.botha || [])) {
      const m = String(ref).match(/(20\d\d)[_/](\d{3})(?:[_/](\d{5}))?/);
      if (!m) continue;
      numeros.add(`${m[1]}-${m[2]}`);
      if (m[3]) candidatas.push(urlBotha(m[1], m[2], m[3]), urlBotha(m[1], m[2], m[3], 'c'));
    }
    // Convocatorias de los sumarios: primero las del número pedido, luego las del año cuyo título encaja
    // BOB citado solo por su fecha: se busca el número de ese día y se prueba el boletín (paginasBob se queda con el anuncio)
    for (const f of fechasBob(p.titulo)) {
      try { const b = await numeroBobDeFecha(f); if (b) candidatas.push(b.url); } catch {}
    }
    // BOG citado por fecha: anuncios de ese día que encajan con el título
    for (const f of fechasBog(p.titulo)) {
      try { candidatas.push(...(await anunciosBogDeFecha(f, p.titulo))); } catch {}
    }
    // Los sumarios del BOTHA solo para ayudas de Álava: una de Gipuzkoa o Bizkaia, o que cita el BOG o el BOB, no
    // está ahí y lo único que se puede encontrar es el anuncio de otra convocatoria.
    const terr = territorioDe(id);
    const enBotha = !(/gipuzkoa|bizkaia/.test(terr) || ((CITA_BOG.test(p.titulo || '') || CITA_BOB.test(p.titulo || '')) && !/botha|araba|alava/i.test(norm(p.titulo || ''))));
    const pT = enBotha ? palabras(sinCitaBob(p.titulo || '')) : [];
    const encaja = (e) => pT.length >= 2 && pT.filter((w) => norm(e.titulo).includes(w)).length >= Math.max(2, Math.ceil(pT.length * 0.6));
    if (enBotha) for (const e of entradas.filter((e) => numeros.has(e.k) && (!pT.length || encaja(e)))) candidatas.push(e.url);
    for (const e of entradas.filter(encaja).sort((a, b) => String(b.publicacion).localeCompare(String(a.publicacion))).slice(0, 3)) candidatas.push(e.url);
    const probadas = [];
    const lista = [];
    for (const u of [...new Set(candidatas)]) lista.push(...(await expandirBdns(u, probadas)));
    let hallada = null;
    for (const u of [...new Set(lista)].slice(0, 8)) {
      const r = await probar(u, p.titulo);
      if (!r.txt) { probadas.push({ url: u, motivo: r.motivo }); continue; }
      if (p.titulo && !esDeLaAyuda(r.txt, sinCitaBob(p.titulo))) { probadas.push({ url: u, motivo: 'es de otra convocatoria' }); continue; }
      hallada = u;
      try { fs.mkdirSync(DIR_TEXTOS, { recursive: true }); fs.writeFileSync(path.join(DIR_TEXTOS, `${id}.txt`), `URL: ${u}\nDescargado: ${hoy}\n\n${r.txt}`); } catch {}
      break;
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

// Uso suelto (flujo «Documentos pedidos», .github/workflows/documentos.yml): node recolector/docspedidos.js [--reintentar]
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])) && /docspedidos\.js$/.test(process.argv[1])) {
  resolverPedidos({ reintentar: process.argv.includes('--reintentar') }).catch((e) => { console.log(`Documentos pedidos: ${e.message}`); });
}
