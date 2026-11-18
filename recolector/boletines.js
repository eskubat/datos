// Boletines oficiales: BOB (Bizkaia), BOG (Gipuzkoa), BOTHA (Álava) y BOPV (Gobierno Vasco).
// Cubren ayudas de diputaciones y ayuntamientos que no llegan por la BDNS ni por las webs (Bilbao, Donostia y
// Vitoria-Gasteiz no se pueden leer automáticamente). Se leen los sumarios de los últimos 45 días, se quedan las
// convocatorias de ayudas y se descarga su texto para calcular el plazo. Caché: cache/boletines.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { norm, frase, entidades, enParalelo, temasDe, paraDeTexto, decodificar, MUNI_IDX, UA_BOT, UA_NAVEGADOR } from './comun.js';
import { calculaFin, partesExtracto, RUIDO } from './bdns.js';

const DIAS = 45;
const CACHE = path.join('cache', 'boletines.json');
const ES_AYUDA = /(convocatoria|bases|extracto)[^.]{0,250}(subvenci|ayudas?\b|becas?\b|premios?\b|concurso)|^(subvenciones|ayudas|becas|premios)\b|\bconcurso (infantil|literario|de (fotograf|pintura|escaparates|carteles|relatos|postales|ideas|dibujo))/i;
const NO_AYUDA = /lista (provisional|definitiva)|admitid|excluid|proceso selectivo|\bplazas?\b|bolsa de (empleo|trabajo)|resoluci[oó]n (definitiva )?de (la )?concesi|concesi[oó]n de las? (subvenci|ayudas)|adjudicaci|plan estrat[eé]gico|ordenanza|cr[eé]dito|tramitaci[oó]n anticipada|subasta|provisi[oó]n|nombramiento|modificaci[oó]n de (la|las)|correcci[oó]n de errores|desistimiento|reintegro|justificaci[oó]n|resoluci[oó]n de (la )?convocatoria|ampliaci[oó]n del cr[eé]dito|contrataci[oó]n de|licitaci|incremento|jurado|nombra|lista de (personas|solicitudes)|concedidas|aprobaci[oó]n inicial|relaci[oó]n de (subvenciones|ayudas)|abono de|terrenos|redistribuci[oó]n/i;
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const hoyMenos = (n) => { const d = new Date(Date.now() - n * 864e5); return d; };
const isoDia = (d) => d.toISOString().slice(0, 10);

