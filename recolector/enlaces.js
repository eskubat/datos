// Documentación completa de cada ayuda para los resúmenes: la ficha oficial y todos los enlaces
// de información que cuelgan de ella (bases, orden/decreto, boletín, normativa, PDF de la convocatoria…).
// Texto por enlace en caché (cache/docs/), se refresca cada 30 días.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
// Texto del PDF sin cabeceras de página de los boletines y, en normas largas, sin la exposición de motivos
const CABECERA = /^\d+\s*\/\s*\d+$|^p[aá]g(ina)?\.? ?\d+|^BOLET[IÍ]N OFICIAL|^EHAA|^N\.?º\s*\d+$|^\d{4}\/\d+\s*\(\d+\/\d+\)$|^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),? \d+ de \w+ de \d{4}$|^\w+ \d{4}ko \w+ \d+/i;
const limpiaPdf = (t) => {
  let x = t.replace(/\f/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !CABECERA.test(l)).join('\n');
  const art = x.search(/\n(Art[ií]culo 1\.?|Artículo primero)[ .–-]/);
  if (art > 3000 && x.length > 20000) x = x.slice(0, 1500) + '\n[…]\n' + x.slice(art + 1);
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
const TEXTO_UTIL = /bases|convocatoria|orden\b|decreto|ordenanza|resoluci[oó]n|normativa|bolet[ií]n|bopv|bob\b|bog\b|botha|boe\b|informaci[oó]n (detallada|adicional|complementaria)|m[aá]s informaci[oó]n|requisitos|gu[ií]a|preguntas frecuentes|anexo|extracto|descargar|pdf/i;
const URL_UTIL = /\.pdf(\?|$)|bopv|\/bob\/|bizkaia\.eus\/.*(boletin|bob)|gipuzkoa\.eus\/.*(bog|boletin)|araba\.eus\/.*botha|boe\.es|infosubvenciones|normativa|bases|convocatoria|ordenanza|\/servicios\/|\/ayuda_subvencion\/|\/r01-|web01-/i;
const URL_NO = /^(mailto|javascript|tel):|facebook|twitter|x\.com\/|linkedin|instagram|youtube|whatsapp|\/login|\/sso|cookies|accesibilidad|aviso-legal|privacidad|mapa-web|\.(jpe?g|png|gif|svg|zip|docx?|xlsx?|odt|ods)(\?|$)|#$|solicitud-electronica|tramitacion-electronica|mi-carpeta|nire-karpeta/i;
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
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': navegador ? UA_NAVEGADOR : UA_BOT, Accept: 'text/html,application/pdf,*/*' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) return { estado: r.status };
    if (buf.slice(0, 4).toString() === '%PDF') return { tipo: 'pdf', texto: limpiaPdf(pdfATexto(buf)) };
    const html = decodificar(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return { tipo: 'html', html, texto: sinRepetidos(cuerpoHtml(html)) };
  } catch (e) { return { estado: 0 }; } finally { clearTimeout(t); }
}

// Devuelve {id: texto completo} con la ficha + enlaces de cada ayuda (máx. `max` caracteres por ayuda)
export async function documentacion(ayudas, { log = console.log, max = 300000, extra = () => [] } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  let indice = {};
  try { indice = JSON.parse(fs.readFileSync(INDICE, 'utf8')); } catch {}
  const limite = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
  const leer = (u) => { const e = indice[u]; if (!e || !e.ok) return null; try { return JSON.parse(fs.readFileSync(path.join(DIR, sha(u) + '.json'), 'utf8')); } catch { return null; } };
  let nuevos = 0, fallos = 0;
  const obtener = async (u) => {
    const e = indice[u];
    if (e && e.v === V && e.fecha >= limite && (e.ok || e.intentos >= 3)) {
      const c = leer(u);
      // Documentos guardados cortados con un límite menor que el actual: se vuelven a bajar
      const lim = (c && c.max) || 60000;
      if (!(c && c.texto.length >= lim && lim < MAX_POR_DOC)) return c;
    }
    const r = await bajar(u);
    if (r.texto && r.texto.length > 80) {
      const guardado = { tipo: r.tipo, max: MAX_POR_DOC, texto: r.texto.slice(0, MAX_POR_DOC), enlaces: r.html ? enlacesDe(r.html, u).slice(0, 25) : [] };
      fs.writeFileSync(path.join(DIR, sha(u) + '.json'), JSON.stringify(guardado));
      indice[u] = { fecha: hoy(), ok: true, v: V };
      nuevos++;
      return guardado;
    }
    indice[u] = { fecha: hoy(), ok: false, v: V, intentos: ((e && !e.ok && e.v === V && e.intentos) || 0) + 1, estado: r.estado };
    fallos++;
    return null;
  };
  const res = {};
  await enParalelo(ayudas, 4, async (a) => {
    const partes = [];
    const vistos = new Set();
    const add = (titulo, url, t) => { if (t && !vistos.has(url)) { vistos.add(url); partes.push(`### ${titulo}: ${url}\n${t}`); } };
    // Ficha ya leída por el lector de la fuente (p. ej. la sede de Álava, que sin cookies solo da la plantilla)
    const principal = a._ficha ? { texto: a._ficha, enlaces: [] } : a.url ? await obtener(a.url) : null;
    if (principal) add('Ficha oficial', a.url, principal.texto);
    const cola = [
      ...extra(a).map((u) => ({ url: u, texto: 'Documento de la convocatoria' })),
      ...[a.bases, a.boletin].filter(Boolean).map((u) => ({ url: u, texto: u === a.bases ? 'Bases reguladoras' : 'Boletín oficial' })),
      ...((principal && principal.enlaces) || []),
    ];
    let n = 0;
    for (const l of cola) {
      if (n >= MAX_ENLACES || vistos.has(l.url)) continue;
      const d = await obtener(l.url);
      if (d) { add(l.texto || 'Enlace', l.url, d.texto); n++; }
    }
    if (partes.length) res[a.id] = partes.join('\n\n').slice(0, max);
  });
  fs.writeFileSync(INDICE, JSON.stringify(indice));
  log(`Documentación: ${Object.keys(res).length} ayudas con texto, ${nuevos} documentos nuevos, ${fallos} sin acceso (caché: ${Object.keys(indice).length})`);
  return res;
}
