// Fuentes forales: sedes electrónicas de las Diputaciones de Gipuzkoa y Araba/Álava.
// (La Diputación de Bizkaia publica sus convocatorias en la BDNS, que ya se recoge.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pedir, texto, entidades, frase, iso, enParalelo, temasDe, paraDeTexto, norm } from './comun.js';

// ---------- Gipuzkoa ----------
const G = 'https://egoitza.gipuzkoa.eus/es/subvenciones';
const P = '_Subvenciones_WAR_LEEsubvencionesportlet_';

function filasGipuzkoa(html) {
  const tabla = (html.match(/<table class="table" id="tablaSubvenciones">([\s\S]*?)<\/table>/) || [])[1] || '';
  const filas = [];
  for (const tr of tabla.split(/<tr class="(?:odd|even)">/).slice(1)) {
    const tds = tr.split(/<td[^>]*>/).slice(1).map((x) => x.replace(/<\/td>[\s\S]*$/, ''));
    const a = (tds[0] || '').match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    filas.push({
      url: entidades(a[1]),
      titulo: texto(a[2]),
      colectivo: texto(tds[1] || '').split('\n').filter(Boolean),
      plazo: texto(tds[2] || ''),
      fin: iso((texto(tds[3] || '').match(/(\d{2})-(\d{2})-(\d{4})/) || []).slice(1).join('/')),
    });
  }
  return filas;
}

function fichaGipuzkoa(html) {
  const sec = (html.match(/<section class="portlet" id="portlet_Subvenciones_WAR_LEEsubvencionesportlet">([\s\S]*?)<\/section>/) || [])[1] || '';
  const lineas = texto(sec).split('\n').filter((l) => l.length > 2);
  const val = (re) => { const i = lineas.findIndex((l) => re.test(l)); return i >= 0 ? (lineas[i].split(':').slice(1).join(':').trim() || lineas[i + 1] || '') : ''; };
  const inicio = iso((val(/^(Fecha de )?inicio|^Plazo.*desde/i).match(/\d{2}[-/]\d{2}[-/]\d{4}/) || [''])[0].replace(/-/g, '/'));
  return {
    texto: [...new Set(lineas)].join('\n').slice(0, 8000),
    resumen: [...new Set(lineas.filter((l) => l.length > 60))].slice(0, 3).join('\n'),
    organismo: val(/^Departamento|^Órgano/i),
    inicio,
  };
}

export async function gipuzkoa(log) {
  const año = new Date().getFullYear();
  const portada = await pedir(G);
  const materias = [...new Set([...portada.matchAll(/idMateria=([A-Z]{3,5})/g)].map((m) => m[1]))];
  const hoy = new Date().toISOString().slice(0, 10);
  const porUrl = new Map();
  for (const m of materias) {
    for (let p = 1; p <= 10; p++) {
      const url = `${G}?p_p_id=Subvenciones_WAR_LEEsubvencionesportlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&${P}myaction=lista&${P}idMateria=${m}&${P}d-7690214-p=${p}&${P}ejercicio=${año}`;
      const filas = filasGipuzkoa(await pedir(url));
      let nuevas = 0;
      for (const f of filas) {
        const clave = (f.url.match(/cserv=([^&]+)/) || [])[1] || f.url;
        if (!porUrl.has(clave)) { porUrl.set(clave, { ...f, materia: m }); nuevas++; }
      }
      if (!filas.length || !nuevas || filas.length < 20) break;
    }
  }
  const todas = [...porUrl.values()];
  const vigentes = todas.filter((f) => !/fuera de plazo|cerrad/i.test(f.plazo) && !(f.fin && f.fin < hoy));
  log(`Gipuzkoa: ${materias.length} materias, ${todas.length} líneas de ayuda, ${vigentes.length} en plazo`);
  const fichas = await enParalelo(vigentes, 3, (f) => pedir(f.url).then(fichaGipuzkoa));
  return vigentes.map((f, k) => {
    const d = fichas[k] && !fichas[k].error ? fichas[k] : {};
    const todo = [f.titulo, d.resumen, f.colectivo.join(' ')].join(' ');
    const clave = (f.url.match(/cserv=([^&]+)/) || [])[1] || norm(f.titulo).slice(0, 40);
    return {
      id: 'gip-' + clave.toLowerCase(),
      titulo: frase(f.titulo),
      organismo: d.organismo ? `Diputación Foral de Gipuzkoa · ${d.organismo}` : 'Diputación Foral de Gipuzkoa',
      ambito: { nivel: 'territorio', nombre: 'Gipuzkoa', terr: 'Gipuzkoa' },
      inicio: d.inicio || null,
      fin: f.fin,
      estadoFuente: f.plazo,
      presupuesto: null,
      cuantia: '',
      resumen: d.resumen || '',
      dirigido: f.colectivo.join('\n'),
      _texto: [f.titulo, 'Colectivo: ' + f.colectivo.join(', '), 'Plazo: ' + f.plazo, d.texto || ''].join('\n'),
      para: paraDeTexto(f.colectivo.join(' ') + ' ' + f.titulo),
      temas: temasDe([f.titulo, (d.resumen || '').slice(0, 300)].join(' ')),
      url: f.url,
      fuentes: [{ nombre: 'Sede electrónica de Gipuzkoa', url: f.url }],
    };
  });
}

