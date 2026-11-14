// Utilidades compartidas por todas las fuentes.
import { MUNIS } from './municipios.js';

export { MUNIS };

const ACC = { á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c' };
export function norm(s) {
  return String(s || '').toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => ACC[c]).replace(/\s+/g, ' ').trim();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pasa "AYUDAS PARA EL FOMENTO..." a "Ayudas para el fomento..."
export function frase(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (letras.length > 3 && letras === letras.toUpperCase()) {
    t = t.toLowerCase();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // Siglas y nombres propios frecuentes
    t = t.replace(/\b(bdns|cae|capv|pyme|pymes|i\+d\+i|i\+d|tic|ue|ong|ongd|irpf|iva)\b/gi, (m) => m.toUpperCase())
      .replace(/\b(euskadi|bizkaia|gipuzkoa|araba|álava|lanbide|spri|osakidetza|basquetour|hazi|habe|emakunde|etxebide)\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  }
  return t;
}

// Fecha a ISO (AAAA-MM-DD) desde "DD/MM/AAAA" o "AAAA-MM-DD..."
export function iso(v) {
  if (!v) return null;
  const s = String(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Decodifica HTML que mezcla UTF-8 y Latin-1 (euskadi.eus lo hace).
export function decodificar(buf) {
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) { out += String.fromCharCode(c); continue; }
    let n = 0;
    if ((c & 0xe0) === 0xc0) n = 1; else if ((c & 0xf0) === 0xe0) n = 2; else if ((c & 0xf8) === 0xf0) n = 3;
    let ok = n > 0 && i + n < b.length + 0;
    for (let k = 1; ok && k <= n; k++) ok = i + k < b.length && (b[i + k] & 0xc0) === 0x80;
    if (ok) {
      let cp = c & (0x3f >> n);
      for (let k = 1; k <= n; k++) cp = (cp << 6) | (b[i + k] & 0x3f);
      out += String.fromCodePoint(cp);
      i += n;
    } else {
      out += String.fromCharCode(c); // Latin-1
    }
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', ordm: 'º', ordf: 'ª', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', iexcl: '¡', iquest: '¿' };
export function entidades(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => {
      if (ENT[n] != null) return ENT[n];
      const acc = n.match(/^([a-z])(acute|grave|uml|circ|tilde|cedil)$/i);
      if (acc) return (acc[1] + { acute: '́', grave: '̀', uml: '̈', circ: '̂', tilde: '̃', cedil: '̧' }[acc[2]]).normalize('NFC');
      return m;
    });
}

// HTML a texto con saltos de línea en los bloques
export function texto(html) {
  return entidades(String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(h[1-6]|p|div|li|dt|dd|tr|ul|ol|section|article|table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

export async function pedir(url, { json = false, tries = 3, timeout = 30000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)', Accept: json ? 'application/json' : 'text/html,*/*' },
      });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      if (json) return await r.json();
      return decodificar(await r.arrayBuffer());
    } catch (e) {
      clearTimeout(t);
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last || new Error('Sin respuesta');
}

// Ejecuta fn sobre items con N en paralelo
export async function enParalelo(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e.message || e) }; }
    }
  }));
  return out;
}

// ---------- Ámbito territorial ----------
export const TERRS = { 'araba/alava': 'Araba/Álava', bizkaia: 'Bizkaia', gipuzkoa: 'Gipuzkoa' };
export const MUNI_IDX = (() => {
  const idx = {};
  for (const [nombre, terr] of MUNIS) {
    const vars = new Set([norm(nombre)]);
    nombre.split(/\s*\/\s*/).forEach((p) => vars.add(norm(p)));
    vars.add(norm(nombre.replace(/\s*\/\s*/g, '/')));
    vars.add(norm(nombre.replace(/\s*\/\s*/g, '-')));
    vars.forEach((v) => { if (v.length > 1) idx[v] = { nombre, terr }; });
  }
  [['vitoria', 'Vitoria-Gasteiz'], ['san sebastian', 'Donostia / San Sebastián'], ['guernica', 'Gernika-Lumo'], ['mondragon', 'Arrasate/Mondragón'],
    ['renteria', 'Errenteria'], ['fuenterrabia', 'Hondarribia'], ['pasajes', 'Pasaia'], ['oñate', 'Oñati'], ['vergara', 'Bergara'],
    ['llodio', 'Laudio/Llodio'], ['orduña', 'Urduña/Orduña'], ['sopelana', 'Sopela'], ['lejona', 'Leioa'], ['munguia', 'Mungia'], ['guecho', 'Getxo']]
    .forEach(([v, n]) => { const m = MUNIS.find((x) => x[0] === n); if (m) idx[norm(v)] = { nombre: n, terr: m[1] }; });
  return idx;
})();

// ---------- Temas y destinatarios ----------
export const TEMAS = [
  ['vivienda', /vivienda|alquiler|rehabilit|fachada|ascensor|edific|accesibilidad/],
  ['empleo', /empleo|contrataci|trabajador|desemple|inserci[oó]n laboral|lanbide/],
  ['cultura', /cultur|m[uú]sica|teatro|libro|euskera|euskara|festival|arte|cine|patrimonio|bertso|audiovisual/],
  ['estudios', /beca|estudi|universit|formaci|investigaci|doctor|m[aá]ster/],
  ['digitalizacion', /digital|tecnolog|innova|inteligencia artificial|ciberseg|i\+d/],
  ['familia', /famili|hij[oa]s|infancia|conciliaci|natalidad|mayores|dependencia|cuidad/],
  ['energia', /energ|renovable|eficiencia|bicicleta|movilidad|veh[ií]culo|solar|clima|medio ambiente|residuo|sostenib/],
  ['comercio', /comercio|hostel|tienda|consumo|bono/],
  ['emprendimiento', /emprend|empresa|pyme|aut[oó]nom|startup|industria|internacionaliz/],
  ['educacion', /educaci|escuela|ampa|centro docente|alumn|ikastola/],
  ['deporte', /deport|club|competici/],
  ['social', /social|cooperaci[oó]n|inclusi|discapacidad|voluntari|igualdad|mujer|juventud|asociaci/],
  ['rural', /agrar|agr[ií]col|ganad|rural|pesca|forestal|caser[ií]o|alimentaci/],
];
export function temasDe(t) { const n = norm(t); return TEMAS.filter((x) => x[1].test(n)).map((x) => x[0]); }

// Destinatarios a partir de texto libre
export function paraDeTexto(t) {
  const n = norm(t);
  const out = new Set();
  if (/personas fisicas que no desarrollan|particular|familia|joven|jovenes|estudiante|alumn|persona(s)? (fisica|desemplead|mayor|con discapacidad)|ciudadan|unidad(es)? convivencia|inquilin|propietari/.test(n)) out.add('particular');
  if (/autonom|personas fisicas que desarrollan|profesional(es)? independ/.test(n)) out.add('autonomo');
  if (/empresa|pyme|sociedad|cooperativa|comercio|establecimiento/.test(n)) out.add('empresa');
  if (/asociaci|sin animo de lucro|fundaci|entidad(es)? (sin|privadas sin|del tercer)|ong|club/.test(n)) out.add('asociacion');
  if (/ayuntamiento|entidades locales|municipio|mancomunidad|cuadrilla|concejo/.test(n)) out.add('ayuntamiento');
  return [...out];
}
