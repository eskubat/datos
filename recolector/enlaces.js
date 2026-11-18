// Documentación completa de cada ayuda para los resúmenes: la ficha oficial y todos los enlaces
// de información que cuelgan de ella (bases, orden/decreto, boletín, normativa, PDF de la convocatoria…).
// Texto por enlace en caché (cache/docs/), se refresca cada 30 días.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { enParalelo, texto, entidades, decodificar, UA_BOT, UA_NAVEGADOR } from './comun.js';

const DIR = path.join('cache', 'docs');
const INDICE = path.join(DIR, 'indice.json');
const MAX_POR_DOC = 200000; // antes 60000: cortaba las bases de cuantía de las órdenes largas del BOPV
const V = 2; // versión del procesado: si cambia, se vuelven a bajar los documentos
const MAX_ENLACES = 12; // antes 8: se quedaban fuera anexos y bases de las convocatorias con muchos enlaces
const DIAS = 30;
const sha = (u) => crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);
const hoy = () => new Date().toISOString().slice(0, 10);

function pdfATexto(buf) {
  const f = path.join(os.tmpdir(), 'eskubat-' + Math.random().toString(36).slice(2) + '.pdf');
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-l', '150', '-enc', 'UTF-8', f, '-'], { maxBuffer: 50e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); }
  catch { return ''; } finally { fs.rmSync(f, { force: true }); }
}
// Texto de un documento Word (.docx): es un ZIP con el cuerpo en word/document.xml. Se lee el directorio
// central del ZIP sin herramientas externas; párrafos y celdas de tabla en líneas separadas.
export function docxATexto(buf) {
  try {
    let fin = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
    if (fin < 0) return '';
    const n = buf.readUInt16LE(fin + 10);
    let p = buf.readUInt32LE(fin + 16);
    for (let k = 0; k < n && buf.readUInt32LE(p) === 0x02014b50; k++) {
      const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20);
      const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const nombre = buf.slice(p + 46, p + 46 + ln).toString('utf8');
      p += 46 + ln + le + lc;
      if (nombre !== 'word/document.xml') continue;
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const datos = buf.slice(ini, ini + tam);
      const xml = (metodo === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
      return entidades(xml
        .replace(/<w:tab\/>/g, ' ').replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:p>|<\/w:tc>/g, '\n')
        .replace(/<[^>]+>/g, ''))
        .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    }
  } catch {}
  return '';
}
const ES_DOCX = /\.docx(\?|$)|-docx(\?|$)/i;

// Texto del PDF sin cabeceras de página de los boletines y, en normas largas, sin la exposición de motivos
const CABECERA = /^\d+\s*\/\s*\d+$|^p[aá]g(ina)?\.? ?\d+|^BOLET[IÍ]N OFICIAL|^EHAA|^N\.?º\s*\d+$|^\d{4}\/\d+\s*\(\d+\/\d+\)$|^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),? \d+ de \w+ de \d{4}$|^\w+ \d{4}ko \w+ \d+/i;
const DISPOSITIVA = /\n(DISPONGO|DISPONE|ACUERDO|ACUERDA|ACUERDAN|RESUELVO|RESUELVE|HE RESUELTO|SE RESUELVE|SE ACUERDA|DECRETO|DECRETA|ORDENO)\s*:?\s*(?=\n)/;
const limpiaPdf = (t) => {
  let x = t.replace(/\f/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !CABECERA.test(l)).join('\n');
  const art = x.search(/\n(Art[ií]culo 1\.?|Artículo primero)[ .–-]/);
  if (art > 3000 && x.length > 20000) {
    // En los decretos y órdenes que aprueban bases y convocatoria a la vez, la parte dispositiva (plazo de
    // solicitudes, presupuesto, créditos…) va entre la exposición de motivos y el artículo 1: se conserva
    // desde «DISPONGO» / «ACUERDO» / «RESUELVO»… (o desde «Primero.» si no hay esa línea) y solo se corta la exposición
    const tramo = x.slice(1500, art);
    let d = tramo.search(DISPOSITIVA);
    if (d < 0) d = tramo.search(/\n(Primero|PRIMERO)\s*[.:–-]/);
    const desde = d >= 0 ? 1500 + d + 1 : art + 1;
    x = x.slice(0, 1500) + '\n[…]\n' + x.slice(desde);
  }
  return x;
};