// ---------- Araba/Álava ----------
const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
// Fecha de fin de un texto de plazo de la sede de Álava. Reglas:
// - solo cuenta el plazo de solicitud: se corta cada línea donde empieza la justificación o la resolución;
// - las líneas marcadas CERRADO/CERRADA no valen si hay otra línea con fechas (p. ej. el plazo excepcional ABIERTO);
//   si todas las fechas están en líneas cerradas, se devuelve la última (ya pasada) para que la ayuda salga cerrada;
// - se toma la ÚLTIMA fecha (dd/mm/aaaa o «d de mes [de] [aaaa]»), con su año o el primero que aparezca después;
// - «desde el 19 de marzo» sin «hasta/al» es la fecha de inicio: no hay fin;
// - solo si el texto no trae ningún año, una fecha ya pasada se lleva al año siguiente (plazos anuales).
function fechasDe(s) {
  const out = [];
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{1,2}) de ([a-z]+)(?:,? (?:de |del )?(\d{4}))?|\b((?:19|20)\d\d)\b/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out.push({ d: +m[1], mes: +m[2], y: +m[3], i: m.index });
    else if (m[4] && MES[m[5]]) out.push({ d: +m[4], mes: MES[m[5]], y: m[6] ? +m[6] : null, i: m.index });
    else if (m[7]) out.push({ anyo: +m[7], i: m.index });
  }
  return out;
}
export function fechaTexto(t) {
  const lineas = String(t || '').split(/\n+/).map((l) => norm(l).split(/justificaci|resolucion expresa|plazo maximo de resolucion/)[0]).filter(Boolean);
  const abiertas = [], cerradas = [];
  for (let l of lineas) {
    if (/\bcerrad[oa]\b/.test(l)) {
      const ab = l.search(/\babiert[oa]\b/);
      if (ab > l.search(/\bcerrad[oa]\b/)) { cerradas.push(l.slice(0, ab)); l = l.slice(ab); } else { cerradas.push(l); continue; }
    }
    abiertas.push(l);
  }
  const ultima = (l) => {
    const fs = fechasDe(l);
    const dias = fs.filter((f) => f.d);
    if (!dias.length) return null;
    const f = dias[dias.length - 1];
    if (dias.length === 1 && /\b(desde|a partir)\b[^0-9]*$/.test(l.slice(0, f.i)) && !/\b(hasta|al)\b/.test(l)) return null;
    const sig = fs.find((x) => x.i > f.i && (x.y || x.anyo));
    const y = f.y || (sig && (sig.y || sig.anyo)) || null;
    return { ...f, y, conAnyo: fs.some((x) => x.y || x.anyo) };
  };
  let f = null;
  for (const l of abiertas) f = ultima(l) || f;
  const cerrada = !f;
  if (!f) for (const l of cerradas) f = ultima(l) || f;
  if (!f || f.mes < 1 || f.mes > 12 || f.d < 1 || f.d > 31) return null;
  const hoy = new Date();
  const d = new Date(Date.UTC(f.y || hoy.getUTCFullYear(), f.mes - 1, f.d));
  if (!f.y && !f.conAnyo && !cerrada && d < new Date(hoy.getTime() - 60 * 864e5)) d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// La sede electrónica (egoitza.araba.eus) publica la guía completa de trámites de tipo
// «Ayudas, becas y subvenciones» (izapideMota=90), filtrable «En plazo» (epea=1). La
// primera página viene dentro del HTML (var data = {...}); las demás se piden por POST
// al portlet «lector json», con las cookies que pone el cortafuegos en la primera visita.
const SEDE_A = 'https://egoitza.araba.eus/es/inicio/tramites';
const FILTRO_A = 'izapideMota=90&epea=1';
const PORTLET_A = 'p_p_id=ANPWCOMU_lector_json_module_ANPWCOMULectorJsonModulePortlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_cacheability=cacheLevelPage';
const UA_A = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// Extrae el objeto JSON que sigue a «var data =» respetando cadenas y llaves anidadas
export function datosSedeAraba(html) {
  const i = html.indexOf('var data = {');
  if (i < 0) return null;
  let k = html.indexOf('{', i), prof = 0, enCad = false, esc = false;
  for (let j = k; j < html.length; j++) {
    const c = html[j];
    if (enCad) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enCad = false; continue; }
    if (c === '"') enCad = true;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) { try { return JSON.parse(html.slice(k, j + 1)); } catch { return null; } }
  }
  return null;
}

