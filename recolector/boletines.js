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

async function bajar(url, { pdf = false, navegador = false } = {}) {
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
      try { return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', f, '-'], { maxBuffer: 80e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); }
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
    let entidad = '', buf = [];
    for (const raw of txt.split('\n')) {
      const l = raw.trim();
      if (!l || /^www\.araba|^D\.L\.|n[uú]m\. \d+$|^\d+\/\d+$/i.test(l)) continue;
      if (/^(AYUNTAMIENTO|DIPUTACI[OÓ]N|DEPARTAMENTO|JUNTA ADMINISTRATIVA|CUADRILLA|JUNTAS GENERALES|CONSORCIO)\b/.test(l) && l === l.toUpperCase()) { entidad = l; buf = []; continue; }
      const ref = l.match(/(\d{4})\s*[-\u2010-\u2013]\s*(\d{5})\s*$/);
      buf.push(l.replace(/[.\u2026·]{3,}.*$/, '').replace(/\s\d{4}\s*[-\u2010-\u2013]\s*\d{5}\s*$/, ''));
      if (ref) {
        const tit = buf.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim(); buf = [];
        if (!util(tit)) continue;
        out.push({ boletin: 'BOTHA', titulo: tit, entidad, terr: 'Araba/Álava', publicacion: pub, url: `https://www.araba.eus/botha/Boletines/${ref[1]}/${n3}/${ref[1]}_${n3}_${ref[2]}_C.pdf` });
      }
    }
  }
  return out;
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
    // En el sumario del BOB la referencia va al final de la PRIMERA línea de cada anuncio
    let entidad = '', cur = null;
    const cierra = () => {
      if (!cur) return;
      const tit = cur.lineas.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
      if (util(tit)) {
        const bdns = (tit.match(/BDNS\s*\(Identif\.?\)\s*:?\s*(\d+)/i) || [])[1] || null;
        out.push({ boletin: 'BOB', titulo: tit.replace(/\s*BDNS\s*\(Identif\.?\).*$/i, ''), entidad: cur.entidad, terr: 'Bizkaia', publicacion: pub, url: pdfCompleto, ref: cur.ref, bdnsRef: bdns });
      }
      cur = null;
    };
    for (const raw of txt.split('\n')) {
      const l = raw.trim();
      if (!l || /^(BOLET[IÍ]N OFICIAL|BOB$|N[uú]m\.|cve:|SECCI[OÓ]N|ADMINISTRACI[OÓ]N (FORAL|LOCAL|DEL ESTADO|AUTON))/i.test(l)) continue;
      const ref = l.match(/(BOB-\d{4}a\d{3}-\((?:I|II|III|IV|V)-\d+\))\s*$/);
      if (ref) { cierra(); cur = { ref: ref[1], entidad, lineas: [l.replace(ref[1], '').trim()] }; continue; }
      if (/^(Ayuntamiento|Diputaci[oó]n Foral|Departamento|Mancomunidad|Consorcio|Juntas Generales|DIPUTACI[OÓ]N FORAL)\b/.test(l) && l.length < 100 && !/[.,]$/.test(l)) { cierra(); entidad = l; continue; }
      if (cur) cur.lineas.push(l);
    }
    cierra();
  }
  return out;
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
  const pdfs = {};
  await enParalelo(nuevos, 3, async (x) => {
    let t = '';
    if (x.boletin === 'BOB') {
      if (!(x.url in pdfs)) pdfs[x.url] = bajar(x.url, { pdf: true });
      const full = (await pdfs[x.url]) || '';
      const i = full.lastIndexOf(x.ref);
      t = i >= 0 ? full.slice(i, i + 15000).split(/BOB-\d{4}a\d{3}-\((?:I|II|III|IV|V)-\d+\)/).slice(0, 2).join(' ') : '';
    } else if (x.boletin === 'BOPV') {
      t = (await bajar(x.pdf, { pdf: true, navegador: true })) || '';
    } else {
      const raw = await bajar(x.url, { pdf: x.boletin === 'BOTHA' });
      t = raw ? (x.boletin === 'BOG' ? entidades(raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n')) : raw) : '';
    }
    x.texto = t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 12000);
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
    });
  }
  return out;
}