// Quita menús, pies y avisos de cookies de una página web
function cuerpoHtml(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
  return texto(main.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ''))
    .split('\n').filter((l) => !/cookie|accesibilidad|aviso legal|política de privacidad|mapa web|síguenos|compartir|^(inicio|buscar|menú|euskara|castellano|english|français)$/i.test(l))
    .join('\n');
}
// Sin líneas repetidas (las fichas repiten el mismo bloque en varias pestañas) ni la parte de tramitación
function sinRepetidos(t) {
  const vistos = new Set();
  const out = [];
  for (const l of t.split('\n')) {
    if (/^(Resoluci[oó]n y recursos|Lugares de presentaci[oó]n|Recurso de alzada)$/i.test(l)) break;
    const k = l.toLowerCase();
    if (l.length > 15 && vistos.has(k)) continue;
    vistos.add(k); out.push(l);
  }
  return out.join('\n');
}

// Enlaces de información de una página: documentos y páginas que explican la ayuda
const TEXTO_UTIL = /bases|convocatoria|orden\b|decreto|ordenanza|resoluci[oó]n|normativa|bolet[ií]n|bopv|bob\b|bog\b|botha|boe\b|informaci[oó]n (detallada|adicional|complementaria)|m[aá]s informaci[oó]n|requisitos|criterios|gu[ií]a|preguntas frecuentes|anexo|extracto|descargar|pdf/i;
const URL_UTIL = /\.pdf(\?|$)|\.docx(\?|$)|-docx(\?|$)|bopv|\/bob\/|bizkaia\.eus\/.*(boletin|bob)|gipuzkoa\.eus\/.*(bog|boletin)|araba\.eus\/.*botha|boe\.es|infosubvenciones|normativa|bases|convocatoria|ordenanza|\/servicios\/|\/ayuda_subvencion\/|\/r01-|web01-/i;
const URL_NO = /^(mailto|javascript|tel):|facebook|twitter|x\.com\/|linkedin|instagram|youtube|whatsapp|\/login|\/sso|cookies|accesibilidad|aviso-legal|privacidad|mapa-web|\.(jpe?g|png|gif|svg|zip|doc|xlsx?|odt|ods)(\?|$)|#$|solicitud-electronica|tramitacion-electronica|mi-carpeta|nire-karpeta/i;
export function enlacesDe(html, base) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(entidades(m[1]).trim(), base).href; } catch { continue; }
    const txt = entidades(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (URL_NO.test(u) || !/^https?:/.test(u) || u.split('#')[0] === String(base).split('#')[0]) continue;
    if (!(TEXTO_UTIL.test(txt) || URL_UTIL.test(u))) continue;
    // Las otras versiones de idioma de la misma página no aportan nada
    if (/\/(eu|en|fr)\/?(\?|$)/.test(u) && u.replace(/\/(eu|en|fr)\/?/, '/es/') === String(base)) continue;
    out.push({ url: u, texto: txt });
  }
  const vistos = new Set();
  return out.filter((x) => !vistos.has(x.url) && vistos.add(x.url))
    .sort((a, b) => (/\.pdf/i.test(b.url) + TEXTO_UTIL.test(b.texto)) - (/\.pdf/i.test(a.url) + TEXTO_UTIL.test(a.texto)));
}

async function bajar(url) {
  const navegador = /euskadi\.eus|euskadi\.net/.test(url);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': navegador ? UA_NAVEGADOR : UA_BOT, Accept: 'text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) return { estado: r.status };
    if (buf.slice(0, 4).toString() === '%PDF') return { tipo: 'pdf', texto: limpiaPdf(pdfATexto(buf)) };
    // Word (.docx): ZIP con word/document.xml (las URL de egoitza.araba.eus acaban en «-docx», sin extensión)
    if (buf.slice(0, 2).toString() === 'PK') { const t = docxATexto(buf); return t ? { tipo: 'docx', texto: limpiaPdf(t) } : { estado: 415 }; }
    const html = decodificar(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return { tipo: 'html', html, texto: sinRepetidos(cuerpoHtml(html)) };
  } catch (e) { return { estado: 0 }; } finally { clearTimeout(t); }
}