// ---------- Ficha de cada trámite de la sede de Álava ----------
// La página de la ficha es una plantilla ({{resultado.…}}) que se rellena en el navegador con los
// datos del trámite. Se piden con las cookies del cortafuegos: primero el objeto «var data» del
// HTML y, si no viene, el JSON del portlet «lector json». El JSON se pasa a texto (objeto, quién
// puede pedirla, requisitos, cuantía, plazo…) y se apartan los enlaces a documentos (BOTHA, bases,
// anexos) para que los descargue la documentación. Caché de 7 días en cache/araba_fichas.json.
const CACHE_FA = path.join('cache', 'araba_fichas.json');
const DIAS_FA = 7;
const BASE_A = 'https://egoitza.araba.eus';
const CLAVE_NO = /(^|_)(id|ids|cod\w*|friendly\w*|url\w*|href|icono?|imagen\w*|img|css|clase|class|orden|order|tipo[A-Z]?\w*Id|uuid|groupId|companyId|version)$/i;
const DOC_SI = /\.pdf(\?|$)|botha|\/documents\/|bases|convocatoria|anexo|extracto|orden-?foral|decreto|normativa/i;
const DOC_NO = /\{\{|%7B%7B|\.(jpe?g|png|gif|svg|ico|css|js)(\?|$)|\/(conoce-la-sede|preguntas-frecuentes|requisitos-tecnicos)/i;

function absoluta(u) {
  try { return new URL(entidades(String(u)).trim(), BASE_A + '/').href; } catch { return null; }
}
// Pasa el JSON de un trámite a texto legible y recoge sus enlaces a documentos
export function fichaAraba(obj) {
  const lineas = [], docs = [], vistas = new Set();
  const doc = (u) => { const a = absoluta(u); if (a && /^https?:/.test(a) && DOC_SI.test(a) && !DOC_NO.test(a) && !docs.includes(a)) docs.push(a); };
  const humano = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
  const recorrer = (v, clave, prof) => {
    if (v == null || prof > 12) return;
    if (Array.isArray(v)) { for (const x of v) recorrer(x, clave, prof + 1); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) recorrer(x, k, prof + 1); return; }
    if (typeof v !== 'string') return;
    const s = v.trim();
    if (!s) return;
    for (const m of s.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) doc(m[1]);
    if (/^(https?:\/\/|\/documents\/|\/es\/|\/eu\/)/i.test(s) && !/\s/.test(s)) { doc(s); return; }
    if (CLAVE_NO.test(clave || '') || /\{\{/.test(s)) return;
    const t = texto(entidades(s)).replace(/\n{3,}/g, '\n\n').trim();
    if (!t || t.length < 3 || /^[\d\s.,:/-]+$/.test(t) || /^(true|false|null|S|N)$/i.test(t)) return;
    const k = t.toLowerCase();
    if (vistas.has(k)) return;
    vistas.add(k);
    lineas.push(t.length < 120 && !t.includes('\n') ? `${humano(clave)}: ${t}` : `${humano(clave)}:\n${t}`);
  };
  recorrer(obj, '', 0);
  return { texto: lineas.join('\n'), docs };
}

async function fichasSedeAraba(tramites, cab, guardar, log) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_FA, 'utf8')); } catch {}
  const limite = new Date(Date.now() - DIAS_FA * 864e5).toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);
  let nuevas = 0, fallos = 0, muestra = false;
  // Diagnóstico: guarda la página y la respuesta del portlet del primer trámite sin contenido
  // (cache/araba_muestra_*.txt) para ver dónde carga la página los datos del trámite.
  const guardarMuestra = (f, html, st1, post, st2) => {
    if (muestra) return;
    muestra = true;
    try {
      const urls = [...new Set([...String(html || '').matchAll(/(?:src|href|url)\s*[:=]\s*["']([^"']*(?:\/o\/|p_p_id|lector|json|api|resource)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 40);
      log(`Araba/Álava (sede): muestra ${f.url} · página HTTP ${st1}, ${String(html || '').length} car., «var data» ${String(html || '').includes('var data') ? 'sí' : 'no'} · portlet HTTP ${st2}, ${String(post || '').length} car. · ${urls.length} URL de datos`);
      fs.mkdirSync('cache', { recursive: true });
      fs.writeFileSync(path.join('cache', 'araba_muestra_pagina.txt'), `${f.url}\nHTTP ${st1}\nURL de datos:\n${urls.join('\n')}\n\n${String(html || '').slice(0, 400000)}`);
      fs.writeFileSync(path.join('cache', 'araba_muestra_portlet.txt'), `HTTP ${st2}\n\n${String(post || '').slice(0, 100000)}`);
    } catch {}
  };
  await enParalelo(tramites, 2, async (f) => {
    const c = cache[f.url];
    if (c && c.fecha >= limite && c.texto) { f.ficha = c.texto; f.docs = c.docs || []; return; }
    let obj = null, html = '', st1 = 0, post = '', st2 = 0;
    try {
      const r = await fetch(f.url, { headers: cab('text/html,application/xhtml+xml'), redirect: 'follow' });
      guardar(r);
      st1 = r.status; html = await r.text();
      const d = datosSedeAraba(html);
      if (d) obj = d.resultado || d;
    } catch {}
    if (!obj) {
      try {
        const r = await fetch(`${f.url}?${PORTLET_A}`, { method: 'POST', headers: { ...cab('application/json, text/javascript, */*'), 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: '' });
        guardar(r);
        st2 = r.status; post = await r.text();
        const d = JSON.parse(post);
        obj = d.resultado || d;
      } catch {}
    }
    const fa = obj ? fichaAraba(obj) : null;
    if (!(fa && fa.texto.length > 200)) guardarMuestra(f, html, st1, post, st2);
    if (fa && fa.texto.length > 200) {
      f.ficha = fa.texto; f.docs = fa.docs;
      cache[f.url] = { fecha: hoy, texto: fa.texto.slice(0, 60000), docs: fa.docs.slice(0, 15) };
      nuevas++;
    } else fallos++;
    await new Promise((ok) => setTimeout(ok, 500));
  });
  const vivas = new Set(tramites.map((f) => f.url));
  for (const u of Object.keys(cache)) if (!vivas.has(u)) delete cache[u];
  try { fs.mkdirSync('cache', { recursive: true }); fs.writeFileSync(CACHE_FA, JSON.stringify(cache)); } catch {}
  log(`Araba/Álava (sede): ${tramites.filter((f) => f.ficha).length} fichas con contenido (${nuevas} nuevas, ${fallos} sin contenido)`);
}

async function sedeAraba(log) {
  const jar = {};
  const guardar = (r) => { for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; const e = kv.indexOf('='); if (e > 0) jar[kv.slice(0, e).trim()] = kv.slice(e + 1); } };
  const cab = (accept) => ({ 'User-Agent': UA_A, Accept: accept, 'Accept-Language': 'es-ES,es;q=0.9', ...(Object.keys(jar).length ? { Cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') } : {}) });
  let datos = null;
  for (let intento = 0; intento < 3 && !datos; intento++) {
    const r = await fetch(`${SEDE_A}?${FILTRO_A}`, { headers: cab('text/html,application/xhtml+xml'), redirect: 'follow' });
    guardar(r);
    datos = datosSedeAraba(await r.text());
    if (!datos) await new Promise((ok) => setTimeout(ok, 1500));
  }
  if (!datos) { log('Araba/Álava (sede): la página llegó sin la lista (cortafuegos); se usan solo las destacadas'); return []; }
  const res = [...(datos.resultados || [])];
  const ultima = Math.min(+(datos.informacionAdicional || {}).paginaUltima || 1, 60);
  for (let p = 2; p <= ultima; p++) {
    try {
      const r = await fetch(`${SEDE_A}?${PORTLET_A}&${FILTRO_A}`, { method: 'POST', headers: { ...cab('application/json, text/javascript, */*'), 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: 'selectedPage=' + p });
      guardar(r);
      const d = JSON.parse(await r.text());
      res.push(...(d.resultados || []));
    } catch (e) { log(`Araba/Álava (sede): falló la página ${p} (${e.message})`); }
    await new Promise((ok) => setTimeout(ok, 400));
  }
  const total = (datos.informacionAdicional || {}).elementosTotalesEncontrados;
  log(`Araba/Álava (sede): ${res.length} trámites de ayudas en plazo${total ? ` de ${total}` : ''}`);
  // Como en la BDNS, fuera las nominativas y las de concesión directa: no se pueden pedir
  const pedibles = res.filter((x) => (!x.plazo || x.plazo.enPlazo !== 'N') && !/nominativ|concesi[oó]n directa/i.test(x.titulo || ''));
  log(`Araba/Álava (sede): ${res.length - pedibles.length} descartadas por nominativas o de concesión directa`);
  const tramites = pedibles.map((x) => {
    const plazo = texto(entidades((x.plazo && (x.plazo.descripcionPlazoAmpliada || x.plazo.descripcionPlazo)) || ''));
    return { url: SEDE_A + '/fitxa' + x.friendlyUrl, titulo: texto(x.titulo || ''), fin: fechaTexto(plazo), plazo, tema: x.nivel1Tema || '', finalidad: texto(entidades(x.finalidad || '')), cod: x.codProcedimiento };
  });
  // Contenido de cada ficha (si falla, el trámite sigue entrando con lo del listado)
  try { await fichasSedeAraba(tramites, cab, guardar, log); } catch (e) { log(`Araba/Álava (sede): no se pudieron leer las fichas (${e.message})`); }
  return tramites;
}

export async function araba(log) {
  const out = [];
  // 1) Destacadas de web.araba.eus
  try {
    const html = await pedir('https://web.araba.eus/es/ayudas-en-vigor');
    const re = /<a[^>]+href="(https:\/\/egoitza\.araba\.eus[^"]*fitxa[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      const url = entidades(m[1]);
      const titulo = texto(m[2]);
      const tras = texto(html.slice(m.index + m[0].length, m.index + m[0].length + 800)).split('\n').find((l) => /hasta|abierto/i.test(l)) || '';
      if (!titulo || out.some((x) => x.url === url)) continue;
      out.push({ url, titulo, fin: fechaTexto(tras), plazo: tras });
    }
    log(`Araba/Álava: ${out.length} ayudas destacadas en vigor`);
  } catch (e) { log(`Araba/Álava: no se pudo leer la página de destacadas (${e.message})`); }
  // 2) Guía completa de la sede
  let sede = [];
  try { sede = await sedeAraba(log); } catch (e) { log(`Araba/Álava (sede): ${e.message}`); }
  const clave = (u) => norm(decodeURIComponent(u.split('/fitxa/')[1] || u)).replace(/[^a-z0-9]+/g, '-');
  for (const f of sede) {
    const prev = out.find((x) => clave(x.url) === clave(f.url));
    if (prev) Object.assign(prev, { tema: f.tema, finalidad: f.finalidad, plazo: prev.plazo || f.plazo, fin: prev.fin || f.fin, ficha: f.ficha, docs: f.docs });
    else out.push(f);
  }
  // Id: 'ara-' + el friendlyUrl normalizado y cortado a 60 caracteres. Si dos trámites distintos
  // comparten esos 60 caracteres (p. ej. la línea de asociaciones y la de ayuntamientos, o la
  // convocatoria de un año y la del siguiente), a esos se les añade una huella corta del
  // friendlyUrl completo para que cada uno tenga su id (los que no chocan conservan el suyo).
  const slug = (f) => norm(decodeURIComponent(f.url.split('/fitxa/')[1] || f.titulo)).replace(/[^a-z0-9]+/g, '-');
  const corto = (f) => 'ara-' + slug(f).slice(0, 60);
  const veces = {};
  for (const f of out) veces[corto(f)] = (veces[corto(f)] || 0) + 1;
  const idDe = (f) => (veces[corto(f)] > 1 ? corto(f).replace(/-+$/, '') + '-' + crypto.createHash('sha1').update(slug(f)).digest('hex').slice(0, 6) : corto(f));
  return out.map((f) => ({
    id: idDe(f),
    titulo: frase(f.titulo),
    organismo: 'Diputación Foral de Álava',
    ambito: { nivel: 'territorio', nombre: 'Araba/Álava', terr: 'Araba/Álava' },
    inicio: null,
    fin: f.fin,
    estadoFuente: f.plazo,
    presupuesto: null,
    cuantia: '',
    resumen: f.finalidad ? f.finalidad.slice(0, 600) : '',
    dirigido: '',
    para: paraDeTexto(f.titulo + ' ' + (f.finalidad || '')),
    _texto: [f.titulo, f.plazo, f.tema, f.finalidad].filter(Boolean).join('\n'),
    temas: temasDe(f.titulo + ' ' + (f.tema || '') + ' ' + (f.finalidad || '')),
    url: f.url,
    fuentes: [{ nombre: 'Sede electrónica de Álava', url: f.url }],
    // Texto y documentos de la ficha leídos con las cookies de la sede (la documentación los usa
    // en lugar de descargar la plantilla vacía de la página)
    ...(f.ficha ? { _ficha: f.ficha } : {}),
    ...(f.docs && f.docs.length ? { _urls: f.docs } : {}),
  }));
}