async function bajar(url, { pdf = false, navegador = false, layout = true } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    // euskadi.eus (BOPV) rechaza a los robots: ahí se entra como navegador estándar, con pocas descargas (ver README)
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': navegador ? UA_NAVEGADOR : UA_BOT } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (pdf || buf.slice(0, 4).toString() === '%PDF') {
      if (buf.slice(0, 4).toString() !== '%PDF') return null;
      const f = path.join(os.tmpdir(), 'bol-' + Math.random().toString(36).slice(2) + '.pdf');
      fs.writeFileSync(f, buf);
      try { return execFileSync('pdftotext', [...(layout ? ['-layout'] : []), '-enc', 'UTF-8', f, '-'], { maxBuffer: 80e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); }
      catch { return null; } finally { fs.rmSync(f, { force: true }); }
    }
    return decodificar(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch { return null; } finally { clearTimeout(t); }
}

// Organismo -> ámbito (ayuntamiento conocido o diputación del territorio)
function ambitoDe(entidad, terr) {
  const e = norm(entidad).replace(/^(excmo\.? )?ayuntamiento de (la villa de )?/, '').replace(/^udala /, '').trim();
  if (/ayuntamiento|udal/.test(norm(entidad)) || MUNI_IDX[e]) {
    const m = MUNI_IDX[e] || MUNI_IDX[e.split(/[\s(]/)[0]];
    if (m) return { nivel: 'municipio', nombre: m.nombre, terr: m.terr };
  }
  if (/diputaci[oó]n foral|foru aldundia|departamento|juntas generales/i.test(entidad)) return { nivel: 'territorio', nombre: terr, terr };
  return null;
}
// BOPV: ayuntamientos (pocos) por su municipio; el resto de organismos son del Gobierno Vasco y su sector público
function ambitoBopv(entidad) {
  if (/ayuntamiento|udal/i.test(entidad)) { const a = ambitoDe(entidad, ''); return a && a.nivel === 'municipio' ? a : null; }
  if (/diputaci[oó]n foral|foru aldundia|juntas generales/i.test(entidad) || BOPV_NO_GV.test(entidad)) return null;
  return { nivel: 'euskadi', nombre: 'Toda Euskadi' };
}
const limpiaTit = (t) => frase(String(t).replace(/\s+/g, ' ').replace(/\.{3,}.*$/, '').replace(/\s*\d{4}-\d{5}\s*$/, '').trim());
// Provisión de puestos de trabajo (concursos de méritos, oposiciones, libre designación…): no son ayudas aunque digan «concurso».
const EMPLEO_PUBLICO = /\bproveer\b|(cubrir|cobertura de|provisi[oó]n de)[^.]{0,80}\bpuestos?\b|concurso (espec[ií]fico|general|de m[eé]ritos|de traslados)|concurso[- ]oposici[oó]n|\boposici[oó]n(es)? (libre|para)|libre designaci[oó]n|comisi[oó]n de servicios|personal (funcionario|laboral|interino)|funcionari[oa]s? (de carrera|interin)|\binterinidad/i;
const util = (t) => ES_AYUDA.test(t) && !NO_AYUDA.test(t) && !EMPLEO_PUBLICO.test(t) && !RUIDO.test(t);

// ---------- BOG (Gipuzkoa): sumario HTML diario ----------
async function bog(dias, vistos, log) {
  const out = [];
  for (const d of dias) {
    const [y, m, dd] = [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')];
    const clave = `bog-${y}${m}${dd}`;
    if (vistos.has(clave)) continue;
    const url = `https://egoitza.gipuzkoa.eus/gao-bog/castell/bog/${y}/${m}/${dd}/bc${String(y).slice(2)}${m}${dd}.htm`;
    const html = await bajar(url);
    vistos.add(clave);
    if (!html || !/titulo_anuncio/.test(html)) continue;
    // Cada <li> de anuncio: título y enlace HTML; el organismo es el encabezado anterior
    let entidad = '';
    const re = /(?:<a[^>]*>\s*((?:AYUNTAMIENTO|DEPARTAMENTO|DIPUTACI|MANCOMUNIDAD|CONSORCIO|ADMINISTRACI|UDAL|JUNTAS)[^<]{2,120})<\/a>)|<div class="titulo_anuncio">([\s\S]*?)<\/div>([\s\S]*?)<\/li>/gi;
    for (const mm of html.matchAll(re)) {
      if (mm[1]) { entidad = entidades(mm[1]).replace(/\s+/g, ' ').trim(); continue; }
      const tit = entidades(mm[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!util(tit)) continue;
      const href = (mm[3].match(/href="([^"]+\.htm)"/i) || [])[1];
      out.push({ boletin: 'BOG', titulo: tit, entidad, terr: 'Gipuzkoa', publicacion: isoDia(d), url: href ? new URL(href, url).href : url });
    }
  }
  return out;
}

// ---------- BOTHA (Álava): sumario PDF por número ----------
export async function botha(desde, vistos, log) {
  const out = [];
  const portada = await bajar('https://www.araba.eus/botha/inicio/SGBO5001.aspx');
  const m = portada && portada.match(/Boletines\/(\d{4})\/(\d{3})\//);
  if (!m) { log('BOTHA: no se encuentra el último boletín'); return out; }
  let [año, num] = [Number(m[1]), Number(m[2])];
  for (let k = 0; k < 40 && num > 0; k++, num--) {
    const n3 = String(num).padStart(3, '0');
    const clave = `botha-${año}-${n3}`;
    if (vistos.has(clave)) continue;
    const txt = await bajar(`https://www.araba.eus/botha/Boletines/${año}/${n3}/${año}_${n3}_S_C.pdf`, { pdf: true });
    if (!txt) continue;
    const f = txt.match(/(\d{1,2}) de (\w+) de (\d{4})/);
    const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
    const pub = f && MES[norm(f[2])] ? `${f[3]}-${String(MES[norm(f[2])]).padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
    if (pub && pub < isoDia(desde)) break;
    vistos.add(clave);
    for (const e of entradasSumarioBotha(txt, n3)) {
      if (!util(e.titulo)) continue;
      out.push({ boletin: 'BOTHA', titulo: e.titulo, entidad: e.entidad, terr: 'Araba/Álava', publicacion: pub, url: e.url });
    }
  }
  return out;
}

// Entradas de un sumario del BOTHA (texto del PDF): [{entidad, titulo, url}]
function entradasSumarioBotha(txt, n3) {
  const out = [];
  let entidad = '', buf = [];
  for (const raw of txt.split('\n')) {
    const l = raw.trim();
    if (!l || /^www\.araba|^D\.L\.|n[uú]m\. \d+$|^\d+\/\d+$/i.test(l)) continue;
    if (/^(AYUNTAMIENTO|DIPUTACI[OÓ]N|DEPARTAMENTO|JUNTA ADMINISTRATIVA|CUADRILLA|JUNTAS GENERALES|CONSORCIO)\b/.test(l) && l === l.toUpperCase()) { entidad = l; buf = []; continue; }
    const ref = l.match(/(\d{4})\s*[-\u2010-\u2013]\s*(\d{5})\s*$/);
    buf.push(l.replace(/[.\u2026·]{3,}.*$/, '').replace(/\s\d{4}\s*[-\u2010-\u2013]\s*\d{5}\s*$/, ''));
    if (ref) {
      const tit = buf.join(' ').replace(/\u00ad/g, '').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim(); buf = [];
      out.push({ entidad, titulo: tit, url: `https://www.araba.eus/botha/Boletines/${ref[1]}/${n3}/${ref[1]}_${n3}_${ref[2]}_C.pdf` });
    }
  }
  return out;
}
const fechaSumario = (txt) => {
  const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const f = txt.match(/(\d{1,2}) de (\w+) de (\d{4})/);
  return f && MES[norm(f[2])] ? `${f[3]}-${String(MES[norm(f[2])]).padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
};

// Sumarios del BOTHA de todo el año (no solo los 45 días de botha()) para buscar el anuncio de las ayudas de la
// sede de Álava que no lo traen enlazado (finBothaAraba en index.js). Cada número leído se guarda en
// cache/botha_sumarios.json con solo las convocatorias de ayudas de la Diputación, y en cada pasada se leen como
// mucho `max` números que falten (del más reciente hacia atrás), así que el año entero se completa en pocos días.
// Devuelve [{entidad, titulo, url, publicacion}].
// Solo la convocatoria (o su extracto), no el decreto que aprueba las bases: su plazo cuenta desde otra publicación
const BOTHA_CONV = /(convocatoria|\bconvoca\b|\bconvocar|extracto)/i;
const BOTHA_AYUDA = /(subvenc|ayudas?\b|becas?\b|premios?\b)/i;
const BOTHA_NO = /resoluci[oó]n de (la )?convocatoria|por la que se resuelve|resolver la convocatoria|concesi[oó]n de las|correcci[oó]n de errores|justificaci[oó]n|reintegro|desistimiento|adjudicaci|lista (provisional|definitiva)|denegaci/i;
// Como bajar(url, {pdf: true}), pero dice por qué falla: {txt} o {txt: null, motivo}
// araba.eus corta a veces la conexión («fetch failed») o da 5xx: se reintenta hasta 2 veces con espera.
export async function bajarPdfBotha(url, opts = {}) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await bajarPdfBotha1(url, opts);
    if (r.txt || !/^(red:|tiempo agotado|HTTP 5\d\d|HTTP 429)/.test(r.motivo || '')) return r;
    await new Promise((ok) => setTimeout(ok, 3000 * (i + 1)));
  }
  return r;
}
async function bajarPdfBotha1(url, { primeraPagina = false } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA_BOT } });
    if (!r.ok) return { txt: null, motivo: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 4).toString() !== '%PDF') return { txt: null, motivo: `no es PDF (${r.headers.get('content-type') || '?'}, ${buf.length} bytes)` };
    const f = path.join(os.tmpdir(), 'botha-' + Math.random().toString(36).slice(2) + '.pdf');
    fs.writeFileSync(f, buf);
    try {
      const txt = execFileSync('pdftotext', ['-layout', ...(primeraPagina ? ['-l', '1'] : []), '-enc', 'UTF-8', f, '-'], { maxBuffer: 80e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
      return txt.trim() ? { txt } : { txt: null, motivo: `PDF sin texto (${buf.length} bytes)` };
    } catch { return { txt: null, motivo: `pdftotext falla (${buf.length} bytes)` }; } finally { fs.rmSync(f, { force: true }); }
  } catch (e) { return { txt: null, motivo: e.name === 'AbortError' ? 'tiempo agotado (60 s)' : `red: ${e.message}` }; } finally { clearTimeout(t); }
}
// Referencias (número de anuncio, 5 cifras) de un sumario: [primera, última] o null
const rangoSumarioBotha = (txt, n3) => {
  const refs = entradasSumarioBotha(txt, n3).map((e) => +e.url.match(/_(\d{5})_C\.pdf$/)[1]);
  return refs.length ? [Math.min(...refs), Math.max(...refs)] : null;
};
// Primera página de un anuncio suelto del BOTHA -> {entidad, titulo, publicacion} o null. La cabecera trae la fecha,
// la sección, el organismo (en mayúsculas: el departamento) y el título, que acaba en su primera línea corta (las
// del cuerpo ocupan todo el ancho) o en una línea en blanco.
function anuncioSueltoBotha(txt) {
  const lineas = txt.split('\n').map((l) => l.trim());
  const publicacion = fechaSumario(txt);
  const largos = lineas.filter(Boolean).map((l) => l.length).sort((a, b) => a - b);
  const ancho = largos[Math.floor(largos.length * 0.75)] || 0;
  let i = lineas.findIndex((l) => /n[uú]m\. ?\d+/i.test(l));
  if (i < 0) return null;
  let entidad = '', diputacion = false;
  for (i++; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l) continue;
    if (/^[IVX]+\s*-\s|^DEL TERRITORIO HIST/.test(l)) continue;
    if (/^diputaci[oó]n foral de [aá]lava$/i.test(l)) { diputacion = true; continue; }
    if (l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(l)) { entidad = entidad && !/,$|\bDE$|\bY$/.test(entidad) && /^(AYUNTAMIENTO|DEPARTAMENTO|JUNTA|CUADRILLA|CONSORCIO|DIPUTACI)/.test(l) ? l : (entidad ? entidad + ' ' + l : l); continue; }
    break;
  }
  const tit = [];
  for (; i < lineas.length && tit.length < 6; i++) {
    const l = lineas[i];
    if (!l) { if (tit.length) break; continue; }
    tit.push(l);
    if (l.length < ancho * 0.85) break;
  }
  let titulo = tit.join(' ').replace(/\u00ad/g, '').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
  if (!titulo) return null;
  // Por si el título no acaba en una línea corta (texto sin -layout): como mucho unos 300 caracteres
  if (titulo.length > 320) titulo = titulo.slice(0, 300).replace(/\s+\S*$/, '') + '…';
  if (diputacion && !/diputaci[oó]n|departamento/i.test(entidad)) entidad = 'DIPUTACIÓN FORAL DE ÁLAVA';
  return { entidad: entidad || (diputacion ? 'DIPUTACIÓN FORAL DE ÁLAVA' : ''), titulo, publicacion };
}
const esConvocatoriaDiputacion = (e) => /diputaci[oó]n|departamento/i.test(e.entidad) && BOTHA_CONV.test(e.titulo) && BOTHA_AYUDA.test(e.titulo) && !BOTHA_NO.test(e.titulo);

export async function sumariosBotha(log = console.log, max = 60) {
  const archivo = path.join('cache', 'botha_sumarios.json');
  let c = { numeros: {} };
  try { c = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch {}
  const portada = await bajar('https://www.araba.eus/botha/inicio/SGBO5001.aspx');
  const m = portada && portada.match(/Boletines\/(\d{4})\/(\d{3})\//);
  if (m) {
    const año = Number(m[1]);
    // Solo el año en curso y el anterior
    for (const k of Object.keys(c.numeros)) if (+k.slice(0, 4) < año - 1) delete c.numeros[k];
    // Primera y última referencia de cada sumario leído (para acotar los anuncios de un número sin sumario)
    c.rangos = c.rangos || {};
    for (const k of Object.keys(c.rangos)) if (+k.slice(0, 4) < año - 1) delete c.rangos[k];
    c.anuncios = c.anuncios || {};
    for (const k of Object.keys(c.anuncios)) if (+k.slice(0, 4) < año - 1) delete c.anuncios[k];
    // Números cuyo sumario no se pudo leer (tarea botha-sumarios-046-047, 18/11: el 046 y el 047 de 2026 fallaban en
    // cada pasada sin dejar rastro). Se apuntan en c.fallidos = {clave: {intentos, ultimo, motivo}} con el motivo
    // (HTTP, no es PDF, pdftotext, tiempo agotado), se reintentan como mucho una vez al día y solo con el cupo que
    // sobre después de los números que faltan por primera vez, para no gastar las `max` lecturas en ellos.
    c.fallidos = c.fallidos || {};
    for (const k of Object.keys(c.fallidos)) if (c.numeros[k] || +k.slice(0, 4) < año - 1) delete c.fallidos[k];
    const hoy = isoDia(new Date());
    const pendientes = [];
    for (let num = Number(m[2]); num > 0; num--) {
      const clave = `${año}-${String(num).padStart(3, '0')}`;
      if (!c.numeros[clave] && !c.fallidos[clave]) pendientes.push(num);
    }
    for (const k of Object.keys(c.fallidos)) if (+k.slice(0, 4) === año && c.fallidos[k].ultimo !== hoy) pendientes.push(+k.slice(5));
    let leidos = 0, nuevos = 0;
    const fallan = [], sueltos = [];
    // Rango de referencias de un número vecino: el guardado o, si no lo hay, leyendo su sumario una vez
    const rangoDe = async (num) => {
      const k = `${año}-${String(num).padStart(3, '0')}`;
      if (c.rangos[k]) return c.rangos[k];
      if (c.fallidos[k] || num < 1) return null;
      const r = await bajarPdfBotha(`https://www.araba.eus/botha/Boletines/${año}/${k.slice(5)}/${año}_${k.slice(5)}_S_C.pdf`);
      return r.txt ? (c.rangos[k] = rangoSumarioBotha(r.txt, k.slice(5))) : null;
    };
    for (const num of pendientes) {
      if (leidos >= max) break;
      const n3 = String(num).padStart(3, '0');
      const clave = `${año}-${n3}`;
      leidos++;
      let txt = null, motivo = '';
      // El nombre habitual y la variante en minúsculas (algunos anuncios del BOTHA se publican como …_c.pdf)
      for (const nombre of [`${año}_${n3}_S_C.pdf`, `${año}_${n3}_s_c.pdf`]) {
        const r = await bajarPdfBotha(`https://www.araba.eus/botha/Boletines/${año}/${n3}/${nombre}`);
        if (r.txt) { txt = r.txt; break; }
        motivo = motivo || r.motivo;
      }
      if (!txt) {
        const f = c.fallidos[clave] || { intentos: 0 };
        c.fallidos[clave] = { intentos: f.intentos + 1, ultimo: hoy, motivo };
        fallan.push(`${clave} (${motivo}, ${f.intentos + 1}.º intento)`);
        // Tarea botha-sumario-404-anuncios: el 046 y el 047 de 2026 no tenían sumario (404) pero sí sus anuncios
        // (${año}_${n3}_<ref>_C.pdf). Tras dos días con 404 se leen una sola vez los anuncios con referencia entre la
        // última del número anterior y la primera del siguiente (solo la primera página) y se guardan las
        // convocatorias de la Diputación igual que con el sumario.
        if (/^HTTP 404/.test(motivo) && f.intentos + 1 >= 2 && !c.anuncios[clave]) {
          let antes = null, despues = null;
          for (let d = 1; d <= 3 && !antes; d++) antes = await rangoDe(num - d);
          for (let d = 1; d <= 3 && !despues; d++) despues = await rangoDe(num + d);
          const desde = antes ? antes[1] + 1 : null, hasta = despues ? despues[0] - 1 : null;
          if (desde == null || hasta == null || hasta < desde || hasta - desde > 120) {
            sueltos.push(`${clave}: sin rango de anuncios (${desde ?? '?'}-${hasta ?? '?'})`);
            continue;
          }
          const entradas = [];
          let hay = 0;
          for (let ref = desde; ref <= hasta; ref++) {
            const r5 = String(ref).padStart(5, '0');
            const url = `https://www.araba.eus/botha/Boletines/${año}/${n3}/${año}_${n3}_${r5}_C.pdf`;
            const r = await bajarPdfBotha(url, { primeraPagina: true });
            if (!r.txt) continue;
            hay++;
            const e = anuncioSueltoBotha(r.txt);
            if (e && esConvocatoriaDiputacion(e)) entradas.push({ entidad: e.entidad, titulo: e.titulo, url, publicacion: e.publicacion });
          }
          c.anuncios[clave] = { fecha: hoy, desde, hasta, anuncios: hay };
          if (hay) {
            c.numeros[clave] = entradas;
            c.rangos[clave] = [desde, hasta];
            delete c.fallidos[clave];
            nuevos += entradas.length;
          }
          sueltos.push(`${clave}: ${hay} anuncios sueltos leídos (${desde}-${hasta}), ${entradas.length} convocatorias de la Diputación`);
        }
        continue;
      }
      delete c.fallidos[clave];
      const pub = fechaSumario(txt);
      c.rangos[clave] = rangoSumarioBotha(txt, n3);
      c.numeros[clave] = entradasSumarioBotha(txt, n3)
        .filter(esConvocatoriaDiputacion)
        .map((e) => ({ ...e, publicacion: pub }));
      nuevos += c.numeros[clave].length;
    }
    log(`BOTHA (sumarios del año): ${leidos} números leídos, ${nuevos} convocatorias de la Diputación nuevas, ${Object.keys(c.numeros).length} números guardados${fallan.length ? ` · sin sumario legible: ${fallan.join(', ')}` : ''}${sueltos.length ? ` · anuncios sueltos: ${sueltos.join('; ')}` : ''}`);
    fs.writeFileSync(archivo, JSON.stringify(c, null, 1));
  } else log('BOTHA (sumarios del año): no se encuentra el último boletín');
  return Object.values(c.numeros).flat();
}

// ---------- BOB (Bizkaia): sumario PDF por número ----------
async function bob(desde, vistos, log) {
  const out = [];
  const portada = await bajar('https://www.bizkaia.eus/es/bob');
  const m = portada && portada.match(/Bao_bob\/Sumario\/(\d{4})\/(\d{2})\/BOB-\d{4}a(\d{3})s\.pdf/);
  if (!m) { log('BOB: no se encuentra el último boletín'); return out; }
  let año = Number(m[1]), mes = Number(m[2]), num = Number(m[3]);
  for (let k = 0; k < 40 && num > 0; k++, num--) {
    const n3 = String(num).padStart(3, '0');
    const clave = `bob-${año}-${n3}`;
    if (vistos.has(clave)) continue;
    let txt = null, mesOk = mes;
    for (const mm of [mes, mes - 1]) {
      if (mm < 1) continue;
      txt = await bajar(`http://www.bizkaia.eus/lehendakaritza/Bao_bob/Sumario/${año}/${String(mm).padStart(2, '0')}/BOB-${año}a${n3}s.pdf`, { pdf: true });
      if (txt) { mesOk = mm; break; }
    }
    if (!txt) continue;
    mes = mesOk;
    const f = txt.match(/(\d{1,2}) de (\w+) de (\d{4})/);
    const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
    const pub = f && MES[norm(f[2])] ? `${f[3]}-${String(MES[norm(f[2])]).padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
    if (pub && pub < isoDia(desde)) break;
    vistos.add(clave);
    const pdfCompleto = `http://www.bizkaia.eus/lehendakaritza/Bao_bob/${año}/${String(mes).padStart(2, '0')}/BOB-${año}a${n3}.pdf`;
    for (const e of entradasSumarioBob(txt)) {
      if (!util(e.completo)) continue;
      out.push({ boletin: 'BOB', titulo: e.titulo, entidad: e.entidad, terr: 'Bizkaia', publicacion: pub, url: pdfCompleto, ref: e.ref, bdnsRef: e.bdns });
    }
  }
  return out;
}

// Anuncios del sumario del BOB: [{ref, entidad, titulo, bdns}]. La referencia va al final de la PRIMERA línea de
// cada anuncio y el código BDNS («BDNS (Identif.): 929190»), si lo hay, al final del título.
export function entradasSumarioBob(txt) {
  const out = [];
  let entidad = '', cur = null;
  const cierra = () => {
    if (!cur) return;
    const tit = cur.lineas.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
    const bdns = (tit.match(/BDNS\s*\(Identif\.?\)\s*:?\s*(\d+)/i) || [])[1] || null;
    out.push({ ref: cur.ref, entidad: cur.entidad, titulo: tit.replace(/\s*BDNS\s*\(Identif\.?\).*$/i, ''), completo: tit, bdns });
    cur = null;
  };
  for (const raw of String(txt || '').split('\n')) {
    const l = raw.trim();
    if (!l || /^(BOLET[IÍ]N OFICIAL|BOB$|N[uú]m\.|cve:|SECCI[OÓ]N|ADMINISTRACI[OÓ]N (FORAL|LOCAL|DEL ESTADO|AUTON))/i.test(l)) continue;
    const ref = l.match(/(BOB-\d{4}a\d{3}-\((?:I|II|III|IV|V)-\d+\))\s*$/);
    if (ref) { cierra(); cur = { ref: ref[1], entidad, lineas: [l.replace(ref[1], '').trim()] }; continue; }
    if (/^(Ayuntamiento|Diputaci[oó]n Foral|Departamento|Mancomunidad|Consorcio|Juntas Generales|DIPUTACI[OÓ]N FORAL)\b/.test(l) && l.length < 100 && !/[.,]$/.test(l)) { cierra(); entidad = l; continue; }
    if (cur) cur.lineas.push(l);
  }
  cierra();
  return out;
}

// Sumarios del BOB de todo el año (tarea bdns-fecha-bob-antiguas, 18/11): muchas convocatorias municipales de
// Bizkaia llegan de la BDNS sin fecha de publicación y su plazo cuenta desde el anuncio en el BOB, que a menudo es
// anterior a los 45 días que lee bob(). Cada número leído se guarda en cache/bob_sumarios.json con solo los anuncios
// que traen código BDNS ({numeros: {"AAAA-NNN": {publicacion, url, bdns: {código: ref}}}}), y en cada pasada se leen
// como mucho `max` números que falten, del más reciente hacia atrás: el año entero se completa en pocos días.
// Devuelve {código BDNS: {publicacion, ref, url}} (si un código sale dos veces, vale el primer anuncio).
export async function sumariosBob(log = console.log, max = 60) {
  const archivo = path.join('cache', 'bob_sumarios.json');
  const c = leer(archivo, { numeros: {} });
  const portada = await bajar('https://www.bizkaia.eus/es/bob');
  const m = portada && portada.match(/Bao_bob\/Sumario\/(\d{4})\/(\d{2})\/BOB-\d{4}a(\d{3})s\.pdf/);
  if (m) {
    const año = Number(m[1]);
    let mes = Number(m[2]);
    for (const k of Object.keys(c.numeros)) if (+k.slice(0, 4) < año - 1) delete c.numeros[k];
    let leidos = 0, nuevos = 0, fallos = 0;
    for (let num = Number(m[3]); num > 0 && leidos < max && fallos < 5; num--) {
      const n3 = String(num).padStart(3, '0');
      const clave = `${año}-${n3}`;
      if (c.numeros[clave]) { const p = c.numeros[clave].publicacion; if (p) mes = Number(p.slice(5, 7)); continue; }
      leidos++;
      let txt = null;
      for (const mm of [mes, mes - 1]) {
        if (mm < 1) continue;
        txt = await bajar(`http://www.bizkaia.eus/lehendakaritza/Bao_bob/Sumario/${año}/${String(mm).padStart(2, '0')}/BOB-${año}a${n3}s.pdf`, { pdf: true });
        if (txt) { mes = mm; break; }
      }
      if (!txt) { fallos++; continue; }
      fallos = 0;
      const bdns = {};
      for (const e of entradasSumarioBob(txt)) if (e.bdns && !bdns[e.bdns]) bdns[e.bdns] = e.ref;
      c.numeros[clave] = { publicacion: fechaSumario(txt), url: `http://www.bizkaia.eus/lehendakaritza/Bao_bob/${año}/${String(mes).padStart(2, '0')}/BOB-${año}a${n3}.pdf`, bdns };
      nuevos += Object.keys(bdns).length;
    }
    log(`BOB (sumarios del año): ${leidos} números leídos, ${nuevos} anuncios con código BDNS nuevos, ${Object.keys(c.numeros).length} números guardados`);
    fs.writeFileSync(archivo, JSON.stringify(c, null, 1));
  } else log('BOB (sumarios del año): no se encuentra el último boletín');
  const out = {};
  for (const k of Object.keys(c.numeros).sort()) {
    const n = c.numeros[k];
    for (const [cod, ref] of Object.entries(n.bdns || {})) if (!out[cod] && n.publicacion) out[cod] = { publicacion: n.publicacion, ref, url: n.url };
  }
  return out;
}

// ---------- BOB: texto de un anuncio dentro del boletín completo ----------
// En el PDF completo, la referencia (BOB-AAAAaNNN-(II-xxxx)) solo sale en el sumario: en el cuerpo cada página lleva
// «cve: BOB-AAAAaNNN» y cada anuncio empieza con «SECCIÓN …» + organismo + título. Se busca el título del sumario
// en el cuerpo (sin tildes, espacios ni guiones de corte) y se corta hasta la cabecera del anuncio siguiente.
const V_BOB = 2; // versión del corte del anuncio (x.vTexto)
const REF_BOB = /BOB-\d{4}a\d{3}-\((?:I|II|III|IV|V)-\d+\)/g;
const compacto = (t) => { const c = [], idx = [];
  // índice de cada carácter útil en el texto original (NFD puede alargar: se cuenta sobre el original)
  for (let i = 0; i < t.length; i++) { const ch = t[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); for (const k of ch) if (/[a-z0-9ñ]/.test(k)) { c.push(k); idx.push(i); } }
  return { s: c.join(''), idx }; };
export function anuncioBob(full, ref, titulo) {
  if (!full || !titulo) return '';
  // Fin del sumario: última referencia de la cadena seguida (refs separadas por menos de 3000 caracteres)
  let fin = 0, prev = -1;
  for (const m of full.matchAll(REF_BOB)) { if (prev >= 0 && m.index - prev > 3000) break; prev = m.index; fin = m.index + m[0].length; }
  const cuerpo = full.slice(fin);
  const { s, idx } = compacto(cuerpo);
  const clave = compacto(titulo.replace(/\s*BDNS\s*\(Identif\.?\).*$/i, '')).s;
  let pos = -1, largo = 0;
  // La primera aparición tras el sumario es la cabecera del anuncio (el título suele repetirse luego en su texto)
  for (const n of [160, 80]) { const k = clave.slice(0, n); if (k.length < 25) break; const a = s.indexOf(k); if (a >= 0) { pos = a; largo = Math.min(clave.length, s.length - a); break; } }
  if (pos < 0) return '';
  let ini = idx[pos];
  // Se incluye el organismo (líneas anteriores hasta la cabecera «SECCIÓN …»), si está cerca
  const antes = cuerpo.slice(Math.max(0, ini - 400), ini), sc = antes.search(/SECCI[OÓ]N (?:I|II|III|IV|V)\s*\n(?![\s\S]*SECCI[OÓ]N (?:I|II|III|IV|V)\s*\n)/);
  if (sc >= 0) ini = ini - antes.length + sc;
  const desde = idx[Math.min(pos + largo, idx.length) - 1] + 1;
  const sig = cuerpo.slice(desde).search(/\n\s*SECCI[OÓ]N (?:I|II|III|IV|V)\s*\n\s*ADMINISTRACI/);
  const t = cuerpo.slice(ini, sig >= 0 ? desde + sig : desde + 15000);
  return t.split('\n').map((l) => l.trim()).filter((l) => l && !/^(cve: BOB-\d{4}a\d{3}\S*|N[uú]m\. \d+|BOB)$/.test(l)).join('\n');
}

// ---------- BOPV (Gobierno Vasco): sumario PDF por número ----------
// Sumario: /bopv2/datos/AAAA/MM/sAA_NNNN.pdf; cada disposición: /bopv2/datos/AAAA/MM/AANNNNNa.pdf (NNNNN = número de la
// disposición, el que sale al final de su título en el sumario). No hay portada legible para robots: se parte del último
// número visto (caché) y se prueba el siguiente hasta que no existe.
const BOPV = 'https://www.euskadi.eus/bopv2/datos';
const BOPV_SEMILLA = { año: 2026, num: 211, mes: 11 }; // sumario del 4-11-2026, comprobado
const BOPV_SECCION = /^(DISPOSICIONES GENERALES|AUTORIDADES Y PERSONAL|NOMBRAMIENTOS|OPOSICIONES Y CONCURSOS|OTRAS DISPOSICIONES|ANUNCIOS|OTROS ANUNCIOS OFICIALES|ADMINISTRACI[OÓ]N DE JUSTICIA|ANUNCIOS PARTICULARES|SUMARIO|BOLET[IÍ]N OFICIAL DEL PA[IÍ]S VASCO|EUSKAL HERRIKO AGINTARITZAREN ALDIZKARIA)\b/;
const BOPV_RUIDO_LINEA = /^(www\.euskadi|N\.?\s?º\s*\d+|Sumario \d{4}\/\d+|\(?\d+\/\d+\)?$|(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),? \d)/i;
const BOPV_NO_GV = /tribunal|juzgado|parlamento|ararteko|junta electoral|\bs\.?\s?coop|\bs\.?\s?[al]\.?$|sociedad (an[oó]nima|limitada)/i;
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
export const utilBopv = (t) => (ES_AYUDA.test(t) || /\bse convocan?\b[^.]{0,200}(subvenci|ayudas?\b|becas?\b|premios?\b)/i.test(t)) && !NO_AYUDA.test(t) && !EMPLEO_PUBLICO.test(t) && !RUIDO.test(t);
const sumarioBopv = (año, mes, num) => bajar(`${BOPV}/${año}/${String(mes).padStart(2, '0')}/s${String(año).slice(2)}_${String(num).padStart(4, '0')}.pdf`, { pdf: true, navegador: true });

export function parseSumarioBopv(txt, año, mes) {
  const f = txt.match(/(\d{1,2}) de (\w+) de (\d{4})/);
  const pub = f && MESES[norm(f[2])] ? `${f[3]}-${String(MESES[norm(f[2])]).padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
  const items = [];
  let entidad = '', privado = false, buf = [], prev = null;
  const aa = String(año).slice(2);
  for (const raw of txt.split('\n')) {
    const l = raw.trim();
    if (!l || BOPV_RUIDO_LINEA.test(l)) continue;
    const mayus = l.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
    if (!buf.length && mayus.length >= 6 && mayus === mayus.toUpperCase()) {
      if (BOPV_SECCION.test(l)) { if (/PARTICULARES/.test(l)) privado = true; else if (/^(DISPOSICIONES|AUTORIDADES|OPOSICIONES|OTRAS|OTROS ANUNCIOS|ADMINISTRACI)/.test(l)) privado = false; continue; }
      entidad = l; continue;
    }
    // El número de la disposición cierra el título: «… Eguzki Hotz 2026. 4653». Va en orden creciente dentro del sumario,
    // lo que evita confundirlo con un año al final de una línea partida.
    const m = l.match(/^(.*?)[\s.…·]+(\d{1,5})$/);
    const n = m ? Number(m[2]) : null;
    const esNum = n != null && (prev == null ? Math.abs(n - año) > 1 : n > prev && n <= prev + 120);
    if (esNum) {
      buf.push(m[1]);
      prev = n;
      const tit = buf.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim(); buf = [];
      if (privado || !entidad) continue;
      const id = aa + String(n).padStart(5, '0') + 'a', mm = pub ? pub.slice(5, 7) : String(mes).padStart(2, '0');
      items.push({ boletin: 'BOPV', titulo: tit, entidad, terr: '', publicacion: pub, num: n, url: `${BOPV}/${año}/${mm}/${id}.shtml`, pdf: `${BOPV}/${año}/${mm}/${id}.pdf` });
      continue;
    }
    buf.push(l);
  }
  return { pub, items };
}

async function bopv(desde, vistos, cache, log) {
  const out = [];
  const hoy = new Date();
  let base = cache.bopvUltimo || BOPV_SEMILLA;
  const textos = {};
  // 1) Último número publicado: se prueba el siguiente al último visto (mes de ese y mes actual) hasta 2 fallos seguidos
  let { año, num, mes } = base, fallos = 0;
  for (let k = 0; k < 60 && fallos < 2; k++) {
    const sig = num + 1;
    let txt = null, mesOk = mes;
    for (const m of [...new Set([mes, hoy.getUTCFullYear() === año ? hoy.getUTCMonth() + 1 : 12])]) {
      txt = await sumarioBopv(año, m, sig);
      if (txt) { mesOk = m; break; }
    }
    if (!txt) { fallos++; continue; }
    fallos = 0; num = sig; mes = mesOk; textos[num] = txt;
  }
  // Cambio de año: el número 1 sale en enero y la numeración vuelve a empezar
  if (hoy.getUTCFullYear() > año) {
    const nuevo = hoy.getUTCFullYear(), m1 = hoy.getUTCMonth() + 1;
    for (let n = 1, f = 0; n < 60 && f < 2; n++) {
      let txt = null, mOk = 1;
      for (const m of [...new Set([n === 1 ? 1 : mes, m1])]) { txt = await sumarioBopv(nuevo, m, n); if (txt) { mOk = m; break; } }
      if (!txt) { f++; continue; }
      if (año !== nuevo) { año = nuevo; for (const k in textos) delete textos[k]; }
      f = 0; num = n; mes = mOk; textos[n] = txt;
    }
  }
  cache.bopvUltimo = { año, num, mes };
  log(`BOPV: último sumario ${año}/${num}`);
  // 2) Hacia atrás hasta 45 días (o 40 números), saltando los ya leídos
  for (let k = 0, n = num, m = mes; k < 40 && n > 0; k++, n--) {
    const clave = `bopv-${año}-${n}`;
    if (vistos.has(clave)) continue;
    let txt = textos[n] || null, mesOk = m;
    if (!txt) for (const mm of [m, m - 1]) { if (mm < 1) continue; txt = await sumarioBopv(año, mm, n); if (txt) { mesOk = mm; break; } }
    if (!txt) continue;
    m = mesOk;
    const { pub, items } = parseSumarioBopv(txt, año, m);
    if (pub) m = Number(pub.slice(5, 7));
    if (pub && pub < isoDia(desde)) break;
    vistos.add(clave);
    out.push(...items.filter((x) => utilBopv(x.titulo)));
  }
  return out;
}

export async function recoger(log = console.log) {
  const cache = leer(CACHE, { vistos: [], items: {} });
  const vistos = new Set(cache.vistos);
  const desde = hoyMenos(DIAS);
  const dias = Array.from({ length: DIAS }, (_, i) => hoyMenos(i)).filter((d) => d.getUTCDay() !== 0);
  const nuevos = [];
  for (const [nombre, fn] of [['BOG', () => bog(dias, vistos, log)], ['BOTHA', () => botha(desde, vistos, log)], ['BOB', () => bob(desde, vistos, log)], ['BOPV', () => bopv(desde, vistos, cache, log)]]) {
    try { const xs = await fn(); nuevos.push(...xs); log(`${nombre}: ${xs.length} convocatorias nuevas en los sumarios`); }
    catch (e) { log(`${nombre}: ${e.message}`); }
  }
  // Texto de cada anuncio nuevo (para el plazo y la ficha). BOB: el anuncio dentro del boletín completo.
  // Los anuncios del BOB leídos con la versión anterior (que se quedaba con el sumario) se vuelven a sacar una vez.
  const pdfs = {};
  const rehacer = Object.values(cache.items).filter((x) => x.boletin === 'BOB' && x.vTexto !== V_BOB && x.ref);
  if (rehacer.length) log(`BOB: se vuelve a sacar el texto de ${rehacer.length} anuncios guardados con el sumario`);
  await enParalelo([...nuevos, ...rehacer], 3, async (x) => {
    let t = '';
    if (x.boletin === 'BOB') {
      if (!(x.url in pdfs)) pdfs[x.url] = bajar(x.url, { pdf: true, layout: false }); // sin -layout: el texto corrido, como lo lee anuncioBob
      const full = await pdfs[x.url];
      if (!full && rehacer.includes(x)) return; // sin red: se deja como estaba y se reintenta mañana
      t = anuncioBob(full || '', x.ref, x.titulo);
      if (!t) log(`BOB: no se encuentra el texto de ${x.ref} en el boletín`);
      x.vTexto = V_BOB;
    } else if (x.boletin === 'BOPV') {
      t = (await bajar(x.pdf, { pdf: true, navegador: true })) || '';
    } else {
      const raw = await bajar(x.url, { pdf: x.boletin === 'BOTHA' });
      t = raw ? (x.boletin === 'BOG' ? entidades(raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n')) : raw) : '';
    }
    x.texto = t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, x.boletin === 'BOB' ? 30000 : 12000);
    const id = (x.boletin + '-' + (x.ref || x.url.split('/').pop().replace(/\.shtml$/, ''))).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
    cache.items[id] = x;
  });
  // Fuera lo antiguo
  const limite = isoDia(hoyMenos(DIAS + 30));
  for (const [k, x] of Object.entries(cache.items)) if (!x.publicacion || x.publicacion < limite) delete cache.items[k];
  cache.vistos = [...vistos].slice(-400);
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  const out = [];
  for (const [id, x] of Object.entries(cache.items)) {
    if (x.boletin === 'BOPV' ? !utilBopv(x.titulo) : !util(x.titulo)) continue;
    const ambito = x.boletin === 'BOPV' ? ambitoBopv(x.entidad || '') : ambitoDe(x.entidad || '', x.terr);
    if (!ambito) continue;
    const partes = x.texto ? partesExtracto(x.texto) : null;
    const plazo = calculaFin([partes ? partes.plazo.join(' ') : '', x.texto || ''].join(' ').slice(0, 4000), x.publicacion);
    const fin = plazo ? plazo.fin : null;
    out.push({
      id, titulo: limpiaTit(x.titulo),
      organismo: ambito.nivel === 'municipio' ? `Ayuntamiento de ${ambito.nombre}` : ambito.nivel === 'euskadi' ? frase(x.entidad) : `Diputación Foral de ${x.terr === 'Araba/Álava' ? 'Álava' : x.terr}`,
      ambito, inicio: plazo ? plazo.inicio : null, fin, finCalculado: !!fin, publicacion: x.publicacion,
      boletin: x.url, bdnsRef: x.bdnsRef || null,
      resumen: partes && partes.objeto.length ? partes.objeto.slice(0, 4).join('\n') : '',
      dirigido: partes ? partes.beneficiarios.slice(0, 6).join('\n') : '',
      cuantia: partes ? partes.cuantia.join('\n') : '',
      presupuesto: null, requisitos: [],
      para: paraDeTexto(x.titulo + ' ' + (partes ? partes.beneficiarios.join(' ') : '')),
      temas: temasDe(x.titulo),
      url: x.url, origen: 'boletines',
      fuentes: [{ nombre: { BOPV: 'Boletín Oficial del País Vasco', BOB: 'Boletín Oficial de Bizkaia', BOG: 'Boletín Oficial de Gipuzkoa', BOTHA: 'Boletín Oficial del Territorio Histórico de Álava' }[x.boletin], url: x.url }],
      _texto: ['Anuncio publicado en el ' + x.boletin + ' el ' + x.publicacion, x.titulo, x.texto || ''].join('\n'),
      // BOB: la URL es el boletín completo; como ficha va solo el texto de este anuncio, para que no se descargue el boletín entero
      ...(x.boletin === 'BOB' ? { _ficha: ['Anuncio publicado en el BOB el ' + x.publicacion + ' (' + (x.ref || '') + ')', x.texto || x.titulo].join('\n') } : {}),
    });
  }
  return out;
}