// Devuelve {id: texto completo} con la ficha + enlaces de cada ayuda (máx. `max` caracteres por ayuda)
// `alFinal(a)`: documentos que van detrás del resto, fuera del límite de enlaces y de caracteres (los de
// cache/docs_extra.json ya copiados por la tarea en cache/textos_claude): así, al descargarlos, el texto de
// antes queda igual al principio y la huella sin ellos sigue siendo la de la ficha (ver fichaVigente en resumen.js).
// `previo(a)`: texto que la ayuda tenía en la pasada anterior (cache/fuentes/<id>.txt). Si la descarga de un
// documento falla (403, 429, error de red, servidor caído…) y no hay copia en cache/docs, se reutiliza su sección
// de ese texto, en el mismo sitio: la documentación no se queda cortada y la huella no cambia por un fallo pasajero
// (tarea bdns-documentos-perdidos: el 18/11 la BDNS no dejó bajar ~290 documentos y 93 fichas volvieron a la cola).
// Solo un 404 o 410 (el documento ya no existe) lo quita.
export async function documentacion(ayudas, { log = console.log, max = 300000, extra = () => [], alFinal = () => [], previo = () => '' } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  let indice = {};
  try { indice = JSON.parse(fs.readFileSync(INDICE, 'utf8')); } catch {}
  const limite = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
  const leer = (u) => { const e = indice[u]; if (!e || !e.ok) return null; try { return JSON.parse(fs.readFileSync(path.join(DIR, sha(u) + '.json'), 'utf8')); } catch { return null; } };
  // cache/docs_refrescar.json ({url: "AAAA-MM-DD"}): documentos que se vuelven a bajar aunque estén en caché,
  // mientras su descarga guardada sea anterior a esa fecha (p. ej. tras cambiar cómo se limpia un PDF): se baja una
  // sola vez, no en cada pasada del día
  let refrescar = {};
  try { refrescar = JSON.parse(fs.readFileSync(path.join('cache', 'docs_refrescar.json'), 'utf8')); } catch {}
  const refrescados = new Set();
  let nuevos = 0, fallos = 0, respaldos = 0;
  const estados = {}; // url → estado HTTP del último fallo (0: sin respuesta)
  const obtener = async (u) => {
    let e = indice[u];
    // Copia buena guardada antes de volver a bajarla: si la nueva descarga falla (la web no responde en esa pasada),
    // se sigue usando, para que el texto de la ayuda no se quede solo con el extracto y su ficha no vuelva a la cola
    let previa = null;
    if (e && refrescar[u] && e.fecha < refrescar[u] && !refrescados.has(u)) { refrescados.add(u); previa = leer(u); e = undefined; }
    // Los .docx que fallaron antes de saber leerlos (sin «dx») se vuelven a intentar una vez
    if (e && e.v === V && e.fecha >= limite && (e.ok || (e.intentos >= 3 && (e.dx || !ES_DOCX.test(u))))) {
      const c = leer(u);
      if (!e.ok) estados[u] = e.estado;
      // Documentos guardados cortados con un límite menor que el actual: se vuelven a bajar
      const lim = (c && c.max) || 60000;
      if (!(c && c.texto.length >= lim && lim < MAX_POR_DOC)) return c;
      previa = c;
    }
    const r = await bajar(u);
    if (r.texto && r.texto.length > 80) {
      const guardado = { tipo: r.tipo, max: MAX_POR_DOC, texto: r.texto.slice(0, MAX_POR_DOC), enlaces: r.html ? enlacesDe(r.html, u).slice(0, 25) : [] };
      fs.writeFileSync(path.join(DIR, sha(u) + '.json'), JSON.stringify(guardado));
      indice[u] = { fecha: hoy(), ok: true, v: V };
      nuevos++;
      return guardado;
    }
    fallos++;
    estados[u] = r.estado;
    if (previa) return previa; // se conserva la entrada del índice: se vuelve a intentar en la próxima pasada
    indice[u] = { fecha: hoy(), ok: false, v: V, dx: 1, intentos: ((e && !e.ok && e.v === V && (e.dx || !ES_DOCX.test(u)) && e.intentos) || 0) + 1, estado: r.estado };
    return null;
  };
  const res = {};
  const BORRADO = new Set([404, 410]);
  await enParalelo(ayudas, 4, async (a) => {
    // Secciones «### Título: url» del texto anterior de la ayuda
    const anteriores = new Map();
    for (const p of String(previo(a) || '').split(/\n\n(?=### )/)) {
      const m = p.match(/^### .*: (\S+)\n([\s\S]+)$/);
      if (m && m[2].trim().length > 80 && !anteriores.has(m[1])) anteriores.set(m[1], m[2]);
    }
    const obtenerOPrevio = async (u) => {
      const d = await obtener(u);
      if (d || BORRADO.has(estados[u]) || !anteriores.has(u)) return d;
      respaldos++;
      return { tipo: 'previo', texto: anteriores.get(u), enlaces: [] };
    };
    const partes = [];
    const vistos = new Set();
    const add = (titulo, url, t) => { if (t && !vistos.has(url)) { vistos.add(url); partes.push(`### ${titulo}: ${url}\n${t}`); } };
    // Ficha ya leída por el lector de la fuente (p. ej. la sede de Álava, que sin cookies solo da la plantilla)
    const principal = a._ficha ? { texto: a._ficha, enlaces: [] } : a.url ? await obtenerOPrevio(a.url) : null;
    if (principal) add('Ficha oficial', a.url, principal.texto);
    const cola = [
      ...extra(a).map((u) => ({ url: u, texto: 'Documento de la convocatoria' })),
      ...[a.bases, a.boletin].filter(Boolean).map((u) => ({ url: u, texto: u === a.bases ? 'Bases reguladoras' : 'Boletín oficial' })),
      ...((principal && principal.enlaces) || []),
    ];
    let n = 0;
    for (const l of cola) {
      if (n >= MAX_ENLACES || vistos.has(l.url)) continue;
      const d = await obtenerOPrevio(l.url);
      if (d) {
        add(l.texto || 'Enlace', l.url, d.texto); n++;
        // Páginas enlazadas (bases, boletín, documento añadido…) que a su vez enlazan los PDF de la convocatoria,
        // p. ej. la página de subvenciones de un ayuntamiento con «Bases del concurso» y «Criterios de valoración»:
        // se siguen un nivel más, solo hacia documentos (PDF o descargas)
        if (!l.hijo && d.tipo === 'html' && d.enlaces && d.enlaces.length) {
          for (const h of d.enlaces) {
            if (/\.pdf(\?|$)|\.docx(\?|$)|-docx(\?|$)|download|descarga|deskarga|documento|fichero|\/file(\/|$)/i.test(h.url) || /\bpdf\b/i.test(h.texto)) cola.push({ ...h, hijo: true });
          }
        }
      }
    }
    const texto = partes.join('\n\n').slice(0, max);
    const fin = [];
    for (const u of alFinal(a)) {
      if (vistos.has(u)) continue;
      const d = await obtenerOPrevio(u);
      if (d) { vistos.add(u); fin.push(`### Documento de la convocatoria: ${u}\n${d.texto}`); }
    }
    if (texto || fin.length) res[a.id] = [texto, ...fin].filter(Boolean).join('\n\n');
  });
  fs.writeFileSync(INDICE, JSON.stringify(indice));
  log(`Documentación: ${Object.keys(res).length} ayudas con texto, ${nuevos} documentos nuevos, ${fallos} sin acceso, ${respaldos} tomados del texto anterior por fallo de descarga (caché: ${Object.keys(indice).length})`);
  return res;
}

// Quita las secciones «### …: url» cuyo texto ya está en una sección anterior (el mismo documento subido dos
// veces a la BDNS con otro id, un trozo de él, o la misma página genérica de la sede con otra URL). Así una
// copia repetida no cambia la huella del texto ni devuelve la ficha a la cola sin que cambie el contenido.
// Se comparan los textos sin mayúsculas ni diferencias de espacios; un texto contenido en otro solo cuenta
// si es largo (200 caracteres o más), para no quitar fragmentos cortos que coinciden por casualidad.
export function quitaRepetidas(t) {
  const partes = String(t || '').split(/\n\n(?=### )/);
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const vistos = [];
  const quedan = [];
  for (const p of partes) {
    const m = p.match(/^### [^\n]*\n([\s\S]*)$/);
    if (!m) { quedan.push(p); continue; }
    const c = norm(m[1]);
    if (c && vistos.some((v) => v === c || (c.length >= 200 && v.includes(c)))) continue;
    vistos.push(c);
    quedan.push(p);
  }
  return quedan.join('\n\n');
}
